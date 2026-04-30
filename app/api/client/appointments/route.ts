import { NextRequest, NextResponse } from 'next/server'
import {
  buildBookingSummary,
  getSalonDateKey,
  getSalonDayOfWeek,
  isDateInClosures,
  isWithinWorkingHours,
} from '@/lib/booking'
import { getClientAuthCookieName, verifyClientSessionToken } from '@/lib/client-auth'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'
import { trackAnalyticsEvent } from '@/lib/analytics'

const BLOCKING_STATUSES = new Set(['confirmed', 'completed'])

function getSession(request: NextRequest) {
  const token = request.cookies.get(getClientAuthCookieName())?.value || ''
  return verifyClientSessionToken(token)
}

function parseServiceIds(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
}

function parseDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function validateBookingInput(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  startAt: Date,
  serviceIds: string[],
  excludedAppointmentId?: string,
) {
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes')
    .in('id', serviceIds)

  if (servicesError || !services || services.length !== serviceIds.length) {
    return { ok: false as const, response: NextResponse.json({ error: 'Serviciile selectate sunt invalide.' }, { status: 400 }) }
  }

  const summary = buildBookingSummary(services)
  if (!summary.notes || summary.durationMinutes <= 0) {
    return { ok: false as const, response: NextResponse.json({ error: 'Serviciile selectate sunt incomplete.' }, { status: 400 }) }
  }

  const endAt = new Date(startAt.getTime() + summary.durationMinutes * 60 * 1000)
  const localDateKey = getSalonDateKey(startAt)
  const dayOfWeek = getSalonDayOfWeek(startAt)

  const [{ data: workingHours }, { data: closures }, { data: conflicts, error: conflictsError }] = await Promise.all([
    supabase
      .from('working_hours')
      .select('open_time, close_time, is_day_off')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle(),
    supabase
      .from('salon_closures')
      .select('start_date, end_date')
      .lte('start_date', localDateKey)
      .gte('end_date', localDateKey),
    supabase
      .from('appointments')
      .select('id, status')
      .lt('start_time', endAt.toISOString())
      .gt('end_time', startAt.toISOString()),
  ])

  if (isDateInClosures(startAt, closures || [])) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Salonul este închis în data selectată.' }, { status: 409 }),
    }
  }

  if (!isWithinWorkingHours(startAt, summary.durationMinutes, workingHours)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Intervalul selectat este în afara programului salonului.' }, { status: 409 }),
    }
  }

  if (conflictsError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Nu am putut valida disponibilitatea.' }, { status: 500 }),
    }
  }

  const hasConflict = (conflicts || []).some((appointment) => {
    if (excludedAppointmentId && appointment.id === excludedAppointmentId) return false
    return BLOCKING_STATUSES.has(String(appointment.status || ''))
  })

  if (hasConflict) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Intervalul a fost deja ocupat. Alege o altă oră.' }, { status: 409 }),
    }
  }

  return {
    ok: true as const,
    payload: {
      start_time: startAt.toISOString(),
      end_time: endAt.toISOString(),
      notes: summary.notes,
      total_price: summary.totalPrice,
      service_id: summary.serviceId,
    },
    metadata: {
      serviceCount: serviceIds.length,
      totalPrice: summary.totalPrice,
      notesLength: summary.notes.length,
    },
  }
}

export async function GET(request: NextRequest) {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Neautorizat.' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleSupabase()
    const { data, error } = await supabase
      .from('appointments')
      .select('id, start_time, end_time, status, notes, total_price, rating, review_text, services(*)')
      .eq('client_id', session.id)
      .order('start_time', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Programările nu au putut fi încărcate.' }, { status: 500 })
    }

    return NextResponse.json({ appointments: data || [] })
  } catch {
    return NextResponse.json({ error: 'Programările nu au putut fi încărcate.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Neautorizat.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const action = String(body?.action ?? '')
    const supabase = getServiceRoleSupabase()

    if (action === 'create' || action === 'update') {
      const appointmentId = String(body?.appointmentId ?? '')
      const startTime = String(body?.startTime ?? '')
      const serviceIds = parseServiceIds(body?.serviceIds)
      const startAt = parseDate(startTime)

      if (!startAt || serviceIds.length === 0) {
        return NextResponse.json({ error: 'Datele programării sunt invalide.' }, { status: 400 })
      }

      if (startAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Programările trebuie făcute pentru un interval viitor.' }, { status: 400 })
      }

      if (action === 'update') {
        if (!appointmentId) {
          return NextResponse.json({ error: 'Programarea nu poate fi identificată.' }, { status: 400 })
        }

        const { data: existing, error: existingError } = await supabase
          .from('appointments')
          .select('id, client_id, status, start_time')
          .eq('id', appointmentId)
          .single()

        if (existingError || !existing || existing.client_id !== session.id) {
          return NextResponse.json({ error: 'Nu ai acces la această programare.' }, { status: 403 })
        }

        if (['rejected', 'canceled'].includes(String(existing.status || ''))) {
          return NextResponse.json({ error: 'Această programare nu mai poate fi modificată.' }, { status: 400 })
        }
      }

      const validation = await validateBookingInput(
        supabase,
        startAt,
        serviceIds,
        action === 'update' ? appointmentId : undefined,
      )

      if (!validation.ok) {
        return validation.response
      }

      if (action === 'create') {
        const { error } = await supabase.from('appointments').insert({
          client_id: session.id,
          client_name: session.fullName,
          client_phone: session.phone,
          status: 'confirmed',
          ...validation.payload,
        })

        if (error) {
          return NextResponse.json({ error: 'Programarea nu a putut fi salvată.' }, { status: 400 })
        }

        void trackAnalyticsEvent({
          eventName: 'booking_created',
          category: 'booking',
          clientId: session.id,
          metadata: validation.metadata,
        }).catch(() => null)

        return NextResponse.json({ ok: true })
      }

      const { error } = await supabase
        .from('appointments')
        .update(validation.payload)
        .eq('id', appointmentId)

      if (error) {
        return NextResponse.json({ error: 'Programarea nu a putut fi modificată.' }, { status: 400 })
      }

      void trackAnalyticsEvent({
        eventName: 'booking_updated',
        category: 'booking',
        clientId: session.id,
        metadata: validation.metadata,
      }).catch(() => null)

      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel') {
      const appointmentId = String(body?.appointmentId ?? '')
      if (!appointmentId) {
        return NextResponse.json({ error: 'Programare invalidă.' }, { status: 400 })
      }

      const { data: existing, error: existingError } = await supabase
        .from('appointments')
        .select('id, client_id, status, start_time')
        .eq('id', appointmentId)
        .single()

      if (existingError || !existing || existing.client_id !== session.id) {
        return NextResponse.json({ error: 'Nu ai acces la această programare.' }, { status: 403 })
      }

      if (['rejected', 'canceled'].includes(String(existing.status || ''))) {
        return NextResponse.json({ error: 'Programarea este deja închisă.' }, { status: 400 })
      }

      if (new Date(existing.start_time).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Programările trecute nu mai pot fi anulate online.' }, { status: 400 })
      }

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'canceled' })
        .eq('id', appointmentId)

      if (error) {
        return NextResponse.json({ error: 'Programarea nu a putut fi anulată.' }, { status: 400 })
      }

      void trackAnalyticsEvent({
        eventName: 'booking_canceled',
        category: 'booking',
        clientId: session.id,
      }).catch(() => null)

      return NextResponse.json({ ok: true })
    }

    if (action === 'join_waitlist') {
      const desiredDate = String(body?.desiredDate ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) {
        return NextResponse.json({ error: 'Data dorită este invalidă.' }, { status: 400 })
      }

      if (desiredDate < getSalonDateKey(new Date())) {
        return NextResponse.json({ error: 'Nu te poți înscrie pe lista de așteptare pentru o zi trecută.' }, { status: 400 })
      }

      const { data: existing } = await supabase
        .from('waitlist')
        .select('id')
        .eq('client_id', session.id)
        .eq('desired_date', desiredDate)
        .maybeSingle()

      if (!existing?.id) {
        const { error } = await supabase.from('waitlist').insert({
          client_id: session.id,
          client_name: session.fullName,
          client_phone: session.phone,
          desired_date: desiredDate,
        })

        if (error) {
          return NextResponse.json({ error: 'Nu am putut adăuga în lista de așteptare.' }, { status: 400 })
        }
      }

      void trackAnalyticsEvent({
        eventName: 'waitlist_joined',
        category: 'booking',
        clientId: session.id,
        metadata: { desiredDate },
      }).catch(() => null)

      return NextResponse.json({ ok: true })
    }

    if (action === 'submit_review') {
      const appointmentId = String(body?.appointmentId ?? '')
      const rating = Number(body?.rating ?? 0)
      const reviewText = String(body?.reviewText ?? '')

      if (!appointmentId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: 'Date review invalide.' }, { status: 400 })
      }

      const { data: existing, error: existingError } = await supabase
        .from('appointments')
        .select('id, client_id, status, start_time')
        .eq('id', appointmentId)
        .single()

      if (existingError || !existing || existing.client_id !== session.id) {
        return NextResponse.json({ error: 'Nu ai acces la această vizită.' }, { status: 403 })
      }

      if (['rejected', 'canceled'].includes(String(existing.status || ''))) {
        return NextResponse.json({ error: 'Vizita selectată nu poate primi recenzie.' }, { status: 400 })
      }

      if (new Date(existing.start_time).getTime() >= Date.now()) {
        return NextResponse.json({ error: 'Poți lăsa o recenzie doar după ce vizita a avut loc.' }, { status: 400 })
      }

      const { error } = await supabase
        .from('appointments')
        .update({ rating, review_text: reviewText || null })
        .eq('id', appointmentId)

      if (error) {
        return NextResponse.json({ error: 'Recenzia nu a putut fi salvată.' }, { status: 400 })
      }

      void trackAnalyticsEvent({
        eventName: 'review_submitted',
        category: 'engagement',
        clientId: session.id,
        metadata: { rating },
      }).catch(() => null)

      return NextResponse.json({ ok: true })
    }

    if (action === 'rate_photo') {
      const photoId = String(body?.photoId ?? '')
      const rating = Number(body?.rating ?? 0)
      if (!photoId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: 'Date rating foto invalide.' }, { status: 400 })
      }

      const { data: existing } = await supabase
        .from('portfolio_ratings')
        .select('id')
        .eq('photo_id', photoId)
        .eq('client_id', session.id)
        .maybeSingle()

      if (existing?.id) {
        const { error } = await supabase
          .from('portfolio_ratings')
          .update({ rating })
          .eq('id', existing.id)
        if (error) {
          return NextResponse.json({ error: 'Nu am putut actualiza ratingul.' }, { status: 400 })
        }
        void trackAnalyticsEvent({
          eventName: 'portfolio_rated',
          category: 'engagement',
          clientId: session.id,
          metadata: { rating, action: 'update' },
        }).catch(() => null)
        return NextResponse.json({ ok: true })
      }

      const { error } = await supabase.from('portfolio_ratings').insert({
        client_id: session.id,
        photo_id: photoId,
        rating,
      })
      if (error) {
        return NextResponse.json({ error: 'Nu am putut salva ratingul.' }, { status: 400 })
      }
      void trackAnalyticsEvent({
        eventName: 'portfolio_rated',
        category: 'engagement',
        clientId: session.id,
        metadata: { rating, action: 'insert' },
      }).catch(() => null)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acțiune invalidă.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Cerere invalidă.' }, { status: 400 })
  }
}

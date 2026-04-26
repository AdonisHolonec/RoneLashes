import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getClientAuthCookieName, verifyClientSessionToken } from '@/lib/client-auth'
import { trackAnalyticsEvent } from '@/lib/analytics'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getServiceSupabase() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role config missing.')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getSession(request: NextRequest) {
  const token = request.cookies.get(getClientAuthCookieName())?.value || ''
  return verifyClientSessionToken(token)
}

export async function POST(request: NextRequest) {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Neautorizat.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const action = String(body?.action ?? '')
    const supabase = getServiceSupabase()

    if (action === 'create') {
      const startTime = String(body?.startTime ?? '')
      const endTime = String(body?.endTime ?? '')
      const notes = String(body?.notes ?? '')
      const totalPrice = Number(body?.totalPrice ?? 0)

      if (!startTime || !endTime || !notes || !Number.isFinite(totalPrice)) {
        return NextResponse.json({ error: 'Datele programării sunt invalide.' }, { status: 400 })
      }

      const { error } = await supabase.from('appointments').insert({
        client_id: session.id,
        client_name: session.fullName,
        client_phone: session.phone,
        start_time: startTime,
        end_time: endTime,
        status: 'confirmed',
        notes,
        total_price: totalPrice,
      })

      if (error) {
        return NextResponse.json({ error: 'Programarea nu a putut fi salvată.' }, { status: 400 })
      }
      void trackAnalyticsEvent({
        eventName: 'booking_created',
        category: 'booking',
        clientId: session.id,
        metadata: { totalPrice, notesLength: notes.length },
      }).catch(() => null)
      return NextResponse.json({ ok: true })
    }

    if (action === 'update') {
      const appointmentId = String(body?.appointmentId ?? '')
      const startTime = String(body?.startTime ?? '')
      const endTime = String(body?.endTime ?? '')
      const notes = String(body?.notes ?? '')
      const totalPrice = Number(body?.totalPrice ?? 0)

      if (!appointmentId || !startTime || !endTime || !notes || !Number.isFinite(totalPrice)) {
        return NextResponse.json({ error: 'Datele de modificare sunt invalide.' }, { status: 400 })
      }

      const { data: existing } = await supabase
        .from('appointments')
        .select('id, client_id, status')
        .eq('id', appointmentId)
        .single()

      if (!existing || existing.client_id !== session.id) {
        return NextResponse.json({ error: 'Nu ai acces la această programare.' }, { status: 403 })
      }

      const { error } = await supabase
        .from('appointments')
        .update({
          start_time: startTime,
          end_time: endTime,
          notes,
          total_price: totalPrice,
        })
        .eq('id', appointmentId)

      if (error) {
        return NextResponse.json({ error: 'Programarea nu a putut fi modificată.' }, { status: 400 })
      }
      void trackAnalyticsEvent({
        eventName: 'booking_updated',
        category: 'booking',
        clientId: session.id,
        metadata: { totalPrice, notesLength: notes.length },
      }).catch(() => null)
      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel') {
      const appointmentId = String(body?.appointmentId ?? '')
      if (!appointmentId) {
        return NextResponse.json({ error: 'Programare invalidă.' }, { status: 400 })
      }

      const { data: existing } = await supabase
        .from('appointments')
        .select('id, client_id')
        .eq('id', appointmentId)
        .single()

      if (!existing || existing.client_id !== session.id) {
        return NextResponse.json({ error: 'Nu ai acces la această programare.' }, { status: 403 })
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
      if (!desiredDate) {
        return NextResponse.json({ error: 'Data dorită este invalidă.' }, { status: 400 })
      }

      const { error } = await supabase.from('waitlist').insert({
        client_id: session.id,
        client_name: session.fullName,
        client_phone: session.phone,
        desired_date: desiredDate,
      })

      if (error) {
        return NextResponse.json({ error: 'Nu am putut adăuga în lista de așteptare.' }, { status: 400 })
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

      const { data: existing } = await supabase
        .from('appointments')
        .select('id, client_id')
        .eq('id', appointmentId)
        .single()

      if (!existing || existing.client_id !== session.id) {
        return NextResponse.json({ error: 'Nu ai acces la această vizită.' }, { status: 403 })
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

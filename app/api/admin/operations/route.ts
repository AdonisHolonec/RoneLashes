import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { unlockClientLoginByPhone } from '@/lib/client-login-guard'
import { hashClientPin } from '@/lib/client-pin'
import { resetRateLimitsForPhone } from '@/lib/sensitive-rate-limit'
import { buildBookingSummary } from '@/lib/booking'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'
import { getPortfolioStorageExtension, portfolioContentType, validatePortfolioUpload } from '@/lib/portfolio-media'

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

function clearClientAuthLockouts(phone: string) {
  unlockClientLoginByPhone(phone)
  resetRateLimitsForPhone(phone)
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    const supabase = getServiceRoleSupabase()

    if (contentType.includes('multipart/form-data')) {
      let formData: FormData
      try {
        formData = await request.formData()
      } catch {
        return NextResponse.json(
          {
            error:
              'Nu am putut citi fișierul (posibil prea mare pentru server sau conexiune întreruptă). Încearcă un clip mai scurt / mai mic.',
          },
          { status: 413 },
        )
      }
      const action = String(formData.get('action') || '')
      if (action !== 'upload_portfolio') {
        return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
      }

      const file = formData.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Fișier invalid.' }, { status: 400 })
      }

      const validationError = validatePortfolioUpload(file)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }

      const ext = getPortfolioStorageExtension(file)
      const fileName = `${crypto.randomUUID()}.${ext}`
      const fileBuffer = await file.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('portfolio')
        .upload(fileName, fileBuffer, {
          contentType: portfolioContentType(file),
          upsert: false,
        })
      if (uploadError) {
        const detail = uploadError.message ? ` (${uploadError.message})` : ''
        return NextResponse.json(
          { error: `Încărcarea în storage a eșuat.${detail}` },
          { status: 400 },
        )
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('portfolio').getPublicUrl(fileName)

      const { error: insertError } = await supabase.from('portfolio').insert([{ url: publicUrl }])
      if (insertError) {
        const detail = insertError.message ? ` (${insertError.message})` : ''
        return NextResponse.json(
          { error: `Fișierul nu a putut fi salvat în portofoliu.${detail}` },
          { status: 400 },
        )
      }
      return NextResponse.json({ ok: true, publicUrl })
    }

    const body = await request.json()
    const action = String(body?.action ?? '')

    if (action === 'lookup_client') {
      const phone = String(body?.phone ?? '').trim()
      if (phone.length < 10) return NextResponse.json({ client: null })
      const { data } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('phone', phone)
        .maybeSingle()
      return NextResponse.json({ client: data || null })
    }

    if (action === 'reset_client_pin') {
      const clientId = String(body?.clientId ?? '')
      const newPin = String(body?.newPin ?? '').replace(/\D/g, '')
      if (!clientId || !/^\d{4,8}$/.test(newPin)) {
        return NextResponse.json({ error: 'Date resetare PIN invalide.' }, { status: 400 })
      }

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name, phone')
        .eq('id', clientId)
        .maybeSingle()

      if (clientError || !client?.id) {
        return NextResponse.json({ error: 'Clienta nu a fost găsită.' }, { status: 404 })
      }

      const { error } = await supabase
        .from('clients')
        .update({ pin: hashClientPin(newPin) })
        .eq('id', client.id)

      if (error) {
        return NextResponse.json({ error: 'PIN-ul nu a putut fi resetat.' }, { status: 400 })
      }

      clearClientAuthLockouts(String(client.phone || ''))

      return NextResponse.json({
        ok: true,
        loginUnlocked: true,
        client: {
          id: client.id,
          full_name: client.full_name,
          phone: client.phone,
        },
      })
    }

    if (action === 'unlock_client_login') {
      const clientId = String(body?.clientId ?? '')
      if (!clientId) {
        return NextResponse.json({ error: 'Client invalid.' }, { status: 400 })
      }

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name, phone')
        .eq('id', clientId)
        .maybeSingle()

      if (clientError || !client?.id) {
        return NextResponse.json({ error: 'Clienta nu a fost găsită.' }, { status: 404 })
      }

      clearClientAuthLockouts(String(client.phone || ''))

      return NextResponse.json({
        ok: true,
        client: {
          id: client.id,
          full_name: client.full_name,
          phone: client.phone,
        },
      })
    }

    if (action === 'update_status') {
      const id = String(body?.id ?? '')
      const status = String(body?.status ?? '')
      if (!id || !status) return NextResponse.json({ error: 'Status invalid.' }, { status: 400 })
      const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Statusul nu a putut fi actualizat.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'manual_booking') {
      const serviceIds = Array.isArray(body?.serviceIds)
        ? Array.from(
            new Set(
              body.serviceIds.map((item: unknown) => String(item || '').trim()).filter(Boolean),
            ),
          )
        : body?.serviceId
          ? [String(body.serviceId).trim()].filter(Boolean)
          : []

      const startTime = String(body?.startTime ?? '')
      const startAt = new Date(startTime)
      if (serviceIds.length === 0 || !startTime || Number.isNaN(startAt.getTime())) {
        return NextResponse.json({ error: 'Date programare manuală invalide.' }, { status: 400 })
      }

      const { data: selectedServices, error: servicesError } = await supabase
        .from('services')
        .select('id, name, price, duration_minutes')
        .in('id', serviceIds)

      if (servicesError || !selectedServices || selectedServices.length !== serviceIds.length) {
        return NextResponse.json({ error: 'Serviciile selectate sunt invalide.' }, { status: 400 })
      }

      const summary = buildBookingSummary(selectedServices)
      if (!summary.notes || summary.durationMinutes <= 0) {
        return NextResponse.json({ error: 'Serviciile selectate sunt incomplete.' }, { status: 400 })
      }

      const endAt = new Date(startAt.getTime() + summary.durationMinutes * 60 * 1000)
      const payload = {
        client_id: body?.clientId ? String(body.clientId) : null,
        client_name: String(body?.clientName ?? ''),
        client_phone: String(body?.clientPhone ?? ''),
        service_id: summary.serviceId,
        notes: `${summary.notes} (Manual)`,
        total_price: summary.totalPrice,
        start_time: startAt.toISOString(),
        end_time: endAt.toISOString(),
        status: 'confirmed',
      }
      if (!payload.client_name || !payload.client_phone) {
        return NextResponse.json({ error: 'Date programare manuală invalide.' }, { status: 400 })
      }
      const { error } = await supabase.from('appointments').insert(payload)
      if (error) return NextResponse.json({ error: 'Programarea manuală nu a putut fi salvată.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'save_pause') {
      const payload = {
        client_name: String(body?.note ?? 'Pauză'),
        client_phone: '-',
        notes: 'Interval Blocat',
        total_price: 0,
        start_time: String(body?.startTime ?? ''),
        end_time: String(body?.endTime ?? ''),
        status: 'confirmed',
      }
      if (!payload.start_time || !payload.end_time) {
        return NextResponse.json({ error: 'Date pauză invalide.' }, { status: 400 })
      }
      const { error } = await supabase.from('appointments').insert(payload)
      if (error) return NextResponse.json({ error: 'Pauza nu a putut fi salvată.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'update_schedule') {
      const dayOfWeek = Number(body?.dayOfWeek)
      const openTime = String(body?.openTime ?? '')
      const closeTime = String(body?.closeTime ?? '')
      const isDayOff = Boolean(body?.isDayOff)
      if (!Number.isFinite(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return NextResponse.json({ error: 'Zi invalidă.' }, { status: 400 })
      }
      const { error } = await supabase
        .from('working_hours')
        .update({ open_time: openTime, close_time: closeTime, is_day_off: isDayOff })
        .eq('day_of_week', dayOfWeek)
      if (error) return NextResponse.json({ error: 'Programul nu a putut fi actualizat.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'save_closure') {
      const startDate = String(body?.startDate ?? '')
      const endDate = String(body?.endDate ?? '')
      const description = String(body?.description ?? 'Concediu')
      if (!startDate || !endDate) {
        return NextResponse.json({ error: 'Date concediu invalide.' }, { status: 400 })
      }
      const { error } = await supabase
        .from('salon_closures')
        .insert({ start_date: startDate, end_date: endDate, description })
      if (error) return NextResponse.json({ error: 'Concediul nu a putut fi salvat.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'reset_review') {
      const appointmentId = String(body?.appointmentId ?? '')
      if (!appointmentId) return NextResponse.json({ error: 'Recenzie invalidă.' }, { status: 400 })
      const { error } = await supabase
        .from('appointments')
        .update({ rating: 0, review_text: null })
        .eq('id', appointmentId)
      if (error) return NextResponse.json({ error: 'Recenzia nu a putut fi resetată.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'create_review_link') {
      const appointmentId = String(body?.appointmentId ?? '')
      if (!appointmentId) return NextResponse.json({ error: 'Programare invalidă.' }, { status: 400 })

      const { data: appointment } = await supabase
        .from('appointments')
        .select('id')
        .eq('id', appointmentId)
        .maybeSingle()

      if (!appointment?.id) {
        return NextResponse.json({ error: 'Programarea nu a fost găsită.' }, { status: 404 })
      }

      const { data: existing } = await supabase
        .from('review_tokens')
        .select('token')
        .eq('appointment_id', appointment.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing?.token) return NextResponse.json({ ok: true, token: existing.token })

      const token = randomBytes(24).toString('hex')
      const { error } = await supabase.from('review_tokens').insert({
        appointment_id: appointment.id,
        token,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      if (error) return NextResponse.json({ error: 'Linkul de recenzie nu a putut fi creat.' }, { status: 400 })
      return NextResponse.json({ ok: true, token })
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}

/** Upload-uri mari (ex. video) pe Vercel / hosting. */
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    const supabase = getServiceRoleSupabase()

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const action = String(formData.get('action') || '')
      if (action !== 'upload_portfolio') {
        return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
      }

      const file = formData.get('file')
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Fișier invalid.' }, { status: 400 })
      }

      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `${crypto.randomUUID()}.${ext}`
      const fileBuffer = await file.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('portfolio')
        .upload(fileName, fileBuffer, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        })
      if (uploadError) {
        return NextResponse.json({ error: 'Upload-ul imaginii a eșuat.' }, { status: 400 })
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('portfolio').getPublicUrl(fileName)

      const { error: insertError } = await supabase.from('portfolio').insert([{ url: publicUrl }])
      if (insertError) {
        return NextResponse.json({ error: 'Imaginea nu a putut fi salvată în portofoliu.' }, { status: 400 })
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

    if (action === 'update_status') {
      const id = String(body?.id ?? '')
      const status = String(body?.status ?? '')
      if (!id || !status) return NextResponse.json({ error: 'Status invalid.' }, { status: 400 })
      const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Statusul nu a putut fi actualizat.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'manual_booking') {
      const payload = {
        client_id: body?.clientId ? String(body.clientId) : null,
        client_name: String(body?.clientName ?? ''),
        client_phone: String(body?.clientPhone ?? ''),
        service_id: String(body?.serviceId ?? ''),
        notes: String(body?.notes ?? ''),
        total_price: Number(body?.totalPrice ?? 0),
        start_time: String(body?.startTime ?? ''),
        end_time: String(body?.endTime ?? ''),
        status: 'confirmed',
      }
      if (!payload.client_name || !payload.client_phone || !payload.service_id || !payload.start_time || !payload.end_time) {
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

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}

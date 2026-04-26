import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'

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

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const action = String(body?.action ?? '')
    const supabase = getServiceSupabase()

    if (action === 'save') {
      const serviceId = body?.serviceId ? String(body.serviceId) : null
      const payload = {
        name: String(body?.name ?? '').trim(),
        price: String(body?.price ?? '').trim(),
        duration_minutes: Number(body?.duration_minutes ?? 0),
        category: String(body?.category ?? '').trim(),
        subcategory: String(body?.subcategory ?? '').trim() || null,
      }

      if (!payload.name || !payload.price || !Number.isFinite(payload.duration_minutes) || payload.duration_minutes <= 0) {
        return NextResponse.json({ error: 'Date serviciu invalide.' }, { status: 400 })
      }

      if (serviceId) {
        const { error } = await supabase.from('services').update(payload).eq('id', serviceId)
        if (error) return NextResponse.json({ error: 'Serviciul nu a putut fi actualizat.' }, { status: 400 })
        return NextResponse.json({ ok: true })
      }

      const { error } = await supabase.from('services').insert([payload])
      if (error) return NextResponse.json({ error: 'Serviciul nu a putut fi adăugat.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      const serviceId = String(body?.serviceId ?? '')
      if (!serviceId) return NextResponse.json({ error: 'ID serviciu invalid.' }, { status: 400 })
      const { error } = await supabase.from('services').delete().eq('id', serviceId)
      if (error) return NextResponse.json({ error: 'Serviciul nu a putut fi șters.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

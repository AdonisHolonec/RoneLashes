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

function normalizeWord(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  return trimmed
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function normalizeServiceName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizedKey(name: string, category: string, subcategory: string | null) {
  return `${name.toLowerCase()}|${category.toLowerCase()}|${(subcategory || '').toLowerCase()}`
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
      const normalizedName = normalizeServiceName(String(body?.name ?? ''))
      const normalizedCategory = normalizeWord(String(body?.category ?? ''))
      const normalizedSubcategoryRaw = normalizeWord(String(body?.subcategory ?? ''))
      const normalizedSubcategory = normalizedSubcategoryRaw || null

      const payload = {
        name: normalizedName,
        price: String(body?.price ?? '').trim(),
        duration_minutes: Number(body?.duration_minutes ?? 0),
        category: normalizedCategory,
        subcategory: normalizedSubcategory,
      }
      const legacyPayload = {
        name: payload.name,
        price: payload.price,
        duration_minutes: payload.duration_minutes,
        category: payload.category,
      }

      if (!payload.name || !payload.price || !Number.isFinite(payload.duration_minutes) || payload.duration_minutes <= 0) {
        return NextResponse.json({ error: 'Date serviciu invalide.' }, { status: 400 })
      }

      const { data: existingServices } = await supabase
        .from('services')
        .select('id, name, category, subcategory')

      const duplicate = (existingServices || []).find((service) => {
        if (serviceId && service.id === serviceId) return false
        return (
          normalizedKey(
            String(service.name || ''),
            String(service.category || ''),
            service.subcategory ? String(service.subcategory) : null
          ) === normalizedKey(payload.name, payload.category, payload.subcategory)
        )
      })

      if (duplicate) {
        return NextResponse.json(
          { error: 'Există deja un serviciu cu același nume, categorie și subcategorie.' },
          { status: 409 }
        )
      }

      if (serviceId) {
        let { error } = await supabase.from('services').update(payload).eq('id', serviceId)
        if (error && String(error.message || '').toLowerCase().includes('subcategory')) {
          const legacyResult = await supabase.from('services').update(legacyPayload).eq('id', serviceId)
          error = legacyResult.error
        }
        if (error) return NextResponse.json({ error: 'Serviciul nu a putut fi actualizat.' }, { status: 400 })
        return NextResponse.json({ ok: true })
      }

      let { error } = await supabase.from('services').insert([payload])
      if (error && String(error.message || '').toLowerCase().includes('subcategory')) {
        const legacyResult = await supabase.from('services').insert([legacyPayload])
        error = legacyResult.error
      }
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

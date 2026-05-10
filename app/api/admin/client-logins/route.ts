import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

type AuthEventRow = {
  id: string
  created_at: string
  action: string
  outcome: string
  client_id: string | null
  client_full_name: string | null
  client_phone: string | null
  phone_masked: string | null
  ip_address: string | null
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days') || 30)
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 30
  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 200)
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 200

  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  try {
    const supabase = getServiceRoleSupabase()
    const { data: events, error: evErr } = await supabase
      .from('auth_events')
      .select(
        'id, created_at, action, outcome, client_id, client_full_name, client_phone, phone_masked, ip_address',
      )
      .eq('area', 'client')
      .in('action', ['login', 'register'])
      .eq('outcome', 'success')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (evErr) {
      return NextResponse.json({ error: 'Could not load auth events.' }, { status: 400 })
    }

    const rows = (events || []) as AuthEventRow[]
    const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[]

    type ApptRow = { id: string; client_id: string | null; created_at: string; status: string | null }
    let appts: ApptRow[] = []
    if (clientIds.length > 0) {
      const { data: a } = await supabase
        .from('appointments')
        .select('id, client_id, created_at, status')
        .in('client_id', clientIds)
      if (Array.isArray(a)) appts = a as ApptRow[]
    }

    const inactive = new Set(['canceled', 'rejected'])
    const items = rows.map((e) => {
      const eventMs = new Date(e.created_at).getTime()
      let bookedAfterLogin = false
      if (e.client_id) {
        bookedAfterLogin = appts.some(
          (a) =>
            a.client_id === e.client_id &&
            String(a.status || '') &&
            !inactive.has(String(a.status || '')) &&
            new Date(a.created_at).getTime() >= eventMs,
        )
      }

      return {
        id: e.id,
        at: e.created_at,
        kind: e.action === 'register' ? 'Înregistrare' : 'Autentificare',
        fullName: e.client_full_name?.trim() || '—',
        phone: e.client_phone || e.phone_masked || '—',
        ip: e.ip_address || null,
        bookedAfterLogin,
      }
    })

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ error: 'Client logins unavailable.' }, { status: 500 })
  }
}

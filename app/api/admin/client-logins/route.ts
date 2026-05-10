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

function digitsOnly(raw: string) {
  return String(raw || '').replace(/\D/g, '')
}

/** Same pattern as lib/auth-audit.ts for successful events. */
function phoneMaskFromDigits(phoneDigits: string) {
  const d = phoneDigits
  if (d.length < 5) return ''
  return `${d.slice(0, 3)}***${d.slice(-2)}`
}

type ClientRow = { id: string; full_name: string | null; phone: string | null }

function buildClientLookup(clients: ClientRow[]) {
  const byId = new Map<string, ClientRow>()
  const maskToClientIds = new Map<string, string[]>()

  for (const c of clients) {
    byId.set(c.id, c)
    const variants = new Set<string>()
    const d = digitsOnly(String(c.phone || ''))
    variants.add(d)
    if (d.startsWith('0') && d.length >= 10) {
      variants.add(`4${d}`)
    }
    if (d.startsWith('40')) {
      const rest = d.slice(2)
      if (rest.length >= 9) variants.add(`0${rest}`)
    }
    for (const v of variants) {
      const m = phoneMaskFromDigits(v)
      if (!m) continue
      const arr = maskToClientIds.get(m) || []
      if (!arr.includes(c.id)) arr.push(c.id)
      maskToClientIds.set(m, arr)
    }
  }

  return { byId, maskToClientIds }
}

function resolveEventIdentity(
  e: AuthEventRow,
  byId: Map<string, ClientRow>,
  maskToClientIds: Map<string, string[]>,
): { clientId: string | null; fullName: string; phone: string } {
  const masked = (e.phone_masked || '').trim()

  if (e.client_id) {
    const row = byId.get(e.client_id)
    const name = (e.client_full_name || row?.full_name || '').trim() || '—'
    const phone = e.client_phone || row?.phone || (masked && masked !== 'n/a' ? masked : '—')
    return { clientId: e.client_id, fullName: name, phone }
  }

  if (masked && masked !== 'n/a') {
    const ids = maskToClientIds.get(masked) || []
    if (ids.length === 1) {
      const row = byId.get(ids[0])
      return {
        clientId: ids[0],
        fullName: (row?.full_name || '').trim() || '—',
        phone: row?.phone || masked,
      }
    }
  }

  return { clientId: null, fullName: '—', phone: masked && masked !== 'n/a' ? masked : '—' }
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

    const [{ data: events, error: evErr }, { data: allClients }] = await Promise.all([
      supabase
        .from('auth_events')
        .select(
          'id, created_at, action, outcome, client_id, client_full_name, client_phone, phone_masked, ip_address',
        )
        .eq('area', 'client')
        .in('action', ['login', 'register'])
        .eq('outcome', 'success')
        .gte('created_at', from.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase.from('clients').select('id, full_name, phone'),
    ])

    if (evErr) {
      return NextResponse.json({ error: 'Could not load auth events.' }, { status: 400 })
    }

    const rows = (events || []) as AuthEventRow[]
    const clients = (allClients || []) as ClientRow[]
    const { byId, maskToClientIds } = buildClientLookup(clients)

    const inactive = new Set(['canceled', 'rejected'])
    const resolvedRows = rows.map((e) => {
      const r = resolveEventIdentity(e, byId, maskToClientIds)
      return { e, ...r }
    })

    const allApptClientIds = [...new Set(resolvedRows.map((r) => r.clientId).filter(Boolean))] as string[]

    type ApptRow = { id: string; client_id: string | null; created_at: string; status: string | null }
    let appts: ApptRow[] = []
    if (allApptClientIds.length > 0) {
      const { data: a } = await supabase
        .from('appointments')
        .select('id, client_id, created_at, status')
        .in('client_id', allApptClientIds)
      if (Array.isArray(a)) appts = a as ApptRow[]
    }

    const items = resolvedRows.map(({ e, clientId, fullName, phone }) => {
      const eventMs = new Date(e.created_at).getTime()
      let bookedAfterLogin = false
      if (clientId) {
        bookedAfterLogin = appts.some(
          (a) =>
            a.client_id === clientId &&
            String(a.status || '') &&
            !inactive.has(String(a.status || '')) &&
            new Date(a.created_at).getTime() >= eventMs,
        )
      }

      return {
        id: e.id,
        at: e.created_at,
        kind: e.action === 'register' ? 'Înregistrare' : 'Autentificare',
        fullName,
        phone,
        ip: e.ip_address || null,
        bookedAfterLogin,
      }
    })

    const totalClients = clients.length

    const { data: apptStatRows } = await supabase
      .from('appointments')
      .select('client_id, status')
      .not('client_id', 'is', null)

    const clientsWithBooking = new Set<string>()
    for (const a of apptStatRows || []) {
      const st = String(a.status || '')
      if (a.client_id && st && !inactive.has(st)) {
        clientsWithBooking.add(a.client_id)
      }
    }

    const clientsWithBookingCount = clientsWithBooking.size
    const bookingCoveragePct =
      totalClients > 0 ? Math.round((clientsWithBookingCount / totalClients) * 100) : 0

    return NextResponse.json({
      items,
      stats: {
        totalClients,
        clientsWithBooking: clientsWithBookingCount,
        bookingCoveragePct,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Client logins unavailable.' }, { status: 500 })
  }
}

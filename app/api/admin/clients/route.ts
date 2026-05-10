import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

type ClientRow = {
  id: string
  full_name: string | null
  phone: string | null
  created_at: string | null
  personal_data_consent_at: string | null
}

type AppointmentRow = {
  id: string
  client_id: string | null
  start_time: string
  status: string | null
  total_price: number | string | null
  rating: number | null
}

function parsePrice(value: number | string | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  return parseInt(String(value || '0').replace(/\D/g, ''), 10) || 0
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleSupabase()
    const [{ data: clients, error: clientsError }, { data: appointments, error: appointmentsError }] =
      await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, phone, created_at, personal_data_consent_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('id, client_id, start_time, status, total_price, rating')
          .not('client_id', 'is', null),
      ])

    if (clientsError || appointmentsError) {
      return NextResponse.json({ error: 'Nu am putut încărca lista de cliente.' }, { status: 400 })
    }

    const now = Date.now()
    const inactiveStatus = new Set(['canceled', 'rejected'])
    const validAppointments = ((appointments || []) as AppointmentRow[]).filter(
      (app) => app.client_id && !inactiveStatus.has(String(app.status || '')),
    )

    const rows = ((clients || []) as ClientRow[]).map((client) => {
      const clientAppointments = validAppointments.filter((app) => app.client_id === client.id)
      const past = clientAppointments
        .filter((app) => new Date(app.start_time).getTime() < now)
        .sort((a, b) => b.start_time.localeCompare(a.start_time))
      const future = clientAppointments
        .filter((app) => new Date(app.start_time).getTime() >= now)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
      const rated = clientAppointments.filter((app) => Number(app.rating || 0) > 0)
      const totalSpent = clientAppointments.reduce((acc, app) => acc + parsePrice(app.total_price), 0)

      return {
        id: client.id,
        fullName: client.full_name || '—',
        phone: client.phone || '—',
        createdAt: client.created_at,
        consentAt: client.personal_data_consent_at,
        totalAppointments: clientAppointments.length,
        completedAppointments: past.length,
        futureAppointments: future.length,
        totalSpent,
        lastVisitAt: past[0]?.start_time || null,
        nextVisitAt: future[0]?.start_time || null,
        averageRating:
          rated.length > 0
            ? Number((rated.reduce((acc, app) => acc + Number(app.rating || 0), 0) / rated.length).toFixed(1))
            : null,
      }
    })

    const clientsWithAppointments = rows.filter((row) => row.totalAppointments > 0).length
    const inactiveSince = now - 45 * 24 * 60 * 60 * 1000
    const inactive45Days = rows.filter((row) => {
      if (row.futureAppointments > 0) return false
      if (!row.lastVisitAt) return row.totalAppointments > 0
      return new Date(row.lastVisitAt).getTime() < inactiveSince
    }).length

    return NextResponse.json({
      clients: rows,
      stats: {
        totalClients: rows.length,
        clientsWithAppointments,
        bookingCoveragePct: rows.length > 0 ? Math.round((clientsWithAppointments / rows.length) * 100) : 0,
        inactive45Days,
        totalRevenue: rows.reduce((acc, row) => acc + row.totalSpent, 0),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Lista de cliente nu este disponibilă.' }, { status: 500 })
  }
}

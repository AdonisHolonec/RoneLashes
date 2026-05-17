import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { allocateAppointmentRevenue, parseAppointmentPrice } from '@/lib/revenue-stream'
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
  notes: string | null
  total_price: number | string | null
  rating: number | null
  service_id: string | null
}

type ServiceRow = {
  id: string
  name: string
  category: string | null
  price: number | string | null
}

type PreferenceRow = {
  client_id: string
  preferred_style: string | null
  sensitivity_notes: string | null
  appointment_notes: string | null
  updated_at: string | null
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleSupabase()
    const [
      { data: clients, error: clientsError },
      { data: appointments, error: appointmentsError },
      { data: preferences },
      { data: services },
    ] =
      await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, phone, created_at, personal_data_consent_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('id, client_id, start_time, status, notes, total_price, rating, service_id')
          .not('client_id', 'is', null),
        supabase
          .from('client_preferences')
          .select('client_id, preferred_style, sensitivity_notes, appointment_notes, updated_at'),
        supabase.from('services').select('id, name, category, price'),
      ])

    const revenueServices = ((services || []) as ServiceRow[]).map((service) => ({
      id: service.id,
      name: service.name,
      category: String(service.category || ''),
      price: parseAppointmentPrice(service.price),
    }))

    if (clientsError || appointmentsError) {
      return NextResponse.json({ error: 'Nu am putut încărca lista de cliente.' }, { status: 400 })
    }

    const now = Date.now()
    const inactiveStatus = new Set(['canceled', 'rejected'])
    const validAppointments = ((appointments || []) as AppointmentRow[]).filter(
      (app) => app.client_id && !inactiveStatus.has(String(app.status || '')),
    )
    const preferencesByClient = new Map(
      ((preferences || []) as PreferenceRow[]).map((preference) => [preference.client_id, preference]),
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
      const totalSpent = clientAppointments.reduce((acc, app) => acc + parseAppointmentPrice(app.total_price), 0)
      const spentByStream = clientAppointments.reduce(
        (acc, app) => {
          const price = parseAppointmentPrice(app.total_price)
          const split = allocateAppointmentRevenue(price, app.service_id, app.notes, revenueServices)
          acc.lashes += split.lashes
          acc.makeup += split.makeup
          return acc
        },
        { lashes: 0, makeup: 0 },
      )
      const recentAppointments = [...clientAppointments]
        .sort((a, b) => b.start_time.localeCompare(a.start_time))
        .slice(0, 6)
        .map((app) => ({
          id: app.id,
          startTime: app.start_time,
          status: app.status || 'confirmed',
          notes: app.notes || 'Programare',
          totalPrice: parseAppointmentPrice(app.total_price),
          rating: app.rating,
        }))
      const preference = preferencesByClient.get(client.id)

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
        totalSpentLashes: spentByStream.lashes,
        totalSpentMakeup: spentByStream.makeup,
        lastVisitAt: past[0]?.start_time || null,
        nextVisitAt: future[0]?.start_time || null,
        averageRating:
          rated.length > 0
            ? Number((rated.reduce((acc, app) => acc + Number(app.rating || 0), 0) / rated.length).toFixed(1))
            : null,
        preferences: {
          preferredStyle: preference?.preferred_style || '',
          sensitivityNotes: preference?.sensitivity_notes || '',
          appointmentNotes: preference?.appointment_notes || '',
          updatedAt: preference?.updated_at || null,
        },
        recentAppointments,
      }
    })

    const clientsWithAppointments = rows.filter((row) => row.totalAppointments > 0).length
    const inactiveSince = now - 45 * 24 * 60 * 60 * 1000
    const inactive45Days = rows.filter((row) => {
      if (row.futureAppointments > 0) return false
      if (!row.lastVisitAt) return row.totalAppointments > 0
      return new Date(row.lastVisitAt).getTime() < inactiveSince
    }).length

    const totalRevenueLashes = rows.reduce((acc, row) => acc + row.totalSpentLashes, 0)
    const totalRevenueMakeup = rows.reduce((acc, row) => acc + row.totalSpentMakeup, 0)

    return NextResponse.json({
      clients: rows,
      stats: {
        totalClients: rows.length,
        clientsWithAppointments,
        bookingCoveragePct: rows.length > 0 ? Math.round((clientsWithAppointments / rows.length) * 100) : 0,
        inactive45Days,
        totalRevenue: totalRevenueLashes + totalRevenueMakeup,
        totalRevenueLashes,
        totalRevenueMakeup,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Lista de cliente nu este disponibilă.' }, { status: 500 })
  }
}

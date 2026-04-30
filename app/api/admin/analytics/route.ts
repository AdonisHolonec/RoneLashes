import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days') || 14)
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14
  const from = new Date()
  from.setDate(from.getDate() - (days - 1))
  from.setHours(0, 0, 0, 0)

  try {
    const supabase = getServiceRoleSupabase()
    const { data, error } = await supabase
      .from('analytics_events')
      .select('event_name, event_category, created_at')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Could not load analytics events.' }, { status: 400 })
    }

    return NextResponse.json({ events: data || [] })
  } catch {
    return NextResponse.json({ error: 'Analytics endpoint unavailable.' }, { status: 500 })
  }
}

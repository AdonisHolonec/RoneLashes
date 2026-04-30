import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

const ALLOWED_TABLES = new Set(['appointments', 'waitlist', 'portfolio', 'salon_closures'])

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
    const table = String(body?.table ?? '')
    const id = String(body?.id ?? '')

    if (action !== 'delete' || !ALLOWED_TABLES.has(table) || !id) {
      return NextResponse.json({ error: 'Invalid delete request.' }, { status: 400 })
    }

    const supabase = getServiceRoleSupabase()
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: 'Elementul nu a putut fi șters.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const ALLOWED_TABLES = new Set(['appointments', 'waitlist', 'portfolio', 'salon_closures'])

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
    const table = String(body?.table ?? '')
    const id = String(body?.id ?? '')

    if (action !== 'delete' || !ALLOWED_TABLES.has(table) || !id) {
      return NextResponse.json({ error: 'Invalid delete request.' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: 'Elementul nu a putut fi șters.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getClientAuthCookieName, verifyClientSessionToken } from '@/lib/client-auth'

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

function getSession(request: NextRequest) {
  const token = request.cookies.get(getClientAuthCookieName())?.value || ''
  return verifyClientSessionToken(token)
}

export async function GET(request: NextRequest) {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Neautorizat.' }, { status: 401 })
  }

  try {
    const supabase = getServiceSupabase()
    const { data } = await supabase
      .from('client_preferences')
      .select('preferred_style, sensitivity_notes, appointment_notes')
      .eq('client_id', session.id)
      .maybeSingle()

    return NextResponse.json({
      preferences: {
        preferredStyle: data?.preferred_style || '',
        sensitivityNotes: data?.sensitivity_notes || '',
        appointmentNotes: data?.appointment_notes || '',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Nu am putut încărca preferințele.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request)
  if (!session) {
    return NextResponse.json({ error: 'Neautorizat.' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const preferredStyle = String(body?.preferredStyle ?? '').trim().slice(0, 80)
    const sensitivityNotes = String(body?.sensitivityNotes ?? '').trim().slice(0, 500)
    const appointmentNotes = String(body?.appointmentNotes ?? '').trim().slice(0, 500)

    const supabase = getServiceSupabase()
    const { error } = await supabase.from('client_preferences').upsert(
      {
        client_id: session.id,
        preferred_style: preferredStyle || null,
        sensitivity_notes: sensitivityNotes || null,
        appointment_notes: appointmentNotes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' },
    )

    if (error) {
      return NextResponse.json({ error: 'Preferințele nu au putut fi salvate.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Cerere invalidă.' }, { status: 400 })
  }
}

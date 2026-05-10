import { NextRequest, NextResponse } from 'next/server'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

type RouteContext = {
  params: Promise<{ token: string }>
}

async function loadAppointment(token: string) {
  const supabase = getServiceRoleSupabase()
  const { data: tokenRow, error: tokenError } = await supabase
    .from('review_tokens')
    .select('appointment_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (tokenError || !tokenRow?.appointment_id) return { error: 'Link invalid.' }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return { error: 'Linkul de recenzie a expirat.' }

  const { data: appointment, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, client_name, start_time, notes, rating, review_text')
    .eq('id', tokenRow.appointment_id)
    .maybeSingle()

  if (appointmentError || !appointment?.id) return { error: 'Programarea nu a fost găsită.' }
  return { tokenRow, appointment }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params
  const result = await loadAppointment(token)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  return NextResponse.json({
    appointment: {
      id: result.appointment.id,
      clientName: result.appointment.client_name,
      startTime: result.appointment.start_time,
      notes: result.appointment.notes,
      rating: result.appointment.rating || 0,
      reviewText: result.appointment.review_text || '',
      alreadyReviewed: Number(result.appointment.rating || 0) > 0,
    },
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params
  const result = await loadAppointment(token)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const rating = Number(body?.rating || 0)
  const reviewText = String(body?.reviewText || '').trim().slice(0, 700)

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Alege un rating între 1 și 5 stele.' }, { status: 400 })
  }

  const supabase = getServiceRoleSupabase()
  const { error } = await supabase
    .from('appointments')
    .update({ rating, review_text: reviewText || null })
    .eq('id', result.appointment.id)

  if (error) {
    return NextResponse.json({ error: 'Recenzia nu a putut fi salvată.' }, { status: 400 })
  }

  await supabase.from('review_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)
  void trackAnalyticsEvent({
    eventName: 'review_submitted',
    category: 'engagement',
    metadata: { rating, source: 'public_review_link' },
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}

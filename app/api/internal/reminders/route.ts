import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

type ReminderType = '24h' | '2h' | 'review'

type AppointmentRow = {
  id: string
  client_name: string | null
  client_phone: string | null
  start_time: string
  end_time?: string | null
  rating?: number | null
}

const cronSecret = process.env.CRON_SECRET || ''
const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN || ''
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const whatsappApiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0'
const whatsappTemplateName = process.env.WHATSAPP_TEMPLATE_NAME || ''
const whatsappTemplateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'ro'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ronelashes.vercel.app'

const REMINDER_TIMEZONE = 'Europe/Bucharest'
/** How far ahead we load appointments (covers “tomorrow” in RO + ~2h window + DST margin). */
const QUERY_HORIZON_HOURS = 72

function getCalendarPartsInTz(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const y = Number(parts.find((p) => p.type === 'year')?.value)
  const m = Number(parts.find((p) => p.type === 'month')?.value)
  const d = Number(parts.find((p) => p.type === 'day')?.value)
  return { y, m, d }
}

/** Gregorian civil date + delta days (not wall-clock 24h). */
function addCalendarDays(y: number, m: number, d: number, delta: number) {
  const x = new Date(Date.UTC(y, m - 1, d + delta))
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }
}

function isSameCivilDay(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number },
) {
  return a.y === b.y && a.m === b.m && a.d === b.d
}

function isAuthorized(request: NextRequest) {
  if (!cronSecret) return false

  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  return bearerToken === cronSecret
}

function normalizeRoPhone(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('40')) return digits
  if (digits.startsWith('0')) return `4${digits}`
  if (digits.length === 9) return `40${digits}`
  return digits
}

function buildReminderText(reminderType: ReminderType, appointment: AppointmentRow, reviewUrl?: string) {
  const startDate = new Date(appointment.start_time)
  const niceDate = new Intl.DateTimeFormat('ro-RO', {
    timeZone: REMINDER_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(startDate)
  if (reminderType === 'review') {
    return `Buna, ${appointment.client_name || 'draga clienta'}! Iti multumesc pentru vizita la RoneLashes. ✨\n\nM-as bucura enorm daca imi lasi o recenzie aici:\n${reviewUrl}\n\nDureaza mai putin de un minut si ma ajuta mult. 💖`
  }

  const intro =
    reminderType === '24h'
      ? 'Reminder pentru programarea de maine'
      : 'Reminder pentru programarea care urmeaza in aproximativ 2 ore'

  return `${intro} la RoneLashes.\n\n${appointment.client_name || 'Clienta'} - ${niceDate}\n\nDaca ai nevoie sa modifici ora, te rugam sa ne anunti din timp.`
}

async function getOrCreateReviewToken(supabase: ReturnType<typeof getServiceRoleSupabase>, appointmentId: string) {
  const { data: existing } = await supabase
    .from('review_tokens')
    .select('token, expires_at')
    .eq('appointment_id', appointmentId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.token) return String(existing.token)

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('review_tokens').insert({
    appointment_id: appointmentId,
    token,
    expires_at: expiresAt,
  })
  if (error) throw error
  return token
}

function detectReminderType(startTimeIso: string, nowMs: number): ReminderType | null {
  const start = new Date(startTimeIso)
  const now = new Date(nowMs)
  if (start.getTime() <= now.getTime()) return null

  const diffMinutes = (start.getTime() - nowMs) / 60000
  if (diffMinutes >= 90 && diffMinutes <= 150) return '2h'

  const nowRo = getCalendarPartsInTz(now, REMINDER_TIMEZONE)
  const apptRo = getCalendarPartsInTz(start, REMINDER_TIMEZONE)
  const dayBeforeAppt = addCalendarDays(apptRo.y, apptRo.m, apptRo.d, -1)
  if (isSameCivilDay(nowRo, dayBeforeAppt)) return '24h'

  return null
}

async function sendWhatsAppText(toPhone: string, text: string) {
  const endpoint = `https://graph.facebook.com/${whatsappApiVersion}/${whatsappPhoneNumberId}/messages`
  const bodyPayload = whatsappTemplateName
    ? {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: {
          name: whatsappTemplateName,
          language: { code: whatsappTemplateLang },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text }],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: text },
      }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message || 'WhatsApp API request failed.')
  }

  return String(payload?.messages?.[0]?.id || '')
}

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!cronSecret) {
    return NextResponse.json({ error: 'Reminder job is disabled until CRON_SECRET is configured.' }, { status: 500 })
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!whatsappToken || !whatsappPhoneNumberId) {
    return NextResponse.json(
      { error: 'WhatsApp provider config missing. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' },
      { status: 500 },
    )
  }

  try {
    const supabase = getServiceRoleSupabase()
    const now = new Date()
    const upperBound = new Date(now.getTime() + QUERY_HORIZON_HOURS * 60 * 60 * 1000).toISOString()
    const reviewLowerBound = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString()
    const reviewUpperBound = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()

    const [{ data: appointments, error: appointmentsError }, { data: reviewAppointments, error: reviewError }] =
      await Promise.all([
        supabase
          .from('appointments')
          .select('id, client_name, client_phone, start_time')
          .eq('status', 'confirmed')
          .gt('start_time', now.toISOString())
          .lte('start_time', upperBound)
          .neq('client_phone', '-'),
        supabase
          .from('appointments')
          .select('id, client_name, client_phone, start_time, end_time, status, rating')
          .in('status', ['completed', 'confirmed'])
          .gte('end_time', reviewLowerBound)
          .lte('end_time', reviewUpperBound)
          .neq('client_phone', '-'),
      ])

    if (appointmentsError || reviewError) {
      return NextResponse.json({ error: 'Could not load appointments.' }, { status: 500 })
    }

    const reminderCandidates = (appointments || [])
      .map((appointment) => {
        const reminderType = detectReminderType(appointment.start_time, now.getTime())
        return reminderType ? { ...appointment, reminderType } : null
      })
      .filter((x): x is AppointmentRow & { reminderType: ReminderType } => Boolean(x))

    const reviewCandidates = (reviewAppointments || [])
      .filter((appointment) => Number(appointment.rating || 0) <= 0)
      .map((appointment) => ({ ...appointment, reminderType: 'review' as const }))

    const candidates = [...reminderCandidates, ...reviewCandidates]

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0 })
    }

    const candidateIds = candidates.map((c) => c.id)
    const { data: existingSent, error: sentError } = await supabase
      .from('appointment_reminders')
      .select('appointment_id, reminder_type, status')
      .in('appointment_id', candidateIds)
      .eq('status', 'sent')

    if (sentError) {
      return NextResponse.json({ error: 'Could not load reminder logs.' }, { status: 500 })
    }

    const sentSet = new Set((existingSent || []).map((r) => `${r.appointment_id}:${r.reminder_type}`))

    let sentCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const appointment of candidates) {
      const dedupeKey = `${appointment.id}:${appointment.reminderType}`
      if (sentSet.has(dedupeKey)) {
        skippedCount += 1
        continue
      }

      const normalizedPhone = normalizeRoPhone(appointment.client_phone || '')
      if (!normalizedPhone) {
        failedCount += 1
        await supabase.from('appointment_reminders').insert({
          appointment_id: appointment.id,
          reminder_type: appointment.reminderType,
          status: 'failed',
          error_message: 'Missing/invalid phone number.',
        })
        continue
      }

      try {
        let reviewUrl = ''
        if (appointment.reminderType === 'review') {
          const token = await getOrCreateReviewToken(supabase, appointment.id)
          reviewUrl = `${siteUrl}/review/${token}`
        }
        const messageId = await sendWhatsAppText(
          normalizedPhone,
          buildReminderText(appointment.reminderType, appointment, reviewUrl),
        )
        sentCount += 1
        await supabase.from('appointment_reminders').insert({
          appointment_id: appointment.id,
          reminder_type: appointment.reminderType,
          status: 'sent',
          provider_message_id: messageId || null,
        })
      } catch (error) {
        failedCount += 1
        await supabase.from('appointment_reminders').insert({
          appointment_id: appointment.id,
          reminder_type: appointment.reminderType,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown WhatsApp send failure.',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      processed: candidates.length,
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount,
    })
  } catch {
    return NextResponse.json({ error: 'Reminder job failed.' }, { status: 500 })
  }
}

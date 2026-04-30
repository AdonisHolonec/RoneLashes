import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

type ReminderType = '24h' | '2h'

type AppointmentRow = {
  id: string
  client_name: string | null
  client_phone: string | null
  start_time: string
}

const cronSecret = process.env.CRON_SECRET || ''
const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN || ''
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
const whatsappApiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0'
const whatsappTemplateName = process.env.WHATSAPP_TEMPLATE_NAME || ''
const whatsappTemplateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'ro'

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

function buildReminderText(reminderType: ReminderType, appointment: AppointmentRow) {
  const startDate = new Date(appointment.start_time)
  const niceDate = format(startDate, "EEEE, d MMMM, HH:mm", { locale: ro })
  const intro =
    reminderType === '24h'
      ? 'Reminder pentru programarea de maine'
      : 'Reminder pentru programarea care urmeaza in aproximativ 2 ore'

  return `${intro} la RoneLashes.\n\n${appointment.client_name || 'Clienta'} - ${niceDate}\n\nDaca ai nevoie sa modifici ora, te rugam sa ne anunti din timp.`
}

function detectReminderType(startTimeIso: string, nowMs: number): ReminderType | null {
  const startMs = new Date(startTimeIso).getTime()
  const diffMinutes = (startMs - nowMs) / 60000

  if (diffMinutes >= 23 * 60 && diffMinutes <= 25 * 60) return '24h'
  if (diffMinutes >= 90 && diffMinutes <= 150) return '2h'
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
    const upperBound = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString()

    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('id, client_name, client_phone, start_time')
      .eq('status', 'confirmed')
      .gt('start_time', now.toISOString())
      .lte('start_time', upperBound)
      .neq('client_phone', '-')

    if (appointmentsError) {
      return NextResponse.json({ error: 'Could not load appointments.' }, { status: 500 })
    }

    const candidates = (appointments || [])
      .map((appointment) => {
        const reminderType = detectReminderType(appointment.start_time, now.getTime())
        return reminderType ? { ...appointment, reminderType } : null
      })
      .filter((x): x is AppointmentRow & { reminderType: ReminderType } => Boolean(x))

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
        const messageId = await sendWhatsAppText(
          normalizedPhone,
          buildReminderText(appointment.reminderType, appointment),
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

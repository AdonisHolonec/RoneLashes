import { createClient } from '@supabase/supabase-js'

type AuthAuditEvent = {
  area: 'client' | 'admin'
  action: 'login' | 'register' | 'logout' | 'session'
  outcome: 'success' | 'failure' | 'blocked'
  phone?: string
  ip?: string
  reason?: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

async function persistAuthAuditEvent(event: AuthAuditEvent, safePhone: string) {
  if (!supabaseUrl || !supabaseAnonKey) return

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  await supabase.from('auth_events').insert({
    area: event.area,
    action: event.action,
    outcome: event.outcome,
    phone_masked: safePhone,
    ip_address: event.ip || null,
    reason: event.reason || null,
    created_at: new Date().toISOString(),
  })
}

export function logAuthAuditEvent(event: AuthAuditEvent) {
  const safePhone = event.phone ? `${event.phone.slice(0, 3)}***${event.phone.slice(-2)}` : 'n/a'
  const message = [
    `[auth-audit]`,
    `area=${event.area}`,
    `action=${event.action}`,
    `outcome=${event.outcome}`,
    `phone=${safePhone}`,
    `ip=${event.ip || 'n/a'}`,
    event.reason ? `reason=${event.reason}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (event.outcome === 'failure' || event.outcome === 'blocked') {
    console.warn(message)
  } else {
    console.info(message)
  }

  // Best effort persistence: if table/policies are missing, logging still works in console.
  void persistAuthAuditEvent(event, safePhone).catch((err) => {
    console.warn('[auth-audit] persistent-write-failed', err)
  })
}

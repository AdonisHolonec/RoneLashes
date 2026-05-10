import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

type AuthAuditEvent = {
  area: 'client' | 'admin'
  action: 'login' | 'register' | 'logout' | 'session'
  outcome: 'success' | 'failure' | 'blocked'
  phone?: string
  ip?: string
  reason?: string
  /** Successful client login/register only — persisted for admin nominal log. */
  clientId?: string
  fullName?: string
}

async function persistAuthAuditEvent(event: AuthAuditEvent, safePhone: string): Promise<void> {
  const supabase = getServiceRoleSupabase()
  const nominate =
    event.area === 'client' &&
    event.outcome === 'success' &&
    (event.action === 'login' || event.action === 'register') &&
    event.clientId &&
    event.phone

  await supabase.from('auth_events').insert({
    area: event.area,
    action: event.action,
    outcome: event.outcome,
    phone_masked: safePhone,
    ip_address: event.ip || null,
    reason: event.reason || null,
    client_id: nominate ? event.clientId : null,
    client_full_name: nominate ? (event.fullName || null) : null,
    client_phone: nominate ? event.phone : null,
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

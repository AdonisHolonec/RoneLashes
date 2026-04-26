import { createClient } from '@supabase/supabase-js'

type AnalyticsEvent = {
  eventName: string
  category: string
  clientId?: string | null
  metadata?: Record<string, unknown>
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function trackAnalyticsEvent(event: AnalyticsEvent) {
  if (!supabaseUrl || !serviceRoleKey) return

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  await supabase.from('analytics_events').insert({
    event_name: event.eventName,
    event_category: event.category,
    client_id: event.clientId || null,
    metadata: event.metadata || {},
  })
}

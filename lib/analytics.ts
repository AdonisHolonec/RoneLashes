import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

type AnalyticsEvent = {
  eventName: string
  category: string
  clientId?: string | null
  metadata?: Record<string, unknown>
}

export async function trackAnalyticsEvent(event: AnalyticsEvent) {
  try {
    const supabase = getServiceRoleSupabase()

    await supabase.from('analytics_events').insert({
      event_name: event.eventName,
      event_category: event.category,
      client_id: event.clientId || null,
      metadata: event.metadata || {},
    })
  } catch {
    return
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getClientAuthCookieName, verifyClientSessionToken } from '@/lib/client-auth'
import { DEFAULT_CATEGORY_ORDER, DEFAULT_SUBCATEGORY_ORDER } from '@/lib/service-order'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceRoleSupabase()
    const todayString = new Date().toISOString().split('T')[0]
    const nowIso = new Date().toISOString()
    const session = verifyClientSessionToken(request.cookies.get(getClientAuthCookieName())?.value || '')

    const [
      servicesRes,
      bookedRes,
      photosRes,
      ratingsRes,
      scheduleRes,
      closuresRes,
      reviewsRes,
      orderRes,
      myRatingsRes,
    ] = await Promise.all([
      supabase.from('services').select('*'),
      supabase
        .from('appointments')
        .select('id, start_time, end_time, status')
        .gte('end_time', nowIso),
      supabase.from('portfolio').select('*').order('created_at', { ascending: false }),
      supabase.from('portfolio_ratings').select('id, photo_id, rating'),
      supabase.from('working_hours').select('*'),
      supabase.from('salon_closures').select('*').gte('end_date', todayString),
      supabase
        .from('appointments')
        .select('id, start_time, rating, review_text, client_name, notes')
        .gte('rating', 4)
        .not('review_text', 'is', null)
        .order('start_time', { ascending: false })
        .limit(24),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'service_order_config')
        .maybeSingle(),
      session?.id
        ? supabase
            .from('portfolio_ratings')
            .select('photo_id, rating')
            .eq('client_id', session.id)
        : Promise.resolve({ data: [] as Array<{ photo_id: string; rating: number }> }),
    ])

    return NextResponse.json({
      services: servicesRes.data || [],
      bookedAppointments: bookedRes.data || [],
      photos: photosRes.data || [],
      portfolioRatings: ratingsRes.data || [],
      myPortfolioRatings: myRatingsRes.data || [],
      schedule: scheduleRes.data || [],
      closures: closuresRes.data || [],
      publicReviews: reviewsRes.data || [],
      categoryOrder: orderRes.data?.value?.categoryOrder || DEFAULT_CATEGORY_ORDER,
      subcategoryOrder: orderRes.data?.value?.subcategoryOrder || DEFAULT_SUBCATEGORY_ORDER,
    })
  } catch {
    return NextResponse.json({ error: 'Datele publice nu au putut fi încărcate.' }, { status: 500 })
  }
}

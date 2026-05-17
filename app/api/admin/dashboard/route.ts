import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

const PORTFOLIO_PAGE_SIZE = 20
const REVIEWS_PAGE_SIZE = 12

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

async function loadPortfolioPage(supabase: ReturnType<typeof getServiceRoleSupabase>, page: number) {
  const from = page * PORTFOLIO_PAGE_SIZE
  const to = from + PORTFOLIO_PAGE_SIZE - 1
  const { data, error } = await supabase
    .from('portfolio')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw error
  }

  return {
    items: data || [],
    hasMore: (data || []).length === PORTFOLIO_PAGE_SIZE,
    page,
  }
}

async function loadReviewsPage(supabase: ReturnType<typeof getServiceRoleSupabase>, page: number) {
  const from = page * REVIEWS_PAGE_SIZE
  const to = from + REVIEWS_PAGE_SIZE - 1
  const { data, error } = await supabase
    .from('appointments')
    .select('id, client_name, start_time, notes, rating, review_text')
    .gt('rating', 0)
    .order('start_time', { ascending: false })
    .range(from, to)

  if (error) {
    throw error
  }

  return {
    items: data || [],
    hasMore: (data || []).length === REVIEWS_PAGE_SIZE,
    page,
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = request.nextUrl.searchParams.get('mode') || 'dashboard'
  const pageParam = Number(request.nextUrl.searchParams.get('page') || 0)
  const page = Number.isFinite(pageParam) && pageParam >= 0 ? pageParam : 0

  try {
    const supabase = getServiceRoleSupabase()

    if (mode === 'portfolio') {
      return NextResponse.json(await loadPortfolioPage(supabase, page))
    }

    if (mode === 'reviews') {
      return NextResponse.json(await loadReviewsPage(supabase, page))
    }

    const todayString = new Date().toISOString().split('T')[0]
    const [
      appointmentsRes,
      servicesRes,
      ratingsRes,
      scheduleRes,
      waitlistRes,
      closuresRes,
      portfolioPage,
      reviewsPage,
      reviewTokensRes,
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, start_time, end_time, status, client_name, client_phone, notes, total_price, rating, review_text, service_id')
        .order('start_time', { ascending: false }),
      supabase.from('services').select('*').order('category'),
      supabase.from('portfolio_ratings').select('id, photo_id, rating'),
      supabase.from('working_hours').select('*').order('day_of_week', { ascending: true }),
      supabase.from('waitlist').select('*').gte('desired_date', todayString).order('desired_date', { ascending: true }),
      supabase.from('salon_closures').select('*').gte('end_date', todayString).order('start_date', { ascending: true }),
      loadPortfolioPage(supabase, 0),
      loadReviewsPage(supabase, 0),
      supabase.from('review_tokens').select('appointment_id'),
    ])

    const appointmentIdsWithReviewLink = [
      ...new Set(
        (reviewTokensRes.data || [])
          .map((row: { appointment_id?: string | null }) => row.appointment_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ]

    return NextResponse.json({
      appointments: appointmentsRes.data || [],
      services: servicesRes.data || [],
      portfolioRatings: ratingsRes.data || [],
      schedule: scheduleRes.data || [],
      waitlist: waitlistRes.data || [],
      closures: closuresRes.data || [],
      portfolio: portfolioPage,
      reviews: reviewsPage,
      appointmentIdsWithReviewLink,
    })
  } catch {
    return NextResponse.json({ error: 'Dashboard-ul admin nu a putut fi încărcat.' }, { status: 500 })
  }
}

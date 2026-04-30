import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_AUTH_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth'
import { DEFAULT_CATEGORY_ORDER, DEFAULT_SUBCATEGORY_ORDER, parseCsvOrder } from '@/lib/service-order'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

function isAdminAuthenticated(request: NextRequest) {
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''
  return verifyAdminSessionToken(token)
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const supabase = getServiceRoleSupabase()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'service_order_config')
      .maybeSingle()

    return NextResponse.json({
      categoryOrder: data?.value?.categoryOrder || DEFAULT_CATEGORY_ORDER,
      subcategoryOrder: data?.value?.subcategoryOrder || DEFAULT_SUBCATEGORY_ORDER,
    })
  } catch {
    return NextResponse.json({ categoryOrder: DEFAULT_CATEGORY_ORDER, subcategoryOrder: DEFAULT_SUBCATEGORY_ORDER })
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json()
    const categoryOrder = Array.isArray(body?.categoryOrder)
      ? body.categoryOrder.map((x: unknown) => String(x).trim()).filter(Boolean)
      : parseCsvOrder(String(body?.categoryOrder ?? ''))
    const subcategoryOrder = Array.isArray(body?.subcategoryOrder)
      ? body.subcategoryOrder.map((x: unknown) => String(x).trim()).filter(Boolean)
      : parseCsvOrder(String(body?.subcategoryOrder ?? ''))

    const payload = {
      categoryOrder: categoryOrder.length > 0 ? categoryOrder : DEFAULT_CATEGORY_ORDER,
      subcategoryOrder: subcategoryOrder.length > 0 ? subcategoryOrder : DEFAULT_SUBCATEGORY_ORDER,
    }

    const supabase = getServiceRoleSupabase()
    const { error } = await supabase.from('app_settings').upsert(
      { key: 'service_order_config', value: payload, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )
    if (error) return NextResponse.json({ error: 'Nu am putut salva ordinea.' }, { status: 400 })
    return NextResponse.json({ ok: true, ...payload })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

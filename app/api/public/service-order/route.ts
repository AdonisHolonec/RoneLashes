import { NextResponse } from 'next/server'
import { DEFAULT_CATEGORY_ORDER, DEFAULT_SUBCATEGORY_ORDER } from '@/lib/service-order'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

export async function GET() {
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
    return NextResponse.json({
      categoryOrder: DEFAULT_CATEGORY_ORDER,
      subcategoryOrder: DEFAULT_SUBCATEGORY_ORDER,
    })
  }
}

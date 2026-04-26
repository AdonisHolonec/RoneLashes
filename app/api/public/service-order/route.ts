import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_CATEGORY_ORDER, DEFAULT_SUBCATEGORY_ORDER } from '@/lib/service-order'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getServiceSupabase() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service role config missing.')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET() {
  try {
    const supabase = getServiceSupabase()
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

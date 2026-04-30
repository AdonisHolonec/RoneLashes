import { NextResponse } from 'next/server'
import {
  ADMIN_AUTH_COOKIE,
  buildAdminSessionToken,
  hasAdminAuthConfig,
  isValidAdminPin,
} from '@/lib/admin-auth'
import { checkRateLimit } from '@/lib/sensitive-rate-limit'

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const pin = String(body?.pin ?? '')
    const ip = getClientIp(request)

    if (!hasAdminAuthConfig()) {
      return NextResponse.json(
        { error: 'Admin auth not configured on server.' },
        { status: 500 }
      )
    }

    const limiter = checkRateLimit(`admin-login:${ip}`, 6, 15 * 60 * 1000)
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: 'Prea multe încercări. Încearcă din nou mai târziu.' },
        { status: 429 }
      )
    }

    if (!/^\d{4,8}$/.test(pin) || !isValidAdminPin(pin)) {
      return NextResponse.json({ error: 'PIN invalid.' }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set({
      name: ADMIN_AUTH_COOKIE,
      value: buildAdminSessionToken(),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
}

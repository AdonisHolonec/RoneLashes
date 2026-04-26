import { NextResponse } from 'next/server'
import {
  ADMIN_AUTH_COOKIE,
  buildAdminSessionToken,
  hasAdminAuthConfig,
  isValidAdminPin,
} from '@/lib/admin-auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const pin = String(body?.pin ?? '')

    if (!hasAdminAuthConfig()) {
      return NextResponse.json(
        { error: 'Admin auth not configured on server.' },
        { status: 500 }
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

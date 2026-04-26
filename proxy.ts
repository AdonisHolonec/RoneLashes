import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ADMIN_AUTH_COOKIE, ADMIN_SESSION_TTL_MS } from '@/lib/admin-auth-shared'

const encoder = new TextEncoder()

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function verifyToken(token: string, secret: string) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false

  const issuedAt = Number(payload)
  if (!Number.isFinite(issuedAt)) return false
  if (Date.now() - issuedAt > ADMIN_SESSION_TTL_MS) return false

  const expected = await signPayload(payload, secret)
  return expected === signature
}

export async function proxy(request: NextRequest) {
  const secret = process.env.ADMIN_AUTH_SECRET || ''
  const token = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || ''

  if (!secret || !(await verifyToken(token, secret))) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}

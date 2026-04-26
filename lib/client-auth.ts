import { createHmac, timingSafeEqual } from 'crypto'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14
const CLIENT_AUTH_COOKIE = 'rone_client_session'

type ClientSessionPayload = {
  id: string
  phone: string
  fullName: string
  iat: number
}

function getSecret() {
  return process.env.CLIENT_AUTH_SECRET || process.env.ADMIN_AUTH_SECRET || ''
}

function signPayload(payload: string) {
  return createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export function hasClientAuthConfig() {
  return Boolean(getSecret())
}

export function getClientAuthCookieName() {
  return CLIENT_AUTH_COOKIE
}

export function buildClientSessionToken(client: { id: string; phone: string; full_name: string }) {
  const payloadObj: ClientSessionPayload = {
    id: client.id,
    phone: client.phone,
    fullName: client.full_name,
    iat: Date.now(),
  }
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url')
  const signature = signPayload(payload)
  return `${payload}.${signature}`
}

export function verifyClientSessionToken(token: string): ClientSessionPayload | null {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = signPayload(payload)
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ClientSessionPayload
    if (!parsed?.id || !parsed?.phone || !parsed?.fullName || !parsed?.iat) return null
    if (Date.now() - parsed.iat > SESSION_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

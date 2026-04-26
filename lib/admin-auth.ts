import { createHmac, timingSafeEqual } from 'crypto'
import { ADMIN_AUTH_COOKIE, ADMIN_SESSION_TTL_MS } from '@/lib/admin-auth-shared'

export { ADMIN_AUTH_COOKIE }

function getSecret() {
  return process.env.ADMIN_AUTH_SECRET || ''
}

export function hasAdminAuthConfig() {
  return Boolean(process.env.ADMIN_LOGIN_PIN && getSecret())
}

function signPayload(payload: string) {
  const secret = getSecret()
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function buildAdminSessionToken(now = Date.now()) {
  const payload = String(now)
  const signature = signPayload(payload)
  return `${payload}.${signature}`
}

export function isValidAdminPin(pin: string) {
  const expectedPin = process.env.ADMIN_LOGIN_PIN
  if (!expectedPin) return false
  if (pin.length !== expectedPin.length) return false
  return timingSafeEqual(Buffer.from(pin), Buffer.from(expectedPin))
}

export function verifyAdminSessionToken(token: string) {
  if (!token) return false
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false
  const issuedAt = Number(payload)
  if (!Number.isFinite(issuedAt)) return false
  if (Date.now() - issuedAt > ADMIN_SESSION_TTL_MS) return false
  const expectedSignature = signPayload(payload)
  if (signature.length !== expectedSignature.length) return false
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
}

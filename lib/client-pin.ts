import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const HASH_PREFIX = 's1'

function encodeHash(saltHex: string, hashHex: string) {
  return `${HASH_PREFIX}$${saltHex}$${hashHex}`
}

function parseHash(stored: string) {
  const [prefix, saltHex, hashHex] = stored.split('$')
  if (prefix !== HASH_PREFIX || !saltHex || !hashHex) return null
  return { saltHex, hashHex }
}

export function hashClientPin(pin: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(pin, salt, 32).toString('hex')
  return encodeHash(salt, derived)
}

export function verifyClientPin(inputPin: string, storedPin: string) {
  const parsed = parseHash(storedPin)
  if (!parsed) {
    // Legacy fallback for existing accounts where PIN was stored in plain text.
    return { valid: inputPin === storedPin, needsUpgrade: inputPin === storedPin }
  }

  const inputHash = scryptSync(inputPin, parsed.saltHex, 32).toString('hex')
  if (inputHash.length !== parsed.hashHex.length) return { valid: false, needsUpgrade: false }
  const valid = timingSafeEqual(Buffer.from(inputHash), Buffer.from(parsed.hashHex))
  return { valid, needsUpgrade: false }
}

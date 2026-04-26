type LoginGuardEntry = {
  failures: number
  blockedUntil: number
}

const loginGuard = new Map<string, LoginGuardEntry>()

const BASE_BLOCK_MS = 30 * 1000
const MAX_BLOCK_MS = 30 * 60 * 1000

export function checkClientLoginBlock(key: string) {
  const now = Date.now()
  const current = loginGuard.get(key)
  if (!current) return { blocked: false, retryAfterMs: 0 }

  if (current.blockedUntil > now) {
    return { blocked: true, retryAfterMs: current.blockedUntil - now }
  }

  return { blocked: false, retryAfterMs: 0 }
}

export function registerClientLoginFailure(key: string) {
  const now = Date.now()
  const current = loginGuard.get(key) || { failures: 0, blockedUntil: 0 }
  const failures = current.failures + 1
  const level = Math.max(0, failures - 3)
  const blockMs = Math.min(MAX_BLOCK_MS, BASE_BLOCK_MS * Math.pow(2, level))

  loginGuard.set(key, {
    failures,
    blockedUntil: now + blockMs,
  })

  return { failures, blockMs }
}

export function resetClientLoginFailures(key: string) {
  loginGuard.delete(key)
}

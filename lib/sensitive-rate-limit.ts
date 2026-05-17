type AttemptEntry = {
  count: number
  resetAt: number
}

const attempts = new Map<string, AttemptEntry>()

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number) {
  const now = Date.now()
  const current = attempts.get(key)

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (current.count >= maxAttempts) {
    return { allowed: false, remaining: 0, retryAfterMs: current.resetAt - now }
  }

  current.count += 1
  attempts.set(key, current)
  return { allowed: true, remaining: maxAttempts - current.count }
}

/** Clears auth rate limits for a phone (all IPs) after admin unlock or PIN reset. */
export function resetRateLimitsForPhone(phone: string) {
  const normalized = String(phone).trim()
  if (!normalized) return
  const suffix = `:${normalized}`
  for (const key of attempts.keys()) {
    if (key.endsWith(suffix)) {
      attempts.delete(key)
    }
  }
}

export type RevenueStream = 'lashes' | 'makeup'

/** Categorii de servicii incluse în veniturile Lashes */
export const LASHES_SERVICE_CATEGORIES = ['Montare gene', 'Demontare gene', 'Cosmetica'] as const

export type RevenueService = {
  id: string
  name: string
  category: string
  price: number
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const LASHES_CATEGORY_KEYS = new Set(LASHES_SERVICE_CATEGORIES.map(normalizeKey))

export function getRevenueStreamFromCategory(category: string | null | undefined): RevenueStream {
  return LASHES_CATEGORY_KEYS.has(normalizeKey(category || '')) ? 'lashes' : 'makeup'
}

export function parseAppointmentPrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  return parseInt(String(value || '0').replace(/\D/g, ''), 10) || 0
}

export function allocateAppointmentRevenue(
  totalPrice: number,
  serviceId: string | null | undefined,
  notes: string | null | undefined,
  services: RevenueService[],
): { lashes: number; makeup: number } {
  if (totalPrice <= 0) return { lashes: 0, makeup: 0 }

  const byId = new Map(services.map((service) => [service.id, service]))
  const byName = new Map(services.map((service) => [normalizeKey(service.name), service]))

  if (serviceId && byId.has(serviceId)) {
    const stream = getRevenueStreamFromCategory(byId.get(serviceId)!.category)
    return stream === 'lashes' ? { lashes: totalPrice, makeup: 0 } : { lashes: 0, makeup: totalPrice }
  }

  const matched: RevenueService[] = []
  const seen = new Set<string>()
  for (const part of String(notes || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const service = byName.get(normalizeKey(part))
    if (service && !seen.has(service.id)) {
      seen.add(service.id)
      matched.push(service)
    }
  }

  if (matched.length === 0) return { lashes: 0, makeup: totalPrice }

  const matchedTotal = matched.reduce((acc, service) => acc + service.price, 0)
  if (matchedTotal <= 0) {
    const lashesCount = matched.filter((service) => getRevenueStreamFromCategory(service.category) === 'lashes').length
    const lashesShare = lashesCount / matched.length
    const lashes = Math.round(totalPrice * lashesShare)
    return { lashes, makeup: totalPrice - lashes }
  }

  let lashes = 0
  for (const service of matched) {
    const portion = (service.price / matchedTotal) * totalPrice
    if (getRevenueStreamFromCategory(service.category) === 'lashes') lashes += portion
  }
  const lashesRounded = Math.round(lashes)
  return { lashes: lashesRounded, makeup: totalPrice - lashesRounded }
}

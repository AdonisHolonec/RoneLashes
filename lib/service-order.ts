export const DEFAULT_CATEGORY_ORDER = [
  'Volum',
  'Efect',
  'Întreținere',
  'Laminare',
  'Sprâncene',
  'Alte servicii',
]

export const DEFAULT_SUBCATEGORY_ORDER = [
  'Natural',
  'Soft',
  'Medium',
  'Intens',
  'Mega Volum',
  'Fără subcategorie',
]

export function sortByPreferredOrder(items: string[], preferredOrder: string[]) {
  const rank = new Map(preferredOrder.map((value, idx) => [value.toLowerCase(), idx]))
  return [...items].sort((a, b) => {
    const aRank = rank.get(a.toLowerCase())
    const bRank = rank.get(b.toLowerCase())
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank
    if (aRank !== undefined) return -1
    if (bRank !== undefined) return 1
    return a.localeCompare(b)
  })
}

export function parseCsvOrder(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

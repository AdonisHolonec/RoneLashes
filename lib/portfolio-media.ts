const MAX_PORTFOLIO_BYTES = 80 * 1024 * 1024

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/pjpeg',
])

/** Tipuri video frecvente (fără sufixe gen ;codecs=… — folosește normalizeMimeType). */
const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/3gpp',
  'video/3gpp2',
  'video/ogg',
  'video/mpeg',
])

/** Browserele trimit adesea `video/webm;codecs=vp9,opus` — trebuie doar partea principală. */
export function normalizeMimeType(type: string): string {
  return (type || '').toLowerCase().trim().split(';')[0].trim()
}

export function isPortfolioVideoUrl(url: string): boolean {
  let pathname = url
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url.split('?')[0] || url
  }
  const ext = pathname.split('.').pop()?.toLowerCase() || ''
  return VIDEO_EXTENSIONS.has(ext)
}

/** Returnează mesaj de eroare sau null dacă fișierul e acceptat. */
export function validatePortfolioUpload(file: File): string | null {
  if (file.size > MAX_PORTFOLIO_BYTES) {
    return 'Fișierul depășește limita de 80 MB.'
  }

  const baseMime = normalizeMimeType(file.type)
  const ext = (file.name.split('.').pop() || '').toLowerCase()

  if (baseMime.startsWith('image/')) {
    if (IMAGE_MIMES.has(baseMime)) return null
    if (IMAGE_EXTENSIONS.has(ext)) return null
    return 'Format imagine neacceptat (JPEG, PNG, GIF, WebP).'
  }

  if (baseMime.startsWith('video/')) {
    if (VIDEO_MIMES.has(baseMime)) return null
    if (VIDEO_EXTENSIONS.has(ext)) return null
    return 'Format video neacceptat (MP4, WebM, MOV).'
  }

  if (IMAGE_EXTENSIONS.has(ext)) return null
  if (VIDEO_EXTENSIONS.has(ext)) return null

  return 'Tip fișier neacceptat. Folosește imagini (JPEG, PNG, WebP…) sau video (MP4, WebM, MOV).'
}

/** Extensie pentru numele din Storage (evită `.blob` / fără extensie când MIME e corect). */
export function getPortfolioStorageExtension(file: File): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext)) return ext

  const base = normalizeMimeType(file.type)
  const fromMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
    'video/ogg': 'ogv',
    'video/mpeg': 'mpg',
    'video/3gpp': 'mp4',
    'video/3gpp2': 'mp4',
  }
  return fromMime[base] || 'jpg'
}

export function portfolioContentType(file: File): string {
  const raw = (file.type || '').trim()
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const extMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    ogv: 'video/ogg',
  }

  if (raw) {
    const base = normalizeMimeType(raw)
    if (base && base !== 'application/octet-stream') return base
    if (extMap[ext]) return extMap[ext]
    if (base) return base
  }
  return extMap[ext] || 'application/octet-stream'
}

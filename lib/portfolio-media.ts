const MAX_PORTFOLIO_BYTES = 80 * 1024 * 1024

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/pjpeg',
])

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
])

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

  const mime = (file.type || '').toLowerCase().trim()
  const ext = (file.name.split('.').pop() || '').toLowerCase()

  if (mime.startsWith('image/')) {
    if (IMAGE_MIMES.has(mime)) return null
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return null
    return 'Format imagine neacceptat (JPEG, PNG, GIF, WebP).'
  }

  if (mime.startsWith('video/')) {
    if (VIDEO_MIMES.has(mime)) return null
    if (VIDEO_EXTENSIONS.has(ext)) return null
    return 'Format video neacceptat (MP4, WebM, MOV).'
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return null
  if (VIDEO_EXTENSIONS.has(ext)) return null

  return 'Tip fișier neacceptat. Folosește imagini (JPEG, PNG, WebP…) sau video (MP4, WebM, MOV).'
}

export function portfolioContentType(file: File): string {
  const mime = (file.type || '').trim()
  if (mime) return mime
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const map: Record<string, string> = {
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
  return map[ext] || 'application/octet-stream'
}

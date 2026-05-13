'use client'

import Image from 'next/image'
import { isPortfolioVideoUrl } from '@/lib/portfolio-media'

type Props = {
  url: string
  alt: string
  sizes: string
  className?: string
}

export function PortfolioMediaFill({ url, alt, sizes, className = 'object-cover' }: Props) {
  if (isPortfolioVideoUrl(url)) {
    return (
      <video
        src={url}
        aria-label={alt}
        className={`absolute inset-0 h-full w-full ${className}`}
        muted
        playsInline
        controls
        preload="metadata"
      />
    )
  }
  return <Image src={url} alt={alt} fill sizes={sizes} className={className} />
}

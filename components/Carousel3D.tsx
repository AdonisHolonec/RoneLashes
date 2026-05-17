'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type Carousel3DProps<T> = {
  items: T[]
  renderSlide: (item: T, index: number, isActive: boolean) => ReactNode
  getKey: (item: T, index: number) => string
  autoPlayMs?: number
  className?: string
  stageHeight?: string
  slideWidth?: string
  ariaLabel?: string
}

function getWrappedOffset(index: number, activeIndex: number, length: number) {
  if (length <= 1) return 0
  let offset = index - activeIndex
  const half = Math.floor(length / 2)
  if (offset > half) offset -= length
  if (offset < -half) offset += length
  return offset
}

export function Carousel3D<T>({
  items,
  renderSlide,
  getKey,
  autoPlayMs = 4000,
  className = '',
  stageHeight = 'min(420px, 58vh)',
  slideWidth = 'min(280px, 82vw)',
  ariaLabel = 'Carusel',
}: Carousel3DProps<T>) {
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const pausedRef = useRef(false)

  const count = items.length

  const goTo = useCallback(
    (index: number) => {
      if (count === 0) return
      setActiveIndex(((index % count) + count) % count)
    },
    [count],
  )

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo])
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo])

  useEffect(() => {
    if (count <= 1 || !autoPlayMs) return
    const timer = window.setInterval(() => {
      if (!pausedRef.current) goNext()
    }, autoPlayMs)
    return () => window.clearInterval(timer)
  }, [autoPlayMs, count, goNext])

  useEffect(() => {
    if (activeIndex >= count && count > 0) setActiveIndex(0)
  }, [activeIndex, count])

  if (count === 0) return null

  return (
    <div
      className={`relative ${className}`}
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onMouseEnter={() => {
        pausedRef.current = true
      }}
      onMouseLeave={() => {
        pausedRef.current = false
      }}
      onFocus={() => {
        pausedRef.current = true
      }}
      onBlur={() => {
        pausedRef.current = false
      }}
    >
      <div
        className="carousel-3d-viewport relative mx-auto w-full max-w-lg"
        style={{ height: stageHeight, perspective: '1200px' }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return
          const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current
          touchStartX.current = null
          if (Math.abs(delta) < 40) return
          if (delta < 0) goNext()
          else goPrev()
        }}
      >
        <div className="carousel-3d-stage relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
          {items.map((item, index) => {
            const offset = getWrappedOffset(index, activeIndex, count)
            const abs = Math.abs(offset)
            const isActive = offset === 0
            const hidden = abs > 2

            const rotateY = offset * -42
            const translateX = offset * 72
            const translateZ = -abs * 95
            const scale = 1 - abs * 0.14
            const opacity = hidden ? 0 : 1 - abs * 0.22

            return (
              <div
                key={getKey(item, index)}
                role="group"
                aria-roledescription="slide"
                aria-hidden={!isActive}
                aria-label={`Slide ${index + 1} din ${count}`}
                className="carousel-3d-slide absolute left-1/2 top-1/2"
                style={{
                  width: slideWidth,
                  transform: `translate(-50%, -50%) translateX(${translateX}px) rotateY(${rotateY}deg) translateZ(${translateZ}px) scale(${scale})`,
                  opacity,
                  zIndex: 20 - abs,
                  pointerEvents: hidden ? 'none' : 'auto',
                  transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease',
                  backfaceVisibility: 'hidden',
                }}
                onClick={() => {
                  if (!isActive) goTo(index)
                }}
              >
                <div
                  className={`h-full w-full transition-shadow duration-500 ${isActive ? 'carousel-3d-slide-active' : 'cursor-pointer'}`}
                >
                  {renderSlide(item, index, isActive)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="carousel-3d-nav carousel-3d-nav-prev"
            aria-label="Slide anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            className="carousel-3d-nav carousel-3d-nav-next"
            aria-label="Slide următor"
          >
            ›
          </button>
          <div className="flex justify-center gap-2 mt-4" aria-hidden>
            {items.map((item, index) => (
              <button
                key={`dot-${getKey(item, index)}`}
                type="button"
                onClick={() => goTo(index)}
                className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-[#e21a6e]' : 'w-2 bg-black/15 hover:bg-black/30'}`}
                aria-label={`Mergi la slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

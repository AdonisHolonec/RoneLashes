'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const SWIPE_COMMIT_RATIO = 0.28
const SWIPE_VELOCITY_PX = 42

type AuthGlassSliderProps = {
  isRegistering: boolean
  onModeChange: (registering: boolean) => void
  phone: string
  setPhone: (value: string) => void
  pin: string
  setPin: (value: string) => void
  fullName: string
  setFullName: (value: string) => void
  personalDataConsent: boolean
  setPersonalDataConsent: (value: boolean) => void
  loginRequiresPersonalDataConsent: boolean
  authSubmitting: boolean
  onSubmit: () => void
}

function ConsentField({
  isRegistering,
  personalDataConsent,
  setPersonalDataConsent,
}: {
  isRegistering: boolean
  personalDataConsent: boolean
  setPersonalDataConsent: (value: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 text-left auth-glass-consent cursor-pointer">
      <input
        type="checkbox"
        checked={personalDataConsent}
        onChange={(e) => setPersonalDataConsent(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[#e21a6e] shrink-0"
        data-testid="client-personal-data-consent"
      />
      <span className="text-[11px] font-bold leading-relaxed text-black/70">
        Sunt de acord cu prelucrarea datelor personale (nume, telefon, programări și preferințe) pentru
        {isRegistering ? ' crearea contului,' : ' continuarea utilizării contului,'} gestionarea programărilor și
        comunicarea cu salonul RoneLashes.{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-black text-[#e21a6e] underline underline-offset-2"
        >
          Citește politica de confidențialitate
        </a>
        .
      </span>
    </label>
  )
}

function PinVisibilityIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18M10.58 10.58a2 2 0 002.84 2.84M9.88 5.09A9.77 9.77 0 0112 5c5.52 0 10 4.48 10 7s-1.22 2.66-3.16 4.24M6.11 6.11C4.22 7.38 2.78 9.12 2 12c1.73 3.94 6.01 7 10 7 1.55 0 3.03-.35 4.36-.97"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function PinField({
  id,
  value,
  onChange,
  pinVisible,
  onToggleVisible,
  testId,
  toggleTestId,
  autoComplete,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  pinVisible: boolean
  onToggleVisible: () => void
  testId?: string
  toggleTestId?: string
  autoComplete?: string
}) {
  return (
    <div className="auth-pin-field">
      <input
        id={id}
        type={pinVisible ? 'text' : 'password'}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        placeholder="PIN 4 Cifre"
        data-testid={testId}
        autoComplete={autoComplete}
        className="ui-input text-center text-lg font-bold tracking-widest text-black auth-glass-input auth-pin-input"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        className="auth-pin-toggle"
        aria-label={pinVisible ? 'Ascunde PIN-ul' : 'Arată PIN-ul'}
        aria-pressed={pinVisible}
        aria-controls={id}
        data-testid={toggleTestId}
      >
        <PinVisibilityIcon visible={pinVisible} />
      </button>
    </div>
  )
}

export function AuthGlassSlider({
  isRegistering,
  onModeChange,
  phone,
  setPhone,
  pin,
  setPin,
  fullName,
  setFullName,
  personalDataConsent,
  setPersonalDataConsent,
  loginRequiresPersonalDataConsent,
  authSubmitting,
  onSubmit,
}: AuthGlassSliderProps) {
  const [pinVisible, setPinVisible] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [slideOffset, setSlideOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const slideOffsetRef = useRef(0)
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    startOffset: 0,
    startTime: 0,
    axis: null as 'x' | 'y' | null,
  })

  const submitDisabled =
    authSubmitting || ((isRegistering || loginRequiresPersonalDataConsent) && !personalDataConsent)

  const slideProgress =
    viewportWidth > 0
      ? Math.min(1, Math.max(0, -slideOffset / viewportWidth))
      : isRegistering
        ? 1
        : 0

  useEffect(() => {
    slideOffsetRef.current = slideOffset
  }, [slideOffset])

  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const measure = () => {
      const width = el.offsetWidth
      setViewportWidth(width)
      if (!isDraggingRef.current) {
        const offset = isRegistering ? -width : 0
        setSlideOffset(offset)
        slideOffsetRef.current = offset
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [isRegistering])

  const snapToMode = useCallback(
    (registering: boolean) => {
      const width = viewportRef.current?.offsetWidth ?? viewportWidth
      const offset = registering ? -width : 0
      setSlideOffset(offset)
      slideOffsetRef.current = offset
      if (registering !== isRegistering) onModeChange(registering)
    },
    [isRegistering, onModeChange, viewportWidth],
  )

  const switchMode = (registering: boolean) => {
    if (registering === isRegistering) return
    snapToMode(registering)
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onTouchStart = (event: TouchEvent) => {
      touchRef.current = {
        startX: event.touches[0]?.clientX ?? 0,
        startY: event.touches[0]?.clientY ?? 0,
        startOffset: slideOffsetRef.current,
        startTime: Date.now(),
        axis: null,
      }
      setIsDragging(true)
    }

    const onTouchMove = (event: TouchEvent) => {
      const touch = touchRef.current
      const clientX = event.touches[0]?.clientX ?? 0
      const clientY = event.touches[0]?.clientY ?? 0
      const dx = clientX - touch.startX
      const dy = clientY - touch.startY

      if (touch.axis === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        touch.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y'
        if (touch.axis === 'y') {
          setIsDragging(false)
          return
        }
      }

      if (touch.axis !== 'x') return

      event.preventDefault()

      const width = el.offsetWidth || 1
      const rubber = 0.22
      let next = touch.startOffset + dx
      if (next > 0) next *= rubber
      if (next < -width) next = -width + (next + width) * rubber
      setSlideOffset(next)
      slideOffsetRef.current = next
    }

    const finishSwipe = (clientX: number) => {
      const touch = touchRef.current
      const width = el.offsetWidth
      setIsDragging(false)

      if (touch.axis !== 'x' || width <= 0) {
        snapToMode(isRegistering)
        return
      }

      const dx = clientX - touch.startX
      const dt = Math.max(Date.now() - touch.startTime, 1)
      const velocity = dx / dt
      const offset = slideOffsetRef.current

      let targetRegister = offset < -width * 0.5
      if (Math.abs(dx) >= SWIPE_VELOCITY_PX || Math.abs(velocity) > 0.35) {
        targetRegister = dx < 0 || velocity < -0.35
      } else if (Math.abs(offset) > width * SWIPE_COMMIT_RATIO) {
        targetRegister = offset < -width * 0.5
      }

      snapToMode(targetRegister)
      touch.axis = null
    }

    const onTouchEnd = (event: TouchEvent) => {
      finishSwipe(event.changedTouches[0]?.clientX ?? touchRef.current.startX)
    }

    const onTouchCancel = () => {
      setIsDragging(false)
      snapToMode(isRegistering)
      touchRef.current.axis = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchCancel)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [isRegistering, snapToMode])

  const trackTransform =
    viewportWidth > 0
      ? `translateX(${slideOffset}px)`
      : isRegistering
        ? 'translateX(-50%)'
        : 'translateX(0)'

  const panelLoginOpacity = 1 - slideProgress * 0.65
  const panelRegisterOpacity = 0.35 + slideProgress * 0.65

  return (
    <div className="auth-glass w-full max-w-sm animate-in zoom-in duration-500">
      <div className="auth-glass-shine" aria-hidden />

      <h2 className="text-2xl font-serif italic font-bold text-center text-black relative z-[1]">
        Portal Cliente
      </h2>
      <p className="text-[10px] font-black uppercase opacity-40 mb-5 tracking-widest text-center text-black relative z-[1]">
        Acces rapid la programări
      </p>

      <div className="auth-glass-segment relative z-[1]" role="tablist" aria-label="Mod autentificare">
        <div className="auth-glass-segment-track">
          <div
            className={`auth-glass-segment-pill${isDragging ? ' is-dragging' : ''}`}
            style={{ transform: `translateX(${slideProgress * 100}%)` }}
            aria-hidden
          />
          <button
            type="button"
            role="tab"
            aria-selected={!isRegistering}
            data-testid="client-auth-tab-login"
            onClick={() => switchMode(false)}
            className={`auth-glass-segment-btn${slideProgress < 0.5 ? ' is-active' : ''}`}
          >
            Autentificare
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={slideProgress >= 0.5}
            data-testid="client-auth-toggle"
            onClick={() => switchMode(true)}
            className={`auth-glass-segment-btn${slideProgress >= 0.5 ? ' is-active' : ''}`}
          >
            Creare cont
          </button>
        </div>
      </div>

      <p className="auth-glass-swipe-hint relative z-[1]" aria-hidden>
        Glisează stânga / dreapta
      </p>

      <div
        ref={viewportRef}
        className={`auth-glass-viewport relative z-[1]${isDragging ? ' is-dragging' : ''}`}
      >
        <div
          className={`auth-glass-track${isDragging ? ' is-dragging' : ''}`}
          style={{ transform: trackTransform }}
        >
          <div
            className="auth-glass-panel"
            role="tabpanel"
            aria-hidden={slideProgress > 0.5}
            style={{ opacity: panelLoginOpacity }}
          >
            <p className="text-[10px] font-black uppercase opacity-35 tracking-widest text-center text-black mb-4">
              Loghează-te în cont
            </p>
            <div className="space-y-4">
              <input
                type="tel"
                placeholder="Număr Telefon"
                data-testid="client-auth-phone"
                className="ui-input text-center text-black auth-glass-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              />
              <PinField
                id="client-auth-pin-login"
                value={pin}
                onChange={setPin}
                pinVisible={pinVisible}
                onToggleVisible={() => setPinVisible((v) => !v)}
                testId="client-auth-pin"
                toggleTestId="client-auth-pin-toggle"
                autoComplete="current-password"
              />
              {loginRequiresPersonalDataConsent && (
                <ConsentField
                  isRegistering={false}
                  personalDataConsent={personalDataConsent}
                  setPersonalDataConsent={setPersonalDataConsent}
                />
              )}
              <button
                type="button"
                data-testid="client-auth-submit"
                disabled={submitDisabled}
                onClick={onSubmit}
                className="ui-btn ui-btn-primary w-full py-5 text-xs tracking-widest active:scale-95 disabled:opacity-50"
              >
                {authSubmitting ? 'Se procesează...' : 'Intră în Cont'}
              </button>
              <a
                href={`https://wa.me/40743584475?text=Buna,%20Ronela!%20Am%20uitat%20PIN-ul%20pentru%20contul%20RoneLashes.`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[10px] font-black uppercase opacity-40 border-b border-black/20 pb-1 text-black mx-auto w-fit"
              >
                Am uitat codul PIN
              </a>
            </div>
          </div>

          <div
            className="auth-glass-panel"
            role="tabpanel"
            aria-hidden={slideProgress <= 0.5}
            style={{ opacity: panelRegisterOpacity }}
          >
            <p className="text-[10px] font-black uppercase opacity-35 tracking-widest text-center text-black mb-4">
              Creează un cont nou
            </p>
            <div className="space-y-4">
              <input
                placeholder="Numele tău complet"
                data-testid="client-auth-name"
                className="ui-input text-center text-black auth-glass-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                type="tel"
                placeholder="Număr Telefon"
                className="ui-input text-center text-black auth-glass-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                autoComplete="tel"
              />
              <PinField
                id="client-auth-pin-register"
                value={pin}
                onChange={setPin}
                pinVisible={pinVisible}
                onToggleVisible={() => setPinVisible((v) => !v)}
                toggleTestId="client-auth-pin-toggle-register"
                autoComplete="new-password"
              />
              <ConsentField
                isRegistering
                personalDataConsent={personalDataConsent}
                setPersonalDataConsent={setPersonalDataConsent}
              />
              <button
                type="button"
                data-testid="client-auth-submit-register"
                disabled={submitDisabled}
                onClick={onSubmit}
                className="ui-btn ui-btn-primary w-full py-5 text-xs tracking-widest active:scale-95 disabled:opacity-50"
              >
                {authSubmitting ? 'Se procesează...' : 'Creează Cont'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <a
        href="/privacy"
        className="mt-6 block text-center text-[9px] font-black uppercase opacity-35 hover:opacity-80 text-black tracking-widest relative z-[1]"
      >
        Politica de confidențialitate
      </a>
    </div>
  )
}


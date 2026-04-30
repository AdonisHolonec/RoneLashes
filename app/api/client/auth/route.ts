import { NextResponse } from 'next/server'
import {
  buildClientSessionToken,
  getClientAuthCookieName,
  hasClientAuthConfig,
  verifyClientSessionToken,
} from '@/lib/client-auth'
import { checkRateLimit } from '@/lib/sensitive-rate-limit'
import { hashClientPin, verifyClientPin } from '@/lib/client-pin'
import {
  checkClientLoginBlock,
  registerClientLoginFailure,
  resetClientLoginFailures,
} from '@/lib/client-login-guard'
import { logAuthAuditEvent } from '@/lib/auth-audit'
import { trackAnalyticsEvent } from '@/lib/analytics'
import { getServiceRoleSupabase } from '@/lib/service-role-supabase'

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: getClientAuthCookieName(),
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  })
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: getClientAuthCookieName(),
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function GET(request: Request) {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${getClientAuthCookieName()}=`))
    ?.split('=')[1]

  const session = token ? verifyClientSessionToken(token) : null
  if (!session) return NextResponse.json({ client: null })

  return NextResponse.json({
    client: {
      id: session.id,
      phone: session.phone,
      full_name: session.fullName,
    },
  })
}

export async function POST(request: Request) {
  if (!hasClientAuthConfig()) {
    return NextResponse.json({ error: 'Client auth not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const action = String(body?.action ?? '')
    const phone = String(body?.phone ?? '').replace(/\D/g, '')
    const pin = String(body?.pin ?? '').replace(/\D/g, '')
    const fullName = String(body?.fullName ?? '').trim()

    if (action === 'logout') {
      const response = NextResponse.json({ ok: true })
      clearSessionCookie(response)
      logAuthAuditEvent({ area: 'client', action: 'logout', outcome: 'success' })
      void trackAnalyticsEvent({
        eventName: 'client_logout',
        category: 'auth',
        metadata: { source: 'portal' },
      }).catch(() => null)
      return response
    }

    if (!/^\d{10,15}$/.test(phone) || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'Date de autentificare invalide.' }, { status: 400 })
    }

    const ip = getClientIp(request)
    const limiter = checkRateLimit(`client-auth:${ip}:${phone}`, 8, 15 * 60 * 1000)
    if (!limiter.allowed) {
      logAuthAuditEvent({
        area: 'client',
        action: action === 'register' ? 'register' : 'login',
        outcome: 'blocked',
        phone,
        ip,
        reason: 'rate-limit-window',
      })
      return NextResponse.json(
        { error: 'Prea multe încercări. Încearcă din nou mai târziu.' },
        { status: 429 }
      )
    }

    const supabase = getServiceRoleSupabase()

    if (action === 'register') {
      if (fullName.length < 3) {
        logAuthAuditEvent({
          area: 'client',
          action: 'register',
          outcome: 'failure',
          phone,
          ip,
          reason: 'invalid-name',
        })
        return NextResponse.json({ error: 'Numele trebuie să aibă minim 3 caractere.' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('clients')
        .insert({ phone, full_name: fullName, pin: hashClientPin(pin) })
        .select('id, phone, full_name')
        .single()
      if (error || !data) {
        logAuthAuditEvent({
          area: 'client',
          action: 'register',
          outcome: 'failure',
          phone,
          ip,
          reason: 'supabase-insert-failed',
        })
        return NextResponse.json(
          { error: 'Contul nu a putut fi creat. Verifică datele introduse.' },
          { status: 400 }
        )
      }
      const response = NextResponse.json({ ok: true, client: data })
      setSessionCookie(response, buildClientSessionToken(data))
      logAuthAuditEvent({ area: 'client', action: 'register', outcome: 'success', phone, ip })
      void trackAnalyticsEvent({
        eventName: 'client_register_success',
        category: 'auth',
        clientId: data.id,
        metadata: { phonePrefix: phone.slice(0, 3) },
      }).catch(() => null)
      return response
    }

    if (action === 'login') {
      const lockKey = `client-login:${phone}`
      const block = checkClientLoginBlock(lockKey)
      if (block.blocked) {
        logAuthAuditEvent({
          area: 'client',
          action: 'login',
          outcome: 'blocked',
          phone,
          ip,
          reason: 'progressive-lockout',
        })
        return NextResponse.json(
          { error: 'Cont blocat temporar după încercări repetate. Încearcă din nou.' },
          { status: 429 }
        )
      }

      const { data, error } = await supabase
        .from('clients')
        .select('id, phone, full_name, pin')
        .eq('phone', phone)
        .single()

      if (error || !data) {
        registerClientLoginFailure(lockKey)
        logAuthAuditEvent({
          area: 'client',
          action: 'login',
          outcome: 'failure',
          phone,
          ip,
          reason: 'unknown-phone',
        })
        return NextResponse.json({ error: 'Telefon sau PIN incorect.' }, { status: 401 })
      }

      const pinCheck = verifyClientPin(pin, String(data.pin || ''))
      if (!pinCheck.valid) {
        registerClientLoginFailure(lockKey)
        logAuthAuditEvent({
          area: 'client',
          action: 'login',
          outcome: 'failure',
          phone,
          ip,
          reason: 'invalid-pin',
        })
        return NextResponse.json({ error: 'Telefon sau PIN incorect.' }, { status: 401 })
      }

      resetClientLoginFailures(lockKey)

      if (pinCheck.needsUpgrade) {
        await supabase.from('clients').update({ pin: hashClientPin(pin) }).eq('id', data.id)
      }

      const client = {
        id: data.id,
        phone: data.phone,
        full_name: data.full_name,
      }

      const response = NextResponse.json({ ok: true, client })
      setSessionCookie(response, buildClientSessionToken(client))
      logAuthAuditEvent({ area: 'client', action: 'login', outcome: 'success', phone, ip })
      void trackAnalyticsEvent({
        eventName: 'client_login_success',
        category: 'auth',
        clientId: client.id,
        metadata: { phonePrefix: phone.slice(0, 3) },
      }).catch(() => null)
      return response
    }

    return NextResponse.json({ error: 'Action invalid.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Cerere invalidă.' }, { status: 400 })
  }
}

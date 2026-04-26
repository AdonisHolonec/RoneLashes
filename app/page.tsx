'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { DayPicker } from 'react-day-picker'
import { ro } from 'date-fns/locale'
import { format, addMinutes, isBefore, isAfter, parseISO, isSameDay, startOfToday } from 'date-fns'
import emailjs from '@emailjs/browser'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import 'react-day-picker/dist/style.css'

const CATEGORY_ORDER = [
  'Volum',
  'Efect',
  'Întreținere',
  'Laminare',
  'Sprâncene',
  'Alte servicii',
]

const SUBCATEGORY_ORDER = [
  'Natural',
  'Soft',
  'Medium',
  'Intens',
  'Mega Volum',
  'Fără subcategorie',
]

function sortByPreferredOrder(items: string[], preferredOrder: string[]) {
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

export default function Home() {
  const emailServiceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || ''
  const emailTemplateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || ''
  const emailPublicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || ''

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<any>(null)
  
  const [view, setView] = useState<'auth' | 'dashboard' | 'booking' | 'success' | 'cancel' | 'cancel_success'>('auth')
  
  const [showAftercare, setShowAftercare] = useState(false)

  // --- REFS PENTRU AUTO-SCROLL ---
  const reviewsRef = useRef<HTMLDivElement>(null)
  const portfolioRef = useRef<HTMLDivElement>(null)
  
  // State-uri pentru Recenzii (Review)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewApp, setReviewApp] = useState<any>(null)
  const [starRating, setStarRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [portfolioRatings, setPortfolioRatings] = useState<any[]>([])

  // Auth States
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [fullName, setFullName] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)

  // Booking States
  const [services, setServices] = useState<any[]>([])
  const [appointments, setAppointments] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [schedule, setSchedule] = useState<any[]>([])
  const [closures, setClosures] = useState<any[]>([])
  
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [selectedServices, setSelectedServices] = useState<any[]>([])
  const [step, setStep] = useState(1)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  
  // Modification & Cancel States
  const [modifyingId, setModifyingId] = useState<string | null>(null)
  const [cancelingApp, setCancelingApp] = useState<any>(null)
  const [cancelReason, setCancelReason] = useState('')

  // Waitlist States
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false)
  const [waitlistJoinedDate, setWaitlistJoinedDate] = useState<string | null>(null)

  // Dashboard States
  const [myAppointments, setMyAppointments] = useState<any[]>([])
  const [authSubmitting, setAuthSubmitting] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const init = async () => {
      fetchGlobalData()
      try {
        const response = await fetch('/api/client/auth', { method: 'GET' })
        if (!response.ok) return
        const payload = await response.json()
        if (payload?.client?.id) {
          setClient(payload.client)
          setView('dashboard')
          fetchClientAppointments(payload.client.id)
        }
      } catch {
        // fallback: rămânem pe ecranul de auth dacă sesiunea nu poate fi citită
      }
    }
    init()
  }, [])

  // --- LOGICA PENTRU RULARE AUTOMATĂ ---
  useEffect(() => {
    // Scroll automat Recenzii (Prima Pagina)
    const reviewsInterval = setInterval(() => {
      if (reviewsRef.current && view === 'auth') {
        const { scrollLeft, offsetWidth, scrollWidth } = reviewsRef.current
        if (scrollLeft + offsetWidth >= scrollWidth - 10) {
          reviewsRef.current.scrollTo({ left: 0, behavior: 'smooth' })
        } else {
          reviewsRef.current.scrollBy({ left: 280, behavior: 'smooth' })
        }
      }
    }, 3500)

    // Scroll automat Portofoliu (Dashboard)
    const portfolioInterval = setInterval(() => {
      if (portfolioRef.current && view === 'dashboard') {
        const { scrollLeft, offsetWidth, scrollWidth } = portfolioRef.current
        if (scrollLeft + offsetWidth >= scrollWidth - 10) {
          portfolioRef.current.scrollTo({ left: 0, behavior: 'smooth' })
        } else {
          portfolioRef.current.scrollBy({ left: 180, behavior: 'smooth' })
        }
      }
    }, 3000)

    return () => {
      clearInterval(reviewsInterval)
      clearInterval(portfolioInterval)
    }
  }, [view])

  async function fetchGlobalData() {
    try {
      const todayString = new Date().toISOString().split('T')[0]
      const [sRes, aRes, pRes, prRes, schedRes, cRes] = await Promise.all([
        supabase.from('services').select('*'),
        supabase
          .from('appointments')
          .select('id, start_time, end_time, status, notes, total_price, rating, review_text, client_name, services(*)'),
        supabase.from('portfolio').select('*').order('created_at', { ascending: false }),
        supabase.from('portfolio_ratings').select('id, photo_id, client_id, rating'),
        supabase.from('working_hours').select('*'),
        supabase.from('salon_closures').select('*').gte('end_date', todayString),
      ])

      if (sRes.data) setServices(sRes.data)
      if (aRes.data) setAppointments(aRes.data)
      if (pRes.data) setPhotos(pRes.data)
      if (prRes.data) setPortfolioRatings(prRes.data)
      if (schedRes.data) setSchedule(schedRes.data)
      if (cRes.data) setClosures(cRes.data)
    } finally {
      setLoading(false)
    }
  }

  async function fetchClientAppointments(clientId: string) {
    if (!clientId) return;
    const { data } = await supabase
      .from('appointments')
      .select('*, services(*)')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false })
    if (data) setMyAppointments(data)
  }

  // --- LOGICA AUTH ---
  const handleAuth = async () => {
    if (phone.length < 10 || pin.length < 4) return window.alert("Te rugăm să completezi datele corect!")

    setAuthSubmitting(true)
    try {
      const response = await fetch('/api/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isRegistering ? 'register' : 'login',
          phone,
          pin,
          fullName,
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload?.client) {
        return window.alert(payload?.error || 'Autentificare eșuată.')
      }
      loginClient(payload.client)
    } catch {
      window.alert('Nu am putut procesa autentificarea. Încearcă din nou.')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const loginClient = (clientData: any) => {
    setClient(clientData)
    setView('dashboard')
    fetchClientAppointments(clientData.id)
  }

  const handleLogout = async () => {
    await fetch('/api/client/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    }).catch(() => null)
    setClient(null)
    setView('auth')
  }

  // --- LOGICA BOOKING ---
  const categories = useMemo(
    () => sortByPreferredOrder(Array.from(new Set(services.map((s) => s.category || 'Alte servicii'))), CATEGORY_ORDER),
    [services]
  )
  const servicesByCategory = useMemo(
    () =>
      categories.reduce((acc, cat) => {
        const categoryServices = services.filter((s) => (s.category || 'Alte servicii') === cat)
        const grouped = categoryServices.reduce(
          (groups, service) => {
            const subKey = String(service.subcategory || '').trim() || 'Fără subcategorie'
            if (!groups[subKey]) groups[subKey] = []
            groups[subKey].push(service)
            return groups
          },
          {} as Record<string, any[]>
        )
        const sortedSubcategories = sortByPreferredOrder(Object.keys(grouped), SUBCATEGORY_ORDER)
        acc[cat] = sortedSubcategories.reduce((subAcc, key) => {
          subAcc[key] = grouped[key]
          return subAcc
        }, {} as Record<string, any[]>)
        return acc
      }, {} as Record<string, Record<string, any[]>>),
    [categories, services]
  )
  const totalDuration = selectedServices.reduce((acc, s) => acc + s.duration_minutes, 0)
  const totalPrice = selectedServices.reduce((acc, s) => acc + (parseInt(String(s.price || '0').replace(/\D/g, '')) || 0), 0)

  const toggleService = (service: any) => {
    if (selectedServices.find(s => s.id === service.id)) {
      setSelectedServices(selectedServices.filter(s => s.id !== service.id))
    } else {
      setSelectedServices([...selectedServices, service])
    }
  }

  // Verifică dacă o anumită dată este în concediu
  const isDateInClosure = (dateToCheck: Date) => {
    return closures.some(closure => {
      const start = parseISO(closure.start_date);
      const end = parseISO(closure.end_date);
      // setăm orele la 00:00 și 23:59 pentru a acoperi zilele întregi
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      return (isAfter(dateToCheck, start) || isSameDay(dateToCheck, start)) && 
             (isBefore(dateToCheck, end) || isSameDay(dateToCheck, end));
    });
  }

  // --- ORE DINAMICE ---
  const getAvailableTimes = (date: Date, duration: number) => {
    // Dacă ziua aleasă este în concediu, nu returnăm nicio oră
    if (isDateInClosure(date)) return [];

    const now = new Date()
    const isToday = isSameDay(date, now)
    const day = date.getDay()
    
    const daySchedule = schedule.find(s => s.day_of_week === day)
    
    if (!daySchedule || daySchedule.is_day_off) return []
    
    const [openH, openM] = daySchedule.open_time.split(':')
    const [closeH, closeM] = daySchedule.close_time.split(':')
    
    const start = parseInt(openH) * 60 + parseInt(openM)
    const end = parseInt(closeH) * 60 + parseInt(closeM)
    
    const slots = []
    const bookedRanges = appointments
      .filter((app) => {
        if (app.status === 'rejected' || app.status === 'canceled') return false
        if (modifyingId && app.id === modifyingId) return false
        return isSameDay(parseISO(app.start_time), date)
      })
      .map((app) => ({
        startMs: parseISO(app.start_time).getTime(),
        endMs: parseISO(app.end_time).getTime(),
      }))
    
    for (let curr = start; curr <= end - duration; curr += 30) {
      const h = Math.floor(curr / 60).toString().padStart(2, '0')
      const m = (curr % 60).toString().padStart(2, '0')
      const sStart = new Date(date); sStart.setHours(parseInt(h), parseInt(m), 0, 0)
      const sEnd = addMinutes(sStart, duration)
      const sStartMs = sStart.getTime()
      const sEndMs = sEnd.getTime()
      
      if (isToday && sStart.getTime() < now.getTime()) {
        continue;
      }

      const isOcc = bookedRanges.some((range) => sStartMs < range.endMs && sEndMs > range.startMs)
      
      if (!isOcc) slots.push(`${h}:${m}`)
    }
    return slots
  }

  // Zilele din săptămână care sunt închise din setări
  const disabledDaysOfWeek = schedule.filter(s => s.is_day_off).map(s => s.day_of_week);

  const handleBooking = async () => {
    if (!selectedTime || !selectedDate) {
      window.alert('Alege data și ora înainte de confirmare.')
      return
    }
    const [h, m] = selectedTime!.split(':')
    const start = new Date(selectedDate!); start.setHours(parseInt(h), parseInt(m), 0, 0)
    const end = addMinutes(start, totalDuration)
    const serviceNames = selectedServices.map(s => s.name).join(', ')

    let bookingResponse: Response
    if (modifyingId) {
      bookingResponse = await fetch('/api/client/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          appointmentId: modifyingId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          notes: serviceNames,
          totalPrice,
        }),
      })
    } else {
      bookingResponse = await fetch('/api/client/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          notes: serviceNames,
          totalPrice,
        }),
      })
    }

    if (bookingResponse.ok) {
      if (emailServiceId && emailTemplateId && emailPublicKey) {
        emailjs.send(
          emailServiceId,
          emailTemplateId,
          {
            client_name: client.full_name,
            service_name: serviceNames,
            date: `${format(selectedDate!, 'dd MMMM', { locale: ro })} la ora ${selectedTime}`,
          },
          emailPublicKey
        )
      }
      
      setView('success')
      fetchGlobalData()
      if (client?.id) fetchClientAppointments(client.id)
    } else {
      window.alert("A apărut o eroare la salvare.")
    }
  }

  const handleJoinWaitlist = async () => {
    if (!client || !selectedDate) return;
    setIsJoiningWaitlist(true);
    const formattedDate = format(selectedDate, 'yyyy-MM-dd');

    const response = await fetch('/api/client/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'join_waitlist',
        desiredDate: formattedDate,
      }),
    })

    setIsJoiningWaitlist(false);
    if (response.ok) {
      setWaitlistJoinedDate(formattedDate);
    } else {
      alert('A apărut o eroare la adăugarea pe lista de așteptare. Te rog încearcă din nou.');
    }
  }

  const handleModify = (app: any) => {
    setModifyingId(app.id)
    const prevNames = app.notes ? app.notes.split(', ') : []
    const prevServices = services.filter(s => prevNames.includes(s.name))
    
    if (prevServices.length > 0) setSelectedServices(prevServices)
    else setSelectedServices([app.services])

    setSelectedDate(parseISO(app.start_time))
    setSelectedTime(format(parseISO(app.start_time), 'HH:mm'))
    
    setView('booking')
    setStep(1)
  }

  const startCancelProcess = (app: any) => {
    setCancelingApp(app)
    setCancelReason('')
    setView('cancel')
  }

  const confirmCancel = async () => {
    try {
      if (!cancelReason || cancelReason.trim().length < 3) {
        return window.alert("Te rugăm să introduci un motiv valid pentru anulare.")
      }
      const response = await fetch('/api/client/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          appointmentId: cancelingApp.id,
        }),
      })
      if (!response.ok) throw new Error('Cancel failed')
      
      if (client?.id) fetchClientAppointments(client.id)
      fetchGlobalData()
      setView('cancel_success')
    } catch (err) {
      console.error(err);
      window.alert("A apărut o eroare. Te rugăm să încerci din nou.");
    }
  }

  const submitReview = async () => {
    if (!reviewApp) return;
    const response = await fetch('/api/client/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_review',
        appointmentId: reviewApp.id,
        rating: starRating,
        reviewText,
      }),
    })
    
    if (response.ok) {
      setReviewModalOpen(false); 
      setReviewApp(null); 
      setReviewText(''); 
      setStarRating(5);
      fetchClientAppointments(client.id);
    }
  }

  const ratePhoto = async (photoId: string, rating: number) => {
    if (!client) return;
    const response = await fetch('/api/client/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'rate_photo',
        photoId,
        rating,
      }),
    })
    if (response.ok) fetchGlobalData();
  }

  const reviewedAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.rating >= 4 && a.review_text)
        .sort((a, b) => b.start_time.localeCompare(a.start_time))
        .slice(0, 8),
    [appointments]
  )

  const futureAppointments = useMemo(
    () => myAppointments.filter((a) => isAfter(parseISO(a.start_time), new Date())),
    [myAppointments]
  )

  const pastAppointments = useMemo(
    () => myAppointments.filter((a) => isBefore(parseISO(a.start_time), new Date())),
    [myAppointments]
  )

  const safeFormatDate = (dateString: string | undefined | null, fmt: string) => {
    if (!dateString) return '';
    try { 
      return format(parseISO(dateString), fmt, { locale: ro }); 
    } catch { 
      return ''; 
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black opacity-20 uppercase tracking-widest text-black bg-[#fafafa]">RoneLashes...</div>

  return (
    <div className="min-h-screen bg-[#fafafa] text-black font-sans pb-10 relative overflow-x-hidden">
      
      {/* 1. ECRAN LOGIN / REGISTER & PRIMA PAGINĂ */}
      {view === 'auth' && (
        <div className="min-h-screen flex flex-col items-center justify-between py-12 px-6 text-center bg-gradient-to-br from-[#fce4ec] to-[#f8bbd0]">
          <div className="w-full flex flex-col items-center animate-in fade-in">
            <p className="text-[11px] font-black tracking-[0.4em] uppercase opacity-70 mb-4 text-black">Lash & Make-up Artist</p>
            <Image
              src="/icon-512x512.png"
              alt="Logo"
              width={128}
              height={128}
              className="w-32 h-32 mx-auto mb-4 drop-shadow-xl"
              priority
            />
            <h1 className="text-4xl font-serif italic mb-2 font-bold text-black">Holonec Ronela</h1>
            <div className="h-1 w-20 bg-[#e21a6e] mx-auto mb-4 rounded-full"></div>
            
            <div className="flex flex-col items-center gap-1 mb-8">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 text-black">📍 Locație</p>
                <a 
                  href="https://www.google.com/maps/search/?api=1&query=Strada+Scoalei+33A,+Arad" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm font-bold italic font-serif text-black mb-2 hover:text-[#e21a6e] transition-colors flex items-center gap-1.5"
                >
                  Arad, Str. Scoalei Nr. 33 A <span className="bg-white/50 text-[9px] not-italic px-2 py-0.5 rounded-full shadow-sm font-black uppercase tracking-widest border border-white">🗺️ Hartă</span>
                </a>
                
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 text-black mt-2">📞 Telefon</p>
                <a href="tel:+40743584475" className="text-sm font-bold italic font-serif text-black hover:text-[#e21a6e] transition-colors">0743 584 475</a>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[3rem] shadow-2xl w-full max-w-sm border border-white/20 animate-in zoom-in">
            <h2 className="text-2xl font-serif italic font-bold mb-2 text-black">Portal Cliente</h2>
            <p className="text-[10px] font-black uppercase opacity-40 mb-6 tracking-widest text-black">
              {isRegistering ? 'Creează un cont nou' : 'Loghează-te în cont'}
            </p>
            
            <div className="space-y-4">
              {isRegistering && (
                <input 
                  placeholder="Numele tău complet" 
                  className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-center text-black" 
                  value={fullName} 
                  onChange={e => setFullName(e.target.value)} 
                />
              )}
              <input 
                type="tel" 
                placeholder="Număr Telefon" 
                className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-center text-black" 
                value={phone} 
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} 
              />
              <input 
                type="password" 
                maxLength={4} 
                placeholder="PIN 4 Cifre" 
                className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-center text-2xl tracking-[1em] text-black" 
                value={pin} 
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))} 
              />
              
              <button disabled={authSubmitting} onClick={handleAuth} className="w-full py-5 bg-black text-white font-black rounded-3xl shadow-xl uppercase text-xs tracking-widest active:scale-95 transition-all disabled:opacity-50">
                {authSubmitting ? 'Se procesează...' : isRegistering ? 'Creează Cont' : 'Intră în Cont'}
              </button>
              
              <button onClick={() => setIsRegistering(!isRegistering)} className="text-[10px] font-black uppercase opacity-40 tracking-widest mt-4 text-black">
                {isRegistering ? 'Ai deja cont? Loghează-te' : 'Clientă nouă? Înregistrează-te'}
              </button>
            </div>
            {!isRegistering && (
              <a href={`https://wa.me/40743584475?text=Buna,%20Ronela!%20Am%20uitat%20PIN-ul%20pentru%20contul%20RoneLashes.`} target="_blank" rel="noopener noreferrer" className="mt-8 inline-block text-[10px] font-black uppercase opacity-40 border-b border-black/20 pb-1 text-black">
                Am uitat codul PIN
              </a>
            )}
          </div>

          {/* SECȚIUNE CARUSEL RECENZII CU AUTO-SCROLL */}
          {reviewedAppointments.length > 0 && (
            <div className="w-full max-w-md mt-14 animate-in fade-in">
              <h3 className="text-2xl font-serif italic font-bold text-black text-center mb-6">Părerile Clientelor ✨</h3>
              
              <div ref={reviewsRef} className="flex gap-4 overflow-x-auto pb-6 snap-x px-6 -mx-6 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {reviewedAppointments.map(rev => (
                  <div key={rev.id} className="min-w-[260px] max-w-[260px] bg-white/90 p-6 rounded-[2rem] shadow-lg border border-white/40 snap-center shrink-0 whitespace-normal text-left">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-black text-sm text-black">{rev.client_name.split(' ')[0]}</p>
                        <p className="text-[9px] font-black uppercase text-[#e21a6e] mt-1 tracking-wider">{rev.notes}</p>
                      </div>
                      <div className="flex text-yellow-400 text-sm drop-shadow-sm">
                          {"★".repeat(rev.rating)}
                      </div>
                    </div>
                    <p className="text-xs italic font-medium text-black/80 leading-relaxed line-clamp-4">&quot;{rev.review_text}&quot;</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="w-full flex flex-col items-center mt-12">
             <div className="flex justify-center gap-8 mb-10">
                <a href="https://facebook.com/lashes.by.rone" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 group text-black">
                    <div className="w-12 h-12 bg-white/50 rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-[#e21a6e] group-hover:text-white transition-all text-black">
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z"/></svg>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Lashes by Rone</span>
                </a>
                <a href="https://instagram.com/lashes.by.rone" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 group text-black">
                    <div className="w-12 h-12 bg-white/50 rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-[#e21a6e] group-hover:text-white transition-all text-black">
                        <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Lashes by Rone</span>
                </a>
             </div>

             <div className="flex flex-col items-center gap-3 opacity-40">
                <button onClick={() => router.push('/login')} className="text-[9px] font-black uppercase tracking-widest border border-black px-4 py-2 rounded-full hover:bg-black hover:text-white transition-colors text-black">
                  Staff Login
                </button>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-black">© 2026 RoneLashes Arad</p>
             </div>
          </div>
        </div>
      )}

      {/* 2. DASHBOARD CLIENTA */}
      {view === 'dashboard' && (
        <div className="animate-in fade-in duration-500">
          <div className="p-8 bg-black text-white rounded-b-[4rem] shadow-2xl mb-8 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black uppercase opacity-40 mb-1">Bună,</p>
              <h2 className="text-2xl font-serif italic font-bold">{client?.full_name}</h2>
            </div>
            <button onClick={handleLogout} className="p-3 bg-white/10 rounded-2xl text-[10px] font-black uppercase hover:bg-white/20 transition-all">Ieșire</button>
          </div>

          <div className="px-6 max-w-md mx-auto space-y-8">
            <button 
              onClick={() => { 
                setModifyingId(null); 
                setSelectedServices([]); 
                setSelectedDate(undefined); 
                setSelectedTime(null); 
                setWaitlistJoinedDate(null);
                setStep(1); 
                setView('booking'); 
              }} 
              className="w-full py-6 bg-[#e21a6e] text-white font-black rounded-[2.5rem] shadow-xl uppercase tracking-[0.2em] text-sm hover:scale-105 transition-transform"
            >
              + Programare Nouă
            </button>

            {/* AFTERCARE CARD */}
            <div className="bg-white p-6 rounded-[2.5rem] shadow-md border-2 border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="font-serif italic font-bold text-lg text-black">Îngrijire Gene ✨</h4>
                <p className="text-[9px] font-black uppercase opacity-40 tracking-widest text-black">Ghid pentru rezistență maximă</p>
              </div>
              <button onClick={() => setShowAftercare(true)} className="px-5 py-3 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-gray-800 transition-all">
                Vezi Ghid
              </button>
            </div>

            {/* Programări Viitoare */}
            <div>
              <h3 className="text-[11px] font-black uppercase opacity-40 mb-4 tracking-widest px-2 text-black">Programări Viitoare</h3>
              <div className="space-y-4">
                {futureAppointments.length > 0 ? (
                  futureAppointments.map(app => (
                    <div key={app.id} className={`bg-white p-6 rounded-[2.5rem] shadow-md border-2 ${app.status === 'rejected' ? 'border-red-100 opacity-60' : app.status === 'canceled' ? 'border-gray-200 opacity-60' : 'border-gray-100'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xl font-black text-black">{safeFormatDate(app.start_time, 'dd MMM, HH:mm')}</p>
                            {app.status === 'rejected' && <span className="bg-red-100 text-red-600 text-[9px] font-black uppercase px-2 py-1 rounded-lg tracking-widest">Refuzată</span>}
                            {app.status === 'canceled' && <span className="bg-gray-100 text-gray-500 text-[9px] font-black uppercase px-2 py-1 rounded-lg tracking-widest">Anulată</span>}
                          </div>
                          <p className="text-[10px] font-black uppercase text-[#e21a6e]">{app.notes}</p>
                        </div>
                        <p className="font-black text-black">{app.total_price} RON</p>
                      </div>
                      
                      {/* Butoanele de modificare/anulare apar doar daca programarea este activa */}
                      {app.status !== 'rejected' && app.status !== 'canceled' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleModify(app)} className="flex-1 py-3 bg-gray-100 text-black rounded-2xl text-[10px] font-black uppercase hover:bg-black hover:text-white transition-all">Modifică</button>
                          <button onClick={() => startCancelProcess(app)} className="flex-1 py-3 bg-red-50 text-red-500 rounded-2xl text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all">Anulează</button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center py-8 opacity-30 italic font-serif text-black">Nu ai nicio programare activă.</p>
                )}
              </div>
            </div>

            {/* Istoric Vizite & RECENZII */}
            <div>
              <h3 className="text-[11px] font-black uppercase opacity-40 mb-4 tracking-widest px-2 text-black">Istoric Vizite</h3>
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                {pastAppointments.length > 0 ? pastAppointments.map((app, i) => (
                  <div key={app.id} className={`p-5 flex flex-col ${i !== 0 ? 'border-t border-gray-50' : ''} ${app.status === 'rejected' || app.status === 'canceled' ? 'opacity-60' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-sm text-black">{safeFormatDate(app.start_time, 'dd.MM.yyyy')}</p>
                          {app.status === 'rejected' && <span className="text-red-500 text-[9px] font-black uppercase tracking-widest">Refuzată</span>}
                          {app.status === 'canceled' && <span className="text-gray-400 text-[9px] font-black uppercase tracking-widest">Anulată</span>}
                        </div>
                        <p className="text-[9px] font-black uppercase opacity-40 text-black">{app.notes?.substring(0, 20)}...</p>
                      </div>
                      <p className="font-black text-sm text-black">{app.total_price} RON</p>
                    </div>
                    
                    {/* Sistem de Evaluare Vizita apare DOAR daca vizita nu e refuzata sau anulata */}
                    {app.status !== 'rejected' && app.status !== 'canceled' && (
                      app.rating > 0 ? (
                         <div className="mt-3 bg-[#fff5f8] p-3 rounded-2xl border border-[#e21a6e]/10">
                            <div className="flex text-yellow-400 text-xs mb-1">
                                {"★".repeat(app.rating)}{"☆".repeat(5 - app.rating)}
                            </div>
                            {app.review_text && <p className="text-xs text-black/70 italic text-black">&quot;{app.review_text}&quot;</p>}
                         </div>
                      ) : (
                         <button 
                           onClick={() => { setReviewApp(app); setReviewModalOpen(true); }} 
                           className="mt-3 text-[9px] font-black uppercase text-[#e21a6e] border border-[#e21a6e]/20 py-2 rounded-xl hover:bg-[#e21a6e] hover:text-white transition-colors w-full text-center"
                         >
                           ⭐ Lasă o recenzie pentru această vizită
                         </button>
                      )
                    )}
                  </div>
                )) : (
                  <p className="p-5 text-center text-sm opacity-30 italic text-black">Niciun istoric momentan.</p>
                )}
              </div>
            </div>
            
            {/* PORTFOLIU CU AUTO-SCROLL ORIZONTAL */}
            {photos.length > 0 && (
              <div className="pt-4 pb-8">
                <h3 className="text-[11px] font-black uppercase opacity-40 mb-4 tracking-widest px-2 text-center text-black">Lucrări Recente</h3>
                
                <div ref={portfolioRef} className="flex gap-4 overflow-x-auto pb-6 snap-x px-2 -mx-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {photos.slice(0, 10).map(p => {
                    const photoRatings = portfolioRatings.filter(r => r.photo_id === p.id);
                    const avg = photoRatings.length > 0 ? (photoRatings.reduce((sum, r) => sum + r.rating, 0) / photoRatings.length).toFixed(1) : 'Nou';
                    const myRating = photoRatings.find(r => r.client_id === client?.id)?.rating || 0;

                    return (
                      <div key={p.id} className="min-w-[160px] max-w-[160px] relative aspect-square rounded-3xl overflow-hidden shadow-sm border border-gray-100 group snap-center shrink-0">
                        <Image
                          src={p.url}
                          alt="Portofoliu"
                          fill
                          sizes="160px"
                          className="object-cover"
                        />
                        
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-6 pb-3 px-2 flex flex-col items-center justify-end">
                          <span className="text-[9px] text-white font-black uppercase tracking-widest mb-1 shadow-black drop-shadow-md">
                            {avg === 'Nou' ? 'Fii prima care notează!' : `Nota: ${avg} ⭐`}
                          </span>
                          <div className="flex gap-1">
                             {[1, 2, 3, 4, 5].map(star => (
                               <button 
                                 key={star} 
                                 onClick={() => ratePhoto(p.id, star)} 
                                 className={`text-lg transition-all hover:scale-125 drop-shadow-lg ${myRating >= star ? 'text-yellow-400' : 'text-white/50 hover:text-yellow-200'}`}
                               >
                                 ★
                               </button>
                             ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL RECENZIE VIZITĂ */}
      {reviewModalOpen && reviewApp && (
        <div className="fixed inset-0 bg-black/80 z-[100] p-6 flex items-center justify-center backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl border-4 border-gray-100 text-center">
            <h3 className="text-2xl font-serif italic font-bold text-black mb-2">Evaluează experiența</h3>
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-6 text-black">
              Vizita din {safeFormatDate(reviewApp.start_time, 'dd MMMM yyyy')}
            </p>
            
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map(star => (
                <button 
                  key={star} 
                  onClick={() => setStarRating(star)} 
                  className={`text-4xl transition-transform hover:scale-110 ${starRating >= star ? 'text-yellow-400' : 'text-gray-200'}`}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea 
              placeholder="Cum ți s-a părut rezultatul? (Opțional)"
              className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-black outline-none focus:border-[#e21a6e]/30 min-h-[100px] mb-6 resize-none text-sm"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
            />

            <button 
              onClick={submitReview} 
              className="w-full py-5 bg-[#e21a6e] text-white font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-xl mb-3 hover:opacity-90 transition-all"
            >
              Trimite Recenzia
            </button>
            <button 
              onClick={() => { setReviewModalOpen(false); setReviewApp(null); }} 
              className="w-full py-4 bg-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all"
            >
              Închide
            </button>
          </div>
        </div>
      )}

      {/* MODAL AFTERCARE */}
      {showAftercare && (
        <div className="fixed inset-0 bg-black/80 z-[100] p-6 flex items-center justify-center backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 relative max-h-[85vh] overflow-y-auto shadow-2xl border-4 border-[#e21a6e]/10">
            <button 
              onClick={() => setShowAftercare(false)} 
              className="absolute top-6 right-6 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-black text-black hover:bg-gray-200 transition-colors"
            >
              ✕
            </button>
            
            <div className="text-center mb-8">
              <h3 className="text-3xl font-serif italic font-bold text-black">După Programare</h3>
              <p className="text-[10px] font-black uppercase text-[#e21a6e] tracking-widest mt-1">Ghid de întreținere gene</p>
            </div>

            <div className="space-y-6">
              {[
                { icon: '🚫💧', t: 'Primele 24-48 ore', d: 'Evită apa, aburii, sauna sau spray-urile faciale. Adezivul are nevoie de timp să se usuce complet.' },
                { icon: '🧼✨', t: 'Curățare Zilnică', d: 'Spală genele zilnic cu o spumă specială fără ulei. Igiena este vitală pentru sănătatea ochilor tăi.' },
                { icon: '🪮💖', t: 'Pieptănare', d: 'Periază genele în fiecare dimineață cu periuța primită la salon pentru a le păstra aliniate.' },
                { icon: '❌🧴', t: 'Fără Produse pe Bază de Ulei', d: 'Uleiul dizolvă adezivul. Verifică demachiantul și cremele de ochi să fie "Oil-Free".' },
                { icon: '🙅‍♀️👁️', t: 'Nu trage de ele', d: 'Nu smulge, nu trage și nu freca ochii. Dacă vrei să le dai jos, vino la salon pentru o îndepărtare sigură.' }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4 items-start p-4 bg-gray-50 rounded-3xl">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <h5 className="font-black text-xs uppercase text-black mb-1">{item.t}</h5>
                    <p className="text-sm font-medium text-black opacity-60 leading-snug">{item.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setShowAftercare(false)} 
              className="w-full mt-8 py-5 bg-black text-white font-black rounded-2xl uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-gray-800 transition-colors"
            >
              Am înțeles, mulțumesc!
            </button>
          </div>
        </div>
      )}

      {/* 3. PROCES PROGRAMARE & MODIFICARE */}
      {view === 'booking' && (
        <div className="p-6 max-w-md mx-auto animate-in slide-in-from-bottom-10 duration-500">
          <button 
            onClick={() => { setModifyingId(null); setView('dashboard') }} 
            className="mb-6 text-[10px] font-black uppercase opacity-40 hover:opacity-100 transition-all text-black"
          >
            ← Înapoi la cont
          </button>
          
          <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-100">
            
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-serif italic font-bold text-center mb-6 text-black">{modifyingId ? 'Modifică Serviciile' : 'Ce servicii dorești?'}</h2>
                <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-2">
                  {categories.map(cat => (
                    <div key={cat} className="border-b border-gray-100 pb-2">
                      <button 
                        onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)} 
                        className="w-full flex justify-between items-center py-4 text-left font-black text-lg text-black"
                      >
                        <span className={expandedCategory === cat ? 'text-[#e21a6e]' : ''}>{cat}</span>
                        <span>{expandedCategory === cat ? '▲' : '▼'}</span>
                      </button>
                      
                      {expandedCategory === cat &&
                        Object.entries(servicesByCategory[cat] || {}).map(([subCategory, subServices]) => (
                          <div key={`${cat}-${subCategory}`} className="pb-2">
                            {subCategory !== 'Fără subcategorie' && (
                              <p className="text-[10px] font-black uppercase tracking-widest opacity-40 px-2 py-2">
                                {subCategory}
                              </p>
                            )}
                            {subServices.map((s: any) => {
                              const isSel = selectedServices.find((x) => x.id === s.id)
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => toggleService(s)}
                                  className={`w-full flex justify-between items-center p-4 my-1 rounded-2xl border-2 transition-all ${isSel ? 'border-[#e21a6e] bg-[#fff5f8]' : 'border-gray-50 bg-gray-50 hover:border-gray-200'}`}
                                >
                                  <div className="text-left">
                                    <p className="font-bold text-sm text-black">{isSel && '✓ '}{s.name}</p>
                                    <p className="text-[10px] font-black text-[#e21a6e]">{s.duration_minutes} min</p>
                                  </div>
                                  <p className="font-black text-sm text-black">{s.price}</p>
                                </button>
                              )
                            })}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
                {selectedServices.length > 0 && (
                  <button 
                    onClick={() => setStep(2)} 
                    className="w-full py-5 bg-black text-white font-black rounded-2xl uppercase text-[11px] mt-4 shadow-lg hover:opacity-90 transition-all"
                  >
                    Continuă ({totalPrice} RON)
                  </button>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl font-serif italic font-bold text-center text-black">Alege Data</h2>
                <div className="bg-gray-50 p-2 rounded-3xl flex justify-center border border-gray-100 shadow-inner">
                  <DayPicker 
                    mode="single" 
                    selected={selectedDate} 
                    onSelect={(d) => { setSelectedDate(d); setWaitlistJoinedDate(null); }}
                    locale={ro} 
                    disabled={[
                      { before: startOfToday() }, 
                      { dayOfWeek: disabledDaysOfWeek },
                      // Adaugam funcția care verifică concediile pentru a bloca calendarul vizual
                      (date) => isDateInClosure(date)
                    ]} 
                  />
                </div>
                
                {/* ORE DISPONIBILE */}
                {selectedDate && getAvailableTimes(selectedDate, totalDuration).length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {getAvailableTimes(selectedDate, totalDuration).map(t => (
                      <button 
                        key={t} 
                        onClick={() => { setSelectedTime(t); setStep(3); }} 
                        className="py-3 bg-gray-100 rounded-xl font-black text-xs hover:bg-black hover:text-white transition-all text-black"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                
                {/* MESAJ CONCEDIU SAU WAITLIST */}
                {selectedDate && getAvailableTimes(selectedDate, totalDuration).length === 0 && (
                  <div className="mt-6 p-6 bg-[#fff5f8] border border-[#e21a6e]/20 rounded-[2rem] text-center animate-in fade-in">
                    {isDateInClosure(selectedDate) ? (
                      <>
                        <p className="text-xl font-serif italic font-bold text-black mb-2">Salon Închis</p>
                        <p className="text-[11px] font-bold opacity-60 text-black">În această perioadă salonul este închis. Te rugăm să alegi o altă dată din calendar.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-serif italic font-bold text-black mb-2">Ziua este plină</p>
                        <p className="text-[11px] font-bold opacity-60 text-black mb-6">Dorești să te anunțăm pe WhatsApp dacă se eliberează vreun loc?</p>
                        
                        {waitlistJoinedDate === format(selectedDate, 'yyyy-MM-dd') ? (
                          <div className="py-4 bg-green-50 text-green-600 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-green-200">✅ Te-am adăugat pe listă!</div>
                        ) : (
                          <button onClick={handleJoinWaitlist} disabled={isJoiningWaitlist} className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#e21a6e] transition-colors shadow-lg disabled:opacity-50">
                            {isJoiningWaitlist ? 'Se adaugă...' : '🔔 Anunță-mă când se eliberează'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-8 text-center">
                <div className="p-8 bg-[#fff5f8] rounded-[2.5rem] border border-[#e21a6e]/10">
                    <p className="text-[10px] font-black uppercase text-[#e21a6e] mb-2">{modifyingId ? 'Confirmare Modificare' : 'Confirmare Finală'}</p>
                    <p className="text-xl font-serif italic font-bold text-black">{format(selectedDate!, 'EEEE, dd MMMM', { locale: ro })}</p>
                    <p className="text-4xl font-black my-2 text-black">ora {selectedTime}</p>
                    <p className="text-xs font-bold opacity-40 uppercase text-black">{selectedServices.map(s => s.name).join(' + ')}</p>
                </div>
                <button 
                  onClick={handleBooking} 
                  className="w-full py-5 bg-black text-white font-black rounded-3xl uppercase text-xs tracking-widest shadow-2xl hover:bg-[#e21a6e] transition-colors"
                >
                  {modifyingId ? 'Salvează Modificarea ✨' : 'Confirmă Programarea ✨'}
                </button>
                <button 
                  onClick={() => setStep(2)} 
                  className="text-[10px] font-black opacity-30 uppercase hover:opacity-100 text-black"
                >
                  Schimbă data/ora
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- ECRAN 1: FORMULAR ANULARE --- */}
      {view === 'cancel' && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#fafafa] text-black text-center font-sans">
          <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl border border-red-100 animate-in zoom-in">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-black">!</div>
            <h2 className="text-2xl font-serif italic font-bold text-black mb-2">Anulare Programare</h2>
            <p className="text-[10px] font-black uppercase text-[#e21a6e] tracking-widest mb-6">
              {safeFormatDate(cancelingApp?.start_time, 'dd MMMM, HH:mm')}
            </p>
            
            <textarea 
              placeholder="Te rog să ne scrii motivul anulării..."
              className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl font-bold text-black outline-none focus:border-red-300 min-h-[100px] mb-6 resize-none"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />

            <button 
              onClick={confirmCancel} 
              className="w-full py-5 bg-red-500 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl mb-3 hover:opacity-90 transition-all"
            >
              Confirmă Anularea
            </button>
            <button 
              onClick={() => { setCancelingApp(null); setView('dashboard') }} 
              className="w-full py-4 bg-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all"
            >
              M-am răzgândit. Păstrez.
            </button>
          </div>
        </div>
      )}

      {/* --- ECRAN 2: SUCCES ANULARE --- */}
      {view === 'cancel_success' && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#fafafa] text-black text-center font-sans">
          <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl border border-gray-100 animate-in zoom-in">
            <div className="w-20 h-20 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-8 text-3xl">✓</div>
            <h2 className="text-2xl font-serif italic font-bold text-black mb-4">Programare Anulată</h2>
            <p className="text-black/60 font-bold mb-8 text-sm">
              Programarea a fost anulată în sistem. Te rugăm să trimiți motivul către salon.
            </p>
            
            <a 
              href={`https://wa.me/40743584475?text=${encodeURIComponent(`Bună, Ronela! Din păcate, am anulat programarea mea din data de ${safeFormatDate(cancelingApp?.start_time, 'dd MMMM')}, ora ${safeFormatDate(cancelingApp?.start_time, 'HH:mm')}.\n\nMotivul: ${cancelReason}`)}`}
              className="w-full block py-5 bg-[#25D366] text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl mb-3 hover:opacity-90 transition-all"
            >
              1. Trimite motivul (WhatsApp)
            </a>

            <button 
              onClick={() => { setCancelingApp(null); setCancelReason(''); setView('dashboard') }} 
              className="w-full py-4 bg-gray-50 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all"
            >
              2. M-am întors, du-mă la cont
            </button>
          </div>
        </div>
      )}

      {/* --- ECRAN SUCCES PROGRAMARE --- */}
      {view === 'success' && (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#fce4ec] text-black text-center font-sans">
          <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl animate-in zoom-in">
            <div className="w-20 h-20 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-8 text-3xl">✓</div>
            <h2 className="text-3xl font-black mb-4 italic font-serif text-black">{modifyingId ? 'Modificare salvată!' : 'Te aștept cu drag! ✨'}</h2>
            <p className="text-black/60 font-bold mb-8 text-black">
              Programarea a fost {modifyingId ? 'actualizată' : 'confirmată'}.
            </p>

            <a 
              href={`https://wa.me/40743584475?text=${encodeURIComponent(`Bună, Ronela! Tocmai mi-am ${modifyingId ? 'modificat programarea' : 'programat'} pentru: ${selectedServices.map(s => s.name).join(', ')}.\nData: ${format(selectedDate!, 'dd MMMM', { locale: ro })}, ora ${selectedTime}. ✨`)}`}
              className="w-full block py-5 bg-[#25D366] text-white rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl mb-3 hover:opacity-90 transition-all"
            >
              1. Trimite confirmare WhatsApp
            </a>

            <button 
              onClick={() => {
                 setModifyingId(null); setSelectedServices([]); setSelectedDate(undefined); setSelectedTime(null); setWaitlistJoinedDate(null); setStep(1);
                 setView('dashboard');
              }} 
              className="w-full py-4 bg-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-gray-200 transition-all"
            >
              2. M-am întors, du-mă la cont
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
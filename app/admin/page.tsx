'use client'

import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { format, parseISO, isSameDay, isAfter, isBefore, startOfMonth, endOfMonth, startOfYear, endOfYear, addMinutes } from 'date-fns'
import { ro } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import Image from 'next/image'
import { DEFAULT_CATEGORY_ORDER, DEFAULT_SUBCATEGORY_ORDER, parseCsvOrder, sortByPreferredOrder } from '@/lib/service-order'
import 'react-day-picker/dist/style.css'

const daysMap = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']

export default function AdminDashboard() {
  type AnalyticsEvent = {
    event_name: string
    event_category: string
    created_at: string
  }

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'appointments' | 'services' | 'portfolio' | 'reviews' | 'finance' | 'settings' | 'analytics'>('appointments')
  
  // Date Bază
  const [appointments, setAppointments] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [hasMorePortfolio, setHasMorePortfolio] = useState(false)
  const [portfolioPage, setPortfolioPage] = useState(0)
  const [portfolioLoadingMore, setPortfolioLoadingMore] = useState(false)
  const [portfolioRatings, setPortfolioRatings] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [hasMoreReviews, setHasMoreReviews] = useState(false)
  const [reviewsPage, setReviewsPage] = useState(0)
  const [reviewsLoadingMore, setReviewsLoadingMore] = useState(false)
  const [schedule, setSchedule] = useState<any[]>([]) 
  const [waitlist, setWaitlist] = useState<any[]>([]) 
  const [closures, setClosures] = useState<any[]>([]) 
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsRangeDays, setAnalyticsRangeDays] = useState<7 | 14 | 30>(14)
  const [analyticsLastUpdated, setAnalyticsLastUpdated] = useState<Date | null>(null)

  // State-uri Agenda & Calendar
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<Date>(new Date())

  // State-uri Finanțe
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [categoryOrderInput, setCategoryOrderInput] = useState(DEFAULT_CATEGORY_ORDER.join(', '))
  const [subcategoryOrderInput, setSubcategoryOrderInput] = useState(DEFAULT_SUBCATEGORY_ORDER.join(', '))

  // Gestiune Servicii
  const [isAddingService, setIsAddingService] = useState(false)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceForm, setServiceForm] = useState({ name: '', price: '', duration_minutes: 60, category: '', subcategory: '' })

  // Gestiune Portofoliu
  const [uploading, setUploading] = useState(false)

  // Gestiune Programare Manuală
  const [showManualBooking, setShowManualBooking] = useState(false)
  const [manualForm, setManualForm] = useState({
     name: '',
     phone: '',
     serviceId: '',
     date: undefined as Date | undefined,
     time: '',
     clientId: null as string | null 
  })
  const [isExistingClient, setIsExistingClient] = useState(false)

  // Gestiune Pauze 
  const [showPauseModal, setShowPauseModal] = useState(false)
  const [pauseForm, setPauseForm] = useState({
     date: undefined as Date | undefined,
     time: '',
     duration: 60,
     note: 'Pauză'
  })

  // Gestiune Concedii
  const [closureForm, setClosureForm] = useState({
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
    description: 'Concediu'
  })

  const router = useRouter()

  useEffect(() => {
    fetchAdminData()
    // fetchAdminData is intentionally triggered once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- FUNCTIE CAUTARE CLIENT DUPA TELEFON ---
  useEffect(() => {
    const searchClient = async () => {
      if (manualForm.phone.length >= 10) {
        const response = await fetch('/api/admin/operations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lookup_client', phone: manualForm.phone }),
        })
        const payload = await response.json().catch(() => ({}))
        const foundClient = payload?.client

        if (foundClient?.id) {
          setManualForm(prev => ({ ...prev, name: foundClient.full_name, clientId: foundClient.id }))
          setIsExistingClient(true)
        } else {
          setManualForm(prev => ({ ...prev, clientId: null }))
          setIsExistingClient(false)
        }
      }
    };
    searchClient();
  }, [manualForm.phone])

  async function fetchPortfolioPage(page: number, append = false) {
    const response = await fetch(`/api/admin/dashboard?mode=portfolio&page=${page}`, { method: 'GET' })
    if (response.status === 401) {
      router.push('/login')
      return
    }
    if (!response.ok) return

    const payload = await response.json()
    const nextData = Array.isArray(payload?.items) ? payload.items : []
    setHasMorePortfolio(Boolean(payload?.hasMore))
    setPortfolioPage(Number(payload?.page ?? page))
    setPhotos((prev) => (append ? [...prev, ...nextData] : nextData))
  }

  async function fetchReviewsPage(page: number, append = false) {
    const response = await fetch(`/api/admin/dashboard?mode=reviews&page=${page}`, { method: 'GET' })
    if (response.status === 401) {
      router.push('/login')
      return
    }
    if (!response.ok) return

    const payload = await response.json()
    const nextData = Array.isArray(payload?.items) ? payload.items : []
    setHasMoreReviews(Boolean(payload?.hasMore))
    setReviewsPage(Number(payload?.page ?? page))
    setReviews((prev) => (append ? [...prev, ...nextData] : nextData))
  }

  async function fetchServiceOrderConfig() {
    const response = await fetch('/api/admin/service-order', { method: 'GET' })
    if (!response.ok) return
    const payload = await response.json()
    if (Array.isArray(payload?.categoryOrder)) {
      setCategoryOrderInput(payload.categoryOrder.join(', '))
    }
    if (Array.isArray(payload?.subcategoryOrder)) {
      setSubcategoryOrderInput(payload.subcategoryOrder.join(', '))
    }
  }

  async function handleSaveServiceOrderConfig() {
    const categoryOrder = parseCsvOrder(categoryOrderInput)
    const subcategoryOrder = parseCsvOrder(subcategoryOrderInput)
    const response = await fetch('/api/admin/service-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryOrder, subcategoryOrder }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      alert(payload?.error || 'Nu am putut salva ordinea.')
      return
    }
    alert('Ordinea categoriilor/subcategoriilor a fost salvată.')
  }

  async function fetchAnalyticsEvents(days: 7 | 14 | 30) {
    setAnalyticsLoading(true)
    try {
      const response = await fetch(`/api/admin/analytics?days=${days}`, { method: 'GET' })
      if (!response.ok) return
      const payload = await response.json()
      setAnalyticsEvents(payload?.events || [])
      setAnalyticsLastUpdated(new Date())
    } finally {
      setAnalyticsLoading(false)
    }
  }

  async function fetchAdminData() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/dashboard?mode=dashboard', { method: 'GET' })
      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) return

      const payload = await response.json()

      if (Array.isArray(payload?.appointments)) setAppointments(payload.appointments)
      if (Array.isArray(payload?.services)) setServices(payload.services)
      if (Array.isArray(payload?.portfolioRatings)) setPortfolioRatings(payload.portfolioRatings)
      if (Array.isArray(payload?.schedule)) setSchedule(payload.schedule)
      if (Array.isArray(payload?.waitlist)) setWaitlist(payload.waitlist)
      if (Array.isArray(payload?.closures)) setClosures(payload.closures)

      const portfolioItems = Array.isArray(payload?.portfolio?.items) ? payload.portfolio.items : []
      setPhotos(portfolioItems)
      setHasMorePortfolio(Boolean(payload?.portfolio?.hasMore))
      setPortfolioPage(Number(payload?.portfolio?.page ?? 0))

      const reviewItems = Array.isArray(payload?.reviews?.items) ? payload.reviews.items : []
      setReviews(reviewItems)
      setHasMoreReviews(Boolean(payload?.reviews?.hasMore))
      setReviewsPage(Number(payload?.reviews?.page ?? 0))
    } catch (err) {
      console.error("Eroare incarcare date:", err)
    } finally {
      setLoading(false)
    }
  }

  // --- LOGICA DISPONIBILITATE PENTRU ADMIN (FĂRĂ SUPRAPUNERI) ---
  const isDateInClosure = (dateToCheck: Date) => {
    return closures.some(closure => {
      const start = parseISO(closure.start_date); const end = parseISO(closure.end_date);
      start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
      return (isAfter(dateToCheck, start) || isSameDay(dateToCheck, start)) && 
             (isBefore(dateToCheck, end) || isSameDay(dateToCheck, end));
    });
  }

  const getAdminAvailableTimes = (date: Date, duration: number) => {
    if (isDateInClosure(date)) return [];
    const now = new Date(); const isToday = isSameDay(date, now); const day = date.getDay()
    const daySchedule = schedule.find(s => s.day_of_week === day)
    
    if (!daySchedule || daySchedule.is_day_off) return []
    const [openH, openM] = daySchedule.open_time.split(':'); const [closeH, closeM] = daySchedule.close_time.split(':')
    const start = parseInt(openH) * 60 + parseInt(openM); const end = parseInt(closeH) * 60 + parseInt(closeM)
    
    const slots = []
    for (let curr = start; curr <= end - duration; curr += 30) {
      const h = Math.floor(curr / 60).toString().padStart(2, '0'); const m = (curr % 60).toString().padStart(2, '0')
      const sStart = new Date(date); sStart.setHours(parseInt(h), parseInt(m), 0, 0)
      const sEnd = addMinutes(sStart, duration)
      
      if (isToday && sStart.getTime() < now.getTime()) continue;

      const isOcc = appointments.some(app => {
        if (app.status === 'rejected' || app.status === 'canceled') return false
        const aS = parseISO(app.start_time); const aE = parseISO(app.end_time)
        return isBefore(sStart, aE) && isAfter(sEnd, aS)
      })
      
      if (!isOcc) slots.push(`${h}:${m}`)
    }
    return slots
  }

  const handleLogout = () => {
    fetch('/api/admin/logout', { method: 'POST' }).finally(() => {
      router.push('/login')
    })
  }

  const deleteItem = async (table: string, id: string) => {
    if (window.confirm("Sigur vrei să ștergi definitiv acest element?")) {
      if (table === 'services') {
        const response = await fetch('/api/admin/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', serviceId: id }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          alert(payload?.error || 'Serviciul nu a putut fi șters.')
          return
        }
        fetchAdminData()
        return
      }

      const response = await fetch('/api/admin/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', table, id }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        alert(payload?.error || 'Elementul nu a putut fi șters.')
        return
      }
      fetchAdminData()
    }
  }

  // --- LOGICA STATISTICI & FINANTE ---
  const calculateIncome = (period: 'today' | 'month' | 'year') => {
    const now = new Date()
    const validApps = appointments.filter(a => a.status === 'confirmed' || a.status === 'completed')
    let filtered = validApps
    if (period === 'today') filtered = validApps.filter(a => isSameDay(parseISO(a.start_time), now))
    else if (period === 'month') filtered = validApps.filter(a => isAfter(parseISO(a.start_time), startOfMonth(now)) && isBefore(parseISO(a.start_time), endOfMonth(now)))
    else if (period === 'year') filtered = validApps.filter(a => isAfter(parseISO(a.start_time), startOfYear(now)) && isBefore(parseISO(a.start_time), endOfYear(now)))
    return filtered.reduce((acc, curr) => acc + (parseInt(String(curr.total_price || '0').replace(/\D/g, '')) || 0), 0)
  }

  const getIncomesByMonth = () => {
    const valid = appointments.filter(a => a.status === 'confirmed' || a.status === 'completed')
    const months: any = {}
    valid.forEach(app => {
      const date = parseISO(app.start_time)
      const monthKey = format(date, 'MMMM yyyy', { locale: ro })
      const dayKey = format(date, 'yyyy-MM-dd')
      const price = parseInt(String(app.total_price || '0').replace(/\D/g, '')) || 0
      if (!months[monthKey]) months[monthKey] = { total: 0, days: {} }
      months[monthKey].total += price
      months[monthKey].days[dayKey] = (months[monthKey].days[dayKey] || 0) + price
    })
    return months
  }

  const updateStatus = async (id: string, status: string) => {
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', id, status }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      alert(payload?.error || 'Statusul nu a putut fi actualizat.')
      return
    }
    fetchAdminData()
  }

  const handleReject = async (app: any) => {
    if (window.confirm(`Refuzi programarea lui ${app.client_name}?`)) {
      const msg = `Bună, ${app.client_name}! Din păcate nu pot onora programarea ta de pe data de ${format(parseISO(app.start_time), 'dd MMMM')}, ora ${format(parseISO(app.start_time), 'HH:mm')}. Te rog să alegi altă dată din aplicație! ✨`
      let phone = app.client_phone.trim()
      if (phone.startsWith('0')) phone = phone.substring(1)
      window.open(`https://wa.me/40${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
      await updateStatus(app.id, 'rejected')
    }
  }

  const handleComplete = async (app: any) => {
    const msg = `Bună, ${app.client_name}! Îți mulțumesc pentru vizita de astăzi! ✨ M-aș bucura enorm dacă mi-ai lăsa o recenzie direct în contul tău din aplicație. Te mai aștept cu drag! 💖`
    let phone = app.client_phone.trim()
    if (phone.startsWith('0')) phone = phone.substring(1)
    window.open(`https://wa.me/40${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
    if (app.status !== 'completed') await updateStatus(app.id, 'completed')
  }

  const handleRemind = (app: any) => {
    const msg = `Bună, ${app.client_name}! Îți reamintesc cu drag de programarea ta pentru ${app.notes} de pe data de ${format(parseISO(app.start_time), 'dd MMMM', { locale: ro })}, la ora ${format(parseISO(app.start_time), 'HH:mm')}. Ne vedem curând! ✨`
    let phone = app.client_phone.trim()
    if (phone.startsWith('0')) phone = phone.substring(1)
    window.open(`https://wa.me/40${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  const handleManualBooking = async () => {
    if (!manualForm.name || !manualForm.phone || !manualForm.serviceId || !manualForm.date || !manualForm.time) {
      return alert("Completează toate câmpurile!")
    }
    const s = services.find(x => x.id === manualForm.serviceId)
    const [h, m] = manualForm.time.split(':'); const start = new Date(manualForm.date)
    start.setHours(parseInt(h), parseInt(m), 0, 0)
    
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manual_booking',
        clientId: manualForm.clientId,
        clientName: manualForm.name,
        clientPhone: manualForm.phone,
        serviceId: manualForm.serviceId,
        notes: `${s?.name} (Manual)`,
        totalPrice: parseInt(String(s?.price || '0').replace(/\D/g, '')) || 0,
        startTime: start.toISOString(),
        endTime: addMinutes(start, s?.duration_minutes || 60).toISOString(),
      }),
    })

    if (response.ok) {
      const msg = `Bună, ${manualForm.name}! Te-am programat pe data de ${format(start, 'dd MMMM', {locale: ro})}, la ora ${manualForm.time}. ✨`
      let p = manualForm.phone.trim(); if (p.startsWith('0')) p = p.substring(1)
      window.open(`https://wa.me/40${p}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
      setShowManualBooking(false); setManualForm({ name: '', phone: '', serviceId: '', date: undefined, time: '', clientId: null }); fetchAdminData()
      return
    }
    const payload = await response.json().catch(() => ({}))
    alert(payload?.error || 'Programarea manuală nu a putut fi salvată.')
  }

  const handleSavePause = async () => {
    if (!pauseForm.date || !pauseForm.time) return alert("Completează data și ora!")
    const [h, m] = pauseForm.time.split(':'); const start = new Date(pauseForm.date)
    start.setHours(parseInt(h), parseInt(m), 0, 0)
    
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_pause',
        note: pauseForm.note,
        startTime: start.toISOString(),
        endTime: addMinutes(start, pauseForm.duration).toISOString(),
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      alert(payload?.error || 'Pauza nu a putut fi salvată.')
      return
    }
    setShowPauseModal(false); setPauseForm({ date: undefined, time: '', duration: 60, note: 'Pauză' }); fetchAdminData()
  }

  const handleSaveService = async () => {
    const response = await fetch('/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        serviceId: editingServiceId,
        ...serviceForm,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      alert(payload?.error || 'Serviciul nu a putut fi salvat.')
      return
    }

    setIsAddingService(false); setEditingServiceId(null); fetchAdminData()
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    setUploading(true)
    try {
      const file = e.target.files?.[0]
      if (!file) return
      const formData = new FormData()
      formData.append('action', 'upload_portfolio')
      formData.append('file', file)
      const response = await fetch('/api/admin/operations', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        alert(payload?.error || 'Imaginea nu a putut fi încărcată.')
        return
      }
      fetchAdminData()
    } finally {
      setUploading(false)
    }
  }

  const handleUpdateSchedule = async (day: any) => {
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_schedule',
        dayOfWeek: day.day_of_week,
        openTime: day.open_time,
        closeTime: day.close_time,
        isDayOff: day.is_day_off,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      alert(payload?.error || 'Programul nu a putut fi actualizat.')
      return
    }
    alert(`Programul pentru ${daysMap[day.day_of_week]} a fost actualizat!`)
  }

  const handleSaveClosure = async () => {
    if (!closureForm.start_date || !closureForm.end_date) return alert("Alege ambele date!")
    if (isBefore(closureForm.end_date, closureForm.start_date)) return alert("Data de sfârșit invalidă!")
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_closure',
        startDate: format(closureForm.start_date, 'yyyy-MM-dd'),
        endDate: format(closureForm.end_date, 'yyyy-MM-dd'),
        description: closureForm.description,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      alert(payload?.error || 'Concediul nu a putut fi salvat.')
      return
    }
    alert("Concediu adăugat!"); setClosureForm({ start_date: undefined, end_date: undefined, description: 'Concediu' }); fetchAdminData();
  }

  const handleResetReview = async (appointmentId: string) => {
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_review', appointmentId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      alert(payload?.error || 'Recenzia nu a putut fi resetată.')
      return
    }
    fetchAdminData()
  }

  const safeFormatDate = (dateString: string, fmt: string) => { try { return format(parseISO(dateString), fmt, { locale: ro }) } catch { return '' } }

  const appointmentsForSelectedDate = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(parseISO(a.start_time), selectedAgendaDate))
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [appointments, selectedAgendaDate]
  )
  const bookedDays = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== 'rejected' && a.status !== 'canceled' && a.client_phone !== '-')
        .map((a) => parseISO(a.start_time)),
    [appointments]
  )
  const disabledDaysOfWeek = useMemo(
    () => schedule.filter((s) => s.is_day_off).map((s) => s.day_of_week),
    [schedule]
  )
  const weekBookings = useMemo(
    () => {
      const now = new Date()
      return appointments.filter((a) => {
        const date = parseISO(a.start_time)
        const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
        return diffDays >= 0 && diffDays <= 7
      }).length
    },
    [appointments]
  )
  const monthBookings = useMemo(
    () => {
      const now = new Date()
      return appointments.filter((a) => {
        const date = parseISO(a.start_time)
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
      }).length
    },
    [appointments]
  )
  const currentMonthApps = useMemo(
    () => {
      const now = new Date()
      return appointments.filter((a) => {
        const date = parseISO(a.start_time)
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
      })
    },
    [appointments]
  )
  const monthCancelRate = useMemo(() => {
    if (currentMonthApps.length === 0) return 0
    const canceled = currentMonthApps.filter((a) => a.status === 'canceled').length
    return Math.round((canceled / currentMonthApps.length) * 100)
  }, [currentMonthApps])
  const analyticsDaily = useMemo(() => {
    const days = analyticsRangeDays
    const now = new Date()
    const buckets = Array.from({ length: days }, (_, idx) => {
      const day = new Date(now)
      day.setDate(now.getDate() - (days - 1 - idx))
      day.setHours(0, 0, 0, 0)
      const dayKey = format(day, 'yyyy-MM-dd')
      return { dayKey, label: format(day, 'dd MMM', { locale: ro }), bookings: 0, canceled: 0 }
    })

    const byKey = new Map(buckets.map((b) => [b.dayKey, b]))
    appointments.forEach((app) => {
      const date = parseISO(app.start_time)
      const key = format(date, 'yyyy-MM-dd')
      const bucket = byKey.get(key)
      if (!bucket) return
      bucket.bookings += 1
      if (app.status === 'canceled') bucket.canceled += 1
    })

    return buckets
  }, [appointments, analyticsRangeDays])
  const analyticsMaxCount = useMemo(
    () => Math.max(1, ...analyticsDaily.map((d) => Math.max(d.bookings, d.canceled))),
    [analyticsDaily]
  )
  const eventFunnel = useMemo(() => {
    const counts = {
      client_login_success: 0,
      booking_created: 0,
      waitlist_joined: 0,
      review_submitted: 0,
      portfolio_rated: 0,
    }
    analyticsEvents.forEach((event) => {
      const key = event.event_name as keyof typeof counts
      if (key in counts) counts[key] += 1
    })
    return counts
  }, [analyticsEvents])
  const funnelRates = useMemo(() => {
    const loginToBooking =
      eventFunnel.client_login_success > 0
        ? Math.round((eventFunnel.booking_created / eventFunnel.client_login_success) * 100)
        : 0
    const bookingToReview =
      eventFunnel.booking_created > 0
        ? Math.round((eventFunnel.review_submitted / eventFunnel.booking_created) * 100)
        : 0
    const bookingToWaitlist =
      eventFunnel.booking_created > 0
        ? Math.round((eventFunnel.waitlist_joined / eventFunnel.booking_created) * 100)
        : 0
    return { loginToBooking, bookingToReview, bookingToWaitlist }
  }, [eventFunnel])
  const getRateTone = (value: number, good: number, warn: number) => {
    if (value >= good) return 'text-green-600'
    if (value >= warn) return 'text-yellow-600'
    return 'text-red-600'
  }
  const previousAnalyticsDaily = useMemo(() => {
    const days = analyticsRangeDays
    const now = new Date()
    const startCurrent = new Date(now)
    startCurrent.setDate(now.getDate() - (days - 1))
    startCurrent.setHours(0, 0, 0, 0)
    const startPrevious = new Date(startCurrent)
    startPrevious.setDate(startPrevious.getDate() - days)

    const buckets = Array.from({ length: days }, (_, idx) => {
      const day = new Date(startPrevious)
      day.setDate(startPrevious.getDate() + idx)
      day.setHours(0, 0, 0, 0)
      const dayKey = format(day, 'yyyy-MM-dd')
      return { dayKey, bookings: 0, canceled: 0 }
    })

    const byKey = new Map(buckets.map((b) => [b.dayKey, b]))
    appointments.forEach((app) => {
      const date = parseISO(app.start_time)
      if (date < startPrevious || date >= startCurrent) return
      const key = format(date, 'yyyy-MM-dd')
      const bucket = byKey.get(key)
      if (!bucket) return
      bucket.bookings += 1
      if (app.status === 'canceled') bucket.canceled += 1
    })
    return buckets
  }, [appointments, analyticsRangeDays])
  const bookingsDeltaPct = useMemo(() => {
    const current = analyticsDaily.reduce((acc, d) => acc + d.bookings, 0)
    const previous = previousAnalyticsDaily.reduce((acc, d) => acc + d.bookings, 0)
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }, [analyticsDaily, previousAnalyticsDaily])
  const cancelsDeltaPct = useMemo(() => {
    const current = analyticsDaily.reduce((acc, d) => acc + d.canceled, 0)
    const previous = previousAnalyticsDaily.reduce((acc, d) => acc + d.canceled, 0)
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }, [analyticsDaily, previousAnalyticsDaily])
  const cancelRateDeltaPct = useMemo(() => {
    const currentBookings = analyticsDaily.reduce((acc, d) => acc + d.bookings, 0)
    const currentCancels = analyticsDaily.reduce((acc, d) => acc + d.canceled, 0)
    const currentRate = currentBookings === 0 ? 0 : (currentCancels / currentBookings) * 100

    const prevBookings = previousAnalyticsDaily.reduce((acc, d) => acc + d.bookings, 0)
    const prevCancels = previousAnalyticsDaily.reduce((acc, d) => acc + d.canceled, 0)
    const prevRate = prevBookings === 0 ? 0 : (prevCancels / prevBookings) * 100

    return Math.round(currentRate - prevRate)
  }, [analyticsDaily, previousAnalyticsDaily])
  const formatDelta = (value: number) => (value > 0 ? `+${value}%` : `${value}%`)
  const analyticsInsight = useMemo(() => {
    const parts: string[] = []

    if (bookingsDeltaPct > 0) parts.push(`cererea este în creștere (${formatDelta(bookingsDeltaPct)} bookings)`)
    else if (bookingsDeltaPct < 0) parts.push(`cererea este în scădere (${formatDelta(bookingsDeltaPct)} bookings)`)
    else parts.push('cererea este stabilă')

    if (cancelsDeltaPct < 0) parts.push(`anulările au scăzut (${formatDelta(cancelsDeltaPct)})`)
    else if (cancelsDeltaPct > 0) parts.push(`anulările au crescut (${formatDelta(cancelsDeltaPct)})`)
    else parts.push('anulările sunt constante')

    if (cancelRateDeltaPct < 0) parts.push(`rata anulărilor s-a îmbunătățit (${cancelRateDeltaPct}pp)`)
    else if (cancelRateDeltaPct > 0) parts.push(`rata anulărilor s-a deteriorat (+${cancelRateDeltaPct}pp)`)
    else parts.push('rata anulărilor este stabilă')

    return `Insight: ${parts.join(', ')}.`
  }, [bookingsDeltaPct, cancelsDeltaPct, cancelRateDeltaPct])
  const analyticsConfidence = useMemo(() => {
    const totalBookings = analyticsDaily.reduce((acc, d) => acc + d.bookings, 0)
    if (totalBookings < 10) {
      return {
        label: 'Volum mic',
        note: 'Semnalele pot varia puternic. Interpretează trendul cu prudență.',
        tone: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      }
    }
    if (totalBookings < 25) {
      return {
        label: 'Volum mediu',
        note: 'Trendul este util orientativ, dar poate avea fluctuații.',
        tone: 'bg-blue-50 text-blue-700 border-blue-200',
      }
    }
    return {
      label: 'Date suficiente',
      note: 'Trendul este mai stabil și potrivit pentru decizii operaționale.',
      tone: 'bg-green-50 text-green-700 border-green-200',
    }
  }, [analyticsDaily])
  const topBusyDays = useMemo(() => {
    const map = new Map<string, number>()
    appointments.forEach((app) => {
      const date = parseISO(app.start_time)
      const diffDays = (new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      if (diffDays < 0 || diffDays > analyticsRangeDays) return
      const dayLabel = format(date, 'EEEE', { locale: ro })
      map.set(dayLabel, (map.get(dayLabel) || 0) + 1)
    })
    return Array.from(map.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  }, [appointments, analyticsRangeDays])
  const analyticsRecommendations = useMemo(() => {
    const items: string[] = []
    const totalBookings = analyticsDaily.reduce((acc, d) => acc + d.bookings, 0)
    const totalCanceled = analyticsDaily.reduce((acc, d) => acc + d.canceled, 0)
    const cancelRate = totalBookings === 0 ? 0 : (totalCanceled / totalBookings) * 100

    if (bookingsDeltaPct >= 15) {
      items.push('Cererea este în creștere puternică: ia în calcul extinderea programului în intervalele de vârf.')
    } else if (bookingsDeltaPct <= -15) {
      items.push('Cererea este în scădere: activează o campanie scurtă (ofertă/re-engagement) pentru cliente inactive.')
    }

    if (cancelRate >= 25) {
      items.push('Rata anulărilor este ridicată: trimite remindere cu 24h înainte și cere reconfirmare în ziua programării.')
    } else if (cancelRate <= 10 && totalBookings >= 10) {
      items.push('Rata anulărilor este bună: păstrează fluxul actual de confirmare și reminder.')
    }

    if (topBusyDays.length > 0 && topBusyDays[0].count >= Math.max(4, Math.round(totalBookings * 0.25))) {
      items.push(`Ziua "${topBusyDays[0].day}" concentrează multe programări: blochează mai puține pauze în acea zi sau deschide +1h în orele de seară.`)
    }

    if (eventFunnel.client_login_success > 0 && eventFunnel.booking_created === 0) {
      items.push('Există logări fără conversie în programări: simplifică pasul de selecție servicii sau evidențiază primul slot liber.')
    }

    if (eventFunnel.booking_created > 0 && eventFunnel.review_submitted === 0) {
      items.push('Programările nu generează recenzii: adaugă un reminder post-vizită pentru review la 4-6h după finalizare.')
    }

    if (items.length === 0) {
      items.push('Indicatorii sunt stabili. Continuă monitorizarea săptămânală și ajustează programul doar când trendul se menține cel puțin 2 intervale consecutive.')
    }

    return items.slice(0, 4)
  }, [analyticsDaily, bookingsDeltaPct, eventFunnel, topBusyDays])
  const visiblePortfolioPhotos = useMemo(() => photos, [photos])
  const visibleReviews = useMemo(() => reviews, [reviews])
  const existingCategories = useMemo(
    () =>
      sortByPreferredOrder(
        Array.from(
        new Set(
          services
            .map((s) => String(s.category || '').trim())
            .filter((value) => value.length > 0)
        )
      ),
      DEFAULT_CATEGORY_ORDER
    ),
    [services]
  )
  const existingSubcategories = useMemo(
    () => {
      const selectedCategory = String(serviceForm.category || '').trim()
      return sortByPreferredOrder(Array.from(
        new Set(
          services
            .filter((s) => !selectedCategory || String(s.category || '').trim() === selectedCategory)
            .map((s) => String(s.subcategory || '').trim())
            .filter((value) => value.length > 0)
        )
      ), DEFAULT_SUBCATEGORY_ORDER)
    },
    [services, serviceForm.category]
  )

  const loadMorePortfolio = async () => {
    if (!hasMorePortfolio || portfolioLoadingMore) return
    setPortfolioLoadingMore(true)
    try {
      await fetchPortfolioPage(portfolioPage + 1, true)
    } finally {
      setPortfolioLoadingMore(false)
    }
  }

  const loadMoreReviews = async () => {
    if (!hasMoreReviews || reviewsLoadingMore) return
    setReviewsLoadingMore(true)
    try {
      await fetchReviewsPage(reviewsPage + 1, true)
    } finally {
      setReviewsLoadingMore(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalyticsEvents(analyticsRangeDays)
    }
    if (activeTab === 'settings') {
      fetchServiceOrderConfig()
    }
  }, [activeTab, analyticsRangeDays])

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black uppercase text-black/20 bg-[var(--background)]">RoneAdmin...</div>

  return (
    <div data-testid="admin-dashboard" className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans flex flex-col md:flex-row relative">
      
      {/* SIDEBAR */}
      <div className="w-full md:w-72 bg-gradient-to-b from-[#1f1721] to-[#2c1f2c] text-white p-6 md:p-10 flex flex-col justify-between rounded-b-[2.5rem] md:rounded-b-none md:rounded-r-[3.5rem] shadow-2xl z-30">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic font-bold mb-8 md:mb-12 text-center md:text-left">RoneLashes</h1>
          <nav className="flex md:flex-col gap-2 overflow-x-auto no-scrollbar md:overflow-visible pb-4 md:pb-0">
            {[ { id: 'appointments', label: '📅 Agenda' }, { id: 'settings', label: '⚙️ Program' }, { id: 'finance', label: '💰 Venituri' }, { id: 'analytics', label: '📈 Analytics' }, { id: 'services', label: '💅 Servicii' }, { id: 'portfolio', label: '📸 Portofoliu' }, { id: 'reviews', label: '⭐ Recenzii' } ].map((t: any) => (
              <button data-testid={`admin-tab-${t.id}`} key={t.id} onClick={() => setActiveTab(t.id)} className={`ui-btn px-5 md:px-8 py-3 md:py-5 rounded-2xl font-black uppercase text-[10px] md:text-[11px] tracking-widest transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-[#e21a6e] text-white shadow-xl scale-105' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}> {t.label} </button>
            ))}
            <button onClick={handleLogout} className="md:hidden px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all bg-red-500/10 text-red-400">Deconectare</button>
          </nav>
        </div>
        <button onClick={handleLogout} className="hidden md:block ui-btn py-5 bg-white/5 rounded-2xl text-[11px] font-black uppercase hover:bg-white/10 transition-all">Deconectare</button>
      </div>

      {/* CONTINUT PRINCIPAL */}
      <div className="flex-1 p-4 md:p-10 overflow-y-auto no-scrollbar ui-shell">
        
        {activeTab === 'appointments' && (
          <div className="animate-in fade-in duration-700">
            {/* Statistici */}
            <div className="flex flex-wrap gap-3 mb-8">
              {[ { label: 'Azi', val: calculateIncome('today'), color: 'text-green-600' }, { label: 'Luna', val: calculateIncome('month'), color: 'text-[#e21a6e]' }, { label: 'An', val: calculateIncome('year'), color: 'text-black' } ].map((s, i) => (
                <div key={i} className="ui-card px-5 py-3 rounded-2xl flex items-center gap-3">
                  <p className="text-[9px] font-black uppercase opacity-40">{s.label}:</p>
                  <p className={`text-sm font-black ${s.color}`}>{s.val} RON</p>
                </div>
              ))}
              {[{ label: 'Book 7 zile', val: weekBookings }, { label: 'Book lună', val: monthBookings }, { label: 'Anulări lună', val: `${monthCancelRate}%` }, { label: 'Waitlist', val: waitlist.length }].map((kpi, i) => (
                <div key={`kpi-${i}`} className="ui-card px-5 py-3 rounded-2xl flex items-center gap-3">
                  <p className="text-[9px] font-black uppercase opacity-40">{kpi.label}:</p>
                  <p className="text-sm font-black text-black">{kpi.val}</p>
                </div>
              ))}
              <div className="ml-auto flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                <button onClick={() => setShowPauseModal(true)} className="ui-btn flex-1 md:flex-none bg-gray-200 text-black px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-sm hover:bg-gray-300 transition-all">☕ Pauză</button>
                <button onClick={() => setShowManualBooking(true)} className="ui-btn ui-btn-primary flex-1 md:flex-none px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg">+ Programare</button>
              </div>
            </div>

            {/* Waitlist */}
            {waitlist.length > 0 && (
              <div className="mb-8 p-6 ui-card-soft rounded-[2.5rem] shadow-sm animate-in fade-in">
                <h3 className="text-xl font-serif italic font-bold mb-4 flex items-center gap-2 text-black">⏳ Lista de Așteptare <span className="bg-[#e21a6e] text-white text-[10px] px-3 py-1 rounded-full not-italic">{waitlist.length}</span></h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {waitlist.map(w => {
                     let cleanPhone = w.client_phone.trim(); if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
                     const msg = `Bună, ${w.client_name}! S-a eliberat un loc la gene pentru data de ${format(parseISO(w.desired_date), 'dd MMMM', { locale: ro })}. Ai dori să te programez? ✨`;
                     return (
                      <div key={w.id} className="ui-card p-5 rounded-3xl flex justify-between items-center">
                        <div><p className="font-black text-sm text-black">{w.client_name}</p><p className="text-[10px] font-black uppercase text-[#e21a6e] tracking-widest">{format(parseISO(w.desired_date), 'dd MMMM yyyy', { locale: ro })}</p></div>
                        <div className="flex gap-2">
                          <a href={`https://wa.me/40${cleanPhone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" className="bg-[#25D366] text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-md">💬</a>
                          <button onClick={() => deleteItem('waitlist', w.id)} className="bg-red-50 text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs">✕</button>
                        </div>
                      </div>
                     )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-8">
              {/* Calendar Agenda */}
              <div className="ui-card p-4 rounded-[2.5rem] h-fit mx-auto lg:mx-0">
                <DayPicker mode="single" selected={selectedAgendaDate} onSelect={(d) => d && setSelectedAgendaDate(d)} locale={ro} modifiers={{ booked: bookedDays }} modifiersClassNames={{ booked: 'rdp-day_booked' }} className="admin-calendar" />
                <div className="mt-4 flex items-center justify-center gap-2 border-t pt-4">
                   <div className="w-3 h-3 rounded-full border-2 border-[#e21a6e]"></div>
                   <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Zile cu programări</p>
                </div>
              </div>

              {/* Lista Vizite Zi Selectată */}
              <div className="flex-1">
                <div className="mb-6 flex justify-between items-end px-2">
                  <div>
                    <h2 className="text-3xl font-serif italic font-bold capitalize">{format(selectedAgendaDate, 'EEEE', { locale: ro })}</h2>
                    <p className="text-sm font-bold opacity-40">{format(selectedAgendaDate, 'dd MMMM yyyy', { locale: ro })}</p>
                  </div>
                  <p className="text-[10px] font-black uppercase opacity-40">{appointmentsForSelectedDate.length} Vizite / Pauze</p>
                </div>

                <div className="space-y-4">
                  {appointmentsForSelectedDate.length > 0 ? appointmentsForSelectedDate.map(app => {
                    const isRejected = app.status === 'rejected'; const isCanceled = app.status === 'canceled'; 
                    const isPause = app.client_phone === '-'; 
                    
                    if (isPause) {
                      return (
                        <div key={app.id} className="bg-gray-50 p-5 md:p-6 rounded-[2.5rem] shadow-inner border border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 opacity-80">
                          <div className="flex items-center gap-5">
                            <div className="bg-gray-200 h-14 w-14 rounded-2xl flex flex-col items-center justify-center border border-gray-300">
                              <p className="text-lg font-black text-gray-500">{format(parseISO(app.start_time), 'HH:mm')}</p>
                            </div>
                            <div>
                              <h4 className="font-black text-lg leading-none text-gray-600">☕ {app.client_name}</h4>
                              <p className="text-[10px] font-black uppercase text-gray-400 mt-1">Până la {format(parseISO(app.end_time), 'HH:mm')}</p>
                            </div>
                          </div>
                          <button onClick={() => deleteItem('appointments', app.id)} className="px-4 py-2 bg-white text-red-500 rounded-xl font-black text-[9px] uppercase border border-gray-200">Șterge Pauza</button>
                        </div>
                      )
                    }

                    return (
                      <div key={app.id} className={`ui-card p-5 md:p-6 rounded-[2.5rem] shadow-sm border border-[var(--border-soft)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group hover:shadow-xl transition-all ${isRejected ? 'bg-red-50/30 border-red-100' : isCanceled ? 'bg-gray-50/50' : ''}`}>
                        <div className={`flex items-center gap-5 ${isRejected || isCanceled ? 'opacity-50' : ''}`}>
                          <div className="bg-gray-50 h-14 w-14 rounded-2xl flex flex-col items-center justify-center border border-gray-100">
                            <p className="text-lg font-black">{format(parseISO(app.start_time), 'HH:mm')}</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-black text-lg leading-none">{app.client_name}</h4>
                              {isRejected && <span className="bg-red-100 text-red-600 text-[9px] font-black uppercase px-2 py-1 rounded-md">Refuzată</span>}
                              {isCanceled && <span className="bg-gray-200 text-gray-500 text-[9px] font-black uppercase px-2 py-1 rounded-md">Anulată</span>}
                              {app.status === 'completed' && <span className="bg-green-100 text-green-600 text-[9px] font-black uppercase px-2 py-1 rounded-md">Finalizată</span>}
                            </div>
                            <p className="text-[10px] font-black uppercase text-[#e21a6e]">{app.notes}</p>
                            <p className="text-[10px] font-bold opacity-40">📞 {app.client_phone} | {app.total_price} RON</p>
                          </div>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                          {!isRejected && !isCanceled && (
                            <>
                              <button onClick={() => handleComplete(app)} className={`flex-1 md:flex-none px-4 py-2 rounded-xl font-black text-[9px] uppercase transition-all ${app.status === 'completed' ? 'bg-green-600 text-white shadow-lg' : 'bg-green-50 text-green-600'}`}> ✓ </button>
                              <button onClick={() => handleReject(app)} className="flex-1 md:flex-none px-4 py-2 bg-orange-50 text-orange-600 rounded-xl font-black text-[9px] uppercase">Refuză</button>
                              <button onClick={() => handleRemind(app)} className="flex-1 md:flex-none px-4 py-2 bg-blue-50 text-blue-500 rounded-xl font-black text-[12px] uppercase">🔔</button>
                            </>
                          )}
                          <button onClick={() => deleteItem('appointments', app.id)} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-black text-[12px]">🗑️</button>
                        </div>
                      </div>
                    )
                  }) : (
                    <div className="py-20 text-center ui-card rounded-[3rem] border-2 border-dashed border-gray-100">
                      <p className="font-serif italic opacity-30">Nicio programare găsită.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL PROGRAMARE MANUALĂ ACTUALIZATĂ (FĂRĂ SUPRAPUNERI) */}
        {showManualBooking && (
          <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
            <div className="ui-card w-full max-w-xl rounded-[2.5rem] p-8 md:p-12 relative overflow-y-auto max-h-[90vh]">
              <button onClick={() => { setShowManualBooking(false); setIsExistingClient(false); }} className="absolute top-8 right-8 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center font-black text-black hover:bg-gray-200">✕</button>
              <h3 className="text-2xl font-serif italic font-bold mb-8 text-black text-center">Programare Manuală</h3>
              <div className="space-y-4 mb-8 text-black">
                <input placeholder="Telefon Clientă" className="ui-input" value={manualForm.phone} onChange={e => setManualForm({...manualForm, phone: e.target.value})} />
                <input placeholder="Nume Clientă" className={`ui-input ${isExistingClient ? 'border-green-500' : ''}`} value={manualForm.name} onChange={e => setManualForm({...manualForm, name: e.target.value})} />
                <select className="ui-input" value={manualForm.serviceId} onChange={e => setManualForm({...manualForm, serviceId: e.target.value, time: ''})}>
                  <option value="">1. Alege Serviciul...</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} — {s.price}</option>)}
                </select>
                
                {manualForm.serviceId && (
                   <>
                    <p className="text-[10px] font-black uppercase opacity-40 text-center mt-4 tracking-widest">2. Alege Data</p>
                    <div className="flex justify-center scale-90 border border-gray-100 rounded-3xl bg-gray-50 p-2">
                      <DayPicker mode="single" selected={manualForm.date} onSelect={(d) => setManualForm({...manualForm, date: d, time: ''})} locale={ro} disabled={[ { before: new Date() }, { dayOfWeek: disabledDaysOfWeek }, (date) => isDateInClosure(date) ]} />
                    </div>
                   </>
                )}

                {manualForm.date && (
                  <>
                    <p className="text-[10px] font-black uppercase opacity-40 text-center mt-4 tracking-widest">3. Alege Ora Liberă</p>
                    <div className="grid grid-cols-4 gap-2">
                       {getAdminAvailableTimes(manualForm.date, services.find(x => x.id === manualForm.serviceId)?.duration_minutes || 60).map(slot => (
                         <button 
                           key={slot} 
                           onClick={() => setManualForm({...manualForm, time: slot})} 
                           className={`py-3 rounded-xl font-black text-xs transition-all ${manualForm.time === slot ? 'bg-[#e21a6e] text-white scale-105 shadow-md' : 'bg-gray-100 hover:bg-gray-200'}`}
                         >
                           {slot}
                         </button>
                       ))}
                    </div>
                    {getAdminAvailableTimes(manualForm.date, services.find(x => x.id === manualForm.serviceId)?.duration_minutes || 60).length === 0 && (
                      <p className="text-center text-xs text-red-500 font-bold">Nicio oră disponibilă pentru acest serviciu în ziua selectată.</p>
                    )}
                  </>
                )}
              </div>
              <button 
                onClick={handleManualBooking} 
                disabled={!manualForm.time} 
                className="ui-btn ui-btn-primary w-full py-5 font-black rounded-3xl uppercase tracking-widest shadow-xl hover:bg-black transition-colors disabled:opacity-30"
              >
                Salvează & WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* MODAL PAUZĂ ACTUALIZATĂ (FĂRĂ SUPRAPUNERI) */}
        {showPauseModal && (
          <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
            <div className="ui-card w-full max-w-lg rounded-[2.5rem] p-8 md:p-12 relative overflow-y-auto max-h-[90vh]">
              <button onClick={() => setShowPauseModal(false)} className="absolute top-8 right-8 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center font-black text-black hover:bg-gray-200">✕</button>
              <h3 className="text-2xl font-serif italic font-bold mb-8 text-black text-center">☕ Blochează Ore (Pauză)</h3>
              <div className="space-y-4 mb-8 text-black">
                <input placeholder="Motiv (ex: Pauză de masă)" className="ui-input" value={pauseForm.note} onChange={e => setPauseForm({...pauseForm, note: e.target.value})} />
                <select className="ui-input" value={pauseForm.duration} onChange={e => setPauseForm({...pauseForm, duration: parseInt(e.target.value), time: ''})}>
                  <option value={30}>Durată: 30 Minute</option>
                  <option value={60}>Durată: 1 Oră</option>
                  <option value={120}>Durată: 2 Ore</option>
                  <option value={180}>Durată: 3 Ore</option>
                </select>
                <div className="flex justify-center scale-90 border border-gray-100 rounded-3xl bg-gray-50 p-2">
                  <DayPicker mode="single" selected={pauseForm.date} onSelect={(d) => setPauseForm({...pauseForm, date: d, time: ''})} locale={ro} disabled={[ { before: new Date() }, { dayOfWeek: disabledDaysOfWeek }, (date) => isDateInClosure(date) ]} />
                </div>
                
                {pauseForm.date && (
                  <>
                    <p className="text-[10px] font-black uppercase opacity-40 text-center mt-2 tracking-widest">Alege intervalul liber</p>
                    <div className="grid grid-cols-4 gap-2">
                      {getAdminAvailableTimes(pauseForm.date, pauseForm.duration).map(slot => (
                        <button 
                          key={slot} 
                          onClick={() => setPauseForm({...pauseForm, time: slot})} 
                          className={`py-3 rounded-xl font-black text-xs transition-all ${pauseForm.time === slot ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button 
                onClick={handleSavePause} 
                disabled={!pauseForm.time} 
                className="ui-btn ui-btn-primary w-full py-5 font-black rounded-3xl uppercase tracking-widest shadow-xl disabled:opacity-30"
              >
                Salvează Pauza
              </button>
            </div>
          </div>
        )}

        {/* --- TABURI: SETĂRI, FINANȚE, SERVICII, PORTOFOLIU (Rămân identice) --- */}
        {activeTab === 'settings' && (
          <div className="animate-in fade-in duration-700">
            <h2 className="text-4xl font-serif italic font-bold mb-10 text-black">Setări Program de Lucru</h2>
            <div className="ui-card p-6 md:p-10 rounded-[3rem] space-y-4 mb-10">
              <h3 className="text-xl font-black mb-4">Program Săptămânal Fix</h3>
              {schedule.length > 0 ? schedule.map((item, index) => (
                <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 md:p-6 bg-[var(--surface-muted)] rounded-[2.5rem] border border-[var(--border-soft)] hover:border-[#e21a6e]/30 transition-colors">
                  <span className="w-32 text-lg font-black uppercase text-[#e21a6e] tracking-widest">{daysMap[item.day_of_week]}</span>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <input type="time" value={item.open_time} disabled={item.is_day_off} onChange={(e) => { const newSched = [...schedule]; newSched[index].open_time = e.target.value; setSchedule(newSched); }} className="p-3 bg-white rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none disabled:opacity-30 shadow-sm w-full md:w-auto text-center" />
                    <span className="font-bold opacity-30">-</span>
                    <input type="time" value={item.close_time} disabled={item.is_day_off} onChange={(e) => { const newSched = [...schedule]; newSched[index].close_time = e.target.value; setSchedule(newSched); }} className="p-3 bg-white rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none disabled:opacity-30 shadow-sm w-full md:w-auto text-center" />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer py-2">
                    <input type="checkbox" checked={item.is_day_off} onChange={(e) => { const newSched = [...schedule]; newSched[index].is_day_off = e.target.checked; setSchedule(newSched); }} className="w-6 h-6 accent-[#e21a6e] rounded-md" />
                    <span className="font-black text-[11px] uppercase tracking-widest opacity-40">Închis</span>
                  </label>
                  <button onClick={() => handleUpdateSchedule(item)} className="ui-btn ui-btn-primary w-full md:w-auto px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#e21a6e] transition-all shadow-md"> Salvează </button>
                </div>
              )) : ( <div className="py-8 text-center"><p className="font-serif italic opacity-30 mb-2">Nu s-au găsit setări de program.</p></div> )}
            </div>

            <div className="ui-card p-6 md:p-10 rounded-[3rem] mb-10">
              <h3 className="text-xl font-black mb-6">Ordine categorii/subcategorii (portal client)</h3>
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-4">
                Separă valorile prin virgulă
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <textarea
                  className="ui-input min-h-[120px]"
                  value={categoryOrderInput}
                  onChange={(e) => setCategoryOrderInput(e.target.value)}
                  placeholder="Volum, Efect, Întreținere, Laminare, Sprâncene"
                />
                <textarea
                  className="ui-input min-h-[120px]"
                  value={subcategoryOrderInput}
                  onChange={(e) => setSubcategoryOrderInput(e.target.value)}
                  placeholder="Natural, Soft, Medium, Intens, Mega Volum"
                />
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveServiceOrderConfig}
                  className="ui-btn ui-btn-primary px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#e21a6e] transition-all shadow-md"
                >
                  Salvează ordinea
                </button>
              </div>
            </div>

            <div className="ui-card p-6 md:p-10 rounded-[3rem]">
              <h3 className="text-xl font-black mb-6">Concedii și Zile Libere Excepționale</h3>
              <div className="bg-[var(--surface-muted)] p-6 rounded-[2.5rem] border border-[var(--border-soft)] mb-8">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-4">Adaugă o perioadă nouă</p>
                <div className="flex flex-col xl:flex-row items-start xl:items-end gap-6">
                  <div className="w-full xl:w-auto">
                    <p className="text-xs font-bold mb-2">De la data:</p>
                    <div className="scale-90 transform origin-top-left border border-gray-200 rounded-3xl bg-white p-2 inline-block"><DayPicker mode="single" selected={closureForm.start_date} onSelect={(d) => setClosureForm({...closureForm, start_date: d})} locale={ro} disabled={{ before: new Date() }} /></div>
                  </div>
                  <div className="w-full xl:w-auto">
                    <p className="text-xs font-bold mb-2">Până la data (inclusiv):</p>
                    <div className="scale-90 transform origin-top-left border border-gray-200 rounded-3xl bg-white p-2 inline-block"><DayPicker mode="single" selected={closureForm.end_date} onSelect={(d) => setClosureForm({...closureForm, end_date: d})} locale={ro} disabled={{ before: closureForm.start_date || new Date() }} /></div>
                  </div>
                  <div className="w-full flex-1 flex flex-col gap-4 pb-2">
                    <input placeholder="Motiv (ex: Concediu)" className="ui-input bg-white shadow-sm transition-all" value={closureForm.description} onChange={e => setClosureForm({...closureForm, description: e.target.value})} />
                    <button onClick={handleSaveClosure} className="ui-btn ui-btn-primary w-full py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#e21a6e] transition-all shadow-md">+ Blochează Zilele</button>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                 <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-2">Perioade Blocate Următoare</p>
                 {closures.length > 0 ? closures.map(c => ( <div key={c.id} className="flex justify-between items-center ui-card p-5 rounded-2xl shadow-sm"><div><p className="font-black text-sm">{safeFormatDate(c.start_date, 'dd MMM yyyy')} - {safeFormatDate(c.end_date, 'dd MMM yyyy')}</p><p className="text-[10px] font-black uppercase text-[#e21a6e] tracking-widest">{c.description}</p></div><button onClick={() => deleteItem('salon_closures', c.id)} className="bg-red-50 text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all font-black text-xs">✕</button></div> )) : ( <p className="text-sm opacity-30 italic">Nu ai niciun concediu programat.</p> )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="animate-in fade-in duration-700">
            <h2 className="text-4xl font-serif italic font-bold mb-10">Contabilitate</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">{Object.entries(getIncomesByMonth()).map(([month, data]: any) => ( <button key={month} onClick={() => setSelectedMonth(selectedMonth === month ? null : month)} className={`w-full p-8 rounded-[2.5rem] flex justify-between items-center transition-all border ${selectedMonth === month ? 'bg-black text-white border-black shadow-xl' : 'bg-white border-gray-100 hover:border-[#e21a6e]/30'}`}><span className="text-xl font-black capitalize">{month}</span><p className={`text-sm font-black text-[#e21a6e]`}>{data.total} RON</p></button> ))}</div>
              <div className="ui-card p-10 rounded-[3rem] shadow-sm h-fit">{selectedMonth ? ( <div className="animate-in slide-in-from-right-4"><h3 className="text-xl font-black mb-6 border-b pb-4">Detaliu: {selectedMonth}</h3><div className="space-y-4">{Object.entries(getIncomesByMonth()[selectedMonth].days).sort((a, b) => b[0].localeCompare(a[0])).map(([date, total]: any) => ( <div key={date} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 text-black"><p className="font-bold text-sm">{format(parseISO(date), 'EEEE, dd MMMM', { locale: ro })}</p><p className="font-black text-md">{total} RON</p></div> ))}</div></div> ) : <p className="text-center py-20 opacity-20 italic">Selectează o lună.</p>}</div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
              <h2 className="text-4xl font-serif italic font-bold">Analytics Operațional</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {[7, 14, 30].map((day) => (
                  <button
                    key={day}
                    onClick={() => setAnalyticsRangeDays(day as 7 | 14 | 30)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${analyticsRangeDays === day ? 'bg-black text-white' : 'bg-white border border-gray-200 text-black hover:border-black'}`}
                  >
                    {day}d
                  </button>
                ))}
                <button
                  onClick={() => fetchAnalyticsEvents(analyticsRangeDays)}
                  disabled={analyticsLoading}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white border border-gray-200 text-black hover:border-black disabled:opacity-50"
                >
                  {analyticsLoading ? 'Refresh...' : 'Refresh'}
                </button>
              </div>
            </div>
            <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-6">
              Ultima actualizare: {analyticsLastUpdated ? format(analyticsLastUpdated, 'dd MMM yyyy, HH:mm', { locale: ro }) : 'n/a'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Login Success</p>
                <p className="text-2xl font-black mt-2">{eventFunnel.client_login_success}</p>
              </div>
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Booking Created</p>
                <p className="text-2xl font-black mt-2">{eventFunnel.booking_created}</p>
              </div>
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Waitlist Joined</p>
                <p className="text-2xl font-black mt-2">{eventFunnel.waitlist_joined}</p>
              </div>
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Reviews</p>
                <p className="text-2xl font-black mt-2">{eventFunnel.review_submitted}</p>
              </div>
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Photo Ratings</p>
                <p className="text-2xl font-black mt-2">{eventFunnel.portfolio_rated}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Conversie login → booking</p>
                <p className={`text-2xl font-black mt-2 ${getRateTone(funnelRates.loginToBooking, 45, 25)}`}>{funnelRates.loginToBooking}%</p>
              </div>
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Conversie booking → review</p>
                <p className={`text-2xl font-black mt-2 ${getRateTone(funnelRates.bookingToReview, 35, 15)}`}>{funnelRates.bookingToReview}%</p>
              </div>
              <div className="ui-card p-5 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Pondere waitlist din booking</p>
                <p className={`text-2xl font-black mt-2 ${funnelRates.bookingToWaitlist <= 10 ? 'text-green-600' : funnelRates.bookingToWaitlist <= 20 ? 'text-yellow-600' : 'text-red-600'}`}>{funnelRates.bookingToWaitlist}%</p>
              </div>
            </div>
            <div className="ui-card p-8 md:p-10 rounded-[3rem] shadow-sm mb-8">
              <h3 className="text-xl font-black mb-2">Trend zilnic ultimele {analyticsRangeDays} zile</h3>
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-8">Booking-uri vs anulări</p>
              <div className="space-y-4">
                {analyticsDaily.map((row) => (
                  <div key={row.dayKey} className="grid grid-cols-[72px_1fr] gap-4 items-center">
                    <p className="text-[10px] font-black uppercase opacity-40">{row.label}</p>
                    <div className="space-y-1">
                      <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-black rounded-full" style={{ width: `${(row.bookings / analyticsMaxCount) * 100}%` }} />
                      </div>
                      <div className="h-3 rounded-full bg-red-100 overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${(row.canceled / analyticsMaxCount) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#fff5f8] border border-[#e21a6e]/20 rounded-2xl px-6 py-4 mb-8">
              <p className="text-sm font-bold text-black/80">{analyticsInsight}</p>
            </div>
            <div className={`border rounded-2xl px-6 py-4 mb-8 ${analyticsConfidence.tone}`}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">Încredere semnal: {analyticsConfidence.label}</p>
              <p className="text-sm font-bold">{analyticsConfidence.note}</p>
            </div>
            {analyticsLoading && (
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-4">Se încarcă funnel-ul de evenimente...</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="ui-card p-6 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Booking total {analyticsRangeDays} zile</p>
                <p className="text-3xl font-black mt-3">{analyticsDaily.reduce((acc, d) => acc + d.bookings, 0)}</p>
                <p className={`text-[10px] font-black uppercase mt-2 ${bookingsDeltaPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatDelta(bookingsDeltaPct)} vs perioada anterioară
                </p>
              </div>
              <div className="ui-card p-6 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Anulări total {analyticsRangeDays} zile</p>
                <p className="text-3xl font-black mt-3 text-red-600">{analyticsDaily.reduce((acc, d) => acc + d.canceled, 0)}</p>
                <p className={`text-[10px] font-black uppercase mt-2 ${cancelsDeltaPct <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatDelta(cancelsDeltaPct)} vs perioada anterioară
                </p>
              </div>
              <div className="ui-card p-6 rounded-2xl">
                <p className="text-[10px] font-black uppercase opacity-40 tracking-widest">Rată anulări {analyticsRangeDays} zile</p>
                <p className="text-3xl font-black mt-3">
                  {(() => {
                    const totalBookings = analyticsDaily.reduce((acc, d) => acc + d.bookings, 0)
                    const totalCanceled = analyticsDaily.reduce((acc, d) => acc + d.canceled, 0)
                    if (totalBookings === 0) return '0%'
                    return `${Math.round((totalCanceled / totalBookings) * 100)}%`
                  })()}
                </p>
                <p className={`text-[10px] font-black uppercase mt-2 ${cancelRateDeltaPct <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {cancelRateDeltaPct > 0 ? `+${cancelRateDeltaPct}pp` : `${cancelRateDeltaPct}pp`} vs perioada anterioară
                </p>
              </div>
            </div>
            <div className="ui-card p-6 rounded-2xl mt-8">
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-4">Top zile ocupate ({analyticsRangeDays} zile)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {topBusyDays.length > 0 ? (
                  topBusyDays.map((item) => (
                    <div key={item.day} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <p className="text-xs font-black capitalize">{item.day}</p>
                      <p className="text-lg font-black mt-1">{item.count} programări</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm opacity-40 italic">Nu există suficiente date în intervalul selectat.</p>
                )}
              </div>
            </div>
            <div className="ui-card p-6 rounded-2xl mt-8">
              <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-4">Recomandări automate</p>
              <div className="space-y-2">
                {analyticsRecommendations.map((text, idx) => (
                  <p key={idx} className="text-sm font-bold text-black/80">
                    {idx + 1}. {text}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="animate-in fade-in duration-700">
            <div className="flex justify-between items-center mb-16">
              <h2 className="text-4xl font-serif italic font-bold">Management Servicii</h2>
              <button
                onClick={() => {
                  setIsAddingService(true)
                  setEditingServiceId(null)
                  setServiceForm({ name: '', price: '', duration_minutes: 60, category: '', subcategory: '' })
                }}
                className="bg-black text-white px-10 py-5 rounded-[2rem] text-[11px] font-black uppercase shadow-xl hover:bg-gray-800 transition-colors"
              >
                + Adaugă Nou
              </button>
            </div>
            {isAddingService && (
              <div className="mb-16 ui-card p-12 rounded-[3rem] shadow-2xl border-2 border-[var(--border-soft)] animate-in zoom-in text-black">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                  <input
                    placeholder="Nume"
                    className="p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                  />
                  <input
                    placeholder="Preț"
                    className="p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors"
                    value={serviceForm.price}
                    onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                  />
                  <input
                    type="number"
                    placeholder="Minute"
                    className="p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors"
                    value={serviceForm.duration_minutes}
                    onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: parseInt(e.target.value) })}
                  />
                  <div className="space-y-3">
                    <input
                      list="existing-categories"
                      placeholder="Categorie"
                      className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors"
                      value={serviceForm.category}
                      onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                    />
                    <datalist id="existing-categories">
                      {existingCategories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                    <input
                      list="existing-subcategories"
                      placeholder="Subcategorie (opțional)"
                      className="w-full p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors"
                      value={serviceForm.subcategory}
                      onChange={(e) => setServiceForm({ ...serviceForm, subcategory: e.target.value })}
                    />
                    <datalist id="existing-subcategories">
                      {existingSubcategories.map((subcategory) => (
                        <option key={subcategory} value={subcategory} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button onClick={handleSaveService} className="flex-1 py-6 bg-[#e21a6e] text-white rounded-3xl font-black uppercase shadow-xl hover:bg-black transition-all">
                    Salvează Serviciul
                  </button>
                  <button onClick={() => setIsAddingService(false)} className="px-10 py-6 bg-gray-100 rounded-3xl font-black uppercase text-black hover:bg-gray-200 transition-colors">
                    Anulează
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {services.map((s) => (
                <div key={s.id} className="ui-card p-8 rounded-[3rem] shadow-sm border border-[var(--border-soft)] flex justify-between items-center group hover:border-[#e21a6e]/30 transition-all text-black">
                  <div>
                    <p className="text-[10px] font-black uppercase text-[#e21a6e] mb-1">
                      {s.category || 'Serviciu'}
                      {s.subcategory ? ` / ${s.subcategory}` : ''}
                    </p>
                    <h4 className="text-xl font-black">{s.name}</h4>
                    <p className="text-sm font-bold opacity-30">{s.price} — {s.duration_minutes} min</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingServiceId(s.id)
                        setServiceForm({
                          name: s.name,
                          price: s.price,
                          duration_minutes: s.duration_minutes,
                          category: s.category || '',
                          subcategory: s.subcategory || '',
                        })
                        setIsAddingService(true)
                      }}
                      className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center hover:bg-black hover:text-white transition-all text-black"
                    >
                      ✎
                    </button>
                    <button onClick={() => deleteItem('services', s.id)} className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="animate-in fade-in">
            <div className="flex justify-between items-center mb-16">
              <h2 className="text-4xl font-serif italic font-bold">Portofoliu & Rating</h2>
              <label className="bg-black text-white px-10 py-5 rounded-[2rem] text-[11px] font-black uppercase cursor-pointer shadow-xl hover:bg-[#e21a6e] transition-all">
                {uploading ? 'Se încarcă...' : '+ Încarcă Lucrare'}
                <input type="file" hidden accept="image/*" onChange={handleUpload} disabled={uploading} />
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
              {visiblePortfolioPhotos.map((p) => {
                const ratings = portfolioRatings.filter((r) => r.photo_id === p.id)
                const avg =
                  ratings.length > 0
                    ? (ratings.reduce((acc, r) => acc + r.rating, 0) / ratings.length).toFixed(1)
                    : '0.0'
                return (
                  <div key={p.id} className="group relative aspect-square rounded-[3rem] overflow-hidden border-4 border-white shadow-md hover:shadow-2xl transition-all">
                    <Image src={p.url} alt="Lucrare portofoliu" fill sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw" className="object-cover transition-transform group-hover:scale-125 duration-700" />
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-6 text-center text-white">
                      <p className="font-black text-sm mb-4">⭐ {avg}</p>
                      <button onClick={() => deleteItem('portfolio', p.id)} className="bg-red-50 text-white px-6 py-3 rounded-xl text-[9px] font-black uppercase shadow-xl hover:bg-red-600 transition-colors">Șterge</button>
                    </div>
                  </div>
                )
              })}
            </div>
            {hasMorePortfolio && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMorePortfolio}
                  disabled={portfolioLoadingMore}
                  className="px-8 py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#e21a6e] transition-colors disabled:opacity-50"
                >
                  {portfolioLoadingMore ? 'Se încarcă...' : 'Încarcă mai multe'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="animate-in fade-in duration-700">
            <h2 className="text-4xl font-serif italic font-bold mb-16 text-black">Recenzii Cliente ⭐</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 text-black">
              {visibleReviews.map((rev) => (
                <div key={rev.id} className="ui-card p-10 rounded-[3rem] shadow-sm border border-[#e21a6e]/10 relative group hover:shadow-xl transition-all text-black">
                  <div className="absolute top-0 left-0 w-2 h-full bg-[#e21a6e] opacity-20 group-hover:opacity-100 transition-opacity"></div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h4 className="font-black text-xl leading-tight">{rev.client_name}</h4>
                      <p className="text-[10px] font-black opacity-30 mt-1 tracking-widest">{safeFormatDate(rev.start_time, 'dd MMMM yyyy')}</p>
                    </div>
                    <div className="bg-yellow-50 px-4 py-2 rounded-2xl flex items-center gap-2 border border-yellow-200">
                      <span className="text-yellow-600 font-black text-lg">{rev.rating}</span>
                      <span className="text-yellow-400 text-sm">★</span>
                    </div>
                  </div>
                  <p className="text-[10px] font-black uppercase text-[#e21a6e] mb-3">{rev.notes}</p>
                  <p className="text-sm italic font-medium text-black/70 leading-relaxed mb-6">&quot;{rev.review_text || 'Fără mesaj.'}&quot;</p>
                  <button onClick={() => { if(confirm("Vrei să ștergi recenzia?")) handleResetReview(rev.id) }} className="text-[10px] font-black uppercase opacity-20 hover:opacity-100 transition-opacity text-red-600">Resetare Recenzie</button>
                </div>
              ))}
            </div>
            {hasMoreReviews && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMoreReviews}
                  disabled={reviewsLoadingMore}
                  className="px-8 py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#e21a6e] transition-colors disabled:opacity-50"
                >
                  {reviewsLoadingMore ? 'Se încarcă...' : 'Încarcă mai multe'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        .admin-calendar .rdp-day_selected { background-color: black !important; color: white !important; border-radius: 50% !important; }
        .admin-calendar .rdp-day_booked:not(.rdp-day_selected) { border: 2px solid #e21a6e !important; border-radius: 50% !important; color: #e21a6e !important; font-weight: 900 !important; }
        .admin-calendar .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { background-color: #fce4ec !important; border-radius: 50% !important; }
        @media (max-width: 768px) { .admin-calendar { font-size: 0.85rem; } }
      `}</style>
    </div>
  )
}

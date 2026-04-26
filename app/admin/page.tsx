'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { format, parseISO, isSameDay, isAfter, isBefore, startOfMonth, endOfMonth, startOfYear, endOfYear, addMinutes } from 'date-fns'
import { ro } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'

const daysMap = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'appointments' | 'services' | 'portfolio' | 'reviews' | 'finance' | 'settings'>('appointments')
  
  // Date Bază
  const [appointments, setAppointments] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [portfolioRatings, setPortfolioRatings] = useState<any[]>([])
  const [schedule, setSchedule] = useState<any[]>([]) 
  const [waitlist, setWaitlist] = useState<any[]>([]) 
  const [closures, setClosures] = useState<any[]>([]) 

  // State-uri Agenda & Calendar
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<Date>(new Date())

  // State-uri Finanțe
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  // Gestiune Servicii
  const [isAddingService, setIsAddingService] = useState(false)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceForm, setServiceForm] = useState({ name: '', price: '', duration_minutes: 60, category: '' })

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
  }, [])

  // --- FUNCTIE CAUTARE CLIENT DUPA TELEFON ---
  useEffect(() => {
    const searchClient = async () => {
      if (manualForm.phone.length >= 10) {
        const { data } = await supabase
          .from('clients')
          .select('id, full_name')
          .eq('phone', manualForm.phone)
          .single()
        
        if (data) {
          setManualForm(prev => ({ ...prev, name: data.full_name, clientId: data.id }))
          setIsExistingClient(true)
        } else {
          setManualForm(prev => ({ ...prev, clientId: null }))
          setIsExistingClient(false)
        }
      }
    };
    searchClient();
  }, [manualForm.phone])

  async function fetchAdminData() {
    setLoading(true)
    try {
      const { data: a } = await supabase.from('appointments').select('*').order('start_time', { ascending: false })
      const { data: s } = await supabase.from('services').select('*').order('category')
      const { data: p } = await supabase.from('portfolio').select('*').order('created_at', { ascending: false })
      const { data: pr } = await supabase.from('portfolio_ratings').select('*')
      const { data: sched } = await supabase.from('working_hours').select('*').order('day_of_week', { ascending: true })
      
      const todayString = new Date().toISOString().split('T')[0];
      const { data: w } = await supabase.from('waitlist').select('*').gte('desired_date', todayString).order('desired_date', { ascending: true })
      const { data: c } = await supabase.from('salon_closures').select('*').gte('end_date', todayString).order('start_date', { ascending: true })

      if (a) setAppointments(a)
      if (s) setServices(s)
      if (p) setPhotos(p)
      if (pr) setPortfolioRatings(pr)
      if (sched) setSchedule(sched)
      if (w) setWaitlist(w)
      if (c) setClosures(c)
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
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (!error) fetchAdminData()
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
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (!error) fetchAdminData()
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
    
    const { error } = await supabase.from('appointments').insert({
      client_id: manualForm.clientId, 
      client_name: manualForm.name,
      client_phone: manualForm.phone,
      service_id: manualForm.serviceId,
      notes: `${s?.name} (Manual)`,
      total_price: parseInt(String(s?.price || '0').replace(/\D/g, '')) || 0,
      start_time: start.toISOString(),
      end_time: addMinutes(start, s?.duration_minutes || 60).toISOString(),
      status: 'confirmed'
    })
    
    if (!error) {
      const msg = `Bună, ${manualForm.name}! Te-am programat pe data de ${format(start, 'dd MMMM', {locale: ro})}, la ora ${manualForm.time}. ✨`
      let p = manualForm.phone.trim(); if (p.startsWith('0')) p = p.substring(1)
      window.open(`https://wa.me/40${p}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
      setShowManualBooking(false); setManualForm({ name: '', phone: '', serviceId: '', date: undefined, time: '', clientId: null }); fetchAdminData()
    }
  }

  const handleSavePause = async () => {
    if (!pauseForm.date || !pauseForm.time) return alert("Completează data și ora!")
    const [h, m] = pauseForm.time.split(':'); const start = new Date(pauseForm.date)
    start.setHours(parseInt(h), parseInt(m), 0, 0)
    
    const { error } = await supabase.from('appointments').insert({
      client_name: pauseForm.note, client_phone: '-', notes: 'Interval Blocat', total_price: 0,
      start_time: start.toISOString(), end_time: addMinutes(start, pauseForm.duration).toISOString(), status: 'confirmed'
    })
    if (!error) { setShowPauseModal(false); setPauseForm({ date: undefined, time: '', duration: 60, note: 'Pauză' }); fetchAdminData() }
  }

  const handleSaveService = async () => {
    if (editingServiceId) await supabase.from('services').update(serviceForm).eq('id', editingServiceId)
    else await supabase.from('services').insert([serviceForm])
    setIsAddingService(false); setEditingServiceId(null); fetchAdminData()
  }

  const handleUpload = async (e: any) => {
    setUploading(true)
    try {
      const file = e.target.files?.[0]
      if (!file) return
      const fileName = `${Math.random()}.${file.name.split('.').pop()}`
      await supabase.storage.from('portfolio').upload(fileName, file)
      const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(fileName)
      await supabase.from('portfolio').insert([{ url: publicUrl }])
      fetchAdminData()
    } finally {
      setUploading(false)
    }
  }

  const handleUpdateSchedule = async (day: any) => {
    const { error } = await supabase.from('working_hours').update({ open_time: day.open_time, close_time: day.close_time, is_day_off: day.is_day_off }).eq('day_of_week', day.day_of_week);
    if (!error) alert(`Programul pentru ${daysMap[day.day_of_week]} a fost actualizat!`);
  }

  const handleSaveClosure = async () => {
    if (!closureForm.start_date || !closureForm.end_date) return alert("Alege ambele date!")
    if (isBefore(closureForm.end_date, closureForm.start_date)) return alert("Data de sfârșit invalidă!")
    const { error } = await supabase.from('salon_closures').insert({ start_date: format(closureForm.start_date, 'yyyy-MM-dd'), end_date: format(closureForm.end_date, 'yyyy-MM-dd'), description: closureForm.description });
    if (!error) { alert("Concediu adăugat!"); setClosureForm({ start_date: undefined, end_date: undefined, description: 'Concediu' }); fetchAdminData(); }
  }

  const safeFormatDate = (dateString: string, fmt: string) => { try { return format(parseISO(dateString), fmt, { locale: ro }) } catch { return '' } }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black uppercase text-black/20 bg-[#fafafa]">RoneAdmin...</div>

  const appointmentsForSelectedDate = appointments.filter(a => isSameDay(parseISO(a.start_time), selectedAgendaDate)).sort((a,b) => a.start_time.localeCompare(b.start_time))
  const bookedDays = appointments.filter(a => a.status !== 'rejected' && a.status !== 'canceled' && a.client_phone !== '-').map(a => parseISO(a.start_time))
  const disabledDaysOfWeek = schedule.filter(s => s.is_day_off).map(s => s.day_of_week);

  return (
    <div className="min-h-screen bg-[#fafafa] text-black font-sans flex flex-col md:flex-row relative">
      
      {/* SIDEBAR */}
      <div className="w-full md:w-72 bg-black text-white p-6 md:p-10 flex flex-col justify-between rounded-b-[2.5rem] md:rounded-b-none md:rounded-r-[3.5rem] shadow-2xl z-30">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif italic font-bold mb-8 md:mb-12 text-center md:text-left">RoneLashes</h1>
          <nav className="flex md:flex-col gap-2 overflow-x-auto no-scrollbar md:overflow-visible pb-4 md:pb-0">
            {[ { id: 'appointments', label: '📅 Agenda' }, { id: 'settings', label: '⚙️ Program' }, { id: 'finance', label: '💰 Venituri' }, { id: 'services', label: '💅 Servicii' }, { id: 'portfolio', label: '📸 Portofoliu' }, { id: 'reviews', label: '⭐ Recenzii' } ].map((t: any) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-5 md:px-8 py-3 md:py-5 rounded-2xl font-black uppercase text-[10px] md:text-[11px] tracking-widest transition-all whitespace-nowrap ${activeTab === t.id ? 'bg-[#e21a6e] text-white shadow-xl scale-105' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}> {t.label} </button>
            ))}
            <button onClick={handleLogout} className="md:hidden px-5 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all bg-red-500/10 text-red-400">Deconectare</button>
          </nav>
        </div>
        <button onClick={handleLogout} className="hidden md:block py-5 bg-white/5 rounded-2xl text-[11px] font-black uppercase hover:bg-white/10 transition-all">Deconectare</button>
      </div>

      {/* CONTINUT PRINCIPAL */}
      <div className="flex-1 p-4 md:p-10 overflow-y-auto no-scrollbar">
        
        {activeTab === 'appointments' && (
          <div className="animate-in fade-in duration-700">
            {/* Statistici */}
            <div className="flex flex-wrap gap-3 mb-8">
              {[ { label: 'Azi', val: calculateIncome('today'), color: 'text-green-600' }, { label: 'Luna', val: calculateIncome('month'), color: 'text-[#e21a6e]' }, { label: 'An', val: calculateIncome('year'), color: 'text-black' } ].map((s, i) => (
                <div key={i} className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                  <p className="text-[9px] font-black uppercase opacity-40">{s.label}:</p>
                  <p className={`text-sm font-black ${s.color}`}>{s.val} RON</p>
                </div>
              ))}
              <div className="ml-auto flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                <button onClick={() => setShowPauseModal(true)} className="flex-1 md:flex-none bg-gray-200 text-black px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-sm hover:bg-gray-300 transition-all">☕ Pauză</button>
                <button onClick={() => setShowManualBooking(true)} className="flex-1 md:flex-none bg-black text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg hover:bg-gray-800 transition-all">+ Programare</button>
              </div>
            </div>

            {/* Waitlist */}
            {waitlist.length > 0 && (
              <div className="mb-8 p-6 bg-[#fff5f8] border border-[#e21a6e]/20 rounded-[2.5rem] shadow-sm animate-in fade-in">
                <h3 className="text-xl font-serif italic font-bold mb-4 flex items-center gap-2 text-black">⏳ Lista de Așteptare <span className="bg-[#e21a6e] text-white text-[10px] px-3 py-1 rounded-full not-italic">{waitlist.length}</span></h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {waitlist.map(w => {
                     let cleanPhone = w.client_phone.trim(); if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
                     const msg = `Bună, ${w.client_name}! S-a eliberat un loc la gene pentru data de ${format(parseISO(w.desired_date), 'dd MMMM', { locale: ro })}. Ai dori să te programez? ✨`;
                     return (
                      <div key={w.id} className="bg-white p-5 rounded-3xl flex justify-between items-center shadow-sm border border-[#e21a6e]/10">
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
              <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-gray-100 h-fit mx-auto lg:mx-0">
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
                      <div key={app.id} className={`bg-white p-5 md:p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 group hover:shadow-xl transition-all ${isRejected ? 'bg-red-50/30 border-red-100' : isCanceled ? 'bg-gray-50/50' : ''}`}>
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
                    <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
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
            <div className="bg-white w-full max-w-xl rounded-[3rem] p-8 md:p-12 relative shadow-2xl border-4 border-black overflow-y-auto max-h-[90vh]">
              <button onClick={() => { setShowManualBooking(false); setIsExistingClient(false); }} className="absolute top-8 right-8 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center font-black text-black hover:bg-gray-200">✕</button>
              <h3 className="text-2xl font-serif italic font-bold mb-8 text-black text-center">Programare Manuală</h3>
              <div className="space-y-4 mb-8 text-black">
                <input placeholder="Telefon Clientă" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none" value={manualForm.phone} onChange={e => setManualForm({...manualForm, phone: e.target.value})} />
                <input placeholder="Nume Clientă" className={`w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 ${isExistingClient ? 'border-green-500' : 'border-transparent'} focus:border-black outline-none`} value={manualForm.name} onChange={e => setManualForm({...manualForm, name: e.target.value})} />
                <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none" value={manualForm.serviceId} onChange={e => setManualForm({...manualForm, serviceId: e.target.value, time: ''})}>
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
                className="w-full py-5 bg-[#e21a6e] text-white font-black rounded-3xl uppercase tracking-widest shadow-xl hover:bg-black transition-colors disabled:opacity-30"
              >
                Salvează & WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* MODAL PAUZĂ ACTUALIZATĂ (FĂRĂ SUPRAPUNERI) */}
        {showPauseModal && (
          <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 md:p-12 relative shadow-2xl border-4 border-gray-100 overflow-y-auto max-h-[90vh]">
              <button onClick={() => setShowPauseModal(false)} className="absolute top-8 right-8 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center font-black text-black hover:bg-gray-200">✕</button>
              <h3 className="text-2xl font-serif italic font-bold mb-8 text-black text-center">☕ Blochează Ore (Pauză)</h3>
              <div className="space-y-4 mb-8 text-black">
                <input placeholder="Motiv (ex: Pauză de masă)" className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none" value={pauseForm.note} onChange={e => setPauseForm({...pauseForm, note: e.target.value})} />
                <select className="w-full p-4 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none" value={pauseForm.duration} onChange={e => setPauseForm({...pauseForm, duration: parseInt(e.target.value), time: ''})}>
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
                className="w-full py-5 bg-black text-white font-black rounded-3xl uppercase tracking-widest shadow-xl disabled:opacity-30"
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
            <div className="bg-white p-6 md:p-10 rounded-[3.5rem] shadow-sm border border-gray-100 space-y-4 mb-10">
              <h3 className="text-xl font-black mb-4">Program Săptămânal Fix</h3>
              {schedule.length > 0 ? schedule.map((item, index) => (
                <div key={item.id} className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 md:p-6 bg-gray-50 rounded-[2.5rem] border border-gray-100 hover:border-[#e21a6e]/30 transition-colors">
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
                  <button onClick={() => handleUpdateSchedule(item)} className="w-full md:w-auto bg-black text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#e21a6e] transition-all shadow-md"> Salvează </button>
                </div>
              )) : ( <div className="py-8 text-center"><p className="font-serif italic opacity-30 mb-2">Nu s-au găsit setări de program.</p></div> )}
            </div>

            <div className="bg-white p-6 md:p-10 rounded-[3.5rem] shadow-sm border border-gray-100">
              <h3 className="text-xl font-black mb-6">Concedii și Zile Libere Excepționale</h3>
              <div className="bg-gray-50 p-6 rounded-[2.5rem] border border-gray-100 mb-8">
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
                    <input placeholder="Motiv (ex: Concediu)" className="w-full p-4 bg-white rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none shadow-sm transition-all" value={closureForm.description} onChange={e => setClosureForm({...closureForm, description: e.target.value})} />
                    <button onClick={handleSaveClosure} className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-[#e21a6e] transition-all shadow-md">+ Blochează Zilele</button>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                 <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-2">Perioade Blocate Următoare</p>
                 {closures.length > 0 ? closures.map(c => ( <div key={c.id} className="flex justify-between items-center bg-white border border-gray-100 p-5 rounded-2xl shadow-sm"><div><p className="font-black text-sm">{safeFormatDate(c.start_date, 'dd MMM yyyy')} - {safeFormatDate(c.end_date, 'dd MMM yyyy')}</p><p className="text-[10px] font-black uppercase text-[#e21a6e] tracking-widest">{c.description}</p></div><button onClick={() => deleteItem('salon_closures', c.id)} className="bg-red-50 text-red-500 w-10 h-10 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all font-black text-xs">✕</button></div> )) : ( <p className="text-sm opacity-30 italic">Nu ai niciun concediu programat.</p> )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="animate-in fade-in duration-700">
            <h2 className="text-4xl font-serif italic font-bold mb-10">Contabilitate</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-4">{Object.entries(getIncomesByMonth()).map(([month, data]: any) => ( <button key={month} onClick={() => setSelectedMonth(selectedMonth === month ? null : month)} className={`w-full p-8 rounded-[2.5rem] flex justify-between items-center transition-all border ${selectedMonth === month ? 'bg-black text-white border-black shadow-xl' : 'bg-white border-gray-100 hover:border-[#e21a6e]/30'}`}><span className="text-xl font-black capitalize">{month}</span><p className={`text-sm font-black text-[#e21a6e]`}>{data.total} RON</p></button> ))}</div>
              <div className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm h-fit">{selectedMonth ? ( <div className="animate-in slide-in-from-right-4"><h3 className="text-xl font-black mb-6 border-b pb-4">Detaliu: {selectedMonth}</h3><div className="space-y-4">{Object.entries(getIncomesByMonth()[selectedMonth].days).sort((a, b) => b[0].localeCompare(a[0])).map(([date, total]: any) => ( <div key={date} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 text-black"><p className="font-bold text-sm">{format(parseISO(date), 'EEEE, dd MMMM', { locale: ro })}</p><p className="font-black text-md">{total} RON</p></div> ))}</div></div> ) : <p className="text-center py-20 opacity-20 italic">Selectează o lună.</p>}</div>
            </div>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="animate-in fade-in duration-700">
            <div className="flex justify-between items-center mb-16"><h2 className="text-4xl font-serif italic font-bold">Management Servicii</h2><button onClick={() => { setIsAddingService(true); setEditingServiceId(null); setServiceForm({name:'', price:'', duration_minutes:60, category:''}) }} className="bg-black text-white px-10 py-5 rounded-[2rem] text-[11px] font-black uppercase shadow-xl hover:bg-gray-800 transition-colors">+ Adaugă Nou</button></div>
            {isAddingService && ( <div className="mb-16 bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-black animate-in zoom-in text-black"><div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10"><input placeholder="Nume" className="p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors" value={serviceForm.name} onChange={e => setServiceForm({...serviceForm, name: e.target.value})} /><input placeholder="Preț" className="p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors" value={serviceForm.price} onChange={e => setServiceForm({...serviceForm, price: e.target.value})} /><input type="number" placeholder="Minute" className="p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors" value={serviceForm.duration_minutes} onChange={e => setServiceForm({...serviceForm, duration_minutes: parseInt(e.target.value)})} /><input placeholder="Categorie" className="p-5 bg-gray-50 rounded-2xl font-bold border-2 border-transparent focus:border-black outline-none transition-colors" value={serviceForm.category} onChange={e => setServiceForm({...serviceForm, category: e.target.value})} /></div><div className="flex gap-4"><button onClick={handleSaveService} className="flex-1 py-6 bg-[#e21a6e] text-white rounded-3xl font-black uppercase shadow-xl hover:bg-black transition-all">Salvează Serviciul</button><button onClick={() => setIsAddingService(false)} className="px-10 py-6 bg-gray-100 rounded-3xl font-black uppercase text-black hover:bg-gray-200 transition-colors">Anulează</button></div></div> )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">{services.map(s => ( <div key={s.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100 flex justify-between items-center group hover:border-[#e21a6e]/30 transition-all text-black"><div><p className="text-[10px] font-black uppercase text-[#e21a6e] mb-1">{s.category || 'Serviciu'}</p><h4 className="text-xl font-black">{s.name}</h4><p className="text-sm font-bold opacity-30">{s.price} — {s.duration_minutes} min</p></div><div className="flex gap-2"><button onClick={() => { setEditingServiceId(s.id); setServiceForm({name: s.name, price: s.price, duration_minutes: s.duration_minutes, category: s.category}); setIsAddingService(true); }} className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center hover:bg-black hover:text-white transition-all text-black">✎</button><button onClick={() => deleteItem('services', s.id)} className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">✕</button></div></div> ))}</div>
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="animate-in fade-in"><div className="flex justify-between items-center mb-16"><h2 className="text-4xl font-serif italic font-bold">Portofoliu & Rating</h2><label className="bg-black text-white px-10 py-5 rounded-[2rem] text-[11px] font-black uppercase cursor-pointer shadow-xl hover:bg-[#e21a6e] transition-all">{uploading ? 'Se încarcă...' : '+ Încarcă Lucrare'}<input type="file" hidden accept="image/*" onChange={handleUpload} disabled={uploading} /></label></div><div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">{photos.map(p => { const ratings = portfolioRatings.filter(r => r.photo_id === p.id); const avg = ratings.length > 0 ? (ratings.reduce((acc, r) => acc + r.rating, 0) / ratings.length).toFixed(1) : '0.0'; return ( <div key={p.id} className="group relative aspect-square rounded-[3rem] overflow-hidden border-4 border-white shadow-md hover:shadow-2xl transition-all"><img src={p.url} alt="Lucrare portofoliu" className="w-full h-full object-cover transition-transform group-hover:scale-125 duration-700" /><div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-6 text-center text-white"><p className="font-black text-sm mb-4">⭐ {avg}</p><button onClick={() => deleteItem('portfolio', p.id)} className="bg-red-50 text-white px-6 py-3 rounded-xl text-[9px] font-black uppercase shadow-xl hover:bg-red-600 transition-colors">Șterge</button></div></div> ) })}</div></div>
        )}

        {activeTab === 'reviews' && (
          <div className="animate-in fade-in duration-700"><h2 className="text-4xl font-serif italic font-bold mb-16 text-black">Recenzii Cliente ⭐</h2><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 text-black">{appointments.filter(a => a.rating > 0).map(rev => ( <div key={rev.id} className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-[#e21a6e]/10 relative group hover:shadow-xl transition-all text-black"><div className="absolute top-0 left-0 w-2 h-full bg-[#e21a6e] opacity-20 group-hover:opacity-100 transition-opacity"></div><div className="flex justify-between items-start mb-6"><div><h4 className="font-black text-xl leading-tight">{rev.client_name}</h4><p className="text-[10px] font-black opacity-30 mt-1 tracking-widest">{safeFormatDate(rev.start_time, 'dd MMMM yyyy')}</p></div><div className="bg-yellow-50 px-4 py-2 rounded-2xl flex items-center gap-2 border border-yellow-200"><span className="text-yellow-600 font-black text-lg">{rev.rating}</span><span className="text-yellow-400 text-sm">★</span></div></div><p className="text-[10px] font-black uppercase text-[#e21a6e] mb-3">{rev.notes}</p><p className="text-sm italic font-medium text-black/70 leading-relaxed mb-6">&quot;{rev.review_text || 'Fără mesaj.'}&quot;</p><button onClick={() => { if(confirm("Vrei să ștergi recenzia?")) supabase.from('appointments').update({ rating: 0, review_text: null }).eq('id', rev.id).then(() => fetchAdminData()) }} className="text-[10px] font-black uppercase opacity-20 hover:opacity-100 transition-opacity text-red-600">Resetare Recenzie</button></div> ))}</div></div>
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
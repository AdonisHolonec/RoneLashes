'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setErrorMessage(payload?.error || 'PIN incorect sau accesul admin nu este configurat.')
        setPin('')
        return
      }

      router.push('/admin')
    } catch {
      setErrorMessage('Nu am putut valida PIN-ul. Încearcă din nou.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-black to-gray-900 text-white font-sans">
      <div className="w-full max-w-sm bg-white/10 p-10 rounded-[3rem] shadow-2xl border border-white/20 backdrop-blur-md text-center animate-in zoom-in">
        <h1 className="text-3xl font-serif italic font-bold mb-2">Staff Login</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-8 text-[#e21a6e]">Acces Securizat</p>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <input 
            type="password" 
            maxLength={8} 
            placeholder="PIN 4-8 Cifre" 
            data-testid="admin-pin-input"
            className="w-full p-5 bg-white/5 border-2 border-white/10 rounded-2xl font-bold text-center text-2xl tracking-[1em] text-white outline-none focus:border-[#e21a6e] transition-colors"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          <button 
            type="submit" 
            data-testid="admin-login-submit"
            disabled={isSubmitting}
            className="w-full py-5 bg-[#e21a6e] text-white font-black rounded-3xl uppercase text-xs tracking-widest shadow-xl hover:scale-105 transition-transform"
          >
            {isSubmitting ? 'Se verifică...' : 'Intră în Admin'}
          </button>
          {errorMessage && (
            <p className="text-xs font-bold text-red-300 text-center">{errorMessage}</p>
          )}
        </form>
        
        <button onClick={() => router.push('/')} className="mt-8 text-[10px] font-black uppercase opacity-40 hover:opacity-100 tracking-widest transition-opacity">
          ← Înapoi la site
        </button>
      </div>
    </div>
  )
}

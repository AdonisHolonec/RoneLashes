'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type ReviewAppointment = {
  id: string
  clientName: string
  startTime: string
  notes: string
  rating: number
  reviewText: string
  alreadyReviewed: boolean
}

export default function PublicReviewPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token || ''
  const [appointment, setAppointment] = useState<ReviewAppointment | null>(null)
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/public/review/${token}`, { method: 'GET' })
        const payload = await response.json()
        if (!response.ok) {
          setError(payload?.error || 'Link invalid.')
          return
        }
        setAppointment(payload.appointment)
        setRating(Number(payload.appointment?.rating || 5))
        setReviewText(payload.appointment?.reviewText || '')
      } finally {
        setLoading(false)
      }
    }
    if (token) load()
  }, [token])

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch(`/api/public/review/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, reviewText }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload?.error || 'Recenzia nu a putut fi salvată.')
        return
      }
      setSuccess(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-black px-5 py-10 flex items-center justify-center">
      <section className="ui-card w-full max-w-md rounded-[3rem] p-8 text-center">
        <p className="ui-meta mb-3">RoneLashes</p>
        <h1 className="text-3xl font-serif italic font-bold mb-3">Lasă o recenzie ✨</h1>

        {loading ? (
          <p className="py-12 text-sm font-bold text-black/40">Se încarcă...</p>
        ) : error ? (
          <div className="py-8">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <Link href="/" className="ui-btn inline-block mt-6 px-6 py-3 rounded-2xl bg-black text-white text-[10px] font-black uppercase">
              Înapoi la portal
            </Link>
          </div>
        ) : success ? (
          <div className="py-8">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-5 text-2xl font-black">
              ✓
            </div>
            <p className="font-serif italic text-2xl font-bold mb-2">Mulțumim!</p>
            <p className="text-sm font-bold text-black/55">Recenzia ta a fost salvată.</p>
            <Link href="/" className="ui-btn inline-block mt-6 px-6 py-3 rounded-2xl bg-black text-white text-[10px] font-black uppercase">
              Înapoi la portal
            </Link>
          </div>
        ) : appointment ? (
          <>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#e21a6e] mb-6">
              {appointment.notes || 'Vizită RoneLashes'}
            </p>
            {appointment.alreadyReviewed && (
              <div className="bg-[#fff5f8] border border-[#e21a6e]/15 rounded-2xl p-4 mb-6 text-[11px] font-bold text-black/60">
                Există deja o recenzie pentru această vizită. O poți actualiza mai jos.
              </div>
            )}
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-4xl transition-transform hover:scale-110 ${rating >= star ? 'text-yellow-400' : 'text-gray-200'}`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Cum ți s-a părut experiența? (opțional)"
              className="ui-input min-h-[120px] resize-none text-sm text-black mb-5"
            />
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="ui-btn ui-btn-primary w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {submitting ? 'Se salvează...' : 'Trimite recenzia'}
            </button>
          </>
        ) : null}
      </section>
    </main>
  )
}

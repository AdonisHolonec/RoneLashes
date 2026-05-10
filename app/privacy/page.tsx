import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Politica de Confidențialitate',
  description: 'Politica de confidențialitate RoneLashes pentru portalul de programări online.',
  alternates: {
    canonical: '/privacy',
  },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-black px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex mb-8 text-[10px] font-black uppercase tracking-widest text-black/45 hover:text-[#e21a6e]"
        >
          ← Înapoi la portal
        </Link>

        <section className="ui-card rounded-[3rem] p-7 md:p-12">
          <p className="ui-meta mb-3">RoneLashes</p>
          <h1 className="font-serif italic font-bold text-4xl md:text-5xl mb-5">
            Politica de Confidențialitate
          </h1>
          <p className="text-sm font-bold text-black/60 leading-relaxed mb-8">
            Această pagină explică modul în care RoneLashes - Holonec Ronela folosește datele personale necesare
            pentru crearea contului, programări, comunicare și administrarea serviciilor oferite în salon.
          </p>

          <div className="space-y-8 text-sm leading-relaxed text-black/75">
            <section>
              <h2 className="text-xl font-black text-black mb-3">1. Ce date colectăm</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Nume și prenume.</li>
                <li>Număr de telefon.</li>
                <li>PIN de autentificare, salvat securizat sub formă hash-uită, nu în text simplu.</li>
                <li>Date despre programări: servicii alese, dată, oră, status, preț și observații.</li>
                <li>Preferințe introduse de clientă: stil preferat, sensibilități, observații pentru vizite.</li>
                <li>Recenzii și ratinguri trimise voluntar după vizită.</li>
                <li>Date tehnice minimale pentru securitate, precum momentul logării și adresa IP.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-black mb-3">2. De ce folosim aceste date</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Pentru crearea și administrarea contului de clientă.</li>
                <li>Pentru programarea, modificarea sau anularea vizitelor.</li>
                <li>Pentru comunicări legate de programări, inclusiv confirmări, remindere sau mesaje WhatsApp.</li>
                <li>Pentru păstrarea preferințelor și oferirea unei experiențe personalizate.</li>
                <li>Pentru afișarea recenziilor publice, doar când clienta trimite voluntar o recenzie.</li>
                <li>Pentru securitatea conturilor și prevenirea accesului neautorizat.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-black mb-3">3. Temeiul prelucrării</h2>
              <p>
                Datele sunt prelucrate pentru furnizarea serviciului de programări, administrarea relației cu clienta
                și pe baza acordului exprimat la crearea contului sau la următoarea autentificare pentru conturile
                existente.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-black mb-3">4. Cât timp păstrăm datele</h2>
              <p>
                Datele sunt păstrate atât timp cât contul este activ și cât este necesar pentru administrarea
                programărilor, istoricului vizitelor, obligațiilor operaționale și evidențelor interne. La cerere,
                datele pot fi șterse sau anonimizate, acolo unde legea permite acest lucru.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-black mb-3">5. Cu cine putem partaja datele</h2>
              <p>
                Datele sunt folosite intern pentru administrarea salonului. Anumite servicii tehnice pot procesa date
                strict pentru funcționarea aplicației, de exemplu găzduire, bază de date, email, WhatsApp/Meta sau
                servicii de automatizare. Nu vindem datele personale.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-black mb-3">6. Drepturile tale</h2>
              <p className="mb-3">Poți solicita:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>acces la datele tale;</li>
                <li>corectarea datelor greșite;</li>
                <li>ștergerea contului sau a anumitor informații;</li>
                <li>retragerea acordului pentru prelucrare, acolo unde acesta este temeiul prelucrării;</li>
                <li>informații despre modul în care sunt folosite datele tale.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-black text-black mb-3">7. Contact</h2>
              <p>
                Pentru întrebări sau cereri legate de datele personale, ne poți contacta la telefon{' '}
                <a href="tel:+40743584475" className="font-black text-[#e21a6e]">
                  0743 584 475
                </a>{' '}
                sau prin WhatsApp.
              </p>
            </section>

            <section className="rounded-2xl bg-[#fff5f8] border border-[#e21a6e]/15 p-5">
              <p className="text-[11px] font-bold text-black/55">
                Ultima actualizare: 10 mai 2026. Această pagină are rol informativ pentru clientela RoneLashes și
                poate fi ajustată dacă apar schimbări în aplicație sau în modul de lucru.
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

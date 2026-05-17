import fs from 'fs'

const pagePath = 'app/page.tsx'
let s = fs.readFileSync(pagePath, 'utf8')

const reviewsNew = fs.readFileSync('scripts/fragments/reviews-carousel.txt', 'utf8')
const portfolioNew = fs.readFileSync('scripts/fragments/portfolio-carousel.txt', 'utf8')

const rStart = s.indexOf('            {reviewedAppointments.length > 0 ? (')
const rEnd = s.indexOf('            ) : (\n              <div className="ui-card-soft rounded-[2rem] p-6 text-center border border-white/60">')

if (rStart === -1 || rEnd === -1) {
  console.error('Reviews markers not found', rStart, rEnd)
  process.exit(1)
}

s = s.slice(0, rStart) + reviewsNew + s.slice(rEnd)

const pStart = s.indexOf('            {/* PORTFOLIU CU AUTO-SCROLL ORIZONTAL */}')
const pEnd = s.indexOf('      {/* MODAL RECENZIE VIZITĂ */}')

if (pStart === -1 || pEnd === -1) {
  console.error('Portfolio markers not found', pStart, pEnd)
  process.exit(1)
}

s = s.slice(0, pStart) + portfolioNew + s.slice(pEnd)

fs.writeFileSync(pagePath, s)
console.log('Applied carousel')

import assert from 'node:assert/strict'
import createJiti from 'jiti'

process.env.SALON_TIME_ZONE = 'Europe/Bucharest'
process.env.CLIENT_AUTH_SECRET = 'client-test-secret'
process.env.ADMIN_AUTH_SECRET = 'admin-test-secret'

const jiti = createJiti(import.meta.url)

const {
  buildBookingSummary,
  getSalonDateKey,
  getSalonDayOfWeek,
  isDateInClosures,
  isWithinWorkingHours,
  parseServicePrice,
} = jiti('../lib/booking.ts')
const { buildClientSessionToken, verifyClientSessionToken } = jiti('../lib/client-auth.ts')
const { hashClientPin, verifyClientPin } = jiti('../lib/client-pin.ts')

const cases = [
  {
    name: 'parseServicePrice extracts numeric values safely',
    run() {
      assert.equal(parseServicePrice('230 RON'), 230)
      assert.equal(parseServicePrice('1.450 lei'), 1450)
      assert.equal(parseServicePrice(320), 320)
      assert.equal(parseServicePrice(null), 0)
    },
  },
  {
    name: 'buildBookingSummary aggregates multiple services',
    run() {
      const summary = buildBookingSummary([
        { id: 'svc-1', name: 'Volum Soft', price: '250 RON', duration_minutes: 120 },
        { id: 'svc-2', name: 'Laminare', price: '180', duration_minutes: 60 },
      ])

      assert.deepEqual(summary, {
        durationMinutes: 180,
        totalPrice: 430,
        notes: 'Volum Soft, Laminare',
        serviceId: null,
      })
    },
  },
  {
    name: 'buildBookingSummary keeps single service id for legacy consumers',
    run() {
      const summary = buildBookingSummary([
        { id: 'svc-1', name: 'Intretinere', price: '200', duration_minutes: 90 },
      ])

      assert.equal(summary.serviceId, 'svc-1')
      assert.equal(summary.durationMinutes, 90)
      assert.equal(summary.totalPrice, 200)
    },
  },
  {
    name: 'salon date helpers respect configured timezone',
    run() {
      const bookingDate = new Date('2026-05-03T07:30:00.000Z')

      assert.equal(getSalonDateKey(bookingDate), '2026-05-03')
      assert.equal(getSalonDayOfWeek(bookingDate), 0)
    },
  },
  {
    name: 'isDateInClosures matches inclusive closure windows',
    run() {
      const bookingDate = new Date('2026-08-15T09:00:00+03:00')
      const closures = [
        { start_date: '2026-08-10', end_date: '2026-08-14' },
        { start_date: '2026-08-15', end_date: '2026-08-20' },
      ]

      assert.equal(isDateInClosures(bookingDate, closures), true)
      assert.equal(isDateInClosures(new Date('2026-08-21T09:00:00+03:00'), closures), false)
    },
  },
  {
    name: 'isWithinWorkingHours validates booking boundaries',
    run() {
      const workingHours = {
        open_time: '09:00',
        close_time: '18:00',
        is_day_off: false,
      }

      assert.equal(
        isWithinWorkingHours(new Date('2026-05-04T10:30:00+03:00'), 90, workingHours),
        true,
      )
      assert.equal(
        isWithinWorkingHours(new Date('2026-05-04T17:30:00+03:00'), 60, workingHours),
        false,
      )
      assert.equal(
        isWithinWorkingHours(new Date('2026-05-04T10:30:00+03:00'), 60, { ...workingHours, is_day_off: true }),
        false,
      )
    },
  },
  {
    name: 'client session tokens round-trip and reject tampering',
    run() {
      const token = buildClientSessionToken({
        id: 'client-1',
        phone: '0712345678',
        full_name: 'Test Client',
      })

      const payload = verifyClientSessionToken(token)
      assert.ok(payload)
      assert.equal(payload.id, 'client-1')
      assert.equal(payload.phone, '0712345678')
      assert.equal(payload.fullName, 'Test Client')

      const [encodedPayload, signature] = token.split('.')
      const tampered = `${encodedPayload}.${signature.slice(0, -1)}0`
      assert.equal(verifyClientSessionToken(tampered), null)
    },
  },
  {
    name: 'client pin verification supports hashed and legacy values',
    run() {
      const hashed = hashClientPin('1234')
      assert.equal(verifyClientPin('1234', hashed).valid, true)
      assert.equal(verifyClientPin('9999', hashed).valid, false)

      assert.deepEqual(verifyClientPin('4321', '4321'), {
        valid: true,
        needsUpgrade: true,
      })
    },
  },
]

let failures = 0

for (const testCase of cases) {
  try {
    testCase.run()
    console.log(`PASS ${testCase.name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${testCase.name}`)
    console.error(error)
  }
}

if (failures > 0) {
  process.exitCode = 1
  console.error(`\n${failures} test(s) failed.`)
} else {
  console.log(`\n${cases.length} test(s) passed.`)
}

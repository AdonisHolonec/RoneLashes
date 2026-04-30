const SALON_TIME_ZONE = process.env.SALON_TIME_ZONE || 'Europe/Bucharest'

type TimeWindow = {
  open_time: string | null
  close_time: string | null
  is_day_off: boolean | null
}

type ClosureWindow = {
  start_date: string | null
  end_date: string | null
}

type ServiceInput = {
  id: string
  name: string | null
  price: string | number | null
  duration_minutes: number | null
}

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SALON_TIME_ZONE,
  weekday: 'short',
})

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALON_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SALON_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(':')
  const parsedHours = Number(hours)
  const parsedMinutes = Number(minutes)

  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return null
  }

  return parsedHours * 60 + parsedMinutes
}

export function parseServicePrice(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const digits = String(value || '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

export function getSalonDateKey(date: Date) {
  return dateFormatter.format(date)
}

export function getSalonDayOfWeek(date: Date) {
  const weekday = weekdayFormatter.format(date)
  return weekdayMap[weekday] ?? date.getUTCDay()
}

export function getSalonMinutes(date: Date) {
  const [hours, minutes] = timeFormatter.format(date).split(':')
  return Number(hours) * 60 + Number(minutes)
}

export function isDateInClosures(date: Date, closures: ClosureWindow[]) {
  const localDateKey = getSalonDateKey(date)

  return closures.some((closure) => {
    if (!closure.start_date || !closure.end_date) return false
    return localDateKey >= closure.start_date && localDateKey <= closure.end_date
  })
}

export function isWithinWorkingHours(
  date: Date,
  durationMinutes: number,
  workingHours: TimeWindow | null | undefined,
) {
  if (!workingHours || workingHours.is_day_off || !workingHours.open_time || !workingHours.close_time) {
    return false
  }

  const openMinutes = parseTimeToMinutes(workingHours.open_time)
  const closeMinutes = parseTimeToMinutes(workingHours.close_time)
  if (openMinutes === null || closeMinutes === null) return false

  const startMinutes = getSalonMinutes(date)
  const endMinutes = startMinutes + durationMinutes

  return startMinutes >= openMinutes && endMinutes <= closeMinutes
}

export function buildBookingSummary(services: ServiceInput[]) {
  const durationMinutes = services.reduce((acc, service) => acc + Number(service.duration_minutes || 0), 0)
  const totalPrice = services.reduce((acc, service) => acc + parseServicePrice(service.price), 0)
  const notes = services.map((service) => String(service.name || '').trim()).filter(Boolean).join(', ')

  return {
    durationMinutes,
    totalPrice,
    notes,
    serviceId: services.length === 1 ? services[0].id : null,
  }
}

export function calcNextServiceDate(reportDate: Date, hoursUntilNext: number): Date {
  const days = Math.floor(hoursUntilNext / 24)
  const next = new Date(reportDate)
  next.setDate(next.getDate() + days)
  return next
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function startOfWeek(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  return d
}

export function endOfWeek(): Date {
  const d = startOfWeek()
  d.setDate(d.getDate() + 6) // Sunday
  d.setHours(23, 59, 59, 999)
  return d
}

export function today(): string {
  return toISODate(new Date())
}

export function toDisplayDate(isoDate: string): string {
  if (!isoDate) return '—'
  const [y, m, d] = isoDate.split('-')
  return `${d}-${m}-${y}`
}

// For timestamptz values (edited_at and friends), rendered in the viewer's
// local time. Kept separate from toDisplayDate, which takes a plain
// YYYY-MM-DD calendar date with no time or zone to reason about — passing a
// timestamp through that would show the UTC day, which near midnight IST is
// the wrong one.
export function toDisplayDateTime(timestamp: string): string {
  if (!timestamp) return '—'
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

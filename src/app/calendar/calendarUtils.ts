/**
 * Shared calendar event types, transformer, and date utilities.
 *
 * All three CalendarPage views (Agenda, Board, Grid) derive display data from
 * the same `orders: OrderWithCustomer[]` array loaded by CalendarPage.
 * This file provides the richer CalendarEvent representation used by CalendarGrid,
 * plus date helpers and the overlap-layout algorithm.
 */

import type { RentalOrder, Customer } from '@/types/database'

// ─── Shared types ─────────────────────────────────────────────────────────────

export type OrderWithCustomer = RentalOrder & { customer: Customer | null }

export type CalendarEventType = 'event' | 'delivery' | 'pickup' | 'overdue'

export interface CalendarEvent {
  id: string                    // `${order.id}-${type}` — unique render key
  type: CalendarEventType
  date: string                  // YYYY-MM-DD anchor date for this entry
  startMinutes: number | null   // minutes from midnight; null = all-day / unscheduled
  endMinutes: number | null
  order: OrderWithCustomer
  title: string
  subtitle: string              // customer name
  location: string | null
}

export interface LayoutEvent extends CalendarEvent {
  column: number
  totalColumns: number
}

// ─── Event type display config ────────────────────────────────────────────────

export const GRID_EVENT_CONFIG: Record<CalendarEventType, {
  label: string
  blockBg: string    // solid bg for timed event blocks in week/day view
  blockText: string
  chipBg: string     // muted bg for all-day chips and month view cells
  chipText: string
}> = {
  event:    { label: 'Event',    blockBg: 'bg-pink-500',   blockText: 'text-white', chipBg: 'bg-pink-100',   chipText: 'text-pink-700'   },
  delivery: { label: 'Delivery', blockBg: 'bg-blue-500',   blockText: 'text-white', chipBg: 'bg-blue-100',   chipText: 'text-blue-700'   },
  pickup:   { label: 'Pickup',   blockBg: 'bg-violet-500', blockText: 'text-white', chipBg: 'bg-violet-100', chipText: 'text-violet-700' },
  overdue:  { label: 'Overdue',  blockBg: 'bg-red-500',    blockText: 'text-white', chipBg: 'bg-red-100',    chipText: 'text-red-700'    },
}

// ─── Transformer ──────────────────────────────────────────────────────────────

function parseTime(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return isNaN(h) || isNaN(m) ? null : h * 60 + m
}

function cxName(order: OrderWithCustomer): string {
  const c = order.customer
  if (!c) return ''
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || ''
}

function orderLocation(order: OrderWithCustomer): string | null {
  return order.venue_name
    ? [order.venue_name, order.venue_city].filter(Boolean).join(', ')
    : order.venue_city ?? null
}

/**
 * Converts the shared `orders[]` array into `CalendarEvent[]` for the grid view.
 * This is the canonical grid transformer — agenda and board derive their own
 * simpler structures inline, but all three views read from the same `orders[]`.
 */
export function buildCalendarEvents(orders: OrderWithCustomer[]): CalendarEvent[] {
  const events: CalendarEvent[] = []

  for (const order of orders) {
    const sub  = cxName(order)
    const loc  = orderLocation(order)
    const over = order.status === 'overdue'

    if (order.event_date) {
      const s = parseTime(order.event_start_time)
      const e = parseTime(order.event_end_time) ?? (s !== null ? s + 120 : null)
      events.push({
        id: `${order.id}-event`,
        type: over ? 'overdue' : 'event',
        date: order.event_date,
        startMinutes: s,
        endMinutes: e,
        order,
        title: order.event_name ?? `Order ${order.order_number}`,
        subtitle: sub,
        location: loc,
      })
    }

    if (order.delivery_date) {
      const s = parseTime(order.delivery_time)
      events.push({
        id: `${order.id}-delivery`,
        type: over ? 'overdue' : 'delivery',
        date: order.delivery_date,
        startMinutes: s,
        endMinutes: s !== null ? s + 60 : null,
        order,
        title: `Delivery · ${order.order_number}`,
        subtitle: sub,
        location: loc,
      })
    }

    if (order.pickup_date) {
      const s = parseTime(order.pickup_time)
      events.push({
        id: `${order.id}-pickup`,
        type: over ? 'overdue' : 'pickup',
        date: order.pickup_date,
        startMinutes: s,
        endMinutes: s !== null ? s + 60 : null,
        order,
        title: `Pickup · ${order.order_number}`,
        subtitle: sub,
        location: loc,
      })
    }

    // Overdue orders with no date entries get pinned to today so they appear in the grid
    if (over && !order.event_date && !order.delivery_date && !order.pickup_date) {
      events.push({
        id: `${order.id}-overdue`,
        type: 'overdue',
        date: todayISO(),
        startMinutes: null,
        endMinutes: null,
        order,
        title: `Overdue · ${order.order_number}`,
        subtitle: sub,
        location: null,
      })
    }
  }

  return events
}

// ─── Date utilities (plain JS, zero deps) ────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function toDateStr(d: Date): string {
  // Use local date parts to avoid UTC-shift on date-only values
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns the Sunday that starts the ISO week containing `d`. */
export function startOfWeekSun(d: Date): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7)
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

export function startOfMonthDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isTodayDate(d: Date): boolean {
  return isSameDay(d, new Date())
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function fmtWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const s = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${s} – ${e}`
}

export function fmtDayFull(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

// ─── Overlap layout algorithm ─────────────────────────────────────────────────

/**
 * Given events for a single day column, assigns `column` and `totalColumns`
 * for side-by-side overlap rendering using a greedy sweep-line approach.
 *
 * Returns `{ timed, allDay }` — timed events have column assignments,
 * all-day / unscheduled events are returned separately.
 */
export function layoutDayEvents(events: CalendarEvent[]): {
  timed: LayoutEvent[]
  allDay: CalendarEvent[]
} {
  const timed  = events.filter(e => e.startMinutes !== null)
  const allDay = events.filter(e => e.startMinutes === null)

  // Sort by start time ascending
  const sorted = [...timed].sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0))

  // Greedy column assignment: place each event in the first column where it fits
  const colEnds: number[] = []   // colEnds[i] = end-minute of last event in column i
  const assigned: LayoutEvent[] = []

  for (const ev of sorted) {
    const s = ev.startMinutes!
    const e = ev.endMinutes ?? s + 60
    let col = colEnds.findIndex(end => end <= s)
    if (col === -1) { col = colEnds.length; colEnds.push(e) }
    else { colEnds[col] = e }
    assigned.push({ ...ev, column: col, totalColumns: 1 })
  }

  // Second pass: set totalColumns = max column index + 1 across all overlapping events
  for (let i = 0; i < assigned.length; i++) {
    const s1 = assigned[i].startMinutes!
    const e1 = assigned[i].endMinutes ?? s1 + 60
    let maxCol = assigned[i].column
    for (let j = 0; j < assigned.length; j++) {
      const s2 = assigned[j].startMinutes!
      const e2 = assigned[j].endMinutes ?? s2 + 60
      if (s2 < e1 && e2 > s1) maxCol = Math.max(maxCol, assigned[j].column)
    }
    assigned[i] = { ...assigned[i], totalColumns: maxCol + 1 }
  }

  return { timed: assigned, allDay }
}

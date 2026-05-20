/**
 * CalendarGrid — Outlook/Google-style scheduling grid view.
 *
 * Supports Day, Week, and Month sub-views.
 * Zero external dependencies; layout is pure CSS + inline styles.
 *
 * Data contract: receives `events: CalendarEvent[]` derived from the same
 * `orders[]` array used by the Agenda and Board views. No separate queries.
 */

import { useRef, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarEvent, LayoutEvent } from './calendarUtils'
import {
  GRID_EVENT_CONFIG,
  layoutDayEvents,
  startOfWeekSun,
  addDays,
  addWeeks,
  addMonths,
  startOfMonthDate,
  isTodayDate,
  toDateStr,
  fmtMonthYear,
  fmtWeekRange,
  fmtDayFull,
} from './calendarUtils'

// ─── Layout constants ─────────────────────────────────────────────────────────

const PX_PER_HOUR = 64                   // 64px per hour → 1 min ≈ 1.067px
const PX_PER_MIN  = PX_PER_HOUR / 60
const TOTAL_PX    = 24 * PX_PER_HOUR    // 1536px full day height
const SCROLL_TO   = 7 * PX_PER_HOUR     // auto-scroll to 7 am on mount

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS     = Array.from({ length: 24 }, (_, i) => i)

export type GridSubView = 'day' | 'week' | 'month'

// ─── Props ────────────────────────────────────────────────────────────────────

interface CalendarGridProps {
  events: CalendarEvent[]
  anchor: Date
  gridSubView: GridSubView
  onSetAnchor: (d: Date) => void
  onEventClick: (orderId: string) => void
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function hourLabel(h: number): string {
  if (h === 0)  return '12 am'
  if (h < 12)   return `${h} am`
  if (h === 12) return '12 pm'
  return `${h - 12} pm`
}

function eventsByDateMap(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const arr = map.get(ev.date) ?? []
    arr.push(ev)
    map.set(ev.date, arr)
  }
  return map
}

// ─── Current-time indicator ───────────────────────────────────────────────────

function NowLine() {
  const now = new Date()
  const top = (now.getHours() * 60 + now.getMinutes()) * PX_PER_MIN
  return (
    <div
      className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
      style={{ top }}
    >
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
      <div className="flex-1 h-px bg-red-500" />
    </div>
  )
}

// ─── Timed event block (week / day view) ─────────────────────────────────────

function EventBlock({
  ev, colIndex, totalCols, onClick,
}: {
  ev: LayoutEvent
  colIndex: number
  totalCols: number
  onClick: () => void
}) {
  const cfg     = GRID_EVENT_CONFIG[ev.type]
  const start   = ev.startMinutes ?? 0
  const end     = ev.endMinutes   ?? start + 60
  const top     = start * PX_PER_MIN
  const height  = Math.max(18, (end - start) * PX_PER_MIN)
  const wPct    = (1 / totalCols) * 100
  const lPct    = colIndex * wPct
  const compact = height < 36

  return (
    <button
      onClick={onClick}
      title={`${ev.title}${ev.subtitle ? ' · ' + ev.subtitle : ''}${ev.location ? ' · ' + ev.location : ''}`}
      className={`absolute rounded-md text-left cursor-pointer overflow-hidden
        shadow-sm z-10 hover:brightness-110 transition-all
        ${cfg.blockBg} ${cfg.blockText}`}
      style={{
        top:    `${top}px`,
        height: `${height}px`,
        left:   `calc(${lPct}% + 2px)`,
        width:  `calc(${wPct}% - 4px)`,
        padding: compact ? '0 4px' : '2px 5px',
      }}
    >
      {compact ? (
        <p className="text-[10px] font-semibold truncate leading-none mt-px">{ev.title}</p>
      ) : (
        <>
          <p className="text-[11px] font-semibold truncate leading-tight">{ev.title}</p>
          {ev.subtitle && (
            <p className="text-[10px] opacity-85 truncate leading-none">{ev.subtitle}</p>
          )}
          {height >= 68 && ev.location && (
            <p className="text-[10px] opacity-70 truncate leading-none mt-0.5">{ev.location}</p>
          )}
        </>
      )}
    </button>
  )
}

// ─── All-day / unscheduled chip ───────────────────────────────────────────────

function AllDayChip({ ev, onClick }: { ev: CalendarEvent; onClick: () => void }) {
  const cfg = GRID_EVENT_CONFIG[ev.type]
  return (
    <button
      onClick={onClick}
      title={ev.title}
      className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] font-medium
        truncate hover:brightness-95 transition-all
        ${cfg.chipBg} ${cfg.chipText}`}
    >
      {ev.title}
    </button>
  )
}

// ─── Week / Day time grid ─────────────────────────────────────────────────────

function WeekDayGrid({
  days, eventsMap, onEventClick,
}: {
  days: Date[]
  eventsMap: Map<string, CalendarEvent[]>
  onEventClick: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to 7 am on mount and whenever the days array changes (view switch)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO
  }, [days.length])

  // Pre-compute layout for every visible day
  const layoutByDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutDayEvents>>()
    for (const day of days) {
      const ds = toDateStr(day)
      map.set(ds, layoutDayEvents(eventsMap.get(ds) ?? []))
    }
    return map
  }, [days, eventsMap])

  // Check whether any day has all-day events so we can skip the row when empty
  const hasAllDay = days.some(day => (layoutByDate.get(toDateStr(day))?.allDay.length ?? 0) > 0)

  return (
    <div className="flex flex-col flex-1 min-h-0 border border-border rounded-xl overflow-hidden bg-card">

      {/* ── Day header row ─────────────────────────────────────────────────── */}
      <div className="flex border-b border-border bg-muted/30 flex-shrink-0">
        <div className="w-14 flex-shrink-0 border-r border-border" /> {/* gutter spacer */}
        {days.map((day, i) => (
          <div
            key={i}
            className={`flex-1 py-2 text-center border-r border-border last:border-r-0 ${
              isTodayDate(day) ? 'bg-primary/5' : ''
            }`}
          >
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {DAY_NAMES[day.getDay()]}
            </p>
            <p className={`text-sm font-semibold mt-0.5 w-7 h-7 rounded-full
              flex items-center justify-center mx-auto leading-none
              ${isTodayDate(day)
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground'
              }`}
            >
              {day.getDate()}
            </p>
          </div>
        ))}
      </div>

      {/* ── All-day row (hidden when empty) ────────────────────────────────── */}
      {hasAllDay && (
        <div className="flex border-b border-border bg-muted/10 flex-shrink-0">
          <div className="w-14 flex-shrink-0 border-r border-border flex items-center justify-end pr-2 py-1">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">all‑day</span>
          </div>
          {days.map((day, i) => {
            const ds      = toDateStr(day)
            const allDay  = layoutByDate.get(ds)?.allDay ?? []
            return (
              <div
                key={i}
                className={`flex-1 p-1 space-y-0.5 border-r border-border last:border-r-0 min-h-[28px] ${
                  isTodayDate(day) ? 'bg-primary/5' : ''
                }`}
              >
                {allDay.map(ev => (
                  <AllDayChip key={ev.id} ev={ev} onClick={() => onEventClick(ev.order.id)} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Scrollable time grid ────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: TOTAL_PX }}>

          {/* Hour gutter */}
          <div className="w-14 flex-shrink-0 border-r border-border relative select-none">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute right-0 w-full pr-2 text-[10px] text-muted-foreground text-right"
                style={{ top: h * PX_PER_HOUR - 8 }}
              >
                {h > 0 ? hourLabel(h) : ''}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, i) => {
            const ds     = toDateStr(day)
            const layout = layoutByDate.get(ds) ?? { timed: [], allDay: [] }
            const isNow  = isTodayDate(day)

            return (
              <div
                key={i}
                className={`flex-1 border-r border-border last:border-r-0 relative ${
                  isNow ? 'bg-primary/[0.03]' : ''
                }`}
                style={{ height: TOTAL_PX }}
              >
                {/* Full-hour grid lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/40 pointer-events-none"
                    style={{ top: h * PX_PER_HOUR }}
                  />
                ))}
                {/* Half-hour grid lines */}
                {HOURS.map(h => (
                  <div
                    key={`hh${h}`}
                    className="absolute left-0 right-0 border-t border-border/20 pointer-events-none"
                    style={{ top: h * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                  />
                ))}

                {/* Current time line */}
                {isNow && <NowLine />}

                {/* Timed event blocks */}
                {layout.timed.map(ev => (
                  <EventBlock
                    key={ev.id}
                    ev={ev}
                    colIndex={ev.column}
                    totalCols={ev.totalColumns}
                    onClick={() => onEventClick(ev.order.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Month grid ───────────────────────────────────────────────────────────────

function MonthGrid({
  anchor, eventsMap, onEventClick,
}: {
  anchor: Date
  eventsMap: Map<string, CalendarEvent[]>
  onEventClick: (id: string) => void
}) {
  const monthStart = startOfMonthDate(anchor)
  const cellStart  = startOfWeekSun(monthStart)
  // Always render 6 weeks = 42 cells (covers every possible month layout)
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => addDays(cellStart, i))
  const curMonth = anchor.getMonth()

  return (
    <div className="flex flex-col flex-1 min-h-0 border border-border rounded-xl overflow-hidden bg-card">

      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/30 flex-shrink-0">
        {DAY_NAMES.map(d => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-r border-border last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6-row grid */}
      <div className="flex-1 grid grid-rows-6 overflow-hidden">
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
              const ds       = toDateStr(day)
              const dayEvs   = eventsMap.get(ds) ?? []
              const shown    = dayEvs.slice(0, 3)
              const overflow = dayEvs.length - shown.length
              const inMonth  = day.getMonth() === curMonth
              const isToday  = isTodayDate(day)

              return (
                <div
                  key={col}
                  className={`p-1 border-r border-border last:border-r-0 flex flex-col min-h-[88px] ${
                    inMonth ? '' : 'bg-muted/20'
                  } ${isToday ? 'bg-primary/5' : ''}`}
                >
                  {/* Date number */}
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full
                    text-xs font-semibold flex-shrink-0 mb-0.5 ${
                    isToday
                      ? 'bg-primary text-primary-foreground'
                      : inMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground/60'
                  }`}>
                    {day.getDate()}
                  </div>

                  {/* Event chips */}
                  <div className="flex-1 space-y-0.5 overflow-hidden">
                    {shown.map(ev => {
                      const cfg = GRID_EVENT_CONFIG[ev.type]
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onEventClick(ev.order.id)}
                          title={ev.title}
                          className={`w-full text-left rounded px-1 text-[10px] font-medium
                            truncate hover:brightness-95 transition-all leading-[1.5]
                            ${cfg.chipBg} ${cfg.chipText}`}
                        >
                          {ev.startMinutes !== null && (
                            <span className="opacity-70 mr-0.5">
                              {String(Math.floor(ev.startMinutes / 60)).padStart(2, '0')}:
                              {String(ev.startMinutes % 60).padStart(2, '0')}
                            </span>
                          )}
                          {ev.title}
                        </button>
                      )
                    })}
                    {overflow > 0 && (
                      <p className="text-[10px] text-muted-foreground px-1 leading-none">
                        +{overflow} more
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function CalendarGrid({
  events, anchor, gridSubView, onSetAnchor, onEventClick,
}: CalendarGridProps) {

  const weekStart = startOfWeekSun(anchor)
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Filter events to the visible time window for performance
  const visibleEvents = useMemo(() => {
    if (gridSubView === 'day') {
      const d = toDateStr(anchor)
      return events.filter(e => e.date === d)
    }
    if (gridSubView === 'week') {
      const start = toDateStr(weekStart)
      const end   = toDateStr(addDays(weekStart, 6))
      return events.filter(e => e.date >= start && e.date <= end)
    }
    // month
    const ms    = startOfMonthDate(anchor)
    const start = toDateStr(startOfWeekSun(ms))               // include leading days
    const end   = toDateStr(addDays(startOfWeekSun(ms), 41))  // 6 weeks
    return events.filter(e => e.date >= start && e.date <= end)
  }, [events, anchor, gridSubView, weekStart])

  const evMap = useMemo(() => eventsByDateMap(visibleEvents), [visibleEvents])

  // Navigation
  function navigate(dir: -1 | 0 | 1) {
    if (dir === 0) { onSetAnchor(new Date()); return }
    if (gridSubView === 'day')   onSetAnchor(addDays(anchor, dir))
    if (gridSubView === 'week')  onSetAnchor(addWeeks(anchor, dir))
    if (gridSubView === 'month') onSetAnchor(addMonths(anchor, dir))
  }

  const navLabel =
    gridSubView === 'day'   ? fmtDayFull(anchor)         :
    gridSubView === 'week'  ? fmtWeekRange(weekStart)    :
                              fmtMonthYear(anchor)

  return (
    <div
      className="flex flex-col gap-3 animate-fade-in"
      style={{ height: 'calc(100vh - 248px)', minHeight: 520 }}
    >
      {/* ── Grid nav bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => navigate(0)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border
            bg-card hover:bg-muted transition-colors"
        >
          Today
        </button>
        <div className="flex items-center">
          <button
            onClick={() => navigate(-1)}
            aria-label="Previous"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => navigate(1)}
            aria-label="Next"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm font-semibold text-foreground">{navLabel}</p>
      </div>

      {/* ── Grid content ────────────────────────────────────────────────────── */}
      {gridSubView === 'month' ? (
        <MonthGrid
          anchor={anchor}
          eventsMap={evMap}
          onEventClick={onEventClick}
        />
      ) : (
        <WeekDayGrid
          days={gridSubView === 'week' ? weekDays : [anchor]}
          eventsMap={evMap}
          onEventClick={onEventClick}
        />
      )}
    </div>
  )
}

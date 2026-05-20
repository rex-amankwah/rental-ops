import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, Truck, RotateCcw, Star, Loader2, AlertTriangle,
  LayoutList, Columns, Clock, CalendarDays,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { ORDER_STATUS_CONFIG, formatDate } from '@/lib/constants'
import type { OrderStatus } from '@/types/database'
import CalendarGrid from './CalendarGrid'
import type { GridSubView } from './CalendarGrid'
import {
  buildCalendarEvents,
  fmtMonthYear, fmtWeekRange, fmtDayFull, startOfWeekSun,
} from './calendarUtils'
import type { OrderWithCustomer } from './calendarUtils'

type ViewMode = 'agenda' | 'grid' | 'board'

interface CalendarEntry {
  date: string
  type: 'event' | 'delivery' | 'pickup'
  order: OrderWithCustomer
}

const TYPE_CONFIG = {
  event:    { label: 'Event',    icon: Star,      color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-200' },
  delivery: { label: 'Delivery', icon: Truck,     color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  pickup:   { label: 'Pickup',   icon: RotateCcw, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
}

const FILTER_OPTIONS = [
  { value: 'all',      label: 'All' },
  { value: 'event',    label: 'Events' },
  { value: 'delivery', label: 'Deliveries' },
  { value: 'pickup',   label: 'Pickups' },
]

function todayStr() { return new Date().toISOString().split('T')[0] }

function plusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function groupByDate(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>()
  for (const e of entries) {
    const existing = map.get(e.date) ?? []
    existing.push(e)
    map.set(e.date, existing)
  }
  return map
}

function isToday(dateStr: string) { return dateStr === todayStr() }

function isTomorrow(dateStr: string) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return dateStr === tomorrow.toISOString().split('T')[0]
}

function dateLabel(dateStr: string) {
  if (isToday(dateStr)) return 'Today'
  if (isTomorrow(dateStr)) return 'Tomorrow'
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function customerName(order: OrderWithCustomer): string {
  if (!order.customer) return '—'
  const c = order.customer
  return [c.first_name, c.last_name].filter(Boolean).join(' ') + (c.company_name ? ` · ${c.company_name}` : '')
}

// ─── Board card ───────────────────────────────────────────────────────────────
function BoardCard({
  order, dateLabel: label, timeLabel, typeLabel, typeColor, navigate,
}: {
  order: OrderWithCustomer
  dateLabel: string
  timeLabel?: string
  typeLabel?: string
  typeColor?: string
  navigate: (path: string) => void
}) {
  const statusCfg = ORDER_STATUS_CONFIG[order.status as OrderStatus]
  return (
    <button
      onClick={() => navigate(`/orders/${order.id}`)}
      className="w-full text-left bg-card border border-border rounded-lg p-3 hover:border-primary/40 hover:shadow-sm transition-all space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-foreground">{order.order_number}</span>
        <span className={`badge text-[10px] ${statusCfg?.bg ?? 'bg-muted'} ${statusCfg?.color ?? 'text-muted-foreground'}`}>
          {statusCfg?.label ?? order.status}
        </span>
      </div>
      {order.event_name && (
        <p className="text-sm font-medium text-foreground leading-snug truncate">{order.event_name}</p>
      )}
      <p className="text-xs text-muted-foreground truncate">{customerName(order)}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 flex-shrink-0" />
        <span>{label}{timeLabel ? ` · ${timeLabel}` : ''}</span>
        {typeLabel && <span className={`ml-1 font-medium ${typeColor ?? ''}`}>{typeLabel}</span>}
      </div>
    </button>
  )
}

// ─── Board column ─────────────────────────────────────────────────────────────
function BoardColumn({
  title, color, bg, count, children,
}: {
  title: string; color: string; bg: string; count: number; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-w-[220px]">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${bg}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{title}</p>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/60 ${color}`}>{count}</span>
      </div>
      <div className="flex-1 bg-muted/20 rounded-b-lg border border-border border-t-0 p-2 space-y-2 min-h-[120px]">
        {count === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nothing here</p>
        ) : children}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('agenda')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [range, setRange] = useState<'30' | '60' | '90'>('30')
  // Grid-view state
  const [gridSubView, setGridSubView] = useState<GridSubView>('week')
  const [gridAnchor, setGridAnchor] = useState<Date>(() => new Date())

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true); setFetchError(null)
    const windowEnd = plusDays(parseInt(range))
    const cid = profile.company_id
    try {
      const { data, error } = await supabase
        .from('rental_orders')
        .select('*, customer:customers(id,first_name,last_name,company_name)')
        .eq('company_id', cid)
        .not('status', 'in', '("cancelled","closed")')
        .or([
          `event_date.gte.${todayStr()},event_date.lte.${windowEnd}`,
          `delivery_date.gte.${todayStr()},delivery_date.lte.${windowEnd}`,
          `pickup_date.gte.${todayStr()},pickup_date.lte.${windowEnd}`,
          `status.eq.overdue`,
        ].join(','))
        .order('event_date', { ascending: true })
        .limit(350)

      if (error) throw error
      setOrders((data ?? []) as unknown as OrderWithCustomer[])
    } catch (err: unknown) {
      setFetchError((err as { message?: string }).message ?? String(err))
    } finally { setLoading(false) }
  }, [profile?.company_id, range])

  useEffect(() => { load() }, [load])

  // ─── Agenda data ──────────────────────────────────────────────────────────
  const allEntries: CalendarEntry[] = []
  for (const order of orders) {
    if (order.event_date    && order.event_date    >= todayStr()) allEntries.push({ date: order.event_date,    type: 'event',    order })
    if (order.delivery_date && order.delivery_date >= todayStr()) allEntries.push({ date: order.delivery_date, type: 'delivery', order })
    if (order.pickup_date   && order.pickup_date   >= todayStr()) allEntries.push({ date: order.pickup_date,   type: 'pickup',   order })
  }
  allEntries.sort((a, b) => a.date.localeCompare(b.date))

  const filtered  = typeFilter === 'all' ? allEntries : allEntries.filter(e => e.type === typeFilter)
  const grouped   = groupByDate(filtered)
  const sortedDates = Array.from(grouped.keys()).sort()

  // ─── Board data (all derived from same `orders` array as agenda) ─────────
  const overdueOrders   = orders.filter(o => o.status === 'overdue')
  const boardEvents     = allEntries.filter(e => e.type === 'event')
  const boardDeliveries = allEntries.filter(e => e.type === 'delivery')
  const boardPickups    = allEntries.filter(e => e.type === 'pickup')

  // ─── Grid data (derived from same `orders` array via shared transformer) ──
  const calendarEvents  = useMemo(() => buildCalendarEvents(orders), [orders])

  return (
    <PageShell>
      <PageHeader
        title="Calendar"
        subtitle={
          viewMode === 'agenda'
            ? `${filtered.length} upcoming date${filtered.length !== 1 ? 's' : ''} · next ${range} days`
            : viewMode === 'grid'
            ? gridSubView === 'month' ? fmtMonthYear(gridAnchor)
              : gridSubView === 'week' ? fmtWeekRange(startOfWeekSun(gridAnchor))
              : fmtDayFull(gridAnchor)
            : `${orders.length} active order${orders.length !== 1 ? 's' : ''} · next ${range} days`
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">

        {/* ── View tab selector: Agenda | Calendar | Board ─────────────────── */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('agenda')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'agenda' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" /> Agenda
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'grid' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" /> Calendar
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'board' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Columns className="w-3.5 h-3.5" /> Board
          </button>
        </div>

        <div className="w-px h-4 bg-border" />

        {/* ── Calendar sub-view: Day | Week | Month ────────────────────────── */}
        {viewMode === 'grid' && (
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            {(['day', 'week', 'month'] as const).map(sv => (
              <button
                key={sv}
                onClick={() => setGridSubView(sv)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  gridSubView === sv
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {sv}
              </button>
            ))}
          </div>
        )}

        {/* ── Type filter — agenda only ────────────────────────────────────── */}
        {viewMode === 'agenda' && (
          <div className="flex items-center gap-1">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTypeFilter(opt.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  typeFilter === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Range — agenda and board only (controls the data window) ─────── */}
        {viewMode !== 'grid' && (
          <>
            {viewMode === 'agenda' && <div className="w-px h-4 bg-border" />}
            <div className="flex items-center gap-1">
              {(['30', '60', '90'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    range === r
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r}d
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {fetchError && (
        <div className="alert alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{fetchError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === 'grid' ? (
        // ── CALENDAR GRID VIEW ──────────────────────────────────────────────
        <CalendarGrid
          events={calendarEvents}
          anchor={gridAnchor}
          gridSubView={gridSubView}
          onSetAnchor={setGridAnchor}
          onEventClick={id => navigate(`/orders/${id}`)}
        />
      ) : viewMode === 'agenda' ? (
        // ── AGENDA VIEW ────────────────────────────────────────────────────
        filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Calendar className="w-7 h-7 text-muted-foreground" /></div>
            <h3 className="text-base font-medium text-foreground mb-1">Nothing scheduled</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              No events, deliveries, or pickups in the next {range} days.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {sortedDates.map(date => {
              const entries = grouped.get(date)!
              return (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full ${isToday(date) ? 'bg-primary' : 'bg-border'}`} />
                    <p className={`text-sm font-semibold ${isToday(date) ? 'text-primary' : 'text-foreground'}`}>
                      {dateLabel(date)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(date)}</p>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{entries.length}</span>
                  </div>

                  <div className="space-y-2 ml-5">
                    {entries.map((entry, idx) => {
                      const cfg = TYPE_CONFIG[entry.type]
                      const Icon = cfg.icon
                      const order = entry.order
                      const customer = order.customer
                      const statusCfg = ORDER_STATUS_CONFIG[order.status as OrderStatus]

                      return (
                        <button
                          key={`${entry.order.id}-${entry.type}-${idx}`}
                          onClick={() => navigate(`/orders/${order.id}`)}
                          className={`w-full text-left rounded-lg border ${cfg.border} ${cfg.bg} px-4 py-3 hover:shadow-sm transition-shadow`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 mt-0.5 ${cfg.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                                <span className="font-mono text-xs font-semibold text-foreground">{order.order_number}</span>
                                <span className={`badge text-xs ${statusCfg?.bg ?? 'bg-muted'} ${statusCfg?.color ?? 'text-muted-foreground'}`}>
                                  {statusCfg?.label ?? order.status}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-3 flex-wrap">
                                {order.event_name && (
                                  <p className="text-sm font-medium text-foreground truncate">{order.event_name}</p>
                                )}
                                {customer && (
                                  <p className="text-xs text-muted-foreground">
                                    {customer.first_name} {customer.last_name}
                                    {customer.company_name && ` · ${customer.company_name}`}
                                  </p>
                                )}
                              </div>
                              {(order.venue_name || order.venue_city) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[order.venue_name, order.venue_city, order.venue_state].filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {entry.type === 'delivery' && order.delivery_time
                                ? order.delivery_time.slice(0, 5)
                                : entry.type === 'pickup' && order.pickup_time
                                ? order.pickup_time.slice(0, 5)
                                : entry.type === 'event' && order.event_start_time
                                ? order.event_start_time.slice(0, 5)
                                : ''}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        // ── BOARD VIEW ─────────────────────────────────────────────────────
        <div className="animate-fade-in overflow-x-auto pb-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-[640px]">

            {/* Upcoming Events */}
            <BoardColumn title="Upcoming Events" color="text-pink-700" bg="bg-pink-50" count={boardEvents.length}>
              {boardEvents.map((entry, i) => (
                <BoardCard
                  key={`ev-${entry.order.id}-${i}`}
                  order={entry.order}
                  dateLabel={formatDate(entry.date)}
                  timeLabel={entry.order.event_start_time?.slice(0, 5)}
                  navigate={navigate}
                />
              ))}
            </BoardColumn>

            {/* Deliveries Due */}
            <BoardColumn title="Deliveries Due" color="text-blue-700" bg="bg-blue-50" count={boardDeliveries.length}>
              {boardDeliveries.map((entry, i) => (
                <BoardCard
                  key={`dl-${entry.order.id}-${i}`}
                  order={entry.order}
                  dateLabel={formatDate(entry.date)}
                  timeLabel={entry.order.delivery_time?.slice(0, 5)}
                  navigate={navigate}
                />
              ))}
            </BoardColumn>

            {/* Pickups Due */}
            <BoardColumn title="Pickups Due" color="text-violet-700" bg="bg-violet-50" count={boardPickups.length}>
              {boardPickups.map((entry, i) => (
                <BoardCard
                  key={`pk-${entry.order.id}-${i}`}
                  order={entry.order}
                  dateLabel={formatDate(entry.date)}
                  timeLabel={entry.order.pickup_time?.slice(0, 5)}
                  navigate={navigate}
                />
              ))}
            </BoardColumn>

            {/* Overdue */}
            <BoardColumn title="Overdue" color="text-red-700" bg="bg-red-50" count={overdueOrders.length}>
              {overdueOrders.map((order, i) => (
                <BoardCard
                  key={`ov-${order.id}-${i}`}
                  order={order}
                  dateLabel={order.event_date ? formatDate(order.event_date) : 'No date'}
                  typeLabel="Overdue"
                  typeColor="text-red-600"
                  navigate={navigate}
                />
              ))}
            </BoardColumn>

          </div>
        </div>
      )}
    </PageShell>
  )
}

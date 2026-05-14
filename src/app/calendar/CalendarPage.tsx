import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Truck, RotateCcw, Star, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { ORDER_STATUS_CONFIG, formatDate } from '@/lib/constants'
import type { RentalOrder, Customer, OrderStatus } from '@/types/database'

type OrderWithCustomer = RentalOrder & { customer: Customer | null }

interface CalendarEntry {
  date: string
  type: 'event' | 'delivery' | 'pickup'
  order: OrderWithCustomer
}

const TYPE_CONFIG = {
  event:    { label: 'Event',    icon: Star,     color: 'text-pink-600',   bg: 'bg-pink-50',   border: 'border-pink-200' },
  delivery: { label: 'Delivery', icon: Truck,    color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  pickup:   { label: 'Pickup',   icon: RotateCcw, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
}

const FILTER_OPTIONS = [
  { value: 'all',      label: 'All' },
  { value: 'event',    label: 'Events' },
  { value: 'delivery', label: 'Deliveries' },
  { value: 'pickup',   label: 'Pickups' },
]

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

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

function isToday(dateStr: string) {
  return dateStr === todayStr()
}

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

export default function CalendarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [range, setRange] = useState<'30' | '60' | '90'>('30')

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true); setFetchError(null)
    const windowEnd = plusDays(parseInt(range))
    try {
      const { data, error } = await supabase
        .from('rental_orders')
        .select('*, customer:customers(id,first_name,last_name,company_name)')
        .eq('company_id', profile.company_id)
        .not('status', 'in', '("cancelled","closed")')
        .or([
          `event_date.gte.${todayStr()},event_date.lte.${windowEnd}`,
          `delivery_date.gte.${todayStr()},delivery_date.lte.${windowEnd}`,
          `pickup_date.gte.${todayStr()},pickup_date.lte.${windowEnd}`,
        ].join(','))
        .order('event_date', { ascending: true })
        .limit(300)
      if (error) throw error
      setOrders((data ?? []) as unknown as OrderWithCustomer[])
    } catch (err: unknown) {
      setFetchError((err as { message?: string }).message ?? String(err))
    } finally { setLoading(false) }
  }, [profile?.company_id, range])

  useEffect(() => { load() }, [load])

  // Build flat list of calendar entries
  const allEntries: CalendarEntry[] = []
  for (const order of orders) {
    if (order.event_date && order.event_date >= todayStr())
      allEntries.push({ date: order.event_date, type: 'event', order })
    if (order.delivery_date && order.delivery_date >= todayStr())
      allEntries.push({ date: order.delivery_date, type: 'delivery', order })
    if (order.pickup_date && order.pickup_date >= todayStr())
      allEntries.push({ date: order.pickup_date, type: 'pickup', order })
  }

  allEntries.sort((a, b) => a.date.localeCompare(b.date))

  const filtered = typeFilter === 'all' ? allEntries : allEntries.filter(e => e.type === typeFilter)
  const grouped = groupByDate(filtered)
  const sortedDates = Array.from(grouped.keys()).sort()

  return (
    <PageShell>
      <PageHeader
        title="Calendar"
        subtitle={`${filtered.length} upcoming date${filtered.length !== 1 ? 's' : ''} · next ${range} days`}
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                typeFilter === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border" />

        {/* Range */}
        <div className="flex items-center gap-1">
          {(['30', '60', '90'] as const).map(r => (
            <button key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                range === r
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}>
              {r}d
            </button>
          ))}
        </div>
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
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Calendar className="w-7 h-7 text-muted-foreground" />
          </div>
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
                {/* Date header */}
                <div className={`flex items-center gap-3 mb-3 ${isToday(date) ? '' : ''}`}>
                  <div className={`flex-shrink-0 w-2 h-2 rounded-full ${isToday(date) ? 'bg-primary' : 'bg-border'}`} />
                  <p className={`text-sm font-semibold ${isToday(date) ? 'text-primary' : 'text-foreground'}`}>
                    {dateLabel(date)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(date)}</p>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {entries.length}
                  </span>
                </div>

                {/* Entries for this date */}
                <div className="space-y-2 ml-5">
                  {entries.map((entry, idx) => {
                    const cfg = TYPE_CONFIG[entry.type]
                    const Icon = cfg.icon
                    const order = entry.order
                    const customer = order.customer as Customer | null
                    const statusCfg = ORDER_STATUS_CONFIG[order.status as OrderStatus]

                    return (
                      <button
                        key={`${entry.order.id}-${entry.type}-${idx}`}
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className={`w-full text-left rounded-lg border ${cfg.border} ${cfg.bg} px-4 py-3 hover:shadow-sm transition-shadow`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Type icon */}
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
      )}
    </PageShell>
  )
}

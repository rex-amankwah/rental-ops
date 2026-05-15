import { ChangeEvent, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Package, SlidersHorizontal, Tag, TrendingDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard, TableToolbar, StatCard } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import { formatCurrency, INVENTORY_CATEGORIES } from '@/lib/constants'
import { TRACKING_TYPE_COLORS, getTrackingTypeClass } from '@/lib/statusColors'
import { calcDepreciation } from '@/lib/depreciation'
import { canEdit } from '@/lib/roles'
import type { InventoryCatalogItem } from '@/types/database'

// ─── Availability bar ────────────────────────────────────────────────────────
function AvailabilityBar({ available, owned }: { available: number; owned: number }) {
  if (owned === 0) return <span className="text-xs text-muted-foreground">—</span>
  const pct = Math.round((available / owned) * 100)
  const color = pct === 0 ? 'bg-red-500' : pct < 25 ? 'bg-red-400' : pct < 60 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{available}/{owned}</span>
    </div>
  )
}

// ─── Inventory status badge ───────────────────────────────────────────────────
function InventoryStatusBadge({ item }: { item: InventoryCatalogItem }) {
  if (item.quantity_owned === 0) {
    return <span className="badge text-xs bg-muted text-muted-foreground">Not Set</span>
  }
  if (item.quantity_available === 0) {
    return <span className="badge text-xs bg-red-100 text-red-700">Out of Stock</span>
  }
  const threshold = item.reorder_point ?? 2
  if (item.quantity_available <= threshold) {
    return <span className="badge text-xs bg-amber-100 text-amber-700">Low Stock</span>
  }
  return <span className="badge text-xs bg-emerald-100 text-emerald-700">Available</span>
}

// ─── Estimated book value cell ────────────────────────────────────────────────
function BookValueCell({ item }: { item: InventoryCatalogItem }) {
  if (item.depreciation_method !== 'straight_line') {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const dep = calcDepreciation(item)
  if (!dep) return <span className="text-xs text-muted-foreground">Not configured</span>
  return (
    <span className="text-sm font-medium text-foreground">
      {formatCurrency(dep.bookValue)}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { profile, appRole } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<InventoryCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [trackingType, setTrackingType] = useState('')
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const fetchItems = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      let query = supabase.from('inventory_catalog').select('*', { count: 'exact' })
        .eq('company_id', profile.company_id).eq('is_active', true)
      if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,description.ilike.%${search}%`)
      if (category) query = query.eq('category', category)
      if (trackingType) query = query.eq('tracking_type', trackingType)
      query = query.order(sortKey, { ascending: sortDir === 'asc' }).limit(100)
      const { data, error, count } = await query
      if (error) throw error
      setItems(data ?? [])
      setTotal(count ?? 0)
    } finally { setLoading(false) }
  }, [profile?.company_id, search, category, trackingType, sortKey, sortDir])

  useEffect(() => {
    const timer = setTimeout(fetchItems, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchItems, search])

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const totalOwned        = items.reduce((a, i) => a + i.quantity_owned, 0)
  const totalAvailable    = items.reduce((a, i) => a + i.quantity_available, 0)
  const totalOut          = items.reduce((a, i) => a + i.quantity_out, 0)
  const lowStockCount     = items.filter(i => {
    const threshold = i.reorder_point ?? 2
    return i.quantity_available <= threshold && i.quantity_owned > 0
  }).length
  const totalReplacement  = items.reduce((a, i) => a + (i.replacement_cost ?? 0) * i.quantity_owned, 0)
  const totalPurchase     = items.reduce((a, i) => a + (i.purchase_cost ?? 0) * i.quantity_owned, 0)
  const withDepreciation  = items.filter(i => i.depreciation_method === 'straight_line').length

  const columns = [
    {
      key: 'name', label: 'Item', sortable: true,
      render: (row: InventoryCatalogItem) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-base">
            {INVENTORY_CATEGORIES.find(c => c.value === row.category)?.icon ?? '📦'}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{row.name}</p>
            {row.sku && <p className="text-xs text-muted-foreground font-mono">{row.sku}</p>}
          </div>
        </div>
      ),
    },
    {
      key: 'category', label: 'Category', sortable: true,
      render: (row: InventoryCatalogItem) => {
        const cat = INVENTORY_CATEGORIES.find(c => c.value === row.category)
        return <span className="badge bg-muted text-muted-foreground text-xs">{cat?.label ?? row.category}</span>
      },
    },
    {
      key: 'tracking_type', label: 'Tracking',
      render: (row: InventoryCatalogItem) => (
        <span className={`badge text-xs ${getTrackingTypeClass(row.tracking_type)}`}>
          {TRACKING_TYPE_COLORS[row.tracking_type]?.label ?? row.tracking_type}
        </span>
      ),
    },
    {
      key: 'quantity_owned', label: 'Owned', sortable: true, align: 'right' as const,
      render: (row: InventoryCatalogItem) => (
        <span className="text-sm text-foreground">{row.quantity_owned}</span>
      ),
    },
    {
      key: 'availability', label: 'Available',
      render: (row: InventoryCatalogItem) => <AvailabilityBar available={row.quantity_available} owned={row.quantity_owned} />,
    },
    {
      key: 'quantity_out', label: 'Out/Reserved', align: 'right' as const,
      render: (row: InventoryCatalogItem) => (
        <div className="text-right">
          <span className={`text-sm ${row.quantity_out > 0 ? 'text-violet-600 font-medium' : 'text-muted-foreground'}`}>
            {row.quantity_out}
          </span>
          {row.quantity_reserved > 0 && (
            <span className="text-xs text-blue-500 ml-1">+{row.quantity_reserved}</span>
          )}
        </div>
      ),
    },
    {
      key: 'rental_rate', label: 'Rate/Day', sortable: true, align: 'right' as const,
      render: (row: InventoryCatalogItem) => (
        <span className="text-sm font-medium text-foreground">{formatCurrency(row.rental_rate)}</span>
      ),
    },
    {
      key: 'replacement_cost', label: 'Replace Cost', sortable: true, align: 'right' as const,
      render: (row: InventoryCatalogItem) => (
        <span className="text-sm text-muted-foreground">
          {row.replacement_cost ? formatCurrency(row.replacement_cost) : '—'}
        </span>
      ),
    },
    {
      key: 'current_book_value', label: 'Est. Book Value', align: 'right' as const,
      render: (row: InventoryCatalogItem) => (
        <div className="text-right"><BookValueCell item={row} /></div>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (row: InventoryCatalogItem) => <InventoryStatusBadge item={row} />,
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Inventory Catalog"
        subtitle={`${total} item type${total !== 1 ? 's' : ''}`}
        actions={canEdit(appRole) ? (
          <button onClick={() => navigate('/inventory/new')} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Owned" value={loading ? '—' : totalOwned.toLocaleString()}
          icon={<Package className="w-5 h-5 text-slate-600" />} iconBg="bg-slate-100" />
        <StatCard label="Available" value={loading ? '—' : totalAvailable.toLocaleString()}
          icon={<Package className="w-5 h-5 text-emerald-600" />} iconBg="bg-emerald-50" colorClass="text-emerald-700" />
        <StatCard label="Currently Out" value={loading ? '—' : totalOut.toLocaleString()}
          icon={<Package className="w-5 h-5 text-violet-600" />} iconBg="bg-violet-50" colorClass="text-violet-700" />
        <StatCard label="Low Stock Items" value={loading ? '—' : lowStockCount} sub="At or below reorder point"
          icon={<Package className="w-5 h-5 text-red-600" />} iconBg="bg-red-50"
          colorClass={lowStockCount > 0 ? 'text-red-700' : 'text-foreground'} />
      </div>

      {/* Valuation summary strip */}
      {!loading && (totalPurchase > 0 || totalReplacement > 0) && (
        <div className="flex flex-wrap gap-4 px-4 py-3 bg-card border border-border rounded-xl text-sm">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Valuation summary:</span>
          </div>
          {totalPurchase > 0 && (
            <span>Purchase cost: <strong>{formatCurrency(totalPurchase)}</strong></span>
          )}
          {totalReplacement > 0 && (
            <span>Replacement value: <strong>{formatCurrency(totalReplacement)}</strong></span>
          )}
          {withDepreciation > 0 && (
            <span className="text-muted-foreground">{withDepreciation} item{withDepreciation !== 1 ? 's' : ''} with depreciation</span>
          )}
        </div>
      )}

      <TableCard>
        <TableToolbar>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input type="search" placeholder="Search items, SKUs..." value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} className="search-input pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <select value={category} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)} className="form-select h-9 text-sm w-36">
              <option value="">All Categories</option>
              {INVENTORY_CATEGORIES.map(cat => <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <select value={trackingType} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTrackingType(e.target.value)} className="form-select h-9 text-sm w-36">
              <option value="">All Types</option>
              <option value="bulk">Bulk</option>
              <option value="serialized">Serialized</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">{items.length} shown</p>
        </TableToolbar>

        <div className="flex items-center gap-1 flex-wrap px-4 py-2 border-b border-border bg-muted/20">
          <button onClick={() => setCategory('')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!category ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            All
          </button>
          {INVENTORY_CATEGORIES.map(cat => (
            <button key={cat.value} onClick={() => setCategory(cat.value === category ? '' : cat.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${category === cat.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          data={items}
          keyField="id"
          onRowClick={(row) => navigate(`/inventory/${(row as InventoryCatalogItem).id}`)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyTitle="No inventory items found"
          emptyDescription={search || category ? 'Try adjusting your filters.' : 'Add your first item to the catalog.'}
        />
      </TableCard>

      {!loading && items.length === 0 && !search && !category && (
        <div className="empty-state">
          <div className="empty-state-icon"><Package className="w-7 h-7 text-muted-foreground" /></div>
          <h3 className="text-base font-medium text-foreground mb-1">No inventory items yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Build your catalog with chairs, tables, tents, canopies, and all your rental items.
          </p>
          {canEdit(appRole) && (
            <button onClick={() => navigate('/inventory/new')} className="btn-primary">
              <Plus className="w-4 h-4" /> Add First Item
            </button>
          )}
        </div>
      )}
    </PageShell>
  )
}

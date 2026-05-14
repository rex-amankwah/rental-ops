import { ChangeEvent, useEffect, useState, useCallback } from 'react'
import { Search, Plus, Package, SlidersHorizontal, Tag, AlertTriangle, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard, TableToolbar, StatCard } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import Modal from '@/components/common/Modal'
import { INVENTORY_CATEGORIES } from '@/lib/constants'
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

// ─── Add Item Modal ───────────────────────────────────────────────────────────
interface AddItemForm {
  name: string
  sku: string
  category: string
  tracking_type: string
  rental_rate: string
  replacement_cost: string
  quantity_owned: string
  warehouse_location: string
  description: string
}

const BLANK_ITEM: AddItemForm = {
  name: '', sku: '', category: 'chairs', tracking_type: 'bulk',
  rental_rate: '0', replacement_cost: '0', quantity_owned: '0',
  warehouse_location: '', description: '',
}

function AddItemModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth()
  const [form, setForm] = useState<AddItemForm>(BLANK_ITEM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof AddItemForm, string>>>({})

  useEffect(() => { if (open) { setForm(BLANK_ITEM); setError(null); setFieldErrors({}) } }, [open])

  function set(k: keyof AddItemForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
    if (fieldErrors[k]) setFieldErrors(p => { const n = { ...p }; delete n[k]; return n })
  }

  function validate(): boolean {
    const e: Partial<Record<keyof AddItemForm, string>> = {}
    if (!form.name.trim()) e.name = 'Item name is required'
    if (!form.category) e.category = 'Category is required'
    const rate = parseFloat(form.rental_rate)
    if (isNaN(rate) || rate < 0) e.rental_rate = 'Enter a valid rate'
    const qty = parseInt(form.quantity_owned)
    if (isNaN(qty) || qty < 0) e.quantity_owned = 'Enter a valid quantity'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate() || !profile?.company_id) return
    setSaving(true); setError(null)
    try {
      const qty = parseInt(form.quantity_owned) || 0
      const { error: e } = await supabase.from('inventory_catalog').insert({
        company_id:         profile.company_id,
        name:               form.name.trim(),
        sku:                form.sku.trim() || null,
        category:           form.category,
        tracking_type:      form.tracking_type,
        rental_rate:        parseFloat(form.rental_rate) || 0,
        replacement_cost:   parseFloat(form.replacement_cost) || 0,
        quantity_owned:     qty,
        quantity_available: qty,
        quantity_reserved:  0,
        quantity_out:       0,
        quantity_damaged:   0,
        quantity_under_repair: 0,
        warehouse_location: form.warehouse_location.trim() || null,
        description:        form.description.trim() || null,
        is_active:          true,
      })
      if (e) throw e
      onSaved(); onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[AddItemModal]', msg)
      setError(msg)
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Inventory Item" size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Add Item</>}
          </button>
        </>
      }>
      <div className="space-y-4">
        {error && <div className="alert alert-error"><AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}
        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div className="col-span-2 space-y-1.5">
            <label className="form-label">Item Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e: ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
              placeholder="White Folding Chair" className={`form-input ${fieldErrors.name ? 'border-red-400' : ''}`} autoFocus />
            {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
          </div>
          {/* SKU */}
          <div className="space-y-1.5">
            <label className="form-label">SKU</label>
            <input type="text" value={form.sku} onChange={(e: ChangeEvent<HTMLInputElement>) => set('sku', e.target.value)}
              placeholder="CHR-WHT-001" className="form-input" />
          </div>
          {/* Category */}
          <div className="space-y-1.5">
            <label className="form-label">Category <span className="text-red-500">*</span></label>
            <select value={form.category} onChange={(e: ChangeEvent<HTMLSelectElement>) => set('category', e.target.value)} className="form-select">
              {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          {/* Tracking type */}
          <div className="space-y-1.5">
            <label className="form-label">Tracking Type</label>
            <select value={form.tracking_type} onChange={(e: ChangeEvent<HTMLSelectElement>) => set('tracking_type', e.target.value)} className="form-select">
              <option value="bulk">Bulk (count-based)</option>
              <option value="serialized">Serialized (individual)</option>
            </select>
          </div>
          {/* Rental rate */}
          <div className="space-y-1.5">
            <label className="form-label">Rate / Day ($) <span className="text-red-500">*</span></label>
            <input type="number" min="0" step="0.01" value={form.rental_rate}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('rental_rate', e.target.value)}
              className={`form-input ${fieldErrors.rental_rate ? 'border-red-400' : ''}`} />
            {fieldErrors.rental_rate && <p className="text-xs text-red-600">{fieldErrors.rental_rate}</p>}
          </div>
          {/* Replacement cost */}
          <div className="space-y-1.5">
            <label className="form-label">Replacement Cost ($)</label>
            <input type="number" min="0" step="0.01" value={form.replacement_cost}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('replacement_cost', e.target.value)} className="form-input" />
          </div>
          {/* Quantity owned */}
          <div className="space-y-1.5">
            <label className="form-label">Quantity Owned <span className="text-red-500">*</span></label>
            <input type="number" min="0" value={form.quantity_owned}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('quantity_owned', e.target.value)}
              className={`form-input ${fieldErrors.quantity_owned ? 'border-red-400' : ''}`} />
            {fieldErrors.quantity_owned && <p className="text-xs text-red-600">{fieldErrors.quantity_owned}</p>}
          </div>
          {/* Warehouse location */}
          <div className="space-y-1.5">
            <label className="form-label">Warehouse Location</label>
            <input type="text" value={form.warehouse_location}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('warehouse_location', e.target.value)}
              placeholder="Bay A" className="form-input" />
          </div>
          {/* Description */}
          <div className="col-span-2 space-y-1.5">
            <label className="form-label">Description</label>
            <textarea value={form.description} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set('description', e.target.value)}
              placeholder="Optional notes about this item…" className="form-input min-h-[60px] resize-y" />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { profile } = useAuth()
  const [items, setItems] = useState<InventoryCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [trackingType, setTrackingType] = useState('')
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryCatalogItem | null>(null)

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

  const totalOwned     = items.reduce((a, i) => a + i.quantity_owned, 0)
  const totalAvailable = items.reduce((a, i) => a + i.quantity_available, 0)
  const totalOut       = items.reduce((a, i) => a + i.quantity_out, 0)
  const lowStockCount  = items.filter(i => i.quantity_available < 3 && i.quantity_owned > 0).length

  const columns = [
    {
      key: 'name', label: 'Item Name', sortable: true,
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
        return <span className="badge bg-muted text-muted-foreground capitalize">{cat?.label ?? row.category}</span>
      },
    },
    {
      key: 'tracking_type', label: 'Tracking',
      render: (row: InventoryCatalogItem) => (
        <span className={`badge text-xs ${row.tracking_type === 'serialized' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
          {row.tracking_type}
        </span>
      ),
    },
    {
      key: 'rental_rate', label: 'Rate / Day', sortable: true, align: 'right' as const,
      render: (row: InventoryCatalogItem) => (
        <span className="text-sm font-medium text-foreground">${row.rental_rate.toFixed(2)}</span>
      ),
    },
    {
      key: 'availability', label: 'Availability',
      render: (row: InventoryCatalogItem) => <AvailabilityBar available={row.quantity_available} owned={row.quantity_owned} />,
    },
    {
      key: 'quantity_out', label: 'Out', align: 'right' as const, sortable: true,
      render: (row: InventoryCatalogItem) => (
        <span className={`text-sm font-medium ${row.quantity_out > 0 ? 'text-violet-600' : 'text-muted-foreground'}`}>{row.quantity_out}</span>
      ),
    },
    {
      key: 'quantity_damaged', label: 'Damaged', align: 'right' as const,
      render: (row: InventoryCatalogItem) => (
        <span className={`text-sm ${row.quantity_damaged > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
          {row.quantity_damaged > 0 ? row.quantity_damaged : '—'}
        </span>
      ),
    },
    {
      key: 'warehouse_location', label: 'Location',
      render: (row: InventoryCatalogItem) => <span className="text-xs text-muted-foreground">{row.warehouse_location || '—'}</span>,
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Inventory Catalog"
        subtitle={`${total} item type${total !== 1 ? 's' : ''}`}
        actions={
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Owned" value={loading ? '—' : totalOwned.toLocaleString()}
          icon={<Package className="w-5 h-5 text-slate-600" />} iconBg="bg-slate-100" />
        <StatCard label="Available" value={loading ? '—' : totalAvailable.toLocaleString()}
          icon={<Package className="w-5 h-5 text-emerald-600" />} iconBg="bg-emerald-50" colorClass="text-emerald-700" />
        <StatCard label="Currently Out" value={loading ? '—' : totalOut.toLocaleString()}
          icon={<Package className="w-5 h-5 text-violet-600" />} iconBg="bg-violet-50" colorClass="text-violet-700" />
        <StatCard label="Low Stock Items" value={loading ? '—' : lowStockCount} sub="Less than 3 available"
          icon={<Package className="w-5 h-5 text-red-600" />} iconBg="bg-red-50"
          colorClass={lowStockCount > 0 ? 'text-red-700' : 'text-foreground'} />
      </div>

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
          onRowClick={(row) => setSelectedItem(row as unknown as InventoryCatalogItem)}
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
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add First Item
          </button>
        </div>
      )}

      {/* Add item modal */}
      <AddItemModal open={showAddModal} onClose={() => setShowAddModal(false)} onSaved={fetchItems} />

      {/* Item quick-view panel */}
      {selectedItem && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedItem(null)} />
          <div className="relative bg-card rounded-xl border border-border shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">{selectedItem.name}</h2>
                {selectedItem.sku && <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedItem.sku}</p>}
              </div>
              <button onClick={() => setSelectedItem(null)} className="btn-ghost p-1.5 flex-shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Category', INVENTORY_CATEGORIES.find(c => c.value === selectedItem.category)?.label ?? selectedItem.category],
                ['Tracking', selectedItem.tracking_type],
                ['Rate / Day', `$${selectedItem.rental_rate.toFixed(2)}`],
                ['Replace Cost', `$${selectedItem.replacement_cost.toFixed(2)}`],
                ['Owned', String(selectedItem.quantity_owned)],
                ['Available', String(selectedItem.quantity_available)],
                ['Out', String(selectedItem.quantity_out)],
                ['Damaged', String(selectedItem.quantity_damaged)],
                ['Location', selectedItem.warehouse_location || '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-medium text-foreground">{v}</p>
                </div>
              ))}
            </div>
            {selectedItem.description && (
              <p className="text-sm text-muted-foreground border-t border-border pt-3">{selectedItem.description}</p>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}

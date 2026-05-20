import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, AlertTriangle, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { INVENTORY_CATEGORIES } from '@/lib/constants'

interface InventoryDraft {
  name: string
  sku: string
  category: string
  tracking_type: string
  rental_rate: string
  replacement_cost: string
  quantity_owned: string
  warehouse_location: string
  description: string
  // Valuation
  purchase_cost: string
  vendor_name: string
  purchase_date: string
  expected_lifespan_months: string
  depreciation_method: string
  residual_value: string
  damage_fee_default: string
  replacement_fee_default: string
  condition_notes: string
  reorder_point: string
}

const BLANK: InventoryDraft = {
  name: '', sku: '', category: 'chairs', tracking_type: 'bulk',
  rental_rate: '0', replacement_cost: '0', quantity_owned: '0',
  warehouse_location: '', description: '',
  purchase_cost: '', vendor_name: '', purchase_date: '',
  expected_lifespan_months: '', depreciation_method: 'none',
  residual_value: '0', damage_fee_default: '', replacement_fee_default: '',
  condition_notes: '', reorder_point: '',
}

// ─── Tracking type helper text ────────────────────────────────────────────────

const TRACKING_HELPER: Record<string, string> = {
  bulk:       'Best for chairs, tables, linens, and quantity-based inventory. Tracks quantities only — no individual asset IDs.',
  serialized: 'Best for high-value equipment like speakers and projectors. Each item is individually tracked and prepared for future QR/barcode workflows.',
  hybrid:     'Best for premium rental inventory that may occasionally need individual tracking. Combines quantity tracking with flexible asset-level workflows.',
}

// ─── Draft persistence ────────────────────────────────────────────────────────

const DRAFT_KEY = 'rental_ops_inventory_new_draft'

function loadDraft(): InventoryDraft | null {
  try { const r = sessionStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveDraft(d: InventoryDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function NewInventoryPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<InventoryDraft>(loadDraft() ?? BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof InventoryDraft, string>>>({})

  useEffect(() => { saveDraft(form) }, [form])

  function set(k: keyof InventoryDraft, v: string) {
    setForm(p => ({ ...p, [k]: v }))
    if (fieldErrors[k]) setFieldErrors(p => { const n = { ...p }; delete n[k]; return n })
  }

  function validate(): boolean {
    const e: Partial<Record<keyof InventoryDraft, string>> = {}
    if (!form.name.trim()) e.name = 'Item name is required'
    if (!form.category) e.category = 'Category is required'
    if (isNaN(parseFloat(form.rental_rate)) || parseFloat(form.rental_rate) < 0) e.rental_rate = 'Enter a valid rate'
    if (isNaN(parseInt(form.quantity_owned)) || parseInt(form.quantity_owned) < 0) e.quantity_owned = 'Enter a valid quantity'
    if (form.reorder_point && (isNaN(parseInt(form.reorder_point)) || parseInt(form.reorder_point) < 0)) e.reorder_point = 'Enter a valid reorder point'
    if (form.expected_lifespan_months && (isNaN(parseInt(form.expected_lifespan_months)) || parseInt(form.expected_lifespan_months) <= 0)) {
      e.expected_lifespan_months = 'Enter a positive number of months'
    }
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate() || !profile?.company_id) return
    setSaving(true); setError(null)
    try {
      const qty = parseInt(form.quantity_owned) || 0
      const { data, error: e } = await supabase.from('inventory_catalog').insert({
        company_id:                  profile.company_id,
        name:                        form.name.trim(),
        sku:                         form.sku.trim() || null,
        category:                    form.category,
        tracking_type:               form.tracking_type,
        rental_rate:                 parseFloat(form.rental_rate) || 0,
        replacement_cost:            parseFloat(form.replacement_cost) || 0,
        quantity_owned:              qty,
        quantity_available:          qty,
        quantity_reserved:           0,
        quantity_out:                0,
        quantity_damaged:            0,
        quantity_under_repair:       0,
        warehouse_location:          form.warehouse_location.trim() || null,
        description:                 form.description.trim() || null,
        purchase_cost:               form.purchase_cost ? parseFloat(form.purchase_cost) : null,
        vendor_name:                 form.vendor_name.trim() || null,
        purchase_date:               form.purchase_date || null,
        expected_lifespan_months:    form.expected_lifespan_months ? parseInt(form.expected_lifespan_months) : null,
        depreciation_method:         form.depreciation_method === 'none' ? 'none' : (form.depreciation_method || null),
        residual_value:              parseFloat(form.residual_value) || 0,
        damage_fee_default:          form.damage_fee_default ? parseFloat(form.damage_fee_default) : null,
        replacement_fee_default:     form.replacement_fee_default ? parseFloat(form.replacement_fee_default) : null,
        condition_notes:             form.condition_notes.trim() || null,
        reorder_point:               form.reorder_point ? parseInt(form.reorder_point) : null,
        is_active:                   true,
      }).select('id').single()
      if (e) throw e
      clearDraft()
      navigate(data?.id ? `/inventory/${data.id}` : '/inventory')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save item')
    } finally { setSaving(false) }
  }

  function cancel() { clearDraft(); navigate('/inventory') }

  // Derived helpers
  const qty = parseInt(form.quantity_owned) || 0
  const showSerializedWarning = form.tracking_type === 'serialized' && qty > 1
  const trackingHelper = TRACKING_HELPER[form.tracking_type]

  return (
    <PageShell>
      <PageHeader
        title="Add Inventory Item"
        subtitle="Add a new item to your rental catalog"
        actions={
          <button onClick={cancel} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        }
      />

      <div className="max-w-2xl space-y-5 animate-fade-in">
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* ── A. Operational Details ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Operational Details</h3>
          <div className="grid grid-cols-2 gap-4">

            {/* Item Name */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Item Name <span className="text-red-500">*</span></label>
              <input type="text" autoFocus value={form.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
                placeholder="White Folding Chair"
                className={`form-input ${fieldErrors.name ? 'border-red-400' : ''}`} />
              {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
            </div>

            {/* SKU */}
            <div className="space-y-1.5">
              <label className="form-label">SKU</label>
              <input type="text" value={form.sku}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('sku', e.target.value)}
                placeholder="CHR-WHT-001" className="form-input" />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="form-label">Category <span className="text-red-500">*</span></label>
              <select value={form.category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('category', e.target.value)}
                className="form-select">
                {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
              {fieldErrors.category && <p className="text-xs text-red-600">{fieldErrors.category}</p>}
            </div>

            {/* Tracking Type */}
            <div className="space-y-1.5">
              <label className="form-label">Tracking Type</label>
              <select value={form.tracking_type}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('tracking_type', e.target.value)}
                className="form-select">
                <option value="bulk">Bulk (count-based)</option>
                <option value="serialized">Serialized (individual)</option>
                <option value="hybrid">Hybrid (flexible)</option>
              </select>
            </div>

            {/* Rate / Day */}
            <div className="space-y-1.5">
              <label className="form-label">Rate / Day ($) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" value={form.rental_rate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('rental_rate', e.target.value)}
                className={`form-input ${fieldErrors.rental_rate ? 'border-red-400' : ''}`} />
              {fieldErrors.rental_rate && <p className="text-xs text-red-600">{fieldErrors.rental_rate}</p>}
            </div>

            {/* Tracking type helper — full row */}
            {trackingHelper && (
              <div className="col-span-2 flex items-start gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2.5">
                <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-px" />
                <p className="text-xs text-muted-foreground leading-relaxed">{trackingHelper}</p>
              </div>
            )}

            {/* Quantity Owned */}
            <div className="space-y-1.5">
              <label className="form-label">Quantity Owned <span className="text-red-500">*</span></label>
              <input type="number" min="0" value={form.quantity_owned}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('quantity_owned', e.target.value)}
                className={`form-input ${fieldErrors.quantity_owned ? 'border-red-400' : ''}`} />
              {fieldErrors.quantity_owned && <p className="text-xs text-red-600">{fieldErrors.quantity_owned}</p>}
            </div>

            {/* Storage Location */}
            <div className="space-y-1.5">
              <label className="form-label">Storage Location</label>
              <input type="text" value={form.warehouse_location}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('warehouse_location', e.target.value)}
                placeholder="Bay A" className="form-input" />
            </div>

            {/* Serialized + large quantity soft warning */}
            {showSerializedWarning && (
              <div className="col-span-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-px" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Serialized inventory tracks individual assets separately. Large quantities are usually better suited for Bulk or Hybrid tracking.
                </p>
              </div>
            )}

            {/* Description */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Description</label>
              <textarea value={form.description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set('description', e.target.value)}
                placeholder="Optional notes about this item…"
                className="form-input min-h-[60px] resize-y" />
            </div>
          </div>
        </div>

        {/* ── B. Financial & Depreciation ──────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Financial & Depreciation</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Optional — for book value estimates and asset management. Not tax/accounting-grade.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">

            {/* Unit Purchase Cost */}
            <div className="space-y-1.5">
              <label className="form-label">Unit Purchase Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.purchase_cost}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('purchase_cost', e.target.value)}
                placeholder="0.00" className="form-input" />
              <p className="text-xs text-muted-foreground">Per-item acquisition cost used for valuation and depreciation estimates.</p>
            </div>

            {/* Replacement Cost */}
            <div className="space-y-1.5">
              <label className="form-label">Replacement Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.replacement_cost}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('replacement_cost', e.target.value)}
                className="form-input" />
            </div>

            {/* Purchase Date */}
            <div className="space-y-1.5">
              <label className="form-label">Purchase Date</label>
              <input type="date" value={form.purchase_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('purchase_date', e.target.value)}
                className="form-input" />
            </div>

            {/* Vendor */}
            <div className="space-y-1.5">
              <label className="form-label">Vendor / Supplier</label>
              <input type="text" value={form.vendor_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('vendor_name', e.target.value)}
                placeholder="ABC Rentals Supply Co." className="form-input" />
            </div>

            {/* Depreciation Method */}
            <div className="space-y-1.5">
              <label className="form-label">Depreciation Method</label>
              <select value={form.depreciation_method}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('depreciation_method', e.target.value)}
                className="form-select">
                <option value="none">None (no depreciation)</option>
                <option value="straight_line">Straight-line</option>
              </select>
            </div>

            {form.depreciation_method === 'straight_line' && (
              <>
                <div className="space-y-1.5">
                  <label className="form-label">Useful Life (months)</label>
                  <input type="number" min="1" value={form.expected_lifespan_months}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => set('expected_lifespan_months', e.target.value)}
                    placeholder="60"
                    className={`form-input ${fieldErrors.expected_lifespan_months ? 'border-red-400' : ''}`} />
                  {fieldErrors.expected_lifespan_months && (
                    <p className="text-xs text-red-600">{fieldErrors.expected_lifespan_months}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="form-label">Residual Value ($)</label>
                  <input type="number" min="0" step="0.01" value={form.residual_value}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => set('residual_value', e.target.value)}
                    placeholder="0.00" className="form-input" />
                  <p className="text-xs text-muted-foreground">Book value floor — depreciation stops here.</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── C. Risk & Recovery ───────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Risk & Recovery</h3>
          <div className="grid grid-cols-2 gap-4">

            {/* Default Damage Fee */}
            <div className="space-y-1.5">
              <label className="form-label">Default Damage Fee ($)</label>
              <input type="number" min="0" step="0.01" value={form.damage_fee_default}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('damage_fee_default', e.target.value)}
                placeholder="0.00" className="form-input" />
            </div>

            {/* Customer Replacement Charge */}
            <div className="space-y-1.5">
              <label className="form-label">Customer Replacement Charge ($)</label>
              <input type="number" min="0" step="0.01" value={form.replacement_fee_default}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('replacement_fee_default', e.target.value)}
                placeholder="0.00" className="form-input" />
            </div>

            {/* Reorder Point */}
            <div className="space-y-1.5">
              <label className="form-label">Reorder Point</label>
              <input type="number" min="0" value={form.reorder_point}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('reorder_point', e.target.value)}
                placeholder="e.g. 5"
                className={`form-input ${fieldErrors.reorder_point ? 'border-red-400' : ''}`} />
              {fieldErrors.reorder_point && <p className="text-xs text-red-600">{fieldErrors.reorder_point}</p>}
              <p className="text-xs text-muted-foreground">
                When available quantity drops below this level, low-stock alerts will appear on the dashboard and reports.
              </p>
            </div>

            {/* Condition Notes */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Condition Notes</label>
              <textarea value={form.condition_notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set('condition_notes', e.target.value)}
                placeholder="Current condition, known wear, maintenance history…"
                className="form-input min-h-[60px] resize-y" />
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={cancel} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Add Item</>}
          </button>
        </div>
      </div>
    </PageShell>
  )
}

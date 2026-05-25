/**
 * NewBundlePage — /assets/bundles/new
 *
 * Manager-only form for creating a new asset bundle.
 * qr_code_value is auto-set to bundle_code on create.
 */

import { ChangeEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertTriangle, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { INVENTORY_CATEGORIES } from '@/lib/constants'
import type { InventoryCatalogItem } from '@/types/database'

interface BundleForm {
  bundle_code: string
  name: string
  description: string
  catalog_item_id: string
  notes: string
}

const EMPTY: BundleForm = {
  bundle_code: '',
  name: '',
  description: '',
  catalog_item_id: '',
  notes: '',
}

export default function NewBundlePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<BundleForm>(EMPTY)
  const [catalogItems, setCatalogItems] = useState<InventoryCatalogItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load catalog items for the dropdown
  useEffect(() => {
    async function load() {
      if (!profile?.company_id) return
      const { data } = await supabase
        .from('inventory_catalog')
        .select('id, name, category, tracking_mode')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name')
      setCatalogItems((data ?? []) as InventoryCatalogItem[])
    }
    load()
  }, [profile?.company_id])

  function patch(field: keyof BundleForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    if (error) setError(null)
  }

  // Auto-suggest bundle_code from name (uppercase, replace spaces with hyphens)
  function handleNameChange(value: string) {
    patch('name', value)
    if (!form.bundle_code) {
      const code = value
        .toUpperCase()
        .replace(/[^A-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 20)
      setForm((f) => ({ ...f, name: value, bundle_code: code }))
    }
  }

  async function save() {
    if (!profile?.company_id) return
    if (!form.bundle_code.trim()) { setError('Bundle code is required'); return }
    if (!form.name.trim())        { setError('Bundle name is required'); return }

    setSaving(true)
    setError(null)

    try {
      const code = form.bundle_code.trim().toUpperCase()
      const { data, error: e } = await supabase
        .from('asset_bundles')
        .insert({
          company_id:      profile.company_id,
          bundle_code:     code,
          qr_code_value:   code,             // QR value = bundle_code (same by default)
          name:            form.name.trim(),
          description:     form.description.trim() || null,
          catalog_item_id: form.catalog_item_id || null,
          notes:           form.notes.trim() || null,
          is_active:       true,
          created_by:      profile.id,
        })
        .select('id')
        .single()

      if (e) throw e
      navigate(`/assets/bundles/${(data as { id: string }).id}?printLabel=1`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create bundle'
      if (msg.includes('unique') || msg.includes('duplicate')) {
        setError(`Bundle code "${form.bundle_code.trim().toUpperCase()}" already exists. Choose a different code.`)
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="New Asset Bundle"
        subtitle="Create a cart, pallet, or set for grouped scanning"
        actions={
          <button onClick={() => navigate('/assets/bundles')} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        }
      />

      <div className="max-w-2xl space-y-5 animate-fade-in">
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Identity */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bundle Identity</p>

          <div className="space-y-1.5">
            <label className="form-label">Bundle Name <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
              placeholder="Gold Chair Cart 7"
              className="form-input"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Bundle Code <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={form.bundle_code}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch('bundle_code', e.target.value.toUpperCase())}
              placeholder="CART-CHAIR-07"
              className="form-input font-mono uppercase"
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              This becomes the QR code value. Keep it short and descriptive. Must be unique within your company.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Description</label>
            <textarea
              value={form.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('description', e.target.value)}
              placeholder="50 gold Chiavari chairs on cart 7…"
              rows={2}
              className="form-input resize-y w-full"
            />
          </div>
        </div>

        {/* Catalog Link */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Catalog Item (Optional)</p>
          <div className="space-y-1.5">
            <label className="form-label">Link to Catalog Item</label>
            <select
              value={form.catalog_item_id}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('catalog_item_id', e.target.value)}
              className="form-select"
            >
              <option value="">— Mixed / Not specified —</option>
              {catalogItems.map((item) => {
                const cat = INVENTORY_CATEGORIES.find((c) => c.value === item.category)
                return (
                  <option key={item.id} value={item.id}>
                    {cat?.icon ?? '📦'} {item.name}
                  </option>
                )
              })}
            </select>
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Link homogeneous bundles (all same item type) for better availability reporting.
              Leave blank for mixed bundles.
            </p>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
          <div className="space-y-1.5">
            <label className="form-label">Internal Notes</label>
            <textarea
              value={form.notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('notes', e.target.value)}
              placeholder="Storage location, special handling instructions…"
              rows={2}
              className="form-input resize-y w-full"
            />
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate('/assets/bundles')} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Create Bundle
          </button>
        </div>
      </div>
    </PageShell>
  )
}

/**
 * NewBundlePage — /assets/bundles/new
 *
 * Manager-only form for creating a new asset bundle.
 * qr_code_value is auto-set to bundle_code on create.
 *
 * Draft persistence
 * -----------------
 * Key:     rentora:newAssetBundleDraft
 * Saves:   on every field change (via form useEffect)
 * Restores: on page load / remount (lazy useState initializer)
 * Clears:  ONLY after successful Supabase INSERT — never on error or validation failure
 *
 * Bundle-code auto-suggest
 * ------------------------
 * Derived from name (uppercase, spaces → hyphens) while bundle_code is untouched.
 * Once the user manually edits bundle_code, auto-suggest is permanently disabled
 * for this session (codeUserEdited ref). Restoring a draft that already has a
 * bundle_code also locks auto-suggest off.
 */

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertTriangle, Info, RotateCcw, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { INVENTORY_CATEGORIES } from '@/lib/constants'
import type { InventoryCatalogItem } from '@/types/database'

// ── Draft helpers ─────────────────────────────────────────────────────────────

const DRAFT_KEY = 'rentora:newAssetBundleDraft'

interface BundleForm {
  bundle_code: string
  name: string
  description: string
  catalog_item_id: string
  notes: string
}

const EMPTY: BundleForm = {
  bundle_code:     '',
  name:            '',
  description:     '',
  catalog_item_id: '',
  notes:           '',
}

function loadDraft(): BundleForm {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return { ...EMPTY, ...JSON.parse(raw) }
  } catch { /* storage unavailable or corrupt — start fresh */ }
  return EMPTY
}

function saveDraft(form: BundleForm): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* ignore */ }
}

function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewBundlePage() {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  // Restore draft via lazy initializer — runs exactly once on mount
  const [form, setForm]           = useState<BundleForm>(() => loadDraft())
  const [catalogItems, setCatalogItems] = useState<InventoryCatalogItem[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)

  // Field refs — used for focus on validation failure
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // True once user has manually typed in the bundle_code field, OR when a draft
  // is restored that already has a bundle_code — prevents auto-suggest override.
  const codeUserEdited = useRef(false)

  // ── On mount: detect restored draft ────────────────────────────────────────
  useEffect(() => {
    const hasContent = !!(form.name || form.bundle_code || form.description || form.catalog_item_id || form.notes)
    if (hasContent) {
      // If draft has a bundle_code, lock auto-suggest immediately
      if (form.bundle_code) codeUserEdited.current = true
      setDraftRestored(true)
      // Auto-dismiss hint after 5 s
      const t = setTimeout(() => setDraftRestored(false), 5000)
      return () => clearTimeout(t)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist draft on every form change ─────────────────────────────────────
  useEffect(() => {
    saveDraft(form)
  }, [form])

  // ── Load catalog items ──────────────────────────────────────────────────────
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

  // ── Field handlers ──────────────────────────────────────────────────────────

  /** Generic patch — used for description, catalog_item_id, notes */
  function patch(field: keyof BundleForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    if (error) setError(null)
  }

  /** Name field — also drives auto-suggest for bundle_code unless user edited it */
  function handleNameChange(value: string) {
    if (!codeUserEdited.current) {
      const suggested = value
        .toUpperCase()
        .replace(/[^A-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 20)
      setForm((f) => ({ ...f, name: value, bundle_code: suggested }))
    } else {
      setForm((f) => ({ ...f, name: value }))
    }
    if (error) setError(null)
  }

  /** Bundle code field — marks code as user-edited to stop auto-suggest */
  function handleCodeChange(value: string) {
    codeUserEdited.current = true
    setForm((f) => ({ ...f, bundle_code: value.toUpperCase() }))
    if (error) setError(null)
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function save() {
    if (!profile?.company_id) return

    // Validate — focus the offending field, keep all other data intact
    if (!form.bundle_code.trim()) {
      setError('Bundle code is required')
      codeRef.current?.focus()
      return
    }
    if (!form.name.trim()) {
      setError('Bundle name is required')
      nameRef.current?.focus()
      return
    }

    setSaving(true)
    setError(null)

    try {
      const code = form.bundle_code.trim().toUpperCase()
      const { data, error: e } = await supabase
        .from('asset_bundles')
        .insert({
          company_id:      profile.company_id,
          bundle_code:     code,
          qr_code_value:   code,             // QR value = bundle_code by default
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

      // Clear draft ONLY on successful insert — never on error
      clearDraft()
      navigate(`/assets/bundles/${(data as { id: string }).id}?printLabel=1`)
    } catch (err: unknown) {
      // Log the full error so the real Postgres/RLS message is visible in the console
      console.error('[NewBundlePage] asset_bundles INSERT failed:', err)

      // PostgrestError is a plain object {message, details, hint, code} — not instanceof Error
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as Record<string, unknown>).message)
            : 'Failed to create bundle'

      if (msg.includes('unique') || msg.includes('duplicate')) {
        setError(`Bundle code "${form.bundle_code.trim().toUpperCase()}" already exists. Choose a different code.`)
        codeRef.current?.focus()
      } else {
        setError(msg)
      }
      // Draft is NOT cleared — all field data survives the error
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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

        {/* Draft restored hint */}
        {draftRestored && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1">Draft restored — your previous entries have been reloaded.</span>
            <button
              onClick={() => setDraftRestored(false)}
              className="text-blue-400 hover:text-blue-700 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Validation / save error */}
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Bundle Identity */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bundle Identity</p>

          <div className="space-y-1.5">
            <label className="form-label">Bundle Name <span className="text-destructive">*</span></label>
            <input
              ref={nameRef}
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
              ref={codeRef}
              type="text"
              value={form.bundle_code}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleCodeChange(e.target.value)}
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

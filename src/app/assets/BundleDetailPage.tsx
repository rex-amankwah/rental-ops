/**
 * BundleDetailPage — /assets/bundles/:id
 *
 * Shows full detail for one asset bundle:
 *  - Bundle info (edit in place for manager+)
 *  - QR label preview + download/print
 *  - BundleMembersPanel (add/remove physical assets)
 *  - Recent movement history for this bundle's assets
 *  - Deactivate toggle (manager+)
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, QrCode, Pencil, Power, Loader2, AlertTriangle,
  Save, X, Clock, ChevronRight, Boxes
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { formatDate, formatDateTime, INVENTORY_CATEGORIES } from '@/lib/constants'
import { getMovementTypeClass, getMovementTypeLabel } from '@/lib/statusColors'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import BundleMembersPanel from '@/components/assets/BundleMembersPanel'
import QRLabelModal from '@/components/assets/QRLabelModal'
import type { AssetBundle, AssetMovement } from '@/types/database'

type FullBundle = AssetBundle & {
  catalog_item: { id: string; name: string; category: string } | null
}

export default function BundleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, appRole } = useAuth()

  const [bundle, setBundle] = useState<FullBundle | null>(null)
  const [movements, setMovements] = useState<AssetMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [memberCount, setMemberCount] = useState(0)

  // Edit mode state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // QR modal
  const [qrOpen, setQrOpen] = useState(false)

  // Deactivate
  const [toggling, setToggling] = useState(false)

  const fetchBundle = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    try {
      const [bundleResult, movementsResult] = await Promise.all([
        supabase
          .from('asset_bundles')
          .select('*, catalog_item:inventory_catalog(id, name, category)')
          .eq('id', id)
          .eq('company_id', profile.company_id)
          .single(),
        supabase
          .from('asset_movements')
          .select('*')
          .eq('bundle_id', id)
          .eq('company_id', profile.company_id)
          .order('performed_at', { ascending: false })
          .limit(20),
      ])

      if (bundleResult.error) {
        setNotFound(true)
        return
      }
      setBundle(bundleResult.data as unknown as FullBundle)
      setMovements((movementsResult.data ?? []) as AssetMovement[])
    } finally {
      setLoading(false)
    }
  }, [id, profile?.company_id])

  useEffect(() => { fetchBundle() }, [fetchBundle])

  // Auto-open QR modal when arriving from NewBundlePage with ?printLabel=1
  useEffect(() => {
    if (!loading && bundle && searchParams.get('printLabel') === '1') {
      setQrOpen(true)
    }
  }, [loading, bundle, searchParams])

  function startEdit() {
    if (!bundle) return
    setEditName(bundle.name)
    setEditDesc(bundle.description ?? '')
    setEditNotes(bundle.notes ?? '')
    setEditError(null)
    setEditing(true)
  }

  async function saveEdit() {
    if (!bundle || !profile?.company_id) return
    setSaving(true)
    setEditError(null)
    try {
      const { error } = await supabase
        .from('asset_bundles')
        .update({
          name:        editName.trim() || bundle.name,
          description: editDesc.trim() || null,
          notes:       editNotes.trim() || null,
          updated_at:  new Date().toISOString(),
        })
        .eq('id', bundle.id)
        .eq('company_id', profile.company_id)

      if (error) throw error
      setEditing(false)
      await fetchBundle()
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!bundle || !profile?.company_id) return
    setToggling(true)
    try {
      const { error } = await supabase
        .from('asset_bundles')
        .update({
          is_active:  !bundle.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bundle.id)
        .eq('company_id', profile.company_id)

      if (error) throw error
      await fetchBundle()
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !bundle) {
    return (
      <div className="empty-state">
        <p className="text-sm text-muted-foreground">Bundle not found</p>
        <button onClick={() => navigate('/assets/bundles')} className="btn-secondary mt-4">
          Back to Bundles
        </button>
      </div>
    )
  }

  const admin = isAdmin(appRole)
  const cat = INVENTORY_CATEGORIES.find((c) => c.value === bundle.catalog_item?.category)

  return (
    <PageShell>
      <PageHeader
        title={bundle.bundle_code}
        subtitle={bundle.name}
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => navigate('/assets/bundles')} className="btn-ghost">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Bundles</span>
            </button>
            <button onClick={() => setQrOpen(true)} className="btn-secondary">
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">QR Label</span>
            </button>
            {admin && !editing && (
              <button onClick={startEdit} className="btn-secondary">
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
            {admin && (
              <button
                onClick={toggleActive}
                disabled={toggling}
                className={bundle.is_active ? 'btn-secondary' : 'btn-primary'}
              >
                {toggling
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Power className="w-4 h-4" />}
                <span className="hidden sm:inline">{bundle.is_active ? 'Deactivate' : 'Activate'}</span>
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in">
        {/* Left: bundle info + edit */}
        <div className="lg:col-span-2 space-y-5">
          {/* Bundle info card */}
          <div className="bg-card border border-border rounded-xl p-6">
            {!editing ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Boxes className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{bundle.name}</p>
                    <p className="font-mono text-sm text-muted-foreground">{bundle.bundle_code}</p>
                  </div>
                  <span className={`badge text-xs ${bundle.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                    {bundle.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {bundle.description && (
                  <p className="text-sm text-muted-foreground">{bundle.description}</p>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Catalog Item</p>
                    {bundle.catalog_item
                      ? <p className="font-medium text-foreground">{cat?.icon} {bundle.catalog_item.name}</p>
                      : <p className="text-muted-foreground">Mixed / Not set</p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">QR Code Value</p>
                    <p className="font-mono text-foreground">{bundle.qr_code_value ?? bundle.bundle_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Member Assets</p>
                    <p className="font-semibold text-foreground">{memberCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                    <p className="text-foreground">{formatDate(bundle.created_at)}</p>
                  </div>
                </div>

                {bundle.notes && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground">{bundle.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit Bundle</p>
                {editError && (
                  <div className="alert alert-error text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />{editError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="form-label">Bundle Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="form-input"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Description</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
                    className="form-input resize-y w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={2}
                    className="form-input resize-y w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="btn-secondary" disabled={saving}>
                    <X className="w-4 h-4" /> Cancel
                  </button>
                  <button onClick={saveEdit} className="btn-primary" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bundle members */}
          <div className="bg-card border border-border rounded-xl p-6">
            <BundleMembersPanel
              bundleId={bundle.id}
              bundleCode={bundle.bundle_code}
              catalogItemId={bundle.catalog_item_id}
              onMemberCountChange={setMemberCount}
            />
          </div>
        </div>

        {/* Right: movement history */}
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Activity
              </p>
            </div>

            {movements.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No movements recorded yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Scan this bundle to log the first movement
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {movements.map((m) => (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex-shrink-0">
                      <span className={`badge text-xs ${getMovementTypeClass(m.movement_type)}`}>
                        {getMovementTypeLabel(m.movement_type)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {m.from_status && m.to_status && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>{m.from_status}</span>
                          <ChevronRight className="w-3 h-3" />
                          <span>{m.to_status}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(m.performed_at)}</p>
                      {m.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{m.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {movements.length > 0 && (
              <button
                onClick={() => navigate(`/assets/scan`)}
                className="btn-primary w-full mt-4 justify-center"
              >
                <QrCode className="w-4 h-4" /> Open Scanner
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Label Modal */}
      <QRLabelModal
        open={qrOpen}
        onClose={() => {
          setQrOpen(false)
          // Remove ?printLabel param from URL without adding a history entry
          if (searchParams.get('printLabel')) {
            navigate({ search: '' }, { replace: true })
          }
        }}
        bundle={bundle}
        companyName={profile?.companies?.name ?? 'Rentora'}
      />
    </PageShell>
  )
}

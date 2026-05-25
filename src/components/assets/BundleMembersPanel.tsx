/**
 * BundleMembersPanel
 *
 * Displays the active members of an asset bundle and provides:
 * - Member list: asset code, catalog item name, status, condition, added date
 * - Remove member — soft-delete (removed_at), writes movement history
 * - Add member modal — search by asset_code / QR, multi-add (modal stays open)
 *
 * Permissions:
 *   viewer        — read-only, no add/remove buttons
 *   staff+        — can add assets
 *   manager+      — can remove assets
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, Loader2, Package, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit, isAdmin } from '@/lib/roles'
import { getAssetStatusClass, getAssetStatusLabel } from '@/lib/statusColors'
import { formatDate, INVENTORY_CATEGORIES } from '@/lib/constants'
import Modal from '@/components/common/Modal'
import type { AssetBundleMember, InventoryAsset, InventoryCatalogItem } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BundleMembersPanelProps {
  bundleId: string
  bundleCode?: string          // used in movement notes on remove
  catalogItemId?: string | null
  onMemberCountChange?: (count: number) => void
}

type AssetWithCatalog = InventoryAsset & {
  catalog_item: Pick<InventoryCatalogItem, 'id' | 'name' | 'category'> | null
}

type MemberWithAsset = AssetBundleMember & { asset: AssetWithCatalog }

// ── Component ─────────────────────────────────────────────────────────────────

export default function BundleMembersPanel({
  bundleId,
  bundleCode,
  catalogItemId,
  onMemberCountChange,
}: BundleMembersPanelProps) {
  const { profile, appRole } = useAuth()

  const [members, setMembers]   = useState<MemberWithAsset[]>([])
  const [loading, setLoading]   = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)  // asset_id being removed

  // Add-member modal
  const [addOpen, setAddOpen]             = useState(false)
  const [availableAssets, setAvailableAssets] = useState<InventoryAsset[]>([])
  const [assetSearch, setAssetSearch]     = useState('')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [adding, setAdding]               = useState<string | null>(null) // asset_id being added
  const [addError, setAddError]           = useState<string | null>(null)
  const [addedCount, setAddedCount]       = useState(0) // running count during multi-add session

  // ── Fetch members ────────────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('asset_bundle_members')
        .select('*, asset:inventory_assets(*, catalog_item:inventory_catalog(id, name, category))')
        .eq('bundle_id', bundleId)
        .eq('company_id', profile.company_id)
        .is('removed_at', null)
        .order('added_at', { ascending: true })

      if (error) throw error
      const rows = (data ?? []) as unknown as MemberWithAsset[]
      setMembers(rows)
      onMemberCountChange?.(rows.length)
    } finally {
      setLoading(false)
    }
  }, [bundleId, profile?.company_id, onMemberCountChange])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  // ── Remove member ────────────────────────────────────────────────────────────

  async function removeMember(memberId: string, member: MemberWithAsset) {
    if (!profile?.company_id) return
    setRemoving(member.asset_id)
    try {
      // 1. Soft-remove membership row (never hard-delete)
      const { error: removeErr } = await supabase
        .from('asset_bundle_members')
        .update({
          removed_at: new Date().toISOString(),
          removed_by: profile.id,
        })
        .eq('id', memberId)
        .eq('company_id', profile.company_id)

      if (removeErr) throw removeErr

      // 2. Write movement history — bundle membership removal is a meaningful
      //    operational event even though the asset's status does not change.
      const currentStatus = member.asset?.status ?? null
      const note = `Removed from bundle ${bundleCode ?? bundleId}`
      await supabase.from('asset_movements').insert({
        company_id:    profile.company_id,
        asset_id:      member.asset_id,
        bundle_id:     bundleId,
        movement_type: 'status_change',
        from_status:   currentStatus,
        to_status:     currentStatus,   // status unchanged — membership changed
        performed_by:  profile.id,
        performed_at:  new Date().toISOString(),
        notes:         note,
      })
      // Ignore movement insert errors — membership row was already soft-removed;
      // don't block the UI if the movement write fails silently.

      await fetchMembers()
    } catch (err) {
      console.error('[BundleMembersPanel] remove error:', err)
    } finally {
      setRemoving(null)
    }
  }

  // ── Open add-modal ───────────────────────────────────────────────────────────

  async function openAddModal() {
    if (!profile?.company_id) return
    setAddOpen(true)
    setAssetSearch('')
    setAddError(null)
    setAddedCount(0)
    setLoadingAssets(true)
    try {
      await loadAvailableAssets()
    } finally {
      setLoadingAssets(false)
    }
  }

  async function loadAvailableAssets() {
    if (!profile?.company_id) return
    // All active bundle members across the company (to exclude from picker)
    const { data: activeMembers } = await supabase
      .from('asset_bundle_members')
      .select('asset_id')
      .eq('company_id', profile.company_id)
      .is('removed_at', null)

    const alreadyInBundle = new Set((activeMembers ?? []).map((m) => m.asset_id as string))

    let query = supabase
      .from('inventory_assets')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('asset_code', { ascending: true })

    if (catalogItemId) {
      query = query.eq('catalog_item_id', catalogItemId)
    }

    const { data: assets, error } = await query
    if (error) throw error

    const available = (assets ?? []).filter((a) => !alreadyInBundle.has(a.id))
    setAvailableAssets(available as InventoryAsset[])
  }

  // ── Add single member — modal stays open for multi-add ───────────────────────

  async function addMember(asset: InventoryAsset) {
    if (!profile?.company_id) return
    setAdding(asset.id)
    setAddError(null)
    try {
      const { error } = await supabase
        .from('asset_bundle_members')
        .insert({
          company_id: profile.company_id,
          bundle_id:  bundleId,
          asset_id:   asset.id,
          added_by:   profile.id,
        })

      if (error) throw error

      setAddedCount((n) => n + 1)
      // Refresh available list (removes the asset just added)
      setLoadingAssets(true)
      try { await loadAvailableAssets() } finally { setLoadingAssets(false) }
      // Also refresh the member list in the background
      fetchMembers()
    } catch (err: unknown) {
      console.error('[BundleMembersPanel] addMember error:', err)
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as Record<string, unknown>).message)
            : 'Failed to add asset'
      setAddError(msg.toLowerCase().includes('unique') ? 'This asset is already in an active bundle.' : msg)
    } finally {
      setAdding(null)
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────────

  const filteredAssets = assetSearch.trim()
    ? availableAssets.filter((a) =>
        a.asset_code.toLowerCase().includes(assetSearch.toLowerCase()) ||
        (a.qr_code_value ?? '').toLowerCase().includes(assetSearch.toLowerCase())
      )
    : availableAssets

  const canAdd    = canEdit(appRole)
  const canRemove = isAdmin(appRole)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Bundle Members
          </p>
          {!loading && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {members.length} active asset{members.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {canAdd && (
          <button onClick={openAddModal} className="btn-secondary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Asset
          </button>
        )}
      </div>

      {/* Member list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-8 text-center">
          <Package className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No assets in this bundle yet</p>
          {canAdd && (
            <p className="text-xs text-muted-foreground mt-1">
              Click "Add Asset" to assign physical units
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {members.map((m) => {
            const cat = INVENTORY_CATEGORIES.find(
              (c) => c.value === m.asset?.catalog_item?.category
            )
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  {/* Catalog item name */}
                  {m.asset?.catalog_item?.name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {cat?.icon ?? '📦'} {m.asset.catalog_item.name}
                    </p>
                  )}
                  {/* Asset code */}
                  <p className="text-sm font-medium font-mono text-foreground">
                    {m.asset?.asset_code ?? m.asset_id}
                  </p>
                  {/* Added date */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <Calendar className="w-2.5 h-2.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(m.added_at)}
                    </p>
                  </div>
                </div>

                {/* Status badge */}
                <span className={`badge text-xs ${getAssetStatusClass(m.asset?.status ?? '')}`}>
                  {getAssetStatusLabel(m.asset?.status ?? '')}
                </span>

                {/* Condition badge */}
                {m.asset?.condition && (
                  <span className="badge text-xs bg-muted text-muted-foreground capitalize">
                    {m.asset.condition}
                  </span>
                )}

                {/* Remove button — manager+ only */}
                {canRemove && (
                  <button
                    onClick={() => removeMember(m.id, m)}
                    disabled={removing === m.asset_id}
                    className="btn-ghost p-1.5 text-muted-foreground hover:text-red-600 flex-shrink-0"
                    title="Remove from bundle"
                  >
                    {removing === m.asset_id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add member modal — stays open for multi-add */}
      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); fetchMembers() }}
        title="Add Assets to Bundle"
        subtitle={
          addedCount > 0
            ? `${addedCount} asset${addedCount !== 1 ? 's' : ''} added — keep adding or close`
            : catalogItemId
              ? 'Showing assets matching this catalog item'
              : 'All serialized assets in your inventory'
        }
        size="md"
        allowBackdropClose
      >
        <div className="space-y-3">
          {addError && (
            <div className="alert alert-error text-sm">{addError}</div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search by asset code or QR value…"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              className="search-input pl-9"
              autoFocus
            />
          </div>

          {loadingAssets ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {assetSearch ? 'No matching assets found' : 'No available assets to add'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Assets already in an active bundle are excluded
              </p>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-border border border-border rounded-lg">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => addMember(asset)}
                  disabled={adding === asset.id}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors disabled:opacity-60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-mono text-foreground">
                      {asset.asset_code}
                    </p>
                    {asset.qr_code_value && asset.qr_code_value !== asset.asset_code && (
                      <p className="text-xs text-muted-foreground">QR: {asset.qr_code_value}</p>
                    )}
                  </div>
                  <span className={`badge text-xs ${getAssetStatusClass(asset.status)}`}>
                    {getAssetStatusLabel(asset.status)}
                  </span>
                  <span className="badge text-xs bg-muted text-muted-foreground capitalize">
                    {asset.condition}
                  </span>
                  {adding === asset.id
                    ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-primary" />
                    : <Plus className="w-4 h-4 flex-shrink-0 text-muted-foreground" />}
                </button>
              ))}
            </div>
          )}

          {addedCount > 0 && (
            <p className="text-xs text-emerald-600 font-medium text-center">
              ✓ {addedCount} asset{addedCount !== 1 ? 's' : ''} added to bundle
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}

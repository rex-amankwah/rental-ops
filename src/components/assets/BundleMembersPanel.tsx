/**
 * BundleMembersPanel
 *
 * Displays the active members of an asset bundle and provides:
 * - Member list with asset code, status, condition
 * - Remove member (soft-delete — sets removed_at)
 * - Add member modal (search assets by asset_code)
 *
 * This panel is READ-ONLY for viewer role.
 * Staff+ can add assets; manager+ can remove.
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, Search, Loader2, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit, isAdmin } from '@/lib/roles'
import { getAssetStatusClass, getAssetStatusLabel } from '@/lib/statusColors'
import Modal from '@/components/common/Modal'
import type { AssetBundleMember, InventoryAsset } from '@/types/database'

interface BundleMembersPanelProps {
  bundleId: string
  catalogItemId?: string | null
  onMemberCountChange?: (count: number) => void
}

type MemberWithAsset = AssetBundleMember & { asset: InventoryAsset }

export default function BundleMembersPanel({ bundleId, catalogItemId, onMemberCountChange }: BundleMembersPanelProps) {
  const { profile, appRole } = useAuth()
  const [members, setMembers] = useState<MemberWithAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  // Add-member modal state
  const [addOpen, setAddOpen] = useState(false)
  const [availableAssets, setAvailableAssets] = useState<InventoryAsset[]>([])
  const [assetSearch, setAssetSearch] = useState('')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('asset_bundle_members')
        .select('*, asset:inventory_assets(*)')
        .eq('bundle_id', bundleId)
        .eq('company_id', profile.company_id)
        .is('removed_at', null)
        .order('added_at', { ascending: true })

      if (error) throw error
      const rows = (data ?? []) as MemberWithAsset[]
      setMembers(rows)
      onMemberCountChange?.(rows.length)
    } finally {
      setLoading(false)
    }
  }, [bundleId, profile?.company_id, onMemberCountChange])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  async function removeMember(memberId: string, memberAssetId: string) {
    if (!profile?.company_id) return
    setRemoving(memberAssetId)
    try {
      const { error } = await supabase
        .from('asset_bundle_members')
        .update({
          removed_at: new Date().toISOString(),
          removed_by: profile.id,
        })
        .eq('id', memberId)
        .eq('company_id', profile.company_id)

      if (error) throw error
      await fetchMembers()
    } catch (err) {
      console.error('[BundleMembersPanel] remove error:', err)
    } finally {
      setRemoving(null)
    }
  }

  async function openAddModal() {
    if (!profile?.company_id) return
    setAddOpen(true)
    setAssetSearch('')
    setAddError(null)
    setLoadingAssets(true)
    try {
      // Fetch all active bundle members across all bundles (to exclude them)
      const { data: activeMembers } = await supabase
        .from('asset_bundle_members')
        .select('asset_id')
        .eq('company_id', profile.company_id)
        .is('removed_at', null)

      const alreadyInBundle = new Set((activeMembers ?? []).map((m) => m.asset_id as string))

      // Fetch all available assets (optionally filtered to same catalog item)
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

      // Client-side exclude assets already in any active bundle
      const available = (assets ?? []).filter((a) => !alreadyInBundle.has(a.id))
      setAvailableAssets(available as InventoryAsset[])
    } catch (err) {
      console.error('[BundleMembersPanel] load assets error:', err)
      setAvailableAssets([])
    } finally {
      setLoadingAssets(false)
    }
  }

  async function addMember(asset: InventoryAsset) {
    if (!profile?.company_id) return
    setAdding(true)
    setAddError(null)
    try {
      const { error } = await supabase
        .from('asset_bundle_members')
        .insert({
          company_id: profile.company_id,
          bundle_id: bundleId,
          asset_id: asset.id,
          added_by: profile.id,
        })

      if (error) throw error
      setAddOpen(false)
      await fetchMembers()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add asset'
      // Unique constraint violation = asset already in active bundle
      setAddError(msg.includes('unique') ? 'This asset is already in an active bundle.' : msg)
    } finally {
      setAdding(false)
    }
  }

  const filteredAssets = assetSearch.trim()
    ? availableAssets.filter((a) =>
        a.asset_code.toLowerCase().includes(assetSearch.toLowerCase()) ||
        (a.qr_code_value ?? '').toLowerCase().includes(assetSearch.toLowerCase())
      )
    : availableAssets

  const canAddRemove = canEdit(appRole)
  const canRemove = isAdmin(appRole)

  return (
    <div className="space-y-3">
      {/* Header row */}
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
        {canAddRemove && (
          <button onClick={openAddModal} className="btn-secondary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Asset
          </button>
        )}
      </div>

      {/* Member list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-8 text-center">
          <Package className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No assets in this bundle yet</p>
          {canAddRemove && (
            <p className="text-xs text-muted-foreground mt-1">Click "Add Asset" to assign physical units</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium font-mono text-foreground">{m.asset?.asset_code ?? m.asset_id}</p>
                {m.asset?.qr_code_value && m.asset.qr_code_value !== m.asset.asset_code && (
                  <p className="text-xs text-muted-foreground">QR: {m.asset.qr_code_value}</p>
                )}
              </div>
              <span className={`badge text-xs ${getAssetStatusClass(m.asset?.status ?? '')}`}>
                {getAssetStatusLabel(m.asset?.status ?? '')}
              </span>
              {m.asset?.condition && (
                <span className="badge text-xs bg-muted text-muted-foreground capitalize">
                  {m.asset.condition}
                </span>
              )}
              {canRemove && (
                <button
                  onClick={() => removeMember(m.id, m.asset_id)}
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
          ))}
        </div>
      )}

      {/* Add member modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Asset to Bundle"
        subtitle={catalogItemId ? 'Showing assets for this catalog item' : 'All serialized assets in your inventory'}
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
                  disabled={adding}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-mono text-foreground">{asset.asset_code}</p>
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
                  {adding && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

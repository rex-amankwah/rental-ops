/**
 * movementLogger.ts
 *
 * Centralised helper for writing asset movement records.
 * asset_movements is APPEND-ONLY — this file may only INSERT.
 * UPDATE and DELETE are prohibited at the database (RLS) level.
 *
 * Call logBundleMovement() to:
 *  1. Fetch all active members of a bundle
 *  2. Read their current statuses (for from_status)
 *  3. INSERT one asset_movement row per member
 *  4. UPDATE all member asset statuses in one batch call
 */

import { supabase } from '@/lib/supabase'
import type { AssetMovementType, AssetStatus } from '@/types/database'

export interface BundleMovementResult {
  success: boolean
  assetCount: number
  error?: string
}

/**
 * Log a movement event for every active member of a bundle.
 *
 * @param bundleId      The bundle being scanned
 * @param movementType  Event type (checkout / checkin / maintenance_in …)
 * @param toStatus      The status each asset should have AFTER this event
 * @param companyId     Tenant isolation
 * @param performedBy   Profile ID of the staff/driver performing the scan
 * @param notes         Optional operational notes
 */
export async function logBundleMovement(
  bundleId: string,
  movementType: AssetMovementType,
  toStatus: AssetStatus,
  companyId: string,
  performedBy: string,
  notes?: string,
): Promise<BundleMovementResult> {
  try {
    // 1. Fetch all active bundle members with current asset status
    const { data: members, error: memberErr } = await supabase
      .from('asset_bundle_members')
      .select('asset_id, asset:inventory_assets(id, status)')
      .eq('bundle_id', bundleId)
      .eq('company_id', companyId)
      .is('removed_at', null)

    if (memberErr) throw memberErr
    if (!members || members.length === 0) {
      return { success: false, assetCount: 0, error: 'Bundle has no active members' }
    }

    // 2. Build one movement row per member
    const now = new Date().toISOString()
    const movements = members.map((m) => {
      const asset = m.asset as unknown as { id: string; status: string } | null
      return {
        company_id:    companyId,
        asset_id:      m.asset_id as string,
        bundle_id:     bundleId,
        movement_type: movementType,
        from_status:   asset?.status ?? null,
        to_status:     toStatus,
        performed_by:  performedBy,
        performed_at:  now,
        notes:         notes ?? null,
      }
    })

    // 3. INSERT all movements (append-only — no update/delete ever)
    const { error: insertErr } = await supabase
      .from('asset_movements')
      .insert(movements)

    if (insertErr) throw insertErr

    // 4. UPDATE all asset statuses in a single batch
    const assetIds = members.map((m) => m.asset_id as string)
    const { error: updateErr } = await supabase
      .from('inventory_assets')
      .update({ status: toStatus, updated_at: now })
      .in('id', assetIds)
      .eq('company_id', companyId)

    if (updateErr) throw updateErr

    return { success: true, assetCount: assetIds.length }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, assetCount: 0, error: msg }
  }
}

/**
 * Log a movement event for a single asset.
 * Used when scanning individual assets (not via bundle).
 */
export async function logAssetMovement(
  assetId: string,
  movementType: AssetMovementType,
  fromStatus: AssetStatus | null,
  toStatus: AssetStatus,
  companyId: string,
  performedBy: string,
  bundleId?: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString()

    const { error: insertErr } = await supabase
      .from('asset_movements')
      .insert({
        company_id:    companyId,
        asset_id:      assetId,
        bundle_id:     bundleId ?? null,
        movement_type: movementType,
        from_status:   fromStatus,
        to_status:     toStatus,
        performed_by:  performedBy,
        performed_at:  now,
        notes:         notes ?? null,
      })

    if (insertErr) throw insertErr

    const { error: updateErr } = await supabase
      .from('inventory_assets')
      .update({ status: toStatus, updated_at: now })
      .eq('id', assetId)
      .eq('company_id', companyId)

    if (updateErr) throw updateErr

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: msg }
  }
}

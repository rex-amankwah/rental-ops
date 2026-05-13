import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface AvailabilityResult {
  catalog_item_id: string
  available: number
  loading: boolean
  error: string | null
}

export function useAvailability() {
  const [checking, setChecking] = useState(false)

  const checkAvailability = useCallback(async (
    catalogItemId: string,
    fromDate: string,
    untilDate: string,
    excludeOrderId?: string
  ): Promise<number> => {
    setChecking(true)
    try {
      const { data, error } = await supabase.rpc('check_item_availability', {
        p_catalog_item_id: catalogItemId,
        p_from_date: fromDate,
        p_until_date: untilDate,
        p_exclude_order_id: excludeOrderId ?? null,
      })
      if (error) throw error
      return data as number
    } catch {
      return 0
    } finally {
      setChecking(false)
    }
  }, [])

  const checkMultiple = useCallback(async (
    items: Array<{ catalog_item_id: string; quantity: number }>,
    fromDate: string,
    untilDate: string,
    excludeOrderId?: string
  ): Promise<Map<string, number>> => {
    const results = new Map<string, number>()
    await Promise.all(
      items.map(async (item) => {
        const available = await checkAvailability(
          item.catalog_item_id, fromDate, untilDate, excludeOrderId
        )
        results.set(item.catalog_item_id, available)
      })
    )
    return results
  }, [checkAvailability])

  const reserveItems = useCallback(async (
    orderId: string,
    override = false
  ): Promise<{ success: boolean; error: string | null }> => {
    const { error } = await supabase.rpc('reserve_order_items', {
      p_order_id: orderId,
      p_override: override,
    })
    return { success: !error, error: error?.message ?? null }
  }, [])

  const releaseReservations = useCallback(async (
    orderId: string
  ): Promise<{ success: boolean; error: string | null }> => {
    const { error } = await supabase.rpc('release_order_reservations', {
      p_order_id: orderId,
    })
    return { success: !error, error: error?.message ?? null }
  }, [])

  return { checking, checkAvailability, checkMultiple, reserveItems, releaseReservations }
}

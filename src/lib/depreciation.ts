import type { InventoryCatalogItem } from '@/types/database'

export interface DepreciationResult {
  monthsElapsed: number
  monthlyDepreciation: number
  accumulated: number
  bookValue: number
  percentDepreciated: number
}

/**
 * Operational straight-line depreciation estimate.
 * NOT tax/accounting-grade — for internal asset management only.
 * Returns null if the item lacks required configuration fields.
 */
export function calcDepreciation(item: InventoryCatalogItem): DepreciationResult | null {
  if (
    item.depreciation_method !== 'straight_line' ||
    item.purchase_cost == null || item.purchase_cost <= 0 ||
    item.expected_lifespan_months == null || item.expected_lifespan_months <= 0 ||
    item.purchase_date == null
  ) {
    return null
  }

  const residual = item.residual_value ?? 0
  const depreciableAmount = Math.max(0, item.purchase_cost - residual)
  const monthlyRate = depreciableAmount / item.expected_lifespan_months

  const purchaseDate = new Date(item.purchase_date)
  const now = new Date()
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
      (now.getMonth() - purchaseDate.getMonth()),
  )

  const accumulated = Math.min(depreciableAmount, monthlyRate * monthsElapsed)
  const bookValue = Math.max(residual, item.purchase_cost - accumulated)
  const percentDepreciated =
    item.purchase_cost > 0 ? (accumulated / item.purchase_cost) * 100 : 0

  return {
    monthsElapsed,
    monthlyDepreciation: monthlyRate,
    accumulated,
    bookValue,
    percentDepreciated,
  }
}

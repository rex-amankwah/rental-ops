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
  // Prefer unit_purchase_cost; fall back to purchase_cost for backward compatibility
  const costBasis = item.unit_purchase_cost ?? item.purchase_cost

  if (
    item.depreciation_method !== 'straight_line' ||
    costBasis == null || costBasis <= 0 ||
    item.expected_lifespan_months == null || item.expected_lifespan_months <= 0 ||
    item.purchase_date == null
  ) {
    return null
  }

  const residual = item.residual_value ?? 0
  const depreciableAmount = Math.max(0, costBasis - residual)
  const monthlyRate = depreciableAmount / item.expected_lifespan_months

  const purchaseDate = new Date(item.purchase_date)
  const now = new Date()
  const monthsElapsed = Math.max(
    0,
    (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
      (now.getMonth() - purchaseDate.getMonth()),
  )

  const accumulated = Math.min(depreciableAmount, monthlyRate * monthsElapsed)
  const bookValue = Math.max(residual, costBasis - accumulated)
  const percentDepreciated =
    costBasis > 0 ? (accumulated / costBasis) * 100 : 0

  return {
    monthsElapsed,
    monthlyDepreciation: monthlyRate,
    accumulated,
    bookValue,
    percentDepreciated,
  }
}

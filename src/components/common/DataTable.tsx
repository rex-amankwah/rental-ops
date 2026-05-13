import { ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// T defaults to any so callers can pass typed row objects without double-casting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Column<T = any> {
  key: string
  label: string
  render?: (row: T) => ReactNode
  sortable?: boolean
  width?: string
  align?: 'left' | 'right' | 'center'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataTableProps<T = any> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  onRowClick?: (row: T) => void
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T = any>({
  columns, data, keyField, onRowClick, sortKey, sortDir,
  onSort, loading, emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your search or filters.',
}: DataTableProps<T>) {

  const header = (
    <thead>
      <tr>
        {columns.map((col) => (
          <th key={col.key} style={{ width: col.width }}
            className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
            {col.sortable && onSort ? (
              <button onClick={() => onSort(col.key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                {col.label}
                {sortKey === col.key
                  ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
              </button>
            ) : col.label}
          </th>
        ))}
      </tr>
    </thead>
  )

  if (loading) {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table">{header}</table>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              {columns.map((col, j) => (
                <div key={j} className="skeleton h-4 rounded flex-1"
                  style={{ maxWidth: col.width ?? '200px', opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="data-table">{header}</table>
        <div className="py-16 text-center">
          <p className="text-sm font-medium text-foreground mb-1">{emptyTitle}</p>
          <p className="text-xs text-muted-foreground">{emptyDescription}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          {header}
          <tbody>
            {data.map((row) => (
              <tr key={String(row[keyField])} onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer' : ''}>
                {columns.map((col) => (
                  <td key={col.key}
                    className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                    {col.render
                      ? col.render(row)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      : String((row as any)[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

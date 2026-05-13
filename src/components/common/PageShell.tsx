import { ReactNode } from 'react'

interface PageShellProps {
  children: ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return <div className="space-y-6">{children}</div>
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  tabs?: ReactNode
}

export function PageHeader({ title, subtitle, actions, tabs }: PageHeaderProps) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="page-title">{title}</h2>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  colorClass?: string
  iconBg?: string
}

export function StatCard({
  label, value, sub, icon, trend, trendLabel, colorClass = 'text-foreground', iconBg = 'bg-muted'
}: StatCardProps) {
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-semibold mt-1 ${colorClass} leading-none`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
        )}
      </div>
      {(trend || trendLabel) && (
        <div className="flex items-center gap-1">
          {trend === 'up' && <span className="text-emerald-600 text-xs">↑</span>}
          {trend === 'down' && <span className="text-red-600 text-xs">↓</span>}
          {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
        </div>
      )}
    </div>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {children}
    </div>
  )
}

export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {children}
    </div>
  )
}

export function TableToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
      {children}
    </div>
  )
}

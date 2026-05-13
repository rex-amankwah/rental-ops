import {
  Calendar, Truck, RotateCcw, AlertTriangle, Receipt,
  BarChart3, Settings, Package, Construction
} from 'lucide-react'

const ICON_MAP = {
  Calendar, Truck, RotateCcw, AlertTriangle, Receipt, BarChart3, Settings, Package,
}

interface PlaceholderPageProps {
  title: string
  description: string
  icon: keyof typeof ICON_MAP
}

export default function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  const Icon = ICON_MAP[icon] ?? Package

  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg">
        <Construction className="w-3.5 h-3.5" />
        <span>Planned for next build phase</span>
      </div>
    </div>
  )
}

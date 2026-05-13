import { Bell, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const PAGE_TITLES: Record<string, { title: string }> = {
  '/':          { title: 'Dashboard' },
  '/orders':    { title: 'Orders' },
  '/customers': { title: 'Customers' },
  '/inventory': { title: 'Inventory' },
  '/invoices':  { title: 'Invoices' },
  '/payments':  { title: 'Payments' },
  '/dispatch':  { title: 'Dispatch Board' },
  '/calendar':  { title: 'Calendar' },
  '/returns':   { title: 'Returns' },
  '/damages':   { title: 'Damage Reports' },
  '/expenses':  { title: 'Expenses' },
  '/reports':   { title: 'Reports' },
  '/settings':  { title: 'Settings' },
}

export default function TopBar() {
  const location = useLocation()

  const pageKey = Object.keys(PAGE_TITLES)
    .filter(k => location.pathname.startsWith(k) && k !== '/')
    .sort((a, b) => b.length - a.length)[0] ?? (location.pathname === '/' ? '/' : null)

  const pageConfig = pageKey ? PAGE_TITLES[pageKey] : { title: 'RentalOps' }

  return (
    <header className="flex items-center gap-4 px-6 h-14 border-b border-border bg-background flex-shrink-0">
      {/* Page title */}
      <h1 className="text-base font-semibold text-foreground flex-shrink-0">
        {pageConfig.title}
      </h1>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search orders, customers, items..."
            className="search-input pl-9 h-8 text-xs bg-muted/50"
          />
        </div>
      </div>

      <div className="flex-1" />

      {/* Notifications */}
      <button className="relative btn-ghost p-2 h-8 w-8">
        <Bell className="w-4 h-4" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
      </button>
    </header>
  )
}

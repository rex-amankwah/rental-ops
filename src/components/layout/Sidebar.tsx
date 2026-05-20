import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, Calendar, Package, Truck,
  FileText, CreditCard, Users, RotateCcw, AlertTriangle,
  Receipt, BarChart3, Settings, Tent, ChevronRight, BookOpen
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { getInitials } from '@/lib/constants'

const ICON_MAP = {
  LayoutDashboard, ClipboardList, Calendar, Package, Truck,
  FileText, CreditCard, Users, RotateCcw, AlertTriangle,
  Receipt, BarChart3, Settings, BookOpen,
}

const NAV_SECTIONS = [
  {
    label: 'Operations',
    items: [
      { href: '/',          label: 'Dashboard',  icon: 'LayoutDashboard' },
      { href: '/orders',    label: 'Orders',     icon: 'ClipboardList' },
      { href: '/calendar',  label: 'Calendar',   icon: 'Calendar' },
      { href: '/dispatch',  label: 'Dispatch',   icon: 'Truck' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { href: '/inventory', label: 'Inventory',  icon: 'Package' },
      { href: '/returns',   label: 'Returns',    icon: 'RotateCcw' },
      { href: '/damages',   label: 'Damages',    icon: 'AlertTriangle' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/invoices',  label: 'Invoices',   icon: 'FileText' },
      { href: '/payments',  label: 'Payments',   icon: 'CreditCard' },
      { href: '/expenses',  label: 'Expenses',   icon: 'Receipt' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/customers', label: 'Customers',  icon: 'Users' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { href: '/reports',   label: 'Reports',    icon: 'BarChart3' },
    ],
  },
  {
    label: 'Help',
    items: [
      { href: '/help',      label: 'User Guide', icon: 'BookOpen' },
    ],
  },
]

export default function Sidebar() {
  const { profile, appRole, signOut } = useAuth()
  const location = useLocation()
  const adminUser = isAdmin(appRole)

  function isActive(href: string) {
    if (href === '/') return location.pathname === '/'
    return location.pathname.startsWith(href)
  }

  return (
    <aside className="flex flex-col w-60 flex-shrink-0 bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary">
          {profile?.companies?.logo_url ? (
            <img
              src={profile.companies.logo_url}
              alt={profile.companies.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Tent className="w-4 h-4 text-white" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground leading-none">Rentora</p>
          <p className="text-xs text-sidebar-foreground/50 mt-0.5 truncate max-w-[120px]">
            {profile?.companies?.name ?? 'Loading...'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-sidebar-foreground/35 uppercase tracking-widest px-3 mb-1">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICON_MAP[item.icon as keyof typeof ICON_MAP]
                const active = isActive(item.href)
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={`sidebar-link ${active ? 'active' : ''}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {active && <ChevronRight className="w-3 h-3 opacity-50" />}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}

        {/* Settings — admin-only; sub-pages are reached from the hub */}
        {adminUser && (
          <div>
            <p className="text-[10px] font-semibold text-sidebar-foreground/35 uppercase tracking-widest px-3 mb-1">
              Settings
            </p>
            <div className="space-y-0.5">
              {(() => {
                const active = isActive('/settings')
                return (
                  <NavLink to="/settings" className={`sidebar-link ${active ? 'active' : ''}`}>
                    <Settings className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">Settings</span>
                    {active && <ChevronRight className="w-3 h-3 opacity-50" />}
                  </NavLink>
                )
              })()}
            </div>
          </div>
        )}
      </nav>

      {/* User profile footer */}
      <div className="border-t border-sidebar-border p-3">
        {adminUser ? (
          <NavLink
            to="/settings"
            className="flex items-center gap-2.5 p-2 rounded-md hover:bg-sidebar-accent transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {profile?.full_name ? getInitials(profile.full_name) : '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {profile?.full_name ?? profile?.email ?? 'User'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 capitalize">
                {profile?.role ?? 'staff'}
              </p>
            </div>
            <Settings className="w-3.5 h-3.5 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70 flex-shrink-0" />
          </NavLink>
        ) : (
          <div className="flex items-center gap-2.5 p-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {profile?.full_name ? getInitials(profile.full_name) : '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">
                {profile?.full_name ?? profile?.email ?? 'User'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 capitalize">
                {profile?.role ?? 'staff'}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={() => signOut()}
          className="w-full mt-1 text-left text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 px-2 py-1 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

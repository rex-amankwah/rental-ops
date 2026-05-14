import { useNavigate } from 'react-router-dom'
import { Users, Building2, ChevronRight, Shield } from 'lucide-react'

const SECTIONS = [
  {
    title: 'Team & Roles',
    description: 'View team members, assign roles, and manage access levels.',
    icon: Users,
    href: '/settings/team',
    badge: 'Active',
    badgeCls: 'bg-emerald-100 text-emerald-700',
  },
  {
    title: 'Company Settings',
    description: 'Update company information, branding, and operational defaults.',
    icon: Building2,
    href: null,
    badge: 'Coming Soon',
    badgeCls: 'bg-muted text-muted-foreground',
  },
]

export default function SettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your company, team, and application configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <button
              key={section.title}
              onClick={() => section.href && navigate(section.href)}
              disabled={!section.href}
              className={`bg-card border border-border rounded-xl p-5 text-left space-y-3 transition-all group ${
                section.href
                  ? 'hover:border-primary/40 hover:shadow-sm cursor-pointer'
                  : 'opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge text-[10px] ${section.badgeCls}`}>{section.badge}</span>
                  {section.href && (
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{section.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{section.description}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-foreground">Settings are admin-only</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Only admin users can view or modify settings. Staff and viewers cannot access this area.
          </p>
        </div>
      </div>
    </div>
  )
}

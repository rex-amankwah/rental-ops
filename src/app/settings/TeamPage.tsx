import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, ShieldCheck, Briefcase, Eye,
  ToggleLeft, ToggleRight, Loader2, AlertTriangle,
  Mail, Clock, Info, UserPlus, CheckCircle2, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/lib/constants'
import type { Profile, AppRole } from '@/types/database'

// ─── Role config ─────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<AppRole, {
  label: string
  icon: React.ElementType
  bg: string
  color: string
  description: string
}> = {
  admin: {
    label: 'Admin',
    icon: ShieldCheck,
    bg: 'bg-violet-100',
    color: 'text-violet-700',
    description: 'Full system access including settings and team management',
  },
  staff: {
    label: 'Staff',
    icon: Briefcase,
    bg: 'bg-blue-100',
    color: 'text-blue-700',
    description: 'All operational workflows — orders, dispatch, returns, invoices',
  },
  viewer: {
    label: 'Viewer',
    icon: Eye,
    bg: 'bg-muted',
    color: 'text-muted-foreground',
    description: 'Read-only access to all data, no mutations allowed',
  },
}

function initials(member: Profile): string {
  if (member.full_name) {
    return member.full_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  }
  return member.email[0].toUpperCase()
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { profile: myProfile } = useAuth()
  const navigate = useNavigate()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!myProfile?.company_id) return
    setLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', myProfile.company_id)
        .order('created_at', { ascending: true })
      if (err) throw err
      setMembers((data ?? []) as Profile[])
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? 'Failed to load team.')
    } finally {
      setLoading(false)
    }
  }, [myProfile?.company_id])

  useEffect(() => { load() }, [load])

  function flash(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3500)
  }

  function activeAdminCount(overrides?: { id: string; role?: AppRole; is_active?: boolean }): number {
    return members.filter(m => {
      const role = overrides?.id === m.id && overrides.role !== undefined ? overrides.role : m.role
      const active = overrides?.id === m.id && overrides.is_active !== undefined ? overrides.is_active : m.is_active
      return role === 'admin' && active
    }).length
  }

  async function updateRole(member: Profile, newRole: AppRole) {
    if (saving) return
    setError(null)

    // Guard: would leave zero active admins
    if (member.role === 'admin' && newRole !== 'admin') {
      if (activeAdminCount({ id: member.id, role: newRole }) < 1) {
        setError('Cannot demote the last active admin. Promote another member to admin first.')
        return
      }
    }

    // Warn: self-demotion
    if (member.id === myProfile?.id && newRole !== 'admin') {
      const ok = window.confirm(
        'You are about to remove your own admin access. You will lose access to Settings immediately. Continue?'
      )
      if (!ok) return
    }

    setSaving(member.id)
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .eq('company_id', myProfile!.company_id)
    setSaving(null)

    if (err) { setError(err.message); return }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m))
    flash(`${member.full_name ?? member.email} is now ${ROLE_CONFIG[newRole].label}.`)
  }

  async function toggleActive(member: Profile) {
    if (saving) return
    setError(null)

    // Block: self-deactivation
    if (member.id === myProfile?.id) {
      setError('You cannot deactivate your own account.')
      return
    }

    // Block: deactivating last active admin
    if (member.role === 'admin' && member.is_active) {
      if (activeAdminCount({ id: member.id, is_active: false }) < 1) {
        setError('Cannot deactivate the last active admin.')
        return
      }
    }

    const newActive = !member.is_active
    setSaving(member.id)
    const { error: err } = await supabase
      .from('profiles')
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .eq('company_id', myProfile!.company_id)
    setSaving(null)

    if (err) { setError(err.message); return }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, is_active: newActive } : m))
    flash(`${member.full_name ?? member.email} ${newActive ? 'activated' : 'deactivated'}.`)
  }

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/settings')} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Team & Roles</h1>
          <p className="text-sm text-muted-foreground">
            Manage team members and their access levels.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="btn-ghost p-1 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
          {success}
        </div>
      )}

      {/* Role legend */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role Permissions</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.entries(ROLE_CONFIG) as [AppRole, typeof ROLE_CONFIG[AppRole]][]).map(([role, cfg]) => {
            const Icon = cfg.icon
            return (
              <div key={role} className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40">
                <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{cfg.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {cfg.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Team list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Team Members
            {!loading && (
              <span className="text-muted-foreground font-normal ml-1">({members.length})</span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-14 text-sm text-muted-foreground">
            No team members found for this company.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {members.map(member => {
              const cfg = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.staff
              const isSelf = member.id === myProfile?.id
              const isSaving = saving === member.id

              return (
                <div
                  key={member.id}
                  className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-opacity ${
                    !member.is_active ? 'opacity-55' : ''
                  }`}
                >
                  {/* Avatar + identity */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{initials(member)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {member.full_name ?? '—'}
                        </p>
                        {isSelf && (
                          <span className="badge text-[9px] bg-primary/10 text-primary">You</span>
                        )}
                        <span className={`badge text-[9px] ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {!member.is_active && (
                          <span className="badge text-[9px] bg-muted text-muted-foreground">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                      {member.last_seen_at && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mt-0.5">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          Last seen {formatDate(member.last_seen_at)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isSaving && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}

                    {/* Role selector */}
                    <select
                      value={member.role}
                      onChange={e => updateRole(member, e.target.value as AppRole)}
                      disabled={isSaving}
                      className="form-select h-8 text-xs w-28"
                    >
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    {/* Active toggle */}
                    <button
                      onClick={() => toggleActive(member)}
                      disabled={isSaving || isSelf}
                      title={
                        isSelf
                          ? 'You cannot deactivate your own account'
                          : member.is_active
                            ? 'Deactivate this member'
                            : 'Activate this member'
                      }
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                        member.is_active
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {member.is_active
                        ? <ToggleRight className="w-3.5 h-3.5" />
                        : <ToggleLeft className="w-3.5 h-3.5" />}
                      {member.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invite placeholder */}
      {/*
        TODO: Supabase Edge Function required — POST /functions/v1/invite-user
        - Accept: { email, full_name, role, company_id }
        - Server-side: supabase.auth.admin.inviteUserByEmail() using SERVICE_ROLE_KEY
        - On success: insert into public.profiles with the new auth user's UUID
        - Never expose SERVICE_ROLE_KEY in frontend code
      */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Invite New Team Member</h2>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-amber-800">Invite backend not connected yet</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Creating new user accounts requires a secure server-side function using the Supabase service role key.
              This cannot be done safely from the browser — a Supabase Edge Function is required.
            </p>
            <p className="text-[11px] font-mono text-amber-600 bg-amber-100 rounded px-2 py-1 mt-1 w-fit">
              TODO: Edge Function → POST /functions/v1/invite-user
            </p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">In the meantime:</p>
          <p>
            1. Go to your Supabase project → Authentication → Users → Invite user.
          </p>
          <p>
            2. After the user accepts the invite, their profile row will appear in this team list automatically
            (if an <code className="font-mono bg-muted px-1 rounded">after-insert</code> trigger is configured)
            or you can insert it manually.
          </p>
          <p>
            3. Set the correct role and active status here once they appear.
          </p>
        </div>
      </div>

    </div>
  )
}

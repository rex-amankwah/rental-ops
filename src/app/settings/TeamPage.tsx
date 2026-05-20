import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, ShieldCheck, Briefcase, Eye,
  ToggleLeft, ToggleRight, Loader2, AlertTriangle,
  Mail, Clock, Info, UserPlus, CheckCircle2, X, Pencil, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDate } from '@/lib/constants'
import { ROLE_COLORS } from '@/lib/statusColors'
import { isAdmin, canManageTeam, toAppRole, fromAppRole } from '@/lib/roles'
import type { Profile, AppRole } from '@/types/database'

// ─── Role details (icon + description only — colors come from ROLE_COLORS) ───

const ROLE_DETAILS: Record<AppRole, { icon: React.ElementType; description: string }> = {
  platform_admin: { icon: ShieldCheck, description: 'Platform owner — full access across all companies and settings' },
  manager:        { icon: ShieldCheck, description: 'Company admin — full access including settings and team management' },
  staff:          { icon: Briefcase,   description: 'All operational workflows — orders, dispatch, returns, invoices' },
  viewer:         { icon: Eye,         description: 'Read-only access to all data, no mutations allowed' },
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

  // ── Inline name editing ──────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  const [nameSaving, setNameSaving] = useState<string | null>(null)

  const canEditNames = canManageTeam(myProfile?.role)

  function startEditName(member: Profile) {
    setEditingId(member.id)
    setEditNameValue(member.full_name ?? '')
    setError(null)
  }

  function cancelEditName() {
    setEditingId(null)
    setEditNameValue('')
  }

  async function saveEditName(member: Profile) {
    const trimmed = editNameValue.trim()
    if (!trimmed) { setError('Name cannot be empty.'); return }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters.'); return }
    if (trimmed.length > 80) { setError('Name must be 80 characters or fewer.'); return }

    setNameSaving(member.id)
    setError(null)
    const { data: updated, error: err } = await supabase
      .from('profiles')
      .update({ full_name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .eq('company_id', myProfile!.company_id)
      .select('id, full_name')
    setNameSaving(null)

    if (err) { setError(err.message); return }
    if (!updated || updated.length === 0) {
      setError('Name update was blocked — you may not have permission to edit this profile. Reload to confirm current state.')
      return
    }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, full_name: trimmed } : m))
    cancelEditName()
    flash(`Name updated to "${trimmed}".`)
  }

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
      // Normalize raw DB role values (owner/admin/manager/…) → AppRole
      const normalized = ((data ?? []) as Profile[]).map(m => ({
        ...m,
        role: toAppRole(m.role) as AppRole,
      }))
      setMembers(normalized)
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
      return isAdmin(role) && active
    }).length
  }

  async function updateRole(member: Profile, newRole: AppRole) {
    if (saving) return
    setError(null)

    // Guard: would leave zero active managers/platform-admins
    if (isAdmin(member.role) && !isAdmin(newRole)) {
      if (activeAdminCount({ id: member.id, role: newRole }) < 1) {
        setError('Cannot demote the last active manager. Promote another member to Manager or Platform Admin first.')
        return
      }
    }

    // Warn: self-demotion below manager level
    if (member.id === myProfile?.id && !isAdmin(newRole)) {
      const ok = window.confirm(
        'You are about to remove your own manager access. You will lose access to Settings immediately. Continue?'
      )
      if (!ok) return
    }

    setSaving(member.id)
    // Convert AppRole → raw DB value before writing
    const dbRole = fromAppRole(newRole)
    const { data: updated, error: err } = await supabase
      .from('profiles')
      .update({ role: dbRole, updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .eq('company_id', myProfile!.company_id)
      .select('id, role')
    setSaving(null)

    if (err) { setError(err.message); return }
    if (!updated || updated.length === 0) {
      setError('Role update was blocked — you may not have permission to modify this profile. Reload to confirm current state.')
      return
    }
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role: newRole } : m))
    flash(`${member.full_name ?? member.email} is now ${ROLE_COLORS[newRole]?.label ?? newRole}.`)
  }

  async function toggleActive(member: Profile) {
    if (saving) return
    setError(null)

    // Block: self-deactivation
    if (member.id === myProfile?.id) {
      setError('You cannot deactivate your own account.')
      return
    }

    // Block: deactivating last active manager/platform-admin
    if (isAdmin(member.role) && member.is_active) {
      if (activeAdminCount({ id: member.id, is_active: false }) < 1) {
        setError('Cannot deactivate the last active manager or platform admin.')
        return
      }
    }

    const newActive = !member.is_active
    setSaving(member.id)
    const { data: updated, error: err } = await supabase
      .from('profiles')
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .eq('company_id', myProfile!.company_id)
      .select('id, is_active')
    setSaving(null)

    if (err) { setError(err.message); return }
    if (!updated || updated.length === 0) {
      setError('Active status update was blocked — you may not have permission to modify this profile. Reload to confirm current state.')
      return
    }
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
          {(Object.keys(ROLE_DETAILS) as AppRole[]).map((role) => {
            const { icon: Icon, description } = ROLE_DETAILS[role]
            const colors = ROLE_COLORS[role]
            return (
              <div key={role} className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40">
                <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-foreground">{colors.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {description}
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
              const cfg = ROLE_COLORS[member.role] ?? ROLE_COLORS.viewer
              const isSelf = member.id === myProfile?.id
              const isSaving = saving === member.id

              const isEditingThis = editingId === member.id
              const isSavingName  = nameSaving === member.id

              return (
                <div
                  key={member.id}
                  className={`group px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-opacity ${
                    !member.is_active ? 'opacity-55' : ''
                  }`}
                >
                  {/* Avatar + identity */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{initials(member)}</span>
                    </div>
                    <div className="min-w-0">
                      {/* Name — static or inline edit */}
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 mb-1">
                          <input
                            autoFocus
                            type="text"
                            value={editNameValue}
                            onChange={e => setEditNameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEditName(member)
                              if (e.key === 'Escape') cancelEditName()
                            }}
                            maxLength={80}
                            disabled={isSavingName}
                            className="form-input h-7 text-sm py-0 w-44 disabled:opacity-60"
                          />
                          <button
                            onClick={() => saveEditName(member)}
                            disabled={isSavingName}
                            title="Save name"
                            className="btn-ghost p-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                          >
                            {isSavingName
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={cancelEditName}
                            disabled={isSavingName}
                            title="Cancel"
                            className="btn-ghost p-1 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate">
                            {member.full_name ?? '—'}
                          </p>
                          {canEditNames && (
                            <button
                              onClick={() => startEditName(member)}
                              disabled={!!saving || !!nameSaving}
                              title="Edit name"
                              className="btn-ghost p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity disabled:cursor-not-allowed"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                          )}
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
                      )}
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
                      className="form-select h-8 text-xs w-36"
                    >
                      <option value="platform_admin">Platform Admin</option>
                      <option value="manager">Manager</option>
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

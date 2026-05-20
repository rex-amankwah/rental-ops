import { useEffect, useState, ChangeEvent, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertTriangle, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/roles'
import { PageShell, PageHeader } from '@/components/common/PageShell'

interface CompanyForm {
  name: string
  email: string
  phone: string
  support_email: string
  support_phone: string
  primary_color: string
  logo_url: string
  address: string
  city: string
  state: string
  zip: string
}

const BLANK: CompanyForm = {
  name: '', email: '', phone: '', support_email: '', support_phone: '',
  primary_color: '', logo_url: '', address: '', city: '', state: '', zip: '',
}

function toForm(co: Record<string, unknown>): CompanyForm {
  const s = (v: unknown) => (typeof v === 'string' ? v : '') ?? ''
  return {
    name:          s(co.name),
    email:         s(co.email),
    phone:         s(co.phone),
    support_email: s(co.support_email),
    support_phone: s(co.support_phone),
    primary_color: s(co.primary_color),
    logo_url:      s(co.logo_url),
    address:       s(co.address),
    city:          s(co.city),
    state:         s(co.state),
    zip:           s(co.zip),
  }
}

export default function CompanySettingsPage() {
  const { profile, appRole } = useAuth()
  const navigate = useNavigate()
  // Staff users are sent back to the dashboard since /settings is admin-only
  const backPath = isAdmin(appRole) ? '/settings' : '/'
  const backLabel = isAdmin(appRole) ? 'Settings' : 'Dashboard'

  const [form, setForm] = useState<CompanyForm>(BLANK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({})

  const fetchCompany = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    const { data, error: e } = await supabase
      .from('companies')
      .select('name,email,phone,support_email,support_phone,primary_color,logo_url,address,city,state,zip')
      .eq('id', profile.company_id)
      .single()
    if (e || !data) {
      setError('Failed to load company data.')
    } else {
      setForm(toForm(data as Record<string, unknown>))
    }
    setLoading(false)
  }, [profile?.company_id])

  useEffect(() => { fetchCompany() }, [fetchCompany])

  function patch(k: keyof CompanyForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
    setSaved(false)
    if (fieldErrors[k]) setFieldErrors(p => { const n = { ...p }; delete n[k]; return n })
  }

  function validate(): boolean {
    const e: Partial<Record<keyof CompanyForm, string>> = {}
    if (!form.name.trim()) e.name = 'Company name is required'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate() || !profile?.company_id) return
    setSaving(true); setError(null); setSaved(false)
    try {
      const { error: e } = await supabase
        .from('companies')
        .update({
          name:          form.name.trim(),
          email:         form.email.trim() || null,
          phone:         form.phone.trim() || null,
          support_email: form.support_email.trim() || null,
          support_phone: form.support_phone.trim() || null,
          primary_color: form.primary_color || null,
          logo_url:      form.logo_url.trim() || null,
          address:       form.address.trim() || null,
          city:          form.city.trim() || null,
          state:         form.state.trim() || null,
          zip:           form.zip.trim() || null,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', profile.company_id)
      if (e) throw e
      setSaved(true)
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Failed to save'
      setError(
        msg.includes('row-level security')
          ? 'Save blocked by RLS. Ensure your Supabase companies table has an UPDATE policy for admin users.'
          : msg,
      )
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Company Settings"
        subtitle="Update branding, contact information, and business address"
        actions={
          <button onClick={() => navigate(backPath)} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> {backLabel}
          </button>
        }
      />

      <div className="max-w-2xl space-y-5 animate-fade-in">
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}
        {saved && (
          <div className="alert alert-success">
            <span>Company settings saved successfully.</span>
          </div>
        )}

        {/* ── Business identity ──────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Business Identity</h3>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Company Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch('name', e.target.value)}
              className={`form-input ${fieldErrors.name ? 'border-red-400' : ''}`} />
            {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Logo URL</label>
            <input type="url" value={form.logo_url}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch('logo_url', e.target.value)}
              placeholder="https://example.com/logo.png"
              className="form-input" />
            <p className="text-xs text-muted-foreground">Paste a publicly accessible image URL. File upload coming later.</p>
            {form.logo_url && (
              <div className="mt-2 flex items-center gap-3">
                <img src={form.logo_url} alt="Logo preview" className="h-10 w-auto rounded border border-border object-contain bg-muted/30"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <span className="text-xs text-muted-foreground">Preview</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Brand Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.primary_color || '#6366f1'}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('primary_color', e.target.value)}
                className="h-9 w-16 rounded border border-border cursor-pointer" />
              <input type="text" value={form.primary_color}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('primary_color', e.target.value)}
                placeholder="#6366f1" maxLength={7}
                className="form-input w-32 font-mono" />
              {form.primary_color && (
                <button onClick={() => patch('primary_color', '')}
                  className="text-xs text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Hex color used in the app sidebar and branded materials.</p>
          </div>
        </div>

        {/* ── Contact & support ─────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Contact & Support</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Business Email</label>
              <input type="email" value={form.email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('email', e.target.value)}
                placeholder="hello@yourcompany.com" className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Business Phone</label>
              <input type="tel" value={form.phone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('phone', e.target.value)}
                placeholder="+1 (555) 000-0000" className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Support Email</label>
              <input type="email" value={form.support_email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('support_email', e.target.value)}
                placeholder="support@yourcompany.com" className="form-input" />
              <p className="text-xs text-muted-foreground">Shown in the Help page footer. Falls back to business email.</p>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Support Phone</label>
              <input type="tel" value={form.support_phone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('support_phone', e.target.value)}
                placeholder="+1 (555) 000-0000" className="form-input" />
              <p className="text-xs text-muted-foreground">Shown in the Help page footer. Falls back to business phone.</p>
            </div>
          </div>
        </div>

        {/* ── Business address ──────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Business Address</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Street Address</label>
              <input type="text" value={form.address}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('address', e.target.value)}
                placeholder="123 Main St" className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">City</label>
              <input type="text" value={form.city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('city', e.target.value)}
                placeholder="Austin" className="form-input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="form-label">State</label>
                <input type="text" value={form.state}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch('state', e.target.value)}
                  placeholder="TX" maxLength={2} className="form-input" />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">ZIP</label>
                <input type="text" value={form.zip}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch('zip', e.target.value)}
                  placeholder="78701" className="form-input" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate(backPath)} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </PageShell>
  )
}

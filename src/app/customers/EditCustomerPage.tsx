import { useEffect, useState, ChangeEvent, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import type { Customer } from '@/types/database'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

const SOURCE_OPTIONS = ['referral', 'website', 'social_media', 'walk_in', 'repeat', 'other']

interface CustomerForm {
  first_name: string
  last_name: string
  email: string
  phone: string
  phone_alt: string
  company_name: string
  billing_address: string
  billing_city: string
  billing_state: string
  billing_zip: string
  notes: string
  source: string
}

function toForm(c: Customer): CustomerForm {
  return {
    first_name:      c.first_name ?? '',
    last_name:       c.last_name ?? '',
    email:           c.email ?? '',
    phone:           c.phone ?? '',
    phone_alt:       c.phone_alt ?? '',
    company_name:    c.company_name ?? '',
    billing_address: c.billing_address ?? '',
    billing_city:    c.billing_city ?? '',
    billing_state:   c.billing_state ?? '',
    billing_zip:     c.billing_zip ?? '',
    notes:           c.notes ?? '',
    source:          c.source ?? '',
  }
}

export default function EditCustomerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [form, setForm] = useState<CustomerForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<CustomerForm>>({})

  const fetchCustomer = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    const { data, error: e } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('company_id', profile.company_id)
      .single()
    if (e || !data) {
      setError('Customer not found')
    } else {
      setForm(toForm(data as Customer))
    }
    setLoading(false)
  }, [id, profile?.company_id])

  useEffect(() => { fetchCustomer() }, [fetchCustomer])

  function patch(field: keyof CustomerForm, value: string) {
    setForm(p => p ? { ...p, [field]: value } : p)
    if (fieldErrors[field]) setFieldErrors(p => { const n = { ...p }; delete n[field]; return n })
  }

  function validate(): boolean {
    if (!form) return false
    const errors: Partial<CustomerForm> = {}
    if (!form.first_name.trim()) errors.first_name = 'First name is required'
    if (!form.last_name.trim()) errors.last_name = 'Last name is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Enter a valid email address'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function save() {
    if (!validate() || !form || !id || !profile?.company_id) return
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase
        .from('customers')
        .update({
          first_name:      form.first_name.trim(),
          last_name:       form.last_name.trim(),
          email:           form.email.trim() || null,
          phone:           form.phone.trim() || null,
          phone_alt:       form.phone_alt.trim() || null,
          company_name:    form.company_name.trim() || null,
          billing_address: form.billing_address.trim() || null,
          billing_city:    form.billing_city.trim() || null,
          billing_state:   form.billing_state.toUpperCase() || null,
          billing_zip:     form.billing_zip.trim() || null,
          notes:           form.notes.trim() || null,
          source:          form.source || null,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', id)
        .eq('company_id', profile.company_id)
      if (e) throw e
      navigate(`/customers/${id}`)
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save changes')
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="empty-state">
        <p className="text-sm text-muted-foreground">{error ?? 'Customer not found'}</p>
        <button onClick={() => navigate('/customers')} className="btn-secondary mt-4">Back to Customers</button>
      </div>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Edit Customer"
        subtitle={`${form.first_name} ${form.last_name}`}
        actions={
          <button onClick={() => navigate(`/customers/${id}`)} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        }
      />

      <div className="max-w-lg space-y-5 animate-fade-in">
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Info</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">First Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.first_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('first_name', e.target.value)}
                className={`form-input ${fieldErrors.first_name ? 'border-red-400' : ''}`} />
              {fieldErrors.first_name && <p className="text-xs text-red-600">{fieldErrors.first_name}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Last Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.last_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('last_name', e.target.value)}
                className={`form-input ${fieldErrors.last_name ? 'border-red-400' : ''}`} />
              {fieldErrors.last_name && <p className="text-xs text-red-600">{fieldErrors.last_name}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Email</label>
            <input type="email" value={form.email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch('email', e.target.value)}
              className={`form-input ${fieldErrors.email ? 'border-red-400' : ''}`} />
            {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">Phone</label>
              <input type="tel" value={form.phone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('phone', e.target.value)}
                className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Alt Phone</label>
              <input type="tel" value={form.phone_alt}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('phone_alt', e.target.value)}
                className="form-input" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Company Name</label>
            <input type="text" value={form.company_name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch('company_name', e.target.value)}
              className="form-input" />
          </div>

          <div className="space-y-1.5">
            <label className="form-label">Source</label>
            <select value={form.source}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('source', e.target.value)}
              className="form-select">
              <option value="">— Select —</option>
              {SOURCE_OPTIONS.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing Address</p>

          <div className="space-y-1.5">
            <label className="form-label">Street Address</label>
            <input type="text" value={form.billing_address}
              onChange={(e: ChangeEvent<HTMLInputElement>) => patch('billing_address', e.target.value)}
              className="form-input" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <label className="form-label">City</label>
              <input type="text" value={form.billing_city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('billing_city', e.target.value)}
                className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">State</label>
              <select value={form.billing_state}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('billing_state', e.target.value)}
                className="form-select">
                <option value="">—</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">ZIP</label>
              <input type="text" value={form.billing_zip}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('billing_zip', e.target.value)}
                className="form-input" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
          <textarea value={form.notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('notes', e.target.value)}
            placeholder="Internal notes about this customer…"
            rows={3}
            className="form-input resize-y w-full" />
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate(`/customers/${id}`)} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </PageShell>
  )
}

import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

interface CustomerDraft {
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  billing_city: string
  billing_state: string
}

const BLANK: CustomerDraft = {
  first_name: '', last_name: '', email: '', phone: '',
  company_name: '', billing_city: '', billing_state: '',
}

const DRAFT_KEY = 'rental_ops_customer_new_draft'

function loadDraft(): CustomerDraft | null {
  try { const r = sessionStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveDraft(d: CustomerDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function NewCustomerPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<CustomerDraft>(loadDraft() ?? BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<CustomerDraft>>({})

  useEffect(() => { saveDraft(form) }, [form])

  function set(field: keyof CustomerDraft, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n })
  }

  function validate(): boolean {
    const errors: Partial<CustomerDraft> = {}
    if (!form.first_name.trim()) errors.first_name = 'First name is required'
    if (!form.last_name.trim()) errors.last_name = 'Last name is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Enter a valid email address'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function save() {
    if (!validate()) return
    if (!profile?.company_id) { setError('No company found. Please reload.'); return }
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('customers').insert({
        company_id:    profile.company_id,
        first_name:    form.first_name.trim(),
        last_name:     form.last_name.trim(),
        email:         form.email.trim() || null,
        phone:         form.phone.trim() || null,
        company_name:  form.company_name.trim() || null,
        billing_city:  form.billing_city.trim() || null,
        billing_state: form.billing_state.trim().toUpperCase() || null,
        is_active:     true,
        total_orders:  0,
        total_spent:   0,
      })
      if (e) throw e
      clearDraft()
      navigate('/customers')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save customer')
    } finally { setSaving(false) }
  }

  function cancel() { clearDraft(); navigate('/customers') }

  return (
    <PageShell>
      <PageHeader
        title="New Customer"
        subtitle="Add a customer to your account"
        actions={
          <button onClick={cancel} className="btn-secondary">
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
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">First Name <span className="text-red-500">*</span></label>
              <input type="text" autoFocus value={form.first_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('first_name', e.target.value)}
                placeholder="Maria"
                className={`form-input ${fieldErrors.first_name ? 'border-red-400' : ''}`} />
              {fieldErrors.first_name && <p className="text-xs text-red-600">{fieldErrors.first_name}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Last Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.last_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('last_name', e.target.value)}
                placeholder="Rodriguez"
                className={`form-input ${fieldErrors.last_name ? 'border-red-400' : ''}`} />
              {fieldErrors.last_name && <p className="text-xs text-red-600">{fieldErrors.last_name}</p>}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="form-label">Email</label>
            <input type="email" value={form.email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('email', e.target.value)}
              placeholder="maria@example.com"
              className={`form-input ${fieldErrors.email ? 'border-red-400' : ''}`} />
            {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="form-label">Phone</label>
            <input type="tel" value={form.phone}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('phone', e.target.value)}
              placeholder="(713) 555-0100" className="form-input" />
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <label className="form-label">Company Name</label>
            <input type="text" value={form.company_name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('company_name', e.target.value)}
              placeholder="Optional — for business customers" className="form-input" />
          </div>

          {/* City + State */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">City</label>
              <input type="text" value={form.billing_city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('billing_city', e.target.value)}
                placeholder="Houston" className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">State</label>
              <select value={form.billing_state}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('billing_state', e.target.value)}
                className="form-select">
                <option value="">— Select —</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={cancel} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Add Customer</>}
          </button>
        </div>
      </div>
    </PageShell>
  )
}

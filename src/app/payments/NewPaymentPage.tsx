import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, DollarSign } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { InputField, SelectField, TextareaField } from '@/components/common/FormField'
import { formatCurrency, PAYMENT_METHODS } from '@/lib/constants'
import type { Invoice, Customer, RentalOrder, Payment } from '@/types/database'

type FullInvoice = Invoice & {
  customer: Customer | null
  order: RentalOrder | null
  payments: Payment[]
}

interface PaymentDraft {
  amount: string
  method: string
  payment_type: string
  reference: string
  notes: string
  payment_date: string
}

function draftKey(invoiceId: string) {
  return `rental_ops_payment_new_draft_${invoiceId}`
}

function loadDraft(invoiceId: string): PaymentDraft | null {
  try { const r = sessionStorage.getItem(draftKey(invoiceId)); return r ? JSON.parse(r) : null } catch { return null }
}
function saveDraft(invoiceId: string, d: PaymentDraft) {
  try { sessionStorage.setItem(draftKey(invoiceId), JSON.stringify(d)) } catch {}
}
function clearDraft(invoiceId: string) {
  try { sessionStorage.removeItem(draftKey(invoiceId)) } catch {}
}

export default function NewPaymentPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invoiceId = searchParams.get('invoiceId') ?? ''

  const [invoice, setInvoice] = useState<FullInvoice | null>(null)
  const [loadingInvoice, setLoadingInvoice] = useState(true)
  const [form, setForm] = useState<PaymentDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load invoice
  useEffect(() => {
    if (!invoiceId || !profile?.company_id) return
    setLoadingInvoice(true)
    supabase.from('invoices')
      .select(`*, customer:customers(*), order:rental_orders(order_number,event_name,event_date), payments(*)`)
      .eq('id', invoiceId)
      .eq('company_id', profile.company_id)
      .single()
      .then(({ data }) => {
        const inv = data as unknown as FullInvoice | null
        setInvoice(inv)
        if (inv) {
          const existing = loadDraft(invoiceId)
          setForm(existing ?? {
            amount: String(inv.balance_due > 0 ? inv.balance_due : inv.total),
            method: 'cash',
            payment_type: inv.balance_due > 0 ? 'payment' : 'deposit',
            reference: '',
            notes: '',
            payment_date: new Date().toISOString().split('T')[0],
          })
        }
        setLoadingInvoice(false)
      })
  }, [invoiceId, profile?.company_id])

  // Autosave draft on every form change
  useEffect(() => {
    if (form && invoiceId) saveDraft(invoiceId, form)
  }, [form, invoiceId])

  // Auto-derive payment type from amount vs balance
  useEffect(() => {
    if (!form || !invoice) return
    if (!['payment', 'partial_payment'].includes(form.payment_type)) return
    const amt = parseFloat(form.amount)
    if (isNaN(amt) || amt <= 0) return
    const derived = amt >= invoice.balance_due ? 'payment' : 'partial_payment'
    if (derived !== form.payment_type) setForm(p => p ? { ...p, payment_type: derived } : p)
  }, [form?.amount, invoice?.balance_due]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsedAmount = parseFloat(form?.amount ?? '0') || 0
  const isOverpayment = !!invoice && parsedAmount > invoice.balance_due && invoice.balance_due > 0
  const isStandardType = ['payment', 'partial_payment'].includes(form?.payment_type ?? '')

  async function save() {
    if (!profile?.company_id || !invoice || !form) return
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setError('Amount must be greater than 0'); return }
    if (isOverpayment && isStandardType) {
      setError(`Amount ${formatCurrency(amount)} exceeds balance due of ${formatCurrency(invoice.balance_due)}. Reduce the amount or change type to Deposit.`)
      return
    }
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('payments').insert({
        company_id:   profile.company_id,
        invoice_id:   invoice.id,
        order_id:     invoice.order_id,
        customer_id:  invoice.customer_id,
        payment_type: form.payment_type,
        method:       form.method,
        status:       'completed',
        amount,
        reference:    form.reference || null,
        notes:        form.notes || null,
        payment_date: form.payment_date,
        processed_by: profile.id,
      })
      if (e) throw e

      if (form.payment_type !== 'refund') {
        const newPaid    = invoice.amount_paid + amount
        const newBalance = Math.max(0, invoice.total - newPaid)
        const newStatus  = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : invoice.status
        await supabase.from('invoices').update({
          amount_paid: newPaid,
          balance_due: newBalance,
          status:      newStatus,
          ...(newBalance <= 0 ? { paid_at: new Date().toISOString() } : {}),
        }).eq('id', invoice.id)
      }

      clearDraft(invoiceId)
      navigate(`/invoices/${invoice.id}`)
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to record payment')
    } finally { setSaving(false) }
  }

  function cancel() {
    clearDraft(invoiceId)
    navigate(invoice ? `/invoices/${invoice.id}` : '/invoices')
  }

  if (loadingInvoice) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoice || !form) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Invoice not found.</p>
        <button onClick={() => navigate('/invoices')} className="btn-secondary mt-4">Back to Invoices</button>
      </div>
    )
  }

  const customer = invoice.customer as Customer | null

  return (
    <PageShell>
      <PageHeader
        title="Record Payment"
        subtitle={`Invoice ${invoice.invoice_number}${customer ? ` · ${customer.first_name} ${customer.last_name}` : ''}`}
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

        {/* Balance summary */}
        <div className="bg-muted/50 rounded-lg px-4 py-3 space-y-1.5 text-sm border border-border">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice Summary</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Invoice Total</span>
            <span className="font-medium text-foreground">{formatCurrency(invoice.total)}</span>
          </div>
          {invoice.amount_paid > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Already Paid</span>
              <span className="font-medium text-emerald-600">{formatCurrency(invoice.amount_paid)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-0.5">
            <span>Balance Due</span>
            <span className={invoice.balance_due > 0 ? 'text-red-600' : 'text-emerald-600'}>
              {formatCurrency(invoice.balance_due)}
            </span>
          </div>
        </div>

        {/* Overpayment warning */}
        {isOverpayment && isStandardType && (
          <div className="alert alert-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              Amount exceeds balance due by {formatCurrency(parsedAmount - invoice.balance_due)}.
              Change type to <strong>Deposit</strong> if this is a pre-payment.
            </span>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          {/* Amount */}
          <div className="space-y-1.5">
            <label className="form-label">Amount Being Paid Now <span className="text-red-500">*</span></label>
            <input type="number" min="0.01" step="0.01" placeholder="0.00"
              value={form.amount}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => p ? { ...p, amount: e.target.value } : p)}
              className={`form-input ${isOverpayment && isStandardType ? 'border-amber-400 focus:ring-amber-400' : ''}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <InputField label="Date" required type="date"
              value={form.payment_date}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => p ? { ...p, payment_date: e.target.value } : p)} />

            <SelectField label="Payment Type"
              value={form.payment_type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(p => p ? { ...p, payment_type: e.target.value } : p)}>
              <option value="payment">Full Payment</option>
              <option value="partial_payment">Partial Payment</option>
              <option value="deposit">Deposit / Pre-payment</option>
              <option value="security_deposit">Security Deposit</option>
              <option value="refund">Refund</option>
            </SelectField>
          </div>

          <SelectField label="Method"
            value={form.method}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(p => p ? { ...p, method: e.target.value } : p)}>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </SelectField>

          <InputField label="Reference / Check #" placeholder="Optional — check number, transaction ID…"
            value={form.reference}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => p ? { ...p, reference: e.target.value } : p)} />

          <TextareaField label="Notes" placeholder="Optional note…"
            value={form.notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm(p => p ? { ...p, notes: e.target.value } : p)} />
        </div>

        <div className="flex justify-between">
          <button onClick={cancel} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving || (isOverpayment && isStandardType)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Record Payment
          </button>
        </div>
      </div>
    </PageShell>
  )
}

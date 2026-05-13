import { useEffect, useState, useCallback, ChangeEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Send, CheckCircle2, AlertTriangle,
  Plus, Printer, DollarSign, Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { StatusBadge } from '@/components/common/StatusBadge'
import Modal from '@/components/common/Modal'
import { InputField, SelectField, TextareaField } from '@/components/common/FormField'
import { formatCurrency, formatDate, PAYMENT_METHODS } from '@/lib/constants'
import type { Invoice, InvoiceItem, Customer, RentalOrder, Payment } from '@/types/database'

type FullInvoice = Invoice & {
  customer: Customer | null
  order: RentalOrder | null
  items: InvoiceItem[]
  payments: Payment[]
}

// ─── Record Payment Modal ────────────────────────────────────────────────────

function RecordPaymentModal({
  open, onClose, invoice, onSuccess
}: {
  open: boolean
  onClose: () => void
  invoice: FullInvoice
  onSuccess: () => void
}) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    amount: String(invoice.balance_due > 0 ? invoice.balance_due : invoice.total),
    method: 'cash',
    payment_type: 'payment',
    reference: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!profile?.company_id) return
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setError('Amount must be greater than 0'); return }
    setSaving(true)
    setError(null)
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
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      subtitle={`Invoice ${invoice.invoice_number} · Balance: ${formatCurrency(invoice.balance_due)}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Record Payment
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="alert alert-error"><AlertTriangle className="w-4 h-4" /><span>{error}</span></div>}
        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="Amount" required type="number" min="0.01" step="0.01"
            value={form.amount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, amount: e.target.value }))}
          />
          <InputField
            label="Date" required type="date"
            value={form.payment_date}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, payment_date: e.target.value }))}
          />
          <SelectField
            label="Type"
            value={form.payment_type}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(p => ({ ...p, payment_type: e.target.value }))}
          >
            <option value="deposit">Deposit</option>
            <option value="payment">Full Payment</option>
            <option value="partial_payment">Partial Payment</option>
            <option value="security_deposit">Security Deposit</option>
            <option value="refund">Refund</option>
          </SelectField>
          <SelectField
            label="Method"
            value={form.method}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(p => ({ ...p, method: e.target.value }))}
          >
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </SelectField>
        </div>
        <InputField
          label="Reference / Check #"
          placeholder="Optional — check number, transaction ID…"
          value={form.reference}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, reference: e.target.value }))}
        />
        <TextareaField
          label="Notes"
          placeholder="Optional note…"
          value={form.notes}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm(p => ({ ...p, notes: e.target.value }))}
        />
      </div>
    </Modal>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [invoice, setInvoice] = useState<FullInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [paymentModal, setPaymentModal] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('invoices')
        .select(`*, customer:customers(*), order:rental_orders(order_number,event_name,event_date), items:invoice_items(*), payments(*)`)
        .eq('id', id).eq('company_id', profile.company_id).single()
      setInvoice(data as unknown as FullInvoice)
    } finally {
      setLoading(false)
    }
  }, [id, profile?.company_id])

  useEffect(() => { load() }, [load])

  async function markSent() {
    if (!invoice) return
    setStatusSaving(true)
    await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoice.id)
    await load()
    setStatusSaving(false)
  }

  async function voidInvoice() {
    if (!invoice) return
    if (!confirm('Void this invoice? This cannot be undone.')) return
    setStatusSaving(true)
    await supabase.from('invoices').update({ status: 'voided' }).eq('id', invoice.id)
    await load()
    setStatusSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Invoice not found.</p>
        <button onClick={() => navigate('/invoices')} className="btn-secondary mt-4">Back to Invoices</button>
      </div>
    )
  }

  const customer = invoice.customer as unknown as Customer | null
  const order = invoice.order as unknown as { order_number: string; event_name: string; event_date: string } | null
  const items = (invoice.items ?? []) as InvoiceItem[]
  const payments = (invoice.payments ?? []) as Payment[]
  const isPaid = invoice.status === 'paid'
  const isVoided = invoice.status === 'voided'

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/invoices')} className="btn-ghost p-2 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold font-mono">{invoice.invoice_number}</h1>
            <StatusBadge type="invoice" status={invoice.status} />
          </div>
          {order && <p className="text-sm text-muted-foreground mt-0.5">{order.order_number} · {order.event_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!isPaid && !isVoided && (
            <button onClick={() => setPaymentModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
          )}
          {invoice.status === 'draft' && (
            <button onClick={markSent} disabled={statusSaving} className="btn-secondary">
              {statusSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Mark Sent
            </button>
          )}
          <button onClick={() => window.print()} className="btn-ghost p-2">
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Invoice document */}
      <div className="bg-card rounded-xl border border-border overflow-hidden print:shadow-none">
        {/* Invoice header */}
        <div className="p-6 border-b border-border">
          <div className="flex justify-between gap-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Bill To</p>
              {customer ? (
                <>
                  <p className="font-medium text-foreground mt-1">{customer.first_name} {customer.last_name}</p>
                  {customer.company_name && <p className="text-sm text-muted-foreground">{customer.company_name}</p>}
                  {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
                  {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
                </>
              ) : <p className="text-sm text-muted-foreground">No customer</p>}
            </div>
            <div className="text-right space-y-1">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Invoice #</p>
                <p className="font-mono font-semibold text-foreground">{invoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Issued</p>
                <p className="text-sm text-foreground">{formatDate(invoice.issue_date)}</p>
              </div>
              {invoice.due_date && (
                <div>
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className={`text-sm font-medium ${invoice.status === 'overdue' ? 'text-red-600' : 'text-foreground'}`}>
                    {formatDate(invoice.due_date)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line items */}
        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Days</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-sm text-muted-foreground py-8">No line items</td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td className="text-sm text-foreground">{item.description}</td>
                <td className="text-right text-sm">{item.quantity}</td>
                <td className="text-right text-sm">{formatCurrency(item.unit_rate)}</td>
                <td className="text-right text-sm">{item.rental_days}</td>
                <td className="text-right text-sm font-medium">{formatCurrency(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="p-6 border-t border-border">
          <div className="ml-auto w-64 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
            {invoice.delivery_fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Delivery</span><span>{formatCurrency(invoice.delivery_fee)}</span></div>}
            {invoice.setup_fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Setup</span><span>{formatCurrency(invoice.setup_fee)}</span></div>}
            {invoice.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-{formatCurrency(invoice.discount)}</span></div>}
            {invoice.tax_amount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(invoice.tax_amount)}</span></div>}
            <div className="flex justify-between font-semibold text-base pt-2 border-t border-border">
              <span>Total</span><span>{formatCurrency(invoice.total)}</span>
            </div>
            {invoice.amount_paid > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Paid</span><span>-{formatCurrency(invoice.amount_paid)}</span>
              </div>
            )}
            {invoice.balance_due > 0 && (
              <div className="flex justify-between font-bold text-red-600">
                <span>Balance Due</span><span>{formatCurrency(invoice.balance_due)}</span>
              </div>
            )}
          </div>
        </div>

        {invoice.notes && (
          <div className="px-6 pb-6 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-foreground">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Payment History</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Method</th><th>Reference</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="text-sm text-muted-foreground">{formatDate(p.payment_date)}</td>
                  <td className="text-sm capitalize">{p.payment_type.replace(/_/g, ' ')}</td>
                  <td className="text-sm capitalize">{p.method}</td>
                  <td className="text-xs font-mono text-muted-foreground">{p.reference ?? '—'}</td>
                  <td className={`text-right text-sm font-medium ${
                    p.payment_type === 'refund' ? 'text-red-600' : 'text-emerald-600'
                  }`}>
                    {p.payment_type === 'refund' ? '-' : ''}{formatCurrency(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {!isPaid && !isVoided && (
        <div className="flex justify-end">
          <button onClick={voidInvoice} disabled={statusSaving} className="btn-ghost text-red-600 hover:text-red-700">
            Void Invoice
          </button>
        </div>
      )}

      {/* Payment modal */}
      <RecordPaymentModal
        open={paymentModal}
        onClose={() => setPaymentModal(false)}
        invoice={invoice}
        onSuccess={load}
      />
    </div>
  )
}

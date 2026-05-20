import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Send,
  Plus, Printer, DollarSign, Loader2, Mail, X, Info, Share2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit } from '@/lib/roles'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/constants'
import type { Invoice, InvoiceItem, Customer, RentalOrder, Payment } from '@/types/database'

type FullInvoice = Invoice & {
  customer: Customer | null
  order: RentalOrder | null
  items: InvoiceItem[]
  payments: Payment[]
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, appRole } = useAuth()
  const [invoice, setInvoice] = useState<FullInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusSaving, setStatusSaving] = useState(false)
  const [receiptNotice, setReceiptNotice] = useState(false)

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

  async function handleShare() {
    const title = `Invoice ${invoice?.invoice_number ?? ''}`
    const c = invoice?.customer as unknown as Customer | null
    const text = c
      ? `Invoice from Rentora for ${c.first_name} ${c.last_name}`.trim()
      : 'Invoice from Rentora'
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
        return
      } catch {
        // User dismissed share sheet — fall through to print
      }
    }
    window.print()
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
      {/* Header — hidden in print */}
      <div className="flex items-start gap-4 no-print">
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isPaid && !isVoided && canEdit(appRole) && (
            <button onClick={() => navigate(`/payments/new?invoiceId=${invoice.id}`)} className="btn-primary">
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
          )}
          {isPaid && (
            <>
              {customer?.email && (
                <button onClick={() => setReceiptNotice(true)} className="btn-secondary">
                  <Mail className="w-4 h-4" />
                  <span className="hidden sm:inline">Send Receipt</span>
                </button>
              )}
              <button onClick={() => window.print()} className="btn-primary">
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Print Receipt</span>
              </button>
            </>
          )}
          {invoice.status === 'draft' && canEdit(appRole) && (
            <button onClick={markSent} disabled={statusSaving} className="btn-secondary">
              {statusSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">Mark Sent</span>
            </button>
          )}
          {/* Share/print — Web Share API on mobile, print fallback on desktop */}
          <button onClick={handleShare} className="btn-ghost p-2" title="Share or print invoice">
            {'share' in navigator
              ? <Share2 className="w-4 h-4" />
              : <Printer className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Send Receipt placeholder notice */}
      {receiptNotice && (
        <div className="alert alert-info no-print">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>
            Receipt email is not connected yet.
            {customer?.email && <> Customer email on file: <strong>{customer.email}</strong>.</>}
            {' '}Use <strong>Print Receipt</strong> to generate a PDF to share manually.
          </span>
          <button onClick={() => setReceiptNotice(false)} className="ml-auto btn-ghost p-1 flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Financial Summary</p>
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

      {/* Actions — hidden in print */}
      {!isPaid && !isVoided && canEdit(appRole) && (
        <div className="flex justify-end no-print">
          <button onClick={voidInvoice} disabled={statusSaving} className="btn-ghost text-red-600 hover:text-red-700">
            Void Invoice
          </button>
        </div>
      )}

      {/* Print-only receipt confirmation — hidden on screen, visible when printing */}
      {isPaid && (
        <div className="print-only hidden border-t-2 border-gray-800 pt-6 mt-6 space-y-4">
          <div className="text-center">
            <p className="text-xl font-bold uppercase tracking-widest">Payment Receipt</p>
            {profile?.companies?.name && (
              <p className="text-sm text-gray-600 mt-1">{profile.companies.name}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mt-4">
            <div className="flex gap-2">
              <span className="font-semibold w-32 flex-shrink-0">Invoice #</span>
              <span className="font-mono">{invoice.invoice_number}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold w-32 flex-shrink-0">Status</span>
              <span className="font-semibold text-green-700 uppercase">Paid in Full</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold w-32 flex-shrink-0">Customer</span>
              <span>{customer ? `${customer.first_name} ${customer.last_name}` : '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold w-32 flex-shrink-0">Date Paid</span>
              <span>{invoice.paid_at ? formatDate(invoice.paid_at) : formatDate(invoice.issue_date)}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold w-32 flex-shrink-0">Invoice Total</span>
              <span>{formatCurrency(invoice.total)}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold w-32 flex-shrink-0">Amount Paid</span>
              <span className="font-semibold">{formatCurrency(invoice.amount_paid)}</span>
            </div>
            {payments.length > 0 && (
              <>
                <div className="flex gap-2">
                  <span className="font-semibold w-32 flex-shrink-0">Method</span>
                  <span className="capitalize">{payments[payments.length - 1].method}</span>
                </div>
                {payments[payments.length - 1].reference && (
                  <div className="flex gap-2">
                    <span className="font-semibold w-32 flex-shrink-0">Reference</span>
                    <span className="font-mono">{payments[payments.length - 1].reference}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <span className="font-semibold w-32 flex-shrink-0">Balance</span>
              <span className="font-semibold">{invoice.balance_due <= 0 ? '$0.00' : formatCurrency(invoice.balance_due)}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center pt-4 border-t border-gray-200">
            Thank you for your business.
          </p>
        </div>
      )}

    </div>
  )
}

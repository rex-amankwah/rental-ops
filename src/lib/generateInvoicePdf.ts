/**
 * generateInvoicePdf
 *
 * Generates a real text-searchable PDF from in-memory invoice data using
 * jsPDF. No DOM capture, no html2canvas — all layout is drawn programmatically
 * so CSS variables and Tailwind classes are irrelevant.
 *
 * Dynamically imported by InvoiceDetailPage so jsPDF never loads on initial
 * page render — only when the user clicks "Download PDF" or "Share".
 */

import type { Invoice, InvoiceItem, Customer, Payment } from '@/types/database'

type FullInvoice = Invoice & {
  customer: Customer | null
  items: InvoiceItem[]
  payments: Payment[]
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function generateInvoicePdf(
  invoice: FullInvoice,
  companyName: string,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  const PW = 210          // page width mm
  const PH = 297          // page height mm
  const ML = 15           // left margin
  const MR = 15           // right margin
  const CW = PW - ML - MR // content width = 180mm
  const RIGHT = PW - MR   // right edge x

  // ── colours ────────────────────────────────────────────────────────────────
  const BLUE  = [37, 99, 235]  as [number, number, number]  // primary blue
  const DARK  = [30, 35, 48]   as [number, number, number]  // foreground
  const GREY  = [100, 110, 130]as [number, number, number]  // muted
  const LGREY = [235, 238, 243]as [number, number, number]  // border/bg
  const GREEN = [16, 140, 80]  as [number, number, number]  // paid / positive
  const RED   = [220, 38, 38]  as [number, number, number]  // overdue / balance

  let y = 0

  // ── header band ────────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE)
  doc.rect(0, 0, PW, 14, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('RENTORA', ML, 9.5)

  if (companyName && companyName !== 'Rentora') {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`/ ${companyName}`, ML + 29, 9.5)
  }

  // "INVOICE" right-aligned in header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('INVOICE', RIGHT, 9.5, { align: 'right' })

  y = 22

  // ── invoice meta block ─────────────────────────────────────────────────────
  // Left: Bill To    Right: Invoice details
  const customer = invoice.customer as unknown as Customer | null

  // Bill To label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...GREY)
  doc.text('BILL TO', ML, y)

  // Invoice details label
  doc.text('INVOICE DETAILS', RIGHT - 55, y, { align: 'left' })

  y += 5

  // Customer info (left column)
  doc.setTextColor(...DARK)
  if (customer) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`${customer.first_name} ${customer.last_name}`, ML, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (customer.company_name) {
      doc.text(customer.company_name, ML, y)
      y += 4.5
    }
    if (customer.email) {
      doc.text(customer.email, ML, y)
      y += 4.5
    }
    if (customer.phone) {
      doc.text(customer.phone, ML, y)
      y += 4.5
    }
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('No customer on file', ML, y)
    y += 5
  }

  // Invoice details (right column — fixed top at y=27)
  let ry = 27
  const DETAIL_X = RIGHT - 55
  const DETAIL_VAL_X = RIGHT

  function detailRow(label: string, value: string, color?: [number, number, number]) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GREY)
    doc.text(label, DETAIL_X, ry)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...(color ?? DARK))
    doc.text(value, DETAIL_VAL_X, ry, { align: 'right' })
    ry += 5
  }

  detailRow('Invoice #', invoice.invoice_number)
  detailRow('Issued', fmtDate(invoice.issue_date))
  if (invoice.due_date) {
    const isOverdue = invoice.status === 'overdue'
    detailRow('Due', fmtDate(invoice.due_date), isOverdue ? RED : undefined)
  }
  const STATUS_LABELS: Record<string, string> = {
    draft: 'DRAFT', sent: 'SENT', paid: 'PAID',
    overdue: 'OVERDUE', voided: 'VOIDED', partial: 'PARTIAL',
  }
  const statusLabel = STATUS_LABELS[invoice.status] ?? invoice.status.toUpperCase()
  const statusColor: [number, number, number] =
    invoice.status === 'paid'    ? GREEN :
    invoice.status === 'voided'  ? GREY  :
    invoice.status === 'overdue' ? RED   : DARK
  detailRow('Status', statusLabel, statusColor)

  // Advance y past whichever column is taller
  y = Math.max(y, ry) + 4

  // ── divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(...LGREY)
  doc.setLineWidth(0.3)
  doc.line(ML, y, RIGHT, y)
  y += 6

  // ── line items table ────────────────────────────────────────────────────────
  const COL = {
    desc:   ML,
    qty:    ML + 95,
    rate:   ML + 115,
    days:   ML + 135,
    amount: RIGHT,
  }

  // Table header background
  doc.setFillColor(...LGREY)
  doc.rect(ML, y - 4, CW, 8, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...GREY)
  doc.text('DESCRIPTION',  COL.desc,   y)
  doc.text('QTY',          COL.qty,    y)
  doc.text('RATE',         COL.rate,   y)
  doc.text('DAYS',         COL.days,   y)
  doc.text('AMOUNT',       COL.amount, y, { align: 'right' })
  y += 5

  // Rows
  const items = (invoice.items ?? []) as InvoiceItem[]
  if (items.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GREY)
    doc.text('No line items', ML, y + 5)
    y += 12
  } else {
    for (const item of items) {
      // Page overflow guard
      if (y > PH - 60) {
        doc.addPage()
        y = 20
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...DARK)

      // Wrap long descriptions
      const lines = doc.splitTextToSize(item.description ?? '', 88) as string[]
      doc.text(lines, COL.desc, y)
      const lineH = lines.length * 4.5

      doc.text(String(item.quantity),        COL.qty,    y)
      doc.text(fmt(item.unit_rate),          COL.rate,   y)
      doc.text(String(item.rental_days),     COL.days,   y)
      doc.text(fmt(item.line_total),         COL.amount, y, { align: 'right' })

      y += Math.max(lineH, 6)

      // Row separator
      doc.setDrawColor(...LGREY)
      doc.setLineWidth(0.2)
      doc.line(ML, y - 1, RIGHT, y - 1)
    }
  }

  y += 4

  // ── financial summary ───────────────────────────────────────────────────────
  const TOTALS_X = RIGHT - 65
  const TOTALS_VAL_X = RIGHT

  function totalRow(
    label: string,
    value: string,
    opts?: { bold?: boolean; color?: [number, number, number]; topBorder?: boolean; size?: number }
  ) {
    if (y > PH - 30) { doc.addPage(); y = 20 }
    if (opts?.topBorder) {
      doc.setDrawColor(...LGREY)
      doc.setLineWidth(0.3)
      doc.line(TOTALS_X, y - 2, RIGHT, y - 2)
    }
    const sz = opts?.size ?? 9
    doc.setFontSize(sz)
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setTextColor(...(opts?.color ?? GREY))
    doc.text(label, TOTALS_X, y)
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setTextColor(...(opts?.color ?? DARK))
    doc.text(value, TOTALS_VAL_X, y, { align: 'right' })
    y += 5.5
  }

  totalRow('Subtotal', fmt(invoice.subtotal))
  if (invoice.delivery_fee > 0) totalRow('Delivery', fmt(invoice.delivery_fee))
  if (invoice.setup_fee > 0)    totalRow('Setup Fee', fmt(invoice.setup_fee))
  if (invoice.discount > 0)     totalRow('Discount', `-${fmt(invoice.discount)}`, { color: GREEN })
  if (invoice.tax_amount > 0)   totalRow('Tax', fmt(invoice.tax_amount))

  totalRow('Total', fmt(invoice.total), { bold: true, color: DARK, topBorder: true, size: 11 })

  if (invoice.amount_paid > 0) {
    totalRow('Paid', `-${fmt(invoice.amount_paid)}`, { color: GREEN })
  }
  if (invoice.balance_due > 0) {
    totalRow('Balance Due', fmt(invoice.balance_due), { bold: true, color: RED, size: 10 })
  }

  // ── notes ───────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    y += 4
    if (y > PH - 40) { doc.addPage(); y = 20 }
    doc.setDrawColor(...LGREY)
    doc.setLineWidth(0.3)
    doc.line(ML, y, RIGHT, y)
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.text('NOTES', ML, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    const noteLines = doc.splitTextToSize(invoice.notes, CW) as string[]
    doc.text(noteLines, ML, y)
    y += noteLines.length * 4.5 + 4
  }

  // ── payment history ─────────────────────────────────────────────────────────
  const payments = (invoice.payments ?? []) as Payment[]
  if (payments.length > 0) {
    y += 4
    if (y > PH - 50) { doc.addPage(); y = 20 }

    doc.setDrawColor(...LGREY)
    doc.setLineWidth(0.3)
    doc.line(ML, y, RIGHT, y)
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.text('PAYMENT HISTORY', ML, y)
    y += 5

    // Mini payment table
    doc.setFillColor(...LGREY)
    doc.rect(ML, y - 4, CW, 7, 'F')

    const PC = { date: ML, type: ML + 30, method: ML + 70, ref: ML + 105, amount: RIGHT }
    doc.setFontSize(7.5)
    doc.setTextColor(...GREY)
    doc.text('DATE',      PC.date,   y)
    doc.text('TYPE',      PC.type,   y)
    doc.text('METHOD',    PC.method, y)
    doc.text('REF',       PC.ref,    y)
    doc.text('AMOUNT',    PC.amount, y, { align: 'right' })
    y += 5

    for (const p of payments) {
      if (y > PH - 20) { doc.addPage(); y = 20 }
      const isRefund = p.payment_type === 'refund'
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...DARK)
      doc.text(fmtDate(p.payment_date), PC.date, y)
      doc.text((p.payment_type ?? '').replace(/_/g, ' '), PC.type, y)
      doc.text(p.method ?? '', PC.method, y)
      doc.text(p.reference ?? '—', PC.ref, y)
      doc.setTextColor(...(isRefund ? RED : GREEN))
      doc.text(`${isRefund ? '-' : ''}${fmt(p.amount)}`, PC.amount, y, { align: 'right' })
      y += 5.5

      doc.setDrawColor(...LGREY)
      doc.setLineWidth(0.2)
      doc.line(ML, y - 1, RIGHT, y - 1)
    }
  }

  // ── footer ───────────────────────────────────────────────────────────────────
  const footerY = PH - 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GREY)
  doc.text('Thank you for your business.', PW / 2, footerY, { align: 'center' })

  return doc.output('blob')
}

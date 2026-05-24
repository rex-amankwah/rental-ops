/**
 * QRLabelModal
 *
 * Displays a QR code for a bundle with:
 *  - Large scannable QR code preview
 *  - Bundle code + name label
 *  - Download as PNG
 *  - Print label (popup window)
 *
 * jsPDF is not used here — QR code is rendered via the
 * `qrcode` package onto a <canvas>, then exported as PNG.
 * The library is dynamically imported so it never loads
 * on initial render.
 */

import { useEffect, useRef, useState } from 'react'
import { Download, Printer, QrCode, Loader2 } from 'lucide-react'
import Modal from '@/components/common/Modal'
import type { AssetBundle } from '@/types/database'

interface QRLabelModalProps {
  open: boolean
  onClose: () => void
  bundle: AssetBundle
  companyName: string
}

export default function QRLabelModal({ open, onClose, bundle, companyName }: QRLabelModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qrValue = bundle.qr_code_value ?? bundle.bundle_code

  // Generate QR on canvas whenever modal opens or qrValue changes
  useEffect(() => {
    if (!open || !canvasRef.current) return
    let cancelled = false

    async function renderQR() {
      setGenerating(true)
      setError(null)
      try {
        const QRCode = (await import('qrcode')).default
        if (!cancelled && canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, qrValue, {
            width: 280,
            margin: 2,
            color: { dark: '#1e2330', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          })
        }
      } catch (err) {
        if (!cancelled) setError('Failed to generate QR code')
        console.error('[QRLabelModal] QR gen error:', err)
      } finally {
        if (!cancelled) setGenerating(false)
      }
    }

    renderQR()
    return () => { cancelled = true }
  }, [open, qrValue])

  function downloadPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `QR-${bundle.bundle_code}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function printLabel() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')

    const win = window.open('', '_blank', 'width=480,height=600')
    if (!win) {
      alert('Allow pop-ups to print QR labels.')
      return
    }
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Asset Label – ${bundle.bundle_code}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .label { width: 3in; border: 2px solid #1e2330; border-radius: 8px; padding: 14px 14px 16px; text-align: center; }
    .company { font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; margin-bottom: 10px; }
    .qr-img { width: 200px; height: 200px; display: block; margin: 0 auto; }
    .bundle-name { font-size: 13px; font-weight: 700; color: #1e2330; margin-top: 10px; margin-bottom: 4px; }
    .bundle-code { font-family: 'Courier New', monospace; font-size: 12px; color: #334155; letter-spacing: 0.05em; }
    @media print {
      body { min-height: auto; }
      .label { border-color: #000; }
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="company">${companyName}</div>
    <img class="qr-img" src="${dataUrl}" alt="QR Code" />
    <div class="bundle-name">${bundle.name}</div>
    <div class="bundle-code">${bundle.bundle_code}</div>
  </div>
  <script>
    window.onload = function() { window.print(); }
  </script>
</body>
</html>`)
    win.document.close()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="QR Label"
      subtitle={bundle.bundle_code}
      size="sm"
      allowBackdropClose
      footer={
        <div className="flex gap-2 w-full">
          <button
            onClick={downloadPng}
            disabled={generating || !!error}
            className="btn-secondary flex-1 justify-center"
          >
            <Download className="w-4 h-4" />
            Download PNG
          </button>
          <button
            onClick={printLabel}
            disabled={generating || !!error}
            className="btn-primary flex-1 justify-center"
          >
            <Printer className="w-4 h-4" />
            Print Label
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* QR canvas — always rendered, hidden while generating */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className={generating || error ? 'opacity-0 absolute' : ''}
            style={{ display: 'block' }}
          />
          {generating && (
            <div className="w-[280px] h-[280px] flex items-center justify-center bg-muted rounded-lg">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-red-50 border border-red-200 rounded-lg gap-2">
              <QrCode className="w-8 h-8 text-red-400" />
              <p className="text-xs text-red-600 text-center px-4">{error}</p>
            </div>
          )}
        </div>

        {/* Label info */}
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">{bundle.name}</p>
          <p className="font-mono text-sm text-muted-foreground">{bundle.bundle_code}</p>
          {bundle.qr_code_value && bundle.qr_code_value !== bundle.bundle_code && (
            <p className="text-xs text-muted-foreground">QR value: {bundle.qr_code_value}</p>
          )}
        </div>

        <div className="w-full bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p><span className="font-medium">Laminate</span> this label and attach it to the physical cart or pallet.</p>
          <p>Staff scan this code with the <span className="font-medium">Scanner</span> to check out/in all assets at once.</p>
        </div>
      </div>
    </Modal>
  )
}

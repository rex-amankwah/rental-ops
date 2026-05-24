/**
 * ScannerPage — /assets/scan
 *
 * Mobile-first QR scanning interface for field staff.
 * Supports: Check Out, Check In, Maintenance In.
 *
 * Camera scanning: html5-qrcode (dynamically imported — ~0 impact on initial load)
 * Manual fallback: text input for staff who prefer typing
 *
 * Workflow:
 * 1. Camera scans / staff types a QR value
 * 2. Bundle is looked up in asset_bundles
 * 3. Staff selects an action (Check Out / Check In / Maintenance In)
 * 4. logBundleMovement() fires: INSERTs asset_movements + UPDATEs asset statuses
 * 5. Vibration + success screen → "Scan Another"
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, ArrowLeft, QrCode, Keyboard, CheckCircle2, AlertTriangle,
  Loader2, Truck, RotateCcw, Wrench, ChevronRight, RefreshCw
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logBundleMovement } from '@/lib/movementLogger'
import type { AssetBundle, AssetMovementType, AssetStatus } from '@/types/database'

type ScanMode = 'camera' | 'manual'
type Stage = 'scanning' | 'found' | 'success' | 'error'

interface ActionConfig {
  type: AssetMovementType
  toStatus: AssetStatus
  label: string
  description: string
  icon: React.ReactNode
  color: string
}

const ACTIONS: ActionConfig[] = [
  {
    type: 'checkout',
    toStatus: 'out_for_delivery',
    label: 'Check Out',
    description: 'Mark all assets as out for delivery',
    icon: <Truck className="w-6 h-6" />,
    color: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
  {
    type: 'checkin',
    toStatus: 'returning',
    label: 'Check In',
    description: 'Mark all assets as returning — pending inspection',
    icon: <RotateCcw className="w-6 h-6" />,
    color: 'bg-sky-600 hover:bg-sky-700 text-white',
  },
  {
    type: 'maintenance_in',
    toStatus: 'maintenance',
    label: 'Maintenance In',
    description: 'Send all assets to maintenance queue',
    icon: <Wrench className="w-6 h-6" />,
    color: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
]

export default function ScannerPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<ScanMode>('camera')
  const [stage, setStage] = useState<Stage>('scanning')
  const [manualInput, setManualInput] = useState('')
  const [bundle, setBundle] = useState<AssetBundle | null>(null)
  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null)
  const [processing, setProcessing] = useState(false)
  const [successCount, setSuccessCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  // Camera instance ref (html5-qrcode)
  const html5QrRef = useRef<{ stop: () => Promise<void> } | null>(null)
  const scannerDivId = 'qr-scanner-viewport'
  const scannedRef = useRef(false) // prevent duplicate scan events

  const stopCamera = useCallback(async () => {
    if (html5QrRef.current) {
      try { await html5QrRef.current.stop() } catch { /* ignore */ }
      html5QrRef.current = null
    }
    scannedRef.current = false
  }, [])

  const startCamera = useCallback(async () => {
    if (!profile?.company_id) return
    setCameraError(null)
    setCameraReady(false)
    scannedRef.current = false

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(scannerDivId)
      html5QrRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText: string) => {
          if (scannedRef.current) return
          scannedRef.current = true
          handleQrValue(decodedText)
        },
        () => { /* ignore frame-level decode errors — continuous scanning */ },
      )
      setCameraReady(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission') || msg.includes('permission')) {
        setCameraError('Camera permission denied. Use manual input below.')
      } else if (msg.includes('NotFound') || msg.includes('no camera')) {
        setCameraError('No camera found. Use manual input below.')
      } else {
        setCameraError('Camera unavailable. Use manual input below.')
      }
    }
  }, [profile?.company_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start camera when mode = camera and stage = scanning
  useEffect(() => {
    if (mode === 'camera' && stage === 'scanning') {
      startCamera()
    }
    return () => { stopCamera() }
  }, [mode, stage, startCamera, stopCamera])

  async function handleQrValue(value: string) {
    if (!profile?.company_id) return
    await stopCamera()

    const qrVal = value.trim()
    if (!qrVal) return

    // Lookup bundle by qr_code_value
    const { data, error } = await supabase
      .from('asset_bundles')
      .select('*, catalog_item:inventory_catalog(name, category)')
      .eq('company_id', profile.company_id)
      .eq('qr_code_value', qrVal)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !data) {
      // Try bundle_code fallback
      const { data: byCode } = await supabase
        .from('asset_bundles')
        .select('*, catalog_item:inventory_catalog(name, category)')
        .eq('company_id', profile.company_id)
        .eq('bundle_code', qrVal)
        .eq('is_active', true)
        .maybeSingle()

      if (!byCode) {
        setErrorMsg(`No active bundle found for QR value: "${qrVal}"`)
        setStage('error')
        return
      }
      setBundle(byCode as AssetBundle)
    } else {
      setBundle(data as AssetBundle)
    }

    // Light haptic feedback on successful scan
    navigator.vibrate?.(80)
    setStage('found')
  }

  async function confirmAction() {
    if (!bundle || !selectedAction || !profile?.company_id || !profile?.id) return
    setProcessing(true)
    try {
      const result = await logBundleMovement(
        bundle.id,
        selectedAction.type,
        selectedAction.toStatus,
        profile.company_id,
        profile.id,
      )

      if (!result.success) {
        setErrorMsg(result.error ?? 'Movement failed')
        setStage('error')
        return
      }

      setSuccessCount(result.assetCount)
      // Strong haptic success feedback
      navigator.vibrate?.([100, 50, 100])
      setStage('success')
    } finally {
      setProcessing(false)
    }
  }

  function reset() {
    setStage('scanning')
    setBundle(null)
    setSelectedAction(null)
    setErrorMsg(null)
    setManualInput('')
    setSuccessCount(0)
    setCameraError(null)
    scannedRef.current = false
    if (mode === 'camera') {
      // Camera will restart via useEffect
    }
  }

  function switchMode(m: ScanMode) {
    stopCamera()
    setMode(m)
    reset()
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <button onClick={() => { stopCamera(); navigate('/assets/bundles') }}
          className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Bundles</span>
        </button>
        <h1 className="text-base font-semibold">Asset Scanner</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => switchMode('camera')}
            className={`px-3 py-1.5 rounded-l-md text-xs font-medium border transition-colors ${
              mode === 'camera'
                ? 'bg-primary border-primary text-white'
                : 'bg-white/10 border-white/20 text-white/70 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => switchMode('manual')}
            className={`px-3 py-1.5 rounded-r-md text-xs font-medium border transition-colors ${
              mode === 'manual'
                ? 'bg-primary border-primary text-white'
                : 'bg-white/10 border-white/20 text-white/70 hover:text-white'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* ── SCANNING STAGE ───────────────────────────────────── */}
        {stage === 'scanning' && (
          <div className="flex-1 flex flex-col">
            {mode === 'camera' ? (
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-4">
                {/* Camera viewport */}
                <div className="relative w-full max-w-sm">
                  {/* The div html5-qrcode renders into */}
                  <div
                    id={scannerDivId}
                    className="w-full rounded-xl overflow-hidden bg-black"
                    style={{ minHeight: '300px' }}
                  />
                  {/* Corner guides overlay */}
                  {!cameraError && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="relative w-48 h-48">
                        {[
                          'top-0 left-0 border-t-2 border-l-2 rounded-tl-md',
                          'top-0 right-0 border-t-2 border-r-2 rounded-tr-md',
                          'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md',
                          'bottom-0 right-0 border-b-2 border-r-2 rounded-br-md',
                        ].map((cls, i) => (
                          <div key={i} className={`absolute w-8 h-8 border-primary ${cls}`} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {cameraError ? (
                  <div className="flex flex-col items-center gap-3 text-center max-w-xs">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <p className="text-sm text-white/70">{cameraError}</p>
                    <button onClick={() => switchMode('manual')} className="btn-primary text-sm">
                      <Keyboard className="w-4 h-4" /> Switch to Manual
                    </button>
                  </div>
                ) : !cameraReady ? (
                  <div className="flex items-center gap-2 text-white/50 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Starting camera…
                  </div>
                ) : (
                  <p className="text-sm text-white/50 text-center">
                    Point camera at a bundle QR code
                  </p>
                )}
              </div>
            ) : (
              /* Manual input mode */
              <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
                    <Keyboard className="w-8 h-8 text-white/70" />
                  </div>
                  <p className="text-white/70 text-sm">Enter the bundle code or QR value</p>
                </div>
                <div className="w-full max-w-sm space-y-3">
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && manualInput.trim() && handleQrValue(manualInput)}
                    placeholder="CART-CHAIR-07"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-4 text-white font-mono text-lg text-center placeholder-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    autoFocus
                    autoCapitalize="characters"
                  />
                  <button
                    onClick={() => manualInput.trim() && handleQrValue(manualInput)}
                    disabled={!manualInput.trim()}
                    className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 font-semibold text-base transition-colors"
                  >
                    Look Up Bundle
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FOUND STAGE — bundle info + action selection ─────── */}
        {stage === 'found' && bundle && (
          <div className="flex-1 flex flex-col">
            {/* Bundle card */}
            <div className="bg-white/5 border-b border-white/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <QrCode className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">{bundle.name}</p>
                  <p className="font-mono text-sm text-white/60">{bundle.bundle_code}</p>
                </div>
                <button onClick={reset} className="text-white/40 hover:text-white/70 p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex-1 flex flex-col justify-center px-5 py-6 gap-4">
              <p className="text-sm text-white/50 text-center mb-2">Select action for all bundle assets</p>

              {ACTIONS.map((action) => (
                <button
                  key={action.type}
                  onClick={() => setSelectedAction(
                    selectedAction?.type === action.type ? null : action
                  )}
                  className={`flex items-center gap-4 w-full px-5 py-4 rounded-2xl transition-all ${
                    selectedAction?.type === action.type
                      ? `${action.color} ring-2 ring-white/30`
                      : 'bg-white/10 hover:bg-white/15'
                  }`}
                >
                  <div className={`flex-shrink-0 ${selectedAction?.type === action.type ? '' : 'opacity-70'}`}>
                    {action.icon}
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-base">{action.label}</p>
                    <p className={`text-xs mt-0.5 ${selectedAction?.type === action.type ? 'text-white/80' : 'text-white/50'}`}>
                      {action.description}
                    </p>
                  </div>
                  {selectedAction?.type === action.type && (
                    <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  )}
                </button>
              ))}

              <button
                onClick={confirmAction}
                disabled={!selectedAction || processing}
                className="w-full py-5 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg mt-2 transition-colors flex items-center justify-center gap-2"
              >
                {processing ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
                ) : (
                  <><ChevronRight className="w-5 h-5" /> Confirm</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── SUCCESS STAGE ─────────────────────────────────────── */}
        {stage === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white mb-2">Done!</p>
              <p className="text-white/70 text-sm">
                {selectedAction?.label} recorded for{' '}
                <span className="text-white font-semibold">{successCount} asset{successCount !== 1 ? 's' : ''}</span>
                {bundle && <> in <span className="font-mono text-white">{bundle.bundle_code}</span></>}
              </p>
              {selectedAction && (
                <p className="text-xs text-white/40 mt-2">
                  Status → {selectedAction.toStatus}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button onClick={reset} className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 font-semibold text-base transition-colors flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5" /> Scan Another
              </button>
              {bundle && (
                <button
                  onClick={() => { stopCamera(); navigate(`/assets/bundles/${bundle.id}`) }}
                  className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 font-medium text-sm transition-colors"
                >
                  View Bundle
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── ERROR STAGE ───────────────────────────────────────── */}
        {stage === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white mb-2">Scan Failed</p>
              <p className="text-white/60 text-sm max-w-xs">{errorMsg}</p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button onClick={reset} className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 font-semibold transition-colors flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5" /> Try Again
              </button>
              <button onClick={() => switchMode('manual')}
                className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium">
                <Keyboard className="w-4 h-4 inline mr-1" /> Manual Entry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

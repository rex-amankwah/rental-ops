import { useEffect, useRef, ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  preventBackdropClose?: boolean
}

const SIZE_MAP = {
  sm:  'max-w-sm',
  md:  'max-w-md',
  lg:  'max-w-lg',
  xl:  'max-w-xl',
  '2xl': 'max-w-2xl',
}

export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', preventBackdropClose = false }: ModalProps) {
  // When the window loses focus, the NEXT backdrop click is a re-focus click,
  // not an intentional dismiss. Track blur so we can swallow that click.
  const windowBlurredRef = useRef(false)

  // Reset on every open so stale blur state never carries over.
  useEffect(() => {
    if (open) windowBlurredRef.current = false
  }, [open])

  useEffect(() => {
    if (!open || preventBackdropClose) return
    const onBlur = () => { windowBlurredRef.current = true }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [open, preventBackdropClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={preventBackdropClose ? undefined : () => {
          if (windowBlurredRef.current) { windowBlurredRef.current = false; return }
          onClose()
        }}
      />

      {/* Panel */}
      <div className={`relative bg-card rounded-xl shadow-2xl border border-border w-full ${SIZE_MAP[size]} flex flex-col max-h-[90vh]`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 -mt-0.5 -mr-1.5 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border flex-shrink-0 bg-muted/30">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

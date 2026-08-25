import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastKind = 'success' | 'error' | 'info'
export type ToastState = { msg: string; kind: ToastKind }
export type ToastFn = (msg: string, kind?: ToastKind) => void

// Ein Toast pro Screen (Konsolidierung der früher ~20 lokalen showToast-Kopien).
// showToast ersetzt den sichtbaren Toast und startet die Anzeigedauer neu; der
// Timer wird beim Unmount aufgeräumt — die lokalen Implementierungen liessen ihn
// weiterlaufen (setState nach Unmount).
export function useToast(timeoutMs = 3000): { toast: ToastState | null; showToast: ToastFn } {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback<ToastFn>((msg, kind = 'success') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ msg, kind })
    timer.current = setTimeout(() => setToast(null), timeoutMs)
  }, [timeoutMs])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return { toast, showToast }
}

// Rendert den Toast von useToast — ans Ende des Screens setzen.
export function ToastHost({ toast }: { toast: ToastState | null }) {
  if (!toast) return null
  return (
    <div className="admin-toast-container">
      <div className={`admin-toast ${toast.kind}`}>{toast.msg}</div>
    </div>
  )
}

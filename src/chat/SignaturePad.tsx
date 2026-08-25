import { useRef, useEffect, useState } from 'react'
import { signReport } from '../api/chat'
import { ApiError } from '../api/client'

interface Props {
  reportId: number
  // `signed` unterscheidet unterschrieben von übersprungen — nur ein unsignierter
  // Rapport darf danach noch vom Monteur selbst gelöscht werden.
  onDone: (signed: boolean) => void
  onLoggedOut: () => void
  // Beschriftung des Auswegs. Im Rapport-Abschluss überspringt man einen Schritt;
  // beim späteren Nachtragen im Projekt-Detail bricht man eine Aktion ab — dort
  // wäre «Überspringen» irreführend, es gibt nichts mehr zu überspringen.
  skipLabel?: string
}

export default function SignaturePad({ reportId, onDone, onLoggedOut, skipLabel = 'Überspringen' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const init = () => {
      const ctx = canvas.getContext('2d')!
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, rect.width, rect.height)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
    requestAnimationFrame(init)
  }, [])

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    isDrawing.current = true
    setIsEmpty(false)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function stopDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    isDrawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    setIsEmpty(true)
    setStatus('idle')
  }

  async function save() {
    if (isEmpty || status === 'saving') return
    setStatus('saving')
    try {
      const dataUrl = canvasRef.current!.toDataURL('image/png')
      await signReport(reportId, dataUrl)
      setStatus('ok')
      setTimeout(() => onDone(true), 1500)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      setErrorMsg(err instanceof Error ? err.message : 'Unbekannter Fehler')
      setStatus('error')
    }
  }

  return (
    <div className="signature-pad-wrapper">
      <p className="signature-pad-title">Unterschrift Kunde</p>
      <p className="signature-pad-sub">Bitte hier mit dem Finger unterschreiben</p>
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      {status === 'ok' ? (
        <p className="signature-status-ok">✅ Unterschrift gespeichert!</p>
      ) : (
        <div className="signature-buttons">
          <button className="confirm-btn confirm-btn-no" onClick={clear} disabled={status === 'saving'}>
            Löschen
          </button>
          <button className="confirm-btn confirm-btn-yes" onClick={save} disabled={isEmpty || status === 'saving'}>
            {status === 'saving' ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </div>
      )}
      {status === 'error' && <p className="signature-status-error">❌ {errorMsg}</p>}
      {status !== 'ok' && (
        <button className="signature-skip-btn" onClick={() => onDone(false)}>
          {skipLabel}
        </button>
      )}
    </div>
  )
}

// Vorschaubild einer Projektdatei (docs/specs/kleinkorrekturen-2026-10.md §1).
//
// Vorher stand vor jedem Foto nur ein Emoji — wer das richtige suchte, öffnete
// eines nach dem anderen. Jetzt: 40×40-Miniatur vor dem Namen, und am Desktop
// beim Überfahren eine grössere Vorschau.
//
// Das Bild kommt über denselben Proxy wie der Link auf den Namen (inline). Es
// gibt keine eigene Thumbnail-Variante: `loading="lazy"` lädt nur, was im Bild
// ist, und die Vorschau nutzt dieselbe URL — der Browser hat das Bild dann schon.
// Kann der Browser das Format nicht anzeigen (HEIC vom iPhone) oder fehlt die
// Datei, fällt die Miniatur auf das Emoji zurück statt ein kaputtes Bild zu zeigen.

import { useEffect, useRef, useState } from 'react'
import { projectFileIcon } from './projectFileTypes'

const THUMB_PX = 40
const PREVIEW_PX = 320
// Verzögert, damit das Überfahren einer Liste nicht bei jeder Zeile aufblitzt.
export const PREVIEW_DELAY_MS = 250

interface Props {
  url: string | null
  mimeType: string | null | undefined
  filename: string
  /** Grosse Vorschau beim Überfahren mit der Maus (Admin). Touch zeigt nie eine. */
  hoverPreview?: boolean
  /** Grösse des Emojis, wenn es kein Bild gibt (wie bisher je Ansicht). */
  iconSize?: number
}

export function FileThumb({ url, mimeType, filename, hoverPreview = false, iconSize = 18 }: Props) {
  const [failed, setFailed] = useState(false)
  const [preview, setPreview] = useState<{ top: number; left: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const isImage = !!url && (mimeType ?? '').startsWith('image/') && !failed
  if (!isImage) {
    return <span style={{ fontSize: iconSize, flexShrink: 0 }}>{projectFileIcon(mimeType ?? null, filename)}</span>
  }

  function show() {
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    // Rechts neben der Miniatur; reicht der Platz nicht, links davon. Nach unten
    // so weit gekappt, dass die Vorschau im Fenster bleibt.
    const right = rect.right + 8
    const left = right + PREVIEW_PX <= window.innerWidth ? right : Math.max(8, rect.left - PREVIEW_PX - 8)
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - PREVIEW_PX - 8))
    setPreview({ top, left })
  }

  function enter(e: React.PointerEvent) {
    if (!hoverPreview || e.pointerType !== 'mouse') return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(show, PREVIEW_DELAY_MS)
  }

  function leave() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPreview(null)
  }

  return (
    <span ref={anchor} onPointerEnter={enter} onPointerLeave={leave}
      style={{ display: 'inline-flex', flexShrink: 0, width: THUMB_PX, height: THUMB_PX }}>
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        style={{
          width: THUMB_PX, height: THUMB_PX, objectFit: 'cover',
          borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-2)',
        }}
      />
      {preview && (
        <span
          role="img"
          aria-label={`Vorschau ${filename}`}
          style={{
            position: 'fixed', top: preview.top, left: preview.left, zIndex: 1000,
            width: PREVIEW_PX, padding: 4, borderRadius: 6, pointerEvents: 'none',
            background: 'var(--surface, #fff)', border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
          }}
        >
          <img src={url} alt="" style={{ display: 'block', width: '100%', maxHeight: PREVIEW_PX, objectFit: 'contain', borderRadius: 4 }} />
        </span>
      )}
    </span>
  )
}

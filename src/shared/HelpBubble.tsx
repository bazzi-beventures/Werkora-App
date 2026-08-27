import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import HelpBot from './HelpBot'
import SupportForm from './SupportForm'

interface Props {
  /** Vorschlagsfragen, die im Chat als Quick-Action-Buttons erscheinen. */
  suggestions?: string[]
  /** Hilfe-Chat anzeigen (Modul `help_bot` + Flag). Default true. */
  showHelp?: boolean
  /** «Problem melden» anzeigen (Modul `support` + Flag). Default false.
   *  Spec docs/specs/support-ticket.md §6.1 — beide Teile sind unabhängig
   *  schaltbar; die Blase erscheint, sobald EINER aktiv ist. */
  showSupport?: boolean
  /** Aktueller Screen — wandert als `route` in eine Support-Meldung. */
  route?: string
  /** In welcher App die Blase sitzt (fürs Ticket). */
  appContext?: 'pwa' | 'admin' 
  /** Wenn gesetzt: FAB/Panel werden auf eine zentrierte Spalte dieser Breite
   *  ausgerichtet (Mitarbeiter-PWA, max-width 480). Ohne Wert: echte Ecke
   *  unten rechts (Admin-Layout über volle Breite). */
  columnMaxWidth?: number
}

type Pos = { left: number; top: number }

const FAB_SIZE = 56
const MARGIN = 12          // Mindestabstand zum Viewport-Rand
const DRAG_THRESHOLD = 6   // ab so vielen px gilt es als Ziehen (nicht Tippen)
// Reserve am unteren Rand: ~56px Nav-Leiste (.nav-bar, Mitarbeiter-PWA) + 16px
// Abstand (= Default-`bottom` des FAB). Der vertikale Drag-Bereich endet hier,
// damit die Blase die unteren Menüpunkte NIE überdecken kann.
const BOTTOM_RESERVE = 72
const POS_KEY = 'helpbubble-pos'  // persistierte Drag-Position (siehe storageMigrations isKnownKey)

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Misst env(safe-area-inset-bottom) in px (0, wenn nicht vorhanden/messbar). */
function measureInsetBottom(): number {
  try {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;'
    document.body.appendChild(probe)
    const h = probe.getBoundingClientRect().height
    probe.remove()
    return Number.isFinite(h) ? h : 0
  } catch {
    return 0
  }
}

/** Vertikal in den erlaubten Bereich klemmen: oben Rand, unten über der Nav-Leiste. */
function clampTop(top: number, insetBottom: number): number {
  const maxTop = window.innerHeight - FAB_SIZE - (BOTTOM_RESERVE + insetBottom)
  return clamp(top, MARGIN, Math.max(MARGIN, maxTop))
}

/**
 * Rastet an die NÄCHSTE senkrechte Kante (links/rechts) ein und klemmt vertikal
 * über die Nav-Leiste. Damit liegt die Blase nur am Rand — nie mitten im Inhalt,
 * nie über den unteren Menüpunkten. Ist der Ruhezustand nach jedem Ziehen.
 */
function snapToEdge(p: Pos, insetBottom: number): Pos {
  const vw = window.innerWidth
  const center = p.left + FAB_SIZE / 2
  const left = center < vw / 2 ? MARGIN : Math.max(MARGIN, vw - FAB_SIZE - MARGIN)
  return { left, top: clampTop(p.top, insetBottom) }
}

/** Während des Ziehens: horizontal frei im Viewport, vertikal über der Nav-Leiste. */
function clampDuringDrag(p: Pos, insetBottom: number): Pos {
  const vw = window.innerWidth
  return {
    left: clamp(p.left, MARGIN, Math.max(MARGIN, vw - FAB_SIZE - MARGIN)),
    top: clampTop(p.top, insetBottom),
  }
}

function loadRawPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.left === 'number' && typeof p?.top === 'number') return { left: p.left, top: p.top }
  } catch {
    /* korrupter Wert → Default-Ecke */
  }
  return null
}

/**
 * Schwebende Hilfe-Blase: ein runder Button (FAB), der ein Chat-Panel öffnet.
 * Das Panel rendert den bestehenden <HelpBot> (ohne Header, ohne manuellen
 * Reindex — die Dokumente werden nächtlich automatisch eingelesen). Wird global
 * gerendert und ist überall in der App erreichbar.
 *
 * Der FAB ist per Drag&Drop verschiebbar — mit Pointer-Events, also identisch
 * per Maus (Desktop) UND Touch (Smartphone). Kurzes Tippen öffnet/schliesst
 * (Tap-vs-Drag über DRAG_THRESHOLD), Ziehen verschiebt. Beim Loslassen rastet die
 * Blase an die nächste senkrechte Kante ein (nur Rand) und bleibt oberhalb der
 * unteren Nav-Leiste (überdeckt die Menüpunkte nicht). Die Position wird gemerkt
 * (localStorage). Ohne gemerkte Position: Default-Ecke unten rechts wie bisher.
 *
 * Modul-Gating macht der Aufrufer (nur rendern wenn hasModule(user,'help_bot')).
 */
export default function HelpBubble({
  suggestions, columnMaxWidth,
  showHelp = true, showSupport = false, route = '', appContext = 'pwa',
}: Props) {
  const [open, setOpen] = useState(false)
  // Startansicht: gibt es beide Teile, beginnt die Blase beim Chat. Ist nur
  // Support aktiv, IST das Panel direkt das Meldeformular — ein Reiter, den
  // man nicht wechseln kann, wäre nur Dekoration.
  const [tab, setTab] = useState<'help' | 'support'>(showHelp ? 'help' : 'support')
  const [insetBottom, setInsetBottom] = useState(0)
  const [pos, setPos] = useState<Pos | null>(() => {
    const raw = loadRawPos()
    return raw ? snapToEdge(raw, 0) : null
  })

  const fabRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; originLeft: number; originTop: number; moved: boolean } | null>(null)
  const draggedRef = useRef(false)  // unterdrückt den Klick direkt nach einem Drag

  // Safe-Area messen und Position bei Viewport-Änderung (Drehen/Resize) neu
  // einrasten — bleibt so immer an einer Kante und über der Nav-Leiste.
  useEffect(() => {
    function recompute() {
      const inset = measureInsetBottom()
      setInsetBottom(inset)
      setPos(p => (p ? snapToEdge(p, inset) : p))
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [])

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = fabRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      originLeft: rect.left, originTop: rect.top, moved: false,
    }
    draggedRef.current = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ältere Browser */ }
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return  // noch ein Tap
    d.moved = true
    draggedRef.current = true
    // Frei folgen (fühlt sich natürlich an); Einrasten passiert beim Loslassen.
    setPos(clampDuringDrag({ left: d.originLeft + dx, top: d.originTop + dy }, insetBottom))
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    if (d?.moved) {
      const snapped = snapToEdge(
        { left: d.originLeft + (e.clientX - d.startX), top: d.originTop + (e.clientY - d.startY) },
        insetBottom,
      )
      setPos(snapped)
      try { localStorage.setItem(POS_KEY, JSON.stringify(snapped)) } catch { /* Storage voll/gesperrt */ }
    }
  }

  function onFabClick() {
    // Klick, der direkt aus einem Drag entstand, ignorieren (nur echtes Tippen togglet).
    if (draggedRef.current) { draggedRef.current = false; return }
    setOpen(o => !o)
  }

  // Default-Verankerung (keine gemerkte Position): zentrierte Spalte (PWA) oder Ecke (Admin)
  const right = columnMaxWidth
    ? `max(16px, calc((100vw - ${columnMaxWidth}px) / 2 + 16px))`
    : '24px'
  const fabBottom = 'calc(72px + env(safe-area-inset-bottom, 0px))'
  const panelBottom = 'calc(140px + env(safe-area-inset-bottom, 0px))'

  // FAB-Position: an eine Kante eingerastet (left/top px) oder Default-Ecke (right/bottom).
  const fabAnchor: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { right, bottom: fabBottom }

  // Panel an den (ggf. verschobenen) FAB andocken: an derselben Kante, bevorzugt
  // oberhalb, sonst darunter — und ebenfalls über der Nav-Leiste geklemmt.
  let panelAnchor: React.CSSProperties
  if (pos) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = Math.min(380, vw - 2 * MARGIN)
    const h = Math.min(540, vh - 2 * MARGIN)
    const isRight = pos.left + FAB_SIZE / 2 > vw / 2
    const left = isRight ? Math.max(MARGIN, vw - w - MARGIN) : MARGIN
    let top = pos.top - h - 8
    if (top < MARGIN) top = pos.top + FAB_SIZE + 8  // oben kein Platz → unter den FAB
    const maxTop = vh - h - (BOTTOM_RESERVE + insetBottom)
    top = clamp(top, MARGIN, Math.max(MARGIN, maxTop))
    panelAnchor = { left, top, width: w, height: h }
  } else {
    panelAnchor = {
      right, bottom: panelBottom,
      width: 'min(380px, calc(100vw - 32px))',
      height: 'min(540px, calc(100dvh - 220px))',
    }
  }

  return createPortal(
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Hilfe und Support"
          style={{
            position: 'fixed',
            ...panelAnchor,
            background: 'var(--surface, #fff)',
            color: 'var(--text, #111)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--border, #e5e7eb)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1001,
          }}
        >
          {/* Panel-Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border, #e5e7eb)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>
              {showHelp && showSupport ? 'Hilfe & Support' : (showHelp ? 'Hilfe' : 'Support')}
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Hilfe schliessen"
              style={{
                width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: 'none',
                background: 'transparent', cursor: 'pointer', color: 'var(--text, #111)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Reiter nur, wenn es wirklich etwas zu wechseln gibt */}
          {showHelp && showSupport && (
            <div style={{
              // Zentriert und je zur Hälfte: linksbündig sassen die beiden Reiter
              // am Rand und lasen sich wie eine angeschnittene Liste — auf dem Handy
              // stand rechts daneben die halbe Blattbreite leer.
              display: 'flex', gap: 4, padding: '8px 12px 0',
              borderBottom: '1px solid var(--border, #e5e7eb)', flexShrink: 0,
            }}>
              {([['help', 'Fragen'], ['support', 'Problem melden']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  style={{
                    flex: 1, textAlign: 'center',
                    padding: '6px 10px', border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'inherit', font: 'inherit',
                    borderBottom: tab === id
                      ? '2px solid var(--accent, #1e3a5f)'
                      : '2px solid transparent',
                    fontWeight: tab === id ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Inhalt füllt den Rest */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {tab === 'support' || !showHelp
              ? <SupportForm route={route} appContext={appContext} />
              : <HelpBot suggestions={suggestions} />}
          </div>
        </div>
      )}

      {/* FAB — verschiebbar (Pointer-Events: Maus + Touch), rastet an die Kante ein */}
      <button
        ref={fabRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onFabClick}
        aria-label={open ? 'Hilfe schliessen' : 'Hilfe öffnen (gedrückt halten und ziehen zum Verschieben)'}
        aria-expanded={open}
        style={{
          position: 'fixed',
          ...fabAnchor,
          width: FAB_SIZE, height: FAB_SIZE, borderRadius: '50%',
          border: 'none', cursor: 'pointer',
          background: 'var(--accent, #1e3a5f)', color: '#fff',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
          touchAction: 'none',  // Touch-Ziehen darf die Seite nicht scrollen
          userSelect: 'none',
        }}
      >
        {open ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}
      </button>
    </>,
    document.body,
  )
}

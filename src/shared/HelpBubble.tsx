import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import HelpBot from './HelpBot'
import SupportForm from './SupportForm'
import WikiBot from './WikiBot'

interface Props {
  /** Vorschlagsfragen, die im Chat als Quick-Action-Buttons erscheinen. */
  suggestions?: string[]
  /** Hilfe-Chat anzeigen (Modul `help_bot` + Flag). Default true. */
  showHelp?: boolean
  /** «Problem melden» anzeigen (Modul `support` + Flag). Default false.
   *  Spec docs/specs/support-ticket.md §6.1 — beide Teile sind unabhängig
   *  schaltbar; die Blase erscheint, sobald EINER aktiv ist. */
  showSupport?: boolean
  /** Lieferanten-Wiki anzeigen (Modul `supplier_wiki`). Default false.
   *  Spec docs/specs/lieferanten-wiki.md — dritter Teil, unabhängig von den
   *  beiden anderen: ein Mandant kann allein das Wiki gebucht haben. */
  showWiki?: boolean
  /** Firmenname des Mandanten — beschriftet den Wiki-Reiter («Meier AG Wiki»).
   *  Ohne Namen heisst der Reiter schlicht «Wiki». */
  tenantName?: string
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

/** Die Teile der Blase — Hilfe-Chat, Lieferanten-Wiki, Support-Meldung. */
type TabId = 'help' | 'wiki' | 'support' 

const FAB_SIZE = 56
const MARGIN = 12          // Mindestabstand zum Viewport-Rand
const DRAG_THRESHOLD = 6   // ab so vielen px gilt es als Ziehen (nicht Tippen)
const GAP_ABOVE_NAV = 16   // Luft zwischen Blase und Nav-Leiste
// Rückfall, solange keine Nav-Leiste gemessen werden konnte: ~56px Leiste +
// 16px Abstand. Gemessen wird bevorzugt (siehe measureBottomReserve) — die
// beiden Apps führen verschieden hohe Leisten, und auf dem iPhone stimmt die
// gerechnete Höhe ohnehin nur zufällig.
const BOTTOM_RESERVE = 72
// Die Leisten, über denen die Blase bleiben muss: Monteur-App und Admin-Handy.
const NAV_SELECTOR = '.nav-bar, .admin-mobile-tabbar'
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

/**
 * Wie viel Platz unten frei bleiben muss — GEMESSEN an der Leiste, die
 * tatsächlich im Bild steht, statt aus 56px + `env(safe-area-inset-bottom)`
 * gerechnet.
 *
 * Der Unterschied ist genau das iPhone-Fehlerbild: Die Blase hängt per
 * `position: fixed` am Viewport, die Leiste dagegen als letzte Zeile in der
 * Shell. Sobald die beiden Höhenmasse auseinanderlaufen — Browserleisten,
 * Standalone-Eigenheiten, verzögertes dvh —, sass die Blase auf der Leiste
 * und deckte «Rechnungen» und «Mehr» zu. `getBoundingClientRect()` liefert
 * Viewport-Koordinaten, also dasselbe System, in dem `position: fixed`
 * rechnet: gemessen kann die Blase gar nicht mehr danebenliegen.
 *
 * Ohne Leiste im Bild (Desktop-Admin, Anmeldeschirm) bleibt der bisherige
 * Rückfall — dort gibt es nichts zu überdecken.
 */
function measureBottomReserve(): number {
  try {
    let reserve = 0
    for (const el of document.querySelectorAll(NAV_SELECTOR)) {
      const rect = el.getBoundingClientRect()
      if (rect.height <= 0) continue   // ausgeblendet (z.B. Desktop-Breakpoint)
      reserve = Math.max(reserve, window.innerHeight - rect.top)
    }
    if (reserve > 0) return reserve + GAP_ABOVE_NAV
  } catch {
    /* jsdom/ältere Browser → Rückfall */
  }
  // Nur ohne Leiste im Bild: die Sonde für den Safe-Area-Inset hängt kurz ein
  // Element ins Dokument und erzwingt ein Layout — das lohnt sich nicht bei
  // jeder Messung, sondern genau dann, wenn nichts zu messen war.
  return BOTTOM_RESERVE + measureInsetBottom()
}

/** Vertikal in den erlaubten Bereich klemmen: oben Rand, unten über der Nav-Leiste. */
function clampTop(top: number, bottomReserve: number): number {
  const maxTop = window.innerHeight - FAB_SIZE - bottomReserve
  return clamp(top, MARGIN, Math.max(MARGIN, maxTop))
}

/**
 * Rastet an die NÄCHSTE senkrechte Kante (links/rechts) ein und klemmt vertikal
 * über die Nav-Leiste. Damit liegt die Blase nur am Rand — nie mitten im Inhalt,
 * nie über den unteren Menüpunkten. Ist der Ruhezustand nach jedem Ziehen.
 */
function snapToEdge(p: Pos, bottomReserve: number): Pos {
  const vw = window.innerWidth
  const center = p.left + FAB_SIZE / 2
  const left = center < vw / 2 ? MARGIN : Math.max(MARGIN, vw - FAB_SIZE - MARGIN)
  return { left, top: clampTop(p.top, bottomReserve) }
}

/** Während des Ziehens: horizontal frei im Viewport, vertikal über der Nav-Leiste. */
function clampDuringDrag(p: Pos, bottomReserve: number): Pos {
  const vw = window.innerWidth
  return {
    left: clamp(p.left, MARGIN, Math.max(MARGIN, vw - FAB_SIZE - MARGIN)),
    top: clampTop(p.top, bottomReserve),
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
  showHelp = true, showSupport = false, showWiki = false,
  tenantName = '', route = '', appContext = 'pwa',
}: Props) {
  const [open, setOpen] = useState(false)
  // Die Blase trägt die Mandantenfarbe — und zwar über das Token, das die App
  // um sie herum führt. Beide Token halten nach `applyTenantBranding()`
  // denselben abgeleiteten Ton (brand/palette.ts schreibt `--accent` und
  // `--primary` aus einer Farbe), aber ihre RÜCKFÄLLE sind verschieden:
  // `--accent` fällt in index.css auf das Werkora-Gelb zurück, `--primary` in
  // admin/tokens.css auf das Werkora-Blau. Solange die Mandantenfarbe noch
  // nicht geladen ist — oder gar nicht geladen werden kann —, sass im Admin
  // deshalb eine gelbbraune Blase in einer blauen App. Mit dem Token der
  // jeweiligen App stimmt die Farbe in beiden Fällen.
  const fabColor = appContext === 'admin'
    ? 'var(--primary, #3081AB)'
    : 'var(--accent, #9A6716)'
  // Die drei Teile der Blase, in der Reihenfolge, in der sie erscheinen. Was
  // aus ist, steht nicht in der Liste — ein Reiter, den man nicht wechseln
  // kann, wäre nur Dekoration, deshalb tragen ein einzelner Teil und das Panel
  // dann dasselbe: das Panel IST dieser Teil.
  const parts: TabId[] = [
    ...(showHelp ? ['help' as const] : []),
    ...(showWiki ? ['wiki' as const] : []),
    ...(showSupport ? ['support' as const] : []),
  ]
  const [tab, setTab] = useState<TabId>(parts[0] ?? 'help')
  // Der aktive Reiter muss ein aktiver Teil sein: schaltet der Betreiber einen
  // Teil ab, während die Blase offen ist, stünde sonst ein leeres Panel da.
  const active: TabId = parts.includes(tab) ? tab : (parts[0] ?? 'help')
  const wikiLabel = tenantName ? `${tenantName} Wiki` : 'Wiki'
  // Reiter-Beschriftung (was man anklickt) und Panel-Titel (was oben steht)
  // sind bewusst verschieden: der Reiter benennt die Handlung («Problem
  // melden»), der Titel den Bereich («Support»).
  const TAB_LABELS: Record<TabId, string> = {
    help: 'Fragen',
    wiki: wikiLabel,
    support: 'Problem melden',
  }
  const PANEL_TITLES: Record<TabId, string> = { help: 'Hilfe', wiki: wikiLabel, support: 'Support' }
  // Bei mehreren Teilen zählt der Titel sie auf — das Wiki dabei ohne
  // Firmennamen, der steht schon im Reiter darunter.
  const SHORT_TITLES: Record<TabId, string> = { help: 'Hilfe', wiki: 'Wiki', support: 'Support' }
  const panelTitle = parts.length === 1
    ? PANEL_TITLES[active]
    : parts.map(id => SHORT_TITLES[id]).join(' & ')
  // Der gemessene Platz, den die untere Leiste beansprucht (inkl. Luft
  // darüber). Bis zur ersten Messung der gerechnete Rückfall.
  const [bottomReserve, setBottomReserve] = useState(BOTTOM_RESERVE)
  const [pos, setPos] = useState<Pos | null>(() => {
    const raw = loadRawPos()
    return raw ? snapToEdge(raw, BOTTOM_RESERVE) : null
  })

  const fabRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; originLeft: number; originTop: number; moved: boolean } | null>(null)
  const draggedRef = useRef(false)  // unterdrückt den Klick direkt nach einem Drag

  // Abstand zur unteren Leiste messen und die Blase daran einrasten — sie
  // bleibt so immer an einer Kante und über den Menüpunkten.
  // Bewusst OHNE Abhängigkeitsliste: die Blase wird einmal auf App-Ebene
  // gerendert und überlebt jeden Screenwechsel — die Leiste darunter nicht.
  // Ein Screen ohne Leiste (Rapport, Anmeldung) und einer mit führen
  // verschiedene Abstände; nach jedem Render neu zu messen ist der einzige
  // Weg, der beides trifft. Beide Zustände werden nur gesetzt, wenn sich der
  // Wert wirklich ändert — sonst käme aus `snapToEdge` bei gleicher Lage ein
  // neues Objekt und das Nachmessen liefe im Kreis.
  useEffect(() => {
    const reserve = measureBottomReserve()
    setBottomReserve(prev => (prev === reserve ? prev : reserve))
    setPos(p => {
      if (!p) return p
      const snapped = snapToEdge(p, reserve)
      return snapped.left === p.left && snapped.top === p.top ? p : snapped
    })
  })

  // Drehen und ein-/ausfahrende Browserleisten ändern die Lage der Leiste,
  // ohne dass React etwas neu rendert. Kein Scroll-Listener: seit die Shell an
  // der gemessenen Fensterhöhe hängt (shared/viewportHeight.ts), scrollt das
  // Dokument selbst nicht mehr.
  const [, forceMeasure] = useState(0)
  useEffect(() => {
    const onResize = () => forceMeasure(n => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
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
    setPos(clampDuringDrag({ left: d.originLeft + dx, top: d.originTop + dy }, bottomReserve))
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    if (d?.moved) {
      const snapped = snapToEdge(
        { left: d.originLeft + (e.clientX - d.startX), top: d.originTop + (e.clientY - d.startY) },
        bottomReserve,
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
  // Auch der Ruhezustand (nie verschoben) sitzt auf dem gemessenen Abstand,
  // nicht auf `72px + env(safe-area-inset-bottom)`. Genau dieser gerechnete
  // Wert liess die Blase auf dem iPhone auf der Tab-Leiste landen.
  const fabBottom = `${bottomReserve}px`
  const panelBottom = `${bottomReserve + FAB_SIZE + 12}px`

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
    const maxTop = vh - h - bottomReserve
    top = clamp(top, MARGIN, Math.max(MARGIN, maxTop))
    panelAnchor = { left, top, width: w, height: h }
  } else {
    panelAnchor = {
      right, bottom: panelBottom,
      width: 'min(380px, calc(100vw - 32px))',
      height: `min(540px, calc(var(--app-vh, 100dvh) - ${bottomReserve + FAB_SIZE + 92}px))`,
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
            <div style={{
              fontSize: '1.05rem', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {panelTitle}
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
          {parts.length > 1 && (
            <div style={{
              // Zentriert und zu gleichen Teilen: linksbündig sassen die Reiter
              // am Rand und lasen sich wie eine angeschnittene Liste — auf dem Handy
              // stand rechts daneben die halbe Blattbreite leer.
              display: 'flex', gap: 4, padding: '8px 12px 0',
              borderBottom: '1px solid var(--border, #e5e7eb)', flexShrink: 0,
            }}>
              {parts.map(id => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={active === id}
                  style={{
                    flex: 1, textAlign: 'center', minWidth: 0,
                    padding: '6px 10px', border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'inherit', font: 'inherit',
                    borderBottom: active === id
                      ? `2px solid ${fabColor}`
                      : '2px solid transparent',
                    fontWeight: active === id ? 600 : 400,
                    // Ein langer Firmenname darf die anderen Reiter nicht
                    // aus dem Panel schieben.
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {TAB_LABELS[id]}
                </button>
              ))}
            </div>
          )}

          {/* Inhalt füllt den Rest */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {active === 'support' && <SupportForm route={route} appContext={appContext} />}
            {active === 'wiki' && <WikiBot tenantName={tenantName} />}
            {active === 'help' && <HelpBot suggestions={suggestions} />}
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
          background: fabColor,
          // Schrift/Symbol auf der Mandantenfarbe: das geprüfte `--on-accent`
          // statt festem Weiss — bei einer hellen Firmenfarbe verschwand das
          // Symbol sonst (dieselbe Regel wie bei der aktiven Tab-Pille).
          color: 'var(--on-accent, #fff)',
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

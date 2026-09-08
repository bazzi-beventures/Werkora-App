// Die zwei Eastereggs der Admin-App (Feature `eastereggs`, Beta).
//
// Gefragt wird beim Start der Admin-App und danach jedes Mal, wenn eine Aktion
// einen Meilenstein bewegt haben kann — eine erstellte Rechnung, ein
// abgeschlossenes Projekt (`EASTEREGG_RECHECK_EVENT`, ausgelöst im API-Layer).
// Ohne das zweite käme die Feier erst beim nächsten Neuladen, also nicht in dem
// Moment, in dem es etwas zu feiern gibt.
//
// Die noch nicht gefeierten Meilensteine liegen in einer Warteschlange und
// kommen nacheinander, nicht gleichzeitig: Konfetti und Geldregen übereinander
// wäre Lärm statt Belohnung.
//
// Gemerkt wird ein Meilenstein, sobald er GEZEIGT wird — nicht erst beim
// Wegklicken. Wer die Seite mitten in der Animation neu lädt, hat ihn gesehen;
// ein zweites Mal wäre keine Überraschung mehr, sondern eine Störung.
//
// Ausfälle sind hier immer stumm: `getEasterEggs` liefert bei jedem Fehler
// `null`, und dann passiert schlicht nichts. Ein Easteregg, das eine
// Fehlermeldung über die Admin-App legt, hat seinen Zweck verfehlt.

import { useCallback, useEffect, useRef, useState } from 'react'
import { EASTEREGG_RECHECK_EVENT, getEasterEggs } from '../../api/admin/eastereggs'
import { UserInfo } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import { drawConfettiStill, playConfetti } from './confetti'
import { drawMoneyStill, playMoneyRain, throwMore } from './moneyRain'
import type { RunHandle } from './particles'
import { alreadySeen, markSeen, type EggKind } from './seen'
import './eastereggs.css'

export const EASTEREGG_FEATURE = 'eastereggs'

/** Nur die Geschäftsleitung — die Jahresumsatz-Zahl ist keine Allgemeinheit.
 *  Dieselbe Grenze zieht der Endpunkt (require_management). */
const ROLES = ['management', 'superadmin']

interface Egg {
  kind: EggKind
  milestone: number
  /** Der Stand, aus dem der Meilenstein kommt — steht klein unter der Zahl. */
  detail: string
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const chf = (n: number) => new Intl.NumberFormat('de-CH').format(Math.round(n))

export default function EasterEggs({ user }: { user: UserInfo }) {
  const [queue, setQueue] = useState<Egg[]>([])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<RunHandle | null>(null)

  const active = queue[0] ?? null

  const enabled = isFeatureEnabled(user, EASTEREGG_FEATURE) && ROLES.includes(user.role)

  // Läuft gerade eine Abfrage? Ein Klick auf «Rechnung generieren» kann zwei
  // Ereignisse dicht hintereinander auslösen (Rechnung erstellt, Projekt
  // abgeschlossen) — dann genügt eine Frage.
  const laeuftRef = useRef(false)

  const check = useCallback(async () => {
    if (laeuftRef.current) return
    laeuftRef.current = true
    let status
    try {
      status = await getEasterEggs()
    } finally {
      laeuftRef.current = false
    }
    if (!status) return

    // Bewusst VOR dem setQueue: `alreadySeen` liest den localStorage, und der
    // Updater unten muss rein bleiben (React ruft ihn doppelt auf).
    const pending: Egg[] = []
    const p = status.projects
    if (p.milestone !== null && !alreadySeen('projects', user.authorized_user_id, p.milestone)) {
      pending.push({
        kind: 'projects',
        milestone: p.milestone,
        detail: `${p.count} abgeschlossene Projekte insgesamt`,
      })
    }
    const r = status.revenue
    if (r.milestone !== null && !alreadySeen('revenue', user.authorized_user_id, r.milestone)) {
      pending.push({
        kind: 'revenue',
        milestone: r.milestone,
        detail: `CHF ${chf(r.total)} fakturiert seit dem 1. Januar ${r.year}`,
      })
    }
    if (pending.length === 0) return

    // Angehängt statt ersetzt: ein Ei, das gerade auf dem Schirm steht, darf
    // eine zweite Abfrage nicht unter dem Nutzer wegziehen.
    setQueue((prev) => {
      const bekannt = new Set(prev.map((e) => e.kind))
      const neu = pending.filter((e) => !bekannt.has(e.kind))
      return neu.length > 0 ? [...prev, ...neu] : prev
    })
  }, [user.authorized_user_id])

  useEffect(() => {
    if (!enabled) return
    let abgebrochen = false

    const frage = () => { if (!abgebrochen) void check() }
    frage()
    window.addEventListener(EASTEREGG_RECHECK_EVENT, frage)

    return () => {
      abgebrochen = true
      window.removeEventListener(EASTEREGG_RECHECK_EVENT, frage)
    }
  }, [enabled, check])

  // Animation starten, sobald ein Ei oben in der Warteschlange steht. Ohne
  // Bewegungswunsch wird nur ein Standbild gezeichnet — die Karte mit der Zahl
  // steht so oder so da, sie ist die eigentliche Nachricht.
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return

    markSeen(active.kind, user.authorized_user_id, active.milestone)

    if (prefersReducedMotion()) {
      if (active.kind === 'projects') drawConfettiStill(canvas)
      else drawMoneyStill(canvas)
      return
    }

    const scene = active.kind === 'projects' ? playConfetti(canvas) : playMoneyRain(canvas)
    sceneRef.current = scene
    return () => {
      scene.stop()
      sceneRef.current = null
    }
  }, [active, user.authorized_user_id])

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), [])

  // Escape schliesst — ein Overlay, das nur der Maus gehorcht, ist am
  // Schreibtisch lästig.
  useEffect(() => {
    if (!active) return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, dismiss])

  const throwAgain = useCallback(() => {
    const canvas = canvasRef.current
    const scene = sceneRef.current
    if (canvas && scene) throwMore(scene, canvas)
  }, [])

  if (!active) return null

  return (
    <div className="egg-overlay" role="dialog" aria-modal="true" aria-labelledby="egg-title">
      <canvas ref={canvasRef} className="egg-canvas" aria-hidden="true" />
      {active.kind === 'projects' ? (
        <div className="egg-card">
          <span className="egg-count">{active.milestone}</span>
          <span id="egg-title" className="egg-label">Projekte abgeschlossen</span>
          <p className="egg-text">
            Hundertweise Aufträge sauber über die Ziellinie gebracht. Das darf man kurz feiern.
          </p>
          <p className="egg-detail">{active.detail}</p>
          <button type="button" className="egg-close" onClick={dismiss} autoFocus>
            Weiter arbeiten
          </button>
        </div>
      ) : (
        <div className="egg-meme">
          <p className="egg-meme-line">Wenn dieses Jahr bereits</p>
          <button
            type="button"
            className="egg-thrower"
            onClick={throwAgain}
            aria-label="Nochmal Geld werfen"
          >
            🤑
          </button>
          <div className="egg-meme-foot">
            <p id="egg-title" className="egg-meme-line">
              <span className="egg-amount">CHF {chf(active.milestone)}</span> fakturiert sind
            </p>
            <button type="button" className="egg-close egg-close-meme" onClick={dismiss} autoFocus>
              Weiter arbeiten
            </button>
            <p className="egg-detail">{active.detail} · Aufs Gesicht tippen wirft nach</p>
          </div>
        </div>
      )}
    </div>
  )
}

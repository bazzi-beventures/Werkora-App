// Gemeinsame Bausteine der Einsatzplanungs-Ansichten (Kalender + Tagesplan/Gantt):
// Kalender-Eintrag, Formatierung, Farben/Symbole je Einsatz-Art, Hover-Zustand und
// das Drag&Drop-Payload. Liegt bewusst ausserhalb von ProjectScheduleCalendar.tsx,
// damit die Gantt-Ansicht dieselben Kacheln nutzt, ohne dass sich die beiden
// Ansichts-Dateien gegenseitig importieren. Die Hover-Karte selbst steht in
// EventHoverCard.tsx (diese Datei bleibt frei von JSX).

import { useEffect, useRef, useState } from 'react'
import { resolveScheduleDistances } from '../../api/admin'
import {
  APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS, AppointmentKind, DEFAULT_APPOINTMENT_KIND,
} from '../../api/admin/scheduling'
import type { Project } from '../../api/admin/projects'
import { projectCustomerName } from '../utils/project'
import { diffDays, hhmmToMin, parseDateStr, shiftISO, toDateStr } from '../utils/calendarHelpers'

export interface StaffLite {
  id: string
  name: string
  // Personal-Kürzel aus dem Mitarbeiterstamm (z.B. "MW"). Optional — fehlt es,
  // greift staffShortLabel() auf die Initialen des Namens zurück.
  kuerzel?: string | null
}

// Kalender-Eintrag = EIN Termin (project_appointments). Der Screen spreadet das
// Projekt und überlagert die Terminfelder; `id` ist die TERMIN-ID — dadurch sind
// Keys/Lanes/Drag&Drop je Termin eindeutig, auch bei mehreren Terminen desselben
// Projekts. termin_badge: Typ-Label (z.B. "Aufmass"), leer beim Standardfall.
// termin_kind: roher Termin-Typ (AppointmentKind, siehe api/admin/scheduling.ts)
// für das Typ-Symbol — nur bei Kundenprojekten gesetzt, interne Einsätze nutzen
// p.kind.
export type CalendarEntry = Project & { termin_badge?: string; termin_kind?: string }

// ─── Formatierung ────────────────────────────────────────────────────────────

export function projectCoversDay(p: Project, day: Date): boolean {
  if (!p.start_date || !p.end_date) return false
  const s = toDateStr(day)
  return s >= p.start_date.slice(0, 10) && s <= p.end_date.slice(0, 10)
}

export function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

// Alle ISO-Tage, an denen mindestens ein Einsatz liegt — Punkte im
// Mini-Monatskalender. Mehrtägige Einsätze zählen an jedem Tag.
//
// Der Deckel je Eintrag ist Absicht: der Kalender lädt ein Fenster von rund drei
// Jahren, ein einzelner Datenfehler (end_date im Jahr 9999) würde die Schleife
// sonst endlos drehen. MAX_SPAN_DAYS deckt jedes reale Bauprojekt ab.
const MAX_SPAN_DAYS = 400

export function scheduledDayIsoSet(projects: Project[]): Set<string> {
  const out = new Set<string>()
  for (const p of projects) {
    if (!p.start_date) continue
    const startISO = p.start_date.slice(0, 10)
    const endISO = (p.end_date ?? p.start_date).slice(0, 10)
    out.add(startISO)
    if (endISO <= startISO) continue
    const span = Math.min(diffDays(startISO, endISO), MAX_SPAN_DAYS)
    for (let i = 1; i <= span; i++) out.add(shiftISO(startISO, i))
  }
  return out
}

// Anzeigename einer Kalenderkachel: Projektnummer vor dem Namen.
//
// Die aus der Alt-Software importierten Projekte tragen ihre Nummer schon im
// Namen ("261125 Heller Winterthur") — dort würde ein Präfix sie verdoppeln.
// Neu angelegte Projekte bekommen die Nummer nur in project_id_text, im
// Kalender fehlte sie deshalb bisher ganz. Interne Einsätze (Teamsitzung,
// Werkstatt …) haben keine Nummer und bleiben unverändert.
export function entryTitle(p: Project): string {
  const name = p.name ?? ''
  const nr = (p.project_id_text ?? '').trim()
  if (!nr || name.includes(nr)) return name
  return `${nr} ${name}`
}

export function fmtTimeRange(p: Project): string {
  const s = fmtTime(p.start_time), e = fmtTime(p.end_time)
  if (s && e) return `${s}–${e}`
  if (s) return `ab ${s}`
  if (e) return `bis ${e}`
  return ''
}

// Ortschaft aus der Objektadresse — die Zeile, die der Disponent auf einer
// Tagesplan-Kachel wirklich braucht ("wo muss der Monteur hin"). Die volle
// Adresse steht in der Hover-Karte.
//
// Schweizer Adressen tragen die Ortschaft hinter der vierstelligen PLZ
// ("Hofstettweg 5, 8405 Winterthur" → "Winterthur"); ein angehängtes Land
// ("…, Schweiz") stört darum nicht. Ohne PLZ gilt nur ein einzelner Teil ohne
// Hausnummer als Ortschaft — sonst würde eine reine Strassenangabe als Ort
// durchgehen.
export function addressLocality(addr: string | null | undefined): string {
  const parts = (addr ?? '').split(/[,\n]/).map(s => s.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/\b\d{4}\s+(\D.*)$/)
    if (m) return m[1].trim()
  }
  if (parts.length === 1) return /\d/.test(parts[0]) ? '' : parts[0]
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

// Kürzel eines Mitarbeiters: gepflegtes Personal-Kürzel, sonst Initialen
// ("Marvin Walser" → "MW"). Immer max. 3 Zeichen, damit die Chips gleich breit
// bleiben.
export function staffShortLabel(s: StaffLite): string {
  const k = (s.kuerzel ?? '').trim()
  if (k) return k.slice(0, 3).toUpperCase()
  return s.name
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ─── Lead-Monteur ────────────────────────────────────────────────────────────
// Lead ist der ZUERST angewählte Monteur eines Einsatzes, also `monteur_ids[0]`.
// Die Auswahlreihenfolge überlebt das Speichern (Postgres-Array, unsortiert
// geschrieben und gelesen) — es braucht dafür keine eigene Spalte. Rein visuell:
// der Lead hat keine Sonderrechte, er ist der Ansprechpartner auf der Baustelle.
//
// Wird der Lead in der Plantafel per Drag&Drop aus dem Team gezogen, rückt der
// nächste Monteur nach — das ist gewollt: das Team hat dann eine neue Nummer eins.

// Das Team eines Einsatzes, aufgelöst und in Auswahlreihenfolge. Unbekannte ids
// (gelöschter Mitarbeiter) fallen raus; Lead ist der erste, der übrig bleibt —
// sonst hätte ein Einsatz durch eine Karteileiche gar keinen sichtbaren Lead.
export interface CrewMember {
  id: string
  name: string
  short: string
  lead: boolean
}

export function crewMembers(p: Project, staff: StaffLite[]): CrewMember[] {
  const byId = new Map(staff.map(s => [s.id, s]))
  return (p.monteur_ids ?? [])
    .map(id => byId.get(id))
    .filter((s): s is StaffLite => !!s)
    .map((s, i) => ({ id: s.id, name: s.name, short: staffShortLabel(s), lead: i === 0 }))
}

// Kürzel des Termin-Teams, gedeckelt: ein 6-Mann-Einsatz würde sonst den
// Projektnamen von der Kachel drängen. Was wegfällt, zeigt "+n" an (und die
// Hover-Karte nennt ohnehin alle Namen). Der Lead steht immer an erster Stelle
// und wird deshalb nie vom Deckel abgeschnitten.
export function crewShortLabels(p: Project, staff: StaffLite[], max = 3): { label: string; lead: boolean }[] {
  const known = crewMembers(p, staff)
  const shown = known.slice(0, max).map(m => ({ label: m.short, lead: m.lead }))
  if (known.length > max) shown.push({ label: `+${known.length - max}`, lead: false })
  return shown
}

export function fmtRange(p: Project): string {
  if (!p.start_date || !p.end_date) return ''
  const s = parseDateStr(p.start_date).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
  const e = parseDateStr(p.end_date).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
  const datePart = s === e ? s : `${s} – ${e}`
  const timePart = fmtTimeRange(p)
  return timePart ? `${datePart} · ${timePart}` : datePart
}

// ─── Farben und Symbole je Einsatz-Art ───────────────────────────────────────

// Pill-Farbe je Einsatz-Art. Kundenprojekte bleiben Brand-Blau, interne
// Einsätze unterscheiden sich farblich klar davon.
// Die --kind-*-Variablen setzt der Kalender-Root aus der Tenant-Config (scheduling_config).
// Fehlt eine Variable, greift der hier hinterlegte Default.
export const KIND_COLORS: Record<string, string> = {
  project:     'var(--kind-project, var(--primary))',
  teamsitzung: 'var(--kind-teamsitzung, #7c3aed)',  // Lila
  lagerarbeit: 'var(--kind-lagerarbeit, #d97706)',  // Bernstein
  werkstatt:   'var(--kind-werkstatt, #0d9488)',    // Türkis
  weiterbildung: 'var(--kind-weiterbildung, #db2777)',  // Magenta
  reservation: 'var(--kind-reservation, #65a30d)',  // Limette
  blocker:     'var(--kind-blocker, #94a3b8)',      // Grau-Blau
  sonstiges:   'var(--kind-sonstiges, #475569)',    // Slate
}

export function pillBg(p: Project): string {
  return KIND_COLORS[p.kind || 'project'] ?? KIND_COLORS.project
}

// Zusatz-Klasse für die Kachel eines Einsatzes. Ein Blocker ist provisorische
// Planung — er wird schraffiert gezeichnet (CSS .provisional), damit man fest
// Geplantes und Vorgemerktes im Raster nie verwechselt. Die Klasse kommt zur
// Inline-Hintergrundfarbe dazu, statt sie zu ersetzen: die Farbe bleibt pro
// Mandant konfigurierbar, die Schraffur ist fix.
export function pillClass(p: Project): string {
  return p.kind === 'blocker' ? ' provisional' : ''
}

// Kleines Typ-Symbol je Aufgaben-Art: Kundenprojekte nach Termin-Typ
// (termin_kind), interne Einsätze nach Einsatz-Art (kind).
export const TERMIN_SYMBOLS: Record<AppointmentKind, string> = {
  aufmass: '📐',
  demontage: '🔩',
  montage: '🔧',
  wiedermontage: '🔁',
  service: '🛠️',
  sonstiges: '📋',
}
const KIND_SYMBOLS: Record<string, string> = {
  teamsitzung: '👥',
  lagerarbeit: '📦',
  werkstatt: '⚙️',
  weiterbildung: '🎓',
  reservation: '🔒',
  blocker: '🚧',
  sonstiges: '📌',
}

export function kindSymbol(p: CalendarEntry): string {
  if (p.kind && p.kind !== 'project') return KIND_SYMBOLS[p.kind] ?? ''
  return TERMIN_SYMBOLS[(p.termin_kind ?? DEFAULT_APPOINTMENT_KIND) as AppointmentKind] ?? ''
}

// Legende der Termin-Typen ("📐 Aufmass · 🔩 Demontage · …") — aus der Registry
// abgeleitet, damit ein neuer Typ nicht in der Legende vergessen wird.
export function terminLegend(): string {
  return APPOINTMENT_KINDS.map(k => `${TERMIN_SYMBOLS[k]} ${APPOINTMENT_KIND_LABELS[k]}`).join(' · ')
}

// Optionale Zusatz-Zeilen auf der Kachel, gesteuert per Tenant-Config (scheduling_config.fields).
export function pillExtraLines(p: Project, staff: StaffLite[], fields?: Record<string, boolean>): string[] {
  if (!fields) return []
  const lines: string[] = []
  if (fields.address && p.object_address) lines.push(p.object_address)
  if (fields.projektleiter && p.projektleiter_id) {
    const pl = staff.find(s => s.id === p.projektleiter_id)?.name
    if (pl) lines.push(`PL: ${pl}`)
  }
  if (fields.customer) { const c = projectCustomerName(p); if (c) lines.push(c) }
  if (fields.bemerkung && p.bemerkung) lines.push(p.bemerkung)
  return lines
}

// Team als Klartext — für title-Attribute und den Text-Fallback. Wer den Lead
// hervorheben will, nimmt crewMembers() und rendert selbst (ein title-Attribut
// kann keine Farbe).
export function projectMonteurNames(p: Project, staff: StaffLite[]): string {
  if (!p.monteur_ids || p.monteur_ids.length === 0) return ''
  const byId = new Map(staff.map(s => [s.id, s.name]))
  return p.monteur_ids.map(id => byId.get(id) || '').filter(Boolean).join(', ')
}

// ─── Hover-Karte ──────────────────────────────────────────────────────────────
// Eine Kalenderkachel ist zwangsläufig klein — ein 30-Minuten-Termin hat nicht
// genug Höhe für Adresse, Kunde und Bemerkung. Statt den Text abzuschneiden
// zeigt eine Karte beim Überfahren die vollen Angaben. Ersetzt den nativen
// title-Tooltip, der erst nach ~1 s erscheint und keine Zeilen kennt.

const HOVER_DELAY_MS = 220

export interface HoverState {
  entry: CalendarEntry
  rect: DOMRect
  // Warnhinweis zur Kachel (z.B. Doppelbuchung). Steht in der Karte statt in
  // einem title-Tooltip — zwei Tooltips übereinander sind unlesbar.
  note?: string
}

// Hover-Zustand + fertige Event-Handler für eine Kachel. Die Verzögerung
// verhindert, dass beim Überstreichen mehrerer Kacheln Karten aufblitzen.
export function useHoverCard() {
  const [hover, setHover] = useState<HoverState | null>(null)
  const timerRef = useRef<number | null>(null)

  function cancelTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  function bind(entry: CalendarEntry, note?: string) {
    return {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        cancelTimer()
        timerRef.current = window.setTimeout(() => setHover({ entry, rect, note }), HOVER_DELAY_MS)
      },
      onMouseLeave: () => { cancelTimer(); setHover(null) },
      // Beim Ziehen oder Klicken stört die Karte nur.
      onMouseDown: () => { cancelTimer(); setHover(null) },
    }
  }

  return { hover, bind }
}

// ─── Fahrdistanzen zwischen zwei Einsätzen ───────────────────────────────────
// Genutzt von Plantafel (senkrecht zwischen zwei Chips) und Tagesplan (waagrecht
// in der Lücke zwischen zwei Balken).

// Kanonischer Cache-Key für ein Adresspaar — gleiche Normalisierung wie das
// Backend (getrimmt, lexikografisch sortiert), Trenner ist ein Steuerzeichen,
// das in Adressen nicht vorkommt. null = leer/identisch → keine Distanz nötig.
// ─── Zeilen-Belegung und Konflikte ───────────────────────────────────────────
// Beides brauchen Plantafel UND Tagesplan/Gantt identisch. Solange die Funktionen
// zweimal dastanden, wirkte ein Konflikt-Bugfix nur in einer der beiden Ansichten
// (Charge H, H4 Punkt 1).

/**
 * Einträge einer Zeile an einem Tag. `rowId = null` ist die Sammelzeile «Ohne
 * Monteur»: Einsätze, denen kein Mitarbeiter aus `staffIds` zugewiesen ist —
 * `staffIds` sind die im Mandanten bekannten Mitarbeiter, damit eine verwaiste
 * ID aus einem gelöschten Konto den Einsatz nicht unsichtbar macht.
 *
 * Sortierung nach Startzeit; ganztägige Einsätze (ohne `start_time`) stehen damit
 * vorne, weil der Leerstring vor jeder Uhrzeit sortiert.
 */
export function rowEntries(
  projects: CalendarEntry[], staffIds: Set<string>, rowId: string | null, day: Date,
): CalendarEntry[] {
  return projects
    .filter(p => projectCoversDay(p, day) && (
      rowId === null
        ? !(p.monteur_ids || []).some(id => staffIds.has(id))
        : (p.monteur_ids || []).includes(rowId)
    ))
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
}

/** Hat mindestens einer der Tage einen Einsatz ohne zugewiesenen Monteur? */
export function hasUnassignedEntries(
  projects: CalendarEntry[], staffIds: Set<string>, days: Date[],
): boolean {
  return days.some(d => rowEntries(projects, staffIds, null, d).length > 0)
}

/**
 * Aufeinanderfolgende GETAKTETE Einsätze je Zeile und Tag mit verschiedenen
 * Objektadressen — nur dazwischen ergibt eine Fahrdistanz Sinn. Ganztägige haben
 * keine Reihenfolge, «Ohne Monteur» keine Route, deshalb laufen hier nur die
 * Mitarbeiter-Zeilen durch.
 */
export function neededDistancePairs(
  projects: CalendarEntry[], staffIds: Set<string>, rowStaff: StaffLite[], days: Date[],
): string[] {
  const out: string[] = []
  for (const s of rowStaff) {
    for (const d of days) {
      const timed = rowEntries(projects, staffIds, s.id, d).filter(p => p.start_time)
      for (let i = 0; i + 1 < timed.length; i++) {
        const k = pairKey(timed[i].object_address, timed[i + 1].object_address)
        if (k) out.push(k)
      }
    }
  }
  return out
}

/**
 * Doppelbuchung innerhalb einer Zeile: getaktete Einsätze, die sich zeitlich
 * überschneiden (ohne Endzeit zählt 1 h). Rückgabe sind die Termin-IDs beider
 * Seiten jeder Überschneidung.
 *
 * Aufrufen nur mit den Einträgen EINER Mitarbeiter-Zeile — über die Sammelzeile
 * «Ohne Monteur» ist keine Aussage möglich, dort ist niemand gebunden.
 */
export function overlapConflictIds(entries: CalendarEntry[]): Set<string> {
  const timed = entries.filter(p => p.start_time)
  const out = new Set<string>()
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j]
      const aS = hhmmToMin(a.start_time!)
      const aE = a.end_time ? hhmmToMin(a.end_time) : aS + 60
      const bS = hhmmToMin(b.start_time!)
      const bE = b.end_time ? hhmmToMin(b.end_time) : bS + 60
      if (aS < bE && bS < aE) { out.add(a.id); out.add(b.id) }
    }
  }
  return out
}

/**
 * Team nach einem Zeilenwechsel per Drag&Drop: Quell-Monteur raus, Ziel-Monteur rein.
 *
 * Gibt `undefined` zurück, wenn das Team unverändert bleibt — der Aufrufer schickt
 * dann nur den Tages-/Zeitversatz. Das ist der Fall bei einem Drop in dieselbe Zeile
 * und bei einem Drop in die Sammelzeile «Ohne Monteur» (`targetRowId === null`):
 * dort ist niemand zugewiesen, also gibt es auch niemanden hinzuzufügen.
 *
 * Lag bis 2026-08 wortgleich in beiden Drop-Handlern (Plantafel und Gantt) — ein
 * Bugfix hätte nur in einer Ansicht gewirkt. Dieselbe Begründung wie bei
 * `rowEntries`/`overlapConflictIds` (Ur-Spec §4.5, dort als `reassignTeam` benannt).
 */
export function reassignTeam(
  currentTeam: string[] | null | undefined,
  targetRowId: string | null,
  sourceRowId: string | null,
): string[] | undefined {
  if (!targetRowId || targetRowId === sourceRowId) return undefined
  const team = (currentTeam || []).filter(id => id !== sourceRowId)
  if (!team.includes(targetRowId)) team.push(targetRowId)
  return team
}

export const PAIR_SEP = '\u0001'

export function pairKey(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = (a ?? '').trim()
  const y = (b ?? '').trim()
  if (!x || !y || x === y) return null
  return x <= y ? `${x}${PAIR_SEP}${y}` : `${y}${PAIR_SEP}${x}`
}

// Löst die übergebenen Adresspaare (pairKey-Strings) beim Server auf und liefert
// eine Funktion, die zwei Einsätze in km übersetzt. Distanz ist reine Zusatzinfo:
// Fehler bleiben still, unbekannte Paare geben null.
export function useScheduleDistances(pairKeys: string[]) {
  // Aufgelöste Distanzen (pairKey → km); wächst über Wochenwechsel mit.
  const [distances, setDistances] = useState<Record<string, number>>({})
  // Bereits angefragte Paare — verhindert Wiederholungs-Requests für Paare,
  // die der Server (noch) nicht auflösen konnte.
  const requestedPairsRef = useRef<Set<string>>(new Set())
  const neededSig = [...new Set(pairKeys)].sort().join('\n')

  // Fehlende Paare gebündelt beim Server anfragen (cache-first, dort gedeckelt).
  // Deps bewusst nur die Paar-Signatur: erneut versucht wird erst, wenn sich
  // die sichtbare Ansicht ändert — nicht bei jedem Distanz-Merge.
  useEffect(() => {
    if (!neededSig) return
    const missing = neededSig.split('\n').filter(k => !requestedPairsRef.current.has(k))
    if (missing.length === 0) return
    missing.forEach(k => requestedPairsRef.current.add(k))
    let cancelled = false
    resolveScheduleDistances(missing.map(k => k.split(PAIR_SEP) as [string, string]))
      .then(res => {
        if (cancelled || res.distances.length === 0) return
        setDistances(prev => {
          const next = { ...prev }
          for (const d of res.distances) {
            const k = pairKey(d.a, d.b)
            if (k) next[k] = d.km
          }
          return next
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [neededSig])

  // km zwischen zwei Einsätzen (beide getaktet, Adressen vorhanden/verschieden).
  return function distBetween(a: Project, b: Project): number | null {
    if (!a.start_time || !b.start_time) return null
    const k = pairKey(a.object_address, b.object_address)
    if (!k) return null
    return distances[k] ?? null
  }
}

// ─── Drag-Handlers ────────────────────────────────────────────────────────────

// Drag-Transfer payload format: "<projectId>|<grabDayISO>|<grabOffset>|<sourceRowId>"
// grabOffset = Position des Mauszeigers innerhalb der gegriffenen Pille (px) auf
// der Achse, entlang der die Ansicht die Zeit abbildet: im Wochenraster vertikal
// (offsetY), im Tagesplan/Gantt horizontal (offsetX). So landet beim Drop der
// Block-Anfang dort, wo der Block (nicht der Cursor) hingehört.
// sourceRowId = Monteur-Zeile, aus der der Chip gegriffen wurde ('' ausserhalb
// einer Monteur-Zeile bzw. Zeile «Ohne Monteur»).
const DRAG_MIME = 'application/x-bau-project'

export function setDragPayload(
  e: React.DragEvent,
  projectId: string,
  grabDayISO: string,
  sourceRowId = '',
  axis: 'x' | 'y' = 'y',
) {
  const raw = `${projectId}|${grabDayISO}|${grabDragOffset(e, axis)}|${sourceRowId}`
  e.dataTransfer.setData(DRAG_MIME, raw)
  e.dataTransfer.setData('text/plain', raw)
  e.dataTransfer.effectAllowed = 'move'
}

export function grabDragOffset(e: React.DragEvent, axis: 'x' | 'y' = 'y'): number {
  const raw = axis === 'x' ? e.nativeEvent.offsetX : e.nativeEvent.offsetY
  return Math.round(raw) || 0
}

export function readDragPayload(
  e: React.DragEvent,
): { projectId: string; grabDayISO: string; grabOffset: number; sourceRowId: string } | null {
  const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
  if (!raw || !raw.includes('|')) return null
  const [projectId, grabDayISO, grabOffset, sourceRowId] = raw.split('|')
  return { projectId, grabDayISO, grabOffset: Number(grabOffset) || 0, sourceRowId: sourceRowId || '' }
}

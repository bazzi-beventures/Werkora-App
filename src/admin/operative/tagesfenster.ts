// Zeiten eines MEHRTÄGIGEN Termins, Tag für Tag (WW-92).
//
// Ein Termin «Mo 07:00 bis Di 12:00» steht als start_date/end_date plus
// start_time/end_time in der Datenbank. Bis 2026-11 las die Einsatzplanung die
// beiden Uhrzeiten als Fenster für JEDEN Tag: der Termin erschien Mo 07–12 und
// Di 07–12, der Nachmittag am Montag fehlte («nimmt mir immer nur den Morgen»).
// Wochenplan-PDF, Monteur-App (services/schedule_export.py: «ab 07:00
// (mehrtägig)» / «bis 12:00 (mehrtägig)») und der Kalender-Anhang
// (services/appointment_ics.py) lasen schon immer: Startzeit am ersten Tag,
// Endzeit am letzten. Diese Datei zieht die Planung nach.
//
// Regel: erster Tag ab Startzeit bis Arbeitsende, Tage dazwischen ein ganzer
// Arbeitstag, letzter Tag ab Arbeitsbeginn bis Endzeit. Fehlt eine der beiden
// Uhrzeiten, gilt der betreffende Tag als ganzer Arbeitstag. Ohne jede Uhrzeit
// bleibt der Termin ganztägig (Strip über dem Raster), wie bisher.
// Wer jeden Tag dasselbe Fenster will (z.B. jeden Morgen 08–12), legt eine
// Serie an («Wiederholung»), keinen mehrtägigen Termin.

import { hhmmToMin, minToHHMM, toDateStr } from '../utils/calendarHelpers'

/** Arbeitstag, mit dem ein mehrtägiger Termin die offenen Tagesränder füllt. */
export const ARBEITSTAG_BEGINN = '07:00'
export const ARBEITSTAG_ENDE = '17:00'

/** Welcher Tag eines mehrtägigen Termins (nur an projizierten Einträgen gesetzt). */
export type TagTeil = 'erster' | 'mitte' | 'letzter'

export interface TerminZeiten {
  start_date?: string | null
  end_date?: string | null
  start_time?: string | null
  end_time?: string | null
}

/** Zusatzfelder eines auf einen Tag projizierten Eintrags. */
export interface TagesProjektion {
  tag_teil?: TagTeil
  /** Die gespeicherten Uhrzeiten des ganzen Termins (Hover, Beschriftung). */
  termin_start_time?: string | null
  termin_end_time?: string | null
}

const hm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null)

export function istMehrtaegig(p: TerminZeiten): boolean {
  if (!p.start_date || !p.end_date) return false
  return p.end_date.slice(0, 10) > p.start_date.slice(0, 10)
}

/**
 * Zeitfenster des Termins an einem Tag: [Start, Ende] als «HH:MM», oder null
 * für ganztägig (ohne Uhrzeit). Liegt der Tag ausserhalb, ebenfalls null.
 * Eintägige Termine geben ihre Uhrzeiten unverändert zurück (start ohne Ende
 * bleibt start/null — wie bisher «ab …»).
 */
export function fensterAmTag(
  p: TerminZeiten, dayISO: string,
): { start: string; end: string | null; teil: TagTeil | null } | null {
  const s = hm(p.start_time), e = hm(p.end_time)
  if (!istMehrtaegig(p)) return s ? { start: s, end: e, teil: null } : null
  if (!s && !e) return null
  const von = p.start_date!.slice(0, 10), bis = p.end_date!.slice(0, 10)
  if (dayISO < von || dayISO > bis) return null
  if (dayISO === von) {
    if (!s) return { start: ARBEITSTAG_BEGINN, end: ARBEITSTAG_ENDE, teil: 'erster' }
    // Beginnt er erst nach Arbeitsende, bekommt der erste Tag wenigstens eine Stunde.
    const ende = Math.max(hhmmToMin(ARBEITSTAG_ENDE), hhmmToMin(s) + 60)
    return { start: s, end: minToHHMM(Math.min(ende, 24 * 60 - 1)), teil: 'erster' }
  }
  if (dayISO === bis) {
    if (!e) return { start: ARBEITSTAG_BEGINN, end: ARBEITSTAG_ENDE, teil: 'letzter' }
    const beginn = Math.max(0, Math.min(hhmmToMin(ARBEITSTAG_BEGINN), hhmmToMin(e) - 60))
    return { start: minToHHMM(beginn), end: e, teil: 'letzter' }
  }
  return { start: ARBEITSTAG_BEGINN, end: ARBEITSTAG_ENDE, teil: 'mitte' }
}

/**
 * Der Eintrag, wie er an `day` im Raster steht: bei mehrtägigen Terminen mit
 * Uhrzeit eine Kopie mit den Uhrzeiten dieses Tages (plus `tag_teil` und den
 * gespeicherten Uhrzeiten), sonst derselbe Eintrag. Die `id` bleibt — Klick,
 * Drag&Drop und Bearbeiten laufen weiter über den gespeicherten Termin.
 */
export function aufTag<T extends TerminZeiten>(p: T, day: Date): T & TagesProjektion {
  if (!istMehrtaegig(p) || (!p.start_time && !p.end_time)) return p
  const f = fensterAmTag(p, toDateStr(day))
  if (!f) return p
  return {
    ...p,
    start_time: f.start,
    end_time: f.end,
    tag_teil: f.teil ?? undefined,
    termin_start_time: p.start_time ?? null,
    termin_end_time: p.end_time ?? null,
  }
}

/** Beschriftung auf der Kachel eines projizierten Tages, sonst null. */
export function tagTeilLabel(p: TagesProjektion): string | null {
  const s = hm(p.termin_start_time), e = hm(p.termin_end_time)
  switch (p.tag_teil) {
    case 'erster': return s ? `ab ${s}` : 'ganzer Tag'
    case 'letzter': return e ? `bis ${e}` : 'ganzer Tag'
    case 'mitte': return 'ganzer Tag'
    default: return null
  }
}

/**
 * Überschneiden sich zwei Termine an irgendeinem gemeinsamen Tag zeitlich?
 * Nur getaktete Tage zählen (ganztägig = keine Aussage), ohne Endzeit 1 h,
 * Ränder berühren sich nicht — dieselbe Regel wie `overlapConflictIds`.
 */
export function ueberschneidenSich(a: TerminZeiten, b: TerminZeiten): boolean {
  if (!a.start_date || !b.start_date) return false
  const aVon = a.start_date.slice(0, 10), aBis = (a.end_date || a.start_date).slice(0, 10)
  const bVon = b.start_date.slice(0, 10), bBis = (b.end_date || b.start_date).slice(0, 10)
  const von = aVon > bVon ? aVon : bVon
  const bis = aBis < bBis ? aBis : bBis
  // Deckel wie MAX_SPAN_DAYS in scheduleShared: ein Datenfehler darf nicht endlos laufen.
  const tag = new Date(`${von}T12:00:00`)
  for (let i = 0; i <= 400; i++) {
    const iso = toDateStr(tag)
    if (iso > bis) return false
    const fa = fensterAmTag(a, iso), fb = fensterAmTag(b, iso)
    if (fa && fb) {
      const aS = hhmmToMin(fa.start), aE = fa.end ? hhmmToMin(fa.end) : aS + 60
      const bS = hhmmToMin(fb.start), bE = fb.end ? hhmmToMin(fb.end) : bS + 60
      if (aS < bE && bS < aE) return true
    }
    tag.setDate(tag.getDate() + 1)
  }
  return false
}

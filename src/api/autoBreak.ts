// Automatischer Pausenabzug — die Client-Seite der Regel.
//
// Reine Funktionen, unit-getestet (autoBreak.test.ts): sie entscheiden, ob der
// Knopf «Keine Pause gemacht» angeboten wird und was er ins Korrekturformular
// schreibt. Verbindlich ist immer der Server (POST /pwa/zeit/correction-request
// weist einen verfristeten Widerspruch mit 409 ab) — dieses Modul sorgt nur
// dafür, dass niemand erst tippt und dann eine Fehlermeldung bekommt.
//
// Hintergrund: docs/specs/automatische-pause.md §3.5.

import { UserInfo } from './auth'
import { getFeature, isFeatureEnabled } from './modules'

export const AUTO_BREAK_FEATURE = 'automatische_pause'

export interface AutoBreakConfig {
  enabled: boolean
  soll: 'gesetzlich' | 'fix'
  minuten: number
  ab_stunden: number
  lage_ab: string
  modus: 'auffuellen' | 'nur_ohne_pause'
  widerspruch_tage: number
}

/** Die Regel des eigenen Betriebs, oder `null`, wenn sie nicht aktiv ist. */
export function autoBreakConfig(user: UserInfo | null): AutoBreakConfig | null {
  if (!isFeatureEnabled(user, AUTO_BREAK_FEATURE)) return null
  return getFeature<AutoBreakConfig>(user, AUTO_BREAK_FEATURE)
}

/** Ein Satz, der die konkrete Regel des Betriebs beschreibt (für Consent/Hinweis). */
export function autoBreakRuleText(cfg: AutoBreakConfig | null): string {
  if (!cfg) return ''
  const basis = cfg.soll === 'gesetzlich'
    ? 'die gesetzliche Mindestpause (15 Min ab 5.5 Std., 30 Min ab 7 Std., 60 Min ab 9 Std. Anwesenheit)'
    : `${cfg.minuten} Min ab ${cfg.ab_stunden} Std. Anwesenheit`
  const modus = cfg.modus === 'nur_ohne_pause'
    ? 'Der Abzug greift nur an Tagen ganz ohne erfasste Pause.'
    : 'Eine kürzere gestempelte Pause wird auf diesen Wert ergänzt.'
  const frist = cfg.widerspruch_tage > 0
    ? `Widerspruch per Korrekturantrag ist ${cfg.widerspruch_tage} Tage lang möglich.`
    : 'Widerspruch per Korrekturantrag ist jederzeit möglich.'
  return `Dein Betrieb zieht an Tagen mit zu wenig gestempelter Pause ${basis} ab. ${modus} ${frist}`
}

/** Tage zwischen einem `YYYY-MM-DD`-Datum und heute; `null`, wenn unlesbar. */
export function daysSince(dateIso: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateIso || '').trim())
  if (!m) return null
  // UTC-Mitternacht auf beiden Seiten: sonst verschiebt die Sommerzeit den
  // Abstand um eine Stunde und ein Tag fällt beim Runden weg.
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((now - day) / 86_400_000)
}

/**
 * Ist die Self-Service-Frist für diesen Tag abgelaufen?
 *
 * `widerspruch_tage = 0` schaltet die Frist ab. Ein unlesbares Datum sperrt nie
 * — im Zweifel entscheidet der Server.
 */
export function objectionExpired(
  dateIso: string,
  cfg: AutoBreakConfig | null,
  today: Date = new Date(),
): boolean {
  if (!cfg || cfg.widerspruch_tage <= 0) return false
  const age = daysSince(dateIso, today)
  if (age === null) return false
  return age > cfg.widerspruch_tage
}

export interface AutoBreakDay {
  date: string                    // YYYY-MM-DD
  clock_in: string | null         // HH:MM
  clock_out: string | null        // HH:MM
  break_minutes: number
  auto_break_minutes: number
}

/** Trägt dieser Tag einen automatischen Abzug, der sich widerlegen liesse? */
export function hasAutoBreak(day: AutoBreakDay | null | undefined): boolean {
  return !!day && (day.auto_break_minutes || 0) > 0
}

/**
 * Vorbefüllung für «Keine Pause gemacht».
 *
 * Der Korrekturantrag existiert seit jeher — die Hürde ist, dass der Monteur
 * seine eigenen Zeiten aus dem Kopf eintippen muss. Hier kommen sie aus der
 * Aufzeichnung, die Pause auf 0 und der Grund vorformuliert (überschreibbar).
 */
export function noBreakPrefill(day: AutoBreakDay): {
  date: string
  clock_in: string
  clock_out: string
  break_minutes: number
  reason: string
} {
  return {
    date: day.date,
    clock_in: day.clock_in || '',
    clock_out: day.clock_out || '',
    break_minutes: 0,
    reason: 'Keine Pause gemacht',
  }
}

export const OBJECTION_EXPIRED_HINT =
  'Widerspruchsfrist abgelaufen — bitte beim Vorgesetzten melden.'

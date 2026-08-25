/**
 * Katalog der Beschaffungs-Arbeitsschritte (Feature `beschaffungsstatus`).
 *
 * Spiegel von BESCHAFFUNG_STEPS in feature_registry.py — Schlüssel und Reihenfolge
 * müssen dort und hier übereinstimmen. Gleiches Muster wie die MIME-Whitelist in
 * shared/projectFileTypes.ts: der Server ist die Wahrheit, das Frontend hält eine
 * Kopie für Labels und Reihenfolge.
 *
 * Der Server liefert in `user.feature_flags.beschaffungsstatus.steps` nur die Schlüssel,
 * die der Mandant angewählt hat — Labels und Sortierung kommen von hier.
 */

export interface BeschaffungStep {
  key: string
  label: string
  /** Chronologische Reihenfolge, denormalisiert nach projects.workflow_rank. */
  rank: number
  badge: string
}

export const BESCHAFFUNG_STEPS: BeschaffungStep[] = [
  // Offene Schritte tragen bewusst das Warn-Badge: "AB offen" ist eine Bringschuld,
  // keine neutrale Information. Erledigt-Meldungen (Bestellt, AB kontrolliert,
  // Terminiert, Verrechnet) sind Feststellungen — kein Warn-Badge.
  { key: 'bestellt', label: 'Bestellt', rank: 10, badge: 'admin-badge-sent' },
  { key: 'ab_offen', label: 'AB offen', rank: 20, badge: 'admin-badge-pending' },
  { key: 'ab_kontrolliert', label: 'AB kontrolliert', rank: 25, badge: 'admin-badge-approved' },
  { key: 'teillieferung', label: 'Teillieferung', rank: 30, badge: 'admin-badge-pending' },
  { key: 'lieferung_offen', label: 'Lieferung offen', rank: 40, badge: 'admin-badge-pending' },
  { key: 'terminiert', label: 'Terminiert', rank: 45, badge: 'admin-badge-sent' },
  { key: 'montage_terminiert', label: 'Montage terminiert', rank: 50, badge: 'admin-badge-sent' },
  { key: 'montage_offen', label: 'Montage offen', rank: 60, badge: 'admin-badge-open' },
  { key: 'beschaffung_ok', label: 'Beschaffung erledigt', rank: 70, badge: 'admin-badge-approved' },
  { key: 'verrechnet', label: 'Verrechnet', rank: 80, badge: 'admin-badge-paid' },
  // Wartet nicht auf uns → neutral, damit es in der Liste nicht nach Handlungsbedarf aussieht.
  { key: 'spaeter', label: 'Auf Termin / später', rank: 90, badge: 'admin-badge-draft' },
]

const BY_KEY = new Map(BESCHAFFUNG_STEPS.map(s => [s.key, s]))

export function beschaffungStep(key: string | null | undefined): BeschaffungStep | null {
  return key ? BY_KEY.get(key) ?? null : null
}

/**
 * Die für diesen Mandanten wählbaren Schritte, in Katalog-Reihenfolge.
 * `steps` fehlt bei einem Alt-Override → voller Katalog (gleiche Kulanz wie das Backend).
 */
export function enabledBeschaffungSteps(cfg: { steps?: unknown } | null): BeschaffungStep[] {
  const raw = cfg?.steps
  if (!Array.isArray(raw)) return BESCHAFFUNG_STEPS
  const chosen = new Set(raw.filter((s): s is string => typeof s === 'string'))
  return BESCHAFFUNG_STEPS.filter(s => chosen.has(s.key))
}

/**
 * "seit 6 Tagen" für den Tooltip/Untertitel. Nur ganze Tage — bei einem Schritt, der
 * Tage bis Wochen dauert, ist "seit 3 Stunden" keine nützliche Information.
 * Liefert null für heute gesetzte oder fehlende Zeitstempel.
 */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((now.getTime() - then) / 86_400_000)
  return days >= 1 ? days : null
}

import { diffDays, toDateStr } from '../admin/utils/calendarHelpers'

/**
 * Umzugs-Hinweis für die alte Origin (docs/specs/werkora-domain-app-einstieg.md,
 * P5 und P9).
 *
 * Warum es das überhaupt braucht: Nach dem Domainwechsel liefert die alte
 * Adresse serverseitig 404 — den sieht aber niemand, der die PWA installiert
 * hat. Der Service Worker bedient die App weiter aus dem Cache, gegen die alte
 * API, voll funktionsfähig. Am 2026-08-25 auf Staging gemessen (§4.4). Ein
 * Nutzer bekommt also **kein einziges Signal**, dass sich etwas geändert hat —
 * ausser diesem Banner. Es ist nicht die freundliche Zugabe, sondern der
 * einzige Kanal.
 *
 * Der Streifen erscheint nur, wenn `VITE_MIGRATION_NOTICE` gesetzt ist. Im
 * normalen Build ist die Variable leer, im Build für die alte Domain trägt sie
 * die Ziel-URL. Dieselbe Quelle, zwei Builds — deshalb ein Flag und kein
 * eigener Zweig.
 */
export type MigrationStufe = 'aus' | 'hinweis' | 'dringend' | 'vorschalt'

/** Kalendertage bis zum Stichtag; negativ, wenn er vorbei ist. */
export function tageBisStichtag(now: Date, stichtagISO: string): number {
  return diffDays(toDateStr(now), stichtagISO)
}

/**
 * Welche Eskalationsstufe heute gilt.
 *
 * Die Schwellen hängen an der RESTZEIT, nicht am Cutover-Datum. Damit stimmt
 * die Eskalation auch dann, wenn der Cutover verschoben wird — das Banner weiss
 * nur, wann abgeschaltet wird, und das genügt.
 *
 * Gerechnet wird in Kalendertagen über `diffDays` (lokale Zeit), nicht in
 * Millisekunden: eine Zeitumstellung macht einen Tag 23 oder 25 Stunden lang,
 * und eine ms-Division läge dann um einen Tag daneben. Im aktuellen Fenster
 * (28.08.–11.09.2026) gibt es keine Umstellung — die Rechnung ist trotzdem so
 * gebaut, weil der Stichtag verschoben werden kann und der nächste Wechsel am
 * 25.10. liegt. Ein Countdown, der einmal im Jahr um einen Tag danebenliegt,
 * ist genau die Sorte Fehler, die niemand mehr findet.
 */
export function migrationStufe(
  now: Date,
  zielUrl: string | undefined,
  stichtagISO: string | undefined,
): MigrationStufe {
  if (!zielUrl) return 'aus'
  // Ohne Stichtag bleibt es beim mildesten Hinweis. Automatisch zu eskalieren,
  // ohne zu wissen worauf, wäre geraten.
  if (!stichtagISO) return 'hinweis'

  const rest = tageBisStichtag(now, stichtagISO)
  if (Number.isNaN(rest)) return 'hinweis'
  if (rest > 7) return 'hinweis'      // X   bis X+6   — dezent, wegklickbar
  if (rest >= 3) return 'dringend'    // X+7 bis X+11  — bleibt stehen, mit Countdown
  return 'vorschalt'                  // ab X+12       — Vorschaltseite, überspringbar
}

/** Rangfolge für den Vergleich «wurde diese Stufe schon weggeklickt?». */
const RANG: Record<MigrationStufe, number> = {
  aus: 0, hinweis: 1, dringend: 2, vorschalt: 3,
}

/**
 * Ein weggeklickter Hinweis bleibt weg — aber nur für seine Stufe. Eskaliert
 * die Lage, kommt er wieder. Sonst würde ein einziger Klick am ersten Tag den
 * Nutzer für die restlichen zwei Wochen stumm schalten, und genau der Nutzer
 * steht am Stichtag vor der Zwangsumleitung.
 */
export function istWeggeklickt(aktuell: MigrationStufe, weggeklickt: string | null): boolean {
  if (!weggeklickt) return false
  const alt = RANG[weggeklickt as MigrationStufe]
  if (alt === undefined) return false
  return alt >= RANG[aktuell]
}

/** Text des Streifens. Kurz halten — er steht über der ganzen App. */
export function migrationText(stufe: MigrationStufe, rest: number): string {
  if (stufe === 'hinweis') return 'Werkora ist umgezogen. Jetzt wechseln →'
  if (rest > 1) return `Diese Adresse wird in ${rest} Tagen abgeschaltet. Jetzt wechseln →`
  if (rest === 1) return 'Diese Adresse wird morgen abgeschaltet. Jetzt wechseln →'
  if (rest === 0) return 'Diese Adresse wird heute abgeschaltet. Jetzt wechseln →'
  return 'Diese Adresse ist abgeschaltet. Jetzt wechseln →'
}

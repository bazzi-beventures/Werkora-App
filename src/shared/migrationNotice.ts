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
 * Was beim Wegklicken gespeichert wird: Stufe **und** Tag, als `stufe|JJJJ-MM-TT`.
 *
 * Der Tag ist der eigentliche Punkt. Ohne ihn galt ein Klick bis zur nächsten
 * Eskalation — im Fenster 28.08.–11.09. hiess das: einmal am ersten Abend
 * weggeklickt, und der Hinweis kam erst am 04.09. wieder. Eine Woche Stille bei
 * dem Kanal, der im Parallelbetrieb der einzige ist (§4.4).
 */
export function wegklickWert(stufe: MigrationStufe, heuteISO: string): string {
  return `${stufe}|${heuteISO}`
}

/**
 * Ein weggeklickter Hinweis bleibt weg — aber nur für **diesen Tag** und nur
 * für **seine Stufe**. Zwei Rückwege, beide gewollt:
 *
 * - **Am nächsten Morgen** steht er wieder da. Wegklicken heisst «heute gesehen»,
 *   nicht «nie wieder»: sonst schaltet ein einziger Klick den Nutzer bis zur
 *   nächsten Eskalation stumm, und genau der steht am Stichtag vor der
 *   Zwangsumleitung. Ein Klick pro Tag ist der Preis dafür, und er ist billiger
 *   als ein Anruf am 11.09.
 * - **Bei einer Eskalation** steht er sofort wieder da, auch am selben Tag.
 *
 * Die Grenze ist der Kalendertag, nicht «24 Stunden nach dem Klick» — wer um
 * 23:50 wegklickt, soll ihn am Morgen wiedersehen und nicht erst am Mittag.
 *
 * Werte ohne Tag stammen aus der ersten Fassung des Streifens (nur die Stufe)
 * und gelten als *nicht* weggeklickt: der Hinweis erscheint dann einmal erneut
 * und schreibt sich beim nächsten Klick im neuen Format. Einmal zu viel gezeigt
 * ist hier die richtige Richtung — deshalb braucht der Formatwechsel auch
 * keinen `APP_DATA_VERSION`-Schritt.
 */
export function istWeggeklickt(
  aktuell: MigrationStufe,
  weggeklickt: string | null,
  heuteISO: string,
): boolean {
  if (!weggeklickt) return false
  const [stufe, tag] = weggeklickt.split('|')
  if (tag !== heuteISO) return false
  const alt = RANG[stufe as MigrationStufe]
  if (alt === undefined) return false
  return alt >= RANG[aktuell]
}

/**
 * Der Hostname aus der Ziel-URL, zum Anzeigen.
 *
 * Abgeleitet und nicht daneben geschrieben: sonst könnten Text und Link
 * auseinanderlaufen, und der Nutzer tippte eine Adresse ab, die es nicht gibt.
 */
export function zielHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

/**
 * Text des Streifens, zweizeilig.
 *
 * Beide Zeilen sind nötig, und beide wurden beim ersten Wurf vergessen:
 *
 * - **Die Adresse muss lesbar dastehen**, nicht nur als Klickziel. Wer auf dem
 *   Handy den Hinweis sieht, aber am Bürorechner wechseln will, braucht sie zum
 *   Abtippen. Ein Streifen, den man nur antippen kann, hilft genau dann nicht,
 *   wenn jemand das Gerät wechselt — und das ist beim Umzug der Normalfall.
 * - **«Einmal neu anmelden» gehört auf jede Stufe.** Die Anmeldung hängt am
 *   API-Host, auf der neuen Adresse ist man zwangsläufig ausgeloggt. Wer das
 *   nicht vorher liest, hält den Login-Screen für einen Fehler und ruft an.
 */
export function migrationText(
  stufe: MigrationStufe,
  rest: number,
  zielUrl: string,
): { zeile1: string; zeile2: string } {
  const host = zielHost(zielUrl)
  const zeile2 = `${host} — dort einmal neu anmelden`

  if (stufe === 'hinweis') return { zeile1: 'Werkora ist umgezogen', zeile2 }
  if (rest > 1) return { zeile1: `Diese Adresse wird in ${rest} Tagen abgeschaltet`, zeile2 }
  if (rest === 1) return { zeile1: 'Diese Adresse wird morgen abgeschaltet', zeile2 }
  if (rest === 0) return { zeile1: 'Diese Adresse wird heute abgeschaltet', zeile2 }
  return { zeile1: 'Diese Adresse ist abgeschaltet', zeile2 }
}

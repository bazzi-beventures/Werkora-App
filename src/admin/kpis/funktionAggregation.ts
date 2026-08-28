/**
 * Deckungsbeitrag je Funktion — Monatszeilen zu Zeitraumzeilen zusammenfassen.
 *
 * Rein und unit-getestet, nach dem Vorbild von `pipelineAggregation.ts`.
 * `vw_kpi_funktion_monat` liefert Funktion × Monat; die Summe über den gewählten
 * Zeitraum entsteht hier, damit ein Filterwechsel keine neue Abfrage kostet.
 *
 * Der Blick ist die Kalkulation: verrechnet der Funktions-Stundensatz mehr, als
 * die Stunde uns kostet? Er ist ausdrücklich **kein** Personen-Ranking — die
 * View führt deshalb keine Namen, und diese Datei kennt keine.
 */

import { finite, sumOrNull } from './aggregate'
import type { KpiFunktionMonatRow } from './types'

export interface FunktionSumme {
  funktion: string
  monate: number
  stunden: number
  /** Untere Schranke: die grösste Monatsbesetzung im Zeitraum (siehe unten). */
  anzahl_mitarbeiter: number
  verrechnet_chf: number | null
  lohnkosten_intern: number | null
  deckungsbeitrag: number | null
  /** Deckungsbeitrag je Stunde — die eigentliche Satzfrage. */
  db_pro_stunde: number | null
  marge_pct: number | null
  stunden_ohne_satz: number
  stunden_ohne_lohn: number
}

/**
 * Fasst die Monatszeilen je Funktion zusammen.
 *
 * `von`/`bis` sind 'YYYY-MM' (leer = offen) und werden lexikografisch verglichen —
 * bei diesem Format ist das dieselbe Ordnung wie beim Datum.
 *
 * Fehlt in **einem** Monat der verrechnete Betrag oder die Lohnkosten, ist die
 * Summe des Zeitraums `null`, nicht die Summe der übrigen Monate. Dieselbe
 * Ehrlichkeits-Regel wie in den Views: ein zu tiefer Kostenwert macht aus jeder
 * Funktion eine profitable.
 */
export function aggregiereFunktionen(
  rows: readonly KpiFunktionMonatRow[],
  von = '',
  bis = '',
): FunktionSumme[] {
  const imBereich = rows.filter(
    (r) => (!von || r.jahr_monat >= von) && (!bis || r.jahr_monat <= bis),
  )

  const nachFunktion = new Map<string, KpiFunktionMonatRow[]>()
  for (const row of imBereich) {
    const bucket = nachFunktion.get(row.funktion)
    if (bucket) bucket.push(row)
    else nachFunktion.set(row.funktion, [row])
  }

  const summen: FunktionSumme[] = []
  for (const [funktion, monatsZeilen] of nachFunktion) {
    const stunden = sumOrNull(monatsZeilen, (r) => r.stunden) ?? 0
    const verrechnet = sumOrNull(monatsZeilen, (r) => r.verrechnet_chf)
    const lohnkosten = sumOrNull(monatsZeilen, (r) => r.lohnkosten_intern)
    const deckungsbeitrag =
      verrechnet === null || lohnkosten === null ? null : verrechnet - lohnkosten

    summen.push({
      funktion,
      monate: monatsZeilen.length,
      stunden,
      // Personen lassen sich über Monate nicht addieren — dieselbe Person kommt
      // in jedem Monat vor. Die grösste Monatsbesetzung ist die belastbare
      // untere Schranke; sie beantwortet die einzige Frage, die hier zählt:
      // trägt diese Zeile mehr als eine Person?
      anzahl_mitarbeiter: monatsZeilen.reduce(
        (max, r) => Math.max(max, finite(r.anzahl_mitarbeiter) ?? 0),
        0,
      ),
      verrechnet_chf: verrechnet,
      lohnkosten_intern: lohnkosten,
      deckungsbeitrag,
      db_pro_stunde: deckungsbeitrag === null || stunden <= 0 ? null : deckungsbeitrag / stunden,
      marge_pct:
        deckungsbeitrag === null || verrechnet === null || verrechnet <= 0
          ? null
          : (deckungsbeitrag / verrechnet) * 100,
      stunden_ohne_satz: monatsZeilen.reduce((s, r) => s + (finite(r.stunden_ohne_satz) ?? 0), 0),
      stunden_ohne_lohn: monatsZeilen.reduce((s, r) => s + (finite(r.stunden_ohne_lohn) ?? 0), 0),
    })
  }

  return summen.sort((a, b) => b.stunden - a.stunden)
}

/** Die Monate, die in den Daten vorkommen — absteigend, für die Bereichsauswahl. */
export function verfuegbareMonate(rows: readonly KpiFunktionMonatRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.jahr_monat))).sort().reverse()
}

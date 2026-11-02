// Reine Helfer der Diagramme im Reiter «Assistent» (docs/specs/kennzahlen-assistent.md
// §8 Phase 5). Ohne React/DOM, unit-getestet in diagramm.test.ts.
//
// Die Werte kommen fertig vom Server (services/kpi_diagramme.py) — hier wird nur
// angeordnet und beschriftet, nie gerechnet. Eine Lücke (`null`) bleibt eine Lücke.

import type { KpiDiagramm, KpiDiagrammReihe } from '../../api/admin/kpiAssistent'

export type DiagrammZeile = { kategorie: string; zusatz?: string } & Record<string, number | null | string | undefined>

/** Schlüssel der Reihe `i` in den Datenzeilen — Reihennamen sind Anzeige
 *  («Dez 24 – Nov 25») und taugen nicht als Objektschlüssel. */
export function reihenSchluessel(i: number): string {
  return `r${i}`
}

/** Eine Zeile je Kategorie, eine Spalte je Reihe — die Form, die recharts liest. */
export function diagrammZeilen(d: KpiDiagramm): DiagrammZeile[] {
  return d.kategorien.map((kategorie, i) => {
    const zeile: DiagrammZeile = { kategorie }
    d.reihen.forEach((r, j) => { zeile[reihenSchluessel(j)] = r.werte[i] ?? null })
    if (d.zusatz?.[i]) zeile.zusatz = d.zusatz[i]
    return zeile
  })
}

/** Farbe je Reihe: Hauptreihen bekommen die Palette in fester Reihenfolge (die
 *  erste Hauptreihe immer Slot 1, auch wenn eine Kontextreihe davor steht),
 *  Kontextreihen das neutrale Grau. */
export function reihenFarben(reihen: KpiDiagrammReihe[], palette: string[], grau: string): string[] {
  let haupt = 0
  return reihen.map(r => (r.rolle === 'kontext' ? grau : palette[haupt++ % palette.length]))
}

function zahl(v: number, nachkomma: number): string {
  return v.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: nachkomma })
}

/** Voller Wert für Tooltip und Tabelle: «CHF 12'345», «12.5 h», Lücke «–». */
export function formatWert(v: number | null | undefined, einheit: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–'
  if (einheit === 'CHF') return `CHF ${zahl(v, 0)}`
  if (einheit === 'Stunden') return `${zahl(v, 1)} h`
  return zahl(v, 1)
}

/** Kurzer Wert für Achse und Balkenbeschriftung: «12K», «1.5K», «60 h». */
export function kompakt(v: number, einheit: string): string {
  if (einheit === 'CHF' && Math.abs(v) >= 1000) {
    const k = v / 1000
    return `${zahl(k, Math.abs(k) >= 100 ? 0 : 1)}K`
  }
  if (einheit === 'Stunden') return `${zahl(v, 0)} h`
  return zahl(v, 0)
}

/** Lange Beschriftungen (Kundennamen) für die y-Achse kürzen; der volle Name
 *  steht im Tooltip und in der Tabelle. */
export function kuerze(text: string, max = 18): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

/** Beschriftung auf höchstens `maxZeilen` Zeilen umbrechen, an Leerzeichen.
 *  recharts bricht selbst nur an Leerzeichen um und lässt ein langes Wort
 *  («Stockwerkeigentümergemeinschaft») aus der Fläche laufen — deshalb wird
 *  hier gebrochen und, was nicht passt, mit «…» gekürzt. Der volle Text steht
 *  im Tooltip und in der Tabelle. */
export function umbrechen(text: string, maxZeichen: number, maxZeilen = 2): string[] {
  const zeilen: string[] = []
  let aktuell = ''
  for (const wort of text.split(/\s+/).filter(Boolean)) {
    const kandidat = aktuell ? `${aktuell} ${wort}` : wort
    if (kandidat.length <= maxZeichen) {
      aktuell = kandidat
      continue
    }
    if (aktuell) zeilen.push(aktuell)
    aktuell = wort
    if (zeilen.length === maxZeilen) break
  }
  if (aktuell && zeilen.length < maxZeilen) zeilen.push(aktuell)
  const vollstaendig = zeilen.join(' ').length >= text.trim().replace(/\s+/g, ' ').length
  return zeilen.map((z, i) => {
    if (i === zeilen.length - 1 && !vollstaendig) {
      // Es fehlt Text dahinter: das «…» muss auch an eine kurze Zeile.
      return z.length < maxZeichen ? `${z}…` : `${z.slice(0, maxZeichen - 1).trimEnd()}…`
    }
    return kuerze(z, maxZeichen)
  })
}

/** Liegt ein Wert unter 0? Dann bekommt das Diagramm eine Nulllinie. */
export function hatNegative(d: KpiDiagramm): boolean {
  return d.reihen.some(r => r.werte.some(v => v !== null && v < 0))
}

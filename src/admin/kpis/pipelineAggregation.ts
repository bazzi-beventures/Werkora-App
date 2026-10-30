// Reine Aggregations-/Filterlogik für den Kennzahlen-Tab "Projekt-Pipeline".
// Bewusst ohne React/DOM — unit-getestet in pipelineAggregation.test.ts.
//
// Datums-Semantik: jede Kennzahl filtert auf ihr eigenes Ereignisdatum —
// Offerten auf das Erstellungsdatum, Rapporte auf das Rapportdatum, Rechnungen
// auf Versand- bzw. Zahlungsdatum. Bei aktivem Datumsfilter fallen Projekte
// ganz weg, wenn keines ihrer Ereignisse im Zeitraum liegt.
import type { PipelineProjektRow, PipelineOfferte, PipelineRechnung } from './types'

export const OHNE_PL = 'Ohne Projektleiter'

export interface PipelineFilter {
  from: string | null // YYYY-MM-DD, inklusiv
  to: string | null
  projektleiter: Set<string> | null // Anzeigenamen inkl. OHNE_PL; null = alle
  search: string // Projekt-Name/-Nummer oder Kunde, case-insensitiv
}

export interface PipelineLeiterAgg {
  projektleiter: string
  projekte: number
  offertenOffen: number // versendet, noch nicht angenommen/abgelehnt (Status gesendet)
  offertenOffenChf: number
  offertenEntwurf: number // noch nicht versendet — zählt NICHT zu offen
  offertenAkzeptiert: number
  offertenAkzeptiertChf: number
  // Akzeptierte Offerten auf Projekten ohne versendete Rechnung: der Teil von
  // «akzeptiert», der noch nicht in «Rechnungen versendet» steckt.
  offertenNichtFakturiert: number
  offertenNichtFakturiertChf: number
  offertenAbgelehnt: number
  offertenAbgelehntChf: number
  projekteMitRapport: number
  rapporte: number
  rechnungenVersendet: number
  rechnungenChf: number
  // Versendet (im Zeitraum) und noch nicht bezahlt — die offenen Forderungen.
  rechnungenOffen: number
  rechnungenOffenChf: number
  rechnungenBezahlt: number
  bezahltChf: number
}

export interface PipelineProjektAgg {
  projektNummer: string | null
  projektName: string
  projektStatus: string
  isClosed: boolean
  kunde: string
  projektleiter: string
  offertenOffen: number
  offertenOffenChf: number
  offertenEntwurf: number
  offertenAkzeptiert: number
  rapporte: number
  rechnungenVersendet: number
  rechnungenChf: number
  bezahltChf: number
  // Drill-down: die im Zeitraum liegenden Ereignisse (reconciliert mit den Zählern
  // oben) plus Gesamtzahl auf dem Projekt für den "+N ausserhalb"-Hinweis.
  offertenDetail: PipelineOfferte[]
  rapporteDetail: string[]
  rechnungenDetail: PipelineRechnung[]
  offertenGesamt: number
  rapporteGesamt: number
  rechnungenGesamt: number
}

export function leiterName(row: PipelineProjektRow): string {
  return row.projektleiter_name?.trim() || OHNE_PL
}

function inRange(d: string | null | undefined, from: string | null, to: string | null): boolean {
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

const sum = (nums: number[]) => nums.reduce((a, b) => a + b, 0)

export function aggregatePipeline(
  rows: PipelineProjektRow[],
  filter: PipelineFilter,
): { perLeiter: PipelineLeiterAgg[]; perProjekt: PipelineProjektAgg[] } {
  const { from, to } = filter
  const search = filter.search.trim().toLowerCase()
  const dateActive = Boolean(from || to)

  const perProjekt: PipelineProjektAgg[] = []
  const byLeiter = new Map<string, PipelineLeiterAgg>()

  for (const row of rows) {
    const pl = leiterName(row)
    if (filter.projektleiter !== null && !filter.projektleiter.has(pl)) continue
    if (search) {
      const hay = `${row.projekt_name} ${row.projekt_nummer ?? ''} ${row.kunde_name ?? ''}`.toLowerCase()
      if (!hay.includes(search)) continue
    }

    const offerten = row.offerten.filter((o) => inRange(o.datum, from, to))
    // Offen = beim Kunden, Entscheid ausstehend. Angenommene tragen hier schon
    // 'akzeptiert' (Backend folgt accepted_at, nicht dem Rohstatus), abgelehnte
    // 'abgelehnt'. Entwürfe waren nie beim Kunden und gehören nicht in den
    // erwartbaren Umsatz — sie stehen separat.
    const offen = offerten.filter((o) => o.status === 'gesendet')
    const entwurf = offerten.filter((o) => o.status === 'entwurf')
    const akzeptiert = offerten.filter((o) => o.status === 'akzeptiert')
    // Fakturiert heisst: das Projekt hat eine versendete Rechnung — unabhängig
    // vom Datumsfilter. Sonst gälte eine im Mai angenommene, im Juni fakturierte
    // Offerte unter «Letzter Monat = Mai» als nicht fakturiert. Auf Projektebene,
    // weil das Modell 1 Projekt = 1 Rechnung ist (Backend liefert nur die aktuellste).
    const fakturiert = row.rechnungen.some((r) => Boolean(r.gesendet_am))
    const nichtFakturiert = fakturiert ? [] : akzeptiert
    const abgelehnt = offerten.filter((o) => o.status === 'abgelehnt')
    const rapporte = row.rapporte.filter((d): d is string => inRange(d, from, to))
    const reVersendet = row.rechnungen.filter((r) => inRange(r.gesendet_am, from, to))
    const reBezahlt = row.rechnungen.filter((r) => inRange(r.bezahlt_am, from, to))
    const reOffen = reVersendet.filter((r) => !r.bezahlt_am)
    // Rechnungen fürs Drill-down: alle im Zeitraum (nach Versand- ODER Zahldatum).
    const reDetail = row.rechnungen.filter(
      (r) => inRange(r.gesendet_am, from, to) || inRange(r.bezahlt_am, from, to),
    )

    const activity =
      offerten.length + rapporte.length + reVersendet.length + reBezahlt.length
    // Offene Projekte bleiben unter jedem Datumsfilter sichtbar (Funnel-Start,
    // ggf. mit Null-Zählern) — spiegelt die Backend-Regel in build_projekt_pipeline_rows.
    // Nur GESCHLOSSENE Projekte ohne Ereignis im Zeitraum fallen weg.
    if (dateActive && activity === 0 && row.is_closed) continue

    perProjekt.push({
      projektNummer: row.projekt_nummer,
      projektName: row.projekt_name,
      projektStatus: row.projekt_status,
      isClosed: row.is_closed,
      kunde: row.kunde_name ?? '—',
      projektleiter: pl,
      offertenOffen: offen.length,
      offertenOffenChf: sum(offen.map((o) => o.betrag)),
      offertenEntwurf: entwurf.length,
      offertenAkzeptiert: akzeptiert.length,
      rapporte: rapporte.length,
      rechnungenVersendet: reVersendet.length,
      rechnungenChf: sum(reVersendet.map((r) => r.betrag)),
      bezahltChf: sum(reBezahlt.map((r) => r.bezahlt_betrag)),
      offertenDetail: offerten,
      rapporteDetail: rapporte,
      rechnungenDetail: reDetail,
      offertenGesamt: row.offerten.length,
      rapporteGesamt: row.rapporte.filter(Boolean).length,
      rechnungenGesamt: row.rechnungen.length,
    })

    let agg = byLeiter.get(pl)
    if (!agg) {
      agg = {
        projektleiter: pl,
        projekte: 0,
        offertenOffen: 0,
        offertenOffenChf: 0,
        offertenEntwurf: 0,
        offertenAkzeptiert: 0,
        offertenAkzeptiertChf: 0,
        offertenNichtFakturiert: 0,
        offertenNichtFakturiertChf: 0,
        offertenAbgelehnt: 0,
        offertenAbgelehntChf: 0,
        projekteMitRapport: 0,
        rapporte: 0,
        rechnungenVersendet: 0,
        rechnungenChf: 0,
        rechnungenOffen: 0,
        rechnungenOffenChf: 0,
        rechnungenBezahlt: 0,
        bezahltChf: 0,
      }
      byLeiter.set(pl, agg)
    }
    agg.projekte += 1
    agg.offertenOffen += offen.length
    agg.offertenOffenChf += sum(offen.map((o) => o.betrag))
    agg.offertenEntwurf += entwurf.length
    agg.offertenAkzeptiert += akzeptiert.length
    agg.offertenAkzeptiertChf += sum(akzeptiert.map((o) => o.betrag))
    agg.offertenNichtFakturiert += nichtFakturiert.length
    agg.offertenNichtFakturiertChf += sum(nichtFakturiert.map((o) => o.betrag))
    agg.offertenAbgelehnt += abgelehnt.length
    agg.offertenAbgelehntChf += sum(abgelehnt.map((o) => o.betrag))
    agg.projekteMitRapport += rapporte.length > 0 ? 1 : 0
    agg.rapporte += rapporte.length
    agg.rechnungenVersendet += reVersendet.length
    agg.rechnungenChf += sum(reVersendet.map((r) => r.betrag))
    agg.rechnungenOffen += reOffen.length
    agg.rechnungenOffenChf += sum(reOffen.map((r) => r.betrag))
    agg.rechnungenBezahlt += reBezahlt.length
    agg.bezahltChf += sum(reBezahlt.map((r) => r.bezahlt_betrag))
  }

  return { perLeiter: Array.from(byLeiter.values()), perProjekt }
}

// ── Stufen für die Cashflow-Sicht ───────────────────────────────────────────
//
// Vier Stufen, die sich NICHT überschneiden — jeder Franken steht in genau
// einer, deshalb darf man sie addieren (anders als «Offerten akzeptiert» und
// «Rechnungen versendet», die einen fakturierten Auftrag beide zählen):
//   beim Kunden   versendete Offerten ohne Entscheid
//   Auftrag       akzeptierte Offerten auf Projekten ohne versendete Rechnung
//   fakturiert    versendete, noch nicht bezahlte Rechnungen
//   bezahlt       Zahlungen im Zeitraum
//
// Gewichtung der offenen Offerten mit der Annahmequote NACH BETRAG:
// angenommen ÷ (angenommen + abgelehnt), Offerten im gewählten Zeitraum. Offene
// zählen nicht in den Nenner (Spec offerten-varianten.md, «Annahmequote»). Unter
// MIN_ENTSCHIEDEN entschiedenen Offerten gibt es keine Quote — eine aus drei
// Entscheiden wäre eine Behauptung, keine Erfahrung.

export const MIN_ENTSCHIEDEN = 10

export interface PipelineStufen {
  beimKunden: number
  beimKundenChf: number
  auftrag: number
  auftragChf: number
  fakturiertOffen: number
  fakturiertOffenChf: number
  bezahlt: number
  bezahltChf: number
  /** 0..1, null = zu wenige entschiedene Offerten */
  annahmequote: number | null
  entschieden: number
  /** beimKundenChf × annahmequote, null ohne Quote */
  beimKundenErwartetChf: number | null
  /** beauftragt, aber noch nicht bezahlt: auftragChf + fakturiertOffenChf */
  gesichertChf: number
  /** gesichert + erwartet aus offenen Offerten (ohne Quote: nur gesichert) */
  nochZuErwartenChf: number
}

export function pipelineStufen(perLeiter: PipelineLeiterAgg[]): PipelineStufen {
  const t = (f: (l: PipelineLeiterAgg) => number) => sum(perLeiter.map(f))
  const akzeptiert = t((l) => l.offertenAkzeptiert)
  const abgelehnt = t((l) => l.offertenAbgelehnt)
  const akzeptiertChf = t((l) => l.offertenAkzeptiertChf)
  const abgelehntChf = t((l) => l.offertenAbgelehntChf)
  const entschieden = akzeptiert + abgelehnt
  const annahmequote =
    entschieden >= MIN_ENTSCHIEDEN && akzeptiertChf + abgelehntChf > 0
      ? akzeptiertChf / (akzeptiertChf + abgelehntChf)
      : null

  const beimKundenChf = t((l) => l.offertenOffenChf)
  const auftragChf = t((l) => l.offertenNichtFakturiertChf)
  const fakturiertOffenChf = t((l) => l.rechnungenOffenChf)
  const beimKundenErwartetChf = annahmequote === null ? null : beimKundenChf * annahmequote
  const gesichertChf = auftragChf + fakturiertOffenChf

  return {
    beimKunden: t((l) => l.offertenOffen),
    beimKundenChf,
    auftrag: t((l) => l.offertenNichtFakturiert),
    auftragChf,
    fakturiertOffen: t((l) => l.rechnungenOffen),
    fakturiertOffenChf,
    bezahlt: t((l) => l.rechnungenBezahlt),
    bezahltChf: t((l) => l.bezahltChf),
    annahmequote,
    entschieden,
    beimKundenErwartetChf,
    gesichertChf,
    nochZuErwartenChf: gesichertChf + (beimKundenErwartetChf ?? 0),
  }
}

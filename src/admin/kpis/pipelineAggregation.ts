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
  offertenOffen: number // Status entwurf + gesendet
  offertenOffenChf: number
  offertenVersendet: number // davon Status gesendet
  offertenAkzeptiert: number
  offertenAkzeptiertChf: number
  projekteMitRapport: number
  rapporte: number
  rechnungenVersendet: number
  rechnungenChf: number
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
  offertenVersendet: number
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
    const offen = offerten.filter((o) => o.status === 'entwurf' || o.status === 'gesendet')
    const versendet = offen.filter((o) => o.status === 'gesendet')
    const akzeptiert = offerten.filter((o) => o.status === 'akzeptiert')
    const rapporte = row.rapporte.filter((d): d is string => inRange(d, from, to))
    const reVersendet = row.rechnungen.filter((r) => inRange(r.gesendet_am, from, to))
    const reBezahlt = row.rechnungen.filter((r) => inRange(r.bezahlt_am, from, to))
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
      offertenVersendet: versendet.length,
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
        offertenVersendet: 0,
        offertenAkzeptiert: 0,
        offertenAkzeptiertChf: 0,
        projekteMitRapport: 0,
        rapporte: 0,
        rechnungenVersendet: 0,
        rechnungenChf: 0,
        rechnungenBezahlt: 0,
        bezahltChf: 0,
      }
      byLeiter.set(pl, agg)
    }
    agg.projekte += 1
    agg.offertenOffen += offen.length
    agg.offertenOffenChf += sum(offen.map((o) => o.betrag))
    agg.offertenVersendet += versendet.length
    agg.offertenAkzeptiert += akzeptiert.length
    agg.offertenAkzeptiertChf += sum(akzeptiert.map((o) => o.betrag))
    agg.projekteMitRapport += rapporte.length > 0 ? 1 : 0
    agg.rapporte += rapporte.length
    agg.rechnungenVersendet += reVersendet.length
    agg.rechnungenChf += sum(reVersendet.map((r) => r.betrag))
    agg.rechnungenBezahlt += reBezahlt.length
    agg.bezahltChf += sum(reBezahlt.map((r) => r.bezahlt_betrag))
  }

  return { perLeiter: Array.from(byLeiter.values()), perProjekt }
}

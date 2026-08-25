import { describe, expect, it } from 'vitest'
import { aggregatePipeline, leiterName, OHNE_PL } from './pipelineAggregation'
import type { PipelineFilter } from './pipelineAggregation'
import type { PipelineProjektRow } from './types'

const ALLE: PipelineFilter = { from: null, to: null, projektleiter: null, search: '' }

function row(overrides: Partial<PipelineProjektRow> = {}): PipelineProjektRow {
  return {
    project_id: 'p-1',
    projekt_nummer: '2600100',
    projekt_name: 'Projekt A',
    projekt_status: 'offen',
    is_closed: false,
    kunde_name: 'Kunde AG',
    customer_id: 'c-1',
    projektleiter_id: 's-1',
    projektleiter_name: 'Hans Muster',
    offerten: [],
    rapporte: [],
    rechnungen: [],
    ...overrides,
  }
}

const offerte = (status: string, betrag = 100, datum = '2026-05-01') => ({ status, betrag, datum })
const rechnung = (over: Partial<PipelineProjektRow['rechnungen'][number]> = {}) => ({
  status: 'gesendet',
  betrag: 500,
  gesendet_am: '2026-06-02',
  bezahlt_am: null,
  bezahlt_betrag: 0,
  ...over,
})

describe('leiterName', () => {
  it('fällt ohne Namen auf den Sammel-Eintrag zurück', () => {
    expect(leiterName(row({ projektleiter_name: null }))).toBe(OHNE_PL)
    expect(leiterName(row({ projektleiter_name: '  ' }))).toBe(OHNE_PL)
    expect(leiterName(row())).toBe('Hans Muster')
  })
})

describe('aggregatePipeline — Gruppierung', () => {
  it('gruppiert Projekte nach Projektleiter', () => {
    const rows = [
      row({ offerten: [offerte('gesendet')] }),
      row({ projekt_name: 'Projekt B', offerten: [offerte('entwurf')] }),
      row({ projekt_name: 'Projekt C', projektleiter_name: 'Vera Beispiel', offerten: [offerte('akzeptiert')] }),
    ]
    const { perLeiter } = aggregatePipeline(rows, ALLE)
    expect(perLeiter).toHaveLength(2)
    const hans = perLeiter.find((l) => l.projektleiter === 'Hans Muster')!
    expect(hans.projekte).toBe(2)
    expect(hans.offertenOffen).toBe(2)
    expect(hans.offertenVersendet).toBe(1)
  })

  it('zählt akzeptierte Offerten mit Betrag', () => {
    const rows = [row({ offerten: [offerte('akzeptiert', 1081), offerte('gesendet', 500)] })]
    const { perLeiter, perProjekt } = aggregatePipeline(rows, ALLE)
    expect(perLeiter[0].offertenAkzeptiert).toBe(1)
    expect(perLeiter[0].offertenAkzeptiertChf).toBe(1081)
    expect(perLeiter[0].offertenOffenChf).toBe(500)
    // Pro Projekt: Offertenbetrag = Summe der offenen Offerten (Entwurf + Gesendet)
    expect(perProjekt[0].offertenOffenChf).toBe(500)
  })

  it('zählt Projekte mit Rapport nur einmal, Rapporte aber alle', () => {
    const rows = [
      row({ rapporte: ['2026-05-03', '2026-05-04'] }),
      row({ projekt_name: 'Projekt B', offerten: [offerte('gesendet')] }),
    ]
    const { perLeiter } = aggregatePipeline(rows, ALLE)
    expect(perLeiter[0].projekteMitRapport).toBe(1)
    expect(perLeiter[0].rapporte).toBe(2)
  })

  it('summiert Rechnungen versendet/bezahlt über Projekte hinweg (Backend liefert max. 1 Rechnung pro Projekt)', () => {
    const rows = [
      row({ rechnungen: [rechnung()] }),
      row({
        projekt_name: 'Projekt B',
        rechnungen: [rechnung({ status: 'bezahlt', bezahlt_am: '2026-06-20', bezahlt_betrag: 480 })],
      }),
    ]
    const { perLeiter } = aggregatePipeline(rows, ALLE)
    expect(perLeiter[0].rechnungenVersendet).toBe(2)
    expect(perLeiter[0].rechnungenChf).toBe(1000)
    expect(perLeiter[0].rechnungenBezahlt).toBe(1)
    expect(perLeiter[0].bezahltChf).toBe(480)
  })

  it('ausstehende Rechnung (kein gesendet_am) zählt nicht als versendet', () => {
    const rows = [row({ rechnungen: [rechnung({ status: 'ausstehend', gesendet_am: null })] })]
    const { perLeiter } = aggregatePipeline(rows, ALLE)
    expect(perLeiter[0].rechnungenVersendet).toBe(0)
  })
})

describe('aggregatePipeline — Datumsfilter', () => {
  it('filtert jede Kennzahl auf ihr eigenes Ereignisdatum', () => {
    const rows = [row({
      offerten: [offerte('gesendet', 100, '2026-04-30'), offerte('gesendet', 200, '2026-05-10')],
      rapporte: ['2026-04-01', '2026-05-15'],
      rechnungen: [rechnung({ gesendet_am: '2026-05-20', bezahlt_am: '2026-06-05', bezahlt_betrag: 500, status: 'bezahlt' })],
    })]
    const mai = { ...ALLE, from: '2026-05-01', to: '2026-05-31' }
    const { perLeiter } = aggregatePipeline(rows, mai)
    expect(perLeiter[0].offertenOffen).toBe(1)
    expect(perLeiter[0].offertenOffenChf).toBe(200)
    expect(perLeiter[0].rapporte).toBe(1)
    expect(perLeiter[0].rechnungenVersendet).toBe(1)
    // Zahlung liegt im Juni -> zählt im Mai nicht
    expect(perLeiter[0].rechnungenBezahlt).toBe(0)
  })

  it('lässt GESCHLOSSENE Projekte ohne Ereignis im Zeitraum ganz weg', () => {
    const rows = [
      row({ projekt_name: 'Projekt A', is_closed: true, offerten: [offerte('gesendet', 100, '2026-01-01')] }),
      row({ projekt_name: 'Projekt B', is_closed: true, offerten: [offerte('gesendet', 100, '2026-05-05')] }),
    ]
    const mai = { ...ALLE, from: '2026-05-01', to: '2026-05-31' }
    const { perLeiter, perProjekt } = aggregatePipeline(rows, mai)
    expect(perProjekt).toHaveLength(1)
    expect(perProjekt[0].projektName).toBe('Projekt B')
    expect(perLeiter[0].projekte).toBe(1)
  })

  it('behält OFFENE Projekte auch ohne Ereignis im Zeitraum (Funnel-Start)', () => {
    // Offenes Projekt, dessen einzige Offerte ausserhalb des Fensters liegt:
    // bleibt sichtbar, aber mit Null-Zählern für den Zeitraum.
    const rows = [
      row({ projekt_name: 'Offen ohne 2026-Aktivität', is_closed: false, offerten: [offerte('gesendet', 100, '2025-11-01')] }),
    ]
    const mai = { ...ALLE, from: '2026-05-01', to: '2026-05-31' }
    const { perLeiter, perProjekt } = aggregatePipeline(rows, mai)
    expect(perProjekt).toHaveLength(1)
    expect(perProjekt[0].offertenOffen).toBe(0)
    expect(perLeiter[0].projekte).toBe(1)
    expect(perLeiter[0].offertenOffen).toBe(0)
  })

  it('ohne Datumsfilter bleiben auch Projekte ohne datierbare Ereignisse drin', () => {
    const rows = [row({ rechnungen: [rechnung({ status: 'ausstehend', gesendet_am: null })] })]
    const { perProjekt } = aggregatePipeline(rows, ALLE)
    expect(perProjekt).toHaveLength(1)
  })
})

describe('aggregatePipeline — Drill-down-Detail', () => {
  it('liefert die im Zeitraum liegenden Ereignisse plus Gesamtzahl fürs Projekt', () => {
    const rows = [row({
      offerten: [offerte('gesendet', 100, '2026-04-30'), offerte('akzeptiert', 200, '2026-05-10')],
      rapporte: ['2026-04-01', '2026-05-15', null],
      rechnungen: [rechnung({ gesendet_am: '2026-05-20', bezahlt_am: null })],
    })]
    const mai = { ...ALLE, from: '2026-05-01', to: '2026-05-31' }
    const { perProjekt } = aggregatePipeline(rows, mai)
    const p = perProjekt[0]
    // nur die Mai-Ereignisse im Detail
    expect(p.offertenDetail.map((o) => o.datum)).toEqual(['2026-05-10'])
    expect(p.rapporteDetail).toEqual(['2026-05-15'])
    expect(p.rechnungenDetail).toHaveLength(1)
    // Gesamtzahlen fürs "+N ausserhalb"-Label (null-Rapport zählt nicht mit)
    expect(p.offertenGesamt).toBe(2)
    expect(p.rapporteGesamt).toBe(2)
    expect(p.rechnungenGesamt).toBe(1)
    expect(p.projektStatus).toBe('offen')
    expect(p.isClosed).toBe(false)
  })

  it('ohne Datumsfilter enthält das Detail alle Ereignisse', () => {
    const rows = [row({ offerten: [offerte('gesendet'), offerte('akzeptiert')] })]
    const { perProjekt } = aggregatePipeline(rows, ALLE)
    expect(perProjekt[0].offertenDetail).toHaveLength(2)
    expect(perProjekt[0].offertenGesamt).toBe(2)
  })
})

describe('aggregatePipeline — Projektleiter-/Suchfilter', () => {
  const rows = [
    row({ offerten: [offerte('gesendet')] }),
    row({
      projekt_name: 'Storenmontage Müller',
      projekt_nummer: '2600200',
      kunde_name: 'Müller GmbH',
      projektleiter_name: null,
      offerten: [offerte('akzeptiert')],
    }),
  ]

  it('filtert auf ausgewählte Projektleiter inkl. Ohne-PL-Sammel', () => {
    const { perLeiter } = aggregatePipeline(rows, { ...ALLE, projektleiter: new Set([OHNE_PL]) })
    expect(perLeiter).toHaveLength(1)
    expect(perLeiter[0].projektleiter).toBe(OHNE_PL)
  })

  it('sucht in Projektname, Nummer und Kunde', () => {
    expect(aggregatePipeline(rows, { ...ALLE, search: 'müller gmbh' }).perProjekt).toHaveLength(1)
    expect(aggregatePipeline(rows, { ...ALLE, search: '2600200' }).perProjekt).toHaveLength(1)
    expect(aggregatePipeline(rows, { ...ALLE, search: 'projekt a' }).perProjekt).toHaveLength(1)
    expect(aggregatePipeline(rows, { ...ALLE, search: 'xyz' }).perProjekt).toHaveLength(0)
  })
})

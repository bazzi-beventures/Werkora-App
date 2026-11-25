// Plantafel der Ferienplanung (docs/specs/ferienplanung.md §7.1): Personen als
// Zeilen, Tage als Spalten — wie die Plantafel der Einsatzplanung, nur über Monate.
// Ferien grün (WW-59), beantragt gestrichelt, Sperrfristen als Band unten in der
// Zelle (rot hart, orange weich), Betriebsferien schraffiert, Feiertage grau.
// Kopfzeile: Abwesende je Tag, rot wo ein offener Antrag einen Befund hat.
// Rechts: zwei Wochen am Stück (OR 329c) im Jahr des Zeitraums.
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPlaner, type Befund, type FerienPlaner, type PlanerAbsenz } from '../../api/admin/ferienplanung'
import { queryClient } from '../../shared/queryClient'
import './ferienplanung.css'

export type Zoom = 'monat' | 'quartal' | 'jahr'

const ZELLE: Record<Zoom, string> = { monat: '28px', quartal: '12px', jahr: '5px' }

export const PLANER_KEY = ['ferienplanung', 'planer'] as const

const ZWEI_WOCHEN: Record<string, { zeichen: string; text: string }> = {
  bezogen: { zeichen: '✓', text: 'Zwei Wochen am Stück bezogen' },
  geplant: { zeichen: '◐', text: 'Zwei Wochen am Stück geplant' },
  fehlt: { zeichen: '✗', text: 'Noch keine zwei Wochen am Stück (OR 329c Abs. 1)' },
}

export function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Erster und letzter Tag des Zeitraums ab dem Monat von `anker`. */
export function zeitraum(anker: Date, zoom: Zoom): { von: string; bis: string } {
  const monate = zoom === 'monat' ? 1 : zoom === 'quartal' ? 3 : 12
  const start = new Date(anker.getFullYear(), anker.getMonth(), 1)
  const ende = new Date(anker.getFullYear(), anker.getMonth() + monate, 0)
  return { von: iso(start), bis: iso(ende) }
}

function tageZwischen(von: string, bis: string): string[] {
  const tage: string[] = []
  const [j, m, t] = von.split('-').map(Number)
  for (let d = new Date(j, m - 1, t); iso(d) <= bis; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    tage.push(iso(d))
  }
  return tage
}

function absenzAm(absenzen: PlanerAbsenz[], tag: string): PlanerAbsenz | undefined {
  const treffer = absenzen.filter(a => a.date_start <= tag && tag <= a.date_end)
  return treffer.find(a => a.status === 'requested') ?? treffer[0]
}

export function Plantafel({ von, bis, zoom, gruppe, onAntrag }: {
  von: string
  bis: string
  zoom: Zoom
  /** Nur Personen dieser Ferien-Gruppe (null = alle). */
  gruppe: string | null
  onAntrag: (absenz: PlanerAbsenz, befunde: Befund[]) => void
}) {
  const { data, isLoading, isError } = useQuery<FerienPlaner>({
    queryKey: [...PLANER_KEY, von, bis],
    queryFn: () => getPlaner(von, bis),
  }, queryClient)

  if (isLoading) return <div className="admin-loading"><div className="admin-spinner" /> Plantafel wird geladen…</div>
  if (isError || !data) return <div className="admin-form-error" role="alert">Plantafel konnte nicht geladen werden.</div>

  const tage = tageZwischen(von, bis)
  const jahr = von.slice(0, 4)
  const personen = data.personen.filter(p => !gruppe || (p.gruppen ?? []).includes(gruppe))
  const feiertage = new Map(Object.entries(data.feiertage).map(([k, liste]) => [k, new Map(liste.map(([d, n]) => [d, n]))]))
  const befundTage = new Set(Object.values(data.befunde).flatMap(bs => bs.flatMap(b => b.tage)))
  const abwesend = new Map(tage.map(t => [t, data.absenzen.filter(a => a.date_start <= t && t <= a.date_end).length]))
  const stil: CSSProperties = { gridTemplateColumns: `170px repeat(${tage.length}, ${ZELLE[zoom]}) 80px` }
  const zeigeZahl = zoom === 'monat'

  return (
    <>
      <div className="ferien-tafel-wrap">
        <div className="ferien-tafel" style={stil} role="grid" aria-label="Plantafel Ferien">
          <div className="ferien-kopf ferien-name">Person</div>
          {tage.map(t => {
            const tag = Number(t.slice(8))
            const verletzt = befundTage.has(t)
            const titel = `${t.slice(8)}.${t.slice(5, 7)}.: ${abwesend.get(t) ?? 0} abwesend${verletzt ? ' — Regel verletzt' : ''}`
            return (
              <div key={t} title={titel} className={`ferien-kopf${verletzt ? ' verletzt' : ''}`}>
                {zeigeZahl ? tag : tag === 1 ? t.slice(5, 7) : ''}
              </div>
            )
          })}
          <div className="ferien-kopf" title="Zwei Wochen am Stück (OR 329c Abs. 1)">2 Wo.</div>

          {personen.map(p => {
            const eigene = data.absenzen.filter(a => a.staff_id === p.id)
            const fei = feiertage.get(p.kanton ?? '') ?? new Map<string, string>()
            const sperren = data.sperrfristen.filter(s => s.gruppe_ids.length === 0
              || s.gruppe_ids.some(g => (p.gruppen ?? []).includes(g)))
            const zw = ZWEI_WOCHEN[data.zwei_wochen[p.id]?.[jahr] ?? 'fehlt']
            return [
              <div key={`${p.id}-n`} className="ferien-name" title={p.name}>
                {p.name}{p.funktion && <small>{p.funktion}</small>}
              </div>,
              ...tage.map(t => {
                const wt = new Date(`${t}T12:00:00`).getDay()
                const feiertag = fei.get(t)
                const sperre = sperren.filter(s => s.von <= t && t <= s.bis)
                const klassen = ['ferien-zelle']
                if (wt === 0 || wt === 6) klassen.push('wochenende')
                if (feiertag) klassen.push('feiertag')
                if (sperre.some(s => s.art === 'betriebsferien')) klassen.push('betriebsferien')
                const sp = sperre.filter(s => s.art === 'sperre')
                if (sp.some(s => s.haerte === 'hart')) klassen.push('sperre-hart')
                else if (sp.length) klassen.push('sperre-weich')
                const a = absenzAm(eigene, t)
                const befunde = a ? data.befunde[a.id] ?? [] : []
                const titel = [feiertag, ...sperre.map(s => s.titel)].filter(Boolean).join(' · ')
                return (
                  <div key={`${p.id}-${t}`} className={klassen.join(' ')} title={titel || undefined}>
                    {a && (
                      <button type="button"
                        className={`ferien-absenz${a.status === 'requested' ? ' beantragt' : ''}${a.type !== 'vacation' ? ' anders' : ''}${befunde.length ? ' befund' : ''}`}
                        aria-label={`${p.name}: ${a.type === 'vacation' ? 'Ferien' : 'abwesend'} ${a.status === 'requested' ? 'beantragt' : 'genehmigt'}`}
                        onClick={() => onAntrag(a, befunde)} />
                    )}
                  </div>
                )
              }),
              <div key={`${p.id}-s`} className="ferien-status" title={zw.text}>{zw.zeichen}</div>,
            ]
          })}
        </div>
      </div>
      {personen.length === 0 && <div className="admin-empty">Keine Personen in dieser Auswahl.</div>}
      <div className="ferien-legende">
        <span><span className="ferien-legende-punkt" style={{ background: 'var(--success)' }} />Ferien</span>
        <span><span className="ferien-legende-punkt ferien-absenz beantragt" style={{ position: 'static' }} />beantragt</span>
        <span><span className="ferien-legende-punkt" style={{ background: 'var(--muted)' }} />andere Absenz</span>
        <span><span className="ferien-legende-punkt" style={{ background: 'var(--danger)' }} />Sperrfrist hart</span>
        <span><span className="ferien-legende-punkt" style={{ background: 'var(--warning)' }} />Sperrfrist weich</span>
        <span><span className="ferien-legende-punkt betriebsferien" />Betriebsferien</span>
        <span>✓ ◐ ✗ zwei Wochen am Stück</span>
      </div>
    </>
  )
}

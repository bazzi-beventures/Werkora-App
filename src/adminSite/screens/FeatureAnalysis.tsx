/**
 * Reiter «Auswertung» der Feature-Anfragen (Spec docs/specs/feature-anfragen.md §8).
 *
 * Der Server liefert fertige Serien (`aggregate_dashboard`) — hier wird nichts
 * nachgerechnet, nur umsortiert («absolut» / «je aktivem Konto») und gezeigt.
 * Zeitraum frei (Default 90 Tage, höchstens 24 Monate), Eimer Woche/Monat/Quartal.
 *
 * Die Kacheln sind zugleich Einstiege: «Neu im Eingang» öffnet den Eingang,
 * ein Mandant in der Rangliste setzt dort den Mandanten-Filter.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  downloadFeatureRequestsCsv,
  fetchFeatureDashboard,
  fmtDay,
  todayIso,
  type FeatureDashboard,
  type Granularity,
} from '../../api/featureRequests'
import HorizontalBarChart from '../../admin/components/HorizontalBarChart'
import { useChartTheme } from '../../admin/components/useChartTheme'
import { copyToClipboard } from '../clipboard'
import '../../admin/kpis/kpi-dashboard.css'

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: 'woche', label: 'Woche' },
  { key: 'monat', label: 'Monat' },
  { key: 'quartal', label: 'Quartal' },
]

function daysBefore(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return todayIso(new Date(y, m - 1, d - days))
}

function trend(now: number, before: number): string {
  if (now > before) return `↑ Vorwoche ${before}`
  if (now < before) return `↓ Vorwoche ${before}`
  return `= Vorwoche ${before}`
}

function PeriodChart({ data }: { data: FeatureDashboard['by_period'] }) {
  const t = useChartTheme()
  return (
    <div className="kpi-bi-chart-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: t.tickMuted, fontSize: 11 }}
                 axisLine={{ stroke: t.axis }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: t.tickMuted, fontSize: 11 }}
                 axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={{
            background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`,
            borderRadius: 'var(--radius-sm)', color: t.tooltipText, fontSize: 12,
          }} />
          <Legend wrapperStyle={{ fontSize: 11, color: t.tickMuted }} />
          <Bar dataKey="anfrage" name="Anfragen" stackId="s" fill={t.series[0]} />
          <Bar dataKey="unterstuetzung" name="Unterstützungen" stackId="s" fill={t.series[2]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function FeatureAnalysis({ onShowNew, onPickTenant, onOpenFeature, notify }: {
  onShowNew: () => void
  onPickTenant: (tenantId: string) => void
  onOpenFeature: (featureId: string) => void
  notify: (text: string, kind: 'success' | 'error') => void
}) {
  const chartTheme = useChartTheme()
  const [bis, setBis] = useState(() => todayIso())
  const [von, setVon] = useState(() => daysBefore(todayIso(), 89))
  const [gran, setGran] = useState<Granularity>('woche')
  const [perAccount, setPerAccount] = useState(false)
  const [data, setData] = useState<FeatureDashboard | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      setData(await fetchFeatureDashboard({ von, bis, granularitaet: gran }))
    } catch {
      setError(true)
    }
  }, [von, bis, gran])

  useEffect(() => { load() }, [load])

  const tenants = useMemo(() => {
    const rows = [...(data?.by_tenant ?? [])]
    if (perAccount) {
      rows.sort((a, b) => (b.per_account ?? -1) - (a.per_account ?? -1) || b.count - a.count)
    }
    return rows
  }, [data, perAccount])
  const maxValue = Math.max(1, ...tenants.map(t => (perAccount ? t.per_account ?? 0 : t.count)))

  async function exportCsv() {
    try {
      await downloadFeatureRequestsCsv({ von, bis })
    } catch {
      notify('Export fehlgeschlagen', 'error')
    }
  }

  async function copyMatrix() {
    if (!data) return
    notify(await copyToClipboard(data.matrix_text)
      ? 'Tabelle kopiert — in Excel einfügen' : 'Kopieren nicht möglich', 'success')
  }

  const k = data?.kacheln

  return (
    <div className="fr-analysis">
      <div className="support-filterbar fr-analysis-controls">
        <label className="fr-date">
          <span>Von</span>
          <input type="date" className="admin-input" value={von} max={bis}
                 onChange={e => e.target.value && setVon(e.target.value)} />
        </label>
        <label className="fr-date">
          <span>Bis</span>
          <input type="date" className="admin-input" value={bis} max={todayIso()}
                 onChange={e => e.target.value && setBis(e.target.value)} />
        </label>
        {GRANULARITIES.map(g => (
          <button key={g.key} className={`elog-chip${gran === g.key ? ' active' : ''}`}
                  aria-pressed={gran === g.key} onClick={() => setGran(g.key)}>
            {g.label}
          </button>
        ))}
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={exportCsv}>
          CSV exportieren
        </button>
      </div>

      {error && <div className="support-empty">Auswertung konnte nicht geladen werden.</div>}
      {!data && !error && <div className="admin-spinner" />}

      {data && k && (
        <>
          {data.window.geklemmt && (
            <div className="fr-muted">
              Auf 24 Monate begrenzt: {fmtDay(data.window.von)} – {fmtDay(data.window.bis)}.
            </div>
          )}

          <div className="kpi-bi-cards">
            <button type="button" className="kpi-bi-card fr-tile-button" onClick={onShowNew}
                    title="Eingang öffnen">
              <div className="kpi-bi-card-label">Neu im Eingang</div>
              <div className="kpi-bi-card-value">{k.neu}</div>
              <div className="kpi-bi-card-sub">zur Triage →</div>
            </button>
            <div className="kpi-bi-card">
              <div className="kpi-bi-card-label">Anfragen diese Woche</div>
              <div className="kpi-bi-card-value">{k.diese_woche}</div>
              <div className="kpi-bi-card-sub">{trend(k.diese_woche, k.vorwoche)}</div>
            </div>
            <div className="kpi-bi-card">
              <div className="kpi-bi-card-label">In Umsetzung / Im Test</div>
              <div className="kpi-bi-card-value">{k.in_umsetzung} / {k.im_test}</div>
              <div className="kpi-bi-card-sub">Features</div>
            </div>
            <div className="kpi-bi-card">
              <div className="kpi-bi-card-label">Median bis zur Triage</div>
              <div className="kpi-bi-card-value">
                {k.median_triage_tage === null ? '—' : `${k.median_triage_tage} Tage`}
              </div>
              <div className="kpi-bi-card-sub">letzte 90 Tage · {k.median_triage_n} aus der App</div>
            </div>
            <div className="kpi-bi-card">
              <div className="kpi-bi-card-label">Fehlkanal-Quote</div>
              <div className="kpi-bi-card-value">
                {k.fehlkanal_quote === null ? '—' : `${Math.round(k.fehlkanal_quote * 100)} %`}
              </div>
              <div className="kpi-bi-card-sub">
                {k.fehlkanal_n} von {k.fehlkanal_basis} · Support statt Wunsch oder umgekehrt
              </div>
            </div>
          </div>

          {data.total === 0 ? (
            <div className="support-empty">Keine Anfragen in diesem Zeitraum.</div>
          ) : (
            <>
              <section className="fr-analysis-block">
                <div className="fr-section-title">Anfragen je {GRANULARITIES.find(g => g.key === gran)?.label}</div>
                <PeriodChart data={data.by_period} />
              </section>

              <section className="fr-analysis-block">
                <div className="fr-section-title">
                  Anfragen je Mandant
                  <span className="fr-actions fr-actions-inline">
                    <button className={`elog-chip${!perAccount ? ' active' : ''}`} aria-pressed={!perAccount}
                            onClick={() => setPerAccount(false)}>absolut</button>
                    <button className={`elog-chip${perAccount ? ' active' : ''}`} aria-pressed={perAccount}
                            onClick={() => setPerAccount(true)}>je aktivem Konto</button>
                  </span>
                </div>
                <ul className="fr-rank" aria-label="Anfragen je Mandant">
                  {tenants.map(t => {
                    const value = perAccount ? t.per_account : t.count
                    return (
                      <li key={t.tenant_id}>
                        <button type="button" className="fr-rank-row" onClick={() => onPickTenant(t.tenant_id)}
                                title="Im Eingang filtern">
                          <span className="fr-rank-name">{t.name}</span>
                          <span className="fr-rank-bar" aria-hidden="true">
                            <span style={{ width: `${Math.round(((value ?? 0) / maxValue) * 100)}%` }} />
                          </span>
                          <span className="fr-rank-value">
                            {perAccount
                              ? (t.per_account === null ? 'keine Konten' : `${t.per_account.toFixed(2)} (${t.count}/${t.accounts})`)
                              : t.count}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>

              <section className="fr-analysis-block">
                <div className="fr-section-title">
                  Mandant × Zeitraum
                  <span className="fr-actions fr-actions-inline">
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={copyMatrix}>
                      Kopieren
                    </button>
                  </span>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table fr-matrix">
                    <thead>
                      <tr>
                        <th>Betrieb</th>
                        {data.periods.map(p => <th key={p.key}>{p.label}</th>)}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.matrix.map(r => (
                        <tr key={r.tenant_id}>
                          <td>{r.name}</td>
                          {r.cells.map((c, i) => <td key={data.periods[i].key} className={c ? '' : 'fr-muted'}>{c}</td>)}
                          <td><b>{r.total}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="fr-analysis-block">
                <div className="fr-section-title">Nach Bereich</div>
                <HorizontalBarChart data={data.by_area.map(a => ({ key: a.label, count: a.count }))}
                                    yKey="key" dataKey="count" color={chartTheme.series[1]} />
              </section>

              {data.top_features.length > 0 && (
                <section className="fr-analysis-block">
                  <div className="fr-section-title">Top-10 Features nach Nachfrage</div>
                  <div className="admin-table-wrap">
                    <table className="admin-table fr-table">
                      <thead>
                        <tr><th>Nr.</th><th>Titel</th><th>Phase</th><th>Betriebe</th><th>Anfragen</th></tr>
                      </thead>
                      <tbody>
                        {data.top_features.map(f => (
                          <tr key={f.id} className="fr-row" onClick={() => onOpenFeature(f.id)} title="Feature öffnen">
                            <td>{f.reference}</td>
                            <td>{f.title}{f.visibility === 'intern' && <span className="fr-muted"> · intern</span>}</td>
                            <td><span className={`fr-phase fr-phase-${f.phase}`}>{f.phase_label}</span></td>
                            <td>{f.tenants}</td>
                            <td>{f.requests}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          <section className="fr-analysis-block">
            <div className="fr-section-title">Durchlauf bis «Verfügbar»</div>
            {data.durchlauf_features === 0 ? (
              <div className="fr-muted">Noch kein Feature ausgeliefert — hier steht dann der Median je Phase.</div>
            ) : (
              <table className="admin-table fr-table">
                <thead><tr><th>Phase</th><th>Median</th><th>Features</th></tr></thead>
                <tbody>
                  {data.durchlauf.map(d => (
                    <tr key={d.phase}>
                      <td>{d.phase === 'gesamt' ? <b>{d.label}</b> : d.label}</td>
                      <td>{d.median_tage === null ? '—' : `${d.median_tage} Tage`}</td>
                      <td>{d.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="fr-muted">Alle bisher ausgelieferten Features, unabhängig vom Zeitraum.</div>
          </section>
        </>
      )}
    </div>
  )
}

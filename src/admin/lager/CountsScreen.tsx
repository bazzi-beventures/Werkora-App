// Inventur-Reiter (Lager v2, Phase 3).
//
// Liste der Zählungen und der Einstieg in eine neue. Zählen dürfen Admin und
// Geschäftsleitung — die Inventur ist eine Buchhaltungshandlung mit
// CHF-Wirkung und gehört zu den Rollen, die auch Rechnungen verantworten.

import { useCallback, useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { createStockCount, getStockOverview, listStockCounts } from '../../api/admin/inventory'
import type { CountKind, StockCount, StockOverviewRow } from '../../api/admin/inventory'
import CountCoverageTabelle from './CountCoverage'
import CountDetail from './CountDetail'
import CountPlans from './CountPlans'

function datum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-CH')
}

function chf(v: number | null): string {
  return v == null ? '—' : `CHF ${v.toFixed(2)}`
}

const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen',
  abgeschlossen: 'Abgeschlossen',
  abgebrochen: 'Abgebrochen',
}

const ART_LABEL: Record<CountKind, string> = {
  voll: 'Vollzählung',
  stich: 'Stichzählung',
  rollierend: 'Rollierend',
}

function fortschrittText(c: StockCount): string {
  if (c.status !== 'offen' || !c.progress) return '—'
  return `${c.progress.gezaehlt} von ${c.progress.gesamt}`
}

/** Fällig wann — und rot, sobald die Frist durch ist. */
function Faelligkeit({ count }: { count: StockCount }) {
  if (!count.due_on || count.status !== 'offen') return <span style={{ color: 'var(--muted)' }}>—</span>
  const ueberfaellig = String(count.due_on).slice(0, 10) < new Date().toISOString().slice(0, 10)
  return (
    <span style={{ color: ueberfaellig ? 'var(--danger)' : 'var(--muted)' }}>
      {datum(count.due_on)}{ueberfaellig ? ' · überfällig' : ''}
    </span>
  )
}

function NeueZaehlung({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<CountKind>('voll')
  const [titel, setTitel] = useState('')
  const [kategorie, setKategorie] = useState('')
  const [artikel, setArtikel] = useState<StockOverviewRow[]>([])
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set())
  const [suche, setSuche] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getStockOverview().then(r => setArtikel(r.rows)).catch(() => setArtikel([]))
  }, [])

  const kategorien = Array.from(new Set(artikel.map(a => a.kategorie).filter(Boolean) as string[])).sort()
  const treffer = suche.trim()
    ? artikel.filter(a => {
        const n = suche.trim().toLowerCase()
        return a.name.toLowerCase().includes(n) || a.art_nr.toLowerCase().includes(n)
      }).slice(0, 10)
    : []

  async function anlegen() {
    setBusy(true)
    setError('')
    try {
      const res = await createStockCount({
        kind,
        title: titel.trim() || null,
        category: kind === 'voll' ? (kategorie || null) : null,
        material_ids: kind === 'stich' ? Array.from(gewaehlt) : undefined,
      })
      onCreated(res.count.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const bereit = kind === 'voll' || gewaehlt.size > 0

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Neue Inventur</div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="inv-art">Art</label>
            <select
              id="inv-art" className="admin-form-input" value={kind}
              onChange={e => setKind(e.target.value as CountKind)}
            >
              <option value="voll">Vollzählung — alle Artikel (z.B. Jahresinventur)</option>
              <option value="stich">Stichzählung — einzelne Artikel</option>
            </select>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="inv-titel">Bezeichnung</label>
            <input
              id="inv-titel" className="admin-form-input" value={titel}
              onChange={e => setTitel(e.target.value)}
              placeholder={kind === 'voll' ? 'z.B. Jahresinventur 2026' : 'z.B. Nachzählung Storen'}
            />
            <div className="admin-form-hint">Leer = Datum des heutigen Tages.</div>
          </div>

          {kind === 'voll' ? (
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="inv-kat">Nur eine Kategorie (optional)</label>
              <select
                id="inv-kat" className="admin-form-input" value={kategorie}
                onChange={e => setKategorie(e.target.value)}
              >
                <option value="">Alle Kategorien</option>
                {kategorien.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          ) : (
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="inv-suche">Artikel wählen</label>
              <input
                id="inv-suche" className="admin-form-input" value={suche}
                onChange={e => setSuche(e.target.value)}
                placeholder="Bezeichnung oder Art.-Nr. tippen…"
              />
              {treffer.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4 }}>
                  {treffer.map(a => (
                    <button
                      key={a.material_id} type="button"
                      onClick={() => {
                        setGewaehlt(g => new Set([...g, a.material_id]))
                        setSuche('')
                      }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)',
                      }}
                    >
                      {a.name} <span style={{ color: 'var(--muted)' }}>· {a.art_nr}</span>
                    </button>
                  ))}
                </div>
              )}
              {gewaehlt.size > 0 && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {Array.from(gewaehlt).map(id => {
                    const a = artikel.find(x => x.material_id === id)
                    return (
                      <div key={id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{a?.name ?? id}</span>
                        <button
                          type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => setGewaehlt(g => {
                            const n = new Set(g)
                            n.delete(id)
                            return n
                          })}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={anlegen} disabled={busy || !bereit}>
            {busy ? 'Wird angelegt…' : 'Zählung starten'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CountsScreen({ openCountId, onConsumed }: {
  /** Direktsprung vom Dashboard oder aus einer Push in genau diese Zählung. */
  openCountId?: string
  onConsumed?: () => void
} = {}) {
  const [counts, setCounts] = useState<StockCount[]>([])
  const [offenId, setOffenId] = useState<string | null>(openCountId ?? null)
  const [neuOffen, setNeuOffen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Der Zählstand liest dieselben Artikel wie die Zählungen. Entsteht eine
  // Zählung oder ändert sich ein Plan, stimmt er sonst still nicht mehr.
  const [standTick, setStandTick] = useState(0)
  const [planFuerKategorie, setPlanFuerKategorie] = useState<string | null>(null)

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listStockCounts()
      setCounts(res.rows)
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  // Der Sprung ist ein Startereignis, kein Zustand: einmal ausgeführt, danach
  // gehört die Navigation wieder dem Nutzer — sonst spränge jedes «Zurück»
  // sofort wieder in dieselbe Zählung.
  useEffect(() => {
    if (openCountId) {
      setOffenId(openCountId)
      onConsumed?.()
    }
  }, [openCountId, onConsumed])

  if (offenId) {
    return (
      <CountDetail
        countId={offenId}
        onBack={() => { setOffenId(null); void laden(); setStandTick(t => t + 1) }}
      />
    )
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Inventur</div>
          <div className="admin-page-subtitle">{counts.length} Zählungen</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setNeuOffen(true)}>
          Neue Inventur
        </button>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      <CountPlans
        onOeffnen={id => { setOffenId(id); void laden() }}
        neuFuerKategorie={planFuerKategorie}
        onNeuVerbraucht={() => setPlanFuerKategorie(null)}
        onGeaendert={() => setStandTick(t => t + 1)}
      />

      <CountCoverageTabelle
        reloadTick={standTick}
        onOeffnen={id => { setOffenId(id); void laden() }}
        onPlanAnlegen={setPlanFuerKategorie}
      />

      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      ) : counts.length === 0 ? (
        <div className="admin-table-empty">
          Noch keine Zählung. Eine Vollzählung erfasst alle Artikel, eine Stichzählung
          nur die, die Sie auswählen.
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Bezeichnung</th>
              <th>Art</th>
              <th>Status</th>
              <th>Fortschritt</th>
              <th>Zähler</th>
              <th>Fällig</th>
              <th>Begonnen</th>
              <th style={{ textAlign: 'right' }}>Differenz (EK)</th>
            </tr>
          </thead>
          <tbody>
            {counts.map(c => (
              <tr key={c.id} onClick={() => setOffenId(c.id)} style={{ cursor: 'pointer' }}>
                <td><strong>{c.title}</strong></td>
                <td style={{ color: 'var(--muted)' }}>{ART_LABEL[c.kind] ?? c.kind}</td>
                <td>{STATUS_LABEL[c.status] ?? c.status}</td>
                <td style={{ color: 'var(--muted)' }}>{fortschrittText(c)}</td>
                <td style={{ color: 'var(--muted)' }}>{c.assigned_name ?? '—'}</td>
                <td><Faelligkeit count={c} /></td>
                <td style={{ color: 'var(--muted)' }}>{datum(c.started_at)} · {c.started_by}</td>
                <td style={{
                  textAlign: 'right',
                  color: (c.diff_value_ek ?? 0) < 0 ? 'var(--danger)' : undefined,
                }}>
                  {chf(c.diff_value_ek)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {neuOffen && (
        <NeueZaehlung
          onClose={() => setNeuOffen(false)}
          onCreated={id => { setNeuOffen(false); setOffenId(id) }}
        />
      )}
    </div>
  )
}

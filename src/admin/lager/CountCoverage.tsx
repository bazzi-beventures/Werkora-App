// Zählstand nach Kategorie (docs/specs/rollierende-inventur.md §9 Punkt 2).
//
// Die Tabelle beantwortet zwei Fragen an einer Stelle: die des Treuhänders
// («wurde im Geschäftsjahr alles gezählt?») und die des Lageristen («wo ist der
// Rückstand?»). Deshalb je Kategorie und nicht nur als eine Zahl — ein Betrieb
// mit 94 % Abdeckung kann trotzdem seine teuerste Kategorie seit zwei Jahren
// nicht angesehen haben.
//
// Und deshalb steht neben jeder Zeile eine Handlung. Eine Kennzahl, aus der
// nichts folgt, wird beim dritten Mal nicht mehr gelesen: «Kategorie zählen»
// legt eine Stichzählung über die ungezählten Artikel an, «Plan anlegen» gibt
// der Kategorie einen eigenen Rhythmus.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createStockCount, getCountCoverage } from '../../api/admin/inventory'
import type { CountCoverage, CoverageArticle, CoverageRow } from '../../api/admin/inventory'

/** Farbstufen wie in §9: rot unter 50 %, orange unter 90 %, grün ab 90 %. */
export function abdeckungFarbe(pct: number | null): string {
  if (pct == null) return 'var(--muted)'
  if (pct < 50) return 'var(--danger)'
  if (pct < 90) return 'var(--warning, #b45309)'
  return 'var(--success, #16a34a)'
}

function datum(iso: string | null | undefined): string {
  if (!iso) return 'nie'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('de-CH')
}

function chf(v: number | null | undefined): string {
  return v == null ? '—' : `CHF ${v.toFixed(2)}`
}

function Abdeckung({ pct }: { pct: number | null }) {
  return (
    <strong style={{ color: abdeckungFarbe(pct) }}>
      {pct == null ? '—' : `${pct.toFixed(0)} %`}
    </strong>
  )
}

function ArtikelZeilen({ artikel }: { artikel: CoverageArticle[] }) {
  if (artikel.length === 0) {
    return (
      <div style={{ padding: 10, color: 'var(--muted)', fontSize: 13 }}>
        Kein Artikel in dieser Kategorie.
      </div>
    )
  }
  return (
    <table className="admin-table" style={{ margin: 0 }}>
      <thead>
        <tr>
          <th>Artikel</th>
          <th style={{ textAlign: 'right' }}>Bestand</th>
          <th style={{ textAlign: 'right' }}>Lagerwert</th>
          <th>Zuletzt gezählt</th>
        </tr>
      </thead>
      <tbody>
        {artikel.map(a => (
          <tr key={a.material_id}>
            <td>
              {a.name}
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                {a.art_nr}
                {a.in_offener_zaehlung && ' · in offener Zählung'}
              </div>
            </td>
            <td style={{ textAlign: 'right' }}>{a.quantity} {a.unit || ''}</td>
            <td style={{ textAlign: 'right' }}>{chf(a.lagerwert)}</td>
            <td style={{ color: a.last_counted_at ? undefined : 'var(--danger)' }}>
              {datum(a.last_counted_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface Props {
  /** Führt in eine gerade angelegte Stichzählung. */
  onOeffnen: (countId: string) => void
  /** Öffnet die Plan-Maske für diese Kategorie. */
  onPlanAnlegen: (kategorie: string) => void
  /** Wächst, wenn anderswo eine Zählung entstand oder ein Plan sich änderte. */
  reloadTick?: number
}

export default function CountCoverageTabelle({ onOeffnen, onPlanAnlegen, reloadTick }: Props) {
  const [daten, setDaten] = useState<CountCoverage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offen, setOffen] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [busy, setBusy] = useState('')

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      setDaten(await getCountCoverage())
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Zählstand konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden, reloadTick])

  const treffer = useMemo(() => {
    const n = suche.trim().toLowerCase()
    if (!n || !daten) return []
    return daten.artikel.filter(a =>
      a.name.toLowerCase().includes(n) || a.art_nr.toLowerCase().includes(n),
    ).slice(0, 25)
  }, [suche, daten])

  async function kategorieZaehlen(zeile: CoverageRow) {
    if (!daten) return
    // Nur die ungezählten und nicht schon gesperrten Artikel: Eine Stichzählung
    // über die ganze Kategorie zählte noch einmal, was letzte Woche dran war.
    const ids = daten.artikel
      .filter(a => (a.kategorie ?? 'Ohne Kategorie') === zeile.kategorie)
      .filter(a => !a.in_offener_zaehlung)
      .filter(a => !a.last_counted_at || alterAusserhalb(a.last_counted_at, daten.fenster_tage))
      .map(a => a.material_id)
    if (ids.length === 0) {
      setError(`In «${zeile.kategorie}» ist nichts offen — alles gezählt oder schon in einer Zählung.`)
      return
    }
    setBusy(zeile.kategorie)
    setError('')
    try {
      const res = await createStockCount({
        kind: 'stich',
        title: `Nachzählung ${zeile.kategorie}`,
        material_ids: ids,
      })
      onOeffnen(res.count.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Zählung konnte nicht angelegt werden')
    } finally {
      setBusy('')
    }
  }

  if (loading && !daten) {
    return <div className="admin-loading"><div className="admin-spinner" /> Zählstand…</div>
  }
  if (!daten) return <div className="admin-form-error">{error || 'Kein Zählstand.'}</div>

  const g = daten.gesamt

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 12, marginBottom: 8, flexWrap: 'wrap',
      }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          Zählstand{' '}
          <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>
            letzte {Math.round(daten.fenster_tage / 30)} Monate
          </span>
        </h3>
        <div style={{ fontSize: 13 }}>
          Gesamt <Abdeckung pct={g.abdeckung_pct} /> · {g.nie_gezaehlt} nie gezählt ·
          {' '}{chf(g.lagerwert_ungezaehlt)} ungezählter Lagerwert
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      <input
        className="admin-form-input"
        style={{ marginBottom: 8 }}
        value={suche}
        onChange={e => setSuche(e.target.value)}
        placeholder="Artikel suchen (Bezeichnung oder Art.-Nr.)…"
      />
      {suche.trim() && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
          <ArtikelZeilen artikel={treffer} />
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Kategorie</th>
            <th style={{ textAlign: 'right' }}>Abdeckung</th>
            <th style={{ textAlign: 'right' }}>Artikel</th>
            <th style={{ textAlign: 'right' }}>nie</th>
            <th style={{ textAlign: 'right' }}>älter</th>
            <th style={{ textAlign: 'right' }}>in Zählung</th>
            <th>ältester Stand</th>
            <th style={{ textAlign: 'right' }}>ungezählt (EK)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {daten.kategorien.map(k => {
            const auf = offen === k.kategorie
            return [
              <tr
                key={k.kategorie}
                onClick={() => setOffen(auf ? null : k.kategorie)}
                style={{ cursor: 'pointer' }}
              >
                <td><strong>{auf ? '▾' : '▸'} {k.kategorie}</strong></td>
                <td style={{ textAlign: 'right' }}><Abdeckung pct={k.abdeckung_pct} /></td>
                <td style={{ textAlign: 'right' }}>{k.artikel}</td>
                <td style={{ textAlign: 'right', color: k.nie_gezaehlt ? 'var(--danger)' : undefined }}>
                  {k.nie_gezaehlt}
                </td>
                <td style={{ textAlign: 'right' }}>{k.aelter_als_fenster}</td>
                <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{k.in_offener_zaehlung}</td>
                <td style={{ color: 'var(--muted)' }}>{datum(k.aeltester)}</td>
                <td style={{ textAlign: 'right' }}>{chf(k.lagerwert_ungezaehlt)}</td>
                <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                  <button
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={() => { void kategorieZaehlen(k) }}
                    disabled={busy === k.kategorie}
                  >
                    {busy === k.kategorie ? '…' : 'Kategorie zählen'}
                  </button>
                  {!k.eigener_plan && k.kategorie !== 'Ohne Kategorie' && (
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      style={{ marginLeft: 6 }}
                      onClick={() => onPlanAnlegen(k.kategorie)}
                    >
                      Plan anlegen
                    </button>
                  )}
                </td>
              </tr>,
              auf && (
                <tr key={`${k.kategorie}-auf`}>
                  <td colSpan={9} style={{ padding: 0, background: 'var(--surface2)' }}>
                    <ArtikelZeilen
                      artikel={daten.artikel.filter(
                        a => (a.kategorie ?? 'Ohne Kategorie') === k.kategorie,
                      )}
                    />
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>

      {daten.kategorien.length === 0 && (
        <div className="admin-table-empty">
          Noch keine aktiven Artikel im Lager — ohne Bestand gibt es nichts zu zählen.
        </div>
      )}
    </div>
  )
}

/** Liegt die Zählung ausserhalb des Fensters? Reine Funktion, damit die
 *  Auswahl für «Kategorie zählen» dieselbe Grenze zieht wie der Server. */
export function alterAusserhalb(iso: string, fensterTage: number, heute = new Date()): boolean {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return true
  return (heute.getTime() - d.getTime()) / 86_400_000 > fensterTage
}

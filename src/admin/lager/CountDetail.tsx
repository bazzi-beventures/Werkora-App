// Zählmaske einer Inventur (Lager v2, Phase 3).
//
// Zwei Entscheidungen prägen diese Ansicht:
//
// 1. **Verdeckt zählen.** Der Soll-Bestand ist ausgeblendet. Wer die Zahl
//    sieht, zählt sie ab statt nach — und eine Inventur, die das Erwartete
//    bestätigt, hat nichts geprüft. Für den Abgleich am Schreibtisch gibt es
//    den Umschalter.
// 2. **Die Zählung friert nichts ein.** Sie darf Tage offen bleiben; Rapporte
//    und Lieferungen laufen weiter. Beim Abschliessen wird gegen den Bestand
//    zum Zählzeitpunkt verglichen, nicht gegen den von heute.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  abortStockCount, closeStockCount, downloadStockCountCsv, getStockCount, recordCountItem,
} from '../../api/admin/inventory'
import type { CountSummary, StockCountDetail, StockCountItem } from '../../api/admin/inventory'
import { ConfirmDialog } from '../components/ConfirmDialog'
import CountWizard from '../../shared/count/CountWizard'
import { AbschlussDialog } from '../../shared/count/AbschlussDialog'
import { useIsMobile } from '../useIsMobile'

function chf(v: number | null | undefined): string {
  return v == null ? '—' : `CHF ${v.toFixed(2)}`
}

/**
 * Zählung im Admin: Tabelle oder Zählmodus.
 *
 * Am Handy öffnet eine **offene** Zählung den Zählmodus — dort zählt man, und
 * eine achtspaltige Tabelle auf 390 px ist keine Zählmaske. Am Schreibtisch
 * bleibt die Tabelle der Einstieg, weil man dort abgleicht statt zählt. Beides
 * ist ein Umschalter, keine Einbahnstrasse: Wer am Tablet im Regal steht, will
 * den Zählmodus auch dort.
 *
 * Der Zählmodus lädt die Zählung ein zweites Mal — er braucht die signierten
 * Artikelbilder, die die Tabelle nicht anfordert. Eine Tranche hat zwanzig
 * Positionen; das ist der Preis dafür, dass eine Jahresinventur mit 800 Zeilen
 * keine 800 Bildadressen signieren lässt, die niemand ansieht.
 */
export default function CountDetail({ countId, onBack }: { countId: string; onBack: () => void }) {
  const isMobile = useIsMobile()
  const [zaehlmodus, setZaehlmodus] = useState(false)
  const [modusGewaehlt, setModusGewaehlt] = useState(false)
  const [detail, setDetail] = useState<StockCountDetail | null>(null)
  const [entwuerfe, setEntwuerfe] = useState<Record<string, string>>({})
  const [sollZeigen, setSollZeigen] = useState(false)
  const [nurOffene, setNurOffene] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [abschlussFrage, setAbschlussFrage] = useState(false)
  const [abbruchFrage, setAbbruchFrage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ergebnis, setErgebnis] = useState<CountSummary | null>(null)
  const felder = useRef<Record<string, HTMLInputElement | null>>({})

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await getStockCount(countId))
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [countId])

  useEffect(() => { void laden() }, [laden])

  // Die Vorauswahl fällt einmal, sobald der Status bekannt ist — danach gehört
  // der Modus dem Nutzer, auch wenn er das Gerät dreht.
  useEffect(() => {
    if (modusGewaehlt || !detail) return
    setModusGewaehlt(true)
    if (isMobile && detail.count.status === 'offen') setZaehlmodus(true)
  }, [detail, isMobile, modusGewaehlt])

  const sichtbar = useMemo(() => {
    if (!detail) return []
    return nurOffene ? detail.items.filter(i => i.counted_qty == null) : detail.items
  }, [detail, nurOffene])

  async function speichern(item: StockCountItem, roh: string) {
    const wert = roh.trim() === '' ? null : parseFloat(roh)
    if (wert !== null && (isNaN(wert) || wert < 0)) return
    try {
      const res = await recordCountItem(countId, item.id, wert)
      setDetail(d => d && {
        ...d,
        items: d.items.map(i => i.id === item.id ? { ...i, ...res.item } : i),
        progress: {
          ...d.progress,
          gezaehlt: d.items.filter(i =>
            i.id === item.id ? wert !== null : i.counted_qty != null,
          ).length,
        },
      })
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  /** Enter springt zur nächsten Position — im Lager tippt man mit einer Hand. */
  function weiter(index: number) {
    const naechste = sichtbar[index + 1]
    if (naechste) felder.current[naechste.id]?.focus()
  }

  async function abschliessen() {
    setBusy(true)
    try {
      const res = await closeStockCount(countId)
      setErgebnis(res.summary)
      setAbschlussFrage(false)
      await laden()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Abschluss fehlgeschlagen')
      setAbschlussFrage(false)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !detail) return <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
  if (!detail) return <div className="admin-form-error">{error || 'Zählung nicht gefunden.'}</div>

  if (zaehlmodus) {
    return (
      <CountWizard
        countId={countId}
        onBack={onBack}
        onSwitchToList={() => setZaehlmodus(false)}
        onDone={() => { void laden() }}
      />
    )
  }

  const offen = detail.count.status === 'offen'
  const fortschritt = detail.progress

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onBack}>← Zurück</button>
          <div className="admin-page-title" style={{ marginTop: 8 }}>{detail.count.title}</div>
          <div className="admin-page-subtitle">
            {fortschritt.gezaehlt} von {fortschritt.gesamt} gezählt
            {!offen && ` · ${detail.count.status}`}
            {detail.count.diff_value_ek != null && ` · Differenz ${chf(detail.count.diff_value_ek)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => { void downloadStockCountCsv(countId) }}
          >
            CSV
          </button>
          {offen && (
            <>
              <button className="admin-btn admin-btn-secondary" onClick={() => setZaehlmodus(true)}>
                Zählmodus
              </button>
              <button className="admin-btn admin-btn-secondary" onClick={() => setAbbruchFrage(true)}>
                Abbrechen
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => setAbschlussFrage(true)}
                disabled={fortschritt.gezaehlt === 0}
                title={fortschritt.gezaehlt === 0 ? 'Noch nichts gezählt' : undefined}
              >
                Abschliessen
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      {ergebnis && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12,
        }}>
          <strong>Inventur abgeschlossen.</strong>{' '}
          {ergebnis.mit_differenz} von {ergebnis.gezaehlt} gezählten Positionen mit Abweichung,
          Differenz {chf(ergebnis.diff_value_ek)}.
          {ergebnis.ohne_ek > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {ergebnis.ohne_ek} Position(en) mit Abweichung haben keinen Einkaufspreis und
              fehlen in der Summe.
            </div>
          )}
          {ergebnis.offen > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {ergebnis.offen} Position(en) blieben ungezählt.
            </div>
          )}
        </div>
      )}

      <div className="admin-filter-bar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={sollZeigen} onChange={e => setSollZeigen(e.target.checked)} />
          Soll anzeigen
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={nurOffene} onChange={e => setNurOffene(e.target.checked)} />
          Nur ungezählte
        </label>
      </div>
      {!sollZeigen && offen && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          Der erwartete Bestand ist ausgeblendet: Wer die Zahl sieht, zählt sie ab statt nach.
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Artikel</th>
            {sollZeigen && <th style={{ textAlign: 'right' }}>Soll</th>}
            <th style={{ width: 140 }}>Gezählt</th>
            {!offen && <th style={{ textAlign: 'right' }}>Abweichung</th>}
          </tr>
        </thead>
        <tbody>
          {sichtbar.map((i, idx) => {
            const wert = entwuerfe[i.id] ?? (i.counted_qty != null ? String(i.counted_qty) : '')
            return (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {i.art_nr}{i.kategorie ? ` · ${i.kategorie}` : ''}
                  </div>
                </td>
                {sollZeigen && (
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    {i.expected_at_start} {i.unit || ''}
                  </td>
                )}
                <td>
                  {offen ? (
                    <input
                      ref={el => { felder.current[i.id] = el }}
                      className="admin-form-input"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      aria-label={`Gezählte Menge ${i.name}`}
                      value={wert}
                      onChange={e => setEntwuerfe(p => ({ ...p, [i.id]: e.target.value }))}
                      onBlur={e => { void speichern(i, e.target.value) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void speichern(i, (e.target as HTMLInputElement).value)
                          weiter(idx)
                        }
                      }}
                    />
                  ) : (
                    <span>{i.counted_qty ?? '—'} {i.unit || ''}</span>
                  )}
                </td>
                {!offen && (
                  <td style={{
                    textAlign: 'right',
                    color: (i.diff ?? 0) < 0 ? 'var(--danger)' : undefined,
                  }}>
                    {i.diff == null ? '—' : `${i.diff > 0 ? '+' : ''}${i.diff} ${i.unit || ''}`}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {abschlussFrage && (
        <AbschlussDialog
          detail={detail}
          busy={busy}
          onConfirm={() => { void abschliessen() }}
          onCancel={() => setAbschlussFrage(false)}
        />
      )}
      {abbruchFrage && (
        <ConfirmDialog
          title="Inventur abbrechen?"
          message="Es wird nichts gebucht und nichts am Bestand geändert. Die gezählten Mengen gehen verloren."
          confirmLabel="Abbrechen"
          variant="danger"
          onConfirm={() => {
            setAbbruchFrage(false)
            void abortStockCount(countId).then(onBack).catch((err: unknown) =>
              setError(err instanceof Error ? err.message : 'Abbruch fehlgeschlagen'))
          }}
          onCancel={() => setAbbruchFrage(false)}
        />
      )}
    </div>
  )
}

// Inventur in der Monteur-App (docs/specs/rollierende-inventur.md §10.5).
//
// Der Screen existiert, weil der Inventurmanager eines Zählplans keine
// Admin-Rolle braucht (E8). Ein Lagerist mit Rolle `user` kommt gar nicht in
// die Admin-App — ohne diesen Screen bekäme genau der Empfänger, für den die
// Tranche gedacht ist, eine Meldung über eine Arbeit, die er nirgends tun kann.
//
// Was hier NICHT steht, ist Absicht: keine Zählpläne, kein Zählstand, keine
// Voll- oder Stichzählung. Das ist Admin-Sache. Hier steht nur, was offen ist.
//
// Wer was sieht, entscheidet der Server (`require_counter`): ein Konto ohne
// Admin-Rolle nur die ihm zugeteilten Zählungen, ein Admin alle offenen. Darum
// heisst die Liste «Offene Zählungen» und nicht «meine» — die Überschrift soll
// nicht mehr behaupten, als die Antwort hergibt.

import { useCallback, useEffect, useState } from 'react'
import { isNetworkError } from '../api/client'
import { listMyStockCounts } from '../api/inventory'
import type { StockCount } from '../api/inventory'
import CountWizard from '../shared/count/CountWizard'
import { useOnline } from '../shared/useOnline'

function datum(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('de-CH')
}

function ueberfaellig(dueOn: string | null | undefined): boolean {
  return Boolean(dueOn) && String(dueOn).slice(0, 10) < new Date().toISOString().slice(0, 10)
}

interface Props {
  onBack: () => void
  /** Sprung aus einer Push oder vom Startbildschirm direkt in eine Zählung. */
  initialCountId?: string | null
  onInitialConsumed?: () => void
}

export default function InventurScreen({ onBack, initialCountId, onInitialConsumed }: Props) {
  const [rows, setRows] = useState<StockCount[]>([])
  const [offenId, setOffenId] = useState<string | null>(initialCountId ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const online = useOnline()

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listMyStockCounts()
      setRows(res.rows)
      setError('')
    } catch (err: unknown) {
      // Offline ist kein Fehler des Nutzers: Zählen braucht das Netz (die
      // Eingabe wird sofort gebucht), und das steht hier als Satz statt als
      // leerer Liste, die wie «nichts zu tun» aussähe.
      setError(isNetworkError(err)
        ? 'Ohne Netz lässt sich keine Zählung öffnen — die Mengen werden sofort gebucht.'
        : err instanceof Error ? err.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  // Der Sprung ist ein Startereignis, kein Zustand — sonst spränge jedes
  // «Zurück» sofort wieder in dieselbe Zählung.
  useEffect(() => {
    if (initialCountId) {
      setOffenId(initialCountId)
      onInitialConsumed?.()
    }
  }, [initialCountId, onInitialConsumed])

  if (offenId) {
    return (
      <CountWizard
        countId={offenId}
        onBack={() => { setOffenId(null); void laden() }}
        onDone={() => { void laden() }}
      />
    )
  }

  return (
    <div className="app-screen">
      <div className="home-header">
        <div className="home-header-top">
          <div>
            <div className="home-greeting">Inventur</div>
            <div className="home-name">Offene Zählungen</div>
          </div>
          <button className="home-theme-btn" onClick={onBack} aria-label="Zurück">←</button>
        </div>
      </div>

      <div className="home-scroll">
        {error && (
          <div style={{ margin: '12px 16px', color: 'var(--danger)', fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Laden…</div>
        ) : rows.length === 0 && !error ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            Im Moment ist keine Zählung offen. Sobald eine Tranche für dich
            bereitliegt, bekommst du eine Mitteilung.
          </div>
        ) : (
          <div className="tiles">
            {rows.map(c => {
              const offen = Math.max(
                0, (c.progress?.gesamt ?? 0) - (c.progress?.gezaehlt ?? 0),
              )
              const spaet = ueberfaellig(c.due_on)
              return (
                <button
                  key={c.id}
                  type="button"
                  className="tile tile-amber tile-full"
                  onClick={() => setOffenId(c.id)}
                  disabled={!online}
                  title={!online ? 'Zählen braucht eine Verbindung' : undefined}
                  style={{ textAlign: 'left', width: '100%', opacity: online ? 1 : 0.5 }}
                >
                  <div>
                    <div className="tile-label">{c.title}</div>
                    <div className="tile-desc">
                      {offen} von {c.progress?.gesamt ?? 0} noch zu zählen
                      {c.due_on && ` · ${spaet ? 'überfällig seit' : 'fällig'} ${datum(c.due_on)}`}
                    </div>
                  </div>
                  <div className="tile-arrow">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Zählpläne im Reiter Inventur (docs/specs/rollierende-inventur.md §9, §10).
//
// Die Einstellungen stehen bewusst ÜBER den Zählungen, deren Ergebnis sie
// beeinflussen: Wer nach vier Wochen sieht, dass 20 pro Woche zu wenig sind,
// stellt sie dort um, wo er das sieht.

import { useCallback, useEffect, useState } from 'react'
import { listCountPlans, runCountPlan } from '../../api/admin/inventory'
import type { CountPlan, OpenTrancheChoice } from '../../api/admin/inventory'
import { ApiError } from '../../api/client'
import CountPlanModal from './CountPlanModal'

function datum(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('de-CH')
}

const PERIODE_TEXT: Record<string, string> = {
  tag: 'pro Tag',
  woche: 'pro Woche',
  monat: 'pro Monat',
}

/**
 * Die Frage, die eine liegengebliebene Tranche aufwirft (Spec E4).
 *
 * Bewusst zwei gleichrangige Knöpfe statt einer Vorauswahl: Abbrechen verwirft
 * gezählte Mengen, Übernehmen bucht sie. Beides ist eine Entscheidung über
 * Ware, und keine der beiden ist so viel häufiger, dass sie der Vorgabewert
 * sein dürfte.
 */
function OffeneTrancheDialog({
  plan, busy, onWaehlen, onCancel,
}: {
  plan: CountPlan
  busy: boolean
  onWaehlen: (wahl: OpenTrancheChoice) => void
  onCancel: () => void
}) {
  const t = plan.offene_tranche
  const gezaehlt = t?.progress?.gezaehlt ?? 0
  const gesamt = t?.progress?.gesamt ?? 0
  const offen = Math.max(0, gesamt - gezaehlt)

  return (
    <div className="admin-modal-overlay" onClick={onCancel}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Neue Tranche starten?</div>
          <button className="admin-modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="admin-modal-body">
          <p>
            <strong>{t?.title ?? 'Die laufende Zählung'}</strong> ist noch offen:
            {' '}{gezaehlt} von {gesamt} gezählt.
          </p>
          <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            <li>
              <strong>Abbrechen</strong> — es wird nichts gebucht, die {gesamt} Artikel
              kommen zurück in den Pool und stehen bei der nächsten Auswahl vorne.
            </li>
            <li>
              <strong>Übernehmen</strong> — die {gezaehlt} gezählten Positionen werden
              gebucht, die {offen} offenen stehen in der neuen Tranche vorne.
            </li>
          </ul>
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={busy}>
            Zurück
          </button>
          <button
            className="admin-btn admin-btn-danger"
            onClick={() => onWaehlen('abort')}
            disabled={busy}
          >
            Abbrechen und neu
          </button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => onWaehlen('carry')}
            disabled={busy}
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  )
}

function PlanKarte({
  plan, busy, onZaehlen, onNeueTranche, onWeiterzaehlen, onBearbeiten,
}: {
  plan: CountPlan
  busy: boolean
  onZaehlen: () => void
  onNeueTranche: () => void
  onWeiterzaehlen: (countId: string) => void
  onBearbeiten: () => void
}) {
  const t = plan.offene_tranche
  const gezaehlt = t?.progress?.gezaehlt ?? 0
  const gesamt = t?.progress?.gesamt ?? 0

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12,
      opacity: plan.active ? 1 : 0.65,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600 }}>
            {plan.category ?? 'Alle übrigen Kategorien'}
            {' · '}{plan.per_period} Artikel {PERIODE_TEXT[plan.period] ?? plan.period}
            {!plan.active && <span style={{ color: 'var(--muted)' }}> · pausiert</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Inventurmanager: {plan.manager_name ?? '—'}
            {' · nächste Tranche '}{datum(plan.naechste_tranche)}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{plan.zyklus}</div>
          {plan.manager_fehlt && (
            <div className="admin-form-error" style={{ marginTop: 8 }}>
              Inventurmanager fehlt — das Konto ist nicht mehr aktiv. Solange
              niemand benannt ist, entstehen keine Tranchen.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {t ? (
            <>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => onWeiterzaehlen(t.count_id)}
              >
                Weiterzählen
              </button>
              <button className="admin-btn admin-btn-secondary" onClick={onNeueTranche} disabled={busy}>
                Neue Tranche…
              </button>
            </>
          ) : (
            <button
              className="admin-btn admin-btn-primary" onClick={onZaehlen}
              disabled={busy || plan.manager_fehlt}
              title={plan.manager_fehlt ? 'Erst einen Inventurmanager benennen' : undefined}
            >
              Jetzt zählen
            </button>
          )}
          <button className="admin-btn admin-btn-secondary" onClick={onBearbeiten}>
            Bearbeiten
          </button>
        </div>
      </div>

      {t && (
        <div style={{
          marginTop: 10, fontSize: 13,
          color: t.ueberfaellig ? 'var(--danger)' : 'var(--muted)',
        }}>
          {t.title}: {gezaehlt} von {gesamt} gezählt
          {t.due_on && (t.ueberfaellig
            ? ` · überfällig seit ${datum(t.due_on)}`
            : ` · fällig ${datum(t.due_on)}`)}
        </div>
      )}
    </div>
  )
}

export default function CountPlans({ onOeffnen, neuFuerKategorie, onNeuVerbraucht, onGeaendert }: {
  onOeffnen: (countId: string) => void
  /** Aus dem Zählstand: «Plan anlegen» für genau diese Kategorie. */
  neuFuerKategorie?: string | null
  onNeuVerbraucht?: () => void
  /** Ein Plan hat sich geändert — der Zählstand zeigt ihn in seiner Spalte. */
  onGeaendert?: () => void
}) {
  const [plans, setPlans] = useState<CountPlan[]>([])
  const [freieKategorien, setFreieKategorien] = useState<string[]>([])
  const [sammelplanVorhanden, setSammelplanVorhanden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bearbeiten, setBearbeiten] = useState<CountPlan | null | 'neu'>(null)
  const [vorgabeKategorie, setVorgabeKategorie] = useState<string | null>(null)
  const [frage, setFrage] = useState<CountPlan | null>(null)

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listCountPlans()
      setPlans(res.plans)
      setFreieKategorien(res.kategorien_ohne_plan)
      setSammelplanVorhanden(res.sammelplan_vorhanden)
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  // Der Sprung aus dem Zählstand ist ein Ereignis, kein Zustand: Einmal
  // ausgeführt, gehört die Maske wieder dem Nutzer.
  useEffect(() => {
    if (!neuFuerKategorie) return
    setVorgabeKategorie(neuFuerKategorie)
    setBearbeiten('neu')
    onNeuVerbraucht?.()
  }, [neuFuerKategorie, onNeuVerbraucht])

  const zaehlen = useCallback(async (plan: CountPlan, wahl?: OpenTrancheChoice) => {
    setBusy(true)
    setError('')
    try {
      const res = await runCountPlan(plan.id, wahl)
      setFrage(null)
      onOeffnen(res.count.id)
    } catch (err: unknown) {
      // Der Server ist die verlässliche Stelle: Zwischen dem Laden der Karte und
      // dem Klick kann eine Tranche entstanden sein (Nachtlauf, zweiter Admin).
      // Dann kommt die Frage von dort, nicht aus dem veralteten Zustand hier.
      if (err instanceof ApiError && err.code === 'open_tranche') {
        await laden()
        setFrage(plan)
      } else {
        setError(err instanceof Error ? err.message : 'Tranche konnte nicht angelegt werden')
      }
    } finally {
      setBusy(false)
    }
  }, [laden, onOeffnen])

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, marginBottom: 8, flexWrap: 'wrap',
      }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Zählpläne</h3>
        <button className="admin-btn admin-btn-secondary" onClick={() => setBearbeiten('neu')}>
          Plan hinzufügen
        </button>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      {loading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      ) : plans.length === 0 ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 14 }}>
          <strong>Rollierende Inventur einrichten</strong>
          <p style={{ margin: '6px 0 0', fontSize: 14 }}>
            Statt einmal im Jahr alles zu zählen, zählen Sie regelmässig einen
            Teil — zum Beispiel 20 Artikel pro Woche. Werkora stellt die Tranche
            zusammen, meldet sie dem Inventurmanager und fängt bei den Artikeln
            an, die am längsten nicht gezählt wurden.
          </p>
        </div>
      ) : (
        plans.map(p => (
          <PlanKarte
            key={p.id}
            plan={p}
            busy={busy}
            onZaehlen={() => { void zaehlen(p) }}
            onNeueTranche={() => setFrage(p)}
            onWeiterzaehlen={onOeffnen}
            onBearbeiten={() => setBearbeiten(p)}
          />
        ))
      )}

      {bearbeiten !== null && (
        <CountPlanModal
          plan={bearbeiten === 'neu' ? null : bearbeiten}
          freieKategorien={freieKategorien}
          sammelplanVorhanden={sammelplanVorhanden}
          vorgabeKategorie={bearbeiten === 'neu' ? vorgabeKategorie : null}
          onClose={() => { setBearbeiten(null); setVorgabeKategorie(null) }}
          onSaved={() => {
            setBearbeiten(null)
            setVorgabeKategorie(null)
            void laden()
            onGeaendert?.()
          }}
        />
      )}

      {frage && (
        <OffeneTrancheDialog
          plan={frage}
          busy={busy}
          onWaehlen={wahl => { void zaehlen(frage, wahl) }}
          onCancel={() => setFrage(null)}
        />
      )}
    </div>
  )
}

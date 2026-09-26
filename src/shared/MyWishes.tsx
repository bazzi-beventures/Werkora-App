import { useState } from 'react'
import { AREA_LABEL, fmtDay, withdrawWish, type MyWish } from '../api/featureRequests'

/**
 * «Meine Wünsche» bzw. «Unsere Wünsche» — Spec docs/specs/feature-anfragen.md §5.5.
 *
 * Je Wunsch: Nummer, Datum, Titel und der STAND — bei einem zugeordneten
 * Wunsch die Phase des Features, sonst der Zustand der Triage samt dem Satz
 * des Betreibers. Nie eine Uhrzeit (F13).
 */

interface Props {
  wishes: MyWish[]
  loading?: boolean
  failed?: boolean
  /** «Unsere Wünsche»: Person je Zeile zeigen, kein Zurückziehen. */
  showPerson?: boolean
  onOpenFeature?: (featureId: string) => void
  onChanged?: () => void
  emptyText?: string
}

export default function MyWishes({
  wishes, loading, failed, showPerson = false, onOpenFeature, onChanged,
  emptyText = 'Du hast noch keinen Wunsch geäussert.',
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function withdraw(id: string) {
    setBusyId(id)
    try {
      await withdrawWish(id)
      onChanged?.()
    } catch {
      // 409: schon triagiert — dann gehört der Wortlaut in den Pool.
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  if (failed && wishes.length === 0) {
    return <div className="wish-muted">Deine Wünsche liegen online — gerade nicht erreichbar.</div>
  }
  if (!loading && wishes.length === 0) {
    return <div className="wish-muted">{emptyText}</div>
  }

  return (
    <div className="wish-root-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {wishes.map(w => {
        const unread = !!w.notified_at && (!w.read_at || w.read_at < w.notified_at)
        return (
          <div key={w.id} className="wish-card">
            {unread && <span className="wish-card-new" aria-label="Neu" />}
            <div className="wish-muted">
              {w.reference} · {fmtDay(w.created_on)}
              {showPerson && w.created_by_name ? ` · ${w.created_by_name}` : ''}
              {w.area ? ` · ${AREA_LABEL[w.area] ?? w.area}` : ''}
            </div>
            <div className="wish-card-title">
              {w.origin === 'unterstuetzung'
                ? `Unterstützt: ${w.feature?.title ?? 'Feature'}`
                : w.title || '(ohne Titel)'}
            </div>
            {w.feature ? (
              <div>
                <span className="wish-phase wish-accent">{w.feature.phase_label}</span>
                <span className="wish-muted"> {w.feature.reference} · Ziel: {w.feature.target_label}</span>
                {onOpenFeature && (
                  <>
                    {' '}
                    <button type="button" className="wish-link" onClick={() => onOpenFeature(w.feature!.id)}>
                      auf der Roadmap
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div><span className="wish-phase">{w.triage_label}</span></div>
            )}
            {w.answer && w.triage !== 'zugeordnet' && <div className="wish-quote">{w.answer}</div>}
            {!showPerson && w.triage === 'neu' && w.origin === 'anfrage' && (
              <div>
                <button type="button" className="wish-link" disabled={busyId === w.id}
                        onClick={() => withdraw(w.id)}>
                  zurückziehen
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

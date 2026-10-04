import { useCallback, useEffect, useState } from 'react'
import { getMyReminders, updateReminder } from '../../api/admin/reminders'
import type { Reminder } from '../../api/admin/reminders'
import { dueBucket, formatDue, targetLabel } from './reminderLogic'

// «Meine Erinnerungen» auf dem Dashboard (Modul `reminders`, docs/specs/erinnerungen.md).
//
// Mail und Push sind der Wecker; das hier ist der Stapel, der bleibt, bis man
// abhakt. Fällige zuerst (der Server sortiert nach Datum), die kommenden
// darunter — gezählt, nicht versteckt: wer sich «ab 12.10.» notiert hat, will
// am 4.10. sehen, dass es notiert ist.
//
// Ein Klick führt dorthin, wo der Bezug steht: Projekt vor Kunde, wie der Knopf
// in der Mail (services/user_reminders.action_link).

const BUCKET_LABEL: Record<string, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  upcoming: 'Demnächst',
}

const BUCKET_COLOR: Record<string, string> = {
  overdue: 'var(--danger)',
  today: 'var(--warning)',
  upcoming: 'var(--muted)',
}

export function MyReminders({
  onOpenProject,
  onOpenCustomer,
}: {
  onOpenProject: (projectId: string) => void
  onOpenCustomer: (customerId: string) => void
}) {
  const [rows, setRows] = useState<Reminder[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await getMyReminders())
    } catch {
      setRows([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function markDone(id: string) {
    setBusyId(id)
    try {
      await updateReminder(id, { done: true })
      setRows(rs => (rs ?? []).filter(r => r.id !== id))
    } catch {
      // Bleibt stehen — der nächste Versuch zeigt, ob es am Netz lag.
    } finally {
      setBusyId(null)
    }
  }

  if (rows === null) return null

  const dueCount = rows.filter(r => dueBucket(r) !== 'upcoming').length

  return (
    <section className="admin-kpi-section" data-testid="my-reminders">
      <h3 className="admin-kpi-group-title">
        Meine Erinnerungen
        {dueCount > 0 && <span className="admin-kpi-badge" style={{ position: 'static', marginLeft: 8 }}>{dueCount}</span>}
      </h3>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Keine offenen Erinnerungen. Gesetzt werden sie am Kunden oder im Projekt.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => {
            const bucket = dueBucket(r)
            const where = targetLabel(r)
            const open = r.project_id
              ? () => onOpenProject(r.project_id!)
              : r.customer_id ? () => onOpenCustomer(r.customer_id!) : undefined
            return (
              <li
                key={r.id}
                className="admin-table-wrap"
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', fontSize: 13 }}
              >
                <input
                  type="checkbox"
                  aria-label="Erledigt"
                  title="Erledigt"
                  checked={false}
                  disabled={busyId === r.id}
                  onChange={() => void markDone(r.id)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ color: BUCKET_COLOR[bucket], fontWeight: bucket === 'upcoming' ? 400 : 600 }}>
                      {BUCKET_LABEL[bucket]} · {formatDue(r)}
                    </span>
                    {where && (open ? (
                      <button
                        type="button"
                        onClick={open}
                        style={{
                          background: 'none', border: 0, padding: 0, cursor: 'pointer',
                          color: 'var(--primary)', font: 'inherit', fontWeight: 500,
                        }}
                      >
                        {where}
                      </button>
                    ) : <span>{where}</span>)}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.text}</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

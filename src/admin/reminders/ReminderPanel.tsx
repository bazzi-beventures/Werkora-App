import { useCallback, useEffect, useState } from 'react'
import {
  createReminder, deleteReminder, getReminders, updateReminder,
} from '../../api/admin/reminders'
import type { Reminder, ReminderTarget } from '../../api/admin/reminders'
import { todayISO } from '../utils/format'
import { dueBucket, formatDue, quickDates } from './reminderLogic'

// Erinnerungen an einem Kunden oder Projekt (Modul `reminders`, WF-6,
// docs/specs/erinnerungen.md).
//
// «Kunde ist bis 12.10. in den Ferien, danach Termin vereinbaren» — gesetzt
// wird sie hier, wo man beim Telefonat ohnehin steht; melden tut sie sich am
// Stichtag per Mail + Push bei der Person, die sie gesetzt hat.
//
// Die Liste zeigt die offenen Erinnerungen ALLER Admin-Konten an diesem Bezug
// (mit Namen): damit nicht zwei Leute denselben Rückruf planen. Abhaken darf
// jede, ändern und löschen nur, wer sie gesetzt hat (oder Management) — das
// prüft der Server, hier wird nur nicht angeboten, was er ablehnen würde.
//
// Bewusst kein <form>: das Panel sitzt neben bzw. in fremden Formularen
// (Kundenstamm, Projektmaske), und ein Enter im Textfeld darf dort nicht das
// Kundenformular absenden.

const MANAGEMENT = new Set(['management', 'superadmin'])

const BUCKET_STYLE: Record<string, React.CSSProperties> = {
  overdue: { color: 'var(--danger)', fontWeight: 600 },
  today: { color: 'var(--warning)', fontWeight: 600 },
  upcoming: { color: 'var(--muted)' },
}

function ReminderEditor({
  initial,
  busy,
  onSave,
  onCancel,
  saveLabel,
}: {
  initial?: { text: string; date: string; time: string }
  busy: boolean
  onSave: (v: { text: string; date: string; time: string }) => void
  onCancel: () => void
  saveLabel: string
}) {
  const today = todayISO()
  const [text, setText] = useState(initial?.text ?? '')
  const [date, setDate] = useState(initial?.date ?? quickDates(today)[0].date)
  const [time, setTime] = useState(initial?.time ?? '')
  const valid = text.trim().length > 0 && date >= today

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
        border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8,
      }}
    >
      <textarea
        className="admin-form-input"
        rows={2}
        maxLength={500}
        placeholder="Woran erinnern? z.B. «Termin vereinbaren — Kunde ab 12.10. zurück»"
        value={text}
        onChange={e => setText(e.target.value)}
        aria-label="Text der Erinnerung"
        style={{ resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {quickDates(today).map(q => (
          <button
            key={q.label}
            type="button"
            className={`admin-btn admin-btn-sm ${date === q.date ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            onClick={() => setDate(q.date)}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="admin-form-label" htmlFor="reminder-date">Datum</label>
          <input
            id="reminder-date"
            className="admin-form-input"
            type="date"
            min={today}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="admin-form-label" htmlFor="reminder-time">Uhrzeit (optional)</label>
          <input
            id="reminder-time"
            className="admin-form-input"
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', flex: '1 1 160px' }}>
          Ohne Uhrzeit meldet sie sich um 08:00 — per Mail und Push an dich.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-primary admin-btn-sm"
          disabled={busy || !valid}
          onClick={() => onSave({ text: text.trim(), date, time })}
        >
          {busy ? 'Speichern…' : saveLabel}
        </button>
      </div>
    </div>
  )
}

/** Wer schaut — reicht für «darf ändern?». Bewusst nicht das ganze UserInfo:
 *  die Projektmaske hat es nicht, sondern nur diese zwei Felder. */
export interface ReminderViewer {
  authorized_user_id: string
  role: string
}

export function ReminderPanel({ target, me }: { target: ReminderTarget; me: ReminderViewer | null }) {
  const [rows, setRows] = useState<Reminder[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { customerId, projectId } = target
  const load = useCallback(async () => {
    try {
      setRows(await getReminders({ customerId, projectId }))
    } catch {
      setRows([])
    }
  }, [customerId, projectId])

  useEffect(() => { void load() }, [load])

  const mayEdit = (r: Reminder) =>
    !!me && (r.owner_user_id === me.authorized_user_id || MANAGEMENT.has(me.role))

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-form-group" style={{ marginTop: 14 }} data-testid="reminder-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="admin-form-label" style={{ margin: 0 }}>Erinnerungen</span>
        {!adding && (
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => { setAdding(true); setEditingId(null) }}
          >
            + Erinnerung setzen
          </button>
        )}
      </div>
      {error && <div className="admin-form-error">{error}</div>}
      {adding && (
        <ReminderEditor
          busy={busy}
          saveLabel="Erinnerung setzen"
          onCancel={() => setAdding(false)}
          onSave={async v => {
            const ok = await run(() => createReminder(target, {
              text: v.text, due_date: v.date, due_time: v.time || null,
            }))
            if (ok) setAdding(false)
          }}
        />
      )}
      {rows === null ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Laden…</div>
      ) : rows.length === 0 ? (
        !adding && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Keine offenen Erinnerungen.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => editingId === r.id ? (
            <li key={r.id}>
              <ReminderEditor
                initial={{ text: r.text, date: r.due_date, time: r.due_time?.slice(0, 5) ?? '' }}
                busy={busy}
                saveLabel="Speichern"
                onCancel={() => setEditingId(null)}
                onSave={async v => {
                  const ok = await run(() => updateReminder(r.id, {
                    text: v.text, due_date: v.date, due_time: v.time || null,
                  }))
                  if (ok) setEditingId(null)
                }}
              />
            </li>
          ) : (
            <li
              key={r.id}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 10px',
                borderRadius: 6, background: 'var(--surface-2)', fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                aria-label="Erledigt"
                title="Erledigt"
                disabled={busy}
                checked={false}
                onChange={() => void run(() => updateReminder(r.id, { done: true }))}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <span style={BUCKET_STYLE[dueBucket(r)]}>{formatDue(r)}</span>
                  {r.owner_user_id !== me?.authorized_user_id && r.created_by_name && (
                    <span style={{ color: 'var(--muted)' }}> · von {r.created_by_name}</span>
                  )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{r.text}</div>
              </div>
              {mayEdit(r) && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    disabled={busy}
                    onClick={() => { setEditingId(r.id); setAdding(false) }}
                  >
                    Ändern
                  </button>
                  <button
                    type="button"
                    className="admin-btn-icon danger"
                    title="Erinnerung löschen"
                    disabled={busy}
                    onClick={() => void run(() => deleteReminder(r.id))}
                  >
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

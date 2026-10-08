import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  BoardColumn, BoardTask, TaskBoardResponse,
  createBoardTask, deleteBoardTask, getTaskBoard, updateBoardTask,
} from '../../api/admin'
import { createReminder, getMyReminders, updateReminder } from '../../api/admin/reminders'
import { closeProject } from '../../api/admin/projects'
import { sendQuoteReminder } from '../../api/admin/dashboard'
import type { Reminder } from '../../api/admin/reminders'
import { AdminScreen } from '../useAdminNav'
import type { ProjectTab } from '../operative/projectDetail/ProjectTabBar'
import { useToast, ToastHost } from '../components/useToast'
import { fmtDate } from '../utils/format'
import { ReminderEditor } from '../reminders/ReminderPanel'
import { useListState } from '../hooks/useListState'
import { dueBucket, formatDue, targetLabel } from '../reminders/reminderLogic'
import {
  BoardView, CardAction, COLUMN_LABELS, cardAction, daysSince, displayTitle, dropSortOrder,
  groupByAssignee, groupByColumn, groupByField, isOverdue, isProcessBound,
  matchesQuery, navTarget, urgency,
} from './taskBoardLogic'

const PROCESS_BOUND_HINT = 'Fester Prozessschritt — erledigt sich automatisch, sobald die Arbeit getan ist.'

interface Props {
  /** `tab`: Reiter, auf dem die Projektmaske aufgeht (nur mit Projekt-id). */
  onNav: (screen: AdminScreen, detailId?: string, tab?: ProjectTab) => void
  onBadgeChange?: () => void
  /** Modul `reminders` für dieses Konto an → Spalte «Erinnerungen» in der
   *  Ansicht «Meine» und «Erinnerung setzen» im Karten-Detail. */
  showReminders?: boolean
}

const REMINDER_BUCKET_LABEL: Record<string, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  upcoming: 'Geplant',
}

function initials(name: string | null | undefined): string {
  return (name ?? '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// ─── Karte ───────────────────────────────────────────────────

interface CardProps {
  task: BoardTask
  typeLabel: string | null
  /** Kürzel-Avatar nur, wenn die Karten verschiedenen Leuten gehören können —
   *  in «Meine» oder im Filter auf eine Person trug sonst jede Karte dasselbe. */
  assigneeName: string | null
  /** Status-Kanban: Karte ist per Drag & Drop verschiebbar. */
  draggable: boolean
  /** Feld-/PL-Ansicht: Status als Chip + Schnell-Erledigen auf der Karte. */
  showStatusChip: boolean
  onClick: () => void
  onComplete?: () => void
  /** Direktaktion der Karte (cardAction) samt Auslöser. */
  action?: { spec: CardAction; busy: boolean; run: () => void }
  onDragStart?: (e: React.DragEvent) => void
  onDropBefore?: (e: React.DragEvent) => void
}

function TaskCard({ task, typeLabel, assigneeName, draggable, showStatusChip, onClick, onComplete, action, onDragStart, onDropBefore }: CardProps) {
  const overdue = isOverdue(task)
  const urg = urgency(task)
  const chip = task.source === 'manuell' ? 'Manuell' : (typeLabel ?? task.task_type)
  return (
    <div
      className={`tb-card${task.status === 'erledigt' ? ' done' : ''}${urg ? ` urg-${urg}` : ''}${draggable ? ' draggable' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? e => e.preventDefault() : undefined}
      onDrop={draggable ? onDropBefore : undefined}
      onClick={onClick}
    >
      <div className="tb-card-top">
        <span className={`tb-card-type${task.source === 'manuell' ? ' manual' : ''}`}>{chip}</span>
        <span className="tb-card-top-right">
          {showStatusChip && (task.status === 'in_arbeit' || task.status === 'wartet') && (
            <span className={`tb-status-chip ${task.status}`}>{COLUMN_LABELS[task.status]}</span>
          )}
          {assigneeName && <span className="tb-card-avatar" title={assigneeName}>{initials(assigneeName)}</span>}
        </span>
      </div>
      <div className="tb-card-title">{task.source === 'manuell' ? task.title : displayTitle(task.title, typeLabel)}</div>
      {task.project_name && task.ref_kind !== 'project' && (
        <div className="tb-card-project">{task.project_name}</div>
      )}
      <div className="tb-card-meta">
        {task.due_date
          ? <span className={overdue ? 'tb-due overdue' : urg ? 'tb-due soon' : 'tb-due'}>Fällig: {fmtDate(task.due_date)}</span>
          : task.status === 'erledigt' && task.done_at
            ? <span>Erledigt: {fmtDate(task.done_at)}{task.auto_done ? ' (System)' : ''}</span>
            : <span>seit {daysSince(task.created_at)} Tagen</span>}
        <span className="tb-card-actions">
          {action && (
            <button
              className="tb-card-action-btn"
              title={action.spec.longLabel}
              disabled={action.busy}
              onClick={e => { e.stopPropagation(); action.run() }}
            >
              {action.busy ? '…' : action.spec.label}
            </button>
          )}
          {onComplete && task.status !== 'erledigt' && (
          <button
            className="tb-card-done-btn"
            title={task.source === 'manuell'
              ? 'Als erledigt markieren'
              : 'Quittieren — Aufgabe bewusst nicht ausführen (wird nicht neu erstellt)'}
            aria-label={task.source === 'manuell' ? 'Als erledigt markieren' : 'Quittieren'}
            onClick={e => { e.stopPropagation(); onComplete() }}
          >
            ✓
          </button>
          )}
        </span>
      </div>
    </div>
  )
}

// ─── Erinnerungs-Karte ───────────────────────────────────────
//
// Die eigenen Erinnerungen (Modul `reminders`, docs/specs/erinnerungen.md)
// stehen als eigene Spalte neben den Aufgaben: was man sich für «ab 12.10.»
// notiert hat, ist für den Projektleiter dieselbe Arbeitsliste. Sie sind aber
// KEINE board_tasks — sie gehören einer Person, nicht einem Projektleiter-
// Filter, und melden sich selbst per Mail/Push. Deshalb nur in «Meine».

function ReminderCard({ reminder, busy, onOpen, onDone }: {
  reminder: Reminder
  busy: boolean
  onOpen?: () => void
  onDone: () => void
}) {
  const bucket = dueBucket(reminder)
  const where = targetLabel(reminder)
  const urg = bucket === 'overdue' ? 'overdue' : bucket === 'today' ? 'today' : null
  return (
    <div
      className={`tb-card tb-reminder-card${urg ? ` urg-${urg}` : ''}${onOpen ? '' : ' static'}`}
      onClick={onOpen}
      data-testid="board-reminder"
    >
      <div className="tb-card-top">
        <span className={`tb-card-type reminder ${bucket}`}>{REMINDER_BUCKET_LABEL[bucket]}</span>
      </div>
      <div className="tb-card-title tb-reminder-text">{reminder.text}</div>
      {where && <div className="tb-card-project">{where}</div>}
      <div className="tb-card-meta">
        <span className={bucket === 'overdue' ? 'tb-due overdue' : bucket === 'today' ? 'tb-due soon' : 'tb-due'}>
          {formatDue(reminder)}
        </span>
        <button
          className="tb-card-done-btn"
          title="Erinnerung erledigt"
          aria-label="Erinnerung erledigt"
          disabled={busy}
          onClick={e => { e.stopPropagation(); onDone() }}
        >
          ✓
        </button>
      </div>
    </div>
  )
}

// ─── Detail-Modal ────────────────────────────────────────────

interface DetailModalProps {
  task: BoardTask
  board: TaskBoardResponse
  onClose: () => void
  onChanged: (reload?: boolean) => void
  onNav: Props['onNav']
  /** Gesetzt = Modul `reminders` an: «Erinnerung setzen» anbieten. */
  onReminderCreated?: () => void
  /** Direktaktion der Karte; true = ausgeführt (Modal schliesst). */
  onAction?: (task: BoardTask) => Promise<boolean>
}

function TaskDetailModal({ task, board, onClose, onChanged, onNav, onReminderCreated, onAction }: DetailModalProps) {
  const isManual = task.source === 'manuell'
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [status, setStatus] = useState<BoardColumn>(task.status)
  const [assignee, setAssignee] = useState(task.assignee_staff_id ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderSet, setReminderSet] = useState<string | null>(null)

  const target = navTarget(task)
  const action = onAction ? cardAction(task) : null
  const typeLabel = task.task_type ? board.task_types[task.task_type]?.label ?? task.task_type : 'Manuelle Aufgabe'
  const processBound = isProcessBound(task, board.task_types)
  // Prozessgebundene Karten erledigt nur der Sync — die Option gar nicht erst
  // anbieten (der Server lehnt sie ohnehin ab). Ist die Karte schon erledigt
  // (System), bleibt der aktuelle Wert wählbar.
  const statusOptions = processBound && task.status !== 'erledigt'
    ? board.columns.filter(c => c !== 'erledigt')
    : board.columns

  async function handleSave() {
    const patch = {
      ...(isManual ? { title: title.trim(), description: description.trim() || null } : {}),
      ...(status !== task.status ? { status } : {}),
      ...((assignee || null) !== task.assignee_staff_id ? { assignee_staff_id: assignee || null } : {}),
      ...((dueDate || null) !== task.due_date ? { due_date: dueDate || null } : {}),
    }
    // Nichts geändert → einfach schliessen (der Server lehnt leere Patches ab).
    if (Object.keys(patch).length === 0) { onClose(); return }
    setBusy(true)
    setError(null)
    try {
      await updateBoardTask(task.id, patch)
      onChanged(true)
      onClose()
    } catch {
      setError('Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  // Wiedervorlage aus der Karte: «Offerte nachfassen — Kunde erst ab 12.10.
  // erreichbar». Die Erinnerung hängt am Projekt der Karte (sofern es eins
  // gibt), damit Mail und Push dorthin führen und sie auch am Projekt steht.
  async function handleReminder(v: { text: string; date: string; time: string }) {
    setBusy(true)
    setError(null)
    try {
      const r = await createReminder(
        task.project_id ? { projectId: task.project_id } : {},
        { text: v.text, due_date: v.date, due_time: v.time || null },
      )
      setReminderOpen(false)
      setReminderSet(formatDue(r))
      onReminderCreated?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erinnerung konnte nicht gesetzt werden')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Aufgabe löschen?')) return
    setBusy(true)
    try {
      await deleteBoardTask(task.id)
      onChanged(true)
      onClose()
    } catch {
      setError('Löschen fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">{typeLabel}</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body tb-detail">
          {error && <div className="admin-toast error">{error}</div>}

          {isManual ? (
            <label className="tb-field">
              <span>Titel</span>
              <input className="admin-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} />
            </label>
          ) : (
            <div className="tb-detail-title">{task.title}</div>
          )}

          {isManual ? (
            <label className="tb-field">
              <span>Beschreibung</span>
              <textarea className="admin-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
            </label>
          ) : (
            task.description && <div className="tb-detail-desc">{task.description}</div>
          )}

          {task.project_name && <div className="tb-detail-row">Projekt: <strong>{task.project_name}</strong></div>}
          {task.created_by_name && <div className="tb-detail-row">Erstellt von {task.created_by_name}</div>}
          {task.source === 'auto' && task.status !== 'erledigt' && (
            <div className="tb-detail-row">
              {processBound
                ? PROCESS_BOUND_HINT
                : '«Erledigt» quittiert die Aufgabe: sie gilt als bewusst nicht ausgeführt und wird vom System nicht neu erstellt.'}
            </div>
          )}
          {task.done_at && (
            <div className="tb-detail-row">
              Erledigt am {fmtDate(task.done_at)}{task.auto_done ? ' — automatisch (Bedingung behoben)' : task.done_by_name ? ` von ${task.done_by_name}` : ''}
            </div>
          )}

          <div className="tb-field-row">
            <label className="tb-field">
              <span>Status</span>
              <select className="admin-input" value={status} onChange={e => setStatus(e.target.value as BoardColumn)}>
                {statusOptions.map(c => <option key={c} value={c}>{COLUMN_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="tb-field">
              <span>Zugewiesen an</span>
              <select className="admin-input" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">— Nicht zugewiesen —</option>
                {board.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="tb-field">
              <span>Fällig am</span>
              <input type="date" className="admin-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>

          {onReminderCreated && (
            <div className="tb-detail-reminder">
              {reminderSet && <div className="tb-detail-row">Erinnerung gesetzt auf {reminderSet} — sie meldet sich per Mail und Push.</div>}
              {reminderOpen ? (
                <ReminderEditor
                  initial={{ text: task.title, date: '', time: '' }}
                  busy={busy}
                  saveLabel="Erinnerung setzen"
                  onCancel={() => setReminderOpen(false)}
                  onSave={v => void handleReminder(v)}
                />
              ) : (
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setReminderOpen(true)}>
                  🔔 Erinnerung setzen
                </button>
              )}
            </div>
          )}

          <div className="tb-detail-actions">
            {action && (
              <button
                className="admin-btn admin-btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const ok = await onAction!(task)
                  setBusy(false)
                  if (ok) onClose()
                }}
              >
                {action.longLabel}
              </button>
            )}
            {target && (
              <button className="admin-btn admin-btn-secondary" onClick={() => { onClose(); onNav(target.screen, target.detailId, target.tab) }}>
                Öffnen
              </button>
            )}
            {isManual && (
              <button className="admin-btn admin-btn-danger" disabled={busy} onClick={handleDelete}>
                Löschen
              </button>
            )}
            <button className="admin-btn admin-btn-primary" disabled={busy} onClick={handleSave} style={{ marginLeft: 'auto' }}>
              {busy ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Neue Aufgabe ────────────────────────────────────────────

interface CreateModalProps {
  board: TaskBoardResponse
  onClose: () => void
  onCreated: () => void
}

function CreateTaskModal({ board, onClose, onCreated }: CreateModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState(board.me_staff_id ?? '')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!title.trim()) { setError('Titel fehlt'); return }
    setBusy(true)
    setError(null)
    try {
      await createBoardTask({
        title: title.trim(),
        description: description.trim() || null,
        assignee_staff_id: assignee || null,
        due_date: dueDate || null,
      })
      onCreated()
      onClose()
    } catch {
      setError('Anlegen fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Neue Aufgabe</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body tb-detail">
          {error && <div className="admin-toast error">{error}</div>}
          <label className="tb-field">
            <span>Titel</span>
            <input className="admin-input" value={title} onChange={e => setTitle(e.target.value)} maxLength={300} autoFocus />
          </label>
          <label className="tb-field">
            <span>Beschreibung (optional)</span>
            <textarea className="admin-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
          </label>
          <div className="tb-field-row">
            <label className="tb-field">
              <span>Zugewiesen an</span>
              <select className="admin-input" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">— Nicht zugewiesen —</option>
                {board.staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="tb-field">
              <span>Fällig am (optional)</span>
              <input type="date" className="admin-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </label>
          </div>
          <div className="tb-detail-actions">
            <button className="admin-btn admin-btn-primary" disabled={busy} onClick={handleCreate} style={{ marginLeft: 'auto' }}>
              {busy ? 'Lege an…' : 'Aufgabe anlegen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Board ───────────────────────────────────────────────────

interface BoardColumnSpec {
  key: string
  label: string
  tasks: BoardTask[]
  droppable?: BoardColumn
  /** Farbkennung des Kopfes (CSS data-accent). */
  accent?: string
}

interface BoardListState {
  view: BoardView
  filter: string
  query: string
}

const BOARD_LIST_DEFAULTS: BoardListState = { view: 'field', filter: 'me', query: '' }
const BOARD_VIEWS: BoardView[] = ['field', 'status', 'assignee']

function reviveBoardListState(stored: Partial<BoardListState>): Partial<BoardListState> {
  const out = { ...stored }
  if (out.view !== undefined && !BOARD_VIEWS.includes(out.view)) delete out.view
  if (out.filter !== undefined && !out.filter.trim()) delete out.filter
  return out
}

export default function TaskBoardScreen({ onNav, onBadgeChange, showReminders = false }: Props) {
  const [board, setBoard] = useState<TaskBoardResponse | null>(null)
  const [reminders, setReminders] = useState<Reminder[] | null>(null)
  const [reminderBusy, setReminderBusy] = useState<string | null>(null)
  // Ansicht, Filter und Suche überleben «Öffnen» und Zurück (der Screen wird
  // beim Menüwechsel unmountet) — sessionStorage wie die Projektliste, siehe
  // hooks/useListState: eine neue Sitzung fängt wieder bei «Meine» an.
  const { state: listState, patch: patchListState } = useListState(
    'admin-tasks', BOARD_LIST_DEFAULTS, reviveBoardListState)
  const { filter, query } = listState
  const setQuery = (q: string) => patchListState({ query: q })
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailTask, setDetailTask] = useState<BoardTask | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const { toast, showToast } = useToast(3000)

  async function loadReminders() {
    if (!showReminders) return
    try {
      setReminders(await getMyReminders())
    } catch {
      // Das Board bleibt bedienbar; die Spalte fehlt dann, statt leer zu lügen.
      setReminders(null)
    }
  }

  async function load(assignee = filter, refresh = false) {
    setLoading(true)
    try {
      const [b] = await Promise.all([getTaskBoard(assignee, refresh), loadReminders()])
      setBoard(b)
    } catch {
      showToast('Board konnte nicht geladen werden', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(filter) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function switchFilter(next: string) {
    patchListState({ filter: next })
    load(next)
  }

  function switchView(next: BoardView) {
    patchListState({ view: next })
    // Die PL-Ansicht ergibt nur über alle Aufgaben Sinn — Filter mitziehen.
    if (next === 'assignee' && filter !== 'all') switchFilter('all')
  }

  // Direktaktion (cardAction): Rückfrage, Endpoint, dann ein Sync am Server
  // vorbei an der Drossel — die Karte erledigt sich dadurch selbst.
  async function runAction(task: BoardTask): Promise<boolean> {
    const spec = cardAction(task)
    if (!spec || !window.confirm(spec.confirm)) return false
    setActionBusy(task.id)
    try {
      if (spec.kind === 'close_project') await closeProject(task.project_id!)
      else await sendQuoteReminder(Number(task.ref_id))
      showToast(spec.success, 'success')
      await load(filter, true)
      onBadgeChange?.()
      return true
    } catch (err: unknown) {
      showToast(err instanceof Error && err.message ? err.message : 'Aktion fehlgeschlagen', 'error')
      return false
    } finally {
      setActionBusy(null)
    }
  }

  function staffName(staffId: string | null): string | null {
    if (!staffId || !board) return null
    return board.staff.find(s => s.id === staffId)?.name ?? null
  }

  function typeLabelOf(task: BoardTask): string | null {
    return task.task_type ? board?.task_types[task.task_type]?.label ?? null : null
  }

  // Die Suche filtert die Karten, bevor gruppiert wird — auch fürs Drag & Drop:
  // der Drop-Index stammt aus der sichtbaren Spalte, also rechnet moveTask auf
  // ihr. Die neue sort_order liegt dann zwischen den sichtbaren Nachbarn; wo
  // dazwischen eine ausgeblendete Karte steht, ist ihre Lage ohnehin nicht zu sehen.
  // Gemerkte PL-Ansicht, aber das Konto darf sie (nicht mehr): wie «Bereiche».
  const view: BoardView = listState.view === 'assignee' && board && !board.can_filter_all ? 'field' : listState.view
  const visibleTasks = board ? board.tasks.filter(t => matchesQuery(t, query, typeLabelOf(t))) : []

  async function patchTask(task: BoardTask, patch: Parameters<typeof updateBoardTask>[1], optimistic: Partial<BoardTask>) {
    setBoard(b => b ? {
      ...b,
      tasks: b.tasks.map(t => t.id === task.id ? { ...t, ...optimistic } : t),
    } : b)
    try {
      await updateBoardTask(task.id, patch)
      onBadgeChange?.()
    } catch {
      showToast('Aktion fehlgeschlagen', 'error')
      load()
    }
  }

  function completeTask(task: BoardTask) {
    patchTask(task, { status: 'erledigt' }, { status: 'erledigt' })
  }

  async function completeReminder(r: Reminder) {
    setReminderBusy(r.id)
    try {
      await updateReminder(r.id, { done: true })
      setReminders(rs => (rs ?? []).filter(x => x.id !== r.id))
    } catch {
      showToast('Erinnerung konnte nicht abgehakt werden', 'error')
    } finally {
      setReminderBusy(null)
    }
  }

  async function moveTask(task: BoardTask, column: BoardColumn, targetIndex: number) {
    if (!board) return
    if (column === 'erledigt' && task.status !== 'erledigt' && isProcessBound(task, board.task_types)) {
      showToast(PROCESS_BOUND_HINT, 'error')
      return
    }
    const grouped = groupByColumn(visibleTasks, board.columns)
    const sortOrder = dropSortOrder(grouped[column], targetIndex, task.id)
    await patchTask(
      task,
      { ...(task.status !== column ? { status: column } : {}), sort_order: sortOrder },
      { status: column, sort_order: sortOrder },
    )
  }

  function handleDrop(e: React.DragEvent, column: BoardColumn, targetIndex: number) {
    e.preventDefault()
    e.stopPropagation()
    const taskId = e.dataTransfer.getData('text/task-id')
    const task = board?.tasks.find(t => t.id === taskId)
    if (task) moveTask(task, column, targetIndex)
  }

  const plOptions = board?.projektleiter ?? []
  // Kürzel auf der Karte nur, wo sie verschiedenen Personen gehören können.
  const showAvatars = !!board && board.assignee === 'all' && view !== 'assignee'
  // Erinnerungen gehören einer Person — neben fremden Aufgaben (Filter «Alle»,
  // pro Projektleiter) stünden sie am falschen Ort.
  const reminderColumn = showReminders && reminders !== null && board?.assignee === 'me' && view === 'field'
  const visibleReminders = (reminders ?? []).filter(r =>
    matchesQuery({ title: r.text, project_name: targetLabel(r), description: null }, query))

  const openTasks = visibleTasks.filter(t => t.status !== 'erledigt')
  const overdueCount = openTasks.filter(t => isOverdue(t)).length
  const dueReminders = reminderColumn ? visibleReminders.filter(r => dueBucket(r) !== 'upcoming').length : 0

  function renderCard(task: BoardTask, opts: { draggable: boolean; column?: BoardColumn; index?: number }) {
    if (!board) return null
    return (
      <TaskCard
        key={task.id}
        task={task}
        typeLabel={typeLabelOf(task)}
        assigneeName={showAvatars ? staffName(task.assignee_staff_id) : null}
        draggable={opts.draggable}
        showStatusChip={!opts.draggable}
        onClick={() => setDetailTask(task)}
        onComplete={opts.draggable || isProcessBound(task, board.task_types) ? undefined : () => completeTask(task)}
        action={(() => {
          const spec = cardAction(task)
          return spec ? { spec, busy: actionBusy === task.id, run: () => void runAction(task) } : undefined
        })()}
        onDragStart={e => e.dataTransfer.setData('text/task-id', task.id)}
        onDropBefore={opts.column !== undefined && opts.index !== undefined
          ? e => handleDrop(e, opts.column!, opts.index!)
          : undefined}
      />
    )
  }

  function renderReminderColumn() {
    return (
      <div key="reminders" className="tb-column" data-accent="reminders" data-testid="board-reminder-column">
        <div className="tb-column-header">
          <span className="tb-column-title">Erinnerungen</span>
          <span className={`tb-column-count${dueReminders > 0 ? ' alert' : ''}`}>{visibleReminders.length}</span>
        </div>
        <div className="tb-column-body">
          {visibleReminders.length === 0 && (
            <div className="tb-column-empty">
              {query ? 'Keine Treffer' : 'Keine offenen Erinnerungen — setzen lassen sie sich im Karten-Detail, am Kunden oder im Projekt.'}
            </div>
          )}
          {visibleReminders.map(r => (
            <ReminderCard
              key={r.id}
              reminder={r}
              busy={reminderBusy === r.id}
              onOpen={r.project_id
                ? () => onNav('projects', r.project_id!)
                : r.customer_id ? () => onNav('customers', r.customer_id!) : undefined}
              onDone={() => void completeReminder(r)}
            />
          ))}
        </div>
      </div>
    )
  }

  function renderColumns(columns: BoardColumnSpec[], extra?: React.ReactNode) {
    return (
      <div className={`tb-board${view === 'status' ? ' tb-board-status' : ''}`}>
        {columns.map(col => {
          const empty = col.tasks.length === 0
          // Leere Bereiche schrumpfen: fünf gleich breite Spalten, von denen zwei
          // nur «Keine Aufgaben» sagen, schoben rechts die letzte aus dem Bild.
          // Im Status-Kanban bleibt jede Spalte breit — sie ist dort Ablagefläche.
          const compact = empty && !col.droppable
          return (
            <div
              key={col.key}
              className={`tb-column${col.droppable === 'erledigt' ? ' done' : ''}${compact ? ' compact' : ''}`}
              data-accent={col.accent}
              onDragOver={col.droppable ? e => e.preventDefault() : undefined}
              onDrop={col.droppable ? e => handleDrop(e, col.droppable!, col.tasks.length) : undefined}
            >
              <div className="tb-column-header">
                <span className="tb-column-title">{col.label}</span>
                <span className={`tb-column-count${col.tasks.some(t => isOverdue(t)) ? ' alert' : ''}`}>{col.tasks.length}</span>
              </div>
              <div className="tb-column-body">
                {empty && <div className="tb-column-empty">{query ? 'Keine Treffer' : 'Keine Aufgaben'}</div>}
                {col.tasks.map((task, idx) => renderCard(task, {
                  draggable: !!col.droppable,
                  column: col.droppable,
                  index: idx,
                }))}
              </div>
            </div>
          )
        })}
        {extra}
      </div>
    )
  }

  function renderBoard() {
    if (!board) return null
    if (view === 'status') {
      const grouped = groupByColumn(visibleTasks, board.columns)
      return renderColumns(board.columns.map(c => ({
        key: c, label: COLUMN_LABELS[c], tasks: grouped[c], droppable: c, accent: c,
      })))
    }
    if (view === 'assignee') {
      const grouped = groupByAssignee(visibleTasks)
      const staffCols = board.staff
        .filter(s => (grouped.get(s.id) ?? []).length > 0)
        .map(s => ({ key: s.id, label: s.name ?? '?', tasks: grouped.get(s.id) ?? [], accent: 'person' }))
      return renderColumns([
        { key: 'none', label: 'Nicht zugewiesen', tasks: grouped.get(null) ?? [], accent: 'none' },
        ...staffCols,
      ])
    }
    const fieldKeys = board.fields.map(f => f.key)
    const grouped = groupByField(visibleTasks, fieldKeys, board.task_types)
    return renderColumns(
      board.fields.map(f => ({ key: f.key, label: f.label, tasks: grouped[f.key] ?? [], accent: f.key })),
      reminderColumn ? renderReminderColumn() : undefined,
    )
  }

  const summary = board
    ? [
        `${openTasks.length} offen`,
        overdueCount > 0 ? `${overdueCount} überfällig` : null,
        dueReminders > 0 ? `${dueReminders} Erinnerung${dueReminders === 1 ? '' : 'en'} fällig` : null,
      ].filter(Boolean).join(' · ')
    : 'Automatisch abgeleitete und manuelle Aufgaben'

  return (
    // admin-page-wide: fünf Bereiche (+ Erinnerungen) à 240px passen nicht in
    // die 1200px von .admin-page — «Manuell» lief rechts aus dem Bild, auch auf
    // einem breiten Bildschirm (gleiche Lösung wie das Roadmap-Board).
    <div className="admin-page admin-page-wide tb-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Aufgaben</div>
          <div className="admin-page-subtitle">{summary}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn admin-btn-secondary" onClick={() => load(filter, true)} disabled={loading}>
            Aktualisieren
          </button>
          <button className="admin-btn admin-btn-primary" onClick={() => setShowCreate(true)} disabled={!board}>
            + Aufgabe
          </button>
        </div>
      </div>

      <ToastHost toast={toast} />

      <div className="tb-filterbar">
        <div className="tb-filtergroup" role="group" aria-label="Ansicht">
          <span className="tb-filterbar-label">Ansicht</span>
          <button className={`tb-chip${view === 'field' ? ' active' : ''}`} onClick={() => switchView('field')}>Bereiche</button>
          <button className={`tb-chip${view === 'status' ? ' active' : ''}`} onClick={() => switchView('status')}>Status</button>
          {board?.can_filter_all && (
            <button className={`tb-chip${view === 'assignee' ? ' active' : ''}`} onClick={() => switchView('assignee')}>Projektleiter</button>
          )}
        </div>

        {board?.can_filter_all && view !== 'assignee' && (
          <div className="tb-filtergroup" role="group" aria-label="Wessen Aufgaben">
            <span className="tb-filterbar-label">Wer</span>
            <button className={`tb-chip${filter === 'me' ? ' active' : ''}`} onClick={() => switchFilter('me')}>Meine</button>
            <button className={`tb-chip${filter === 'all' ? ' active' : ''}`} onClick={() => switchFilter('all')}>Alle</button>
            <button className={`tb-chip${filter === 'none' ? ' active' : ''}`} onClick={() => switchFilter('none')}>Nicht zugewiesen</button>
            <select
              className={`admin-input tb-pl-select${plOptions.some(p => p.id === filter) ? ' active' : ''}`}
              value={plOptions.some(p => p.id === filter) ? filter : ''}
              onChange={e => e.target.value && switchFilter(e.target.value)}
            >
              <option value="">Projektleiter…</option>
              {plOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <input
          type="search"
          className="admin-input tb-search"
          placeholder="Suchen (Projekt, Offerte, Kunde …)"
          aria-label="Aufgaben durchsuchen"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {board === null && loading && (
        <div className="admin-loading"><div className="admin-spinner" />Lade Aufgaben…</div>
      )}

      {renderBoard()}

      {detailTask && board && (
        <TaskDetailModal
          task={detailTask}
          board={board}
          onClose={() => setDetailTask(null)}
          onChanged={() => { load(); onBadgeChange?.() }}
          onNav={onNav}
          onReminderCreated={showReminders ? () => void loadReminders() : undefined}
          onAction={runAction}
        />
      )}

      {showCreate && board && (
        <CreateTaskModal
          board={board}
          onClose={() => setShowCreate(false)}
          onCreated={() => { load(); onBadgeChange?.() }}
        />
      )}
    </div>
  )
}

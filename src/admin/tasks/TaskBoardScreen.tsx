import { useEffect, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  BoardColumn, BoardTask, TaskBoardResponse,
  createBoardTask, deleteBoardTask, getTaskBoard, updateBoardTask,
} from '../../api/admin'
import { AdminScreen } from '../useAdminNav'
import { useToast, ToastHost } from '../components/useToast'
import { fmtDate } from '../utils/format'
import {
  BoardView, COLUMN_LABELS, daysSince, dropSortOrder,
  groupByAssignee, groupByColumn, groupByField, isOverdue, isProcessBound,
} from './taskBoardLogic'

const PROCESS_BOUND_HINT = 'Fester Prozessschritt — erledigt sich automatisch, sobald die Arbeit getan ist.'

interface Props {
  onNav: (screen: AdminScreen, detailId?: string) => void
  onBadgeChange?: () => void
}

/** Deep-Link von der Karte zum Quell-Datensatz. */
function navTarget(task: BoardTask): { screen: AdminScreen; detailId?: string } | null {
  switch (task.ref_kind) {
    case 'quote': return { screen: 'quotes' }
    case 'invoice': return { screen: 'invoices' }
    case 'project': return task.project_id ? { screen: 'projects', detailId: task.project_id } : { screen: 'projects' }
    case 'draft': return { screen: 'project-drafts' }
    case 'approval': return { screen: 'dashboard' }
    case 'aftersales': return { screen: 'aftersales' }
    default:
      return task.project_id ? { screen: 'projects', detailId: task.project_id } : null
  }
}

function initials(name: string | null | undefined): string {
  return (name ?? '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

// ─── Karte ───────────────────────────────────────────────────

interface CardProps {
  task: BoardTask
  typeLabel: string | null
  assigneeName: string | null
  /** Status-Kanban: Karte ist per Drag & Drop verschiebbar. */
  draggable: boolean
  /** Feld-/PL-Ansicht: Status als Chip + Schnell-Erledigen auf der Karte. */
  showStatusChip: boolean
  onClick: () => void
  onComplete?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDropBefore?: (e: React.DragEvent) => void
}

function TaskCard({ task, typeLabel, assigneeName, draggable, showStatusChip, onClick, onComplete, onDragStart, onDropBefore }: CardProps) {
  const overdue = isOverdue(task)
  return (
    <div
      className={`tb-card${task.status === 'erledigt' ? ' done' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? e => e.preventDefault() : undefined}
      onDrop={draggable ? onDropBefore : undefined}
      onClick={onClick}
    >
      <div className="tb-card-top">
        <span className={`tb-card-type${task.source === 'manuell' ? ' manual' : ''}`}>
          {task.source === 'manuell' ? 'Manuell' : (typeLabel ?? task.task_type)}
        </span>
        <span className="tb-card-top-right">
          {showStatusChip && (task.status === 'in_arbeit' || task.status === 'wartet') && (
            <span className={`tb-status-chip ${task.status}`}>{COLUMN_LABELS[task.status]}</span>
          )}
          {assigneeName && <span className="tb-card-avatar" title={assigneeName}>{initials(assigneeName)}</span>}
        </span>
      </div>
      <div className="tb-card-title">{task.title}</div>
      {task.project_name && task.ref_kind !== 'project' && (
        <div className="tb-card-project">{task.project_name}</div>
      )}
      <div className="tb-card-meta">
        {task.due_date
          ? <span className={overdue ? 'tb-due overdue' : 'tb-due'}>Fällig: {fmtDate(task.due_date)}</span>
          : task.status === 'erledigt' && task.done_at
            ? <span>Erledigt: {fmtDate(task.done_at)}{task.auto_done ? ' (System)' : ''}</span>
            : <span>seit {daysSince(task.created_at)} Tagen</span>}
        {onComplete && task.status !== 'erledigt' && (
          <button
            className="tb-card-done-btn"
            title={task.source === 'manuell'
              ? 'Als erledigt markieren'
              : 'Quittieren — Aufgabe bewusst nicht ausführen (wird nicht neu erstellt)'}
            onClick={e => { e.stopPropagation(); onComplete() }}
          >
            ✓
          </button>
        )}
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
}

function TaskDetailModal({ task, board, onClose, onChanged, onNav }: DetailModalProps) {
  const isManual = task.source === 'manuell'
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [status, setStatus] = useState<BoardColumn>(task.status)
  const [assignee, setAssignee] = useState(task.assignee_staff_id ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = navTarget(task)
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

          <div className="tb-detail-actions">
            {target && (
              <button className="admin-btn admin-btn-secondary" onClick={() => { onClose(); onNav(target.screen, target.detailId) }}>
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

export default function TaskBoardScreen({ onNav, onBadgeChange }: Props) {
  const [board, setBoard] = useState<TaskBoardResponse | null>(null)
  const [filter, setFilter] = useState('me')
  const [view, setView] = useState<BoardView>('field')
  const [loading, setLoading] = useState(true)
  const [detailTask, setDetailTask] = useState<BoardTask | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const { toast, showToast } = useToast(3000)

  async function load(assignee = filter, refresh = false) {
    setLoading(true)
    try {
      setBoard(await getTaskBoard(assignee, refresh))
    } catch {
      showToast('Board konnte nicht geladen werden', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load('me') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function switchFilter(next: string) {
    setFilter(next)
    load(next)
  }

  function switchView(next: BoardView) {
    setView(next)
    // Die PL-Ansicht ergibt nur über alle Aufgaben Sinn — Filter mitziehen.
    if (next === 'assignee' && filter !== 'all') switchFilter('all')
  }

  function staffName(staffId: string | null): string | null {
    if (!staffId || !board) return null
    return board.staff.find(s => s.id === staffId)?.name ?? null
  }

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

  async function moveTask(task: BoardTask, column: BoardColumn, targetIndex: number) {
    if (!board) return
    if (column === 'erledigt' && task.status !== 'erledigt' && isProcessBound(task, board.task_types)) {
      showToast(PROCESS_BOUND_HINT, 'error')
      return
    }
    const grouped = groupByColumn(board.tasks, board.columns)
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

  function renderCard(task: BoardTask, opts: { draggable: boolean; column?: BoardColumn; index?: number }) {
    if (!board) return null
    return (
      <TaskCard
        key={task.id}
        task={task}
        typeLabel={task.task_type ? board.task_types[task.task_type]?.label ?? null : null}
        assigneeName={staffName(task.assignee_staff_id)}
        draggable={opts.draggable}
        showStatusChip={!opts.draggable}
        onClick={() => setDetailTask(task)}
        onComplete={opts.draggable || isProcessBound(task, board.task_types) ? undefined : () => completeTask(task)}
        onDragStart={e => e.dataTransfer.setData('text/task-id', task.id)}
        onDropBefore={opts.column !== undefined && opts.index !== undefined
          ? e => handleDrop(e, opts.column!, opts.index!)
          : undefined}
      />
    )
  }

  function renderColumns(columns: { key: string; label: string; tasks: BoardTask[]; droppable?: BoardColumn }[]) {
    return (
      <div className="tb-board">
        {columns.map(col => (
          <div
            key={col.key}
            className={`tb-column${col.droppable === 'erledigt' ? ' done' : ''}`}
            onDragOver={col.droppable ? e => e.preventDefault() : undefined}
            onDrop={col.droppable ? e => handleDrop(e, col.droppable!, col.tasks.length) : undefined}
          >
            <div className="tb-column-header">
              <span>{col.label}</span>
              <span className="tb-column-count">{col.tasks.length}</span>
            </div>
            <div className="tb-column-body">
              {col.tasks.length === 0 && <div className="tb-column-empty">Keine Aufgaben</div>}
              {col.tasks.map((task, idx) => renderCard(task, {
                draggable: !!col.droppable,
                column: col.droppable,
                index: idx,
              }))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderBoard() {
    if (!board) return null
    if (view === 'status') {
      const grouped = groupByColumn(board.tasks, board.columns)
      return renderColumns(board.columns.map(c => ({
        key: c, label: COLUMN_LABELS[c], tasks: grouped[c], droppable: c,
      })))
    }
    if (view === 'assignee') {
      const grouped = groupByAssignee(board.tasks)
      const staffCols = board.staff
        .filter(s => (grouped.get(s.id) ?? []).length > 0)
        .map(s => ({ key: s.id, label: s.name ?? '?', tasks: grouped.get(s.id) ?? [] }))
      return renderColumns([
        { key: 'none', label: 'Nicht zugewiesen', tasks: grouped.get(null) ?? [] },
        ...staffCols,
      ])
    }
    const fieldKeys = board.fields.map(f => f.key)
    const grouped = groupByField(board.tasks, fieldKeys, board.task_types)
    return renderColumns(board.fields.map(f => ({
      key: f.key, label: f.label, tasks: grouped[f.key] ?? [],
    })))
  }

  return (
    <div className="admin-page tb-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Aufgaben</div>
          <div className="admin-page-subtitle">Automatisch abgeleitete und manuelle Aufgaben</div>
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
        <span className="tb-filterbar-label">Ansicht:</span>
        <button className={`tb-chip${view === 'field' ? ' active' : ''}`} onClick={() => switchView('field')}>Bereiche</button>
        <button className={`tb-chip${view === 'status' ? ' active' : ''}`} onClick={() => switchView('status')}>Status</button>
        {board?.can_filter_all && (
          <button className={`tb-chip${view === 'assignee' ? ' active' : ''}`} onClick={() => switchView('assignee')}>Projektleiter</button>
        )}

        {board?.can_filter_all && view !== 'assignee' && (
          <>
            <span className="tb-filterbar-sep" />
            <button className={`tb-chip${filter === 'me' ? ' active' : ''}`} onClick={() => switchFilter('me')}>Meine</button>
            <button className={`tb-chip${filter === 'all' ? ' active' : ''}`} onClick={() => switchFilter('all')}>Alle</button>
            <button className={`tb-chip${filter === 'none' ? ' active' : ''}`} onClick={() => switchFilter('none')}>Nicht zugewiesen</button>
            <select
              className="admin-input tb-pl-select"
              value={plOptions.some(p => p.id === filter) ? filter : ''}
              onChange={e => e.target.value && switchFilter(e.target.value)}
            >
              <option value="">Projektleiter…</option>
              {plOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
        )}
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

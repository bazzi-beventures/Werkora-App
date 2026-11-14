// Aufgaben (Checkliste) im Planungs-Panel der Einsatzplanung. Zustand und Handler
// kommen aus useScheduleTasks; seit Charge M4a (Spec refactoring-wachstum.md §17)
// eigene Komponente, vorher Teil von ProjectScheduleScreen.tsx.
import type { ScheduleTasks } from './useScheduleTasks'

interface Props {
  /** Projekt-ID im Panel; leer bei einem noch nicht gespeicherten internen Einsatz. */
  projectId: string
  aufgaben: ScheduleTasks
}

export function ScheduleTasksSection({ projectId, aufgaben }: Props) {
  const {
    tasks, tasksLoading, newTaskText, setNewTaskText, taskBusy,
    editingTaskId, editingTaskText, setEditingTaskText, startEdit, cancelEdit,
    handleAddTask, handleSaveTaskEdit, handleDeleteTask,
  } = aufgaben
  return (
    <>
    {/* ── Aufgaben (Checkliste) ────────────────────────── */}
    <div className="project-schedule-divider" />

    <div className="project-schedule-field">
      <div className="project-schedule-field-head">
        <span>Aufgaben</span>
        {tasks.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {tasks.filter(t => t.is_done).length}/{tasks.length} erledigt
          </span>
        )}
      </div>

      {!projectId ? (
        // Aufgaben brauchen eine Projekt-ID — die entsteht erst beim
        // ersten Speichern (neuer interner Einsatz).
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
          Nach dem Speichern lassen sich hier Aufgaben erfassen.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="admin-input"
              style={{ flex: 1 }}
              value={newTaskText}
              onChange={e => setNewTaskText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void handleAddTask() }
              }}
              placeholder="Neue Aufgabe… (z.B. Schlüssel beim Hauswart abholen)"
            />
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={handleAddTask}
              disabled={taskBusy || !newTaskText.trim()}
            >
              + Aufgabe
            </button>
          </div>

          {tasksLoading && tasks.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Lade Aufgaben…</div>
          )}
          {!tasksLoading && tasks.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
              Noch keine Aufgaben. Der Monteur hakt sie in der App ab.
            </div>
          )}

          {tasks.map(t => (
            <div key={t.id} className="project-schedule-task-row">
              {editingTaskId === t.id ? (
                <>
                  <input
                    className="admin-input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={editingTaskText}
                    onChange={e => setEditingTaskText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); void handleSaveTaskEdit() }
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="project-schedule-mini-btn"
                    onClick={handleSaveTaskEdit}
                    disabled={taskBusy || !editingTaskText.trim()}
                  >
                    {/* Bewusst nicht «Speichern»: das steht unten am
                        Panel und meint die Projekt-Stammdaten. */}
                    Übernehmen
                  </button>
                  <button
                    type="button"
                    className="project-schedule-mini-btn"
                    onClick={cancelEdit}
                    disabled={taskBusy}
                  >
                    Abbrechen
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={`project-schedule-task-text${t.is_done ? ' done' : ''}`}
                    title={t.is_done && t.done_by_name ? `Erledigt von ${t.done_by_name}` : t.text}
                  >
                    {t.is_done ? '✓ ' : ''}{t.text}
                  </span>
                  <button
                    type="button"
                    className="project-schedule-mini-btn"
                    onClick={() => startEdit(t)}
                    disabled={taskBusy}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="admin-btn-icon danger"
                    title="Aufgabe löschen"
                    onClick={() => void handleDeleteTask(t.id)}
                    disabled={taskBusy}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
    </>
  )
}

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MAX_DRAIN_ATTEMPTS, QueuedTaskToggle, enqueueTaskToggle, loadTaskQueue,
  reconcileTaskQueue, saveTaskQueue, taskKey,
} from './taskQueue'

// Der Versuchs-Deckel ist der Prüfgegenstand: vor diesem Modul wurde attempts
// hochgezählt, aber nie gelesen — ein dauerhaft fehlschlagender Eintrag
// (gelöschte Aufgabe → 404, CORS-Dauerfehler) wurde bei jedem online-Event neu
// versucht, für immer. Genau die Endlos-Queue, vor der api/client.ts warnt.

function item(over: Partial<QueuedTaskToggle> = {}): QueuedTaskToggle {
  return { project_id: 'p1', task_id: 't1', is_done: true, queued_at: '2026-08-18T05:00:00Z', ...over }
}

beforeEach(() => localStorage.clear())

describe('reconcileTaskQueue', () => {
  it('entfernt erfolgreich gesendete Einträge', () => {
    const a = item()
    expect(reconcileTaskQueue([a], new Set([taskKey(a)]), [])).toEqual([])
  })

  it('behält Fehlversuche mit erhöhten attempts', () => {
    const a = item()
    const failed = { ...a, attempts: 1 }
    expect(reconcileTaskQueue([a], new Set(), [failed])).toEqual([failed])
  })

  it('verwirft einen Eintrag, sobald er den Deckel erreicht', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = item({ attempts: MAX_DRAIN_ATTEMPTS - 1 })
    const failed = { ...a, attempts: MAX_DRAIN_ATTEMPTS }
    expect(reconcileTaskQueue([a], new Set(), [failed])).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('unter dem Deckel bleibt der Eintrag — bis genau zum letzten Versuch', () => {
    const a = item({ attempts: MAX_DRAIN_ATTEMPTS - 2 })
    const failed = { ...a, attempts: MAX_DRAIN_ATTEMPTS - 1 }
    expect(reconcileTaskQueue([a], new Set(), [failed])).toEqual([failed])
  })

  it('ein Re-Toggle während des Drains gewinnt gegen den Fehlversuch', () => {
    // Der Drain arbeitete auf dem alten Eintrag; währenddessen hat der Monteur
    // die Aufgabe erneut getoggelt (neues queued_at). Der neue Wunsch gilt und
    // startet mit frischen attempts — der Fehlversuch gehörte zum alten Stand.
    const old = item({ queued_at: '2026-08-18T05:00:00Z' })
    const retoggled = item({ queued_at: '2026-08-18T05:01:00Z', is_done: false })
    const failedOld = { ...old, attempts: MAX_DRAIN_ATTEMPTS }
    expect(reconcileTaskQueue([retoggled], new Set(), [failedOld])).toEqual([retoggled])
  })

  it('lässt Einträge anderer Aufgaben unangetastet', () => {
    const a = item({ task_id: 't1' })
    const b = item({ task_id: 't2' })
    expect(reconcileTaskQueue([a, b], new Set([taskKey(a)]), [])).toEqual([b])
  })
})

describe('enqueueTaskToggle', () => {
  it('kollabiert mehrfaches Togglen derselben Aufgabe auf den letzten Stand', () => {
    enqueueTaskToggle(item({ is_done: true, queued_at: 'A' }))
    enqueueTaskToggle(item({ is_done: false, queued_at: 'B' }))
    const q = loadTaskQueue()
    expect(q).toHaveLength(1)
    expect(q[0].is_done).toBe(false)
    expect(q[0].queued_at).toBe('B')
  })

  it('übersteht defektes JSON im Slot (selbstheilend)', () => {
    localStorage.setItem('hinweise_offline_queue', '{kaputt')
    expect(loadTaskQueue()).toEqual([])
    saveTaskQueue([item()])
    expect(loadTaskQueue()).toHaveLength(1)
  })
})

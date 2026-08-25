import { useState } from 'react'
import { advance, retreat } from '../shared/navHistory'

export type AdminScreen =
  | 'dashboard'
  | 'tasks'
  | 'my-time'
  | 'staff'
  | 'bulk-clockin'
  | 'absences'
  | 'corrections'
  | 'hr-reports'
  | 'vacation'
  | 'projects'
  | 'project-drafts'
  | 'project-schedule'
  | 'customers'
  | 'quotes'
  | 'invoices'
  | 'aftersales'
  | 'payment-reconciliation'
  | 'suppliers'
  | 'staff-roles'
  | 'materials'
  | 'pricing-rules'
  | 'quote-templates'
  | 'users'
  | 'kpis'
  | 'document-backup'
  | 'admin-tools'

// Eine besuchte Station im Admin-Bereich. `detailId` gehört dazu: derselbe
// Screen mit anderer Detail-ID ist für den Zurück-Knopf eine eigene Station.
export interface AdminLocation {
  screen: AdminScreen
  detailId: string | null
}

const sameLocation = (a: AdminLocation, b: AdminLocation) =>
  a.screen === b.screen && a.detailId === b.detailId

export interface AdminNavState {
  screen: AdminScreen
  detailId: string | null
  resetTick: number
  nav: (screen: AdminScreen, detailId?: string) => void
  clearDetail: () => void
  /**
   * Die zuletzt verlassene Station, oder `null` an der Wurzel (Dashboard beim
   * Betreten des Bereichs). AdminApp hängt daran den Hardware-Zurück — und
   * schickt sie durch `guardedNav`, damit die «ungespeicherte Änderungen»-
   * Abfrage auch für den Zurück-Knopf gilt.
   */
  previous: AdminLocation | null
}

export function useAdminNav(): AdminNavState {
  const [screen, setScreen] = useState<AdminScreen>('dashboard')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [resetTick, setResetTick] = useState(0)
  // Besuchte Stationen ohne die aktuelle.
  const [history, setHistory] = useState<AdminLocation[]>([])

  function nav(nextScreen: AdminScreen, nextDetailId?: string) {
    const nextDetail = nextDetailId ?? null
    if (nextScreen === screen && nextDetail === detailId) {
      setResetTick(t => t + 1)
    }
    // `advance` erkennt den Rundweg selbst: Zurück auf eine schon besuchte
    // Station schneidet den Verlauf dorthin zurück, statt ihn zu verlängern.
    // Deshalb braucht der Zurück-Knopf keinen eigenen Pfad — er navigiert
    // schlicht auf `previous`.
    setHistory(h => advance(h, { screen, detailId }, { screen: nextScreen, detailId: nextDetail }, sameLocation))
    setScreen(nextScreen)
    setDetailId(nextDetail)
  }

  // Der Screen hat einen Deep-Link-Parameter verbraucht (Neu-Maske geöffnet,
  // Status-Filter gesetzt). Das ist keine Navigation — der Verlauf bleibt, wie
  // er ist, sonst führte Zurück auf dieselbe Station mit wieder gesetztem
  // Parameter.
  function clearDetail() {
    setDetailId(null)
  }

  return { screen, detailId, resetTick, nav, clearDetail, previous: retreat(history).previous ?? null }
}

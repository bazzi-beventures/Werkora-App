import { describe, it, expect } from 'vitest'

// Ratchet: Bestätigungs-Overlays nur noch über die zwei dokumentierten Systeme.
//
// Vor der Konsolidierung lag rohes `admin-confirm-overlay`-Markup in 10 Dateien —
// mit uneinheitlichem Esc-/Backdrop-Verhalten (teils gar keins, teils ein plain
// onClick, das eine Textauswahl neben der Box als «schliessen» las). Heute gilt:
//   Bestätigungen  → <ConfirmDialog/> (auch drei-Wege via extraAction)
//   eigene Overlays → Pflicht backdropCloseProps aus shared/backdropClose
//
// Die Liste unten friert den Rest ein: neue Dateien mit eigenem Overlay-Markup
// lassen den Test rot werden, und wer eine Altlast abbaut, senkt hier die Zahl.
// Glob ab Projektwurzel, damit die Schlüssel als src-relative Pfade lesbar sind
// (ein relativer Glob liefert './ConfirmDialog.tsx' bzw. '../operative/…').
const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const OVERLAY = /className="admin-confirm-overlay"/g

// Pfad (relativ zu src/) → erlaubte Anzahl Overlay-Wurzeln.
const ALLOWED: Record<string, number> = {
  // Die zwei gemeinsamen Komponenten — hier gehört das Markup hin.
  'admin/components/ConfirmDialog.tsx': 1,
  'admin/components/UnsavedChangesDialog.tsx': 1,
  // Versand-Dialoge: eigenes Formular-Overlay, beide mit backdropCloseProps.
  'admin/operative/SendQuoteDialog.tsx': 1,
  // Danke-Mail und Auftragsbestätigung teilen sich ein Overlay (SendQuoteMailDialog).
  'admin/operative/SendQuoteMailDialog.tsx': 1,
  // Die drei Erfassungsmasken des Projekt-Details, mit H3 aus dem Screen gezogen.
  // Alle drei schliessen per Backdrop, ohne Eingaben zu verlieren: Rapport und
  // Offerte-bearbeiten via backdropCloseProps + Dirty-Rückfrage, Neue Offerte
  // delegiert an den Verlassen-Flow des Formulars (requestClose-Handle).
  'admin/operative/projectDetail/ProjectMaskDialogs.tsx': 3,
  // Die Freigabe-Maske, ebenfalls mit H3 ausgezogen (mit backdropCloseProps).
  'admin/operative/projectDetail/ApprovalCreateDialog.tsx': 1,
}

function countByFile(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [path, src] of Object.entries(SOURCES)) {
    if (/\.test\.tsx?$/.test(path)) continue
    const hits = src.match(OVERLAY)?.length ?? 0
    if (hits > 0) counts[path.replace(/^\/src\//, '')] = hits
  }
  return counts
}

describe('Modal-Konsolidierung', () => {
  // Ohne diese Probe wäre der Ratchet auch dann grün, wenn der Glob ins Leere
  // greift oder das Muster nichts mehr trifft.
  it('scannt die Quellen und erkennt Overlay-Markup', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect('<div className="admin-confirm-overlay">'.match(OVERLAY)?.length).toBe(1)
  })

  it('kein rohes admin-confirm-overlay ausserhalb der bekannten Stellen', () => {
    expect(countByFile()).toEqual(ALLOWED)
  })
})

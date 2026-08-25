import type React from 'react'

// Klick-aufs-Overlay-schliesst — aber sicher gegen Textauswahl-Drags UND gegen
// den Verlust bereits erfasster Eingaben.
//
// Problem 1 (Drag): beginnt man eine Textauswahl in einem Feld und lässt die Maus
// AUSSERHALB der Box los, feuert der Browser den click auf dem gemeinsamen
// Vorfahren (= Overlay) → ein plain onClick={onClose} schliesst das Fenster
// mitten in der Eingabe. Der Guard schliesst nur, wenn mousedown UND click
// beide auf dem Backdrop selbst landen. (Muster aus PdfExtractionReviewModal.)
//
// Problem 2 (echter Klick daneben): auch ein sauberer Klick neben das Fenster
// warf bisher ein halb ausgefülltes Formular kommentarlos weg — genau das ist bei
// der Offerten-/Vorlagen-Erfassung passiert. Deshalb `blockWhen`: solange etwas
// Ungespeichertes drinsteht, schliesst der Backdrop-Klick nicht mehr, sondern
// meldet sich über `onBlocked` (typischerweise ein «Eingaben verwerfen?»-Dialog).
// Fenster ohne Eingaben (reine Detailansichten) rufen die Funktion wie bisher
// einargumentig auf und schliessen weiterhin direkt.
//
// Verwendung (Einzeiler, kein Hook nötig — der Zustand liegt am DOM-Knoten):
//   <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
//   <div className="admin-modal-overlay" {...backdropCloseProps(onClose, {
//     blockWhen: () => isDirty, onBlocked: () => setConfirmDiscard(true),
//   })}>
export function backdropCloseProps(
  onClose: () => void,
  opts?: {
    /** true = Fenster hat ungespeicherte Eingaben, Backdrop-Klick darf nicht schliessen. */
    blockWhen?: () => boolean
    /** Wird statt onClose gerufen, wenn blockWhen greift (z.B. Rückfrage öffnen). */
    onBlocked?: () => void
  },
): {
  onMouseDown: React.MouseEventHandler<HTMLDivElement>
  onClick: React.MouseEventHandler<HTMLDivElement>
} {
  return {
    onMouseDown: e => {
      ;(e.currentTarget as HTMLElement & { _mdOnBackdrop?: boolean })._mdOnBackdrop =
        e.target === e.currentTarget
    },
    onClick: e => {
      const el = e.currentTarget as HTMLElement & { _mdOnBackdrop?: boolean }
      const onBackdrop = e.target === e.currentTarget && el._mdOnBackdrop
      el._mdOnBackdrop = false
      if (!onBackdrop) return
      if (opts?.blockWhen?.()) { opts.onBlocked?.(); return }
      onClose()
    },
  }
}

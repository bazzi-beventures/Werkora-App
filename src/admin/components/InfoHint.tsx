import { useState } from 'react'

// Tap-bare Kurz-Erklärung: ⓘ-Button klappt eine Hilfezeile auf. Ersatz für
// title=-Tooltips, die auf Touch nicht sichtbar sind. Bewusst ohne Popover/
// Portal — reines Inline-Aufklappen, damit iOS-tauglich.
export function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="admin-info-hint-btn"
        aria-label="Erklärung anzeigen"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        ⓘ
      </button>
      {open && (
        <div className="admin-form-hint" style={{ flexBasis: '100%', marginTop: 4 }}>
          {text}
        </div>
      )}
    </>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { backdropCloseProps } from '../../../shared/backdropClose'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { QuoteCreateForm } from '../quotes/QuoteCreateForm'
import type { QuoteCreateFormHandle } from '../quotes/QuoteCreateForm'
import { QuoteEditForm } from '../quotes/QuoteEditForm'
import type { QuoteDetail } from '../quotes/quoteTypes'
import { ReportCreateForm } from '../ReportCreateForm'
import type { Project } from '../../../api/admin/projects'
import type { ProjectQuote } from './types'
import type { StaffMember } from './DetailsForm'

// Die drei grossen Erfassungsmasken ueber dem Projekt-Detail (Charge H, H3):
// neue Offerte, Rapport (erfassen ODER bearbeiten) und Offerte bearbeiten.
//
// Sie liegen zusammen, weil sie sich denselben Rahmen teilen — 920 px breit,
// scrollend, ueber dem Screen. Alle drei schliessen per Klick neben das
// Fenster, aber nie auf Kosten offener Eingaben:
//   - Neue Offerte: der Backdrop-Klick wird ans Formular delegiert
//     (requestClose-Handle) — es besitzt den Verlassen-Flow selbst
//     (localStorage-Entwurf + Entwurf-behalten/verwerfen-Rueckfrage).
//   - Rapport und Offerte bearbeiten: kein Entwurf, der Stand lebt nur im
//     State. Die Maske meldet ueber onDirtyChange, ob etwas offen ist; dann
//     kommt zuerst die Verwerfen-Rueckfrage. Die Rueckfrage gehoert dieser
//     Datei, nicht dem Screen: sie betrifft ausschliesslich diese Overlays.
//
// Der React-Compiler-Lint meldet fuer `blockWhen` «Cannot access refs during
// render» — ein Fehlalarm: backdropCloseProps reicht die Funktion nur an
// onClick weiter, gelesen wird die Ref erst beim Klick. Der Dirty-Stand MUSS
// eine Ref sein; als State wuerde jeder Tastendruck in der Offerte den ganzen
// Screen neu rendern. Dasselbe Muster loest /immutability (Setzen des
// Dirty-Flags) und /preserve-manual-memoization aus.
//
// Der Disable steht DATEIWEIT, nicht je Zeile: der Compiler meldet den ganzen
// `backdropCloseProps(...)`-Aufruf, und in JSX-Attributposition wirkt
// `eslint-disable-next-line` nicht. Alle neun Meldungen dieser Datei gehen auf
// dieses eine Muster zurueck. Wer hier neuen Code mit echtem Ref-Zugriff im
// Render schreibt, bekommt keine Warnung mehr — beim naechsten Umbau dieser
// Datei den Disable pruefen. Spec: docs/specs/refactoring-charge-h-frontend-grossbaustellen.md §4.
/* eslint-disable react-hooks/refs, react-hooks/immutability, react-hooks/preserve-manual-memoization */

export function ProjectMaskDialogs({
  project, staff, quotes,
  showQuoteForm, onQuoteDone, onQuoteCancel,
  showReportForm, editReportId, reportDefaultPartial, onReportDone, onReportCancel,
  editQuote, onEditQuoteDone, onEditQuoteClose,
  reportDirtyRef,
}: {
  project: Project
  staff: StaffMember[]
  /** Der Rapport verrechnet gegen angenommene Offerten — deshalb hier. */
  quotes: ProjectQuote[]
  showQuoteForm: boolean
  onQuoteDone: (warning?: string) => void
  onQuoteCancel: () => void
  showReportForm: boolean
  /** Gesetzt = dieselbe Maske im Bearbeiten-Modus fuer genau diesen Rapport. */
  editReportId: number | null
  /** Vorauswahl der Teilrapport-Checkbox bei Neuerfassung — siehe ReportCreateForm. */
  reportDefaultPartial?: boolean
  onReportDone: () => void
  onReportCancel: () => void
  editQuote: QuoteDetail | null
  onEditQuoteDone: (warning?: string) => void
  onEditQuoteClose: () => void
  /**
   * Ref des Aufrufers, in die der Dirty-Stand der Rapport-Maske gespiegelt wird.
   *
   * Der Projekt-Detail meldet dem globalen Guard (`admin/unsavedChanges`) sonst nur
   * sein eigenes Formular — ein Klick in der Sidebar warf eine offene, halb
   * ausgefüllte Rapport-Maske ersatzlos weg. Eine Ref statt eines State-Callbacks aus
   * demselben Grund wie unten: jeder Tastendruck in der Maske würde sonst den ganzen
   * Screen neu rendern.
   */
  reportDirtyRef?: React.MutableRefObject<boolean>
}) {
  // Die Bearbeiten-Maske kennt keinen localStorage-Entwurf — geaenderte
  // Positionen leben nur in ihrem State. Sie meldet ueber onDirtyChange, ob
  // etwas offen ist; ein Klick neben das Fenster fragt dann nach, statt alles
  // wegzuwerfen.
  const editQuoteDirty = useRef(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const markDirty = useCallback((dirty: boolean) => { editQuoteDirty.current = dirty }, [])
  const close = useCallback(() => {
    setConfirmDiscard(false)
    editQuoteDirty.current = false
    onEditQuoteClose()
  }, [onEditQuoteClose])

  // Neue Offerte: der Backdrop-Klick laeuft ueber das requestClose-Handle des
  // Formulars — dieselbe Rueckfrage wie ✕/Esc/Abbrechen dort.
  const createFormRef = useRef<QuoteCreateFormHandle>(null)

  // Rapport erfassen/bearbeiten: gleiches Muster wie die Offerten-Bearbeitung
  // unten. ✕/Esc/Android-Zurueck der Maske laufen ueber requestReportClose und
  // damit durch DIESELBE Rueckfrage wie der Backdrop-Klick.
  const ownReportDirty = useRef(false)
  // Die Ref des Aufrufers gewinnt, damit der globale Guard denselben Stand sieht.
  const reportDirty = reportDirtyRef ?? ownReportDirty
  const [confirmReportDiscard, setConfirmReportDiscard] = useState(false)
  const markReportDirty = useCallback((dirty: boolean) => { reportDirty.current = dirty }, [reportDirty])
  const closeReport = useCallback(() => {
    setConfirmReportDiscard(false)
    reportDirty.current = false
    onReportCancel()
  }, [onReportCancel, reportDirty])
  // Verschwindet die Maske auf einem anderen Weg (Projekt-Detail schliesst), darf der
  // gemeldete Dirty-Stand nicht stehen bleiben — sonst fragt die nächste Navigation
  // nach einer Maske, die es nicht mehr gibt.
  useEffect(() => () => { reportDirty.current = false }, [reportDirty])
  const requestReportClose = useCallback(() => {
    if (reportDirty.current) setConfirmReportDiscard(true)
    else closeReport()
  }, [closeReport])

  return (
    <>
      {/* ── Dialog: Neue Offerte ─────────────────────────────── */}
      {/* Kein blockWhen: ob und was gefragt wird (Entwurf behalten/verwerfen),
          entscheidet das Formular selbst — hier wird nur delegiert. */}
      {showQuoteForm && (
        <div
          className="admin-confirm-overlay"
          {...backdropCloseProps(() => createFormRef.current?.requestClose())}
        >
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <QuoteCreateForm
              ref={createFormRef}
              lockedProjectName={project.name}
              lockedProjectId={project.id}
              onDone={onQuoteDone}
              onCancel={onQuoteCancel}
            />
          </div>
        </div>
      )}

      {/* ── Dialog: Rapport manuell erfassen / bearbeiten ─────── */}
      {(showReportForm || editReportId !== null) && (
        <div
          className="admin-confirm-overlay"
          {...backdropCloseProps(closeReport, {
              blockWhen: () => reportDirty.current,
            onBlocked: () => setConfirmReportDiscard(true),
          })}
        >
          {/* Gleiche Breite wie die Offerten-Maske: die Material-/Fixpreis-Zeilen
              haben bis zu fünf Felder pro Zeile — bei 640 px blieb je Feld so wenig
              Platz, dass Artikelnamen und Preise abgeschnitten wurden. */}
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <ReportCreateForm
              // key: beim Wechsel Erfassen ↔ Bearbeiten (und zwischen zwei Rapporten)
              // muss React die Maske neu aufbauen, sonst bliebe der State der
              // vorherigen stehen.
              key={editReportId ?? 'new'}
              project={project}
              staff={staff}
              quotes={quotes}
              editReportId={editReportId ?? undefined}
              defaultPartial={reportDefaultPartial}
              onDirtyChange={markReportDirty}
              onDone={() => { reportDirty.current = false; onReportDone() }}
              onCancel={requestReportClose}
            />
          </div>
        </div>
      )}

      {/* ── Dialog: Offerte bearbeiten (nur Entwürfe) ────────── */}
      {/* Klick ausserhalb (auf das Overlay) verlässt die Maske. Solange nichts
          geändert wurde, direkt — das PDF entsteht erst beim Speichern, Verlassen
          erzeugt nichts. Sind Änderungen offen, kommt zuerst die Rückfrage; sie
          gingen sonst ersatzlos verloren (kein Entwurf wie beim Erstellen). */}
      {editQuote && (
        <div
          className="admin-confirm-overlay"
          {...backdropCloseProps(close, {
              blockWhen: () => editQuoteDirty.current,
            onBlocked: () => setConfirmDiscard(true),
          })}
        >
          <div className="admin-confirm-box" style={{ maxWidth: 920, maxHeight: '90vh', overflow: 'auto' }}>
            <QuoteEditForm
              quote={editQuote}
              onDirtyChange={markDirty}
              onDone={warning => { close(); onEditQuoteDone(warning) }}
              onCancel={close}
            />
          </div>
        </div>
      )}

      {confirmDiscard && (
        <ConfirmDialog
          title="Änderungen verwerfen?"
          message="Die Offerte ist noch nicht gespeichert. Schliessen verwirft die Änderungen."
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          variant="danger"
          onConfirm={close}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}

      {/* Esc bei offener Rueckfrage: ReportCreateForm ruft onCancel (= erneutes
          requestReportClose, No-op bei offener Frage), der ConfirmDialog faengt
          dasselbe Esc und schliesst sich — Ergebnis «Weiter bearbeiten». */}
      {confirmReportDiscard && (
        <ConfirmDialog
          title="Rapport verwerfen?"
          message="Der Rapport ist noch nicht gespeichert. Schliessen verwirft die Eingaben."
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          variant="danger"
          onConfirm={closeReport}
          onCancel={() => setConfirmReportDiscard(false)}
        />
      )}
    </>
  )
}

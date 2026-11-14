// Rückfragen der Einsatzplanung: Projekt-Team geändert, Serientermin entfernen,
// Absenz bzw. Doppelbelegung im Einsatzzeitraum. Seit Charge M4c (Spec
// refactoring-wachstum.md §17) eigene Komponenten; vorher Teil von
// ProjectScheduleScreen.tsx. Was nach der Antwort passiert, entscheidet der Screen.
import type { AppointmentScope, ProjectAppointment } from '../../api/admin'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { fmtApptRow } from './scheduleScreenModel'
import { SCOPE_LABELS } from './seriesEdit'

export function TeamFrageDialog({ count, onAnswer }: {
  count: number
  onAnswer: (answer: 'keep' | 'apply' | 'cancel') => void
}) {
  return (
    <ConfirmDialog
      title="Projekt-Team geändert"
      message={<>
        {count === 1
          ? 'Ein bereits geplanter Termin dieses Projekts hat kein eigenes Team'
          : `${count} bereits geplante Termine dieses Projekts haben kein eigenes Team`}
        {' '}und würde{count === 1 ? '' : 'n'} das neue Projekt-Team
        übernehmen — auch vergangene Termine.
      </>}
      confirmLabel="Bestehende behalten"
      cancelLabel="Abbrechen"
      extraAction={{ label: 'Überall übernehmen', variant: 'danger', onClick: () => onAnswer('apply') }}
      onConfirm={() => onAnswer('keep')}
      onCancel={() => onAnswer('cancel')}
    />
  )
}

// Reichweite wie beim Bearbeiten — Vorgabe «nur dieser»: die Serie ist nicht
// wiederherstellbar, ein versehentliches «ganze Serie» schon gar nicht.
export function SerienLoeschenDialog({ appt, scope, setScope, busy, onConfirm, onCancel }: {
  appt: ProjectAppointment
  scope: AppointmentScope
  setScope: (s: AppointmentScope) => void
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      title="Serientermin entfernen"
      message={
        <>
          <strong>{fmtApptRow(appt)}</strong> gehört zu einer Serie.
          Was soll entfernt werden?
        </>
      }
      warning={scope === 'series'
        ? '«Ganze Serie» entfernt auch die bereits vergangenen Termine der Serie und lässt sich nicht rückgängig machen.'
        : scope === 'following'
          ? 'Die früheren Termine der Serie bleiben stehen; die Serie endet vor diesem Termin.'
          : undefined}
      confirmLabel="Entfernen"
      variant="danger"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div role="radiogroup" aria-label="Was entfernen"
           style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '4px 0 12px' }}>
        {(Object.keys(SCOPE_LABELS) as AppointmentScope[]).map(s => (
          <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="series-delete-scope"
              value={s}
              checked={scope === s}
              onChange={() => setScope(s)}
            />
            {SCOPE_LABELS[s]}
          </label>
        ))}
      </div>
    </ConfirmDialog>
  )
}

// Absenz-Rückfrage: der Server hat den Schreibvorgang mit 409 abgelehnt, weil ein
// Eingeplanter an dem Tag genehmigte Absenz hat. Ferien werden getauscht und
// Krankmeldungen enden früher als eingetragen — deshalb eine Rückfrage statt einer
// verschlossenen Tür (Spec §5.2). Dieselbe Rückfrage stellt die Doppelbelegungs-
// Warnung (WW-70) mit eigenem Titel.
export function AbsenzRueckfrageDialog({ prompt, onConfirm, onCancel }: {
  prompt: { message: string; kind?: 'absence' | 'overlap' }
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      title={prompt.kind === 'overlap' ? 'Mitarbeiter bereits eingeplant' : 'Absenz im Einsatzzeitraum'}
      message={prompt.message}
      warning={prompt.kind === 'overlap'
        ? 'Der Termin wird trotzdem gespeichert — beide Einsätze bleiben im Plan.'
        : 'Der Einsatz wird trotzdem gespeichert — die Absenz bleibt bestehen.'}
      confirmLabel={prompt.kind === 'overlap' ? 'Trotzdem speichern' : 'Trotzdem einplanen'}
      cancelLabel="Abbrechen"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

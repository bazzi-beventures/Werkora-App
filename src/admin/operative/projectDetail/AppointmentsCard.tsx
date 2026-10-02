// Kachel «Termine» in der Projektübersicht: mehrere Termine je Projekt planen,
// inkl. Team pro Termin. Bisher ging das nur in der Einsatzplanung (Kalender) —
// dort plant man aber vom Kalender her, nicht vom Projekt her.
//
// Reine Darstellung: der Entwurfs-Stand liegt im ProjectDetailScreen (dort wird
// er beim Speichern gegen den geladenen Stand diffed), die Regeln stehen in
// ../projectAppointments.ts.

import { useState } from 'react'
import { AppointmentKind, APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS } from '../../../api/admin'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateTimeInput } from '../../components/DateTimeInput'
import {
  AppointmentDraft, applyStartDate, draftTeamNames, draftTitle, effectiveTeamIds, fmtDraftWhen,
  newAppointmentDraft, nextAppointment, todayISO,
} from '../projectAppointments'

interface Props {
  appointments: AppointmentDraft[]
  // Funktionsform nur im Autosave-Pfad: nach dem Speichern eines Termins hat
  // die Maske die Liste vom Server neu — ein Array aus dem alten Render
  // überschriebe sie.
  onChange: (next: AppointmentDraft[] | ((prev: AppointmentDraft[]) => AppointmentDraft[])) => void
  staff: { id: string; name: string }[]
  // Projekt-Team aus der Einsatzplanungs-Kachel — gilt für jeden Termin ohne
  // eigenes Team.
  projectTeam: string[]
  /**
   * Selbst speichernde Maske (docs/specs/projektmaske-autosave.md §3.4): ein
   * Termin wird beim Zuklappen bzw. über «Termin speichern» gespeichert, ein
   * gespeicherter nach Rückfrage sofort entfernt. Fehlt das Objekt, gilt der
   * Knopf «Speichern» der Maske wie bisher.
   */
  autosave?: {
    commit: (key: string) => Promise<string>
    remove: (key: string) => Promise<string>
    isDirty: (d: AppointmentDraft) => boolean
  }
}

export default function AppointmentsCard({ appointments, onChange, staff, projectTeam, autosave }: Props) {
  // Nur ein Termin ist gleichzeitig aufgeklappt — sonst wird die Kachel bei
  // vier Terminen unübersichtlich lang.
  const [openKey, setOpenKey] = useState<string | null>(null)
  // Autosave: Fehler je Termin (stehen im Termin, nicht über der Maske), der
  // Termin, der gerade gespeichert wird, und die offene Entfernen-Rückfrage.
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<AppointmentDraft | null>(null)

  /** Den offenen Termin speichern, falls geändert. false = ungültig/fehlgeschlagen, er bleibt offen. */
  async function commitOpen(): Promise<boolean> {
    if (!autosave || !openKey) return true
    const cur = appointments.find(x => x.key === openKey)
    if (!cur || !autosave.isDirty(cur)) return true
    const key = openKey
    setBusyKey(key)
    const err = await autosave.commit(key)
    setBusyKey(null)
    setErrors(e => ({ ...e, [key]: err }))
    return !err
  }

  // Ohne Autosave synchron wie bisher — der Knopf «Speichern» der Maske übernimmt.
  function toggle(key: string) {
    if (!autosave) { setOpenKey(openKey === key ? null : key); return }
    void commitOpen().then(ok => { if (ok) setOpenKey(openKey === key ? null : key) })
  }

  async function saveOpen() {
    if (await commitOpen()) setOpenKey(null)
  }

  async function confirmRemoveNow() {
    const d = confirmRemove
    setConfirmRemove(null)
    if (!d || !autosave) return
    const err = await autosave.remove(d.key)
    if (err) setErrors(e => ({ ...e, [d.key]: err }))
    else if (openKey === d.key) setOpenKey(null)
  }

  const next = nextAppointment(appointments, todayISO())

  function patch(key: string, changes: Partial<AppointmentDraft>) {
    onChange(appointments.map(d => d.key === key ? { ...d, ...changes } : d))
  }

  function addAppointment() {
    if (!autosave) { appendDraft(); return }
    void commitOpen().then(ok => { if (ok) appendDraft() })
  }

  function appendDraft() {
    const draft = newAppointmentDraft('montage')
    if (autosave) onChange(prev => [...prev, draft])
    else onChange([...appointments, draft])
    setOpenKey(draft.key)
  }

  function removeAppointment(key: string) {
    onChange(appointments.filter(d => d.key !== key))
    if (openKey === key) setOpenKey(null)
  }

  function toggleMonteur(d: AppointmentDraft, id: string) {
    patch(d.key, {
      monteurIds: d.monteurIds.includes(id)
        ? d.monteurIds.filter(x => x !== id)
        : [...d.monteurIds, id],
    })
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div className="admin-section-title">Termine</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Beliebig viele Termine je Projekt (z.B. Ausmass vorab, Montage später). Ohne eigene
        Auswahl gilt beim Termin das Projekt-Team aus der Einsatzplanung. Termine erscheinen
        im Einsatz-Kalender und werden {autosave
          ? <>beim Zuklappen gespeichert — erst dann erfahren die Monteure davon.</>
          : <>mit «Speichern» übernommen.</>}
      </div>

      <div className="project-appt-next">
        {next
          ? <><strong>Nächster Termin:</strong> {draftTitle(next)} · {fmtDraftWhen(next)}
              {(() => {
                const team = draftTeamNames(next, projectTeam, staff)
                if (!team.names) return null
                return <> · {team.fromProject ? 'Projekt-Team' : 'Team'}: {team.names}</>
              })()}
            </>
          : <span style={{ color: 'var(--muted)' }}>Kein künftiger Termin geplant.</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {appointments.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Noch keine Termine geplant.</div>
        )}

        {appointments.map(d => {
          const open = openKey === d.key
          const team = draftTeamNames(d, projectTeam, staff)
          // Ohne Monteur «verschwindet» der Termin aus der Einsatzplanung —
          // Speichern lehnt ihn ab (validateDraftTeams), hier schon sichtbar.
          const noMonteur = effectiveTeamIds(d, projectTeam).length === 0
          return (
            <div key={d.key} className={`project-appt-item${open ? ' open' : ''}`}>
              <div className="project-appt-head">
                <button
                  type="button"
                  className="project-appt-summary"
                  onClick={() => toggle(d.key)}
                  aria-expanded={open}
                >
                  <span className="project-appt-kind">{draftTitle(d)}</span>
                  <span className="project-appt-when">{fmtDraftWhen(d)}</span>
                  <span
                    className="project-appt-team"
                    style={noMonteur ? { color: 'var(--danger)' } : undefined}
                  >
                    {team.names
                      ? `${team.fromProject ? 'Projekt-Team' : 'Team'}: ${team.names}`
                      : noMonteur ? 'Kein Monteur gewählt' : 'Kein Team'}
                  </span>
                </button>
                <button
                  type="button"
                  className="admin-btn-icon danger"
                  title="Termin entfernen"
                  aria-label="Termin entfernen"
                  onClick={() => {
                    if (autosave && d.id) setConfirmRemove(d)
                    else removeAppointment(d.key)
                  }}
                >
                  ✕
                </button>
              </div>

              {open && (
                <div className="project-appt-editor">
                  <div className="admin-form-row">
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">Termin-Typ</label>
                      <select
                        className="admin-form-select"
                        aria-label="Termin-Typ"
                        value={d.kind}
                        onChange={e => patch(d.key, { kind: e.target.value as AppointmentKind })}
                      >
                        {APPOINTMENT_KINDS.map(k => (
                          <option key={k} value={k}>{APPOINTMENT_KIND_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                    {d.kind === 'sonstiges' && (
                      <div className="admin-form-group" style={{ margin: 0 }}>
                        <label className="admin-form-label">Bezeichnung</label>
                        <input
                          className="admin-form-input"
                          aria-label="Bezeichnung"
                          value={d.label}
                          onChange={e => patch(d.key, { label: e.target.value })}
                          placeholder="z.B. Besprechung vor Ort"
                        />
                      </div>
                    )}
                  </div>

                  <div className="admin-form-row">
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">Start (Datum)</label>
                      <DateTimeInput
                        className="admin-form-input" type="date"
                        aria-label="Start (Datum)"
                        value={d.startDate}
                        onValueChange={v => patch(d.key, applyStartDate(d, v))}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">
                        Ende (Datum) <span style={{ fontWeight: 400, color: 'var(--muted)' }}>leer = eintägig</span>
                      </label>
                      <DateTimeInput
                        className="admin-form-input" type="date"
                        aria-label="Ende (Datum)"
                        value={d.endDate}
                        min={d.startDate || undefined}
                        onValueChange={v => patch(d.key, { endDate: v })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">
                        Startzeit <span style={{ fontWeight: 400, color: 'var(--muted)' }}>leer = ganztägig</span>
                      </label>
                      <DateTimeInput
                        className="admin-form-input" type="time"
                        aria-label="Startzeit"
                        value={d.startTime}
                        onValueChange={v => patch(d.key, { startTime: v })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">Endzeit</label>
                      <DateTimeInput
                        className="admin-form-input" type="time"
                        aria-label="Endzeit"
                        value={d.endTime}
                        onValueChange={v => patch(d.key, { endTime: v })}
                      />
                    </div>
                  </div>

                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="project-appt-own-team">
                      <input
                        type="checkbox"
                        checked={d.ownTeam}
                        onChange={e => patch(d.key, { ownTeam: e.target.checked })}
                      />
                      Eigenes Team für diesen Termin
                      {noMonteur && <span style={{ color: 'var(--danger)' }}> *</span>}
                    </label>
                    {d.ownTeam ? (
                      <>
                        <div className="project-team-chips">
                          {staff.length === 0 && (
                            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Mitarbeiter gefunden.</span>
                          )}
                          {staff.map(s => {
                            // Lead = der zuerst angewählte Monteur, rot wie in der
                            // Einsatzplanung und in der Projekt-Team-Kachel darüber.
                            const lead = d.monteurIds[0] === s.id
                            return (
                              <button
                                key={s.id}
                                type="button"
                                className={`project-team-chip${d.monteurIds.includes(s.id) ? ' active' : ''}${lead ? ' lead' : ''}`}
                                title={lead ? 'Lead-Monteur (zuerst gewählt)' : undefined}
                                onClick={() => toggleMonteur(d, s.id)}
                              >
                                {s.name}
                              </button>
                            )
                          })}
                          {d.monteurIds.length === 0 && !noMonteur && (
                            <span style={{ color: 'var(--muted)', fontSize: 12, alignSelf: 'center' }}>
                              Keine Auswahl = Projekt-Team.
                            </span>
                          )}
                        </div>
                        {d.monteurIds.length > 1 && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                            Rot = Lead-Monteur (der zuerst gewählte). Abwählen und neu wählen ändert ihn.
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        Es gilt das Projekt-Team{team.names ? `: ${team.names}` : ' (noch niemand zugeteilt)'}.
                      </div>
                    )}
                    {noMonteur && (
                      <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
                        Mindestens ein Monteur ist nötig — hier auswählen oder das Projekt-Team oben
                        besetzen. Ohne Monteur fehlt der Termin im Wochenplan und in der App.
                      </div>
                    )}
                  </div>
                  {autosave && (
                    <div className="project-appt-save">
                      {errors[d.key] && (
                        <div className="admin-form-error" role="alert">{errors[d.key]}</div>
                      )}
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-primary"
                        disabled={busyKey === d.key || !autosave.isDirty(d)}
                        onClick={() => { void saveOpen() }}
                      >
                        {busyKey === d.key ? 'Speichern…' : autosave.isDirty(d) ? 'Termin speichern' : 'Gespeichert'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {autosave && !open && errors[d.key] && (
                <div className="admin-form-error" role="alert">{errors[d.key]}</div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="admin-btn admin-btn-secondary"
        style={{ marginTop: 12 }}
        onClick={addAppointment}
      >
        + Termin hinzufügen
      </button>

      {confirmRemove && (
        <ConfirmDialog
          title="Termin entfernen?"
          message={<>
            {draftTitle(confirmRemove)} · {fmtDraftWhen(confirmRemove)} wird sofort entfernt.
            Betroffene Monteure werden benachrichtigt.
          </>}
          confirmLabel="Entfernen"
          variant="danger"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => { void confirmRemoveNow() }}
        />
      )}
    </div>
  )
}

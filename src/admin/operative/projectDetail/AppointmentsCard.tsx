// Kachel «Termine» in der Projektübersicht: mehrere Termine je Projekt planen,
// inkl. Team pro Termin. Bisher ging das nur in der Einsatzplanung (Kalender) —
// dort plant man aber vom Kalender her, nicht vom Projekt her.
//
// Reine Darstellung: der Entwurfs-Stand liegt im ProjectDetailScreen (dort wird
// er beim Speichern gegen den geladenen Stand diffed), die Regeln stehen in
// ../projectAppointments.ts.

import { useState } from 'react'
import { AppointmentKind, APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS } from '../../../api/admin'
import {
  AppointmentDraft, applyStartDate, draftTeamNames, draftTitle, fmtDraftWhen,
  newAppointmentDraft, nextAppointment, todayISO,
} from '../projectAppointments'

interface Props {
  appointments: AppointmentDraft[]
  onChange: (next: AppointmentDraft[]) => void
  staff: { id: string; name: string }[]
  // Projekt-Team aus der Einsatzplanungs-Kachel — gilt für jeden Termin ohne
  // eigenes Team.
  projectTeam: string[]
}

export default function AppointmentsCard({ appointments, onChange, staff, projectTeam }: Props) {
  // Nur ein Termin ist gleichzeitig aufgeklappt — sonst wird die Kachel bei
  // vier Terminen unübersichtlich lang.
  const [openKey, setOpenKey] = useState<string | null>(null)

  const next = nextAppointment(appointments, todayISO())

  function patch(key: string, changes: Partial<AppointmentDraft>) {
    onChange(appointments.map(d => d.key === key ? { ...d, ...changes } : d))
  }

  function addAppointment() {
    const draft = newAppointmentDraft('montage')
    onChange([...appointments, draft])
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
        Beliebig viele Termine je Projekt (z.B. Aufmass vorab, Montage später). Ohne eigene
        Auswahl gilt beim Termin das Projekt-Team aus der Einsatzplanung. Termine erscheinen
        im Einsatz-Kalender und werden mit «Speichern» übernommen.
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
          return (
            <div key={d.key} className={`project-appt-item${open ? ' open' : ''}`}>
              <div className="project-appt-head">
                <button
                  type="button"
                  className="project-appt-summary"
                  onClick={() => setOpenKey(open ? null : d.key)}
                  aria-expanded={open}
                >
                  <span className="project-appt-kind">{draftTitle(d)}</span>
                  <span className="project-appt-when">{fmtDraftWhen(d)}</span>
                  <span className="project-appt-team">
                    {team.names
                      ? `${team.fromProject ? 'Projekt-Team' : 'Team'}: ${team.names}`
                      : 'Kein Team'}
                  </span>
                </button>
                <button
                  type="button"
                  className="admin-btn-icon danger"
                  title="Termin entfernen"
                  aria-label="Termin entfernen"
                  onClick={() => removeAppointment(d.key)}
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
                      <input
                        className="admin-form-input" type="date"
                        aria-label="Start (Datum)"
                        value={d.startDate}
                        onChange={e => patch(d.key, applyStartDate(d, e.target.value))}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">
                        Ende (Datum) <span style={{ fontWeight: 400, color: 'var(--muted)' }}>leer = eintägig</span>
                      </label>
                      <input
                        className="admin-form-input" type="date"
                        aria-label="Ende (Datum)"
                        value={d.endDate}
                        min={d.startDate || undefined}
                        onChange={e => patch(d.key, { endDate: e.target.value })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">
                        Startzeit <span style={{ fontWeight: 400, color: 'var(--muted)' }}>leer = ganztägig</span>
                      </label>
                      <input
                        className="admin-form-input" type="time"
                        aria-label="Startzeit"
                        value={d.startTime}
                        onChange={e => patch(d.key, { startTime: e.target.value })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ margin: 0 }}>
                      <label className="admin-form-label">Endzeit</label>
                      <input
                        className="admin-form-input" type="time"
                        aria-label="Endzeit"
                        value={d.endTime}
                        onChange={e => patch(d.key, { endTime: e.target.value })}
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
                          {d.monteurIds.length === 0 && (
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
                  </div>
                </div>
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
    </div>
  )
}

// Felder des Termin-Editors im Planungs-Panel: Typ, Datum/Zeit, Wiederholung beim
// Anlegen, Reichweite/«Serie bis»/Rhythmus bei einem bestehenden Serientermin und das
// eigene Team. Seit Charge M4c (Spec refactoring-wachstum.md §17) eigene Komponente;
// vorher Teil von ProjectScheduleScreen.tsx. Zustand und Speichern bleiben im Screen.
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import {
  APPOINTMENT_KIND_LABELS, APPOINTMENT_KINDS, type AppointmentKind, type AppointmentScope,
} from '../../api/admin'
import { DateTimeInput } from '../components/DateTimeInput'
import { pastAppointmentHint, todayISO } from './projectAppointments'
import { REPEAT_LABELS, fmtSlotDate, type ApptFormState, type RepeatPreset, type StaffLite } from './scheduleScreenModel'
import { SCOPE_LABELS, describeRule, scopeHint } from './seriesEdit'

interface Props {
  apptForm: ApptFormState
  setApptForm: Dispatch<SetStateAction<ApptFormState | null>>
  /** Termin-Typ und Team nur bei Kundenprojekten, nicht bei internen Einsätzen. */
  showApptExtras: boolean
  monteurOptions: StaffLite[]
  terminBraucht: string[]
  skillChip: (staffId: string, braucht: string[]) => { cls: string; title?: string; marke: string }
  brauchtZeile: (braucht: string[]) => ReactNode
  toggleApptMonteur: (id: string) => void
}

export function ScheduleApptEditor({
  apptForm, setApptForm, showApptExtras, monteurOptions, terminBraucht, skillChip, brauchtZeile,
  toggleApptMonteur,
}: Props) {
  return (
    <>
    {showApptExtras && (
      <div className="project-schedule-row">
        <label className="project-schedule-field">
          <span>Termin-Typ</span>
          <select
            className="admin-input"
            value={apptForm.kind}
            onChange={e => setApptForm(a => a && ({ ...a, kind: e.target.value as AppointmentKind }))}
          >
            {APPOINTMENT_KINDS.map(k => (
              <option key={k} value={k}>{APPOINTMENT_KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        {apptForm.kind === 'sonstiges' && (
          <label className="project-schedule-field">
            <span>Bezeichnung</span>
            <input
              className="admin-input"
              value={apptForm.label}
              onChange={e => setApptForm(a => a && ({ ...a, label: e.target.value }))}
              placeholder="z.B. Besprechung"
            />
          </label>
        )}
      </div>
    )}

    <div className="project-schedule-row">
      <label className="project-schedule-field">
        <span>Start</span>
        <DateTimeInput
          type="date"
          className="admin-input"
          value={apptForm.startDate}
          onValueChange={v => setApptForm(a => {
            if (!a) return a
            // Enddatum vorbelegen bzw. nachziehen: leer oder vor dem Start → gleicher Tag.
            const endDate = (v && (!a.endDate || a.endDate < v)) ? v : a.endDate
            return { ...a, startDate: v, endDate }
          })}
        />
      </label>
      <label className="project-schedule-field">
        <span>Ende</span>
        <DateTimeInput
          type="date"
          className="admin-input"
          value={apptForm.endDate}
          min={apptForm.startDate || undefined}
          onValueChange={v => setApptForm(a => a && ({ ...a, endDate: v }))}
        />
      </label>
    </div>
    {/* WW-72: nur ein Hinweis, Speichern bleibt frei. Bei einem
        gespeicherten Termin erst, wenn sein Datum geändert wird —
        nicht schon beim Aufklappen eines alten. */}
    {(() => {
      const hint = (!apptForm.id || apptForm.startDate !== apptForm.originalStartDate)
        ? pastAppointmentHint(apptForm.startDate, apptForm.endDate, todayISO())
        : null
      return hint
        ? <div className="admin-form-hint-warn" role="status">{hint}</div>
        : null
    })()}

    <div className="project-schedule-row">
      <label className="project-schedule-field">
        <span>Startzeit</span>
        <DateTimeInput
          type="time"
          className="admin-input"
          value={apptForm.startTime}
          onValueChange={v => setApptForm(a => a && ({ ...a, startTime: v }))}
        />
      </label>
      <label className="project-schedule-field">
        <span>Endzeit</span>
        <DateTimeInput
          type="time"
          className="admin-input"
          value={apptForm.endTime}
          onValueChange={v => setApptForm(a => a && ({ ...a, endTime: v }))}
        />
      </label>
    </div>

    {/* Wiederholung beim ANLEGEN. Ein bestehender Serientermin
        ändert seine Serie unten über «Reichweite», «Serie bis»
        und «Rhythmus ab hier». */}
    {!apptForm.id && (
      <div className="project-schedule-row">
        <label className="project-schedule-field">
          <span>Wiederholung</span>
          <select
            className="admin-input"
            value={apptForm.repeat}
            onChange={e => setApptForm(a => a && ({ ...a, repeat: e.target.value as RepeatPreset }))}
          >
            <option value="">Einmalig</option>
            {(Object.keys(REPEAT_LABELS) as Exclude<RepeatPreset, ''>[]).map(k => (
              <option key={k} value={k}>{REPEAT_LABELS[k]}</option>
            ))}
          </select>
        </label>
        {apptForm.repeat && (
          <label className="project-schedule-field">
            <span>Serie bis<span className="project-schedule-req"> *</span></span>
            <DateTimeInput
              type="date"
              className="admin-input"
              value={apptForm.repeatUntil}
              min={apptForm.startDate || undefined}
              onValueChange={v => setApptForm(a => a && ({ ...a, repeatUntil: v }))}
            />
          </label>
        )}
      </div>
    )}

    {/* Bestehender Serientermin: Reichweite wie in jedem Kalender
        (Spec einsatzplanung-rueckmeldungen-2026-10.md §3). Ein
        neues Datum verschiebt bei «folgende»/«Serie» um gleich
        viele Tage; «Serie bis» verlängert oder verkürzt; ein neuer
        Rhythmus gilt ab hier. Eins davon pro Speichern. */}
    {apptForm.id && apptForm.seriesId && (
      <div className="project-schedule-field">
        <label className="project-schedule-field">
          <span>
            🔁 Änderung gilt für
            {describeRule(apptForm.seriesRule) && ` (Serie ${describeRule(apptForm.seriesRule)})`}
          </span>
          <select
            className="admin-input"
            value={apptForm.scope}
            onChange={e => setApptForm(a => a && ({
              ...a,
              scope: e.target.value as AppointmentScope,
              // Ein neuer Rhythmus gilt nur «ab hier».
              seriesRhythm: e.target.value === 'following' ? a.seriesRhythm : '',
            }))}
          >
            {(Object.keys(SCOPE_LABELS) as AppointmentScope[]).map(s => (
              <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <div className="project-schedule-lead-hint">{scopeHint(apptForm.scope)}</div>
        {apptForm.scope !== 'single' && (
          <div className="project-schedule-row">
            <label className="project-schedule-field">
              <span>Serie bis</span>
              <DateTimeInput
                type="date"
                className="admin-input"
                value={apptForm.seriesUntil}
                min={apptForm.startDate || undefined}
                onValueChange={v => setApptForm(a => a && ({ ...a, seriesUntil: v }))}
              />
            </label>
            {apptForm.scope === 'following' && (
              <label className="project-schedule-field">
                <span>Rhythmus ab hier</span>
                <select
                  className="admin-input"
                  value={apptForm.seriesRhythm}
                  onChange={e => setApptForm(a => a && ({ ...a, seriesRhythm: e.target.value as RepeatPreset }))}
                >
                  <option value="">Unverändert</option>
                  {(Object.keys(REPEAT_LABELS) as Exclude<RepeatPreset, ''>[]).map(k => (
                    <option key={k} value={k}>{REPEAT_LABELS[k]}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {apptForm.scope !== 'single' && apptForm.seriesUntil
          && apptForm.seriesUntilOriginal && apptForm.seriesUntil < apptForm.seriesUntilOriginal
          && !apptForm.seriesRhythm && (
          <div className="project-schedule-lead-hint">
            Verkürzen entfernt die Termine nach dem {fmtSlotDate(apptForm.seriesUntil)}.
            Termine, an denen schon rapportiert wurde, bleiben stehen — dann wird nicht gekürzt.
          </div>
        )}
        {apptForm.seriesRhythm && (
          <div className="project-schedule-lead-hint">
            Dieser und alle folgenden Termine werden durch eine neue Serie
            ersetzt — {REPEAT_LABELS[apptForm.seriesRhythm as Exclude<RepeatPreset, ''>]}
            {apptForm.seriesUntil ? ` bis ${fmtSlotDate(apptForm.seriesUntil)}` : ''}.
          </div>
        )}
      </div>
    )}

    {showApptExtras && (
      <div className="project-schedule-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={apptForm.ownTeam}
            onChange={e => setApptForm(a => a && ({ ...a, ownTeam: e.target.checked }))}
          />
          Eigenes Team für diesen Termin
          {apptForm.requireMonteur && <span className="project-schedule-req"> *</span>}
        </label>
        {apptForm.kind !== 'montage' || apptForm.ownTeam ? brauchtZeile(terminBraucht) : null}
        {apptForm.ownTeam && (
          <div className="project-schedule-monteur-chips" style={{ marginTop: 6 }}>
            {monteurOptions.map(s => {
              const active = apptForm.monteurIds.includes(s.id)
              const lead = apptForm.monteurIds[0] === s.id
              const sk = skillChip(s.id, terminBraucht)
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`project-schedule-chip${active ? ' active' : ''}${lead ? ' lead' : ''}${sk.cls}`}
                  onClick={() => toggleApptMonteur(s.id)}
                  title={[lead ? 'Lead-Monteur (zuerst gewählt)' : '', sk.title ?? ''].filter(Boolean).join(' · ') || undefined}
                >
                  {s.name}{sk.marke}
                </button>
              )
            })}
            {apptForm.monteurIds.length === 0 && !apptForm.requireMonteur && (
              <span style={{ color: 'var(--muted)', fontSize: 12, alignSelf: 'center' }}>
                Keine Auswahl = Projekt-Team.
              </span>
            )}
          </div>
        )}
      </div>
    )}
    </>
  )
}

/**
 * Kleine Bausteine, die Eingang, Board und Detail der Feature-Anfragen teilen
 * (Spec docs/specs/feature-anfragen.md §7).
 */
import { useState } from 'react'
import {
  AREA_LABEL,
  formatTarget,
  NOTIFY_DEFAULT_PHASES,
  PHASE_LABEL,
  REASON_REQUIRED,
  todayIso,
  type Phase,
  type Precision,
  type TargetInput,
} from '../../api/featureRequests'
import { backdropCloseProps } from '../../shared/backdropClose'

export function AreaSelect({ value, onChange, id }: {
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  return (
    <select id={id} className="admin-input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— Bereich wählen —</option>
      {Object.entries(AREA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
}

/** Zielzeitraum: Genauigkeit + Beginn (+ optional Ende). Der Server rastet auf
 *  ganze Wochen/Monate/Quartale ein; die Vorschau zeigt schon hier, was auf
 *  der Karte stehen wird. */
export function TargetField({ value, onChange }: {
  value: TargetInput | null
  onChange: (v: TargetInput | null) => void
}) {
  const precision: Precision | '' = value?.precision ?? ''
  return (
    <div className="fr-target">
      <select
        className="admin-input"
        aria-label="Genauigkeit des Zielzeitraums"
        value={precision}
        onChange={e => {
          const p = e.target.value as Precision | ''
          onChange(p ? { from: value?.from || todayIso(), to: value?.to, precision: p } : null)
        }}
      >
        <option value="">Ohne Ziel</option>
        <option value="woche">Woche</option>
        <option value="monat">Monat</option>
        <option value="quartal">Quartal</option>
      </select>
      {value && (
        <>
          <input
            type="date" className="admin-input" aria-label="Ziel ab"
            value={value.from}
            onChange={e => onChange({ ...value, from: e.target.value })}
          />
          <input
            type="date" className="admin-input" aria-label="Ziel bis (optional)"
            value={value.to ?? ''}
            onChange={e => onChange({ ...value, to: e.target.value || undefined })}
          />
          <span className="fr-target-preview">
            → {formatTarget(value.from, value.to || value.from, value.precision)}
          </span>
        </>
      )}
    </div>
  )
}

/**
 * Phasenwechsel und/oder Zielverschiebung — nie still (Spec §7.4).
 *
 * Wer eine Karte in eine neue Spalte zieht, landet hier: Datum, optional ein
 * öffentlicher Zwischenstand, optional ein neues Ziel. Bei «Später» und
 * «Nicht geplant» ist der Grund Pflicht, weil er öffentlich auf der Karte steht.
 *
 * Benachrichtigt wird nur mit dem Häkchen (Spec F11). Vorbelegt ist es bei
 * den Phasen, auf die ein Einreicher wartet — und es fehlt ganz, wo es
 * niemanden gäbe: ein internes Feature steht auf keinem Board, eines ohne
 * Anfragen hat keinen Empfänger.
 */
export function PhaseDialog({
  title, currentPhase, initialPhase, currentTarget, requestCount = 0, tenantCount = 0,
  isPublic = true, onSubmit, onClose,
}: {
  title: string
  currentPhase: Phase
  initialPhase: Phase
  currentTarget: TargetInput | null
  requestCount?: number
  tenantCount?: number
  isPublic?: boolean
  onSubmit: (body: {
    phase?: Phase; on: string; text?: string; target?: TargetInput | null; notify?: boolean
  }) => Promise<void>
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const canNotify = isPublic && requestCount > 0
  const [notify, setNotify] = useState(() => NOTIFY_DEFAULT_PHASES.includes(initialPhase))
  const [notifyTouched, setNotifyTouched] = useState(false)
  const [on, setOn] = useState(() => todayIso())
  const [text, setText] = useState('')
  const [target, setTarget] = useState<TargetInput | null>(currentTarget)
  const [targetTouched, setTargetTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsReason = phase !== currentPhase && REASON_REQUIRED.includes(phase)

  async function submit() {
    if (needsReason && !text.trim()) {
      setError('Für «Später» und «Nicht geplant» braucht es einen öffentlichen Grund.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        ...(phase !== currentPhase ? { phase } : {}),
        on,
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(targetTouched ? { target } : {}),
        ...(canNotify && notify ? { notify: true } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal fr-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title">{title}</div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>
        <div className="admin-modal-body fr-form">
          <label className="admin-form-group">
            <span className="admin-form-label">Phase</span>
            <select className="admin-input" value={phase} onChange={e => {
              const next = e.target.value as Phase
              setPhase(next)
              // Die Vorbelegung folgt der Phase, bis jemand das Häkchen selbst setzt.
              if (!notifyTouched) setNotify(NOTIFY_DEFAULT_PHASES.includes(next))
            }}>
              {(Object.keys(PHASE_LABEL) as Phase[]).map(p => (
                <option key={p} value={p}>{PHASE_LABEL[p]}{p === currentPhase ? ' (aktuell)' : ''}</option>
              ))}
            </select>
          </label>
          <label className="admin-form-group">
            <span className="admin-form-label">Datum</span>
            <input type="date" className="admin-input" value={on} max={todayIso()}
                   onChange={e => setOn(e.target.value)} />
            <span className="admin-form-hint">Nur das Datum steht im Verlauf — nie eine Uhrzeit.</span>
          </label>
          <label className="admin-form-group">
            <span className="admin-form-label">
              {needsReason ? 'Öffentlicher Grund (Pflicht)' : 'Zwischenstand (öffentlich, optional)'}
            </span>
            <textarea className="admin-input" rows={3} maxLength={1000} value={text}
                      onChange={e => setText(e.target.value)}
                      placeholder="Was Nutzer auf der Karte lesen sollen" />
          </label>
          <div className="admin-form-group">
            <span className="admin-form-label">Zielzeitraum</span>
            <TargetField value={target} onChange={v => { setTarget(v); setTargetTouched(true) }} />
            {targetTouched && (
              <span className="admin-form-hint">Die Verschiebung wird im Verlauf sichtbar festgehalten.</span>
            )}
          </div>
          {canNotify && (
            <label className="fr-check">
              <input type="checkbox" checked={notify}
                     onChange={e => { setNotify(e.target.checked); setNotifyTouched(true) }} />
              {requestCount} {requestCount === 1 ? 'Anfragende(n)' : 'Anfragende'} in {tenantCount}{' '}
              {tenantCount === 1 ? 'Betrieb' : 'Betrieben'} benachrichtigen
            </label>
          )}
          {error && <div role="alert" className="fr-error">{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={submit}
                  disabled={busy || (phase === currentPhase && !targetTouched)}>
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  )
}

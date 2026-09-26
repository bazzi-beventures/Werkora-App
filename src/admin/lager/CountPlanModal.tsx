// Zählplan bearbeiten (Rollierende Inventur, docs/specs/rollierende-inventur.md §10.2).
//
// Die Maske steht bewusst im Reiter Inventur und nicht in der
// Superadmin-Konfiguration: «20 Artikel pro Woche» ist keine
// Produktentscheidung, sondern eine Betriebsgrösse, die der Lagerist
// nachstellt, wenn er nach vier Wochen sieht, dass sie nicht passt. Ein
// Prozess, für dessen Feinjustierung man den Betreiber anrufen muss, wird
// nicht justiert, sondern aufgegeben.

import { useEffect, useMemo, useState } from 'react'
import { backdropCloseProps } from '../../shared/backdropClose'
import { deleteCountPlan, saveCountPlan } from '../../api/admin/inventory'
import type { CountPeriod, CountPlan } from '../../api/admin/inventory'
import { listUsers } from '../../api/admin'
import type { AuthUser } from '../../api/admin'
import { ConfirmDialog } from '../components/ConfirmDialog'

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const PERIODE_LABEL: Record<CountPeriod, string> = {
  tag: 'Tag',
  woche: 'Woche',
  monat: 'Monat',
}

// Rollen, die zählen dürfen. `user_light` fehlt: Das Konto hat keinen vollen
// Mitarbeiter-Zugriff, und eine Inventur mit CHF-Wirkung ist das Letzte, was
// man ihm als Erstes gibt.
const ZAEHLBERECHTIGT = new Set(['user', 'admin', 'management'])

interface Props {
  plan: CountPlan | null
  /** Kategorien, für die es noch keinen Plan gibt. */
  freieKategorien: string[]
  /** Gibt es schon einen Plan für «alle übrigen»? */
  sammelplanVorhanden: boolean
  /** Aus dem Zählstand vorgewählt — der kurze Weg von «Motoren sind seit einem
   *  Jahr ungezählt» zu «Motoren: 5 pro Woche». */
  vorgabeKategorie?: string | null
  onClose: () => void
  onSaved: () => void
}

export default function CountPlanModal({
  plan, freieKategorien, sammelplanVorhanden, vorgabeKategorie, onClose, onSaved,
}: Props) {
  const [active, setActive] = useState(plan?.active ?? true)
  const [perPeriod, setPerPeriod] = useState(String(plan?.per_period ?? 20))
  const [period, setPeriod] = useState<CountPeriod>(plan?.period ?? 'woche')
  const [weekday, setWeekday] = useState(plan?.weekday ?? 0)
  const [dayOfMonth, setDayOfMonth] = useState(plan?.day_of_month ?? 1)
  const [category, setCategory] = useState(plan?.category ?? vorgabeKategorie ?? '')
  const [managerId, setManagerId] = useState(plan?.manager_user_id ?? '')
  const [users, setUsers] = useState<AuthUser[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loeschFrage, setLoeschFrage] = useState(false)

  useEffect(() => {
    listUsers().then(setUsers).catch(() => setUsers([]))
  }, [])

  const zaehler = useMemo(
    () => users.filter(u => ZAEHLBERECHTIGT.has(u.role)),
    [users],
  )

  // Die eigene Kategorie bleibt wählbar, auch wenn sie «vergeben» ist — sie ist
  // ja von diesem Plan vergeben. Ohne das liesse sich ein bestehender Plan nicht
  // mehr speichern, sobald man ihn einmal geöffnet hat.
  //
  // Erst in eine Konstante, dann in die Abhängigkeitsliste: ein `plan?.category`
  // direkt in den Deps ist ein Ausdruck, den der React-Compiler nicht als
  // stabilen Wert erkennt (Regel preserve-manual-memoization).
  const eigeneKategorie = plan?.category ?? null
  const kategorien = useMemo(() => {
    const alle = eigeneKategorie && !freieKategorien.includes(eigeneKategorie)
      ? [...freieKategorien, eigeneKategorie]
      : [...freieKategorien]
    return alle.sort((a, b) => a.localeCompare(b, 'de-CH'))
  }, [freieKategorien, eigeneKategorie])

  const sammelplanFrei = !sammelplanVorhanden || (plan != null && plan.category == null)

  const menge = Number(perPeriod)
  const mengeOk = Number.isFinite(menge) && menge >= 1 && menge <= 500
  const bereit = mengeOk && managerId !== ''

  const gewaehlterZaehler = zaehler.find(u => u.id === managerId)
  const istMonteur = gewaehlterZaehler != null && gewaehlterZaehler.role === 'user'

  async function speichern() {
    setBusy(true)
    setError('')
    try {
      await saveCountPlan({
        active,
        per_period: menge,
        period,
        weekday,
        day_of_month: dayOfMonth,
        category: category || null,
        manager_user_id: managerId,
      }, plan?.id)
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function loeschen() {
    if (!plan) return
    setBusy(true)
    setLoeschFrage(false)
    try {
      await deleteCountPlan(plan.id)
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">{plan ? 'Zählplan bearbeiten' : 'Neuer Zählplan'}</div>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {error && <div className="admin-form-error">{error}</div>}

          <div className="admin-form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Aktiv
            </label>
            <div className="admin-form-hint">
              Ausgeschaltet bleibt der Plan mit seinen Werten stehen, es entstehen
              nur keine neuen Tranchen mehr.
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="plan-kat">Kategorie</label>
            <select
              id="plan-kat" className="admin-form-input" value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {sammelplanFrei && <option value="">Alle übrigen Kategorien</option>}
              {kategorien.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <div className="admin-form-hint">
              Teure Artikel bekommen eine eigene Kategorie und einen eigenen Plan —
              so sind sie öfter dran, und am Artikel steht, warum.
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="plan-manager">Inventurmanager</label>
            <select
              id="plan-manager" className="admin-form-input" value={managerId}
              onChange={e => setManagerId(e.target.value)}
            >
              <option value="">Bitte wählen…</option>
              {zaehler.map(u => (
                <option key={u.id} value={u.id}>
                  {u.display_name ?? u.email ?? u.id}
                  {u.role === 'user' ? '' : ` · ${u.role}`}
                </option>
              ))}
            </select>
            <div className="admin-form-hint">
              {istMonteur
                ? 'Ohne Admin-Rolle: Er zählt in der Werkora-App, wo die Kachel «Inventur» erscheint, sobald ihm eine Tranche gehört.'
                : 'Die Person, die zählt. Sie bekommt die Push, wenn eine Tranche bereitliegt.'}
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="plan-menge">Artikel je Periode</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="plan-menge" className="admin-form-input" type="number"
                inputMode="numeric" min={1} max={500} style={{ maxWidth: 110 }}
                value={perPeriod} onChange={e => setPerPeriod(e.target.value)}
              />
              <span>pro</span>
              <select
                className="admin-form-input" style={{ maxWidth: 140 }}
                aria-label="Periode" value={period}
                onChange={e => setPeriod(e.target.value as CountPeriod)}
              >
                {(Object.keys(PERIODE_LABEL) as CountPeriod[]).map(p => (
                  <option key={p} value={p}>{PERIODE_LABEL[p]}</option>
                ))}
              </select>
            </div>
            {!mengeOk && perPeriod !== '' && (
              <div className="admin-form-error" style={{ marginTop: 6 }}>
                Zwischen 1 und 500 Artikeln.
              </div>
            )}
          </div>

          {period === 'woche' && (
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="plan-tag">Wochentag</label>
              <select
                id="plan-tag" className="admin-form-input" value={weekday}
                onChange={e => setWeekday(Number(e.target.value))}
              >
                {WOCHENTAGE.map((t, i) => <option key={t} value={i}>{t}</option>)}
              </select>
            </div>
          )}

          {period === 'monat' && (
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="plan-monatstag">Tag im Monat</label>
              <input
                id="plan-monatstag" className="admin-form-input" type="number"
                inputMode="numeric" min={1} max={28} style={{ maxWidth: 110 }}
                value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))}
              />
              <div className="admin-form-hint">
                Höchstens der 28. — sonst fiele die Tranche im Februar aus.
              </div>
            </div>
          )}

          <div className="admin-form-hint" style={{ marginTop: 4 }}>
            Die Tranche wird morgens um 06:30 angelegt; mit «Jetzt zählen» sofort.
          </div>
        </div>
        <div className="admin-modal-footer">
          {plan && (
            <button
              className="admin-btn admin-btn-danger" onClick={() => setLoeschFrage(true)}
              disabled={busy} style={{ marginRight: 'auto' }}
            >
              Löschen
            </button>
          )}
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => { void speichern() }}
            disabled={busy || !bereit}
          >
            {busy ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </div>
      </div>

      {loeschFrage && (
        <ConfirmDialog
          title="Zählplan löschen?"
          message="Bereits gezählte Tranchen bleiben im Archiv — der Zählnachweis gehört dem Betrieb, nicht dem Plan. Es entstehen nur keine neuen mehr."
          confirmLabel="Löschen"
          variant="danger"
          onConfirm={() => { void loeschen() }}
          onCancel={() => setLoeschFrage(false)}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { createFiliale, updateFiliale, type Filiale } from '../../../api/admin/filialen'
import { ToastHost, useToast } from '../../components/useToast'
import { filialenNeuLaden, useFilialen } from '../useFilialen'
import './FilialenTab.css'

// ─── Reiter «Filialen»: Filialen in anderen Kantonen ────────────────────────
//
// Spec: docs/specs/ferienplanung.md §10.3, Feature `filialen`. Eine Filiale trägt
// einen Kanton; wer ihr im Personalstamm zugeordnet ist, rechnet mit dessen
// Feiertagen — Soll, Saldo, Wochenjournal, Ferienkonto. Wer keiner Filiale
// zugeordnet ist, gehört zum Hauptsitz. Gelöscht wird nicht: «inaktiv» lässt die
// Zuordnungen stehen und rechnet wieder mit dem Hauptsitz.

const FEHLER: Record<string, string> = {
  name_taken: 'Eine Filiale mit diesem Namen gibt es schon.',
  invalid_kanton: 'Bitte einen Kanton wählen.',
  missing_name: 'Die Filiale braucht einen Namen.',
}

function meldung(err: unknown): string {
  const text = err instanceof Error ? err.message : ''
  return FEHLER[text] ?? 'Speichern hat nicht geklappt — bitte nochmals versuchen.'
}

export function FilialenTab() {
  const { data, isLoading, isError } = useFilialen(true)
  const { toast, showToast } = useToast()
  const [name, setName] = useState('')
  const [kanton, setKanton] = useState('')
  const [saving, setSaving] = useState(false)

  if (isLoading) {
    return <div className="admin-loading"><div className="admin-spinner" /> Filialen werden geladen…</div>
  }
  if (isError || !data) {
    return <div className="admin-form-error" role="alert">Filialen konnten nicht geladen werden.</div>
  }

  async function anlegen() {
    setSaving(true)
    try {
      await createFiliale(name.trim(), kanton)
      setName('')
      setKanton('')
      await filialenNeuLaden()
      showToast('Filiale angelegt')
    } catch (err) {
      showToast(meldung(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function aendern(f: Filiale, felder: { kanton?: string; aktiv?: boolean }) {
    try {
      await updateFiliale(f.id, felder)
      await filialenNeuLaden()
      showToast('Gespeichert')
    } catch (err) {
      showToast(meldung(err), 'error')
    }
  }

  return (
    <div className="admin-table-wrap filialen-tab">
      <div className="admin-section-title">Filialen in anderen Kantonen</div>
      <p className="filialen-hinweis">
        Wer einer Filiale zugeordnet ist, rechnet mit den Feiertagen ihres Kantons — Soll, Saldo,
        Wochenjournal und Ferienkonto. Alle anderen gehören zum Hauptsitz
        (Kanton <strong>{data.hauptsitz_kanton}</strong>). Die Zuordnung steht im Personalstamm.
      </p>

      {data.filialen.length === 0 && <p className="filialen-leer">Noch keine Filiale angelegt.</p>}
      {data.filialen.map(f => (
        <div key={f.id} className="filialen-zeile" data-testid="filiale-zeile">
          <span className="filialen-name">{f.name}</span>
          <select className="admin-form-select" aria-label={`Kanton von ${f.name}`} value={f.kanton}
            onChange={e => void aendern(f, { kanton: e.target.value })}>
            {data.kantone.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <label className="filialen-aktiv">
            <input type="checkbox" checked={f.aktiv} onChange={e => void aendern(f, { aktiv: e.target.checked })} />
            aktiv
          </label>
        </div>
      ))}

      <div className="filialen-neu">
        <input className="admin-form-input" aria-label="Name der neuen Filiale" placeholder="Name, z. B. Lugano"
          value={name} onChange={e => setName(e.target.value)} />
        <select className="admin-form-select" aria-label="Kanton der neuen Filiale" value={kanton}
          onChange={e => setKanton(e.target.value)}>
          <option value="">Kanton…</option>
          {data.kantone.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className="admin-btn admin-btn-primary" disabled={saving || !name.trim() || !kanton}
          onClick={() => void anlegen()}>
          Filiale anlegen
        </button>
      </div>
      <ToastHost toast={toast} />
    </div>
  )
}

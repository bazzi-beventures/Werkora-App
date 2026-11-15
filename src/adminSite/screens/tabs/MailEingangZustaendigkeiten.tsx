import { useEffect, useState } from 'react'
import * as scoped from '../../tenantScopedApi'
import type { EingangAnsichtVorgabe, ZustaendigkeitenBetreiber } from '../../tenantScopedApi'
import {
  ZELLEN, entferneEintrag, geaendert, hinweise, matrixAus, ruhendeImFormular, setzeZelle, zelle,
  type Matrix, type Zelle,
} from './zustaendigkeitenForm'
import './mailEingangZustaendigkeiten.css'

// ─── Abschnitt «Zuständigkeiten» im Reiter «Mail-Eingang» ────────────────────
//
// Spec docs/specs/mail-eingang-zustaendigkeiten.md §3, §8. Ein Block je Aufgabe,
// darin jede Person, die den Eingang öffnen kann, mit drei Zuständen. Eigenes
// Speichern: Absenderschranke und Organigramm sind verschiedene Entscheide und
// sollen sich nicht gegenseitig blockieren.
//
// Keine Sicherheitseinstellung: wer hier etwas ändert, öffnet nichts. Das
// Organigramm sortiert den Eingang, es sperrt nicht — darum Hinweise, keine Sperren.

interface Props {
  tenantId: string
  onMeldung: (text: string, art: 'success' | 'error') => void
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function MailEingangZustaendigkeiten({ tenantId, onMeldung }: Props) {
  const [view, setView] = useState<ZustaendigkeitenBetreiber | null>(null)
  const [ansicht, setAnsicht] = useState<EingangAnsichtVorgabe>('alle')
  const [matrix, setMatrix] = useState<Matrix>({})
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [serverFehler, setServerFehler] = useState<string | null>(null)

  function uebernimm(v: ZustaendigkeitenBetreiber) {
    setView(v)
    setAnsicht(v.standard_ansicht)
    setMatrix(matrixAus(v))
  }

  useEffect(() => {
    let alive = true
    scoped.getEingangZustaendigkeiten(tenantId)
      .then(v => { if (alive) { uebernimm(v); setLadeFehler(null) } })
      .catch(e => { if (alive) setLadeFehler(errorText(e)) })
    return () => { alive = false }
  }, [tenantId])

  if (!view) {
    return (
      <section className="admin-table-wrap zust-abschnitt" aria-label="Zuständigkeiten">
        <h3 className="zust-titel">Zuständigkeiten</h3>
        {ladeFehler
          ? <div role="alert" className="admin-error">{ladeFehler}</div>
          : <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>}
      </section>
    )
  }

  const h = hinweise(view, matrix)
  const ruhend = ruhendeImFormular(view, matrix)
  const dirty = geaendert(view, ansicht, matrix)
  const label = (key: string) => view.aufgaben.find(a => a.key === key)?.label ?? key

  async function save() {
    if (saving) return
    setSaving(true)
    setServerFehler(null)
    try {
      uebernimm(await scoped.setEingangZustaendigkeiten(tenantId, { standard_ansicht: ansicht, zustaendigkeiten: matrix }))
      onMeldung('Zuständigkeiten gespeichert', 'success')
    } catch (e) {
      setServerFehler(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-table-wrap zust-abschnitt" aria-label="Zuständigkeiten">
      <h3 className="zust-titel">Zuständigkeiten</h3>
      <p className="zust-muted">
        Wer im Büro für welche Aufgabe zuständig ist. Der Eingang sortiert danach — gesperrt wird nichts: jede
        Person mit Zugriff kann jede Karte öffnen und übernehmen. Mails einer Aufgabe ohne Zuständige sehen alle.
      </p>

      <fieldset className="zust-ansicht">
        <legend className="admin-form-label">Beim Öffnen zeigt der Eingang</legend>
        <label>
          <input type="radio" name="zust-ansicht" checked={ansicht === 'alle'} onChange={() => setAnsicht('alle')} />
          {' '}alle Mails
        </label>
        <label>
          <input type="radio" name="zust-ansicht" checked={ansicht === 'meine'} onChange={() => setAnsicht('meine')} />
          {' '}nur die eigenen (und nicht zugeteilte)
        </label>
      </fieldset>

      {view.personen.length === 0 ? (
        <p className="admin-form-hint-warn" role="note">
          {view.modul_aktiv
            ? 'Niemand kann den Eingang öffnen — im Betatest braucht ein Konto das Betatest-Häkchen, und nur Konten mit Admin- oder Management-Rolle zählen.'
            : 'Das Modul Mail-Eingang ist aus. Sobald es eingeschaltet ist, stehen hier die Konten mit Zugriff.'}
        </p>
      ) : (
        <div className="zust-bloecke">
          {view.aufgaben.map(a => (
            <fieldset key={a.key} className="zust-block">
              <legend className="zust-block-titel">{a.label}</legend>
              <div className="zust-muted">{a.beschreibung}</div>
              {h.niemand.includes(a.key) && (
                <div className="admin-form-hint-warn">Niemand zuständig — diese Mails sehen alle.</div>
              )}
              {h.nurVertretung.includes(a.key) && (
                <div className="admin-form-hint">Nur Stellvertretung eingetragen — sie übernimmt.</div>
              )}
              <ul className="zust-personen">
                {view.personen.map(p => (
                  <li key={p.id}>
                    <label className="zust-person">
                      <span>{p.name} <span className="zust-muted">· {p.rolle}</span></span>
                      <select className="admin-form-input" aria-label={`${a.label}: ${p.name}`}
                              value={zelle(matrix, a.key, p.id)}
                              onChange={e => setMatrix(setzeZelle(matrix, a.key, p.id, e.target.value as Zelle))}>
                        {ZELLEN.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
      )}

      {ruhend.length > 0 && (
        <div className="zust-ruhend" role="note">
          <div className="admin-form-label">Ruhende Einträge — zählen nicht, bis das Konto wieder Zugriff hat</div>
          <ul>
            {ruhend.map(r => (
              <li key={`${r.aufgabe}-${r.rolle}-${r.user_id}`}>
                {r.name} — {r.grund_text} ({label(r.aufgabe)}, {r.rolle === 'zustaendig' ? 'zuständig' : 'Stellvertretung'})
                {' '}
                <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => setMatrix(entferneEintrag(matrix, r.aufgabe, r.rolle, r.user_id))}>
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {h.ohneBlock.length > 0 && view.personen.length > 0 && (
        <ul className="zust-hinweise">
          {h.ohneBlock.map(n => (
            <li key={n}>{n} ist keiner Aufgabe zugeteilt und sieht immer alle Mails.</li>
          ))}
        </ul>
      )}

      {serverFehler && <p className="admin-form-error" role="alert">{serverFehler}</p>}

      <div className="zust-knoepfe">
        <button className="admin-btn admin-btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Speichern…' : 'Zuständigkeiten speichern'}
        </button>
        <button className="admin-btn admin-btn-secondary" disabled={!dirty || saving}
                onClick={() => { uebernimm(view); setServerFehler(null) }}>
          Änderungen verwerfen
        </button>
      </div>
    </section>
  )
}

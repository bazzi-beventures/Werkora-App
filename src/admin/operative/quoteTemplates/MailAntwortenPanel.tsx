import { useEffect, useState } from 'react'
import {
  getAntwortVorlagen, resetAntwortVorlage, saveAntwortVorlage,
  type AntwortArt, type AntwortVorlage, type AntwortVorlagen,
} from '../../../api/admin/mailEingang'
import { useToast, ToastHost } from '../../components/useToast'

/**
 * Vorlagen → Mail-Antworten — docs/specs/mail-eingang-aufgaben-antworten.md §5.3.
 *
 * Je Antwort-Art ein Text mit Platzhaltern; Werkora liefert gesiezte
 * Standardtexte mit. Aus diesen Texten — und nur aus ihnen — baut der
 * Mail-Eingang seine Antwort-Vorschläge: eine fremde Mail kann keinen Link,
 * keine Nummer und keine Zusage hineinbringen. Bei «Angaben fehlen» verlangt
 * der Betrieb zusätzlich, was er immer braucht (z.B. «Foto der Fenster»); liegt
 * der Mail ein Bild bei, entfällt das.
 */
export function MailAntwortenPanel() {
  const [daten, setDaten] = useState<AntwortVorlagen | null>(null)
  const [fehler, setFehler] = useState('')
  const { toast, showToast } = useToast()

  async function laden() {
    try {
      setDaten(await getAntwortVorlagen())
      setFehler('')
    } catch (e: unknown) {
      setFehler(e instanceof Error ? e.message : 'Die Vorlagen liessen sich nicht laden.')
    }
  }

  useEffect(() => { void laden() }, [])

  if (fehler && !daten) return <div className="admin-error">{fehler}</div>
  if (!daten) return <div className="admin-empty">Lade…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="eingang-hinweis">
        Aus diesen Texten entstehen die Antwort-Vorschläge im Mail-Eingang. Platzhalter:{' '}
        {Object.entries(daten.platzhalter).map(([k, erkl], i) => (
          <span key={k}>{i > 0 ? ', ' : ''}<code>{`{${k}}`}</code> ({erkl})</span>
        ))}.
      </div>
      {daten.vorlagen.map(v => (
        <VorlageKarte key={`${v.art}-${v.updated_at ?? 'std'}`} vorlage={v}
                      onGespeichert={msg => { showToast(msg); void laden() }} />
      ))}
      <ToastHost toast={toast} />
    </div>
  )
}

function VorlageKarte({ vorlage, onGespeichert }: { vorlage: AntwortVorlage; onGespeichert: (msg: string) => void }) {
  const [text, setText] = useState(vorlage.text)
  const [zusatz, setZusatz] = useState(vorlage.zusatz.join('\n'))
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState('')
  const mitZusatz = vorlage.art === 'angaben_fehlen'
  const zusatzListe = zusatz.split('\n').map(z => z.trim()).filter(Boolean)
  const geaendert = text !== vorlage.text || (mitZusatz && zusatzListe.join('\n') !== vorlage.zusatz.join('\n'))

  async function speichern(art: AntwortArt) {
    setLaeuft(true)
    setFehler('')
    try {
      await saveAntwortVorlage(art, text, mitZusatz ? zusatzListe : [])
      onGespeichert(`Vorlage «${vorlage.label}» gespeichert`)
    } catch (e: unknown) {
      setFehler(e instanceof Error ? e.message : 'Die Vorlage liess sich nicht speichern.')
    } finally {
      setLaeuft(false)
    }
  }

  async function zuruecksetzen(art: AntwortArt) {
    setLaeuft(true)
    setFehler('')
    try {
      await resetAntwortVorlage(art)
      onGespeichert(`Vorlage «${vorlage.label}» auf den Standardtext zurückgesetzt`)
    } catch (e: unknown) {
      setFehler(e instanceof Error ? e.message : 'Die Vorlage liess sich nicht zurücksetzen.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <section className="admin-card" aria-label={vorlage.label} style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{vorlage.label}</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {vorlage.standard ? 'Standardtext' : `Angepasst${vorlage.updated_by_name ? ` von ${vorlage.updated_by_name}` : ''}`}
        </span>
      </div>
      <label className="admin-form-group" style={{ marginTop: 10 }}>
        <span className="admin-form-label">Text</span>
        <textarea className="admin-form-input" rows={8} maxLength={4000} value={text}
                  disabled={laeuft} onChange={e => setText(e.target.value)} />
      </label>
      {mitZusatz && (
        <label className="admin-form-group">
          <span className="admin-form-label">Zusätzlich verlangen (eine Angabe je Zeile, entfällt bei einem Bild)</span>
          <textarea className="admin-form-input" rows={3} value={zusatz} disabled={laeuft}
                    placeholder="z.B. Masse oder Foto der Fenster" onChange={e => setZusatz(e.target.value)} />
        </label>
      )}
      {fehler && <div className="admin-form-error" role="alert">{fehler}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="admin-btn admin-btn-primary admin-btn-sm"
                disabled={laeuft || !geaendert || !text.trim()} onClick={() => void speichern(vorlage.art)}>
          Speichern
        </button>
        {!vorlage.standard && (
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" disabled={laeuft}
                  onClick={() => void zuruecksetzen(vorlage.art)}>
            Standardtext wiederherstellen
          </button>
        )}
      </div>
    </section>
  )
}

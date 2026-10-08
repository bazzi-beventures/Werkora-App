/**
 * Kunden-Rückmeldung — Probelauf, Vorschau, Testmail, Versand, Stand.
 * **Kein Editor.**
 *
 * Spec: docs/specs/kunden-rueckmeldung-kampagne.md §8.
 *
 * Eine einmalige Umfrage an die offenen Projekte eines Mandanten. Text,
 * Auswahlregel und Fragen leben im Code (`services/rueckmeldung_kampagnen.py`),
 * wie beim Newsletter — eine Eingabemaske hier wäre ein zweiter Ort für
 * denselben Text.
 *
 * Der Mandant kommt **aus der Kampagne**, nicht aus dem Wähler im Kopf: der
 * Screen gehört deshalb zum Plattform-Bereich. Der Versand-Knopf ist der scharfe
 * Teil — er schreibt Kunden eines Mandanten in dessen Namen an. Deshalb nennt
 * der Bestätigungsdialog Mandant und Anzahl Mails im Klartext, und der Server
 * verweigert den Versand, wenn sich die Zahl seit dem Probelauf geändert hat.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  downloadExport, listKampagnen, listProjekte, probelauf, starteVersand, stand as ladeStand,
  stoppeVersand, testmail, vorschauMail, vorschauSeite,
  type AuswahlProjekt, type Kampagne, type Plan, type Stand,
} from '../../api/rueckmeldung'
import { ApiError } from '../../api/client'
import { useToast, ToastHost } from '../../admin/components/useToast'
import { ConfirmDialog } from '../../admin/components/ConfirmDialog'
import RueckmeldungAuswahl from './RueckmeldungAuswahl'
import { fehlendeGleicheAdresse } from './rueckmeldungFilter'

/** Abfragetakt für den Stand, solange ein Versand läuft. Der Lauf schickt alle
 *  paar Sekunden eine Mail; öfter zu fragen zeigt nichts Neues. */
const POLL_MS = 5000

const fehlerText = (e: unknown, fallback: string) => (e instanceof Error && e.message) ? e.message : fallback

export default function RueckmeldungScreen() {
  const [kampagnen, setKampagnen] = useState<Kampagne[]>([])
  const [gewaehlt, setGewaehlt] = useState('')
  const [ladend, setLadend] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [projekte, setProjekte] = useState<AuswahlProjekt[]>([])
  const [projekteFehler, setProjekteFehler] = useState<string | null>(null)
  const [projekteLaden, setProjekteLaden] = useState(false)
  const [auswahl, setAuswahl] = useState<Set<string>>(() => new Set())
  // Der Plan entsteht erst beim Klick auf «Versand vorbereiten», aus der
  // Auswahl — und genau er steht dann im Bestätigungsdialog.
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pruefend, setPruefend] = useState(false)
  const [stand, setStand] = useState<Stand | null>(null)
  const [vorschauArt, setVorschauArt] = useState<'mail' | 'seite'>('mail')
  const [vorschau, setVorschau] = useState('')
  const [vorschauFehler, setVorschauFehler] = useState<string | null>(null)
  const [testAdresse, setTestAdresse] = useState('')
  const [testSendend, setTestSendend] = useState(false)
  const [frage, setFrage] = useState(false)
  const [startend, setStartend] = useState(false)
  const { toast, showToast } = useToast()

  useEffect(() => {
    let abgebrochen = false
    listKampagnen()
      .then((liste) => {
        if (abgebrochen) return
        setKampagnen(liste)
        if (liste[0]) setGewaehlt(liste[0].key)
      })
      .catch((e: unknown) => { if (!abgebrochen) setFehler(fehlerText(e, 'Konnte nicht laden.')) })
      .finally(() => { if (!abgebrochen) setLadend(false) })
    return () => { abgebrochen = true }
  }, [])

  const kampagne = kampagnen.find((k) => k.key === gewaehlt) ?? null
  const hatMandant = !!kampagne?.tenant

  const ladeProjekte = useCallback(async (key: string) => {
    setProjekteLaden(true)
    setProjekteFehler(null)
    try {
      setProjekte(await listProjekte(key))
    } catch (e: unknown) {
      setProjekte([])
      setProjekteFehler(fehlerText(e, 'Projekte konnten nicht geladen werden.'))
    } finally {
      setProjekteLaden(false)
    }
  }, [])

  const aktualisiereStand = useCallback(async (key: string) => {
    try {
      setStand(await ladeStand(key))
    } catch {
      /* Stand ist Beiwerk — der Probelauf zeigt dasselbe Bild etwas gröber */
    }
  }, [])

  useEffect(() => {
    if (!gewaehlt || !hatMandant) { setProjekte([]); setStand(null); return }
    void ladeProjekte(gewaehlt)
    void aktualisiereStand(gewaehlt)
  }, [gewaehlt, hatMandant, ladeProjekte, aktualisiereStand])

  // Vorschau: geholt und als `srcdoc` gezeigt, nicht als `src` verlinkt
  // (X-Frame-Options: DENY, siehe api/newsletter.ts).
  useEffect(() => {
    if (!gewaehlt || !hatMandant) { setVorschau(''); return }
    let abgebrochen = false
    setVorschauFehler(null)
    const holen = vorschauArt === 'mail' ? vorschauMail : vorschauSeite
    holen(gewaehlt)
      .then((html) => { if (!abgebrochen) setVorschau(html) })
      .catch((e: unknown) => {
        if (abgebrochen) return
        setVorschau('')
        setVorschauFehler(fehlerText(e, 'Vorschau konnte nicht geladen werden.'))
      })
    return () => { abgebrochen = true }
  }, [gewaehlt, hatMandant, vorschauArt])

  // Solange ein Versand läuft: Stand nachladen. Ist er fertig, einmal die
  // Projektliste neu, damit «angeschrieben» in der Tabelle stimmt.
  const laeuft = !!stand?.lauf?.laeuft
  useEffect(() => {
    if (!gewaehlt || !laeuft) return
    const id = window.setInterval(() => { void aktualisiereStand(gewaehlt) }, POLL_MS)
    return () => {
      window.clearInterval(id)
      void ladeProjekte(gewaehlt)
    }
  }, [gewaehlt, laeuft, aktualisiereStand, ladeProjekte])

  async function sendeTest() {
    setTestSendend(true)
    try {
      const res = await testmail(gewaehlt, testAdresse.trim() || undefined)
      showToast(`Testmail an ${res.empfaenger} verschickt.`, 'success')
    } catch (e: unknown) {
      showToast(fehlerText(e, 'Testmail fehlgeschlagen.'), 'error')
    } finally {
      setTestSendend(false)
    }
  }

  /** Probelauf für die Auswahl holen und den Bestätigungsdialog öffnen. */
  async function vorbereiten(ids: Set<string> = auswahl) {
    setPruefend(true)
    try {
      const res = await probelauf(gewaehlt, [...ids])
      setPlan(res.plan)
      setFrage(true)
    } catch (e: unknown) {
      showToast(fehlerText(e, 'Probelauf fehlgeschlagen.'), 'error')
    } finally {
      setPruefend(false)
    }
  }

  async function versenden() {
    if (!plan) return
    setFrage(false)
    setStartend(true)
    try {
      const res = await starteVersand(gewaehlt, [...auswahl], plan.mails)
      showToast(res.gestartet ? `Versand gestartet: ${res.mails} Mails.` : 'Nichts zu versenden.', 'success')
      setAuswahl(new Set())
      await aktualisiereStand(gewaehlt)
      await ladeProjekte(gewaehlt)
    } catch (e: unknown) {
      showToast(fehlerText(e, 'Versand konnte nicht gestartet werden.'), 'error')
      if (e instanceof ApiError && e.code === 'plan_geaendert') await ladeProjekte(gewaehlt)
    } finally {
      setStartend(false)
    }
  }

  async function anhalten() {
    try {
      await stoppeVersand(gewaehlt)
      showToast('Versand wird nach der laufenden Mail angehalten.', 'success')
      await aktualisiereStand(gewaehlt)
    } catch (e: unknown) {
      showToast(fehlerText(e, 'Anhalten fehlgeschlagen.'), 'error')
    }
  }

  async function exportieren() {
    try {
      await downloadExport(gewaehlt)
    } catch (e: unknown) {
      showToast(fehlerText(e, 'Export fehlgeschlagen.'), 'error')
    }
  }

  if (ladend) return <div className="admin-loading"><div className="admin-spinner" /></div>
  if (fehler) return <div className="admin-form-error">{fehler}</div>
  if (!kampagne) return <div className="admin-empty">Es ist keine Kampagne definiert.</div>

  const lauf = stand?.lauf ?? null
  // Gleiche Adresse, aber nicht angehakt: nach diesem Versand ist die Adresse
  // gesperrt, diese Projekte bekämen nie eine Mail. Der Dialog warnt davor.
  const fehlend = frage ? fehlendeGleicheAdresse(projekte, auswahl) : []

  /** Die fehlenden Projekte mit anhaken und den Probelauf neu holen — die
   *  Anzahl Mails bleibt gleich, aber die Mails bekommen mehr Zeilen. */
  function fehlendeMitnehmen() {
    const neu = new Set(auswahl)
    for (const p of fehlend) neu.add(p.project_id)
    setAuswahl(neu)
    setFrage(false)
    void vorbereiten(neu)
  }
  const darfSenden = hatMandant && kampagne.offen && auswahl.size > 0 && !laeuft && !startend && !pruefend

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Kunden-Rückmeldung</div>
          <div className="admin-page-subtitle">
            Einmalige Umfrage an offene Projekte — Inhalt aus dem Code, Versand nur hier.
          </div>
        </div>
      </div>

      {kampagnen.length > 1 && (
        <div className="admin-form-row">
          <label className="admin-form-group">
            <span className="admin-form-label">Kampagne</span>
            <select className="admin-form-select" value={gewaehlt} onChange={(e) => setGewaehlt(e.target.value)}>
              {kampagnen.map((k) => <option key={k.key} value={k.key}>{k.titel}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-head">
          <div className="admin-card-title">{kampagne.titel}</div>
          <div className="admin-card-meta">
            {kampagne.tenant ? <>Mandant: <strong>{kampagne.tenant.name}</strong> ({kampagne.tenant.slug})</> : 'kein Mandant in dieser Umgebung'}
            {' · '}gültig bis {kampagne.gueltig_bis}{!kampagne.offen && ' (abgelaufen)'}
          </div>
        </div>
        <dl className="adminsite-rm-def">
          <dt>Auswahl</dt>
          <dd>
            Von Hand, unten in der Projektliste. Vorgeschlagen: Projektname passt auf
            {' '}<code>{kampagne.name_muster}</code>, Status {kampagne.nur_status.join(', ')}
          </dd>
          <dt>Betreff</dt>
          <dd>{kampagne.betreff}</dd>
          <dt>Noch pendent?</dt>
          <dd>{kampagne.pendent_frage} — bei «Nein» entfallen alle weiteren Fragen</dd>
          <dt>Umfang</dt>
          <dd>{kampagne.mehrere_frage} Ja → «{kampagne.objekte_label}», Nein → «{kampagne.anlagen_label}»</dd>
          <dt>Art der Anlage</dt>
          <dd>{kampagne.produkte.map((o) => o.label).join(' · ')}</dd>
          <dt>Dringlichkeit</dt>
          <dd>
            <ul className="adminsite-rm-liste">
              {kampagne.prioritaeten.map((o) => <li key={o.key}><strong>{o.label}</strong> — {o.hinweis}</li>)}
            </ul>
          </dd>
        </dl>
        <div className="admin-form-hint">
          Text und Fragen ändern: <code>services/rueckmeldung_kampagnen.py</code> — vor dem Versand vom Betrieb freigeben lassen.
        </div>
      </div>

      {!hatMandant && (
        <div className="admin-form-error">
          Keiner der Mandanten dieser Kampagne ({kampagne.tenant?.slug ?? '—'}) ist in dieser Umgebung aktiv.
        </div>
      )}

      {hatMandant && (
        <>
          <h3 className="admin-section-title">Projekte auswählen</h3>
          {projekteFehler && <div className="admin-form-error">{projekteFehler}</div>}
          {projekteLaden && projekte.length === 0
            ? <div className="admin-loading"><div className="admin-spinner" /></div>
            : (
              <RueckmeldungAuswahl
                projekte={projekte}
                regelText={kampagne.name_muster}
                auswahl={auswahl}
                onAuswahl={setAuswahl}
                gesperrt={laeuft || startend}
              />
            )}
          <button type="button" className="admin-btn admin-btn-secondary" disabled={projekteLaden}
                  onClick={() => { void ladeProjekte(gewaehlt) }}>
            {projekteLaden ? 'Lädt…' : 'Liste neu laden'}
          </button>

          <h3 className="admin-section-title">Vorschau</h3>
          <div className="adminsite-rm-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={vorschauArt === 'mail'}
                    className={`admin-btn ${vorschauArt === 'mail' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setVorschauArt('mail')}>Mail</button>
            <button type="button" role="tab" aria-selected={vorschauArt === 'seite'}
                    className={`admin-btn ${vorschauArt === 'seite' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setVorschauArt('seite')}>Kundenseite</button>
          </div>
          {vorschauFehler && <div className="admin-form-error">{vorschauFehler}</div>}
          {vorschau && (
            <iframe
              className="adminsite-newsletter-preview"
              title={vorschauArt === 'mail' ? 'Vorschau der Mail' : 'Vorschau der Kundenseite'}
              srcDoc={vorschau}
              // Unser eigenes HTML, aber es hat in diesem Dokument nichts
              // auszuführen und nichts abzuschicken — `sandbox` ohne Rechte.
              sandbox=""
            />
          )}

          <h3 className="admin-section-title">Testmail</h3>
          <div className="admin-form-row">
            <label className="admin-form-group">
              <span className="admin-form-label">An</span>
              <input className="admin-form-input" type="email" value={testAdresse}
                     placeholder="leer = eigene Adresse"
                     onChange={(e) => setTestAdresse(e.target.value)} />
            </label>
          </div>
          <button type="button" className="admin-btn admin-btn-secondary" disabled={testSendend}
                  onClick={() => { void sendeTest() }}>
            {testSendend ? 'Sendet…' : 'Testmail senden'}
          </button>
          <div className="admin-form-hint">
            Die Links in der Testmail zeigen die echte Kundenseite, speichern aber nichts.
          </div>

          <h3 className="admin-section-title">Versand</h3>
          <button type="button" className="admin-btn admin-btn-primary" disabled={!darfSenden}
                  onClick={() => { void vorbereiten() }}>
            {startend ? 'Startet…' : pruefend ? 'Prüft…' : `Versand vorbereiten (${auswahl.size} Projekte ausgewählt)`}
          </button>
          {laeuft && (
            <button type="button" className="admin-btn admin-btn-danger" style={{ marginLeft: 8 }}
                    onClick={() => { void anhalten() }} disabled={lauf?.stopp}>
              {lauf?.stopp ? 'Wird angehalten…' : 'Anhalten'}
            </button>
          )}
          <div className="admin-form-hint">
            Gedrosselt, eine Mail alle {kampagne.pause_s} s. Ein zweiter Start erreicht nur, wer noch nichts
            bekommen hat — auch nach einem Abbruch oder Deploy mitten im Lauf.
          </div>
          {lauf && (
            <div className="admin-card adminsite-rm-lauf">
              <strong>{lauf.laeuft ? 'Versand läuft' : 'Letzter Versand beendet'}</strong>
              {' — '}{lauf.mails_ok} gesendet, {lauf.mails_fehler} Fehler, {lauf.uebersprungen} übersprungen
              {' '}von {lauf.mails_total}
              {lauf.letzter_fehler && <div className="admin-form-hint">Letzter Fehler: {lauf.letzter_fehler}</div>}
            </div>
          )}

          <h3 className="admin-section-title">Stand</h3>
          {stand && (
            <div className="adminsite-rm-stats">
              <Kennzahl wert={stand.gesendet} label="Projekte angeschrieben" />
              <Kennzahl wert={stand.beantwortet} label="beantwortet" betont />
              <Kennzahl wert={stand.erledigt} label="davon erledigt gemeldet" />
              <Kennzahl wert={stand.fotos} label="Fotos erhalten" />
              {stand.fehler > 0 && <Kennzahl wert={stand.fehler} label="Versand fehlgeschlagen" warnung />}
              {stand.je_prioritaet.map((p) => <Kennzahl key={p.key} wert={p.anzahl} label={p.label} />)}
            </div>
          )}
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => { void exportieren() }}>
            Excel exportieren
          </button>
          <div className="admin-form-hint">
            Excel mit drei Blättern: Rückmeldungen (dringendste zuerst, farbig), Übersicht und alle Projekte — für die Einsatzplanung beim Betrieb.
          </div>
        </>
      )}

      {frage && plan && kampagne.tenant && (
        <ConfirmDialog
          title="Umfrage versenden?"
          message={`${plan.mails} Mails (${plan.offene_projekte} Projekte) an Kunden von ${kampagne.tenant.name} versenden — im Namen des Betriebs. Das lässt sich nicht zurücknehmen.`}
          warning={
            plan.treffer !== plan.offene_projekte
              ? `Von ${auswahl.size} ausgewählten Projekten werden ${plan.treffer - plan.offene_projekte} übersprungen `
                + `(${plan.mit_offerte} mit Offerte, ${plan.ohne_email.length} ohne E-Mail, `
                + `${plan.bereits_gesendet} bereits angeschrieben, ${plan.adresse_angeschrieben} Adresse schon angeschrieben).`
              : undefined
          }
          extraAction={fehlend.length > 0
            ? { label: `${fehlend.length} ${fehlend.length === 1 ? 'Projekt' : 'Projekte'} mitnehmen`, onClick: fehlendeMitnehmen }
            : undefined}
          confirmDisabled={plan.mails === 0}
          confirmLabel={`${plan.mails} Mails versenden`}
          onConfirm={() => { void versenden() }}
          onCancel={() => setFrage(false)}
          scrollable
        >
          {fehlend.length > 0 && (
            <div className="admin-confirm-warning">
              <strong>
                {fehlend.length} {fehlend.length === 1 ? 'weiteres Projekt' : 'weitere Projekte'} mit derselben
                Adresse {fehlend.length === 1 ? 'ist' : 'sind'} nicht angehakt.
              </strong>
              {' '}Nach dem Versand ist die Adresse gesperrt — {fehlend.length === 1 ? 'es bekommt' : 'sie bekommen'} dann
              keine Mail mehr. Mitnehmen heisst: dieselbe Mail, je Projekt eine Zeile mehr.
              <ul className="adminsite-rm-liste">
                {fehlend.slice(0, 8).map((p) => (
                  <li key={p.project_id}>{p.projekt_nr} {p.projekt_name} — {p.email}</li>
                ))}
                {fehlend.length > 8 && <li>… und {fehlend.length - 8} weitere</li>}
              </ul>
            </div>
          )}
        </ConfirmDialog>
      )}
      <ToastHost toast={toast} />
    </div>
  )
}

function Kennzahl({ wert, label, betont = false, warnung = false }: {
  wert: number; label: string; betont?: boolean; warnung?: boolean
}) {
  return (
    <div className={`adminsite-rm-stat${betont ? ' betont' : ''}${warnung ? ' warnung' : ''}`}>
      <div className="adminsite-rm-stat-wert">{wert}</div>
      <div className="adminsite-rm-stat-label">{label}</div>
    </div>
  )
}

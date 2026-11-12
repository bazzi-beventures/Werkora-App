import { useEffect, useState } from 'react'
import * as scoped from '../../tenantScopedApi'
import type { MailEingangView } from '../../tenantScopedApi'
import { useToast, ToastHost } from '../../../admin/components/useToast'
import { abgewiesenTeile } from '../../../shared/mailEingangGruende'
import {
  MAILSYSTEM_LABEL, TAGESLIMIT_MAX, abholungText, einstellungAus, formAus, geaendert, offenePunkte,
  postfachBereit, pruefe, type MailEingangForm,
} from './mailEingangForm'

// ─── Reiter «Mail-Eingang»: Absenderschranke je Mandant ─────────────────────
//
// Spec: docs/specs/mail-eingang-triage.md §6.4, §10. Hier — und nur hier — steht,
// wessen Mails ausgewertet werden: das Triage-Postfach, die Mail-Domains des
// Betriebs und die Funktionsadressen. Der Mandanten-Admin sieht davon nichts:
// die Liste IST die Schranke, und wer sie ändern kann, kann sie öffnen.
//
// Reihenfolge der Einrichtung: Postfach und Domains hier eintragen → erst dann
// das Modul einschalten (Reiter «Module»). Das Einschalten startet den Abruf.

const SECTION: React.CSSProperties = { padding: 24, maxWidth: 820, marginBottom: 16 }
const MUTED: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }
const FELD: React.CSSProperties = { display: 'block', marginBottom: 16 }

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function MailEingangTab({ tenantId }: { tenantId: string }) {
  const { toast, showToast } = useToast(5000)
  const [view, setView] = useState<MailEingangView | null>(null)
  const [form, setForm] = useState<MailEingangForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [serverFehler, setServerFehler] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    scoped.getMailEingang(tenantId)
      .then(v => { if (alive) { setView(v); setForm(formAus(v)); setLadeFehler(null) } })
      .catch(e => { if (alive) setLadeFehler(errorText(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tenantId])

  if (loading) {
    return <div className="admin-loading"><div className="admin-spinner" /> Mail-Eingang wird geladen…</div>
  }
  if (!view || !form) {
    return <div role="alert" className="admin-error">{ladeFehler ?? 'Die Einstellungen konnten nicht geladen werden.'}</div>
  }

  const einstellung = einstellungAus(form)
  const fehler = pruefe(einstellung)
  const dirty = geaendert(form, view)
  const offen = offenePunkte(view)
  const abgewiesen = abgewiesenTeile(view.abgewiesen)
  const feld = (key: keyof MailEingangForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => { setForm({ ...form, [key]: e.target.value }); setServerFehler(null) }
  const bereit = postfachBereit(view)

  async function save() {
    if (saving || fehler.length > 0) return
    setSaving(true)
    setServerFehler(null)
    try {
      const v = await scoped.setMailEingang(tenantId, einstellung)
      setView(v)
      setForm(formAus(v))
      showToast('Mail-Eingang gespeichert', 'success')
    } catch (e) {
      // 400 trägt den Grund im Klartext — er bleibt unter der Maske stehen, bis
      // jemand etwas ändert; ein Toast allein wäre nach fünf Sekunden weg.
      setServerFehler(errorText(e))
      showToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* ── Stand ─────────────────────────────────────────────── */}
      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>Stand</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className={`admin-badge ${view.modul_aktiv ? 'admin-badge-approved' : 'admin-badge-draft'}`}>
            {view.modul_aktiv ? 'Modul eingeschaltet — Abruf läuft' : 'Modul aus — kein Abruf'}
          </span>
          <span className={`admin-badge ${bereit ? 'admin-badge-approved' : 'admin-badge-rejected'}`}>
            {bereit ? 'Postfach-Zugang eingerichtet' : 'Postfach-Zugang fehlt'}
          </span>
          <span className="admin-badge admin-badge-draft">{MAILSYSTEM_LABEL[view.anbieter ?? 'graph']}</span>
        </div>
        <p style={MUTED}>
          Letzte Abholung: <strong>{abholungText(view.last_poll_at)}</strong>
        </p>
        {view.last_poll_fehler && (
          <p className="admin-form-hint-warn" role="alert">
            Letzter Fehler beim Abholen: {view.last_poll_fehler}
          </p>
        )}
        {offen.length > 0 && (
          <div className="admin-form-hint-warn">
            <div className="admin-form-hint-lead">Noch offen, bevor eine Mail ausgewertet wird:</div>
            <ul>{offen.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <p style={{ ...MUTED, marginBottom: 0, marginTop: 12 }}>
          Das Modul schaltest du im Reiter <strong>Module</strong> ein. Das Einschalten startet den Abruf — auch
          mit Beta-Häkchen, das nur die Oberfläche verbirgt. Vorher müssen die Voraussetzungen aus der Spec
          (mail-eingang-triage §8) stehen.
        </p>
      </div>

      {/* ── Nicht ausgewertet ─────────────────────────────────── */}
      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>Nicht ausgewertet</div>
        <p style={MUTED}>
          Mails, die an der Absenderschranke oder am Vorfilter hängen geblieben sind. Gespeichert wird nur ein
          Zähler je Grund — keine Adresse, kein Betreff. Viele «nicht aus den Domains des Betriebs» heisst meist:
          die Domain-Liste unten stimmt nicht.
        </p>
        {abgewiesen.length === 0
          ? <p style={{ ...MUTED, marginBottom: 0 }}>Keine abgewiesenen Mails gezählt.</p>
          : <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>
              {abgewiesen.map(t => <li key={t}>{t}</li>)}
            </ul>}
      </div>

      {/* ── Absenderschranke ──────────────────────────────────── */}
      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>Absenderschranke</div>
        <p style={MUTED}>
          Ausgewertet wird nur, was vom Betrieb selbst kommt: die Absenderadresse liegt in einer seiner
          Mail-Domains, das Mailsystem bestätigt die Echtheit, und die Adresse gehört zu einem aktiven Konto oder
          steht bei den Funktionsadressen. Alles andere wird gezählt, aber weder gelesen noch an die KI geschickt.
        </p>

        <div style={{ ...FELD, maxWidth: 420 }}>
          <label className="admin-form-group">
            <span className="admin-form-label">Mailsystem</span>
            <select className="admin-form-input" value={form.anbieter} onChange={feld('anbieter')}>
              {(Object.keys(MAILSYSTEM_LABEL) as (keyof typeof MAILSYSTEM_LABEL)[]).map(k => (
                <option key={k} value={k}>{MAILSYSTEM_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <div className="admin-form-hint" style={{ marginTop: 5 }}>
            {form.anbieter === 'gmail'
              ? 'Gelesen über das Google-Dienstkonto von Werkora. Der Betrieb gibt ihm in der Google-Admin-Konsole '
                + 'den Bereich gmail.readonly frei — diese Freigabe gilt für alle Postfächer der Domain; gelesen wird '
                + 'trotzdem nur das Triage-Postfach.'
              : 'Gelesen über die App-Registrierung in Microsoft 365, beschränkt auf das Triage-Postfach.'}
          </div>
        </div>

        <div style={{ ...FELD, maxWidth: 420 }}>
          <label className="admin-form-group">
            <span className="admin-form-label">Triage-Postfach</span>
            <input
              className="admin-form-input"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.mailbox}
              onChange={feld('mailbox')}
              placeholder="triage@betrieb.ch"
            />
          </label>
          <div className="admin-form-hint" style={{ marginTop: 5 }}>
            Das eine Postfach, das Werkora abholt; es liegt in einer der Mail-Domains unten. Welcher Mandant
            dahintersteht, ergibt sich aus diesem Eintrag — nie aus einer Mail.
          </div>
        </div>

        <div style={FELD}>
          <label className="admin-form-group">
            <span className="admin-form-label">Mail-Domains des Betriebs</span>
            <textarea
              className="admin-form-input"
              rows={3}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.domains}
              onChange={feld('domains')}
              placeholder={'betrieb.ch\nbetrieb-service.ch'}
            />
          </label>
          <div className="admin-form-hint" style={{ marginTop: 5 }}>Eine Domain je Zeile, ohne @.</div>
        </div>
        {einstellung.domains.length === 0 && (
          <p className="admin-form-hint-warn" role="alert" style={{ marginTop: -8, marginBottom: 16 }}>
            <strong>Leere Liste = nichts wird ausgewertet.</strong> Ohne Domain lässt die Schranke keine einzige
            Mail durch — «leer» heisst nie «alles erlaubt».
          </p>
        )}

        <div style={FELD}>
          <label className="admin-form-group">
            <span className="admin-form-label">Funktionsadressen</span>
            <textarea
              className="admin-form-input"
              rows={3}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.funktionsadressen}
              onChange={feld('funktionsadressen')}
              placeholder="info@betrieb.ch"
            />
          </label>
          <div className="admin-form-hint" style={{ marginTop: 5 }}>
            Adressen ohne eigenes Werkora-Konto, die trotzdem zuleiten dürfen (z. B. info@…) — aus den Mail-Domains
            oben, eine je Zeile. Persönliche Postfächer gehören nicht hierher.
          </div>
        </div>

        <div style={{ ...FELD, maxWidth: 220 }}>
          <label className="admin-form-group">
            <span className="admin-form-label">Tageslimit</span>
            <input
              className="admin-form-input"
              type="number"
              inputMode="numeric"
              min={0}
              max={TAGESLIMIT_MAX}
              step={1}
              value={form.tageslimit}
              onChange={feld('tageslimit')}
            />
          </label>
          <div className="admin-form-hint" style={{ marginTop: 5 }}>
            So viele Mails werden je Tag höchstens ausgewertet (0 bis {TAGESLIMIT_MAX}). Was darüber liegt, wird
            abgeholt und gezählt.
          </div>
        </div>

        {fehler.length > 0 && (
          <ul className="admin-form-error" role="alert" style={{ margin: '0 0 12px', paddingLeft: 20 }}>
            {fehler.map(f => <li key={f}>{f}</li>)}
          </ul>
        )}
        {serverFehler && (
          <p className="admin-form-error" role="alert" style={{ margin: '0 0 12px' }}>{serverFehler}</p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="admin-btn admin-btn-primary" disabled={!dirty || saving || fehler.length > 0}
                  onClick={() => void save()}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
          <button className="admin-btn admin-btn-secondary" disabled={!dirty || saving}
                  onClick={() => { setForm(formAus(view)); setServerFehler(null) }}>
            Verwerfen
          </button>
        </div>
      </div>
      <ToastHost toast={toast} />
    </div>
  )
}

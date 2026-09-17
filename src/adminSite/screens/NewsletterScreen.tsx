/**
 * Newsletter — ansehen, Vorschau, versenden. **Kein Editor.**
 *
 * Spec: docs/specs/admin-werkora-ch.md §4.3/2, docs/specs/newsletter.md.
 *
 * Die vier Endpunkte gab es seit August ohne jeden Aufrufer; versendet wurde
 * per `curl`. Das ist der Grund für diesen Screen — und zugleich die Grenze:
 * der Inhalt einer Ausgabe lebt im Code, eine Redaktionsoberfläche wäre ein
 * zweiter Ort für denselben Text.
 *
 * Die Vorschau ist der eigentliche Zweck. Was bei einem Empfänger ankommt,
 * entscheidet die Kombination Branding × Rolle × Module — und genau die lässt
 * sich sonst nirgends ansehen. Sie läuft in einem `<iframe>`: Mail-HTML bringt
 * eigene Stile mit, die im Dokument der Admin-Seite alles daneben einfärben
 * würden.
 *
 * **Der Versand-Knopf ist der scharfe Teil der Seite.** Deshalb ein
 * Bestätigungsdialog, der Ausgabe UND Ziel im Klartext nennt — die Lehre aus
 * §12: Mandanten-Verwechslung ist der teuerste Fehler dieser Oberfläche. Ein
 * Doppelklick ist ungefährlich (das Zustell-Journal ist idempotent), ein Klick
 * auf «alle Mandanten» statt auf einen ist es nicht.
 */
import { useEffect, useState } from 'react'
import {
  listEditions, previewHtml, sendEdition,
  type NewsletterEdition,
} from '../../api/newsletter'
import type { PlatformTenant } from '../../api/platform'
import { useToast, ToastHost } from '../../admin/components/useToast'
import { ConfirmDialog } from '../../admin/components/ConfirmDialog'

const ROLLEN = ['user', 'user_light', 'admin', 'management', 'superadmin']

export default function NewsletterScreen({ tenants }: { tenants: PlatformTenant[] }) {
  const [ausgaben, setAusgaben] = useState<NewsletterEdition[]>([])
  const [ladend, setLadend] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string>('')
  const [vorschauTenant, setVorschauTenant] = useState<string>('')
  const [rolle, setRolle] = useState('user')
  const [zielTenant, setZielTenant] = useState<string>('')   // '' = alle
  const [frage, setFrage] = useState(false)
  const [sendend, setSendend] = useState(false)
  const [vorschau, setVorschau] = useState<string>('')
  const [vorschauFehler, setVorschauFehler] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  useEffect(() => {
    let abgebrochen = false
    listEditions()
      .then((liste) => {
        if (abgebrochen) return
        setAusgaben(liste)
        // Neueste zuerst — der Server liefert sie bereits in dieser Reihenfolge.
        if (liste[0]) setGewaehlt(liste[0].key)
      })
      .catch((e: unknown) => {
        if (!abgebrochen) setFehler(e instanceof Error ? e.message : 'Konnte nicht laden.')
      })
      .finally(() => { if (!abgebrochen) setLadend(false) })
    return () => { abgebrochen = true }
  }, [])

  useEffect(() => {
    if (!vorschauTenant && tenants[0]) setVorschauTenant(tenants[0].id)
  }, [tenants, vorschauTenant])

  // Die Vorschau wird geholt, nicht verlinkt (siehe `previewHtml`). Jede
  // Änderung an Ausgabe, Mandant oder Rolle lädt sie neu — das ist der Zweck
  // des Screens, und drei Auswahlfelder ergeben keine teure Schleife.
  useEffect(() => {
    if (!gewaehlt || !vorschauTenant) { setVorschau(''); return }
    let abgebrochen = false
    setVorschauFehler(null)
    previewHtml(gewaehlt, vorschauTenant, rolle)
      .then((html) => { if (!abgebrochen) setVorschau(html) })
      .catch((e: unknown) => {
        if (abgebrochen) return
        setVorschau('')
        setVorschauFehler(e instanceof Error ? e.message : 'Vorschau konnte nicht geladen werden.')
      })
    return () => { abgebrochen = true }
  }, [gewaehlt, vorschauTenant, rolle])

  const ausgabe = ausgaben.find((a) => a.key === gewaehlt) ?? null
  const zielName = zielTenant
    ? (tenants.find((t) => t.id === zielTenant)?.name ?? zielTenant)
    : 'ALLE Mandanten'

  async function versenden() {
    setFrage(false)
    setSendend(true)
    try {
      const res = await sendEdition(gewaehlt, zielTenant || null)
      showToast(`Ausgabe ${res.edition_key} versendet (${res.results.length} Mandant(en)).`, 'success')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Versand fehlgeschlagen.', 'error')
    } finally {
      setSendend(false)
    }
  }

  if (ladend) return <div className="admin-loading"><div className="admin-spinner" /></div>
  if (fehler) return <div className="admin-form-error">{fehler}</div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Newsletter</div>
          <div className="admin-page-subtitle">
            Redaktionsplan aus dem Code — Vorschau und Versand. Es gibt keinen Scheduler.
          </div>
        </div>
      </div>

      <div className="admin-form-row">
        <label className="admin-form-group">
          <span className="admin-form-label">Ausgabe</span>
          <select className="admin-form-select" value={gewaehlt} onChange={(e) => setGewaehlt(e.target.value)}>
            {ausgaben.map((a) => (
              <option key={a.key} value={a.key}>{a.key} — {a.subject}</option>
            ))}
          </select>
        </label>
      </div>

      {ausgabe && (
        <div className="admin-card">
          <div className="admin-card-head">
            <div className="admin-card-title">{ausgabe.subject}</div>
            <div className="admin-card-meta">
              {ausgabe.created_on} · {ausgabe.items.length} Beitrag/Beiträge
            </div>
          </div>
          <ul className="adminsite-newsletter-items">
            {ausgabe.items.map((i) => (
              <li key={i.title}>
                <strong>{i.title}</strong>
                <div className="admin-form-hint">
                  Rollen: {i.roles.join(', ') || 'alle'}
                  {i.modules_any.length > 0 && <> · Module: {i.modules_any.join(', ')}</>}
                </div>
                <div className="admin-form-hint">Push: {i.push}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="admin-section-title">Vorschau</h3>
      <div className="admin-form-row">
        <label className="admin-form-group">
          <span className="admin-form-label">Im Kleid von</span>
          <select className="admin-form-select" value={vorschauTenant} onChange={(e) => setVorschauTenant(e.target.value)}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="admin-form-group">
          <span className="admin-form-label">In der Rolle</span>
          <select className="admin-form-select" value={rolle} onChange={(e) => setRolle(e.target.value)}>
            {ROLLEN.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>

      {vorschauFehler && <div className="admin-form-error">{vorschauFehler}</div>}
      {vorschau && (
        <iframe
          className="adminsite-newsletter-preview"
          title="Newsletter-Vorschau"
          srcDoc={vorschau}
          // Das gerenderte Mail-HTML ist unser eigenes, aber es hat in diesem
          // Dokument nichts auszuführen — `sandbox` ohne `allow-scripts`.
          sandbox=""
        />
      )}

      <h3 className="admin-section-title">Versand</h3>
      <div className="admin-form-row">
        <label className="admin-form-group">
          <span className="admin-form-label">Ziel</span>
          <select className="admin-form-select" value={zielTenant} onChange={(e) => setZielTenant(e.target.value)}>
            <option value="">Alle Mandanten</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="admin-btn admin-btn-primary"
        disabled={!gewaehlt || sendend}
        onClick={() => setFrage(true)}
      >
        {sendend ? 'Versendet…' : 'Jetzt versenden'}
      </button>
      <div className="admin-form-hint">
        Ein zweiter Versand erreicht nur, bei wem beim ersten Mal nichts ankam —
        das Zustell-Journal überspringt den Rest.
      </div>

      {frage && (
        <ConfirmDialog
          title="Newsletter versenden?"
          message={`Ausgabe «${ausgabe?.subject ?? gewaehlt}» an ${zielName} versenden.`}
          confirmLabel="Versenden"
          onConfirm={versenden}
          onCancel={() => setFrage(false)}
        />
      )}
      <ToastHost toast={toast} />
    </div>
  )
}

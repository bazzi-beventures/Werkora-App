import { ApiError } from '../../api/client'
import { backdropCloseProps } from '../../shared/backdropClose'
import {
  acceptMailVorschlag, type ProjektEntwurfPayload, type VorschlagEntscheid,
} from '../../api/admin/mailEingang'
import ProjektAnlegenFormular, { type ProjektWerte } from '../operative/ProjektAnlegenFormular'
import { serverSatz } from './mailEingang'

/**
 * Neue Anfrage → Projekt, direkt aus dem Mail-Eingang
 * (docs/specs/mail-eingang-aufgaben-antworten.md §10/1, entschieden 2026-11-13).
 *
 * Statt eines Entwurfs in einer zweiten Liste öffnet «Projekt anlegen» dieselbe
 * Maske wie das Umwandeln eines Entwurfs (ProjektAnlegenFormular). «Projekt
 * erstellen» übernimmt den Vorschlag mit den Werten der Maske; der Server legt
 * das Projekt an und schreibt Kunde laut Mail, Beschreibung und Herkunft in die
 * Bemerkung. Abbrechen schreibt nichts — der Vorschlag bleibt offen.
 */

interface Props {
  itemId: string
  suggestionId: string
  payload: ProjektEntwurfPayload
  /** Der Kunde, den der Server dem Absender schon zugeordnet hat. */
  kunde?: { id: string | number; name: string } | null
  onClose: () => void
  onAngelegt: (entscheid: VorschlagEntscheid) => void
  /** 409: jemand war schneller — der Screen meldet es und lädt neu (wie bei «Übernehmen»). */
  onSchonEntschieden: (fehler: unknown) => void
}

export default function ProjektAusMail({
  itemId, suggestionId, payload: p, kunde, onClose, onAngelegt, onSchonEntschieden,
}: Props) {
  async function erstellen(werte: ProjektWerte) {
    let entscheid: VorschlagEntscheid
    try {
      entscheid = await acceptMailVorschlag(itemId, suggestionId, { ...werte })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onClose()
        onSchonEntschieden(e)
        return
      }
      // Ein Satz des Servers («Diesen Kunden gibt es nicht (mehr).») — kein Fehlercode.
      // Die Maske zeigt die Meldung und bleibt offen.
      return Promise.reject(new Error(
        serverSatz(e instanceof Error ? e.message : '') ?? 'Das Projekt liess sich nicht anlegen.'))
    }
    onAngelegt(entscheid)
  }

  const kundeZeilen = [
    p.customer_phone && `Tel: ${p.customer_phone}`,
    p.customer_email && `E-Mail: ${p.customer_email}`,
    p.customer_address && `Adresse: ${p.customer_address}`,
  ].filter(Boolean)

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal" role="dialog" aria-label="Projekt anlegen" style={{ maxWidth: 640 }}
           onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Projekt anlegen</div>
          <button type="button" className="admin-modal-close" aria-label="Schliessen" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="eingang-hinweis">
            <strong>Ungeprüfte Angaben aus einer E-Mail.</strong> Name, Adresse und Kontakt stammen aus
            der weitergeleiteten Nachricht — vor dem Anlegen prüfen.
          </div>
          {/* Fremdtext aus der Mail: nur als Text. */}
          <dl className="eingang-werte">
            {p.customer_name && <div><dt>Kunde laut Mail:</dt><dd>{p.customer_name}</dd></div>}
            {kundeZeilen.length > 0 && <div><dt>Kontakt:</dt><dd>{kundeZeilen.join(' · ')}</dd></div>}
            {p.description && <div><dt>Beschreibung:</dt><dd>{p.description}</dd></div>}
          </dl>
          <ProjektAnlegenFormular
            start={{
              projectName: p.title ?? '',
              objectName: p.object_name ?? '',
              objectAddress: p.object_address || p.customer_address || '',
              contactName: p.customer_name ?? '',
              contactPhone: p.customer_phone ?? '',
              artDerArbeit: [],
              kundeName: p.customer_name ?? '',
              kundePhone: p.customer_phone ?? '',
              kundeEmail: p.customer_email ?? '',
              kundeAddress: p.customer_address ?? '',
              kundeId: kunde ? String(kunde.id) : null,
            }}
            quelle="aus der Mail"
            fussnote="Kunde laut Mail, Beschreibung und Herkunft der Mail werden als Bemerkung ins Projekt übernommen."
            onErstellen={erstellen}
            zusatzAktion={laeuft => (
              <button type="button" className="admin-btn admin-btn-secondary" disabled={laeuft} onClick={onClose}>
                Abbrechen
              </button>
            )}
          />
        </div>
      </div>
    </div>
  )
}

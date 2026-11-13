import { useEffect, useState } from 'react'
import {
  getMailEingangText,
  type EingangItem, type EingangOriginal, type VorschlagEntscheid,
} from '../../api/admin/mailEingang'
import type { ProjectTab } from '../operative/projectDetail/ProjectTabBar'
import type { AdminScreen } from '../useAdminNav'
import { CustomerLink } from '../components/CustomerLink'
import VorschlagKarte, { type EntscheidArt } from './VorschlagKarte'
import {
  anhaengeText, fmtWann, itemStatus, kategorieLabel, offeneVorschlaege, personText,
} from './mailEingang'

/**
 * Eine weitergeleitete Mail im Eingang — docs/specs/mail-eingang-triage.md §10.
 *
 * Zugeklappt zeigt die Karte Kopfdaten und Zusammenfassung. Entschieden wird nur
 * in der geöffneten Karte, und dort steht der **Originaltext über den
 * Vorschlägen**: der Vorschlag ist eine Lesart, die Mail die Quelle (§4.2). Der
 * Text wird beim Öffnen frisch aus dem Postfach geholt und nirgends gehalten
 * ausser in dieser Komponente (§6.3).
 */

interface Props {
  item: EingangItem
  /** «Nicht für Werkora» läuft gerade für diese Karte. */
  busy?: boolean
  onEntschieden: (itemId: string, entscheid: VorschlagEntscheid, art: EntscheidArt) => void
  onFehler: (fehler: unknown, art: EntscheidArt) => void
  onDismiss: (item: EingangItem) => void
  onNav?: (screen: AdminScreen, detailId?: string, tab?: ProjectTab) => void
  /** Beta: darf dieses Konto Antworten aus Werkora senden? */
  antwortenSenden?: boolean
}

type OriginalZustand =
  | { phase: 'laedt' }
  | { phase: 'fehler' }
  | { phase: 'da'; original: EingangOriginal }

function Original({ itemId }: { itemId: string }) {
  const [zustand, setZustand] = useState<OriginalZustand>({ phase: 'laedt' })
  const [versuch, setVersuch] = useState(0)

  useEffect(() => {
    let aktiv = true
    setZustand({ phase: 'laedt' })
    getMailEingangText(itemId)
      .then(original => { if (aktiv) setZustand({ phase: 'da', original }) })
      .catch(() => { if (aktiv) setZustand({ phase: 'fehler' }) })
    return () => { aktiv = false }
  }, [itemId, versuch])

  if (zustand.phase === 'laedt') {
    return <div className="eingang-hinweis" role="status">Original wird aus dem Postfach geholt…</div>
  }
  if (zustand.phase === 'fehler') {
    return (
      <div className="eingang-aktionen" style={{ marginTop: 0 }}>
        <span role="alert" className="admin-form-error">Das Original konnte nicht geladen werden.</span>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => setVersuch(n => n + 1)}>
          Erneut versuchen
        </button>
      </div>
    )
  }
  const { vorhanden, text } = zustand.original
  if (!vorhanden) {
    return <div className="eingang-hinweis">Original nicht mehr im Postfach vorhanden.</div>
  }
  if (!text?.trim()) {
    return <div className="eingang-hinweis">Die Mail enthält keinen Text.</div>
  }
  // Reiner Text (Spec §9, R4/R5): React setzt ihn als Textknoten, nie als HTML;
  // Adressen und Links darin bleiben Buchstaben und werden nicht anklickbar.
  return <pre className="eingang-original" tabIndex={0} aria-label="Originaltext der Mail">{text}</pre>
}

export default function EingangKarte({
  item, busy, onEntschieden, onFehler, onDismiss, onNav, antwortenSenden = false,
}: Props) {
  const [offen, setOffen] = useState(false)
  const status = itemStatus(item.status)
  const zugeleitet = personText(item.weitergeleitet_von)
  const absender = personText(item.absender)
  const anzahlOffen = offeneVorschlaege(item)
  const anhaenge = anhaengeText(item.anhaenge)
  const istOffen = item.status === 'offen'

  return (
    <article className="eingang-karte" aria-label={item.subject || 'Mail ohne Betreff'}>
      <div className="eingang-kopf">
        <div className="eingang-betreff">{item.subject?.trim() || '(ohne Betreff)'}</div>
        <div className="eingang-marken">
          <span className="admin-badge admin-badge-draft">{kategorieLabel(item.kategorie)}</span>
          <span className={`admin-badge ${status.badge}`}>{status.label}</span>
        </div>
      </div>

      <div className="eingang-meta">
        Eingang {fmtWann(item.received_at)}
        {zugeleitet && <> · weitergeleitet von <strong>{zugeleitet}</strong></>}
      </div>
      {/* Der Zusatz ist fest (Spec §6.4, §9 R2): Werkora kann den ursprünglichen
          Absender nicht prüfen — die Adresse steht nur im weitergeleiteten Text. */}
      <div className="eingang-meta">
        Ursprünglicher Absender:{' '}
        {absender
          ? <><strong>{absender}</strong> <span className="eingang-ungeprueft">— aus der Mail gelesen</span></>
          : <span className="eingang-ungeprueft">in der Mail nicht gefunden</span>}
      </div>
      {item.customer && (
        <div className="eingang-meta">
          Vermuteter Kunde:{' '}
          <CustomerLink customerId={String(item.customer.id)}
                        onOpen={onNav ? id => onNav('customers', id) : undefined}>
            <strong>{item.customer.name}</strong>
          </CustomerLink>
        </div>
      )}

      {/* Dateinamen sind Fremdtext aus der Mail — eine Zeile Text, keine Links.
          Kopiert wird ein Anhang erst, wenn jemand ihn als Vorschlag übernimmt. */}
      {anhaenge && (
        <div className="eingang-meta" data-testid="eingang-anhaenge">
          {item.anhaenge!.length === 1 ? 'Anhang' : 'Anhänge'}: {anhaenge}
        </div>
      )}

      {item.summary?.trim()
        ? <p className="eingang-zusammenfassung">{item.summary}</p>
        : <p className="eingang-zusammenfassung eingang-hinweis">
            {istOffen ? 'Keine Zusammenfassung vorhanden.' : 'Die Zusammenfassung wurde gelöscht.'}
          </p>}

      <div className="eingang-aktionen">
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                aria-expanded={offen} onClick={() => setOffen(o => !o)}>
          {offen
            ? 'Zuklappen'
            : istOffen && anzahlOffen > 0
              ? `Original und ${anzahlOffen === 1 ? 'Vorschlag' : `${anzahlOffen} Vorschläge`} öffnen`
              : 'Original und Vorschläge öffnen'}
        </button>
        {istOffen && (
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={busy} onClick={() => onDismiss(item)}>
            Nicht für Werkora
          </button>
        )}
      </div>

      {offen && (
        <>
          <section className="eingang-abschnitt" aria-label="Original">
            <div className="eingang-abschnitt-titel">Original</div>
            <Original itemId={item.id} />
          </section>

          <section className="eingang-abschnitt" aria-label="Vorschläge">
            <div className="eingang-abschnitt-titel">Vorschläge</div>
            {item.suggestions.length === 0 ? (
              <div className="eingang-hinweis">Zu dieser Mail gibt es keinen Vorschlag.</div>
            ) : (
              <div className="eingang-vorschlaege">
                {item.suggestions.map(v => (
                  <VorschlagKarte
                    key={v.id}
                    itemId={item.id}
                    vorschlag={v}
                    onEntschieden={(entscheid, art) => onEntschieden(item.id, entscheid, art)}
                    onFehler={onFehler}
                    onNav={onNav}
                    kunde={item.customer}
                    antwortenSenden={antwortenSenden}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </article>
  )
}

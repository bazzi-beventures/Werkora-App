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
  anhaengeText, fmtWann, initialen, itemStatus, kategorieFarbe, kategorieLabel, offeneVorschlaege,
  personText, typFarbe, typKurz,
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

// Kleine Symbole der Karte — rein dekorativ, die Zeilen tragen ihren Text selbst.
const IconFunke = () => (
  <svg className="eingang-funke" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" />
  </svg>
)
const IconWeiter = () => (
  <svg className="eingang-symbol" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20" />
  </svg>
)
const IconKlammer = () => (
  <svg className="eingang-symbol" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
  </svg>
)
const IconHaken = () => (
  <svg className="eingang-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
)
const IconUmschlag = () => (
  <svg className="eingang-symbol" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
  </svg>
)

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
  const kuerzel = initialen(item.absender)
  const wann = fmtWann(item.received_at)

  return (
    <article className={`eingang-karte${offen ? ' ist-offen' : ''}${istOffen ? '' : ' ist-erledigt'}`}
             data-farbe={kategorieFarbe(item.kategorie) ?? undefined}
             aria-label={item.subject || 'Mail ohne Betreff'}>
      <div className="eingang-kopf">
        <div className="eingang-avatar" aria-hidden="true">{kuerzel ?? <IconUmschlag />}</div>
        <div className="eingang-kopf-text">
          <div className="eingang-titelzeile">
            <div className="eingang-betreff">{item.subject?.trim() || '(ohne Betreff)'}</div>
            {wann && <time className="eingang-zeit" dateTime={item.received_at} title="Eingang">{wann}</time>}
          </div>
          {/* Der Zusatz ist fest (Spec §6.4, §9 R2): Werkora kann den ursprünglichen
              Absender nicht prüfen — die Adresse steht nur im weitergeleiteten Text. */}
          <div className="eingang-meta">
            Ursprünglicher Absender:{' '}
            {absender
              ? <><strong>{absender}</strong> <span className="eingang-ungeprueft">— aus der Mail gelesen</span></>
              : <span className="eingang-ungeprueft">in der Mail nicht gefunden</span>}
          </div>
          {zugeleitet && (
            <div className="eingang-meta"><IconWeiter /> weitergeleitet von <strong>{zugeleitet}</strong></div>
          )}
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
              <IconKlammer /> {item.anhaenge!.length === 1 ? 'Anhang' : 'Anhänge'}: {anhaenge}
            </div>
          )}
        </div>
      </div>

      {item.summary?.trim()
        ? <p className="eingang-zusammenfassung">{item.summary}</p>
        : <p className="eingang-zusammenfassung eingang-hinweis">
            {istOffen ? 'Keine Zusammenfassung vorhanden.' : 'Die Zusammenfassung wurde gelöscht.'}
          </p>}

      {/* Was der Agent aus der Mail gelesen hat: das Anliegen und, je Vorschlag,
          ein Abzeichen in der Farbe seiner Tätigkeit — wie auf werkora.ch. */}
      <div className="eingang-ki">
        <IconFunke />
        <span className="eingang-kat">{kategorieLabel(item.kategorie)}</span>
        {item.suggestions.length > 0 && (
          <ul className="eingang-chips" aria-label="Vorschläge">
            {item.suggestions.map(v => (
              <li key={v.id} className="eingang-chip" data-farbe={typFarbe(v.typ) ?? undefined}
                  data-status={v.status}>
                {v.status === 'uebernommen' && <IconHaken />}
                {typKurz(v.typ)}
                {v.status === 'verworfen' && <span className="eingang-sr"> (verworfen)</span>}
                {v.status === 'uebernommen' && <span className="eingang-sr"> (übernommen)</span>}
              </li>
            ))}
          </ul>
        )}
        <span className={`admin-badge ${status.badge} eingang-status`}>{status.label}</span>
      </div>

      <div className="eingang-aktionen">
        <button type="button"
                className={`admin-btn ${!offen && istOffen && anzahlOffen > 0 ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
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

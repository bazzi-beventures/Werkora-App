// Statuszelle und Aktionen der Offertenliste (Charge H5).
//
// Die Liste hat zwei Darstellungen: Tabelle am Desktop, Karten am Handy
// (AdminCardList). Beide zeigen denselben Status und dieselben Knöpfe — sie
// stehen darum hier, nicht zweimal im Screen. Genau diese Doppelung ist der
// Grund, warum die Offerten am Handy bisher gar keine Karten hatten.

import { apiUrl } from '../../../api/client'
import { QUOTE_STATUS_BADGE, QUOTE_STATUS_LABELS } from '../../constants/statuses'
import { fmtDate } from '../../utils/format'
import { isQuoteWithoutFeedback } from '../quoteFeedback'
import type { Quote } from './quoteTypes'

/** Was die beiden Feature-Flags am Zeilenbild ändern — in beiden Darstellungen gleich. */
export interface QuoteListFlags {
  dankEnabled: boolean       // offerte_dank_mail
  absageEnabled: boolean     // offerte_absage_mail
  feedbackWaitHours: number  // offerte_kein_feedback_meldung; 0 = aus
}

export function QuoteStatusCell({ quote: q, flags }: { quote: Quote; flags: QuoteListFlags }) {
  return (
    <>
      <span className={`admin-badge ${QUOTE_STATUS_BADGE[q.status] || 'admin-badge-draft'}`}>
        {QUOTE_STATUS_LABELS[q.status] || q.status}
      </span>
      {/* Zusätzlich zum Status, nicht an seiner Stelle: die Offerte ist
          weiterhin 'gesendet' und ausdrücklich nicht abgelehnt. */}
      {flags.feedbackWaitHours > 0 && isQuoteWithoutFeedback(q, flags.feedbackWaitHours) && (
        <span
          className="admin-badge admin-badge-pending"
          style={{ marginLeft: 4 }}
          title={`Seit über ${flags.feedbackWaitHours} Stunden keine Rückmeldung des Kunden — die Offerte ist weiterhin offen.`}
        >
          Kein Feedback
        </span>
      )}
      {q.reminder_sent_at && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
          Erinnerung gesendet {fmtDate(q.reminder_sent_at)}
        </div>
      )}
      {flags.dankEnabled && q.thankyou_sent_at && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
          Danke-Mail gesendet {fmtDate(q.thankyou_sent_at)}
        </div>
      )}
      {flags.absageEnabled && q.rejection_mail_sent_at && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
          Absage-Mail gesendet {fmtDate(q.rejection_mail_sent_at)}
        </div>
      )}
      {/* Ohne Feature-Bedingung: die Auftragsbestätigung steht jedem Mandanten offen. */}
      {q.order_confirmation_sent_at && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
          Auftragsbestätigung gesendet {fmtDate(q.order_confirmation_sent_at)}
        </div>
      )}
    </>
  )
}

export interface QuoteActionHandlers {
  onEdit: (id: number) => void
  onSend: (quote: Quote) => void
  onThankyou: (quote: Quote) => void
  onOrderConfirmation: (quote: Quote) => void
  onSendRejection: (id: number) => void
  onStatus: (id: number, status: string) => void
}

export function QuoteRowActions({ quote: q, flags, acting, on }: {
  quote: Quote
  flags: QuoteListFlags
  /** id der Offerte, deren Aktion gerade läuft — sperrt ihre Knöpfe. */
  acting: number | null
  on: QuoteActionHandlers
}) {
  const busy = acting === q.id
  return (
    <>
      {(q.storage_path || q.pdf_url) && (
        <a
          href={apiUrl(`/pwa/admin/quotes/${q.id}/pdf`)}
          target="_blank"
          rel="noreferrer"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={e => e.stopPropagation()}
        >
          PDF
        </a>
      )}
      {(q.xlsx_storage_path || q.xlsx_url) && (
        <a
          href={apiUrl(`/pwa/admin/quotes/${q.id}/xlsx`)}
          target="_blank"
          rel="noreferrer"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={e => e.stopPropagation()}
        >
          XLSX
        </a>
      )}
      {['entwurf', 'gesendet'].includes(q.status) && (
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => on.onEdit(q.id)} disabled={busy}>
          Bearbeiten
        </button>
      )}
      {['entwurf', 'akzeptiert'].includes(q.status) && (
        <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => on.onSend(q)} disabled={busy}>
          Senden
        </button>
      )}
      {flags.dankEnabled && q.status === 'akzeptiert' && !q.thankyou_sent_at && (
        <button
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => on.onThankyou(q)}
          disabled={busy}
          title="Dankesmail an den Kunden senden"
        >
          Dankeschön senden
        </button>
      )}
      {/* Auftragsbestätigung: bewusst ohne Feature-Flag — was der Kunde nach einer
          Zusage erwartet, darf nicht an einem Schalter hängen. Das Feature
          `offerte_auftragsbestaetigung` schaltet nur den automatischen Versand.
          Der Knopf bleibt nach dem Versand stehen (beschriftet als "erneut senden"):
          falsche Adresse erwischt, beim Kunden nie angekommen, Kopie fürs Treuhandbüro
          — vorher war die Bestätigung nach einem Klick für immer unerreichbar. Gegen
          Doppelversand schützt weiter der Claim im Backend, nicht ein fehlender Knopf. */}
      {q.status === 'akzeptiert' && (
        <button
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => on.onOrderConfirmation(q)}
          disabled={busy}
          title={q.order_confirmation_sent_at
            ? 'Auftragsbestätigung erneut an den Kunden senden'
            : 'Auftragsbestätigung an den Kunden senden'}
        >
          {q.order_confirmation_sent_at ? 'AB erneut senden' : 'Auftragsbestätigung'}
        </button>
      )}
      {flags.absageEnabled && q.status === 'abgelehnt' && !q.rejection_mail_sent_at && (
        <button
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => on.onSendRejection(q.id)}
          disabled={busy}
          title="Absage-Mail an den Kunden senden"
        >
          {busy ? '…' : 'Absage senden'}
        </button>
      )}
      {/* Auch bei 'entwurf': eine am Telefon zugesagte oder abgelehnte
          Offerte muss man abschliessen können, ohne sie vorher pro forma
          per Mail zu versenden. */}
      {['entwurf', 'gesendet'].includes(q.status) && (
        <>
          <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => on.onStatus(q.id, 'akzeptiert')} disabled={busy}>
            {busy ? '…' : 'Akzeptieren'}
          </button>
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => on.onStatus(q.id, 'abgelehnt')} disabled={busy}>
            {busy ? '…' : 'Ablehnen'}
          </button>
        </>
      )}
      {['entwurf', 'gesendet', 'akzeptiert'].includes(q.status) && (
        <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => on.onStatus(q.id, 'absage')} disabled={busy}>
          {busy ? '…' : 'Absage'}
        </button>
      )}
      {['entwurf', 'gesendet', 'akzeptiert', 'abgelehnt', 'absage'].includes(q.status) && (
        <button
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={() => on.onStatus(q.id, 'archiviert')}
          disabled={busy}
          title="Archivieren"
        >
          Archiv
        </button>
      )}
    </>
  )
}

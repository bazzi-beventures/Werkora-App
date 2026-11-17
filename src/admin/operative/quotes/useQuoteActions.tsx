// Handler und Dialoge der Offerten-Aktionen (Bearbeiten, Senden, Per Post,
// Akzeptieren, Ablehnen, Absage, Archiv, Danke-Mail, Auftragsbestätigung).
//
// Aus QuotesScreen herausgezogen, weil zwei Stellen dieselben Knöpfe zeigen:
// die Offertenliste und das Seitenpanel der Dashboard-Kachel «Offerten in
// Bearbeitung». Liefen die Handler zweimal, liefe auch eine der beiden Stellen
// der anderen hinterher (anderes Postversand-Datum, fehlender Danke-Dialog …).
// Die Knöpfe selbst stehen in QuoteListParts (`QuoteRowActions`).

import { useEffect, useState } from 'react'
import {
  getQuoteDetail, markQuoteSentByPost, sendQuoteRejection, setQuoteStatus,
} from '../../../api/admin/quotes'
import { getMe } from '../../../api/auth'
import { getFeature, isFeatureEnabled } from '../../../api/modules'
import { QUOTE_STATUS_LABELS } from '../../constants/statuses'
import { fmtCHF, todayISO } from '../../utils/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { ToastFn } from '../../components/useToast'
import { SendQuoteDialog } from '../SendQuoteDialog'
import { SendOrderConfirmationDialog, SendThankyouDialog } from '../SendQuoteMailDialog'
import { quoteWaitHours } from '../quoteFeedback'
import type { QuoteActionHandlers, QuoteListFlags } from './QuoteListParts'
import type { Quote, QuoteDetail } from './quoteTypes'

interface Options {
  /** Liste neu laden, nachdem eine Aktion etwas geändert hat. */
  reload: () => void
  showToast: ToastFn
}

export function useQuoteActions({ reload, showToast }: Options) {
  const [acting, setActing] = useState<number | null>(null)
  const [editQuote, setEditQuote] = useState<QuoteDetail | null>(null)
  const [sendQuote, setSendQuote] = useState<Quote | null>(null)
  // Danke-Mail-Dialog (Feature offerte_dank_mail): fragt analog zum Offerten-Versand
  // zuerst die Empfänger-Adresse ab, vorbelegt mit der Kunden-E-Mail der Offerte.
  const [thankyouQuote, setThankyouQuote] = useState<Quote | null>(null)
  // Auftragsbestätigungs-Dialog: gleiche Empfänger-Abfrage, aber ohne Feature-Bedingung —
  // der Knopf steht bei jeder angenommenen Offerte bereit.
  const [orderConfirmationQuote, setOrderConfirmationQuote] = useState<Quote | null>(null)
  // Postversand: Offerte als versendet markieren, ohne sie zu mailen (Gegenstück zum
  // gleichnamigen Knopf bei der Rechnung). Das Datum ist vorbelegt mit heute und
  // nachtragbar — erfasst wird der Versand oft erst Tage später.
  const [postalQuote, setPostalQuote] = useState<Quote | null>(null)
  const [postalDate, setPostalDate] = useState('')
  // Feature-Flags: «Dankeschön senden» (offerte_dank_mail), «Absage senden»
  // (offerte_absage_mail) und die Kennzeichnung «Kein Feedback»
  // (offerte_kein_feedback_meldung; 0 = aus).
  const [flags, setFlags] = useState<QuoteListFlags>({ dankEnabled: false, absageEnabled: false, feedbackWaitHours: 0 })

  useEffect(() => {
    getMe().then(me => {
      const fb = getFeature<{ enabled?: boolean; stunden?: number }>(me, 'offerte_kein_feedback_meldung')
      setFlags({
        dankEnabled: isFeatureEnabled(me, 'offerte_dank_mail'),
        absageEnabled: isFeatureEnabled(me, 'offerte_absage_mail'),
        feedbackWaitHours: fb?.enabled ? quoteWaitHours(fb) : 0,
      })
    }).catch(() => {})
  }, [])

  async function handleSendRejection(id: number) {
    setActing(id)
    try {
      const res = await sendQuoteRejection(id)
      showToast(res.message || 'Absage-Mail gesendet', 'success')
      reload()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Absage-Mail fehlgeschlagen', 'error')
    } finally {
      setActing(null)
    }
  }

  function openPostal(q: Quote) {
    setPostalDate(todayISO())
    setPostalQuote(q)
  }

  async function handleMarkSentByPost(id: number) {
    setActing(id)
    try {
      await markQuoteSentByPost(id, postalDate)
      showToast('Offerte als per Post versendet markiert', 'success')
      setPostalQuote(null)
      reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleEdit(id: number) {
    try {
      setEditQuote(await getQuoteDetail(id))
    } catch {
      showToast('Offerte konnte nicht geladen werden', 'error')
    }
  }

  async function handleStatus(id: number, status: string) {
    setActing(id)
    try {
      await setQuoteStatus(id, status)
      showToast(`Status auf «${QUOTE_STATUS_LABELS[status]}» gesetzt`, 'success')
      reload()
    } catch {
      showToast('Fehler beim Aktualisieren', 'error')
    } finally {
      setActing(null)
    }
  }

  const actions: QuoteActionHandlers = {
    onEdit: handleEdit,
    onSend: setSendQuote,
    onThankyou: setThankyouQuote,
    onOrderConfirmation: setOrderConfirmationQuote,
    onSendRejection: handleSendRejection,
    onStatus: handleStatus,
    onMarkSent: openPostal,
  }

  const dialogs = (
    <>
      {sendQuote && (
        <SendQuoteDialog
          quoteId={sendQuote.id}
          header={<>{sendQuote.quote_number} · {fmtCHF(sendQuote.total_amount)}<br />Projekt: {sendQuote.project_name}</>}
          onClose={() => setSendQuote(null)}
          onSent={email => { showToast(`Offerte an ${email} gesendet`, 'success'); setSendQuote(null); reload() }}
        />
      )}

      {thankyouQuote && (
        <SendThankyouDialog
          quoteId={thankyouQuote.id}
          defaultEmail={thankyouQuote.customer_email || ''}
          header={<>{thankyouQuote.quote_number} · {fmtCHF(thankyouQuote.total_amount)}<br />Projekt: {thankyouQuote.project_name}</>}
          onClose={() => setThankyouQuote(null)}
          onSent={msg => { showToast(msg, 'success'); setThankyouQuote(null); reload() }}
        />
      )}

      {orderConfirmationQuote && (
        <SendOrderConfirmationDialog
          quoteId={orderConfirmationQuote.id}
          defaultEmail={orderConfirmationQuote.customer_email || ''}
          alreadySentAt={orderConfirmationQuote.order_confirmation_sent_at}
          header={<>{orderConfirmationQuote.quote_number} · {fmtCHF(orderConfirmationQuote.total_amount)}<br />Projekt: {orderConfirmationQuote.project_name}</>}
          onClose={() => setOrderConfirmationQuote(null)}
          onSent={msg => { showToast(msg, 'success'); setOrderConfirmationQuote(null); reload() }}
        />
      )}

      {/* Bestätigungsdialog Postversand — Zwilling des Rechnungs-Dialogs. */}
      {postalQuote && (
        <ConfirmDialog
          title="Als per Post versendet markieren?"
          message={
            <>
              {postalQuote.quote_number} · {fmtCHF(postalQuote.total_amount)}<br />
              Projekt: {postalQuote.project_name}<br />
              Es wird keine E-Mail verschickt. Die Offerte gilt danach als gesendet —
              Erinnerung und die Kennzeichnung «Kein Feedback» zählen ab dem Versanddatum.
            </>
          }
          confirmLabel="Als versendet markieren"
          busyLabel="…"
          busy={acting === postalQuote.id}
          confirmDisabled={!postalDate}
          onCancel={() => setPostalQuote(null)}
          onConfirm={() => void handleMarkSentByPost(postalQuote.id)}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="quote-postal-sent-date">Versanddatum</label>
            <input
              id="quote-postal-sent-date"
              className="admin-form-input"
              type="date"
              value={postalDate}
              max={todayISO()}
              onChange={e => setPostalDate(e.target.value)}
            />
          </div>
        </ConfirmDialog>
      )}
    </>
  )

  return { flags, actions, acting, editQuote, closeEdit: () => setEditQuote(null), dialogs }
}

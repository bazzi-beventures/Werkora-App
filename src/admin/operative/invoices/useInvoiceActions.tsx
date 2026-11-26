// Aktionen einer Rechnung (PDF, Senden, Per Post versendet, Als bezahlt
// markieren, Archivieren, Zahlung zurücksetzen) samt Bestätigungsdialogen und
// bexio-Pille.
//
// Aus InvoicesScreen herausgezogen, weil drei Stellen dieselben Knöpfe zeigen:
// Tabelle und Handy-Karten der Rechnungsliste und das Seitenpanel der
// Dashboard-Kachel «Rechnungsentwürfe». Liefen Handler und Dialoge mehrfach,
// liefe eine Stelle der anderen hinterher (Zahlungsbetrag, bexio-Storno,
// «Projekt abschliessen?» …).

import { useEffect, useState } from 'react'
import { apiUrl } from '../../../api/client'
import {
  archiveInvoice, cancelInBexio, getBexioStatus, markInvoicePaid, markInvoiceSentByPost,
  sendInvoice as sendInvoiceByMail, setInvoiceMahnstopp, unmarkInvoicePaid,
} from '../../../api/admin/invoices'
import type { BexioBadge as BexioBadgeData, Invoice } from '../../../api/admin/invoices'
import { getProject, listProjectInvoices, setProjectStatus } from '../../../api/admin/projects'
import { fmtCHF, todayISO } from '../../utils/format'
import { checkPaidAmount, paidAmountDefault } from '../../utils/paidAmount'
import { isInvoiceOpen, openInvoicesHint } from '../../utils/openInvoices'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import type { ToastFn } from '../../components/useToast'
import { BEXIO_CANCEL_MESSAGE, BexioCancelCheckbox } from '../BexioBadge'
import { CcEmailRows, recipientSummary } from '../CcEmailRows'
import { PaidAmountField } from '../PaidAmountField'

/** Weitere offene Rechnungen desselben Projekts. Die soeben bezahlte ist
 *  ausgenommen — falls ihr neuer Status noch nicht durch ist. */
export function countOtherOpen(projectInvoices: Invoice[], paidId: number): number {
  return projectInvoices.filter(i => i.id !== paidId && isInvoiceOpen(i.status)).length
}

/** Hinweis an einer offenen Rechnung: das Projekt hat schon eine bezahlte Rechnung
 *  in der Höhe von Offerte/Rapport (±10 %) — braucht es diese noch?
 *  Regel: services/verrechnung_check.py. */
export function EvtlVerrechnetBadge({ invoice }: { invoice: Pick<Invoice, 'evtl_bereits_verrechnet'> }) {
  if (!invoice.evtl_bereits_verrechnet) return null
  return (
    <span
      className="admin-badge admin-badge-pending"
      style={{ marginLeft: 4 }}
      title="Auf diesem Projekt ist schon eine Rechnung bezahlt, die höchstens 10 % von Offerte und Rapport abweicht. Prüfen, ob es diese Rechnung noch braucht."
    >
      Evtl. bereits verrechnet
    </span>
  )
}

/** bexio-Badges der ausgestellten Rechnungen einer Liste (Modul `bexio`,
 *  docs/specs/bexio-anbindung.md §8.2). Ein Fehler kostet nur das Badge, nie die Liste.
 *  `invoices` muss eine stabile Referenz sein — sonst fragt der Effekt endlos neu. */
export function useBexioBadges(invoices: Invoice[], bexioOn: boolean) {
  const [bexio, setBexio] = useState<Record<string, BexioBadgeData>>({})
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!bexioOn) return
    let weg = false
    const ids = invoices
      .filter(r => r.status === 'gesendet' || r.status === 'bezahlt' || r.status === 'archiviert')
      .map(r => Number(r.id))
    getBexioStatus(ids)
      .then(states => { if (!weg) setBexio(states) })
      .catch(() => { if (!weg) setBexio({}) })
    return () => { weg = true }
  }, [invoices, bexioOn, tick])
  return { bexio, refreshBexio: () => setTick(t => t + 1) }
}

export interface InvoiceActionHandlers {
  onSend: (inv: Invoice) => void
  onPostal: (inv: Invoice) => void
  onPaid: (inv: Invoice) => void
  onArchive: (inv: Invoice) => void
  onUnpay: (inv: Invoice) => void
  /** Pille «bexio: Storno offen». */
  onBexioCancel: (inv: Invoice) => void
  /** Häkchen «Mahnstopp» (WW-86) — ohne Handler fehlt es. */
  onMahnstopp?: (inv: Invoice, mahnstopp: boolean) => void
}

export function InvoiceRowActions({ invoice: inv, acting, on }: {
  invoice: Invoice
  /** id der Rechnung, deren Aktion gerade läuft — sperrt ihre Knöpfe. */
  acting: number | null
  on: InvoiceActionHandlers
}) {
  const busy = acting === inv.id
  const entwurf = inv.status === 'ausstehend' || inv.status === 'offen'
  return (
    <>
      {inv.storage_path && (
        <a
          href={apiUrl(`/pwa/admin/invoices/${inv.id}/pdf`)}
          target="_blank"
          rel="noreferrer"
          className="admin-btn admin-btn-secondary admin-btn-sm"
        >
          PDF
        </a>
      )}
      {entwurf && (
        <>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => on.onSend(inv)} disabled={busy}>
            Senden
          </button>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => on.onPostal(inv)} disabled={busy}>
            Per Post versendet
          </button>
        </>
      )}
      {(entwurf || inv.status === 'gesendet') && (
        <>
          <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => on.onPaid(inv)} disabled={busy}>
            Als bezahlt markieren
          </button>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => on.onArchive(inv)} disabled={busy}>
            Archivieren
          </button>
        </>
      )}
      {inv.status === 'bezahlt' && (
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => on.onUnpay(inv)} disabled={busy}>
          Zahlung zurücksetzen
        </button>
      )}
      {/* Mahnstopp (WW-86): Kästchen wie «Termin noch nicht bestätigt» in der
          Einsatzplanung. Nur an versendeten Rechnungen — nur die werden gemahnt. */}
      {inv.status === 'gesendet' && on.onMahnstopp && (
        <label className="admin-btn admin-btn-secondary admin-btn-sm"
          title="Kunde nicht mahnen — die Rechnung fehlt in «Rechnungen überfällig» und im Aufgaben-Board"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: busy ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={!!inv.mahnstopp} disabled={busy}
            onChange={e => on.onMahnstopp?.(inv, e.target.checked)} />
          Mahnstopp
        </label>
      )}
    </>
  )
}

interface Options {
  /** Liste neu laden, nachdem eine Aktion etwas geändert hat. */
  reload: () => void
  showToast: ToastFn
  /** Zähler (Badges, Dashboard) neu holen. */
  onChanged?: () => void
  bexio: Record<string, BexioBadgeData>
  refreshBexio: () => void
  /** Vorbelegung der Empfänger-Adresse, wenn der Aufrufer sie schon kennt. */
  emailFor?: (inv: Invoice) => string
}

export function useInvoiceActions({ reload, showToast, onChanged, bexio, refreshBexio, emailFor }: Options) {
  const [acting, setActing] = useState<number | null>(null)
  const [confirmPaid, setConfirmPaid] = useState<Invoice | null>(null)
  // Zahlungsdatum: vorbelegt mit heute, nachtragbar — der Eingang wird oft erst
  // Tage später im Dashboard erfasst (Umsatzmonat + Aftersales-Frist hängen dran).
  const [paidDate, setPaidDate] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  // Nach dem Bezahlen: «Projekt abschliessen?» — die Rechnung ist meist der
  // letzte Schritt eines Auftrags, das Schliessen ging bisher nur im Projekt.
  const [confirmCloseProject, setConfirmCloseProject] = useState<Invoice | null>(null)
  // Warnung dazu: weitere offene Rechnungen des Projekts. Die Liste zeigt nur
  // eine Seite, darum fragt der Dialog das Projekt selbst (null = nicht prüfbar).
  const [closeProjectOtherOpen, setCloseProjectOtherOpen] = useState<number | null>(0)
  const [closingProject, setClosingProject] = useState(false)
  const [confirmUnpay, setConfirmUnpay] = useState<Invoice | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Invoice | null>(null)
  // bexio (§6.7): Storno beim Archivieren mitbestätigen bzw. später über die Pille.
  const [bexioCancel, setBexioCancel] = useState(true)
  const [confirmBexioCancel, setConfirmBexioCancel] = useState<Invoice | null>(null)
  // Postversand: Rechnung als versendet markieren, ohne sie zu mailen.
  const [confirmPostal, setConfirmPostal] = useState<Invoice | null>(null)
  const [postalDate, setPostalDate] = useState('')
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  // CC-Zeilen des Versand-Dialogs (WW-78): leer, bis jemand auf «+ CC» klickt.
  const [sendCc, setSendCc] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  const changed = () => { reload(); onChanged?.() }

  function openSend(inv: Invoice) {
    const bekannt = emailFor?.(inv) || inv.customer_email || ''
    setSendEmail(bekannt)
    setSendCc([])
    setSendInvoice(inv)
    // Adresse des Projektkunden nachladen, wenn der Aufrufer sie nicht kennt —
    // überschreibt nie, was inzwischen jemand eingetippt hat.
    if (!bekannt && inv.project_id) {
      getProject(inv.project_id)
        .then(p => {
          const mail = p.customer?.email || ''
          if (mail) setSendEmail(cur => cur || mail)
        })
        .catch(() => { /* Feld bleibt leer, man tippt die Adresse */ })
    }
  }

  async function handleSendInvoice() {
    if (!sendInvoice || !sendEmail) return
    setSending(true)
    try {
      await sendInvoiceByMail(sendInvoice.id, sendEmail, sendCc)
      showToast(`Rechnung an ${recipientSummary(sendEmail, sendCc)} gesendet`, 'success')
      setSendInvoice(null)
      changed()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen', 'error')
    } finally {
      setSending(false)
    }
  }

  function openPaid(inv: Invoice) {
    setPaidDate(todayISO())
    setPaidAmount(paidAmountDefault(inv.total_amount))
    setConfirmPaid(inv)
  }

  const paidCheck = confirmPaid ? checkPaidAmount(paidAmount, confirmPaid.total_amount) : null

  // Anschlussfrage «Projekt abschliessen?» mit Warnung, falls im Projekt noch
  // weitere Rechnungen offen sind. Gezählt wird am Projekt selbst — die Liste
  // kennt nur eine Seite und den aktuellen Filter.
  async function askCloseProject(inv: Invoice) {
    let others: number | null = 0
    if (inv.project_id) {
      try {
        others = countOtherOpen(await listProjectInvoices<Invoice>(inv.project_id), inv.id)
      } catch {
        others = null
      }
    }
    setCloseProjectOtherOpen(others)
    setConfirmCloseProject(inv)
  }

  // Offen = noch nicht abgeschlossen/archiviert. Nur dann lohnt die Rückfrage.
  function projectStillOpen(inv: Invoice): boolean {
    if (!inv.project_id) return false
    if (inv.project_status) return inv.project_status === 'offen'
    return !inv.project_is_closed
  }

  async function handleMarkPaid(inv: Invoice) {
    if (!paidCheck?.ok) return
    setActing(inv.id)
    try {
      await markInvoicePaid(inv.id, paidDate, paidCheck.amount)
      showToast('Rechnung als bezahlt markiert', 'success')
      setConfirmPaid(null)
      changed()
      // Anschlussfrage statt Automatik: eine Teilrechnung schliesst das Projekt nicht.
      if (projectStillOpen(inv)) void askCloseProject(inv)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleCloseProject(inv: Invoice) {
    if (!inv.project_id) return
    setClosingProject(true)
    try {
      await setProjectStatus(inv.project_id, 'abgeschlossen')
      showToast('Projekt abgeschlossen', 'success')
      setConfirmCloseProject(null)
      reload()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Abschliessen', 'error')
    } finally {
      setClosingProject(false)
    }
  }

  async function handleArchive(id: number) {
    setActing(id)
    const alsoBexio = bexioCancel && bexio[String(id)]?.state === 'in_bexio'
    try {
      await archiveInvoice(id)
      if (alsoBexio) {
        try {
          await cancelInBexio(id)
          showToast('Rechnung archiviert — Storno in bexio folgt in wenigen Minuten', 'success')
        } catch (err) {
          showToast(`Rechnung archiviert, Storno in bexio nicht vorgemerkt: ${
            err instanceof Error ? err.message : 'Fehler'} — über die Pille «bexio: Storno offen» nachholen`, 'error')
        }
      } else {
        showToast('Rechnung archiviert — Rapporte wieder verrechenbar', 'success')
      }
      setConfirmArchive(null)
      changed()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Archivieren', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleBexioCancel(inv: Invoice) {
    setActing(inv.id)
    try {
      await cancelInBexio(inv.id)
      showToast('Storno in bexio vorgemerkt — wird in wenigen Minuten ausgeführt', 'success')
      setConfirmBexioCancel(null)
      refreshBexio()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Storno nicht möglich', 'error')
    } finally {
      setActing(null)
    }
  }

  function openPostal(inv: Invoice) {
    setPostalDate(todayISO())
    setConfirmPostal(inv)
  }

  async function handleMarkSentByPost(id: number) {
    setActing(id)
    try {
      await markInvoiceSentByPost(id, postalDate)
      showToast('Rechnung als per Post versendet markiert', 'success')
      setConfirmPostal(null)
      changed()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleMahnstopp(inv: Invoice, mahnstopp: boolean) {
    setActing(inv.id)
    try {
      await setInvoiceMahnstopp(inv.id, mahnstopp)
      showToast(mahnstopp ? `Mahnstopp für ${inv.invoice_number} gesetzt` : `Mahnstopp für ${inv.invoice_number} aufgehoben`, 'success')
      changed()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleUnmarkPaid(id: number) {
    setActing(id)
    try {
      await unmarkInvoicePaid(id)
      showToast('Zahlung zurückgesetzt', 'success')
      setConfirmUnpay(null)
      changed()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  const actions: InvoiceActionHandlers = {
    onSend: openSend,
    onPostal: openPostal,
    onPaid: openPaid,
    onArchive: inv => { setBexioCancel(true); setConfirmArchive(inv) },
    onUnpay: setConfirmUnpay,
    onBexioCancel: setConfirmBexioCancel,
    onMahnstopp: (inv, mahnstopp) => { void handleMahnstopp(inv, mahnstopp) },
  }

  const closeProjectWarning = !confirmCloseProject
    ? ''
    : closeProjectOtherOpen === null
      ? 'Ob in diesem Projekt noch weitere Rechnungen offen sind, liess sich nicht prüfen.'
      : openInvoicesHint(closeProjectOtherOpen)

  const dialogs = (
    <>
      {/* Bestätigungsdialog bezahlt markieren */}
      {confirmPaid && (
        <ConfirmDialog
          title="Rechnung als bezahlt markieren?"
          message={
            <>
              {confirmPaid.invoice_number} · {fmtCHF(confirmPaid.total_amount)}<br />
              Projekt: {confirmPaid.project_name}
            </>
          }
          confirmLabel="Ja, bezahlt"
          busyLabel="…"
          busy={acting === confirmPaid.id}
          confirmDisabled={!paidDate || !paidCheck?.ok}
          variant="success"
          onCancel={() => setConfirmPaid(null)}
          onConfirm={() => void handleMarkPaid(confirmPaid)}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="invoice-paid-date">Zahlungsdatum</label>
            <input
              id="invoice-paid-date"
              className="admin-form-input"
              type="date"
              value={paidDate}
              max={todayISO()}
              onChange={e => setPaidDate(e.target.value)}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Tag des Zahlungseingangs — nachtragbar, vorbelegt mit heute.
            </div>
          </div>
          <PaidAmountField id="invoice-paid-amount" value={paidAmount}
                           total={confirmPaid.total_amount} onChange={setPaidAmount} />
        </ConfirmDialog>
      )}

      {/* Anschlussfrage nach dem Bezahlen: Projekt abschliessen? */}
      {confirmCloseProject && (
        <ConfirmDialog
          title="Projekt abschliessen?"
          message={
            <>
              Rechnung {confirmCloseProject.invoice_number} ist bezahlt.<br />
              «{confirmCloseProject.project_name}» wird beim Abschliessen für Mitarbeiter
              ausgeblendet. Rapporte und Dokumente bleiben erhalten.
            </>
          }
          warning={closeProjectWarning}
          confirmLabel="Ja, abschliessen"
          cancelLabel="Offen lassen"
          busyLabel="Schliessen…"
          busy={closingProject}
          onCancel={() => setConfirmCloseProject(null)}
          onConfirm={() => void handleCloseProject(confirmCloseProject)}
        />
      )}

      {/* Bestätigungsdialog Postversand */}
      {confirmPostal && (
        <ConfirmDialog
          title="Als per Post versendet markieren?"
          message={
            <>
              {confirmPostal.invoice_number} · {fmtCHF(confirmPostal.total_amount)}<br />
              Projekt: {confirmPostal.project_name}<br />
              Es wird keine E-Mail verschickt. Die Rechnung gilt danach als gesendet und
              läuft normal ins Mahnwesen — die Zahlungsfrist zählt ab dem Aufgabedatum.
            </>
          }
          confirmLabel="Als versendet markieren"
          busyLabel="…"
          busy={acting === confirmPostal.id}
          confirmDisabled={!postalDate}
          onCancel={() => setConfirmPostal(null)}
          onConfirm={() => void handleMarkSentByPost(confirmPostal.id)}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="postal-sent-date">Aufgabedatum</label>
            <input
              id="postal-sent-date"
              className="admin-form-input"
              type="date"
              value={postalDate}
              max={todayISO()}
              onChange={e => setPostalDate(e.target.value)}
            />
          </div>
        </ConfirmDialog>
      )}

      {/* Bestätigungsdialog Zahlung zurücksetzen */}
      {confirmUnpay && (
        <ConfirmDialog
          title="Zahlung zurücksetzen?"
          message={
            <>
              {confirmUnpay.invoice_number} · {fmtCHF(confirmUnpay.total_amount)}<br />
              Projekt: {confirmUnpay.project_name}<br />
              Die Rechnung gilt danach wieder als offen (gesendet bzw. ausstehend)
              und kann anschliessend archiviert werden.
            </>
          }
          confirmLabel="Zahlung zurücksetzen"
          busyLabel="…"
          busy={acting === confirmUnpay.id}
          variant="danger"
          onCancel={() => setConfirmUnpay(null)}
          onConfirm={() => void handleUnmarkPaid(confirmUnpay.id)}
        />
      )}

      {/* Bestätigungsdialog Rechnung archivieren */}
      {confirmArchive && (
        <ConfirmDialog
          title="Rechnung archivieren?"
          message={
            <>
              {confirmArchive.invoice_number} · {fmtCHF(confirmArchive.total_amount)}<br />
              Projekt: {confirmArchive.project_name}<br />
              Die Rechnung gilt danach als annulliert. Ihre Rapporte werden von der
              Rechnung gelöst — sie sind wieder verrechenbar und können bei Bedarf
              gelöscht oder korrigiert werden, bevor eine neue Rechnung erstellt wird.
            </>
          }
          confirmLabel="Archivieren"
          busyLabel="…"
          busy={acting === confirmArchive.id}
          variant="danger"
          onCancel={() => setConfirmArchive(null)}
          onConfirm={() => void handleArchive(confirmArchive.id)}
        >
          {bexio[String(confirmArchive.id)]?.state === 'in_bexio' && (
            <BexioCancelCheckbox checked={bexioCancel} onChange={setBexioCancel} />
          )}
        </ConfirmDialog>
      )}

      {/* Rückfrage zur Pille «bexio: Storno offen» (§6.7) */}
      {confirmBexioCancel && (
        <ConfirmDialog
          title="In bexio stornieren?"
          message={<>{confirmBexioCancel.invoice_number} · {fmtCHF(confirmBexioCancel.total_amount)}<br />{BEXIO_CANCEL_MESSAGE}</>}
          confirmLabel="In bexio stornieren"
          busyLabel="…"
          busy={acting === confirmBexioCancel.id}
          variant="danger"
          onCancel={() => setConfirmBexioCancel(null)}
          onConfirm={() => void handleBexioCancel(confirmBexioCancel)}
        />
      )}

      {/* Dialog: Rechnung senden */}
      {sendInvoice && (
        <ConfirmDialog
          title="Rechnung senden"
          message={
            <>
              {sendInvoice.invoice_number} · {fmtCHF(sendInvoice.total_amount)}<br />
              Projekt: {sendInvoice.project_name}
            </>
          }
          confirmLabel="Rechnung senden"
          busyLabel="Wird gesendet…"
          busy={sending}
          confirmDisabled={!sendEmail}
          maxWidth={440}
          onCancel={() => { if (!sending) setSendInvoice(null) }}
          onConfirm={() => void handleSendInvoice()}
        >
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label">Empfänger E-Mail</label>
            <input
              className="admin-form-input"
              type="email"
              value={sendEmail}
              onChange={e => setSendEmail(e.target.value)}
              placeholder="kunde@example.com"
            />
            <CcEmailRows value={sendCc} onChange={setSendCc} disabled={sending} />
          </div>
        </ConfirmDialog>
      )}
    </>
  )

  return { acting, actions, dialogs }
}

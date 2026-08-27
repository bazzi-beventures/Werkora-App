import { useState } from 'react'
import { apiUrl } from '../../../api/client'
import { fmtCHF, fmtDate, todayISO } from '../../utils/format'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE } from '../../constants/statuses'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ActionRow } from '../../components/ActionRow'
import { AutoGrowTextarea } from '../../components/AutoGrowTextarea'
import { QuoteCoverageSelect } from '../../components/QuoteCoverageSelect'
import { defaultCheckedIds, selectionPayload, showQuoteSelection } from '../../utils/quoteSelection'
import type { InvoiceQuoteCoverage } from '../../../api/admin/invoices'
import { groupByParent } from './types'
import type { ProjectInvoice } from './types'

interface InvoicesTabProps {
  invoices: ProjectInvoice[]
  useAcceptedQuote: boolean
  generatingInvoice: boolean
  defaultEmail: string
  hasSignedReport: boolean
  onUseAcceptedQuoteChange: (v: boolean) => void
  // Erzeugt die Rechnung; `remark` ist die Bemerkung fuers PDF (leer = kein Block),
  // `quoteIds` die explizite Offerten-Auswahl (undefined = Automatik wie bisher).
  // Liefert true bei Erfolg — der Dialog schliesst nur dann.
  onGenerateInvoice: (remark: string, quoteIds?: number[]) => Promise<boolean>
  // Offerten-Auswahl fuer den Erstellen-Dialog; null = keine Auswahl anzeigen
  // (Laden gescheitert oder nur eine Offerte) — der Dialog bleibt wie bisher.
  loadQuoteCoverage: () => Promise<InvoiceQuoteCoverage | null>
  // Bezahlt-Markierung; `paidDate` ist der Tag des Zahlungseingangs (ISO),
  // nachtragbar statt automatisch «heute». Liefert true bei Erfolg — der Dialog
  // schliesst nur dann.
  onMarkPaid: (invoiceId: number, paidDate: string) => Promise<boolean>
  onUnmarkPaid: (invoiceId: number) => Promise<void>
  onArchive: (invoiceId: number) => Promise<void>
  onSendInvoice: (invoiceId: number, recipientEmail: string) => Promise<boolean>
  // Postversand: markiert als gesendet, ohne zu mailen. `sentDate` ist das
  // Aufgabedatum bei der Post (ISO), aus dem das Zahlungsziel läuft.
  onMarkSentByPost: (invoiceId: number, sentDate: string) => Promise<boolean>
}

export function InvoicesTab({ invoices, useAcceptedQuote, generatingInvoice, defaultEmail, hasSignedReport, onUseAcceptedQuoteChange, onGenerateInvoice, loadQuoteCoverage, onMarkPaid, onUnmarkPaid, onArchive, onSendInvoice, onMarkSentByPost }: InvoicesTabProps) {
  const [sendInvoice, setSendInvoice] = useState<ProjectInvoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmPostal, setConfirmPostal] = useState<ProjectInvoice | null>(null)
  const [postalDate, setPostalDate] = useState('')
  const [confirmPaid, setConfirmPaid] = useState<ProjectInvoice | null>(null)
  const [paidDate, setPaidDate] = useState('')
  // Generieren-Dialog: traegt das Bemerkungs-Feld und (ohne unterschriebenen
  // Rapport) den frueheren Bestaetigungs-Hinweis — ein Dialog statt zwei.
  const [showGenerate, setShowGenerate] = useState(false)
  const [genRemark, setGenRemark] = useState('')
  // Offerten-Auswahl im Generieren-Dialog: null solange nicht geladen (oder das
  // Laden scheiterte) — dann verhaelt sich der Dialog exakt wie bisher.
  const [genCoverage, setGenCoverage] = useState<InvoiceQuoteCoverage | null>(null)
  const [genCheckedQuotes, setGenCheckedQuotes] = useState<number[]>([])
  const [confirmArchive, setConfirmArchive] = useState<ProjectInvoice | null>(null)
  const [confirmUnpay, setConfirmUnpay] = useState<ProjectInvoice | null>(null)
  const [acting, setActing] = useState(false)

  async function handleSend() {
    if (!sendInvoice || !sendEmail) return
    setSending(true)
    const ok = await onSendInvoice(sendInvoice.id, sendEmail)
    setSending(false)
    if (ok) setSendInvoice(null)
  }

  async function handleArchiveConfirm() {
    if (!confirmArchive) return
    setActing(true)
    await onArchive(confirmArchive.id)
    setActing(false)
    setConfirmArchive(null)
  }

  async function handleUnpayConfirm() {
    if (!confirmUnpay) return
    setActing(true)
    await onUnmarkPaid(confirmUnpay.id)
    setActing(false)
    setConfirmUnpay(null)
  }

  function openPostal(inv: ProjectInvoice) {
    setPostalDate(todayISO())
    setConfirmPostal(inv)
  }

  function openPaid(inv: ProjectInvoice) {
    setPaidDate(todayISO())
    setConfirmPaid(inv)
  }

  async function handlePaidConfirm() {
    if (!confirmPaid || !paidDate) return
    setActing(true)
    const ok = await onMarkPaid(confirmPaid.id, paidDate)
    setActing(false)
    // Nur bei Erfolg schliessen — sonst wäre die Fehlermeldung des Backends
    // (400 «Datum vor Rechnungsdatum») weg, bevor sie jemand liest.
    if (ok) setConfirmPaid(null)
  }

  async function handlePostalConfirm() {
    if (!confirmPostal || !postalDate) return
    setActing(true)
    const ok = await onMarkSentByPost(confirmPostal.id, postalDate)
    setActing(false)
    // Nur bei Erfolg schliessen — sonst wäre die Fehlermeldung des Backends
    // (409 «kein PDF», 400 «Datum») weg, bevor sie jemand liest.
    if (ok) setConfirmPostal(null)
  }

  function handleGenerateClick() {
    setGenRemark('')
    setGenCoverage(null)
    setShowGenerate(true)
    // Auswahl nachladen, nicht blockierend: der Dialog steht sofort, die
    // Checkboxen erscheinen, sobald die Vorschau da ist. Scheitert das Laden
    // (null), bleibt der Dialog ohne Auswahl — Automatik wie bisher.
    void loadQuoteCoverage().then(c => {
      setGenCoverage(c)
      if (c) setGenCheckedQuotes(defaultCheckedIds(c))
    })
  }

  const genSelectionVisible = showQuoteSelection(genCoverage)

  async function handleGenerateConfirm() {
    // Nur eine echte Abweichung vom Standard geht als quote_ids mit —
    // sonst laeuft die bewaehrte automatische Aufloesung (selectionPayload).
    const quoteIds = genCoverage && genSelectionVisible
      ? selectionPayload(genCoverage, genCheckedQuotes)
      : undefined
    const ok = await onGenerateInvoice(genRemark, quoteIds)
    if (ok) setShowGenerate(false)
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Rechnungen</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <input type="checkbox" checked={useAcceptedQuote} onChange={e => onUseAcceptedQuoteChange(e.target.checked)} />
            Aus aktueller Offerte
          </label>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-primary"
            disabled={generatingInvoice}
            onClick={handleGenerateClick}
          >
            {generatingInvoice ? 'Wird erstellt…' : '+ Rechnung generieren'}
          </button>
        </div>
      </div>
      {!hasSignedReport && (
        <div style={{
          marginBottom: 14,
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--warning-soft)',
          border: '1px solid var(--warning, #f0ad4e)',
          color: 'var(--warning-ink)',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>
            Kein unterzeichneter Rapport vorhanden — die Rechnung wird auf Basis der aktuellen (zuletzt bearbeiteten) Offerte erstellt.
          </span>
        </div>
      )}
      {invoices.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Rechnungen.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupByParent(invoices).map(group => {
            const latest = group[0]
            return (
              <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--surface-2)' }}>
                {group.map((inv, idx) => (
                  <ActionRow key={inv.id} style={{ padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{inv.version}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, minWidth: 150 }}>{inv.invoice_number}</span>
                    <span className={`admin-badge ${INVOICE_STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>{INVOICE_STATUS_LABELS[inv.status] || inv.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmtCHF(inv.total_amount)}</span>
                    {(inv.storage_path || inv.pdf_url) && (
                      <a href={apiUrl(`/pwa/admin/invoices/${inv.id}/pdf`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                    )}
                    {idx === 0 && (inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                      <>
                        <button
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          onClick={() => { setSendEmail(defaultEmail); setSendInvoice(inv) }}
                        >
                          Senden
                        </button>
                        {/* Postversand nur, solange die Rechnung den Betrieb noch nicht
                            verlassen hat, und nur mit vorliegendem PDF — genau die zwei
                            Guards des Endpunkts. Ohne die Bedingungen wäre der Knopf
                            sichtbar, aber jeder Klick ein 409. */}
                        {(inv.status === 'ausstehend' || inv.status === 'offen') && (inv.storage_path || inv.pdf_url) && (
                          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => openPostal(inv)}>
                            Per Post versendet
                          </button>
                        )}
                        <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => openPaid(inv)}>Bezahlt</button>
                      </>
                    )}
                    {(inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmArchive(inv)}>
                        Archivieren
                      </button>
                    )}
                    {inv.status === 'bezahlt' && (
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmUnpay(inv)}>
                        Zahlung zurücksetzen
                      </button>
                    )}
                  </ActionRow>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog: Rechnung archivieren (annullieren) */}
      {confirmArchive && (
        <ConfirmDialog
          title="Rechnung archivieren?"
          message={
            <>
              {confirmArchive.invoice_number} · {fmtCHF(confirmArchive.total_amount)}<br />
              Die Rechnung gilt danach als annulliert. Die enthaltenen Rapporte werden
              von der Rechnung gelöst — sie sind wieder verrechenbar und können bei
              Bedarf gelöscht oder korrigiert werden, bevor eine neue Rechnung
              generiert wird.
            </>
          }
          confirmLabel="Archivieren"
          busyLabel="Wird archiviert…"
          busy={acting}
          variant="danger"
          onCancel={() => { if (!acting) setConfirmArchive(null) }}
          onConfirm={() => void handleArchiveConfirm()}
        />
      )}

      {/* Dialog: Zahlung zurücksetzen */}
      {confirmUnpay && (
        <ConfirmDialog
          title="Zahlung zurücksetzen?"
          message={
            <>
              {confirmUnpay.invoice_number} · {fmtCHF(confirmUnpay.total_amount)}<br />
              Die Rechnung gilt danach wieder als offen (gesendet bzw. ausstehend)
              und kann anschliessend archiviert werden. Bereits erzeugte
              Aftersales-Aufgaben bleiben bestehen und sind im Dashboard löschbar.
            </>
          }
          confirmLabel="Zahlung zurücksetzen"
          busyLabel="Wird zurückgesetzt…"
          busy={acting}
          variant="danger"
          onCancel={() => { if (!acting) setConfirmUnpay(null) }}
          onConfirm={() => void handleUnpayConfirm()}
        />
      )}

      {/* Dialog: Rechnung generieren (Bemerkung + ggf. Hinweis "ohne Rapport") */}
      {showGenerate && (
        <ConfirmDialog
          title="Rechnung generieren"
          message={!hasSignedReport && (
            <>
              Es ist kein vom Kunden unterschriebener Rapport vorhanden.
              Die Rechnung wird stattdessen aus der akzeptierten Offerte generiert.
            </>
          )}
          confirmLabel={hasSignedReport ? 'Rechnung generieren' : 'Ohne Rapport erstellen'}
          busyLabel="Wird erstellt…"
          busy={generatingInvoice}
          confirmDisabled={genSelectionVisible && genCheckedQuotes.length === 0}
          maxWidth={440}
          // Die Bemerkung wächst mit dem Text bis ~10 Zeilen — ohne Scrollen
          // schöbe sie auf kleinen Bildschirmen die Knöpfe aus dem Bild.
          scrollable
          onCancel={() => { if (!generatingInvoice) setShowGenerate(false) }}
          onConfirm={() => void handleGenerateConfirm()}
        >
          {genSelectionVisible && genCoverage && (
            <QuoteCoverageSelect
              coverage={genCoverage}
              checked={genCheckedQuotes}
              onChange={setGenCheckedQuotes}
              disabled={generatingInvoice}
            />
          )}
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label" htmlFor="proj-gen-remark">
              Bemerkung
            </label>
            <AutoGrowTextarea
              id="proj-gen-remark"
              className="admin-form-input"
              minRows={2}
              maxLength={1000}
              value={genRemark}
              placeholder="z.B. Referenz oder Projekt-Nr. des Kunden. Leer lassen, um den Block wegzulassen."
              onChange={e => setGenRemark(e.target.value)}
              disabled={generatingInvoice}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Erscheint als eigener Block «Bemerkung» auf der Rechnung, über den Positionen.
            </div>
          </div>
        </ConfirmDialog>
      )}

      {/* Dialog: Rechnung senden */}
      {sendInvoice && (
        <ConfirmDialog
          title="Rechnung senden"
          message={<>{sendInvoice.invoice_number} · {fmtCHF(sendInvoice.total_amount)}</>}
          confirmLabel="Rechnung senden"
          busyLabel="Wird gesendet…"
          busy={sending}
          confirmDisabled={!sendEmail}
          maxWidth={440}
          onCancel={() => { if (!sending) setSendInvoice(null) }}
          onConfirm={() => void handleSend()}
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
          </div>
        </ConfirmDialog>
      )}

      {/* Dialog: Rechnung bezahlt (mit nachtragbarem Zahlungsdatum) */}
      {confirmPaid && (
        <ConfirmDialog
          title="Rechnung als bezahlt markieren?"
          message={<>{confirmPaid.invoice_number} · {fmtCHF(confirmPaid.total_amount)}</>}
          confirmLabel="Ja, bezahlt"
          busyLabel="Wird markiert…"
          busy={acting}
          confirmDisabled={!paidDate}
          variant="success"
          maxWidth={440}
          onCancel={() => { if (!acting) setConfirmPaid(null) }}
          onConfirm={() => void handlePaidConfirm()}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="proj-invoice-paid-date">Zahlungsdatum</label>
            <input
              id="proj-invoice-paid-date"
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
        </ConfirmDialog>
      )}

      {/* Dialog: Postversand — Wortlaut wie in der Rechnungsübersicht */}
      {confirmPostal && (
        <ConfirmDialog
          title="Als per Post versendet markieren?"
          message={
            <>
              {confirmPostal.invoice_number} · {fmtCHF(confirmPostal.total_amount)}<br />
              Es wird keine E-Mail verschickt. Die Rechnung gilt danach als gesendet und
              läuft normal ins Mahnwesen — die Zahlungsfrist zählt ab dem Aufgabedatum.
            </>
          }
          confirmLabel="Als versendet markieren"
          busyLabel="Wird markiert…"
          busy={acting}
          confirmDisabled={!postalDate}
          maxWidth={440}
          onCancel={() => { if (!acting) setConfirmPostal(null) }}
          onConfirm={() => void handlePostalConfirm()}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="proj-postal-sent-date">Aufgabedatum</label>
            <input
              id="proj-postal-sent-date"
              className="admin-form-input"
              type="date"
              value={postalDate}
              max={todayISO()}
              onChange={e => setPostalDate(e.target.value)}
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  )
}

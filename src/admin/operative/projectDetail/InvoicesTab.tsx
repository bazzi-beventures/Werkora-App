import { useRef, useState } from 'react'
import { apiUrl } from '../../../api/client'
import { fmtCHF, fmtDate, todayISO } from '../../utils/format'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE } from '../../constants/statuses'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ActionRow } from '../../components/ActionRow'
import { AutoGrowTextarea } from '../../components/AutoGrowTextarea'
import { QuoteCoverageSelect } from '../../components/QuoteCoverageSelect'
import { defaultCheckedIds, selectionPayload, showQuoteSelection } from '../../utils/quoteSelection'
import { GeneralDeductionFields } from '../../components/GeneralDeductionFields'
import { WorkDescriptionField } from '../../components/WorkDescriptionField'
import { InvoiceModeField } from '../../components/InvoiceModeField'
import { ReportSelectField } from '../../components/ReportSelectField'
import { AnzahlungAbzugField, AnzahlungPctField } from '../../components/AnzahlungFields'
import { TravelCostField } from '../../components/TravelCostField'
import {
  anzahlungPayload, hasActiveInvoice, isAdditional, parseAnzahlungPct, reportSelectionPayload,
  type GenerateInvoiceOptions, type InvoiceMode,
} from '../../utils/invoiceMode'
import {
  INITIAL_WORK_DESCRIPTION, workDescriptionPayload, type WorkDescriptionState,
} from '../../utils/workDescription'
import { checkPaidAmount, paidAmountDefault, paidDeduction } from '../../utils/paidAmount'
import { PaidAmountField } from '../PaidAmountField'
import {
  generalDeductionError, generalDeductionPayload, initialGeneralDeduction,
  type GeneralDeductionConfig, type GeneralDeductionState,
} from '../../utils/generalDeduction'
import type { BillableReport, InvoiceQuoteCoverage, OpenAnzahlung } from '../../../api/admin/invoices'
import { groupByParent } from './types'
import type { ProjectInvoice } from './types'

interface InvoicesTabProps {
  invoices: ProjectInvoice[]
  useAcceptedQuote: boolean
  generatingInvoice: boolean
  defaultEmail: string
  hasSignedReport: boolean
  // Feature «allgemeine_abzuege»: null = kein Häkchen im Dialog.
  generalDeduction?: GeneralDeductionConfig | null
  onUseAcceptedQuoteChange: (v: boolean) => void
  // Erzeugt die Rechnung; `remark` ist die Bemerkung fuers PDF (leer = kein Block),
  // `quoteIds` die explizite Offerten-Auswahl (undefined = Automatik wie bisher),
  // `deduction` die Allg. Abzüge (leer = keine), `workDescription` der Block
  // «Ausgeführte Arbeiten» (undefined = Server leitet ab, '' = kein Block, siehe
  // utils/workDescription.ts), dazu Art der Rechnung, Rapport-Auswahl und
  // Anzahlung (utils/invoiceMode.ts). Liefert true bei Erfolg — der Dialog
  // schliesst nur dann.
  onGenerateInvoice: (remark: string, opts: GenerateInvoiceOptions) => Promise<boolean>
  // Vorschlag «Ausgeführte Arbeiten» aus den Rapporten (WW-52). Wirft bei Fehler.
  // `additional`: ohne die Rapporte, die schon auf einer offenen Rechnung stehen;
  // `reportIds`: nur aus diesen.
  loadWorkDescription: (additional?: boolean, reportIds?: number[]) => Promise<string>
  // Offerten-Auswahl fuer den Erstellen-Dialog; null = keine Auswahl anzeigen
  // (Laden gescheitert oder nur eine Offerte) — der Dialog bleibt wie bisher.
  loadQuoteCoverage: (additional?: boolean) => Promise<InvoiceQuoteCoverage | null>
  // Rapport-Auswahl und offene Anzahlungen; null = Laden gescheitert (Automatik).
  loadBillableReports: (additional?: boolean) => Promise<BillableReport[] | null>
  loadAnzahlungen: (additional?: boolean) => Promise<OpenAnzahlung[] | null>
  // Bezahlt-Markierung; `paidDate` ist der Tag des Zahlungseingangs (ISO),
  // nachtragbar statt automatisch «heute». Liefert true bei Erfolg — der Dialog
  // schliesst nur dann.
  onMarkPaid: (invoiceId: number, paidDate: string, paidAmount?: number | null) => Promise<boolean>
  onUnmarkPaid: (invoiceId: number) => Promise<void>
  onArchive: (invoiceId: number) => Promise<void>
  onSendInvoice: (invoiceId: number, recipientEmail: string) => Promise<boolean>
  // Postversand: markiert als gesendet, ohne zu mailen. `sentDate` ist das
  // Aufgabedatum bei der Post (ISO), aus dem das Zahlungsziel läuft.
  onMarkSentByPost: (invoiceId: number, sentDate: string) => Promise<boolean>
}

export function InvoicesTab({ invoices, useAcceptedQuote, generatingInvoice, defaultEmail, hasSignedReport, generalDeduction = null, onUseAcceptedQuoteChange, onGenerateInvoice, loadQuoteCoverage, loadWorkDescription, loadBillableReports, loadAnzahlungen, onMarkPaid, onUnmarkPaid, onArchive, onSendInvoice, onMarkSentByPost }: InvoicesTabProps) {
  const [sendInvoice, setSendInvoice] = useState<ProjectInvoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmPostal, setConfirmPostal] = useState<ProjectInvoice | null>(null)
  const [postalDate, setPostalDate] = useState('')
  const [confirmPaid, setConfirmPaid] = useState<ProjectInvoice | null>(null)
  const [paidDate, setPaidDate] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  // Generieren-Dialog: traegt das Bemerkungs-Feld und (ohne unterschriebenen
  // Rapport) den frueheren Bestaetigungs-Hinweis — ein Dialog statt zwei.
  const [showGenerate, setShowGenerate] = useState(false)
  const [genRemark, setGenRemark] = useState('')
  const [genWorkDesc, setGenWorkDesc] = useState<WorkDescriptionState>(INITIAL_WORK_DESCRIPTION)
  const [genAbzug, setGenAbzug] = useState<GeneralDeductionState>(() => initialGeneralDeduction(null))
  // Offerten-Auswahl im Generieren-Dialog: null solange nicht geladen (oder das
  // Laden scheiterte) — dann verhaelt sich der Dialog exakt wie bisher.
  const [genCoverage, setGenCoverage] = useState<InvoiceQuoteCoverage | null>(null)
  const [genCheckedQuotes, setGenCheckedQuotes] = useState<number[]>([])
  const [genMode, setGenMode] = useState<InvoiceMode>('replace')
  // Rapport-Auswahl und Anzahlungs-Abzug: null = nicht geladen (Automatik).
  const [genReports, setGenReports] = useState<BillableReport[] | null>(null)
  const [genCheckedReports, setGenCheckedReports] = useState<number[]>([])
  const [genAnzahlungen, setGenAnzahlungen] = useState<OpenAnzahlung[] | null>(null)
  const [genCheckedAnzahlungen, setGenCheckedAnzahlungen] = useState<number[]>([])
  const [genPct, setGenPct] = useState('50')
  const [genTravel, setGenTravel] = useState(true)
  // Zähler gegen überholte Antworten: wer die Art der Rechnung umschaltet, während
  // der Vorschlag noch lädt, bekäme sonst den Umfang der anderen Art angezeigt.
  const genLoadSeq = useRef(0)
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
    setPaidAmount(paidAmountDefault(inv.total_amount))
    setConfirmPaid(inv)
  }

  const paidCheck = confirmPaid ? checkPaidAmount(paidAmount, confirmPaid.total_amount) : null

  async function handlePaidConfirm() {
    if (!confirmPaid || !paidDate || !paidCheck?.ok) return
    setActing(true)
    const ok = await onMarkPaid(confirmPaid.id, paidDate, paidCheck.amount)
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
    setGenAbzug(initialGeneralDeduction(generalDeduction))
    setGenWorkDesc(INITIAL_WORK_DESCRIPTION)
    setGenMode('replace')
    setGenPct('50')
    setGenTravel(true)
    setShowGenerate(true)
    loadGenSuggestions('replace')
  }

  // Vorschläge hängen an der Art der Rechnung: eine weitere Rechnung lässt aus, was
  // schon auf einer offenen steht; eine Anzahlung braucht nur die Offerten-Auswahl.
  function loadGenSuggestions(mode: InvoiceMode) {
    const seq = ++genLoadSeq.current
    const additional = isAdditional(mode)
    const current = () => seq === genLoadSeq.current
    setGenCoverage(null)
    setGenReports(null)
    setGenAnzahlungen(null)
    // Auswahl nachladen, nicht blockierend: der Dialog steht sofort, die
    // Checkboxen erscheinen, sobald die Vorschau da ist. Scheitert das Laden
    // (null), bleibt der Dialog ohne Auswahl — Automatik wie bisher.
    void loadQuoteCoverage(additional).then(c => {
      if (!current()) return
      setGenCoverage(c)
      if (c) setGenCheckedQuotes(defaultCheckedIds(c))
    })
    if (mode === 'anzahlung') return
    loadWorkDescriptionFor(additional, undefined, seq)
    void loadBillableReports(additional).then(list => {
      if (!current()) return
      setGenReports(list)
      setGenCheckedReports((list ?? []).map(r => r.id))
    })
    void loadAnzahlungen(additional).then(list => {
      if (!current()) return
      setGenAnzahlungen(list)
      // Vorbelegt: alle offenen abziehen — die Schlussrechnung ist der Normalfall.
      setGenCheckedAnzahlungen((list ?? []).map(a => a.id))
    })
  }

  // Funktionale Updates: wer während des Ladens das Häkchen abwählt, verliert es
  // nicht an die Antwort.
  function loadWorkDescriptionFor(additional: boolean, reportIds: number[] | undefined, seq: number) {
    setGenWorkDesc(s => ({ ...s, text: '', loading: true, failed: false }))
    loadWorkDescription(additional, reportIds).then(
      text => { if (seq === genLoadSeq.current) setGenWorkDesc(s => ({ ...s, text, loading: false })) },
      () => { if (seq === genLoadSeq.current) setGenWorkDesc(s => ({ ...s, loading: false, failed: true })) },
    )
  }

  function handleGenModeChange(mode: InvoiceMode) {
    setGenMode(mode)
    loadGenSuggestions(mode)
  }

  // Andere Rapporte → anderer Vorschlag «Ausgeführte Arbeiten».
  function handleReportSelection(ids: number[]) {
    setGenCheckedReports(ids)
    const seq = ++genLoadSeq.current
    loadWorkDescriptionFor(
      isAdditional(genMode), reportSelectionPayload(genReports?.map(r => r.id) ?? null, ids), seq,
    )
  }

  const genHasActive = hasActiveInvoice(invoices)
  const genIsAnzahlung = genMode === 'anzahlung'
  const genPctValue = parseAnzahlungPct(genPct)
  const genSelectionVisible = showQuoteSelection(genCoverage)
  // Auswahl nur, wenn es etwas zu wählen gibt.
  const genReportsVisible = !genIsAnzahlung && (genReports?.length ?? 0) > 1

  async function handleGenerateConfirm() {
    // Nur eine echte Abweichung vom Standard geht als quote_ids mit —
    // sonst laeuft die bewaehrte automatische Aufloesung (selectionPayload).
    const quoteIds = genCoverage && genSelectionVisible
      ? selectionPayload(genCoverage, genCheckedQuotes)
      : undefined
    const ok = await onGenerateInvoice(genRemark, {
      mode: genMode,
      quoteIds,
      deduction: generalDeduction ? generalDeductionPayload(genAbzug) : undefined,
      workDescription: workDescriptionPayload(genWorkDesc),
      reportIds: reportSelectionPayload(genReports?.map(r => r.id) ?? null, genCheckedReports),
      anzahlungIds: anzahlungPayload(genAnzahlungen, genCheckedAnzahlungen),
      anzahlungPct: genPctValue ?? undefined,
      includeTravel: genTravel,
    })
    if (ok) setShowGenerate(false)
  }

  // Layout in admin.css (.proj-doc-*), Handy-Umbau in mobile.css: dort
  // stapeln sich Kopf und Rechnungszeile, statt die Karte zu sprengen.
  return (
    <div className="admin-table-wrap proj-doc-tab">
      <div className="proj-doc-head">
        <div className="admin-section-title" style={{ margin: 0 }}>Rechnungen</div>
        <div className="proj-doc-head-actions">
          <label className="proj-doc-toggle">
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
                  <ActionRow key={inv.id} className="proj-doc-row proj-doc-row--grid" style={{ borderTop: idx > 0 ? '1px dashed var(--border)' : 'none' }}>
                    <span
                      className="proj-doc-version"
                      style={{ color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}
                      title={inv.invoice_kind === 'anzahlung' ? 'Anzahlungsrechnung' : undefined}
                    >
                      {inv.invoice_kind === 'anzahlung' ? 'Anz.' : `V${inv.version}`}
                    </span>
                    <span className="proj-doc-number">{inv.invoice_number}</span>
                    <span className={`admin-badge proj-doc-status ${INVOICE_STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>{INVOICE_STATUS_LABELS[inv.status] || inv.status}</span>
                    <span className="proj-doc-date">{fmtDate(inv.created_at)}</span>
                    <div className="proj-doc-tail">
                      <span className="proj-doc-amount">
                        {fmtCHF(inv.total_amount)}
                        {paidDeduction(inv) != null && (
                          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }} title="Weniger eingegangen als verrechnet (z. B. Skonto)">
                            {' '}· erhalten {fmtCHF(inv.paid_amount!)}
                          </span>
                        )}
                      </span>
                      <div className="proj-doc-actions">
                        {inv.storage_path && (
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
                            {(inv.status === 'ausstehend' || inv.status === 'offen') && inv.storage_path && (
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
                      </div>
                    </div>
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
          message={!hasSignedReport && !genIsAnzahlung && (
            <>
              Es ist kein vom Kunden unterschriebener Rapport vorhanden.
              Die Rechnung wird stattdessen aus der akzeptierten Offerte generiert.
            </>
          )}
          confirmLabel={genIsAnzahlung
            ? 'Anzahlung erstellen'
            : hasSignedReport ? 'Rechnung generieren' : 'Ohne Rapport erstellen'}
          busyLabel="Wird erstellt…"
          busy={generatingInvoice}
          confirmDisabled={(genSelectionVisible && genCheckedQuotes.length === 0)
            || (genIsAnzahlung && genPctValue === null)
            || (genReportsVisible && genCheckedReports.length === 0)
            || (!genIsAnzahlung && generalDeduction !== null && generalDeductionError(genAbzug) !== null)}
          maxWidth={440}
          // Die Bemerkung wächst mit dem Text bis ~10 Zeilen — ohne Scrollen
          // schöbe sie auf kleinen Bildschirmen die Knöpfe aus dem Bild.
          scrollable
          onCancel={() => { if (!generatingInvoice) setShowGenerate(false) }}
          onConfirm={() => void handleGenerateConfirm()}
        >
          <InvoiceModeField
            idPrefix="proj-gen"
            value={genMode}
            onChange={handleGenModeChange}
            hasActive={genHasActive}
            disabled={generatingInvoice}
          />
          {genIsAnzahlung && (
            <AnzahlungPctField
              idPrefix="proj-gen"
              value={genPct}
              onChange={setGenPct}
              invalid={genPctValue === null}
              disabled={generatingInvoice}
            />
          )}
          {genSelectionVisible && genCoverage && (
            <QuoteCoverageSelect
              coverage={genCoverage}
              checked={genCheckedQuotes}
              onChange={setGenCheckedQuotes}
              disabled={generatingInvoice}
            />
          )}
          {genReportsVisible && genReports && (
            <ReportSelectField
              reports={genReports}
              checked={genCheckedReports}
              onChange={handleReportSelection}
              disabled={generatingInvoice}
            />
          )}
          {!genIsAnzahlung && (genAnzahlungen?.length ?? 0) > 0 && genAnzahlungen && (
            <AnzahlungAbzugField
              anzahlungen={genAnzahlungen}
              checked={genCheckedAnzahlungen}
              onChange={setGenCheckedAnzahlungen}
              disabled={generatingInvoice}
            />
          )}
          {!genIsAnzahlung && (
            <TravelCostField checked={genTravel} onChange={setGenTravel} disabled={generatingInvoice} />
          )}
          {!genIsAnzahlung && (
            <WorkDescriptionField
              idPrefix="proj-gen"
              value={genWorkDesc}
              onChange={setGenWorkDesc}
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
          {generalDeduction && !genIsAnzahlung && (
            <GeneralDeductionFields
              idPrefix="proj-gen"
              label={generalDeduction.bezeichnung || 'Allg. Abzüge'}
              value={genAbzug}
              onChange={setGenAbzug}
              disabled={generatingInvoice}
            />
          )}
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
          confirmDisabled={!paidDate || !paidCheck?.ok}
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
          <PaidAmountField id="proj-invoice-paid-amount" value={paidAmount}
                           total={confirmPaid.total_amount} onChange={setPaidAmount} />
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

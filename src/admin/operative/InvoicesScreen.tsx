import { useEffect, useState } from 'react'
import { apiUrl } from '../../api/client'
import {
  archiveInvoice, generateInvoice, getInvoiceQuoteCoverage, getInvoiceWorkDescription,
  listInvoices, markInvoicePaid, markInvoiceSentByPost, sendInvoice as sendInvoiceByMail,
  unmarkInvoicePaid,
} from '../../api/admin/invoices'
import type { Invoice, InvoiceQuoteCoverage } from '../../api/admin/invoices'
import { getAdminProjects, setProjectStatus } from '../../api/admin/projects'
import type { Project } from '../../api/admin/projects'
import { hasAcceptedQuote as fetchHasAcceptedQuote } from '../../api/admin/quotes'
import { getAdminStaff } from '../../api/admin/staff'
import { INVOICE_STATUS_LABELS as STATUS_LABELS, INVOICE_STATUS_BADGE as STATUS_BADGE } from '../constants/statuses'
import { fmtCHF, fmtDate, todayISO } from '../utils/format'
import { invoiceWarningHint, sammelrechnungHint } from '../utils/invoiceHints'
import { StatusFilterPopover } from '../components/StatusFilterPopover'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { AdminCardList } from '../components/AdminCardList'
import { AutoGrowTextarea } from '../components/AutoGrowTextarea'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { QuoteCoverageSelect } from '../components/QuoteCoverageSelect'
import { defaultCheckedIds, selectionPayload, showQuoteSelection } from '../utils/quoteSelection'
import { useIsMobile } from '../useIsMobile'
import { isInvoiceOpen, openInvoicesHint } from '../utils/openInvoices'
import type { AdminScreen } from '../useAdminNav'
import { useToast, ToastHost } from '../components/useToast'

interface ProjektleiterOption {
  id: string
  name: string
}

const ALL_STATUSES = ['ausstehend', 'offen', 'gesendet', 'bezahlt', 'archiviert', 'inaktiv']

export default function InvoicesScreen({ onBadgeChange, onNav }: {
  onBadgeChange?: () => void
  // Sprung ins Projekt: die Rechnungsübersicht beantwortet «wie viel ist offen»,
  // die Rückfragen dazu («welche Rapporte?», «welche Offerte?») stehen im Projekt.
  onNav?: (screen: AdminScreen, detailId?: string) => void
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilters, setStatusFilters] = useState<Set<string>>(
    () => new Set(['ausstehend', 'offen', 'gesendet', 'bezahlt', 'inaktiv'])
  )
  const [search, setSearch] = useState('')
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)
  const [projektleiterOptions, setProjektleiterOptions] = useState<ProjektleiterOption[]>([])
  const [acting, setActing] = useState<number | null>(null)
  const isMobile = useIsMobile()
  const [confirmPaid, setConfirmPaid] = useState<Invoice | null>(null)
  // Zahlungsdatum: vorbelegt mit heute, nachtragbar — der Eingang wird oft erst
  // Tage später im Dashboard erfasst (Umsatzmonat + Aftersales-Frist hängen dran).
  const [paidDate, setPaidDate] = useState('')
  // Nach dem Bezahlen: «Projekt abschliessen?» — die Rechnung ist meist der
  // letzte Schritt eines Auftrags, das Schliessen ging bisher nur im Projekt.
  const [confirmCloseProject, setConfirmCloseProject] = useState<Invoice | null>(null)
  const [closingProject, setClosingProject] = useState(false)
  const [confirmUnpay, setConfirmUnpay] = useState<Invoice | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Invoice | null>(null)
  // Postversand: Rechnung als versendet markieren, ohne sie zu mailen.
  const [confirmPostal, setConfirmPostal] = useState<Invoice | null>(null)
  const [postalDate, setPostalDate] = useState('')
  const { toast, showToast } = useToast()
  // Generate invoice
  const [showGenerate, setShowGenerate] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  // genProject hält die Projekt-id (eindeutig), genProjectName den Anzeigenamen.
  const [genProject, setGenProject] = useState('')
  const [genProjectName, setGenProjectName] = useState('')
  const [genUseQuote, setGenUseQuote] = useState(false)
  const [generating, setGenerating] = useState(false)
  // Arbeitsbeschrieb ("Ausgeführte Arbeiten") — Vorschlag aus den Rapporten, vom
  // Projektleiter editierbar. Rapport-Texte sind Monteur-Sprache ("TB gerissen an
  // Lam."), auf einer Kundenrechnung oft zu knapp.
  const [genWorkDesc, setGenWorkDesc] = useState('')
  const [loadingWorkDesc, setLoadingWorkDesc] = useState(false)
  // Bemerkung auf der Rechnung (z.B. Referenz/Projekt-Nr. des Kunden) — reiner
  // Freitext, leer = kein Block auf dem PDF.
  const [genRemark, setGenRemark] = useState('')
  // Offerten-Auswahl: null solange nicht geladen oder Laden gescheitert —
  // dann verhält sich der Dialog exakt wie bisher (Automatik).
  const [genCoverage, setGenCoverage] = useState<InvoiceQuoteCoverage | null>(null)
  const [genCheckedQuotes, setGenCheckedQuotes] = useState<number[]>([])
  // Send invoice
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [hasAcceptedQuote, setHasAcceptedQuote] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setInvoices(await listInvoices())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    getAdminStaff()
      .then(staff => {
        setProjektleiterOptions(
          staff
            .filter(s => s.projektleiter)
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch(() => setProjektleiterOptions([]))
  }, [])

  async function openGenerate() {
    try {
      const p = await getAdminProjects()
      setProjects(p.filter(x => !x.is_closed))
    } catch { /* ignore */ }
    setGenProject('')
    setGenProjectName('')
    setGenUseQuote(false)
    setHasAcceptedQuote(false)
    setGenWorkDesc('')
    setGenRemark('')
    setShowGenerate(true)
  }

  async function checkQuote(projectId: string, projects: Project[]) {
    const projectName = projects.find(p => p.id === projectId)?.name ?? ''
    setGenProject(projectId)
    setGenProjectName(projectName)
    setGenCoverage(null)
    if (!projectId) { setHasAcceptedQuote(false); setGenWorkDesc(''); return }
    // Offerten-Auswahl nachladen, nicht blockierend: scheitert der Aufruf, bleibt
    // der Dialog ohne Auswahl und die Rechnung entsteht über die Automatik.
    void getInvoiceQuoteCoverage(projectId)
      .then(c => { setGenCoverage(c); setGenCheckedQuotes(defaultCheckedIds(c)) })
      .catch(() => setGenCoverage(null))
    try {
      setHasAcceptedQuote(await fetchHasAcceptedQuote(projectId, projectName))
    } catch {
      setHasAcceptedQuote(false)
    }
    // Vorschlag laden, nicht blockierend: schlaegt er fehl, bleibt das Feld leer und
    // die Rechnung entsteht ohne den Block.
    setLoadingWorkDesc(true)
    try {
      setGenWorkDesc(await getInvoiceWorkDescription(projectName, projectId))
    } catch {
      setGenWorkDesc('')
    } finally {
      setLoadingWorkDesc(false)
    }
  }

  async function handleGenerate() {
    if (!genProject) return
    setGenerating(true)
    try {
      const res = await generateInvoice({
        project_name: genProjectName,
        project_id: genProject,
        use_quote: genUseQuote,
        work_description: genWorkDesc,
        remark: genRemark,
        // Nur eine echte Abweichung vom Standard geht als quote_ids mit —
        // sonst läuft die bewährte automatische Auflösung (selectionPayload).
        quote_ids: genCoverage && showQuoteSelection(genCoverage)
          ? selectionPayload(genCoverage, genCheckedQuotes)
          : undefined,
      })
      showToast(
        `Rechnung ${res.invoice_number} erstellt (${fmtCHF(res.total_amount)})`
        + sammelrechnungHint(res.quote_numbers)
        + invoiceWarningHint(res.warnings),
        'success',
      )
      setShowGenerate(false)
      load()
      onBadgeChange?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen', 'error')
    } finally {
      setGenerating(false)
    }
  }

  function openSendInvoice(inv: Invoice) {
    const proj = projects.length > 0
      ? projects.find(p => p.name === inv.project_name)
      : null
    setSendEmail(proj?.customer?.email || '')
    setSendInvoice(inv)
  }

  async function handleSendInvoice() {
    if (!sendInvoice || !sendEmail) return
    setSending(true)
    try {
      await sendInvoiceByMail(sendInvoice.id, sendEmail)
      showToast(`Rechnung an ${sendEmail} gesendet`, 'success')
      setSendInvoice(null)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen', 'error')
    } finally {
      setSending(false)
    }
  }

  function openPaid(inv: Invoice) {
    setPaidDate(todayISO())
    setConfirmPaid(inv)
  }

  // Klick auf eine Rechnung öffnet ihr Projekt. Alt-Rechnungen ohne project_id
  // (Backfill) bleiben unklickbar — es gibt kein eindeutiges Ziel.
  function openProject(inv: Invoice) {
    if (inv.project_id) onNav?.('projects', inv.project_id)
  }

  const canOpenProject = (inv: Invoice) => !!onNav && !!inv.project_id

  // Weitere offene Rechnungen desselben Projekts. Die soeben bezahlte ist
  // ausgenommen: der Listen-Reload läuft parallel, ihr Status kann noch alt sein.
  function otherOpenInvoices(inv: Invoice): number {
    if (!inv.project_id) return 0
    return invoices.filter(i =>
      i.project_id === inv.project_id && i.id !== inv.id && isInvoiceOpen(i.status)
    ).length
  }

  // Offen = noch nicht abgeschlossen/archiviert. Nur dann lohnt die Rückfrage.
  function projectStillOpen(inv: Invoice): boolean {
    if (!inv.project_id) return false
    if (inv.project_status) return inv.project_status === 'offen'
    return !inv.project_is_closed
  }

  async function handleMarkPaid(inv: Invoice) {
    setActing(inv.id)
    try {
      await markInvoicePaid(inv.id, paidDate)
      showToast('Rechnung als bezahlt markiert', 'success')
      setConfirmPaid(null)
      load()
      onBadgeChange?.()
      // Anschlussfrage statt Automatik: eine Teilrechnung schliesst das Projekt nicht.
      if (projectStillOpen(inv)) setConfirmCloseProject(inv)
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
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Abschliessen', 'error')
    } finally {
      setClosingProject(false)
    }
  }

  async function handleArchive(id: number) {
    setActing(id)
    try {
      await archiveInvoice(id)
      showToast('Rechnung archiviert — Rapporte wieder verrechenbar', 'success')
      setConfirmArchive(null)
      load()
      onBadgeChange?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Archivieren', 'error')
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
      load()
      onBadgeChange?.()
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
      load()
      onBadgeChange?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  const filtered = invoices.filter(inv => {
    const matchStatus = statusFilters.has(inv.status)
    const matchSearch = inv.project_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase())
    const matchPl = !projektleiterFilter || inv.projektleiter_id === projektleiterFilter
    return matchStatus && matchSearch && matchPl
  })

  const totalOpen = invoices
    .filter(i => isInvoiceOpen(i.status))
    .reduce((s, i) => s + i.total_amount, 0)

  const closeProjectWarning = confirmCloseProject
    ? openInvoicesHint(otherOpenInvoices(confirmCloseProject))
    : ''

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Rechnungen</div>
          <div className="admin-page-subtitle">{filtered.length} Einträge · Offen: {fmtCHF(totalOpen)}</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openGenerate}>
          + Rechnung erstellen
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt oder Rechnungs-Nr. suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ProjektleiterFilter
            options={projektleiterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
          <StatusFilterPopover
            allStatuses={ALL_STATUSES}
            statusLabels={STATUS_LABELS}
            selected={statusFilters}
            onChange={setStatusFilters}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={filtered}
            keyFor={inv => String(inv.id)}
            empty="Keine Rechnungen gefunden."
            onItemClick={onNav ? openProject : undefined}
            renderCard={inv => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{inv.invoice_number}</span>
                  <span className={`admin-badge ${STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                    {STATUS_LABELS[inv.status] || inv.status}
                  </span>
                </div>
                <div className="admin-card-meta"><strong>{inv.project_name}</strong></div>
                <div className="admin-card-meta">
                  {fmtCHF(inv.total_amount)} · erstellt {fmtDate(inv.created_at)}{inv.paid_at ? ` · bezahlt ${fmtDate(inv.paid_at)}` : ''}
                </div>
                {/* Aktionen dürfen nicht ins Projekt springen — Klick hier stoppen. */}
                <div className="admin-card-actions" onClick={e => e.stopPropagation()}>
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
                  {(inv.status === 'ausstehend' || inv.status === 'offen') && (
                    <>
                      <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => openSendInvoice(inv)} disabled={acting === inv.id}>
                        Senden
                      </button>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => openPostal(inv)} disabled={acting === inv.id}>
                        Per Post versendet
                      </button>
                    </>
                  )}
                  {(inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                    <>
                      <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => openPaid(inv)} disabled={acting === inv.id}>
                        Als bezahlt markieren
                      </button>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmArchive(inv)} disabled={acting === inv.id}>
                        Archivieren
                      </button>
                    </>
                  )}
                  {inv.status === 'bezahlt' && (
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmUnpay(inv)} disabled={acting === inv.id}>
                      Zahlung zurücksetzen
                    </button>
                  )}
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Projekt</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Erstellt</th>
                <th>Bezahlt am</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine Rechnungen gefunden.</td></tr>
              ) : filtered.map(inv => (
                <tr
                  key={inv.id}
                  onClick={canOpenProject(inv) ? () => openProject(inv) : undefined}
                  title={canOpenProject(inv) ? 'Projekt öffnen' : undefined}
                  style={canOpenProject(inv) ? undefined : { cursor: 'default' }}
                >
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{inv.invoice_number}</td>
                  <td><strong>{inv.project_name}</strong></td>
                  <td style={{ fontWeight: 700 }}>{fmtCHF(inv.total_amount)}</td>
                  <td>
                    <span className={`admin-badge ${STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.paid_at)}</td>
                  {/* Aktionen bleiben einzeilig: die Spalte fordert per width:1% nur so
                      viel Breite an, wie alle Pillen brauchen — der Rest bleibt beim
                      Projektnamen. Zu schmales Fenster => .admin-table-wrap scrollt
                      horizontal, statt dass die Pillen umbrechen.
                      Der Klick stoppt hier: die Zeile springt ins Projekt, die
                      Aktionen sollen das nicht auslösen. */}
                  <td style={{ whiteSpace: 'nowrap', width: '1%' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
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
                      {(inv.status === 'ausstehend' || inv.status === 'offen') && (
                        <>
                          <button
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            onClick={() => openSendInvoice(inv)}
                            disabled={acting === inv.id}
                          >
                            Senden
                          </button>
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => openPostal(inv)}
                            disabled={acting === inv.id}
                          >
                            Per Post versendet
                          </button>
                        </>
                      )}
                      {(inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                        <>
                          <button
                            className="admin-btn admin-btn-success admin-btn-sm"
                            onClick={() => openPaid(inv)}
                            disabled={acting === inv.id}
                          >
                            Als bezahlt markieren
                          </button>
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => setConfirmArchive(inv)}
                            disabled={acting === inv.id}
                          >
                            Archivieren
                          </button>
                        </>
                      )}
                      {inv.status === 'bezahlt' && (
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => setConfirmUnpay(inv)}
                          disabled={acting === inv.id}
                        >
                          Zahlung zurücksetzen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
          confirmDisabled={!paidDate}
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
        />
      )}

      {/* Dialog: Rechnung erstellen */}
      {showGenerate && (
        <ConfirmDialog
          title="Rechnung erstellen"
          message={null}
          confirmLabel="Rechnung erstellen"
          busyLabel="Wird erstellt…"
          busy={generating}
          confirmDisabled={!genProject
            || (showQuoteSelection(genCoverage) && genCheckedQuotes.length === 0)}
          maxWidth={440}
          // Arbeitsbeschrieb und Bemerkung wachsen mit dem Text — ohne Scrollen
          // schöben sie auf kleinen Bildschirmen die Knöpfe aus dem Bild.
          scrollable
          onCancel={() => { if (!generating) setShowGenerate(false) }}
          onConfirm={() => void handleGenerate()}
        >
          <div style={{ marginBottom: 12 }}>
              <label className="admin-form-label">Projekt</label>
              <select className="admin-form-select" value={genProject} onChange={e => checkQuote(e.target.value, projects)}>
                <option value="">-- Projekt wählen --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.project_id_text ? `${p.name} (${p.project_id_text})` : p.name}
                  </option>
                ))}
              </select>
            </div>
            {hasAcceptedQuote && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={genUseQuote} onChange={e => setGenUseQuote(e.target.checked)} />
                  Offerten-Positionen verwenden (statt Ist-Daten)
                </label>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, paddingLeft: 24 }}>
                  Aktivieren, wenn noch kein unterschriebener Arbeitsrapport vorliegt — die Rechnung wird dann aus der Offerte erstellt.
                </div>
              </div>
            )}
            {genProject && genCoverage && showQuoteSelection(genCoverage) && (
              <QuoteCoverageSelect
                coverage={genCoverage}
                checked={genCheckedQuotes}
                onChange={setGenCheckedQuotes}
                disabled={generating}
              />
            )}
            {genProject && (
              <div style={{ marginBottom: 12 }}>
                <label className="admin-form-label" htmlFor="gen-work-desc">
                  Ausgeführte Arbeiten
                </label>
                <AutoGrowTextarea
                  id="gen-work-desc"
                  className="admin-form-input"
                  minRows={5}
                  maxLength={4000}
                  value={genWorkDesc}
                  placeholder={loadingWorkDesc ? 'Wird geladen…' : 'Erscheint auf der Rechnung über den Positionen. Leer lassen, um den Block wegzulassen.'}
                  onChange={e => setGenWorkDesc(e.target.value)}
                  disabled={loadingWorkDesc || generating}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Vorschlag aus den Rapporten dieses Projekts — vor dem Erstellen anpassen,
                  der Text steht so auf der Rechnung.
                </div>
              </div>
            )}
            {genProject && (
              <div style={{ marginBottom: 12 }}>
                <label className="admin-form-label" htmlFor="gen-remark">
                  Bemerkung
                </label>
                <AutoGrowTextarea
                  id="gen-remark"
                  className="admin-form-input"
                  minRows={2}
                  maxLength={1000}
                  value={genRemark}
                  placeholder="z.B. Referenz oder Projekt-Nr. des Kunden. Leer lassen, um den Block wegzulassen."
                  onChange={e => setGenRemark(e.target.value)}
                  disabled={generating}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Erscheint als eigener Block «Bemerkung» auf der Rechnung, über den Positionen.
                </div>
              </div>
            )}
        </ConfirmDialog>
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
          </div>
        </ConfirmDialog>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

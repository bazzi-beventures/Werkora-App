import { useCallback, useEffect, useRef, useState } from 'react'
import {
  generateInvoice, getAnzahlungen, getBillableReports, getInvoiceQuoteCoverage,
  getInvoiceWorkDescription, listInvoicesPage, previewInvoice,
} from '../../api/admin/invoices'
import type { BillableReport, Invoice, InvoiceQuoteCoverage, OpenAnzahlung } from '../../api/admin/invoices'
import { hasModule } from '../../api/modules'
import { BexioBadge } from './BexioBadge'
import { getAdminProjects, listProjectInvoices } from '../../api/admin/projects'
import type { Project } from '../../api/admin/projects'
import { hasAcceptedQuote as fetchHasAcceptedQuote } from '../../api/admin/quotes'
import { getAdminStaff } from '../../api/admin/staff'
import { INVOICE_STATUS_LABELS as STATUS_LABELS, INVOICE_STATUS_BADGE as STATUS_BADGE } from '../constants/statuses'
import { fmtCHF, fmtDate } from '../utils/format'
import { invoiceWarningHint, sammelrechnungHint } from '../utils/invoiceHints'
import { paidDeduction } from '../utils/paidAmount'
import { StatusFilterPopover } from '../components/StatusFilterPopover'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { AdminCardList } from '../components/AdminCardList'
import { ListPager } from '../components/ListPager'
import { AutoGrowTextarea } from '../components/AutoGrowTextarea'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EvtlVerrechnetBadge, InvoiceRowActions, useBexioBadges, useInvoiceActions } from './invoices/useInvoiceActions'
import { QuoteCoverageSelect } from '../components/QuoteCoverageSelect'
import { GeneralDeductionFields } from '../components/GeneralDeductionFields'
import { WorkDescriptionField } from '../components/WorkDescriptionField'
import { InvoiceModeField } from '../components/InvoiceModeField'
import {
  anzahlungPayload, generateOptionsPayload, hasActiveInvoice, isAdditional, parseAnzahlung, ANZAHLUNG_VORGABE,
  defaultCheckedReports, reportSelectionPayload, type InvoiceMode,
} from '../utils/invoiceMode'
import { ReportSelectField } from '../components/ReportSelectField'
import { AnzahlungAbzugField, AnzahlungField } from '../components/AnzahlungFields'
import { TravelCostField } from '../components/TravelCostField'
import {
  INITIAL_WORK_DESCRIPTION, workDescriptionPayload, type WorkDescriptionState,
} from '../utils/workDescription'
import { defaultCheckedIds, selectionPayload, showQuoteSelection } from '../utils/quoteSelection'
import {
  generalDeductionError, generalDeductionPayload, initialGeneralDeduction,
  type GeneralDeductionConfig, type GeneralDeductionState,
} from '../utils/generalDeduction'
import { useIsMobile } from '../useIsMobile'
import { LIST_PAGE_SIZE, usePagedList } from '../usePagedList'
import { useListSort } from '../useListSort'
import { SortableTh } from '../components/SortableTh'
import type { AdminScreen } from '../useAdminNav'
import { useToast, ToastHost } from '../components/useToast'
import { getFeature, isFeatureEnabled } from '../../api/modules'
import { getMe, type UserInfo } from '../../api/auth'
import { getAllCustomers } from '../../api/admin/customers'
import type { Customer } from '../../api/admin/customers'
import FreeInvoiceDialog from './FreeInvoiceDialog'

interface ProjektleiterOption {
  id: string
  name: string
}

const ALL_STATUSES = ['ausstehend', 'offen', 'gesendet', 'bezahlt', 'archiviert', 'inaktiv']
// Stabile Referenz für «noch nichts geladen»: die bexio-Abfrage hängt an der
// Zeilenliste, ein frisches [] je Render löste sie endlos neu aus.
const NO_INVOICES: Invoice[] = []
/** Einstieg «nur überfällige» (Wochenanalyse → «Rechnungen →»). */
export const UEBERFAELLIG = 'ueberfaellig'
// Sortierbare Spalten = Katalog des Endpoints (db/invoices.py, `_INVOICE_SORT_MAP`).
type InvoiceSortKey = 'invoice_number' | 'project_name' | 'total_amount' | 'status' | 'created_at' | 'paid_at'

export default function InvoicesScreen({ onBadgeChange, onNav, initialStatus, onConsumed }: {
  onBadgeChange?: () => void
  /** Statusfilter beim Einstieg (Dashboard-Kachel «Rechnungen offen» → 'gesendet';
   *  'ueberfaellig' aus der Wochenanalyse schaltet «Nur überfällige» ein, WF-53). */
  initialStatus?: string | null
  onConsumed?: () => void
  // Sprung ins Projekt: die Rechnungsübersicht beantwortet «wie viel ist offen»,
  // die Rückfragen dazu («welche Rapporte?», «welche Offerte?») stehen im Projekt.
  onNav?: (screen: AdminScreen, detailId?: string) => void
}) {
  const [statusFilters, setStatusFilters] = useState<Set<string>>(
    () => initialStatus && ALL_STATUSES.includes(initialStatus)
      ? new Set([initialStatus])
      : new Set(['ausstehend', 'offen', 'gesendet', 'bezahlt', 'inaktiv'])
  )
  // Einstiegsfilter einmal übernehmen, dann freigeben — sonst setzte ihn jeder
  // spätere Besuch derselben Station wieder.
  useEffect(() => {
    if (initialStatus && onConsumed) onConsumed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [nurUeberfaellig, setNurUeberfaellig] = useState(initialStatus === UEBERFAELLIG)
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)
  const [sort, toggleSort] = useListSort<InvoiceSortKey>({ key: 'created_at', dir: 'desc' })
  // Seitenweise vom Server: Filter und Reihenfolge macht die Datenbank, über
  // die Leitung gehen 50 Zeilen (api/admin/listPage.ts).
  const fetchPage = useCallback(
    (page: number, search: string) => listInvoicesPage({
      page, pageSize: LIST_PAGE_SIZE, statuses: statusFilters, search,
      projektleiterId: projektleiterFilter, sort: sort.key, dir: sort.dir, ueberfaellig: nurUeberfaellig,
    }),
    [statusFilters, projektleiterFilter, sort, nurUeberfaellig],
  )
  const list = usePagedList(fetchPage)
  const onSort = (key: InvoiceSortKey) => { toggleSort(key); list.setPage(1) }
  const invoices = list.data?.rows ?? NO_INVOICES
  const total = list.data?.total ?? 0
  const load = list.reload
  const [projektleiterOptions, setProjektleiterOptions] = useState<ProjektleiterOption[]>([])
  const isMobile = useIsMobile()
  const { toast, showToast } = useToast()

  // «Rechnung ohne Projekt» (§8.2 a) — Stufe beta, Default aus. Der Knopf
  // erscheint nur, wenn dieses Konto das Flag traegt; der Server prueft es
  // ohnehin ein zweites Mal (403).
  const [me, setMe] = useState<UserInfo | null>(null)
  const [freieKunden, setFreieKunden] = useState<Customer[]>([])
  const [freierDialog, setFreierDialog] = useState(false)
  const freieRechnung = isFeatureEnabled(me, 'freie_rechnung')
  // «Allg. Abzüge»: null = Feature beim Mandanten aus, dann kein Häkchen.
  const abzugCfg = isFeatureEnabled(me, 'allgemeine_abzuege')
    ? getFeature<GeneralDeductionConfig>(me, 'allgemeine_abzuege')
    : null

  useEffect(() => {
    let weg = false
    getMe().then((u) => { if (!weg) setMe(u) }).catch(() => { /* Knopf bleibt aus */ })
    return () => { weg = true }
  }, [])

  // bexio-Badge (Modul `bexio`, docs/specs/bexio-anbindung.md §8.2) und die
  // Aktionen der Zeilen — geteilt mit dem Dashboard-Panel «Rechnungsentwürfe»
  // (invoices/useInvoiceActions.tsx).
  const { bexio, refreshBexio } = useBexioBadges(invoices, hasModule(me, 'bexio'))

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
  // Lam."), auf einer Kundenrechnung oft zu knapp. Mit Häkchen, ob der Block
  // überhaupt erscheint (WW-52, utils/workDescription.ts).
  const [genWorkDesc, setGenWorkDesc] = useState<WorkDescriptionState>(INITIAL_WORK_DESCRIPTION)
  // Bemerkung auf der Rechnung (z.B. Referenz/Projekt-Nr. des Kunden) — reiner
  // Freitext, leer = kein Block auf dem PDF.
  const [genRemark, setGenRemark] = useState('')
  const [genAbzug, setGenAbzug] = useState<GeneralDeductionState>(() => initialGeneralDeduction(null))
  // Offerten-Auswahl: null solange nicht geladen oder Laden gescheitert —
  // dann verhält sich der Dialog exakt wie bisher (Automatik).
  const [genCoverage, setGenCoverage] = useState<InvoiceQuoteCoverage | null>(null)
  const [genCheckedQuotes, setGenCheckedQuotes] = useState<number[]>([])
  // Neue Version oder weitere Rechnung (WW-39/WW-47); gefragt wird nur, wenn das
  // gewählte Projekt schon eine gültige Rechnung hat.
  const [genMode, setGenMode] = useState<InvoiceMode>('replace')
  // Zähler gegen überholte Antworten (Projekt- oder Art-Wechsel während des Ladens).
  const genLoadSeq = useRef(0)
  const descSeq = useRef(0)
  // Rapport-Auswahl und Anzahlungs-Abzug: null = nicht geladen (Automatik).
  const [genReports, setGenReports] = useState<BillableReport[] | null>(null)
  const [genCheckedReports, setGenCheckedReports] = useState<number[]>([])
  const [genAnzahlungen, setGenAnzahlungen] = useState<OpenAnzahlung[] | null>(null)
  const [genCheckedAnzahlungen, setGenCheckedAnzahlungen] = useState<number[]>([])
  const [genAnzahlung, setGenAnzahlung] = useState(ANZAHLUNG_VORGABE)
  const [genTravel, setGenTravel] = useState(true)
  // Rechnungen des gewählten Projekts — entscheidet, ob «weitere Rechnung»
  // angeboten wird. Eigene Abfrage, weil die Liste nur eine Seite kennt.
  const [genProjectInvoices, setGenProjectInvoices] = useState<Invoice[]>(NO_INVOICES)
  const genInvSeq = useRef(0)
  const [hasAcceptedQuote, setHasAcceptedQuote] = useState(false)

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
    setGenMode('replace')
    setGenAnzahlung(ANZAHLUNG_VORGABE)
    setGenTravel(true)
    setGenReports(null)
    setGenAnzahlungen(null)
    genInvSeq.current++
    setGenProjectInvoices(NO_INVOICES)
    setGenWorkDesc(INITIAL_WORK_DESCRIPTION)
    setGenRemark('')
    setGenAbzug(initialGeneralDeduction(abzugCfg))
    setShowGenerate(true)
  }

  async function checkQuote(projectId: string, projects: Project[]) {
    const projectName = projects.find(p => p.id === projectId)?.name ?? ''
    setGenProject(projectId)
    setGenProjectName(projectName)
    // Ein anderes Projekt hat andere Rechnungen — die Frage beginnt von vorn.
    setGenMode('replace')
    const invSeq = ++genInvSeq.current
    setGenProjectInvoices(NO_INVOICES)
    if (!projectId) {
      genLoadSeq.current++
      setGenCoverage(null)
      setGenReports(null)
      setGenAnzahlungen(null)
      setHasAcceptedQuote(false)
      setGenWorkDesc(INITIAL_WORK_DESCRIPTION)
      return
    }
    // Scheitert die Abfrage, bleibt es bei «keine gültige Rechnung» — der Dialog
    // bietet dann nur Rechnung und Anzahlung an, wie bei einem neuen Projekt.
    listProjectInvoices<Invoice>(projectId)
      .then(list => { if (invSeq === genInvSeq.current) setGenProjectInvoices(list) })
      .catch(() => { /* bleibt leer */ })
    loadGenSuggestions(projectId, projectName, 'replace')
    try {
      setHasAcceptedQuote(await fetchHasAcceptedQuote(projectId, projectName))
    } catch {
      setHasAcceptedQuote(false)
    }
  }

  // Offerten-Auswahl und Vorschlag «Ausgeführte Arbeiten» hängen an Projekt UND Art
  // der Rechnung: eine weitere Rechnung lässt aus, was schon auf einer offenen steht.
  function loadGenSuggestions(projectId: string, projectName: string, mode: InvoiceMode) {
    const seq = ++genLoadSeq.current
    const additional = isAdditional(mode)
    const current = () => seq === genLoadSeq.current
    setGenCoverage(null)
    setGenReports(null)
    setGenAnzahlungen(null)
    // Offerten-Auswahl nachladen, nicht blockierend: scheitert der Aufruf, bleibt
    // der Dialog ohne Auswahl und die Rechnung entsteht über die Automatik.
    void getInvoiceQuoteCoverage(projectId, additional)
      .then(c => {
        if (!current()) return
        setGenCoverage(c)
        setGenCheckedQuotes(defaultCheckedIds(c))
      })
      .catch(() => { if (current()) setGenCoverage(null) })
    // Eine Anzahlung braucht nur die Offerten-Auswahl.
    if (mode === 'anzahlung') return
    loadWorkDescriptionFor(projectId, projectName, additional, undefined, seq)
    void getBillableReports(projectId, additional)
      .then(list => {
        if (!current()) return
        setGenReports(list)
        // Garantie-Rapporte nicht vorgewählt (WW-33). Weicht die Vorbelegung von
        // «alle» ab, gilt der Vorschlag «Ausgeführte Arbeiten» für die Auswahl.
        const checked = defaultCheckedReports(list)
        setGenCheckedReports(checked)
        const sel = reportSelectionPayload(list.map(r => r.id), checked)
        if (sel) loadWorkDescriptionFor(projectId, projectName, additional, sel, seq)
      })
      .catch(() => { if (current()) setGenReports(null) })
    void getAnzahlungen(projectId, additional)
      .then(list => {
        if (!current()) return
        setGenAnzahlungen(list)
        // Vorbelegt: alle offenen abziehen — die Schlussrechnung ist der Normalfall.
        setGenCheckedAnzahlungen(list.map(a => a.id))
      })
      .catch(() => { if (current()) setGenAnzahlungen(null) })
  }

  // Vorschlag laden, nicht blockierend: schlaegt er fehl, bleibt das Feld leer und
  // der Server leitet beim Erstellen selbst ab (workDescriptionPayload). Das
  // Häkchen bleibt, wie es gesetzt war — ein Wechsel setzt nur den Text neu.
  function loadWorkDescriptionFor(
    projectId: string, projectName: string, additional: boolean,
    reportIds: number[] | undefined, seq: number,
  ) {
    // Nur die jüngste Anfrage schreibt (descSeq) — siehe InvoicesTab.
    const mine = ++descSeq.current
    const latest = () => seq === genLoadSeq.current && mine === descSeq.current
    setGenWorkDesc(s => ({ ...s, text: '', loading: true, failed: false }))
    getInvoiceWorkDescription(projectName, projectId, additional, reportIds).then(
      text => { if (latest()) setGenWorkDesc(s => ({ ...s, text, loading: false })) },
      () => { if (latest()) setGenWorkDesc(s => ({ ...s, loading: false, failed: true })) },
    )
  }

  function handleGenModeChange(mode: InvoiceMode) {
    setGenMode(mode)
    if (genProject) loadGenSuggestions(genProject, genProjectName, mode)
  }

  // Andere Rapporte → anderer Vorschlag «Ausgeführte Arbeiten».
  function handleReportSelection(ids: number[]) {
    setGenCheckedReports(ids)
    if (!genProject) return
    loadWorkDescriptionFor(
      genProject, genProjectName, isAdditional(genMode),
      reportSelectionPayload(genReports?.map(r => r.id) ?? null, ids), ++genLoadSeq.current,
    )
  }

  const genHasActive = !!genProject && hasActiveInvoice(genProjectInvoices)
  const genIsAnzahlung = genMode === 'anzahlung'
  const genAnzahlungWert = parseAnzahlung(genAnzahlung)
  const genReportsVisible = !genIsAnzahlung && (genReports?.length ?? 0) > 1

  // Derselbe Body für Erstellen und Vorschau (WF-51).
  function genInput() {
    return {
      project_name: genProjectName,
      project_id: genProject,
      use_quote: genUseQuote,
      remark: genRemark,
      // Art, Offerten-/Rapport-Auswahl, Anzahlung — dieselbe Regel wie im
      // Projekt-Dialog (utils/invoiceMode.ts).
      ...generateOptionsPayload({
        mode: genMode,
        // Nur eine echte Abweichung vom Standard geht als quote_ids mit —
        // sonst läuft die bewährte automatische Auflösung (selectionPayload).
        quoteIds: genCoverage && showQuoteSelection(genCoverage)
          ? selectionPayload(genCoverage, genCheckedQuotes)
          : undefined,
        deduction: abzugCfg ? generalDeductionPayload(genAbzug) : undefined,
        workDescription: workDescriptionPayload(genWorkDesc),
        reportIds: reportSelectionPayload(genReports?.map(r => r.id) ?? null, genCheckedReports),
        anzahlungIds: anzahlungPayload(genAnzahlungen, genCheckedAnzahlungen),
        ...(genAnzahlungWert ?? {}),
        includeTravel: genTravel,
      }),
    }
  }

  async function handlePreview() {
    try {
      await previewInvoice(genInput())
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Vorschau fehlgeschlagen', 'error')
    }
  }

  async function handleGenerate() {
    if (!genProject) return
    setGenerating(true)
    try {
      const res = await generateInvoice(genInput())
      showToast(
        `${res.kind === 'anzahlung' ? 'Anzahlungsrechnung' : 'Rechnung'} ${res.invoice_number} erstellt (${fmtCHF(res.total_amount)})`
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

  // Empfänger-Vorbelegung aus der Projektliste des Erstellen-Dialogs, falls schon
  // geladen; sonst holt useInvoiceActions die Adresse des Projektkunden nach.
  const { acting, actions, dialogs } = useInvoiceActions({
    reload: load, showToast, onChanged: onBadgeChange, bexio, refreshBexio,
    emailFor: inv => projects.find(p => p.name === inv.project_name)?.customer?.email || '',
  })

  // Klick auf eine Rechnung öffnet ihr Projekt. Alt-Rechnungen ohne project_id
  // (Backfill) bleiben unklickbar — es gibt kein eindeutiges Ziel.
  function openProject(inv: Invoice) {
    if (inv.project_id) onNav?.('projects', inv.project_id)
  }

  const canOpenProject = (inv: Invoice) => !!onNav && !!inv.project_id

  const emptyText = list.failed ? 'Rechnungen konnten nicht geladen werden.' : 'Keine Rechnungen gefunden.'

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Rechnungen</div>
          <div className="admin-page-subtitle">
            {/* Bewusst ohne «Offen: CHF …» (20261113): die Summe zählte auch nie
                versendete Rechnungen und widersprach der Kennzahl «Fakturiert,
                offen». Was beim Kunden aussteht, steht in den Kennzahlen. */}
            {total} Einträge
          </div>
        </div>
        <div className="admin-page-actions">
          {freieRechnung && (
            <button
              className="admin-btn admin-btn-secondary"
              onClick={async () => {
                // Kunden erst beim Oeffnen holen: die Projektrechnung braucht
                // sie nicht, und die Liste kann lang sein.
                if (!freieKunden.length) {
                  try { setFreieKunden(await getAllCustomers()) } catch { /* Combobox bleibt leer */ }
                }
                setFreierDialog(true)
              }}
            >
              + Rechnung ohne Projekt
            </button>
          )}
          <button className="admin-btn admin-btn-primary" onClick={openGenerate}>
            + Rechnung erstellen
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt oder Rechnungs-Nr. suchen…"
            value={list.searchInput}
            onChange={e => list.setSearchInput(e.target.value)}
          />
          {/* Filterwechsel → Seite 1, im selben Handler (siehe usePagedList). */}
          <ProjektleiterFilter
            options={projektleiterOptions}
            value={projektleiterFilter}
            onChange={v => { setProjektleiterFilter(v); list.setPage(1) }}
          />
          {!nurUeberfaellig && (
            <StatusFilterPopover
              allStatuses={ALL_STATUSES}
              statusLabels={STATUS_LABELS}
              selected={statusFilters}
              onChange={v => { setStatusFilters(v); list.setPage(1) }}
            />
          )}
          <button
            type="button"
            className={`admin-btn admin-btn-sm ${nurUeberfaellig ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
            aria-pressed={nurUeberfaellig}
            title="Nur gesendete Rechnungen, deren Zahlungsziel überschritten ist"
            onClick={() => { setNurUeberfaellig(v => !v); list.setPage(1) }}
          >
            Nur überfällige
          </button>
        </div>

        {/* Spinner nur beim ersten Laden; danach bleibt die alte Seite stehen,
            bis die neue da ist. */}
        {list.loading && !list.data ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={invoices}
            keyFor={inv => String(inv.id)}
            empty={emptyText}
            onItemClick={onNav ? openProject : undefined}
            renderCard={inv => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{inv.invoice_number}</span>
                  {inv.invoice_kind === 'anzahlung' && (
                    <span className="admin-badge admin-badge-draft" style={{ marginLeft: 6 }} title="Anzahlungsrechnung">Anzahlung</span>
                  )}
                  <span className={`admin-badge ${STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                    {STATUS_LABELS[inv.status] || inv.status}
                  </span>
                  <BexioBadge badge={bexio[String(inv.id)]} onCancelRequest={() => actions.onBexioCancel(inv)} />
                  <EvtlVerrechnetBadge invoice={inv} />
                </div>
                <div className="admin-card-meta"><strong>{inv.project_name}</strong></div>
                <div className="admin-card-meta">
                  {fmtCHF(inv.total_amount)} · erstellt {fmtDate(inv.created_at)}{inv.paid_at ? ` · bezahlt ${fmtDate(inv.paid_at)}` : ''}
                  {paidDeduction(inv) != null && ` · erhalten ${fmtCHF(inv.paid_amount!)}`}
                </div>
                {/* Aktionen dürfen nicht ins Projekt springen — Klick hier stoppen. */}
                <div className="admin-card-actions" onClick={e => e.stopPropagation()}>
                  <InvoiceRowActions invoice={inv} acting={acting} on={actions} />
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table" aria-busy={list.loading} style={list.loading ? { opacity: 0.6 } : undefined}>
            <thead>
              <tr>
                <SortableTh label="Nr." sortKey="invoice_number" sort={sort} onSort={onSort} />
                <SortableTh label="Projekt" sortKey="project_name" sort={sort} onSort={onSort} />
                <SortableTh label="Betrag" sortKey="total_amount" sort={sort} onSort={onSort} />
                <SortableTh label="Status" sortKey="status" sort={sort} onSort={onSort} title="Alphabetisch nach Status" />
                <SortableTh label="Erstellt" sortKey="created_at" sort={sort} onSort={onSort} />
                <SortableTh label="Bezahlt am" sortKey="paid_at" sort={sort} onSort={onSort} title="Unbezahlte stehen immer am Ende" />
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">{emptyText}</td></tr>
              ) : invoices.map(inv => (
                <tr
                  key={inv.id}
                  onClick={canOpenProject(inv) ? () => openProject(inv) : undefined}
                  title={canOpenProject(inv) ? 'Projekt öffnen' : undefined}
                  style={canOpenProject(inv) ? undefined : { cursor: 'default' }}
                >
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {inv.invoice_number}
                    {inv.invoice_kind === 'anzahlung' && (
                      <span className="admin-badge admin-badge-draft" style={{ marginLeft: 6 }} title="Anzahlungsrechnung">Anzahlung</span>
                    )}
                  </td>
                  <td><strong>{inv.project_name}</strong></td>
                  <td style={{ fontWeight: 700 }}>
                    {fmtCHF(inv.total_amount)}
                    {paidDeduction(inv) != null && (
                      <div style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}
                           title="Weniger eingegangen als verrechnet (z. B. Skonto)">
                        erhalten {fmtCHF(inv.paid_amount!)}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`admin-badge ${STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                    <BexioBadge badge={bexio[String(inv.id)]} onCancelRequest={() => actions.onBexioCancel(inv)} />
                  <EvtlVerrechnetBadge invoice={inv} />
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
                      <InvoiceRowActions invoice={inv} acting={acting} on={actions} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ListPager
          page={list.page}
          pageSize={LIST_PAGE_SIZE}
          total={total}
          loading={list.loading}
          onPage={list.setPage}
        />
      </div>

      {dialogs}

      {/* Dialog: Rechnung erstellen */}
      {showGenerate && (
        <ConfirmDialog
          title="Rechnung erstellen"
          message={null}
          confirmLabel="Rechnung erstellen"
          busyLabel="Wird erstellt…"
          busy={generating}
          confirmDisabled={!genProject
            || (showQuoteSelection(genCoverage) && genCheckedQuotes.length === 0)
            || (genIsAnzahlung && genAnzahlungWert === null)
            || (genReportsVisible && genCheckedReports.length === 0)
            || (!genIsAnzahlung && abzugCfg !== null && generalDeductionError(genAbzug) !== null)}
          maxWidth={440}
          // Arbeitsbeschrieb und Bemerkung wachsen mit dem Text — ohne Scrollen
          // schöben sie auf kleinen Bildschirmen die Knöpfe aus dem Bild.
          scrollable
          onCancel={() => { if (!generating) setShowGenerate(false) }}
          onConfirm={() => void handleGenerate()}
          extraAction={genProject && !genIsAnzahlung
            ? { label: 'Vorschau', onClick: () => void handlePreview() } : undefined}
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
            {genProject && (
              <InvoiceModeField
                idPrefix="gen"
                value={genMode}
                onChange={handleGenModeChange}
                hasActive={genHasActive}
                disabled={generating}
              />
            )}
            {genProject && genIsAnzahlung && (
              <AnzahlungField
                idPrefix="gen"
                value={genAnzahlung}
                onChange={setGenAnzahlung}
                invalid={genAnzahlungWert === null}
                disabled={generating}
              />
            )}
            {hasAcceptedQuote && !genIsAnzahlung && (
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
            {genProject && genReportsVisible && genReports && (
              <ReportSelectField
                reports={genReports}
                checked={genCheckedReports}
                onChange={handleReportSelection}
                disabled={generating}
              />
            )}
            {genProject && !genIsAnzahlung && genAnzahlungen && genAnzahlungen.length > 0 && (
              <AnzahlungAbzugField
                anzahlungen={genAnzahlungen}
                checked={genCheckedAnzahlungen}
                onChange={setGenCheckedAnzahlungen}
                disabled={generating}
              />
            )}
            {genProject && !genIsAnzahlung && (
              <TravelCostField checked={genTravel} onChange={setGenTravel} disabled={generating} />
            )}
            {genProject && !genIsAnzahlung && (
              <WorkDescriptionField
                idPrefix="gen"
                value={genWorkDesc}
                onChange={setGenWorkDesc}
                disabled={generating}
              />
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
            {genProject && abzugCfg && !genIsAnzahlung && (
              <GeneralDeductionFields
                idPrefix="gen"
                label={abzugCfg.bezeichnung || 'Allg. Abzüge'}
                value={genAbzug}
                onChange={setGenAbzug}
                disabled={generating}
              />
            )}
        </ConfirmDialog>
      )}

      {/* Dialog: Rechnung senden */}
      {freierDialog && (
        <FreeInvoiceDialog
          customers={freieKunden}
          onClose={() => setFreierDialog(false)}
          onCreated={(nr) => {
            setFreierDialog(false)
            showToast(`Rechnung ${nr} erstellt.`)
            void load()
          }}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

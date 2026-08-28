import { useEffect, useRef, useState } from 'react'
import { reopenProject, saveProjectForm, setProjectStatus } from '../../api/admin/projects'
import { getAdminStaff } from '../../api/admin/staff'
import { getAllCustomers } from '../../api/admin/customers'
import type { Project } from '../../api/admin/projects'
import type { Customer } from '../../api/admin/customers'
import type { QuoteDetail } from './quotes/quoteTypes'
import { hasQuoteDraft } from './quotes/quoteDraft'
import { useToast, ToastHost } from '../components/useToast'
import { SendQuoteDialog } from './SendQuoteDialog'
import { SendOrderConfirmationDialog, SendThankyouDialog } from './SendQuoteMailDialog'
import { ProjectStatus } from '../constants/statuses'
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CommentsPanel } from './projectDetail/CommentsPanel'
import { useProjectComments } from './projectDetail/useProjectComments'
import { useProjectApprovals } from './projectDetail/useProjectApprovals'
import { useProjectTasks } from './projectDetail/useProjectTasks'
import { useProjectDocuments } from './projectDetail/useProjectDocuments'
import { useProjectBilling } from './projectDetail/useProjectBilling'
import { useProjectForm } from './projectDetail/useProjectForm'
import { useProjectBeschaffung } from './projectDetail/useProjectBeschaffung'
import { useProjectFeatures } from './projectDetail/useProjectFeatures'
import { DetailsForm, StaffMember } from './projectDetail/DetailsForm'
import { ProjectTab, ProjectTabBar } from './projectDetail/ProjectTabBar'
import { ApprovalCreateDialog } from './projectDetail/ApprovalCreateDialog'
import { ProjectDetailHeader } from './projectDetail/ProjectDetailHeader'
import { ProjectStatusDialog, ProjectStatusDialogs } from './projectDetail/ProjectStatusDialogs'
import { ProjectMaskDialogs } from './projectDetail/ProjectMaskDialogs'
import { ProjectTabContent } from './projectDetail/ProjectTabContent'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog'
import { useUnsavedChangesGuard } from '../unsavedChanges'
import { SCREEN_BACK_DEPTH, useScreenBack } from '../../shared/backButton'
import {
  DocumentsTab, SupplierDocumentsTab, QuotesTab, ReportsTab, InvoicesTab, ApprovalsTab, TasksTab,
  ProjectQuote,
} from './projectDetail/tabs'

// Kommentare sind nach 10 Minuten gesperrt (kein Bearbeiten/Löschen mehr) —
// muss zur Backend-Sperre in db/project_comments.py (COMMENT_LOCK_SECONDS) passen.

interface Props {
  project: Project | null
  onClose: () => void
  /**
   * Nach dem Speichern. `saved` gesetzt = frisch angelegtes Projekt, in das der
   * Aufrufer direkt springen soll; null/undefined = zurück in die Übersicht.
   */
  onSaved: (saved?: Project | null) => void
  /**
   * Reiter, auf dem die Maske aufgeht. Nur beim Direktsprung gesetzt (Button in
   * einer Info-Mail, siehe shared/deepLink.ts) — gelesen wird er ausschliesslich
   * beim Mount, wie `project` auch.
   */
  initialTab?: ProjectTab
}

export default function ProjectDetailScreen({ project, onClose, onSaved, initialTab }: Props) {
  const isNew = !project

  // Module und Feature-Flags des Mandanten (Charge H, H3).
  const features = useProjectFeatures()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [settingStatus, setSettingStatus] = useState(false)
  // Welche Lebenszyklus-Rueckfrage offen ist — eine statt fuenf Booleans, weil
  // sich die Dialoge ohnehin gegenseitig ausschliessen. 'closeAfterPaid' ist
  // dieselbe Aktion wie 'close', benennt aber den Anlass (bezahlte Rechnung).
  const [statusDialog, setStatusDialog] = useState<ProjectStatusDialog>(null)
  const { toast, showToast } = useToast()

  const [reopenReason, setReopenReason] = useState<'fehler' | 'garantiefall'>('fehler')
  const [reopening, setReopening] = useState(false)

  const [activeTab, setActiveTab] = useState<ProjectTab>(initialTab ?? 'details')

  // Die Projektmaske selbst (Charge H, H3). `focusDetails`, weil die
  // Fehlermeldung im Detail-Reiter steht: wer aus einem anderen Reiter heraus
  // speichert (Abfrage beim Verlassen), saehe sie sonst nie.
  const form = useProjectForm({
    project,
    customers,
    schedulingEnabled: features.scheduling,
    focusDetails: () => setActiveTab('details'),
  })

  // Beschaffungsschritt (Feature beschaffungsstatus) im Hook (Charge H, H3).
  const beschaffung = useProjectBeschaffung(project, showToast)

  // Dateien — Zustand und Handler im Hook (Charge H, H3).
  const documents = useProjectDocuments(project?.id, {
    onError: form.setError,
    onToast: showToast,
    // Der Server hat den Beschaffungsstatus vorgerückt: übernehmen, damit das
    // Dropdown ohne Reload stimmt.
    onBeschaffungAdvanced: beschaffung.advancedByServer,
  })

  // Kommentare — Zustand und Handler im Hook (Charge H, H3).
  const comments = useProjectComments(project?.id, showToast)
  // Tickt im Minutentakt, damit die 10-Min-Sperre der Kommentare ohne Reload greift.
  const [now, setNow] = useState(() => Date.now())

  // Offerten & Rechnungen — Listen und Aktionen im Hook (Charge H, H3); der
  // Screen hält nur, welche Maske gerade offen ist.
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  // Popup zum manuellen Erfassen eines Rapports (analog showQuoteForm).
  const [showReportForm, setShowReportForm] = useState(false)
  // Gesetzt = dasselbe Popup im Bearbeiten-Modus für genau diesen Rapport.
  // Bewusst dieselbe Maske: die Korrektur muss dieselben Felder anbieten wie die
  // Erfassung (siehe ReportCreateForm).
  const [editReportId, setEditReportId] = useState<number | null>(null)
  // Lokaler, noch nicht abgeschickter Offert-Entwurf für dieses Projekt vorhanden?
  // Steuert den «Entwurf fortsetzen»-Button. Die Maske übernimmt einen vorhandenen
  // Entwurf ohnehin selbst — der Knopf zeigt vor allem an, dass es einen gibt.
  const [quoteDraftExists, setQuoteDraftExists] = useState(() => hasQuoteDraft(project?.name ?? ''))
  const [editQuote, setEditQuote] = useState<QuoteDetail | null>(null)

  // Beim Schliessen der Offerten-Maske neu pruefen, ob ein lokaler Entwurf
  // liegen blieb — davon haengt der «Entwurf fortsetzen»-Knopf ab.
  function closeQuoteForm() {
    setShowQuoteForm(false)
    setQuoteDraftExists(hasQuoteDraft(project?.name ?? ''))
  }
  function closeReportForm() {
    setShowReportForm(false)
    setEditReportId(null)
  }
  const [useAcceptedQuote, setUseAcceptedQuote] = useState(false)
  const [sendQuote, setSendQuote] = useState<ProjectQuote | null>(null)
  // Danke-Mail-Dialog (Feature offerte_dank_mail): fragt analog zum Offerten-Versand
  // zuerst die Empfänger-Adresse ab, vorbelegt mit der Kunden-E-Mail der Offerte.
  const [thankyouQuote, setThankyouQuote] = useState<ProjectQuote | null>(null)
  // Auftragsbestätigung: ohne Feature-Bedingung, bei jeder angenommenen Offerte.
  const [orderConfirmationQuote, setOrderConfirmationQuote] = useState<ProjectQuote | null>(null)

  // Aufgaben (Checkliste)
  const tasks = useProjectTasks(project?.id, showToast)

  // Bestellfreigaben. `bindFileInput` wird bewusst herausdestrukturiert: hinge der
  // Callback noch am Hook-Objekt und ginge von dort an ein `ref=`-Attribut, hielte
  // der React Compiler das ganze Objekt für eine Ref und meldete jeden Feldzugriff
  // im JSX als Ref-Zugriff während des Renderns.
  const { bindFileInput: bindApprovalFile, ...approvals } = useProjectApprovals(project?.id, showToast)

  const effectiveStatus: ProjectStatus = project?.status ?? (project?.is_closed ? 'abgeschlossen' : 'offen')
  const isClosed = effectiveStatus === 'abgeschlossen'
  const isArchived = effectiveStatus === 'archiviert'

  // Belege (Offerten/Rechnungen/Rapporte) im Hook. Steht hier unten, weil die
  // Anschlussfrage nach dem Bezahlen den Projektstatus braucht — eine bezahlte
  // Teilrechnung schliesst das Projekt nicht, deshalb Frage statt Automatik.
  const billing = useProjectBilling(project, {
    onToast: showToast,
    onInvoicePaid: () => { if (!isClosed && !isArchived) setStatusDialog('closeAfterPaid') },
  })

  // Bearbeiten öffnet die Maske — welches Fenster offen ist, bleibt Sache des
  // Screens; der Hook liefert nur die vollständige Offerte dazu.
  async function handleEditQuote(quoteId: number) {
    const detail = await billing.loadQuoteDetail(quoteId)
    if (detail) setEditQuote(detail)
  }

  // Läuft auf diesem Projekt bereits eine Teilrapport-Serie? Trägt zwei Dinge: die
  // Vorauswahl der Teilrapport-Checkbox in der Erfassungsmaske (dieselbe Regel wie
  // im Chat, Spec §3.10) und damit auch den Anschluss nach «Weiterer Einsatz».
  const hasOpenPartial = billing.reports.some(
    r => r.is_partial && !r.merged_into_report_id && !r.invoice_id,
  )

  // «Weiterer Einsatz» am bestehenden Rapport: erst in die Serie aufnehmen, dann die
  // Erfassungsmaske für den nächsten Tag öffnen. Beide Schritte in einem Griff, weil
  // sie zusammen gemeint sind — der Reiter hat vorher gefragt, was die Aufnahme
  // kostet (nicht verrechenbar bis zur Unterschrift auf dem Gesamtrapport).
  //
  // Wirft der erste Schritt, bleibt die Maske zu: der Rapport gehört dann nicht zur
  // Serie, und ein neuer Einsatz daneben wäre genau nicht, was der Anwender wollte.
  async function handleAddNextEinsatz(reportId: number) {
    await billing.markPartial(reportId)
    setShowReportForm(true)
  }

  // `useAcceptedQuote` ist die Checkbox der Rechnungs-Maske, kein Belegzustand —
  // deshalb bleibt sie im Screen und geht hier an den Hook.
  function handleGenerateInvoice(remark: string, quoteIds?: number[]): Promise<boolean> {
    return billing.generate(remark, useAcceptedQuote, quoteIds)
  }

  // Abfrage offen, weil „Zurück"/„Abbrechen" bei ungespeicherten Änderungen gedrückt wurde.
  const [pendingLeave, setPendingLeave] = useState(false)

  useEffect(() => {
    document.querySelector('.admin-content')?.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    getAdminStaff().then(rows => {
      setStaff(rows.map(s => ({
        id: s.id,
        name: s.name,
        projektleiter: s.projektleiter ?? false,
        authorized_user_id: s.authorized_user_id ?? null,
      })))
    }).catch(() => {})
    getAllCustomers().then(setCustomers).catch(() => {})
  }, [])

  // Termine nachladen (eigene Tabelle) — der Hook zieht damit auch seinen
  // Ausgangsstand nach, sonst gaelte die Maske sofort als geaendert.
  useEffect(() => {
    form.loadAppointments()
  }, [project?.id])

  useEffect(() => {
    if (!project) return
    documents.reload()
    comments.reload()
    billing.reloadQuotes()
    billing.reloadInvoices()
    billing.reloadReports()
    approvals.reload()
    tasks.reload()
  }, [project?.id])

  // Kommentare + Aufgaben bei jeder Rückkehr in die App (visibilitychange),
  // beim Online-Werden und alle 30 s neu laden — so sieht der Projektleiter neue
  // Einträge von Mitarbeitern ohne manuellen Reload. Die übrigen Projektdaten
  // (Dateien, Offerten, Rechnungen …) laden bewusst nur beim Öffnen/Projektwechsel.
  useVisibilityPolling(() => {
    comments.reload()
    tasks.reload()
  }, 30_000)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const saved = await form.persist()
    if (saved === false) return
    // Neues Projekt → der Aufrufer springt direkt hinein statt in die Übersicht.
    onSaved(saved)
  }

  // Verlassen der Maske (Zurück/Abbrechen) — bei ungespeicherten Änderungen erst fragen.
  function requestClose() {
    if (form.isDirty) setPendingLeave(true)
    else onClose()
  }

  // Hardware-/Browser-Zurück führt aus der Detailmaske in die Projektübersicht —
  // dieselbe Wirkung wie der Zurück-Pfeil oben links, samt Nachfrage.
  //
  // `useScreenBack` (dauerhaft) statt `useBackButton` (einmalig): bei
  // ungespeicherten Änderungen öffnet `requestClose` nur die Abfrage. Wer dort
  // «Abbrechen» wählt, ist noch in der Maske — mit einem einmaligen Handler wäre
  // der zweite Zurück-Druck an ihr vorbeigelaufen und hätte genau das
  // weggeworfen, was die Abfrage schützen sollte.
  useScreenBack(true, () => { requestClose(); return true }, SCREEN_BACK_DEPTH.detail)

  async function saveAndLeave() {
    const saved = await form.persist()
    if (saved === false) { setPendingLeave(false); return }
    setPendingLeave(false)
    // Gespeichert und trotzdem raus: zurück in die Übersicht (dort neu laden),
    // auch beim frisch angelegten Projekt — der Anwender wollte ja weg.
    onSaved(null)
  }

  // Dirty-Stand der Rapport-Maske (Overlay über diesem Screen). Er gehört in den
  // globalen Guard: sonst wirft ein Klick in der Sidebar eine offene, halb
  // ausgefüllte Rapport-Maske ersatzlos weg — ✕/Esc/Backdrop fragen längst nach,
  // die Navigation nicht.
  const reportMaskDirty = useRef(false)

  // Navigation über Sidebar/MobileNav: die Maske speichert nur, das Wegnavigieren
  // übernimmt der Aufrufer (AdminApp).
  useUnsavedChangesGuard(
    () => form.isDirty || reportMaskDirty.current,
    async () => (await form.persist()) !== false,
    // Bei offener Rapport-Maske bietet die Abfrage kein «Speichern» an: sie würde
    // das Projektformular darunter speichern, nicht den Rapport — und einen halb
    // ausgefüllten Rapport zu buchen wäre schlimmer als der Verlust (er ist ein
    // Beleg mit Geldfolge).
    () => !reportMaskDirty.current,
  )

  async function handleClose() {
    if (!project) return
    setSettingStatus(true)
    try {
      // Über die id, nicht den Namen: Projektnamen dürfen doppelt vorkommen, der
      // Namens-Pfad antwortet dann mit 409 und das Projekt liesse sich nie schliessen.
      await setProjectStatus(project.id, 'abgeschlossen')
      showToast('Projekt geschlossen')
      setTimeout(onSaved, 1000)
    } catch {
      form.setError('Fehler beim Schliessen')
    } finally {
      setSettingStatus(false)
      setStatusDialog(null)
    }
  }

  async function handleArchive() {
    if (!project) return
    setSettingStatus(true)
    try {
      await setProjectStatus(project.id, 'archiviert')
      showToast('Projekt archiviert')
      setTimeout(onSaved, 1000)
    } catch {
      form.setError('Fehler beim Archivieren')
    } finally {
      setSettingStatus(false)
      setStatusDialog(null)
    }
  }

  async function handleReopen() {
    if (!project) return
    setReopening(true)
    try {
      await reopenProject(project.id)
      if (reopenReason === 'garantiefall') {
        // Garantiefall: die Reparatur muss als solche erkennbar bleiben — sonst
        // taucht die Nacharbeit in den Kennzahlen wie ein normaler Auftrag auf.
        await saveProjectForm({
          name: project.name,
          art_der_arbeit: Array.from(new Set([...form.artDerArbeit, 'Reparatur'])),
          is_warranty: true,
        }, project.id)
      }
      showToast('Projekt wiedereröffnet')
      setTimeout(onSaved, 1000)
    } catch {
      form.setError('Fehler beim Wiedereröffnen')
    } finally {
      setReopening(false)
      setStatusDialog(null)
    }
  }

  return (
    <div className="admin-page">
      <ProjectDetailHeader
        project={project}
        isNew={isNew}
        status={effectiveStatus}
        beschaffungSteps={features.beschaffungSteps}
        beschaffung={beschaffung.status}
        beschaffungAt={beschaffung.at}
        beschaffungSource={beschaffung.source}
        onBack={requestClose}
      />

      {/* ── Tab-Leiste ──────────────────────────────────────── */}
      {!isNew && (
        <ProjectTabBar
          active={activeTab}
          onSelect={setActiveTab}
          showNachkalkulation={features.nachkalkulation}
        />
      )}

      {/* ── Inhalt: aktiver Tab links, Kommentare immer rechts ──── */}
      <div className={isNew ? undefined : 'project-detail-body'}>
      <div className="project-detail-main">

      {(isNew || activeTab === 'details') && (
        <DetailsForm
          form={form}
          staff={staff}
          customers={customers}
          schedulingEnabled={features.scheduling}
          showGeruestfach={features.geruestfach}
          onSubmit={handleSave}
          onCancel={requestClose}
        />
      )}

      {!isNew && project && (
        <ProjectTabContent
          tab={activeTab}
          project={project}
          documents={documents}
          billing={billing}
          approvals={approvals}
          tasks={tasks}
          beschaffungSteps={features.beschaffungSteps}
          beschaffung={beschaffung.status}
          beschaffungAt={beschaffung.at}
          beschaffungSource={beschaffung.source}
          savingBeschaffung={beschaffung.saving}
          onBeschaffungChange={beschaffung.change}
          quoteDraftExists={quoteDraftExists}
          dankEnabled={features.dankMail}
          absageEnabled={features.absageMail}
          teilrapportEnabled={features.teilrapport}
          nachkalkulationEnabled={features.nachkalkulation}
          useAcceptedQuote={useAcceptedQuote}
          onUseAcceptedQuoteChange={setUseAcceptedQuote}
          defaultInvoiceEmail={form.selectedCustomer?.email ?? project.customer?.email ?? ''}
          currentUserId={features.currentUserId}
          onShowQuoteForm={() => setShowQuoteForm(true)}
          onShowReportForm={() => setShowReportForm(true)}
          onAddNextEinsatz={handleAddNextEinsatz}
          onEditReport={setEditReportId}
          onEditQuote={handleEditQuote}
          onSendQuote={setSendQuote}
          onSendThankyou={setThankyouQuote}
          onSendOrderConfirmation={setOrderConfirmationQuote}
          onGenerateInvoice={handleGenerateInvoice}
          onShowApprovalForm={() => approvals.setShowForm(true)}
          status={effectiveStatus}
          settingStatus={settingStatus}
          reopening={reopening}
          onStatusAction={setStatusDialog}
        />
      )}

      {/* ── Dialog: Neue Bestellfreigabe ─────────────────────── */}
      {approvals.showForm && project && (
        <ApprovalCreateDialog a={approvals} staff={staff} bindFileInput={bindApprovalFile} />
      )}

      {/* ── Masken: Offerte erfassen/bearbeiten, Rapport ─────── */}
      {project && (
        <ProjectMaskDialogs
          project={project}
          staff={staff}
          quotes={billing.quotes}
          showQuoteForm={showQuoteForm}
          onQuoteDone={warning => { closeQuoteForm(); billing.reloadQuotes(); if (warning) showToast(warning) }}
          onQuoteCancel={closeQuoteForm}
          showReportForm={showReportForm}
          editReportId={editReportId}
          reportDefaultPartial={features.teilrapport && hasOpenPartial}
          onReportDone={() => { closeReportForm(); billing.reloadReports() }}
          onReportCancel={closeReportForm}
          reportDirtyRef={reportMaskDirty}
          editQuote={editQuote}
          onEditQuoteDone={warning => { billing.reloadQuotes(); if (warning) showToast(warning) }}
          onEditQuoteClose={() => setEditQuote(null)}
        />
      )}

      </div>{/* /project-detail-main */}

      {/* ── Kommentare: immer rechts, unabhängig vom aktiven Tab ── */}
      {!isNew && <CommentsPanel c={comments} now={now} />}

      </div>{/* /project-detail-body */}

      {documents.confirmDeleteId && (
        <ConfirmDialog
          title="Dokument löschen?"
          message={<>«{documents.files.find(f => f.id === documents.confirmDeleteId)?.filename ?? 'Diese Datei'}» wird dauerhaft entfernt.</>}
          confirmLabel="Ja, löschen"
          busyLabel="Löschen…"
          busy={documents.deleting}
          variant="danger"
          onCancel={() => documents.setConfirmDeleteId(null)}
          onConfirm={documents.remove}
        />
      )}

      {comments.confirmDeleteId && (
        <ConfirmDialog
          title="Kommentar löschen?"
          message={<>Der Kommentar wird dauerhaft entfernt.</>}
          confirmLabel="Ja, löschen"
          busyLabel="Löschen…"
          busy={comments.deleting}
          variant="danger"
          onCancel={() => comments.setConfirmDeleteId(null)}
          onConfirm={comments.remove}
        />
      )}
      {/* ── Dialoge ──────────────────────────────────────────── */}
      <ProjectStatusDialogs
        open={statusDialog}
        projectName={project?.name ?? ''}
        invoices={billing.invoices}
        settingStatus={settingStatus}
        reopening={reopening}
        reopenReason={reopenReason}
        onReopenReasonChange={setReopenReason}
        onDismiss={() => setStatusDialog(null)}
        onClose={handleClose}
        onArchive={handleArchive}
        onReopen={handleReopen}
      />

      {sendQuote && (
        <SendQuoteDialog
          quoteId={sendQuote.id}
          defaultEmail={sendQuote.customer_email || ''}
          header={
            <>
              {sendQuote.quote_number}
              {sendQuote.status === 'gesendet' && (
                <>
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Wurde bereits versendet — erneuter Versand erzeugt neue Annahme-/Ablehnen-Links.
                  </span>
                </>
              )}
            </>
          }
          onClose={() => setSendQuote(null)}
          onSent={async email => {
            showToast(`Offerte an ${email} gesendet`)
            setSendQuote(null)
            await billing.reloadQuotes()
            if (!project) return
            // Direkt angehängte Dateien liegen jetzt als Projekt-Anhänge — Liste auffrischen.
            await documents.reload()
          }}
        />
      )}

      {thankyouQuote && (
        <SendThankyouDialog
          quoteId={thankyouQuote.id}
          defaultEmail={thankyouQuote.customer_email || ''}
          header={<>{thankyouQuote.quote_number}</>}
          onClose={() => setThankyouQuote(null)}
          onSent={async msg => {
            showToast(msg)
            setThankyouQuote(null)
            await billing.reloadQuotes()
          }}
        />
      )}

      {orderConfirmationQuote && (
        <SendOrderConfirmationDialog
          quoteId={orderConfirmationQuote.id}
          defaultEmail={orderConfirmationQuote.customer_email || ''}
          alreadySentAt={orderConfirmationQuote.order_confirmation_sent_at}
          header={<>{orderConfirmationQuote.quote_number}</>}
          onClose={() => setOrderConfirmationQuote(null)}
          onSent={async msg => {
            showToast(msg)
            setOrderConfirmationQuote(null)
            // Der Versand legt das Auftragsbestätigungs-PDF am Projekt ab — die
            // Dateiliste muss mit, sonst taucht es erst nach einem Reload auf.
            await Promise.all([billing.reloadQuotes(), documents.reload()])
          }}
        />
      )}

      {pendingLeave && (
        <UnsavedChangesDialog
          saving={form.saving}
          message={
            isNew
              ? 'Das neue Projekt ist noch nicht angelegt. Jetzt speichern oder verwerfen?'
              : `Die Änderungen an «${project?.name}» sind noch nicht gespeichert.`
          }
          onSave={saveAndLeave}
          onDiscard={() => { setPendingLeave(false); onClose() }}
          onCancel={() => setPendingLeave(false)}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

import { apiUrl } from '../../../api/client'
import {
  ApprovalsTab, DocumentsTab, InvoicesTab, QuotesTab, ReportsTab, SupplierDocumentsTab, TasksTab,
} from './tabs'
import { hasBillableReport } from './billingRules'
import { NachkalkulationTab } from './NachkalkulationTab'
import { StatusTab } from './StatusTab'
import type { ProjectStatus } from '../../constants/statuses'
import type { ProjectStatusDialog } from './ProjectStatusDialogs'
import type { BeschaffungStep } from '../../constants/beschaffungSteps'
import type { Project } from '../../../api/admin/projects'
import type { ProjectTab } from './ProjectTabBar'
import type { ProjectQuote } from './types'
import type { UseProjectApprovals } from './useProjectApprovals'
import type { UseProjectBilling } from './useProjectBilling'
import type { UseProjectDocuments } from './useProjectDocuments'
import type { UseProjectTasks } from './useProjectTasks'

// Welcher Reiter was zeigt (Charge H, H3) — ohne den Detail-Reiter, der als
// eigene Maske in DetailsForm liegt.
//
// Die Dateiliste taucht in vier Reitern auf (Dokumente, Lieferanten, Offerten,
// Rapporte): dort, wo der Beleg entsteht, will man auch den Scan dazu ablegen.
// Es ist ueberall dieselbe Liste aus useProjectDocuments, nur nach Kategorie
// gefiltert — kein zweiter Datenstand.

export function ProjectTabContent({
  tab, project, documents, billing, approvals, tasks,
  beschaffungSteps, beschaffung, beschaffungAt, beschaffungSource,
  savingBeschaffung, onBeschaffungChange,
  quoteDraftExists, dankEnabled, absageEnabled, teilrapportEnabled, nachkalkulationEnabled,
  useAcceptedQuote, onUseAcceptedQuoteChange, defaultInvoiceEmail,
  currentUserId,
  onShowQuoteForm, onShowReportForm, onEditReport, onEditQuote,
  onSendQuote, onSendThankyou, onSendOrderConfirmation, onGenerateInvoice, onShowApprovalForm,
  status, settingStatus, reopening, onStatusAction,
}: {
  tab: ProjectTab
  project: Project
  documents: UseProjectDocuments
  billing: UseProjectBilling
  approvals: Omit<UseProjectApprovals, 'bindFileInput'>
  tasks: UseProjectTasks
  /** Leer = Feature «beschaffungsstatus» aus. */
  beschaffungSteps: BeschaffungStep[]
  beschaffung: string | null
  beschaffungAt: string | null
  beschaffungSource: string | null
  savingBeschaffung: boolean
  onBeschaffungChange: (next: string | null) => void
  /** Lokaler, noch nicht abgeschickter Offert-Entwurf vorhanden? */
  quoteDraftExists: boolean
  dankEnabled: boolean
  absageEnabled: boolean
  /** Feature «teilrapport»: schaltet Checkbox und Bündeln-Knopf (nicht das Auflösen). */
  teilrapportEnabled: boolean
  /** Modul «kpis» + Management-Rolle — siehe useProjectFeatures.nachkalkulation. */
  nachkalkulationEnabled: boolean
  useAcceptedQuote: boolean
  onUseAcceptedQuoteChange: (v: boolean) => void
  defaultInvoiceEmail: string
  currentUserId: string | null
  onShowQuoteForm: () => void
  onShowReportForm: () => void
  onEditReport: (reportId: number) => void
  onEditQuote: (quoteId: number) => void
  onSendQuote: (q: ProjectQuote) => void
  onSendThankyou: (q: ProjectQuote) => void
  onSendOrderConfirmation: (q: ProjectQuote) => void
  onGenerateInvoice: (remark: string, quoteIds?: number[]) => Promise<boolean>
  onShowApprovalForm: () => void
  status: ProjectStatus
  settingStatus: boolean
  reopening: boolean
  onStatusAction: (dialog: ProjectStatusDialog) => void
}) {
  return (
    <>
      {/* ── Dateien ──────────────────────────────────────────── */}
      {tab === 'documents' && (
        <DocumentsTab
          files={documents.files}
          uploading={documents.uploading}
          uploadingCategory={documents.uploadingCategory}
          onUpload={documents.upload}
          onDelete={documents.setConfirmDeleteId}
          onRename={documents.rename}
        />
      )}

      {tab === 'supplier' && (
        <SupplierDocumentsTab
          files={documents.files}
          uploading={documents.uploading}
          uploadingCategory={documents.uploadingCategory}
          onUpload={documents.upload}
          onDelete={documents.setConfirmDeleteId}
          onRename={documents.rename}
          beschaffungSteps={beschaffungSteps}
          beschaffungStatus={beschaffung}
          beschaffungStatusAt={beschaffungAt}
          beschaffungStatusSource={beschaffungSource}
          savingBeschaffung={savingBeschaffung}
          onBeschaffungChange={onBeschaffungChange}
        />
      )}

      {tab === 'quotes' && (
        <QuotesTab
          quotes={billing.quotes}
          invoices={billing.invoices}
          regeneratingQuoteId={billing.regeneratingQuoteId}
          hasLocalDraft={quoteDraftExists}
          dankEnabled={dankEnabled}
          absageEnabled={absageEnabled}
          sendingRejectionId={billing.sendingRejectionId}
          onShowCreateForm={onShowQuoteForm}
          onResumeDraft={onShowQuoteForm}
          onUpdateStatus={billing.updateQuoteStatus}
          onRegenerate={billing.regenerate}
          onSend={onSendQuote}
          onSendThankyou={onSendThankyou}
          onSendOrderConfirmation={onSendOrderConfirmation}
          onSendRejection={billing.sendRejection}
          onEdit={onEditQuote}
          addingVariantId={billing.addingVariantId}
          onAddVariant={billing.addVariant}
          files={documents.files}
          uploading={documents.uploading}
          uploadingCategory={documents.uploadingCategory}
          onUploadFile={documents.upload}
          onDeleteFile={documents.setConfirmDeleteId}
          onRenameFile={documents.rename}
        />
      )}

      {tab === 'reports' && (
        <ReportsTab
          reports={billing.reports}
          onShowCreateForm={onShowReportForm}
          onDelete={billing.deleteReport}
          onEdit={onEditReport}
          onRegeneratePdf={billing.regenerateReportPdf}
          teilrapportEnabled={teilrapportEnabled}
          onAggregate={billing.aggregateReports}
          onDissolve={billing.dissolveAggregate}
          onAccept={billing.acceptAggregate}
          paperRapportUrl={apiUrl(`/pwa/admin/projects/${project.id}/paper-rapport.pdf`)}
          files={documents.files}
          uploading={documents.uploading}
          uploadingCategory={documents.uploadingCategory}
          onUploadFile={documents.upload}
          onDeleteFile={documents.setConfirmDeleteId}
          onRenameFile={documents.rename}
        />
      )}

      {tab === 'invoices' && (
        <InvoicesTab
          invoices={billing.invoices}
          useAcceptedQuote={useAcceptedQuote}
          generatingInvoice={billing.generatingInvoice}
          defaultEmail={defaultInvoiceEmail}
          hasSignedReport={hasBillableReport(billing.reports)}
          onUseAcceptedQuoteChange={onUseAcceptedQuoteChange}
          onGenerateInvoice={onGenerateInvoice}
          loadQuoteCoverage={billing.loadQuoteCoverage}
          onMarkPaid={billing.markPaid}
          onUnmarkPaid={billing.unmarkPaid}
          onArchive={billing.archive}
          onSendInvoice={billing.send}
          onMarkSentByPost={billing.markSentByPost}
        />
      )}

      {tab === 'approvals' && (
        <ApprovalsTab
          approvals={approvals.approvals}
          currentUserId={currentUserId}
          decidingApprovalId={approvals.decidingId}
          onShowCreateForm={onShowApprovalForm}
          onDecide={approvals.decide}
          onDelete={approvals.remove}
        />
      )}

      {tab === 'tasks' && (
        <TasksTab
          tasks={tasks.tasks}
          onAdd={tasks.add}
          onEdit={tasks.edit}
          onDelete={tasks.remove}
        />
      )}

      {/* Eigenkosten und Gewinn dieses Projekts. Das Gate steht doppelt: die
          Reiterleiste blendet den Knopf aus, und hier faellt der Inhalt weg —
          sonst laendet ein von Hand gebauter Deep-Link (`…/nachkalkulation`)
          ohne Modul/Rolle in einem 403 statt in einer leeren Ansicht. */}
      {tab === 'nachkalkulation' && nachkalkulationEnabled && (
        <NachkalkulationTab projectId={project.id} />
      )}

      {/* Nur die Status-Aktion (Abschliessen/Wiedereroeffnen). Kommentare stehen
          tab-unabhaengig in der rechten Seitenleiste. */}
      {tab === 'status' && (
        <StatusTab
          status={status}
          settingStatus={settingStatus}
          reopening={reopening}
          onClose={() => onStatusAction('close')}
          onReopen={() => onStatusAction('reopen')}
          onArchive={() => onStatusAction('archive')}
          onReactivate={() => onStatusAction('reactivate')}
        />
      )}
    </>
  )
}

// Barrel für die Projektdetail-Tabs — die Implementierungen liegen je Tab in
// einer eigenen Datei (types.ts, FileSection.tsx, DocumentsTab.tsx, …).
// Bestehende Importe über './projectDetail/tabs' bleiben dadurch gültig.
export type { ProjectFileCategory, ProjectFile, ProjectQuote, ProjectInvoice, ProjectReport, ProjectTask, ProjectApproval } from './types'
export { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_BADGE, groupByParent } from './types'
export { CATEGORY_LABELS } from './FileSection'
export { DocumentsTab, SupplierDocumentsTab } from './DocumentsTab'
export { QuotesTab } from './QuotesTab'
export { ReportsTab, reportStatusBadge } from './ReportsTab'
export { InvoicesTab } from './InvoicesTab'
export { ApprovalsTab } from './ApprovalsTab'
export { TasksTab } from './TasksTab'

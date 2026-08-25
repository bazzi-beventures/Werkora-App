// Der Typ beschreibt die API-Antwort und steht deshalb seit Charge H1 in
// api/admin/projects.ts; hier bleiben die Beschriftungen. Re-Export, damit die
// bestehenden `from '../constants/statuses'`-Importe gültig bleiben.
import type { ProjectStatus } from '../../api/admin/projects'

export type { ProjectStatus }

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  offen: 'Offen',
  abgeschlossen: 'Abgeschlossen',
  archiviert: 'Archiviert',
}

export const PROJECT_STATUS_BADGE: Record<ProjectStatus, string> = {
  offen: 'admin-badge-active',
  abgeschlossen: 'admin-badge-closed',
  archiviert: 'admin-badge-draft',
}

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  akzeptiert: 'Akzeptiert',
  abgelehnt: 'Abgelehnt',
  absage: 'Absage',
  archiviert: 'Archiviert',
}

export const QUOTE_STATUS_BADGE: Record<string, string> = {
  entwurf: 'admin-badge-draft',
  gesendet: 'admin-badge-sent',
  akzeptiert: 'admin-badge-approved',
  abgelehnt: 'admin-badge-rejected',
  absage: 'admin-badge-rejected',
  archiviert: 'admin-badge-closed',
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  ausstehend: 'Ausstehend',
  offen: 'Offen',
  gesendet: 'Gesendet',
  bezahlt: 'Bezahlt',
  archiviert: 'Archiviert',
  inaktiv: 'Inaktiv',
}

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  ausstehend: 'admin-badge-open',
  offen: 'admin-badge-open',
  gesendet: 'admin-badge-sent',
  bezahlt: 'admin-badge-paid',
  archiviert: 'admin-badge-closed',
  inaktiv: 'admin-badge-draft',
}

import type { AdminScreen } from './useAdminNav'

/**
 * Anzeigenamen der Admin-Screens. Eigenes Modul statt Konstante in AdminApp:
 * der Support-Eingang der Betreiber-Seite übersetzt damit die `route` einer
 * Meldung in einen lesbaren Namen und soll dafür nicht die ganze Admin-App
 * importieren.
 */
export const SCREEN_TITLES: Record<AdminScreen, string> = {
  'dashboard': 'Dashboard',
  'tasks': 'Aufgaben',
  'my-time': 'Meine Zeiterfassung',
  'staff': 'Mitarbeiter',
  'bulk-clockin': 'Massen-Einstempeln',
  'absences': 'Absenzen',
  'corrections': 'Zeitkorrekturen',
  'hr-reports': 'HR-Berichte',
  'vacation': 'Ferien',
  'projects': 'Projekte',
  'project-drafts': 'Projekt-Entwürfe',
  'project-schedule': 'Einsatzplanung',
  'customers': 'Kundenstamm',
  'quotes': 'Offerten',
  'invoices': 'Rechnungen',
  'aftersales': 'After Sales',
  'payment-reconciliation': 'Zahlungsabgleich',
  'suppliers': 'Lieferanten',
  'supplier-wiki': 'Lieferanten-Wiki',
  'roadmap': 'Wünsche & Roadmap',
  'staff-roles': 'Personal',
  'materials': 'Material / Lager',
  'pricing-rules': 'Preisregeln',
  'quote-templates': 'Vorlagen',
  'users': 'Benutzerverwaltung',
  'kpis': 'Kennzahlen',
  'document-backup': 'Datensicherung',
  'settings': 'Einstellungen',
}

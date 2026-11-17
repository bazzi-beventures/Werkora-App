import { Suspense, lazy, useState } from 'react'
import { AdminDashboard } from '../../api/admin'
import { AdminScreen } from '../useAdminNav'
import { OverdueProjectsModal } from './OverdueProjectsModal'
import { OfferReminderModal } from './OfferReminderModal'
import { OpenQuotesPanel, type QuotePanelArt } from './OpenQuotesPanel'
import { MahnungModal } from './MahnungModal'
import { DraftInvoicesPanel } from './DraftInvoicesPanel'
import { ApprovalModal } from './ApprovalModal'

// Nachgeladen: nur mit Modul `reminders` gebraucht, und der Haupt-Chunk der
// Mandanten-App steht an der 2-MiB-Grenze des Precache (siehe AdminApp).
const MyReminders = lazy(() => import('../reminders/MyReminders').then(m => ({ default: m.MyReminders })))

interface Props {
  dashboard: AdminDashboard | null
  onNav: (screen: AdminScreen, detailId?: string) => void
  onBadgeChange?: () => void
  /** Modul `reminders` für dieses Konto an → «Meine Erinnerungen» zuoberst. */
  showReminders?: boolean
  /** Der Überfällig-Dialog hat frisch gezählt — die Kachel übernimmt die Zahl. */
  onOverdueCount?: (n: number) => void
}

interface KpiCardProps {
  label: string
  value: number | null
  colorClass: 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'yellow'
  onClick: () => void
  icon: React.ReactNode
  badge?: boolean
}

function KpiCard({ label, value, colorClass, onClick, icon, badge }: KpiCardProps) {
  return (
    <div className="admin-kpi-card" onClick={onClick}>
      {badge && value ? <span className="admin-kpi-badge">{value}</span> : null}
      <div className={`admin-kpi-icon ${colorClass}`}>{icon}</div>
      <div className="admin-kpi-value">{value ?? '—'}</div>
      <div className="admin-kpi-label">{label}</div>
    </div>
  )
}

function IconClock() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
}
function IconCash() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2V6h10a2 2 0 0 0-2-2H4zm2 6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H6zm7 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" clipRule="evenodd"/></svg>
}
function IconUsers() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z"/></svg>
}
function IconReceipt() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 0 0-1 1v14l3-2 2 2 2-2 2 2 2-2 3 2V3a1 1 0 0 0-1-1H4zm2 5a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}
function IconCalendar() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm0 5a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H6z" clipRule="evenodd"/></svg>
}
function IconBell() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zm0 16a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z"/></svg>
}
function IconExclamation() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-8a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V6a1 1 0 0 0-1-1z" clipRule="evenodd"/></svg>
}
function IconCalendarAlert() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm5 7a1 1 0 1 0-2 0v3a1 1 0 1 0 2 0V9zm-1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" clipRule="evenodd"/></svg>
}
function IconApproval() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0 0 10 1.944 11.954 11.954 0 0 0 17.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd"/></svg>
}
function IconDocument() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}
function IconCheckCircle() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd"/></svg>
}
function IconXCircle() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.707 7.293a1 1 0 0 0-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 1 0 1.414 1.414L10 11.414l1.293 1.293a1 1 0 0 0 1.414-1.414L11.414 10l1.293-1.293a1 1 0 0 0-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/></svg>
}

function IconClipboardCount() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 0 0-.894.553L7.382 4H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.382l-.724-1.447A1 1 0 0 0 11 2H9zm-2 8a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H8z"/></svg>
}
function IconBoxLow() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a1 1 0 0 0-1 1v2h14V4a1 1 0 0 0-1-1H4zm13 5H3v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zm-9 3h4a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2z"/></svg>
}

// ─── Dashboard ───────────────────────────────────────────────

export default function DashboardScreen({ dashboard, onNav, onBadgeChange, showReminders, onOverdueCount }: Props) {
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [quotePanel, setQuotePanel] = useState<QuotePanelArt | null>(null)
  const [showMahnungModal, setShowMahnungModal] = useState(false)
  const [showDraftInvoices, setShowDraftInvoices] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [showOverdueProjectsModal, setShowOverdueProjectsModal] = useState(false)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Dashboard</div>
          <div className="admin-page-subtitle">Übersicht offener Aufgaben</div>
        </div>
      </div>

      {showReminders && (
        <Suspense fallback={null}>
          <MyReminders
            onOpenProject={id => onNav('projects', id)}
            onOpenCustomer={id => onNav('customers', id)}
          />
        </Suspense>
      )}

      <section className="admin-kpi-section">
        <h3 className="admin-kpi-group-title">Personal & Zeit</h3>
        <div className="admin-kpi-grid">
          <KpiCard
            label="Zeitkorrekturen offen"
            value={dashboard?.pending_corrections ?? null}
            colorClass="orange"
            onClick={() => onNav('corrections')}
            icon={<IconClock />}
          />
          <KpiCard
            label="Eingestempelt"
            value={dashboard?.open_sessions ?? null}
            colorClass="green"
            onClick={() => onNav('hr-reports')}
            icon={<IconUsers />}
          />
          <KpiCard
            label="Absenzen pendent"
            value={dashboard?.pending_absences ?? null}
            colorClass="blue"
            onClick={() => onNav('absences')}
            icon={<IconCalendar />}
          />
        </div>
      </section>

      <section className="admin-kpi-section">
        <h3 className="admin-kpi-group-title">Finanzen & Einkauf</h3>
        <div className="admin-kpi-grid">
          <KpiCard
            label="Rechnungen offen"
            value={dashboard?.open_invoices ?? null}
            colorClass="red"
            onClick={() => onNav('invoices', 'gesendet')}
            icon={<IconCash />}
          />
          {/* Pendenz, nicht Liste: erstellt, aber nie versendet — sollte am Ende
              des Tages auf 0 stehen. «Rechnungen offen» daneben führt bewusst
              weiter in die gefilterte Rechnungsliste. */}
          <KpiCard
            label="Rechnungsentwürfe"
            value={dashboard ? dashboard.draft_invoices ?? 0 : null}
            colorClass="orange"
            onClick={() => setShowDraftInvoices(true)}
            icon={<IconDocument />}
            badge
          />
          <KpiCard
            label="Rechnungen überfällig"
            value={dashboard?.invoices_pending_action ?? null}
            colorClass="red"
            onClick={() => setShowMahnungModal(true)}
            icon={<IconExclamation />}
            badge
          />
          <KpiCard
            label="Bestellfreigaben für mich"
            value={dashboard?.pending_approvals ?? null}
            colorClass="blue"
            onClick={() => setShowApprovalModal(true)}
            icon={<IconApproval />}
            badge
          />
        </div>
      </section>

      {/* Lager: nur, wenn der Betrieb eines führt. Der Server schickt `null`
          statt 0, wenn Modul oder Flag fehlen — eine Kachel «Inventur: 0 zu
          zählen» wäre sonst eine Zahl ohne Bedeutung, und der Klick führte in
          einen Reiter, den es gar nicht gibt. */}
      {dashboard?.inventory_count_open_items != null && (
        <section className="admin-kpi-section">
          <h3 className="admin-kpi-group-title">Lager</h3>
          <div className="admin-kpi-grid">
            <KpiCard
              label="Inventur: zu zählen"
              value={dashboard.inventory_count_open_items}
              colorClass="orange"
              onClick={() => onNav(
                'materials',
                dashboard.inventory_count_open_id
                  ? `inventur:${dashboard.inventory_count_open_id}`
                  : 'inventur',
              )}
              icon={<IconClipboardCount />}
              badge
            />
            <KpiCard
              label="Unter Meldebestand"
              value={dashboard.inventory_below_min ?? null}
              colorClass="red"
              onClick={() => onNav('materials', 'lager')}
              icon={<IconBoxLow />}
              badge
            />
          </div>
        </section>
      )}

      <section className="admin-kpi-section">
        <h3 className="admin-kpi-group-title">Vertrieb & Projekte</h3>
        <div className="admin-kpi-grid">
          <KpiCard
            label="Offerten in Bearbeitung"
            value={dashboard?.draft_quotes ?? null}
            colorClass="purple"
            onClick={() => setQuotePanel('offen')}
            icon={<IconReceipt />}
          />
          <KpiCard
            label="Angenommene Offerten (14 Tage)"
            value={dashboard?.recently_accepted_quotes ?? null}
            colorClass="green"
            onClick={() => setQuotePanel('akzeptiert')}
            icon={<IconCheckCircle />}
            badge
          />
          <KpiCard
            label="Abgelehnte Offerten (14 Tage)"
            value={dashboard?.recently_rejected_quotes ?? null}
            colorClass="red"
            onClick={() => setQuotePanel('abgelehnt')}
            icon={<IconXCircle />}
            badge
          />
          <KpiCard
            label="Offerten-Erinnerungen"
            value={dashboard?.quotes_pending_reminder ?? null}
            colorClass="yellow"
            onClick={() => setShowReminderModal(true)}
            icon={<IconBell />}
            badge
          />
          <KpiCard
            label="Projekte überfällig"
            value={dashboard?.projects_overdue ?? null}
            colorClass="red"
            onClick={() => setShowOverdueProjectsModal(true)}
            icon={<IconCalendarAlert />}
            badge
          />
          <KpiCard
            label="Projekt-Entwürfe"
            value={dashboard?.pending_drafts ?? null}
            colorClass="orange"
            onClick={() => onNav('project-drafts')}
            icon={<IconDocument />}
            badge
          />
        </div>
      </section>

      {dashboard === null && (
        <div className="admin-loading">
          <div className="admin-spinner" />
          Lade Dashboard…
        </div>
      )}

      {showReminderModal && (
        <OfferReminderModal
          onClose={() => setShowReminderModal(false)}
          onSent={() => onBadgeChange?.()}
          onOpenProject={id => { setShowReminderModal(false); onNav('projects', id) }}
        />
      )}

      {quotePanel && (
        <OpenQuotesPanel
          key={quotePanel}
          art={quotePanel}
          onClose={() => setQuotePanel(null)}
          onChanged={() => onBadgeChange?.()}
          onOpenProject={id => { setQuotePanel(null); onNav('projects', id) }}
        />
      )}

      {showDraftInvoices && (
        <DraftInvoicesPanel
          onClose={() => setShowDraftInvoices(false)}
          onChanged={() => onBadgeChange?.()}
          onOpenProject={id => { setShowDraftInvoices(false); onNav('projects', id) }}
        />
      )}

      {showMahnungModal && (
        <MahnungModal
          onClose={() => setShowMahnungModal(false)}
          onSent={() => onBadgeChange?.()}
          onOpenProject={id => { setShowMahnungModal(false); onNav('projects', id) }}
        />
      )}

      {showApprovalModal && (
        <ApprovalModal
          onClose={() => setShowApprovalModal(false)}
          onSent={() => onBadgeChange?.()}
          onOpenProject={id => { setShowApprovalModal(false); onNav('projects', id) }}
        />
      )}

      {showOverdueProjectsModal && (
        <OverdueProjectsModal
          onClose={() => setShowOverdueProjectsModal(false)}
          onChanged={() => onBadgeChange?.()}
          onCount={onOverdueCount}
          onOpenProject={id => { setShowOverdueProjectsModal(false); onNav('projects', id) }}
        />
      )}
    </div>
  )
}

import { AdminScreen } from './useAdminNav'
import { logout } from '../api/auth'
import { ModuleName } from '../api/modules'
import {
  IconDashboard, IconUsers, IconCalendar, IconClock, IconDocument, IconBox,
  IconFolder, IconReceipt, IconCash, IconTag, IconKey, IconChart,
  IconLogout, IconAddressBook, IconSettings, IconAftersales, IconTasks,
} from './AdminIcons'

interface Props {
  screen: AdminScreen
  onNav: (screen: AdminScreen) => void
  onLoggedOut: () => void
  onSwitchToUser: () => void
  displayName: string
  role: string
  tenantName: string
  enabledModules: string[]
  showTaskBoard?: boolean
  badges?: {
    corrections?: number
    absences?: number
    invoices?: number
    drafts?: number
    tasks?: number
  }
}

interface NavItemProps {
  label: string
  target: AdminScreen
  current: AdminScreen
  onNav: (s: AdminScreen) => void
  badge?: number
  icon: React.ReactNode
}

function NavItem({ label, target, current, onNav, badge, icon }: NavItemProps) {
  return (
    <button
      className={`admin-nav-item${current === target ? ' active' : ''}`}
      onClick={() => onNav(target)}
      title={label}
    >
      {icon}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="admin-nav-badge danger">{badge}</span>
      )}
    </button>
  )
}

export default function AdminSidebar({ screen, onNav, onLoggedOut, onSwitchToUser, displayName, role, tenantName, enabledModules, showTaskBoard, badges }: Props) {
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const isManagement = role === 'management' || role === 'superadmin'
  const isSuperadmin = role === 'superadmin'
  const has = (m: ModuleName) => enabledModules.includes(m)

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    onLoggedOut()
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-header">
        {/* title: Fällt der Name auch über zwei Zeilen nicht ganz hinein, bleibt
            er wenigstens im Tooltip lesbar. */}
        <span className="admin-sidebar-tenant" title={tenantName || 'Admin'}>{tenantName || 'Admin'}</span>
      </div>

      <nav className="admin-nav">
        <NavItem label="Dashboard" target="dashboard" current={screen} onNav={onNav} icon={<IconDashboard />} />
        {showTaskBoard && (
          <NavItem label="Aufgaben" target="tasks" current={screen} onNav={onNav} icon={<IconTasks />} badge={badges?.tasks} />
        )}
        {has('timekeeping') && (
          <NavItem label="Meine Zeit" target="my-time" current={screen} onNav={onNav} icon={<IconClock />} />
        )}

        <div className="admin-nav-group-label">Personal</div>
        <NavItem label="Mitarbeiter" target="staff" current={screen} onNav={onNav} icon={<IconUsers />} />
        {isManagement && has('timekeeping') && (
          <NavItem label="Massen-Einstempeln" target="bulk-clockin" current={screen} onNav={onNav} icon={<IconClock />} />
        )}
        {has('hr') && (
          <NavItem label="Absenzen" target="absences" current={screen} onNav={onNav} icon={<IconCalendar />} badge={badges?.absences} />
        )}
        {has('timekeeping') && (
          <NavItem label="Zeitkorrekturen" target="corrections" current={screen} onNav={onNav} icon={<IconClock />} badge={badges?.corrections} />
        )}
        {has('hr') && (
          <>
            <NavItem label="HR-Berichte" target="hr-reports" current={screen} onNav={onNav} icon={<IconDocument />} />
            <NavItem label="Ferien" target="vacation" current={screen} onNav={onNav} icon={<IconCalendar />} />
          </>
        )}

        <div className="admin-nav-group-label">Operativ</div>
        <NavItem label="Projekte" target="projects" current={screen} onNav={onNav} icon={<IconFolder />} />
        <NavItem label="Projekt-Entwürfe" target="project-drafts" current={screen} onNav={onNav} icon={<IconDocument />} badge={badges?.drafts} />
        {has('scheduling') && (
          <NavItem label="Einsatzplanung" target="project-schedule" current={screen} onNav={onNav} icon={<IconCalendar />} />
        )}
        <NavItem label="Kundenstamm" target="customers" current={screen} onNav={onNav} icon={<IconAddressBook />} />
        {has('quotes') && (
          <NavItem label="Offerten" target="quotes" current={screen} onNav={onNav} icon={<IconReceipt />} />
        )}
        {has('invoicing') && (
          <NavItem label="Rechnungen" target="invoices" current={screen} onNav={onNav} icon={<IconCash />} />
        )}
        {has('payment_matching') && (
          <NavItem label="Zahlungsabgleich" target="payment-reconciliation" current={screen} onNav={onNav} icon={<IconCash />} />
        )}
        {has('aftersales') && (
          <NavItem label="After Sales" target="aftersales" current={screen} onNav={onNav} icon={<IconAftersales />} />
        )}

        <div className="admin-nav-group-label">Stammdaten</div>
        <NavItem label="Lieferanten" target="suppliers" current={screen} onNav={onNav} icon={<IconTag />} />
        <NavItem label="Material / Lager" target="materials" current={screen} onNav={onNav} icon={<IconBox />} />
        {isManagement && (
          <NavItem label="Personal" target="staff-roles" current={screen} onNav={onNav} icon={<IconUsers />} />
        )}
        {isManagement && (
          <NavItem label="Preisregeln" target="pricing-rules" current={screen} onNav={onNav} icon={<IconTag />} />
        )}
        {isManagement && has('quotes') && (
          <NavItem label="Vorlagen" target="quote-templates" current={screen} onNav={onNav} icon={<IconReceipt />} />
        )}

        {isManagement && has('kpis') && (
          <>
            <div className="admin-nav-group-label">Analyse</div>
            <NavItem label="Kennzahlen" target="kpis" current={screen} onNav={onNav} icon={<IconChart />} />
          </>
        )}

        {/* Benutzerverwaltung auch für Admins — sie legen Mitarbeiter an. Datensicherung
            und Admin-Tools bleiben Management bzw. Superadmin vorbehalten. */}
        <div className="admin-nav-group-label">System</div>
        <NavItem label="Benutzerverwaltung" target="users" current={screen} onNav={onNav} icon={<IconKey />} />
        {isManagement && has('document_backup') && (
          <NavItem label="Datensicherung" target="document-backup" current={screen} onNav={onNav} icon={<IconDocument />} />
        )}
        {isSuperadmin && (
          <NavItem label="Admin-Tools" target="admin-tools" current={screen} onNav={onNav} icon={<IconSettings />} />
        )}
      </nav>

      <div className="admin-sidebar-footer">
        <button className="admin-switch-btn" onClick={onSwitchToUser} title="Zur Mitarbeiter-App wechseln">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-7 9a7 7 0 1 1 14 0H3z" />
          </svg>
          <span>Mitarbeiter-App</span>
        </button>
        <div className="admin-user-row">
          <div className="admin-avatar">{initials}</div>
          <div className="admin-user-info">
            <div className="admin-user-name">{displayName}</div>
            <div className="admin-user-role">{role}</div>
          </div>
          <button className="admin-logout-btn" onClick={handleLogout} title="Abmelden">
            <IconLogout />
          </button>
        </div>
        <div className="admin-powered-by">
          <span className="powered-by-label">powered by</span>
          <span className="powered-by-logo" role="img" aria-label="Werkora" />
        </div>
      </div>
    </aside>
  )
}

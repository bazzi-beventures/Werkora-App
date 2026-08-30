import { Fragment, useEffect, useState, type JSX } from 'react'
import { UserInfo } from '../api/auth'
import { getAdminDashboard, AdminDashboard } from '../api/admin'
import AdminSidebar from './AdminSidebar'
import MobileNav from './MobileNav'
import RequireModule from './RequireModule'
import { useAdminNav, AdminScreen } from './useAdminNav'
import { useScreenBack } from '../shared/backButton'
import { useIsMobile } from './useIsMobile'
import { dirtyGuard } from './unsavedChanges'
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog'
import DashboardScreen from './dashboard/DashboardScreen'
import TaskBoardScreen from './tasks/TaskBoardScreen'
import StaffScreen from './personal/StaffScreen'
import BulkClockInScreen from './personal/BulkClockInScreen'
import MyTimeScreen from './personal/MyTimeScreen'
import AbsencesScreen from './personal/AbsencesScreen'
import CorrectionsScreen from './personal/CorrectionsScreen'
import HrReportsScreen from './personal/HrReportsScreen'
import VacationOverviewScreen from './personal/VacationOverviewScreen'
import ProjectsScreen from './operative/ProjectsScreen'
import ProjectDraftsScreen from './operative/ProjectDraftsScreen'
import ProjectScheduleScreen from './operative/ProjectScheduleScreen'
import CustomersScreen from './operative/CustomersScreen'
import MaterialsScreen from './operative/MaterialsScreen'
import QuotesScreen from './operative/QuotesScreen'
import InvoicesScreen from './operative/InvoicesScreen'
import AftersalesScreen from './operative/AftersalesScreen'
import PaymentReconciliationScreen from './operative/PaymentReconciliationScreen'
import PricingRulesScreen from './operative/PricingRulesScreen'
import QuoteTemplatesScreen from './operative/QuoteTemplatesScreen'
import SuppliersScreen from './masterdata/SuppliersScreen'
import StaffRolesScreen from './masterdata/StaffRolesScreen'
import UsersScreen from './system/UsersScreen'
import DocumentBackupScreen from './system/DocumentBackupScreen'
import AdminToolsScreen from './system/AdminToolsScreen'
import KpiScreen from './kpis/KpiScreen'
import HelpBubble from '../shared/HelpBubble'
import { trackNav } from '../shared/breadcrumbs'
import { takeDeepLink } from '../shared/deepLink'
import type { ProjectTab } from './operative/projectDetail/ProjectTabBar'
import { hasModule, isFeatureEnabled } from '../api/modules'
import { Theme, loadTheme, applyTheme, toggleTheme as flipTheme } from '../theme'
import './tokens.css'
import './admin.css'
import './mobile.css'

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{title}</div>
          <div className="admin-page-subtitle">Wird in Phase 5 implementiert.</div>
        </div>
      </div>
      <div className="admin-loading" style={{ height: 300, flexDirection: 'column', gap: 16 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.3 }}>
          <path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>
        </svg>
        <span>Kommt bald</span>
      </div>
    </div>
  )
}

interface Props {
  user: UserInfo
  logoUrl: string
  tenantName: string
  canton: string
  onLoggedOut: () => void
  onSwitchToUser: () => void
}

const SCREEN_TITLES: Record<AdminScreen, string> = {
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
  'staff-roles': 'Personal',
  'materials': 'Material / Lager',
  'pricing-rules': 'Preisregeln',
  'quote-templates': 'Vorlagen',
  'users': 'Benutzerverwaltung',
  'kpis': 'Kennzahlen',
  'document-backup': 'Datensicherung',
  'admin-tools': 'Admin-Tools',
}

export default function AdminApp({ user, logoUrl, tenantName, canton, onLoggedOut, onSwitchToUser }: Props) {
  const { screen, detailId, resetTick, nav, clearDetail, previous } = useAdminNav()
  const isMobile = useIsMobile()
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [logoError, setLogoError] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  // Screen-Wechsel, der noch an der „ungespeicherte Änderungen"-Abfrage hängt.
  const [pendingNav, setPendingNav] = useState<{ screen: AdminScreen; detailId?: string } | null>(null)
  const [savingPendingNav, setSavingPendingNav] = useState(false)
  // Reiter aus einem Deep-Link (Button in einer Info-Mail). Nur gesetzt, solange
  // der Sprung noch nicht verbraucht ist — er gilt für genau eine Projektmaske.
  const [deepLinkTab, setDeepLinkTab] = useState<ProjectTab | null>(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Der Sprung aus der Mail. Er wartet seit dem App-Start in shared/deepLink.ts
  // und wird hier abgeholt, weil erst jetzt jemand da ist, der ihn ausführen
  // kann. Bewusst ohne `guardedNav`: beim Mount der Admin-App gibt es noch
  // keine offene Maske mit ungespeicherten Änderungen.
  //
  // Leere Deps: der Sprung ist ein Startereignis, kein Zustand. `nav` und
  // `takeDeepLink` sind absichtlich nicht in der Liste — ein zweiter Lauf
  // fände ohnehin nichts mehr vor, würde aber eine begonnene Navigation
  // überschreiben.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const link = takeDeepLink()
    if (!link) return
    setDeepLinkTab(link.tab)
    nav('projects', link.projectId)
  }, [])

  const toggleTheme = () => setTheme(flipTheme)

  // Jede Navigation läuft hierüber: hat die offene Detailmaske ungespeicherte
  // Änderungen, wird erst gefragt (Speichern / Verwerfen / Abbrechen).
  function guardedNav(nextScreen: AdminScreen, nextDetailId?: string) {
    if (dirtyGuard()) {
      setPendingNav({ screen: nextScreen, detailId: nextDetailId })
      return
    }
    nav(nextScreen, nextDetailId)
  }

  // Hardware-/Browser-Zurück im Admin-Bereich. Der Bereich navigiert über
  // `useAdminNav` und hat damit einen eigenen Verlauf — App.tsx kann ihn nicht
  // abtragen, also meldet sich AdminApp hier selbst an.
  //
  // Der Weg führt bewusst über `guardedNav` und nicht über `nav`: sonst wäre der
  // Zurück-Knopf der eine Ausgang, der die «ungespeicherte Änderungen»-Abfrage
  // umgeht — ausgerechnet der, den man am leichtesten versehentlich trifft.
  //
  // `false` an der Wurzel (Dashboard, ohne Verlauf): dann übernimmt App.tsx und
  // führt zurück in die Mitarbeiter-App bzw. verschluckt den Druck.
  useScreenBack(true, () => {
    if (!previous) return false
    guardedNav(previous.screen, previous.detailId ?? undefined)
    return true
  })

  function commitPendingNav() {
    const target = pendingNav
    setPendingNav(null)
    if (target) nav(target.screen, target.detailId)
  }

  async function savePendingNav() {
    const guard = dirtyGuard()
    if (!guard) { commitPendingNav(); return }
    setSavingPendingNav(true)
    try {
      const ok = await guard.save()
      // Fehlgeschlagen: Abfrage schliessen, damit die Fehlermeldung der Maske
      // sichtbar wird — der Anwender bleibt auf dem Screen.
      if (!ok) { setPendingNav(null); return }
      commitPendingNav()
    } finally {
      setSavingPendingNav(false)
    }
  }

  async function loadDashboard() {
    try { setDashboard(await getAdminDashboard()) } catch { /* ignore */ }
  }

  useEffect(() => { loadDashboard() }, [])
  useEffect(() => { if (screen === 'dashboard') loadDashboard() }, [screen])

  const badges = {
    corrections: dashboard?.pending_corrections ?? 0,
    absences: dashboard?.pending_absences ?? 0,
    invoices: dashboard?.open_invoices ?? 0,
    drafts: dashboard?.pending_drafts ?? 0,
    tasks: dashboard?.my_open_tasks ?? 0,
  }

  const isManagement = user.role === 'management' || user.role === 'superadmin'

  const enabledModules = user.enabled_modules ?? []
  const guard = (mod: Parameters<typeof RequireModule>[0]['module'], el: JSX.Element) => (
    <RequireModule module={mod} enabledModules={enabledModules}>{el}</RequireModule>
  )

  const isSuperadmin = user.role === 'superadmin'
  // Diagnose-Breadcrumb je Screenwechsel (Spec docs/specs/support-ticket.md §5.3).
  useEffect(() => { trackNav(screen) }, [screen])

  // Modul 'help_bot' = Master-Schalter; Feature-Flag 'help_bot_admin' = unabhängiger
  // Schalter für den Admin-Bereich (Default an). Support analog mit
  // 'support'/'support_admin', unabhängig vom Hilfe-Bot (Spec §6.1).
  const showHelp = hasModule(user, 'help_bot') && isFeatureEnabled(user, 'help_bot_admin')
  const showSupport = hasModule(user, 'support') && isFeatureEnabled(user, 'support_admin')
  const showHelpBubble = showHelp || showSupport
  // Modul 'task_board' schaltet das Board an/ab; das gleichnamige Feature-Flag
  // hält nur die Schwellwert-Parameter (feature_registry.py).
  const showTaskBoard = hasModule(user, 'task_board')

  function renderScreen() {
    // 'users' fehlt hier bewusst: die Benutzerverwaltung steht auch dem Admin offen
    // (Mitarbeiter anlegen, Passwort/PIN setzen). Was er dort darf, regelt die
    // Rollen-Matrix im Backend (agents/routers/admin_users.py) und UsersScreen.
    if ((screen === 'pricing-rules' || screen === 'quote-templates' || screen === 'kpis' || screen === 'bulk-clockin' || screen === 'document-backup') && !isManagement) {
      return <ComingSoon title="Kein Zugriff" />
    }
    if (screen === 'admin-tools' && !isSuperadmin) {
      return <ComingSoon title="Kein Zugriff" />
    }
    switch (screen) {
      case 'dashboard':    return <DashboardScreen dashboard={dashboard} onNav={guardedNav} onBadgeChange={loadDashboard} />
      case 'tasks':        return showTaskBoard
        ? <TaskBoardScreen onNav={guardedNav} onBadgeChange={loadDashboard} />
        : <ComingSoon title="Kein Zugriff" />
      case 'my-time':      return guard('timekeeping', <MyTimeScreen user={user} onLoggedOut={onLoggedOut} />)
      case 'staff':        return <StaffScreen actingRole={user.role} />
      case 'bulk-clockin': return guard('timekeeping', <BulkClockInScreen />)
      case 'absences':     return guard('hr', <AbsencesScreen onBadgeChange={loadDashboard} canton={canton} />)
      case 'corrections':  return guard('timekeeping', <CorrectionsScreen onBadgeChange={loadDashboard} />)
      case 'hr-reports':   return guard('hr', <HrReportsScreen />)
      case 'vacation':     return guard('hr', <VacationOverviewScreen />)
      // detailId ist entweder 'new' (Neu-Maske) oder eine Projekt-id (Direktsprung
      // aus der Einsatzplanung).
      case 'projects':     return (
        <ProjectsScreen
          openNew={detailId === 'new'}
          onConsumedNew={clearDetail}
          openProjectId={detailId && detailId !== 'new' ? detailId : undefined}
          openProjectTab={deepLinkTab ?? undefined}
          onConsumedProjectId={() => { clearDetail(); setDeepLinkTab(null) }}
        />
      )
      case 'project-drafts': return <ProjectDraftsScreen onBadgeChange={loadDashboard} />
      case 'project-schedule': return guard('scheduling', <ProjectScheduleScreen canton={canton} onNav={guardedNav} />)
      case 'customers':    return <CustomersScreen />
      case 'quotes':       return guard('quotes', <QuotesScreen initialStatus={detailId} onConsumed={clearDetail} />)
      case 'invoices':     return guard('invoicing', <InvoicesScreen onBadgeChange={loadDashboard} onNav={guardedNav} />)
      case 'aftersales':   return guard('aftersales', <AftersalesScreen />)
      case 'payment-reconciliation': return guard('payment_matching', <PaymentReconciliationScreen />)
      case 'suppliers':    return <SuppliersScreen />
      case 'staff-roles':  return <StaffRolesScreen />
      case 'materials':    return <MaterialsScreen user={user} />
      case 'pricing-rules':return <PricingRulesScreen />
      case 'quote-templates': return <QuoteTemplatesScreen />
      case 'users':        return <UsersScreen actingRole={user.role} />
      case 'kpis':         return guard('kpis', <KpiScreen />)
      case 'document-backup': return guard('document_backup', <DocumentBackupScreen />)
      case 'admin-tools':  return <AdminToolsScreen userRole={user.role} enabledModules={enabledModules} />
      default:             return <ComingSoon title={SCREEN_TITLES[screen]} />
    }
  }

  const themeToggle = (
    <button
      type="button"
      className="admin-btn-icon admin-theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
      aria-label="Theme wechseln"
    >
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
        </svg>
      )}
    </button>
  )

  // Mobile und Desktop teilen bewusst EINEN Baum: <main> und der Screen-Inhalt
  // behalten beim Breakpoint-Wechsel (useIsMobile) ihre React-Identität, sonst
  // verliert der Admin beim Fenster-Verschieben/-Verkleinern seinen kompletten
  // Screen-State (offenes Projekt, Offerten-Editor, Formulareingaben).
  return (
    <div className={isMobile ? 'admin-shell-mobile' : 'admin-shell'}>
      {!isMobile && (
        <AdminSidebar
          screen={screen}
          onNav={guardedNav}
          onLoggedOut={onLoggedOut}
          onSwitchToUser={onSwitchToUser}
          displayName={user.display_name}
          role={user.role}
          tenantName={tenantName}
          enabledModules={user.enabled_modules ?? []}
          showTaskBoard={showTaskBoard}
          badges={badges}
        />
      )}
      <main className={isMobile ? 'admin-content admin-content-mobile' : 'admin-content'}>
        <div className="admin-content-inner">
          <div className={isMobile ? 'admin-content-topbar admin-content-topbar--mobile' : 'admin-content-topbar'}>
            {isMobile && <div className="admin-mobile-topbar-title">{SCREEN_TITLES[screen]}</div>}
            {themeToggle}
            {logoUrl && !logoError && (
              <img
                className="admin-content-logo"
                src={logoUrl}
                alt={tenantName}
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <Fragment key={`${screen}:${resetTick}`}>{renderScreen()}</Fragment>
        </div>
      </main>
      {isMobile && (
        <MobileNav
          screen={screen}
          onNav={guardedNav}
          onLoggedOut={onLoggedOut}
          onSwitchToUser={onSwitchToUser}
          displayName={user.display_name}
          role={user.role}
          enabledModules={user.enabled_modules ?? []}
          showTaskBoard={showTaskBoard}
          badges={badges}
        />
      )}
      {showHelpBubble && (
        <HelpBubble
          showHelp={showHelp}
          showSupport={showSupport}
          route={screen}
          appContext="admin"
        />
      )}
      {pendingNav && (
        <UnsavedChangesDialog
          saving={savingPendingNav}
          message="Auf dieser Seite gibt es Änderungen, die noch nicht gespeichert sind."
          // Manche Masken lassen sich von hier aus nicht sinnvoll speichern (offene
          // Rapport-Maske über dem Projekt-Detail) — dann bleiben Verwerfen/Zurück.
          allowSave={dirtyGuard()?.canSave?.() !== false}
          onSave={savePendingNav}
          onDiscard={commitPendingNav}
          onCancel={() => setPendingNav(null)}
        />
      )}
    </div>
  )
}

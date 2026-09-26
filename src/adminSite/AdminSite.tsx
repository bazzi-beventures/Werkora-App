/**
 * Wurzel der Betreiber-Seite `admin.werkora.ch`.
 *
 * Spec: docs/specs/admin-werkora-ch.md §4.1, §6.2, §6.3.
 *
 * Drei Zustände, mehr gibt es nicht: lädt / nicht angemeldet / angemeldet.
 * Kein Mandanten-Branding, kein Offline-Store, keine Push-Registrierung, kein
 * Migrationsbanner — was die Mandanten-App an Apparat mitbringt, braucht ein
 * Betreiber am Schreibtisch nicht (§6.1).
 */
import { useCallback, useEffect, useState } from 'react'
import { getMe, logout, type UserInfo } from '../api/auth'
import { setAdminPassword } from '../api/admin/staff'
import { PasswordDialog } from './PasswordDialog'
import { useToast, ToastHost } from '../admin/components/useToast'
import LoginScreen from './LoginScreen'
import AdminSiteShell, { SCREEN_TITEL } from './AdminSiteShell'
import ScreenBoundary from './ScreenBoundary'
import { useTenantScope } from './useTenantScope'
import { useAdminSiteNav, istMandantScreen, hatRechnungsbereich, type MandantScreen } from './useAdminSiteNav'

import ServiceStatusScreen from './screens/ServiceStatusScreen'
import PushTestScreen from './screens/PushTestScreen'
import ErrorLogsScreen from './screens/ErrorLogsScreen'
import SupportTicketsScreen from './screens/SupportTicketsScreen'
import ConfigurationScreen from './screens/ConfigurationScreen'
import AccountsScreen from './screens/AccountsScreen'
import LlmCostsScreen from './screens/LlmCostsScreen'
import UsageScreen from './screens/UsageScreen'
import MaterialCleanupScreen from './screens/MaterialCleanupScreen'
import WerkoraBonusScreen from './screens/WerkoraBonusScreen'
import TenantsOverviewScreen from './screens/TenantsOverviewScreen'
import NewsletterScreen from './screens/NewsletterScreen'
import FeatureRequestsScreen from './screens/FeatureRequestsScreen'
import { fetchNewRequestCount } from '../api/featureRequests'

// Die drei Rechnungs-Screens werden NICHT nach adminSite/ verschoben (§8.3):
// sie bleiben Mandanten-Screens und werden von beiden Einstiegen importiert.
// Sie arbeiten ueber die normalen Mandanten-Routen mit der eigenen Sitzung —
// der Betreiber-Mandant IST hier der Mandant, es gibt nichts zu skopieren.
import OperatorInvoicesScreen from './screens/OperatorInvoicesScreen'
import PaymentReconciliationScreen from '../admin/operative/PaymentReconciliationScreen'
import CustomersScreen from '../admin/operative/CustomersScreen'

// Die Grundmuster — Tabellen, Karten, Knoepfe, Formularfelder, Modale — stehen
// in admin.css und werden hier gebraucht, weil die Screens von dort umgezogen
// sind und gleich aussehen sollen (so steht es auch im Kopf von adminSite.css).
// VOR adminSite.css, damit der Rahmen der Betreiber-Seite bei gleicher
// Spezifitaet das letzte Wort hat.
//
// tokens.css steht VOR admin.css und ist nicht optional: dort stehen
// --primary, --s-1..7, --font-xs..hero, --shadow-*, --success/--warning/
// --danger samt Soft- und Ink-Stufen sowie --text-strong. index.css kennt
// davon KEINEN — sie liefert nur --bg/--surface/--border/--text/--muted/
// --radius-*. Fehlte tokens.css, blieben die Namen undefiniert, und der
// Browser wirft dann die GANZE Deklaration weg statt nur den Wert: aus
// `padding: var(--s-2) var(--s-4)` wird kein Innenabstand (Knoepfe kleben
// aneinander), aus `background: var(--success)` keine Farbe (die Bloecke des
// Uptime-Verlaufs werden unsichtbar) und aus `background: var(--text-strong)`
// beim aktiven Chip weisse Schrift auf Weiss. Genau so sah die Seite am
// 2026-09-16 aus.
import '../admin/tokens.css'
import '../admin/admin.css'
// mobile.css bringt nicht nur die Mandanten-Shell (die es hier nicht gibt),
// sondern auch den `@media (max-width: 767px)`-Block fuer die GETEILTEN
// Klassen: `.admin-table-wrap` bekommt dort den Querlauf, `.admin-table thead`
// den klebenden Kopf, die Wochenplan-Tabelle wird zur Kartenliste und die
// Schliessen-Flaeche des Modals auf 44px vergroessert. Ohne die Datei hatte die
// Betreiber-Seite am Handy nichts davon.
import '../admin/mobile.css'
import './adminSite.css'

export default function AdminSite() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [pruefend, setPruefend] = useState(true)
  const [passwortDialog, setPasswortDialog] = useState(false)
  const { toast, showToast } = useToast()
  // Erst mit Sitzung laden — sonst bleibt ein 401 von vor dem Login als
  // «Sitzung abgelaufen» im Wähler stehen (siehe useTenantScope).
  const scope = useTenantScope(user !== null)
  const { screen, detail, navigate } = useAdminSiteNav()
  // Neue Feature-Anfragen als Abzeichen in der Leiste (docs/specs/feature-anfragen.md
  // §7, §9.2): der Betreiber bekommt je Anfrage weder Push noch Mail — die Zahl
  // hier ist der Hinweis. Nachgeladen bei jedem Screenwechsel, kein Polling.
  const [neueAnfragen, setNeueAnfragen] = useState(0)

  // Beim Start: gibt es schon eine gültige Sitzung? Das 30-Tage-Cookie ist der
  // Normalfall (E6 — Passkeys kommen erst mit O3), ein Login also die Ausnahme.
  useEffect(() => {
    let abgebrochen = false
    getMe()
      .then((u) => { if (!abgebrochen) setUser(u.role === 'superadmin' ? u : null) })
      .catch(() => { if (!abgebrochen) setUser(null) })
      .finally(() => { if (!abgebrochen) setPruefend(false) })
    return () => { abgebrochen = true }
  }, [])

  useEffect(() => {
    if (!user) return
    let abgebrochen = false
    fetchNewRequestCount()
      .then((r) => { if (!abgebrochen) setNeueAnfragen(r.count) })
      .catch(() => { /* Abzeichen ist Beiwerk — ohne Zahl bleibt die Leiste, wie sie ist */ })
    return () => { abgebrochen = true }
  }, [user, screen])

  const abmelden = useCallback(async () => {
    try { await logout() } finally { setUser(null) }
  }, [])

  if (pruefend) {
    return <div className="admin-loading"><div className="admin-spinner" /></div>
  }

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />
  }

  // Die Screens des Mandanten-Bereichs nehmen `tenantId: string`, nicht
  // `string | null` — seit dem Rückbau (P4) gibt es den Aufruf ohne Mandanten
  // nicht mehr. Damit das eine Typaussage ist und kein Kommentar, stehen sie in
  // einer eigenen Funktion, die den Mandanten als Parameter bekommt: Der
  // Compiler hält jetzt fest, was vorher nur die Reihenfolge im Kopf sicherte.
  function mandantInhalt(tenantId: string, s: MandantScreen) {
    switch (s) {
      case 'konfiguration':  return <ConfigurationScreen tenantId={tenantId} />
      case 'konten':         return <AccountsScreen tenantId={tenantId} />
      case 'llm-kosten':     return <LlmCostsScreen tenantId={tenantId} />
      case 'nutzung':        return <UsageScreen tenantId={tenantId} enabledModules={scope.tenant?.enabled_modules ?? []} />
      case 'material':       return <MaterialCleanupScreen tenantId={tenantId} />
      case 'bonus':          return <WerkoraBonusScreen tenantId={tenantId} />
      default: {
        // Ein neuer Eintrag in MANDANT_SCREENS ohne Fall hier ist ein
        // Compile-Fehler, kein leerer Bildschirm.
        const fehlt: never = s
        return fehlt
      }
    }
  }

  function inhalt() {
    // Der Mandanten-Bereich ist ohne Auswahl leer — mit Hinweis, nicht mit
    // Fehler (§4.1). Ein Screen, der gegen `tenantId === null` losfährt, würfe
    // in `requireTenantId`; das wäre ein Absturz für einen normalen Zustand.
    if (istMandantScreen(screen)) {
      if (!scope.tenantId) {
        return (
          <div className="admin-empty">
            Kein Mandant gewählt. Oben im Kopf einen auswählen — oder in der
            Übersicht auf eine Zeile klicken.
          </div>
        )
      }
      return mandantInhalt(scope.tenantId, screen)
    }

    switch (screen) {
      // ── Plattform: ignoriert den Wähler (Datenraum = alle Mandanten) ──
      case 'uebersicht':
        return (
          <TenantsOverviewScreen
            scope={scope}
            onOpen={(id) => { scope.selectTenant(id); navigate('konfiguration') }}
          />
        )
      case 'service-status': return <ServiceStatusScreen />
      case 'push-test':      return <PushTestScreen />
      case 'newsletter':     return <NewsletterScreen tenants={scope.tenants} />
      // Error-Logs und Support übernehmen den Wähler als VORAUSWAHL ihres
      // bestehenden «Alle Mandanten»-Filters — nicht als Skopierung (§4.1).
      case 'fehler':         return <ErrorLogsScreen initialTenantId={scope.tenantId ?? undefined} />
      case 'support':        return <SupportTicketsScreen initialTicketId={detail ?? undefined} />
      case 'feature-anfragen':
        return (
          <FeatureRequestsScreen
            initialTenantId={scope.tenantId ?? undefined}
            onCountChange={setNeueAnfragen}
          />
        )

      // ── Rechnungen: der EIGENE Mandant des Kontos (§8.3) ──
      // Kein `tenantId`: diese Screens lesen den Mandanten aus der Sitzung.
      case 'rechnungen':      return <OperatorInvoicesScreen />
      case 'zahlungsabgleich': return <PaymentReconciliationScreen />
      case 'kunden':          return <CustomersScreen />

      default:               return null
    }
  }

  return (
    <AdminSiteShell
      screen={screen}
      onNav={navigate}
      scope={scope}
      displayName={user.display_name}
      onLogout={abmelden}
      onChangePassword={() => setPasswortDialog(true)}
      zeigeRechnungen={hatRechnungsbereich(user)}
      badges={{ 'feature-anfragen': neueAnfragen }}
    >
      {/* Die Grenze liegt INNERHALB der Shell: stürzt ein Screen ab, bleiben
          Navigation und Mandanten-Wähler stehen, statt dass die ganze Seite
          weiss wird (siehe Kopf von ScreenBoundary). */}
      <ScreenBoundary resetKey={screen} screenTitel={SCREEN_TITEL[screen]}>
        {inhalt()}
      </ScreenBoundary>

      {/* Eigenes Passwort: `POST /pwa/admin/set-password` verlangt das alte und
          lässt die eigene Sitzung stehen — deshalb `requireCurrent`. Der
          Dialog hängt hier und nicht an einem Screen, damit er von überall
          erreichbar ist, auch ohne gewählten Mandanten. */}
      {passwortDialog && (
        <PasswordDialog
          titel="Eigenes Passwort ändern"
          requireCurrent
          onSave={(neu, aktuell) => setAdminPassword(aktuell, neu)}
          onClose={() => setPasswortDialog(false)}
          onDone={(meldung) => {
            setPasswortDialog(false)
            showToast(meldung)
          }}
        />
      )}
      <ToastHost toast={toast} />
    </AdminSiteShell>
  )
}

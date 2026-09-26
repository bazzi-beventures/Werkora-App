/**
 * Rahmen der Betreiber-Seite: zwei Bereiche, Mandanten-Wähler, Umgebungs-Badge.
 *
 * Spec: docs/specs/admin-werkora-ch.md §4.1, §6.2.
 *
 * Die Trennlinie zwischen den beiden Bereichen ist der **Datenraum**, nicht die
 * Zuständigkeit: «Plattform» reicht über alle Mandanten (Fehlerbestand,
 * Support, Dienst-Status, Push-Test, Newsletter), «Mandant» arbeitet auf genau
 * dem einen, der oben gewählt ist. Deshalb ignoriert der obere Bereich den
 * Wähler und der untere ist ohne Auswahl leer — mit Hinweis, nicht mit Fehler.
 *
 * **Branding fest auf Werkora.** Kein `getTenantInfo`, kein
 * `applyTenantBranding`: man arbeitet AM Mandanten, nicht ALS Mandant. Ein
 * Logo- oder Farbwechsel beim Umschalten wäre hübsch und irreführend zugleich —
 * er suggeriert, man sei in dessen App. Der gewählte Mandant bleibt Text im
 * Kopf und im Bestätigungsdialog jeder Schreibaktion.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { WerkoraMark } from '../brand/WerkoraMark'
import { useIsMobile } from '../admin/useIsMobile'
import {
  IconBuilding, IconPulse, IconAlert, IconLifebuoy, IconBulb, IconBell, IconMail,
  IconSettings, IconCash, IconChart, IconBox, IconPercent,
  IconReceipt, IconUpload, IconAddressBook, IconUsers,
} from '../admin/AdminIcons'
import { loadTheme, applyTheme, toggleTheme as flipTheme, type Theme } from '../theme'
import type { TenantScope } from './useTenantScope'
import {
  MANDANT_SCREENS,
  PLATTFORM_SCREENS,
  RECHNUNG_SCREENS,
  type AdminSiteScreen,
} from './useAdminSiteNav'

export const SCREEN_TITEL: Record<AdminSiteScreen, string> = {
  uebersicht: 'Übersicht',
  'service-status': 'Service-Status',
  fehler: 'Error-Logs',
  support: 'Support',
  'feature-anfragen': 'Feature-Anfragen',
  'push-test': 'Push-Test',
  newsletter: 'Newsletter',
  konfiguration: 'Konfiguration',
  konten: 'Konten',
  'llm-kosten': 'LLM-Kosten',
  nutzung: 'Nutzung',
  material: 'Materialdatenbereinigung',
  bonus: 'Werkora Bonus',
  rechnungen: 'Rechnungen',
  // Die Mandanten-App nennt denselben Screen «Zahlungsabgleich»
  // (AdminSidebar.tsx). §8.3 der Spec schrieb «Zahlungseingang»; hier gilt der
  // Name aus dem Produkt, damit ein Screen nicht zwei Namen trägt.
  zahlungsabgleich: 'Zahlungsabgleich',
  kunden: 'Kundenstamm',
}

/**
 * Ein Symbol je Eintrag — aus demselben Satz wie die Mandanten-App
 * (`admin/AdminIcons.tsx`), damit es nicht zwei Bildsprachen gibt.
 *
 * Sie sind keine Verzierung: elf Einträge in zwei Gruppen unterscheiden sich
 * sonst allein durch die Wortlänge, und «Nutzung» neben «Materialdaten-
 * bereinigung» findet man beim zweiten Blick nicht schneller als beim ersten.
 * Mit Symbol trägt jede Zeile eine zweite, schneller lesbare Marke.
 *
 * Bewusst je Screen ein eigenes: ein Sammelsymbol für die Mandanten-Gruppe
 * wäre hübscher und nutzlos.
 */
const SCREEN_ICON: Record<AdminSiteScreen, () => React.ReactElement> = {
  uebersicht: IconBuilding,
  'service-status': IconPulse,
  fehler: IconAlert,
  support: IconLifebuoy,
  'feature-anfragen': IconBulb,
  'push-test': IconBell,
  newsletter: IconMail,
  konfiguration: IconSettings,
  konten: IconUsers,
  'llm-kosten': IconCash,
  nutzung: IconChart,
  material: IconBox,
  bonus: IconPercent,
  // Bewusst NICHT `IconCash` wie in der Mandanten-App: dort trägt es
  // Rechnungen und Zahlungsabgleich, hier hängt es schon an «LLM-Kosten».
  // Dreimal dasselbe Symbol in einer Leiste hebt genau den Nutzen wieder auf,
  // für den die Symbole überhaupt dazukamen.
  rechnungen: IconReceipt,
  // Der Zahlungsabgleich ist ein camt-Upload — das Symbol sagt, was man tut.
  zahlungsabgleich: IconUpload,
  kunden: IconAddressBook,
}

/** Steht der Build auf Staging? Derselbe Suffix, der die localStorage-Keys
 *  trennt — die Umgebung ist eine Eigenschaft des Builds, keine Einstellung
 *  in der Seite (E8). Eine Umschaltung gäbe es nicht: ein Konto lebt in einer
 *  Umgebung, und eine Seite für beide müsste zwei Sitzungen halten. */
const IST_STAGING = (import.meta.env.VITE_ENV_SUFFIX ?? '') !== ''
const UMGEBUNG = IST_STAGING ? 'Staging' : 'Produktion'

/**
 * Plattform-Screens, auf die der Kopf-Wähler nicht wirkt (Spec
 * docs/specs/support-uebersicht.md §3.5). Dort wird er ausgegraut statt
 * ausgeblendet — Ausblenden liesse den Kopf beim Screenwechsel springen. Ein
 * aktiver Wähler über einer Seite, die ihn ignoriert, las sich als Filter:
 * «Gehlhaar GmbH Test» oben, darunter die Meldungen aller Mandanten.
 *
 * Nicht dabei: die Übersicht (setzt den Wähler per Klick auf eine Zeile) und
 * das Fehlerprotokoll (übernimmt ihn als Vorauswahl seines Filters).
 */
const WAEHLER_OHNE_WIRKUNG: readonly AdminSiteScreen[] = [
  'service-status', 'support', 'push-test', 'newsletter',
]

interface Props {
  screen: AdminSiteScreen
  onNav: (screen: AdminSiteScreen) => void
  scope: TenantScope
  displayName: string
  onLogout: () => void
  /** Öffnet den Dialog fürs eigene Passwort (Selbstbedienung). */
  onChangePassword: () => void
  /** Module des ANGEMELDETEN Kontos aus `/pwa/me` — nicht die des gewählten
   *  Mandanten. Trägt es `invoicing` + `payment_matching`, sitzt es im
   *  Betreiber-Mandanten und der Bereich «Rechnungen» erscheint (§8.3). */
  zeigeRechnungen: boolean
  /** Zahl je Screen, die als Abzeichen am Eintrag steht — heute nur die neuen
   *  Feature-Anfragen (docs/specs/feature-anfragen.md §7). */
  badges?: Partial<Record<AdminSiteScreen, number>>
  children: ReactNode
}

export default function AdminSiteShell({
  screen, onNav, scope, displayName, onLogout, onChangePassword, zeigeRechnungen, badges, children,
}: Props) {
  const isMobile = useIsMobile()
  const [theme, setTheme] = useState<Theme>(() => loadTheme())
  const [drawerOffen, setDrawerOffen] = useState(false)

  useEffect(() => { applyTheme(theme) }, [theme])
  // Beim Screenwechsel den Drawer schliessen — sonst verdeckt er auf dem Handy
  // genau die Seite, zu der man gerade gewechselt ist.
  useEffect(() => { setDrawerOffen(false) }, [screen])

  const navigation = (
    <nav className="adminsite-nav">
      <div className="adminsite-nav-group">
        <div className="adminsite-nav-heading">Plattform</div>
        {PLATTFORM_SCREENS.map((s) => {
          const Icon = SCREEN_ICON[s]
          const badge = badges?.[s] ?? 0
          return (
            <button
              key={s}
              type="button"
              className={`adminsite-nav-item${screen === s ? ' is-active' : ''}`}
              onClick={() => onNav(s)}
            >
              <Icon />
              <span>{SCREEN_TITEL[s]}</span>
              {badge > 0 && (
                <span className="adminsite-nav-badge" aria-label={`${badge} neu`}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="adminsite-nav-group">
        <div className="adminsite-nav-heading">
          Mandant
          {scope.tenant && <span className="adminsite-nav-tenant">{scope.tenant.name}</span>}
        </div>
        {scope.tenant ? (
          MANDANT_SCREENS.map((s) => {
            const Icon = SCREEN_ICON[s]
            return (
              <button
                key={s}
                type="button"
                className={`adminsite-nav-item${screen === s ? ' is-active' : ''}`}
                onClick={() => onNav(s)}
              >
                <Icon />
                <span>{SCREEN_TITEL[s]}</span>
              </button>
            )
          })
        ) : (
          <div className="adminsite-nav-hint">Oben einen Mandanten wählen.</div>
        )}
      </div>

      {zeigeRechnungen && (
        <div className="adminsite-nav-group">
          <div className="adminsite-nav-heading">Rechnungen</div>
          {RECHNUNG_SCREENS.map((s) => {
            const Icon = SCREEN_ICON[s]
            return (
              <button
                key={s}
                type="button"
                className={`adminsite-nav-item${screen === s ? ' is-active' : ''}`}
                onClick={() => onNav(s)}
              >
                <Icon />
                <span>{SCREEN_TITEL[s]}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="adminsite-nav-foot">
        <div className="adminsite-nav-user">{displayName}</div>
        {/* Das eigene Passwort gehört an den Fuss und nicht in den Mandanten-
            Bereich: es hängt am angemeldeten Konto, nicht am gewählten
            Mandanten. Ohne diesen Knopf gäbe es auf der Betreiber-Seite gar
            keinen Weg dorthin — der Endpunkt existierte, die Oberfläche nie. */}
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={onChangePassword}
        >
          Passwort ändern
        </button>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onLogout}>
          Abmelden
        </button>
      </div>
    </nav>
  )

  const ohneWirkung = WAEHLER_OHNE_WIRKUNG.includes(screen)
  const waehler = (
    <label
      className={`adminsite-tenant-picker${ohneWirkung ? ' is-inert' : ''}`}
      title={ohneWirkung ? 'Diese Seite zeigt alle Mandanten' : undefined}
    >
      <span className="adminsite-tenant-picker-label">Mandant</span>
      <select
        className="admin-form-select"
        value={scope.tenantId ?? ''}
        onChange={(e) => scope.selectTenant(e.target.value || null)}
        disabled={ohneWirkung || scope.loading || !!scope.error}
      >
        <option value="">— keiner gewählt —</option>
        {scope.tenants.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className={isMobile ? 'adminsite-shell adminsite-shell--mobile' : 'adminsite-shell'}>
      {!isMobile && (
        <aside className="adminsite-sidebar">
          <div className="adminsite-brand">
            <span className="adminsite-brand-mark"><WerkoraMark title="Werkora" /></span>
            <span className="adminsite-brand-name">Werkora Admin</span>
          </div>
          {navigation}
        </aside>
      )}

      <main className="adminsite-content">
        <header className="adminsite-topbar">
          {isMobile && (
            <button
              type="button"
              className="admin-btn-icon"
              aria-label="Navigation öffnen"
              aria-expanded={drawerOffen}
              onClick={() => setDrawerOffen((o) => !o)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          )}
          {isMobile && <div className="adminsite-topbar-title">{SCREEN_TITEL[screen]}</div>}
          {waehler}
          <span className={`adminsite-env${IST_STAGING ? ' is-staging' : ''}`}>{UMGEBUNG}</span>
          <button
            type="button"
            className="admin-btn-icon admin-theme-toggle"
            onClick={() => setTheme(flipTheme(theme))}
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            aria-label="Theme wechseln"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </header>

        {scope.error && (
          <div className="admin-form-error adminsite-tenant-error">
            Mandantenliste nicht geladen: {scope.error}
            {' '}
            <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                    onClick={scope.reload}>
              Erneut laden
            </button>
          </div>
        )}

        <div className="adminsite-screen">{children}</div>
      </main>

      {isMobile && drawerOffen && (
        <>
          <div className="adminsite-drawer-backdrop" onClick={() => setDrawerOffen(false)} />
          <aside className="adminsite-drawer">{navigation}</aside>
        </>
      )}
    </div>
  )
}

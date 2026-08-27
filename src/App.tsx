import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getMe, getTenantInfo, TenantInfo, UserInfo } from './api/auth'
import { ApiError, apiUrl, resetSessionExpiredFlag } from './api/client'
import { SK } from './api/storageKeys'
import PinScreen from './auth/PinScreen'
import LoginScreen from './auth/LoginScreen'
import ConsentScreen from './auth/ConsentScreen'
import HomeScreen from './screens/HomeScreen'
import ChatScreen from './chat/ChatScreen'
import ArbeitsZeitScreen from './screens/ArbeitsZeitScreen'
import ProfileScreen from './screens/ProfileScreen'
import BerichtScreen, { BerichtType } from './screens/BerichtScreen'
import ProjekteScreen from './screens/ProjekteScreen'
import OffertenScreen from './screens/OffertenScreen'
import ProjektEntwurfScreen from './screens/ProjektEntwurfScreen'
import AbsenzenScreen from './screens/AbsenzenScreen'
import AdminApp from './admin/AdminApp'
import { WerkoraMark } from './brand/WerkoraMark'
import { derivePalette, paletteCss } from './brand/palette'
import { MigrationBanner, MIGRATION_STREIFEN_HOEHE, aktuelleMigrationStufe } from './shared/MigrationBanner'
import HelpBubble from './shared/HelpBubble'
import { consumeBack, consumeScreenBack } from './shared/backButton'
import { advance, retreat } from './shared/navHistory'
import { trackNav } from './shared/breadcrumbs'
import { hasModule, isFeatureEnabled } from './api/modules'
import { applyTheme, loadTheme, useTheme } from './theme'
import { clearDraft, loadDraft } from './chat/rapportDraft'
import { confirmLeaveRapport, discardPrompt, planRapportStart } from './chat/rapportStart'
import { cancelReport } from './api/chat'

// Vom Inline-Boot-Skript in index.html gesetzt (siehe vite.config.ts,
// BOOT_BACK_GUARD). Optional, weil es im Vitest-DOM und in Dev-Sonderfällen
// fehlen kann — der Aufruf unten ist deshalb überall abgesichert.
declare global {
  interface Window {
    werkoraBackGuard?: (aktiv: boolean) => void
  }
}

type Screen = 'loading' | 'login' | 'pin' | 'consent' | 'home' | 'rapport' | 'arbeitszeit' | 'profile' | 'bericht' | 'projekte' | 'offerten' | 'projektEntwurf' | 'admin' | 'absenzen'

// Die Wahl der Schrift auf der Akzentfläche wohnt jetzt in brand/palette.ts,
// zusammen mit der übrigen Farbableitung. Der Re-Export hält die Funktion an
// ihrem bisherigen Importpfad erreichbar.
export { onAccentColor } from './brand/palette'

/** Trägt das eingehängte Mandanten-Stylesheet, damit ein zweiter Aufruf
 *  ersetzt statt anzuhängen (loadBranding läuft bei jedem Login erneut). */
const BRANDING_STYLE_ID = 'werkora-tenant-branding'

/**
 * Mandantenfarbe anwenden — als Stylesheet, nicht als Inline-Style auf `<html>`.
 *
 * Der Unterschied ist nicht kosmetisch: Ein Inline-Style kennt genau einen
 * Wert, das Theme wechselt aber zur Laufzeit. Deshalb lief die Monteur-App im
 * dunklen Theme bisher mit der *hellen* Firmenfarbe — bei kräftigem Blau auf
 * dunklem Grund keine 3,4:1. Über `[data-theme]`-Regeln greift ohne weiteres
 * Zutun der jeweils passende Satz, auch beim Umschalten.
 *
 * Zweite Änderung: Der Satz enthält jetzt auch `--primary` & Co. Die Admin-App
 * hatte diese Token fest in `admin/tokens.css` stehen und ignorierte die
 * Mandantenfarbe komplett.
 */
function applyTenantBranding(info: TenantInfo) {
  const css = paletteCss(derivePalette(info.brand_color))
  const el = document.getElementById(BRANDING_STYLE_ID) ?? document.createElement('style')
  el.id = BRANDING_STYLE_ID
  el.textContent = css
  // Ans Ende von <head>: die gebündelten Stylesheets stehen davor, und bei
  // gleicher Spezifität gewinnt die spätere Regel.
  document.head.appendChild(el)
}

// Tenant-aware logo: shows company logo if available, else the Werkora mark.
// Der Rückfall ist kein Platzhalter mehr, sondern die Produktmarke: auf
// app.werkora.ch ist genau das der erste Eindruck, bevor der Mandant bekannt
// ist (siehe docs/specs/werkora-domain-app-einstieg.md, P4).
export function TenantLogo({ logoUrl }: { logoUrl: string }) {
  const [imgError, setImgError] = useState(false)
  if (logoUrl && !imgError) {
    return (
      <div className="auth-logo-img">
        <img src={logoUrl} alt="Firmenlogo" onError={() => setImgError(true)} />
      </div>
    )
  }
  return (
    <div className="auth-logo">
      <WerkoraMark title="Werkora" />
    </div>
  )
}

function nextScreenAfterLogin(u: UserInfo): Screen {
  if (u.consent_required) return 'consent'
  if (u.role === 'admin' || u.role === 'management' || u.role === 'superadmin') return 'admin'
  return 'home'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<UserInfo | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [logoUrlDark, setLogoUrlDark] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [canton, setCanton] = useState('ZH')
  const [berichtType, setBerichtType] = useState<BerichtType>('monthly')
  const [rapportInitialMessage, setRapportInitialMessage] = useState<string | null>(null)
  const [rapportInitialProject, setRapportInitialProject] = useState<string | null>(null)
  // Die id desselben Projekts. Sie ist die massgebliche Angabe an den Server: der
  // Name ist nicht eindeutig (zwei Liegenschaften desselben Kunden dürfen gleich
  // heissen), und mit ihm allein band der Rapport gar nicht.
  const [rapportInitialProjectId, setRapportInitialProjectId] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [swUpdateReady, setSwUpdateReady] = useState(false)
  const [pushMsg, setPushMsg] = useState<{ title: string; body: string } | null>(null)
  const [authExpiredAt, setAuthExpiredAt] = useState<number | null>(null)
  // Besuchte Screens ohne den aktuellen — der Zurück-Knopf läuft ihn ab.
  const [navHistory, setNavHistory] = useState<Screen[]>([])
  const screenRef = useRef(screen)
  const navHistoryRef = useRef(navHistory)
  const theme = useTheme()
  // Im Dark-Theme die weiße Logo-Variante nutzen, falls vorhanden — sonst das
  // helle Standard-Logo. Reagiert über useTheme() automatisch auf Toggles.
  const effectiveLogo = theme === 'dark' && logoUrlDark ? logoUrlDark : logoUrl

  useEffect(() => {
    applyTheme(loadTheme())
  }, [])

  useEffect(() => {
    const goOnline = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    const onUpdate = () => setSwUpdateReady(true)
    window.addEventListener('sw-update-ready', onUpdate)
    return () => window.removeEventListener('sw-update-ready', onUpdate)
  }, [])

  // Push-Nachricht vom Service Worker → In-App-Banner (App war offen oder im
  // Hintergrund). Der SW postet {type:'push', title, body, url}.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'push') {
        setPushMsg({ title: e.data.title || 'Mitteilung', body: e.data.body || '' })
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  // Cold-Start: App wurde durch Antippen einer Benachrichtigung geöffnet,
  // die Nachricht steckt im URL-Hash (#notif=...). Anzeigen und Hash entfernen.
  useEffect(() => {
    const m = window.location.hash.match(/notif=([^&]+)/)
    if (!m) return
    try {
      const p = JSON.parse(decodeURIComponent(m[1]))
      setPushMsg({ title: p.title || 'Mitteilung', body: p.body || '' })
    } catch { /* ignore */ }
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  useEffect(() => {
    const onAuthExpired = () => {
      const storedIdentity = Boolean(
        localStorage.getItem(SK.AUTHORIZED_USER_ID) && localStorage.getItem(SK.TENANT_SLUG)
      )
      setUser(null)
      setNavHistory([])
      setScreen(storedIdentity ? 'login' : 'pin')
      setAuthExpiredAt(Date.now())
    }
    window.addEventListener('auth:expired', onAuthExpired)
    return () => window.removeEventListener('auth:expired', onAuthExpired)
  }, [])

  useEffect(() => {
    if (authExpiredAt === null) return
    const t = window.setTimeout(() => setAuthExpiredAt(null), 8000)
    return () => window.clearTimeout(t)
  }, [authExpiredAt])

  // Keep refs in sync so the popstate handler always sees the latest state
  useEffect(() => { screenRef.current = screen }, [screen])
  useEffect(() => { navHistoryRef.current = navHistory }, [navHistory])

  // Navigieren MIT Verlauf: der verlassene Screen wird gemerkt, damit der
  // Zurück-Knopf dorthin zurückführt. Jeder Nav-Callback unten geht hierüber.
  //
  // `screenRef` statt `screen` im Updater: `go` soll eine stabile Referenz
  // bleiben (sonst hängt an jedem Screenwechsel die halbe JSX an neuen
  // Callbacks). Der Ref trägt beim Aufruf noch den alten Screen — genau den,
  // der in den Verlauf gehört.
  const go = useCallback((next: Screen) => {
    setNavHistory(h => advance(h, screenRef.current, next))
    setScreen(next)
  }, [])

  // Navigieren OHNE Verlauf — für Wechsel, hinter die es kein Zurück gibt:
  // An-/Abmelden, abgelaufene Sitzung, und die Modul-Wächter im Render (ein
  // Screen, der einen sofort wieder hinauswirft, darf nicht im Verlauf landen —
  // sonst führt Zurück in eine Schleife).
  const resetTo = useCallback((next: Screen) => {
    setNavHistory([])
    setScreen(next)
  }, [])

  // Abmelden landet je nach hinterlegter Identität auf Login oder PIN.
  const goToAuth = useCallback(() => {
    const storedIdentity = Boolean(
      localStorage.getItem(SK.AUTHORIZED_USER_ID) && localStorage.getItem(SK.TENANT_SLUG)
    )
    setUser(null)
    resetTo(storedIdentity ? 'login' : 'pin')
  }, [resetTo])

  // Diagnose-Breadcrumb je Screenwechsel (Spec docs/specs/support-ticket.md §5.3).
  // Im Effekt, nicht im Render: `trackNav` schreibt in einen Modul-Puffer, und
  // ein Seiteneffekt während des Renders wäre ein Purity-Verstoss.
  //
  // Steht HIER oben und nicht unten bei der Hilfe-Blase, obwohl er thematisch
  // dorthin gehört: unterhalb liegen die frühen Returns (`screen === 'loading'`,
  // `screen === 'pin'`). Ein Hook dahinter wird im ersten Render (screen =
  // 'loading') gar nicht erreicht und ab dem Wechsel auf 'login'/'home' plötzlich
  // schon — React zählt dann mehr Hooks als zuvor, wirft Fehler #310 und
  // unmountet den GANZEN Baum: weisse Seite statt App.
  useEffect(() => { trackNav(screen) }, [screen])

  // Push a history entry on every screen change so the back button has something to pop
  useEffect(() => {
    history.pushState(null, '', window.location.href)
  }, [screen])

  // Verlassen des Rapport-Chats: erst fragen, wenn dort etwas offen ist.
  //
  // Der Guard sitzt hier und nicht im ChatScreen, aus zwei Gründen: Erstens laufen
  // ALLE Ausgänge über diese Stelle (die Nav-Callbacks unten und der popstate-Handler
  // darunter). Zweitens ist `useBackButton` dafür untauglich — `consumeBack()` POPPT
  // den obersten Handler, ein dauerhaft aktiver Guard würde also genau einmal warnen
  // und beim zweiten Zurück-Druck durchfallen.
  //
  // Der Entwurf kommt aus dem localStorage statt aus dem ChatScreen-State: dort steht
  // er ohnehin (saveDraft läuft bei jeder Zustandsänderung), und `startRapport` unten
  // liest ihn genauso. Zwischen der letzten Eingabe und dem Tippen auf «Home» liegen
  // immer mehrere Frames — der gespeicherte Stand ist aktuell.
  const leaveRapport = useCallback((next: () => void) => {
    if (screenRef.current !== 'rapport') { next(); return }
    const userId = user?.authorized_user_id ?? localStorage.getItem(SK.AUTHORIZED_USER_ID) ?? ''
    if (confirmLeaveRapport(userId ? loadDraft(userId, Date.now()) : null)) next()
  }, [user])

  // Der popstate-Handler wird einmal registriert und sähe sonst dauerhaft die
  // Fassung des ersten Renders (mit user === null).
  const leaveRapportRef = useRef(leaveRapport)
  useEffect(() => { leaveRapportRef.current = leaveRapport }, [leaveRapport])

  // Hardware-/Browser-Zurück → eine Ebene zurück, nicht pauschal auf die Hauptmaske.
  //
  // Die Reihenfolge ist die Sichtbarkeits-Reihenfolge von oben nach unten:
  // 1. Offene Overlays (Material-Popup, Bild-Lightbox, Filter-Sheet) — sie liegen
  //    optisch über allem, also schliessen sie zuerst.
  // 2. Bereiche mit eigenem Verlauf (der Admin-Bereich navigiert über
  //    `useAdminNav`). `false` heisst «dort ist die Wurzel erreicht».
  // 3. Der eigene Verlauf der Mitarbeiter-App.
  // 4. Nichts mehr übrig: Der Druck wird verschluckt, die App bleibt offen.
  //    Bewusst so — Zurück auf der Hauptmaske schliesst die PWA nicht.
  //
  // Bis hierher hat der Wächter aus dem Inline-Boot-Skript ausgeholfen: der
  // läuft schon während des «Laden…»-Screens, wo dieser Effekt es naturgemäss
  // noch nicht tut. Jetzt tritt er ab, sonst pusht jeder Zurück-Druck zwei
  // Einträge.
  useEffect(() => {
    window.werkoraBackGuard?.(false)
    const onPopState = () => {
      history.pushState(null, '', window.location.href) // re-add entry so next back press still works
      if (consumeBack()) return
      if (consumeScreenBack()) return

      const step = retreat(navHistoryRef.current)
      const previous = step.previous
      if (previous === undefined) return

      // Im Rapport-Chat erst die Rückfrage — der Hardware-Zurück ist dort der
      // Ausgang, der am leichtesten aus Versehen getroffen wird. Erst wenn sie
      // bestätigt ist, wird der Verlauf tatsächlich abgetragen; sonst stünde man
      // nach «Abbrechen» mit einem verkürzten Verlauf da.
      leaveRapportRef.current(() => {
        setNavHistory(step.history)
        setScreen(previous)
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.werkoraBackGuard?.(true)
    }
  }, [])

  const hasStoredIdentity = Boolean(
    localStorage.getItem(SK.AUTHORIZED_USER_ID) && localStorage.getItem(SK.TENANT_SLUG)
  )

  // «Rapport erstellen» aus dem Projekt-Detail. Der Knopf startete früher immer einen
  // neuen Rapport — wartete im Chat noch einer auf «Speichern», war er damit weg
  // (Client-State überschrieben, Server-Puffer beim nächsten log_report ersetzt).
  // Das trifft, wer zwischendurch aufs Projekt schaut: der Projekt-Detail hat keinen
  // eigenen Weg zurück in den laufenden Rapport, dieser Knopf sieht danach aus.
  async function startRapport(project: { id: string; name: string }) {
    const projectName = project.name
    const userId = user?.authorized_user_id ?? localStorage.getItem(SK.AUTHORIZED_USER_ID) ?? ''
    const plan = planRapportStart(userId ? loadDraft(userId, Date.now()) : null, projectName)

    if (plan.kind === 'resume') { go('rapport'); return }

    if (plan.kind === 'confirm-discard') {
      if (!window.confirm(discardPrompt(plan.pendingProject, projectName))) {
        go('rapport')   // Abbrechen → zurück in den laufenden Rapport
        return
      }
      // Verwerfen heisst auch server-seitig aufräumen: sonst hängt der alte
      // Gesprächsverlauf im neuen Rapport und der Bot fragt Beantwortetes erneut.
      try { await cancelReport() } catch { /* best-effort — der Neustart zählt */ }
      if (userId) clearDraft(userId)
    }

    // Projekt zusätzlich als eigene Felder, nicht nur im Text: der Server bindet
    // den Rapport daran (Stammdaten-Abgleich statt Wort-Erkennung), damit spätere
    // Nachrichten — "8 Stunden für Peter" — den Auftrag nicht mehr wechseln können.
    // Die id ist dabei die verbindliche Angabe; der Name geht nur mit, damit ein
    // alter Server ihn weiterhin auswertet.
    setRapportInitialProject(projectName)
    setRapportInitialProjectId(project.id)
    setRapportInitialMessage(`Neuer Rapport für Projekt "${projectName}"`)
    go('rapport')
  }

  const loadBranding = useCallback(async () => {
    const slug = localStorage.getItem(SK.TENANT_SLUG) ?? ''
    if (!slug) return
    try {
      const info = await getTenantInfo(slug)
      applyTenantBranding(info)
      // logo_url ist ein relativer Proxy-Pfad (/pwa/tenant-logo?...). Das Backend
      // liegt auf anderer Origin als die PWA → absolut machen, damit <img src>
      // aufs Backend zeigt und nicht auf die PWA-Origin.
      setLogoUrl(info.logo_url ? apiUrl(info.logo_url) : '')
      setLogoUrlDark(info.logo_url_dark ? apiUrl(info.logo_url_dark) : '')
      setTenantName(info.name)
      setCanton(info.canton || 'ZH')
    } catch (err) {
      console.warn('[Branding] Fehler beim Laden:', err)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      getMe().then(u => u).catch(err => ({ error: err })),
      loadBranding(),
    ]).then(([userResult]) => {
      if ('error' in (userResult as object)) {
        setScreen(hasStoredIdentity ? 'login' : 'pin')
      } else {
        const u = userResult as UserInfo
        setUser(u)
        setScreen(nextScreenAfterLogin(u))
      }
    })
  }, [])

  // Der Umzugsstreifen sitzt zuoberst und schiebt die anderen Banner nach
  // unten. Er ist im normalen Build nicht vorhanden (Flag leer), dann ist der
  // Versatz 0 und alles steht wie bisher.
  const migrationStufe = aktuelleMigrationStufe()
  const migrationVersatz =
    migrationStufe === 'hinweis' || migrationStufe === 'dringend'
      ? MIGRATION_STREIFEN_HOEHE
      : 0

  const offlineBanner = isOffline ? (
    <div style={{
      position: 'fixed', top: `calc(${migrationVersatz}px + env(safe-area-inset-top, 0px))`, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, zIndex: 9999,
      background: '#f59e0b', color: '#1a1a1a',
      textAlign: 'center', padding: '6px 12px',
      fontSize: '0.85rem', fontWeight: 600,
    }}>
      Kein Internet – Offline-Modus
    </div>
  ) : null

  const authExpiredBanner = authExpiredAt !== null ? (
    <div style={{
      position: 'fixed',
      top: `calc(${migrationVersatz + (isOffline ? 32 : 0)}px + env(safe-area-inset-top, 0px))`,
      left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, zIndex: 9999,
      background: 'var(--accent, #1e3a5f)', color: '#fff',
      textAlign: 'center', padding: '8px 12px',
      fontSize: '0.85rem', fontWeight: 600,
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      Sitzung abgelaufen – bitte erneut anmelden.
    </div>
  ) : null

  const updateBanner = swUpdateReady ? (
    <div style={{
      position: 'fixed',
      bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
      left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 448, zIndex: 9998,
      background: '#1e3a5f', color: '#fff',
      borderRadius: 'var(--radius-md)', padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      fontSize: '0.875rem',
    }}>
      <span>Neue Version verfügbar</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: 'var(--accent-green)', color: '#fff', border: 'none',
          borderRadius: 'var(--radius-xs)', padding: '5px 12px', cursor: 'pointer',
          fontWeight: 600, fontSize: '0.85rem',
        }}
      >
        Aktualisieren
      </button>
    </div>
  ) : null

  const pushBanner = pushMsg ? (
    <div style={{
      position: 'fixed',
      top: `calc(${(isOffline ? 32 : 0) + (authExpiredAt !== null ? 40 : 0) + 8}px + env(safe-area-inset-top, 0px))`,
      left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 24px)', maxWidth: 448, zIndex: 9999,
      background: 'var(--accent, #1e3a5f)', color: '#fff',
      borderRadius: 12, padding: '12px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{pushMsg.title}</div>
        {/* pre-line: Sammel-Push und Morgen-Briefing schicken eine Aufzählung
            mit \n. Ohne das würde daraus "• A • B • C" auf einer Zeile. */}
        {pushMsg.body && (
          <div style={{
            fontSize: '0.85rem', marginTop: 2, opacity: 0.95,
            wordBreak: 'break-word', whiteSpace: 'pre-line',
          }}>
            {pushMsg.body}
          </div>
        )}
      </div>
      <button
        onClick={() => setPushMsg(null)}
        aria-label="Schliessen"
        style={{
          background: 'transparent', border: 'none', color: '#fff',
          fontSize: '1.3rem', lineHeight: 1, cursor: 'pointer',
          padding: '0 2px', flexShrink: 0, opacity: 0.85,
        }}
      >
        ×
      </button>
    </div>
  ) : null

  if (screen === 'loading') {
    return (
      <>
        <MigrationBanner />
        {offlineBanner}
        {authExpiredBanner}
        {pushBanner}
        <div className="loading-screen">
          <div className="loading-logo">
            <WerkoraMark title="Werkora" />
          </div>
          <p className="loading-text">Laden…</p>
        </div>
      </>
    )
  }

  let inner: React.ReactNode = null

  if (screen === 'pin') {
    inner = (
      <PinScreen
        logoUrl={effectiveLogo}
        tenantName={tenantName}
        onLoggedIn={() => {
          resetSessionExpiredFlag()
          setAuthExpiredAt(null)
          getMe().then(u => { setUser(u); loadBranding(); resetTo(nextScreenAfterLogin(u)) }).catch(() => resetTo('pin'))
        }}
      />
    )
  } else if (screen === 'login') {
    inner = (
      <LoginScreen
        logoUrl={effectiveLogo}
        onLoggedIn={() => {
          resetSessionExpiredFlag()
          setAuthExpiredAt(null)
          getMe().then(u => { setUser(u); loadBranding(); resetTo(nextScreenAfterLogin(u)) }).catch(() => resetTo('pin'))
        }}
      />
    )
  } else if (screen === 'consent' && user) {
    inner = (
      <ConsentScreen
        logoUrl={effectiveLogo}
        displayName={user.display_name}
        user={user}
        onAccepted={() => {
          getMe().then(u => { setUser(u); resetTo('home') }).catch(() => resetTo('home'))
        }}
      />
    )
  } else if (screen === 'home' && user) {
    inner = (
      <HomeScreen
        displayName={user.display_name}
        logoUrl={effectiveLogo}
        role={user.role}
        enabledModules={user.enabled_modules ?? []}
        onNavRapport={() => go('rapport')}
        onNavArbeitszeit={() => go('arbeitszeit')}
        onNavProjekte={() => go('projekte')}
        onNavOfferten={() => go('offerten')}
        onNavProjektEntwurf={() => go('projektEntwurf')}
        onNavProfile={() => go('profile')}
        onLoggedOut={goToAuth}
        onSwitchToAdmin={(user.role === 'admin' || user.role === 'management' || user.role === 'superadmin') ? () => go('admin') : undefined}
      />
    )
  } else if (screen === 'profile' && user) {
    inner = (
      <ProfileScreen
        displayName={user.display_name}
        email={user.email}
        role={user.role}
        tenantName={tenantName || localStorage.getItem(SK.TENANT_SLUG) || ''}
        logoUrl={effectiveLogo}
        onBack={() => go('home')}
        onLoggedOut={goToAuth}
      />
    )
  } else if (screen === 'rapport' && user) {
    if (user.role === 'user_light') { resetTo('home'); return null }
    if (!user.enabled_modules?.includes('ai')) { resetTo('home'); return null }
    inner = (
      <ChatScreen
        displayName={user.display_name}
        user={user}
        logoUrl={effectiveLogo}
        activeNav="rapport"
        initialMessage={rapportInitialMessage}
        initialProject={rapportInitialProject}
        initialProjectId={rapportInitialProjectId}
        onInitialMessageConsumed={() => {
          setRapportInitialMessage(null)
          setRapportInitialProject(null)
          setRapportInitialProjectId(null)
        }}
        // Jeder Ausgang läuft durch die Rückfrage (leaveRapport). onLoggedOut NICHT:
        // das ist kein Weggehen, sondern die abgelaufene Sitzung (401) — dort gibt es
        // nichts mehr zu entscheiden, und der Entwurf überlebt den Login ohnehin.
        onNavHome={() => leaveRapport(() => go('home'))}
        onNavArbeitszeit={() => leaveRapport(() => go('arbeitszeit'))}
        onNavProjekte={() => leaveRapport(() => go('projekte'))}
        onNavProfile={() => leaveRapport(() => go('profile'))}
        onLoggedOut={goToAuth}
      />
    )
  } else if (screen === 'arbeitszeit' && user) {
    if (!user.enabled_modules?.includes('timekeeping')) { resetTo('home'); return null }
    inner = (
      <ArbeitsZeitScreen
        displayName={user.display_name}
        logoUrl={effectiveLogo}
        role={user.role}
        user={user}
        onNavHome={() => go('home')}
        onNavRapport={() => go('rapport')}
        onNavProjekte={() => go('projekte')}
        onNavProfile={() => go('profile')}
        onLoggedOut={goToAuth}
        onOpenBericht={(type) => { setBerichtType(type); go('bericht') }}
        onNavAbsenzen={() => go('absenzen')}
      />
    )
  } else if (screen === 'absenzen' && user) {
    if (!user.enabled_modules?.includes('hr')) { resetTo('home'); return null }
    inner = (
      <AbsenzenScreen
        logoUrl={effectiveLogo}
        canton={canton}
        onBack={() => go('arbeitszeit')}
        onNavHome={() => go('home')}
        onNavRapport={() => go('rapport')}
        onNavProfile={() => go('profile')}
        onLoggedOut={goToAuth}
      />
    )
  } else if (screen === 'projekte' && user) {
    if (user.role === 'user_light') { resetTo('home'); return null }
    inner = (
      <ProjekteScreen
        logoUrl={effectiveLogo}
        user={user}
        onNavHome={() => go('home')}
        onNavRapport={() => go('rapport')}
        onStartRapport={(project) => void startRapport(project)}
        onNavArbeitszeit={() => go('arbeitszeit')}
        onNavProfile={() => go('profile')}
        onLoggedOut={goToAuth}
      />
    )
  } else if (screen === 'offerten' && user) {
    if (user.role === 'user_light' || !user.enabled_modules?.includes('quotes')) { resetTo('home'); return null }
    inner = (
      <OffertenScreen
        logoUrl={effectiveLogo}
        onNavHome={() => go('home')}
        onNavArbeitszeit={() => go('arbeitszeit')}
        onNavProjekte={() => go('projekte')}
        onNavProfile={() => go('profile')}
        onLoggedOut={goToAuth}
      />
    )
  } else if (screen === 'projektEntwurf' && user) {
    if (user.role === 'user_light') { resetTo('home'); return null }
    inner = (
      <ProjektEntwurfScreen
        logoUrl={effectiveLogo}
        onNavHome={() => go('home')}
        onLoggedOut={goToAuth}
      />
    )
  } else if (screen === 'bericht' && user) {
    if (!user.enabled_modules?.includes('hr')) { resetTo('home'); return null }
    inner = (
      <BerichtScreen
        berichtType={berichtType}
        logoUrl={effectiveLogo}
        user={user}
        onBack={() => go('arbeitszeit')}
        onNavHome={() => go('home')}
        onNavRapport={() => go('rapport')}
        onNavProfile={() => go('profile')}
        onLoggedOut={goToAuth}
      />
    )
  } else if (screen === 'admin' && user) {
    inner = (
      <AdminApp
        user={user}
        logoUrl={effectiveLogo}
        tenantName={tenantName || localStorage.getItem(SK.TENANT_SLUG) || ''}
        canton={canton}
        onLoggedOut={goToAuth}
        onSwitchToUser={() => go('home')}
      />
    )
  }

  // Schwebende Hilfe-Blase: auf allen authentifizierten Mitarbeiter-Screens, aber nicht
  // auf Auth-Screens und nicht im Admin-Bereich (AdminApp rendert eine eigene Blase).
  // Auch NICHT auf dem Rapport-Screen: der hat unten statt der Nav-Leiste eine eigene
  // Chat-Eingabeleiste — der FAB (bottom: 72px, für die ~56px-Nav-Leiste gedacht) läge
  // sonst über dem Senden-Button. Und eine zweite Hilfe-Chat-Blase über dem Rapport-Bot
  // wäre ohnehin doppelt.
  // Modul 'help_bot' = Master-Schalter; Feature-Flag 'help_bot_pwa' = unabhängiger
  // Schalter für die Mitarbeiter-App (Default an). Für den Support-Knopf gilt
  // dasselbe Muster mit 'support'/'support_pwa' — bewusst OHNE Abhängigkeit vom
  // Hilfe-Bot (Spec docs/specs/support-ticket.md §6.1): ein Mandant ohne KI-Hilfe
  // soll trotzdem Probleme melden können.
  const onBubbleScreen =
    !!user && !['loading', 'login', 'pin', 'consent', 'admin', 'rapport'].includes(screen)
  const showHelp =
    onBubbleScreen && hasModule(user, 'help_bot') && isFeatureEnabled(user, 'help_bot_pwa')
  const showSupport =
    onBubbleScreen && hasModule(user, 'support') && isFeatureEnabled(user, 'support_pwa')
  const showHelpBubble = showHelp || showSupport

  return (
    <>
      <MigrationBanner />
      {offlineBanner}
      {authExpiredBanner}
      {pushBanner}
      {updateBanner}
      {inner}
      {showHelpBubble && (
        <HelpBubble
          columnMaxWidth={480}
          showHelp={showHelp}
          showSupport={showSupport}
          route={screen}
          appContext="pwa"
        />
      )}
    </>
  )
}

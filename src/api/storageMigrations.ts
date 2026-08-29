// Storage-Schema-Migrations für Client-State (localStorage).
//
// Bei jeder Breaking-Change an persistierten Keys:
//   1. APP_DATA_VERSION um 1 erhöhen
//   2. Migrationsschritt unter MIGRATIONS anhängen
// So entfällt manuelles "Cache löschen" beim Nutzer.

import { SK } from './storageKeys'

export const APP_DATA_VERSION = 21
const STORAGE_VERSION_KEY = 'app_data_version'

// Zentrale Whitelist: Keys, die als "aktiv genutzt" gelten. Alles andere
// ist Legacy/Müll und wird beim Schema-Wechsel entfernt.
// Bei neuen localStorage-Keys in der App: hier ergänzen.
function isKnownKey(k: string): boolean {
  // Aktuelle auth/tenant keys (env-suffixed). SK.TOKEN ist NICHT mehr known —
  // Token läuft nun via httpOnly-Cookie, localStorage-Reste werden in v3→v4 entfernt.
  if (k === SK.TENANT_SLUG) return true
  if (k === SK.AUTHORIZED_USER_ID) return true
  if (k === SK.DISPLAY_NAME) return true
  // App-State
  if (k === 'my-time-stempel-state') return true
  if (k === 'zeit_offline_queue') return true
  if (k === 'projektEntwurf_offline_queue') return true
  if (k === 'hinweise_offline_queue') return true
  if (k.startsWith('quote-draft:')) return true  // lokaler Offert-Zwischenstand (pro Projekt)
  if (k.startsWith('rapport-draft:')) return true  // lokaler Rapport-Zwischenstand (pro Mitarbeiter)
  if (k.startsWith('offline-lesepaket:')) return true  // Offline-Snapshot der Lesedaten (pro Mitarbeiter)
  if (k === 'admin-theme') return true
  if (k === 'helpbubble-pos') return true  // gemerkte Drag-Position der Hilfe-Blase
  if (k === 'schedule-week-zoom') return true  // Zoom-Stufe des Wochen-Zeitrasters
  if (k === 'schedule-gantt-zoom') return true  // Zoom-Stufe des Tagesplans (Gantt)
  if (k === 'schedule-gantt-span') return true  // Sichtbarer Zeitraum des Tagesplans (1/3/5 Tage)
  if (k === 'schedule-map-period') return true  // Zeitraum der Auftragskarte (Wochen ab heute)
  // Infrastruktur
  if (k === STORAGE_VERSION_KEY) return true
  if (k === 'app_build_id') return true
  return false
}

// Keys, die bei einem Fallback-Wipe (unbekannte Zukunftsversion) minimal
// erhalten bleiben. Auth läuft via httpOnly-Cookie — der Tenant-Slug genügt,
// damit der Login-Screen weiss, gegen welchen Tenant aufgelöst werden soll.
const SURVIVE_WIPE: readonly string[] = [SK.TENANT_SLUG]

type Migration = {
  from: number
  to: number
  run: () => void
}

// v0 → v1: Whitelist-basierter Großputz. Entfernt alle unbekannten
// Legacy-Keys aus früheren Versionen (unsuffixed Tokens aus Commit ab6eb14,
// Theme-Tokens aus div. Design-Umstellungen etc.). Aktive App-State-Keys
// (Stempel, Offline-Queue, Theme, Auth) überleben unverändert.
const migration_0_to_1: Migration = {
  from: 0,
  to: 1,
  run: () => {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && !isKnownKey(k)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  },
}

// v1 → v2: UserInfo-Shape bekommt `username`. Storage-Keys bleiben unverändert —
// der Username kommt aus /pwa/me beim nächsten App-Load. Kein Wipe nötig.
const migration_1_to_2: Migration = {
  from: 1,
  to: 2,
  run: () => {
    // no-op
  },
}

// v2 → v3: Project-Shape ändert sich (customer via FK-Embed statt denormalisiert;
// Kontakt-Feld `rolle` → `kommentar`). Gecachte Listen sind nicht in localStorage —
// no-op reicht, damit versionsbasierte Fallback-Wipes bei unbekannten Clients greifen.
const migration_2_to_3: Migration = {
  from: 2,
  to: 3,
  run: () => {
    // no-op
  },
}

// v3 → v4: Auth-Token wandert vom localStorage in ein httpOnly-Cookie (XSS-Härtung).
// Bestehende Tokens in localStorage werden gelöscht — Nutzer muss sich ggf. neu
// einloggen. Cookie wird vom Server beim nächsten Login frisch gesetzt.
const migration_3_to_4: Migration = {
  from: 3,
  to: 4,
  run: () => {
    localStorage.removeItem(SK.TOKEN)
  },
}

// v4 → v5: Project-Shape bekommt `kind` (Einsatz-Art für interne Einträge).
// Project-Listen werden nicht in localStorage gehalten — no-op reicht, dient
// als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_4_to_5: Migration = {
  from: 4,
  to: 5,
  run: () => {
    // no-op
  },
}

// v5 → v6: UserInfo bekommt `enabled_modules` (Tenant-Module-Flags).
// Wird vom Server bei nächstem /pwa/me-Call mitgeliefert — no-op reicht,
// dient als Tripwire für Fallback-Wipes älterer Clients ohne enabled_modules.
const migration_5_to_6: Migration = {
  from: 5,
  to: 6,
  run: () => {
    // no-op
  },
}

// v6 → v7: Neuer localStorage-Key `projektEntwurf_offline_queue` für
// offline gespeicherte Projekt-Entwürfe vom Mitarbeiter beim Kunden vor Ort.
// Keine Migration nötig — Key existiert nur, wenn Mitarbeiter offline einen
// Entwurf gespeichert hat. Tripwire für ältere Clients.
const migration_6_to_7: Migration = {
  from: 6,
  to: 7,
  run: () => {
    // no-op
  },
}

// v7 → v8: Project-Shape ändert sich — local_contact_name/local_contact_phone
// fallen weg, Baustellenkontakt lebt jetzt als is_site_contact-Eintrag in
// kontakte[] (siehe Migration 20260516d). Project-Listen sind nicht in
// localStorage — no-op reicht als Tripwire für Fallback-Wipes älterer Clients.
const migration_7_to_8: Migration = {
  from: 7,
  to: 8,
  run: () => {
    // no-op
  },
}

// v8 → v9: Neuer localStorage-Key `hinweise_offline_queue` für offline
// abgehakte Projekt-Aufgaben (Monteur auf der Baustelle ohne Netz). Keine
// Migration nötig — Key existiert nur, wenn offline abgehakt wurde. Tripwire
// für ältere Clients.
const migration_8_to_9: Migration = {
  from: 8,
  to: 9,
  run: () => {
    // no-op
  },
}

// v9 → v10: QuoteDraft bekommt skontoPct/skontoDays (Skonto-Hinweis auf der Offerte).
// Felder sind additiv; applyDraft liest sie mit Fallback ('' bei fehlend) — kein Wipe
// nötig. No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_9_to_10: Migration = {
  from: 9,
  to: 10,
  run: () => {
    // no-op
  },
}

// v10 → v11: Neuer localStorage-Key-Prefix `rapport-draft:` für den lokalen
// Rapport-Zwischenstand (pro Mitarbeiter). Rein additiv — der Key existiert nur,
// wenn gerade ein Rapport in Arbeit ist, und wird per Staleness (12h) selbst
// bereinigt. No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_10_to_11: Migration = {
  from: 10,
  to: 11,
  run: () => {
    // no-op
  },
}

// v11 → v12: RapportDraft bekommt `summaryItems` (Hauptmaterialien aus der
// Zusammenfassung, für die Gesamt-Übersicht vor dem Speichern). Additiv —
// loadDraft liest das Feld mit Fallback ([] bei fehlend), kein Wipe nötig.
// No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_11_to_12: Migration = {
  from: 11,
  to: 12,
  run: () => {
    // no-op
  },
}

// v12 → v13: ExtraProductRow (im quote-draft:*) benennt die Kalkulations-Metadaten um —
// ek_price:number/margin_factor:number → ek:string/margin_pct:string (editierbare Felder
// für EK + Aufschlag % an der freien Position). Der Preis selbst (unit_price) bleibt
// unverändert erhalten; ein alter Entwurf verliert beim Fortsetzen nur die noch nicht
// gespeicherte EK/Marge-Vorbelegung (die Felder erscheinen leer). Kein Wipe nötig —
// die alten number-Felder werden schlicht ignoriert. No-op als Tripwire für ältere Clients.
const migration_12_to_13: Migration = {
  from: 12,
  to: 13,
  run: () => {
    // no-op
  },
}

// v13 → v14: Neuer localStorage-Key `helpbubble-pos` für die gemerkte Drag-Position
// der schwebenden Hilfe-Blase. Rein additiv — der Key existiert nur, wenn der FAB
// verschoben wurde, und wird beim Lesen defensiv geparst (Default-Ecke bei fehlend/
// korrupt). Kein Wipe nötig. No-op dient als Tripwire für Fallback-Wipes älterer Clients.
const migration_13_to_14: Migration = {
  from: 13,
  to: 14,
  run: () => {
    // no-op
  },
}

// v14 → v15: RapportDraft bekommt `reportSigned` (wurde der gespeicherte Rapport
// unterschrieben oder die Unterschrift übersprungen?). Steuert den «Rapport löschen»-
// Knopf im Abschluss-Schritt. Additiv — loadDraft liest das Feld mit Fallback
// (fehlend = nicht unterschrieben), und der Server prüft das Recht ohnehin selbst.
// No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_14_to_15: Migration = {
  from: 14,
  to: 15,
  run: () => {
    // no-op
  },
}

// v15 → v16: Neuer localStorage-Key `schedule-week-zoom` für die gewählte
// Zeilenhöhe (Zoom-Stufe) des Wochen-Zeitrasters in der Einsatzplanung. Rein
// additiv — der Key existiert nur, wenn der Zoom verstellt wurde, und wird beim
// Lesen defensiv geparst (Default-Stufe bei fehlend/korrupt). Kein Wipe nötig.
// No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_15_to_16: Migration = {
  from: 15,
  to: 16,
  run: () => {
    // no-op
  },
}

// v16 → v17: Neuer localStorage-Key `schedule-gantt-zoom` für die gewählte
// Stundenbreite des Tagesplans (Gantt) in der Einsatzplanung. Wie beim
// Wochen-Zoom rein additiv und defensiv geparst — kein Wipe nötig.
// No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_16_to_17: Migration = {
  from: 16,
  to: 17,
  run: () => {
    // no-op
  },
}

// v17 → v18: RapportDraft bekommt den Leistungsart-Zwischenschritt
// (`workTypesCollected`, `collectedWorkTypes`, `suggestedWorkTypes`) — der Monteur
// kreuzt vor dem Speichern an, was er gemacht hat (reports.art_der_arbeit,
// Migration 20260809). Rein additiv, alle drei Felder optional mit Fallback: ein
// Draft aus der Vorversion beginnt den Schritt neu, das ist ein Klick, kein
// Datenverlust. No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_17_to_18: Migration = {
  from: 17,
  to: 18,
  run: () => {
    // no-op
  },
}

// v18 → v19: Neuer localStorage-Key `schedule-gantt-span` für den sichtbaren
// Zeitraum des Tagesplans (1/3/5 Tage). Wie beim Gantt-Zoom rein additiv und
// defensiv geparst (Default 5 Tage bei fehlend/korrupt) — kein Wipe nötig.
// No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_18_to_19: Migration = {
  from: 18,
  to: 19,
  run: () => {
    // no-op
  },
}

// v19 → v20: QuoteDraft bekommt `skontoActive` (Häkchen "Skonto ausweisen" auf der
// Offerte). Rein additiv und optional — applyDraft leitet den Wert bei fehlendem Feld
// aus skontoPct ab (gefüllter Satz hiess in der Vorversion "Skonto an"), es geht also
// kein Entwurf verloren. No-op dient als Tripwire für Fallback-Wipes auf älteren Clients.
const migration_19_to_20: Migration = {
  from: 19,
  to: 20,
  run: () => {
    // no-op
  },
}

// v20 → v21: neuer Key `schedule-map-period` (Zeitraum der Auftragskarte, in
// Wochen ab heute). Rein additiv — fehlt der Key, greift der Default von drei
// Wochen. No-op als Tripwire, damit ältere Clients keinen Fallback-Wipe fahren,
// nur weil sie eine Ansicht nicht kennen.
const migration_20_to_21: Migration = {
  from: 20,
  to: 21,
  run: () => {
    // no-op
  },
}

const MIGRATIONS: Migration[] = [migration_0_to_1, migration_1_to_2, migration_2_to_3, migration_3_to_4, migration_4_to_5, migration_5_to_6, migration_6_to_7, migration_7_to_8, migration_8_to_9, migration_9_to_10, migration_10_to_11, migration_11_to_12, migration_12_to_13, migration_13_to_14, migration_14_to_15, migration_15_to_16, migration_16_to_17, migration_17_to_18, migration_18_to_19, migration_19_to_20, migration_20_to_21]

function readVersion(): number {
  const raw = localStorage.getItem(STORAGE_VERSION_KEY)
  const n = raw === null ? 0 : parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

function wipeExceptAuth(): void {
  const keep: Record<string, string> = {}
  for (const k of SURVIVE_WIPE) {
    const v = localStorage.getItem(k)
    if (v !== null) keep[k] = v
  }
  localStorage.clear()
  for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v)
}

export function runStorageMigrations(): void {
  try {
    let current = readVersion()
    if (current === APP_DATA_VERSION) return

    // Zukunfts-Version gespeichert (z. B. nach Rollback): Wipe ist sicherer
    // als blind weiterlaufen mit unbekanntem Shape.
    if (current > APP_DATA_VERSION) {
      wipeExceptAuth()
      localStorage.setItem(STORAGE_VERSION_KEY, String(APP_DATA_VERSION))
      return
    }

    while (current < APP_DATA_VERSION) {
      const step = MIGRATIONS.find(m => m.from === current)
      if (!step) {
        // Keine definierte Migration → selektiver Wipe als Fallback.
        // Nutzer bleibt via Token eingeloggt, App startet mit frischem State.
        wipeExceptAuth()
        current = APP_DATA_VERSION
        break
      }
      step.run()
      current = step.to
    }
    localStorage.setItem(STORAGE_VERSION_KEY, String(APP_DATA_VERSION))
  } catch (err) {
    // Niemals die App wegen Migration-Bug blockieren.
    console.error('[storageMigrations] failed', err)
  }
}

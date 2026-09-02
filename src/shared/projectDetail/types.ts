// Projekt-Typen, die BEIDE Sichten teilen (Charge H5).
//
// Dieselben Zeilen kommen aus zwei Endpoint-Familien: `/pwa/projects…` für die
// Monteur-PWA und `/pwa/admin/projects…` für die Verwaltung. Der Rechte-Filter
// dahinter unterscheidet sich (der Monteur sieht z.B. keine Lieferanten-Angebote,
// siehe ADMIN_ONLY_FILE_CATEGORIES in agents/routers/_deps.py) — die Form der
// Antwort nicht. Bis hierher stand sie zweimal da; eine Ergänzung am einen Ende
// hätte am anderen gefehlt.

export type ProjectKind =
  | 'project' | 'teamsitzung' | 'lagerarbeit' | 'werkstatt'
  | 'weiterbildung' | 'reservation' | 'blocker' | 'sonstiges'

/** Beschriftung je Einsatz-Art — in beiden Sichten dieselbe.
 *
 *  Die FARBEN dazu sind es bewusst nicht: die Verwaltung zeichnet ihre Pillen aus
 *  den --kind-*-Variablen der Tenant-Config (admin/operative/scheduleShared.ts),
 *  die Monteur-PWA hat ihre eigene Palette. */
export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  project: 'Projekt',
  teamsitzung: 'Teamsitzung',
  lagerarbeit: 'Lagerarbeit',
  werkstatt: 'Werkstatt',
  weiterbildung: 'Weiterbildung',
  // Vormerkung eines Monteurs, ohne dass schon feststeht wofür — belegt
  // Kapazität wie jeder andere interne Einsatz.
  reservation: 'Reservation',
  // Provisorisch geplante Arbeit, deren Projektzuordnung noch offen ist
  // ("evtl. Baustelle Müller"). Belegt Zeit, wird aber schraffiert gezeichnet.
  blocker: 'Blocker',
  sonstiges: 'Sonstiges',
}

export interface Kontakt {
  name: string
  kommentar: string
  telefon: string
  email: string
  is_site_contact?: boolean
  // Aus dem Kundenstamm übernommen (Projektmaske: Vorschlag beim Tippen des
  // Namens). Trägt die id des Kunden, aus dem Name/Telefon/E-Mail stammen — wird
  // in projects.kontakte mitgespeichert. Fehlt/null = frei erfasste Person; nur
  // für die fragt die Maske nach dem Anlegen des Projekts, ob sie als Kunde in
  // den Stamm soll (admin/operative/projectDetail/kontaktKundenstamm.ts).
  customer_id?: string | null
  // Vom Backend gesetzt, wenn das Projekt keine eigene Ansprechperson hat und der
  // Kundenstamm eingesprungen ist (db.project_contacts_with_customer_fallback).
  // Nicht persistiert — kommt bei jedem Request frisch aus dem Kunden-Embed.
  from_customer?: boolean
}

// Kunden-Embed der Projekt-Antwort (PostgREST-Join) — schlanker als der
// vollständige Kunde aus api/admin/customers.
export interface EmbeddedCustomer {
  id: string
  name: string | null
  billing_name: string | null
  address: string | null
  billing_address: string | null
  object_address: string | null
  email: string | null
  phone: string | null
}

// ─── Dateien am Projekt ─────────────────────────────────────

export type ProjectFileCategory =
  | 'fotos'
  | 'masse'
  | 'sonstiges'
  | 'angebot_lieferant'
  | 'bestellungen'
  | 'auftragsbestaetigung' // AB des LIEFERANTEN an uns (Lieferantendokument, admin-only)
  | 'lieferschein'
  | 'anhang'
  | 'prospekt' // Altbestand: frühere Kategorie der Offerten-Anhänge, wird unter 'anhang' angezeigt
  | 'rapport'  // eingescanntes Papier-Blatt oder Rapport aus einem Fremdsystem (z.B. Sorba)
  | 'offerte'  // eingescannte/externe Offerte, die nicht im System erstellt wurde
  // UNSERE Auftragsbestätigung an den Kunden: das PDF, das der Versand-Knopf erzeugt
  // und mitschickt (inhaltlich die Offerte). Steht im Offerten-Tab, weil es die
  // Fortsetzung der Offerte ist — nicht zu verwechseln mit 'auftragsbestaetigung'.
  | 'auftragsbestaetigung_kunde'

export interface ProjectFile {
  id: string
  filename: string
  storage_path?: string | null
  mime_type: string | null
  category: ProjectFileCategory | null
  created_at: string
}

/** Beschriftung je Kategorie. Die Verwaltung gliedert damit ihre Reiter, die
 *  Monteur-PWA schreibt sie unter den Dateinamen. Ein Eintrag, zwei Sichten. */
export const CATEGORY_LABELS: Record<ProjectFileCategory, string> = {
  fotos: 'Fotos',
  masse: 'Masse',
  sonstiges: 'Sonstiges',
  angebot_lieferant: 'Angebote Lieferant',
  bestellungen: 'Bestellungen',
  auftragsbestaetigung: 'Auftragsbestätigung Lieferant',
  lieferschein: 'Lieferschein',
  anhang: 'Anhang',
  prospekt: 'Prospekt',
  rapport: 'Rapport',
  offerte: 'Offerte',
  auftragsbestaetigung_kunde: 'Auftragsbestätigung',
}

// ─── Kommentare am Projekt ──────────────────────────────────

// Kurze Notizen im Projekt-Detail; Monteure schreiben sie über die PWA mit. Nicht
// zu verwechseln mit den Kunden-Kommentaren in api/admin/customers.
export interface ProjectComment {
  id: string
  author_name: string | null
  text: string
  created_at: string
  // Nur die Verwaltung zeigt Bearbeitungen an; die Monteur-PWA liest das Feld nicht.
  updated_at?: string | null
}

// ─── Projektzeile der Monteur-PWA ───────────────────────────

// Die Form von `GET /pwa/projects` — die zugewiesenen offenen Projekte des
// Monteurs (`_assigned_open_projects` in agents/routers/admin_projects.py).
//
// Sie steht hier statt im ProjekteScreen, weil sie inzwischen einen zweiten
// Leser hat: das Offline-Lesepaket (api/offlineStore.ts) legt genau diese Zeilen
// ab. Bliebe sie im Screen, importierte der Store aus dem Screen, der ihn selbst
// importiert — ein Zyklus für einen reinen Typ.
export interface MonteurProject {
  id: string
  name: string
  // Projektnummer ("2600559"). Das Einzige, was zwei gleichnamige Projekte
  // unterscheidbar macht — Namen dürfen sich doppeln — und die Antwort, die der
  // Rapport-Bot bei mehrdeutigem Namen verlangt. Kann bei Alt-Zeilen fehlen.
  project_id_text?: string | null
  kind: ProjectKind
  art_der_arbeit: string[] | null
  customer_id: string | null
  customer: EmbeddedCustomer | null
  object_name: string | null
  object_address: string | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  kontakte: Kontakt[]
  bemerkung: string | null
  geruestfach: number | null
  // Vom Backend gesetzt (Feature rapport_offerten_annahme_pflicht): das Projekt hat
  // mindestens eine nicht-archivierte Offerte, aber keine ist angenommen. Der
  // Rapport-Knopf ist dann gesperrt. Fehlt das Feld (ältere API), gilt "nicht gesperrt".
  rapport_blocked?: boolean
  // Server-seitig aus projektleiter_id aufgelöst — wen der Monteur bei Rückfragen
  // anruft. Null/fehlend, wenn dem Projekt kein Projektleiter zugewiesen ist.
  projektleiter_name?: string | null
}

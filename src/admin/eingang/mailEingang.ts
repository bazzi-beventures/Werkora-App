/**
 * Reine Hilfen des Screens «Eingang» — ohne React, unit-getestet.
 *
 * Spec: docs/specs/mail-eingang-triage.md §4 (Vorschläge), §6.4 (Absender),
 * §10 (Oberfläche).
 */
import type {
  EingangAnhang, EingangItem, EingangProjekt, EingangVorschlag, ProjektEntwurfPayload, VorschlagTyp,
} from '../../api/admin/mailEingang'
import type { ProjectTab } from '../operative/projectDetail/ProjectTabBar'

// ─── Beschriftungen ─────────────────────────────────────────────────────────

const TYP_TITEL: Record<VorschlagTyp, string> = {
  projekt_entwurf: 'Projekt-Entwurf anlegen',
  projektnotiz: 'Notiz am Projekt',
  kundennotiz: 'Notiz beim Kunden',
  kontakt_ergaenzen: 'Kontakt ergänzen',
  projektdokument: 'Anhang am Projekt ablegen',
}

/** Kennt der Client diesen Vorschlagstyp? Die Liste ist abschliessend (Spec §4.1);
 *  ein Typ, den erst ein neuerer Server kennt, lässt sich hier nur verwerfen. */
export function istBekannterTyp(typ: string): typ is VorschlagTyp {
  return Object.prototype.hasOwnProperty.call(TYP_TITEL, typ)
}

export function typTitel(typ: string): string {
  return istBekannterTyp(typ) ? TYP_TITEL[typ] : 'Unbekannter Vorschlag'
}

const KATEGORIE_LABEL: Record<string, string> = {
  neue_anfrage: 'Neue Anfrage',
  laufendes_projekt: 'Laufendes Projekt',
}

export function kategorieLabel(kategorie: string): string {
  return KATEGORIE_LABEL[kategorie] ?? kategorie
}

const ITEM_STATUS: Record<string, { label: string; badge: string }> = {
  offen: { label: 'Offen', badge: 'admin-badge-open' },
  erledigt: { label: 'Erledigt', badge: 'admin-badge-approved' },
  verworfen: { label: 'Verworfen', badge: 'admin-badge-draft' },
}

export function itemStatus(status: string): { label: string; badge: string } {
  return ITEM_STATUS[status] ?? { label: status, badge: 'admin-badge-draft' }
}

/**
 * Die Felder des Entwurfs in der Reihenfolge der Maske. `max` spiegelt
 * `ENTWURF_GRENZEN` aus services/mail_eingang_regeln.py: der Server kappt
 * Längeres still, also lässt die Maske es gar nicht erst zu.
 */
export const ENTWURF_FELDER: readonly {
  key: keyof ProjektEntwurfPayload; label: string; max: number; mehrzeilig?: boolean
}[] = [
  { key: 'title', label: 'Titel', max: 200 },
  { key: 'customer_name', label: 'Kunde', max: 200 },
  { key: 'customer_phone', label: 'Telefon', max: 80 },
  { key: 'customer_email', label: 'E-Mail', max: 200 },
  { key: 'customer_address', label: 'Adresse des Kunden', max: 500 },
  { key: 'object_name', label: 'Objekt', max: 200 },
  { key: 'object_address', label: 'Adresse des Objekts', max: 500 },
  { key: 'description', label: 'Beschreibung', max: 4000, mehrzeilig: true },
]

/** Längste Notiz (`NOTIZ_MAX` auf dem Server). */
export const NOTIZ_MAX = 4000

// ─── Anzeige ────────────────────────────────────────────────────────────────

/** Eingang als «12.11.26, 14:05»; leer bei unlesbarem Datum. */
export function fmtWann(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** «Petra Büro (petra@firma.ch)», nur die Adresse oder nur der Name; `null` ohne beides. */
export function personText(p: { name?: string | null; email?: string | null } | null | undefined): string | null {
  const name = p?.name?.trim() ?? ''
  const email = p?.email?.trim() ?? ''
  if (name && email) return `${name} (${email})`
  return name || email || null
}

/** Neueste Mail zuoberst — unabhängig davon, wie der Server sortiert. */
export function neuesteZuerst<T extends Pick<EingangItem, 'received_at'>>(items: readonly T[]): T[] {
  const zeit = (iso: string) => {
    const t = Date.parse(iso)
    return Number.isNaN(t) ? 0 : t
  }
  return [...items].sort((a, b) => zeit(b.received_at) - zeit(a.received_at))
}

export function offeneVorschlaege(item: Pick<EingangItem, 'suggestions'>): number {
  return item.suggestions.filter(v => v.status === 'offen').length
}

export function projektText(p: EingangProjekt): string {
  return [p.number, p.name].filter(Boolean).join(' · ')
}

/** Dateigrösse lesbar: «120 KB», «2.1 MB» (Basis 1024, wie bei den übrigen Dokumenten). */
export function fmtGroesse(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** «Auftrag.pdf (120 KB, gelesen)» — `gelesen`: der Text ist in die Vorschläge eingeflossen. */
export function anhangText(a: EingangAnhang): string {
  const zusatz = [fmtGroesse(a.size), a.gelesen ? 'gelesen' : ''].filter(Boolean).join(', ')
  const name = a.name?.trim() || '(ohne Namen)'
  return zusatz ? `${name} (${zusatz})` : name
}

/** Die Anhänge einer Mail in einer Zeile; `null`, wenn sie keine hat. */
export function anhaengeText(anhaenge: readonly EingangAnhang[] | null | undefined): string | null {
  return anhaenge && anhaenge.length > 0 ? anhaenge.map(anhangText).join(', ') : null
}

// ─── Eingabe und Übernehmen ─────────────────────────────────────────────────

/** Was das Büro an einem Vorschlag ändern darf, als Formularzustand. */
export interface VorschlagEingabe {
  /** Die überschreibbaren Textfelder des Typs. */
  felder: Record<string, string>
  /** Nur `projektnotiz` und `projektdokument`: das gewählte Projekt. */
  projekt: EingangProjekt | null
}

export function startEingabe(v: EingangVorschlag): VorschlagEingabe {
  switch (v.typ) {
    case 'projekt_entwurf':
      return {
        felder: Object.fromEntries(ENTWURF_FELDER.map(f => [f.key, v.payload[f.key] ?? ''])),
        projekt: null,
      }
    case 'projektnotiz':
      return {
        felder: { text: v.payload.text ?? '' },
        projekt: (v.payload.projects ?? []).find(p => p.project_id === v.payload.project_id) ?? null,
      }
    case 'kundennotiz':
      return { felder: { text: v.payload.text ?? '' }, projekt: null }
    case 'projektdokument':
      return {
        felder: {},
        projekt: (v.payload.projects ?? []).find(p => p.project_id === v.payload.project_id) ?? null,
      }
    default:
      return { felder: {}, projekt: null }
  }
}

/**
 * Was dem Übernehmen noch fehlt — `null`, wenn es losgehen kann.
 *
 * Die Projektwahl ist die eine harte Bedingung des Vertrags: ohne zugeordnetes
 * Projekt **muss** das Büro eines wählen. Der Rest verhindert leere Objekte.
 */
export function fehltZumUebernehmen(v: EingangVorschlag, e: VorschlagEingabe): string | null {
  const leer = (key: string) => !(e.felder[key] ?? '').trim()
  switch (v.typ) {
    case 'projekt_entwurf':
      if (leer('title')) return 'Der Entwurf braucht einen Titel.'
      if (leer('customer_name')) return 'Der Entwurf braucht einen Kunden.'
      return null
    case 'projektnotiz':
      if (!e.projekt && !v.payload.project_id) return 'Bitte zuerst das Projekt wählen.'
      if (leer('text')) return 'Die Notiz ist leer.'
      return null
    case 'kundennotiz':
      return leer('text') ? 'Die Notiz ist leer.' : null
    case 'projektdokument':
      return !e.projekt && !v.payload.project_id ? 'Bitte zuerst das Projekt wählen.' : null
    case 'kontakt_ergaenzen':
      return null
    default:
      return 'Diesen Vorschlag kennt die App noch nicht — er lässt sich nur verwerfen.'
  }
}

/**
 * Der Body fürs Übernehmen: **nur**, was das Büro geändert hat, und nur die
 * Felder, die der Server je Typ zulässt. `undefined` = unverändert übernehmen.
 */
export function acceptPayload(v: EingangVorschlag, e: VorschlagEingabe): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  const geaendert = (key: string, original: string | null | undefined) => {
    const neu = (e.felder[key] ?? '').trim()
    if (neu !== (original ?? '').trim()) out[key] = neu
  }
  switch (v.typ) {
    case 'projekt_entwurf':
      for (const f of ENTWURF_FELDER) geaendert(f.key, v.payload[f.key])
      break
    case 'projektnotiz':
      if (e.projekt && e.projekt.project_id !== v.payload.project_id) out.project_id = e.projekt.project_id
      geaendert('text', v.payload.text)
      break
    case 'kundennotiz':
      geaendert('text', v.payload.text)
      break
    case 'projektdokument':
      // Überschreibbar ist nur das Projekt — Datei und Anhang stehen fest.
      if (e.projekt && e.projekt.project_id !== v.payload.project_id) out.project_id = e.projekt.project_id
      break
    default:
      // kontakt_ergaenzen: nichts überschreibbar — gespeichert wird im
      // Kundenformular, das Übernehmen bestätigt danach nur.
      break
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Beschriftung des Übernehmen-Knopfs. Zwei Typen tun dabei etwas anderes als
 * «der Vorschlag wird zum Objekt»: der Anhang wird erst jetzt aus dem Postfach
 * geholt und abgelegt (das dauert), und «Kontakt ergänzen» öffnet das
 * Kundenformular — übernommen ist er erst, wenn dort gespeichert wurde (§4.2).
 */
export function uebernehmenLabel(typ: string, laeuft: boolean): string {
  if (typ === 'projektdokument') return laeuft ? 'Wird abgelegt…' : 'Übernehmen'
  if (typ === 'kontakt_ergaenzen') return laeuft ? 'Wird bestätigt…' : 'Im Kundenformular öffnen'
  return laeuft ? 'Wird übernommen…' : 'Übernehmen'
}

/**
 * Die Meldung des Servers, wenn sie ein Satz ist («Diesen Kunden gibt es nicht
 * (mehr).») — `null` bei einem blossen Fehlercode wie `nicht_mehr_offen`, den
 * niemand lesen soll.
 */
export function serverSatz(message: string | null | undefined): string | null {
  const m = (message ?? '').trim()
  return /\s/.test(m) ? m : null
}

// ─── Nach dem Entscheid ─────────────────────────────────────────────────────

/** «Übernommen von Petra Büro am 12.11.26, 14:05» — `null`, solange offen. */
export function entscheidText(v: Pick<EingangVorschlag, 'status' | 'decided_by_name' | 'decided_at'>): string | null {
  if (v.status === 'offen') return null
  const verb = v.status === 'uebernommen' ? 'Übernommen' : 'Verworfen'
  const von = v.decided_by_name?.trim() ? ` von ${v.decided_by_name.trim()}` : ''
  const wann = fmtWann(v.decided_at)
  return `${verb}${von}${wann ? ` am ${wann}` : ''}`
}

/** Wo das Ergebnis eines übernommenen Vorschlags liegt (Spec §4.1, rechte Spalte). */
export function ergebnisHinweis(v: EingangVorschlag): string | null {
  if (v.status !== 'uebernommen') return null
  switch (v.typ) {
    case 'projekt_entwurf':
      return 'Liegt unter Projekt-Entwürfe und wird dort wie jeder andere Entwurf umgewandelt.'
    case 'projektnotiz': {
      const p = (v.payload.projects ?? []).find(x => x.project_id === v.payload.project_id)
      return p
        ? `Steht als Kommentar am Projekt ${projektText(p)}.`
        : 'Steht als Kommentar am Projekt.'
    }
    case 'kundennotiz':
      return `Steht als Kommentar beim Kunden ${v.payload.customer_name}.`
    case 'kontakt_ergaenzen':
      return `Im Kundenstamm bei ${v.payload.customer_name} gespeichert (${v.payload.feld_label}).`
    case 'projektdokument':
      return 'Liegt bei den Projektdokumenten.'
    default:
      return null
  }
}

/** Wohin der Knopf neben dem Hinweis führt — `null`, wenn es kein Ziel gibt. */
export type ErgebnisZiel =
  | { screen: 'project-drafts'; label: string }
  | { screen: 'projects' | 'customers'; detailId: string; label: string; tab?: ProjectTab }

export function ergebnisZiel(v: EingangVorschlag): ErgebnisZiel | null {
  if (v.status !== 'uebernommen') return null
  switch (v.typ) {
    case 'projekt_entwurf':
      return { screen: 'project-drafts', label: 'Zu den Projekt-Entwürfen' }
    case 'projektnotiz':
      return v.payload.project_id
        ? { screen: 'projects', detailId: v.payload.project_id, label: 'Projekt öffnen' }
        : null
    case 'projektdokument':
      // Gleich auf den Reiter «Dokumente» — dort liegt die Datei.
      return v.payload.project_id
        ? { screen: 'projects', detailId: v.payload.project_id, label: 'Projekt öffnen', tab: 'documents' }
        : null
    case 'kundennotiz':
    case 'kontakt_ergaenzen':
      return v.payload.customer_id != null && v.payload.customer_id !== ''
        ? { screen: 'customers', detailId: String(v.payload.customer_id), label: 'Kunde öffnen' }
        : null
    default:
      return null
  }
}

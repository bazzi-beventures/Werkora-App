import type { Customer, CustomerInput } from '../../../api/admin/customers'
import type { Kontakt } from '../../../api/admin/projects'
import { normalize } from '../customerMatch'

// Ansprechpersonen und Kundenstamm — die Logik hinter dem Namensfeld der
// Projektmaske (DetailsForm → KontaktNameInput) und der Nachfrage nach dem
// Speichern (CustomerFromKontaktDialog). Bewusst ohne React: alles hier ist
// direkt testbar.
//
// Der Ablauf, den diese Datei trägt:
//
// 1. Beim Tippen des Namens werden Treffer aus dem Kundenstamm vorgeschlagen.
//    Ein Kunde kann dabei bis zu DREI Personen liefern — sich selbst, seinen
//    Baustellenkontakt und den Eigentümer-Kontakt —, denn wer im Projekt
//    «Hausabwart Meier» einträgt, meint oft den local_contact eines Stammkunden,
//    nicht den Kunden selbst.
// 2. Ein Klick auf einen Vorschlag füllt Name/Telefon/E-Mail und verknüpft die
//    Zeile über `customer_id` mit dem Kunden. Wird der Name danach von Hand
//    geändert, fällt die Verknüpfung weg (useProjectForm.updateKontakt) — sonst
//    stünde ein fremder Kunde hinter einem frei getippten Namen.
// 3. Kein Treffer → die Zeile bleibt freier Text, wie bisher.
// 4. Nach dem Speichern fragt die Maske für jede NEU erfasste, unverknüpfte
//    Person, ob sie als Kunde in den Stamm soll (`kontakteOhneKundenstamm`).
//    «Neu» heisst: nicht schon im Ausgangsstand der Maske — ein bestehendes
//    Projekt mit drei frei erfassten Personen würde sonst bei jedem Speichern
//    dreimal nachfragen.

/** Woher eine vorgeschlagene Person im Kundenstamm stammt. */
export type KontaktCandidateRole = 'kunde' | 'baustellenkontakt' | 'eigentuemer'

export interface KontaktCandidate {
  customerId: string
  /** Name des Stammkunden — zur Einordnung in der Vorschlagsliste. */
  customerName: string
  role: KontaktCandidateRole
  name: string
  telefon: string
  email: string
}

export const ROLE_LABELS: Record<KontaktCandidateRole, string> = {
  kunde: 'Kunde',
  baustellenkontakt: 'Baustellenkontakt',
  eigentuemer: 'Eigentümer',
}

/** Kürzeste sinnvolle Suche — bei einem Buchstaben trifft die halbe Kundschaft. */
export const MIN_QUERY_LENGTH = 2
const MAX_CANDIDATES = 8

/** Alle Personen, die ein Stammkunde zur Auswahl beisteuert. */
export function candidatesOf(c: Customer): KontaktCandidate[] {
  const out: KontaktCandidate[] = [{
    customerId: c.id,
    customerName: c.name,
    role: 'kunde',
    name: c.name,
    telefon: c.phone || c.phone_landline || '',
    email: c.email ?? '',
  }]
  if (c.local_contact_name?.trim()) {
    out.push({
      customerId: c.id,
      customerName: c.name,
      role: 'baustellenkontakt',
      name: c.local_contact_name.trim(),
      telefon: c.local_contact_phone ?? '',
      email: '',
    })
  }
  if (c.owner_contact_name?.trim()) {
    out.push({
      customerId: c.id,
      customerName: c.name,
      role: 'eigentuemer',
      name: c.owner_contact_name.trim(),
      telefon: c.owner_contact_phone ?? '',
      email: '',
    })
  }
  return out
}

// Rang eines Treffers: identischer Name vor Namensanfang vor «kommt irgendwo
// vor». Die Firma zählt nur als Heuhaufen (damit «Zimmerli» die «Zimmerli AG»
// findet), nicht für die Reihenfolge.
function rank(cand: KontaktCandidate, query: string): number {
  const n = normalize(cand.name)
  if (n === query) return 0
  if (n.startsWith(query)) return 1
  return 2
}

/**
 * Vorschläge zum getippten Namen. Jedes Wort der Eingabe muss in Name, Firma
 * oder Kundenname vorkommen (UND-Logik wie in der CustomerCombobox) — «Meier
 * Hausabwart» trifft also den Baustellenkontakt «Meier» des Kunden «Hausabwart
 * GmbH», aber nicht jeden Meier.
 */
export function searchKontaktCandidates(
  query: string,
  customers: readonly Customer[],
  limit = MAX_CANDIDATES,
): KontaktCandidate[] {
  const q = normalize(query)
  if (q.length < MIN_QUERY_LENGTH) return []
  const tokens = q.split(' ').filter(Boolean)
  const hits: { cand: KontaktCandidate; rank: number; order: number }[] = []
  let order = 0
  for (const c of customers) {
    const company = normalize(c.company ?? '')
    for (const cand of candidatesOf(c)) {
      const hay = `${normalize(cand.name)} ${company} ${normalize(cand.customerName)}`
      if (!tokens.every(t => hay.includes(t))) continue
      hits.push({ cand, rank: rank(cand, q), order: order++ })
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.order - b.order)
  return hits.slice(0, limit).map(h => h.cand)
}

/**
 * Vorschlag in die Kontakt-Zeile übernehmen. Telefon/E-Mail überschreiben nur,
 * wenn der Stamm etwas dazu weiss — eine bereits getippte Nummer soll ein
 * Kunde ohne Telefon nicht wegputzen. Der Kommentar wird nur vorbelegt, wenn er
 * leer ist und die Rolle etwas hergibt (Baustellenkontakt/Eigentümer).
 */
export function applyKontaktCandidate(k: Kontakt, cand: KontaktCandidate): Kontakt {
  return {
    ...k,
    name: cand.name,
    telefon: cand.telefon || k.telefon,
    email: cand.email || k.email,
    kommentar: k.kommentar || (cand.role === 'kunde' ? '' : ROLE_LABELS[cand.role]),
    customer_id: cand.customerId,
  }
}

function sameKontakt(a: Kontakt, b: Kontakt): boolean {
  return normalize(a.name) === normalize(b.name)
    && (a.telefon ?? '') === (b.telefon ?? '')
    && (a.email ?? '') === (b.email ?? '')
}

/**
 * Welche Ansprechpersonen nach dem Speichern zur Nachfrage «als Kunde anlegen?»
 * kommen: neu erfasst (nicht im Ausgangsstand), mit Namen, ohne Verknüpfung —
 * und ohne Stammkunden, der denselben Namen schon trägt. Letzteres fängt den
 * Fall ab, dass jemand den Namen abtippt statt den Vorschlag zu klicken: eine
 * Dublette im Stamm wäre schlimmer als eine fehlende Verknüpfung.
 */
export function kontakteOhneKundenstamm(
  baseline: readonly Kontakt[],
  current: readonly Kontakt[],
  customers: readonly Customer[],
): Kontakt[] {
  const known = new Set(customers.map(c => normalize(c.name)))
  return current.filter(k =>
    k.name?.trim()
    && !k.customer_id
    && !known.has(normalize(k.name))
    && !baseline.some(b => sameKontakt(b, k)),
  )
}

/** Nutzlast für POST /pwa/admin/customers aus einer Kontakt-Zeile. */
export function customerInputFromKontakt(k: Kontakt): CustomerInput {
  return {
    name: k.name.trim(),
    phone: k.telefon?.trim() || null,
    email: k.email?.trim() || null,
  }
}

/**
 * Kontaktliste nach dem Anlegen: die frisch erzeugten Kunden an ihre Zeilen
 * hängen. Zuordnung über den (normalisierten) Namen — mehr weiss der Dialog
 * nicht, und mehr braucht er nicht, weil `kontakteOhneKundenstamm` gleich
 * lautende Zeilen ohnehin als eine Person behandelt.
 */
export function linkKontakteToCustomers(
  kontakte: readonly Kontakt[],
  created: readonly { id: string; name: string }[],
): Kontakt[] {
  const byName = new Map(created.map(c => [normalize(c.name), c.id]))
  return kontakte.map(k => {
    if (k.customer_id) return k
    const id = byName.get(normalize(k.name ?? ''))
    return id ? { ...k, customer_id: id } : k
  })
}

/**
 * Welcher der neuen Kunden ans Projekt soll, wenn es noch keinen hat: der
 * Baustellenkontakt, sonst der erste. Hat das Projekt schon einen Kunden, bleibt
 * er — die Ansprechperson ist dann eine zweite Person (Hausabwart, Architekt),
 * kein Ersatz für den Rechnungsempfänger.
 */
export function customerToLink(
  projectCustomerId: string | null | undefined,
  kontakte: readonly Kontakt[],
  created: readonly { id: string; name: string }[],
): string | null {
  if (projectCustomerId || created.length === 0) return null
  const byName = new Map(created.map(c => [normalize(c.name), c.id]))
  const site = kontakte.find(k => k.is_site_contact && byName.has(normalize(k.name ?? '')))
  return site ? byName.get(normalize(site.name))! : created[0].id
}

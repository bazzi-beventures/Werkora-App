/**
 * Filter der Projektauswahl (Kunden-Rückmeldung) — reine Funktionen, ohne DOM
 * testbar. Die Oberfläche steht in RueckmeldungAuswahl.tsx.
 */
import type { AuswahlProjekt } from '../../api/rueckmeldung'

export type OfferteFilter = 'alle' | 'versendet' | 'nicht_versendet' | 'keine'
export type EmailFilter = 'alle' | 'mit' | 'ohne'
export type UmfrageFilter = 'alle' | 'offen' | 'angeschrieben' | 'beantwortet'

/** Darf die Zeile angehakt werden? Angeschrieben wird nur, wer noch **keine
 *  Offerte und keine Mail** hat: ohne Adresse geht keine Mail raus, ein Projekt
 *  mit Offerte (auch Entwurf) ist schon in Arbeit, und eine Adresse, die schon
 *  angeschrieben ist, bekommt keine zweite Mail. Der Server prüft dasselbe. */
export function auswaehlbar(p: AuswahlProjekt): boolean {
  return sperrGrund(p) === ''
}

export function sperrGrund(p: AuswahlProjekt): string {
  if (p.umfrage === 'beantwortet') return 'Hat bereits geantwortet'
  if (p.umfrage === 'gesendet') return 'Ist bereits angeschrieben'
  if (p.offerte !== 'keine') return 'Hat schon eine Offerte'
  if (!p.email) return 'Keine E-Mail-Adresse — telefonisch nachfassen'
  if (p.adresse_angeschrieben) {
    return p.adresse_angeschrieben_fuer
      ? `Adresse hat schon eine Mail (für ${p.adresse_angeschrieben_fuer})`
      : 'Adresse hat schon eine Mail (anderes Projekt)'
  }
  return ''
}

/** Angehakte Projekte, deren Adresse noch weitere anhakbare, aber NICHT
 *  angehakte Projekte hat. Nach dem Versand ist die Adresse gesperrt — diese
 *  Projekte bekämen dann nie eine Mail. Der Bestätigungsdialog warnt davor und
 *  bietet an, sie mitzunehmen (eine Verwaltung soll EINE Mail mit allen
 *  Objekten bekommen, nicht eine mit dem ersten). */
export function fehlendeGleicheAdresse(projekte: AuswahlProjekt[], auswahl: Set<string>): AuswahlProjekt[] {
  const adressen = new Set(
    projekte.filter((p) => auswahl.has(p.project_id) && auswaehlbar(p)).map((p) => p.email.toLowerCase()),
  )
  return projekte.filter((p) =>
    !auswahl.has(p.project_id) && auswaehlbar(p) && adressen.has(p.email.toLowerCase()))
}

export const OFFERTE_LABEL: Record<AuswahlProjekt['offerte'], string> = {
  versendet: 'versendet',
  entwurf: 'nur Entwurf',
  keine: 'keine',
}

export const UMFRAGE_LABEL: Record<AuswahlProjekt['umfrage'], string> = {
  '': '—',
  gesendet: 'angeschrieben',
  beantwortet: 'beantwortet',
  fehler: 'Versand fehlgeschlagen',
}

/** Text der Spalte «Umfrage» (Tabelle und CSV). Eine Adresse, die schon für
 *  ein anderes Projekt angeschrieben ist, steht hier im Klartext — vorher stand
 *  dort «—» neben einem grauen Haken, und das sah nach einem Fehler aus. */
export function umfrageText(p: AuswahlProjekt): string {
  return p.adresse_angeschrieben ? 'Adresse schon angeschrieben' : UMFRAGE_LABEL[p.umfrage]
}

export interface Filter {
  suche: string
  nurRegel: boolean
  offerte: OfferteFilter
  email: EmailFilter
  umfrage: UmfrageFilter
}

export const FILTER_START: Filter = {
  suche: '', nurRegel: true, offerte: 'alle', email: 'alle', umfrage: 'alle',
}

/** Reine Filterfunktion — getrennt, damit sie ohne DOM testbar ist. */
export function filtere(projekte: AuswahlProjekt[], f: Filter): AuswahlProjekt[] {
  const q = f.suche.trim().toLowerCase()
  return projekte.filter((p) => {
    if (f.nurRegel && !p.passt_regel) return false
    if (f.offerte === 'versendet' && p.offerte !== 'versendet') return false
    if (f.offerte === 'nicht_versendet' && p.offerte === 'versendet') return false
    if (f.offerte === 'keine' && p.offerte !== 'keine') return false
    if (f.email === 'mit' && !p.email) return false
    if (f.email === 'ohne' && p.email) return false
    // «Adresse schon angeschrieben» zählt als angeschrieben, nicht als offen —
    // die Zeile bekommt so oder so keine Mail mehr.
    if (f.umfrage === 'offen' && ((p.umfrage !== '' && p.umfrage !== 'fehler') || p.adresse_angeschrieben)) return false
    if (f.umfrage === 'angeschrieben' && p.umfrage !== 'gesendet' && !p.adresse_angeschrieben) return false
    if (f.umfrage === 'beantwortet' && p.umfrage !== 'beantwortet') return false
    if (!q) return true
    return [p.projekt_nr, p.projekt_name, p.kunde_name, p.email, p.objekt_adresse, ...p.offerten]
      .some((t) => (t || '').toLowerCase().includes(q))
  })
}

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
  if (p.adresse_angeschrieben) return 'Adresse hat schon eine Mail (anderes Projekt)'
  return ''
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
    if (f.umfrage === 'offen' && p.umfrage !== '' && p.umfrage !== 'fehler') return false
    if (f.umfrage === 'angeschrieben' && p.umfrage !== 'gesendet') return false
    if (f.umfrage === 'beantwortet' && p.umfrage !== 'beantwortet') return false
    if (!q) return true
    return [p.projekt_nr, p.projekt_name, p.kunde_name, p.email, p.objekt_adresse, ...p.offerten]
      .some((t) => (t || '').toLowerCase().includes(q))
  })
}

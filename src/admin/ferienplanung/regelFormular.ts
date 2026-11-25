// Formulierungshilfe für Ferien-Regeln (docs/specs/ferienplanung.md §4.2): die Maske
// bietet Sätze an («Person A nicht gleichzeitig mit Person B», «aus Gruppe X
// höchstens n»), gespeichert wird immer eine der drei Arten aus dem Backend.
// Rein, getestet in regelFormular.test.ts.
import type { FerienRegel } from '../../api/admin/ferienplanung'

export type Formulierung = 'personen_nicht_gleichzeitig' | 'gruppe_max' | 'gruppe_min' | 'max_am_stueck' | 'vorlauf'

export const FORMULIERUNGEN: { key: Formulierung; text: string }[] = [
  { key: 'personen_nicht_gleichzeitig', text: 'Diese Personen nicht gleichzeitig (Stellvertretung)' },
  { key: 'gruppe_max', text: 'Aus einer Gruppe höchstens n gleichzeitig weg' },
  { key: 'gruppe_min', text: 'Aus einer Gruppe mindestens n anwesend' },
  { key: 'max_am_stueck', text: 'Höchstens n Arbeitstage am Stück (mind. 10)' },
  { key: 'vorlauf', text: 'Antrag mindestens n Tage vor Ferienbeginn' },
]

export interface RegelEingabe {
  formulierung: Formulierung
  titel: string
  gruppeId: string
  personen: string[]
  zahl: number
  hart: boolean
}

export const LEERE_REGEL: RegelEingabe = {
  formulierung: 'personen_nicht_gleichzeitig', titel: '', gruppeId: '', personen: [], zahl: 1, hart: false,
}

/** Eingabe der Maske → Daten fürs Backend (`ferien_regeln`). */
export function regelDaten(e: RegelEingabe): Record<string, unknown> {
  const basis = { titel: e.titel.trim(), haerte: e.hart ? 'hart' : 'weich', status: 'aktiv' }
  switch (e.formulierung) {
    case 'personen_nicht_gleichzeitig':
      return { ...basis, art: 'gleichzeitig', staff_ids: e.personen, gruppe_id: null, parameter: { max_abwesend: 1 } }
    case 'gruppe_max':
      return { ...basis, art: 'gleichzeitig', gruppe_id: e.gruppeId || null, staff_ids: [], parameter: { max_abwesend: e.zahl } }
    case 'gruppe_min':
      return { ...basis, art: 'gleichzeitig', gruppe_id: e.gruppeId || null, staff_ids: [], parameter: { min_anwesend: e.zahl } }
    case 'max_am_stueck':
      return { ...basis, art: 'max_am_stueck', gruppe_id: e.gruppeId || null, staff_ids: [], parameter: { arbeitstage: e.zahl } }
    case 'vorlauf':
      return { ...basis, art: 'vorlauf', gruppe_id: e.gruppeId || null, staff_ids: [], parameter: { tage: e.zahl } }
  }
}

/** Gespeicherte Regel → Eingabe der Maske (Bearbeiten). */
export function regelEingabe(r: FerienRegel): RegelEingabe {
  const p = r.parameter as Record<string, number>
  const basis = { titel: r.titel, gruppeId: r.gruppe_id ?? '', personen: r.staff_ids, hart: r.haerte === 'hart' }
  if (r.art === 'max_am_stueck') return { ...basis, formulierung: 'max_am_stueck', zahl: p.arbeitstage ?? 10 }
  if (r.art === 'vorlauf') return { ...basis, formulierung: 'vorlauf', zahl: p.tage ?? 0 }
  if ('min_anwesend' in p) return { ...basis, formulierung: 'gruppe_min', zahl: p.min_anwesend }
  if (r.staff_ids.length) return { ...basis, formulierung: 'personen_nicht_gleichzeitig', zahl: 1 }
  return { ...basis, formulierung: 'gruppe_max', zahl: p.max_abwesend ?? 1 }
}

/** Ein Satz zur Regel für die Liste. */
export function regelSatz(r: FerienRegel, gruppenName: (id: string) => string, personName: (id: string) => string): string {
  const p = r.parameter as Record<string, number>
  const ziel = r.staff_ids.length ? r.staff_ids.map(personName).join(', ')
    : r.gruppe_id ? `Gruppe «${gruppenName(r.gruppe_id)}»` : 'alle'
  if (r.art === 'max_am_stueck') return `${ziel}: höchstens ${p.arbeitstage} Arbeitstage am Stück`
  if (r.art === 'vorlauf') return `${ziel}: Antrag mindestens ${p.tage} Tage vorher`
  if ('min_anwesend' in p) return `${ziel}: mindestens ${p.min_anwesend} anwesend`
  if (r.staff_ids.length && p.max_abwesend === 1) return `${ziel}: nicht gleichzeitig`
  return `${ziel}: höchstens ${p.max_abwesend} gleichzeitig weg`
}

/** Daten einer Regel-Vorlage (Server, `services/ferienplanung.vorlagen`) als Regel. */
export function vorlageAlsRegel(daten: Record<string, unknown>): FerienRegel {
  return {
    id: '', titel: String(daten.titel ?? ''), art: String(daten.art ?? 'gleichzeitig'), gruppe_id: null, staff_ids: [],
    parameter: (daten.parameter as Record<string, unknown>) ?? {}, haerte: String(daten.haerte ?? 'weich'),
    gueltig_ab: null, gueltig_bis: null, status: 'aktiv', quelle: 'vorlage',
  }
}

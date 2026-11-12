/**
 * Auf welchem Weg ein Projekt-Entwurf entstanden ist — und was die Maske dazu sagt.
 *
 * Drei Herkünfte (`project_drafts.source`):
 *
 * - `staff`: ein angemeldeter Mitarbeiter hat ihn beim Kunden erfasst.
 * - `public`: er kam über das öffentliche Anfrageformular herein.
 * - `mail`: das Büro hat einen Vorschlag aus dem Mail-Eingang übernommen
 *   (docs/specs/mail-eingang-triage.md §4.1, §10). Die Felder hat die KI aus
 *   einer weitergeleiteten Mail gelesen.
 *
 * `public` und `mail` sind **ungeprüfte Angaben von aussen**: Name, Telefon und
 * Adresse hat niemand bestätigt, und gleich darunter beginnt die Maske, die
 * daraus einen Kunden im Stamm und ein Projekt macht. Beide tragen deshalb eine
 * Marke in der Liste und einen Warnhinweis im Detail.
 *
 * Fehlendes `source` heisst «Mitarbeiter»: Entwürfe von vor Migration 20260909
 * kennen die Spalte nicht. Die Richtung ist Absicht — ein alter Entwurf soll
 * nicht fälschlich als ungeprüfte Fremdeingabe erscheinen, und ein Entwurf von
 * aussen trägt den Wert immer, weil ihn der Server setzt.
 */
import type { ProjectDraft } from '../../api/projectDrafts'

export interface DraftHerkunft {
  /** Ungeprüfte Angaben von ausserhalb des Betriebs. */
  vonAussen: boolean
  /** Marke in der Liste; `null` beim Mitarbeiter-Entwurf. */
  marke: string | null
  /** «… eingegangen» in der Listenzeile und im Kopf des Details (statt «Erfasst von …»). */
  eingangListe: string
  eingangDetail: string
  /** Hinter «… übernommen» steht der Name: bei `mail` trägt `created_by_name`, wer
   *  im Büro den Vorschlag übernommen hat. Die öffentliche Anfrage hat niemand erfasst. */
  mitName: boolean
  /** Warnhinweis über den Daten im Detail. */
  warnTitel: string
  warnText: string
  /** Überschrift des Kunden-Blocks. */
  kundeLabel: string
}

const MITARBEITER: DraftHerkunft = {
  vonAussen: false,
  marke: null,
  eingangListe: '',
  eingangDetail: '',
  mitName: false,
  warnTitel: '',
  warnText: '',
  kundeLabel: 'Kunde (vom Mitarbeiter erfasst)',
}

const OEFFENTLICH: DraftHerkunft = {
  vonAussen: true,
  marke: 'Öffentliche Anfrage',
  eingangListe: 'Über das Anfrageformular eingegangen',
  eingangDetail: 'Über das öffentliche Anfrageformular eingegangen',
  mitName: false,
  warnTitel: 'Ungeprüfte Angaben von aussen.',
  warnText: 'Diese Anfrage hat jemand ohne Anmeldung abgeschickt — Name, Telefon und Adresse hat niemand '
    + 'bestätigt. Bitte vor dem Umwandeln Rücksprache nehmen.',
  kundeLabel: 'Kunde (Angaben des Absenders)',
}

const AUS_MAIL: DraftHerkunft = {
  vonAussen: true,
  marke: 'Aus E-Mail',
  eingangListe: 'Aus einer weitergeleiteten E-Mail übernommen',
  eingangDetail: 'Aus einer weitergeleiteten E-Mail übernommen',
  mitName: true,
  warnTitel: 'Ungeprüfte Angaben aus einer E-Mail.',
  warnText: 'Die Angaben stammen aus einer weitergeleiteten E-Mail und sind ungeprüft — Name, Telefon und '
    + 'Adresse wurden aus dem Mailtext gelesen. Bitte vor dem Umwandeln Rücksprache nehmen.',
  kundeLabel: 'Kunde (Angaben aus der E-Mail)',
}

export function draftHerkunft(d: Pick<ProjectDraft, 'source'>): DraftHerkunft {
  if (d.source === 'public') return OEFFENTLICH
  if (d.source === 'mail') return AUS_MAIL
  return MITARBEITER
}

/** «Aus einer weitergeleiteten E-Mail übernommen von Petra Büro» — Listenzeile bzw. Kopf des Details. */
export function eingangText(d: Pick<ProjectDraft, 'source' | 'created_by_name'>, ort: 'liste' | 'detail'): string {
  const h = draftHerkunft(d)
  const text = ort === 'liste' ? h.eingangListe : h.eingangDetail
  return h.mitName && d.created_by_name?.trim() ? `${text} von ${d.created_by_name.trim()}` : text
}

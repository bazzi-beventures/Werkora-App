import { DRAFT_MAX_AGE_MS, RapportDraftState } from './rapportDraft'

// Was passiert, wenn der Monteur im Projekt-Detail auf «Rapport erstellen» tippt?
//
// Der Knopf schickte bisher bedingungslos ein «Neuer Rapport für Projekt X» in den
// Chat. Wartete dort noch ein Rapport auf «Speichern», war er damit weg: der Client
// verlor `pendingConfirm`, der Server überschrieb seinen Puffer beim nächsten
// log_report — ohne Warnung, ohne Spur. Genau so gehen erfasste Stunden verloren,
// wenn jemand zwischendurch aufs Projekt schaut und über denselben Knopf zurückgeht
// (der Projekt-Detail hat keinen eigenen «zurück zum Rapport»-Weg).
export type RapportStartAction =
  // Nichts in Arbeit → neuen Rapport beginnen.
  | { kind: 'start' }
  // Derselbe Rapport läuft schon → nur hineinspringen, keine neue Startnachricht.
  | { kind: 'resume' }
  // Ein anderer Rapport ist unfertig → erst fragen, sonst geht er verloren.
  // `saved`: der Rapport ist bereits in der DB und nur die Unterschrift steht aus —
  // dann geht beim Weitermachen kein Einsatz verloren, und der Text darf das nicht
  // behaupten.
  | { kind: 'confirm-discard'; pendingProject: string | null; saved: boolean }

/**
 * Hat der Entwurf einen Rapport, der bei einem Neustart verloren ginge?
 *
 * Das ist DIE Definition von «unfertig» — sie trägt sowohl die Rückfrage beim Start
 * eines neuen Rapports (`planRapportStart`) als auch die Warnung beim Verlassen des
 * Chats (`rapportLeaveWarning`). Zwei Auffassungen davon hiessen: der eine Weg fragt,
 * der andere nicht.
 */
export function hasUnfinishedRapport(draft: RapportDraftState): boolean {
  // pendingConfirm: erfasst, aber noch nicht gespeichert — echter Datenverlust.
  // pendingSignReportId: gespeichert, aber die Unterschrift steht noch aus — der
  // Rapport bliebe unsigniert liegen.
  if (draft.pendingConfirm || draft.pendingSignReportId !== null) return true
  // Auch der Rapport MITTEN im Erfassen zählt: Projekt zugeordnet und das Gespräch
  // hat begonnen. Vorher galt nur der Bestätigungsschritt als "unfertig" — wer nach
  // den ersten Stunden kurz aufs Projekt schaute und über denselben Knopf zurückging,
  // startete deshalb still einen zweiten Rapport, statt in seinen zurückzukehren.
  return !!draft.pendingProject && draft.messages.length > 1
}

/**
 * Ist der Rapport des Entwurfs bereits GESPEICHERT — offen ist höchstens die
 * Unterschrift bzw. der PDF-Schritt?
 *
 * Der Unterschied trägt `planRapportStart`: ein gespeicherter Rapport darf nie mehr
 * «fortgesetzt» werden. Er ist in der DB, seine Stunden sind sicher, und der Monteur,
 * der auf «Rapport erstellen» tippt, will einen NEUEN — nicht den alten samt
 * Unterschriftspad zurück.
 */
export function isSavedRapport(draft: RapportDraftState): boolean {
  // `pendingConfirm` gewinnt: solange der Bestätigungsschritt offen ist, ist der
  // Rapport NICHT gespeichert — auch wenn ein inkonsistenter Entwurf daneben noch
  // eine Rapport-id trüge. Im Zweifel gilt der teurere Fall (Stunden in der Schwebe).
  if (draft.pendingConfirm) return false
  return draft.pendingSignReportId !== null || draft.downloadReportId !== null
}

export function planRapportStart(
  draft: RapportDraftState | null,
  projectName: string,
): RapportStartAction {
  if (!draft || !hasUnfinishedRapport(draft)) return { kind: 'start' }
  // Der Rapport ist schon gespeichert: NICHT hineinspringen. Genau das war der
  // Fehler — Rapport gespeichert, Unterschrift/PDF-Schritt blieb im Entwurf stehen
  // (Chat verlassen, App weggeräumt, Handy gesperrt), und der nächste Griff zu
  // «Rapport erstellen» im selben Projekt zog den ALTEN Rapport wieder hervor,
  // statt einen neuen zu beginnen.
  if (isSavedRapport(draft)) {
    // Unterschrift steht noch aus → einmal fragen. Nicht wegen der Stunden (die sind
    // gespeichert), sondern weil der Rapport ohne Unterschrift liegen bleibt.
    if (draft.pendingSignReportId !== null) {
      return { kind: 'confirm-discard', pendingProject: draft.pendingProject ?? null, saved: true }
    }
    // Unterschrift erledigt oder übersprungen, es steht nur noch der PDF-Knopf da:
    // nichts mehr offen, wortlos neu beginnen. Das PDF gibt es weiterhin im Projekt.
    return { kind: 'start' }
  }
  // Gleiches Projekt: der Monteur will offensichtlich zurück in seinen laufenden
  // Rapport, nicht einen zweiten anfangen. Ohne Rückfrage weiterlaufen lassen.
  if (draft.pendingProject && draft.pendingProject === projectName) return { kind: 'resume' }
  return { kind: 'confirm-discard', pendingProject: draft.pendingProject ?? null, saved: false }
}

// ── Verlassen des Chats (Zurück, Nav-Kachel, Android-Zurück, Reload) ─────────
//
// Der Chat liess sich bisher wortlos verlassen. Dass dabei meistens nichts verloren
// geht (Entwurf im localStorage + `pending_reports` serverseitig), weiss der Monteur
// nicht: er sieht eine halbe Stunde Erfassung und einen leeren Bildschirm. Beim
// nächsten Mal ruft er lieber an — das ist der eigentliche Schaden.
//
// Die Warnung sagt deshalb, was WIRKLICH passiert, und übertreibt nicht: «geht
// verloren» wäre in den meisten Fällen falsch, und eine Warnung, die einmal
// übertreibt, wird ab dann weggeklickt.

export type LeaveWarningKind = 'unsaved' | 'unsigned' | 'in_progress'

export interface LeaveWarning {
  kind: LeaveWarningKind
  /** Text für die Rückfrage. OK = verlassen, Abbrechen = zurück zum Rapport. */
  text: string
}

/** Die Frist aus `DRAFT_MAX_AGE_MS` in ganzen Stunden — der Text darf ihr nicht
 *  widersprechen, wenn jemand die Konstante ändert. */
const DRAFT_HOURS = Math.round(DRAFT_MAX_AGE_MS / (60 * 60 * 1000))

const KEEP = `der Entwurf bleibt ${DRAFT_HOURS} Stunden erhalten, danach ist er weg`
const BACK = '\n\nAbbrechen = zurück zum Rapport.'

/**
 * Muss beim Verlassen des Chats gefragt werden — und wenn ja, mit welchem Text?
 * `null` = wortlos gehen lassen.
 *
 * Der fertige Rapport (PDF-Schritt) warnt bewusst NICHT: dort ist «Schliessen» der
 * vorgesehene Weg, und `resetConversation` räumt selbst auf. Er zählt für
 * `hasUnfinishedRapport` trotzdem als unfertig — dort geht es um den Entwurf, der
 * noch etwas trägt. Für den Start-Knopf entscheidet `planRapportStart` gesondert:
 * ein gespeicherter Rapport wird nie fortgesetzt.
 */
export function rapportLeaveWarning(draft: RapportDraftState | null): LeaveWarning | null {
  if (!draft || !hasUnfinishedRapport(draft)) return null
  if (draft.pendingConfirm) {
    return {
      kind: 'unsaved',
      text: `Dein Rapport ist noch nicht gespeichert.\n\nOK = Chat verlassen; ${KEEP}.${BACK}`,
    }
  }
  if (draft.pendingSignReportId !== null) {
    return {
      kind: 'unsigned',
      text: 'Der Rapport ist gespeichert, aber noch nicht unterschrieben — ohne '
        + 'Unterschrift kann er nicht verrechnet werden. Du kannst sie später im '
        + 'Projekt über «Unterschrift nachtragen» holen.'
        + '\n\nOK = trotzdem verlassen.' + BACK,
    }
  }
  if (draft.downloadReportId !== null) return null
  const which = draft.pendingProject ? `für «${draft.pendingProject}»` : 'in Arbeit'
  return {
    kind: 'in_progress',
    text: `Du bist mitten in einem Rapport ${which}.\n\nOK = Chat verlassen; ${KEEP}.`
      + '\n\nAbbrechen = weiter erfassen.',
  }
}

/**
 * Darf der Chat verlassen werden? Stellt die Rückfrage, wenn nötig.
 *
 * `true` = weitergehen. Die Entscheidung liegt hier statt im Aufrufer, damit sie
 * testbar ist, ohne die ganze App zu rendern — `confirm` ist deshalb austauschbar.
 */
export function confirmLeaveRapport(
  draft: RapportDraftState | null,
  confirm: (message: string) => boolean = (m) => window.confirm(m),
): boolean {
  const warning = rapportLeaveWarning(draft)
  return !warning || confirm(warning.text)
}

/**
 * Text der Rückfrage, bevor ein unfertiger Rapport weicht.
 *
 * `saved` unterscheidet die beiden Fälle, und der Unterschied ist kein Detail: beim
 * gespeicherten Rapport wäre «der nicht gespeichert ist» schlicht falsch. Wer einmal
 * eine Warnung liest, die übertreibt, klickt ab dann jede weg.
 */
export function discardPrompt(
  pendingProject: string | null,
  nextProject: string,
  saved = false,
): string {
  const which = pendingProject ? `für «${pendingProject}»` : 'in Arbeit'
  if (saved) {
    return (
      `Der Rapport ${which} ist gespeichert, aber noch nicht unterschrieben.\n\n`
      + `OK = neuen Rapport für «${nextProject}» beginnen; die Unterschrift holst du `
      + 'später im Projekt über «Unterschrift nachtragen».\n'
      + 'Abbrechen = zurück zum gespeicherten Rapport.'
    )
  }
  return (
    `Du hast noch einen Rapport ${which}, der nicht gespeichert ist.\n\n`
    + `OK = diesen Rapport verwerfen und für «${nextProject}» neu beginnen.\n`
    + 'Abbrechen = zurück zum laufenden Rapport.'
  )
}

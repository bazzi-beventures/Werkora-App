import type { StaffChoiceOption } from '../api/chat'

// ─── Personen-Auswahl im Rapport-Chat ────────────────────────────────────────
//
// docs/specs/rapport-bot-guardrails.md §4.2: passt ein Name auf mehrere
// Mitarbeiter («Peter»), fragt der Server mit `action_taken: 'staff_choice'`
// zurück, und der Monteur tippt die gemeinte Person an. Früher nahm der Server
// still den ersten Treffer — die Stunden landeten bei der falschen Person.
//
// Kein eigener Zustand im ChatScreen: die Auswahl ist offen, solange die LETZTE
// Nachricht im Verlauf die Rückfrage ist. Nach dem Antippen steht dort die
// Antwort des Monteurs, nach einem Fehler eine Fehlermeldung — der Server hält
// die Auswahl trotzdem und bietet sie bei der nächsten Nachricht wieder an.

interface MitAuswahl {
  role: 'user' | 'bot'
  action_taken?: string | null
  staff_choice?: StaffChoiceOption[]
}

/** Die offene Personen-Auswahl, oder `null`. */
export function offenePersonenAuswahl(messages: MitAuswahl[]): StaffChoiceOption[] | null {
  const letzte = messages[messages.length - 1]
  if (!letzte || letzte.role !== 'bot' || letzte.action_taken !== 'staff_choice') return null
  return letzte.staff_choice?.length ? letzte.staff_choice : null
}

export function PersonenAuswahl({ optionen, onWahl }: {
  optionen: StaffChoiceOption[] | null
  onWahl: (opt: StaffChoiceOption) => void
}) {
  if (!optionen) return null
  return (
    <div className="disambig-buttons" data-testid="personen-auswahl">
      {optionen.map(opt => (
        <button key={opt.staff_id} className="disambig-btn" onClick={() => onWahl(opt)}>
          {opt.name}
        </button>
      ))}
    </div>
  )
}

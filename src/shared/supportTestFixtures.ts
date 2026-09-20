import { vi } from 'vitest'
import type { MySupportTicket } from '../api/support'
import type { MySupportTicketsState } from './useMySupportTickets'

/**
 * «Meine Meldungen»-Zustand für Tests, die das Melde-Formular prüfen.
 *
 * Das Formular bekommt den Zustand als Prop, weil ihn die Hilfe-Blase hält
 * (docs/specs/support-antwort.md §4.2) — ein Test, der nur das Melden prüft,
 * braucht davon den leeren Normalfall.
 */
export function leereMeldungen(
  overrides: Partial<MySupportTicketsState> = {},
): MySupportTicketsState {
  return {
    tickets: [] as MySupportTicket[],
    unread: 0,
    loading: false,
    failed: false,
    reload: vi.fn().mockResolvedValue(undefined),
    markRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

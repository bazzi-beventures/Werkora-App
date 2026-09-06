import type { BetaFeature } from '../api/auth'
import { BetaBadge } from './BetaBadge'
import { betaPrefillText, openSupportWithPrefill } from './supportPrefill'

/**
 * «Du testest neue Funktionen» — docs/specs/beta-tester.md §6.2.
 *
 * Die Pflicht-Sichtbarkeit der Beta. Ein Tester soll wissen, DASS er testet und
 * WAS: sonst hält er ein halbfertiges Feature für den Normalzustand und meldet
 * nichts — oder hält einen Fehler für seinen eigenen.
 *
 * Kein Banner, kein Toast, kein Onboarding-Dialog. Wer testet, wurde vom Chef
 * gefragt und weiss es; der Abschnitt ist die Erinnerung, nicht die Ankündigung.
 *
 * Rendert nichts, solange nichts in der Beta ist (`features` leer) — der
 * Regelfall, auch für einen Tester.
 */
interface Props {
  features: BetaFeature[]
  /** Modulnamen im Betatest. Anders als bei den Features gibt es dafür keine
   *  Server-Registry mit Beschreibung — die Beschriftungen leben im Modul-Tab
   *  des Admin. Hier stehen sie deshalb schlicht als Namen. */
  modules?: string[]
  /** Modul `support` aktiv? Ohne läuft der Rückweg ausserhalb der App (§6.3). */
  canReport: boolean
  /** Admin-Sidebar/-Drawer: schmale Spalte, kleinere Schrift. */
  compact?: boolean
}

/** Menschenlesbar, ohne den Admin-Katalog in die Monteur-App zu ziehen. Ein
 *  Modul ohne Eintrag zeigt seinen Schlüssel — brauchbarer als eine leere Zeile. */
const MODUL_LABELS: Record<string, string> = {
  timekeeping: 'Zeiterfassung',
  scheduling: 'Einsatzplanung',
  quotes: 'Offerten',
  invoicing: 'Rechnungen',
  payment_matching: 'Zahlungsabgleich',
  inventory: 'Lager',
  hr: 'HR',
  kpis: 'Kennzahlen',
  ai: 'KI-Funktionen',
  help_bot: 'Hilfe-Bot',
  support: 'Problem melden',
  supplier_wiki: 'Lieferanten-Wiki',
  task_board: 'Aufgaben-Board',
  document_backup: 'Datensicherung',
}

export function BetaSection({ features, modules = [], canReport, compact = false }: Props) {
  if (features.length === 0 && modules.length === 0) return null

  return (
    <section
      aria-label="Neue Funktionen im Test"
      style={{
        border: '1px solid var(--border, rgba(148,163,184,0.25))',
        borderRadius: 'var(--radius-sm, 8px)',
        padding: compact ? 10 : 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: compact ? 12 : 13.5, fontWeight: 600, color: 'var(--text)',
      }}>
        <BetaBadge />
        <span>Du testest neue Funktionen</span>
      </div>

      {features.map(f => (
        <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)' }}>
            {f.label}
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            {f.description}
          </div>
          {canReport && (
            <button
              type="button"
              onClick={() => openSupportWithPrefill({
                message: betaPrefillText(f.label),
                betaFeature: f.key,
              })}
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs, 6px)',
                border: '1px solid var(--border, rgba(148,163,184,0.25))',
                background: 'transparent',
                color: 'var(--text)',
                font: 'inherit',
                fontSize: compact ? 11 : 12,
                cursor: 'pointer',
              }}
            >
              Rückmeldung geben
            </button>
          )}
        </div>
      ))}

      {modules.map(m => (
        <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)' }}>
            {MODUL_LABELS[m] ?? m}
          </div>
          <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Dieser ganze Bereich ist im Test — du siehst ihn, deine Kolleginnen und Kollegen noch nicht.
          </div>
          {canReport && (
            <button
              type="button"
              onClick={() => openSupportWithPrefill({
                message: betaPrefillText(MODUL_LABELS[m] ?? m),
                betaFeature: m,
              })}
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs, 6px)',
                border: '1px solid var(--border, rgba(148,163,184,0.25))',
                background: 'transparent',
                color: 'var(--text)',
                font: 'inherit',
                fontSize: compact ? 11 : 12,
                cursor: 'pointer',
              }}
            >
              Rückmeldung geben
            </button>
          )}
        </div>
      ))}

      {!canReport && (
        <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted)' }}>
          Rückmeldungen bitte an deine Ansprechperson.
        </div>
      )}
    </section>
  )
}

export default BetaSection

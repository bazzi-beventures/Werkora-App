import { useState } from 'react'
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
  /** Admin-Sidebar/-Drawer: schmale Spalte, kleinere Schrift — und zugeklappte
   *  Beschreibungen, siehe `BetaEintrag`. */
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

const MODUL_BESCHREIBUNG =
  'Dieser ganze Bereich ist im Test — du siehst ihn, deine Kolleginnen und Kollegen noch nicht.'

interface EintragProps {
  titel: string
  beschreibung: string
  /** Was in der Rückmeldung als `betaFeature` mitgeht: Feature-Key bzw. Modulname. */
  meldeKey: string
  canReport: boolean
  compact: boolean
}

/**
 * Ein Eintrag — kompakt zugeklappt, sonst ausgeschrieben.
 *
 * Die Beschreibungen sind zwei bis vier Sätze. In der Sidebar (~260 px) und im
 * «Mehr»-Sheet des Handys werden daraus dreissig bis vierzig Zeilen: die
 * Fusszeile wuchs über die halbe Höhe, die Navigation darüber wich aus dem Bild,
 * und Einstellungen/Admin-Tools waren für einen Beta-Tester schlicht nicht mehr
 * erreichbar. Der Name allein sagt bereits, WAS im Test ist — das WIE steht einen
 * Tipp entfernt. Wo Platz ist (Profil der Monteur-App), bleibt alles offen.
 */
function BetaEintrag({ titel, beschreibung, meldeKey, canReport, compact }: EintragProps) {
  const [offen, setOffen] = useState(false)
  const sichtbar = !compact || offen

  const meldeKnopf = canReport && (
    <button
      type="button"
      onClick={() => openSupportWithPrefill({
        message: betaPrefillText(titel),
        betaFeature: meldeKey,
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
  )

  const titelStil = { fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {compact ? (
        <button
          type="button"
          onClick={() => setOffen(o => !o)}
          aria-expanded={offen}
          style={{
            ...titelStil,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            fontSize: titelStil.fontSize,
            fontWeight: titelStil.fontWeight,
            color: titelStil.color,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span>{titel}</span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            width="14"
            height="14"
            aria-hidden="true"
            style={{
              flexShrink: 0,
              opacity: 0.7,
              transform: offen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          >
            <path
              fillRule="evenodd"
              d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      ) : (
        <div style={titelStil}>{titel}</div>
      )}

      {sichtbar && (
        <>
          <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            {beschreibung}
          </div>
          {meldeKnopf}
        </>
      )}
    </div>
  )
}

export function BetaSection({ features, modules = [], canReport, compact = false }: Props) {
  if (features.length === 0 && modules.length === 0) return null

  return (
    <section
      aria-label="Neue Funktionen im Test"
      /* Die Klassen tragen keine eigene Gestaltung — sie sind der Griff, an dem
         die schmale Sidebar (<=1024 px, reine Symbolleiste) alles bis auf das
         Badge ausblendet. */
      className="beta-section"
      style={{
        border: '1px solid var(--border, rgba(148,163,184,0.25))',
        borderRadius: 'var(--radius-sm, 8px)',
        padding: compact ? 10 : 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        className="beta-section-head"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: compact ? 12 : 13.5, fontWeight: 600, color: 'var(--text)',
        }}
      >
        <BetaBadge />
        <span>Du testest neue Funktionen</span>
      </div>

      <div className="beta-section-entries">
      {features.map(f => (
        <BetaEintrag
          key={f.key}
          titel={f.label}
          beschreibung={f.description}
          meldeKey={f.key}
          canReport={canReport}
          compact={compact}
        />
      ))}

      {modules.map(m => (
        <BetaEintrag
          key={m}
          titel={MODUL_LABELS[m] ?? m}
          beschreibung={MODUL_BESCHREIBUNG}
          meldeKey={m}
          canReport={canReport}
          compact={compact}
        />
      ))}

      {!canReport && (
        <div style={{ fontSize: compact ? 11 : 12, color: 'var(--muted)' }}>
          Rückmeldungen bitte an deine Ansprechperson.
        </div>
      )}
      </div>
    </section>
  )
}

export default BetaSection

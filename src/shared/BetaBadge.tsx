/**
 * «Beta»-Abzeichen — docs/specs/beta-tester.md §6.2.
 *
 * Der Entwickler eines Beta-Features setzt es neben den Einstieg in sein Feature
 * (Knopf, Reiter, Menüpunkt). Es ist die Höflichkeit, nicht die Pflicht: die
 * Pflicht-Sichtbarkeit ist der Beta-Abschnitt in den Einstellungen — dort steht,
 * was man gerade testet, auch wenn ein Badge irgendwo vergessen wurde.
 *
 * Bewusst in `shared/`: beide Apps zeigen es, und beide lesen dieselben Tokens
 * (`--accent-purple`/-dim definiert index.css für hell und dunkel; die Literale
 * sind nur der Rückfall, falls das Stylesheet einmal nicht geladen ist).
 * Lila statt Amber/Blau, weil beide Akzentfarben in dieser App schon etwas
 * anderes bedeuten — Mandantenfarbe bzw. Admin-Primärfarbe.
 */
export function BetaBadge({ title }: { title?: string }) {
  return (
    <span
      title={title ?? 'Neue Funktion, die du vor allen anderen testest'}
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        lineHeight: 1.6,
        verticalAlign: 'middle',
        background: 'var(--accent-purple-dim, rgba(167,139,250,0.14))',
        color: 'var(--accent-purple, #a78bfa)',
        border: '1px solid var(--accent-purple, #a78bfa)',
      }}
    >
      Beta
    </span>
  )
}

export default BetaBadge

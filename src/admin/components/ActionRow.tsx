import type { CSSProperties, MouseEvent, ReactNode } from 'react'

/**
 * Horizontale Zeile aus Info + Aktions-Buttons mit sicheren Layout-Defaults.
 *
 * Kernpunkt: `flexWrap: 'wrap'`. Solche Zeilen stehen in Containern mit
 * `overflow-x: auto` (`.admin-table-wrap`). Ohne Umbruch sprengt eine Zeile mit
 * vielen Buttons (Status-abhängig: Senden, Akzeptiert, Neue Version …) die
 * Breite und erzeugt einen horizontalen Scrollbalken mit abgeschnittenen
 * Buttons. Hier zentral definiert, damit künftige Buttons (neue Status,
 * Richtofferte …) automatisch umbrechen statt die Zeile zu verziehen.
 *
 * `style` überschreibt die Defaults (Escape-Hatch); `flexWrap` sollte man nur
 * mit gutem Grund wieder ausschalten.
 */
export function ActionRow({
  children,
  style,
  onClick,
  title,
}: {
  children: ReactNode
  style?: CSSProperties
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
  title?: string
}) {
  return (
    <div
      onClick={onClick}
      title={title}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, ...style }}
    >
      {children}
    </div>
  )
}

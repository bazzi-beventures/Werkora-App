import React from 'react'

// Generische Karten-Liste als Mobile-Alternative zu .admin-table. Liefert
// Karten-Chrome, Empty-State, Key- und Click-Handling; der Inhalt kommt als
// Render-Prop, weil das Zellen-JSX je Screen heterogen ist (Badges, bedingte
// Aktions-Buttons). Umschaltung Tabelle↔Karten passiert im jeweiligen Screen
// via useIsMobile() — Desktop-Tabelle bleibt unverändert.
export function AdminCardList<T>({ items, keyFor, onItemClick, renderCard, empty }: {
  items: T[]
  keyFor: (item: T) => string
  onItemClick?: (item: T) => void
  renderCard: (item: T) => React.ReactNode
  empty: React.ReactNode
}) {
  if (items.length === 0) return <div className="admin-table-empty">{empty}</div>
  return (
    <div className="admin-card-list">
      {items.map(item => (
        <div
          key={keyFor(item)}
          className={`admin-card${onItemClick ? ' clickable' : ''}`}
          onClick={onItemClick ? () => onItemClick(item) : undefined}
        >
          {renderCard(item)}
        </div>
      ))}
    </div>
  )
}

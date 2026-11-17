// Karte in einem Dashboard-Seitenpanel → Projekt öffnen.
//
// Alle Panels hinter den Dashboard-Kacheln (Offerten in Bearbeitung,
// Offerten-Erinnerungen, Überfällige Rechnungen, Bestellfreigaben …) zeigen
// Karten mit eigenen Knöpfen. Ein Klick auf die Karte selbst öffnet das Projekt;
// Knöpfe und Links (Senden, PDF, Freigeben …) erledigen nur ihre eigene Aktion.
// Ohne Projekt (freistehende Offerte) ist die Karte eine reine Anzeige.
import type React from 'react'

export function projektKarteProps(
  projectId: string | null | undefined,
  onOpenProject: ((projectId: string) => void) | undefined,
): Partial<React.HTMLAttributes<HTMLDivElement>> {
  if (!projectId || !onOpenProject) return {}
  const open = () => onOpenProject(projectId)
  return {
    role: 'button',
    tabIndex: 0,
    title: 'Projekt öffnen',
    onClick: e => {
      if (!(e.target as HTMLElement).closest('button, a, input, select, textarea')) open()
    },
    onKeyDown: e => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
    },
  }
}

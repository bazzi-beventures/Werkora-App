// Wohin der Link «Kunde …» / «Im Kundenstamm öffnen →» im Projekt führt
// (WW-9, nachgeschärft mit WW-51: docs/specs/kunden-projekte-verlinkung.md §5).
//
// Erste Wahl bleibt der Kunde aus der Maske: nach einem Kundenwechsel in der
// selbst speichernden Maske trägt das Embed `project.customer` noch den alten.
// Die Maske kennt aber nur die Kunden der Auswahlliste, und die enthält keine
// archivierten Kunden und ist beim Öffnen einen Moment lang leer. In beiden
// Fällen fehlte der Link ganz — obwohl das Projekt einen Kunden hat. Dann gilt
// das Embed, aber nur, solange es zum gewählten Kunden passt.

interface Named { id: string; name: string | null }

export function customerLinkTarget(
  selected: Named | null | undefined,
  embed: Named | null | undefined,
  customerId: string | null | undefined,
): { id: string; name: string } | null {
  if (selected) return { id: selected.id, name: selected.name || 'Kunde' }
  if (embed && customerId && embed.id === customerId) return { id: embed.id, name: embed.name || 'Kunde' }
  return null
}

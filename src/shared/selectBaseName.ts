// Umbenennen einer Datei: beim Fokus den Namen OHNE Endung markieren
// (docs/specs/kleinkorrekturen-2026-10.md §2). Tippen ersetzt dann den Namen,
// «.jpg» bleibt stehen — wie im Finder und im Explorer. Ohne Punkt, oder mit
// Punkt nur ganz vorne («.env»), gibt es keine Endung: dann alles markieren.

export function baseNameRange(name: string): [number, number] {
  const dot = name.lastIndexOf('.')
  return [0, dot > 0 ? dot : name.length]
}

export function selectBaseName(input: HTMLInputElement): void {
  const [start, end] = baseNameRange(input.value)
  input.setSelectionRange(start, end)
}

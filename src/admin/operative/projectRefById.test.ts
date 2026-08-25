import { describe, it, expect } from 'vitest'

// Ratchet: Projekt-URLs nie über den Namen bauen.
//
// Projektnamen dürfen doppelt vorkommen (mehrere Aufträge beim selben Kunden).
// Das Backend löst einen Namen im URL-Segment nur noch als Alt-Client-Fallback auf
// und antwortet bei einem mehrdeutigen Namen bewusst mit 409 — ein solcher Aufruf
// aus der aktuellen PWA ist also kein Sonderfall, sondern eine Sackgasse: das
// Projekt liess sich nicht mehr abschliessen. Der Fehler fiel lange nicht auf,
// weil er erst beim zweiten gleichnamigen Projekt zuschlägt.
//
// Gescannt wird über import.meta.glob (?raw) statt über node:fs — die App hat
// bewusst keine Node-Typen im tsconfig, `tsc --noEmit` in der CI würde sonst rot.
const SOURCES = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const PROJECT_URL_WITH_NAME = /\/pwa\/admin\/projects\/\$\{[^}]*\bname\b[^}]*\}/

describe('Projekt-API-Aufrufe', () => {
  // Ohne diese zwei Proben würde der Ratchet auch dann grün, wenn der Glob ins
  // Leere greift oder das Muster nichts mehr trifft — also genau dann nutzlos,
  // wenn er greifen müsste.
  it('scannt die Quellen und erkennt den Namens-Pfad', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect(PROJECT_URL_WITH_NAME.test(
      '`/pwa/admin/projects/${encodeURIComponent(project.name)}/status`',
    )).toBe(true)
  })

  it('adressieren Projekte über die id, nie über den Namen', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !/\.test\.tsx?$/.test(path))
      .filter(([, src]) => PROJECT_URL_WITH_NAME.test(src))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })
})

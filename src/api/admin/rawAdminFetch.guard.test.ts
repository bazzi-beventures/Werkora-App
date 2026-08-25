import { describe, it, expect } from 'vitest'

// Schichtgrenze (Charge H1/H2): kein roher `/pwa/admin/…`-Aufruf ausserhalb von
// api/.
//
// Der Transport (api/client.ts) und der Domänen-Layer (api/admin/) sind die
// einzigen Stellen, an denen Admin-Pfade stehen. Der Ausgangspunkt waren 151
// `apiFetch('/pwa/admin/…')` direkt in den Screens, mit per Hand erfundenen
// Antwort-Typen, verstreut über 27 Dateien; der Umbau lief chargisch über
// ALLOWED als sinkendes Budget. Das Budget ist aufgebraucht — die Liste ist leer
// und bleibt es.
//
// Wer einen neuen Aufruf in einem Screen einbaut, wird hier rot und schreibt
// stattdessen eine Funktion in api/admin/<domäne>.ts.
const SOURCES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

// Fängt auch die generische Form `apiFetch<Foo>('/pwa/admin/…')` und die
// Geschwister apiFormFetch/apiBlobFetch. Nur Literale — ein aus Variablen
// gebauter Pfad ist ohnehin nicht das Muster, das hier abgebaut wird.
const RAW_ADMIN_CALL = /api(?:Form|Blob)?Fetch(?:<[^(]*?>)?\(\s*[`'"]\/pwa\/admin\//g

// Stand 2026-08-18: null. Charge H1 hat die 151 rohen Aufrufe aus 27 Dateien in
// den api/admin/-Layer geholt, die letzten drei Dateien (QuotesScreen,
// SendQuoteDialog, ReportCreateForm) sind mit H2 gefolgt. Die Liste bleibt leer:
// jeder neue rohe Aufruf ist ab hier ein Fehler, kein Budget.
const ALLOWED: Record<string, number> = {}

function countByFile(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [path, src] of Object.entries(SOURCES)) {
    const rel = path.replace(/^\/src\//, '')
    // api/ ist der richtige Ort für diese Aufrufe; Tests dürfen Pfade nennen.
    if (rel.startsWith('api/') || /\.test\.tsx?$/.test(rel)) continue
    const hits = src.match(RAW_ADMIN_CALL)?.length ?? 0
    if (hits > 0) counts[rel] = hits
  }
  return counts
}

describe('api/admin — rohe Admin-Aufrufe in Screens', () => {
  // Ohne diese Probe wäre der Ratchet auch grün, wenn der Glob ins Leere greift
  // oder das Muster nichts mehr trifft.
  it('scannt die Quellen und erkennt rohe Aufrufe', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect("apiFetch('/pwa/admin/projects')".match(RAW_ADMIN_CALL)?.length).toBe(1)
    expect('apiFetch<Foo[]>(`/pwa/admin/x/${id}`)'.match(RAW_ADMIN_CALL)?.length).toBe(1)
    expect("apiFetch('/pwa/projects')".match(RAW_ADMIN_CALL)).toBeNull()
  })

  it('kein Screen ruft /pwa/admin/… direkt auf', () => {
    const actual = countByFile()
    const problems = Object.entries(actual)
      .filter(([file]) => ALLOWED[file] === undefined)
      .map(([file, n]) => `${file}: ${n} rohe(r) Aufruf(e) — bitte eine Funktion in api/admin/ nutzen`)
    expect(problems).toEqual([])
  })
})

import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { ABZUG, GENERAT, erzeuge } from '../../../scripts/api-vertrag.mjs'

/**
 * API-Vertrag (Charge N, docs/specs/refactoring-wachstum.md §5): schema.ts muss
 * genau das sein, was `npm run api:gen` aus openapi.json erzeugt. Gegenstück im
 * Backend: tests/unit/test_api_vertrag.py hält openapi.json gleich dem Code.
 *
 * Zusammen ergibt das die Kette Modell → Abzug → TS-Typ → tsc: benennt jemand
 * ein Feld im Pydantic-Modell um, scheitert erst pytest (Abzug veraltet), nach
 * dem Nachziehen dieser Test (Generat veraltet), danach tsc an jeder Stelle,
 * die das alte Feld liest.
 */
describe('API-Vertrag', () => {
  it('schema.ts entspricht openapi.json', async () => {
    const abzug = JSON.parse(readFileSync(ABZUG, 'utf8'))
    const erwartet = await erzeuge(abzug)
    const ist = readFileSync(GENERAT, 'utf8')
    expect(
      ist === erwartet,
      'src/api/generated/schema.ts ist veraltet — `npm run api:gen` laufen lassen (nie von Hand ändern).',
    ).toBe(true)
  })
})

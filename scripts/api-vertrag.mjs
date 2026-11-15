// API-Vertrag: src/api/generated/schema.ts aus src/api/generated/openapi.json
// erzeugen (Charge N, docs/specs/refactoring-wachstum.md §5).
//
// Den Abzug schreibt das Backend (`python -m scripts.api_vertrag`), hier entsteht
// daraus der TS-Typ. Von Hand nie ändern — der Guard
// src/api/generated/vertrag.guard.test.mjs vergleicht die Datei mit dem, was
// dieses Skript erzeugen würde.
//
//   npm run api:gen
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import openapiTS, { astToString } from 'openapi-typescript'

const HIER = dirname(fileURLToPath(import.meta.url))
export const ABZUG = resolve(HIER, '../src/api/generated/openapi.json')
export const GENERAT = resolve(HIER, '../src/api/generated/schema.ts')

const KOPF = `// GENERIERT — nicht von Hand ändern.
// Quelle: src/api/generated/openapi.json (Backend: python -m scripts.api_vertrag),
// erzeugt mit: npm run api:gen (openapi-typescript). Charge N,
// docs/specs/refactoring-wachstum.md §5.
`

/** Inhalt von schema.ts für den gegebenen Abzug (als Objekt). */
export async function erzeuge(abzug) {
  const ast = await openapiTS(abzug, { alphabetize: false, exportType: false })
  return KOPF + astToString(ast)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const abzug = JSON.parse(readFileSync(ABZUG, 'utf8'))
  writeFileSync(GENERAT, await erzeuge(abzug))
  console.log('src/api/generated/schema.ts geschrieben')
}

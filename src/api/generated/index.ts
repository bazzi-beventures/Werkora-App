// Zugang zu den generierten Antwort-Typen (Charge N, docs/specs/refactoring-wachstum.md §5).
//
//   export type Invoice = Antwort<'RechnungZeile'>
//
// Der Name ist der des Pydantic-Modells in agents/routers/antworten/. Ein Feld,
// das hier fehlt, liest das Frontend nicht — es gehört zuerst ins Modell.
import type { components } from './schema'

export type Antwort<Name extends keyof components['schemas']> = components['schemas'][Name]

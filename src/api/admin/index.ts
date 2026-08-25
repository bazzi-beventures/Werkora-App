// Barrel des Admin-API-Layers (Charge H1).
//
// `api/admin.ts` war eine Datei mit 1'157 Zeilen und 22 Domänen-Sektionen. Die
// Sektionen sind jetzt Module daneben; dieses Barrel hält die bestehenden
// `from '../api/admin'`-Importe der Screens gültig. Neuer Code darf gezielt aus
// dem Einzelmodul importieren (`from '../api/admin/projects'`) — das Barrel
// schrumpft, sobald alle Aufrufer das tun.
//
// Transport bleibt `api/client.ts`; hier stehen nur Domänen-Funktionen und die
// Typen ihrer Antworten.
export * from './dashboard'
export * from './staff'
export * from './absences'
export * from './corrections'
export * from './customers'
export * from './projects'
export * from './projectTaskTemplates'
export * from './quotes'
export * from './quoteTemplates'
export * from './reports'
export * from './scheduling'
export * from './spellcheck'
export * from './inventory'
export * from './invoices'
export * from './payments'
export * from './pricingRules'
export * from './hr'
export * from './tenant'
export * from './materialImport'
export * from './materials'
export * from './aftersales'
export * from './documentBackup'
export * from './suppliers'
export * from './tasks'
export * from './units'
export * from './users'
export * from './werkoraBonus'

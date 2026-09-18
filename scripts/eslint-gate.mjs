// Blockierendes Teil-Gate für ESLint — das Gegenstück zum Ruff-Gate der
// Backend-CI (docs/specs/refactoring-folgethemen.md §2, Ratchet-Muster aus §1).
//
// Warum nicht einfach `eslint .` blockierend schalten: der Bestand trägt noch
// 89 Warnings (Stand 2026-08-24; Errors: 0). Ein Voll-Gate wäre ab dem ersten
// Tag rot und damit wertlos. Stattdessen blockieren genau die Regeln, deren
// Bestand auf 0 steht — so kann er dort nicht wieder wachsen, während der Rest
// im informativen Lauf sichtbar bleibt.
//
// Was diese Liste wert ist, hat sich am 2026-08-24 gezeigt: ein `useEffect`
// unterhalb der frühen Returns in App.tsx (react-hooks/rules-of-hooks) ging
// durch die grüne CI und legte die Staging-PWA komplett lahm — React #310
// unmountet den ganzen Baum, der Nutzer sieht eine weisse Seite. ESLint hatte
// es im informativen Lauf als Error gemeldet; nur blockiert hat es niemand.
//
// Eine Regel kommt hinzu, sobald ihr Bestand 0 ist. Umgekehrt darf hier NIE
// etwas herausgenommen werden, um einen Lauf grün zu bekommen — dann ist der
// Findings-Fix die Aufgabe, nicht die Liste.
import { ESLint } from 'eslint'

const GATED = [
  'react-hooks/refs',      // Ref-Zugriff im Render-Rumpf
  'react-hooks/purity',    // unreine Aufrufe (Date.now(), Math.random()) im Render
  'react-hooks/globals',   // Modul-Variablen im Render mutiert
  'no-empty',              // leerer Block ohne erklärenden Kommentar
  // Seit 2026-08-23 dazu (Bestand auf 0 abgebaut):
  'react-hooks/immutability',               // Zugriff vor der Deklaration; Mutation gehookter Werte
  'react-hooks/use-memo',                   // nicht statisch pruefbare Dependency-Liste
  'react-hooks/preserve-manual-memoization',// manuelle Memoisierung, die der Compiler nicht halten kann
  // Seit 2026-08-24 dazu (letzter verbliebener Error abgebaut):
  'react-hooks/rules-of-hooks',             // Hook bedingt/nach einem fruehen Return aufgerufen
]

// ACHTUNG, Job-NAME: der Check heisst in der CI weiterhin
// "ESLint-Gate (refs/purity/globals/no-empty) – blockierend" und nennt damit vier
// von sieben Regeln. Der Name bleibt, weil er als Required Check in der Branch
// Protection von main UND develop steht — Umbenennen laesst jeden PR auf
// "Expected" haengen, bis jemand die GitHub-Settings nachzieht. Dasselbe gilt
// beim Ruff-Gate, siehe CLAUDE.md.

const eslint = new ESLint()
const results = await eslint.lintFiles(['.'])

// Der informative Voll-Bericht kommt aus DIESEM Lauf, nicht aus einem zweiten.
//
// Bis 2026-09 lief in der CI zusaetzlich `npx eslint .`, um den vollen Bestand
// ins Job-Summary zu schreiben — ein zweiter kompletter Lint ueber denselben
// Baum, fuer Zahlen, die in `results` laengst stehen. Das kostete den Job rund
// 35 s und damit die zweite Abrechnungsminute (GitHub rundet jeden Job auf).
//
// Nur in der CI, erkennbar an GITHUB_STEP_SUMMARY: lokal soll `npm run
// lint:gate` weiter kurz antworten. Wer den vollen Bericht lokal will, hat
// `npm run lint`.
const summaryPfad = process.env.GITHUB_STEP_SUMMARY
if (summaryPfad) {
  const { appendFile } = await import('node:fs/promises')
  const formatter = await eslint.loadFormatter('stylish')
  const bericht = await formatter.format(results)
  await appendFile(
    summaryPfad,
    `## ESLint (informativ)\n\n\`\`\`\n${bericht || 'Keine Meldungen.'}\n\`\`\`\n`,
  )
}

// Zaehlung ueber den GESAMTEN Bestand — die eine Zeile, die frueher der
// informative Job lieferte. Sie steht bewusst vor dem Gate: schlaegt das Gate
// fehl, ist der Bestand trotzdem schon protokolliert.
const fehler = results.reduce((n, r) => n + r.errorCount, 0)
const warnungen = results.reduce((n, r) => n + r.warningCount, 0)
console.log(`ESLint (informativ): ${fehler} Errors, ${warnungen} Warnings im Gesamtbestand`)

const treffer = results.flatMap(r =>
  r.messages
    .filter(m => GATED.includes(m.ruleId))
    .map(m => `${r.filePath}:${m.line}:${m.column}  ${m.ruleId}  ${m.message.split('\n')[0]}`),
)

if (treffer.length > 0) {
  console.error(`ESLint-Gate: ${treffer.length} Treffer in gesperrten Regeln\n`)
  for (const t of treffer) console.error('  ' + t)
  console.error(`\nGesperrte Regeln: ${GATED.join(', ')}`)
  console.error('Diese Regeln sind repo-weit sauber und sollen es bleiben.')
  process.exit(1)
}

console.log(`ESLint-Gate sauber — keine Treffer in: ${GATED.join(', ')}`)

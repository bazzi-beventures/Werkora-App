// Build-ID aus dem INHALT der Quellen statt aus der Uhrzeit des Builds
// (docs/specs/pwa-neuladen.md §3.3).
//
// Bis 20261023 war die ID `new Date().toISOString()`: jeder Build änderte
// index.html, damit die Precache-Revision in sw.js — und jedes Gerät lud nach
// dem Deploy einmal neu, auch wenn nur ein Test oder ein Kommentar in einer
// Spec dazugekommen war. Jetzt ändert sie sich genau dann, wenn sich etwas
// ändert, das im Bundle landet. Gleiche Quellen ⇒ gleiche ID ⇒ (weil Vite
// inhaltsbasiert hasht) dasselbe sw.js ⇒ kein Update, kein Reload.
//
// Bewusst als eigenes Modul neben vite.config.ts: dort ist es nicht testbar,
// hier schon (buildId.test.mjs).
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Was im Bundle bzw. im ausgelieferten HTML landet. vite.config.ts gehört dazu:
// es trägt das Inline-Boot-Skript und die CSP.
const QUELL_ORDNER = ['src', 'public']
const QUELL_DATEIEN = ['index.html', 'admin.html', 'package-lock.json', 'vite.config.ts', 'tsconfig.json']

// Tests landen nie im Bundle. src/test/ ist das Vitest-Setup.
const KEIN_BUNDLE = /(\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$|(^|\/)__tests__\/|^src\/test\/)/

function dateienUnter(wurzel, rel) {
  const voll = path.join(wurzel, rel)
  if (!fs.existsSync(voll)) return []
  if (fs.statSync(voll).isFile()) return [rel]
  return fs.readdirSync(voll, { withFileTypes: true }).flatMap(e =>
    dateienUnter(wurzel, path.posix.join(rel, e.name)))
}

/** Liste der Dateien, die in die Build-ID eingehen — sortiert, relativ, mit `/`. */
export function buildIdDateien(wurzel) {
  return [...QUELL_ORDNER, ...QUELL_DATEIEN]
    .flatMap(rel => dateienUnter(wurzel, rel))
    .filter(rel => !KEIN_BUNDLE.test(rel))
    .sort()
}

/**
 * 16 Hex-Zeichen SHA-256 über Pfad + Inhalt jeder Quelldatei und über die
 * `VITE_*`-Umgebung. Letztere gehört dazu, weil sie ins Bundle eingesetzt wird:
 * eine neue VITE_API_URL ist ein neuer Build, und der Kill-Switch muss dann den
 * API-Cache der alten Adresse räumen.
 */
export function sourceBuildId(wurzel, env = process.env) {
  const h = createHash('sha256')
  for (const rel of buildIdDateien(wurzel)) {
    h.update(rel)
    h.update('\0')
    h.update(fs.readFileSync(path.join(wurzel, rel)))
    h.update('\0')
  }
  for (const key of Object.keys(env).filter(k => k.startsWith('VITE_')).sort()) {
    h.update(`${key}=${env[key]}\0`)
  }
  return h.digest('hex').slice(0, 16)
}

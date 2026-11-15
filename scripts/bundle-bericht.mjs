// Bundle-Bericht (Charge O, docs/specs/refactoring-wachstum.md §8.3).
//
// Liest die fertigen Builds (dist/ = Mandanten-App, dist-admin/ = Betreiber-Seite)
// und schreibt je Ziel: JS und CSS gesamt (roh und gzip), den Einstiegs-Chunk und
// die zehn grössten Dateien. Ob mehr Code-Splitting nötig ist, entscheidet diese
// Zahl — bis 2026-11 war sie nicht gemessen.
//
// In der CI (GITHUB_STEP_SUMMARY gesetzt) landet der Bericht im Job-Summary von
// `test-and-build`, sonst auf stdout. Er bricht nie ab: ein fehlendes Ziel wird
// gemeldet, nicht als Fehler gewertet — dafür gibt es den Build-Step davor.
//
//   npm run build && npm run build:admin && node scripts/bundle-bericht.mjs
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const WURZEL = resolve(import.meta.dirname, '..')
const ZIELE = [
  ['Mandanten-App', 'dist'],
  ['Betreiber-Seite', 'dist-admin'],
]

const kb = n => `${(n / 1024).toFixed(1)} kB`

function dateien(ordner) {
  const assets = join(ordner, 'assets')
  if (!existsSync(assets)) return []
  return readdirSync(assets)
    .filter(n => n.endsWith('.js') || n.endsWith('.css'))
    .map(name => {
      const pfad = join(assets, name)
      const roh = statSync(pfad).size
      return { name, roh, gzip: gzipSync(readFileSync(pfad)).length }
    })
}

function summe(liste) {
  return liste.reduce((s, d) => ({ roh: s.roh + d.roh, gzip: s.gzip + d.gzip }), { roh: 0, gzip: 0 })
}

function bericht() {
  const zeilen = ['## Bundle-Grösse', '']
  for (const [titel, ordner] of ZIELE) {
    const alle = dateien(join(WURZEL, ordner))
    if (!alle.length) {
      zeilen.push(`**${titel}** (\`${ordner}/\`): kein Build gefunden.`, '')
      continue
    }
    const js = alle.filter(d => d.name.endsWith('.js'))
    const css = alle.filter(d => d.name.endsWith('.css'))
    const einstieg = js.filter(d => /^(index|admin)-/.test(d.name))
    const sj = summe(js), sc = summe(css), se = summe(einstieg)
    zeilen.push(
      `**${titel}** (\`${ordner}/\`) — ${js.length} JS-Chunks, ${css.length} CSS-Dateien`,
      '',
      '| | roh | gzip |',
      '|---|---:|---:|',
      `| JS gesamt | ${kb(sj.roh)} | ${kb(sj.gzip)} |`,
      `| davon Einstieg (${einstieg.map(d => d.name).join(', ') || '—'}) | ${kb(se.roh)} | ${kb(se.gzip)} |`,
      `| CSS gesamt | ${kb(sc.roh)} | ${kb(sc.gzip)} |`,
      '',
      '<details><summary>Grösste Dateien (gzip)</summary>',
      '',
      '| Datei | roh | gzip |',
      '|---|---:|---:|',
      ...[...alle].sort((a, b) => b.gzip - a.gzip).slice(0, 10)
        .map(d => `| \`${d.name}\` | ${kb(d.roh)} | ${kb(d.gzip)} |`),
      '',
      '</details>',
      '',
    )
  }
  return zeilen.join('\n')
}

const text = bericht()
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
} else {
  console.log(text)
}

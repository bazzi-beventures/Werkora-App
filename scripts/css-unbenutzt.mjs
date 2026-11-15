// Ungenutzte Klassen in einem globalen Stylesheet finden (Charge O,
// docs/specs/refactoring-wachstum.md §8.2).
//
// `admin.css` ist global und über 5'000 Zeilen lang; niemand löscht darin, weil
// niemand weiss, was noch benutzt wird. Dieses Skript sammelt jede Klasse aus den
// Selektoren der Datei und sucht sie als ganzes Wort in `src/**/*.{ts,tsx}` und
// `index.html`/`admin.html`. Was nirgends vorkommt, ist ein **Kandidat** — kein
// Beweis: zusammengesetzte Namen (`badge-${status}`) findet eine Wortsuche nicht.
// Deshalb zwei Listen: «nirgends» und «nur über einen zusammengesetzten Namen
// erreichbar» (ein Präfix der Klasse steht vor einem `${` im Quelltext).
//
//   npm run css:unbenutzt                       # admin.css
//   node scripts/css-unbenutzt.mjs src/index.css
//
// Läuft nicht in der CI: das Ergebnis ist eine Arbeitsliste fürs Aufräumen, kein
// Gate — ein falscher Treffer darf keinen Lauf rot machen.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const WURZEL = resolve(import.meta.dirname, '..')
const ZIEL = resolve(WURZEL, process.argv[2] || 'src/admin/admin.css')

/** Klassennamen aus den Selektoren (nicht aus den Deklarationen) eines Stylesheets. */
export function klassenAusCss(css) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const klassen = new Set()
  let prelude = ''
  for (const zeichen of ohneKommentare) {
    if (zeichen === '{') {
      const sel = prelude.trim()
      if (!sel.startsWith('@')) {
        // Attribut-Selektoren und Strings ausblenden, sonst wird `[href$=".pdf"]` zur Klasse «pdf».
        for (const m of sel.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) klassen.add(m[1])
      }
      prelude = ''
    } else if (zeichen === '}' || zeichen === ';') {
      prelude = ''
    } else {
      prelude += zeichen
    }
  }
  return klassen
}

function quellen(ordner) {
  const texte = []
  for (const e of readdirSync(ordner, { recursive: true, withFileTypes: true })) {
    if (e.isFile() && /\.(tsx?|html)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      texte.push(readFileSync(join(e.parentPath, e.name), 'utf8'))
    }
  }
  for (const html of ['index.html', 'admin.html']) {
    try { texte.push(readFileSync(join(WURZEL, html), 'utf8')) } catch { /* fehlt im Ziel */ }
  }
  return texte.join('\n')
}

/** Teilt Klassen in «benutzt», «nur zusammengesetzt erreichbar» und «nirgends». */
export function einordnen(klassen, quelltext) {
  const nirgends = []
  const zusammengesetzt = []
  for (const k of [...klassen].sort()) {
    const wort = new RegExp(`(?<![\\w-])${k.replace(/[-]/g, '\\-')}(?![\\w-])`)
    if (wort.test(quelltext)) continue
    const teile = k.split('-')
    const praefixe = teile.slice(1).map((_, i) => teile.slice(0, i + 1).join('-') + '-')
    if (praefixe.some(p => quelltext.includes(p + '${'))) zusammengesetzt.push(k)
    else nirgends.push(k)
  }
  return { nirgends, zusammengesetzt }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const klassen = klassenAusCss(readFileSync(ZIEL, 'utf8'))
  const { nirgends, zusammengesetzt } = einordnen(klassen, quellen(join(WURZEL, 'src')))
  console.log(`${relative(WURZEL, ZIEL)}: ${klassen.size} Klassen in Selektoren`)
  console.log(`\nNirgends im Quelltext (${nirgends.length}) — Kandidaten zum Löschen:`)
  for (const k of nirgends) console.log(`  .${k}`)
  console.log(`\nNur über einen zusammengesetzten Namen erreichbar (${zusammengesetzt.length}) — erst prüfen:`)
  for (const k of zusammengesetzt) console.log(`  .${k}`)
}

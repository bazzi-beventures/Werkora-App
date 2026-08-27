// Blockierendes Gate für die Design-Tokens — Schwester von eslint-gate.mjs und
// derselbe Ratchet wie beim Ruff-Gate der Backend-CI: was sauber ist, bleibt
// sauber; was noch Bestand hat, darf nur schrumpfen.
//
// Es prüft drei Dinge, die alle aus derselben Ursache kommen — zwei
// Token-Systeme (admin/tokens.css und index.css), die nebeneinander gewachsen
// sind und sich :root teilen (docs/specs/design-tokens/README.md).
//
// 1. KOLLISIONEN (hart, Bestand 0). Kein Custom Property darf in mehr als einer
//    CSS-Datei auf :root definiert sein. Das ist keine Stilfrage: --radius-sm
//    stand in tokens.css auf 6px und in index.css auf 10px, und welcher Wert
//    galt, entschied allein die Reihenfolge im gebauten CSS. Gewonnen hat 10px,
//    die fünf Admin-Stellen rendern seither runder als gemeint — und ein
//    umgestellter Import hätte es jederzeit andersherum kippen können, ohne dass
//    jemand eine Zeile CSS anfasst. Dasselbe galt für --bg, --surface, --border,
//    --text und --on-accent, deren Admin-Werte komplett wirkungslos waren.
//    Ein Alias (--text-muted: var(--muted)) ist ausdrücklich erlaubt: er
//    definiert den Namen einmal und verweist auf die eine Quelle.
//
// 2. UNBEKANNTE TOKENS ohne Fallback (hart, Bestand 0). `var(--gibts-nicht)`
//    macht die ganze Deklaration ungültig — die Eigenschaft fällt auf den
//    geerbten Wert zurück. Es kracht also nicht, es sieht nur falsch aus:
//    gedämpfter Text kam in voller Textfarbe, weil 31 Stellen ein
//    `--color-text-secondary` benutzten, das nie existiert hat. MIT Fallback
//    ist es erlaubt und beabsichtigt — die Einsatzplanung setzt ihre
//    `--kind-*`-Farben zur Laufzeit aus der Mandanten-Konfiguration.
//
// 3. NACKTE HEX-FARBEN in TSX (Budget). Ein Hex-Literal, das direkt in einem
//    Inline-Style steht, kennt keine Themes: es bleibt hell, wenn der Nutzer
//    dunkel schaltet. Nicht mitgezählt werden Hex als var()-Fallback
//    (`var(--danger, #ef4444)`) — dort ist der Wert die Absicherung, nicht der
//    Wildwuchs — sowie Testdateien.
//
// Das Budget senkt man, wenn man Stellen migriert hat; anheben, um einen Lauf
// grün zu bekommen, ist nie die Lösung — dann ist der Fund die Aufgabe.
//
// Lokal: `npm run lint:gate` (läuft nach dem ESLint-Gate).
//
// ACHTUNG, Job-NAME: in der CI hängt dieses Gate als eigener Step im Job
// "ESLint-Gate (refs/purity/globals/no-empty) – blockierend". Der Name nennt
// dieses Gate nicht, und das bleibt so: er steht als Required Check in der
// Branch Protection von main UND develop, Umbenennen lässt jeden PR auf
// "Expected" hängen, bis jemand die GitHub-Settings nachzieht. Derselbe Fall
// wie beim Ruff-Gate, siehe CLAUDE.md.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Bestand am 2026-08-26, nach den Paketen 01–06 der Token-Serie.
// Nur senken.
const HEX_BUDGET = 153

const SRC = 'src'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = walk(SRC)

// CSS-Kommentare vor dem Parsen entfernen. Ohne das schneidet ein '}' in
// einem Kommentar den :root-Block ab — eine echte Kollision dahinter entgeht
// dem Gate — und ein auskommentiertes `var(--alt)` zaehlt als Treffer.
// Experimentell belegt (Nachkontrolle 2026-08-26), nicht theoretisch.
const ohneCssKommentare = css => css.replace(/\/\*[\s\S]*?\*\//g, '')

// Kommentarzeilen zählen nicht: dort steht keine Farbe, die je gerendert wird,
// aber durchaus etwas, das wie eine aussieht — der React-Fehlercode #310 in
// App.tsx ist der Grund, aus dem diese Zeile hier steht.
const KOMMENTAR = /^\s*(\/\/|\/\*|\*)/

// ── 1. Kollisionen ───────────────────────────────────────────────────────────
const definedIn = new Map() // Token-Name -> Set<Datei>
for (const fp of files.filter(f => f.endsWith('.css'))) {
  const css = ohneCssKommentare(readFileSync(fp, 'utf8'))
  for (const block of css.matchAll(/:root[^{]*\{([^}]*)\}/g)) {
    for (const decl of block[1].matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
      if (!definedIn.has(decl[1])) definedIn.set(decl[1], new Set())
      definedIn.get(decl[1]).add(relative(SRC, fp))
    }
  }
}
const kollisionen = [...definedIn.entries()].filter(([, fs]) => fs.size > 1)

// ── 2. Unbekannte Tokens ohne Fallback ───────────────────────────────────────
// Definiert zählt jede Deklaration in einer CSS-Datei, nicht nur die auf :root —
// scoped Tokens sind genauso echt.
const bekannt = new Set()
for (const fp of files.filter(f => f.endsWith('.css'))) {
  for (const decl of ohneCssKommentare(readFileSync(fp, 'utf8')).matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
    bekannt.add(decl[1])
  }
}
// var(--x) OHNE Komma, also ohne Fallback
const OHNE_FALLBACK = /var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g

// Geprüft werden TSX *und* CSS: in den Stylesheets stehen die meisten var(),
// und derselbe Vertipper wirkt dort genauso — `.signature-pad-title` stand auf
// einem `--fg`, das es nie gab, und hatte damit gar keine eigene Farbe.
const istQuelle = f =>
  (/\.tsx?$/.test(f) && !f.endsWith('.test.tsx') && !f.endsWith('.test.ts')) || f.endsWith('.css')

const unbekannt = []
for (const fp of files.filter(istQuelle)) {
  const inhalt = fp.endsWith('.css')
    ? ohneCssKommentare(readFileSync(fp, 'utf8'))
    : readFileSync(fp, 'utf8')
  const lines = inhalt.split('\n')
  lines.forEach((line, i) => {
    if (KOMMENTAR.test(line)) return
    for (const m of line.matchAll(OHNE_FALLBACK)) {
      if (!bekannt.has(m[1])) unbekannt.push(`${relative(SRC, fp)}:${i + 1}  ${m[1]}`)
    }
  })
}

// ── 3. Nackte Hex-Farben in TSX ──────────────────────────────────────────────
const HEX = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b/g
const FALLBACK = /var\(\s*--[a-zA-Z0-9-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/g


const treffer = []
for (const fp of files.filter(f => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))) {
  const lines = readFileSync(fp, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (KOMMENTAR.test(line)) return
    // var()-Fallbacks ausblenden, damit ihr Hex nicht mitzählt
    const rest = line.replace(FALLBACK, 'var(--x)')
    for (const m of rest.matchAll(HEX)) {
      treffer.push(`${relative(SRC, fp)}:${i + 1}  ${m[0]}`)
    }
  })
}

// ── Bericht ──────────────────────────────────────────────────────────────────
let fehler = false

if (kollisionen.length > 0) {
  fehler = true
  console.error(`Token-Gate: ${kollisionen.length} Token in mehreren Dateien definiert\n`)
  for (const [name, fs] of kollisionen) {
    console.error(`  ${name}  ->  ${[...fs].join(', ')}`)
  }
  console.error('\nWelcher Wert gilt, entscheidet dann die Reihenfolge im gebauten CSS.')
  console.error('Ein Name gehoert in eine Datei; die andere verweist per var() darauf.\n')
}

if (unbekannt.length > 0) {
  fehler = true
  console.error(`Token-Gate: ${unbekannt.length}x var() auf ein Token, das nirgends definiert ist\n`)
  for (const u of unbekannt.slice(0, 30)) console.error('  ' + u)
  if (unbekannt.length > 30) console.error(`  … und ${unbekannt.length - 30} weitere`)
  console.error('\nDas macht die ganze Deklaration ungueltig — die Eigenschaft faellt auf den')
  console.error('geerbten Wert zurueck. Es kracht nicht, es sieht nur falsch aus.')
  console.error('Entweder den richtigen Token-Namen nehmen oder einen Fallback angeben:')
  console.error('  var(--kind-project, var(--primary))   <- zur Laufzeit gesetzt, deshalb mit Fallback\n')
}

if (treffer.length > HEX_BUDGET) {
  fehler = true
  console.error(`Token-Gate: ${treffer.length} nackte Hex-Farben in TSX, erlaubt sind ${HEX_BUDGET}\n`)
  for (const t of treffer.slice(0, 40)) console.error('  ' + t)
  if (treffer.length > 40) console.error(`  … und ${treffer.length - 40} weitere`)
  console.error('\nFarben gehoeren in die Token-Dateien: ein Hex im Inline-Style kennt kein Theme.')
  console.error('Das Budget wird gesenkt, wenn Stellen migriert sind — nie angehoben.\n')
}

if (fehler) process.exit(1)

const luft = HEX_BUDGET - treffer.length
console.log(
  `Token-Gate sauber — keine Token-Kollision, kein unbekanntes Token, ` +
  `${treffer.length} nackte Hex-Farben (Budget ${HEX_BUDGET}${luft > 0 ? `, ${luft} Luft` : ''})`,
)
if (luft > 0) {
  console.log(`Hinweis: Budget in scripts/token-gate.mjs auf ${treffer.length} senken.`)
}

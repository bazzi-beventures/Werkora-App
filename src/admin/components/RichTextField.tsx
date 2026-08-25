import { useEffect, useRef, useState } from 'react'
import { EditorProvider, Editor, Toolbar, BtnBold, BtnItalic, BtnBulletList, BtnNumberedList } from 'react-simple-wysiwyg'
import MarkdownIt from 'markdown-it'
import TurndownService from 'turndown'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

// WYSIWYG-Editor für formatierbare Offerten-/Rechnungs-Freitexte (Bemerkungen,
// Schlusstext/Disclaimer, Rechnungs-Schlusssatz). Der Nutzer sieht Fett/Kursiv/Listen
// direkt (wie in einer Mail) — KEINE sichtbaren Marker.
//
// Gespeichert wird weiterhin **Markdown** (unverändertes Backend/PDF/Sicherheits-
// Pipeline aus PR #96). Der Editor arbeitet intern mit HTML und konvertiert:
//   laden : Markdown -> HTML  (markdown-it, exakt wie der Backend-`richtext`-Filter)
//   tippen: HTML -> Markdown  (turndown)
// Dadurch bleibt der gespeicherte Wert ungefährlicher Text (kein Stored-HTML/-XSS),
// und Editor-Darstellung = generiertes PDF (beide parsen dasselbe Markdown mit derselben
// markdown-it-Engine). NICHT für Produktbeschreibungen — die bleiben plain.

// Deckungsgleich mit services/invoice_generator._MD_RENDERER: nur fett/kursiv/Listen/
// Umbrüche, html=false (kein rohes HTML), keine Link-/Bild-Regeln.
const md = MarkdownIt('zero', { html: false, breaks: true }).enable([
  'emphasis', 'list', 'newline', 'escape',
])

// Spacer für bewusst gesetzte Leerzeilen. NBSP (U+00A0) ist keine Markdown-Blankline,
// daher behalten JS- und Python-markdown-it den Absatz (statt ihn zu kollabieren).
const NBSP = String.fromCharCode(160)

// HTML -> Markdown-Subset. Semantische Tags (<b>/<strong>, <i>/<em>, <ul>/<ol>) erwartet;
// styleWithCSS wird unten abgeschaltet, damit execCommand keine <span style>-Bold erzeugt
// (die turndown nicht in `**` überführen könnte).
const turndown = new TurndownService({
  emDelimiter: '*',
  strongDelimiter: '**',
  bulletListMarker: '-',
  headingStyle: 'atx',
  // Leere Blöcke (leere Absätze — auch beim Neu-Laden erzeugte <p>NBSP</p>) als
  // NBSP-Spacer serialisieren statt verwerfen, sonst driften bewusst gesetzte Leerzeilen
  // beim ersten Edit nach dem Laden wieder weg (Roundtrip-Instabilität).
  // node.isBlock ist ein Laufzeit-Feld von turndown, in @types/turndown (HTMLElement) nicht typisiert.
  blankReplacement: (_content, node) => ((node as unknown as { isBlock: boolean }).isBlock ? '\n\n' + NBSP + '\n\n' : ''),
})

export function mdToHtml(value: string): string {
  if (!value || value.trim() === '') return ''
  return md.render(value)
}

export function htmlToMd(html: string): string {
  // turndown polstert Listen-Marker ("-   a", "1.  a") zur Ausrichtung — auf ein
  // Leerzeichen normalisieren, damit der gespeicherte Markdown-Text sauber bleibt und
  // stabil round-trippt (rendert ohnehin identisch). Nur flache Listen (kein Nesting-UI).
  return turndown
    .turndown(html || '')
    .replace(/^(\s*)([-*+])\s+/gm, '$1$2 ')
    .replace(/^(\s*)(\d+\.)\s+/gm, '$1$2 ')
    // Frisch getippte Leerzeilen (<div><br></div>) rendert turndown als reine
    // Leerzeichen-Zeile — markdown-it würde die kollabieren. → NBSP-Spacer, damit die
    // Leerzeile in Editor UND PDF erhalten bleibt. (Rand-Leerzeilen entfernt .trim().)
    .replace(/^[ \t]+$/gm, NBSP)
    .trim()
}

export function RichTextField({ value, onChange, placeholder, rows = 8 }: Props) {
  // Editor-State ist HTML; Quelle der Wahrheit nach aussen bleibt Markdown (`value`).
  const [html, setHtml] = useState(() => mdToHtml(value))
  // Zuletzt nach aussen gemeldeter Markdown-Wert — unterscheidet "eigene Eingabe"
  // (Echo, kein Reset) von "externer Änderung" (Laden / Checkbox → Reset).
  const lastMdRef = useRef(value)

  useEffect(() => {
    if (value !== lastMdRef.current) {
      lastMdRef.current = value
      setHtml(mdToHtml(value))
    }
  }, [value])

  // Semantische Tags statt <span style="font-weight:bold"> erzwingen — sonst überlebt
  // Fett/Kursiv die Markdown-Serialisierung (turndown) nicht. In jsdom (Tests) ist
  // execCommand nicht implementiert → schlucken.
  useEffect(() => {
    try { document.execCommand('styleWithCSS', false, 'false') } catch { /* jsdom */ }
  }, [])

  function handleChange(e: { target: { value: string } }) {
    const nextHtml = e.target.value
    setHtml(nextHtml)
    const asMd = htmlToMd(nextHtml)
    lastMdRef.current = asMd
    onChange(asMd)
  }

  return (
    <div className="richtext-field">
      <EditorProvider>
        <Editor
          value={html}
          onChange={handleChange}
          placeholder={placeholder}
          containerProps={{ style: { minHeight: rows * 24, background: 'var(--bg, #fff)' } }}
        >
          <Toolbar>
            <BtnBold />
            <BtnItalic />
            <BtnBulletList />
            <BtnNumberedList />
          </Toolbar>
        </Editor>
      </EditorProvider>
      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
        Fett, kursiv, Aufzählung und Nummerierung erscheinen genau so im PDF.
      </div>
    </div>
  )
}

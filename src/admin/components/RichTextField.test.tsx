import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { mdToHtml, htmlToMd, RichTextField } from './RichTextField'

// execCommand-Formatierung lässt sich in jsdom nicht ausführen — deshalb prüfen wir die
// reine Konvertierungslogik (die Quelle möglicher Fehler) sowie einen Render-Smoke-Test.
describe('RichTextField – Konvertierung', () => {
  it('mdToHtml rendert fett/kursiv/Listen', () => {
    expect(mdToHtml('**a**')).toContain('<strong>a</strong>')
    expect(mdToHtml('*a*')).toContain('<em>a</em>')
    const ul = mdToHtml('- a\n- b')
    expect(ul).toContain('<ul>')
    expect(ul).toContain('<li>a</li>')
  })

  it('mdToHtml ist leer bei leerem Wert', () => {
    expect(mdToHtml('')).toBe('')
    expect(mdToHtml('   ')).toBe('')
  })

  it('mdToHtml escaped rohes HTML (kein <script>)', () => {
    expect(mdToHtml('<script>x</script>')).not.toContain('<script>')
  })

  it('htmlToMd serialisiert fett/kursiv/Listen zu Markdown', () => {
    expect(htmlToMd('<strong>a</strong>')).toBe('**a**')
    expect(htmlToMd('<em>a</em>')).toBe('*a*')
    expect(htmlToMd('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b')
  })

  it('Round-Trip Markdown -> HTML -> Markdown bleibt stabil', () => {
    for (const mdSrc of ['**a**', '*a*', '- a\n- b', '1. a\n2. b']) {
      expect(htmlToMd(mdToHtml(mdSrc))).toBe(mdSrc)
    }
  })

  it('bewahrt bewusst gesetzte Leerzeilen als Spacer (Editor + PDF)', () => {
    const NBSP = String.fromCharCode(160)
    // Zwei Leerzeilen zwischen Text (contentEditable liefert <div><br></div>).
    const md = htmlToMd('<div>Gruss</div><div><br></div><div><br></div><div>Firma</div>')
    expect(md).toBe(`Gruss\n\n${NBSP}\n\n${NBSP}\n\nFirma`)
    // markdown-it behält die NBSP-Absätze (kollabiert sie nicht) → 4 Absätze.
    expect((mdToHtml(md).match(/<p>/g) || []).length).toBe(4)
  })

  it('Leerzeilen-Round-Trip bleibt stabil (kein Drift beim Edit nach Laden)', () => {
    const md1 = htmlToMd('<div>A</div><div><br></div><div>B</div>')
    // Laden (mdToHtml) → erneut serialisieren muss denselben Markdown ergeben.
    expect(htmlToMd(mdToHtml(md1))).toBe(md1)
  })

  it('rendert die Editor-Toolbar', () => {
    render(<RichTextField value="**a**" onChange={() => {}} />)
    expect(screen.getByTitle('Bold')).toBeInTheDocument()
  })
})

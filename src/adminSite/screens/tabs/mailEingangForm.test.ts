import { describe, it, expect } from 'vitest'
import {
  TAGESLIMIT_MAX, abholungText, domainVon, einstellungAus, formAus, geaendert, istAdresse, istDomain,
  listeAusText, normalisiereAdressen, normalisiereDomain, normalisiereDomains, offenePunkte, pruefe,
} from './mailEingangForm'

// docs/specs/mail-eingang-triage.md §6.4, §10 — Reiter «Mail-Eingang».

const gespeichert = {
  anbieter: 'graph' as const,
  mailbox: 'triage@gehlhaar.ch', domains: ['gehlhaar.ch'], funktionsadressen: ['info@gehlhaar.ch'], tageslimit: 50,
}

describe('Normalisierung', () => {
  it('zerlegt Text an Zeilen, Kommas, Strichpunkten und Leerraum', () => {
    expect(listeAusText(' a.ch\nb.ch, c.ch ;d.ch\n\n')).toEqual(['a.ch', 'b.ch', 'c.ch', 'd.ch'])
    expect(listeAusText('   ')).toEqual([])
  })

  it('trimmt Domains, schreibt sie klein und nimmt ein führendes @ weg', () => {
    expect(normalisiereDomain('  @Gehlhaar.CH ')).toBe('gehlhaar.ch')
    expect(normalisiereDomain('gehlhaar.ch.')).toBe('gehlhaar.ch')
  })

  it('entfernt Duplikate, die erst nach dem Normalisieren gleich sind', () => {
    expect(normalisiereDomains(['Gehlhaar.ch', '@gehlhaar.ch', ' ', 'storen.ch'])).toEqual(['gehlhaar.ch', 'storen.ch'])
    expect(normalisiereAdressen(['Info@Gehlhaar.ch', 'info@gehlhaar.ch ', ''])).toEqual(['info@gehlhaar.ch'])
  })

  it('baut aus der Maske, was gespeichert wird', () => {
    expect(einstellungAus({
      anbieter: 'gmail',
      mailbox: ' Triage@Gehlhaar.ch ',
      domains: 'Gehlhaar.ch\n@gehlhaar.ch\nstoren.ch',
      funktionsadressen: 'INFO@gehlhaar.ch, info@gehlhaar.ch',
      tageslimit: ' 50 ',
    })).toEqual({
      anbieter: 'gmail',
      mailbox: 'triage@gehlhaar.ch',
      domains: ['gehlhaar.ch', 'storen.ch'],
      funktionsadressen: ['info@gehlhaar.ch'],
      tageslimit: 50,
    })
  })

  it('geht verlustfrei hin und zurück', () => {
    expect(einstellungAus(formAus(gespeichert))).toEqual(gespeichert)
  })
})

describe('Prüfung', () => {
  it('erkennt Domains und Adressen', () => {
    expect(istDomain('gehlhaar.ch')).toBe(true)
    expect(istDomain('mail.gehlhaar.ch')).toBe(true)
    expect(istDomain('gehlhaar')).toBe(false)
    expect(istDomain('info@gehlhaar.ch')).toBe(false)
    expect(istDomain('-x.ch')).toBe(false)
    expect(istAdresse('info@gehlhaar.ch')).toBe(true)
    expect(istAdresse('info@gehlhaar')).toBe(false)
    expect(istAdresse('gehlhaar.ch')).toBe(false)
    expect(istAdresse('a@b@gehlhaar.ch')).toBe(false)
    expect(istAdresse('vor name@gehlhaar.ch')).toBe(false)
  })

  it('lässt eine saubere Einstellung durch — auch ohne Postfach und mit leerer Liste', () => {
    expect(pruefe(gespeichert)).toEqual([])
    expect(pruefe({ mailbox: '', domains: [], funktionsadressen: [], tageslimit: 0 })).toEqual([])
  })

  it('benennt, was nicht stimmt', () => {
    const fehler = pruefe({
      mailbox: 'triage', domains: ['gehlhaar', 'info@gehlhaar.ch'], funktionsadressen: ['info'], tageslimit: Number.NaN,
    })
    expect(fehler).toEqual([
      '«gehlhaar» ist keine Mail-Domain (erwartet z. B. «firma.ch»).',
      '«info@gehlhaar.ch» ist eine Adresse, keine Domain — nur den Teil nach dem @ eintragen.',
      '«info» ist keine Mailadresse.',
      '«triage» ist keine Mailadresse.',
      `Das Tageslimit ist eine ganze Zahl zwischen 0 und ${TAGESLIMIT_MAX}.`,
    ])
  })

  it('nimmt als Tageslimit nur ganze Zahlen im erlaubten Bereich', () => {
    for (const eingabe of ['', '-1', '2.5', 'viele', String(TAGESLIMIT_MAX + 1)]) {
      expect(pruefe(einstellungAus({ ...formAus(gespeichert), tageslimit: eingabe })), eingabe).toHaveLength(1)
    }
    for (const eingabe of ['0', String(TAGESLIMIT_MAX)]) {
      expect(pruefe(einstellungAus({ ...formAus(gespeichert), tageslimit: eingabe })), eingabe).toEqual([])
    }
  })

  // Wie pruefe_config auf dem Server: die Liste ist die Schranke.
  it('lässt keine Funktionsadresse ausserhalb der Domains zu', () => {
    expect(pruefe({ ...gespeichert, funktionsadressen: ['info@gehlhaar.ch', 'buero@andere.ch'] }))
      .toEqual(['Funktionsadresse ausserhalb der Mail-Domains: buero@andere.ch'])
    // Eine Unterdomain oder ein gleicher Anfang ist nicht die eingetragene Domain.
    expect(pruefe({ ...gespeichert, funktionsadressen: ['info@mail.gehlhaar.ch'] })).toHaveLength(1)
    expect(pruefe({ ...gespeichert, funktionsadressen: ['info@gehlhaar.ch.example.com'] })).toHaveLength(1)
    // Ohne Domain ist jede Adresse draussen.
    expect(pruefe({ ...gespeichert, mailbox: '', domains: [] })).toHaveLength(1)
  })

  it('verlangt das Triage-Postfach in einer Domain und nicht als Funktionsadresse', () => {
    expect(pruefe({ ...gespeichert, mailbox: 'triage@andere.ch' }))
      .toEqual(['Das Triage-Postfach muss in einer der Mail-Domains des Betriebs liegen.'])
    expect(pruefe({ ...gespeichert, mailbox: 'info@gehlhaar.ch' }))
      .toEqual(['Das Triage-Postfach darf nicht selbst als Funktionsadresse eingetragen sein.'])
  })

  it('liest die Domain einer Adresse', () => {
    expect(domainVon('info@gehlhaar.ch')).toBe('gehlhaar.ch')
    expect(domainVon('gehlhaar.ch')).toBe('')
  })
})

describe('Zustand', () => {
  it('hält reine Schreibweisen nicht für eine Änderung', () => {
    const form = formAus(gespeichert)
    expect(geaendert(form, gespeichert)).toBe(false)
    expect(geaendert({ ...form, domains: ' @Gehlhaar.CH \n' }, gespeichert)).toBe(false)
    expect(geaendert({ ...form, domains: 'gehlhaar.ch\nstoren.ch' }, gespeichert)).toBe(true)
    expect(geaendert({ ...form, tageslimit: '51' }, gespeichert)).toBe(true)
    expect(geaendert({ ...form, mailbox: '' }, gespeichert)).toBe(true)
  })

  it('zählt auf, was vor der ersten Auswertung noch fehlt', () => {
    expect(offenePunkte({ graph_bereit: true, mailbox: 'triage@gehlhaar.ch', domains: ['gehlhaar.ch'], modul_aktiv: true }))
      .toEqual([])
    const alles = offenePunkte({ graph_bereit: false, mailbox: '', domains: [], modul_aktiv: false })
    expect(alles).toHaveLength(4)
    expect(alles[2]).toMatch(/nichts ausgewertet/)
  })

  it('nennt beim fehlenden Zugang das gewählte Mailsystem', () => {
    const punkte = offenePunkte({
      anbieter: 'gmail', postfach_bereit: false, graph_bereit: true,
      mailbox: 'werkora-eingang@beventures.ch', domains: ['beventures.ch'], modul_aktiv: true,
    })
    expect(punkte).toEqual(['Der Postfach-Zugang ist in dieser Umgebung nicht eingerichtet (Google Workspace).'])
  })

  it('erkennt einen Wechsel des Mailsystems als Änderung', () => {
    const form = formAus(gespeichert)
    expect(form.anbieter).toBe('graph')
    expect(geaendert({ ...form, anbieter: 'gmail' }, gespeichert)).toBe(true)
  })

  it('beschriftet die letzte Abholung', () => {
    expect(abholungText(null)).toBe('noch nie')
    expect(abholungText('kein Datum')).toBe('noch nie')
    expect(abholungText('2026-11-12T13:05:00Z')).toBe('12.11.2026, 14:05')
  })
})

import { describe, it, expect } from 'vitest'
import type { EingangProjekt, EingangVorschlag } from '../../api/admin/mailEingang'
import {
  acceptPayload, anhaengeText, anhangText, entscheidText, ergebnisHinweis, ergebnisZiel, fehltZumUebernehmen,
  fmtGroesse, istBekannterTyp, neuesteZuerst, offeneVorschlaege, personText, serverSatz, startEingabe, typTitel,
  uebernehmenLabel,
} from './mailEingang'

// docs/specs/mail-eingang-triage.md §4 (Vorschläge) und §10 (Oberfläche).

const P1: EingangProjekt = { project_id: 'p1', number: '2600515', name: 'Bad Muster', customer: 'Muster AG', locality: 'Chur' }
const P2: EingangProjekt = { project_id: 'p2', number: '2600520', name: 'Küche Muster', customer: 'Muster AG', locality: 'Chur' }

const basis = { id: 's1', status: 'offen' as const, created: null, decided_by_name: null, decided_at: null }

const entwurf: EingangVorschlag = {
  ...basis, typ: 'projekt_entwurf',
  payload: {
    title: 'Storen Balkon', customer_name: 'Hans Muster', customer_phone: '079 000 00 00', customer_email: '',
    customer_address: '', object_name: '', object_address: 'Hauptstrasse 1, Chur', description: 'Zwei Storen ersetzen',
  },
}
const projektnotiz = (project_id: string | null): EingangVorschlag => ({
  ...basis, typ: 'projektnotiz', payload: { project_id, projects: [P1, P2], text: 'Kunde bestätigt den Termin.' },
})
const kundennotiz: EingangVorschlag = {
  ...basis, typ: 'kundennotiz', payload: { customer_id: 'c1', customer_name: 'Muster AG', text: 'Ruft nächste Woche an.' },
}
const kontakt: EingangVorschlag = {
  ...basis, typ: 'kontakt_ergaenzen',
  payload: { customer_id: 7, customer_name: 'Muster AG', feld: 'phone', feld_label: 'Mobile', wert: '079 111 22 33' },
}

describe('Beschriftungen', () => {
  it('kennt die Typen aus der abschliessenden Liste und nichts sonst', () => {
    for (const typ of ['projekt_entwurf', 'projektnotiz', 'kundennotiz', 'kontakt_ergaenzen', 'projektdokument']) {
      expect(istBekannterTyp(typ)).toBe(true)
      expect(typTitel(typ)).not.toBe('Unbekannter Vorschlag')
    }
    expect(istBekannterTyp('aufgabe')).toBe(false)
    // Kein geerbtes Property darf als Typ durchgehen.
    expect(istBekannterTyp('toString')).toBe(false)
    expect(typTitel('rechnung')).toBe('Unbekannter Vorschlag')
  })

  it('zeigt Name und Adresse, oder was davon da ist', () => {
    expect(personText({ name: 'Petra Büro', email: 'petra@betrieb.ch' })).toBe('Petra Büro (petra@betrieb.ch)')
    expect(personText({ name: null, email: 'info@betrieb.ch' })).toBe('info@betrieb.ch')
    expect(personText({ name: 'Hans Muster', email: null })).toBe('Hans Muster')
    expect(personText({ name: ' ', email: null })).toBeNull()
  })
})

describe('Liste', () => {
  it('stellt die neueste Mail zuoberst, ohne die Eingabe zu verändern', () => {
    const items = [
      { id: 'alt', received_at: '2026-11-10T08:00:00Z' },
      { id: 'neu', received_at: '2026-11-12T09:30:00Z' },
      { id: 'mitte', received_at: '2026-11-11T17:00:00Z' },
    ]
    expect(neuesteZuerst(items).map(i => i.id)).toEqual(['neu', 'mitte', 'alt'])
    expect(items[0].id).toBe('alt')
  })

  it('zählt nur offene Vorschläge', () => {
    expect(offeneVorschlaege({
      suggestions: [entwurf, { ...kundennotiz, status: 'uebernommen' }, { ...kontakt, status: 'verworfen' }],
    })).toBe(1)
  })
})

describe('Übernehmen', () => {
  it('schickt unverändert keinen Body-Inhalt', () => {
    for (const v of [entwurf, projektnotiz('p1'), kundennotiz, kontakt]) {
      expect(acceptPayload(v, startEingabe(v))).toBeUndefined()
    }
  })

  it('schickt beim Entwurf nur die geänderten Felder, getrimmt', () => {
    const e = startEingabe(entwurf)
    e.felder.title = '  Storen Balkon Süd '
    e.felder.customer_email = 'hans@muster.ch'
    expect(acceptPayload(entwurf, e)).toEqual({ title: 'Storen Balkon Süd', customer_email: 'hans@muster.ch' })
    // Nur Leerraum drumherum ist keine Änderung.
    const f = startEingabe(entwurf)
    f.felder.description = ' Zwei Storen ersetzen\n'
    expect(acceptPayload(entwurf, f)).toBeUndefined()
  })

  it('verlangt bei der Projektnotiz ohne Zuordnung eine Projektwahl', () => {
    const v = projektnotiz(null)
    const e = startEingabe(v)
    expect(e.projekt).toBeNull()
    expect(fehltZumUebernehmen(v, e)).toMatch(/Projekt wählen/)
    e.projekt = P2
    expect(fehltZumUebernehmen(v, e)).toBeNull()
    expect(acceptPayload(v, e)).toEqual({ project_id: 'p2' })
  })

  it('wählt das zugeordnete Projekt vor und schickt nur einen Wechsel', () => {
    const v = projektnotiz('p1')
    const e = startEingabe(v)
    expect(e.projekt).toEqual(P1)
    expect(fehltZumUebernehmen(v, e)).toBeNull()
    e.projekt = P2
    e.felder.text = 'Kunde bestätigt den Termin am Montag.'
    expect(acceptPayload(v, e)).toEqual({ project_id: 'p2', text: 'Kunde bestätigt den Termin am Montag.' })
  })

  it('lässt leere Notizen und Entwürfe ohne Titel oder Kunde nicht durch', () => {
    const n = startEingabe(kundennotiz)
    n.felder.text = '   '
    expect(fehltZumUebernehmen(kundennotiz, n)).toMatch(/leer/)
    const e = startEingabe(entwurf)
    e.felder.title = ''
    expect(fehltZumUebernehmen(entwurf, e)).toMatch(/Titel/)
    e.felder.title = 'x'
    e.felder.customer_name = ''
    expect(fehltZumUebernehmen(entwurf, e)).toMatch(/Kunden/)
  })

  it('überschreibt bei «Kontakt ergänzen» nichts', () => {
    const e = startEingabe(kontakt)
    e.felder.wert = '000'
    expect(acceptPayload(kontakt, e)).toBeUndefined()
    expect(fehltZumUebernehmen(kontakt, e)).toBeNull()
  })

  it('lässt einen unbekannten Typ nur verwerfen', () => {
    const fremd = { ...basis, typ: 'aufgabe', payload: {} } as unknown as EingangVorschlag
    expect(startEingabe(fremd)).toEqual({ felder: {}, projekt: null })
    expect(fehltZumUebernehmen(fremd, startEingabe(fremd))).toMatch(/nur verwerfen/)
    expect(acceptPayload(fremd, startEingabe(fremd))).toBeUndefined()
  })
})

describe('Fehlermeldung des Servers', () => {
  it('zeigt Sätze, aber keine Fehlercodes', () => {
    expect(serverSatz('Diesen Kunden gibt es nicht (mehr).')).toBe('Diesen Kunden gibt es nicht (mehr).')
    expect(serverSatz('nicht_mehr_offen')).toBeNull()
    expect(serverSatz('')).toBeNull()
    expect(serverSatz(undefined)).toBeNull()
  })
})

describe('nach dem Entscheid', () => {
  const entschieden = { status: 'uebernommen' as const, decided_by_name: 'Petra Büro', decided_at: '2026-11-12T13:05:00Z' }

  it('sagt, wer wann übernommen oder verworfen hat', () => {
    expect(entscheidText(basis)).toBeNull()
    expect(entscheidText(entschieden)).toBe('Übernommen von Petra Büro am 12.11.26, 14:05')
    expect(entscheidText({ ...entschieden, status: 'verworfen', decided_by_name: null }))
      .toBe('Verworfen am 12.11.26, 14:05')
    expect(entscheidText({ status: 'verworfen', decided_by_name: null, decided_at: null })).toBe('Verworfen')
  })

  it('sagt, wo das Ergebnis liegt — nur nach dem Übernehmen', () => {
    expect(ergebnisHinweis(entwurf)).toBeNull()
    expect(ergebnisHinweis({ ...entwurf, ...entschieden })).toMatch(/unter Projekt-Entwürfe/)
    expect(ergebnisHinweis({ ...projektnotiz('p2'), ...entschieden }))
      .toBe('Steht als Kommentar am Projekt 2600520 · Küche Muster.')
    expect(ergebnisHinweis({ ...projektnotiz(null), ...entschieden })).toBe('Steht als Kommentar am Projekt.')
    expect(ergebnisHinweis({ ...kundennotiz, ...entschieden })).toBe('Steht als Kommentar beim Kunden Muster AG.')
    expect(ergebnisHinweis({ ...kontakt, ...entschieden })).toBe('Im Kundenstamm bei Muster AG gespeichert (Mobile).')
    expect(ergebnisHinweis({ ...kontakt, ...entschieden, status: 'verworfen' })).toBeNull()
  })

  it('führt zum Ergebnis, wo es ein Ziel gibt', () => {
    expect(ergebnisZiel(entwurf)).toBeNull()
    expect(ergebnisZiel({ ...entwurf, ...entschieden })).toEqual({ screen: 'project-drafts', label: 'Zu den Projekt-Entwürfen' })
    expect(ergebnisZiel({ ...projektnotiz('p2'), ...entschieden }))
      .toEqual({ screen: 'projects', detailId: 'p2', label: 'Projekt öffnen' })
    expect(ergebnisZiel({ ...projektnotiz(null), ...entschieden })).toBeNull()
    expect(ergebnisZiel({ ...kontakt, ...entschieden })).toEqual({ screen: 'customers', detailId: '7', label: 'Kunde öffnen' })
  })
})

// ─── Anhänge und «Anhang am Projekt ablegen» ────────────────────────────────

describe('Anhänge', () => {
  it('schreibt Grössen lesbar', () => {
    expect(fmtGroesse(120 * 1024)).toBe('120 KB')
    expect(fmtGroesse(2.1 * 1024 * 1024)).toBe('2.1 MB')
    expect(fmtGroesse(300)).toBe('1 KB')
    expect(fmtGroesse(null)).toBe('')
    expect(fmtGroesse(Number.NaN)).toBe('')
  })

  it('nennt Name, Grösse und ob der Anhang gelesen wurde', () => {
    expect(anhaengeText([
      { name: 'Auftrag.pdf', size: 120 * 1024, gelesen: true },
      { name: 'Foto.jpg', size: 2.1 * 1024 * 1024, gelesen: false },
    ])).toBe('Auftrag.pdf (120 KB, gelesen), Foto.jpg (2.1 MB)')
    expect(anhangText({ name: ' ', size: 2048, gelesen: false })).toBe('(ohne Namen) (2 KB)')
  })

  it('schweigt ohne Anhänge — auch wenn der Server das Feld noch nicht führt', () => {
    expect(anhaengeText([])).toBeNull()
    expect(anhaengeText(undefined)).toBeNull()
  })
})

describe('projektdokument', () => {
  const dokument = (project_id: string | null): EingangVorschlag => ({
    ...basis, typ: 'projektdokument',
    payload: {
      project_id, projects: [P1, P2], attachment_id: 'att-1', filename: 'Auftrag.pdf',
      mime_type: 'application/pdf', size: 120 * 1024,
    },
  })
  const abgelegt = { status: 'uebernommen' as const, decided_by_name: 'Petra Büro', decided_at: '2026-11-12T13:05:00Z' }

  it('ist ein bekannter Typ mit eigenem Titel', () => {
    expect(istBekannterTyp('projektdokument')).toBe(true)
    expect(typTitel('projektdokument')).toBe('Anhang am Projekt ablegen')
  })

  it('verlangt ohne Zuordnung eine Projektwahl und schickt nur das Projekt', () => {
    const v = dokument(null)
    const e = startEingabe(v)
    expect(fehltZumUebernehmen(v, e)).toMatch(/Projekt wählen/)
    e.projekt = P2
    expect(fehltZumUebernehmen(v, e)).toBeNull()
    expect(acceptPayload(v, e)).toEqual({ project_id: 'p2' })
  })

  it('übernimmt ein zugeordnetes Projekt unverändert und überschreibt sonst nichts', () => {
    const v = dokument('p1')
    const e = startEingabe(v)
    expect(e.projekt).toEqual(P1)
    expect(fehltZumUebernehmen(v, e)).toBeNull()
    e.felder.filename = 'anders.exe'
    expect(acceptPayload(v, e)).toBeUndefined()
  })

  it('führt nach dem Ablegen auf den Reiter «Dokumente» des Projekts', () => {
    expect(ergebnisHinweis({ ...dokument('p2'), ...abgelegt })).toBe('Liegt bei den Projektdokumenten.')
    expect(ergebnisZiel({ ...dokument('p2'), ...abgelegt }))
      .toEqual({ screen: 'projects', detailId: 'p2', label: 'Projekt öffnen', tab: 'documents' })
    expect(ergebnisZiel(dokument('p2'))).toBeNull()
  })
})

describe('Knopfbeschriftung', () => {
  it('sagt je Typ, was der Knopf tut', () => {
    expect(uebernehmenLabel('projekt_entwurf', false)).toBe('Übernehmen')
    expect(uebernehmenLabel('projekt_entwurf', true)).toBe('Wird übernommen…')
    // Der Anhang wird erst jetzt geholt und abgelegt — das dauert.
    expect(uebernehmenLabel('projektdokument', false)).toBe('Übernehmen')
    expect(uebernehmenLabel('projektdokument', true)).toBe('Wird abgelegt…')
    // «Kontakt ergänzen» schreibt nichts: es öffnet die Kundenmaske.
    expect(uebernehmenLabel('kontakt_ergaenzen', false)).toBe('Im Kundenformular öffnen')
    expect(uebernehmenLabel('kontakt_ergaenzen', true)).toBe('Wird bestätigt…')
  })
})

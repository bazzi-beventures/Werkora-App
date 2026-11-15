import { describe, it, expect } from 'vitest'
import type { ZustaendigkeitenBetreiber } from '../../tenantScopedApi'
import { entferneEintrag, geaendert, hinweise, matrixAus, ruhendeImFormular, setzeZelle, zelle } from './zustaendigkeitenForm'

// docs/specs/mail-eingang-zustaendigkeiten.md §3, §5, §8 (Charge B).
const VIEW: ZustaendigkeitenBetreiber = {
  aufgaben: [
    { key: 'reparatur', label: 'Reparatur- und Serviceauftrag', beschreibung: '' },
    { key: 'projekt_neu', label: 'Neues Projekt', beschreibung: '' },
    { key: 'kunde', label: 'Kunden anlegen und ändern', beschreibung: '' },
  ],
  standard_ansicht: 'alle',
  zustaendigkeiten: {
    reparatur: { zustaendig: ['weg'], stellvertretung: ['marco'] },
    projekt_neu: { zustaendig: ['tina'], stellvertretung: [] },
  },
  personen: [{ id: 'marco', name: 'Marco', rolle: 'management' }, { id: 'tina', name: 'Tina', rolle: 'admin' },
             { id: 'sara', name: 'Sara', rolle: 'admin' }],
  ruhend: [{ aufgabe: 'reparatur', rolle: 'zustaendig', user_id: 'weg', name: 'Petra', grund: 'deaktiviert',
             grund_text: 'Konto deaktiviert' }],
  modul_aktiv: true, updated_at: null, updated_by: null,
}

describe('Zuständigkeiten-Formular', () => {
  it('Matrix in fester Form, Zellen setzen — eine Person höchstens einmal je Block', () => {
    const m = matrixAus(VIEW)
    expect(m.kunde).toEqual({ zustaendig: [], stellvertretung: [] })
    expect(zelle(m, 'reparatur', 'marco')).toBe('stellvertretung')
    const m2 = setzeZelle(m, 'reparatur', 'marco', 'zustaendig')
    expect(m2.reparatur).toEqual({ zustaendig: ['weg', 'marco'], stellvertretung: [] })
    expect(setzeZelle(m2, 'reparatur', 'marco', '').reparatur).toEqual({ zustaendig: ['weg'], stellvertretung: [] })
    expect(m.reparatur.stellvertretung).toEqual(['marco'])
  })

  it('Hinweise: niemand zuständig, nur Vertretung (ruhende zählen nicht), Person in keinem Block', () => {
    expect(hinweise(VIEW, matrixAus(VIEW))).toEqual({
      niemand: ['kunde'], nurVertretung: ['reparatur'], ohneBlock: ['Sara'],
    })
  })

  it('ruhende Einträge lassen sich entfernen und verschwinden dann aus der Liste', () => {
    const m = matrixAus(VIEW)
    expect(ruhendeImFormular(VIEW, m)).toHaveLength(1)
    const m2 = entferneEintrag(m, 'reparatur', 'zustaendig', 'weg')
    expect(ruhendeImFormular(VIEW, m2)).toEqual([])
    expect(geaendert(VIEW, 'alle', m2)).toBe(true)
  })

  it('geändert: Startansicht oder Matrix', () => {
    expect(geaendert(VIEW, 'alle', matrixAus(VIEW))).toBe(false)
    expect(geaendert(VIEW, 'meine', matrixAus(VIEW))).toBe(true)
  })
})

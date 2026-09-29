import { describe, it, expect } from 'vitest'
import { EIGENTUEMER_MAX, eigentuemerFehler, eigentuemerFeldFehler } from './eigentuemerGrenzen'

const LEER = { name: '', adresse: '', telefon: '', email: '' }

describe('eigentuemerGrenzen', () => {
  it('lässt einen echten Eigentümer durch', () => {
    expect(eigentuemerFehler({
      name: 'Erika Muster / Eigentümergemeinschaft',
      adresse: 'Bergweg 3, 8002 Zürich',
      telefon: '+41 79 111 22 33',
      email: 'erika@muster.ch',
    })).toBeNull()
    expect(eigentuemerFehler(LEER)).toBeNull()
    expect(eigentuemerFehler(null)).toBeNull()
  })

  it('weist den hineinkopierten Seitentext ab', () => {
    // So stand es am 2026-09-28 auf einer Rechnung.
    const seitentext = 'Mitarbeiter-App MW Marvin Walser management powered by Gehlhaar GmbH '
      + 'Winzeler Winterthur Projekt-Nr. 2600245 Offen Lieferung offen Eröffnet am 29.07.2026 '
      + 'Zurück Projekt Details Aufgaben Dokumente Eigentümer'
    expect(eigentuemerFehler({ ...LEER, name: seitentext }))
      .toMatch(/^Eigentümer – Name: höchstens 120 Zeichen/)
  })

  it('erlaubt die Grenze selbst und zählt Rand-Leerzeichen nicht', () => {
    for (const [feld, grenze] of Object.entries(EIGENTUEMER_MAX)) {
      const f = feld as keyof typeof EIGENTUEMER_MAX
      expect(eigentuemerFeldFehler(f, '  ' + 'x'.repeat(grenze) + '  ')).toBeNull()
      expect(eigentuemerFeldFehler(f, 'x'.repeat(grenze + 1))).not.toBeNull()
    }
  })

  // Gleichlauf mit dem Backend prüft tests/unit/test_project_crud.py.
})

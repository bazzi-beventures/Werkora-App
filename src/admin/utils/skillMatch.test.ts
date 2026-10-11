// Dieselben Fälle wie tests/unit/test_skill_matrix.py — die zwei Regeln dürfen
// nicht auseinanderlaufen.
import { describe, it, expect } from 'vitest'
import { anforderung, fehlende, pillenJeMitarbeiter } from './skillMatch'
import type { AppointmentKind } from '../../api/admin/scheduling'

const k = (id: string, kinds: AppointmentKind[] = [], aktiv = true) => ({ id, einsatz_kinds: kinds, is_active: aktiv })
const KATALOG = [k('aus', ['aufmass']), k('gri'), k('sto'), k('ins'), k('alt', ['montage'], false)]

describe('skillMatch', () => {
  it('Ausmass braucht nur Ausmessen, Montage die Projekt-Pillen', () => {
    expect(anforderung('aufmass', ['gri', 'ins'], KATALOG)).toEqual(['aus'])
    expect(anforderung('montage', ['gri', 'ins'], KATALOG)).toEqual(['gri', 'ins'])
    expect(anforderung('service', ['sto'], KATALOG)).toEqual(['sto'])
    expect(anforderung('montage', ['alt'], KATALOG)).toEqual([])
  })

  it('abgelaufenes Zertifikat fehlt', () => {
    const pillen = pillenJeMitarbeiter([
      { staff_id: 's1', skill_id: 'gri', ablauf: null },
      { staff_id: 's1', skill_id: 'ins', ablauf: 'bald' },
      { staff_id: 's2', skill_id: 'gri', ablauf: 'abgelaufen' },
    ])
    expect(fehlende('s1', ['gri', 'ins'], pillen)).toEqual([])
    expect(fehlende('s2', ['gri', 'ins'], pillen)).toEqual(['gri', 'ins'])
    expect(fehlende('s9', [], pillen)).toEqual([])
  })
})

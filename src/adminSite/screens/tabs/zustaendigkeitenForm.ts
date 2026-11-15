// Reine Hilfen des Abschnitts «Zuständigkeiten» — ohne React, unit-getestet.
//
// Spec docs/specs/mail-eingang-zustaendigkeiten.md §3, §5, §8. Die Matrix
// Aufgabe × Person, gezeigt in Blöcken je Aufgabe; jede Zelle ist leer,
// «zuständig» oder «Stellvertretung». Gespeichert wird immer das Ganze.

import type {
  EingangAnsichtVorgabe, ZustaendigkeitenBetreiber, ZustaendigkeitsBlock,
} from '../../tenantScopedApi'

export type Matrix = Record<string, ZustaendigkeitsBlock>
export type Zelle = '' | 'zustaendig' | 'stellvertretung'

export const ZELLEN: { key: Zelle; label: string }[] = [
  { key: '', label: '—' },
  { key: 'zustaendig', label: 'Zuständig' },
  { key: 'stellvertretung', label: 'Stellvertretung' },
]

const LEER: ZustaendigkeitsBlock = { zustaendig: [], stellvertretung: [] }

/** Die Matrix in fester Form: jede Aufgabe des Katalogs, je beide Rollen. */
export function matrixAus(view: ZustaendigkeitenBetreiber): Matrix {
  const m: Matrix = {}
  for (const a of view.aufgaben) {
    const b = view.zustaendigkeiten[a.key] ?? LEER
    m[a.key] = { zustaendig: [...b.zustaendig], stellvertretung: [...b.stellvertretung] }
  }
  return m
}

export function zelle(m: Matrix, aufgabe: string, uid: string): Zelle {
  const b = m[aufgabe] ?? LEER
  if (b.zustaendig.includes(uid)) return 'zustaendig'
  if (b.stellvertretung.includes(uid)) return 'stellvertretung'
  return ''
}

/** Setzt eine Zelle — eine Person steht höchstens einmal je Block. */
export function setzeZelle(m: Matrix, aufgabe: string, uid: string, wert: Zelle): Matrix {
  const b = m[aufgabe] ?? LEER
  const ohne = {
    zustaendig: b.zustaendig.filter(x => x !== uid),
    stellvertretung: b.stellvertretung.filter(x => x !== uid),
  }
  if (wert) ohne[wert] = [...ohne[wert], uid]
  return { ...m, [aufgabe]: ohne }
}

/** Wer im Block wirksam ist: nur Konten aus `personen` (berechtigt). Ruhende zählen nicht (§5). */
function wirksam(ids: string[], berechtigt: ReadonlySet<string>): string[] {
  return ids.filter(id => berechtigt.has(id))
}

export interface Hinweise {
  /** Aufgaben ohne wirksam Zuständige und ohne Stellvertretung — diese Mails sehen alle. */
  niemand: string[]
  /** Aufgaben, bei denen nur die Stellvertretung wirkt. */
  nurVertretung: string[]
  /** Berechtigte Personen, die in keinem Block stehen — sehen immer alle Mails. */
  ohneBlock: string[]
}

export function hinweise(view: ZustaendigkeitenBetreiber, m: Matrix): Hinweise {
  const berechtigt = new Set(view.personen.map(p => p.id))
  const niemand: string[] = []
  const nurVertretung: string[] = []
  const imBlock = new Set<string>()
  for (const a of view.aufgaben) {
    const b = m[a.key] ?? LEER
    const zust = wirksam(b.zustaendig, berechtigt)
    const vertr = wirksam(b.stellvertretung, berechtigt)
    zust.concat(vertr).forEach(id => imBlock.add(id))
    if (zust.length === 0 && vertr.length === 0) niemand.push(a.key)
    else if (zust.length === 0) nurVertretung.push(a.key)
  }
  const ohneBlock = view.personen.filter(p => !imBlock.has(p.id)).map(p => p.name)
  return { niemand, nurVertretung, ohneBlock }
}

/** Ruhende Einträge, die in der aktuellen Bearbeitung noch stehen. */
export function ruhendeImFormular(view: ZustaendigkeitenBetreiber, m: Matrix): ZustaendigkeitenBetreiber['ruhend'] {
  return view.ruhend.filter(r => (m[r.aufgabe]?.[r.rolle] ?? []).includes(r.user_id))
}

export function entferneEintrag(m: Matrix, aufgabe: string, rolle: Zelle, uid: string): Matrix {
  if (!rolle) return m
  const b = m[aufgabe] ?? LEER
  return { ...m, [aufgabe]: { ...b, [rolle]: b[rolle].filter(x => x !== uid) } }
}

function gleich(a: Matrix, b: Matrix): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const x = a[k] ?? LEER
    const y = b[k] ?? LEER
    if (x.zustaendig.join('|') !== y.zustaendig.join('|')) return false
    if (x.stellvertretung.join('|') !== y.stellvertretung.join('|')) return false
  }
  return true
}

export function geaendert(view: ZustaendigkeitenBetreiber, ansicht: EingangAnsichtVorgabe, m: Matrix): boolean {
  return ansicht !== view.standard_ansicht || !gleich(matrixAus(view), m)
}

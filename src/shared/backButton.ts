import { useEffect, useRef } from 'react'

// Globaler Stack von "Zurück-Interceptoren". Overlays (Modals, Bild-Lightbox,
// Wizard-Schritte) registrieren hier einen Handler, solange sie offen sind. Der
// zentrale popstate-Handler in App.tsx ruft beim Hardware-/Browser-Zurück den
// obersten Handler auf (schliesst das Overlay) STATT zur Hauptmaske zu navigieren.
//
// Warum ein zentraler Stack statt je ein eigener popstate-Listener pro Modal:
// App.tsx hat bereits einen globalen popstate-Listener, der auf jedem Sub-Screen
// zur Hauptmaske springt. Zwei unabhängige Listener würden beide feuern → man
// landet trotzdem auf Home. Der Stack zentralisiert die Entscheidung in App.tsx.

type BackHandler = () => void

const stack: BackHandler[] = []

function pushHandler(handler: BackHandler): () => void {
  stack.push(handler)
  return () => {
    const i = stack.lastIndexOf(handler)
    if (i >= 0) stack.splice(i, 1)
  }
}

// Vom zentralen popstate-Handler aufgerufen: ruft den obersten Handler auf und
// entfernt ihn. Gibt true zurück, wenn ein Overlay den Zurück konsumiert hat
// (⇒ App soll NICHT zur Hauptmaske navigieren).
export function consumeBack(): boolean {
  const handler = stack.pop()
  if (!handler) return false
  handler()
  return true
}

export function backHandlerCount(): number {
  return stack.length
}

// ---------------------------------------------------------------------------
// Screen-Zurück: dauerhafte Handler für eigenständige Navigations-Bereiche.
//
// Der Stack oben ist einmalig — `consumeBack()` poppt. Genau richtig für
// Overlays (das Modal ist danach zu, es gibt nichts mehr zu schliessen), aber
// untauglich für einen Bereich, der einen ganzen Verlauf abzuarbeiten hat: der
// Admin-Bereich führt seine eigene Navigation (`useAdminNav`), und dort muss
// Zurück beliebig oft eine Ebene hochgehen können.
//
// Darum ein zweiter, getrennter Stack, aus dem nur der oberste Handler
// ABGEFRAGT (nicht entfernt) wird. Er meldet per Rückgabewert, ob er den
// Zurück-Druck verbraucht hat — `false` heisst «bei mir ist die Wurzel
// erreicht», dann entscheidet App.tsx weiter.
//
// Reihenfolge im popstate-Handler: erst `consumeBack()` (Overlays liegen optisch
// oben), dann `consumeScreenBack()`, dann der eigene Verlauf von App.tsx.

// Die Auswahl geht über `depth` und NICHT über die Registrierungsreihenfolge:
// React führt Effekte von innen nach aussen aus. Montieren Bereich und
// Detailmaske im selben Commit, stünde der äussere Handler zuletzt auf dem
// Stapel — der Zurück-Druck liefe an der Maske vorbei und würfe sie weg. Mit
// `depth` gewinnt immer der innerste Handler, egal wann er sich anmeldet.
export const SCREEN_BACK_DEPTH = {
  /** Ein Bereich mit eigenem Verlauf (AdminApp). */
  area: 0,
  /** Eine Detailmaske innerhalb eines Bereichs (ProjectDetailScreen). */
  detail: 1,
} as const

interface ScreenBackEntry {
  depth: number
  handler: () => boolean
}

const screenStack: ScreenBackEntry[] = []

function innermost(): ScreenBackEntry | undefined {
  let best: ScreenBackEntry | undefined
  // `>=` statt `>`: bei gleicher Tiefe gewinnt der zuletzt Angemeldete.
  for (const entry of screenStack) if (!best || entry.depth >= best.depth) best = entry
  return best
}

export function consumeScreenBack(): boolean {
  const entry = innermost()
  return entry ? entry.handler() : false
}

export function screenBackHandlerCount(): number {
  return screenStack.length
}

// Registriert `onBack` als dauerhaften Zurück-Handler, solange `active` gilt.
// `onBack` gibt zurück, ob der Zurück-Druck verbraucht wurde.
export function useScreenBack(
  active: boolean,
  onBack: () => boolean,
  depth: number = SCREEN_BACK_DEPTH.area,
): void {
  const ref = useRef(onBack)
  useEffect(() => { ref.current = onBack })
  useEffect(() => {
    if (!active) return
    const entry: ScreenBackEntry = { depth, handler: () => ref.current() }
    screenStack.push(entry)
    return () => {
      const i = screenStack.lastIndexOf(entry)
      if (i >= 0) screenStack.splice(i, 1)
    }
  }, [active, depth])
}

// Nur für Tests: beide Stacks zurücksetzen.
export function _resetBackHandlers(): void {
  stack.length = 0
  screenStack.length = 0
}

// Registriert `onBack` als Zurück-Handler, solange `active` true ist (z.B. Modal
// offen). Der jeweils zuletzt geöffnete (oberste) Layer wird beim Zurück zuerst
// geschlossen (LIFO). onBack darf sich pro Render ändern — es wird via Ref stabil
// gehalten, damit die Registrierung nicht bei jedem Render neu erfolgt.
export function useBackButton(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack)
  useEffect(() => { ref.current = onBack })
  useEffect(() => {
    if (!active) return
    return pushHandler(() => ref.current())
  }, [active])
}

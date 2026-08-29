import { useEffect, useState } from 'react'

/**
 * `navigator.onLine` als React-State. Nötig, weil die Deklaration
 * (docs/specs/offline-modus.md §4.1) eine Neuzeichnung verlangt: was offline
 * nicht geht, ist AUSGEGRAUT und sagt warum — statt nach dem Antippen mit
 * «Keine Internetverbindung» zu scheitern. Ein blosses `navigator.onLine` im
 * Render bliebe stehen, bis der Screen aus anderem Grund neu rendert.
 *
 * App.tsx führt denselben Zustand für sein globales Banner; der wandert bewusst
 * nicht als Prop durch die halbe App — jeder Screen, der eine Bedienung sperrt,
 * hört selbst zu.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

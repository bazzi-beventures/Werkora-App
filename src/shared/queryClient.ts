// Gemeinsamer Datenzugriff der Screens (Charge O, docs/specs/refactoring-wachstum.md
// §8.1, Entscheid 2026-11-15: TanStack Query).
//
// Bis dahin lud jeder Screen selbst per useEffect — ohne Cache, ohne Entdoppeln,
// ohne Neuladen nach dem Speichern; die Egress-Korrektur der Einsatzplanung (4 MB je
// Takt) war genau diese Klasse Fehler. Eingeführt wird es **nur dort, wo ohnehin
// geschnitten wird** (zuerst die Einsatzplanung), keine Umstellkampagne.
//
// Zwei Konventionen:
// 1. **Der Client wird ausdrücklich übergeben** (`useQuery({...}, queryClient)`), es
//    gibt keinen Provider. So läuft ein Hook in jedem Test und jedem isoliert
//    gerenderten Screen, ohne dass dort ein Wrapper stehen muss.
// 2. **Zurückhaltende Grundeinstellung**: kein automatisches Wiederholen, kein Neuladen
//    beim Fokuswechsel oder nach dem Reconnect. Was eine Abfrage davon braucht, sagt sie
//    selbst — sonst änderte das Einführen still das Verhalten bestehender Screens.
//    Die Tests leeren den Cache nach jedem Fall (src/test/setup.ts).
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})

// Terminfarben (docs/specs/termin-farbkategorien.md): Farbkategorien je Termin,
// vom Betrieb selbst gepflegt (Einstellungen → Terminfarben). Der Termin trägt
// nur den Schlüssel (`color_category`); Name und Farbe kommen aus der Liste in
// `scheduling_config.termin_farben`. Beta-Feature `termin_farbkategorien`: ohne
// Häkchen liefert der Hook eine leere Liste — keine Auswahl, keine Farbe.
//
// TanStack Query mit dem gemeinsamen Client (CLAUDE.md, Datenzugriff im
// Frontend): Projektmaske, Einsatzplanung und Einstellungs-Reiter teilen den
// einen Abruf; der Reiter macht ihn nach dem Speichern ungültig.
import { useQuery } from '@tanstack/react-query'
import './terminFarben.css'
import { getMe } from '../../api/auth'
import { loadSchedulingConfig, TERMIN_FARBEN_FEATURE, type TerminFarbe } from '../../api/admin/tenant'
import { isFeatureEnabled } from '../../api/modules'
import { queryClient } from '../../shared/queryClient'

export const TERMIN_FARBEN_KEY = ['einsatzplanung', 'terminfarben'] as const

const LEER: TerminFarbe[] = []

/** Vorbelegung einer neuen Zeile im Reiter — ein Wert, kein Stil: der native
 *  Farbwähler braucht #rrggbb und kennt keine CSS-Variable. */
export const NEUE_TERMINFARBE = '#3b82f6'

export async function ladeTerminFarben(): Promise<TerminFarbe[]> {
  const [me, cfg] = await Promise.all([getMe(), loadSchedulingConfig()])
  if (!isFeatureEnabled(me, TERMIN_FARBEN_FEATURE)) return LEER
  return Array.isArray(cfg.termin_farben) ? cfg.termin_farben : LEER
}

/** Die Terminfarben des Betriebs; leer ohne Feature, beim Laden und bei Fehlern. */
export function useTerminFarben(): TerminFarbe[] {
  const q = useQuery({
    queryKey: TERMIN_FARBEN_KEY,
    queryFn: ladeTerminFarben,
    staleTime: 5 * 60_000,
    retry: false,
  }, queryClient)
  return q.data ?? LEER
}

/** Nur «hat dieses Konto das Feature?» — für die Einsatzplanung, die ihre
 *  Anzeige-Config ohnehin selbst lädt (ein zweiter Abruf dort hielte die
 *  Reiterleiste auf, ProjectScheduleScreen.views.test). */
export function useTerminFarbenAktiv(): boolean {
  const q = useQuery({
    queryKey: [...TERMIN_FARBEN_KEY, 'aktiv'],
    queryFn: async () => isFeatureEnabled(await getMe(), TERMIN_FARBEN_FEATURE),
    staleTime: 5 * 60_000,
    retry: false,
  }, queryClient)
  return q.data === true
}

export function terminFarbenNeuLaden(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: TERMIN_FARBEN_KEY })
}

/** Schlüssel → Farbe, für die Kachel im Plan. */
export function farbeJeKategorie(kategorien: TerminFarbe[]): Map<string, string> {
  return new Map(kategorien.map(k => [k.key, k.color]))
}

/** Helle Fläche (Gelb, Khaki, Hellblau …) → dunkle Schrift statt Weiss.
 *  Relative Luminanz nach WCAG. Rechnerisch kreuzen sich die Kontraste von
 *  Weiss und #1e293b bei ~0.22; die Schwelle liegt bewusst bei 0.3, damit
 *  Mitteltöne (Grün, Dunkelorange) weiss beschriftet bleiben wie die
 *  Art-Farben daneben — dunkel wird es erst auf den wirklich hellen. */
export function istHell(hex: string | null | undefined): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!m) return false
  const lin = (h: string) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3])
  return l > 0.3
}

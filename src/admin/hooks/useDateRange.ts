import { useMemo, useState } from 'react'
import { type PresetId, dateFilter, periodLabel, presetRange } from '../components/dateRange'

/**
 * Zeitraum-Zustand der BI-Screens: Preset + freie von/bis-Auswahl, dazu der
 * fertige PostgREST-Filter. Ein Screen bindet damit `DateRangeBar` und seine
 * `useKpiData`-Aufrufe an denselben Zustand.
 */
export function useDateRange(initial: Exclude<PresetId, 'custom'> = '30t') {
  const [preset, setPreset] = useState<PresetId>(initial)
  const [von, setVon] = useState<string>(() => presetRange(initial).von)
  const [bis, setBis] = useState<string>(() => presetRange(initial).bis)

  function applyPreset(id: Exclude<PresetId, 'custom'>) {
    const r = presetRange(id)
    setVon(r.von); setBis(r.bis); setPreset(id)
  }

  /** Drill-down aus dem Tagesbalken: der angeklickte Tag wird zum Zeitraum. */
  function drillToDay(datum: string) {
    setVon(datum); setBis(datum); setPreset('custom')
  }

  function changeVon(v: string) { setVon(v); setPreset('custom') }
  function changeBis(v: string) { setBis(v); setPreset('custom') }

  const filters = useMemo(() => dateFilter(von, bis), [von, bis])

  return {
    preset, von, bis, filters,
    label: periodLabel(von, bis),
    applyPreset, drillToDay, changeVon, changeBis,
  }
}

export type DateRangeState = ReturnType<typeof useDateRange>

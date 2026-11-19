// Halbe Absenztage (WW-93): `absences.half_day` = 'am' (Vormittag), 'pm'
// (Nachmittag) oder leer (ganzer Tag). Eine halbe Absenz ist immer eintägig —
// das Backend lehnt sonst mit 400 `half_day_multi_day` ab. Im Ferienkonto und
// im Saldo zählt sie 0,5 Tage (workdays.absenz_anteil im Backend).

export type HalberTag = 'am' | 'pm'

export const HALBER_TAG_LABELS: Record<HalberTag, string> = {
  am: 'Vormittag',
  pm: 'Nachmittag',
}

function istHalberTag(v: unknown): v is HalberTag {
  return v === 'am' || v === 'pm'
}

/** Was mit dem Antrag mitgeht: der halbe Tag nur bei eintägiger Absenz. */
export function halberTagFuer(start: string, end: string, halfDay?: string | null): HalberTag | undefined {
  return start && start === end && istHalberTag(halfDay) ? halfDay : undefined
}

/** Dauer für Listen: «½ Tag (Vormittag)» bzw. «1 Tag» / «3 Tage» aus den gezählten Arbeitstagen. */
export function absenzDauer(tage: number, halfDay?: string | null): string {
  if (istHalberTag(halfDay)) return `½ Tag (${HALBER_TAG_LABELS[halfDay]})`
  return tage === 1 ? '1 Tag' : `${tage} Tage`
}

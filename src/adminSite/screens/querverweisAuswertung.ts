// Reine Auswertung des Querverweis-Zählers (Spec docs/specs/querverweis-zaehler.md):
// Tageszeilen über den Zeitraum summieren und je Sprung den Anteil an allen
// Ankünften am Zielscreen ausrechnen.

/** Eine Zeile aus `querverweis_klicks` (Betreiber-Route der KPI-Views). */
export interface QuerverweisRow {
  tenant_id: string
  datum: string // 'YYYY-MM-DD' (Europe/Zurich)
  von: string
  nach: string
  weg: string
  hits: number
}

export interface KlickZeile {
  von: string
  nach: string
  weg: string
  klicks: number
  /** Anteil dieses Sprungs an allen gezählten Ankünften auf `nach`, in Prozent. */
  anteil_ziel_pct: number
}

export function zeilenAusKlicks(rows: QuerverweisRow[]): KlickZeile[] {
  const proSprung = new Map<string, KlickZeile>()
  const proZiel = new Map<string, number>()
  for (const r of rows) {
    const hits = Number(r.hits) || 0
    const key = `${r.von}|${r.nach}|${r.weg}`
    const z = proSprung.get(key) ?? { von: r.von, nach: r.nach, weg: r.weg, klicks: 0, anteil_ziel_pct: 0 }
    z.klicks += hits
    proSprung.set(key, z)
    proZiel.set(r.nach, (proZiel.get(r.nach) ?? 0) + hits)
  }
  const zeilen = [...proSprung.values()]
  for (const z of zeilen) {
    const ziel = proZiel.get(z.nach) ?? 0
    z.anteil_ziel_pct = ziel > 0 ? (z.klicks / ziel) * 100 : 0
  }
  return zeilen.sort((a, b) => b.klicks - a.klicks)
}

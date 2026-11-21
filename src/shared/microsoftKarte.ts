// Zustand einer Microsoft-Verbindung als Karte — für den Admin des Betriebs
// (admin/configuration/MicrosoftScreen.tsx) und den Reiter «Microsoft 365» der
// Betreiber-Seite. Rein, ohne React. Spec docs/specs/microsoft-365-verbindung.md §9.

export type MsZweck = 'versand' | 'eingang'

export interface MsVerbindungLike {
  zweck: MsZweck
  verbunden: boolean
  status: 'ok' | 'getrennt' | null
  mailbox?: string | null
  connected_at?: string | null
  last_ok_at?: string | null
  last_error?: string | null
  fehlende_rechte?: string[] | null
}

export type KartenZustand = 'nicht_eingerichtet' | 'nicht_verbunden' | 'verbunden' | 'getrennt' | 'rechte_fehlen'

export const ZWECK_TEXT: Record<MsZweck, { titel: string; hinweis: string; adresse: string }> = {
  versand: {
    titel: 'Versand & Kalender',
    hinweis: 'Werkora kann aus diesem Postfach senden und im Kalender Termine eintragen. Es liest keine Mails.',
    adresse: 'Absenderadresse',
  },
  eingang: {
    titel: 'Mail-Eingang',
    hinweis: 'Werkora liest nur dieses Postfach. Hinein kommt, was du weiterleitest.',
    adresse: 'Eingangsadresse',
  },
}

export function kartenZustand(eingerichtet: boolean, v: MsVerbindungLike | undefined): KartenZustand {
  if (!eingerichtet) return 'nicht_eingerichtet'
  if (!v || !v.verbunden) return 'nicht_verbunden'
  if (v.status === 'getrennt') return 'getrennt'
  if (v.fehlende_rechte && v.fehlende_rechte.length > 0) return 'rechte_fehlen'
  return 'verbunden'
}

/** «20.11.2026» aus einem ISO-Zeitstempel; leer, wenn er fehlt oder kaputt ist. */
export function datumText(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Die Zeile unter dem Titel der Karte. */
export function zustandText(z: KartenZustand, v: MsVerbindungLike | undefined): string {
  switch (z) {
    case 'nicht_eingerichtet':
      return 'In dieser Umgebung noch nicht eingerichtet.'
    case 'nicht_verbunden':
      return 'Nicht verbunden.'
    case 'getrennt':
      return `Verbindung getrennt — bitte neu verbinden.${v?.last_error ? ` (${v.last_error})` : ''}`
    case 'rechte_fehlen':
      return `Verbunden als ${v?.mailbox ?? ''}, aber es fehlen Rechte: ${(v?.fehlende_rechte ?? []).join(', ')}.`
    case 'verbunden': {
      const seit = datumText(v?.connected_at)
      return `Verbunden als ${v?.mailbox ?? ''}${seit ? ` seit ${seit}` : ''}.`
    }
  }
}

export function gueltigeAdresse(adresse: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse.trim())
}

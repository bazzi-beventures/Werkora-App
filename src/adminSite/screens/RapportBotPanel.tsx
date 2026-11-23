import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRapportBotLage, RapportBotLage, RapportBotMandant } from '../../api/serviceHealth'
import { queryClient } from '../../shared/queryClient'

/**
 * Rapport-Bot im Service-Status (docs/specs/rapport-bot-guardrails.md §6).
 *
 * Eine Ampel je Betrieb: rot bei einer Erfolgsmeldung ohne gespeicherten Rapport
 * oder wenn die Mehrheit der Zusammenfassungen verworfen wird und das mehr als
 * doppelt so oft wie in den drei Wochen davor; gelb ab 35 % verworfen. Unter zehn
 * Zusammenfassungen färbt die Quote nicht. Die Regel steht in
 * services/rapport_bot_zaehler.py::ampel, hier wird nur angezeigt.
 * Je Betrieb nur Zahlen — keine Person, kein Text, kein Projekt.
 */

const RANGES = [7, 30, 90] as const
type Range = typeof RANGES[number]

const AMPEL = {
  gruen: { klasse: 'svc-banner-ok', icon: '✓', titel: 'Keine Auffälligkeiten' },
  gelb: { klasse: 'svc-banner-warn', icon: '!', titel: 'Im Auge behalten' },
  rot: { klasse: 'svc-banner-bad', icon: '!', titel: 'Jetzt hinschauen' },
} as const

const BADGE = {
  gruen: { text: 'GRÜN', bg: 'var(--success-soft)', fg: 'var(--success)' },
  gelb: { text: 'GELB', bg: 'var(--warning-soft)', fg: 'var(--warning-ink)' },
  rot: { text: 'ROT', bg: 'var(--danger-soft)', fg: 'var(--danger-ink)' },
} as const

/** Summe aller `abgewiesen:<grund>` — die Gründe einzeln stehen im Lese-Feed. */
export function abgewiesen(summen: Record<string, number>): number {
  return Object.entries(summen)
    .filter(([k]) => k.startsWith('abgewiesen:'))
    .reduce((s, [, n]) => s + n, 0)
}

function MandantZeile({ m }: { m: RapportBotMandant }) {
  const b = BADGE[m.ampel.stufe]
  const s = m.summen
  return (
    <tr>
      <td className="primary">{m.mandant}</td>
      <td>
        <span className="svc-badge" style={{ background: b.bg, color: b.fg }}><span className="svc-badge-dot" />{b.text}</span>
      </td>
      <td>{m.ampel.text}</td>
      <td style={{ textAlign: 'right' }}>{(s.turn ?? 0).toLocaleString('de-CH')}</td>
      <td style={{ textAlign: 'right' }}>{(s.bestaetigt ?? 0).toLocaleString('de-CH')}</td>
      <td style={{ textAlign: 'right' }}>{(s.verworfen ?? 0).toLocaleString('de-CH')}</td>
      <td style={{ textAlign: 'right' }}>{abgewiesen(s).toLocaleString('de-CH')}</td>
      <td style={{ textAlign: 'right' }}>{(s.llm_fehler ?? 0).toLocaleString('de-CH')}</td>
    </tr>
  )
}

/** Die Ansicht ohne Laden — rein, damit testbar. */
export function RapportBotAnsicht({ data }: { data: RapportBotLage }) {
  if (data.status !== 'ok' || !data.ampel) {
    return (
      <div style={{ padding: 16, color: 'var(--warning-ink)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
        Rapport-Bot-Zähler nicht lesbar — die Migration 20261123b_rapport_bot_zaehler ist vermutlich noch nicht eingespielt.
      </div>
    )
  }
  const a = AMPEL[data.ampel]
  const mandanten = data.mandanten ?? []
  const gruende = data.gruende ?? []
  return (
    <>
      <div className={`svc-banner ${a.klasse}`} data-testid="rapport-bot-ampel" data-ampel={data.ampel}>
        <div className="svc-banner-icon">{a.icon}</div>
        <div>
          <div className="svc-banner-title">Rapport-Bot: {a.titel}</div>
          {gruende.length > 0
            ? gruende.map(g => <div key={g} className="svc-banner-sub">{g}</div>)
            : <div className="svc-banner-sub">Keine falschen Erfolgsmeldungen, Verwerf-Quote im üblichen Rahmen.</div>}
        </div>
      </div>
      {mandanten.length === 0
        ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Im Zeitraum keine Zählung.</div>
        : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Betrieb</th>
                  <th>Ampel</th>
                  <th>Stand (7 Tage)</th>
                  <th style={{ textAlign: 'right' }}>Nachrichten</th>
                  <th style={{ textAlign: 'right' }}>Bestätigt</th>
                  <th style={{ textAlign: 'right' }}>Verworfen</th>
                  <th style={{ textAlign: 'right' }} title="Vom Prüfmodul abgewiesene Werkzeug-Aufrufe">Abgewiesen</th>
                  <th style={{ textAlign: 'right' }}>KI-Fehler</th>
                </tr>
              </thead>
              <tbody>
                {mandanten.map(m => <MandantZeile key={m.mandant} m={m} />)}
              </tbody>
            </table>
          </div>
        )}
    </>
  )
}

export default function RapportBotPanel() {
  const [range, setRange] = useState<Range>(30)
  const { data, error } = useQuery({
    queryKey: ['service-status', 'rapport-bot', range],
    queryFn: () => getRapportBotLage(range),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  }, queryClient)

  return (
    <div style={{ marginTop: 28 }} data-testid="rapport-bot-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
            Rapport-Bot
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Tragen die Leitplanken? · Ampel über 7 Tage, Summen im Zeitraum · ohne Personen und Texte
          </div>
        </div>
        <div className="svc-segmented">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)} data-active={range === r}>{r}d</button>
          ))}
        </div>
      </div>
      {error && (
        <div style={{ padding: 16, color: 'var(--danger-ink)', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)' }}>
          {error instanceof Error ? error.message : 'Fehler beim Laden'}
        </div>
      )}
      {!error && data && <RapportBotAnsicht data={data} />}
      {!error && !data && <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>}
    </div>
  )
}

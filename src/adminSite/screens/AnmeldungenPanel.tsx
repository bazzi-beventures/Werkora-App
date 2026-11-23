import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAnmeldeLage, AnmeldeKonto, AnmeldeLage } from '../../api/serviceHealth'
import { queryClient } from '../../shared/queryClient'

/**
 * Anmelde-Lage im Service-Status (docs/specs/sicherheits-audit-2026-11.md §5.4.6).
 *
 * Bewusst keine «Anzahl Angriffe»: jede öffentliche Adresse wird ständig von Bots
 * abgeklopft, die Zahl sagt nichts über das Risiko. Gezeigt wird, was handeln
 * lässt — rät jemand an einem bestimmten Konto (Fehlversuche je Konto, Sperre),
 * und schlagen die Login-Bremsen ungewöhnlich oft an. Unbekannte Benutzernamen
 * stehen nur als Zahl da und färben die Ampel nie. Ohne IP, ohne eingetippte Namen.
 *
 * Erster Lese-Pfad des Service-Status auf TanStack Query (CLAUDE.md, «Datenzugriff
 * im Frontend»); die übrigen Karten laden weiter selbst.
 */

const RANGES = [1, 7, 30] as const
type Range = typeof RANGES[number]
const SICHTBAR = 10

const AMPEL = {
  gruen: { klasse: 'svc-banner-ok', icon: '✓', titel: 'Keine Auffälligkeiten' },
  gelb: { klasse: 'svc-banner-warn', icon: '!', titel: 'Im Auge behalten' },
  rot: { klasse: 'svc-banner-bad', icon: '!', titel: 'Jetzt hinschauen' },
} as const

const ROLLEN: Record<string, string> = {
  superadmin: 'Betreiber', management: 'Geschäftsleitung', admin: 'Büro', user: 'Monteur', user_light: 'Monteur (light)',
}

function zeit(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Kachel({ titel, wert, hinweis, ton }: { titel: string; wert: number; hinweis: string; ton?: 'warn' }) {
  return (
    <div className="svc-card" style={{ ['--svc-accent' as string]: ton === 'warn' ? 'var(--warning)' : 'var(--text-muted)' }}>
      <div className="svc-card-title">{titel}</div>
      <div className="svc-card-value">{wert.toLocaleString('de-CH')}</div>
      <div className="svc-card-caption">{hinweis}</div>
    </div>
  )
}

function KontoZeile({ k }: { k: AnmeldeKonto }) {
  const art = k.art === 'wiederherstellung' ? 'Wiederherstellungscode' : 'Passwort'
  return (
    <tr>
      <td className="primary">{k.name}<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ROLLEN[k.rolle] ?? k.rolle}</div></td>
      <td>{k.mandant}</td>
      <td>{art}</td>
      <td style={{ textAlign: 'right' }}>{k.fehlversuche_24h}</td>
      <td style={{ textAlign: 'right' }}>{k.fehlversuche}</td>
      <td style={{ textAlign: 'right' }}>{k.spitze_15min}</td>
      <td>{zeit(k.letzter)}</td>
      <td>
        {k.gesperrt
          ? <span className="svc-badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger-ink)' }}><span className="svc-badge-dot" />GESPERRT</span>
          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
    </tr>
  )
}

/** Die Ansicht ohne Laden — rein, damit testbar. */
export function AnmeldeLageAnsicht({ data }: { data: AnmeldeLage }) {
  if (data.status !== 'ok' || !data.summen || !data.ampel) {
    return (
      <div style={{ padding: 16, color: 'var(--warning-ink)', background: 'var(--warning-soft)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
        Anmelde-Lage nicht lesbar — die Migration 20261122_anmelde_lage ist vermutlich noch nicht eingespielt.
      </div>
    )
  }
  const a = AMPEL[data.ampel]
  const s = data.summen
  const konten = data.konten ?? []
  const bremsen = data.bremsen ?? []
  const sperre = data.sperre
    ? `${data.sperre.versuche} Fehlversuche in ${data.sperre.minuten} Min → ${data.sperre.minuten} Min Pause`
    : 'Bremse je Konto'
  return (
    <>
      <div className={`svc-banner ${a.klasse}`} data-testid="anmelde-ampel" data-ampel={data.ampel}>
        <div className="svc-banner-icon">{a.icon}</div>
        <div>
          <div className="svc-banner-title">{a.titel}</div>
          {(data.gruende ?? []).length > 0
            ? (data.gruende ?? []).map(g => <div key={g} className="svc-banner-sub">{g}</div>)
            : <div className="svc-banner-sub">Kein Konto mit gehäuften Fehlversuchen, Login-Bremsen im üblichen Rahmen.</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Kachel titel="Falsches Passwort" wert={s.login_falsch} hinweis="auf ein bestehendes Konto" ton={s.login_falsch > 0 ? 'warn' : undefined} />
        <Kachel titel="Wegen Sperre abgewiesen" wert={s.login_gesperrt} hinweis={sperre} ton={s.login_gesperrt > 0 ? 'warn' : undefined} />
        <Kachel titel="Login-Bremsen" wert={s.bremse_login} hinweis="zu viele Versuche von einer Adresse" />
        <Kachel titel="Unbekannte Namen" wert={s.login_unbekannt} hinweis="Grundrauschen, färbt die Ampel nicht" />
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', margin: '18px 0 8px' }}>Konten mit Fehlversuchen</div>
      {konten.length === 0
        ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Keine im Zeitraum.</div>
        : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Konto</th>
                  <th>Mandant</th>
                  <th>Art</th>
                  <th style={{ textAlign: 'right' }}>24 h</th>
                  <th style={{ textAlign: 'right' }}>Zeitraum</th>
                  <th style={{ textAlign: 'right' }} title="Meiste Fehlversuche in einem 15-Minuten-Fenster">Spitze 15 Min</th>
                  <th>Letzter</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {konten.slice(0, SICHTBAR).map(k => <KontoZeile key={`${k.mandant}:${k.name}:${k.art}`} k={k} />)}
              </tbody>
            </table>
          </div>
        )}
      {konten.length > SICHTBAR && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>… und {konten.length - SICHTBAR} weitere Konten.</div>
      )}

      {bremsen.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
          Bremsen im Zeitraum: {bremsen.map(b => `${b.name} ${b.anzahl}×`).join(' · ')}
          {s.bremse_andere > 0 && ` (davon ${s.bremse_andere} ausserhalb der Anmeldung)`}
        </div>
      )}
      {data.gekappt && (
        <div style={{ fontSize: 12, color: 'var(--warning-ink)', marginTop: 6 }}>Zu viele Zählerzeilen — die ältesten Tage fehlen in den Summen.</div>
      )}
    </>
  )
}

export default function AnmeldungenPanel() {
  const [range, setRange] = useState<Range>(7)
  const { data, error } = useQuery({
    queryKey: ['service-status', 'anmeldungen', range],
    queryFn: () => getAnmeldeLage(range),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  }, queryClient)

  return (
    <div style={{ marginTop: 28 }} data-testid="anmeldungen-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>
            Anmeldungen &amp; Abwehr
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Rät jemand an einem Konto? · nur diese Umgebung · ohne IP und ohne eingetippte Namen
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
      {!error && data && <AnmeldeLageAnsicht data={data} />}
      {!error && !data && <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>}
    </div>
  )
}

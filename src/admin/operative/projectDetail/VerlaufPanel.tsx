import { useState } from 'react'
import type { ProjectHistory, ProjectHistoryEvent, ProjectHistoryGroup } from '../../../api/admin/projects'

// Der Projekt-Verlauf im Reiter «Status» (Spec docs/specs/projekt-verlauf.md).
//
// Rein darstellend: die Sätze kommen fertig vom Server, hier wird nur gruppiert,
// gefiltert und formatiert. Das ist Absicht — wer die Formulierung im Frontend
// nachbaut, hat sie zweimal, und die zweite Fassung veraltet zuerst.
//
// Warum nach Tagen gruppiert: eine Chronik liest man von oben nach unten auf der
// Suche nach «wann war das nochmal». Eine Liste aus 80 gleich aussehenden Zeilen
// mit vollem Datum in jeder davon beantwortet das langsamer als 12 Tagesblöcke.

const GRUPPEN_LABEL: Record<ProjectHistoryGroup, string> = {
  projekt: 'Projekt',
  termin: 'Termine',
  offerte: 'Offerten',
  rapport: 'Rapporte',
  rechnung: 'Rechnungen',
  dokument: 'Dokumente',
  aufgabe: 'Aufgaben',
}

/** «Heute» / «Gestern» / «17.09.2026» — in der Zeitzone des Betrachters. */
export function tagesTitel(iso: string, heute: Date = new Date()): string {
  const d = new Date(iso)
  const gleicherTag = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (gleicherTag(d, heute)) return 'Heute'
  const gestern = new Date(heute)
  gestern.setDate(gestern.getDate() - 1)
  if (gleicherTag(d, gestern)) return 'Gestern'
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Ereignisse in Tagesblöcke — Reihenfolge bleibt, wie der Server sie liefert. */
export function nachTagen(events: ProjectHistoryEvent[], heute?: Date) {
  const bloecke: { titel: string; events: ProjectHistoryEvent[] }[] = []
  for (const ereignis of events) {
    const titel = tagesTitel(ereignis.at, heute)
    const letzter = bloecke[bloecke.length - 1]
    if (letzter && letzter.titel === titel) letzter.events.push(ereignis)
    else bloecke.push({ titel, events: [ereignis] })
  }
  return bloecke
}

function akteurText(ereignis: ProjectHistoryEvent): string {
  // «System» statt eines Namens, wo eine Automatik gehandelt hat: niemand soll
  // einem Scheduler eine Handlung zuschreiben. Und «—» statt eines geratenen
  // Namens, wo die Quelle keine Person kennt.
  if (ereignis.akteur) return ereignis.akteur
  return ereignis.quelle === 'system' ? 'System' : '—'
}

export function VerlaufPanel({ history, loading, failed }: {
  history: ProjectHistory | null
  loading: boolean
  failed: boolean
}) {
  const [filter, setFilter] = useState<ProjectHistoryGroup | 'alle'>('alle')

  const alle = history?.events ?? []
  const vorhandene = Object.keys(GRUPPEN_LABEL).filter(
    g => alle.some(e => e.gruppe === g),
  ) as ProjectHistoryGroup[]
  const sichtbar = filter === 'alle' ? alle : alle.filter(e => e.gruppe === filter)
  const bloecke = nachTagen(sichtbar)

  return (
    <div className="admin-table-wrap" style={{ padding: 20, flex: 1, minWidth: 0 }}>
      <div className="admin-section-title">Verlauf</div>

      {vorhandene.length > 1 && (
        <div className="kpi-admin-tabs" style={{ margin: '12px 0 4px' }}>
          <button
            type="button"
            className={`kpi-admin-tab ${filter === 'alle' ? 'active' : ''}`}
            onClick={() => setFilter('alle')}
          >Alle</button>
          {vorhandene.map(g => (
            <button
              key={g}
              type="button"
              className={`kpi-admin-tab ${filter === g ? 'active' : ''}`}
              onClick={() => setFilter(g)}
            >{GRUPPEN_LABEL[g]}</button>
          ))}
        </div>
      )}

      {loading && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>Wird geladen…</div>}

      {!loading && failed && (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
          Der Verlauf konnte nicht geladen werden.
        </div>
      )}

      {!loading && !failed && sichtbar.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
          Für dieses Projekt ist noch nichts aufgezeichnet.
        </div>
      )}

      {bloecke.map(block => (
        <div key={block.titel} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
            {block.titel}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {block.events.map((ereignis, i) => (
              <div
                key={`${ereignis.at}-${i}`}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px',
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {new Date(ereignis.at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {akteurText(ereignis)}
                </span>
                <span style={{ fontSize: 13, flex: 1, minWidth: 180 }}>{ereignis.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {history?.truncated && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
          Ältere Ereignisse sind nicht geladen.
        </p>
      )}

      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 14 }}>
        Der Verlauf zeigt Vorgänge am Projekt — wer etwas angesehen hat, steht
        bewusst nicht darin.
      </p>
    </div>
  )
}

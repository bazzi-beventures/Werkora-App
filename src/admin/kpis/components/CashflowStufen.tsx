import type { PipelineStufen } from '../pipelineAggregation'
import { MIN_ENTSCHIEDEN } from '../pipelineAggregation'
import { chfKurz } from '../chfKurz'

// Cashflow-Sicht der Projekt-Pipeline: ein Satz zur Einordnung, ein Balken über
// vier Stufen, die sich nicht überschneiden, und die Stufen als Kacheln.
// Rechnen tut pipelineStufen() (pipelineAggregation.ts) — hier nur Darstellung.

const chf = (v: number) =>
  `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`


const pct = (q: number) => `${Math.round(q * 100)} %`

interface Stufe {
  key: string
  label: string
  hinweis: string
  anzahl: number
  betrag: number
  color: string
}

interface Props {
  stufen: PipelineStufen
  akzeptiert: { anzahl: number; betrag: number }
  versendet: { anzahl: number; betrag: number }
  /** true, wenn nicht «Alles» gewählt ist — dann fehlen ältere offene Posten */
  zeitraumEingeschraenkt: boolean
}

export default function CashflowStufen({ stufen: s, akzeptiert, versendet, zeitraumEingeschraenkt }: Props) {
  const liste: Stufe[] = [
    { key: 'kunde', label: 'Beim Kunden', hinweis: 'Offerten versendet, noch nicht entschieden', anzahl: s.beimKunden, betrag: s.beimKundenChf, color: 'var(--info)' },
    { key: 'auftrag', label: 'Auftrag, nicht fakturiert', hinweis: 'angenommen, noch keine Rechnung versendet', anzahl: s.auftrag, betrag: s.auftragChf, color: 'var(--accent-purple)' },
    { key: 'fakturiert', label: 'Fakturiert, offen', hinweis: 'Rechnung versendet, noch nicht bezahlt', anzahl: s.fakturiertOffen, betrag: s.fakturiertOffenChf, color: 'var(--warning)' },
    { key: 'bezahlt', label: 'Bezahlt', hinweis: 'Zahlungen im Zeitraum', anzahl: s.bezahlt, betrag: s.bezahltChf, color: 'var(--success)' },
  ]
  const total = liste.reduce((a, x) => a + Math.max(0, x.betrag), 0)
  // Anteil der offenen Offerten, der erfahrungsgemäss angenommen wird —
  // im Balken als satter Teil des «Beim Kunden»-Segments, der Rest blass.
  const quote = s.annahmequote

  return (
    <section className="kpi-cashflow" aria-label="Cashflow nach Stufen">
      <div className="kpi-cashflow-satz">
        <p>
          <strong>{chfKurz(s.gesichertChf)} sind beauftragt, aber noch nicht bezahlt</strong>
          {s.fakturiertOffenChf > 0 && <> — davon {chfKurz(s.fakturiertOffenChf)} bereits fakturiert</>}.
          {s.beimKundenChf > 0 && (
            quote !== null ? (
              <> Dazu liegen {chfKurz(s.beimKundenChf)} in offenen Offerten beim Kunden; bei der bisherigen
                Annahmequote von {pct(quote)} sind davon rund <strong>{chfKurz(s.beimKundenErwartetChf ?? 0)}</strong> zu
                erwarten. Insgesamt also rund <strong>{chfKurz(s.nochZuErwartenChf)} noch zu erwarten</strong>.</>
            ) : (
              <> Dazu liegen {chfKurz(s.beimKundenChf)} in offenen Offerten beim Kunden — wie viel davon
                angenommen wird, lässt sich im Zeitraum noch nicht schätzen
                ({s.entschieden} entschiedene Offerten, ab {MIN_ENTSCHIEDEN} gibt es eine Quote).</>
            )
          )}
        </p>
        <p className="kpi-cashflow-fuss">
          {quote !== null && (
            <>Annahmequote = angenommen ÷ (angenommen + abgelehnt), nach Betrag, aus {s.entschieden} entschiedenen
              Offerten im Zeitraum. Offerten, die nie als abgelehnt markiert werden, fehlen im Nenner — dann fällt die
              Quote zu hoch aus. </>
          )}
          {zeitraumEingeschraenkt && <>Für den Blick nach vorn «Alles» wählen — sonst fehlen offene Posten aus früheren Zeiträumen.</>}
        </p>
      </div>

      {total > 0 && (
        <div className="kpi-cashflow-bar" role="img"
          aria-label={liste.map((x) => `${x.label} ${chf(x.betrag)}`).join(', ')}>
          {liste.map((x) => x.betrag > 0 && (
            <div key={x.key} className="kpi-cashflow-seg" style={{ flexGrow: x.betrag }} title={`${x.label}: ${chf(x.betrag)}`}>
              {x.key === 'kunde' && quote !== null ? (
                <>
                  <div style={{ flexGrow: quote, background: x.color }} />
                  <div style={{ flexGrow: 1 - quote, background: x.color, opacity: 0.35 }} />
                </>
              ) : (
                <div style={{ flexGrow: 1, background: x.color }} />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="kpi-cashflow-stufen">
        {liste.map((x) => (
          <div key={x.key} className="kpi-bi-card kpi-cashflow-stufe" style={{ borderTopColor: x.color }}>
            <div className="kpi-bi-card-label">{x.label}</div>
            <div className="kpi-bi-card-value">{chf(x.betrag)}</div>
            <div className="kpi-bi-card-sub">
              {x.anzahl} · {x.hinweis}
              {x.key === 'kunde' && quote !== null && <><br />erwartet ≈ {chf(s.beimKundenErwartetChf ?? 0)} ({pct(quote)})</>}
            </div>
          </div>
        ))}
      </div>

      <div className="kpi-cashflow-summen">
        Zum Vergleich, überschneiden sich: Offerten akzeptiert {akzeptiert.anzahl} · {chf(akzeptiert.betrag)}
        {' · '}Rechnungen versendet {versendet.anzahl} · {chf(versendet.betrag)}
      </div>
    </section>
  )
}

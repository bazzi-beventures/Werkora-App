import { fmtDay, type WishNews } from '../api/featureRequests'
import { dismissWishNews, wishNewsDismissed } from './wishNewsSession'
import './wishes.css'

/**
 * «Neues zu deinen Wünschen» — Spec docs/specs/feature-anfragen.md §5.9.
 *
 * Erscheint beim Start der App, wenn sich seit dem letzten Öffnen etwas an
 * einem Wunsch getan hat, den man angefragt oder abonniert hat — typischerweise
 * eine neue Phase, während man nicht angemeldet war. Die Push ist der schnelle
 * Weg; sie kommt nicht an, wenn das Gerät aus ist, man sich abgemeldet hat
 * oder Pushes nicht erlaubt sind. Dieser Hinweis ist der Weg, der immer
 * ankommt.
 *
 * Ein Eintrag je Feature (Server: `feature_news`). «OK» und «Zur Roadmap»
 * quittieren alles auf einmal — dieselbe Quittung wie beim Öffnen von «Meine
 * Wünsche». «Später» schliesst nur für diesen App-Start; beim nächsten steht
 * der Hinweis wieder da, bis jemand ihn quittiert.
 */

function line(n: WishNews): string {
  if (n.kind === 'feature') return `jetzt «${n.phase_label}»${n.target_label ? ` · Ziel: ${n.target_label}` : ''}`
  return n.triage_label ?? 'Antwort'
}

export default function WishNewsNotice({ news, appContext, onAcknowledge, onOpenRoadmap, onDismiss }: {
  news: WishNews[]
  appContext: 'pwa' | 'admin'
  /** Quittung an den Server (`markRead`). */
  onAcknowledge: () => void
  onOpenRoadmap?: () => void
  /** Nur ausblenden — der Aufrufer rendert neu. */
  onDismiss: () => void
}) {
  if (news.length === 0 || wishNewsDismissed()) return null

  const close = (ack: boolean) => {
    dismissWishNews()
    if (ack) onAcknowledge()
    onDismiss()
  }

  const shown = news.slice(0, 5)
  return (
    <div className="roadmap-sheet-backdrop" onClick={() => close(false)}>
      <div className={`roadmap-sheet wish-root${appContext === 'admin' ? ' is-admin' : ''}`}
           role="dialog" aria-modal="true" aria-labelledby="wish-news-title"
           onClick={e => e.stopPropagation()}>
        <b id="wish-news-title">💡 Neues zu deinen Wünschen</b>
        <ul className="wish-news-list">
          {shown.map(n => (
            <li key={`${n.kind}-${n.feature_id ?? n.request_id}`}>
              <div className="wish-muted">
                {n.reference}{n.notified_on ? ` · ${fmtDay(n.notified_on)}` : ''}
                {n.source === 'abo' ? ' · 🔔 abonniert' : ''}
              </div>
              {n.title && <div className="wish-card-title">{n.title}</div>}
              <div className="wish-accent">{line(n)}</div>
              {n.kind === 'antwort' && n.answer && <div className="wish-quote">{n.answer}</div>}
            </li>
          ))}
        </ul>
        {news.length > shown.length && (
          <div className="wish-muted">… und {news.length - shown.length} weitere</div>
        )}
        <div className="wish-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="wish-btn-ghost" style={{ flex: '0 0 auto' }}
                  onClick={() => close(false)}>
            Später
          </button>
          {onOpenRoadmap && (
            <button type="button" className="wish-btn-ghost" style={{ flex: '0 0 auto' }}
                    onClick={() => { close(true); onOpenRoadmap() }}>
              Zur Roadmap
            </button>
          )}
          <button type="button" className="wish-btn" style={{ flex: '0 0 auto' }} onClick={() => close(true)}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

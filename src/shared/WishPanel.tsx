import { useState } from 'react'
import MyWishes from './MyWishes'
import WishForm from './WishForm'
import type { MyWishesState } from './useMyWishes'
import './wishes.css'

/**
 * Reiter «Wünsche» der Hilfe-Blase — Spec docs/specs/feature-anfragen.md §5.1/§5.5.
 *
 * Bewusst ein EIGENER Reiter neben «Problem melden», nicht ein Unterpunkt:
 * die Trennung von Support und Wunsch muss passieren, bevor jemand schreibt
 * (F4). Zwei Ansichten wie beim Support: das Formular und «Meine Wünsche»;
 * wartet eine ungelesene Nachricht, öffnet der Reiter direkt dort.
 */

interface Props {
  route: string
  appContext: 'pwa' | 'admin'
  mine: MyWishesState
  onOpenRoadmap?: () => void
}

type View = 'neu' | 'meine'

export default function WishPanel({ route, appContext, mine, onOpenRoadmap }: Props) {
  const [view, setView] = useState<View>(mine.unread > 0 ? 'meine' : 'neu')

  function showMine() {
    setView('meine')
    if (mine.unread > 0) void mine.markRead()
    void mine.reload()
  }

  return (
    <div className={`wish-root${appContext === 'admin' ? ' is-admin' : ''}`}
         style={{ height: '100%', overflowY: 'auto', padding: 16, boxSizing: 'border-box' }}>
      <div className="wish-switch" role="group" aria-label="Ansicht">
        <button type="button" aria-pressed={view === 'neu'} onClick={() => setView('neu')}>
          Wunsch äussern
        </button>
        <button type="button" aria-pressed={view === 'meine'} onClick={showMine}>
          Meine Wünsche{mine.unread > 0 ? ` (${mine.unread})` : ''}
        </button>
      </div>

      {view === 'neu' ? (
        <WishForm route={route} appContext={appContext}
                  onSubmitted={() => void mine.reload()} onOpenRoadmap={onOpenRoadmap} />
      ) : (
        <MyWishes wishes={mine.wishes} loading={mine.loading} failed={mine.failed}
                  onChanged={() => void mine.reload()}
                  onOpenFeature={onOpenRoadmap ? () => onOpenRoadmap() : undefined} />
      )}

      {onOpenRoadmap && (
        <button type="button" className="wish-link" onClick={onOpenRoadmap}>
          Roadmap ansehen — was schon angefragt ist und wie es steht
        </button>
      )}
    </div>
  )
}

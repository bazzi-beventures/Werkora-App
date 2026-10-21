import { useRef, useState } from 'react'
import {
  AREA_LABEL, MAX_WISH_FILE_BYTES, MAX_WISH_FILES, fmtDay, replyToWishQuestion, unsubscribeFeature, uploadWishScreenshots,
  withdrawWish, type MySubscription, type MyWish, type QuestionRound,
} from '../api/featureRequests'
import { useOnline } from './useOnline'

/**
 * «Meine Wünsche» bzw. «Unsere Wünsche» — Spec docs/specs/feature-anfragen.md §5.5.
 *
 * Je Wunsch: Nummer, Datum, Titel und der STAND — bei einem zugeordneten
 * Wunsch die Phase des Features, sonst der Zustand der Triage samt dem Satz
 * des Betreibers. Nie eine Uhrzeit (F13).
 *
 * Darunter «Abonniert» (§5.9): Features, zu denen man ohne eigene Anfrage
 * Post bekommt — mit «Abo beenden» an derselben Stelle, an der man sie sieht.
 *
 * Steht eine Rückfrage des Betreibers offen (§7.1a), trägt die Karte das
 * Antwortfeld gleich mit — wer die Frage liest, soll sie dort beantworten,
 * wo er sie sieht, nicht erst einen Weg dahin suchen.
 */

/** Frühere Runden — Frage des Betreibers und die eigene Antwort. */
function QuestionHistory({ rounds, showPerson }: { rounds: QuestionRound[]; showPerson: boolean }) {
  const answered = rounds.filter(r => r.antwort)
  if (answered.length === 0) return null
  return (
    <>
      {answered.map((r, i) => (
        <div key={i} className="wish-question-round">
          <div className="wish-muted">Rückfrage{r.gefragt_am ? ` · ${fmtDay(r.gefragt_am)}` : ''}</div>
          <div className="wish-quote">{r.frage}</div>
          <div className="wish-muted">
            {showPerson ? 'Antwort' : 'Deine Antwort'}{r.beantwortet_am ? ` · ${fmtDay(r.beantwortet_am)}` : ''}
          </div>
          <div className="wish-quote">{r.antwort}</div>
        </div>
      ))}
    </>
  )
}

/** Antwort auf die offene Rückfrage — Text Pflicht, Screenshots optional.
 *
 *  Die Bilder gehen VOR dem Text hoch, solange die Rückfrage noch offen ist:
 *  danach liegt der Wunsch wieder im Eingang, und ein Entscheid des
 *  Betreibers zwischen Text und Bild verschluckte das Bild. Scheitert der
 *  Upload, geht auch der Text nicht raus — beides bleibt stehen, ein zweiter
 *  Klick versucht es erneut. Je Antwort bis zu drei Bilder, unabhängig davon,
 *  wie viele schon am Wunsch hängen (Spec §7.1a). */
function QuestionReply({ wish, onAnswered }: { wish: MyWish; onAnswered: () => void }) {
  const online = useOnline()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  function addFiles(selected: ArrayLike<File> | null) {
    if (!selected) return
    const next: File[] = []
    let localError: string | null = null
    for (const file of Array.from(selected)) {
      if (file.size > MAX_WISH_FILE_BYTES) { localError = 'Ein Bild ist grösser als 10 MB.'; continue }
      next.push(file)
    }
    if (files.length + next.length > MAX_WISH_FILES) localError = `Maximal ${MAX_WISH_FILES} Bilder.`
    setFiles([...files, ...next].slice(0, MAX_WISH_FILES))
    setError(localError)
    if (fileRef.current) fileRef.current.value = ''
  }

  /** Strg+V mit einem Bild in der Zwischenablage — wie im Wunschformular. */
  function handlePaste(e: React.ClipboardEvent) {
    const images: File[] = []
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (!file) continue
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      images.push(new File([file], `Eingefügtes Bild ${files.length + images.length + 1}.${ext}`,
                           { type: file.type }))
    }
    if (images.length === 0) return
    e.preventDefault()
    addFiles(images)
  }

  async function send() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    if (files.length > 0) {
      try {
        await uploadWishScreenshots(wish.id, files)
        // Die Bilder hängen jetzt am Wunsch — ein zweiter Versuch nach einem
        // gescheiterten Text darf sie nicht ein zweites Mal hochladen.
        setFiles([])
      } catch {
        setError('Die Bilder konnten nicht hochgeladen werden. Deine Antwort ist noch nicht gesendet.')
        setBusy(false)
        return
      }
    }
    try {
      await replyToWishQuestion(wish.id, text.trim())
    } catch {
      // 409: der Betreiber hat inzwischen anders entschieden — die Liste neu
      // laden zeigt den Stand; der getippte Text bleibt stehen.
      setError('Die Antwort konnte nicht gesendet werden.')
      setBusy(false)
      onAnswered()
      return
    }
    setBusy(false)
    onAnswered()
  }

  return (
    <div className="wish-question">
      <div className="wish-accent"><b>Rückfrage an dich</b></div>
      {wish.answer && <div className="wish-quote">{wish.answer}</div>}
      <textarea className="wish-input" rows={3} maxLength={2000} value={text}
                aria-label={`Antwort auf die Rückfrage zu ${wish.reference}`}
                placeholder="Deine Antwort — Screenshots kannst du dazulegen"
                onChange={e => setText(e.target.value)} onPaste={handlePaste} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label="Screenshot wählen"
             onChange={e => addFiles(e.target.files)} />
      {files.length > 0 && (
        <div className="wish-row" style={{ flexWrap: 'wrap' }}>
          {files.map((f, i) => (
            <button key={`${f.name}-${i}`} type="button" className="wish-btn-ghost"
                    style={{ flex: '0 0 auto' }} aria-label={`${f.name} entfernen`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}>
              {f.name} ✕
            </button>
          ))}
        </div>
      )}
      <div className="wish-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="wish-btn-ghost" style={{ flex: '0 0 auto' }}
                disabled={files.length >= MAX_WISH_FILES}
                onClick={() => fileRef.current?.click()}>
          📷 {files.length > 0 ? `${files.length}/${MAX_WISH_FILES} Bild(er)` : 'Screenshot'}
        </button>
        <button type="button" className="wish-btn" style={{ flex: '0 0 auto' }}
                disabled={busy || !online || !text.trim()} onClick={send}>
          {online ? 'Antworten' : 'Offline'}
        </button>
      </div>
      {error && <div className="wish-error" role="alert">{error}</div>}
    </div>
  )
}

interface Props {
  wishes: MyWish[]
  subscriptions?: MySubscription[]
  loading?: boolean
  failed?: boolean
  /** «Unsere Wünsche»: Person je Zeile zeigen, kein Zurückziehen. */
  showPerson?: boolean
  onOpenFeature?: (featureId: string) => void
  onChanged?: () => void
  emptyText?: string
}

export default function MyWishes({
  wishes, subscriptions = [], loading, failed, showPerson = false, onOpenFeature, onChanged,
  emptyText = 'Du hast noch keinen Wunsch geäussert.',
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)

  async function unsubscribe(featureId: string) {
    setBusyId(featureId)
    try {
      await unsubscribeFeature(featureId)
    } catch {
      /* bleibt abonniert — der Knopf ist erneut drückbar */
    } finally {
      setBusyId(null)
      onChanged?.()
    }
  }

  const subscriptionList = subscriptions.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="wish-muted">Abonniert</div>
      {subscriptions.map(sub => sub.feature && (
        <div key={sub.feature_id} className="wish-card">
          {sub.unread && <span className="wish-card-new" aria-label="Neu" />}
          <div className="wish-muted">{sub.feature.reference} · 🔔 abonniert</div>
          <div className="wish-card-title">{sub.feature.title}</div>
          <div>
            <span className="wish-phase wish-accent">{sub.feature.phase_label}</span>
            <span className="wish-muted"> Ziel: {sub.feature.target_label}</span>
          </div>
          <div className="wish-row" style={{ gap: 12 }}>
            {onOpenFeature && (
              <button type="button" className="wish-link" style={{ flex: '0 0 auto' }}
                      onClick={() => onOpenFeature(sub.feature_id)}>
                auf der Roadmap
              </button>
            )}
            <button type="button" className="wish-link" style={{ flex: '0 0 auto' }}
                    disabled={busyId === sub.feature_id} onClick={() => unsubscribe(sub.feature_id)}>
              Abo beenden
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  async function withdraw(id: string) {
    setBusyId(id)
    try {
      await withdrawWish(id)
      onChanged?.()
    } catch {
      // 409: schon triagiert — dann gehört der Wortlaut in den Pool.
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  if (failed && wishes.length === 0) {
    return <div className="wish-muted">Deine Wünsche liegen online — gerade nicht erreichbar.</div>
  }
  if (!loading && wishes.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="wish-muted">{emptyText}</div>
        {subscriptionList}
      </div>
    )
  }

  return (
    <div className="wish-root-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {wishes.map(w => {
        const unread = !!w.notified_at && (!w.read_at || w.read_at < w.notified_at)
        return (
          <div key={w.id} className="wish-card">
            {unread && <span className="wish-card-new" aria-label="Neu" />}
            <div className="wish-muted">
              {w.reference} · {fmtDay(w.created_on)}
              {showPerson && w.created_by_name ? ` · ${w.created_by_name}` : ''}
              {w.area ? ` · ${AREA_LABEL[w.area] ?? w.area}` : ''}
            </div>
            <div className="wish-card-title">
              {w.origin === 'unterstuetzung'
                ? `Unterstützt: ${w.feature?.title ?? 'Feature'}`
                : w.title || '(ohne Titel)'}
            </div>
            {w.feature ? (
              <div>
                <span className="wish-phase wish-accent">{w.feature.phase_label}</span>
                <span className="wish-muted"> {w.feature.reference} · Ziel: {w.feature.target_label}</span>
                {onOpenFeature && (
                  <>
                    {' '}
                    <button type="button" className="wish-link" onClick={() => onOpenFeature(w.feature!.id)}>
                      auf der Roadmap
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div><span className="wish-phase">{w.triage_label}</span></div>
            )}
            {w.rueckfragen && w.rueckfragen.length > 0 && (
              <QuestionHistory rounds={w.rueckfragen} showPerson={showPerson} />
            )}
            {w.triage === 'rueckfrage' && !showPerson ? (
              <QuestionReply wish={w} onAnswered={() => onChanged?.()} />
            ) : (
              w.answer && w.triage !== 'zugeordnet' && <div className="wish-quote">{w.answer}</div>
            )}
            {!showPerson && (w.triage === 'neu' || w.triage === 'rueckfrage') && w.origin === 'anfrage' && (
              <div>
                <button type="button" className="wish-link" disabled={busyId === w.id}
                        onClick={() => withdraw(w.id)}>
                  zurückziehen
                </button>
              </div>
            )}
          </div>
        )
      })}
      {subscriptionList}
    </div>
  )
}

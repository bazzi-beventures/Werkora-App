import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import {
  AREA_LABEL,
  IMPORTANCE_LABEL,
  areaForRoute,
  searchSimilarFeatures,
  submitWish,
  supportFeatureWish,
  transcribeWishAudio,
  type BoardCard,
  type Importance,
} from '../api/featureRequests'
import { appendTranscript } from '../api/support'
import { isVoiceRecordingSupported, useVoiceRecorder } from '../chat/useVoiceRecorder'
import { useOnline } from './useOnline'

/**
 * «Ich wünsche mir etwas» — Spec docs/specs/feature-anfragen.md §5.2/§5.3.
 *
 * Zwei Dinge unterscheiden das Formular von der Support-Meldung:
 *
 * 1. **Vor dem Absenden steht, was es schon gibt.** Ab drei Zeichen im Titel
 *    fragt es die Roadmap ab; «Brauchen wir auch» ersetzt dann das Absenden.
 *    Die billigste Deduplizierung ist die, die der Nutzer selbst macht (F5).
 * 2. **Kein Snapshot, keine Screenshots.** Ein Wunsch hat keinen
 *    Fehlerzustand, den man rekonstruieren müsste.
 */

const ERROR_TEXT: Record<string, string> = {
  title_required: 'Bitte beschreibe deinen Wunsch in einem Satz.',
  description_required: 'Bitte sag kurz, wie es funktionieren soll.',
  invalid_area: 'Bitte wähle einen Bereich.',
  rate_limited: 'Du hast gerade mehrere Wünsche geschickt. Bitte in einer Stunde erneut.',
  module_disabled: 'Wünsche sind für deinen Betrieb nicht aktiviert.',
}

const VOICE_ERROR_TEXT: Record<string, string> = {
  denied: 'Kein Zugriff aufs Mikrofon. Bitte in den Browser-Einstellungen erlauben.',
  unsupported: 'Dieser Browser kann nicht aufnehmen. Bitte tippe den Wunsch.',
  transcription_failed: 'Die Aufnahme konnte nicht in Text umgewandelt werden.',
  audio_empty: 'Die Aufnahme war leer. Bitte etwas länger sprechen.',
}

interface Props {
  route: string
  appContext: 'pwa' | 'admin'
  /** Nach dem Absenden — z.B. «Meine Wünsche» neu laden. */
  onSubmitted?: () => void
  onOpenRoadmap?: () => void
}

function SimilarHint({ card, appContext, onSupported }: {
  card: BoardCard
  appContext: 'pwa' | 'admin'
  onSupported: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [importance, setImportance] = useState<Importance>('wichtig')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(card.mine !== null)

  async function support() {
    setBusy(true)
    try {
      await supportFeatureWish(card.id, {
        ...(text.trim() ? { text: text.trim() } : {}),
        importance,
        app_context: appContext,
      })
      setDone(true)
      setOpen(false)
      onSupported()
    } catch {
      /* Knopf bleibt — ein zweiter Versuch ist harmlos (idempotent) */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wish-similar-item">
      <div className="wish-similar-head">
        <span><b>{card.reference}</b> {card.title}</span>
        <span className="wish-muted">{card.phase_label}</span>
      </div>
      {done ? (
        <span className="wish-accent">✓ {card.mine === 'anfrage' ? 'Von dir angefragt' : 'Unterstützt'}</span>
      ) : open ? (
        <>
          <textarea className="wish-input" rows={2} maxLength={500} value={text}
                    placeholder="Wofür braucht ihr das? (optional)"
                    onChange={e => setText(e.target.value)} />
          <div className="wish-row">
            <select className="wish-input" value={importance} aria-label="Wie wichtig?"
                    onChange={e => setImportance(e.target.value as Importance)}>
              {(Object.keys(IMPORTANCE_LABEL) as Importance[]).map(i => (
                <option key={i} value={i}>{IMPORTANCE_LABEL[i]}</option>
              ))}
            </select>
            <button type="button" className="wish-btn" disabled={busy} onClick={support}>Unterstützen</button>
          </div>
        </>
      ) : (
        <button type="button" className="wish-btn-ghost" onClick={() => setOpen(true)}>
          Brauchen wir auch
        </button>
      )}
    </div>
  )
}

export default function WishForm({ route, appContext, onSubmitted, onOpenRoadmap }: Props) {
  const online = useOnline()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [problem, setProblem] = useState('')
  const [area, setArea] = useState(() => areaForRoute(route))
  const [importance, setImportance] = useState<Importance>('wichtig')
  const [similar, setSimilar] = useState<BoardCard[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [voiceSupported] = useState(isVoiceRecordingSupported)

  // Duplikat-Hinweis: entprellt, erst ab drei Zeichen. Kein Treffer ist
  // kein Fehler — dann ist der Wunsch eben neu.
  useEffect(() => {
    const q = title.trim()
    if (q.length < 3 || !online) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchSimilarFeatures(q)
        .then(res => { if (!cancelled) setSimilar(res.features ?? []) })
        .catch(() => { if (!cancelled) setSimilar([]) })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [title, online])

  async function handleAudio(blob: Blob) {
    setTranscribing(true)
    setError('')
    try {
      const text = await transcribeWishAudio(blob)
      if (!text) { setError(VOICE_ERROR_TEXT.audio_empty); return }
      setDescription(current => appendTranscript(current, text))
    } catch {
      setError(VOICE_ERROR_TEXT.transcription_failed)
    } finally {
      setTranscribing(false)
    }
  }

  const { isRecording, seconds, startRecording, sendRecording, discardRecording } =
    useVoiceRecorder(handleAudio, reason => setError(VOICE_ERROR_TEXT[reason] ?? ''))

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const res = await submitWish({
        title: title.trim(),
        description: description.trim(),
        ...(problem.trim() ? { problem: problem.trim() } : {}),
        area,
        importance,
        route,
        app_context: appContext,
      })
      setReference(res.reference)
      onSubmitted?.()
    } catch (e) {
      const code = e instanceof ApiError ? e.message : ''
      setError(ERROR_TEXT[code] || 'Senden fehlgeschlagen. Bitte später erneut.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setTitle(''); setDescription(''); setProblem(''); setSimilar([])
    setImportance('wichtig'); setArea(areaForRoute(route)); setReference(''); setError('')
  }

  if (reference) {
    return (
      <div className="wish-root-inner" role="status">
        <p>
          Dein Wunsch <b>{reference}</b> ist eingegangen. Unter <i>Meine Wünsche</i> siehst
          du, wie es weitergeht.
        </p>
        <div className="wish-row">
          <button type="button" className="wish-btn-ghost" onClick={reset}>Weiteren Wunsch</button>
          {onOpenRoadmap && (
            <button type="button" className="wish-btn-ghost" onClick={onOpenRoadmap}>Roadmap ansehen</button>
          )}
        </div>
      </div>
    )
  }

  const shownSimilar = title.trim().length >= 3 ? similar : []
  const ready = online && !busy && !!title.trim() && !!description.trim() && !!area

  return (
    <>
      <label className="wish-field">
        <span>Was wünschst du dir, in einem Satz?</span>
        <input className="wish-input" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
      </label>

      {shownSimilar.length > 0 && (
        <div className="wish-similar" aria-label="Gibt es vielleicht schon">
          <span className="wish-muted">Gibt es vielleicht schon:</span>
          {shownSimilar.map(card => (
            <SimilarHint key={card.id} card={card} appContext={appContext} onSupported={() => onSubmitted?.()} />
          ))}
        </div>
      )}

      <label className="wish-field">
        <span>Wie soll es funktionieren?</span>
        <textarea className="wish-input" rows={4} maxLength={2000} value={description}
                  onChange={e => setDescription(e.target.value)} />
      </label>
      {voiceSupported && (
        <div className="wish-row">
          {isRecording ? (
            <>
              <span className="wish-muted">Aufnahme {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
              <button type="button" className="wish-btn-ghost" onClick={sendRecording}>Fertig</button>
              <button type="button" className="wish-btn-ghost" onClick={discardRecording}>Verwerfen</button>
            </>
          ) : (
            <button type="button" className="wish-btn-ghost" disabled={transcribing || !online}
                    onClick={() => void startRecording()}>
              {transcribing ? 'Wird umgewandelt …' : '🎤 Wunsch diktieren'}
            </button>
          )}
        </div>
      )}

      <label className="wish-field">
        <span>Wofür brauchst du das? Was klemmt heute? (optional)</span>
        <textarea className="wish-input" rows={2} maxLength={1000} value={problem}
                  onChange={e => setProblem(e.target.value)} />
      </label>

      <div className="wish-row">
        <label className="wish-field">
          <span>Bereich</span>
          <select className="wish-input" value={area} onChange={e => setArea(e.target.value)}>
            <option value="">— wählen —</option>
            {Object.entries(AREA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="wish-field">
          <span>Wie wichtig?</span>
          <select className="wish-input" value={importance}
                  onChange={e => setImportance(e.target.value as Importance)}>
            {(Object.keys(IMPORTANCE_LABEL) as Importance[]).map(i => (
              <option key={i} value={i}>{IMPORTANCE_LABEL[i]}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div role="alert" className="wish-error">{error}</div>}
      {!online && (
        <div className="wish-muted">Ohne Netz lässt sich kein Wunsch senden — dein Text bleibt stehen.</div>
      )}
      <button type="button" className="wish-btn" disabled={!ready} onClick={submit}>
        {busy ? 'Wird gesendet …' : 'Wunsch senden'}
      </button>
      <p className="wish-muted">
        Dein Wunsch geht an das Werkora-Team. Andere Betriebe sehen deinen Namen und
        deinen Text nicht — nur, dass es den Wunsch gibt, sobald er auf der Roadmap
        steht. Deine Kolleginnen und Kollegen sehen, dass du ihn angefragt hast.
        {voiceSupported && ' Eine Aufnahme geht zur Umwandlung in Text an Mistral (Frankreich) und wird nicht gespeichert.'}
      </p>
    </>
  )
}

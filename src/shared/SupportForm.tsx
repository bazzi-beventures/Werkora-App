import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  MAX_SUPPORT_FILE_BYTES,
  MAX_SUPPORT_FILES,
  MAX_SUPPORT_MESSAGE_CHARS,
  appendTranscript,
  sendSupportTicket,
  transcribeSupportAudio,
} from '../api/support'
import { isVoiceRecordingSupported, useVoiceRecorder } from '../chat/useVoiceRecorder'

/**
 * «Problem melden» — Spec docs/specs/support-ticket.md §5.
 *
 * Screenshots hängt der Nutzer EXPLIZIT an (kein automatischer Bildschirmschuss):
 * er muss sehen, was er mitschickt — ein Admin-Screen kann Löhne zeigen.
 *
 * Dasselbe gilt fürs Diktat (§5.5): Mistral Voice liefert den Text ins Feld,
 * abgeschickt wird er erst mit «Meldung senden». Wer auf der Baustelle mit
 * Handschuhen am Handy steht, tippt sonst gar nichts — und meldet nichts.
 */

interface Props {
  /** Aktueller Screen — wandert als `route` ins Ticket. */
  route: string
  appContext: 'pwa' | 'admin'
}

const ERROR_TEXT: Record<string, string> = {
  module_disabled: 'Support-Meldungen sind für diesen Mandanten nicht aktiviert.',
  message_required: 'Bitte beschreibe das Problem kurz.',
  too_many_files: `Maximal ${MAX_SUPPORT_FILES} Bilder.`,
  file_too_large: 'Ein Bild ist zu gross (max. 10 MB).',
  not_an_image: 'Nur Bilder (JPG, PNG, HEIC) können angehängt werden.',
  rate_limited: 'Du hast gerade mehrere Meldungen geschickt. Bitte in einer Stunde erneut.',
}

const VOICE_ERROR_TEXT: Record<string, string> = {
  denied: 'Kein Zugriff aufs Mikrofon. Bitte in den Browser-Einstellungen erlauben.',
  unsupported: 'Dieser Browser kann nicht aufnehmen. Bitte tippe die Meldung.',
  transcription_failed: 'Die Aufnahme konnte nicht in Text umgewandelt werden. Bitte erneut oder tippen.',
  audio_empty: 'Die Aufnahme war leer. Bitte etwas länger sprechen.',
  audio_too_large: 'Die Aufnahme ist zu lang.',
  rate_limited_voice: 'Du hast gerade viel diktiert. Bitte kurz warten.',
}

function formatSeconds(total: number) {
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

export default function SupportForm({ route, appContext }: Props) {
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reference, setReference] = useState('')
  /** Angehängt, aber nicht gespeichert (Storage-Fehler). 0 = alles da. */
  const [lostFiles, setLostFiles] = useState(0)
  /** Aufnahme liegt bei Mistral, der Text ist noch nicht zurück. */
  const [transcribing, setTranscribing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Einmal beim ersten Rendern festhalten: Ein Knopf, der später verschwindet,
  // weil `navigator.mediaDevices` gerade anders antwortet, verwirrt mehr als er hilft.
  const [voiceSupported] = useState(isVoiceRecordingSupported)

  async function handleAudio(blob: Blob) {
    setTranscribing(true)
    setError('')
    try {
      const text = await transcribeSupportAudio(blob)
      if (!text) { setError(VOICE_ERROR_TEXT.audio_empty); return }
      // Anhängen statt Ersetzen — die Regel steckt in `appendTranscript`.
      setMessage(current => appendTranscript(current, text))
    } catch (e) {
      const detail = e instanceof ApiError ? e.message : ''
      const key = detail === 'rate_limited' ? 'rate_limited_voice' : detail
      setError(VOICE_ERROR_TEXT[key] || VOICE_ERROR_TEXT.transcription_failed)
    } finally {
      setTranscribing(false)
    }
  }

  const {
    isRecording, seconds, startRecording, sendRecording, discardRecording,
  } = useVoiceRecorder(handleAudio, reason => setError(VOICE_ERROR_TEXT[reason]))

  function addFiles(selected: ArrayLike<File> | null) {
    if (!selected) return
    const next: File[] = []
    let localError = ''
    for (const file of Array.from(selected)) {
      if (file.size > MAX_SUPPORT_FILE_BYTES) { localError = ERROR_TEXT.file_too_large; continue }
      next.push(file)
    }
    const merged = [...files, ...next].slice(0, MAX_SUPPORT_FILES)
    if (files.length + next.length > MAX_SUPPORT_FILES) localError = ERROR_TEXT.too_many_files
    setFiles(merged)
    setError(localError)
    // Input leeren, damit dieselbe Datei erneut gewählt werden kann.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /**
   * Screenshot aus der Zwischenablage einfügen (Strg+V).
   *
   * Der übliche Weg unter Windows ist Win+Shift+S → Strg+V; der Ausschnitt
   * landet nur in der Zwischenablage, nie als Datei auf der Platte. Ohne diesen
   * Handler müsste der Nutzer ihn erst irgendwo speichern, um ihn über den
   * Dateidialog anhängen zu können — genau die Hürde, an der eine Meldung
   * ungeschrieben bleibt.
   *
   * Bilder aus der Zwischenablage haben oft gar keinen oder immer denselben
   * Namen ("image.png"), was in der Liste unbrauchbar ist. Deshalb bekommen sie
   * hier einen eigenen, durchnummerierten Namen.
   */
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
    // Nur bei Bildern abfangen: eingefügter TEXT muss weiterhin normal im Feld
    // landen — auch das gehört zu «einfügen können».
    e.preventDefault()
    addFiles(images)
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, i) => i !== index))
  }

  async function submit() {
    const text = message.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      const created = await sendSupportTicket(text, files, { route, appContext })
      setReference(created.reference)
      // Der Server zählt, was wirklich im Storage liegt. Weicht das ab, ist ein
      // Bild verloren — das gehört in die Quittung, statt dass der Nutzer glaubt,
      // der Support sehe seinen Screenshot. `?? files.length` = kein Fehlalarm,
      // falls eine ältere Antwort das Feld nicht führt.
      setLostFiles(Math.max(0, files.length - (created.attachment_count ?? files.length)))
      setMessage('')
      setFiles([])
    } catch (e) {
      const detail = e instanceof ApiError ? e.message : ''
      setError(ERROR_TEXT[detail] || 'Die Meldung konnte nicht gesendet werden. Bitte später erneut.')
    } finally {
      setBusy(false)
    }
  }

  // Quittung: der verlässliche Weg. Die zusätzliche Push kann ausfallen (kein
  // Gerät registriert, VAPID nicht konfiguriert) — diese Anzeige nie.
  if (reference) {
    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 600 }}>Meldung {reference} ist eingegangen.</div>
        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          Wir schauen sie uns an. Notiere dir die Nummer, falls du nachfragen möchtest.
        </div>
        {lostFiles > 0 && (
          <div role="alert" style={{ fontSize: '0.85rem', color: 'var(--danger, #ef4444)' }}>
            {lostFiles === 1
              ? 'Ein Bild konnte nicht gespeichert werden'
              : `${lostFiles} Bilder konnten nicht gespeichert werden`} — der Text der
            Meldung ist angekommen. Bitte melde dich, wenn das Bild wichtig ist.
          </div>
        )}
        <button
          type="button"
          onClick={() => { setReference(''); setLostFiles(0) }}
          style={{
            alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
            color: 'inherit', cursor: 'pointer',
          }}
        >
          Weitere Meldung
        </button>
      </div>
    )
  }

  return (
    // onPaste am ganzen Formular, nicht nur am Textfeld: nach dem Anhängen des
    // ersten Bildes liegt der Fokus oft nicht mehr im Textfeld, und ein zweites
    // Strg+V soll trotzdem ankommen.
    <div onPaste={handlePaste}
         style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
      <label htmlFor="support-message" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
        Was ist passiert?
      </label>
      <textarea
        id="support-message"
        value={message}
        onChange={e => setMessage(e.target.value)}
        maxLength={MAX_SUPPORT_MESSAGE_CHARS}
        rows={5}
        placeholder="Z.B. Rapport lässt sich nicht speichern, Knopf reagiert nicht …"
        style={{
          width: '100%', resize: 'vertical', padding: 10, borderRadius: 8,
          border: '1px solid var(--border, #e5e7eb)', background: 'var(--surface, #fff)',
          color: 'inherit', font: 'inherit',
        }}
      />

      {voiceSupported && (
        <div>
          {isRecording ? (
            // Zwei Wege aus der Aufnahme, beide sichtbar: «Fertig» schickt sie
            // zur Umwandlung, «Verwerfen» lässt sie fallen. Ein einzelner
            // Stopp-Knopf zwänge, eine verunglückte Aufnahme trotzdem zu
            // transkribieren — und der Text stünde danach im Feld.
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Die Laufzeit bewusst AUSSERHALB der Live-Region: sie ändert sich
                  jede halbe Sekunde und würde einem Screenreader die Aufnahme
                  im Sekundentakt vorlesen. Angesagt wird nur, dass sie läuft. */}
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                <span aria-live="polite">Aufnahme läuft</span> … {formatSeconds(seconds)}
              </span>
              <button
                type="button"
                onClick={sendRecording}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: 'var(--brand, #3180ab)', color: '#fff', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 600,
                }}
              >
                Fertig
              </button>
              <button
                type="button"
                onClick={discardRecording}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border, #e5e7eb)', background: 'transparent',
                  color: 'inherit', cursor: 'pointer', fontSize: '0.9rem',
                }}
              >
                Verwerfen
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={transcribing || busy}
              style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)',
                background: 'transparent', color: 'inherit', fontSize: '0.9rem',
                cursor: transcribing || busy ? 'default' : 'pointer',
                opacity: transcribing || busy ? 0.6 : 1,
              }}
            >
              {transcribing ? 'Wird in Text umgewandelt …' : '🎤 Problem diktieren'}
            </button>
          )}
          <div style={{ marginTop: 4, fontSize: '0.75rem', opacity: 0.7 }}>
            Der gesprochene Text landet im Feld oben — du kannst ihn vor dem Senden ändern.
          </div>
        </div>
      )}

      <div>
        <input
          ref={fileInputRef}
          id="support-files"
          type="file"
          accept="image/*"
          multiple
          onChange={e => addFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={files.length >= MAX_SUPPORT_FILES}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)',
            background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '0.9rem',
          }}
        >
          Screenshot anhängen ({files.length}/{MAX_SUPPORT_FILES})
        </button>
        <div style={{ marginTop: 4, fontSize: '0.75rem', opacity: 0.7 }}>
          Oder mit Strg+V einfügen — ein Ausschnitt aus Win+Shift+S reicht.
        </div>
      </div>

      {files.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                aria-label={`${file.name} entfernen`}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit' }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div role="alert" style={{ color: 'var(--danger, #ef4444)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || isRecording || transcribing || !message.trim()}
        style={{
          padding: '10px 16px', borderRadius: 8, border: 'none',
          background: 'var(--brand, #3180ab)', color: '#fff', cursor: 'pointer',
          fontWeight: 600,
          opacity: busy || isRecording || transcribing || !message.trim() ? 0.6 : 1,
        }}
      >
        {busy ? 'Wird gesendet …' : 'Meldung senden'}
      </button>

      {/* Transparenz: kein verstecktes Sammeln. Der Text ist Teil der
          DSGVO-Antwort (Spec §9) und steht deshalb VOR dem Absenden da. */}
      <div style={{ fontSize: '0.75rem', opacity: 0.7, lineHeight: 1.4 }}>
        Mit deiner Meldung werden die letzten Minuten Aktivität deiner Firma in
        Werkora (wer hat was geändert, aufgetretene Fehler) sowie technische
        Angaben zu deinem Gerät an den Werkora-Support übermittelt.
        {voiceSupported && ' Diktierst du, geht die Aufnahme zur Umwandlung in Text an '
          + 'Mistral (Rechenzentrum Frankreich) und wird nicht gespeichert.'}
      </div>
    </div>
  )
}

import { useRef, useState } from 'react'
import { useVoiceRecorder } from './useVoiceRecorder'

interface Props {
  onSendText: (text: string) => void
  onSendVoice: (blob: Blob) => void
  onSendPhoto?: (file: File) => void
  disabled?: boolean
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function ChatInput({ onSendText, onSendVoice, onSendPhoto, disabled }: Props) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    isRecording, isLocked, seconds,
    startRecording, sendRecording, discardRecording, lockRecording
  } = useVoiceRecorder(onSendVoice)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setText('')
    textareaRef.current?.focus()
  }

  function handlePhotoClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && onSendPhoto) {
      onSendPhoto(file)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  if (isRecording) {
    return (
      <div className="chat-input-bar">
        {/* Verwerfen */}
        <button className="chat-rec-discard" onClick={discardRecording} title="Verwerfen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>

        {/* Timer + Waveform */}
        <div className="chat-rec-bar">
          <span className="chat-rec-dot" />
          <span className="chat-rec-waveform">
            {[1,2,3,4,5,6,7].map(i => (
              <span key={i} className="chat-rec-wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </span>
          <span className="chat-rec-timer">{formatTime(seconds)}</span>
        </div>

        {/* Lock oder Senden */}
        {isLocked ? (
          <button className="chat-send-btn" onClick={sendRecording} title="Senden">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        ) : (
          <button className="chat-rec-lock" onClick={lockRecording} title="Einrasten">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="chat-input-bar">
      {/* Hidden file input for photo capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {/* Camera button — only when no text and photos enabled */}
      {!text.trim() && onSendPhoto && (
        <button
          className="chat-photo-btn"
          onClick={handlePhotoClick}
          title="Foto aufnehmen"
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
      )}
      <textarea
        ref={textareaRef}
        className="chat-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nachricht schreiben…"
        rows={1}
        disabled={disabled}
      />
      {text.trim() ? (
        <button className="chat-send-btn" onClick={submit} disabled={disabled}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      ) : (
        <button
          className="chat-mic-btn"
          onClick={startRecording}
          title="Aufnahme starten"
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
      )}
    </div>
  )
}

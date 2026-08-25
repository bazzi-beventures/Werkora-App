import ReactMarkdown from 'react-markdown'

interface Props {
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
}

export default function MessageBubble({ role, text, transcription, timestamp }: Props) {
  const isUser = role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'msg-row-user' : 'msg-row-bot'}`}>
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-bot'}`}>
        {transcription && (
          <p className="bubble-transcription">🎤 „{transcription}"</p>
        )}
        {/* Nutzer-Eingabe als Klartext (Zeilenumbrueche erhalten); Bot-Antwort
            rendert Markdown (**fett**, Listen) statt rohe Sternchen zu zeigen. */}
        {isUser
          ? <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
          : <div className="chat-md"><ReactMarkdown>{text}</ReactMarkdown></div>}
        <span className="bubble-time">{timestamp}</span>
      </div>
    </div>
  )
}

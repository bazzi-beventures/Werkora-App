import { useRef, useState, useEffect } from 'react'

const MAX_DURATION_MS = 120_000
const MIN_DURATION_MS = 500

/** Warum eine Aufnahme gar nicht erst begann. */
export type VoiceRecorderError = 'unsupported' | 'denied'

/**
 * Läuft die Aufnahme in diesem Browser überhaupt?
 *
 * `getUserMedia` fehlt in unsicherem Kontext (http://…) komplett, `MediaRecorder`
 * auf älteren iOS-Fassungen. Ein Mikrofon-Knopf, der beim Tippen nichts tut, ist
 * schlimmer als keiner — Aufrufer blenden ihn damit aus.
 */
export function isVoiceRecordingSupported(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
}

export function useVoiceRecorder(
  onAudioReady: (blob: Blob) => void,
  onError?: (reason: VoiceRecorderError) => void,
) {
  const [isRecording, setIsRecording] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const discardedRef = useRef(false)

  // Tick the timer while recording
  useEffect(() => {
    if (isRecording) {
      setSeconds(0)
      intervalRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setSeconds(0)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRecording])

  async function startRecording() {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      discardedRef.current = false
      startTimeRef.current = Date.now()

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        if (discardedRef.current) return
        const actualType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: actualType })
        if (blob.size > 0) onAudioReady(blob)
      }

      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
      setIsLocked(false)

      autoStopRef.current = setTimeout(sendRecording, MAX_DURATION_MS)
    } catch {
      // Kein Mikrofon, verweigerte Freigabe oder unsicherer Kontext. Der Chat
      // lässt das stumm (der Knopf federt zurück); wer `onError` mitgibt, kann
      // es dem Nutzer sagen, statt ihn zweimal vergeblich drücken zu lassen.
      onError?.(isVoiceRecordingSupported() ? 'denied' : 'unsupported')
    }
  }

  function _stopMediaRecorder() {
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    setIsRecording(false)
    setIsLocked(false)
  }

  function sendRecording() {
    const elapsed = Date.now() - startTimeRef.current
    if (elapsed < MIN_DURATION_MS) {
      setTimeout(() => {
        discardedRef.current = false
        _stopMediaRecorder()
      }, MIN_DURATION_MS - elapsed)
      return
    }
    discardedRef.current = false
    _stopMediaRecorder()
  }

  function discardRecording() {
    discardedRef.current = true
    _stopMediaRecorder()
  }

  function lockRecording() {
    setIsLocked(true)
  }

  return { isRecording, isLocked, seconds, startRecording, sendRecording, discardRecording, lockRecording }
}

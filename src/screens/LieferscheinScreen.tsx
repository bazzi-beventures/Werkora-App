import { useEffect, useRef, useState } from 'react'
import { ApiError, isNetworkError } from '../api/client'
import {
  assignLieferschein,
  lieferscheinBildUrl,
  listMeineLieferscheine,
  uploadLieferschein,
  type LieferscheinEintrag,
  type LieferscheinProjekt,
} from '../api/lieferscheine'
import { enqueueLieferschein, pendingLieferscheine, sendeWartendeLieferscheine } from '../api/lieferscheinQueue'
import LieferscheinProjektAuswahl from '../shared/LieferscheinProjektAuswahl'
import { useOnline } from '../shared/useOnline'

/**
 * «Lieferschein» in der Mitarbeiter-App — docs/specs/lieferschein-erfassung.md §4.
 *
 * Foto → Senden (liegt damit im Eingang, geht also nicht mehr verloren) →
 * Projekt antippen. Wer das Projekt nicht kennt, tippt «Weiss nicht → ans
 * Büro»: der Lieferschein bleibt im Eingang, und das Büro ordnet zu. Zugeordnet
 * wird nie ohne diesen Tipp — die Vorschläge sind Vorschläge.
 *
 * Ohne Netz (§3.4) geht das Foto in den Puffer (`lieferscheinQueue.ts`) und wird
 * gesendet, sobald wieder Netz da ist — dann ohne Zuordnung, also in den Eingang.
 *
 * Beim Zuordnen und unter «Meine Lieferscheine» steht das Foto selbst dabei:
 * wer später einen offenen Eintrag antippt, muss sehen, welcher Lieferschein es
 * war (Rückmeldung 2026-10-26).
 */

interface Props {
  userId: string
  logoUrl?: string
  onBack: () => void
  onLoggedOut: () => void
}

type Schritt =
  | { art: 'start' }
  | { art: 'vorschau'; file: File; url: string }
  | { art: 'zuordnen'; entryId: string; mime: string | null; candidates: LieferscheinProjekt[] }
  | { art: 'ansehen'; eintrag: LieferscheinEintrag }
  | { art: 'fertig'; projekt: LieferscheinProjekt | null }
  | { art: 'gepuffert' }

const PUFFER_FEHLER = {
  full: 'Es warten schon zu viele Lieferscheine auf Netz. Bitte zuerst online senden.',
  too_large: 'Die Datei ist zu gross.',
  unavailable: 'Der Lieferschein konnte auf dem Gerät nicht gespeichert werden. Bitte online erneut versuchen.',
} as const

const FEHLER: Record<number, string> = {
  400: 'Das ist kein Foto oder PDF.',
  403: 'Diesem Projekt kannst du keinen Lieferschein zuordnen.',
  404: 'Diesen Lieferschein oder dieses Projekt gibt es nicht (mehr).',
  409: 'Dieser Lieferschein ist schon zugeordnet.',
  429: 'Gerade sehr viele Lieferscheine auf einmal. Bitte in ein paar Minuten erneut senden.',
}

/** Das Foto eines Eintrags vom Server — mit sichtbarem Laden und Fehler. */
function LieferscheinBild({ entryId, mime, alt }: { entryId: string; mime: string | null; alt: string }) {
  const [stand, setStand] = useState<'laedt' | 'da' | 'fehler'>('laedt')
  const url = lieferscheinBildUrl(entryId)
  if (mime === 'application/pdf') {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
        PDF öffnen
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title="In voller Grösse öffnen"
       style={{ display: 'block', position: 'relative' }}>
      {stand === 'laedt' && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Foto wird geladen…</div>
      )}
      {stand === 'fehler' && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--accent-red, #ef4444)', padding: '8px 0' }}>
          Das Foto konnte nicht geladen werden.
        </div>
      )}
      <img
        src={url}
        alt={alt}
        onLoad={() => setStand('da')}
        onError={() => setStand('fehler')}
        style={{
          display: stand === 'fehler' ? 'none' : 'block',
          width: '100%', maxHeight: '40vh', objectFit: 'contain', borderRadius: 8,
          border: '1px solid var(--border, #e5e7eb)',
        }}
      />
    </a>
  )
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function LieferscheinScreen({ userId, logoUrl, onBack, onLoggedOut }: Props) {
  const [schritt, setSchritt] = useState<Schritt>({ art: 'start' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meine, setMeine] = useState<LieferscheinEintrag[] | null>(null)
  const [wartend, setWartend] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const online = useOnline()

  function fehler(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
    setError(err instanceof ApiError ? (FEHLER[err.status] ?? fallback) : fallback)
  }

  async function ladeMeine() {
    try {
      setMeine(await listMeineLieferscheine())
    } catch {
      setMeine(null)
    }
  }

  useEffect(() => { void ladeMeine() }, [])

  // Netz-Moment: Wartendes senden. App.tsx tut das auch beim `online`-Ereignis —
  // der Puffer sperrt einen zweiten, gleichzeitigen Lauf selbst.
  useEffect(() => {
    let aktiv = true
    void (async () => {
      if (online) {
        const res = await sendeWartendeLieferscheine(userId)
        if (!aktiv) return
        setWartend(res.remaining)
        if (res.sent > 0) void ladeMeine()
      } else {
        const n = (await pendingLieferscheine(userId)).length
        if (aktiv) setWartend(n)
      }
    })()
    return () => { aktiv = false }
  }, [online, userId])

  // Das Vorschaubild ist eine Object-URL: freigeben, sobald sie nicht mehr gezeigt wird.
  useEffect(() => {
    if (schritt.art !== 'vorschau') return
    const url = schritt.url
    return () => URL.revokeObjectURL(url)
  }, [schritt])

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setSchritt({ art: 'vorschau', file, url: URL.createObjectURL(file) })
  }

  async function puffern(file: File) {
    const res = await enqueueLieferschein(userId, file)
    if (res === 'queued') {
      setWartend(n => n + 1)
      setSchritt({ art: 'gepuffert' })
    } else {
      setError(PUFFER_FEHLER[res])
    }
  }

  async function senden(file: File) {
    setBusy(true)
    setError(null)
    try {
      if (!online) { await puffern(file); return }
      const res = await uploadLieferschein(file, file.name || 'lieferschein.jpg')
      setSchritt({ art: 'zuordnen', entryId: res.inbox_id, mime: res.entry?.mime_type ?? file.type ?? null, candidates: res.candidates })
      void ladeMeine()
    } catch (err) {
      // Funkloch zwischen Antippen und Antwort: nicht scheitern, sondern puffern.
      if (isNetworkError(err)) await puffern(file)
      else fehler(err, 'Der Lieferschein konnte nicht gesendet werden. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  async function zuordnen(entryId: string, p: LieferscheinProjekt) {
    setBusy(true)
    setError(null)
    try {
      const res = await assignLieferschein(entryId, p.project_id)
      setSchritt({ art: 'fertig', projekt: res.project ?? p })
      void ladeMeine()
    } catch (err) {
      fehler(err, 'Das Zuordnen hat nicht geklappt. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  const offene = (meine ?? []).filter(e => e.status === 'offen')
  const erledigte = (meine ?? []).filter(e => e.status === 'zugeordnet')

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div className="inner-title">Lieferschein</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={onFile}
          style={{ display: 'none' }}
          data-testid="ls-input"
        />
        {error && <div role="alert" style={{ fontSize: 13.5, color: 'var(--accent-red, #ef4444)' }}>{error}</div>}

        {schritt.art === 'start' && (
          <>
            <button className="btn-primary" style={{ marginTop: 0 }} onClick={() => inputRef.current?.click()}>
              Lieferschein fotografieren
            </button>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {online
                ? 'Danach wählst du das Projekt. Weisst du es nicht, ordnet das Büro zu.'
                : 'Kein Netz: der Lieferschein wird gespeichert und gesendet, sobald du online bist.'}
            </div>
            {wartend > 0 && (
              <div role="status" style={{ fontSize: 13 }}>
                {wartend === 1 ? '1 Lieferschein wartet' : `${wartend} Lieferscheine warten`} auf Netz.
              </div>
            )}
          </>
        )}

        {schritt.art === 'vorschau' && (
          <>
            {schritt.file.type === 'application/pdf' ? (
              <div style={{ fontSize: 14 }}>PDF: {schritt.file.name}</div>
            ) : (
              <img src={schritt.url} alt="Vorschau des Lieferscheins"
                   style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 8 }} />
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ marginTop: 0 }} disabled={busy}
                      onClick={() => void senden(schritt.file)}>
                {busy ? 'Sendet…' : 'Senden'}
              </button>
              <button className="btn-secondary" style={{ marginTop: 0 }} disabled={busy}
                      onClick={() => inputRef.current?.click()}>
                Neu aufnehmen
              </button>
            </div>
          </>
        )}

        {schritt.art === 'zuordnen' && (
          <>
            <div style={{ fontSize: 14 }}>
              Gesendet. <strong>Zu welchem Projekt gehört der Lieferschein?</strong>
            </div>
            <LieferscheinBild entryId={schritt.entryId} mime={schritt.mime} alt="Foto des Lieferscheins" />
            <LieferscheinProjektAuswahl
              candidates={schritt.candidates}
              busy={busy}
              onPick={p => void zuordnen(schritt.entryId, p)}
            />
            <button className="btn-secondary" disabled={busy}
                    onClick={() => setSchritt({ art: 'fertig', projekt: null })}>
              Weiss nicht → ans Büro
            </button>
          </>
        )}

        {schritt.art === 'ansehen' && (
          <>
            <div style={{ fontSize: 14.5 }}>
              {schritt.eintrag.assigned_project
                ? <>Liegt bei <strong>{schritt.eintrag.assigned_project.number} {schritt.eintrag.assigned_project.name}</strong>.</>
                : 'Zugeordnet.'}
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                Fotografiert {fmtWhen(schritt.eintrag.created_at)}
              </div>
            </div>
            <LieferscheinBild entryId={schritt.eintrag.id} mime={schritt.eintrag.mime_type}
                              alt={`Lieferschein vom ${fmtWhen(schritt.eintrag.created_at)}`} />
            <button className="btn-secondary" style={{ marginTop: 0 }}
                    onClick={() => setSchritt({ art: 'start' })}>
              Zurück
            </button>
          </>
        )}

        {schritt.art === 'fertig' && (
          <>
            <div role="status" style={{ fontSize: 14.5 }}>
              {schritt.projekt
                ? <>Liegt jetzt bei <strong>{schritt.projekt.number} {schritt.projekt.name}</strong>.</>
                : 'Liegt im Eingang — das Büro ordnet ihn zu.'}
            </div>
            <button className="btn-primary" style={{ marginTop: 0 }}
                    onClick={() => { setSchritt({ art: 'start' }); inputRef.current?.click() }}>
              Nächster Lieferschein
            </button>
          </>
        )}

        {schritt.art === 'gepuffert' && (
          <>
            <div role="status" style={{ fontSize: 14.5 }}>
              Lieferschein gespeichert, wird gesendet, sobald du online bist.
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Er landet dann im Eingang des Büros. Das Projekt kannst du danach unter
              «Meine Lieferscheine» selbst wählen.
            </div>
            <button className="btn-primary" style={{ marginTop: 0 }}
                    onClick={() => { setSchritt({ art: 'start' }); inputRef.current?.click() }}>
              Nächster Lieferschein
            </button>
          </>
        )}

        {schritt.art === 'start' && meine && (offene.length > 0 || erledigte.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Meine Lieferscheine</div>
            {offene.map(e => (
              <button key={e.id} type="button" className="menu-item"
                      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2, textAlign: 'left' }}
                      onClick={() => setSchritt({ art: 'zuordnen', entryId: e.id, mime: e.mime_type, candidates: e.candidates })}>
                <span style={{ fontWeight: 600 }}>Noch ohne Projekt · {fmtWhen(e.created_at)}</span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Antippen, um ein Projekt zu wählen</span>
              </button>
            ))}
            {erledigte.map(e => (
              <button key={e.id} type="button" className="menu-item"
                      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2, textAlign: 'left' }}
                      onClick={() => { setError(null); setSchritt({ art: 'ansehen', eintrag: e }) }}>
                <span style={{ fontWeight: 600 }}>
                  {e.assigned_project ? `${e.assigned_project.number} ${e.assigned_project.name}` : 'Zugeordnet'}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{fmtWhen(e.created_at)} · Foto ansehen</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useRef, useState } from 'react'
import { uploadKreditoren, type KreditorUploadFehler } from '../../api/kreditoren'

/**
 * Lieferantenrechnungen hochladen — Spec §4.2, der Hauptweg. Mehrere Dateien auf
 * einmal, per Auswahl oder Drag & Drop. Was der Server nicht annimmt (Dublette,
 * falsches Format, Bremse), steht danach sichtbar über der Liste — bei einer
 * Dublette mit Link auf die schon erfasste Rechnung.
 */

export const KREDITOR_ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif'

interface Props {
  /** Nach dem Upload: Liste neu laden, ggf. die einzige neue Rechnung öffnen. */
  onUploaded: (neueIds: string[]) => void
  onOpen: (id: string) => void
}

export default function KreditorUpload({ onUploaded, onOpen }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<KreditorUploadFehler[]>([])
  const [allgemein, setAllgemein] = useState<string | null>(null)

  async function hochladen(files: File[]) {
    if (!files.length || busy) return
    setBusy(true)
    setFehler([])
    setAllgemein(null)
    try {
      const res = await uploadKreditoren(files)
      setFehler(res.fehler ?? [])
      onUploaded((res.bills ?? []).map(b => b.id))
    } catch (e) {
      setAllgemein(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        className={`kred-upload${drag ? ' drag' : ''}${busy ? ' busy' : ''}`}
        onClick={() => { if (!busy) inputRef.current?.click() }}
        onDragOver={e => { e.preventDefault(); if (!busy) setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault()
          setDrag(false)
          void hochladen(Array.from(e.dataTransfer.files || []))
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={KREDITOR_ACCEPT}
          style={{ display: 'none' }}
          data-testid="kred-upload-input"
          onChange={e => {
            const files = e.target.files ? Array.from(e.target.files) : []
            e.target.value = ''
            void hochladen(files)
          }}
        />
        <span>
          {busy ? 'Wird hochgeladen…' : drag ? 'Rechnungen hier ablegen' : 'Rechnungen hierher ziehen oder klicken (PDF, JPG, PNG, HEIC)'}
        </span>
        <button type="button" className="admin-btn admin-btn-primary admin-btn-sm" disabled={busy}
                onClick={e => { e.stopPropagation(); inputRef.current?.click() }}>
          + Rechnungen hochladen
        </button>
      </div>
      {(allgemein || fehler.length > 0) && (
        <div className="kred-upload-fehler" role="alert">
          {allgemein ?? 'Nicht alle Dateien wurden übernommen:'}
          {fehler.length > 0 && (
            <ul>
              {fehler.map((f, i) => (
                <li key={`${f.datei}-${i}`}>
                  <strong>{f.datei}</strong>: {f.grund}
                  {f.bill_id && (
                    <>
                      {' '}
                      <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => onOpen(f.bill_id!)}>
                        Vorhandene Rechnung öffnen
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginTop: 6 }}
                  onClick={() => { setFehler([]); setAllgemein(null) }}>
            Schliessen
          </button>
        </div>
      )}
    </>
  )
}

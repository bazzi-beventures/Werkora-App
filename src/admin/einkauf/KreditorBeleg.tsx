import { useEffect, useState } from 'react'
import { holeKreditorDatei } from '../../api/kreditoren'

/**
 * Der Beleg einer Lieferantenrechnung — links neben den Feldern (Desktop) bzw.
 * als Knopf «Beleg öffnen» (Handy, Spec §8.1).
 *
 * Geholt als Blob mit Cookie-Auth und als `blob:`-URL gezeigt: eine direkte
 * Backend-URL bliebe im `<iframe>` grau (`X-Frame-Options: DENY`, siehe
 * apiTextFetch in api/client.ts). Am Handy dieselbe URL als Link — ein
 * `window.open` nach dem `await` hielte der Popup-Blocker auf.
 */

interface Props {
  billId: string
  mimeType: string | null
  fileName: string | null
  /** Handy: Knopf statt eingebetteter Vorschau. */
  alsLink: boolean
}

type Zustand = { url: string; typ: string } | 'laden' | 'fehler'

export default function KreditorBeleg({ billId, mimeType, fileName, alsLink }: Props) {
  const [zustand, setZustand] = useState<Zustand>('laden')

  useEffect(() => {
    let aktiv = true
    let url: string | null = null
    holeKreditorDatei(billId)
      .then(blob => {
        if (!aktiv) return
        if (typeof URL.createObjectURL !== 'function') { setZustand('fehler'); return }
        url = URL.createObjectURL(blob)
        setZustand({ url, typ: blob.type || mimeType || '' })
      })
      .catch(() => { if (aktiv) setZustand('fehler') })
    return () => {
      aktiv = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [billId, mimeType])

  const name = fileName || 'Beleg'

  if (alsLink) {
    if (zustand === 'laden') {
      return <button type="button" className="admin-btn admin-btn-secondary" disabled>Beleg wird geladen…</button>
    }
    if (zustand === 'fehler') {
      return <div className="admin-form-hint">Der Beleg konnte nicht geladen werden.</div>
    }
    return (
      <a className="admin-btn admin-btn-secondary" href={zustand.url} target="_blank" rel="noreferrer"
         download={zustand.typ.startsWith('image/') || zustand.typ === 'application/pdf' ? undefined : name}>
        Beleg öffnen
      </a>
    )
  }

  return (
    <div className="kred-beleg">
      {zustand === 'laden' && <div className="kred-beleg-leer"><div className="admin-spinner" /> Beleg wird geladen…</div>}
      {zustand === 'fehler' && <div className="kred-beleg-leer">Der Beleg konnte nicht geladen werden.</div>}
      {typeof zustand === 'object' && (
        // HEIC zeigt ausser Safari kein Browser an — dann der Link.
        zustand.typ.startsWith('image/') && !/hei[cf]/.test(zustand.typ)
          ? <img src={zustand.url} alt={name} />
          : zustand.typ === 'application/pdf'
            ? <iframe src={zustand.url} title={name} />
            : (
              <div className="kred-beleg-leer">
                <a href={zustand.url} download={name}>{name} herunterladen</a>
              </div>
            )
      )}
    </div>
  )
}

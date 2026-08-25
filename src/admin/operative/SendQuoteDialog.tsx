import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../../api/client'
import { getQuoteSendAttachments, sendQuote } from '../../api/admin/quotes'
import type { SendAttachmentsInfo } from '../../api/admin/quotes'
import { uploadProjectFile } from '../../api/admin/projects'
import { backdropCloseProps } from '../../shared/backdropClose'

interface Props {
  quoteId: number
  header: React.ReactNode
  defaultEmail?: string
  onClose: () => void
  onSent: (email: string) => void
}

const EMPTY_INFO: SendAttachmentsInfo = {
  enabled: false, fotos_enabled: false, project_id: null,
  projekt_anhaenge: [], vorlagen: [], projekt_fotos: [],
}

// Eine Adress-Zeile unter dem Standard-Empfänger: Eingabefeld + Entfernen-Knopf.
// `prefix` markiert CC-Zeilen sichtbar, damit man sie in der Liste nicht mit einem
// weiteren Haupt-Empfänger verwechselt.
function EmailRow({ value, label, prefix, disabled, onChange, onRemove }: {
  value: string
  label: string
  prefix?: string
  disabled: boolean
  onChange: (v: string) => void
  onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      {prefix && (
        <span style={{ fontSize: 12, color: 'var(--muted)', width: 24, flexShrink: 0 }}>{prefix}</span>
      )}
      <input
        className="admin-form-input"
        style={{ flex: 1, minWidth: 0 }}
        type="email"
        value={value}
        aria-label={label}
        placeholder="weitere@example.com"
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      <button
        type="button"
        className="admin-btn admin-btn-danger admin-btn-sm"
        title="Entfernen"
        aria-label={`${label} entfernen`}
        disabled={disabled}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  )
}

// Gemeinsamer Versand-Dialog für Offerten (Offerten-Liste + Projekt-Detail) mit
// vier Anhang-Quellen: Projekt-Anhänge (Dokumente → Anhänge), direkt gewählte
// Dateien (werden beim Senden als Projekt-Anhang hochgeladen), mandantenweite
// Vorlagen (Standard-Anhänge, z.B. AGB oder Produkt-Prospekte) und die
// Projekt-Fotos (Dokumente → Fotos).
export function SendQuoteDialog({ quoteId, header, defaultEmail, onClose, onSent }: Props) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  // Weitere Empfänger und CC: eine Offerte geht oft an mehrere Parteien desselben
  // Vorgangs (Bauherr, Architekt, Verwaltung). Weitere Empfänger stehen dem Kunden
  // gleich — ein Mail an alle, sie sehen einander. CC-Adressen sind Mitleser: der
  // Server schickt ihnen eine eigene Kopie mit der Offerte im Anhang, aber ohne
  // Annehmen/Ablehnen — annehmen darf nur, wer die Offerte auch bekommen hat.
  // Die Standard-Adresse oben bleibt das Pflichtfeld; diese Listen sind leer, bis
  // jemand auf «+» klickt.
  const [extraEmails, setExtraEmails] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState<SendAttachmentsInfo>(EMPTY_INFO)
  const [selectedAnhaenge, setSelectedAnhaenge] = useState<Set<string>>(new Set())
  const [selectedVorlagen, setSelectedVorlagen] = useState<Set<string>>(new Set())
  const [selectedFotos, setSelectedFotos] = useState<Set<string>>(new Set())
  const [directFiles, setDirectFiles] = useState<File[]>([])
  const [vorlagenSearch, setVorlagenSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getQuoteSendAttachments(quoteId)
      .then(i => {
        setInfo(i)
        // Projekt-Anhänge sind standardmässig alle angehakt (einzelne abwählbar);
        // Vorlagen bewusst NICHT vorausgewählt — die wählt der Admin gezielt aus.
        setSelectedAnhaenge(new Set(i.projekt_anhaenge.map(a => a.id)))
      })
      .catch(() => {
        // Anhang-Infos sind optional — bei Fehler bleibt der Versand ohne Zusatz-Anhang möglich.
      })
  }, [quoteId])

  function toggleAnhang(id: string) {
    setSelectedAnhaenge(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleVorlage(id: string) {
    setSelectedVorlagen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleFoto(id: string) {
    setSelectedFotos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length > 0) {
      setDirectFiles(prev => {
        // Doppelte Auswahl (gleicher Name + gleiche Grösse) still ignorieren.
        const next = [...prev]
        for (const f of picked) {
          if (!next.some(x => x.name === f.name && x.size === f.size)) next.push(f)
        }
        return next
      })
    }
    // Zurücksetzen, damit dieselbe Datei nach dem Entfernen erneut wählbar ist.
    e.target.value = ''
  }

  function removeDirectFile(i: number) {
    setDirectFiles(prev => prev.filter((_, j) => j !== i))
  }

  async function handleSend() {
    if (!email) return
    setSending(true)
    setError('')
    try {
      // Direkt gewählte Dateien zuerst als Projekt-Dateien (Kategorie 'anhang')
      // hochladen — so landen sie dauerhaft beim Projekt unter Dokumente → Anhänge
      // und werden wie die übrigen Projekt-Anhänge mitversendet.
      const uploadedIds: string[] = []
      if (info.project_id) {
        for (const f of directFiles) {
          const res = await uploadProjectFile(info.project_id, f, 'anhang')
          if (res.file) uploadedIds.push(res.file.id)
        }
      }
      await sendQuote({
        quoteId,
        recipientEmail: email,
        // Leere Zeilen mitschicken wäre unsauber — wer «+» drückt und nichts
        // einträgt, hat keinen Empfänger gemeint. Der Server wirft sie ohnehin raus.
        additionalRecipients: extraEmails.map(e => e.trim()).filter(Boolean),
        ccRecipients: ccEmails.map(e => e.trim()).filter(Boolean),
        anhangFileIds: [...selectedAnhaenge, ...uploadedIds],
        vorlageAttachmentIds: [...selectedVorlagen],
        fotoFileIds: [...selectedFotos],
      })
      onSent(email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      setSending(false)
    }
  }

  const search = vorlagenSearch.trim().toLowerCase()
  const filteredVorlagen = search
    ? info.vorlagen.filter(v => v.filename.toLowerCase().includes(search))
    : info.vorlagen

  return (
    // Backdrop-Klick schliesst (drag-sicher, wie im SendQuoteMailDialog) — während
    // des Versands bleibt der Dialog stehen.
    <div className="admin-confirm-overlay" {...backdropCloseProps(() => { if (!sending) onClose() })}>
      <div className="admin-confirm-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="admin-confirm-title">Offerte senden</div>
        <div className="admin-confirm-text" style={{ marginBottom: 12 }}>{header}</div>

        <div style={{ marginBottom: 12 }}>
          <label className="admin-form-label">Empfänger E-Mail</label>
          <input
            className="admin-form-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="kunde@example.com"
          />

          {extraEmails.map((v, i) => (
            <EmailRow
              key={`to-${i}`}
              value={v}
              label={`Weiterer Empfänger ${i + 1}`}
              disabled={sending}
              onChange={next => setExtraEmails(prev => prev.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setExtraEmails(prev => prev.filter((_, j) => j !== i))}
            />
          ))}
          {ccEmails.map((v, i) => (
            <EmailRow
              key={`cc-${i}`}
              value={v}
              label={`CC ${i + 1}`}
              prefix="CC"
              disabled={sending}
              onChange={next => setCcEmails(prev => prev.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setCcEmails(prev => prev.filter((_, j) => j !== i))}
            />
          ))}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              disabled={sending}
              onClick={() => setExtraEmails(prev => [...prev, ''])}
            >
              + Empfänger
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              disabled={sending}
              onClick={() => setCcEmails(prev => [...prev, ''])}
            >
              + CC
            </button>
          </div>
          {(extraEmails.length > 0 || ccEmails.length > 0) && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              {extraEmails.length > 0 && (
                <div>Empfänger erhalten dieselbe Mail mit Annehmen/Ablehnen und sehen einander.</div>
              )}
              {ccEmails.length > 0 && (
                <div style={{ marginTop: extraEmails.length > 0 ? 4 : 0 }}>
                  CC erhält eine separate Kopie mit der Offerte im Anhang — ohne Annehmen/Ablehnen.
                </div>
              )}
            </div>
          )}
        </div>

        {info.enabled && info.projekt_anhaenge.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label">Anhänge aus dem Projekt</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {info.projekt_anhaenge.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedAnhaenge.has(a.id)} onChange={() => toggleAnhang(a.id)} />
                  {a.filename}
                </label>
              ))}
            </div>
          </div>
        )}

        {info.enabled && info.project_id && (
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label">Datei direkt anhängen</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={handlePickFiles}
            />
            {directFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, marginBottom: 8 }}>
                {directFiles.map((f, i) => (
                  <div key={`${f.name}-${f.size}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      onClick={() => removeDirectFile(i)}
                      title="Entfernen"
                      aria-label="Datei entfernen"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="admin-btn admin-btn-secondary admin-btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
            >
              + Datei wählen
            </button>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              Wird zusätzlich beim Projekt unter Dokumente → Anhänge für Offerte abgelegt.
            </div>
          </div>
        )}

        {info.fotos_enabled && info.projekt_fotos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="admin-form-label">
                Fotos aus dem Projekt
                {selectedFotos.size > 0 && (
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {selectedFotos.size} gewählt</span>
                )}
              </label>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() => setSelectedFotos(
                  selectedFotos.size === info.projekt_fotos.length
                    ? new Set()
                    : new Set(info.projekt_fotos.map(f => f.id)),
                )}
              >
                {selectedFotos.size === info.projekt_fotos.length ? 'Alle abwählen' : 'Alle wählen'}
              </button>
            </div>
            {/* Vorschau statt blosser Dateiname: „IMG_4711.jpg" sagt niemandem, was
                der Kunde zu sehen bekommt. Bewusst nichts vorausgewählt. */}
            <div className="quote-foto-grid">
              {info.projekt_fotos.map(f => {
                const active = selectedFotos.has(f.id)
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`quote-foto-tile${active ? ' active' : ''}`}
                    onClick={() => toggleFoto(f.id)}
                    title={f.filename}
                    aria-pressed={active}
                    aria-label={f.filename}
                  >
                    <img src={apiUrl(`/pwa/admin/project-files/${f.id}/download`)} alt="" loading="lazy" />
                    <span className="quote-foto-check" aria-hidden="true">{active ? '✓' : ''}</span>
                    <span className="quote-foto-name">{f.filename}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              Gewählte Fotos gehen mit der Offerte an den Kunden — für den Versand automatisch verkleinert.
            </div>
          </div>
        )}

        {info.enabled && info.vorlagen.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label className="admin-form-label">Standard-Anhänge (Vorlagen)</label>
            {info.vorlagen.length > 5 && (
              <input
                className="admin-form-input"
                style={{ marginTop: 4 }}
                placeholder="Suchen…"
                value={vorlagenSearch}
                onChange={e => setVorlagenSearch(e.target.value)}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {filteredVorlagen.length === 0 ? (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Treffer.</span>
              ) : filteredVorlagen.map(v => (
                <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedVorlagen.has(v.id)} onChange={() => toggleVorlage(v.id)} />
                  {v.filename}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="admin-confirm-actions">
          <button className="admin-btn admin-btn-secondary" onClick={onClose} disabled={sending}>Abbrechen</button>
          <button className="admin-btn admin-btn-primary" onClick={handleSend} disabled={!email || sending}>
            {sending ? 'Wird gesendet…' : 'Offerte senden'}
          </button>
        </div>
      </div>
    </div>
  )
}

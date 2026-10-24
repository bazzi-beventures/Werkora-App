import { useEffect, useState } from 'react'
import {
  assignLieferschein,
  lieferscheinBildUrl,
  listLieferscheinEingang,
  verwerfeLieferschein,
  type LieferscheinEintrag,
  type LieferscheinProjekt,
} from '../../api/lieferscheine'
import LieferscheinProjektAuswahl from '../../shared/LieferscheinProjektAuswahl'
import { useToast, ToastHost } from '../components/useToast'

/**
 * «Lieferschein-Eingang» des Büros — docs/specs/lieferschein-erfassung.md §3.3.
 *
 * Hier landet, was in der Mitarbeiter-App fotografiert, aber keinem Projekt
 * zugeordnet wurde («Weiss nicht → ans Büro», kein Treffer, offline gesendet).
 * Älteste zuerst: was am längsten liegt, gehört zuerst weg. Verwerfen nur mit
 * Rückfrage — es löscht das Bild.
 */

interface Props {
  /** Nach Zuordnen/Verwerfen: Zahl am Navigationspunkt neu laden. */
  onChanged?: () => void
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function DeliveryNotesScreen({ onChanged }: Props) {
  const [entries, setEntries] = useState<LieferscheinEintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [offen, setOffen] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  async function load() {
    setLoading(true)
    try {
      setEntries(await listLieferscheinEingang())
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function weg(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
    setOffen(null)
    onChanged?.()
  }

  async function zuordnen(e: LieferscheinEintrag, p: LieferscheinProjekt) {
    setActing(e.id)
    try {
      await assignLieferschein(e.id, p.project_id)
      showToast(`Lieferschein bei ${p.number} ${p.name} abgelegt`, 'success')
      weg(e.id)
    } catch {
      showToast('Zuordnen fehlgeschlagen', 'error')
      void load()
    } finally {
      setActing(null)
    }
  }

  async function verwerfen(id: string) {
    setActing(id)
    setConfirmDiscard(null)
    try {
      await verwerfeLieferschein(id)
      showToast('Lieferschein verworfen', 'success')
      weg(id)
    } catch {
      showToast('Verwerfen fehlgeschlagen', 'error')
      void load()
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Lieferschein-Eingang</div>
          <div className="admin-page-subtitle">
            {loading ? 'Laden…' : `${entries.length} ohne Projekt`}
          </div>
        </div>
      </div>

      <div className="admin-table-wrap" style={{ padding: 16 }}>
        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : failed ? (
          <div role="alert" className="admin-table-empty">Der Eingang konnte nicht geladen werden.</div>
        ) : entries.length === 0 ? (
          <div className="admin-table-empty">Alles zugeordnet — kein Lieferschein wartet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {entries.map(e => (
              <div key={e.id} style={{
                display: 'flex', flexWrap: 'wrap', gap: 16,
                borderBottom: '1px solid var(--border)', paddingBottom: 16,
              }}>
                <a href={lieferscheinBildUrl(e.id)} target="_blank" rel="noreferrer"
                   style={{ flex: '0 0 auto' }} title="In voller Grösse öffnen">
                  {e.mime_type === 'application/pdf' ? (
                    <div style={{
                      width: 160, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid var(--border)', borderRadius: 8,
                    }}>PDF</div>
                  ) : (
                    <img src={lieferscheinBildUrl(e.id)} alt={`Lieferschein vom ${fmtWhen(e.created_at)}`}
                         loading="lazy"
                         style={{ width: 160, height: 200, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  )}
                </a>
                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.uploaded_by_name || 'Unbekannt'}</div>
                    <div className="admin-form-hint">{fmtWhen(e.created_at)}</div>
                  </div>
                  {offen === e.id ? (
                    <LieferscheinProjektAuswahl
                      candidates={e.candidates}
                      busy={acting === e.id}
                      onPick={p => void zuordnen(e, p)}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {e.candidates.map(p => (
                        <button key={p.project_id} className="admin-btn admin-btn-primary admin-btn-sm"
                                disabled={acting === e.id} onClick={() => void zuordnen(e, p)}>
                          → {p.number} {p.name}
                        </button>
                      ))}
                      <button className="admin-btn admin-btn-secondary admin-btn-sm"
                              disabled={acting === e.id} onClick={() => setOffen(e.id)}>
                        Projekt wählen
                      </button>
                    </div>
                  )}
                  <div>
                    {confirmDiscard === e.id ? (
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 13 }}>Bild löschen?</span>
                        <button className="admin-btn admin-btn-danger admin-btn-sm"
                                disabled={acting === e.id} onClick={() => void verwerfen(e.id)}>
                          Ja, verwerfen
                        </button>
                        <button className="admin-btn admin-btn-secondary admin-btn-sm"
                                onClick={() => setConfirmDiscard(null)}>
                          Abbrechen
                        </button>
                      </span>
                    ) : (
                      <button className="admin-btn admin-btn-secondary admin-btn-sm"
                              disabled={acting === e.id} onClick={() => setConfirmDiscard(e.id)}>
                        Verwerfen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ToastHost toast={toast} />
    </div>
  )
}

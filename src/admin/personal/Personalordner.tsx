// Personalordner im Mitarbeiter-Formular (WW-106, docs/specs/personalordner.md).
//
// Vier Register — MA-Gespräche, Vertrag/Unterschriften, Versicherungen, Zertifikate —
// mit Hochladen, Ansehen (über den Backend-Proxy) und Löschen. Sichtbar nur für
// Manager und Manager light, wenn der Betrieb das Feature eingeschaltet hat; das Backend prüft dasselbe
// (`require_personalordner`, `require_feature`). Jeder Abruf steht im Zugriffsprotokoll.
//
// Lesen über TanStack Query mit dem gemeinsamen Client (Wurzel-CLAUDE.md,
// «Datenzugriff im Frontend»); nach Hochladen/Löschen wird die Abfrage verworfen.
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../../shared/queryClient'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useTabStrip } from '../hooks/useTabStrip'
import { fmtDate } from '../utils/format'
import {
  PERSONAL_REGISTER, PERSONALORDNER_ACCEPT, deleteStaffFile, listStaffFiles, staffFileUrl,
  uploadStaffFile, type PersonalDatei, type PersonalRegister,
} from '../../api/admin/personalordner'

const key = (staffId: string) => ['personalordner', staffId] as const

function groesse(bytes: number | null | undefined): string {
  if (!bytes) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function Personalordner({ staffId }: { staffId: string }) {
  const [register, setRegister] = useState<PersonalRegister>('gespraech')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')
  const [loeschen, setLoeschen] = useState<PersonalDatei | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const tabsRef = useTabStrip(register)

  const { data, isLoading, isError } = useQuery({
    queryKey: key(staffId),
    queryFn: () => listStaffFiles(staffId),
  }, queryClient)
  const dateien = data ?? []
  const imRegister = dateien.filter(d => d.category === register)

  async function hochladen(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setFehler('')
    try {
      for (const f of Array.from(files)) await uploadStaffFile(staffId, register, f)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Hochladen fehlgeschlagen')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
      await queryClient.invalidateQueries({ queryKey: key(staffId) })
    }
  }

  async function bestaetigtLoeschen() {
    if (!loeschen) return
    setBusy(true)
    setFehler('')
    try {
      await deleteStaffFile(staffId, loeschen.id)
      setLoeschen(null)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey: key(staffId) })
    }
  }

  return (
    <section className="admin-table-wrap" style={{ padding: 24, marginTop: 20 }} aria-label="Personalordner">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Personalordner</div>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Bitte warten…' : '+ Datei hochladen'}
        </button>
        <input ref={input} type="file" multiple hidden accept={PERSONALORDNER_ACCEPT}
          aria-label="Datei für den Personalordner" onChange={e => { void hochladen(e.target.files) }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 12px' }}>
        Nur für Manager und Manager light sichtbar. Jeder Abruf steht im Zugriffsprotokoll.
        PDF, Bilder und Word, höchstens 20 MB je Datei.
      </div>

      <div className="kpi-admin-tabs" ref={tabsRef}>
        {PERSONAL_REGISTER.map(r => {
          const n = dateien.filter(d => d.category === r.key).length
          return (
            <button key={r.key} type="button"
              className={`kpi-admin-tab${register === r.key ? ' active' : ''}`}
              onClick={() => setRegister(r.key)}>
              {r.label}{n > 0 ? ` (${n})` : ''}
            </button>
          )
        })}
      </div>

      {fehler && <div className="admin-form-error" role="alert" style={{ marginTop: 12 }}>{fehler}</div>}

      {isLoading ? (
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      ) : isError ? (
        <div className="admin-form-error" role="alert" style={{ marginTop: 12 }}>
          Der Personalordner liess sich nicht laden.
        </div>
      ) : imRegister.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>In diesem Register liegt noch nichts.</div>
      ) : (
        <table className="admin-table" style={{ marginTop: 12 }}>
          <tbody>
            {imRegister.map(d => (
              <tr key={d.id}>
                <td>
                  <a href={staffFileUrl(staffId, d.id)} target="_blank" rel="noreferrer">{d.filename}</a>
                </td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(d.created_at)}</td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{groesse(d.size_bytes)}</td>
                <td style={{ textAlign: 'right', width: '1%' }}>
                  <button type="button" className="admin-btn admin-btn-danger admin-btn-sm"
                    aria-label={`${d.filename} löschen`} disabled={busy} onClick={() => setLoeschen(d)}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {loeschen && (
        <ConfirmDialog
          title="Datei löschen?"
          message={<>«{loeschen.filename}» wird endgültig aus dem Personalordner gelöscht.</>}
          confirmLabel="Löschen"
          variant="danger"
          busy={busy}
          onConfirm={() => { void bestaetigtLoeschen() }}
          onCancel={() => setLoeschen(null)}
        />
      )}
    </section>
  )
}

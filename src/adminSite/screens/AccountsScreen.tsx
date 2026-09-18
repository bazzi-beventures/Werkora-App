/**
 * Konten — die Zugänge des gewählten Mandanten, und genau eine Aktion daran.
 *
 * Spec: docs/specs/admin-werkora-ch.md §5.1.
 *
 * Der Screen ist bewusst schmal. Die Betreiber-Seite **verwaltet** die Konten
 * eines Kunden nicht: Rolle, Status, Name und E-Mail bleiben beim Admin des
 * Mandanten, der seine Leute kennt. Was hier steht, ist das eine, wofür es
 * sonst keinen Weg gibt — ein Passwort setzen, ohne ein eigenes Konto in
 * diesem Mandanten zu haben.
 *
 * Warum das nötig ist: Ein Konto bekommt sein Passwort sonst nur von einem
 * Admin IM selben Mandanten. Genau die Rechnung «ein Konto je Mandant» soll
 * die Betreiber-Seite abschaffen (§1). Ohne diesen Screen bleibt für ein frisch
 * angelegtes Konto eine SQL-Migration mit kopiertem `password_hash` — so ist
 * das Betreiber-Konto aus §8.6 entstanden, und das soll der letzte Fall
 * gewesen sein.
 *
 * Das Beta-Häkchen liegt weiterhin im Testing-Tab der Konfiguration, nicht
 * hier: es ist Kalibrierung, kein Eingriff.
 */
import { useCallback, useEffect, useState } from 'react'
import * as scoped from '../tenantScopedApi'
import type { AuthUser } from '../../api/admin/users'
import { useToast, ToastHost } from '../../admin/components/useToast'
import { PasswordDialog } from '../PasswordDialog'

const ROLLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  management: 'Geschäftsleitung',
  admin: 'Admin',
  user: 'Mitarbeiter',
  user_light: 'Mitarbeiter (eingeschränkt)',
}

export default function AccountsScreen({ tenantId }: { tenantId: string | null }) {
  const { toast, showToast } = useToast()
  const [users, setUsers] = useState<AuthUser[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [ziel, setZiel] = useState<AuthUser | null>(null)

  const laden = useCallback(async () => {
    try {
      setUsers(await scoped.listUsers(tenantId))
      setFehler('')
    } catch (e: unknown) {
      setFehler(e instanceof Error ? e.message : 'Konten konnten nicht geladen werden.')
      setUsers([])
    }
  }, [tenantId])

  useEffect(() => { void laden() }, [laden])

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Konten</div>
          <div className="admin-page-subtitle">
            Zugänge dieses Mandanten. Hier lässt sich allein das Passwort setzen.
          </div>
        </div>
      </div>

      {fehler && <div className="admin-empty">{fehler}</div>}

      {users === null && !fehler && <div className="admin-empty">Wird geladen…</div>}

      {users !== null && users.length === 0 && !fehler && (
        <div className="admin-empty">Dieser Mandant hat keine aktiven Konten.</div>
      )}

      {users !== null && users.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>Rolle</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name || '—'}</td>
                  <td>{u.username || u.email || '—'}</td>
                  <td>{ROLLE_LABEL[u.role] ?? u.role}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => setZiel(u)}
                    >
                      Passwort setzen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ziel && (
        <PasswordDialog
          titel={`Passwort für ${ziel.display_name || ziel.username || 'dieses Konto'}`}
          onSave={(neu) => scoped.setUserPassword(tenantId, ziel.id, neu)}
          onClose={() => setZiel(null)}
          onDone={(meldung) => {
            setZiel(null)
            showToast(meldung)
          }}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

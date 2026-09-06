import { useEffect, useState } from 'react'
import { listUsers, saveUser } from '../../../api/admin/users'
import type { AuthUser } from '../../../api/admin/users'
import { getTenantFeatures, getTenantModules } from '../../../api/admin'
import { useToast, ToastHost } from '../../components/useToast'
import { BetaBadge } from '../../../shared/BetaBadge'

/**
 * Testing — wer bekommt neue Funktionen vor allen anderen?
 *
 * docs/specs/beta-tester.md. Der Tab ist die **Voraussetzung** für alles
 * andere: Ein Modul im Betatest und ein Feature der Stufe «beta» sind für
 * niemanden da, solange hier kein Konto markiert ist. Deshalb steht oben, was
 * gerade in der Beta läuft — sonst setzt man Häkchen ins Leere oder schaltet
 * ein Modul auf Beta, ohne zu merken, dass es damit verschwindet.
 *
 * Bewusst hier und nicht in der Benutzerverwaltung: Beta gehört ganz zum
 * Betreiber — er entscheidet, WAS in die Beta geht, und auch WER testet
 * (Betreiberentscheid 2026-09-06, dreht die Arbeitsteilung aus Spec §3.6 um).
 * Das Backend lässt das Feld deshalb nur vom Superadmin setzen.
 */
export function TestingTab() {
  const { toast, showToast } = useToast()
  const [users, setUsers] = useState<AuthUser[] | null>(null)
  const [betaFeatures, setBetaFeatures] = useState<{ key: string; label: string }[]>([])
  const [betaModules, setBetaModules] = useState<string[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      try {
        const [liste, features, module] = await Promise.all([
          listUsers(),
          // Was gerade in der Beta ist, ist Zusatzinformation: Ein Fehler dort
          // darf die Tester-Liste nicht mitreissen — sie ist der Zweck des Tabs.
          getTenantFeatures().catch(() => null),
          getTenantModules().catch(() => null),
        ])
        if (abgebrochen) return
        setUsers(liste)
        setBetaFeatures(
          (features?.registry ?? [])
            .filter(e => e.stage === 'beta' && !!(features?.effective?.[e.key] ?? {}).enabled)
            .map(e => ({ key: e.key, label: e.label })),
        )
        setBetaModules(module?.beta_modules ?? [])
      } catch {
        if (!abgebrochen) showToast('Laden fehlgeschlagen', 'error')
      }
    }
    void laden()
    return () => { abgebrochen = true }
    // Einmal beim Öffnen des Tabs; showToast ist bei jedem Render neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(u: AuthUser) {
    const next = !u.beta_tester
    setSavingId(u.id)
    try {
      await saveUser({
        email: u.email, display_name: u.display_name, role: u.role,
        is_active: u.is_active, beta_tester: next,
      }, u.id)
      setUsers(prev => (prev ?? []).map(x => (x.id === u.id ? { ...x, beta_tester: next } : x)))
      showToast(next ? `${u.display_name || u.email} testet jetzt mit` : 'Nicht mehr im Testing', 'success')
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : 'Speichern fehlgeschlagen', 'error')
    } finally {
      setSavingId(null)
    }
  }

  if (!users) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Konten werden geladen…</div><ToastHost toast={toast} /></>
  }

  const tester = users.filter(u => u.beta_tester)
  const laeuft = betaFeatures.length + betaModules.length

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Wer hier markiert ist, sieht Funktionen im Betatest — in Produktion, mit den echten
        Daten seines Betriebs. Alle anderen merken nichts davon. Das ist die{' '}
        <strong>Voraussetzung</strong>: Ein Modul im Betatest (Tab <strong>Module</strong>) und
        ein Feature der Stufe <BetaBadge /> (Tab <strong>Workflows</strong>) sind für niemanden
        da, solange hier kein Konto markiert ist.
      </div>

      {/* Was gerade läuft — beantwortet vor dem Klicken die Frage, wofür man
          jemanden überhaupt markiert. */}
      <div style={{
        border: '1px solid var(--border-subtle, rgba(148,163,184,0.2))',
        borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--muted)' }}>
          Im Betatest
        </div>
        {laeuft === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
            Zurzeit nichts. Markierte Tester verhalten sich damit exakt wie alle anderen —
            das Häkchen wirkt erst, wenn im Tab Module oder Workflows etwas auf Betatest steht.
          </div>
        ) : (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {betaModules.map(m => (
              <li key={`m-${m}`}>Modul <code>{m}</code></li>
            ))}
            {betaFeatures.map(f => (
              <li key={`f-${f.key}`}>{f.label} <span style={{ color: 'var(--muted)' }}>({f.key})</span></li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ fontSize: 13, marginBottom: 10 }}>
        {tester.length === 0
          ? 'Noch niemand markiert.'
          : `${tester.length} von ${users.length} Konten testen mit.`}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {users.map(u => (
          <label
            key={u.id}
            style={{
              display: 'flex', gap: 12, padding: 12, alignItems: 'center',
              border: '1px solid var(--border-subtle, rgba(148,163,184,0.15))',
              borderRadius: 'var(--radius-sm)',
              background: u.beta_tester ? 'var(--accent-purple-dim, rgba(167,139,250,0.10))' : 'transparent',
              cursor: savingId === u.id ? 'progress' : 'pointer',
              opacity: savingId === u.id ? 0.6 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={!!u.beta_tester}
              disabled={savingId !== null}
              onChange={() => void toggle(u)}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {u.display_name || u.email || u.username || u.id}
                {u.beta_tester && <> <BetaBadge /></>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {[u.role, u.username, u.email].filter(Boolean).join(' · ')}
              </div>
            </div>
          </label>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16, lineHeight: 1.6 }}>
        Jedes Häkchen wird sofort gespeichert und im Änderungsprotokoll vermerkt
        (<code>admin_set_beta_tester</code>). Tester sehen in ihrer App unter Profil
        einen Abschnitt mit dem, was sie gerade testen, samt Knopf für die Rückmeldung.
      </div>

      <ToastHost toast={toast} />
    </div>
  )
}

export default TestingTab

import { useEffect, useState } from 'react'
import { getPushRecipients, sendAdminPush, PushRecipient } from '../../api/adminPush'

function rkey(r: PushRecipient): string {
  return `${r.tenant_id}|${r.staff_id}`
}

export default function PushTestScreen() {
  const [recipients, setRecipients] = useState<PushRecipient[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('Test-Nachricht')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setRecipients(await getPushRecipients())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function toggle(r: PushRecipient) {
    const k = rkey(r)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev =>
      prev.size === recipients.length ? new Set() : new Set(recipients.map(rkey)),
    )
  }

  async function handleSend() {
    setResult(null)
    setError(null)
    const targets = recipients
      .filter(r => selected.has(rkey(r)))
      .map(r => ({ tenant_id: r.tenant_id, staff_id: r.staff_id }))
    if (targets.length === 0) {
      setError('Bitte mindestens einen Empfänger auswählen.')
      return
    }
    if (!body.trim()) {
      setError('Bitte einen Nachrichtentext eingeben.')
      return
    }
    setSending(true)
    try {
      const res = await sendAdminPush(targets, title, body)
      setResult(`${res.total} Push(es) zugestellt an ${targets.length} ausgewählte(n) Empfänger.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Senden fehlgeschlagen')
    } finally {
      setSending(false)
    }
  }

  const allSelected = recipients.length > 0 && selected.size === recipients.length

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Push-Test</div>
          <div className="admin-page-subtitle">
            Freie Nachricht an ausgewählte Mitarbeiter senden (nur Geräte mit aktiviertem Push)
          </div>
        </div>
        <button className="svc-refresh" onClick={load} disabled={loading} data-loading={loading}>
          <span className="svc-refresh-icon">↻</span>
          {loading ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {result && (
        <div style={{ padding: 16, background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16 }}>
          {result}
        </div>
      )}

      {/* Nachricht */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560, marginBottom: 24 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Titel
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Titel der Benachrichtigung"
            style={{
              display: 'block', width: '100%', marginTop: 6, padding: '10px 12px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontSize: 14,
            }}
          />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          Nachricht
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Text, der auf dem Smartphone erscheint…"
            rows={3}
            style={{
              display: 'block', width: '100%', marginTop: 6, padding: '10px 12px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontSize: 14, resize: 'vertical', fontFamily: 'inherit',
            }}
          />
        </label>
      </div>

      {/* Empfänger */}
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 10 }}>
        Empfänger {recipients.length > 0 && `(${selected.size}/${recipients.length})`}
      </div>

      {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>}

      {!loading && recipients.length === 0 && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13 }}>
          Noch niemand hat Push aktiviert. Aktiviere es zuerst auf einem Gerät unter
          Profil → Benachrichtigungen, dann erscheint der Mitarbeiter hier.
        </div>
      )}

      {!loading && recipients.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxWidth: 560 }}>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderBottom: '1px solid var(--border)', cursor: 'pointer',
              background: 'var(--surface)', fontSize: 13, fontWeight: 600, color: 'var(--text)',
            }}
          >
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Alle auswählen
          </label>
          {recipients.map(r => (
            <label
              key={rkey(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 14, color: 'var(--text)',
              }}
            >
              <input type="checkbox" checked={selected.has(rkey(r))} onChange={() => toggle(r)} />
              <span style={{ flex: 1 }}>{r.staff_name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {r.tenant_name} · {r.devices} Gerät{r.devices > 1 ? 'e' : ''}
              </span>
            </label>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button
          className="admin-btn-primary"
          onClick={handleSend}
          disabled={sending || loading || recipients.length === 0}
        >
          {sending ? 'Sendet…' : 'Push senden'}
        </button>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import * as scoped from '../../tenantScopedApi'
import type { BexioDefaults, BexioJob, BexioView } from '../../tenantScopedApi'
import { useToast, ToastHost } from '../../../admin/components/useToast'
import { ConfirmDialog } from '../../../admin/components/ConfirmDialog'
import {
  defaultsFrom, expiryText, jobActions, jobLabel, jobStatus, paymentDirection, revenueAccounts,
  setWorkTypeAccount, withPaymentDirection, type PaymentDirection,
} from './bexioForm'

// ─── Reiter «bexio»: Verbindung, Kontierung, Warteschlange je Mandant ───────
//
// Spec: docs/specs/bexio-anbindung.md §8.1. Reihenfolge der Abschnitte = Reihenfolge
// der Einrichtung: Token → Konten → Modul einschalten (Reiter «Module») → im Betrieb
// die Warteschlange. Das Token geht einmal hinaus und kommt nie zurück: das Feld
// leert sich nach dem Speichern, angezeigt wird nur «gesetzt am».

const SECTION: React.CSSProperties = { padding: 24, maxWidth: 820, marginBottom: 16 }
const MUTED: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function BexioTab({ tenantId }: { tenantId: string }) {
  const { toast, showToast } = useToast(5000)
  const [view, setView] = useState<BexioView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [createdOn, setCreatedOn] = useState('')
  const [findings, setFindings] = useState<string[]>([])
  const [defaults, setDefaults] = useState<BexioDefaults | null>(null)
  const [jobs, setJobs] = useState<BexioJob[]>([])
  const [jobFilter, setJobFilter] = useState<string>('needs_attention')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [contactFor, setContactFor] = useState<BexioJob | null>(null)
  const [contactId, setContactId] = useState('')
  const [cancelFor, setCancelFor] = useState<BexioJob | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [oauthUrl, setOauthUrl] = useState<string | null>(null)

  const apply = useCallback((v: BexioView) => {
    setView(v)
    setDefaults(v.connection ? defaultsFrom(v.connection) : null)
    if (v.findings) setFindings(v.findings)
  }, [])

  const loadJobs = useCallback(async (status: string) => {
    try {
      setJobs(await scoped.listBexioJobs(tenantId, status || undefined))
    } catch (e) {
      showToast(errorText(e), 'error')
    }
  }, [tenantId, showToast])

  useEffect(() => {
    let alive = true
    setLoading(true)
    scoped.getBexio(tenantId)
      .then(v => { if (alive) apply(v) })
      .catch(e => { if (alive) showToast(errorText(e), 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tenantId, apply, showToast])

  useEffect(() => {
    if (view?.connection) void loadJobs(jobFilter)
  }, [view?.connection, jobFilter, loadJobs])

  async function run<T>(label: string, fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    setBusy(label)
    try {
      const res = await fn()
      if (ok) showToast(ok, 'success')
      return res
    } catch (e) {
      showToast(errorText(e), 'error')
      return undefined
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <><div className="admin-loading"><div className="admin-spinner" /> bexio wird geladen…</div><ToastHost toast={toast} /></>
  }
  if (!view) return <ToastHost toast={toast} />

  const conn = view.connection
  const catalog = view.catalog
  const accounts = revenueAccounts(catalog)
  const expiry = expiryText(conn?.secret_expires_at ?? null)

  async function saveToken() {
    const v = await run('token', () => scoped.setBexioToken(tenantId, token.trim(), createdOn || undefined),
      'Verbindung getestet und gespeichert')
    if (v) { apply(v); setToken(''); setCreatedOn('') }
  }

  async function retest() {
    const v = await run('test', () => scoped.testBexio(tenantId), 'Verbindung in Ordnung')
    if (v) apply(v)
  }

  async function startOAuth() {
    const res = await run('oauth', () => scoped.startBexioOAuth(tenantId))
    if (res) setOauthUrl(res.authorize_url)
  }

  async function copyOauthUrl() {
    if (!oauthUrl) return
    try {
      await navigator.clipboard.writeText(oauthUrl)
      showToast('Link kopiert', 'success')
    } catch {
      showToast('Kopieren nicht möglich — Link markieren und kopieren', 'error')
    }
  }

  async function saveDefaults() {
    if (!defaults) return
    const v = await run('defaults', () => scoped.setBexioDefaults(tenantId, defaults), 'Einstellungen gespeichert')
    if (v) apply(v)
  }

  const numSelect = (
    label: string, value: number | null, options: { id: number; label: string }[],
    onChange: (v: number | null) => void, emptyLabel = '— wählen —',
  ) => (
    <label className="admin-form-group" style={{ display: 'block', marginBottom: 12 }}>
      <span className="admin-form-label">{label}</span>
      <select
        className="admin-form-select"
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{emptyLabel}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  )

  const accountOptions = accounts.map(a => ({ id: a.id, label: `${a.account_no} ${a.name}` }))
  const taxOptions = (catalog?.taxes ?? []).map(t => ({
    id: t.id, label: `${t.code ?? t.name ?? t.id} — ${t.value ?? '?'} %`,
  }))
  const unitOptions = (catalog?.units ?? []).map(u => ({ id: u.id, label: u.name }))
  const bankOptions = (catalog?.banks ?? []).map(b => ({ id: b.id, label: `${b.name} ${b.iban || b.qr_iban}` }))

  return (
    <div>
      {/* ── Status ─────────────────────────────────────────────── */}
      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title">Status</div>
        {!view.key_configured && (
          <p className="admin-form-hint-warn">
            In dieser Umgebung ist <code>BEXIO_TOKEN_KEY</code> nicht gesetzt — die Anbindung ist aus.
            Den Schlüssel in Railway setzen (Anleitung Teil B1).
          </p>
        )}
        <div style={MUTED}>
          <div>Modul «bexio-Anbindung»: <strong>{view.module_enabled ? 'eingeschaltet' : 'aus'}</strong>
            {!view.module_enabled && ' — einschalten im Reiter «Module», wenn unten alles bereit ist.'}</div>
          {conn ? (
            <>
              <div>Verbunden mit: <strong>{conn.bexio_company_name ?? '—'}</strong>
                {' '}({conn.auth_kind === 'api_token' ? 'persönliches Token' : 'Freigabe über bexio (OAuth)'})</div>
              <div>Token gesetzt am {conn.secret_set_at ? new Date(conn.secret_set_at).toLocaleDateString('de-CH') : '—'}
                {expiry && <span style={{ color: expiry.warn ? 'var(--danger, #c0392b)' : undefined }}> · {expiry.text}</span>}
              </div>
              <div>Zustand: <span className={`admin-badge ${conn.status === 'ok' ? 'admin-badge-approved' : 'admin-badge-rejected'}`}>
                {conn.status === 'ok' ? 'in Ordnung' : 'Fehler'}</span>
                {conn.last_error && <span> {conn.last_error}</span>}
              </div>
              <div>Warteschlange: {Object.entries(view.queue_counts).map(([k, n]) => `${n} ${k}`).join(' · ') || 'leer'}</div>
            </>
          ) : <div>Noch keine Verbindung eingerichtet.</div>}
        </div>
        {view.readiness.length > 0 && (
          <div className="admin-form-hint-warn" style={{ marginTop: 12 }}>
            Vor dem Einschalten fehlt noch: {view.readiness.join(' · ')}
          </div>
        )}
        {findings.length > 0 && (
          <ul className="admin-form-hint" style={{ marginTop: 12 }}>
            {findings.map(f => <li key={f}>{f}</li>)}
          </ul>
        )}
      </div>

      {/* ── Verbindung ────────────────────────────────────────── */}
      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title">Verbindung</div>
        <p style={MUTED}>
          <strong>Betriebe:</strong> «Mit bexio verbinden». Der Link führt zu bexio; dort meldet sich der Betrieb
          mit seinem Benutzer «Werkora-Schnittstelle» an und gibt die Freigabe. Den Link kannst du selbst öffnen
          oder dem Betrieb schicken — er gilt 15 Minuten und nur einmal.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button className="admin-btn admin-btn-primary" disabled={!view.key_configured || busy !== null}
            onClick={() => void startOAuth()}>
            {busy === 'oauth' ? 'Bereite vor…' : 'Mit bexio verbinden'}
          </button>
        </div>
        {oauthUrl && (
          <div className="admin-form-hint" style={{ marginBottom: 16, wordBreak: 'break-all' }}>
            <div style={{ marginBottom: 6 }}>Link (15 Minuten gültig, einmal einlösbar):</div>
            <code>{oauthUrl}</code>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <a className="admin-btn admin-btn-secondary admin-btn-sm" href={oauthUrl} target="_blank" rel="noopener noreferrer">Öffnen</a>
              <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => void copyOauthUrl()}>Kopieren</button>
            </div>
          </div>
        )}
        <p style={MUTED}>
          <strong>Eigentest</strong> (eigene Buchhaltung): persönliches Token von <code>developer.bexio.com/pat</code>,
          gültig 60 Tage. Für Betriebe ist ein persönliches Token laut bexio <strong>nicht zulässig</strong>.
        </p>
        <label className="admin-form-group" style={{ display: 'block', marginBottom: 12 }}>
          <span className="admin-form-label">Persönliches Token</span>
          <input
            className="admin-form-input"
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={conn?.secret_set ? 'gesetzt — nur zum Ersetzen ausfüllen' : 'eyJ…'}
          />
        </label>
        <label className="admin-form-group" style={{ display: 'block', marginBottom: 12, maxWidth: 260 }}>
          <span className="admin-form-label">Erzeugt am (nur falls bexio kein Ablaufdatum mitliefert)</span>
          <input className="admin-form-input" type="date" value={createdOn} onChange={e => setCreatedOn(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="admin-btn admin-btn-primary"
            disabled={!view.key_configured || token.trim().length < 20 || busy !== null}
            onClick={() => void saveToken()}
          >
            {busy === 'token' ? 'Teste…' : 'Testen und speichern'}
          </button>
          {conn && (
            <button className="admin-btn admin-btn-secondary" disabled={busy !== null} onClick={() => void retest()}>
              {busy === 'test' ? 'Teste…' : 'Erneut testen'}
            </button>
          )}
          {conn && (
            <button className="admin-btn admin-btn-danger" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
              Verbindung trennen
            </button>
          )}
        </div>
      </div>

      {/* ── Konten und Einstellungen ──────────────────────────── */}
      {conn && defaults && catalog && (
        <div className="admin-table-wrap" style={SECTION}>
          <div className="admin-section-title">Konten und Einstellungen</div>
          <p style={MUTED}>
            Der Ertrag wird nach der Leistungsart des Projekts gebucht (Spec §6.8). Gemischte Projekte gehen
            auf das Konto der ersten Leistungsart (Neumontage vor Reparatur), freie Rechnungen auf das
            Standardkonto. Abschlusskonten (3901, 3902) stehen bewusst nicht zur Wahl.
          </p>
          {numSelect('Standard-Ertragskonto', defaults.default_account_id, accountOptions,
            v => setDefaults({ ...defaults, default_account_id: v }))}
          <table className="admin-table" style={{ marginBottom: 16 }}>
            <thead><tr><th>Leistungsart</th><th>Ertragskonto</th></tr></thead>
            <tbody>
              {view.work_types.map(wt => (
                <tr key={wt}>
                  <td>{wt}</td>
                  <td>
                    <select
                      className="admin-form-select"
                      aria-label={`Ertragskonto ${wt}`}
                      value={defaults.account_by_work_type[wt] ?? ''}
                      onChange={e => setDefaults({
                        ...defaults,
                        account_by_work_type: setWorkTypeAccount(
                          defaults.account_by_work_type, wt, e.target.value ? Number(e.target.value) : null),
                      })}
                    >
                      <option value="">Standardkonto</option>
                      {accountOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {numSelect('Steuersatz (8.1 %)', defaults.default_tax_id, taxOptions,
            v => setDefaults({ ...defaults, default_tax_id: v }))}
          {numSelect('Steuersatz der Rundungszeile (0 %)', defaults.default_tax_id_zero, taxOptions,
            v => setDefaults({ ...defaults, default_tax_id_zero: v }))}
          {numSelect('Bankkonto (mit der IBAN der Werkora-Rechnungen)', defaults.default_bank_account_id, bankOptions,
            v => setDefaults({ ...defaults, default_bank_account_id: v }))}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {numSelect('Einheit Stunden', defaults.default_unit_id_hours, unitOptions,
              v => setDefaults({ ...defaults, default_unit_id_hours: v }))}
            {numSelect('Einheit Stück', defaults.default_unit_id_piece, unitOptions,
              v => setDefaults({ ...defaults, default_unit_id_piece: v }))}
            {numSelect('Einheit pauschal', defaults.default_unit_id_flat, unitOptions,
              v => setDefaults({ ...defaults, default_unit_id_flat: v }))}
          </div>
          <fieldset style={{ border: 'none', padding: 0, margin: '8px 0 16px' }}>
            <legend className="admin-form-label">Zahlungen</legend>
            {([
              ['push', 'An bexio melden — der Betrieb gleicht in Werkora ab (von Hand oder Bankauszug)'],
              ['pull', 'Aus bexio holen — der Betrieb gleicht in bexio ab (Bankanbindung), Werkora übernimmt «bezahlt»'],
              ['none', 'Weder noch'],
            ] as [PaymentDirection, string][]).map(([dir, label]) => (
              <label key={dir} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                <input
                  type="radio"
                  name="bexio-payments"
                  checked={paymentDirection(defaults) === dir}
                  onChange={() => setDefaults(withPaymentDirection(defaults, dir))}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <button className="admin-btn admin-btn-primary" disabled={busy !== null} onClick={() => void saveDefaults()}>
            {busy === 'defaults' ? 'Speichere…' : 'Einstellungen speichern'}
          </button>
        </div>
      )}

      {/* ── Warteschlange ─────────────────────────────────────── */}
      {conn && (
        <div className="admin-table-wrap" style={SECTION}>
          <div className="admin-section-title">Warteschlange</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <select className="admin-form-select" aria-label="Filter" value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
              <option value="needs_attention">braucht dich</option>
              <option value="error">wird wiederholt</option>
              <option value="pending">wartet</option>
              <option value="">alle</option>
            </select>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => void loadJobs(jobFilter)}>Aktualisieren</button>
          </div>
          {jobs.length === 0 ? <p style={MUTED}>Keine Aufträge.</p> : (
            <table className="admin-table">
              <thead><tr><th>Art</th><th>Objekt</th><th>Zustand</th><th>Grund</th><th /></tr></thead>
              <tbody>
                {jobs.map(job => {
                  const st = jobStatus(job)
                  const act = jobActions(job)
                  return (
                    <tr key={job.id}>
                      <td>{jobLabel(job)}</td>
                      <td>{job.local_id}</td>
                      <td><span className={`admin-badge ${st.badge}`}>{st.label}</span></td>
                      <td style={{ maxWidth: 360, whiteSpace: 'normal' }}>{job.last_error ?? ''}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {act.retry && (
                          <button className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy !== null}
                            onClick={() => void run('retry', () => scoped.retryBexioJob(tenantId, job.id), 'Wird erneut versucht')
                              .then(() => loadJobs(jobFilter))}>
                            Erneut versuchen
                          </button>
                        )}
                        {act.linkContact && (
                          <button className="admin-btn admin-btn-secondary admin-btn-sm" style={{ marginLeft: 4 }}
                            onClick={() => { setContactFor(job); setContactId('') }}>
                            Kontakt zuordnen
                          </button>
                        )}
                        {act.cancelInBexio && (
                          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setCancelFor(job)}>
                            In bexio stornieren
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <label className="admin-form-group" style={{ display: 'block' }}>
              <span className="admin-form-label">Rechnung nachreichen (vor dem Einschalten versendet)</span>
              <input className="admin-form-input" value={invoiceNumber} placeholder="RE-2026-012"
                onChange={e => setInvoiceNumber(e.target.value)} />
            </label>
            <button className="admin-btn admin-btn-secondary" disabled={invoiceNumber.trim().length < 3 || busy !== null}
              onClick={() => void run('enqueue', () => scoped.enqueueBexioInvoice(tenantId, invoiceNumber.trim()),
                `${invoiceNumber.trim()} eingereiht`).then(r => { if (r) setInvoiceNumber('') })}>
              Nachreichen
            </button>
          </div>
        </div>
      )}

      {contactFor && (
        <ConfirmDialog
          title="Kontakt in bexio zuordnen"
          message={<>Der Kunde steht mehrfach in bexio. Die Nummer des richtigen Kontakts (aus der Meldung) eintragen —
            der Auftrag läuft danach erneut.</>}
          confirmLabel="Zuordnen"
          confirmDisabled={!/^\d+$/.test(contactId.trim())}
          busy={busy === 'link'}
          onCancel={() => setContactFor(null)}
          onConfirm={() => {
            const job = contactFor
            setContactFor(null)
            void run('link', () => scoped.linkBexioContact(tenantId, job.id, Number(contactId.trim())), 'Kontakt zugeordnet')
              .then(() => loadJobs(jobFilter))
          }}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="bexio-contact-id">bexio-Kontakt-Nr.</label>
            <input id="bexio-contact-id" className="admin-form-input" inputMode="numeric" value={contactId}
              onChange={e => setContactId(e.target.value)} />
          </div>
        </ConfirmDialog>
      )}

      {cancelFor && (
        <ConfirmDialog
          title="In bexio stornieren?"
          message={<>Die Rechnung zu Werkora-Rechnung #{cancelFor.local_id} wird in bexio storniert. Ein Storno
            ist eine Buchung mit Wirkung auf die MWST — nur bestätigen, wenn die Rechnung wirklich nicht gilt.</>}
          confirmLabel="Stornieren"
          variant="danger"
          busy={busy === 'cancel'}
          onCancel={() => setCancelFor(null)}
          onConfirm={() => {
            const job = cancelFor
            setCancelFor(null)
            void run('cancel', () => scoped.cancelInBexio(tenantId, job.id), 'In bexio storniert')
              .then(() => loadJobs(jobFilter))
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Verbindung trennen?"
          message={<>Token, Zuordnungen und Warteschlange dieses Mandanten werden gelöscht. Die Belege in bexio
            bleiben — sie gehören dem Betrieb. Das Modul muss dafür ausgeschaltet sein.</>}
          confirmLabel="Trennen"
          variant="danger"
          busy={busy === 'delete'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            void run('delete', () => scoped.deleteBexio(tenantId), 'Verbindung getrennt').then(v => {
              if (v) { apply(v); setJobs([]); setFindings([]) }
            })
          }}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

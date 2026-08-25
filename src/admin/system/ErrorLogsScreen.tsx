import { useEffect, useMemo, useState } from 'react'
import { useToast, ToastHost } from '../components/useToast'
import {
  downloadErrorLogsCsv,
  ERROR_LEVELS,
  ErrorLevel,
  ErrorLogRow,
  ErrorLogTenant,
  getErrorLogs,
} from '../../api/errorLogs'
import { backdropCloseProps } from '../../shared/backdropClose'
import '../kpis/kpi-dashboard.css'
import './error-logs.css'

// ── Datums-Helfer (lokale Zeitzone) ──
const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

type PresetId = 'heute' | '7t' | '30t' | 'custom'

function presetRange(id: Exclude<PresetId, 'custom'>): { von: string; bis: string } {
  const today = new Date()
  switch (id) {
    case 'heute': return { von: isoLocal(today), bis: isoLocal(today) }
    case '7t': return { von: isoLocal(addDays(today, -6)), bis: isoLocal(today) }
    case '30t': return { von: isoLocal(addDays(today, -29)), bis: isoLocal(today) }
  }
}

const PRESETS: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
  { id: 'heute', label: 'Heute' },
  { id: '7t', label: '7 Tage' },
  { id: '30t', label: '30 Tage' },
]

const LEVEL_LABEL: Record<ErrorLevel, string> = {
  critical: 'CRIT',
  error: 'ERROR',
  warning: 'WARN',
}

// Wie viele Zeilen zunächst gerendert werden. Auf dem Handy ist eine Liste mit
// 500 Karten unbenutzbar (und langsam) — der Rest kommt per „Mehr laden".
const PAGE = 60

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('de-CH', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtFullTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('de-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function LevelBadge({ level }: { level: ErrorLevel }) {
  return <span className={`elog-badge elog-badge--${level}`}>{LEVEL_LABEL[level] ?? level}</span>
}

// Ein Eintrag als Klartext — für „Kopieren" (Weitergabe in Chat/Issue).
function rowAsText(r: ErrorLogRow): string {
  const lines = [
    `Zeit:     ${fmtFullTime(r.occurred_at)}`,
    `Level:    ${r.level}`,
    `Mandant:  ${r.tenant_name ?? 'Plattform'}`,
    `Quelle:   ${r.source}${r.error_type ? ` · ${r.error_type}` : ''}`,
    r.fingerprint ? `Signatur: ${r.fingerprint}` : '',
    r.user_id ? `User:     ${r.user_id}` : '',
    '',
    r.message,
  ].filter(Boolean)
  if (r.context && Object.keys(r.context).length > 0) {
    lines.push('', 'Kontext:', JSON.stringify(r.context, null, 2))
  }
  if (r.traceback) lines.push('', 'Traceback:', r.traceback)
  return lines.join('\n')
}

interface DetailProps {
  row: ErrorLogRow
  onClose: () => void
  onSimilar: (fingerprint: string) => void
  onCopied: (ok: boolean) => void
}

// Detail als Slide-in-Panel (admin-modal), NICHT als Block unter der Tabelle:
// dort landete es früher ausserhalb des Sichtfelds — am Handy praktisch
// unauffindbar, am Desktop musste man hinunterscrollen.
function ErrorDetailPanel({ row, onClose, onSimilar, onCopied }: DetailProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(rowAsText(row))
      onCopied(true)
    } catch {
      onCopied(false)
    }
  }

  const meta: [string, string][] = [
    ['Zeit', fmtFullTime(row.occurred_at)],
    ['Mandant', row.tenant_name ?? 'Plattform'],
    ['Quelle', row.source],
    ['Typ', row.error_type ?? '—'],
    ['User', row.user_id ?? '—'],
  ]

  return (
    <div className="admin-modal-overlay" {...backdropCloseProps(onClose)}>
      <div className="admin-modal elog-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title elog-detail-title">
            <LevelBadge level={row.level} />
            <span>{row.error_type ?? 'Fehler'}</span>
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>

        <div className="admin-modal-body">
          <dl className="elog-meta-grid">
            {meta.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            {row.fingerprint && (
              <div>
                <dt>Signatur</dt>
                <dd><code>{row.fingerprint}</code></dd>
              </div>
            )}
          </dl>

          <div>
            <div className="elog-detail-label">Meldung</div>
            <div className="elog-detail-message">{row.message}</div>
          </div>

          {row.context && Object.keys(row.context).length > 0 && (
            <div>
              <div className="elog-detail-label">Kontext</div>
              <pre className="elog-pre">{JSON.stringify(row.context, null, 2)}</pre>
            </div>
          )}

          {row.traceback && (
            <div>
              <div className="elog-detail-label">Traceback</div>
              <pre className="elog-pre elog-pre--tall">{row.traceback}</pre>
            </div>
          )}
        </div>

        <div className="admin-modal-footer">
          {row.fingerprint && (
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => onSimilar(row.fingerprint!)}>
              Gleiche Fehler
            </button>
          )}
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={copy}>Kopieren</button>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={onClose}>Schliessen</button>
        </div>
      </div>
    </div>
  )
}

export default function ErrorLogsScreen() {
  const [preset, setPreset] = useState<PresetId>('7t')
  const [von, setVon] = useState<string>(() => presetRange('7t').von)
  const [bis, setBis] = useState<string>(() => presetRange('7t').bis)
  const [tenantId, setTenantId] = useState<string>('')
  const [levels, setLevels] = useState<ErrorLevel[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [rows, setRows] = useState<ErrorLogRow[]>([])
  const [tenants, setTenants] = useState<ErrorLogTenant[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [capped, setCapped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ErrorLogRow | null>(null)
  const [visible, setVisible] = useState(PAGE)
  const { toast, showToast } = useToast(3500)

  function applyPreset(id: Exclude<PresetId, 'custom'>) {
    const r = presetRange(id)
    setVon(r.von); setBis(r.bis); setPreset(id)
  }

  function toggleLevel(lv: ErrorLevel) {
    setLevels((prev) => (prev.includes(lv) ? prev.filter((l) => l !== lv) : [...prev, lv]))
  }

  // Tippen soll nicht pro Anschlag eine Query auslösen.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Ganztägiges Fenster in lokaler Zeit; occurred_at ist UTC — für ein
  // Transparenz-Dashboard ist die Tages-Näherung bewusst gut genug.
  const query = useMemo(() => ({
    since: `${von}T00:00:00`,
    until: `${bis}T23:59:59`,
    tenantId: tenantId || undefined,
    levels,
    q: search || undefined,
  }), [von, bis, tenantId, levels, search])

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    getErrorLogs(query)
      .then((res) => {
        if (cancelled) return
        setRows(res.rows)
        setTenants(res.tenants)
        setTotal(res.total ?? null)
        setCapped(res.capped)
        setVisible(PAGE)
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Fehler beim Laden') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, reloadKey])

  const counts = useMemo(() => {
    const c: Record<ErrorLevel, number> = { critical: 0, error: 0, warning: 0 }
    for (const r of rows) if (r.level in c) c[r.level] += 1
    return c
  }, [rows])

  async function exportCsv() {
    setExporting(true)
    try {
      const { truncated } = await downloadErrorLogsCsv(query)
      showToast(
        truncated
          ? 'CSV geladen — an der Obergrenze (20 000 Zeilen) gekürzt, Zeitraum enger wählen.'
          : 'CSV geladen.',
        truncated ? 'info' : 'success',
      )
    } catch (e) {
      showToast((e as Error)?.message ?? 'CSV-Export fehlgeschlagen.', 'error')
    } finally {
      setExporting(false)
    }
  }

  function showSimilar(fingerprint: string) {
    setSelected(null)
    setSearchInput(fingerprint)
    setSearch(fingerprint)
  }

  const shown = rows.slice(0, visible)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Error-Logs</div>
          <div className="admin-page-subtitle">
            Backend-Fehler aller Mandanten — reine Ansicht, live aus error_log
          </div>
        </div>
        <div className="elog-header-actions">
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
          >
            Aktualisieren
          </button>
          <button
            className="admin-btn admin-btn-primary admin-btn-sm"
            onClick={exportCsv}
            disabled={exporting || loading}
            title="Gewählten Zeitraum mit allen Filtern als CSV herunterladen"
          >
            {exporting ? 'Export…' : 'CSV-Export'}
          </button>
        </div>
      </div>

      {/* Filter: Zeit-Presets, freie von/bis-Auswahl, Mandant, Level, Freitext */}
      <div className="elog-filters">
        <div className="kpi-date-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`kpi-date-btn${preset === p.id ? ' active' : ''}`}
              onClick={() => applyPreset(p.id)}
            >{p.label}</button>
          ))}
        </div>

        <label className="elog-field">
          <span>von</span>
          <input type="date" value={von} max={bis}
            onChange={(e) => { setVon(e.target.value); setPreset('custom') }} />
        </label>
        <label className="elog-field">
          <span>bis</span>
          <input type="date" value={bis} min={von}
            onChange={(e) => { setBis(e.target.value); setPreset('custom') }} />
        </label>
        <label className="elog-field">
          <span>Mandant</span>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Alle Mandanten</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="elog-field elog-field--grow">
          <span>Suche</span>
          <input
            type="search"
            value={searchInput}
            placeholder="Meldung, Typ, Quelle oder Signatur…"
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
      </div>

      <div className="elog-levelbar">
        {ERROR_LEVELS.map((lv) => (
          <button
            key={lv}
            className={`elog-chip elog-chip--${lv}${levels.includes(lv) ? ' active' : ''}`}
            onClick={() => toggleLevel(lv)}
            aria-pressed={levels.includes(lv)}
          >
            {LEVEL_LABEL[lv]}<span className="elog-chip-count">{counts[lv]}</span>
          </button>
        ))}
        {(levels.length > 0 || search) && (
          <button
            className="elog-chip elog-chip--reset"
            onClick={() => { setLevels([]); setSearchInput(''); setSearch('') }}
          >
            Filter zurücksetzen
          </button>
        )}
        <div className="elog-count">
          {loading
            ? 'Laden…'
            : `${rows.length} angezeigt${total !== null && total > rows.length ? ` von ${total}` : ''}`}
        </div>
      </div>

      {error && !loading && <div className="admin-error">{error}</div>}

      {!error && (
        <>
          {capped && !loading && (
            <div className="elog-hint">
              Die Ansicht zeigt die neuesten 500 Treffer im Zeitraum — der CSV-Export
              enthält den ganzen Zeitraum.
            </div>
          )}

          <div className="elog-list" role="list">
            {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Laden…</div>}
            {!loading && rows.length === 0 && (
              <div className="elog-empty">Keine Einträge im gewählten Zeitraum.</div>
            )}
            {!loading && shown.map((r) => (
              <button
                key={r.id}
                role="listitem"
                className={`elog-row elog-row--${r.level}`}
                onClick={() => setSelected(r)}
                title="Details öffnen"
              >
                <span className="elog-cell-time">{fmtTime(r.occurred_at)}</span>
                <span className="elog-cell-level"><LevelBadge level={r.level} /></span>
                <span className="elog-cell-source">
                  {r.source}{r.error_type ? <span className="elog-type"> · {r.error_type}</span> : null}
                </span>
                <span className="elog-cell-msg">{r.message}</span>
                <span className="elog-cell-tenant">{r.tenant_name ?? 'Plattform'}</span>
              </button>
            ))}
          </div>

          {!loading && rows.length > shown.length && (
            <button className="admin-btn admin-btn-secondary elog-more" onClick={() => setVisible((v) => v + PAGE)}>
              Weitere {Math.min(PAGE, rows.length - shown.length)} anzeigen
            </button>
          )}
        </>
      )}

      {selected && (
        <ErrorDetailPanel
          row={selected}
          onClose={() => setSelected(null)}
          onSimilar={showSimilar}
          onCopied={(ok) => showToast(ok ? 'In die Zwischenablage kopiert.' : 'Kopieren nicht möglich.', ok ? 'success' : 'error')}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

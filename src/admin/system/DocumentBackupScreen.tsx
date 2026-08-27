import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BACKUP_CONTENT_LABELS,
  DocumentBackupContent,
  DocumentBackupJob,
  DocumentBackupPart,
  DocumentBackupPreview,
  DocumentBackupScope,
  DocumentBackupSelection,
  getLatestDocumentBackup,
  getDocumentBackup,
  getDocumentBackupPreview,
  startDocumentBackup,
  cancelDocumentBackup,
} from '../../api/admin'
import { ApiError } from '../../api/client'
import {
  CONTENT_ORDER,
  defaultContents,
  defaultRange,
  describeContents,
  describeScope,
  driveOnlyCount,
  isEmptySelection,
  previewLines,
  rangeInvalid,
  supportsBulkDownload,
  toggleContent,
} from './documentBackupSelection'

const POLL_MS = 3000

// Abstand zwischen zwei ausgelösten Downloads beim „Alle Teile"-Knopf. Ohne Pause
// verschluckt Chrome die Folge-Klicks, weil sie wie ein Popup-Sturm aussehen.
const DOWNLOAD_GAP_MS = 1000

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const mb = n / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'abgelaufen'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `noch ${h} h ${m} min gültig`
  return `noch ${m} min gültig`
}

const isActive = (j: DocumentBackupJob | null): boolean =>
  j?.status === 'pending' || j?.status === 'running'

// Die Schleife liegt BEWUSST ausserhalb der Komponente. Als rekursives
// useCallback rief sie sich aus ihrem eigenen Initializer heraus auf — der
// React Compiler meldet das zu Recht (react-hooks/immutability): die
// eingefangene Bindung zieht nicht mit, wenn sich die Funktion aendert. Hier
// gibt es das Problem nicht, und die Schleife ist nebenbei fuer sich lesbar.
//
// Rekursives setTimeout, kein setInterval: der naechste Aufruf startet erst
// POLL_MS NACH der letzten Antwort. Bei POLL_MS = 3000 und einer langsamen
// Abfrage wuerden sich Requests sonst ueberholen.
function startPolling(
  id: number,
  timer: { current: ReturnType<typeof setTimeout> | null },
  onJob: (job: DocumentBackupJob) => void,
) {
  const tick = async () => {
    try {
      const next = await getDocumentBackup(id)
      onJob(next)
      if (!isActive(next)) return
    } catch {
      // transienter Fehler → später erneut versuchen
    }
    timer.current = setTimeout(tick, POLL_MS)
  }
  timer.current = setTimeout(tick, POLL_MS)
}

export default function DocumentBackupScreen() {
  const [job, setJob] = useState<DocumentBackupJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<DocumentBackupPreview | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auswahl vor dem Start: Typ, Zeitraum, Inhalte. `defaultRange` als lazy
  // Initializer, damit `new Date()` nicht bei jedem Render läuft.
  const [scope, setScope] = useState<DocumentBackupScope>('full')
  const [range, setRange] = useState(() => defaultRange())
  const [contents, setContents] = useState<DocumentBackupContent[]>(() => defaultContents('full'))

  // Für die Restlaufzeit-Anzeige jede Minute neu rendern.
  const [, setTick] = useState(0)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPoll = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }
  }

  // Polling-Schleife: solange der Job pending/running ist, alle POLL_MS nachfragen.
  const poll = useCallback((id: number) => {
    clearPoll()
    startPolling(id, pollRef, setJob)
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const latest = await getLatestDocumentBackup()
        setJob(latest)
        if (isActive(latest) && latest) poll(latest.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler beim Laden')
      } finally {
        setLoading(false)
      }
    })()
    return clearPoll
  }, [poll])

  // Minütlicher Tick für die Countdown-Anzeige des Download-Links.
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(iv)
  }, [])

  const selection: DocumentBackupSelection = {
    scope,
    range_from: scope === 'partial' ? range.from : null,
    range_to: scope === 'partial' ? range.to : null,
    contents,
  }
  const badRange = rangeInvalid(scope, range.from, range.to)
  const nothingSelected = contents.length === 0

  // Typwechsel setzt die Inhalts-Vorbelegung mit: beim Teilbackup sind Projekt-
  // Dateien und Stammdaten selten gemeint (Spec §4.2).
  function handleScopeChange(next: DocumentBackupScope) {
    setScope(next)
    setContents(defaultContents(next))
  }

  function handleToggleContent(key: DocumentBackupContent) {
    setContents(prev => toggleContent(prev, key))
  }

  // Schritt 1: Vorschau laden und Bestätigungs-Dialog öffnen (startet noch nichts).
  async function handleOpenPreview() {
    setError(null)
    setPreviewing(true)
    try {
      setPreview(await getDocumentBackupPreview(selection))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vorschau konnte nicht geladen werden')
    } finally {
      setPreviewing(false)
    }
  }

  // Schritt 2: nach Bestätigung wirklich starten.
  async function handleConfirmStart() {
    setPreview(null)
    setError(null)
    setStarting(true)
    try {
      const created = await startDocumentBackup(selection)
      setJob(created)
      poll(created.id)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const latest = await getLatestDocumentBackup()
        setJob(latest)
        if (isActive(latest) && latest) poll(latest.id)
        setError('Es läuft bereits ein Export. Bitte warten, bis er fertig ist.')
      } else if (e instanceof ApiError && e.status === 429) {
        setError(
          scope === 'full'
            ? 'Das Monats-Limit für Vollbackups ist erreicht. Ein Teilbackup ist eventuell noch möglich.'
            : 'Das Monats-Limit für Teilbackups ist erreicht. Bitte im nächsten Monat erneut versuchen.',
        )
      } else {
        setError(e instanceof Error ? e.message : 'Export konnte nicht gestartet werden')
      }
    } finally {
      setStarting(false)
    }
  }

  async function handleCancel() {
    if (!job) return
    setCancelling(true)
    setError(null)
    try {
      const updated = await cancelDocumentBackup(job.id)
      setJob(updated)
      if (isActive(updated)) poll(updated.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Abbruch fehlgeschlagen')
    } finally {
      setCancelling(false)
    }
  }

  // Alle Teile nacheinander auslösen. Chrome/Edge fragen einmalig „mehrere Dateien
  // herunterladen?" — danach läuft es durch.
  async function handleDownloadAll(parts: DocumentBackupPart[]) {
    setDownloadingAll(true)
    try {
      for (let i = 0; i < parts.length; i++) {
        const link = document.createElement('a')
        link.href = parts[i].download_url
        link.download = parts[i].filename ?? `backup_teil_${i + 1}.zip`
        document.body.appendChild(link)
        link.click()
        link.remove()
        if (i < parts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DOWNLOAD_GAP_MS))
        }
      }
    } finally {
      setDownloadingAll(false)
    }
  }

  const running = isActive(job)
  const busy = previewing || starting || running
  // `parts` ist maßgeblich; für einen (noch) nicht aktualisierten Backend-Stand auf
  // das einzelne download_url zurückfallen.
  const downloads =
    job?.parts && job.parts.length > 0
      ? job.parts
      : job?.download_url
        ? [{
            filename: job.filename,
            document_count: job.document_count,
            total_bytes: job.total_bytes,
            download_url: job.download_url,
          }]
        : []
  const ready = job?.status === 'ready' && !job.expired && downloads.length > 0
  const readyExpired = job?.status === 'ready' && (job.expired || downloads.length === 0)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Datensicherung</div>
          <div className="admin-page-subtitle">
            Dokumente, Rapport-Fotos, Projekt-Dateien und Stammdaten als ZIP herunterladen.
            Der Export läuft im Hintergrund; wenn er fertig ist, kommt eine Push-Meldung
            und der Download-Link erscheint hier (12 Stunden gültig).
          </div>
        </div>
        <button
          className="admin-btn admin-btn-primary"
          onClick={handleOpenPreview}
          disabled={busy || badRange || nothingSelected}
        >
          {previewing ? 'Prüft…' : starting ? 'Startet…' : running ? 'Export läuft…' : 'Backup erstellen'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: 'var(--danger-soft)', color: 'var(--danger-ink)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{
        maxWidth: 560, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        padding: 20, background: 'var(--surface)', marginBottom: 16,
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 12 }}>
          Was soll gesichert werden?
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {(['full', 'partial'] as DocumentBackupScope[]).map(s => (
            <button
              key={s}
              className={`admin-btn ${scope === s ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              onClick={() => handleScopeChange(s)}
              disabled={running}
            >
              {s === 'full' ? 'Vollbackup' : 'Teilbackup'}
            </button>
          ))}
        </div>

        {scope === 'partial' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Von<br />
              <input
                type="date"
                className="admin-input"
                value={range.from}
                max={range.to}
                onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
              />
            </label>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Bis<br />
              <input
                type="date"
                className="admin-input"
                value={range.to}
                min={range.from}
                onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
              />
            </label>
          </div>
        )}

        {badRange && (
          <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 12 }}>
            Bitte einen gültigen Zeitraum wählen („Von" darf nicht nach „Bis" liegen).
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CONTENT_ORDER.map(key => (
            <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={contents.includes(key)}
                onChange={() => handleToggleContent(key)}
                disabled={running}
              />
              <span>{BACKUP_CONTENT_LABELS[key]}</span>
            </label>
          ))}
        </div>

        {nothingSelected && (
          <div style={{ fontSize: 13, color: '#991b1b', marginTop: 10 }}>
            Mindestens einen Inhalt auswählen.
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          Stammdaten sind immer der Gesamtbestand — ein Zeitraum gilt für Dokumente,
          Fotos und Projekt-Dateien.
        </div>
      </div>

      {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>}

      {!loading && !job && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: 13, maxWidth: 560 }}>
          Noch kein Export erstellt. Mit „Backup erstellen" wird eine ZIP-Sicherung
          gestartet.
        </div>
      )}

      {!loading && job && (
        <div style={{ maxWidth: 560, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 20, background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {describeScope(job.scope, job.range_from, job.range_to)}
            {job.contents.length > 0 && ' · '}
            {describeContents(job.contents)}
          </div>

          {running && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text)' }}>
                <div className="kpi-admin-spinner" />
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {job.cancel_requested ? 'Wird abgebrochen…' : 'Export läuft…'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {job.cancel_requested
                      ? 'Der Abbruch wurde angefordert und greift nach dem aktuellen Teil.'
                      : 'Die Dateien werden gepackt. Das kann je nach Menge einige Minuten dauern — du bekommst eine Push-Nachricht, sobald es fertig ist.'}
                  </div>
                </div>
              </div>
              {!job.cancel_requested && (
                <button
                  className="admin-btn admin-btn-secondary"
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={{ marginTop: 16 }}
                >
                  {cancelling ? 'Abbrechen…' : 'Export abbrechen'}
                </button>
              )}
            </div>
          )}

          {ready && job && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
                Backup bereit
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                {job.document_count} Datei(en) · {formatBytes(job.total_bytes)} · {formatRemaining(job.expires_at)}
                {downloads.length > 1 && ` · ${downloads.length} Teile`}
              </div>

              {downloads.length > 1 && supportsBulkDownload() && (
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => handleDownloadAll(downloads)}
                  disabled={downloadingAll}
                  style={{ marginBottom: 12, width: '100%' }}
                >
                  {downloadingAll
                    ? 'Lädt herunter…'
                    : `Alle ${downloads.length} Teile herunterladen`}
                </button>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {downloads.map((p, i) => (
                  <a
                    key={i}
                    className={`admin-btn ${downloads.length > 1 ? 'admin-btn-secondary' : 'admin-btn-primary'}`}
                    href={p.download_url}
                    download={p.filename ?? `backup_teil_${i + 1}.zip`}
                    style={{ textDecoration: 'none' }}
                  >
                    {downloads.length > 1
                      ? `Teil ${i + 1} von ${downloads.length} herunterladen (${formatBytes(p.total_bytes)})`
                      : 'ZIP herunterladen'}
                  </a>
                ))}
              </div>
              {downloads.length > 1 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                  Die Sicherung ist auf mehrere ZIP-Dateien aufgeteilt (Upload-Limit).
                  Bitte alle Teile herunterladen — das Inhaltsverzeichnis
                  (Manifest.csv) liegt im ersten Teil.
                  {supportsBulkDownload()
                    ? ' Beim Sammel-Download fragt der Browser einmalig, ob mehrere Dateien geladen werden dürfen — bitte zulassen.'
                    : ' Auf iPhone/iPad lädt der Browser nur eine Datei pro Klick, deshalb einzeln.'}
                </div>
              )}
            </div>
          )}

          {readyExpired && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
                Link abgelaufen
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Der Download-Link war 12 Stunden gültig und ist abgelaufen. Bitte ein neues
                Backup erstellen.
              </div>
            </div>
          )}

          {job.status === 'cancelled' && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
                Export abgebrochen
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Die Sicherung wurde abgebrochen. Du kannst jederzeit ein neues Backup erstellen.
              </div>
            </div>
          )}

          {job.status === 'failed' && (
            <div>
              <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                Export fehlgeschlagen
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {job.error || 'Unbekannter Fehler.'}
              </div>
            </div>
          )}
        </div>
      )}

      {preview && (
        <ConfirmDialog
          preview={preview}
          onConfirm={handleConfirmStart}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}

function ConfirmDialog({
  preview, onConfirm, onClose,
}: {
  preview: DocumentBackupPreview
  onConfirm: () => void
  onClose: () => void
}) {
  const hasMasterData = preview.contents.includes('master_data')
  const nothing = isEmptySelection(preview)
  const blocked = preview.limit_reached || preview.active || nothing
  const limitLine =
    preview.max_per_month <= 0
      ? 'Kein Monats-Limit gesetzt.'
      : `${preview.scope === 'full' ? 'Vollbackups' : 'Teilbackups'} diesen Monat: ` +
        `${preview.used_this_month} von ${preview.max_per_month}` +
        (preview.remaining_this_month != null ? ` · noch ${preview.remaining_this_month} übrig` : '')

  const driveOnly = driveOnlyCount(preview)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 460, width: '100%', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 12, padding: 24,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-strong)', marginBottom: 12 }}>
          Datensicherung starten?
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          {describeScope(preview.scope, preview.range_from, preview.range_to)}
        </div>

        {nothing ? (
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
            Im gewählten Zeitraum gibt es nichts zu sichern.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
              Es werden <strong>{preview.document_count} Datei(en)</strong> gesichert
              {hasMasterData && ' (plus die Stammdaten-Arbeitsmappen)'}.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              {previewLines(preview).map(line => <div key={line}>{line}</div>)}
            </div>
          </>
        )}

        {driveOnly > 0 && (
          <div style={{
            fontSize: 12, color: 'var(--warning-ink)', background: 'var(--warning-soft)',
            padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 14,
          }}>
            Nicht enthalten: {driveOnly} Datei(en) aus dem Altbestand, die noch auf
            Google Drive liegen und nicht im Werkora-Speicher.
          </div>
        )}

        <div style={{
          fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px',
          background: 'var(--bg, rgba(0,0,0,0.04))', borderRadius: 'var(--radius-sm)', marginBottom: 20,
        }}>
          {limitLine}
          {preview.active && (
            <div style={{ color: '#991b1b', marginTop: 6 }}>
              Es läuft bereits ein Export.
            </div>
          )}
          {preview.limit_reached && !preview.active && (
            <div style={{ color: '#991b1b', marginTop: 6 }}>
              Das Monats-Limit für diesen Backup-Typ ist erreicht.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="admin-btn admin-btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          {!blocked && (
            <button className="admin-btn admin-btn-primary" onClick={onConfirm}>
              Ja, jetzt sichern
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

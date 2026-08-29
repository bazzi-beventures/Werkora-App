import { useState } from 'react'
import { apiUrl } from '../../../api/client'
import { fmtDate } from '../../utils/format'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ActionRow } from '../../components/ActionRow'
import { FileSections, REPORT_DOC_SECTIONS } from './FileSection'
import type { ProjectFile, ProjectFileCategory, ProjectReport } from './types'

interface ReportsTabProps {
  reports: ProjectReport[]
  // Optional: öffnet das Popup zum manuellen Erfassen (spiegelbildlich zu QuotesTab).
  // Fehlt der Prop, wird der Button nicht gezeigt (Abwärtskompatibilität).
  onShowCreateForm?: () => void
  // Optional: Link auf das Blanko-Rapportformular (PDF) für den Papier-Fallback.
  // Reiner Download wie die PDF-Links der Rapport-Zeilen — kein State, kein Fetch.
  paperRapportUrl?: string
  // Optional: löscht einen Rapport (inkl. Stunden/Material). Fehlt der Prop, wird
  // kein Löschen-Knopf gezeigt (Abwärtskompatibilität).
  onDelete?: (reportId: number) => Promise<void>
  // Optional: erzeugt ein fehlendes Rapport-PDF nach. Der Knopf erscheint nur an
  // Rapporten ohne Dokument — und bewusst auch an abgerechneten: das PDF ist
  // abgeleitet, nicht Inhalt. Ohne diesen Weg bleibt so ein Rapport dauerhaft
  // unlesbar (Bearbeiten, das sonst neu rendert, sperrt das billed-Gate).
  onRegeneratePdf?: (reportId: number) => Promise<void>
  // Optional: öffnet die Bearbeiten-Maske. Der Knopf erscheint nur an manuell
  // erfassten, noch nicht abgerechneten Rapporten — ein Chat-Rapport ist die
  // Aufnahme des Monteurs und wird nicht umgeschrieben (Server prüft dieselbe
  // Regel nochmals, db.report_edit_blocker).
  onEdit?: (reportId: number) => void
  // Optional: Datei-Sektion für hochgeladene Rapporte (Papier-Blatt, Fremdsystem).
  // Nur gezeigt, wenn die Upload-Props gesetzt sind — gleiche Handler wie der
  // Dokumente-Tab, die Sektion bestimmt die Kategorie ('rapport') implizit.
  files?: ProjectFile[]
  uploading?: boolean
  uploadingCategory?: ProjectFileCategory | null
  onUploadFile?: (category: ProjectFileCategory, files: File[]) => void
  onDeleteFile?: (fileId: string) => void
  onRenameFile?: (fileId: string, filename: string) => Promise<void>
  // Teilrapport (docs/specs/teilrapport.md §6.3). Alle drei optional — fehlen sie,
  // sieht der Reiter aus wie vor dem Feature.
  //
  // `teilrapportEnabled` schaltet nur das BÜNDELN: das Auflösen bleibt erreichbar,
  // damit ein Mandant, der das Feature versehentlich abschaltet, nicht auf
  // gebündelten und damit gesperrten Rapporten sitzenbleibt (Spec §5.5).
  teilrapportEnabled?: boolean
  onAggregate?: (reportIds: number[]) => Promise<void>
  onDissolve?: (reportId: number) => Promise<void>
  // Gesamtrapport ohne Kundenunterschrift abschliessen. Wie das Auflösen bewusst
  // NICHT ans Feature gebunden: ein Mandant, der es abschaltet, muss bestehende
  // Bündelungen noch abschliessen können — sonst bleiben die Stunden gefangen.
  onAccept?: (reportId: number) => Promise<void>
  // Nimmt einen bestehenden Rapport nachträglich in die Teilrapport-Serie auf und
  // öffnet danach die Erfassungsmaske für den nächsten Einsatz. Der Weg rückwärts
  // zur Abschluss-Wahl: dass eine Baustelle über mehrere Tage geht, stellt sich oft
  // erst am zweiten Tag heraus. Ans Feature gebunden wie das Bündeln.
  onMarkPartial?: (reportId: number) => Promise<void>
}

// Status-Badge einer Rapportzeile. Rein und exportiert, damit die Zustandslogik
// ohne Rendern prüfbar ist.
//
// Reihenfolge = Endgültigkeit: was abgerechnet ist, ist abgerechnet — egal wie es
// gebündelt war. Danach der Behälter (er trägt die Unterschrift), dann das
// gebündelte Kind, dann der freie Teilrapport. Der bekommt bewusst ein
// WARN-Badge: der teure Fehler ist nicht der falsche Betrag, sondern der
// vergessene Einsatz (docs/specs/teilrapport.md §3.5).
export function reportStatusBadge(r: ProjectReport): { label: string; cls: string; title?: string } {
  if (r.invoice_id) return { label: 'Abgerechnet', cls: 'admin-badge-closed' }
  if (r.is_aggregate) {
    if (r.dissolved_at) {
      return {
        label: 'Gesamtrapport – aufgelöst', cls: 'admin-badge-warning',
        title: 'Die Bündelung wurde aufgelöst. Das unterschriebene PDF bleibt als Beleg '
             + 'bestehen, zählt aber nicht mehr als Abnahme — die Teilrapporte sind wieder frei.',
      }
    }
    if (r.signature_timestamp) {
      return { label: 'Gesamtrapport', cls: 'admin-badge-paid',
               title: 'Vom Kunden unterschrieben — er deckt alle gebündelten Einsätze ab.' }
    }
    if (r.pl_accepted_at) {
      return { label: 'Gesamtrapport – ohne Unterschrift abgeschlossen', cls: 'admin-badge-sent',
               title: 'Vom Projektleiter abgeschlossen, weil keine Kundenunterschrift mehr zu '
                    + 'holen war. Zählt als Abnahme — die Einsätze sind verrechenbar.' }
    }
    return { label: 'Gesamtrapport – ohne Unterschrift', cls: 'admin-badge-warning',
             title: 'Noch nicht abgenommen. Bis dahin sind weder er noch seine '
                  + 'Teilrapporte verrechenbar.' }
  }
  if (r.is_partial) {
    return r.merged_into_report_id
      ? { label: 'Teilrapport – gebündelt', cls: 'admin-badge-sent',
          title: 'Gehört zu einem Gesamtrapport und ist gesperrt (kein Bearbeiten, kein Löschen).' }
      : { label: 'Teilrapport – offen', cls: 'admin-badge-warning',
          title: 'Noch keinem Gesamtrapport zugeordnet — dieser Einsatz wird NICHT verrechnet.' }
  }
  if (r.signature_timestamp) return { label: 'Unterschrieben', cls: 'admin-badge-paid' }
  if (r.source === 'admin_manual') return { label: 'Manuell', cls: 'admin-badge-sent' }
  return { label: 'Pendent', cls: 'admin-badge-open' }
}

export function ReportsTab({
  reports, onShowCreateForm, paperRapportUrl, onDelete, onEdit, onRegeneratePdf,
  files, uploading, uploadingCategory, onUploadFile, onDeleteFile, onRenameFile,
  teilrapportEnabled, onAggregate, onDissolve, onAccept, onMarkPartial,
}: ReportsTabProps) {
  const [confirmDelete, setConfirmDelete] = useState<ProjectReport | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null)
  // Bündeln: `null` = Dialog zu, sonst die angehakten IDs (vorausgewählt: alle).
  const [aggregateSelection, setAggregateSelection] = useState<number[] | null>(null)
  const [aggregating, setAggregating] = useState(false)
  const [confirmDissolve, setConfirmDissolve] = useState<ProjectReport | null>(null)
  const [dissolving, setDissolving] = useState(false)
  const [confirmAccept, setConfirmAccept] = useState<ProjectReport | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [confirmNextEinsatz, setConfirmNextEinsatz] = useState<ProjectReport | null>(null)
  const [markingPartial, setMarkingPartial] = useState(false)

  // Die bündelbaren Einsätze stehen bereits in `reports` — anders als in der
  // Monteur-PWA braucht es dafür keinen zweiten Fetch: der Admin-Reiter lädt
  // ohnehin ALLE Rapporte des Projekts, samt der vier Teilrapport-Spalten.
  //
  // Bündelbar ist seit 2026-08-27 nicht nur der markierte Teilrapport, sondern jeder
  // Einsatz ohne Rechnung, ohne bestehende Bündelung und ohne Kundenunterschrift:
  // dass eine Baustelle über mehrere Tage geht, merkt man meist erst, wenn der erste
  // Tag längst als gewöhnlicher Rapport gespeichert ist. Das Bündeln macht die
  // Angehakten zu Teilrapporten. Der unterschriebene bleibt draussen — seine Abnahme
  // steht schon (dieselbe Regel serverseitig in `aggregate_blocker`).
  const bundleable = reports.filter(
    r => !r.is_aggregate && !r.merged_into_report_id && !r.invoice_id && !r.signature_timestamp,
  )
  // Ein laufender Teilrapport wartet immer auf seinen Gesamtrapport; bei gewöhnlichen
  // Rapporten braucht es mindestens zwei, sonst stünde der Knopf an jedem Projekt mit
  // einem einzigen offenen Rapport.
  const showAggregateButton = bundleable.some(r => r.is_partial) || bundleable.length >= 2

  async function handleAggregate() {
    if (!onAggregate || !aggregateSelection?.length) return
    setAggregating(true)
    try {
      await onAggregate(aggregateSelection)
      setAggregateSelection(null)
    } catch {
      // Grund steht im Toast des Aufrufers (z.B. «bitte Liste neu laden») — der
      // Dialog bleibt offen, damit die Auswahl nicht verloren geht.
    } finally {
      setAggregating(false)
    }
  }

  async function handleAccept() {
    if (!onAccept || !confirmAccept) return
    setAccepting(true)
    try {
      await onAccept(confirmAccept.id)
      setConfirmAccept(null)
    } catch {
      // Grund im Toast; der Dialog bleibt offen
    } finally {
      setAccepting(false)
    }
  }

  async function handleMarkPartial() {
    if (!onMarkPartial || !confirmNextEinsatz) return
    setMarkingPartial(true)
    try {
      await onMarkPartial(confirmNextEinsatz.id)
      setConfirmNextEinsatz(null)
    } catch {
      // wie oben: Grund im Toast, Dialog bleibt offen
    } finally {
      setMarkingPartial(false)
    }
  }

  async function handleDissolve() {
    if (!onDissolve || !confirmDissolve) return
    setDissolving(true)
    try {
      await onDissolve(confirmDissolve.id)
      setConfirmDissolve(null)
    } catch {
      // wie oben: Grund im Toast, Dialog bleibt offen
    } finally {
      setDissolving(false)
    }
  }

  // Fehler meldet der Aufrufer als Toast; hier zählt nur, dass der Knopf wieder
  // klickbar wird, damit ein zweiter Versuch möglich bleibt.
  async function handleRegenerate(reportId: number) {
    if (!onRegeneratePdf) return
    setRegeneratingId(reportId)
    try {
      await onRegeneratePdf(reportId)
    } finally {
      setRegeneratingId(null)
    }
  }

  // Abgerechnete Rapporte bleiben tabu: ihre Positionen stehen auf einer Rechnung.
  // Alles andere darf der Projektleiter wegräumen — auch unterschriebene Rapporte,
  // dann aber mit deutlicherem Hinweis. Server prüft dieselbe Regel nochmals.
  async function handleDelete() {
    if (!onDelete || !confirmDelete) return
    setDeleting(true)
    try {
      await onDelete(confirmDelete.id)
      setConfirmDelete(null)
    } catch {
      // Grund steht im Toast des Aufrufers (z.B. "hängt an einer Rechnung") —
      // der Dialog bleibt offen, damit die Aktion nicht still verpufft.
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Rapporte</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {reports.length === 0 ? 'keine' : `${reports.length} Rapport${reports.length === 1 ? '' : 'e'}`}
          </span>
          {paperRapportUrl && (
            <a
              href={paperRapportUrl}
              target="_blank"
              rel="noreferrer"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              title="Blanko-Formular drucken, auf der Baustelle von Hand ausfüllen, danach über «+ Neuer Rapport» erfassen und das ausgefüllte Blatt unten hochladen"
            >
              Papier-Rapport (PDF)
            </a>
          )}
          {teilrapportEnabled && onAggregate && aggregateSelection === null && showAggregateButton && (
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              onClick={() => setAggregateSelection(bundleable.map(r => r.id))}
              title="Offene Einsätze zu einem Gesamtrapport bündeln, den der Kunde einmal unterschreibt. Die Angehakten werden dabei zu Teilrapporten und bis zur Unterschrift nicht verrechnet."
            >
              Gesamtrapport erstellen ({bundleable.length})
            </button>
          )}
          {onShowCreateForm && (
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              onClick={onShowCreateForm}
            >
              + Neuer Rapport
            </button>
          )}
        </div>
      </div>
      {aggregateSelection !== null && (
        <div style={{
          padding: 14, marginBottom: 14, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--surface-2)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Welche Einsätze soll der Gesamtrapport abdecken?
          </div>
          {bundleable.map(p => (
            <label key={p.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '4px 0', fontSize: 13, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={aggregateSelection.includes(p.id)}
                onChange={() => setAggregateSelection(prev => (prev ?? []).includes(p.id)
                  ? (prev ?? []).filter(id => id !== p.id)
                  : [...(prev ?? []), p.id])}
              />
              <span style={{ minWidth: 0 }}>
                <strong>{fmtDate(p.report_date)}</strong>
                <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                  {p.monteure || p.created_by || '—'}
                </span>
                {p.description ? <span style={{ color: 'var(--muted)' }}> · {p.description}</span> : null}
              </span>
            </label>
          ))}
          <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0' }}>
            Der Gesamtrapport entsteht ohne Unterschrift — sie holt der Monteur in der
            App beim Kunden. Bis dahin ist keiner der gebündelten Einsätze verrechenbar.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              onClick={() => void handleAggregate()}
              disabled={aggregating || aggregateSelection.length === 0}
            >
              {aggregating ? 'Wird erstellt…' : 'Gesamtrapport erstellen'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              onClick={() => setAggregateSelection(null)}
              disabled={aggregating}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {reports.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Rapporte für dieses Projekt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map(r => {
            const signed = !!r.signature_timestamp
            const billed = !!r.invoice_id
            const manual = r.source === 'admin_manual'
            // Wer vor Ort war, nicht wer getippt hat: `monteure` kommt aus den
            // erfassten Stunden — dieselbe Regel wie die Kopfzeile des Rapport-PDFs.
            // Beim nacherfassten Rapport standen hier sonst Büro (Liste) und Monteur
            // (PDF) für denselben Rapport nebeneinander.
            const monteur = r.monteure || r.created_by || '—'
            // Den Erfasser nur nennen, wenn er nicht selbst vor Ort war — genau die
            // Konstellation, die das PDF unten mit «Manuell erfasst durch …» vermerkt.
            const erfasser = r.monteure && r.created_by && r.created_by !== r.monteure
              ? r.created_by
              : null
            const status = reportStatusBadge(r)
            // Gebündelt = gesperrt, auch vor der Unterschrift (Spec §3.3). Der Server
            // lehnt es ohnehin ab; der Knopf soll gar nicht erst dastehen.
            const merged = !!r.merged_into_report_id
            // Auflösen: der Projektleiter darf auch den unterschriebenen — als
            // Einziger (Spec §3.6). Verrechnet ist Schluss.
            const canDissolve = !!onDissolve && !!r.is_aggregate && !billed && !r.dissolved_at
            // Abschliessen: nur der noch nicht abgenommene Behälter. Unterschrieben
            // ist die stärkere Abnahme, aufgelöst und verrechnet sind Endzustände.
            const canAccept = !!onAccept && !!r.is_aggregate && !billed && !r.dissolved_at
              && !signed && !r.pl_accepted_at
            // «Weiterer Einsatz»: Spiegel von `mark_partial_blocker` — verrechnet,
            // gebündelt oder selbst ein Behälter geht nicht. Ein bereits freier
            // Teilrapport darf: dann entfällt nur die Umstellung, und der Knopf
            // führt direkt in die Maske für den nächsten Tag.
            const canAddNext = !!onMarkPartial && !!teilrapportEnabled
              && !billed && !merged && !r.is_aggregate
            return (
              <ActionRow key={r.id} style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(r.report_date)}</span>
                    <span className={`admin-badge ${status.cls}`} title={status.title}>{status.label}</span>
                    {r.is_warranty && (
                      <span
                        className="admin-badge admin-badge-warning"
                        title="Als Garantiefall erfasst — beim Verrechnen die Positionen prüfen."
                      >
                        Garantie
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {monteur}
                    {erfasser ? ` (erfasst von ${erfasser})` : ''}
                    {r.description ? ` · ${r.description}` : ''}
                  </div>
                </div>
                {r.storage_path ? (
                  <a href={apiUrl(`/pwa/admin/reports/${r.id}/pdf`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">
                    PDF
                  </a>
                ) : onRegeneratePdf ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    onClick={() => void handleRegenerate(r.id)}
                    disabled={regeneratingId === r.id}
                    title="Zu diesem Rapport fehlt das PDF — aus den erfassten Stunden und Material neu erzeugen. Inhalt und Unterschrift bleiben unverändert."
                  >
                    {regeneratingId === r.id ? 'Erzeuge…' : 'PDF erzeugen'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>kein PDF</span>
                )}
                {canAccept && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    onClick={() => setConfirmAccept(r)}
                    title="Ohne Kundenunterschrift abschliessen — wenn beim Kunden keine Unterschrift mehr zu holen ist. Danach sind die gebündelten Einsätze verrechenbar."
                  >
                    Ohne Unterschrift abschliessen
                  </button>
                )}
                {canDissolve && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    onClick={() => setConfirmDissolve(r)}
                    title="Die Bündelung auflösen — die Teilrapporte werden wieder frei und lassen sich neu zusammenstellen."
                  >
                    Auflösen
                  </button>
                )}
                {canAddNext && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    onClick={() => setConfirmNextEinsatz(r)}
                    title={r.is_partial
                      ? 'Noch einen Einsatz auf dieser Baustelle erfassen'
                      : 'Mehrtägige Baustelle: diesen Rapport in die Serie aufnehmen und den nächsten Einsatz erfassen'}
                  >
                    Weiterer Einsatz
                  </button>
                )}
                {onEdit && manual && !billed && !signed && !merged && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    onClick={() => onEdit(r.id)}
                    title="Datum, Stunden, Material und Beschrieb dieses Rapports korrigieren"
                  >
                    Bearbeiten
                  </button>
                )}
                {onDelete && !billed && !merged && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    onClick={() => setConfirmDelete(r)}
                    title="Rapport inkl. Stunden und Material löschen"
                  >
                    Löschen
                  </button>
                )}
              </ActionRow>
            )
          })}
        </div>
      )}

      {/* Hochgeladene Rapporte: das ausgefüllte Papier-Blatt (siehe Knopf oben) oder
          ein Rapport aus einem Fremdsystem. Bewusst hier statt im Dokumente-Tab —
          und bewusst als Datei-Kategorie: solche Blätter haben oft keine erfasste
          Rapport-Zeile, an die man sie hängen könnte. */}
      {onUploadFile && onDeleteFile && onRenameFile && (
        <div style={{ marginTop: 24 }}>
          <FileSections
            files={files ?? []}
            sections={REPORT_DOC_SECTIONS}
            uploading={!!uploading}
            uploadingCategory={uploadingCategory ?? null}
            onUpload={onUploadFile}
            onDelete={onDeleteFile}
            onRename={onRenameFile}
          />
        </div>
      )}

      {confirmAccept && (
        <ConfirmDialog
          title="Ohne Kundenunterschrift abschliessen?"
          message={
            <>
              Der Gesamtrapport vom {fmtDate(confirmAccept.report_date)} gilt danach als
              abgenommen — {' '}
              {reports.filter(x => x.merged_into_report_id === confirmAccept.id).length}{' '}
              Einsätze werden verrechenbar. Auf dem PDF steht statt der Unterschrift
              «Abgeschlossen durch {'{'}dein Name{'}'} — ohne Kundenunterschrift».
              <div style={{ marginTop: 8, color: 'var(--muted)' }}>
                Gedacht für die Baustelle, auf der keine Unterschrift mehr zu holen ist.
                Ist der Kunde noch erreichbar, lass ihn in der Mitarbeiter-App
                unterschreiben — das ist der stärkere Beleg.
              </div>
            </>
          }
          confirmLabel="Abschliessen"
          busyLabel="Wird abgeschlossen…"
          busy={accepting}
          variant="primary"
          onCancel={() => { if (!accepting) setConfirmAccept(null) }}
          onConfirm={() => void handleAccept()}
        />
      )}

      {confirmDissolve && (
        <ConfirmDialog
          title="Bündelung auflösen?"
          message={
            <>
              {confirmDissolve.signature_timestamp || confirmDissolve.pl_accepted_at ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {confirmDissolve.signature_timestamp
                      ? 'Der Kunde hat dieses PDF unterschrieben.'
                      : 'Dieser Gesamtrapport ist bereits abgeschlossen.'}
                  </div>
                  Der Beleg bleibt bestehen und wird als aufgelöst markiert — er zählt
                  danach nicht mehr als Abnahme. Die {' '}
                  {reports.filter(x => x.merged_into_report_id === confirmDissolve.id).length}{' '}
                  Teilrapporte werden wieder frei und brauchen eine neue Unterschrift,
                  bevor sie verrechnet werden können.
                </>
              ) : (
                <>
                  Die gebündelten Teilrapporte werden wieder frei und lassen sich neu
                  zusammenstellen. Der Gesamtrapport vom {fmtDate(confirmDissolve.report_date)} {' '}
                  verschwindet — er war noch nicht unterschrieben, es geht kein Beleg verloren.
                </>
              )}
            </>
          }
          confirmLabel="Auflösen"
          busyLabel="Wird aufgelöst…"
          busy={dissolving}
          variant={confirmDissolve.signature_timestamp || confirmDissolve.pl_accepted_at ? 'danger' : 'primary'}
          onCancel={() => { if (!dissolving) setConfirmDissolve(null) }}
          onConfirm={() => void handleDissolve()}
        />
      )}

      {confirmNextEinsatz && (
        <ConfirmDialog
          title={confirmNextEinsatz.is_partial ? 'Weiteren Einsatz erfassen?' : 'Zur mehrtägigen Baustelle machen?'}
          message={
            <>
              {confirmNextEinsatz.is_partial ? (
                <>
                  Der Rapport vom {fmtDate(confirmNextEinsatz.report_date)} ist bereits
                  Teil der Serie. Gleich öffnet sich die Maske für den nächsten Einsatz.
                </>
              ) : (
                <>
                  Der Rapport vom {fmtDate(confirmNextEinsatz.report_date)} wird zum
                  Teilrapport: er wird später zusammen mit den weiteren Einsätzen zu einem
                  Gesamtrapport gebündelt, den der Kunde EINMAL unterschreibt.
                  <div style={{ marginTop: 8 }}>
                    <strong>Bis dahin wird er nicht verrechnet.</strong> Stunden, Material,
                    Beschrieb, das PDF und eine bereits geholte Unterschrift bleiben
                    unverändert.
                  </div>
                </>
              )}
            </>
          }
          confirmLabel="Weiter"
          busyLabel="Wird umgestellt…"
          busy={markingPartial}
          variant="primary"
          onCancel={() => { if (!markingPartial) setConfirmNextEinsatz(null) }}
          onConfirm={() => void handleMarkPartial()}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Rapport löschen?"
          message={
            <>
              {confirmDelete.signature_timestamp && (
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  Dieser Rapport ist vom Kunden unterschrieben.
                </div>
              )}
              Rapport vom {fmtDate(confirmDelete.report_date)}
              {(confirmDelete.monteure || confirmDelete.created_by)
                ? ` (${confirmDelete.monteure || confirmDelete.created_by})` : ''} wirklich löschen?
              Erfasste Stunden, Material und Fotos werden mitgelöscht, das Material wird
              ins Lager zurückgebucht. Das lässt sich nicht rückgängig machen.
            </>
          }
          confirmLabel="Endgültig löschen"
          busyLabel="Wird gelöscht…"
          busy={deleting}
          variant="danger"
          onCancel={() => { if (!deleting) setConfirmDelete(null) }}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}

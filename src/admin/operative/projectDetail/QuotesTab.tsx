import { apiUrl } from '../../../api/client'
import { fmtCHF, fmtDate } from '../../utils/format'
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_BADGE } from '../../constants/statuses'
import { ActionRow } from '../../components/ActionRow'
import { FileSections, QUOTE_DOC_SECTIONS } from './FileSection'
import { groupByParent } from './types'
import type { ProjectFile, ProjectFileCategory, ProjectInvoice, ProjectQuote } from './types'

interface QuotesTabProps {
  quotes: ProjectQuote[]
  invoices: ProjectInvoice[]
  regeneratingQuoteId: number | null
  hasLocalDraft: boolean
  // Feature offerte_dank_mail: steuert den „Dankeschön senden"-Knopf bei
  // angenommenen Offerten (Per-Knopfdruck-Modus bzw. Auto-Versand-Fallback).
  dankEnabled: boolean
  // Feature offerte_absage_mail: steuert den „Absage senden"-Knopf bei abgelehnten
  // Offerten (Per-Knopfdruck-Modus bzw. Auto-Versand-Fallback).
  absageEnabled: boolean
  sendingRejectionId: number | null
  onShowCreateForm: () => void
  onResumeDraft: () => void
  onUpdateStatus: (quoteId: number, status: string) => void
  onRegenerate: (quoteId: number) => void
  onSend: (quote: ProjectQuote) => void
  // Öffnet den Danke-Mail-Dialog (Empfänger-Abfrage) — der Versand selbst
  // passiert im Dialog, deshalb die ganze Offerte statt nur der ID.
  onSendThankyou: (quote: ProjectQuote) => void
  onSendOrderConfirmation: (quote: ProjectQuote) => void
  onSendRejection: (quoteId: number) => void
  onEdit: (quoteId: number) => void
  // „Weitere Offerte" (mehrere Varianten pro Projekt) — Standard-Fähigkeit, kein Flag.
  addingVariantId?: number | null
  onAddVariant?: (quoteId: number, kind: 'variante' | 'mehrfach') => void
  // Optional: Datei-Sektion für hochgeladene Offerten (Papier, Fremdsystem).
  // Nur gezeigt, wenn die Upload-Props gesetzt sind — gleiche Handler wie der
  // Dokumente-Tab, die Sektion bestimmt die Kategorie ('offerte') implizit.
  files?: ProjectFile[]
  uploading?: boolean
  uploadingCategory?: ProjectFileCategory | null
  onUploadFile?: (category: ProjectFileCategory, files: File[]) => void
  onDeleteFile?: (fileId: string) => void
  onRenameFile?: (fileId: string, filename: string) => Promise<void>
}

export function QuotesTab({
  quotes, invoices, regeneratingQuoteId, hasLocalDraft, dankEnabled,
  absageEnabled, sendingRejectionId,
  onShowCreateForm, onResumeDraft, onUpdateStatus, onRegenerate, onSend, onSendThankyou, onSendOrderConfirmation,
  onSendRejection, onEdit, addingVariantId, onAddVariant,
  files, uploading, uploadingCategory, onUploadFile, onDeleteFile, onRenameFile,
}: QuotesTabProps) {
  // Workaround-Hinweis: solange die Mitarbeiter-PWA noch nicht ausgerollt ist,
  // werden Rechnungen direkt aus der Offerte erstellt. Eine solche Rechnung
  // markiert die zugehörige Offertengruppe mit einem Badge.
  const hasWorkaroundInvoice = invoices.some(i => i.created_without_report)

  // Anzahl Varianten (= Ketten) und Art je Variantengruppe — nur für die Label-Anzeige
  // im Gruppenkopf (Option A/B bzw. Offerte 1/2). Die Art beim Anlegen bestimmt der
  // geklickte Button (+ Variante / + Weitere Offerte), nicht mehr ein Dialog.
  const groupInfo = new Map<string, { chains: Set<number | string>; kind: string }>()
  for (const q of quotes) {
    const gid = q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`
    if (!groupInfo.has(gid)) groupInfo.set(gid, { chains: new Set(), kind: q.variant_group_kind ?? 'variante' })
    groupInfo.get(gid)!.chains.add(q.parent_id ?? q.id)
  }
  const groupSize = (q: ProjectQuote) => groupInfo.get(q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`)?.chains.size ?? 1
  const groupKind = (q: ProjectQuote): 'variante' | 'mehrfach' =>
    (groupInfo.get(q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`)?.kind === 'mehrfach' ? 'mehrfach' : 'variante')

  // Ketten je Slot (Gruppe + Rang): teilen sich mehrere Ketten einen Rang, sind das
  // Untervarianten eines Slots ("Offerte 3 · Option A/B", die zuerst erstellte = A).
  const slotChains = new Map<string, (number | string)[]>()
  for (const q of quotes) {
    const gid = q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`
    const key = `${gid}:${q.variant_rank ?? 1}`
    const root = q.parent_id ?? q.id
    const arr = slotChains.get(key) ?? []
    if (!arr.includes(root)) slotChains.set(key, [...arr, root].sort((a, b) => Number(a) - Number(b)))
  }

  function labelFor(q: ProjectQuote): string {
    const rank = q.variant_rank ?? 1
    if (groupKind(q) === 'variante') {
      return rank >= 1 && rank <= 26 ? `Option ${String.fromCharCode(64 + rank)}` : `Option ${rank}`
    }
    const gid = q.variant_group_id ?? `chain-${q.parent_id ?? q.id}`
    const chains = slotChains.get(`${gid}:${rank}`) ?? []
    const base = `Offerte ${rank}`
    if (chains.length > 1) {
      const idx = chains.indexOf(q.parent_id ?? q.id)
      const letter = idx >= 0 && idx < 26 ? String.fromCharCode(65 + idx) : String(idx + 1)
      return `${base} · Option ${letter}`
    }
    return base
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="admin-section-title" style={{ margin: 0 }}>Offerten</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Nur sichtbar, wenn ein lokal gespeicherter, noch nicht abgeschickter
              Entwurf für dieses Projekt existiert (versehentlich geschlossen). */}
          {hasLocalDraft && (
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              onClick={onResumeDraft}
              title="Eine begonnene, noch nicht erstellte Offerte fortsetzen"
            >
              ● Entwurf fortsetzen
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-primary"
            onClick={onShowCreateForm}
          >
            + Neue Offerte
          </button>
        </div>
      </div>
      {quotes.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Noch keine Offerten.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupByParent(quotes).map((group, groupIdx) => {
            const latest = group[0]
            const showWorkaroundBadge = hasWorkaroundInvoice && groupIdx === 0
            return (
              <div key={latest.parent_id ?? latest.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, background: 'var(--surface-2)' }}>
                {groupSize(latest) > 1 && (
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="admin-badge admin-badge-approved" style={{ fontSize: 11 }}>{labelFor(latest)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {groupKind(latest) === 'mehrfach' ? 'zusätzliche Offerte (mehrere annehmbar)' : 'Variante (Kunde wählt eine)'}
                    </span>
                  </div>
                )}
                {showWorkaroundBadge && (
                  <div style={{ marginBottom: 8, fontSize: 12 }}>
                    <span className="admin-badge admin-badge-pending" title="Rechnung wurde direkt aus dieser Offerte erstellt, weil noch kein vom Kunden unterschriebener Arbeitsrapport vorliegt.">
                      ⚠ Rechnung ohne Rapport erstellt
                    </span>
                  </div>
                )}
                {group.map((q, idx) => {
                  // Nur der aktuellste Entwurf ist direkt bearbeitbar — ein Klick auf
                  // die Zeile öffnet die Maske. Klicks auf Buttons/Links (PDF, Senden …)
                  // sollen NICHT ins Bearbeiten springen.
                  const editable = idx === 0 && q.status === 'entwurf'
                  return (
                  <ActionRow
                    key={q.id}
                    onClick={editable ? (e) => { if (!(e.target as HTMLElement).closest('button, a')) onEdit(q.id) } : undefined}
                    title={editable ? 'Klicken zum Bearbeiten (z.B. Vertipper korrigieren)' : undefined}
                    style={{ padding: '6px 4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none', cursor: editable ? 'pointer' : 'default' }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 32, color: idx === 0 ? 'var(--primary)' : 'var(--muted)' }}>V{q.version}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, minWidth: 130 }}>{q.quote_number}</span>
                    <span className={`admin-badge ${QUOTE_STATUS_BADGE[q.status] || 'admin-badge-draft'}`}>{QUOTE_STATUS_LABELS[q.status] || q.status}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(q.created_at)}</span>
                    {editable && <span style={{ fontSize: 12, color: 'var(--muted)' }} title="Klicken zum Bearbeiten">✎ bearbeiten</span>}
                    {dankEnabled && q.thankyou_sent_at && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }} title="Danke-Mail an den Kunden wurde versendet">
                        ✓ Danke-Mail {fmtDate(q.thankyou_sent_at)}
                      </span>
                    )}
                    {absageEnabled && q.rejection_mail_sent_at && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }} title="Absage-Mail an den Kunden wurde versendet">
                        ✓ Absage-Mail {fmtDate(q.rejection_mail_sent_at)}
                      </span>
                    )}
                    {/* Ohne Feature-Bedingung — die Auftragsbestätigung steht jedem Mandanten offen. */}
                    {q.order_confirmation_sent_at && (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }} title="Auftragsbestätigung an den Kunden wurde versendet">
                        ✓ Auftragsbestätigung {fmtDate(q.order_confirmation_sent_at)}
                      </span>
                    )}
                    {/* Summe + Aktionen als ein rechtsbündiger Block, der bei knappem
                        Platz (Kommentar-Seitenleiste) als Einheit umbricht – statt die
                        Summe vom Button-Cluster zu trennen. */}
                    <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtCHF(q.total_amount)}</span>
                      {q.storage_path && (
                        <a href={apiUrl(`/pwa/admin/quotes/${q.id}/pdf`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">PDF</a>
                      )}
                      {q.xlsx_storage_path && (
                        <a href={apiUrl(`/pwa/admin/quotes/${q.id}/xlsx`)} target="_blank" rel="noreferrer" className="admin-btn admin-btn-secondary admin-btn-sm">XLSX</a>
                      )}
                      {idx === 0 && (
                        <>
                          {['entwurf', 'gesendet'].includes(q.status) && (
                            <button
                              className="admin-btn admin-btn-primary admin-btn-sm"
                              onClick={() => onSend(q)}
                            >
                              {q.status === 'gesendet' ? 'Erneut senden' : 'Senden'}
                            </button>
                          )}
                          {/* Auch bei 'gesendet': nach dem Versand will man den Ausgang
                              festhalten — genau dann meldet sich der Kunde ja. Vorher war
                              nur 'entwurf' erlaubt, was den Normalfall aussperrte. */}
                          {['entwurf', 'gesendet'].includes(q.status) && (
                            <>
                              <button
                                className="admin-btn admin-btn-success admin-btn-sm"
                                onClick={() => onUpdateStatus(q.id, 'akzeptiert')}
                                title="Kunde hat die Offerte angenommen"
                              >
                                Akzeptiert
                              </button>
                              <button
                                className="admin-btn admin-btn-danger admin-btn-sm"
                                onClick={() => onUpdateStatus(q.id, 'abgelehnt')}
                                title="Kunde hat die Offerte abgelehnt"
                              >
                                Abgelehnt
                              </button>
                            </>
                          )}
                          {dankEnabled && q.status === 'akzeptiert' && !q.thankyou_sent_at && (
                            <button
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => onSendThankyou(q)}
                              title="Dankesmail an den Kunden senden"
                            >
                              Dankeschön senden
                            </button>
                          )}
                          {/* Kein Feature-Flag, Knopf bleibt nach dem Versand stehen:
                              siehe quotes/QuoteListParts.tsx */}
                          {q.status === 'akzeptiert' && (
                            <button
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => onSendOrderConfirmation(q)}
                              title={q.order_confirmation_sent_at
                                ? 'Auftragsbestätigung erneut an den Kunden senden'
                                : 'Auftragsbestätigung an den Kunden senden'}
                            >
                              {q.order_confirmation_sent_at ? 'AB erneut senden' : 'Auftragsbestätigung'}
                            </button>
                          )}
                          {absageEnabled && q.status === 'abgelehnt' && !q.rejection_mail_sent_at && (
                            <button
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              disabled={sendingRejectionId === q.id}
                              onClick={() => onSendRejection(q.id)}
                              title="Absage-Mail an den Kunden senden"
                            >
                              {sendingRejectionId === q.id ? '…' : 'Absage senden'}
                            </button>
                          )}
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            disabled={regeneratingQuoteId === q.id}
                            onClick={() => onRegenerate(q.id)}
                            title="Neue Offerten-Nummer mit gleichen Positionen — Kunde und Objekt werden vom aktuellen Projektstand übernommen"
                          >
                            {regeneratingQuoteId === q.id ? '…' : 'Neue Version'}
                          </button>
                          {onAddVariant && (
                            <>
                              <button
                                className="admin-btn admin-btn-secondary admin-btn-sm"
                                disabled={addingVariantId === q.id}
                                onClick={() => onAddVariant(q.id, 'variante')}
                                title="Kopiert diese Offerte als Variante — der Kunde wählt in einem Mail GENAU EINE (Option A/B/C)"
                              >
                                {addingVariantId === q.id ? '…' : '+ Variante'}
                              </button>
                              <button
                                className="admin-btn admin-btn-secondary admin-btn-sm"
                                disabled={addingVariantId === q.id}
                                onClick={() => onAddVariant(q.id, 'mehrfach')}
                                title="Eine eigenständige zusätzliche Offerte — der Kunde kann sie zusätzlich annehmen (Offerte 1/2)"
                              >
                                {addingVariantId === q.id ? '…' : '+ Weitere Offerte'}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </ActionRow>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* Dokumente rund um die Offerte, die keine Offerten-Zeile haben: hochgeladene
          Fremd-/Papier-Offerten und die versendeten Auftragsbestätigungen (das PDF
          legt der Versand-Knopf selbst ab). Bewusst hier statt im Dokumente-Tab —
          und bewusst als Datei-Kategorien statt als eigener Reiter. */}
      {onUploadFile && onDeleteFile && onRenameFile && (
        <div style={{ marginTop: 24 }}>
          <FileSections
            files={files ?? []}
            sections={QUOTE_DOC_SECTIONS}
            uploading={!!uploading}
            uploadingCategory={uploadingCategory ?? null}
            onUpload={onUploadFile}
            onDelete={onDeleteFile}
            onRename={onRenameFile}
          />
        </div>
      )}
    </div>
  )
}

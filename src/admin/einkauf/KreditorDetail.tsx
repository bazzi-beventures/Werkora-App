import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { createSupplier, listSuppliers, type Supplier } from '../../api/admin/suppliers'
import {
  getKreditor, kreditorAblehnen, kreditorErneutLesen, kreditorVerwerfen, kreditorVisieren,
  kreditorVisumZuruecknehmen, kreditorZurVisierung, patchKreditor, type KreditorDetail as Bill,
} from '../../api/kreditoren'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog'
import type { ToastFn } from '../components/useToast'
import { useUnsavedChangesGuard } from '../unsavedChanges'
import { fmtDate, formatDateTime } from '../utils/format'
import KreditorBeleg from './KreditorBeleg'
import { AblehnenDialog, NeuerLieferantDialog, VisumDialog, type NeuerLieferant } from './KreditorDialoge'
import KreditorKopf from './KreditorKopf'
import KreditorPositionen from './KreditorPositionen'
import {
  POLL_MS, baueKreditorPatch, fmtBetrag, istGeaendert, kopfAus, leseFehlerLabel, parseZahl,
  statusBadgeClass, statusLabel, zeilenAus, type KopfEntwurf, type ZeilenEntwurf,
} from './kreditorenLogik'

/**
 * Eine Lieferantenrechnung — Spec §8.1: Beleg links, Felder rechts, Hinweise oben.
 * Am Handy untereinander, der Beleg als Knopf; Liste und Visum gehen dort, die
 * Kontierung der Positionen ist Desktop.
 */

interface Props {
  billId: string
  isMobile: boolean
  showToast: ToastFn
  /** Zurück zur Liste (nach Visum, Ablehnen, Verwerfen auch von selbst). */
  onClose: () => void
  /** Liste und Zahl am Navigationspunkt neu laden. */
  onChanged: () => void
  /** Eine andere Rechnung öffnen (Link einer Dubletten-Sperre). */
  onOpen: (id: string) => void
}

type Dialog = 'visum' | 'ablehnen' | 'verwerfen' | 'lieferant' | 'schliessen' | null

export default function KreditorDetail({ billId, isMobile, showToast, onClose, onChanged, onOpen }: Props) {
  const [bill, setBill] = useState<Bill | null>(null)
  const [kopf, setKopf] = useState<KopfEntwurf | null>(null)
  const [zeilen, setZeilen] = useState<ZeilenEntwurf[]>([])
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [lieferantFehler, setLieferantFehler] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const dirty = bill !== null && kopf !== null && istGeaendert(bill, kopf, zeilen)
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty })

  function uebernehme(neu: Bill, entwurf: boolean) {
    setBill(neu)
    if (entwurf) {
      setKopf(kopfAus(neu))
      setZeilen(zeilenAus(neu))
    }
  }

  useEffect(() => {
    let aktiv = true
    getKreditor(billId)
      .then(b => { if (aktiv) { uebernehme(b, true); setLadeFehler(null) } })
      .catch(e => { if (aktiv) setLadeFehler(e instanceof ApiError && e.status === 404 ? 'Diese Rechnung gibt es nicht (mehr).' : 'Die Rechnung konnte nicht geladen werden.') })
    listSuppliers().then(s => { if (aktiv) setSuppliers(s) }).catch(() => { /* Auswahl bleibt leer */ })
    return () => { aktiv = false }
  }, [billId])

  // Solange das Lesen läuft, alle 4 s nachsehen. Ein angefangener Entwurf bleibt stehen.
  const liest = bill?.lese_status === 'laeuft'
  useEffect(() => {
    if (!liest) return
    const t = setInterval(() => {
      getKreditor(billId).then(b => uebernehme(b, !dirtyRef.current)).catch(() => { /* nächster Versuch */ })
    }, POLL_MS)
    return () => clearInterval(t)
  }, [liest, billId])

  async function speichern(): Promise<boolean> {
    if (!bill || !kopf) return false
    const { patch, fehler: f } = baueKreditorPatch(bill, kopf, zeilen)
    if (f.length) { setFehler(f.join(' · ')); return false }
    if (Object.keys(patch).length === 0) return true
    setBusy('speichern')
    setFehler(null)
    try {
      uebernehme(await patchKreditor(bill.id, patch), true)
      showToast('Gespeichert', 'success')
      onChanged()
      return true
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Speichern fehlgeschlagen')
      if (e instanceof ApiError && e.status === 409) void neuLaden()
      return false
    } finally {
      setBusy(null)
    }
  }

  useUnsavedChangesGuard(() => dirty, speichern)

  async function neuLaden() {
    try { uebernehme(await getKreditor(billId), true) } catch { /* Fehler steht schon da */ }
  }

  /** Eine Statusaktion. `zurueck`: danach zur Liste (die Rechnung ist hier erledigt). */
  async function aktion(name: string, fn: () => Promise<Bill>, erfolg: string, zurueck = false) {
    if (!bill) return
    // Weitergeben und Visieren gelten dem, was auf dem Schirm steht — also erst
    // speichern. Die übrigen Aktionen verwerfen einen Entwurf (der Server lädt neu).
    const speichernZuerst = name === 'zur_visierung' || name === 'visieren'
    if (speichernZuerst && dirty && !(await speichern())) { setDialog(null); return }
    setBusy(name)
    setFehler(null)
    try {
      const neu = await fn()
      uebernehme(neu, true)
      setDialog(null)
      showToast(erfolg, 'success')
      onChanged()
      if (zurueck) onClose()
    } catch (e) {
      setDialog(null)
      setFehler(e instanceof Error ? e.message : 'Aktion fehlgeschlagen')
      if (e instanceof ApiError && e.status === 409) void neuLaden()
    } finally {
      setBusy(null)
    }
  }

  async function lieferantAnlegen(l: NeuerLieferant) {
    if (!bill) return
    setBusy('lieferant')
    setLieferantFehler(null)
    try {
      const s = await createSupplier({
        name: l.name.trim(), prefix: l.prefix,
        uid: l.uid.trim() || null, street: l.street.trim() || null,
        zip: l.zip.trim() || null, city: l.city.trim() || null,
      })
      setSuppliers(prev => [...prev, s])
      const neu = await patchKreditor(bill.id, { supplier_id: s.id })
      // Nur den Lieferanten übernehmen — ein angefangener Entwurf daneben bleibt.
      setBill(neu)
      setKopf(k => (k ? { ...k, supplier_id: neu.supplier_id ?? '' } : kopfAus(neu)))
      setDialog(null)
      showToast(`Lieferant ${s.name} angelegt`, 'success')
      onChanged()
    } catch (e) {
      setLieferantFehler(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  const zurueckKnopf = (
    <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => (dirty ? setDialog('schliessen') : onClose())}>
      ← Liste
    </button>
  )

  if (ladeFehler) {
    return <div>{zurueckKnopf}<div role="alert" className="admin-error" style={{ marginTop: 12 }}>{ladeFehler}</div></div>
  }
  if (!bill || !kopf) {
    return <div>{zurueckKnopf}<div className="admin-loading"><div className="admin-spinner" /> Laden…</div></div>
  }

  const a = bill.aktionen
  const editable = a.bearbeiten && busy === null
  const skontoBetrag = bill.skonto_pct && bill.gross_total ? (bill.gross_total * bill.skonto_pct) / 100 : null
  const titel = [bill.supplier_name ?? bill.supplier_name_beleg ?? 'Unbekannter Lieferant', bill.bill_number]
    .filter(Boolean).join(' · ')

  const felder = (
    <div className="kred-felder">
      <KreditorKopf bill={bill} kopf={kopf} suppliers={suppliers} editable={editable}
                    onChange={teil => setKopf(k => (k ? { ...k, ...teil } : k))}
                    onNeuerLieferant={() => { setLieferantFehler(null); setDialog('lieferant') }} />
      <div className="kred-karte">
        <div className="admin-section-title">Positionen</div>
        <KreditorPositionen bill={bill} zeilen={zeilen} onChange={setZeilen} editable={editable}
                            isMobile={isMobile} netto={parseZahl(kopf.net_total)} />
      </div>
    </div>
  )

  return (
    <div>
      <div className="kred-detail-kopf">
        {zurueckKnopf}
        <span className="kred-detail-titel">{titel}</span>
        <span className={statusBadgeClass(bill.status)}>{statusLabel(bill.status)}</span>
        {bill.is_credit_note && <span className="kred-marke">Gutschrift</span>}
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{fmtBetrag(bill.gross_total, bill.currency)}</span>
      </div>

      {bill.skonto_pct && bill.skonto_until && (
        <div className="kred-skonto" style={{ marginBottom: 8 }}>
          {bill.skonto_pct} % Skonto bis {fmtDate(bill.skonto_until)}
          {skontoBetrag !== null ? ` — ${fmtBetrag(skontoBetrag, bill.currency)}` : ''}
        </div>
      )}

      <div className="kred-hinweise">
        {bill.lese_status === 'laeuft' && (
          <div className="kred-hinweis" role="status"><span className="admin-spinner" /> Der Beleg wird gelesen…</div>
        )}
        {bill.lese_status === 'fehler' && (
          <div className="kred-hinweis warnung">{leseFehlerLabel(bill.lese_fehler)}</div>
        )}
        {bill.hinweise.map((h, i) => (
          <div key={`${h.code}-${i}`} className={`kred-hinweis ${h.stufe}`} role={h.stufe === 'sperre' ? 'alert' : undefined}>
            {h.text}
            {h.bill_id && h.bill_id !== bill.id && (
              <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => onOpen(h.bill_id!)}>
                Vorhandene Rechnung öffnen
              </button>
            )}
          </div>
        ))}
        {bill.status === 'abgelehnt' && bill.abgelehnt_grund && (
          <div className="kred-hinweis warnung">Abgelehnt: {bill.abgelehnt_grund}</div>
        )}
        {bill.visiert_von_name && bill.visiert_am && (
          <div className="kred-hinweis">Visiert von {bill.visiert_von_name} am {formatDateTime(bill.visiert_am)}</div>
        )}
        {fehler && <div className="kred-hinweis sperre" role="alert">{fehler}</div>}
      </div>

      <div className="kred-karte" style={{ marginBottom: 12 }}>
        <div className="kred-aktionen">
          {a.bearbeiten && (
            <>
              <button type="button" className="admin-btn admin-btn-primary" disabled={!dirty || busy !== null}
                      onClick={() => void speichern()}>
                {busy === 'speichern' ? 'Speichern…' : 'Speichern'}
              </button>
              {dirty && (
                <button type="button" className="admin-btn admin-btn-secondary" disabled={busy !== null}
                        onClick={() => { setKopf(kopfAus(bill)); setZeilen(zeilenAus(bill)); setFehler(null) }}>
                  Änderungen verwerfen
                </button>
              )}
            </>
          )}
          {a.zur_visierung && (
            <button type="button" className="admin-btn admin-btn-success" disabled={busy !== null}
                    onClick={() => void aktion('zur_visierung', () => kreditorZurVisierung(bill.id), 'Zur Visierung weitergegeben', true)}>
              Zur Visierung
            </button>
          )}
          {a.visieren && (
            <button type="button" className="admin-btn admin-btn-success" disabled={busy !== null || !!bill.visum_block}
                    onClick={() => setDialog('visum')}>
              Visieren
            </button>
          )}
          {a.visum_zuruecknehmen && (
            <button type="button" className="admin-btn admin-btn-secondary" disabled={busy !== null}
                    onClick={() => void aktion('visum_zuruecknehmen', () => kreditorVisumZuruecknehmen(bill.id), 'Visum zurückgenommen')}>
              Visum zurücknehmen
            </button>
          )}
          {a.erneut_lesen && (
            <button type="button" className="admin-btn admin-btn-secondary" disabled={busy !== null}
                    onClick={() => void aktion('lesen', () => kreditorErneutLesen(bill.id), 'Der Beleg wird neu gelesen')}>
              Erneut lesen
            </button>
          )}
          {a.ablehnen && (
            <button type="button" className="admin-btn admin-btn-secondary" disabled={busy !== null}
                    onClick={() => setDialog('ablehnen')}>
              Ablehnen
            </button>
          )}
          {a.verwerfen && (
            <button type="button" className="admin-btn admin-btn-danger" disabled={busy !== null}
                    onClick={() => setDialog('verwerfen')}>
              Verwerfen
            </button>
          )}
          {a.visieren && bill.visum_block && <span className="kred-visum-block">{bill.visum_block}</span>}
        </div>
      </div>

      {isMobile ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <KreditorBeleg billId={bill.id} mimeType={bill.mime_type} fileName={bill.file_name} alsLink />
          </div>
          {felder}
        </>
      ) : (
        <div className="kred-split">
          <KreditorBeleg billId={bill.id} mimeType={bill.mime_type} fileName={bill.file_name} alsLink={false} />
          {felder}
        </div>
      )}

      {dialog === 'visum' && (
        <VisumDialog bill={bill} busy={busy === 'visieren'} onCancel={() => setDialog(null)}
                     onConfirm={ok => void aktion('visieren', () => kreditorVisieren(bill.id, ok), 'Rechnung visiert', true)} />
      )}
      {dialog === 'ablehnen' && (
        <AblehnenDialog busy={busy === 'ablehnen'} onCancel={() => setDialog(null)}
                        onConfirm={grund => void aktion('ablehnen', () => kreditorAblehnen(bill.id, grund), 'Rechnung abgelehnt', true)} />
      )}
      {dialog === 'verwerfen' && (
        <ConfirmDialog
          title="Rechnung verwerfen?"
          message="Für Dubletten, Irrläufer und Belege, die keine Rechnung sind. Die Rechnung zählt danach nicht mehr."
          confirmLabel="Verwerfen"
          busyLabel="Verwerfen…"
          variant="danger"
          busy={busy === 'verwerfen'}
          onConfirm={() => void aktion('verwerfen', () => kreditorVerwerfen(bill.id), 'Rechnung verworfen', true)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'schliessen' && (
        <UnsavedChangesDialog
          message="An dieser Rechnung gibt es Änderungen, die noch nicht gespeichert sind."
          saving={busy === 'speichern'}
          onSave={() => { void speichern().then(ok => { if (ok) onClose(); else setDialog(null) }) }}
          onDiscard={onClose}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === 'lieferant' && bill.vorschlag.supplier_neu && (
        <NeuerLieferantDialog vorschlag={bill.vorschlag.supplier_neu} busy={busy === 'lieferant'}
                              fehler={lieferantFehler} onCancel={() => setDialog(null)}
                              onConfirm={l => void lieferantAnlegen(l)} />
      )}
    </div>
  )
}

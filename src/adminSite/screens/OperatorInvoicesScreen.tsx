import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api/client'
import {
  archiveInvoice, listInvoices, markInvoicePaid, markInvoiceSentByPost,
  sendInvoice as sendInvoiceByMail, unmarkInvoicePaid,
} from '../../api/admin/invoices'
import type { Invoice } from '../../api/admin/invoices'
import { getAllCustomers } from '../../api/admin/customers'
import type { Customer } from '../../api/admin/customers'
import FreeInvoiceDialog from '../../admin/operative/FreeInvoiceDialog'
import { AdminCardList } from '../../admin/components/AdminCardList'
import { ConfirmDialog } from '../../admin/components/ConfirmDialog'
import { ToastHost, useToast } from '../../admin/components/useToast'
import { useIsMobile } from '../../admin/useIsMobile'
import { fmtCHF, fmtDate, todayISO } from '../../admin/utils/format'
import { isInvoiceOpen } from '../../admin/utils/openInvoices'
import { REITER, anzeigeStatus, passtZuReiter, type Reiter } from './operatorInvoiceStatus'

/**
 * Die Rechnungen des Betreibers an seine Mandanten.
 *
 * Spec: docs/specs/admin-werkora-ch.md §8.3. **Eigener Screen statt des
 * importierten `operative/InvoicesScreen`** — das ist die Abweichung, und hier
 * ist ihr Grund:
 *
 * §8.3 sah vor, den Mandanten-Screen einfach mitzubenutzen. Er beantwortet aber
 * eine andere Frage. Dort ist eine Rechnung der Abschluss eines **Projekts**:
 * Spalte «Projekt», Projektleiter-Filter, Klick springt ins Projekt, Aktionen
 * heissen «Per Post versendet». Hier gibt es keine Projekte — die Rechnung geht
 * an einen **Mandanten** für ein Abo. Was zählt, ist Empfänger und wofür.
 *
 * Das war im Betrieb kein Schönheitsfehler: Der Betreiber sah unter «Projekt»
 * die Namen fremder Bauvorhaben und suchte den Knopf für eine Abo-Rechnung
 * zwischen Werkzeugen, die Rapporte abrechnen (Befund 18.09.2026).
 *
 * **Geteilt bleibt alles darunter**: dieselbe `api/admin/invoices`, dieselbe
 * Kette im Backend, derselbe `FreeInvoiceDialog`. Verschieden ist nur, was die
 * Liste zeigt und welcher Knopf oben steht.
 */

export default function OperatorInvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [reiter, setReiter] = useState<Reiter>('alle')
  const [suche, setSuche] = useState('')
  const [acting, setActing] = useState<number | null>(null)
  const isMobile = useIsMobile()
  const { toast, showToast } = useToast()

  const [kunden, setKunden] = useState<Customer[]>([])
  const [dialogOffen, setDialogOffen] = useState(false)

  const [confirmPaid, setConfirmPaid] = useState<Invoice | null>(null)
  const [paidDate, setPaidDate] = useState(todayISO())
  const [confirmSend, setConfirmSend] = useState<Invoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [confirmPost, setConfirmPost] = useState<Invoice | null>(null)
  const [postDate, setPostDate] = useState(todayISO())
  const [confirmArchive, setConfirmArchive] = useState<Invoice | null>(null)
  const [confirmUnpay, setConfirmUnpay] = useState<Invoice | null>(null)

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      setInvoices(await listInvoices())
    } catch {
      showToast('Rechnungen konnten nicht geladen werden', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { void laden() }, [laden])

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (!passtZuReiter(inv, reiter)) return false
      if (!q) return true
      return (
        (inv.project_name || '').toLowerCase().includes(q) ||
        (inv.invoice_number || '').toLowerCase().includes(q) ||
        (inv.remark || '').toLowerCase().includes(q)
      )
    })
  }, [invoices, reiter, suche])

  const offenSumme = useMemo(
    () => invoices.filter((i) => isInvoiceOpen(i.status))
      .reduce((s, i) => s + (i.total_amount || 0), 0),
    [invoices],
  )

  const anzahl = useMemo(() => {
    const zaehle = (r: Reiter) => invoices.filter((i) => passtZuReiter(i, r)).length
    return Object.fromEntries(REITER.map((r) => [r.id, zaehle(r.id)])) as Record<Reiter, number>
  }, [invoices])

  async function mitAktion(inv: Invoice, was: () => Promise<void>, erfolg: string) {
    setActing(inv.id)
    try {
      await was()
      showToast(erfolg, 'success')
      await laden()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Aktion fehlgeschlagen', 'error')
    } finally {
      setActing(null)
    }
  }

  function oeffneDialog() {
    // Kunden erst beim Öffnen holen — die Liste braucht sie nicht.
    if (!kunden.length) void getAllCustomers().then(setKunden).catch(() => { /* leer */ })
    setDialogOffen(true)
  }

  const aktionen = (inv: Invoice) => (
    <>
      {inv.storage_path && (
        <a
          href={apiUrl(`/pwa/admin/invoices/${inv.id}/pdf`)}
          target="_blank"
          rel="noreferrer"
          className="admin-btn admin-btn-secondary admin-btn-sm"
        >
          PDF
        </a>
      )}
      {isInvoiceOpen(inv.status) && inv.status !== 'gesendet' && (
        <>
          <button
            className="admin-btn admin-btn-primary admin-btn-sm"
            disabled={acting === inv.id}
            onClick={() => { setSendEmail(''); setConfirmSend(inv) }}
          >
            Senden
          </button>
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            disabled={acting === inv.id}
            onClick={() => { setPostDate(todayISO()); setConfirmPost(inv) }}
          >
            Per Post versendet
          </button>
        </>
      )}
      {isInvoiceOpen(inv.status) && (
        <>
          <button
            className="admin-btn admin-btn-success admin-btn-sm"
            disabled={acting === inv.id}
            onClick={() => { setPaidDate(todayISO()); setConfirmPaid(inv) }}
          >
            Als bezahlt markieren
          </button>
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            disabled={acting === inv.id}
            onClick={() => setConfirmArchive(inv)}
          >
            Archivieren
          </button>
        </>
      )}
      {inv.status === 'bezahlt' && (
        <button
          className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={acting === inv.id}
          onClick={() => setConfirmUnpay(inv)}
        >
          Zahlung zurücksetzen
        </button>
      )}
    </>
  )

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Rechnungen</div>
          <div className="admin-page-subtitle">
            {gefiltert.length} Einträge · Offen: {fmtCHF(offenSumme)}
          </div>
        </div>
        {/* Kein `admin-page-actions`-Wrapper: die Klasse ist nirgends definiert
            (die Mandanten-App benutzt sie wirkungslos), und `.admin-page-header`
            setzt den Knopf als Flex-Kind ohnehin nach rechts. Der Ratchet
            `stylesheets.test.mjs` weist erfundene Klassen zurück. */}
        <button className="admin-btn admin-btn-primary" onClick={oeffneDialog}>
          + Rechnung erstellen
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Empfänger oder Rechnungs-Nr. suchen…"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
          <div className="kpi-admin-tabs" style={{ marginBottom: 0 }}>
            {REITER.map((r) => (
              <button
                key={r.id}
                className={`kpi-admin-tab${reiter === r.id ? ' active' : ''}`}
                onClick={() => setReiter(r.id)}
              >
                {r.label} <span className="admin-badge admin-badge-draft">{anzahl[r.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={gefiltert}
            keyFor={(inv) => String(inv.id)}
            empty="Keine Rechnungen gefunden."
            renderCard={(inv) => {
              const st = anzeigeStatus(inv)
              return (
                <>
                  <div className="admin-card-head">
                    <span className="admin-card-title" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                      {inv.invoice_number}
                    </span>
                    <span className={`admin-badge ${st.badge}`}>{st.label}</span>
                  </div>
                  <div className="admin-card-meta"><strong>{inv.project_name}</strong></div>
                  {inv.remark && <div className="admin-card-meta">{inv.remark}</div>}
                  <div className="admin-card-meta">
                    {fmtCHF(inv.total_amount)} · erstellt {fmtDate(inv.created_at)}
                    {inv.paid_at ? ` · bezahlt ${fmtDate(inv.paid_at)}` : ''}
                  </div>
                  <div className="admin-card-actions">{aktionen(inv)}</div>
                </>
              )
            }}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Empfänger</th>
                <th>Beschreibung</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Erstellt</th>
                <th>Bezahlt am</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.length === 0 ? (
                <tr><td colSpan={8} className="admin-table-empty">Keine Rechnungen gefunden.</td></tr>
              ) : gefiltert.map((inv) => {
                const st = anzeigeStatus(inv)
                return (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{inv.invoice_number}</td>
                    <td><strong>{inv.project_name}</strong></td>
                    <td style={{ color: 'var(--muted)' }}>{inv.remark || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{fmtCHF(inv.total_amount)}</td>
                    <td><span className={`admin-badge ${st.badge}`}>{st.label}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</td>
                    <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.paid_at)}</td>
                    <td style={{ whiteSpace: 'nowrap', width: '1%' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>{aktionen(inv)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialogOffen && (
        <FreeInvoiceDialog
          customers={kunden}
          onClose={() => setDialogOffen(false)}
          onCreated={(nr) => {
            setDialogOffen(false)
            showToast(`Rechnung ${nr} erstellt`, 'success')
            void laden()
          }}
        />
      )}

      {confirmSend && (
        <ConfirmDialog
          title="Rechnung senden?"
          message={<>{confirmSend.invoice_number} · {confirmSend.project_name}</>}
          confirmLabel="Senden"
          busy={acting === confirmSend.id}
          confirmDisabled={!sendEmail.trim()}
          onCancel={() => setConfirmSend(null)}
          onConfirm={() => {
            const inv = confirmSend
            const an = sendEmail.trim()
            setConfirmSend(null)
            void mitAktion(inv, () => sendInvoiceByMail(inv.id, an), 'Rechnung gesendet')
          }}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="op-invoice-mail">E-Mail des Empfängers</label>
            <input
              id="op-invoice-mail"
              className="admin-form-input"
              type="email"
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
            />
            {/* Keine Vorbelegung: Die freie Rechnung trägt keinen Kundenbezug in
                der Zeile (`project_id` ist leer, eine `customer_id` hat die
                Tabelle nicht). Eine geratene Adresse wäre hier teurer als eine
                leere — die Rechnung ginge an den Falschen. */}
            <div className="admin-form-hint">
              Die Adresse des Mandanten. Sie steht im Kundenstamm.
            </div>
          </div>
        </ConfirmDialog>
      )}

      {confirmPost && (
        <ConfirmDialog
          title="Per Post versendet?"
          message={<>{confirmPost.invoice_number} · {confirmPost.project_name}</>}
          confirmLabel="Ja, versendet"
          busy={acting === confirmPost.id}
          confirmDisabled={!postDate}
          onCancel={() => setConfirmPost(null)}
          onConfirm={() => {
            const inv = confirmPost
            const datum = postDate
            setConfirmPost(null)
            void mitAktion(inv, () => markInvoiceSentByPost(inv.id, datum), 'Als versendet vermerkt')
          }}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="op-invoice-post">Versanddatum</label>
            <input
              id="op-invoice-post"
              className="admin-form-input"
              type="date"
              value={postDate}
              max={todayISO()}
              onChange={(e) => setPostDate(e.target.value)}
            />
            {/* Rückdatierbar: Die Frist läuft ab der Aufgabe bei der Post, nicht
                ab dem Klick — und sie bestimmt, ab wann «Verspätet» gilt. */}
          </div>
        </ConfirmDialog>
      )}

      {confirmPaid && (
        <ConfirmDialog
          title="Rechnung als bezahlt markieren?"
          message={<>{confirmPaid.invoice_number} · {fmtCHF(confirmPaid.total_amount)}</>}
          confirmLabel="Ja, bezahlt"
          variant="success"
          busy={acting === confirmPaid.id}
          confirmDisabled={!paidDate}
          onCancel={() => setConfirmPaid(null)}
          onConfirm={() => {
            const inv = confirmPaid
            const datum = paidDate
            setConfirmPaid(null)
            void mitAktion(inv, () => markInvoicePaid(inv.id, datum), 'Als bezahlt markiert')
          }}
        >
          <div style={{ margin: '12px 0' }}>
            <label className="admin-form-label" htmlFor="op-invoice-paid">Zahlungsdatum</label>
            <input
              id="op-invoice-paid"
              className="admin-form-input"
              type="date"
              value={paidDate}
              max={todayISO()}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </div>
        </ConfirmDialog>
      )}

      {confirmArchive && (
        <ConfirmDialog
          title="Rechnung archivieren?"
          message={<>{confirmArchive.invoice_number} · {confirmArchive.project_name}</>}
          confirmLabel="Archivieren"
          variant="danger"
          busy={acting === confirmArchive.id}
          onCancel={() => setConfirmArchive(null)}
          onConfirm={() => {
            const inv = confirmArchive
            setConfirmArchive(null)
            void mitAktion(inv, () => archiveInvoice(inv.id), 'Rechnung archiviert')
          }}
        />
      )}

      {confirmUnpay && (
        <ConfirmDialog
          title="Zahlung zurücksetzen?"
          message={<>{confirmUnpay.invoice_number} · {confirmUnpay.project_name}</>}
          confirmLabel="Zurücksetzen"
          variant="danger"
          busy={acting === confirmUnpay.id}
          onCancel={() => setConfirmUnpay(null)}
          onConfirm={() => {
            const inv = confirmUnpay
            setConfirmUnpay(null)
            void mitAktion(inv, () => unmarkInvoicePaid(inv.id), 'Zahlung zurückgesetzt')
          }}
        />
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

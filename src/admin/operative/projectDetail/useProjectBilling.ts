import { useState } from 'react'
import {
  archiveInvoice, generateInvoice, getInvoiceQuoteCoverage, markInvoicePaid,
  markInvoiceSentByPost, sendInvoice, unmarkInvoicePaid,
  type InvoiceQuoteCoverage,
} from '../../../api/admin/invoices'
import {
  listProjectInvoices, listProjectQuotes, listProjectReports,
} from '../../../api/admin/projects'
import {
  addQuoteVariant, getQuoteDetail, regenerateQuote, sendQuoteRejection, setQuoteStatus,
  type QuoteDetail,
} from '../../../api/admin/quotes'
import {
  acceptAggregateReport, aggregateProjectReports, deleteProjectReport,
  dissolveAggregateReport, markReportPartial, regenerateReportPdf,
} from '../../../api/admin/reports'
import type { ProjectInvoice, ProjectQuote, ProjectReport } from './types'
import { hasBillableReport } from './billingRules'
import { invoiceWarningHint, sammelrechnungHint } from '../../utils/invoiceHints'

// Belege eines Projekts (Charge H, H3): Offerten, Rechnungen, Rapporte — Listen
// und die Aktionen darauf. Der grösste Block des Projekt-Details und der einzige,
// der Geld bewegt.
//
// Was der Hook NICHT übernimmt: welche Maske gerade offen ist. Offerte
// bearbeiten, Rechnung senden, Rapport erfassen sind Dialoge des Screens; der
// Hook liefert nur die Daten dafür (`loadQuoteDetail`) und lädt danach neu.

export interface UseProjectBilling {
  quotes: ProjectQuote[]
  invoices: ProjectInvoice[]
  reports: ProjectReport[]
  generatingInvoice: boolean
  regeneratingQuoteId: number | null
  addingVariantId: number | null
  sendingRejectionId: number | null
  reloadQuotes: () => Promise<void>
  reloadInvoices: () => Promise<void>
  reloadReports: () => Promise<void>
  /** Vollständige Offerte fürs Bearbeiten-Formular; null, wenn das Laden scheitert. */
  loadQuoteDetail: (quoteId: number) => Promise<QuoteDetail | null>
  deleteReport: (reportId: number) => Promise<void>
  regenerateReportPdf: (reportId: number) => Promise<void>
  /** Teilrapporte bündeln bzw. eine Bündelung auflösen (docs/specs/teilrapport.md §6.3). */
  aggregateReports: (reportIds: number[]) => Promise<void>
  dissolveAggregate: (reportId: number) => Promise<void>
  /** Gesamtrapport ohne Kundenunterschrift abschliessen (docs/specs/teilrapport.md, Nachtrag). */
  acceptAggregate: (reportId: number) => Promise<void>
  // Nimmt einen bestehenden Rapport nachträglich in die Teilrapport-Serie auf.
  markPartial: (reportId: number) => Promise<void>
  regenerate: (quoteId: number) => Promise<void>
  addVariant: (quoteId: number, kind: 'variante' | 'mehrfach') => Promise<void>
  updateQuoteStatus: (quoteId: number, status: string) => Promise<void>
  sendRejection: (quoteId: number) => Promise<void>
  generate: (remark: string, useAcceptedQuote: boolean, quoteIds?: number[]) => Promise<boolean>
  /** Offerten-Auswahl für den Erstellen-Dialog; null, wenn das Laden scheitert (Dialog ohne Auswahl). */
  loadQuoteCoverage: () => Promise<InvoiceQuoteCoverage | null>
  markPaid: (invoiceId: number, paidDate: string) => Promise<boolean>
  unmarkPaid: (invoiceId: number) => Promise<void>
  archive: (invoiceId: number) => Promise<void>
  send: (invoiceId: number, recipientEmail: string) => Promise<boolean>
  markSentByPost: (invoiceId: number, sentDate: string) => Promise<boolean>
}

export function useProjectBilling(
  project: { id: string; name: string } | null | undefined,
  cb: {
    onToast: (msg: string) => void
    /** Nach dem Bezahlen: der Screen fragt, ob das Projekt abgeschlossen wird. */
    onInvoicePaid: () => void
  },
): UseProjectBilling {
  const [quotes, setQuotes] = useState<ProjectQuote[]>([])
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([])
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [regeneratingQuoteId, setRegeneratingQuoteId] = useState<number | null>(null)
  const [addingVariantId, setAddingVariantId] = useState<number | null>(null)
  const [sendingRejectionId, setSendingRejectionId] = useState<number | null>(null)

  async function reloadQuotes() {
    if (!project) return
    try {
      setQuotes(await listProjectQuotes<ProjectQuote>(project.id))
    } catch { /* ignore */ }
  }

  async function reloadInvoices() {
    if (!project) return
    try {
      setInvoices(await listProjectInvoices<ProjectInvoice>(project.id))
    } catch { /* ignore */ }
  }

  async function reloadReports() {
    if (!project) return
    try {
      setReports(await listProjectReports<ProjectReport>(project.id))
    } catch { /* ignore */ }
  }

  async function loadQuoteDetail(quoteId: number): Promise<QuoteDetail | null> {
    // Detail (alle Positionen) frisch laden — die Listen-Zeile trägt nur die
    // Kopfdaten, das Bearbeiten-Formular braucht die vollständige Offerte.
    try {
      return await getQuoteDetail(quoteId)
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler beim Laden der Offerte')
      return null
    }
  }

  // Rapport löschen — z.B. ein doppelt erfasster. Ohne das landen dessen Stunden
  // und Material zusätzlich auf der nächsten Rechnung (billable_report_ids filtert
  // nur bereits Verrechnetes, keine Dubletten). Abgerechnete Rapporte sperrt der
  // Server mit 409; die Meldung geht dann als Toast raus.
  async function deleteReport(reportId: number) {
    if (!project) return
    try {
      const res = await deleteProjectReport(project.id, reportId)
      await reloadReports()
      if (res?.warnings?.length) {
        cb.onToast(`Rapport gelöscht — Lager-Rückbuchung unvollständig: ${res.warnings.join(', ')}`)
      } else {
        cb.onToast(res?.stock_restored
          ? `Rapport gelöscht (${res.stock_restored} Materialposition${res.stock_restored === 1 ? '' : 'en'} ins Lager zurückgebucht)`
          : 'Rapport gelöscht')
      }
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Rapport konnte nicht gelöscht werden')
      throw err
    }
  }

  // Fehlendes Rapport-PDF nachziehen. Kommt vor, wenn der Storage-Upload beim
  // Unterschreiben/Erfassen scheiterte: der Rapport ist gespeichert, das Dokument
  // fehlt — und über Bearbeiten (das sonst neu rendert) ist er nach dem Verrechnen
  // nicht mehr erreichbar. Liegt schon ein PDF vor, antwortet der Server mit 409.
  async function regenerateReportPdfFor(reportId: number) {
    if (!project) return
    try {
      await regenerateReportPdf(project.id, reportId)
      await reloadReports()
      cb.onToast('PDF erzeugt')
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'PDF konnte nicht erzeugt werden')
    }
  }

  async function aggregateReports(reportIds: number[]) {
    if (!project) return
    try {
      await aggregateProjectReports(project.id, reportIds)
      await reloadReports()
      cb.onToast(
        `Gesamtrapport über ${reportIds.length} Einsätze erstellt — `
        + 'die Unterschrift holt der Monteur in der App.',
      )
    } catch (err) {
      // Wirft weiter: der Dialog bleibt offen und die Auswahl erhalten, damit ein
      // Konflikt («bitte Liste neu laden») nicht die ganze Zusammenstellung kostet.
      cb.onToast(err instanceof Error ? err.message : 'Gesamtrapport konnte nicht erstellt werden')
      throw err
    }
  }

  async function dissolveAggregate(reportId: number) {
    if (!project) return
    try {
      const res = await dissolveAggregateReport(project.id, reportId)
      await reloadReports()
      cb.onToast(res.deleted
        ? `Bündelung aufgelöst — ${res.released} Teilrapport${res.released === 1 ? '' : 'e'} wieder frei.`
        : `Bündelung aufgelöst — der unterschriebene Beleg bleibt als aufgelöst bestehen, `
          + `${res.released} Teilrapport${res.released === 1 ? '' : 'e'} wieder frei.`)
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Bündelung konnte nicht aufgelöst werden')
      throw err
    }
  }

  async function markPartial(reportId: number) {
    if (!project) return
    try {
      const res = await markReportPartial(project.id, reportId, true)
      await reloadReports()
      cb.onToast(res.changed
        ? 'Rapport gehört jetzt zur Serie — er wird mit dem Gesamtrapport verrechnet.'
        : 'Der Rapport gehörte bereits zur Serie.')
    } catch (err) {
      // Wirft weiter: der Dialog bleibt offen, damit der Grund (z.B. «hängt an einer
      // Rechnung») neben dem Rapport steht, den er betrifft.
      cb.onToast(err instanceof Error ? err.message : 'Der Rapport konnte nicht zur Serie hinzugefügt werden')
      throw err
    }
  }

  async function acceptAggregate(reportId: number) {
    if (!project) return
    try {
      const res = await acceptAggregateReport(project.id, reportId)
      await reloadReports()
      cb.onToast(
        `Gesamtrapport ohne Kundenunterschrift abgeschlossen — `
        + `${res.children} Einsätze sind jetzt verrechenbar.`,
      )
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Gesamtrapport konnte nicht abgeschlossen werden')
      throw err
    }
  }

  async function regenerate(quoteId: number) {
    setRegeneratingQuoteId(quoteId)
    try {
      await regenerateQuote(quoteId)
      cb.onToast('Neue Version erstellt')
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler beim Regenerieren')
    } finally {
      setRegeneratingQuoteId(null)
    }
  }

  async function addVariant(quoteId: number, kind: 'variante' | 'mehrfach') {
    setAddingVariantId(quoteId)
    try {
      await addQuoteVariant(quoteId, kind)
      cb.onToast('Weitere Offerte erstellt — jetzt anpassen')
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler bei „Weitere Offerte"')
    } finally {
      setAddingVariantId(null)
    }
  }

  async function updateQuoteStatus(quoteId: number, status: string) {
    try {
      await setQuoteStatus(quoteId, status)
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function sendRejection(quoteId: number) {
    setSendingRejectionId(quoteId)
    try {
      const res = await sendQuoteRejection(quoteId)
      cb.onToast(res.message || 'Absage-Mail gesendet')
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Absage-Mail fehlgeschlagen')
    } finally {
      setSendingRejectionId(null)
    }
  }

  async function generate(remark: string, useAcceptedQuote: boolean, quoteIds?: number[]): Promise<boolean> {
    if (!project) return false
    // Fehlt ein verrechenbarer Rapport (unterschrieben ODER manuell erfasst,
    // siehe hasBillableReport), wird zwingend aus der Offerte gerechnet — das
    // Backend setzt dann automatisch created_without_report.
    const useQuote = useAcceptedQuote || !hasBillableReport(reports)
    setGeneratingInvoice(true)
    try {
      const res = await generateInvoice({
        project_name: project.name,
        project_id: project.id,
        use_quote: useQuote,
        // Explizite Offerten-Auswahl aus dem Dialog; undefined = Automatik (der
        // Normalfall, siehe utils/quoteSelection.selectionPayload).
        quote_ids: quoteIds,
        // work_description bewusst NICHT mitschicken: das Backend unterscheidet
        // `undefined` (= aus den Rapporten ableiten) von `''` (= bewusst geleert, kein
        // Block auf dem PDF). Hier stand ein hartes '' — dieser Dialog hat kein
        // Beschrieb-Feld, also unterdrückte er den Block «Ausgeführte Arbeiten» auf
        // JEDER Rechnung aus dem Projektdetail, während der Rechnungen-Screen (mit
        // Textarea) ihn immer zeigte.
        remark,
      })
      cb.onToast(
        'Rechnung erstellt'
        + sammelrechnungHint(res?.quote_numbers)
        + invoiceWarningHint(res?.warnings),
      )
      await reloadInvoices()
      await reloadReports()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler beim Erstellen')
      return false
    } finally {
      setGeneratingInvoice(false)
    }
  }

  // Offerten-Auswahl für den Erstellen-Dialog. Nicht blockierend: schlägt der
  // Aufruf fehl, zeigt der Dialog keine Auswahl und die Rechnung entsteht wie
  // bisher über die automatische Auflösung.
  async function loadQuoteCoverage(): Promise<InvoiceQuoteCoverage | null> {
    if (!project) return null
    try {
      return await getInvoiceQuoteCoverage(project.id)
    } catch {
      return null
    }
  }

  // `paidDate` = Tag des Zahlungseingangs (ISO), nachtragbar statt automatisch
  // «heute». Danach fragt der Screen «Projekt abschliessen?» — die bezahlte
  // Rechnung ist meist der letzte Schritt eines Auftrags.
  async function markPaid(invoiceId: number, paidDate: string): Promise<boolean> {
    try {
      await markInvoicePaid(invoiceId, paidDate)
      await reloadInvoices()
      cb.onInvoicePaid()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
      return false
    }
  }

  async function unmarkPaid(invoiceId: number) {
    try {
      await unmarkInvoicePaid(invoiceId)
      cb.onToast('Zahlung zurückgesetzt')
      await reloadInvoices()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function archive(invoiceId: number) {
    try {
      await archiveInvoice(invoiceId)
      cb.onToast('Rechnung archiviert — Rapporte wieder verrechenbar')
      // Rapporte neu laden: der «Abgerechnet»-Status der gelösten Rapporte ändert sich.
      await Promise.all([reloadInvoices(), reloadReports()])
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function send(invoiceId: number, recipientEmail: string): Promise<boolean> {
    try {
      await sendInvoice(invoiceId, recipientEmail)
      cb.onToast(`Rechnung an ${recipientEmail} gesendet`)
      await reloadInvoices()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      return false
    }
  }

  // Postversand: derselbe Endpunkt wie in der Rechnungsübersicht. `sentDate` ist
  // das Aufgabedatum bei der Post — daraus leitet das Backend das Zahlungsziel ab,
  // deshalb nachtragbar statt «jetzt».
  async function markSentByPost(invoiceId: number, sentDate: string): Promise<boolean> {
    try {
      await markInvoiceSentByPost(invoiceId, sentDate)
      cb.onToast('Rechnung als per Post versendet markiert')
      await reloadInvoices()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
      return false
    }
  }

  return {
    quotes, invoices, reports,
    generatingInvoice, regeneratingQuoteId, addingVariantId, sendingRejectionId,
    reloadQuotes, reloadInvoices, reloadReports, loadQuoteDetail, deleteReport,
    regenerateReportPdf: regenerateReportPdfFor,
    aggregateReports, dissolveAggregate, acceptAggregate, markPartial,
    regenerate, addVariant, updateQuoteStatus, sendRejection, generate, loadQuoteCoverage,
    markPaid, unmarkPaid, archive, send, markSentByPost,
  }
}

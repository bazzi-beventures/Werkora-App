// Lieferanten-PDF und manuelle Erfassung (Charge H2).
//
// Beide Masken lesen Lieferanten-Offerten per OCR ein, prüfen sie im selben Modal
// und legen die Quelle danach beim Projekt ab. Der Ablauf war zweimal fast
// wortgleich im Screen — hier steht er einmal:
//
//   Datei wählen → extrahieren → Review-Modal → «Übernehmen» hängt die Zeilen an
//   und merkt das PDF zur Ablage vor → nach dem Speichern der Offerte landet es
//   als Projekt-Datei unter «Lieferantendokumente > Bestellungen».
//
// Bei «Abbrechen» wird die Quelle verworfen — ein ungenutztes PDF soll nicht im
// Projekt liegen.

import { useRef, useState } from 'react'
import { extractQuotePdf } from '../../../api/admin/quotes'
import { uploadProjectFile } from '../../../api/admin/projects'
import { pdfUploadErrorMessage } from '../QuoteFormParts'
import type { ConfirmedExtraProduct, PdfExtractionResponse } from '../PdfExtractionReviewModal'

const NO_PRODUCTS_HINT =
  'Keine Produkte in der PDF erkannt. Am zuverlässigsten sind Offerten von Griesser und Stobag; '
  + 'andere Lieferanten werden erkannt, wenn sie eine durchnummerierte Positionsliste '
  + '(Pos/Bezeichnung/Menge/Preis) enthalten.'

// Leere Produktkarte der manuellen Erfassung: dieselbe Prüf-Maske, nur ohne PDF.
// Dadurch gibt es Unter-Positionen mit „separat ausweisen" und die
// EK → Aufschlag → VK-Rechnung auch ohne Lieferanten-Dokument.
const MANUAL_ENTRY: PdfExtractionResponse = {
  supplier: '',
  supplier_label: '',
  supplier_id: null,
  project_ref: '',
  available_pricing_rules: [],
  products: [{
    name: '',
    description: '',
    quantity: 1,
    unit: 'Stk',
    ek_price: null,
    positions: [],
    suggested_category: null,
    suggested_margin_factor: null,
    suggested_vk_price: null,
  }],
}

export interface QuotePdfImport {
  uploading: boolean
  /** Eigener Fehler-State: `error` steht oben am Formular, der Upload-Knopf weit
   *  unten bei den Positionen — dort muss die Meldung erscheinen. */
  pdfError: string
  pdfReview: PdfExtractionResponse | null
  reviewMode: 'pdf' | 'manual'
  fileRef: React.RefObject<HTMLInputElement | null>
  handlePdfUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  openManualEntry: () => void
  confirmReview: (confirmed: ConfirmedExtraProduct[]) => void
  cancelReview: () => void
  /** Vorgemerkte Quell-PDFs beim Projekt ablegen. Best-effort: die Offerte ist zu
   *  diesem Zeitpunkt bereits gespeichert, ein Ablagefehler darf sie nicht kippen. */
  fileSupplierDocs: (projectId: string) => Promise<void>
  hasSupplierDocs: boolean
}

export function useQuotePdfImport(
  onConfirm: (confirmed: ConfirmedExtraProduct[]) => void,
): QuotePdfImport {
  const [uploading, setUploading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [pdfReview, setPdfReview] = useState<PdfExtractionResponse | null>(null)
  const [reviewMode, setReviewMode] = useState<'pdf' | 'manual'>('pdf')
  const [supplierDocs, setSupplierDocs] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  // Das gerade im Review-Modal offene Quelle-PDF — erst bei «Übernehmen» wird es
  // zur Ablage vorgemerkt.
  const pendingFile = useRef<File | null>(null)

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setPdfError('')
    try {
      const result = await extractQuotePdf(file)
      if (!result.products || result.products.length === 0) {
        setPdfError(NO_PRODUCTS_HINT)
        return
      }
      pendingFile.current = file
      setReviewMode('pdf')
      setPdfReview(result)
    } catch (err) {
      setPdfError(pdfUploadErrorMessage(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function openManualEntry() {
    pendingFile.current = null  // keine Quelle abzulegen
    setReviewMode('manual')
    setPdfReview(MANUAL_ENTRY)
  }

  function confirmReview(confirmed: ConfirmedExtraProduct[]) {
    onConfirm(confirmed)
    if (pendingFile.current) {
      const doc = pendingFile.current
      setSupplierDocs(prev => [...prev, doc])
      pendingFile.current = null
    }
    setPdfReview(null)
  }

  function cancelReview() {
    pendingFile.current = null
    setPdfReview(null)
  }

  async function fileSupplierDocs(projectId: string) {
    for (const f of supplierDocs) {
      try {
        await uploadProjectFile(projectId, f, 'bestellungen')
      } catch (err) {
        console.error('Lieferanten-PDF konnte nicht im Projekt abgelegt werden:', err)
      }
    }
    setSupplierDocs([])
  }

  return {
    uploading, pdfError, pdfReview, reviewMode, fileRef,
    handlePdfUpload, openManualEntry, confirmReview, cancelReview,
    fileSupplierDocs, hasSupplierDocs: supplierDocs.length > 0,
  }
}

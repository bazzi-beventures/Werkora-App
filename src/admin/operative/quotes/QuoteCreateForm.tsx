// Neue Offerte erfassen (Charge H2 — aus QuotesScreen.tsx herausgelöst).
//
// Der Aufbau: Stammdaten und PDF-Import kommen aus Hooks, die Positions-Sektionen
// aus QuoteFieldsets (geteilt mit dem Bearbeiten-Formular), der Payload aus
// quotePayload.ts. Was hier bleibt, ist die Maske selbst: Projektwahl,
// Materialliste über den Katalog, der localStorage-Entwurf und das Absenden.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createQuote } from '../../../api/admin/quotes'
import { getAdminProjects } from '../../../api/admin/projects'
import {
  getQuoteSkontoDefaults, getQuoteStandardNotes, getQuoteTravelCostTable,
} from '../../../api/admin/quoteTemplates'
import type { ProjectChoice } from '../../../api/admin/projects'
import { fmtCHF } from '../../utils/format'
import { computeTravelCost, factorToPct, parseNum } from '../../utils/quotePricing'
import type { TravelCostTable } from '../../utils/quotePricing'
import { UnsavedChangesDialog } from '../../components/UnsavedChangesDialog'
import { PdfExtractionReviewModal } from '../PdfExtractionReviewModal'
import type { ConfirmedExtraProduct } from '../PdfExtractionReviewModal'
import { DescPriceFieldset, DiscountsFieldset, SkontoFieldset, skontoValidationError } from '../QuoteFormParts'
import { useReorder } from '../QuoteRowControls'
import { BetaBadge } from '../../../shared/BetaBadge'
import {
  ExtraProductsFieldset, InstallationFieldset, KatalogMaterialFieldset, LaborFieldset,
  QuoteTextFields, SpecialPositionsFieldset, TravelCostFieldset,
} from './QuoteFieldsets'
import { Summenleiste } from './neu/Kalkulation'
import { OfferteNeuMaske } from './neu/OfferteNeuMaske'
import { useOffertenVorschau } from './neu/useOffertenVorschau'
import { NO_SKONTO_DEFAULTS, STANDARD_NOTES, quoteDraftKey, removeQuoteDraft } from './quoteDraft'
import type { QuoteDraft, SkontoDefaults } from './quoteDraft'
import { buildCreateQuotePayload, specialRowValid } from './quotePayload'
import type { CreateQuoteInput } from './quotePayload'
import { applyEkMargin } from './quoteRows'
import { useQuoteDraft } from './useQuoteDraft'
import { useQuoteMasterData } from './useQuoteMasterData'
import { useQuotePdfImport } from './useQuotePdfImport'
import { useRowList } from './useRowList'
import type { ExtraChargeRow, ExtraProductRow, InstallationRow, LaborRow, MaterialRow, SpecialRow } from './quoteTypes'

const EMPTY_LABOR: LaborRow = { description: '', quantity: '', unit_price: null, hidden: false }
const EMPTY_MATERIAL: MaterialRow = { art_nr: '', quantity: '' }

interface Props {
  onDone: (warning?: string) => void
  onCancel: () => void
  lockedProjectName?: string
  lockedProjectId?: string
}

// Imperatives Handle für den Overlay-Aufrufer (ProjectMaskDialogs): ein Klick
// neben das Fenster soll denselben Verlassen-Flow durchlaufen wie ✕/Esc/
// Abbrechen — bei Inhalt also die Entwurf-behalten/verwerfen-Rückfrage statt
// kommentarlos zu schliessen. Ein onDirtyChange wie im QuoteEditForm reichte
// dafür nicht: die Rückfrage dieser Maske (UnsavedChangesDialog mit
// Entwurfs-Semantik) lebt hier drin, nicht beim Aufrufer.
export interface QuoteCreateFormHandle {
  requestClose: () => void
}

export const QuoteCreateForm = forwardRef<QuoteCreateFormHandle, Props>(function QuoteCreateForm(
  { onDone, onCancel, lockedProjectName, lockedProjectId }: Props,
  ref,
) {
  const master = useQuoteMasterData()
  const [projects, setProjects] = useState<ProjectChoice[]>([])
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState('')
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('')
  const [projectName, setProjectName] = useState(lockedProjectName ?? '')
  // Projektnamen dürfen doppelt vorkommen — massgeblich ist die id. Der Name
  // bleibt für Entwurfs-Key und Anzeige. Im gesperrten Modus (aus dem Projekt
  // heraus) kommt die id vom Aufrufer.
  const [projectId, setProjectId] = useState(lockedProjectId ?? '')

  const labor = useRowList<LaborRow>([{ ...EMPTY_LABOR }])
  const material = useRowList<MaterialRow>([{ ...EMPTY_MATERIAL }])
  const extraProducts = useRowList<ExtraProductRow>([], applyEkMargin)
  const extraCharges = useRowList<ExtraChargeRow>([])
  const installation = useRowList<InstallationRow>([])
  const special = useRowList<SpecialRow>([])

  // Offerten-Typ (Workflow "richtofferte"): Umschalter nur bei aktivem Feature.
  const [quoteType, setQuoteType] = useState<'offerte' | 'richtofferte'>('offerte')
  const [includeTravelCost, setIncludeTravelCost] = useState(true)
  const [laborDiscount, setLaborDiscount] = useState('')
  const [materialDiscount, setMaterialDiscount] = useState('')
  // Fixpreis (brutto inkl. MwSt): der Endbetrag, den der Kunde zahlen soll. Gesetzt
  // ersetzt er den Material-Rabattsatz — das Backend leitet den Rabatt daraus ab.
  const [fixedPrice, setFixedPrice] = useState('')
  // Skonto-Häkchen. Startet IMMER aus — auch wenn der Mandant eine Vorgabe pflegt.
  // Skonto ist eine Entscheidung pro Offerte, keine Firmenkonstante: vorher stand es
  // bei gepflegter Vorgabe angehakt da und ging mit, wenn niemand hinsah. Die Vorgabe
  // belegt weiterhin Satz und Frist vor, damit ein Anhaken sofort stimmt.
  const [skontoActive, setSkontoActive] = useState(false)
  const [skontoPct, setSkontoPct] = useState('')
  const [skontoDays, setSkontoDays] = useState('')
  // Meldung unter dem Skonto-Feld; wird beim Absenden gesetzt und beim Tippen geräumt.
  const [skontoError, setSkontoError] = useState('')
  // Vorgabe aus den Offert-Vorlagen (tenants.quote_skonto_default_pct/_days). Belegt die
  // beiden Felder beim Öffnen vor und dient als Nullpunkt für den Entwurfs-Vergleich.
  const [skontoDefaults, setSkontoDefaults] = useState<SkontoDefaults>(NO_SKONTO_DEFAULTS)
  const [notes, setNotes] = useState(STANDARD_NOTES)
  const [stdNotes, setStdNotes] = useState(STANDARD_NOTES)
  const [productDescription, setProductDescription] = useState('')
  const [useStandardNotes, setUseStandardNotes] = useState(true)
  // Wirksame Fahrspesen-Staffelung des Mandanten (Override sonst System-Default).
  // Kommt vom Backend, damit die Vorschau nicht von der verbindlichen Berechnung
  // abweicht — vorher stand hier eine hartcodierte Kopie des System-Defaults.
  const [travelCostTable, setTravelCostTable] = useState<TravelCostTable>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Abfrage beim Verlassen: Entwurf behalten oder verwerfen?
  const [askOnLeave, setAskOnLeave] = useState(false)
  // Wurde ein gespeicherter Entwurf übernommen? Dann darf die (asynchron
  // eintreffende) Skonto-Vorgabe die Entwurfswerte nicht mehr überschreiben.
  const draftApplied = useRef(false)

  const pdf = useQuotePdfImport(useCallback((confirmed: ConfirmedExtraProduct[]) => {
    extraProducts.append(confirmed.map(c => ({
      description: c.description,
      quantity: c.quantity,
      unit: c.unit,
      unit_price: c.unit_price,
      ek: String(c.ek_price),
      margin_pct: String(factorToPct(c.margin_factor)),
      supplier_id: c.supplier_id,
      category: c.category,
      positions: c.positions,
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []))

  // Verschieben (Griff + ▲/▼) für Material- und Freie-Positions-Zeilen.
  const materialReorder = useReorder(material.set)
  const extraReorder = useReorder(extraProducts.set)

  // localStorage-Slot pro Projekt — im gesperrten Projekt-Modal konstant, im
  // freien Formular wechselt er mit der Projektauswahl.
  const draftKey = quoteDraftKey(projectName)

  useEffect(() => {
    getAdminProjects().then(p => setProjects(p.filter(x => !x.is_closed))).catch(() => {})
    // Mandanten-spezifischen Standard-Bemerkungstext laden (pflegbar unter Offert-Vorlagen).
    // Fehler darf das Formular nicht blockieren — dann bleibt der Fallback-Default.
    getQuoteStandardNotes()
      .then(res => {
        const text = res.notes ?? STANDARD_NOTES
        setStdNotes(text)
        // Nur vorausfüllen, solange noch der Fallback-Default unverändert drinsteht
        // (Nutzer hat nichts getippt und die Checkbox nicht abgewählt).
        setNotes(prev => (prev === STANDARD_NOTES ? text : prev))
      })
      .catch(() => {})
    // Schlägt der Fetch fehl, bleibt die Tabelle leer und die Vorschau zeigt keine
    // Pauschale — besser als eine erfundene, von der das Backend nachher abweicht.
    getQuoteTravelCostTable()
      .then(res => setTravelCostTable(res.travel_cost_table ?? []))
      .catch(() => {})
    getQuoteSkontoDefaults()
      .then(d => {
        const pct = d.pct != null ? String(d.pct) : ''
        const days = d.days != null ? String(d.days) : ''
        setSkontoDefaults({ pct, days })
        // Nur vorbelegen, solange der Nutzer nichts getippt und kein Entwurf etwas
        // gesetzt hat — sonst überschriebe die Antwort eine bewusste Eingabe.
        if (draftApplied.current) return
        setSkontoPct(prev => (prev === '' ? pct : prev))
        setSkontoDays(prev => (prev === '' ? days : prev))
        // Das Häkchen bleibt bewusst aus (siehe skontoActive oben) — die Vorgabe
        // füllt nur die Felder, angehakt wird von Hand.
      })
      .catch(() => {})
  }, [])

  // ── Auto-Entwurf: aktuellen Formularstand serialisieren ──
  function serializeDraft(): QuoteDraft {
    return {
      projectName,
      laborRows: labor.rows,
      materialRows: material.rows,
      extraProducts: extraProducts.rows,
      extraCharges: extraCharges.rows,
      includeTravelCost,
      installationRows: installation.rows,
      specialRows: special.rows,
      laborDiscount, materialDiscount, fixedPrice, skontoActive, skontoPct, skontoDays,
      notes, productDescription, useStandardNotes,
    }
  }

  function applyDraft(d: QuoteDraft) {
    draftApplied.current = true
    if (!lockedProjectName && d.projectName) setProjectName(d.projectName)
    if (d.laborRows?.length) labor.reset(d.laborRows)
    if (d.materialRows?.length) material.reset(d.materialRows)
    extraProducts.reset(d.extraProducts ?? [])
    extraCharges.reset(d.extraCharges ?? [])
    setIncludeTravelCost(d.includeTravelCost ?? true)
    installation.reset(d.installationRows ?? [])
    special.reset(d.specialRows ?? [])
    setLaborDiscount(d.laborDiscount ?? '')
    setMaterialDiscount(d.materialDiscount ?? '')
    setFixedPrice(d.fixedPrice ?? '')
    setSkontoPct(d.skontoPct ?? '')
    setSkontoDays(d.skontoDays ?? '')
    // Altentwurf ohne das Feld: gefüllter %-Satz hiess damals "Skonto an".
    setSkontoActive(d.skontoActive ?? !!(d.skontoPct ?? '').trim())
    if (d.notes != null) setNotes(d.notes)
    setProductDescription(d.productDescription ?? '')
    setUseStandardNotes(d.useStandardNotes ?? true)
  }

  const draft = useQuoteDraft({ draftKey, stdNotes, skontoDefaults, serialize: serializeDraft, apply: applyDraft })

  // Verlassen (✕ / Esc / Abbrechen): bei Inhalt erst fragen, ob der Entwurf
  // bleiben soll. Ein leeres Formular schliesst sofort — und räumt dabei einen
  // vorhandenen Entwurf weg: wer ihn gerade leergeräumt hat, will ihn beim
  // nächsten Öffnen nicht wiedersehen.
  const requestClose = useCallback(() => {
    if (!draft.isPristine) { setAskOnLeave(true); return }
    removeQuoteDraft(draftKey)
    onCancel()
  }, [draft.isPristine, draftKey, onCancel])

  useImperativeHandle(ref, () => ({ requestClose }), [requestClose])

  // Esc schliesst das Fenster — ist das PDF-Review-Modal oder die Verlassen-
  // Abfrage offen, zuerst diese (die Abfrage räumt sich selbst per Esc weg).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (pdf.pdfReview) { pdf.cancelReview(); return }
      if (askOnLeave) return
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf.pdfReview, askOnLeave, requestClose])

  // «Leer starten» im Hinweis auf den übernommenen Entwurf. Das Formular muss
  // dabei mit zurückgesetzt werden — nur den Slot zu löschen würde nichts
  // bringen, die Autospeicherung schriebe den unveränderten Stand sofort neu.
  function startEmpty() {
    labor.reset([{ ...EMPTY_LABOR }])
    material.reset([{ ...EMPTY_MATERIAL }])
    extraProducts.reset([])
    extraCharges.reset([])
    installation.reset([])
    special.reset([])
    setIncludeTravelCost(true)
    setLaborDiscount('')
    setMaterialDiscount('')
    setFixedPrice('')
    setSkontoPct('')
    setSkontoDays('')
    setProductDescription('')
    setUseStandardNotes(true)
    setNotes(stdNotes)
    draft.drop()
  }

  // Beta «Offerte neu» (docs/specs/offerte-neu.md): dieselben Zeilen, andere Ansicht.
  const neu = master.offerteNeu
  const selectedProject = projects.find(p => p.id === projectId) ?? projects.find(p => p.name === projectName)
  const distanceKm = selectedProject?.distance_km ?? null
  const hasDistance = distanceKm !== null && distanceKm !== undefined

  // Ein Payload für Speichern und Live-Kalkulation — sonst rechnete die Summenleiste
  // mit etwas anderem, als dann gespeichert wird.
  function payloadInput(): CreateQuoteInput {
    return {
      projectName,
      projectId: selectedProject?.id ?? projectId ?? null,
      laborRows: labor.rows,
      materialRows: material.rows,
      extraProducts: extraProducts.rows,
      extraCharges: extraCharges.rows,
      installationRows: installation.rows,
      specialRows: special.rows,
      includeTravelCost, laborDiscount, materialDiscount, fixedPrice,
      skontoActive, skontoPct, skontoDays, notes, productDescription, quoteType,
      discountsExplicit: neu,
    }
  }
  const vorschau = useOffertenVorschau(neu && projectName ? buildCreateQuotePayload(payloadInput()) : null)
  const kalkulationRef = useRef<HTMLElement>(null)

  async function handleSubmit() {
    if (!projectName) { setError('Bitte Projekt auswählen'); return }
    const hasLabor = labor.rows.some(r => r.description && parseNum(r.quantity) > 0)
    const hasMaterial = material.rows.some(r => r.art_nr && parseNum(r.quantity) > 0)
    const hasExtra = extraProducts.rows.some(r => r.description)
    const hasCharge = extraCharges.rows.some(r => r.description)
    const hasTravel = includeTravelCost && hasDistance
    const hasSpecial = special.rows.some(specialRowValid)
    if (!hasLabor && !hasMaterial && !hasExtra && !hasCharge && !hasTravel && !hasSpecial) {
      setError('Mindestens eine Position erforderlich')
      return
    }
    // Skonto angehakt, aber nicht ausgefüllt: früher wurde das still zu "kein Skonto"
    // und die Offerte ging ohne Hinweis zum Kunden. Der Server prüft dieselbe Regel
    // (resolve_quote_skonto) — hier nur, damit die Meldung beim Feld steht.
    const skontoMsg = skontoValidationError(skontoActive, skontoPct, skontoDays)
    if (skontoMsg) { setSkontoError(skontoMsg); setError(skontoMsg); return }
    setSkontoError('')

    setSaving(true)
    setError('')
    try {
      const created = await createQuote(buildCreateQuotePayload(payloadInput()))
      // Quelle-PDF(s) der OCR-Extraktion ins Projekt ablegen (Lieferantendokumente >
      // Bestellungen). Erst NACH erfolgreichem Speichern und best-effort — eine
      // fehlgeschlagene Ablage darf die bereits gespeicherte Offerte nicht kippen.
      if (pdf.hasSupplierDocs && selectedProject?.id) await pdf.fileSupplierDocs(selectedProject.id)
      removeQuoteDraft(draftKey)
      // Fixpreis nicht aufgegangen (über der Kalkulation oder unter Lohn + Fahrt):
      // die Offerte IST gespeichert, aber ihr Total ist nicht der eingegebene
      // Betrag — das muss der Anwender sehen, bevor sie zum Kunden geht.
      onDone(created.fixed_price_missed ? `Gespeichert — aber der Fixpreis geht nicht auf: Total der Offerte ist CHF ${fmtCHF(created.total_amount ?? 0)}, nicht der eingegebene Fixpreis. Bitte prüfen.` : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSaving(false)
    }
  }

  return (
    // `on-formular`: ohne `overflow: hidden` der Karte, sonst läuft die Summenleiste nicht mit.
    <div className={`admin-table-wrap${neu ? ' on-formular' : ''}`} style={{ padding: 24, position: 'relative' }}>
      <button
        type="button"
        onClick={requestClose}
        disabled={saving}
        title="Schliessen (Esc)"
        aria-label="Schliessen"
        className="admin-btn admin-btn-secondary admin-btn-sm"
        style={{ position: 'absolute', top: 16, right: 16, lineHeight: 1, padding: '4px 10px', fontSize: 16 }}
      >
        ✕
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 20px' }}>
        <h3 style={{ margin: 0 }}>{quoteType === 'richtofferte' ? 'Neue Richtofferte erstellen' : 'Neue Offerte erstellen'}</h3>
        {neu && <BetaBadge title="Neue Offert-Maske, die du vor allen anderen testest" />}
        {master.richtoffAvailable && (
          <div role="group" aria-label="Offerten-Typ" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {(['offerte', 'richtofferte'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setQuoteType(t)}
                className={`admin-btn admin-btn-sm ${quoteType === t ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ borderRadius: 0, border: 'none' }}
              >
                {t === 'offerte' ? 'Offerte' : 'Richtofferte'}
              </button>
            ))}
          </div>
        )}
      </div>

      {pdf.pdfReview && (
        <PdfExtractionReviewModal
          data={pdf.pdfReview}
          mode={pdf.reviewMode}
          suppliers={master.suppliers}
          pricingRules={master.pricingRules}
          onCancel={pdf.cancelReview}
          onConfirm={pdf.confirmReview}
        />
      )}

      {/* Übernommener Entwurf aus einer früheren Sitzung — reiner Hinweis, die
          Felder sind bereits gefüllt. Wer neu anfangen will, startet leer. */}
      {draft.restoredAt !== null && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', textAlign: 'left' }}>
          <span style={{ fontSize: 13 }}>
            Entwurf
            {draft.restoredAt ? ` vom ${new Date(draft.restoredAt).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''} übernommen.
          </span>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={startEmpty}>Leer starten</button>
        </div>
      )}

      {/* Verlassen mit Inhalt: Entwurf behalten oder wegwerfen? */}
      {askOnLeave && (
        <UnsavedChangesDialog
          title="Offerte verlassen"
          message="Die Offerte ist noch nicht erstellt. Soll der Entwurf für später aufbewahrt werden?"
          saveLabel="Entwurf behalten"
          discardLabel="Entwurf verwerfen"
          cancelLabel="Zurück zum Formular"
          // «Behalten»: die Autospeicherung hat ihn längst geschrieben, es ist
          // also nichts zu tun ausser zuzumachen.
          onSave={() => { setAskOnLeave(false); onCancel() }}
          onDiscard={() => { draft.drop(); setAskOnLeave(false); onCancel() }}
          onCancel={() => setAskOnLeave(false)}
        />
      )}

      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {!lockedProjectName && (
        <div style={{ marginBottom: 20 }}>
          <label className="admin-form-label">Projekt *</label>
          <select
            className="admin-form-select"
            value={projectId}
            onChange={e => {
              const p = projects.find(x => x.id === e.target.value)
              setProjectId(e.target.value)
              setProjectName(p?.name ?? '')
            }}
          >
            <option value="">-- Projekt wählen --</option>
            {/* Zwei Projekte dürfen gleich heissen — die Nummer unterscheidet sie. */}
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.project_id_text ? `${p.name} (${p.project_id_text})` : p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {neu ? (
        <OfferteNeuMaske
          projektKey={projectId || projectName}
          vorschau={vorschau}
          master={master}
          labor={labor} material={material} extraProducts={extraProducts}
          extraCharges={extraCharges} installation={installation} special={special}
          materialReorder={materialReorder} extraReorder={extraReorder}
          pdf={{ uploading: pdf.uploading, pdfError: pdf.pdfError, onPick: pdf.handlePdfUpload, onManuell: pdf.openManualEntry }}
          pdfFileRef={pdf.fileRef}
          travel={{
            distanceKm,
            amount: vorschau.vorschau?.pauschalen.fahrspesen
              ?? (hasDistance ? computeTravelCost(Number(distanceKm), travelCostTable) : 0),
            checked: includeTravelCost,
            onChange: setIncludeTravelCost,
          }}
          rabatte={{
            lohn: laborDiscount, waren: materialDiscount, fixpreis: fixedPrice,
            setLohn: setLaborDiscount, setWaren: setMaterialDiscount, setFixpreis: setFixedPrice,
          }}
          skonto={{
            aktiv: skontoActive, pct: skontoPct, tage: skontoDays, fehler: skontoError,
            setAktiv: v => { setSkontoActive(v); setSkontoError('') },
            setPct: v => { setSkontoPct(v); setSkontoError('') },
            setTage: v => { setSkontoDays(v); setSkontoError('') },
          }}
          kalkulationRef={kalkulationRef}
        />
      ) : (<>
      <LaborFieldset
        rows={labor.rows}
        roles={master.roles}
        montageEnabled={master.montageEnabled}
        keepLastRow
        onRoleChange={(i, name) => labor.update(i, {
          description: name,
          unit_price: master.roles.find(r => r.name === name)?.hourly_rate ?? null,
        })}
        onQuantityChange={(i, v) => labor.update(i, { quantity: v })}
        onHiddenChange={(i, v) => labor.update(i, { hidden: v })}
        onRemove={labor.remove}
        onAdd={() => labor.add({ ...EMPTY_LABOR })}
      />

      <KatalogMaterialFieldset
        rows={material.rows}
        master={master}
        reorder={materialReorder}
        supplierFilter={materialSupplierFilter}
        categoryFilter={materialCategoryFilter}
        onSupplierChange={setMaterialSupplierFilter}
        onCategoryChange={setMaterialCategoryFilter}
        onUpdate={material.update}
        onRemove={material.remove}
        onAdd={() => material.add({ ...EMPTY_MATERIAL })}
      />

      <ExtraProductsFieldset
        rows={extraProducts.rows}
        optionalEnabled={master.optionalEnabled}
        reorder={extraReorder}
        onUpdate={extraProducts.update}
        onRemove={extraProducts.remove}
        onAdd={() => extraProducts.add({ description: '', quantity: '1', unit: 'Stk', unit_price: '' })}
        uploading={pdf.uploading}
        pdfError={pdf.pdfError}
        fileRef={pdf.fileRef}
        onPickPdf={pdf.handlePdfUpload}
        extraActions={(
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={pdf.openManualEntry}
            title="Produkt mit Einkaufspreis, Aufschlag und Unter-Positionen erfassen — wie beim PDF, nur von Hand"
          >
            + Manuell erfassen
          </button>
        )}
      />

      <DescPriceFieldset
        title="Sonderaufwände"
        rows={extraCharges.rows}
        onChange={extraCharges.reset}
        addLabel="+ Sonderaufwand"
      />

      <TravelCostFieldset
        distanceKm={distanceKm}
        amount={hasDistance ? computeTravelCost(Number(distanceKm), travelCostTable) : 0}
        checked={includeTravelCost}
        onChange={setIncludeTravelCost}
      />

      <InstallationFieldset
        rows={installation.rows}
        templates={master.installationTemplates}
        onChange={installation.reset}
      />

      {master.specialEnabled && (
        <SpecialPositionsFieldset
          rows={special.rows}
          templates={master.specialTemplates}
          onChange={special.reset}
        />
      )}

      <DiscountsFieldset
        laborDiscount={laborDiscount}
        materialDiscount={materialDiscount}
        fixedPrice={fixedPrice}
        onLaborChange={setLaborDiscount}
        onMaterialChange={setMaterialDiscount}
        onFixedPriceChange={setFixedPrice}
      />

      <SkontoFieldset
        skontoActive={skontoActive}
        skontoPct={skontoPct}
        skontoDays={skontoDays}
        error={skontoError}
        onActiveChange={v => { setSkontoActive(v); setSkontoError('') }}
        onPctChange={v => { setSkontoPct(v); setSkontoError('') }}
        onDaysChange={v => { setSkontoDays(v); setSkontoError('') }}
      />

      </>)}

      <QuoteTextFields
        productDescription={productDescription}
        notes={notes}
        onProductDescriptionChange={setProductDescription}
        onNotesChange={setNotes}
        notesPlaceholder="Optionale Bemerkungen zur Offerte…"
        projectId={selectedProject?.id ?? (projectId || null)}
        standardNotes={{
          checked: useStandardNotes,
          onChange: on => { setUseStandardNotes(on); setNotes(on ? stdNotes : '') },
        }}
      />

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="admin-btn admin-btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Wird erstellt…' : (quoteType === 'richtofferte' ? 'Richtofferte erstellen' : 'Offerte erstellen')}
        </button>
        <button className="admin-btn admin-btn-secondary" onClick={requestClose} disabled={saving}>Abbrechen</button>
      </div>
      {neu && (
        <Summenleiste vorschau={vorschau.vorschau} rechnet={vorschau.rechnet}
          onZurKalkulation={() => kalkulationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      )}
    </div>
  )
})

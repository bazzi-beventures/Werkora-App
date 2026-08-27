import { useMemo, useState, useEffect } from 'react'
import { listAllMaterials } from '../../api/admin/materials'
import { getProjectReport, saveProjectReport } from '../../api/admin/reports'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'
import { fmtCHF, fmtDate, todayISO } from '../utils/format'
import { parseNum } from '../utils/quotePricing'
import { QUOTE_STATUS_LABELS } from '../constants/statuses'
import { InfoHint } from '../components/InfoHint'
import { useBackButton } from '../../shared/backButton'
import { MaterialCombobox, type MaterialOption } from './MaterialCombobox'
import type { ProjectQuote } from './projectDetail/tabs'
import { getQuoteDetail } from '../../api/admin/quotes'

// Schlankes Formular zum manuellen Erfassen eines Rapports durch den Projektleiter
// — bewusst analog zu QuoteCreateForm, aber deutlich reduziert: keine KI, keine
// Unterschrift, keine Draft-Persistenz. Blöcke: Datum, Offerten-Hinweis,
// Mitarbeiter-/Stunden-Zeilen, optionale Materialpositionen, optionale Fixpreis-
// Positionen (aus der Offerte übernommen oder frei erfasst), optionale Klein-/
// Schmiermaterial-Pauschale, Arbeitsbeschrieb. Ein Rapport ohne Material wird
// exakt wie in Phase 1 abgeschickt (Material-/Kleinmaterial-/Fixpreis-Keys
// entfallen dann).
//
// Mit `editReportId` wird dieselbe Maske zum BEARBEITEN eines bereits erfassten
// manuellen Rapports: sie lädt dessen Inhalt nach und schickt ihn per PUT als
// Vollersetzung zurück. Bewusst dasselbe Formular statt einer zweiten Maske — ein
// nachgetragener Rapport ist Handarbeit, und die Korrektur muss dieselben Felder
// anbieten wie die Erfassung, sonst laufen die beiden Masken auseinander.

// Minimal-Shapes: strukturell kompatibel mit Project/StaffMember aus dem
// ProjectDetailScreen — beide werden von dort als Prop durchgereicht (nicht neu geladen).
export interface ReportFormProject {
  id: string
  name: string
  // Nur eine uuid-Spalte ohne FK — der Name wird gegen die staff-Prop aufgelöst,
  // die das Formular ohnehin schon bekommt (kein zusätzlicher Fetch).
  projektleiter_id?: string | null
  // Garantie-Vermutung des Projekts: belegt das Rapport-Häkchen vor. Der Rapport
  // trägt seinen eigenen Wert (reports.is_warranty) — bei einem Serviceeinsatz kann
  // ein Teil Garantie sein und der Rest nicht.
  is_warranty?: boolean | null
  // Leistungsart-Vermutung des Projekts (projects.art_der_arbeit, Mehrfachauswahl):
  // belegt die Ankreuzleiste vor, genau wie auf dem gedruckten Blatt. Der Rapport
  // trägt danach seinen eigenen Wert (reports.art_der_arbeit) — auf einem
  // Neumontage-Projekt ist der dritte Einsatz eben eine Reparatur.
  art_der_arbeit?: string[] | null
}

// Kanonische Leistungsarten. Werte = CHECK-Constraint von reports.art_der_arbeit
// (Migration 20260809) und Spiegel von db.projects.WORK_TYPES; Labels wie auf dem
// gedruckten Rapportblatt (services/paper_rapport.WORK_TYPES).
export const WORK_TYPES: { value: string; label: string }[] = [
  { value: 'Neumontage', label: 'Neumontage' },
  { value: 'Wiedermontage', label: 'Wiedermontage' },
  { value: 'Umbau', label: 'Umbau/Ersatz' },
  { value: 'Reparatur', label: 'Reparatur' },
  { value: 'Wartung', label: 'Service/Wartung' },
  { value: 'Demontage', label: 'Demontage' },
]

export interface ReportFormStaff {
  id: string
  name: string
}

interface StaffRow {
  staffId: string
  hours: string
  // 'standard' = Baustelle, 'werkstatt' = Vorbereitung/Reparatur in der Werkstatt
  // (labor_hours.hour_type). Der Chat-Pfad kennt die Unterscheidung seit 20260411,
  // das Formular bis 2026-08-05 nicht.
  hourType: 'standard' | 'werkstatt'
}

// Materialzeile: gewählter Katalogartikel (art_nr aus der MaterialCombobox) + Menge.
// Nur Zeilen mit aufgelöstem Artikel UND Menge > 0 werden gesendet ({ art_nr, amount }).
interface MaterialRow {
  artNr: string
  amount: string
}

// Klein-/Schmiermaterial-Pauschale: eine optionale Zeile. Wird nur mitgeschickt,
// wenn ein Betrag (> 0) erfasst ist — die Menge (Default 1) allein löst nichts aus.
interface KleinRow {
  itemName: string
  count: string
  amount: string
}

// Fixpreis-Materialzeile: freie Bezeichnung + Menge/Einheit/Preis (kein Katalog,
// keine art_nr). Entweder aus der Offerte übernommen (material_items) oder von
// Hand erfasst. Wird als `fixed_materials` gesendet und 1:1 verrechnet.
interface FixedMaterialRow {
  itemName: string
  amount: string
  unit: string
  unitPrice: string
  // Gesetzt = aus DIESER Offerte übernommen. Ein erneuter Import ersetzt nur die
  // Zeilen derselben Offerte; von Hand erfasste (undefined) und die anderer
  // Offerten bleiben erhalten. Damit lässt sich bei mehreren angenommenen
  // Offerten ('mehrfach'-Gruppe) das Material aller nacheinander übernehmen —
  // früher warf jeder zweite Import den ersten weg.
  fromQuoteId?: number
}

// ── Preisanzeige (reine Funktionen, unit-getestet) ──────────────────────────
// VK je Einheit wie in der Combobox-Beschriftung: der kalkulierte VK (Stammpreis +
// Aufschlag der Artikelgruppe), sonst der Stammpreis. Nur eine ANZEIGE — verrechnet
// wird beim Rechnungslauf mit dem dann gültigen Katalogpreis (material_usage_vk).
export function materialUnitPrice(m: MaterialOption): number {
  // Beides null = Artikel ohne Preis im Stamm; die Zeile zeigt dann 0 statt
  // "NaN CHF". Verrechnet wird ohnehin erst beim Rechnungslauf.
  return m.calc_vk ?? m.unit_price ?? 0
}

// Zeilensumme einer Katalog-Materialzeile. Null, solange kein Artikel gewählt ist
// oder die Menge nicht als Zahl > 0 lesbar ist (dann zeigt die Zeile nur den VK).
export function materialLineTotal(m: MaterialOption | null, amount: string): number | null {
  if (!m) return null
  const qty = parseNum(amount)
  if (!(qty > 0)) return null
  return qty * materialUnitPrice(m)
}

// Zwischensumme über alle vollständigen Zeilen (Artikel + Menge > 0).
export function materialRowsTotal(
  rows: { artNr: string; amount: string }[],
  byArtNr: Map<string, MaterialOption>,
): number {
  return rows.reduce((sum, r) => sum + (materialLineTotal(byArtNr.get(r.artNr) ?? null, r.amount) ?? 0), 0)
}

// Zwischensumme der Fixpreis-Positionen (Menge × Preis/Einheit).
export function fixedRowsTotal(rows: { amount: string; unitPrice: string }[]): number {
  return rows.reduce((sum, r) => {
    const qty = parseNum(r.amount)
    return qty > 0 ? sum + qty * parseNum(r.unitPrice) : sum
  }, 0)
}

// Standard-Offerte für den Hinweis: die akzeptierte (bei mehreren die neueste),
// sonst die insgesamt neueste. Reihenfolge nach created_at.
function pickDefaultQuote(quotes: ProjectQuote[]): ProjectQuote | null {
  if (quotes.length === 0) return null
  const accepted = quotes.filter(q => q.status === 'akzeptiert')
  const pool = accepted.length > 0 ? accepted : quotes
  return [...pool].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
}

function prefillDescription(q: ProjectQuote | null): string {
  return q ? `Arbeiten gemäss Offerte ${q.quote_number}` : ''
}

// Antwort von GET /pwa/admin/projects/{id}/reports/{reportId} — der gespeicherte
// Stand eines Rapports, vom Backend bereits nach den drei Material-Erfassungsarten
// aufgeteilt (db.split_report_material_rows).
export interface ReportEditPayload {
  report_date: string
  description: string | null
  massaufnahme?: boolean | null
  beratung?: boolean | null
  is_warranty?: boolean | null
  art_der_arbeit?: string[] | null
  // Einbauort des Einsatzes (reports.einbauort). null = nicht erfasst.
  einbauort?: string | null
  // Teilrapport (docs/specs/teilrapport.md). `merged_into_report_id` gesetzt heisst:
  // der Rapport steckt in einem Gesamtrapport und ist gesperrt.
  is_partial?: boolean | null
  merged_into_report_id?: number | null
  staff: { staff_id: string | null; name: string; hours: number; hour_type: string }[]
  materials: { art_nr: string; amount: number; item_name?: string }[]
  kleinmaterial: { item_name: string; count: number; amount_chf: number } | null
  fixed_materials: {
    item_name: string; amount: number; unit: string; unit_price: number
    source_quote_id?: number | null
  }[]
  editable?: boolean
  edit_blocked_reason?: string | null
}

// Zahl → Feldwert. `0` und Nachkommastellen sollen so erscheinen, wie sie erfasst
// wurden; String(0.5) = "0.5" reicht dafür, nur null/undefined wird zu ''.
function numToField(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function ReportCreateForm({
  project,
  staff,
  quotes,
  editReportId,
  onDone,
  onCancel,
  onDirtyChange,
}: {
  project: ReportFormProject
  staff: ReportFormStaff[]
  quotes: ProjectQuote[]
  // Gesetzt = Bearbeiten-Modus: der Inhalt dieses Rapports wird nachgeladen und
  // beim Speichern per PUT vollständig ersetzt. Nicht gesetzt = Neuerfassung.
  editReportId?: number
  onDone: () => void
  onCancel: () => void
  // Meldet dem Overlay-Aufrufer, ob ein Schliessen Eingaben wegwerfen würde
  // (gleicher Vertrag wie QuoteEditForm) — diese Maske hat keinen
  // localStorage-Entwurf, was hier steht, lebt nur im State.
  onDirtyChange?: (dirty: boolean) => void
}) {
  const isEdit = editReportId !== undefined
  const defaultQuote = useMemo(() => pickDefaultQuote(quotes), [quotes])
  const projektleiterName = useMemo(
    () => staff.find(s => s.id === project.projektleiter_id)?.name ?? null,
    [staff, project.projektleiter_id],
  )

  const [reportDate, setReportDate] = useState(todayISO())
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(defaultQuote?.id ?? null)
  // Im Bearbeiten-Modus startet der Beschrieb leer und wird aus dem gespeicherten
  // Rapport nachgeladen — der Offerten-Vorschlag würde den erfassten Text sonst
  // kurz überschreiben, bevor die Antwort da ist.
  const [description, setDescription] = useState<string>(isEdit ? '' : prefillDescription(defaultQuote))
  // Sobald der Beschrieb von Hand geändert wurde, überschreibt ein Offertenwechsel
  // ihn nicht mehr (sonst verliert man die Eingabe beim Umschalten der Offerte).
  // Beim Bearbeiten gilt der geladene Text von Anfang an als «von Hand gesetzt».
  const [descTouched, setDescTouched] = useState(isEdit)
  // Im Bearbeiten-Modus keine leere Startzeile: sie wird durch die geladenen
  // Stundenzeilen ersetzt und wirkte bis dahin wie eine vergessene Eingabe.
  const [rows, setRows] = useState<StaffRow[]>(
    isEdit ? [] : [{ staffId: '', hours: '', hourType: 'standard' }]
  )
  // Einsatzart-Flags (reports.massaufnahme/beratung) — bis 2026-08-05 konnte sie nur
  // der Chat-Pfad setzen, ein manuell erfasster Rapport war systematisch ärmer.
  const [massaufnahme, setMassaufnahme] = useState(false)
  const [beratung, setBeratung] = useState(false)
  // Garantie je Einsatz. Vorbelegt aus dem Projekt, aber eigenständig korrigierbar.
  const [isWarranty, setIsWarranty] = useState(!!project.is_warranty)
  // Teilrapport (docs/specs/teilrapport.md §6.3): ein Einsatz einer mehrtägigen
  // Baustelle, ohne Kundenunterschrift. Anders als «Garantiefall» KEINE Vorbelegung
  // aus dem Projekt — ob ein Einsatz Teil einer Serie ist, weiss nur, wer ihn erfasst.
  const [isPartial, setIsPartial] = useState(false)
  const [teilrapportEnabled, setTeilrapportEnabled] = useState(false)
  // Gebündelt = gesperrt (Spec §3.3). Das Gate lehnt das Bearbeiten ohnehin ab, aber
  // die Maske soll es vorher sagen statt beim Speichern.
  const [isMerged, setIsMerged] = useState(false)
  // Leistungsart je Einsatz. Vorbelegt aus dem Projekt (nur kanonische Werte — im
  // Bestand stehen dort teils Alt-Werte, die das Backend nicht annimmt).
  const [artDerArbeit, setArtDerArbeit] = useState<string[]>(
    () => WORK_TYPES.map(w => w.value).filter(v => (project.art_der_arbeit ?? []).includes(v))
  )

  function toggleWorkType(value: string) {
    setArtDerArbeit(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }
  // Einbauort des Einsatzes — EIN Feld je Rapport (reports.einbauort), nicht mehr
  // eines je Materialzeile. Tenant-spezifisch (Flag `material_standort`).
  const [einbauortEnabled, setEinbauortEnabled] = useState(false)
  const [einbauort, setEinbauort] = useState('')
  // Material ist optional: standardmässig keine Zeile. Der Katalog wird erst geladen,
  // wenn der Nutzer die erste Materialposition hinzufügt (lazy) — ein Rapport ohne
  // Material verursacht so keinen Katalog-Fetch (~4'500 Artikel bei Stobag).
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [materialsLoaded, setMaterialsLoaded] = useState(false)
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([])
  const [klein, setKlein] = useState<KleinRow>({ itemName: 'Kleinmaterial', count: '1', amount: '' })
  // Fixpreis-Positionen: aus der Offerte übernommenes Material oder frei erfasst.
  const [fixedRows, setFixedRows] = useState<FixedMaterialRow[]>([])
  const [loadingQuoteMaterial, setLoadingQuoteMaterial] = useState(false)
  const [quoteMaterialError, setQuoteMaterialError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Bearbeiten: solange der gespeicherte Stand nicht da ist, darf nicht gespeichert
  // werden — ein Submit auf dem leeren Formular würde den Rapport leerräumen.
  const [loadingExisting, setLoadingExisting] = useState(isEdit)
  // Gesetzt, wenn das Backend die Bearbeitung sperrt (abgerechnet, Chat-Rapport,
  // unterschrieben). Dann bleibt die Maske lesbar, aber der Speichern-Knopf tot.
  const [editBlocked, setEditBlocked] = useState<string | null>(null)

  const selectedQuote = useMemo(
    () => quotes.find(q => q.id === selectedQuoteId) ?? null,
    [quotes, selectedQuoteId],
  )

  // Artikel-Lookup für die Preisanzeige je Materialzeile (der Katalog kann ~4'500
  // Zeilen haben — pro Zeile ein find() wäre O(n·m) bei jedem Tastendruck).
  const materialByArtNr = useMemo(
    () => new Map(materials.map(m => [m.art_nr, m])),
    [materials],
  )
  const materialSubtotal = useMemo(
    () => materialRowsTotal(materialRows, materialByArtNr),
    [materialRows, materialByArtNr],
  )
  const fixedSubtotal = useMemo(() => fixedRowsTotal(fixedRows), [fixedRows])

  // Angenommene Offerten in Vereinigungs-Reihenfolge (variant_rank, dann id) — wie
  // merge_accepted_quotes im Backend, damit Sammel-Import und Monteur-Chat-Rapport
  // dieselbe Reihenfolge zeigen («Offerte 1» vor «Offerte 2»).
  const acceptedQuotes = useMemo(
    () => quotes
      .filter(q => q.status === 'akzeptiert')
      .sort((a, b) => ((a.variant_rank ?? 1) - (b.variant_rank ?? 1)) || (a.id - b.id)),
    [quotes],
  )
  const acceptedCount = acceptedQuotes.length
  const quoteNumberById = useMemo(
    () => new Map(quotes.map(q => [q.id, q.quote_number])),
    [quotes],
  )

  useEffect(() => {
    getMe()
      .then(me => {
        setEinbauortEnabled(isFeatureEnabled(me, 'material_standort'))
        setTeilrapportEnabled(isFeatureEnabled(me, 'teilrapport'))
      })
      // Fehler ist unkritisch: ohne Flag fehlt nur das Einbauort-Feld bzw. die
      // Teilrapport-Checkbox, der Rest des Formulars funktioniert unverändert.
      .catch(() => {})
  }, [])

  // Bearbeiten: gespeicherten Stand nachladen und ALLE Blöcke damit vorbelegen.
  // Was hier nicht ankommt, wäre beim Speichern weg — das PUT ersetzt vollständig.
  useEffect(() => {
    if (editReportId === undefined) return
    let cancelled = false
    setLoadingExisting(true)
    getProjectReport(project.id, editReportId)
      .then(res => {
        if (cancelled) return
        const r = res as ReportEditPayload
        if (r.editable === false) setEditBlocked(r.edit_blocked_reason || 'Dieser Rapport kann nicht bearbeitet werden.')
        setReportDate(r.report_date ?? todayISO())
        setDescription(r.description ?? '')
        setMassaufnahme(!!r.massaufnahme)
        setBeratung(!!r.beratung)
        setIsWarranty(!!r.is_warranty)
        setIsPartial(!!r.is_partial)
        setIsMerged(!!r.merged_into_report_id)
        setArtDerArbeit(WORK_TYPES.map(w => w.value).filter(v => (r.art_der_arbeit ?? []).includes(v)))
        setEinbauort(r.einbauort ?? '')
        setRows(
          (r.staff ?? []).map(s => ({
            // Zeilen aus der Zeit vor der staff_id (oder von gelöschtem Personal)
            // über den Namen zuordnen — sonst stünde die Zeile auf «wählen…» und
            // der Projektleiter merkt die stille Änderung erst auf der Rechnung.
            staffId: s.staff_id ?? (staff.find(x => x.name === s.name)?.id ?? ''),
            hours: numToField(s.hours),
            hourType: s.hour_type === 'werkstatt' ? 'werkstatt' : 'standard',
          })),
        )
        const mats = r.materials ?? []
        setMaterialRows(mats.map(m => ({ artNr: m.art_nr, amount: numToField(m.amount) })))
        // Der Katalog wird sonst erst beim Klick auf «+ Materialposition» geladen —
        // ohne ihn zeigte die Combobox der geladenen Zeilen keinen Artikelnamen.
        if (mats.length > 0) ensureMaterialsLoaded()
        setFixedRows((r.fixed_materials ?? []).map(f => ({
          itemName: f.item_name, amount: numToField(f.amount),
          unit: f.unit || 'Stk', unitPrice: numToField(f.unit_price),
          // Herkunft mitführen: das Bearbeiten schickt die Positionen vollständig
          // zurück (Vollersetzung) — ohne sie verlöre eine importierte Zeile beim
          // ersten Speichern ihre Offerten-Zuordnung.
          fromQuoteId: f.source_quote_id ?? undefined,
        })))
        if (r.kleinmaterial) {
          setKlein({
            itemName: r.kleinmaterial.item_name,
            count: numToField(r.kleinmaterial.count),
            amount: numToField(r.kleinmaterial.amount_chf),
          })
        }
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Rapport konnte nicht geladen werden.')
        // Ohne geladenen Stand darf nicht gespeichert werden — sonst schriebe ein
        // Submit das leere Formular über den Rapport.
        setEditBlocked('Der Rapport konnte nicht geladen werden.')
      })
      .finally(() => { if (!cancelled) setLoadingExisting(false) })
    return () => { cancelled = true }
    // staff ist beim Öffnen des Popups bereits geladen und ändert sich nicht mehr;
    // die Abhängigkeit würde das Formular beim Neuladen der Stammdaten zurücksetzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editReportId, project.id])

  // ── Dirty-Check (analog QuoteEditForm) ──
  // Der Vergleichswert ist NICHT einfach der erste Render: im Bearbeiten-Modus
  // lädt der gespeicherte Stand asynchron nach — die Basis wird erst gesetzt,
  // wenn loadingExisting abgeschlossen ist (bei Neuerfassung: nach dem ersten
  // Render, dort ist alles synchron vorbelegt).
  const dirtySnapshot = JSON.stringify({
    reportDate, selectedQuoteId, description, rows, massaufnahme, beratung,
    isWarranty, artDerArbeit, einbauort, materialRows, klein, fixedRows,
  })
  const [dirtyBaseline, setDirtyBaseline] = useState<string | null>(null)
  useEffect(() => {
    if (!loadingExisting && dirtyBaseline === null) setDirtyBaseline(dirtySnapshot)
  }, [loadingExisting, dirtyBaseline, dirtySnapshot])
  const isDirty = dirtyBaseline !== null && dirtySnapshot !== dirtyBaseline
  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty, onDirtyChange])

  // Esc schliesst das Fenster — über onCancel, der Aufrufer entscheidet (bei
  // offenen Eingaben fragt ProjectMaskDialogs nach, statt sie wegzuwerfen).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Android-Hardware-Zurück schliesst das Modal (LIFO), statt zur Hauptmaske zu springen.
  useBackButton(true, onCancel)

  function onQuoteChange(id: number) {
    setSelectedQuoteId(id)
    if (!descTouched) {
      setDescription(prefillDescription(quotes.find(q => q.id === id) ?? null))
    }
  }

  // ── Zeilen-Helfer (analog Lohnpositionen in QuoteCreateForm, aber ohne Ansatz) ──
  function updateRow(i: number, patch: Partial<StaffRow>) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows(rs => [...rs, { staffId: '', hours: '', hourType: 'standard' }])
  }
  function removeRow(i: number) {
    setRows(rs => rs.filter((_, j) => j !== i))
  }

  // ── Material-Zeilen (optional, MaterialCombobox wie in QuoteCreateForm) ──
  // Katalog beim ersten Hinzufügen einer Zeile nachladen. Fehler ist unkritisch —
  // dann bleibt die Combobox leer, der Rest des Formulars funktioniert weiter.
  function ensureMaterialsLoaded() {
    if (materialsLoaded) return
    setMaterialsLoaded(true)
    listAllMaterials()
      // MaterialOption verlangt unit_price als Zahl, der Materialstamm lässt es
      // null (kein fixer VK-Override) — dieselbe Lücke wie im
      // FrequentMaterialsPanel, sie schliesst sich mit dem MaterialOption-Umzug.
      .then(m => setMaterials(Array.isArray(m) ? (m as MaterialOption[]) : []))
      // Fehler → Flag zurücksetzen, damit der nächste Klick erneut lädt
      // (sonst bleibt die Combobox nach einem einmaligen Fehler dauerhaft leer).
      .catch(() => setMaterialsLoaded(false))
  }
  function updateMaterialRow(i: number, patch: Partial<MaterialRow>) {
    setMaterialRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function addMaterialRow() {
    ensureMaterialsLoaded()
    setMaterialRows(rs => [...rs, { artNr: '', amount: '' }])
  }
  function removeMaterialRow(i: number) {
    setMaterialRows(rs => rs.filter((_, j) => j !== i))
  }

  // ── Fixpreis-Positionen (aus Offerte übernommen oder frei erfasst) ──
  function updateFixedRow(i: number, patch: Partial<FixedMaterialRow>) {
    setFixedRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function addFixedRow() {
    setFixedRows(rs => [...rs, { itemName: '', amount: '', unit: 'Stk', unitPrice: '' }])
  }
  function removeFixedRow(i: number) {
    setFixedRows(rs => rs.filter((_, j) => j !== i))
  }

  // Material von Offerten laden und als bearbeitbare Fixpreis-Zeilen übernehmen.
  // Bewusst NUR material_items (Produkte/Zuschläge/Montage/Spezial werden vom
  // rapportbasierten Rechnungspfad bereits automatisch verrechnet — sie hier
  // zusätzlich zu tragen würde doppelt verrechnen). Eventualpositionen
  // (optional=true) werden übersprungen.
  //
  // Additiv: ein Import ersetzt nur die Zeilen der IMPORTIERTEN Offerten. Von Hand
  // erfasste Positionen (fromQuoteId undefined) und die anderer Offerten bleiben
  // in jedem Fall erhalten.
  async function importFromQuotes(toImport: ProjectQuote[], errorMessage: string): Promise<boolean> {
    if (toImport.length === 0) return false
    setLoadingQuoteMaterial(true)
    setQuoteMaterialError('')
    try {
      const details = await Promise.all(
        toImport.map(q => getQuoteDetail(q.id)),
      )
      const carried: FixedMaterialRow[] = details.flatMap((detail, i) => {
        const items = Array.isArray(detail.material_items) ? detail.material_items : []
        return items
          .filter(it => !it.optional)
          .map(it => ({
            itemName: it.description ?? '',
            amount: String(it.quantity ?? ''),
            unit: it.unit || 'Stk',
            unitPrice: String(it.unit_price ?? ''),
            fromQuoteId: toImport[i].id,
          }))
      })
      const replaced = new Set(toImport.map(q => q.id))
      setFixedRows(rs => [
        ...rs.filter(r => r.fromQuoteId === undefined || !replaced.has(r.fromQuoteId)),
        ...carried,
      ])
      return true
    } catch {
      setQuoteMaterialError(errorMessage)
      return false
    } finally {
      setLoadingQuoteMaterial(false)
    }
  }

  // Einzelne Offerte (oben gewählt) übernehmen — für die gezielte Teil-Übernahme.
  function importQuoteMaterial() {
    if (!selectedQuote) return
    return importFromQuotes([selectedQuote], 'Material der Offerte konnte nicht geladen werden.')
  }

  // ALLE angenommenen Offerten in einem Schritt — das Gegenstück zur Vereinigung im
  // Monteur-Chat-Rapport (merge_accepted_quotes). Der Beschrieb-Vorschlag nennt danach
  // alle Offertennummern («OFF-1 + OFF-2»), solange er nicht von Hand geändert wurde.
  async function importAcceptedQuotesMaterial() {
    const ok = await importFromQuotes(acceptedQuotes, 'Material der Offerten konnte nicht geladen werden.')
    if (ok && !descTouched && acceptedQuotes.length > 1) {
      setDescription(`Arbeiten gemäss Offerten ${acceptedQuotes.map(q => q.quote_number).join(' + ')}`)
    }
  }

  async function handleSubmit() {
    if (loadingExisting || editBlocked) return
    const filled = rows.filter(r => r.staffId)
    if (filled.length === 0) {
      setError('Mindestens ein Mitarbeiter mit Stunden erforderlich.')
      return
    }
    for (const r of filled) {
      const h = parseNum(r.hours)
      if (!(h > 0 && h <= 24)) {
        setError('Stunden müssen grösser als 0 und höchstens 24 sein.')
        return
      }
    }
    // Doppelt ist nur die Kombination Mitarbeiter + Stundenart: derselbe Mann mit
    // 2 h Baustelle und 3 h Werkstatt ist gewollt (die beiden Tarife unterscheiden
    // sich), zweimal dieselbe Stundenart dagegen ein Erfassungsfehler. Gleiche
    // Regel serverseitig in validate_manual_report_payload.
    const keys = filled.map(r => `${r.staffId}|${r.hourType}`)
    if (new Set(keys).size !== keys.length) {
      setError('Ein Mitarbeiter ist mit derselben Stundenart doppelt erfasst.')
      return
    }
    // Tages-Deckel pro Mitarbeiter über alle Stundenarten hinweg — sonst liesse
    // sich die 24-h-Grenze durch Aufteilen auf zwei Zeilen umgehen.
    const totalByStaff = new Map<string, number>()
    for (const r of filled) {
      totalByStaff.set(r.staffId, (totalByStaff.get(r.staffId) ?? 0) + parseNum(r.hours))
    }
    if ([...totalByStaff.values()].some(h => h > 24)) {
      setError('Ein Mitarbeiter hat insgesamt mehr als 24 Stunden an diesem Tag.')
      return
    }
    if (!description.trim()) {
      setError('Arbeitsbeschrieb erforderlich.')
      return
    }

    // Materialpositionen: nur vollständige Zeilen (Artikel + Menge > 0) zählen.
    // Halb ausgefüllte Zeilen sind ein Fehler, komplett leere werden ignoriert.
    for (const r of materialRows) {
      const hasArt = !!r.artNr
      const amt = parseNum(r.amount)
      if (hasArt && !(amt > 0)) {
        setError('Materialposition: Menge muss grösser als 0 sein.')
        return
      }
      if (!hasArt && r.amount.trim() !== '') {
        setError('Materialposition: bitte zuerst einen Artikel wählen.')
        return
      }
    }
    const materialItems = materialRows
      .filter(r => r.artNr && parseNum(r.amount) > 0)
      .map(r => ({ art_nr: r.artNr, amount: parseNum(r.amount) }))

    // Klein-/Schmiermaterial: der Betrag ist der Auslöser (die Menge hat einen
    // Default und aktiviert die Pauschale nicht allein). Ist ein Betrag erfasst,
    // müssen Menge > 0, Betrag > 0 und eine Bezeichnung vorhanden sein.
    const kleinEngaged = klein.amount.trim() !== ''
    const kleinCount = parseNum(klein.count)
    const kleinAmount = parseNum(klein.amount)
    if (kleinEngaged) {
      if (!(kleinCount > 0) || kleinCount !== Math.floor(kleinCount)) {
        setError('Klein-/Schmiermaterial: Menge muss eine ganze Zahl grösser als 0 sein.')
        return
      }
      if (!(kleinAmount > 0)) {
        setError('Klein-/Schmiermaterial: Betrag muss grösser als 0 sein.')
        return
      }
      if (!klein.itemName.trim()) {
        setError('Klein-/Schmiermaterial: Bezeichnung erforderlich.')
        return
      }
    }

    // Fixpreis-Positionen: eine Zeile zählt nur mit Bezeichnung UND Menge > 0.
    // Halb ausgefüllte Zeilen sind ein Fehler, komplett leere werden ignoriert.
    for (const r of fixedRows) {
      const hasName = r.itemName.trim() !== ''
      const amt = parseNum(r.amount)
      if (hasName && !(amt > 0)) {
        setError('Fixposition: Menge muss grösser als 0 sein.')
        return
      }
      if (!hasName && r.amount.trim() !== '') {
        setError('Fixposition: bitte eine Bezeichnung erfassen.')
        return
      }
      if (hasName && parseNum(r.unitPrice) < 0) {
        setError('Fixposition: Preis darf nicht negativ sein.')
        return
      }
    }
    const fixedMaterials = fixedRows
      .filter(r => r.itemName.trim() && parseNum(r.amount) > 0)
      .map(r => ({
        item_name: r.itemName.trim(),
        amount: parseNum(r.amount),
        unit: r.unit.trim() || 'Stk',
        unit_price: parseNum(r.unitPrice),
        // Aus welcher Offerte die Zeile importiert wurde (undefined = von Hand
        // erfasst). Der Server merkt sich das an der Position und übernimmt dieselbe
        // Offerte danach nicht noch einmal auf einem weiteren Rapport des Projekts.
        source_quote_id: r.fromQuoteId,
      }))

    setSaving(true)
    setError('')
    try {
      // Material-/Kleinmaterial-Keys nur setzen, wenn Inhalt da ist — ein Rapport
      // ohne Material bleibt so byte-identisch zur Phase-1-Nutzlast.
      const payload: {
        report_date: string
        description: string
        staff: { staff_id: string; hours: number; hour_type: string }[]
        massaufnahme: boolean
        beratung: boolean
        is_warranty: boolean
        art_der_arbeit: string[]
        is_partial?: boolean
        einbauort?: string
        materials?: { art_nr: string; amount: number }[]
        kleinmaterial?: { item_name: string; count: number; amount_chf: number }
        fixed_materials?: {
          item_name: string; amount: number; unit: string; unit_price: number
          source_quote_id?: number
        }[]
      } = {
        report_date: reportDate,
        description: description.trim(),
        staff: filled.map(r => ({
          staff_id: r.staffId, hours: parseNum(r.hours), hour_type: r.hourType,
        })),
        massaufnahme,
        beratung,
        // Immer mitschicken: das Backend erbt nur bei fehlendem Feld vom Projekt.
        // Wer das Häkchen bewusst entfernt, meint «dieser Einsatz ist verrechenbar»
        // — auch in einem Garantie-Projekt.
        is_warranty: isWarranty,
        // Wie is_warranty immer mitschicken: das Backend erbt nur beim fehlenden
        // Feld vom Projekt. Eine leer geräumte Leiste ist eine Aussage.
        art_der_arbeit: artDerArbeit,
      }
      // Teilrapport nur bei aktivem Flag mitschicken — ohne es hat der Projektleiter
      // gar kein Häkchen gesehen, und das Backend liesse beim Bearbeiten sonst den
      // Bestandswert stehen. Genau das ist gewollt: ein abgeschaltetes Feature darf
      // einen bestehenden Teilrapport nicht still zum gewöhnlichen Rapport machen.
      if (teilrapportEnabled) payload.is_partial = isPartial
      // Einbauort nur bei aktivem Flag mitschicken — ohne es hat der Projektleiter
      // gar kein Feld gesehen. Der (auch leere) String geht dann immer mit: beim
      // Bearbeiten ist ein geleertes Feld eine Aussage und löscht den Ort, während
      // ein fehlender Key den Bestandswert stehen liesse.
      if (einbauortEnabled) payload.einbauort = einbauort.trim()
      if (materialItems.length > 0) payload.materials = materialItems
      if (fixedMaterials.length > 0) payload.fixed_materials = fixedMaterials
      if (kleinEngaged && kleinCount > 0 && kleinAmount > 0) {
        payload.kleinmaterial = {
          item_name: klein.itemName.trim(),
          count: kleinCount,
          amount_chf: kleinAmount,
        }
      }
      // Bearbeiten schickt dieselbe Nutzlast per PUT — der Server ersetzt Stunden
      // und Material vollständig durch das, was hier steht.
      const res = await saveProjectReport(
        project.id, payload, isEdit ? editReportId : undefined,
      )
      // 201/200 kann Warnungen enthalten (z.B. nicht abgebuchtes Lager, unbekannte
      // art_nr). Das ist trotzdem Erfolg — kurz sichtbar machen, dann schliessen.
      const warnings = res && Array.isArray(res.warnings)
        ? (res.warnings as unknown[]).filter((w): w is string => typeof w === 'string')
        : []
      if (warnings.length > 0) {
        window.alert('Rapport gespeichert.\n\nHinweis:\n' + warnings.join('\n'))
      }
      onDone()
    } catch (err) {
      // 400 des Backends liefert eine deutsche Meldung (client.ts liest `error`/`detail`).
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24, position: 'relative' }}>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        title="Schliessen (Esc)"
        aria-label="Schliessen"
        className="admin-btn admin-btn-secondary admin-btn-sm"
        style={{ position: 'absolute', top: 16, right: 16, lineHeight: 1, padding: '4px 10px', fontSize: 16 }}
      >
        ✕
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 8px' }}>
        <h3 style={{ margin: 0 }}>{isEdit ? 'Rapport bearbeiten' : 'Rapport manuell erfassen'}</h3>
        <InfoHint
          text={isEdit
            ? 'Speichern ersetzt Stunden und Material dieses Rapports vollständig durch das, was hier steht. Bereits abgebuchtes Material wird dabei ins Lager zurückgebucht und neu abgebucht; das Rapport-PDF wird neu erzeugt.'
            : 'Der Rapport wird ohne Kundenunterschrift gespeichert und ist sofort verrechenbar.'}
        />
      </div>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>
        Projekt: <strong>{project.name}</strong>
        {projektleiterName && <> · Projektleiter: <strong>{projektleiterName}</strong></>}
      </p>

      {error && <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {editBlocked && (
        <div className="admin-alert admin-alert-error" style={{ marginBottom: 16 }}>{editBlocked}</div>
      )}
      {loadingExisting && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
          Rapport wird geladen…
        </div>
      )}

      {/* Datum */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label" htmlFor="report-date">Datum *</label>
        <input
          id="report-date"
          className="admin-form-input"
          type="date"
          value={reportDate}
          onChange={e => setReportDate(e.target.value)}
        />
      </div>

      {/* Einbauort — die Zeile unter «Produkt» auf dem gedruckten Blatt. EIN Feld
          für den ganzen Rapport: bis 20260815 hing der Ort an jeder Materialzeile,
          war dort aber bei allen Zeilen desselben Einsatzes derselbe. Nur bei
          Mandanten mit Flag `material_standort`. */}
      {einbauortEnabled && (
        <div style={{ marginBottom: 20 }}>
          {/* Der InfoHint steht NEBEN dem Label, nicht darin: ein <button> im
              <label> zählt selbst als beschriftetes Element — ein Klick auf das ⓘ
              würde ins Eingabefeld springen (und macht die Beschriftung mehrdeutig). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label className="admin-form-label" htmlFor="report-einbauort" style={{ marginBottom: 0 }}>
              Einbauort
            </label>
            <InfoHint text="Wo im Gebäude gearbeitet wurde (z. B. «Wohnzimmer Süd»). Freiwillig — leer lassen, wenn nichts vermerkt ist. Die Angabe erscheint auf dem Rapport und als Zusatz bei den Materialpositionen der Rechnung." />
          </div>
          <input
            id="report-einbauort"
            className="admin-form-input"
            placeholder="z. B. Wohnzimmer Süd"
            maxLength={120}
            value={einbauort}
            onChange={e => setEinbauort(e.target.value)}
          />
        </div>
      )}

      {/* Leistungsart — die obere Ankreuzleiste des gedruckten Blattes. Bis zur
          Migration 20260809 gab es dafür kein Feld: was der Monteur angekreuzt hatte,
          blieb beim Abtippen auf dem Papier. */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Leistungsart
          <InfoHint text="Was bei diesem Einsatz gemacht wurde — Mehrfachauswahl, wie auf dem Rapportblatt. Aus dem Projekt vorbelegt und hier korrigierbar: auf einem Neumontage-Projekt kann ein einzelner Einsatz eine Reparatur sein. Die Angabe ist dokumentarisch und ändert die Verrechnung nicht." />
        </legend>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 14 }}>
          {WORK_TYPES.map(w => (
            <label key={w.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={artDerArbeit.includes(w.value)}
                onChange={() => toggleWorkType(w.value)}
              />
              {w.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Einsatzart + Verrechnung. Die drei Angaben konnte bis 2026-08-05 nur der
          Chat-Pfad setzen; das Papierformular hält sie fest, hier werden sie erfasst. */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Einsatzart
          <InfoHint text="Was bei diesem Einsatz zusätzlich passiert ist. «Garantiefall» ist aus dem Projekt vorbelegt und gilt hier nur für diesen Rapport — die Rechnung wird dadurch nicht automatisch angepasst, sie weist beim Erstellen nur darauf hin." />
        </legend>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={massaufnahme}
              onChange={e => setMassaufnahme(e.target.checked)}
            />
            Massaufnahme
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={beratung}
              onChange={e => setBeratung(e.target.checked)}
            />
            Beratung
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={isWarranty}
              onChange={e => setIsWarranty(e.target.checked)}
            />
            Garantiefall
          </label>
          {/* Teilrapport: nur mit Feature, und gesperrt sobald der Rapport in einem
              Gesamtrapport steckt — das Gate lehnt die Bearbeitung dann ohnehin ab
              (docs/specs/teilrapport.md §6.3). */}
          {teilrapportEnabled && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: isMerged ? 0.6 : 1,
            }}>
              <input
                type="checkbox"
                checked={isPartial}
                disabled={isMerged}
                onChange={e => setIsPartial(e.target.checked)}
              />
              Teilrapport
              <InfoHint text={isMerged
                ? 'Dieser Teilrapport gehört bereits zu einem Gesamtrapport und lässt sich nicht mehr ändern. Löse die Bündelung im Reiter «Rapporte» auf, wenn du ihn anpassen musst.'
                : 'Ein Einsatz einer mehrtägigen Baustelle — ohne Kundenunterschrift. Am Schluss werden die Teilrapporte zu einem Gesamtrapport gebündelt, den der Kunde einmal unterschreibt. Bis dahin wird ein Teilrapport NICHT verrechnet.'}
              />
            </label>
          )}
        </div>
      </fieldset>

      {/* Offerten-Hinweis (rein informativ; ändert nur den Beschrieb-Vorschlag) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Offerte
          <InfoHint text="Nur ein Hinweis, aus welcher Offerte der Rapport entsteht — es wird keine Verknüpfung gespeichert. Der Bezug landet lesbar im Arbeitsbeschrieb." />
        </legend>
        {quotes.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Offerte für dieses Projekt vorhanden.</div>
        ) : (
          <>
            {/* Nicht blockierend: der Projektleiter darf den Rapport auch ohne Annahme
                erfassen (er kann die Offerte selbst annehmen). Der Monteur dagegen ist
                gesperrt, solange keine Offerte angenommen ist — dieser Hinweis erklärt,
                warum der Rapport in der Mitarbeiter-App noch nicht möglich ist. */}
            {acceptedCount === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
                Noch keine Offerte dieses Projekts ist angenommen — Monteure können dafür
                keinen Rapport erfassen.
              </div>
            )}
            {quotes.length > 1 && (
              <select
                className="admin-form-select"
                style={{ marginBottom: 12 }}
                value={selectedQuoteId ?? ''}
                onChange={e => onQuoteChange(Number(e.target.value))}
                aria-label="Offerte wählen"
              >
                {quotes.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.quote_number} · {QUOTE_STATUS_LABELS[q.status] ?? q.status} · {fmtCHF(q.total_amount)}
                  </option>
                ))}
              </select>
            )}
            {selectedQuote && (
              <div style={{ fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{selectedQuote.quote_number}</span>
                <span className="admin-badge admin-badge-open">{QUOTE_STATUS_LABELS[selectedQuote.status] ?? selectedQuote.status}</span>
                <span style={{ color: 'var(--muted)' }}>{fmtDate(selectedQuote.created_at)}</span>
                <span style={{ fontWeight: 600 }}>{fmtCHF(selectedQuote.total_amount)}</span>
              </div>
            )}
          </>
        )}
      </fieldset>

      {/* Mitarbeiter + Stunden */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>Mitarbeiter &amp; Stunden</legend>
        <InfoHint text="Baustelle und Werkstatt werden mit dem Stundensatz der jeweiligen Stundenart verrechnet (Personal → Stundensätze). Hat jemand am selben Tag beides gemacht, erfasse zwei Zeilen für ihn — eine je Stundenart." />
        {rows.map((row, i) => (
          // `quote-row`: umbricht am Desktop statt die Felder zu stauchen und wird
          // auf dem Handy zum 2-Spalten-Raster (siehe admin.css/mobile.css).
          <div key={i} className="quote-row">
            <select
              className="admin-form-select"
              style={{ flex: '2 1 200px', minWidth: 0 }}
              value={row.staffId}
              aria-label={`Mitarbeiter ${i + 1}`}
              onChange={e => updateRow(i, { staffId: e.target.value })}
            >
              <option value="">Mitarbeiter wählen…</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              className="admin-form-input"
              style={{ flex: '1 1 90px', minWidth: 0 }}
              inputMode="decimal"
              placeholder="Stunden"
              aria-label={`Stunden ${i + 1}`}
              value={row.hours}
              onChange={e => updateRow(i, { hours: e.target.value })}
            />
            <select
              className="admin-form-select"
              style={{ flex: '1 1 130px', minWidth: 0 }}
              aria-label={`Stundenart ${i + 1}`}
              value={row.hourType}
              onChange={e => updateRow(i, { hourType: e.target.value as StaffRow['hourType'] })}
            >
              <option value="standard">Baustelle</option>
              <option value="werkstatt">Werkstatt</option>
            </select>
            {rows.length > 1 && (
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm"
                onClick={() => removeRow(i)}
                title="Entfernen"
                aria-label="Zeile entfernen"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addRow}>
          + Zeile
        </button>
      </fieldset>

      {/* Materialpositionen (optional) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Material
          <InfoHint text="Optional. Katalogartikel + Menge — der angezeigte Preis ist der aktuelle Verkaufspreis aus den Stammdaten (Richtwert). Verrechnet wird beim Erstellen der Rechnung mit dem dann gültigen Katalogpreis. Zeilen ohne Artikel oder ohne Menge werden ignoriert." />
        </legend>
        {materialRows.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Kein Material erfasst.</div>
        )}
        {materialRows.map((row, i) => {
          const mat = materialByArtNr.get(row.artNr) ?? null
          const lineTotal = materialLineTotal(mat, row.amount)
          return (
            <div key={i} className="quote-row">
              <MaterialCombobox
                materials={materials}
                supplierMap={{}}
                supplierFilter=""
                categoryFilter=""
                value={row.artNr}
                onChange={artNr => updateMaterialRow(i, { artNr })}
                className="quote-main"
              />
              <input
                className="admin-form-input"
                style={{ flex: '1 1 90px', minWidth: 0 }}
                inputMode="decimal"
                placeholder="Menge"
                aria-label={`Materialmenge ${i + 1}`}
                value={row.amount}
                onChange={e => updateMaterialRow(i, { amount: e.target.value })}
              />
              {/* Preis erst ab gewähltem Artikel: VK je Einheit, und sobald eine
                  Menge dasteht zusätzlich die Zeilensumme. */}
              {mat && (
                <span
                  style={{ flex: '1 1 150px', minWidth: 0, fontSize: 13, textAlign: 'right', color: 'var(--muted)' }}
                  aria-label={`Preis Materialzeile ${i + 1}`}
                >
                  {fmtCHF(materialUnitPrice(mat))}/{mat.unit}
                  {lineTotal !== null && (
                    <>
                      {' '}
                      <strong style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>= {fmtCHF(lineTotal)}</strong>
                    </>
                  )}
                </span>
              )}
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm"
                onClick={() => removeMaterialRow(i)}
                title="Entfernen"
                aria-label="Materialzeile entfernen"
              >
                ✕
              </button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addMaterialRow}>
            + Materialposition
          </button>
          {materialSubtotal > 0 && (
            <span style={{ fontSize: 13 }}>
              Zwischensumme Material: <strong>{fmtCHF(materialSubtotal)}</strong>
            </span>
          )}
        </div>
      </fieldset>

      {/* Material aus Offerte / freie Fixpreis-Positionen (optional) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Material aus Offerte
          <InfoHint text="Optional. Übernimmt Materialpositionen der Offerte(n) als bearbeitbare Fixpreis-Zeilen (Bezeichnung, Menge, Einheit, Preis) und verrechnet sie 1:1. Produkte, Zuschläge und Montage werden NICHT übernommen — die rechnet der Rapport bereits automatisch. Eventualpositionen werden übersprungen. Bei mehreren angenommenen Offerten übernimmt «Material aller angenommenen Offerten übernehmen» alle auf einmal; gezielt pro Offerte geht weiterhin über die Auswahl oben. Freie Zeilen lassen sich auch ohne Offerte hinzufügen." />
        </legend>
        {acceptedCount > 1 && (
          <div style={{
            marginBottom: 12, fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius-xs)',
            background: 'var(--primary-soft)', color: 'var(--text)',
          }}>
            Dieses Projekt hat {acceptedCount} angenommene Offerten. «Material aller
            angenommenen Offerten übernehmen» holt die Positionen <strong>aller auf
            einmal</strong> — wie der Monteur-Rapport. Einzelne Offerten lassen sich
            weiterhin oben wählen und gezielt übernehmen; schon übernommene Zeilen
            bleiben dabei erhalten.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {acceptedCount > 1 && (
            <button
              type="button"
              className="admin-btn admin-btn-primary admin-btn-sm"
              disabled={loadingQuoteMaterial}
              onClick={importAcceptedQuotesMaterial}
              title="Materialpositionen aller angenommenen Offerten übernehmen"
            >
              {loadingQuoteMaterial ? 'Wird geladen…' : 'Material aller angenommenen Offerten übernehmen'}
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-secondary admin-btn-sm"
            disabled={!selectedQuote || loadingQuoteMaterial}
            onClick={importQuoteMaterial}
            title={selectedQuote ? 'Materialpositionen der Offerte übernehmen' : 'Zuerst oben eine Offerte wählen'}
          >
            {loadingQuoteMaterial ? 'Wird geladen…' : 'Material aus Offerte übernehmen'}
          </button>
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={addFixedRow}>
            + Position
          </button>
        </div>
        {quoteMaterialError && (
          <div className="admin-alert admin-alert-error" style={{ marginBottom: 12 }}>{quoteMaterialError}</div>
        )}
        {fixedRows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Keine Fixpreis-Position erfasst.</div>
        ) : (
          fixedRows.map((row, i) => (
            <div key={i} className="quote-row">
              {row.fromQuoteId != null && (
                <span
                  className="admin-badge admin-badge-open"
                  style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}
                  title="Aus dieser Offerte übernommen"
                >
                  {quoteNumberById.get(row.fromQuoteId) ?? 'Offerte'}
                </span>
              )}
              <input
                className="admin-form-input quote-main"
                style={{ flex: '3 1 200px', minWidth: 0 }}
                placeholder="Bezeichnung"
                aria-label={`Fixposition Bezeichnung ${i + 1}`}
                value={row.itemName}
                onChange={e => updateFixedRow(i, { itemName: e.target.value })}
              />
              <input
                className="admin-form-input"
                style={{ flex: '1 1 90px', minWidth: 0 }}
                inputMode="decimal"
                placeholder="Menge"
                aria-label={`Fixposition Menge ${i + 1}`}
                value={row.amount}
                onChange={e => updateFixedRow(i, { amount: e.target.value })}
              />
              <input
                className="admin-form-input"
                style={{ flex: '1 1 80px', minWidth: 0 }}
                placeholder="Einheit"
                aria-label={`Fixposition Einheit ${i + 1}`}
                value={row.unit}
                onChange={e => updateFixedRow(i, { unit: e.target.value })}
              />
              <input
                className="admin-form-input"
                style={{ flex: '1 1 120px', minWidth: 0 }}
                inputMode="decimal"
                placeholder="Preis/Einheit"
                aria-label={`Fixposition Preis ${i + 1}`}
                value={row.unitPrice}
                onChange={e => updateFixedRow(i, { unitPrice: e.target.value })}
              />
              {/* Zeilensumme (Menge × Preis) — erst sobald eine Menge erfasst ist. */}
              {parseNum(row.amount) > 0 && (
                <span
                  style={{ flex: '1 1 110px', minWidth: 0, fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}
                  aria-label={`Fixposition Summe ${i + 1}`}
                >
                  = <strong>{fmtCHF(parseNum(row.amount) * parseNum(row.unitPrice))}</strong>
                </span>
              )}
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm"
                onClick={() => removeFixedRow(i)}
                title="Entfernen"
                aria-label="Fixposition entfernen"
              >
                ✕
              </button>
            </div>
          ))
        )}
        {fixedSubtotal > 0 && (
          <div style={{ fontSize: 13, textAlign: 'right', marginTop: 8 }}>
            Zwischensumme Fixpositionen: <strong>{fmtCHF(fixedSubtotal)}</strong>
          </div>
        )}
      </fieldset>

      {/* Klein-/Schmiermaterial-Pauschale (optional, eine Zeile) */}
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
        <legend style={{ fontWeight: 600, padding: '0 8px' }}>
          Klein-/Schmiermaterial (Pauschale)
          <InfoHint text="Optional. Eine Pauschalzeile für nicht einzeln erfasstes Klein- und Schmiermaterial. Wird nur verrechnet, wenn ein Betrag erfasst ist." />
        </legend>
        <div className="quote-row" style={{ marginBottom: 0 }}>
          <input
            className="admin-form-input quote-main"
            style={{ flex: '2 1 200px', minWidth: 0 }}
            placeholder="Bezeichnung"
            aria-label="Kleinmaterial Bezeichnung"
            value={klein.itemName}
            onChange={e => setKlein(k => ({ ...k, itemName: e.target.value }))}
          />
          <input
            className="admin-form-input"
            style={{ flex: '1 1 90px', minWidth: 0 }}
            inputMode="numeric"
            placeholder="Menge"
            aria-label="Kleinmaterial Menge"
            value={klein.count}
            onChange={e => setKlein(k => ({ ...k, count: e.target.value }))}
          />
          <input
            className="admin-form-input"
            style={{ flex: '1 1 130px', minWidth: 0 }}
            inputMode="decimal"
            placeholder="Betrag CHF/Einheit"
            aria-label="Kleinmaterial Betrag"
            value={klein.amount}
            onChange={e => setKlein(k => ({ ...k, amount: e.target.value }))}
          />
          {/* Verrechnet wird Menge × Betrag — bei Menge > 1 sonst leicht zu übersehen. */}
          {parseNum(klein.count) > 0 && parseNum(klein.amount) > 0 && (
            <span
              style={{ flex: '1 1 110px', minWidth: 0, fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}
              aria-label="Kleinmaterial Summe"
            >
              = <strong>{fmtCHF(parseNum(klein.count) * parseNum(klein.amount))}</strong>
            </span>
          )}
        </div>
      </fieldset>

      {/* Arbeitsbeschrieb */}
      <div style={{ marginBottom: 20 }}>
        <label className="admin-form-label" htmlFor="report-description">Arbeitsbeschrieb *</label>
        <textarea
          id="report-description"
          className="admin-form-input"
          rows={4}
          style={{ resize: 'vertical' }}
          placeholder="Was wurde gemacht?"
          value={description}
          onChange={e => { setDescription(e.target.value); setDescTouched(true) }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={onCancel} disabled={saving}>
          Abbrechen
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleSubmit}
          disabled={saving || loadingExisting || !!editBlocked}
        >
          {saving ? 'Wird gespeichert…' : isEdit ? 'Änderungen speichern' : 'Rapport speichern'}
        </button>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  deletePositionTemplate, deleteQuoteAttachmentTemplate, getQuotePositionTemplates,
  getQuoteSkontoDefaults, getQuoteValidity, listQuoteAttachmentTemplates, savePositionTemplate,
  saveQuoteSkontoDefaults as patchQuoteSkontoDefaults,
  saveQuoteValidity as patchQuoteValidity, uploadQuoteAttachmentTemplate,
} from '../../../api/admin/quoteTemplates'
import type {
  InstallationTpl, QuoteAttachmentTpl, QuoteValidity, SpecialTpl,
} from '../../../api/admin/quoteTemplates'
import { getMe } from '../../../api/auth'
import { isFeatureEnabled } from '../../../api/modules'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast, ToastHost } from '../../components/useToast'
import { useTenantText } from '../../components/TenantTextSetting'
import { AttachmentsSection } from './AttachmentsSection'
import { PositionTemplateModal } from './PositionTemplateModal'
import { PositionTemplateTables } from './PositionTemplateTables'
import { QuoteMailTextSettings, QuotePdfTextSettings } from './QuoteTextSettings'
import { QuoteValiditySection } from './QuoteValiditySection'
import { SkontoDefaultsSection } from './SkontoDefaultsSection'
import {
  EMPTY_FORM,
  type EditState, type FormState, type Kind,
} from './types'

// Vorlagen für die Offerten-Sektionen "Montagepositionen" und "Sonderpositionen".
// Spiegelt die Schnell-Buttons im Offerte-Formular — hier zentral pflegbar, ohne Migration.
//
// Die reinen Textbausteine (Bemerkungen, Disclaimer, Mail-Texte …) laufen über
// useTenantText/<TenantTextSetting/> — ein Baustein pro Endpoint der Backend-
// Factory make_tenant_text_endpoints. Nur Positions-Vorlagen, Standard-Anhänge
// und die Skonto-Vorgabe (zwei Zahlen, eigener Vertrag) haben eigenen Code.
export function OffertenVorlagenPanel() {
  const [installation, setInstallation] = useState<InstallationTpl[]>([])
  const [special, setSpecial] = useState<SpecialTpl[]>([])
  const [specialFeatureOn, setSpecialFeatureOn] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  // Stand beim Öffnen des Modals — Vergleichswert für den Dirty-Check. Ein Klick
  // neben das Fenster darf eine angefangene Vorlage nicht kommentarlos wegwerfen.
  const [formOpened, setFormOpened] = useState<FormState>(EMPTY_FORM)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { toast, showToast } = useToast()
  const [richtoffAvailable, setRichtoffAvailable] = useState(false)

  // Textbausteine — je Endpoint ein Hook; Semantik (2-/3-Zustand, Reset-Payload)
  // siehe TenantTextSetting.tsx.
  const stdNotes = useTenantText('/pwa/admin/quote-standard-notes', 'notes', {
    showToast, savedMsg: 'Standard-Bemerkungen gespeichert', resetPayload: '',
  })
  const disc = useTenantText('/pwa/admin/quote-footer-disclaimer', 'disclaimer', {
    showToast, savedMsg: 'Disclaimer gespeichert',
  })
  const discR = useTenantText('/pwa/admin/quote-footer-disclaimer-richtofferte', 'disclaimer', {
    showToast, savedMsg: 'Disclaimer (Richtofferte) gespeichert',
  })
  const skontoText = useTenantText('/pwa/admin/quote-skonto-text', 'text', {
    showToast, savedMsg: 'Skonto-Begleittext gespeichert',
  })
  const thankyou = useTenantText('/pwa/admin/quote-thankyou-text', 'text', {
    showToast, savedMsg: 'Danke-Text gespeichert',
  })
  const rejection = useTenantText('/pwa/admin/quote-rejection-text', 'text', {
    showToast, savedMsg: 'Absage-Text gespeichert',
  })
  const orderConfirmation = useTenantText('/pwa/admin/quote-order-confirmation-text', 'text', {
    showToast, savedMsg: 'Auftragsbestätigung gespeichert',
  })
  const textsLoading = [stdNotes, disc, discR, skontoText, thankyou, rejection, orderConfirmation].some(s => s.loading)

  // Skonto-Vorgabe: beide Felder als String im State (Eingabefeld), Zahl erst beim Speichern.
  const [skontoDefPct, setSkontoDefPct] = useState('')
  const [skontoDefDays, setSkontoDefDays] = useState('')
  const [skontoDefSaved, setSkontoDefSaved] = useState({ pct: '', days: '' })
  const [savingSkontoDef, setSavingSkontoDef] = useState(false)
  // Gültigkeitsdauer: Eingabefeld als String, der wirksame Stand (inkl. Grenzen und
  // System-Default) kommt vom Server — das Formular rät ihn nicht.
  const [validity, setValidity] = useState<QuoteValidity | null>(null)
  const [validityMonths, setValidityMonths] = useState('')
  const [savingValidity, setSavingValidity] = useState(false)
  const [attachments, setAttachments] = useState<QuoteAttachmentTpl[]>([])
  // Suchfeld der Anhänge: liegt hier, weil die Sektion bei jedem Neuladen
  // (Spinner) unmountet — in der Sektion selbst wäre der Filter danach weg.
  const [attSearch, setAttSearch] = useState('')
  const [attUploading, setAttUploading] = useState(false)
  const [attDeleting, setAttDeleting] = useState<string | null>(null)
  const [anhangFeatureOn, setAnhangFeatureOn] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [data, skontoDef, att, val] = await Promise.all([
        getQuotePositionTemplates(),
        getQuoteSkontoDefaults(),
        listQuoteAttachmentTemplates(),
        getQuoteValidity(),
      ])
      setInstallation(data.installation ?? [])
      setSpecial(data.special ?? [])
      setAttachments(att)
      const defPct = skontoDef.pct != null ? String(skontoDef.pct) : ''
      const defDays = skontoDef.days != null ? String(skontoDef.days) : ''
      setSkontoDefPct(defPct)
      setSkontoDefDays(defDays)
      setSkontoDefSaved({ pct: defPct, days: defDays })
      setValidity(val)
      setValidityMonths(String(val.months))
    } finally {
      setLoading(false)
    }
  }

  // Vorgabe speichern. `clear` leert beide Felder (Vorgabe entfernen) — serverseitig
  // führt ein fehlender/ungültiger %-Satz ohnehin zu NULL in beiden Spalten.
  async function saveQuoteSkontoDefaults(clear = false) {
    setSavingSkontoDef(true)
    setError('')
    try {
      const pct = clear || skontoDefPct.trim() === '' ? null : parseFloat(skontoDefPct.replace(',', '.'))
      const days = clear || skontoDefDays.trim() === '' ? null : parseInt(skontoDefDays, 10)
      const res = await patchQuoteSkontoDefaults({
        pct: pct != null && !isNaN(pct) ? pct : null,
        days: days != null && !isNaN(days) ? days : null,
      })
      // Antwort ist die normalisierte Wahrheit (z.B. 150% => keine Vorgabe) — sie
      // zurückschreiben, sonst zeigt das Formular einen Wert, den der Server verworfen hat.
      const nextPct = res.pct != null ? String(res.pct) : ''
      const nextDays = res.days != null ? String(res.days) : ''
      setSkontoDefPct(nextPct)
      setSkontoDefDays(nextDays)
      setSkontoDefSaved({ pct: nextPct, days: nextDays })
      showToast(res.pct == null ? 'Skonto-Vorgabe entfernt' : 'Skonto-Vorgabe gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingSkontoDef(false)
    }
  }

  // Gültigkeitsdauer speichern. `reset` setzt zurück auf den System-Default (Spalte NULL).
  // Die Antwort ist der wirksame Stand (der Server klemmt auf min/max) — sie wird
  // zurückgeschrieben, sonst zeigt das Feld einen Wert, den der Server so nicht hält.
  async function saveValidity(reset = false) {
    setSavingValidity(true)
    setError('')
    try {
      const months = reset ? null : parseInt(validityMonths, 10)
      const res = await patchQuoteValidity(months != null && !isNaN(months) ? months : null)
      setValidity(res)
      setValidityMonths(String(res.months))
      showToast(res.is_default ? 'Gültigkeitsdauer auf Standard zurückgesetzt' : 'Gültigkeitsdauer gespeichert')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSavingValidity(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    getMe().then(me => {
      setSpecialFeatureOn(isFeatureEnabled(me, 'sonderpositionen'))
      setRichtoffAvailable(isFeatureEnabled(me, 'richtofferte'))
      setAnhangFeatureOn(isFeatureEnabled(me, 'prospekt_mit_offerte'))
    }).catch(() => {})
  }, [])

  function openEditor(state: EditState, f: FormState) {
    setForm(f)
    setFormOpened(f)
    setEditing(state)
    setError('')
    setConfirmDiscard(false)
  }

  function closeEditor() {
    setEditing(null)
    setConfirmDiscard(false)
  }

  // Hat der Nutzer seit dem Öffnen etwas eingetippt? Nur dann fragt der
  // Backdrop-Klick nach, statt die Eingaben wegzuwerfen.
  const formIsDirty = (Object.keys(form) as (keyof FormState)[]).some(k => form[k] !== formOpened[k])

  function openNew(kind: Kind) {
    openEditor({ kind, id: 'new' }, EMPTY_FORM)
  }

  function openEditInstallation(t: InstallationTpl) {
    openEditor(
      { kind: 'installation', id: t.id },
      { ...EMPTY_FORM, label: t.label, default_fee: String(t.default_fee), notes: t.notes ?? '' },
    )
  }

  function openEditSpecial(t: SpecialTpl) {
    openEditor({ kind: 'special', id: t.id }, {
      label: t.label,
      default_fee: String(t.default_fee),
      pricing_mode: t.pricing_mode,
      default_hours: t.default_hours != null ? String(t.default_hours) : '',
      notes: t.notes ?? '',
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const fee = parseFloat(form.default_fee.replace(',', '.'))
    if (!form.label.trim() || isNaN(fee) || fee < 0) return
    if (editing.kind === 'special' && form.pricing_mode === 'stunden') {
      const h = parseFloat(form.default_hours.replace(',', '.'))
      if (isNaN(h) || h <= 0) { setError('Bitte gültige Stundenzahl angeben'); return }
    }
    setSaving(true)
    setError('')
    try {
      await savePositionTemplate(
        editing.kind,
        {
          label: form.label.trim(),
          default_fee: fee,
          notes: form.notes.trim() || null,
          ...(editing.kind === 'special' ? {
            pricing_mode: form.pricing_mode,
            default_hours: form.pricing_mode === 'stunden'
              ? parseFloat(form.default_hours.replace(',', '.'))
              : null,
          } : {}),
        },
        editing.id !== 'new' ? editing.id : undefined,
      )
      closeEditor()
      showToast('Vorlage gespeichert')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editing || editing.id === 'new') return
    if (!window.confirm(`Vorlage "${form.label}" wirklich löschen?`)) return
    setSaving(true)
    setError('')
    try {
      await deletePositionTemplate(editing.kind, editing.id)
      closeEditor()
      showToast('Vorlage gelöscht')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = '' // gleiche Datei erneut auswählbar machen
    if (files.length === 0) return
    setAttUploading(true)
    setError('')
    try {
      // Sequentiell statt parallel — so bleibt bei einem Fehler klar, welche Dateien
      // schon durch sind, und der Upload-Endpoint wird nicht geflutet.
      for (const file of files) {
        await uploadQuoteAttachmentTemplate(file)
      }
      showToast(files.length === 1 ? 'Anhang hochgeladen' : `${files.length} Anhänge hochgeladen`)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setAttUploading(false)
    }
  }

  async function handleAttachmentDelete(a: QuoteAttachmentTpl) {
    if (!window.confirm(`Anhang "${a.filename}" wirklich löschen?`)) return
    setAttDeleting(a.id)
    setError('')
    try {
      await deleteQuoteAttachmentTemplate(a.id)
      showToast('Anhang gelöscht')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setAttDeleting(null)
    }
  }

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offert-Vorlagen</div>
          <div className="admin-page-subtitle">Schnell-Buttons für Montage- und Sonderpositionen im Offerte-Formular</div>
        </div>
      </div>

      {loading || textsLoading ? (
        <div className="admin-table-wrap"><div className="admin-loading"><div className="admin-spinner" /> Laden…</div></div>
      ) : (
        <>
          <PositionTemplateTables
            installation={installation}
            special={special}
            specialFeatureOn={specialFeatureOn}
            onNew={openNew}
            onEditInstallation={openEditInstallation}
            onEditSpecial={openEditSpecial}
          />

          <AttachmentsSection
            attachments={attachments}
            featureOn={anhangFeatureOn}
            uploading={attUploading}
            deleting={attDeleting}
            search={attSearch}
            onSearchChange={setAttSearch}
            onUpload={handleAttachmentUpload}
            onDelete={handleAttachmentDelete}
          />

          <QuotePdfTextSettings
            stdNotes={stdNotes}
            disc={disc}
            discR={discR}
            skontoText={skontoText}
            richtoffAvailable={richtoffAvailable}
          />

          <SkontoDefaultsSection
            pct={skontoDefPct}
            days={skontoDefDays}
            saved={skontoDefSaved}
            saving={savingSkontoDef}
            error={error}
            onPctChange={setSkontoDefPct}
            onDaysChange={setSkontoDefDays}
            onSave={saveQuoteSkontoDefaults}
          />

          {validity && (
            <QuoteValiditySection
              months={validityMonths}
              saved={String(validity.months)}
              isDefault={validity.is_default}
              systemDefault={validity.default}
              min={validity.min}
              max={validity.max}
              saving={savingValidity}
              error={error}
              onChange={setValidityMonths}
              onSave={saveValidity}
            />
          )}

          <QuoteMailTextSettings thankyou={thankyou} rejection={rejection} orderConfirmation={orderConfirmation} />
        </>
      )}

      {editing !== null && (
        <PositionTemplateModal
          editing={editing}
          form={form}
          setForm={setForm}
          error={error}
          saving={saving}
          dirty={formIsDirty}
          onBackdropBlocked={() => setConfirmDiscard(true)}
          onClose={closeEditor}
          onSubmit={handleSave}
          onDelete={handleDelete}
        />
      )}

      {/* Klick neben das Fenster bei angefangener Vorlage: nachfragen statt wegwerfen. */}
      {confirmDiscard && (
        <ConfirmDialog
          title="Eingaben verwerfen?"
          message="Die Vorlage ist noch nicht gespeichert. Schliessen verwirft die Eingaben."
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          variant="danger"
          onConfirm={closeEditor}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}

      <ToastHost toast={toast} />
    </>
  )
}

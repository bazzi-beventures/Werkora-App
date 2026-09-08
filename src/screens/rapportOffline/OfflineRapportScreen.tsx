import { useEffect, useMemo, useState } from 'react'
import type { UserInfo } from '../../api/auth'
import { getFeature, isFeatureEnabled, KleinmaterialPromptConfig } from '../../api/modules'
import {
  newClientId,
  removeRapport,
  saveRapport,
  type PendingRapport,
  type RapportMaterialLine,
  type RapportStaffLine,
} from '../../api/rapportQueue'
import ErsatzteilPrompt, { ErsatzteilSelection } from '../../chat/ErsatzteilPrompt'
import KleinmaterialPrompt, { KleinmaterialSelection } from '../../chat/KleinmaterialPrompt'
import { WORK_TYPES } from '../../chat/LeistungsartPrompt'
import { BetaBadge } from '../../shared/BetaBadge'
import KundenAnsicht from './KundenAnsicht'
import {
  clearOfflineDraft,
  draftBlockReason,
  fromDateInput,
  loadOfflineDraft,
  saveOfflineDraft,
  todayDDMMYYYY,
  toDateInput,
  type OfflineRapportDraft,
} from './offlineRapportDraft'

/**
 * Rapport erfassen ohne Netz und ohne LLM —
 * [docs/specs/offline-modus.md](../../../../docs/specs/offline-modus.md) §4.5.3.
 *
 * Der Chat ist der bequeme Weg zu einem Rapport, nicht die einzige Quelle: was
 * einer braucht — wer wie lange, welches Material, welche Leistungsart, ein
 * Beschrieb — lässt sich tippen. Genau das passiert hier, wenn auf der Baustelle
 * kein Empfang ist.
 *
 * Die drei Schritte des Chat-Abschlusses werden **wiederverwendet, nicht
 * kopiert**: `KleinmaterialPrompt` und `ErsatzteilPrompt` (mitsamt dem
 * Katalog-Picker dahinter) sind schon heute nur über ihre Props an den Chat
 * gebunden — sie sammeln eine Auswahl und reichen sie hoch. Zwei Ersatzteil-
 * Picker, die auseinanderlaufen, wären der teuerste Fehler dieser Ausbaustufe.
 *
 * Der Weg endet nicht beim Speichern, sondern beim Kunden: «Weiter zur
 * Kundenansicht» zeigt Stunden und Material gross und ohne Preise, dort
 * unterschreibt er, und erst dann liegt der Rapport in der Queue. Ab der
 * Unterschrift ist er eingefroren — wer korrigieren muss, verwirft sie
 * ausdrücklich.
 */

interface Props {
  user: UserInfo
  /** `workTypes`: die Leistungsart des Projekts als Vorbelegung der Chips — wie
   *  im Chat (`inherited_work_types`). Sie MUSS mitkommen, wo sie bekannt ist:
   *  der Server liest ein leeres `[]` als «alles abgewählt» und übergeht dann
   *  die Vorbelegung des Projekts. */
  project: { id: string; name: string; workTypes?: string[] }
  tenantName: string
  logoUrl?: string
  /** Zurück ins Projekt-Detail. */
  onBack: () => void
  /** Ein fertiger Rapport liegt in der Queue — der Aufrufer zeigt die Karte. */
  onQueued: () => void
  /**
   * Ein wartender Rapport, der bearbeitet wird, statt eines neuen.
   *
   * Der Weg zurück aus der Karte im Projekt-Detail (§4.5.5): der Server hat den
   * Rapport abgelehnt — Projekt geschlossen, Artikel deaktiviert, Stunden
   * unplausibel —, und der Monteur korrigiert ihn. Ohne diesen Weg wäre ein
   * einmal abgelehnter Rapport dauerhaft unzustellbar: der Drain versucht ihn
   * nicht von selbst erneut (derselbe Body ergäbe dieselbe Ablehnung), und ein
   * neues Formular bekäme eine neue `clientId`.
   *
   * Die `clientId` bleibt dabei dieselbe. Ging der erste Upload doch durch und
   * nur seine Antwort verloren, erkennt der Server das Duplikat — statt einen
   * zweiten Rapport mit korrigierten Zahlen daneben zu legen.
   */
  resume?: PendingRapport | null
}

type Step = 'form' | 'kleinmaterial' | 'ersatzteile' | 'kunde'

function emptyDraft(userName: string, workTypes: string[]): OfflineRapportDraft {
  return {
    date: todayDDMMYYYY(),
    // Erste Zeile ist der Monteur selbst — in der ganz überwiegenden Zahl der
    // Fälle die einzige. Die Stunden bleiben leer: sie zu raten (etwa aus der
    // Stempeldauer) hiesse, eine Zahl vorzuschlagen, die der Kunde gleich
    // unterschreibt.
    staff: [{ name: userName, hours: null }],
    description: '',
    workTypes,
    einbauort: '',
    materials: [],
    kleinmaterial: null,
    isPartial: false,
  }
}

/** Ein wartender Rapport zurück ins Formular. */
function draftFromEntry(entry: PendingRapport): OfflineRapportDraft {
  return {
    date: entry.date,
    staff: entry.staff,
    description: entry.description,
    workTypes: entry.workTypes,
    einbauort: entry.einbauort,
    materials: entry.materials,
    kleinmaterial: entry.kleinmaterial,
    isPartial: entry.isPartial,
  }
}

export default function OfflineRapportScreen({
  user, project, tenantName, logoUrl, onBack, onQueued, resume,
}: Props) {
  const userId = user.authorized_user_id
  const [draft, setDraft] = useState<OfflineRapportDraft>(() =>
    resume
      ? draftFromEntry(resume)
      : loadOfflineDraft(userId, project.id)
        ?? emptyDraft(user.staff_name || user.display_name, project.workTypes ?? []),
  )
  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState<string | null>(resume?.lastError ?? null)
  // Ab der Unterschrift eingefroren (§4.5.4): unterschrieben wird, was der Kunde
  // gesehen hat. `signature` hält sie, bis der Rapport in der Queue liegt.
  //
  // Beim Bearbeiten bewusst NICHT übernommen: wer einen abgelehnten Rapport
  // korrigiert, ändert die Zahlen, unter denen unterschrieben wurde. Die alte
  // Unterschrift weiterzuverwenden wäre eine Fälschung — der Kunde unterschreibt
  // neu (oder der Rapport geht ohne und wird nachsigniert).
  const [signature, setSignature] = useState<string | null>(null)
  const [signedAt, setSignedAt] = useState<string | null>(null)
  // Beim Bearbeiten dieselbe id wie der wartende Eintrag: sie ersetzt ihn, statt
  // einen zweiten daneben zu legen, und deckt den Fall ab, dass der erste Upload
  // doch durchging.
  const [clientId] = useState(() => resume?.clientId ?? newClientId())
  // Liegt dieser Rapport gerade als Queue-Eintrag? Solange ja, ist DAS die
  // Fassung, und ein Entwurf daneben wäre eine zweite. Sobald der Eintrag weg
  // ist (Unterschrift verworfen), muss der Entwurf wieder mitschreiben — sonst
  // ist beim Verlassen des Screens alles weg: Stunden, Material, Beschrieb.
  const [inDerQueue, setInDerQueue] = useState(() => Boolean(resume))
  // Erfassungszeitpunkt: der Moment auf der Baustelle — nicht der des Uploads und
  // beim Bearbeiten nicht der der Korrektur. Er geht als `recorded_at` mit und
  // trägt die Plausibilisierung auf dem Server.
  const [recordedAt] = useState(() => resume?.recordedAt ?? new Date().toISOString())

  const kleinCfg = getFeature<KleinmaterialPromptConfig>(user, 'kleinmaterial_prompt')
  const kleinEnabled = !!kleinCfg?.enabled
  const ersatzEnabled = isFeatureEnabled(user, 'ersatzteil_prompt')
  const teilrapportEnabled = isFeatureEnabled(user, 'teilrapport')
  const einbauortEnabled = isFeatureEnabled(user, 'material_standort')

  const frozen = signature !== null

  // Zwischenstand mitschreiben. Nicht beim Bearbeiten eines wartenden Rapports:
  // der liegt bereits in der Queue, und ein Entwurf daneben wäre eine zweite
  // Fassung derselben Arbeit.
  useEffect(() => {
    if (frozen || inDerQueue) return
    saveOfflineDraft(userId, project.id, draft)
  }, [draft, userId, project.id, frozen, inDerQueue])

  const blockReason = useMemo(() => draftBlockReason(draft), [draft])

  function patch(fields: Partial<OfflineRapportDraft>) {
    if (frozen) return
    setDraft(prev => ({ ...prev, ...fields }))
  }

  function setStaffLine(index: number, fields: Partial<RapportStaffLine>) {
    patch({ staff: draft.staff.map((s, i) => (i === index ? { ...s, ...fields } : s)) })
  }

  function addStaffLine() {
    patch({ staff: [...draft.staff, { name: '', hours: null }] })
  }

  function removeStaffLine(index: number) {
    patch({ staff: draft.staff.filter((_, i) => i !== index) })
  }

  function toggleWorkType(value: string) {
    patch({
      workTypes: draft.workTypes.includes(value)
        ? draft.workTypes.filter(v => v !== value)
        : [...draft.workTypes, value],
    })
  }

  /** Die Auswahl des Katalog-/Ersatzteil-Schritts in Materialzeilen übersetzen. */
  function applyErsatzteile(items: ErsatzteilSelection[]) {
    const materials: RapportMaterialLine[] = items.map(it => ({
      art_nr: it.art_nr, name: it.name, unit: it.unit, amount: it.amount,
    }))
    setDraft(prev => ({ ...prev, materials }))
    setStep('kunde')
  }

  function applyKleinmaterial(sel: KleinmaterialSelection) {
    setDraft(prev => ({ ...prev, kleinmaterial: sel }))
    setStep(ersatzEnabled ? 'ersatzteile' : 'kunde')
  }

  /** Der Rapport, wie er in die Queue geht. */
  function buildEntry(sig: string | null, sigAt: string | null): PendingRapport {
    return {
      clientId,
      userId,
      projectId: project.id,
      projectName: project.name,
      date: draft.date,
      recordedAt,
      staff: draft.staff,
      description: draft.description,
      workTypes: draft.workTypes,
      einbauort: draft.einbauort,
      materials: draft.materials,
      kleinmaterial: draft.kleinmaterial,
      // Ein Teilrapport wird nie einzeln unterschrieben (der Server lehnt beides
      // zusammen ab). Statt das Häkchen beim Unterschreiben still zu kippen,
      // zeigt die Kundenansicht für ihn gar kein Unterschriftsfeld — die Wahl
      // gehört dem Monteur, nicht einer stillen Regel.
      isPartial: draft.isPartial,
      signature: sig,
      signedAt: sigAt,
      attempts: 0,
      lastError: null,
    }
  }

  /** Unterschrift aus der Kundenansicht übernehmen. Der Rapport wandert damit in
   *  die Queue — erst wenn das geklappt hat, gilt er als unterschrieben. */
  async function handleSign(dataUrl: string): Promise<boolean> {
    const at = new Date().toISOString()
    const ok = await saveRapport(buildEntry(dataUrl, at))
    if (!ok) return false
    setSignature(dataUrl)
    setSignedAt(at)
    setInDerQueue(true)
    clearOfflineDraft(userId, project.id)
    return true
  }

  /** «Kunde ist nicht da»: der Rapport geht als pendent in die Queue und wird
   *  später über den bestehenden Weg im Projekt-Detail nachsigniert. */
  async function handleSkipSignature() {
    const ok = await saveRapport(buildEntry(null, null))
    if (!ok) {
      setError('Der Rapport konnte nicht auf dem Gerät gespeichert werden. Bitte nochmals versuchen.')
      setStep('form')
      return
    }
    setInDerQueue(true)
    clearOfflineDraft(userId, project.id)
    onQueued()
  }

  /** Nach der Unterschrift zurück ins Formular: die Unterschrift wird dabei
   *  ausdrücklich verworfen. Eine weiterverwendete Unterschrift unter geänderten
   *  Zahlen wäre eine Fälschung — deshalb die Rückfrage.
   *
   *  Der Queue-Eintrag muss dabei MIT verschwinden: er trägt die Unterschrift
   *  schon (`handleSign` hat ihn geschrieben), und ein Verwerfen, das nur den
   *  React-State zurücksetzt, liesse ihn beim nächsten Drain samt Unterschrift
   *  unter den alten Zahlen hochgehen. */
  async function discardSignature() {
    if (!window.confirm(
      'Unterschrift verwerfen und weiter bearbeiten?\n\n'
      + 'Der Kunde hat unterschrieben, was er gesehen hat. Änderst du jetzt noch etwas, '
      + 'muss er neu unterschreiben.',
    )) return
    // Der Entwurf ZUERST — erst danach den Queue-Eintrag löschen. Zwischen
    // beiden Zeilen darf es keinen Moment geben, in dem die Arbeit nirgends
    // liegt.
    saveOfflineDraft(userId, project.id, draft)
    setInDerQueue(false)
    await removeRapport(clientId)
    setSignature(null)
    setSignedAt(null)
    setStep('form')
  }

  // ── Kundenansicht ──────────────────────────────────────────
  if (step === 'kunde') {
    return (
      <div className="app-screen">
        <KundenAnsicht
          entry={buildEntry(signature, signedAt)}
          tenantName={tenantName}
          logoUrl={logoUrl}
          onSign={handleSign}
          onSkip={() => void handleSkipSignature()}
          onBack={() => (frozen ? onQueued() : setStep('form'))}
        />
        {frozen && (
          <div className="offline-rapport-fertig">
            <p>Der Rapport wartet auf dem Gerät und geht raus, sobald du wieder Verbindung hast.</p>
            <button type="button" className="confirm-btn confirm-btn-yes" onClick={onQueued}>
              Fertig
            </button>
            <button type="button" className="signature-skip-btn" onClick={() => void discardSignature()}>
              Unterschrift verwerfen und bearbeiten
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Zwischenschritte: dieselben Prompts wie im Chat-Abschluss ──
  if (step === 'kleinmaterial' && kleinCfg) {
    return (
      <div className="app-screen">
        <div className="inner-header">
          <div className="back-btn" onClick={() => setStep('form')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </div>
          <div className="inner-title">Material</div>
        </div>
        <KleinmaterialPrompt
          config={kleinCfg}
          initial={draft.kleinmaterial}
          onSubmit={applyKleinmaterial}
        />
      </div>
    )
  }

  if (step === 'ersatzteile') {
    return (
      <div className="app-screen">
        <div className="inner-header">
          <div className="back-btn" onClick={() => setStep('form')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </div>
          <div className="inner-title">Ersatzteile</div>
        </div>
        {/* Mit `userId`: offline rendert der Picker aus dem Katalog-Spiegel
            (ohne Bilder) statt leer zu bleiben. `initial` hält die schon
            getroffene Wahl — sonst löschte der zweite Durchgang sie still. */}
        <ErsatzteilPrompt
          userId={userId}
          initial={draft.materials.map(m => ({
            art_nr: m.art_nr, amount: m.amount, name: m.name, unit: m.unit,
          }))}
          onSubmit={applyErsatzteile}
        />
      </div>
    )
  }

  // ── Das Formular ───────────────────────────────────────────
  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </div>
        <div className="inner-title">Rapport ohne Netz</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      <div className="context-banner context-banner-green">
        <div className="banner-tag banner-tag-green">
          {project.name} <BetaBadge />
        </div>
        <div className="banner-text">
          Erfass den Rapport hier. Er wartet auf dem Gerät und geht raus, sobald du
          wieder Verbindung hast.
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="projekte-detail-card">
        <label className="offline-rapport-label" htmlFor="offline-rapport-datum">Datum</label>
        <input
          id="offline-rapport-datum"
          type="date"
          value={toDateInput(draft.date)}
          onChange={e => patch({ date: fromDateInput(e.target.value) || draft.date })}
        />
      </div>

      <div className="projekte-detail-card">
        <div className="projekte-detail-title">Stunden</div>
        {draft.staff.map((line, i) => (
          <div key={i} className="offline-rapport-stundenzeile">
            <input
              type="text"
              value={line.name}
              placeholder="Name"
              aria-label={`Name Zeile ${i + 1}`}
              onChange={e => setStaffLine(i, { name: e.target.value })}
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              max="12"
              value={line.hours ?? ''}
              placeholder="Std."
              aria-label={`Stunden Zeile ${i + 1}`}
              onChange={e => setStaffLine(i, { hours: e.target.value === '' ? null : Number(e.target.value) })}
            />
            {draft.staff.length > 1 && (
              <button type="button" aria-label="Zeile entfernen" onClick={() => removeStaffLine(i)}>×</button>
            )}
          </div>
        ))}
        <button type="button" className="confirm-btn confirm-btn-no" onClick={addStaffLine}>
          + Person
        </button>
      </div>

      <div className="projekte-detail-card">
        <div className="projekte-detail-title">Leistungsart</div>
        <div className="leistungsart-chips">
          {WORK_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              className={`leistungsart-chip${draft.workTypes.includes(t.value) ? ' is-selected' : ''}`}
              aria-pressed={draft.workTypes.includes(t.value)}
              onClick={() => toggleWorkType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="projekte-detail-card">
        <label className="offline-rapport-label" htmlFor="offline-rapport-beschrieb">
          Was habt ihr gemacht?
        </label>
        <textarea
          id="offline-rapport-beschrieb"
          rows={4}
          value={draft.description}
          placeholder="Storen montiert, Motor ersetzt, Endlagen eingestellt…"
          onChange={e => patch({ description: e.target.value })}
        />
      </div>

      {einbauortEnabled && (
        <div className="projekte-detail-card">
          <label className="offline-rapport-label" htmlFor="offline-rapport-ort">Einbauort</label>
          <input
            id="offline-rapport-ort"
            type="text"
            value={draft.einbauort}
            placeholder="Wohnzimmer Süd, Bad…"
            onChange={e => patch({ einbauort: e.target.value })}
          />
        </div>
      )}

      {draft.materials.length > 0 && (
        <div className="projekte-detail-card">
          <div className="projekte-detail-title">Material</div>
          {draft.materials.map(m => (
            <div key={m.art_nr} className="offline-rapport-materialzeile">
              <span>{m.name}</span>
              <strong>{m.amount} {m.unit}</strong>
            </div>
          ))}
        </div>
      )}

      {teilrapportEnabled && (
        <div className="projekte-detail-card">
          <label className="offline-rapport-check">
            <input
              type="checkbox"
              checked={draft.isPartial}
              onChange={e => patch({ isPartial: e.target.checked })}
            />
            <span>
              Teilrapport — der Kunde unterschreibt erst am Schluss der Baustelle
            </span>
          </label>
        </div>
      )}

      {blockReason && <div className="offline-rapport-hinweis">{blockReason}</div>}

      <button
        type="button"
        className="confirm-btn confirm-btn-yes offline-rapport-weiter"
        disabled={blockReason !== null}
        onClick={() => {
          setError(null)
          // Die Materialschritte in derselben Reihenfolge wie im Chat-Abschluss:
          // Kleinmaterial, dann Ersatzteile, dann der Kunde.
          if (kleinEnabled && kleinCfg) setStep('kleinmaterial')
          else if (ersatzEnabled) setStep('ersatzteile')
          else setStep('kunde')
        }}
      >
        {draft.isPartial ? 'Weiter zum Material' : 'Weiter — Material und Kunde'}
      </button>
    </div>
  )
}

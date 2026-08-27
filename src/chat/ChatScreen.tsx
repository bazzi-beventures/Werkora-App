import { useEffect, useRef, useState } from 'react'
import { sendMessageStream, sendVoice, confirmReport, cancelReport, disambiguateMaterial, chooseProject, uploadPhoto, downloadRapportPdf, deleteOwnRapport, ChatResponse, DisambiguationOption, ProjectChoiceOption, SummaryItem } from '../api/chat'
import { ApiError, isOfflineError } from '../api/client'
import { UserInfo } from '../api/auth'
import { getFeature, isFeatureEnabled, KleinmaterialPromptConfig } from '../api/modules'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import SignaturePad from './SignaturePad'
import KleinmaterialPrompt, { KleinmaterialSelection } from './KleinmaterialPrompt'
import ErsatzteilPrompt, { ErsatzteilSelection } from './ErsatzteilPrompt'
import LeistungsartPrompt, { WORK_TYPES } from './LeistungsartPrompt'
import { loadDraft, saveDraft } from './rapportDraft'
import { LeaveWarning, rapportLeaveWarning } from './rapportStart'
import { RAPPORT_CLOCK_IN_HINT, useRapportClockInBlocked } from '../shared/rapportClockIn'

interface Message {
  id: number
  role: 'user' | 'bot'
  text: string
  transcription?: string
  timestamp: string
  action_taken?: string | null
  disambiguation?: DisambiguationOption[]
  // Gleichnamige Projekte zur Auswahl (siehe ProjectChoiceOption): der Monteur
  // tippt das gemeinte Projekt an, statt es dem Bot zu beschreiben.
  project_choice?: ProjectChoiceOption[]
}

interface Props {
  displayName: string
  user: UserInfo
  logoUrl?: string
  activeNav: 'rapport' | 'arbeitszeit'
  initialMessage?: string | null
  // Projekt, mit dem «Rapport erstellen» den Rapport startet. Bindet ihn sofort —
  // im Draft (überlebt Navigation/Reload) und über die Startnachricht auch
  // serverseitig. Frei im Chat begonnene Rapporte haben das nicht; deren Projekt
  // steht erst mit der ersten Zusammenfassung fest.
  initialProject?: string | null
  // Dasselbe Projekt als id — die verbindliche Angabe an den Server. Der Name
  // allein liesse die Zuordnung offen, sobald zwei Liegenschaften gleich heissen.
  initialProjectId?: string | null
  onInitialMessageConsumed?: () => void
  onNavHome: () => void
  onNavArbeitszeit: () => void
  onNavProjekte: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

let _idCounter = 0
function nextId() { return ++_idCounter }

function now() {
  return new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Beschriftung eines Projekt-Auswahlknopfs.
 *
 * Die ADRESSE steht mit drauf, nicht nur die Projektnummer: Der Monteur
 * unterscheidet zwei gleichnamige Liegenschaften über sie — auf die reine
 * Nummernfrage antwortete er deshalb mit der Adresse, und das war die Antwort,
 * an der die Zuordnung vorher zerbrach.
 */
export function projectChoiceLabel(opt: ProjectChoiceOption): string {
  const detail = [opt.object_name, opt.object_address].filter(Boolean).join(', ')
  const number = opt.project_number || 'ohne Nummer'
  return detail ? `${number} — ${detail}` : number
}

export default function ChatScreen({ displayName, user, logoUrl, activeNav, initialMessage, initialProject, initialProjectId, onInitialMessageConsumed, onNavHome, onNavArbeitszeit, onNavProjekte, onNavProfile, onLoggedOut }: Props) {
  const kleinmaterialCfg = getFeature<KleinmaterialPromptConfig>(user, 'kleinmaterial_prompt')
  const kleinmaterialEnabled = !!kleinmaterialCfg?.enabled
  const ersatzteilEnabled = isFeatureEnabled(user, 'ersatzteil_prompt')
  // Teilrapport (docs/specs/teilrapport.md §6.1): schaltet nur die Auswahl im
  // Bestätigungsschritt. Die Regeln (Verrechnung, Gates, PDF) hängen serverseitig
  // an den Daten, nicht am Flag.
  const teilrapportEnabled = isFeatureEnabled(user, 'teilrapport')

  // Stempel-Pflicht (Feature `rapport_nur_eingestempelt`): ausgestempelt nimmt der
  // Chat nichts entgegen — der Server würde die Nachricht ohnehin abweisen. Die
  // Knöpfe darüber bleiben bedienbar: ein bereits erfasster Rapport lässt sich
  // speichern und unterschreiben, auch wenn zwischendurch ausgestempelt wurde
  // (dieselbe Grenze zieht `confirm_report` serverseitig bewusst nicht nach).
  const stempelBlocked = useRapportClockInBlocked(user)

  function greetingMessage(): Message {
    return {
      id: nextId(),
      role: 'bot',
      text: `Hallo ${displayName.split(' ')[0]}! Sage z.B. „Neuer Rapport", „Foto hochladen" oder stell eine Frage.`,
      timestamp: now(),
    }
  }

  // Zwischengespeicherten Rapport genau einmal (beim ersten Render) laden, damit
  // ein angefangener Rapport nach Navigation/Reload nicht neu eingegeben werden
  // muss. Den ID-Zähler über die wiederhergestellten IDs heben, sonst kollidieren
  // neue Nachrichten-IDs mit den restaurierten.
  //
  // Als useState-Initializer, nicht als Ref-Zuweisung im Render-Rumpf: Letzteres
  // ist ein Seiteneffekt während des Renderns (Ref schreiben, `Date.now()` lesen,
  // Modul-Variable erhöhen) und färbte über `draft` jede Ableitung darunter ein —
  // 19 Meldungen des React-Compiler-Lints aus dieser einen Stelle. Der
  // Initializer ist der dafür vorgesehene Ort und läuft ebenfalls genau einmal.
  // Unter StrictMode kann er im Dev-Modus zweimal laufen; beides ist hier
  // folgenlos, weil `loadDraft` nur liest und das Anheben des Zählers idempotent
  // ist (Maximum).
  const [draft] = useState(() => {
    const d = loadDraft(user.authorized_user_id, Date.now())
    if (d) for (const m of d.messages) { if (m.id > _idCounter) _idCounter = m.id }
    return d
  })

  // Vor dem Speichern gesammelte Zusatz-Positionen (werden beim Bestätigen mitgebucht).
  // Leistungsart (reports.art_der_arbeit): erster Schritt vor dem Speichern.
  const [workTypesCollected, setWorkTypesCollected] = useState(() => draft?.workTypesCollected ?? false)
  const [collectedWorkTypes, setCollectedWorkTypes] = useState<string[]>(() => draft?.collectedWorkTypes ?? [])
  // Vorauswahl aus dem Projekt (kommt mit der Zusammenfassung vom Backend).
  const [suggestedWorkTypes, setSuggestedWorkTypes] = useState<string[]>(() => draft?.suggestedWorkTypes ?? [])
  const [kleinCollected, setKleinCollected] = useState(() => draft?.kleinCollected ?? false)
  const [ersatzCollected, setErsatzCollected] = useState(() => draft?.ersatzCollected ?? false)
  const [collectedKlein, setCollectedKlein] = useState<KleinmaterialSelection | null>(() => draft?.collectedKlein ?? null)
  const [collectedErsatz, setCollectedErsatz] = useState<ErsatzteilSelection[]>(() => draft?.collectedErsatz ?? [])
  // Hauptmaterialien der aktuellen Zusammenfassung — damit die Übersicht vor dem
  // Speichern ALLE Positionen (Haupt + Klein + Ersatzteile) zeigt, wie im PDF.
  const [summaryItems, setSummaryItems] = useState<SummaryItem[]>(() => draft?.summaryItems ?? [])
  const [messages, setMessages] = useState<Message[]>(() => draft?.messages ?? [greetingMessage()])
  const [loading, setLoading] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState(() => draft?.pendingConfirm ?? false)
  const [pendingDisambiguation, setPendingDisambiguation] = useState(() => draft?.pendingDisambiguation ?? false)
  const [pendingQuoteQuestion, setPendingQuoteQuestion] = useState(() => draft?.pendingQuoteQuestion ?? false)
  const [pendingSignReportId, setPendingSignReportId] = useState<number | null>(() => draft?.pendingSignReportId ?? null)
  // Abschluss-Wahl im Bestätigungsschritt: Unterschrift jetzt oder Teilrapport.
  // Im Draft, damit sie eine Navigation überlebt — sonst stünde der Monteur nach
  // dem Zurückspringen wieder auf «Unterschrift jetzt».
  const [partialChosen, setPartialChosen] = useState(() => draft?.partialChosen ?? false)
  // Der eben gespeicherte Rapport war ein Teilrapport: statt des Unterschriftspads
  // kommt der Hinweis, dass die Unterschrift auf dem Gesamtrapport erfolgt.
  const [savedAsPartial, setSavedAsPartial] = useState(() => draft?.savedAsPartial ?? false)
  // Projekt des laufenden Rapports — damit «Rapport erstellen» im selben Projekt in
  // den laufenden Rapport zurückspringt, statt ihn stillschweigend zu verwerfen.
  const [pendingProject, setPendingProject] = useState<string | null>(() => draft?.pendingProject ?? null)
  // Offene PROJEKT-Rückfrage: zwei Liegenschaften heissen gleich. Solange sie
  // ansteht, ist die Eingabe gesperrt — genau wie bei der Material-Rückfrage. Der
  // Monteur soll das Projekt antippen, nicht beschreiben: eine beschriebene Adresse
  // legte der Bot vorher frei aus und rapportierte auf die falsche Liegenschaft.
  // Bewusst NICHT im Draft: die Auswahl hängt an einem serverseitigen Zwischenstand,
  // der eine Navigation nicht überdauert — ein wiederhergestellter Knopf zeigte ins Leere.
  const [pendingProjectChoice, setPendingProjectChoice] = useState(false)
  const [downloadReportId, setDownloadReportId] = useState<number | null>(() => draft?.downloadReportId ?? null)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  // Unterschrieben (statt übersprungen)? Danach ist der Rapport abgenommen und
  // der Monteur kann ihn nicht mehr selbst löschen — der Server sperrt es ebenfalls.
  const [reportSigned, setReportSigned] = useState(() => draft?.reportSigned ?? false)
  const [deletingReport, setDeletingReport] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Der Zwischenstand als ein Objekt: er wird gespeichert (unten) UND bewertet
  // (beforeunload). Zwei Fassungen davon würden auseinanderlaufen, sobald jemand ein
  // Feld ergänzt.
  const draftState = {
    messages, kleinCollected, ersatzCollected, collectedKlein, collectedErsatz,
    summaryItems, pendingConfirm, pendingDisambiguation, pendingQuoteQuestion,
    pendingSignReportId, downloadReportId, reportSigned,
    workTypesCollected, collectedWorkTypes, suggestedWorkTypes, pendingProject,
    partialChosen, savedAsPartial,
  }

  // Rapport-Zwischenstand persistieren, sobald sich relevanter State ändert.
  // Leere Zustände (nur Begrüssung) löschen den Draft automatisch (siehe saveDraft).
  useEffect(() => {
    saveDraft(user.authorized_user_id, draftState, Date.now())
  }, [user.authorized_user_id, messages, kleinCollected, ersatzCollected, collectedKlein,
      collectedErsatz, summaryItems, pendingConfirm, pendingDisambiguation, pendingQuoteQuestion,
      pendingSignReportId, downloadReportId, reportSigned,
      workTypesCollected, collectedWorkTypes, suggestedWorkTypes, pendingProject,
      partialChosen, savedAsPartial])

  // Reload und Tab-schliessen: der Browser fragt selbst nach, solange ein Rapport
  // offen ist. Best effort und mit zwei Einschränkungen — der Text ist der des
  // Browsers (nicht beeinflussbar), und in der INSTALLIERTEN PWA feuert das Ereignis
  // je nach System gar nicht. Der verlässliche Weg ist die Rückfrage in App.tsx
  // (Nav-Kacheln, Zurück-Pfeil, Android-Zurück); das hier deckt Desktop und Reload ab.
  const leaveWarningRef = useRef<LeaveWarning | null>(null)
  useEffect(() => { leaveWarningRef.current = rapportLeaveWarning(draftState) })
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!leaveWarningRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Nach abgeschlossenem Rapport (PDF geschlossen) auf einen frischen Stand
  // zurücksetzen — das löscht zugleich den Draft, weil der Zustand wieder leer ist.
  function resetConversation() {
    setMessages([greetingMessage()])
    setKleinCollected(false)
    setErsatzCollected(false)
    setCollectedKlein(null)
    setCollectedErsatz([])
    setWorkTypesCollected(false)
    setCollectedWorkTypes([])
    setSuggestedWorkTypes([])
    setSummaryItems([])
    setPendingConfirm(false)
    setPendingDisambiguation(false)
    setPendingQuoteQuestion(false)
    setPendingSignReportId(null)
    setDownloadReportId(null)
    setReportSigned(false)
    setPendingProject(null)
  }

  // Selbstkorrektur: falscher Auftrag erwischt oder versehentlich doppelt erfasst.
  // Löscht den eben gespeicherten Rapport samt Stunden und Material und stellt den
  // Chat auf einen frischen Stand — der Monteur kann direkt neu erfassen.
  async function handleDeleteReport(reportId: number) {
    if (!window.confirm('Rapport wirklich löschen? Erfasste Stunden und Material werden mitgelöscht.')) return
    setDeletingReport(true)
    try {
      await deleteOwnRapport(reportId)
      resetConversation()
      addMessage({
        role: 'bot',
        text: 'Rapport gelöscht. Du kannst ihn jetzt neu erfassen.',
        timestamp: now(),
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      addMessage({
        role: 'bot',
        text: err instanceof ApiError
          ? `Rapport konnte nicht gelöscht werden: ${err.message}`
          : 'Rapport konnte nicht gelöscht werden. Bitte melde dich beim Projektleiter.',
        timestamp: now(),
      })
    } finally {
      setDeletingReport(false)
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function addMessage(msg: Omit<Message, 'id'>) {
    setMessages(prev => [...prev, { ...msg, id: nextId() }])
  }

  function handleActionState(res: ChatResponse) {
    if (res.action_taken === 'confirm_pending') {
      setPendingConfirm(true)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
      // Hauptmaterialien der Zusammenfassung merken (für die Gesamt-Übersicht)
      setSummaryItems(res.pending_summary?.items ?? [])
      // Die Zusammenfassung bestätigt das Projekt (oder korrigiert es, wenn der
      // Monteur im Gespräch gewechselt hat). Fehlt es dort, bleibt die bestehende
      // Bindung stehen — sie hier auf null zu setzen hiesse, den Rapport wieder
      // heimatlos zu machen.
      setPendingProject(prev => res.pending_summary?.project ?? prev)
      // Neue Bestätigung → Zwischenschritte zurücksetzen
      setKleinCollected(false)
      setErsatzCollected(false)
      setCollectedKlein(null)
      setCollectedErsatz([])
      // Leistungsart: steht sie schon am Projekt (aus Offerte/Auftrag), wird sie
      // NICHT nochmals abgefragt — der Monteur hat sie sonst bei jedem Rapport
      // erneut angekreuzt, obwohl das Büro sie längst erfasst hat. Sie steht in
      // der Zusammenfassung und lässt sich dort über «Ändern» korrigieren.
      const suggested = res.pending_summary?.art_der_arbeit ?? []
      setSuggestedWorkTypes(suggested)
      setCollectedWorkTypes(suggested)
      setWorkTypesCollected(suggested.length > 0)
      // Abschluss-Vorauswahl: «Teilrapport», wenn das Projekt bereits einen freien
      // Teilrapport hat — wer einmal so arbeitet, meint in aller Regel den nächsten
      // Tag derselben Serie. Sonst «Unterschrift jetzt» (docs/specs/teilrapport.md §3.10).
      setPartialChosen(res.pending_summary?.preselect_partial ?? false)
    } else if (res.action_taken === 'disambiguate') {
      setPendingDisambiguation(true)
      setPendingConfirm(false)
      setPendingQuoteQuestion(false)
      setPendingProjectChoice(false)
    } else if (res.action_taken === 'project_choice') {
      setPendingProjectChoice(true)
      setPendingConfirm(false)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
    } else if (res.action_taken === 'quote_question') {
      setPendingQuoteQuestion(true)
      setPendingConfirm(false)
      setPendingDisambiguation(false)
      setPendingProjectChoice(false)
    } else if (res.action_taken === 'save_failed') {
      // Der Server hat den erfassten Rapport BEHALTEN (Speichern schlug vorüber-
      // gehend fehl, z.B. DB-Timeout). Also zurück in den Bestätigungsschritt,
      // statt den Monteur mit einer Fehlermeldung und ohne «Speichern»-Knopf
      // stehen zu lassen. Die gesammelten Zusatz-Positionen bleiben, wie sie sind —
      // sie wurden mit demselben Aufruf noch nicht gebucht.
      setPendingConfirm(true)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
      setPendingProjectChoice(false)
    } else if (res.action_taken === 'no_pending_report') {
      // Gegenstück: der Server kennt den Rapport nicht mehr (abgelaufen oder vor
      // dem Neustart erfasst und nie gespeichert). Dann ist auch der Entwurf hier
      // tot — aufräumen, sonst warnt «Rapport erstellen» im nächsten Projekt vor
      // einem «nicht gespeicherten Rapport», den niemand mehr speichern kann.
      setPendingConfirm(false)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
      setPendingProject(null)
      setKleinCollected(false)
      setErsatzCollected(false)
      setCollectedKlein(null)
      setCollectedErsatz([])
      setWorkTypesCollected(false)
      setCollectedWorkTypes([])
      setSuggestedWorkTypes([])
      setSummaryItems([])
    } else if (res.action_taken === 'report_saved' && res.report_id) {
      // Teilrapport: kein Unterschriftspad. Die eine Unterschrift kommt am Schluss
      // auf dem Gesamtrapport — direkt in den Abschluss mit PDF-Knopf und Hinweis.
      // Der Server entscheidet das (`is_partial` in der Antwort), nicht der Client:
      // hätte er das Flag verworfen, zeigte die PWA sonst einen falschen Zustand.
      const savedPartial = res.is_partial === true
      setSavedAsPartial(savedPartial)
      if (savedPartial) {
        setPendingSignReportId(null)
        setDownloadReportId(Number(res.report_id))
      } else {
        setPendingSignReportId(Number(res.report_id))
      }
      setReportSigned(false)
      setPendingConfirm(false)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
    } else {
      setPendingConfirm(false)
      setPendingDisambiguation(false)
      setPendingQuoteQuestion(false)
      setPendingProjectChoice(false)
    }
  }

  async function handleResponse(userText: string, promise: Promise<ChatResponse>) {
    addMessage({ role: 'user', text: userText, timestamp: now() })
    setLoading(true)
    try {
      const res = await promise
      addMessage({
        role: 'bot',
        text: res.reply,
        transcription: res.transcription,
        timestamp: now(),
        action_taken: res.action_taken,
        disambiguation: res.disambiguation,
        project_choice: res.project_choice,
      })
      handleActionState(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      addMessage({ role: 'bot', text: isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Senden. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  /**
   * Streaming-Variante: legt eine leere Bot-Bubble an und füllt sie chunkweise.
   * Bei Tool-Call-Pfaden (kein Delta, nur ein Result-Event) bleibt die Bubble
   * leer — der Spinner zeigt sich währenddessen — und wird am Ende mit dem
   * vollen Reply ersetzt.
   */
  async function handleResponseStream(userText: string, startProject?: string | null, startProjectId?: string | null) {
    addMessage({ role: 'user', text: userText, timestamp: now() })
    const botId = nextId()
    setMessages(prev => [...prev, { id: botId, role: 'bot', text: '', timestamp: now() }])
    setLoading(true)
    let sawDelta = false
    try {
      let finalRes: ChatResponse | null = null
      for await (const ev of sendMessageStream(userText, startProject, startProjectId)) {
        if (ev.type === 'delta') {
          sawDelta = true
          // Spinner ausblenden, sobald der erste Token kommt
          setLoading(false)
          setMessages(prev =>
            prev.map(m => m.id === botId ? { ...m, text: m.text + ev.text } : m)
          )
        } else if (ev.type === 'result') {
          finalRes = ev.result
        }
      }
      if (!finalRes) {
        setMessages(prev =>
          prev.map(m => m.id === botId
            ? { ...m, text: m.text || 'Fehler beim Verarbeiten. Bitte erneut versuchen.' }
            : m)
        )
        return
      }
      // Result-Event ist autoritativ: Reply, action_taken, disambiguation übernehmen.
      // Falls Deltas gestreamt wurden, ist result.reply normalerweise == bisheriger Bubble-Text.
      setMessages(prev =>
        prev.map(m => m.id === botId
          ? {
              ...m,
              text: finalRes!.reply,
              action_taken: finalRes!.action_taken,
              disambiguation: finalRes!.disambiguation,
              project_choice: finalRes!.project_choice,
            }
          : m)
      )
      handleActionState(finalRes)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLoggedOut()
        return
      }
      const errText = isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler beim Senden. Bitte erneut versuchen.'
      setMessages(prev =>
        prev.map(m => m.id === botId
          ? { ...m, text: sawDelta ? m.text : errText }
          : m)
      )
    } finally {
      setLoading(false)
    }
  }

  // Steht BEWUSST hier unten, direkt hinter handleResponseStream: als
  // Funktionsdeklaration ist sie zwar gehoben und weiter oben aufrufbar, aber
  // der React Compiler meldet den Zugriff vor der Deklaration zu Recht — die
  // eingefangene Bindung wuerde nicht mitziehen, wenn sich die Funktion aendert
  // (react-hooks/immutability). Dies ist der letzte useEffect der Komponente,
  // das Verschieben aendert die Reihenfolge der Effekte also nicht.
  const initialSentRef = useRef(false)
  useEffect(() => {
    if (!initialMessage || initialSentRef.current) return
    initialSentRef.current = true
    // Bindung SOFORT setzen, nicht erst wenn die Antwort da ist: verlässt der
    // Monteur den Chat währenddessen, muss der Draft das Projekt schon tragen.
    if (initialProject) setPendingProject(initialProject)
    handleResponseStream(initialMessage, initialProject, initialProjectId)
    onInitialMessageConsumed?.()
  }, [initialMessage])

  async function handleConfirm() {
    setPendingConfirm(false)
    setLoading(true)
    try {
      const res = await confirmReport({
        kleinmaterial: collectedKlein,
        ersatzteile: collectedErsatz.map(it => ({ art_nr: it.art_nr, amount: it.amount })),
        art_der_arbeit: collectedWorkTypes,
        is_partial: partialSelectable && partialChosen,
      })
      addMessage({ role: 'bot', text: res.reply, timestamp: now(), action_taken: res.action_taken })
      handleActionState(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      // Der Aufruf kam nicht durch (Funkloch, Timeout) — der Rapport liegt
      // serverseitig unverändert weiter (confirm_report leert den Puffer erst nach
      // erfolgreichem Speichern). Also zurück in den Bestätigungsschritt, damit
      // «Speichern» ein zweites Mal möglich ist, statt den erfassten Einsatz in
      // einer Fehlermeldung enden zu lassen.
      setPendingConfirm(true)
      addMessage({ role: 'bot', text: isOfflineError(err) ? 'Keine Internetverbindung — dein Rapport bleibt gespeichert, bitte gleich nochmal auf «Speichern» tippen.' : 'Fehler beim Speichern. Bitte erneut versuchen — dein Rapport ist noch da.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setPendingConfirm(false)
    setPendingDisambiguation(false)
    // Ausdrücklicher Abbruch: die Bindung ans Projekt endet hier — und nur hier
    // (sonst erst mit dem Ablauf des Entwurfs). Der Server räumt in cancelReport
    // dasselbe ab; bliebe die Bindung im Client stehen, spränge «Rapport erstellen»
    // danach in einen Rapport zurück, den es nicht mehr gibt.
    setPendingProject(null)
    setKleinCollected(false)
    setErsatzCollected(false)
    setCollectedKlein(null)
    setCollectedErsatz([])
    setWorkTypesCollected(false)
    setCollectedWorkTypes([])
    setSuggestedWorkTypes([])
    setSummaryItems([])
    setLoading(true)
    try {
      const res = await cancelReport()
      addMessage({ role: 'bot', text: res.reply, timestamp: now() })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      addMessage({ role: 'bot', text: 'Abgebrochen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  async function handleDisambiguate(art_nr: string, displayName: string) {
    setPendingDisambiguation(false)
    addMessage({ role: 'user', text: displayName, timestamp: now() })
    setLoading(true)
    try {
      const res = await disambiguateMaterial(art_nr)
      addMessage({
        role: 'bot',
        text: res.reply,
        timestamp: now(),
        action_taken: res.action_taken,
        disambiguation: res.disambiguation,
      })
      handleActionState(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      addMessage({ role: 'bot', text: isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler bei der Auswahl. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  /**
   * Beantwortet die Projekt-Rückfrage bei gleichnamigen Projekten.
   *
   * Der Server bekommt die Projekt-id, nicht den angetippten Text: zwischen Frage
   * und Antwort steht damit kein Sprachmodell mehr. Vorher fragte der Bot per
   * Freitext nach der Projektnummer, der Monteur antwortete mit der Adresse — und
   * das Modell reimte sich daraus die falsche Nummer zusammen und legte den
   * Rapport auf der anderen Liegenschaft desselben Kunden an.
   */
  async function handleProjectChoice(opt: ProjectChoiceOption) {
    setPendingProjectChoice(false)
    addMessage({ role: 'user', text: projectChoiceLabel(opt), timestamp: now() })
    setLoading(true)
    try {
      const res = await chooseProject(opt.project_id)
      addMessage({
        role: 'bot',
        text: res.reply,
        timestamp: now(),
        action_taken: res.action_taken,
        disambiguation: res.disambiguation,
        project_choice: res.project_choice,
      })
      // Ab hier gehört der Rapport diesem Projekt — auch für «Rapport erstellen»,
      // das sonst gleich wieder vor einem angeblich fremden Rapport warnen würde.
      setPendingProject(opt.name)
      handleActionState(res)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
      // Die Auswahl steht serverseitig weiterhin offen — also auch hier wieder
      // anbieten, statt den Monteur ohne Knöpfe zurückzulassen.
      setPendingProjectChoice(true)
      addMessage({ role: 'bot', text: isOfflineError(err) ? 'Keine Internetverbindung' : 'Fehler bei der Auswahl. Bitte erneut versuchen.', timestamp: now() })
    } finally {
      setLoading(false)
    }
  }

  function onSendText(text: string) {
    if (pendingConfirm || pendingDisambiguation || pendingQuoteQuestion || pendingProjectChoice) return
    handleResponseStream(text)
  }

  function onSendVoice(blob: Blob) {
    if (pendingConfirm || pendingDisambiguation || pendingQuoteQuestion || pendingProjectChoice) return
    handleResponse('🎤 Sprachnachricht', sendVoice(blob))
  }

  function onSendPhoto(file: File) {
    if (pendingConfirm || pendingDisambiguation || pendingQuoteQuestion || pendingProjectChoice) return
    handleResponse('📸 Foto', uploadPhoto(file))
  }

  // Find the last message with disambiguation options (for rendering buttons)
  const lastDisambigMsg = pendingDisambiguation
    ? [...messages].reverse().find(m => m.disambiguation && m.disambiguation.length > 0)
    : null
  // Dasselbe für die Projekt-Rückfrage.
  const lastProjectChoiceMsg = pendingProjectChoice
    ? [...messages].reverse().find(m => m.project_choice && m.project_choice.length > 0)
    : null

  // Vor dem Speichern: erst Klein-, dann Ersatzteil-Schritt, dann Speichern-Button.
  // Reihenfolge der Zwischenschritte: Leistungsart → Kleinmaterial → Ersatzteile.
  // Die Leistungsart steht zuerst, weil sie den Einsatz beschreibt; Material ist Detail.
  const workTypeStepPending = pendingConfirm && !workTypesCollected
  const kleinStepPending = pendingConfirm && !workTypeStepPending
    && kleinmaterialEnabled && !!kleinmaterialCfg && !kleinCollected
  const ersatzStepPending = pendingConfirm && !workTypeStepPending && !kleinStepPending
    && ersatzteilEnabled && !ersatzCollected
  const confirmReady = pendingConfirm && !workTypeStepPending && !kleinStepPending && !ersatzStepPending
  const hasExtras = !!collectedKlein?.amount_chf || collectedErsatz.length > 0
  // Die Abschluss-Wahl gibt es nur mit dem Feature. Ohne es bleibt alles wie bisher:
  // speichern, dann unterschreiben.
  const partialSelectable = teilrapportEnabled

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className="chat-header">
        <div className="back-btn" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
        <div>
          <div className="chat-header-title">Rapporte</div>
          <div className="chat-header-sub">Rapport Bot · KI-Assistent</div>
        </div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            text={msg.text}
            transcription={msg.transcription}
            timestamp={msg.timestamp}
          />
        ))}
        {loading && (
          <div className="msg-row msg-row-bot">
            <div className="typing-dot-row">
              <span /><span /><span />
            </div>
          </div>
        )}

        {/* Disambiguation buttons */}
        {lastDisambigMsg && !loading && (
          <div className="disambig-buttons">
            {lastDisambigMsg.disambiguation!.map(opt => (
              <button
                key={opt.art_nr}
                className="disambig-btn"
                onClick={() => handleDisambiguate(opt.art_nr, opt.name)}
              >
                {opt.name}
                {opt.manufacturer || opt.category
                  ? ` (${opt.manufacturer || opt.category})`
                  : ''}
              </button>
            ))}
          </div>
        )}

        {/* Projekt-Auswahl bei gleichnamigen Projekten */}
        {lastProjectChoiceMsg && !loading && (
          <div className="disambig-buttons">
            {lastProjectChoiceMsg.project_choice!.map(opt => (
              <button
                key={opt.project_id}
                className="disambig-btn"
                onClick={() => void handleProjectChoice(opt)}
              >
                {projectChoiceLabel(opt)}
              </button>
            ))}
          </div>
        )}

        {/* Offerten Ja/Nein buttons */}
        {pendingQuoteQuestion && !loading && (
          <div className="disambig-buttons">
            <button
              className="disambig-btn"
              onClick={() => {
                setPendingQuoteQuestion(false)
                handleResponseStream('Ja')
              }}
            >
              Ja, Offerte verwenden
            </button>
            <button
              className="disambig-btn"
              onClick={() => {
                setPendingQuoteQuestion(false)
                handleResponseStream('Nein')
              }}
            >
              Nein, normaler Flow
            </button>
          </div>
        )}

        {/* Vor dem Speichern: Leistungsart ankreuzen — nur wenn sie nicht schon vom
            Projekt (Offerte/Auftrag) kommt, sowie beim «Ändern» aus der
            Zusammenfassung. */}
        {workTypeStepPending && !loading && (
          <LeistungsartPrompt
            // Fallback auf die Projekt-Vorauswahl deckt Entwürfe ab, die noch vor
            // dieser Änderung gespeichert wurden (collectedWorkTypes dort leer).
            initial={collectedWorkTypes.length > 0 ? collectedWorkTypes : suggestedWorkTypes}
            onSubmit={(sel) => { setCollectedWorkTypes(sel); setWorkTypesCollected(true) }}
          />
        )}

        {/* Vor dem Speichern: Klein-/Schmiermaterial-Schritt (Feature aktiv) */}
        {kleinStepPending && kleinmaterialCfg && !loading && (
          <KleinmaterialPrompt
            config={kleinmaterialCfg}
            onSubmit={(sel) => { setCollectedKlein(sel); setKleinCollected(true) }}
          />
        )}

        {/* Vor dem Speichern: Ersatzteil-Schritt (nach Kleinmaterial, Feature aktiv) */}
        {ersatzStepPending && !loading && (
          <ErsatzteilPrompt
            onSubmit={(items) => { setCollectedErsatz(items); setErsatzCollected(true) }}
          />
        )}

        {/* Recap der gesammelten Zusatz-Positionen + Speichern/Abbrechen */}
        {confirmReady && !loading && (
          <>
            {/* Leistungsart: aus dem Projekt übernommen (Offerte/Auftrag) oder eben
                angekreuzt — hier sichtbar statt als eigene Abfrage, korrigierbar
                über «Ändern». */}
            <div className="leistungsart-recap">
              <div className="leistungsart-recap-text">
                <span className="leistungsart-recap-label">Leistungsart</span>
                <span className="leistungsart-recap-value">
                  {collectedWorkTypes.length > 0
                    ? collectedWorkTypes.map(v => WORK_TYPES.find(w => w.value === v)?.label ?? v).join(', ')
                    : 'keine angegeben'}
                </span>
              </div>
              <button
                type="button"
                className="leistungsart-recap-edit"
                onClick={() => setWorkTypesCollected(false)}
              >
                Ändern
              </button>
            </div>

            {hasExtras && (
              <div className="kleinmaterial-prompt">
                {/* Komplette Material-Übersicht (Haupt + Klein + Ersatzteile) —
                    entspricht dem, was auf dem PDF/Rapport landet. Die
                    Zusammenfassung oben zeigt nur die Hauptmaterialien; die
                    Zusatz-Positionen kommen erst danach dazu. */}
                <div className="kleinmaterial-title">Material im Rapport</div>
                <div className="ersatzteil-list">
                  {summaryItems.map((it, i) => (
                    <div key={`main-${i}`} className="ersatzteil-row">
                      <span className="ersatzteil-name">
                        {it.art_nr ? <span className="ersatzteil-artnr">{it.art_nr}</span> : null} {it.name}
                      </span>
                      <span>{it.amount} {it.unit ?? ''}</span>
                    </div>
                  ))}
                  {collectedKlein?.amount_chf ? (
                    <div className="ersatzteil-row">
                      <span className="ersatzteil-name">Klein-/Schmiermaterial</span>
                      <span>CHF {collectedKlein.amount_chf} × {collectedKlein.count} = CHF {collectedKlein.amount_chf * collectedKlein.count}</span>
                    </div>
                  ) : null}
                  {collectedErsatz.map(it => (
                    <div key={it.art_nr} className="ersatzteil-row">
                      <span className="ersatzteil-name">
                        <span className="ersatzteil-artnr">{it.art_nr}</span> {it.name}
                      </span>
                      <span>{it.amount} {it.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Abschluss: Unterschrift jetzt oder Teilrapport (die eine Unterschrift
                kommt am Schluss auf dem Gesamtrapport). Vorausgewählt ist, was das
                Projekt nahelegt — docs/specs/teilrapport.md §3.10. */}
            {partialSelectable && (
              <div className="abschluss-wahl">
                <div className="abschluss-wahl-label">Abschluss</div>
                <div className="abschluss-wahl-options">
                  <button
                    type="button"
                    className={`abschluss-wahl-option${partialChosen ? '' : ' is-active'}`}
                    aria-pressed={!partialChosen}
                    onClick={() => setPartialChosen(false)}
                  >
                    Unterschrift jetzt
                  </button>
                  <button
                    type="button"
                    className={`abschluss-wahl-option${partialChosen ? ' is-active' : ''}`}
                    aria-pressed={partialChosen}
                    onClick={() => setPartialChosen(true)}
                  >
                    Teilrapport
                  </button>
                </div>
                <div className="abschluss-wahl-hint">
                  {partialChosen
                    ? 'Die Unterschrift holst du am Schluss auf dem Gesamtrapport.'
                    : 'Der Kunde unterschreibt gleich nach dem Speichern.'}
                </div>
              </div>
            )}
            <div className="confirm-buttons">
              <button className="confirm-btn confirm-btn-yes" onClick={handleConfirm}>
                {partialSelectable && partialChosen ? 'Teilrapport speichern' : 'Speichern'}
              </button>
              <button className="confirm-btn confirm-btn-no" onClick={handleCancel}>
                Abbrechen
              </button>
            </div>
          </>
        )}

        {/* Inline signature pad — shown after report is saved */}
        {pendingSignReportId !== null && (
          <>
            <SignaturePad
              reportId={pendingSignReportId}
              onDone={(signed) => {
                setReportSigned(signed)
                setDownloadReportId(pendingSignReportId)
                setPendingSignReportId(null)
              }}
              onLoggedOut={onLoggedOut}
            />
            {/* Selbstkorrektur direkt nach dem Speichern — solange nicht unterschrieben */}
            <div className="confirm-buttons">
              <button
                className="confirm-btn confirm-btn-no"
                disabled={deletingReport}
                onClick={() => void handleDeleteReport(pendingSignReportId)}
              >
                {deletingReport ? 'Wird gelöscht…' : '🗑 Rapport löschen'}
              </button>
            </div>
          </>
        )}

        {/* Teilrapport gespeichert: statt des Unterschriftspads der Hinweis, wo die
            Unterschrift herkommt — sonst sähe der Monteur ein übersprungenes
            Unterschriftsfeld und hielte den Rapport für unfertig. */}
        {savedAsPartial && downloadReportId !== null && (
          <div className="teilrapport-hinweis">
            Teilrapport gespeichert — die Unterschrift holst du am Schluss auf dem
            Gesamtrapport (Projekt → «Gesamtrapport erstellen»).
          </div>
        )}

        {/* PDF Download button — shown after signature is done or skipped */}
        {downloadReportId !== null && (
          <div className="confirm-buttons">
            <button
              className="confirm-btn confirm-btn-yes"
              disabled={pdfDownloading}
              onClick={async () => {
                setPdfDownloading(true)
                try {
                  const { blob, filename } = await downloadRapportPdf(downloadReportId, reportSigned)
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = filename
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (err) {
                  if (err instanceof ApiError && err.status === 401) { onLoggedOut(); return }
                } finally {
                  setPdfDownloading(false)
                }
              }}
            >
              {pdfDownloading ? 'PDF wird erstellt…' : '📄 Rapport als PDF'}
            </button>
            <button className="confirm-btn confirm-btn-no" onClick={resetConversation}>
              Schliessen
            </button>
          </div>
        )}

        {/* Löschen bleibt auch nach übersprungener Unterschrift möglich — nach einer
            echten Kundenunterschrift ist der Rapport abgenommen (Server sperrt es). */}
        {downloadReportId !== null && !reportSigned && (
          <div className="confirm-buttons">
            <button
              className="confirm-btn confirm-btn-no"
              disabled={deletingReport}
              onClick={() => void handleDeleteReport(downloadReportId)}
            >
              {deletingReport ? 'Wird gelöscht…' : '🗑 Rapport löschen'}
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Stempel-Hinweis statt einer Absage pro Nachricht: ohne ihn tippt der
          Monteur seinen Rapport und liest den Grund erst danach. */}
      {stempelBlocked && (
        <div className="chat-stempel-hint">{RAPPORT_CLOCK_IN_HINT}</div>
      )}

      {/* Input — disabled while awaiting confirmation or disambiguation */}
      <ChatInput onSendText={onSendText} onSendVoice={onSendVoice} onSendPhoto={onSendPhoto} disabled={loading || stempelBlocked || pendingConfirm || pendingDisambiguation || pendingProjectChoice || pendingQuoteQuestion || pendingSignReportId !== null} />

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className={`nav-item ${activeNav === 'rapport' ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke={activeNav === 'rapport' ? '#3b82f6' : 'currentColor'} strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>Rapporte</span>
        </div>
        <div className={`nav-item ${activeNav === 'arbeitszeit' ? 'active' : ''}`} onClick={onNavArbeitszeit}>
          <svg viewBox="0 0 24 24" fill="none" stroke={activeNav === 'arbeitszeit' ? '#22c55e' : 'currentColor'} strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Arbeitszeit</span>
        </div>
        <div className="nav-item" onClick={onNavProjekte}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path d="M9 22V12h6v10"/>
          </svg>
          <span>Projekte</span>
        </div>
        <div className="nav-item" onClick={onNavProfile}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profil</span>
        </div>
      </div>
    </div>
  )
}

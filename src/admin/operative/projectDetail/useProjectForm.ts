import { useRef, useState } from 'react'
import {
  createAppointment, deleteAppointment, getProjectAppointments, updateAppointment,
} from '../../../api/admin'
import { saveProjectForm } from '../../../api/admin/projects'
import type { Customer } from '../../../api/admin/customers'
import type { DisposalDetails, Eigentuemer, Kontakt, Project } from '../../../api/admin/projects'
import {
  AppointmentDraft, appointmentsFollowingProjectTeam, apptToDraft, diffAppointments, draftPayload,
  pinProjectTeam, teamsDiffer, validateDrafts,
} from '../projectAppointments'
import { NewProjectPrefill, takeNewProjectPrefill } from '../newProjectPrefill'
import { projectBillingAddress, projectCustomerName } from '../../utils/project'
import {
  KontaktCandidate, applyKontaktCandidate, kontakteOhneKundenstamm, kontaktFromCustomer,
  seedKontaktFromCustomer,
} from './kontaktKundenstamm'
import {
  ProjectFormValues, disposalEmpty, hasEntsorgungsart, initialProjectForm, isProjectFormDirty,
} from './projectForm'

/** «Nummer — Name» eines Referenzprojekts, fuers Anzeigen im Feld. */
export function referenceLabel(p: Pick<Project, 'project_id_text' | 'name'>): string {
  return p.project_id_text ? `${p.project_id_text} — ${p.name}` : p.name
}

function isEigentuemerEmpty(e: Eigentuemer | null | undefined): boolean {
  return !e || !(e.name || e.adresse || e.telefon || e.email)
}

// Die Projektmaske selbst (Charge H, H3): jedes Feld, sein Ausgangsstand, die
// Dirty-Rechnung und das Speichern. Der Screen sagt nur noch, WANN gespeichert
// wird — mit welcher Nutzlast, entscheidet dieser Hook.
//
// Zwei Dinge sind hier nicht offensichtlich:
//
// 1. Termine liegen NICHT auf der projects-Zeile, sondern in einer eigenen
//    Tabelle mit eigenen Endpunkten. `persist` schreibt deshalb zweistufig:
//    erst das Projekt, dann die Termin-Diffs — und zwar erst danach, weil ein
//    neu angelegtes Projekt vorher keine id hat, an der Termine haengen.
// 2. Der Baseline wandert nach jedem Speichern mit. Ohne das schluege die
//    „ungespeicherte Aenderungen"-Abfrage direkt nach dem Speichern wieder zu.

/**
 * Antwort auf die Team-Rückfrage: 'keep' schreibt den bestehenden Terminen das
 * BISHERIGE Projekt-Team fest, 'apply' lässt sie das neue übernehmen (bisheriges
 * Verhalten), 'cancel' bricht das Speichern ab.
 */
export type TeamAnswer = 'keep' | 'apply' | 'cancel'

/**
 * Antwort auf die Rückfrage «kein Projektleiter»: 'save' speichert trotzdem,
 * 'cancel' bricht das Speichern ab und lässt die Maske offen.
 */
export type ProjektleiterAnswer = 'save' | 'cancel'

export interface UseProjectForm {
  name: string
  setName: (v: string) => void
  customerId: string
  /**
   * Kunde waehlen — seedet Objektadresse UND Ansprechperson (Name, Telefon,
   * E-Mail) aus dem Stamm, solange die Maske dazu nichts Eigenes hat.
   */
  selectCustomer: (id: string) => void
  selectedCustomer: Customer | null
  /** Empfaenger/Adresse nach derselben Vorrang-Kette wie das Backend. */
  billingRecipient: string
  billingAddress: string
  objectName: string
  setObjectName: (v: string) => void
  objectAddress: string
  setObjectAddress: (v: string) => void
  setObjectAddressTouched: (v: boolean) => void
  /**
   * Adresse aus der Vorschlagsliste uebernehmen — samt der Koordinaten, die
   * swisstopo mitliefert. Nur so kostet das Speichern keinen zweiten
   * Geocoding-Request (docs/specs/einsatzplanung-auftragskarte.md §5.2).
   */
  pickObjectAddress: (label: string, lat?: number, lon?: number) => void
  billingDiffers: boolean
  setBillingDiffers: (v: boolean) => void
  projBillingName: string
  setProjBillingName: (v: string) => void
  projBillingAddress: string
  setProjBillingAddress: (v: string) => void
  artDerArbeit: string[]
  toggleArt: (value: string) => void
  entsorgungsart: boolean
  bemerkung: string
  setBemerkung: (v: string) => void
  geruestfach: string
  setGeruestfach: (v: string) => void
  projektleiterId: string
  setProjektleiterId: (v: string) => void
  monteurIds: string[]
  toggleMonteur: (id: string) => void
  appointments: AppointmentDraft[]
  changeAppointments: (next: AppointmentDraft[]) => void
  /**
   * Offene Rückfrage «Projekt-Team geändert — was wird aus den bestehenden
   * Terminen?». Gesetzt = der Screen zeigt den Dialog, `persist` wartet auf
   * `answerTeamQuestion`.
   */
  teamQuestion: { count: number } | null
  answerTeamQuestion: (answer: TeamAnswer) => void
  /**
   * Offene Rückfrage «Kein Projektleiter zugewiesen — trotzdem speichern?».
   * Gesetzt = der Screen zeigt den Dialog, `persist` wartet auf
   * `answerProjektleiterQuestion`.
   */
  projektleiterQuestion: boolean
  answerProjektleiterQuestion: (answer: ProjektleiterAnswer) => void
  kontakte: Kontakt[]
  addKontakt: () => void
  updateKontakt: (i: number, field: keyof Kontakt, value: string) => void
  /** Vorschlag aus dem Kundenstamm in die Zeile übernehmen (Name/Telefon/E-Mail + Verknüpfung). */
  pickKontaktCustomer: (i: number, cand: KontaktCandidate) => void
  removeKontakt: (i: number) => void
  toggleSiteContact: (i: number) => void
  /**
   * Neu erfasste Ansprechpersonen ohne Treffer im Kundenstamm — die Kandidaten
   * für die Nachfrage «als Kunde anlegen?». VOR `persist` abfragen: danach ist
   * der aktuelle Stand der Ausgangsstand, und die Liste wäre leer.
   */
  kontakteOhneKundenstamm: () => Kontakt[]
  eigentuemer: Eigentuemer
  updateEigentuemer: (field: keyof Eigentuemer, value: string) => void
  disposal: DisposalDetails
  updateDisposal: (field: keyof DisposalDetails, value: string) => void
  wartungInterval: string
  setWartungInterval: (v: string) => void
  wartungLastAt: string
  setWartungLastAt: (v: string) => void
  wartungNextDueAt: string
  setWartungNextDueAt: (v: string) => void
  /**
   * Referenzprojekt einer Reparatur (Spec docs/specs/garantiefall.md §3.9) —
   * '' = keins. Gesetzt wird es ueber `pickReferenceProject`, nicht direkt:
   * die Auswahl bringt die Felder des Referenzprojekts mit.
   */
  parentProjectId: string
  /** Name/Nummer des gewaehlten Referenzprojekts, fuers Anzeigen im Feld. */
  parentProjectLabel: string
  /**
   * Referenzprojekt uebernehmen: setzt den Verweis und fuellt Kunde, Objekt,
   * Kontakte, Eigentuemer, Distanz und Projektleiter — aber nur, was die Maske
   * noch leer hat. Getipptes bleibt stehen (dieselbe Regel wie beim Kunden-Seed).
   * `null` loest den Verweis wieder; uebernommene Felder bleiben, weil sie
   * inzwischen jemand bearbeitet haben koennte.
   */
  pickReferenceProject: (p: Project | null) => void
  /**
   * Garantiefall — das Projekt wird nicht oder nur reduziert verrechnet.
   *
   * Bis 20260922 war dieses Feld nur über den Reopen-Dialog erreichbar («Grund:
   * Garantiefall»), der es dem WIEDEREROEFFNETEN Ursprungsprojekt verpasste. Der
   * Grund ist weg (Spec §2.2); das Häkchen gehört ins Formular des Projekts, das
   * die Garantiearbeit tatsächlich trägt.
   */
  isWarranty: boolean
  setIsWarranty: (v: boolean) => void
  /**
   * Abnahmedatum ('YYYY-MM-DD'), leer = keines. Sichtbarkeit entscheidet der
   * Screen über `showAbnahme` — an einem wiedereröffneten Projekt steht das Feld
   * ebenfalls, sonst wäre ein verlorenes Datum nicht mehr nachtragbar.
   */
  completedAt: string
  setCompletedAt: (v: string) => void
  saving: boolean
  error: string
  setError: (v: string) => void
  isDirty: boolean
  /**
   * Speichert die Maske und liefert bei einem NEU angelegten Projekt die frisch
   * erzeugte Zeile zurueck (sonst null). `false` = fehlgeschlagen; der Aufrufer
   * laesst die Maske dann offen, damit die Fehlermeldung sichtbar bleibt.
   */
  persist: () => Promise<Project | null | false>
  /** Termine vom Server holen und zum Ausgangsstand machen (beim Oeffnen). */
  loadAppointments: () => Promise<void>
}

export function useProjectForm(opts: {
  project: Project | null
  /** Fuer das Seeden beim Kundenwechsel; leer, solange die Liste laedt. */
  customers: Customer[]
  /** Ohne Modul «scheduling» antworten die Termin-Endpunkte 403 — dann gar nicht erst rufen. */
  schedulingEnabled: boolean
  /** Fehler stehen im Detail-Reiter; wer aus einem anderen heraus speichert, muss dorthin. */
  focusDetails: () => void
}): UseProjectForm {
  const { project, customers, schedulingEnabled, focusDetails } = opts
  const isNew = !project

  // Vorbelegung aus der Einsatzplanung, einmalig beim Oeffnen abgeholt (der
  // Lazy-Initializer laeuft genau einmal). Bei einem bestehenden Projekt gar
  // nicht erst anfassen: dessen Termine kommen vom Server.
  const [prefill] = useState<NewProjectPrefill | null>(() => (project ? null : takeNewProjectPrefill()))

  const [baseline, setBaseline] = useState<ProjectFormValues>(() => initialProjectForm(project, prefill))

  const [parentProjectId, setParentProjectId] = useState(baseline.parentProjectId)
  // Beim Oeffnen eines bestehenden Reparatur-Projekts kennt die Maske nur die id;
  // den Namen traegt das Kopfteil nach (project.parent_project_name gibt es nicht,
  // der Rueckverweis steht im Kopf). Leer heisst: noch kein Label bekannt.
  const [parentProjectLabel, setParentProjectLabel] = useState('')
  const [completedAt, setCompletedAt] = useState(baseline.completedAt)
  const [isWarranty, setIsWarranty] = useState(baseline.isWarranty)

  const [name, setName] = useState(baseline.name)
  const [customerId, setCustomerId] = useState(baseline.customerId)
  // Objekt-Name (z.B. "MFH Sonnhalde") getrennt von der reinen Objektadresse — Letztere
  // speist die Google-Maps-Distanz (Fahrspesen), darum darf der Name nicht mit rein.
  const [objectName, setObjectName] = useState(baseline.objectName)
  const [objectAddress, setObjectAddress] = useState(baseline.objectAddress)
  // Wurde die Objektadresse manuell bearbeitet? Dann beim Kundenwechsel NICHT überschreiben.
  // Eine nur automatisch (aus dem Kundenstamm) befüllte Adresse wird hingegen neu geseedet,
  // damit ein Kundenwechsel auch die Distanz (Offerten-Fahrspesen) neu berechnen lässt.
  const [objectAddressTouched, setObjectAddressTouched] = useState(!!project?.object_address)
  // Koordinaten aus dem Adress-Autocomplete, samt der Adresse, ZU DER sie
  // gehoeren. Das Label mitzufuehren ist der Trick: der Payload schickt die
  // Koordinaten nur mit, solange `objectAddress` noch genau diese Adresse ist.
  // Damit muss keiner der vielen Pfade, die die Adresse aendern (Tippen,
  // Uebernahme aus dem Kundenstamm, Zuruecksetzen), ans Aufraeumen denken —
  // ein vergessener Pfad hiesse sonst: Koordinaten der alten Adresse an der
  // neuen, also eine Baustelle am falschen Ort auf der Karte.
  const [pickedAddress, setPickedAddress] = useState<
    { label: string; lat: number; lon: number } | null
  >(null)

  function pickObjectAddress(label: string, lat?: number, lon?: number) {
    setObjectAddress(label)
    setObjectAddressTouched(true)
    setPickedAddress(lat != null && lon != null ? { label, lat, lon } : null)
  }
  // Abweichende Rechnungsadresse NUR für dieses Projekt (analog Kundenstamm-Checkbox,
  // aber ohne Rückschreiben in den Kunden). Abwählen sendet '' — das Backend filtert
  // null im PATCH weg, ein leerer String leert den Override wirklich.
  const [billingDiffers, setBillingDiffers] = useState(baseline.billingDiffers)
  const [projBillingName, setProjBillingName] = useState(baseline.billingName)
  const [projBillingAddress, setProjBillingAddress] = useState(baseline.billingAddress)
  // Mehrfachauswahl: ein Projekt kann mehrere Leistungsarten tragen (z.B. Neumontage + Reparatur)
  const [artDerArbeit, setArtDerArbeit] = useState<string[]>(baseline.artDerArbeit)
  const [bemerkung, setBemerkung] = useState(baseline.bemerkung)
  const [geruestfach, setGeruestfach] = useState(baseline.geruestfach)
  const [projektleiterId, setProjektleiterId] = useState(baseline.projektleiterId)
  const [monteurIds, setMonteurIds] = useState<string[]>(baseline.monteurIds)
  // Termine des Projekts (project_appointments) — mehrere je Projekt, gespeichert
  // erst beim Absenden der Maske (Diff gegen baseline.appointments in persist()).
  const [appointments, setAppointments] = useState<AppointmentDraft[]>(baseline.appointments)
  // Wurde die Terminliste im Formular angefasst? Dann darf das (asynchrone)
  // Nachladen vom Server die Eingaben nicht mehr überschreiben.
  const appointmentsTouched = useRef(false)
  const [kontakte, setKontakte] = useState<Kontakt[]>(baseline.kontakte)
  // Die zuletzt beim Kundenwechsel vorbelegte Ansprechperson. Kein State: sie
  // rendert nichts, sie sagt `seedKontaktFromCustomer` nur, welche Zeile beim
  // naechsten Kunden weichen darf (und welche der Anwender selbst getippt hat).
  const seededKontakt = useRef<Kontakt | null>(null)
  // Eigentümer des Objekts — eigene Rolle, kein Kontakt. Kann pro Projekt ein Dritter sein.
  const [eigentuemer, setEigentuemer] = useState<Eigentuemer>(baseline.eigentuemer)
  const [disposal, setDisposal] = useState<DisposalDetails>(baseline.disposal)
  const [wartungInterval, setWartungInterval] = useState<string>(baseline.wartungInterval)
  const [wartungLastAt, setWartungLastAt] = useState<string>(baseline.wartungLastAt)
  const [wartungNextDueAt, setWartungNextDueAt] = useState<string>(baseline.wartungNextDueAt)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Rückfrage «Projekt-Team geändert» — sie fällt MITTEN im Speichern an,
  // gerendert wird der Dialog aber vom Screen. Deshalb ein Promise-Tor:
  // `persist` legt die Frage hin und wartet, der Screen löst sie mit
  // `answerTeamQuestion` auf. So bekommen alle Aufrufer von `persist`
  // (Speichern, Speichern-und-schliessen, Navigations-Guard) die Rückfrage
  // ohne eigenes Zutun.
  const [teamQuestion, setTeamQuestion] = useState<{ count: number } | null>(null)
  const teamAnswer = useRef<((answer: TeamAnswer) => void) | null>(null)

  function answerTeamQuestion(answer: TeamAnswer) {
    setTeamQuestion(null)
    teamAnswer.current?.(answer)
    teamAnswer.current = null
  }

  // Rückfrage «kein Projektleiter» — dasselbe Promise-Tor wie oben, damit alle
  // Aufrufer von `persist` (Speichern, Speichern-und-schliessen,
  // Navigations-Guard) sie ohne eigenes Zutun bekommen.
  const [projektleiterQuestion, setProjektleiterQuestion] = useState(false)
  const projektleiterAnswer = useRef<((answer: ProjektleiterAnswer) => void) | null>(null)

  function answerProjektleiterQuestion(answer: ProjektleiterAnswer) {
    setProjektleiterQuestion(false)
    projektleiterAnswer.current?.(answer)
    projektleiterAnswer.current = null
  }

  const currentForm: ProjectFormValues = {
    name,
    customerId,
    objectName,
    objectAddress,
    billingDiffers,
    billingName: projBillingName,
    billingAddress: projBillingAddress,
    artDerArbeit,
    bemerkung,
    geruestfach,
    projektleiterId,
    monteurIds,
    appointments,
    kontakte,
    eigentuemer,
    disposal,
    wartungInterval,
    wartungLastAt,
    wartungNextDueAt,
    parentProjectId,
    completedAt,
    isWarranty,
  }

  const entsorgungsart = hasEntsorgungsart(artDerArbeit)
  const toggleArt = (value: string) =>
    setArtDerArbeit(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  const updateEigentuemer = (field: keyof Eigentuemer, value: string) =>
    setEigentuemer(prev => ({ ...prev, [field]: value }))
  const updateDisposal = (field: keyof DisposalDetails, value: string) =>
    setDisposal(prev => ({ ...prev, [field]: value }))

  /**
   * Referenzprojekt uebernehmen (Spec §3.9).
   *
   * Ergaenzt nur Leeres — wer den Kunden schon gewaehlt oder die Adresse schon
   * getippt hat, behaelt seine Eingabe. Das ist dieselbe Zusage wie beim
   * Kunden-Seed: eine Auswahl darf helfen, aber nichts wegnehmen.
   *
   * Ausdruecklich NICHT uebernommen: `is_warranty` (ob die Nacharbeit auf
   * Garantie geht, entscheidet das Buero), Monteure, Auftragsnummer, Rabatte,
   * Termine und der Wartungsplan.
   */
  function pickReferenceProject(ref: Project | null) {
    if (!ref) {
      setParentProjectId('')
      setParentProjectLabel('')
      return
    }
    setParentProjectId(ref.id)
    setParentProjectLabel(referenceLabel(ref))

    if (!customerId && ref.customer_id) setCustomerId(ref.customer_id)
    if (!objectName.trim() && ref.object_name) setObjectName(ref.object_name)
    // Abweichende Rechnungsadresse mitnehmen — sie steht in REFERENCE_FIELDS und
    // kaeme vom Server, wenn die Maske das Feld nicht ohnehin immer mitschickte.
    // Ohne diese Zeilen verloere ein hier angelegtes Reparatur-Projekt den
    // Override, waehrend ein schmaler API-Aufrufer ihn erbt.
    if (!billingDiffers && (ref.billing_name || ref.billing_address)) {
      setBillingDiffers(true)
      setProjBillingName(ref.billing_name ?? '')
      setProjBillingAddress(ref.billing_address ?? '')
    }
    if (!objectAddress.trim() && ref.object_address) {
      setObjectAddress(ref.object_address)
      // Als «angefasst» markieren: sonst ueberschriebe ein spaeter gewaehlter
      // Kunde die Adresse, die der Anwender gerade bewusst uebernommen hat.
      setObjectAddressTouched(true)
    }
    if (kontakte.length === 0 && ref.kontakte?.length) setKontakte(ref.kontakte)
    if (!projektleiterId && ref.projektleiter_id) setProjektleiterId(ref.projektleiter_id)
    if (isEigentuemerEmpty(eigentuemer) && ref.eigentuemer) setEigentuemer(ref.eigentuemer)
  }

  function selectCustomer(id: string) {
    setCustomerId(id)
    const c = id ? customers.find(x => x.id === id) ?? null : null
    if (id && !c) return   // Liste noch nicht geladen: lieber nichts seeden als das Falsche
    if (c && !objectAddressTouched) {
      setObjectAddress(c.object_address || c.billing_address || c.address || '')
    }
    // Ansprechperson aus dem Kundenstamm vorbelegen (kontaktKundenstamm.ts).
    // `seededKontakt` merkt sich die gesetzte Zeile, damit ein Kundenwechsel sie
    // ersetzt statt zu stapeln — und ein Entfernen des Kunden sie mitnimmt.
    const seed = c ? kontaktFromCustomer(c) : null
    // Aus dem aktuellen Stand gerechnet statt im Updater: der Updater darf
    // `seededKontakt` nicht lesen, das gleich danach umgesetzt wird (React ruft
    // ihn im StrictMode zweimal auf — beim zweiten Mal saehe er den neuen Seed).
    setKontakte(seedKontaktFromCustomer(kontakte, seed, seededKontakt.current))
    seededKontakt.current = seed
  }

  const selectedCustomer = customers.find(c => c.id === customerId) ?? null
  // Projekt-Override zuerst — dieselbe Vorrang-Kette wie das Backend
  // (resolve_billing_info): projects.billing_* vor customer.billing_* vor Stammdaten.
  const billingRecipient = (billingDiffers && projBillingName.trim())
    || (selectedCustomer
      ? (selectedCustomer.billing_name || selectedCustomer.name)
      : (project ? projectCustomerName(project) : ''))
  const billingAddress = (billingDiffers && projBillingAddress)
    || (selectedCustomer
      ? (selectedCustomer.billing_address || selectedCustomer.address || '')
      : (project ? projectBillingAddress(project) : ''))

  function addKontakt() {
    setKontakte(prev => [...prev, { name: '', kommentar: '', telefon: '', email: '' }])
  }
  function updateKontakt(i: number, field: keyof Kontakt, value: string) {
    setKontakte(prev => prev.map((k, idx) => {
      if (idx !== i) return k
      // Ein von Hand geänderter Name löst die Verknüpfung zum Stammkunden: hinter
      // dem neuen Namen steht sonst weiter ein fremder Kunde. Telefon/E-Mail
      // dürfen abweichen (Handy statt Festnetz), die Person bleibt dieselbe.
      const unlink = field === 'name' && !!k.customer_id && value !== k.name
      return { ...k, [field]: value, ...(unlink ? { customer_id: null } : null) }
    }))
  }
  function pickKontaktCustomer(i: number, cand: KontaktCandidate) {
    setKontakte(prev => prev.map((k, idx) => idx === i ? applyKontaktCandidate(k, cand) : k))
  }
  function removeKontakt(i: number) {
    setKontakte(prev => prev.filter((_, idx) => idx !== i))
  }
  // Baustellenkontakt-Flag: mutually exclusive — Setzen entfernt das Flag bei
  // allen anderen, erneutes Klicken hebt es auf.
  function toggleSiteContact(i: number) {
    setKontakte(prev => {
      const wasSet = !!prev[i]?.is_site_contact
      return prev.map((k, idx) => ({
        ...k,
        is_site_contact: idx === i ? !wasSet : false,
      }))
    })
  }

  const kontakteOhneKundenstammNow = () => kontakteOhneKundenstamm(baseline.kontakte, kontakte, customers)

  function toggleMonteur(id: string) {
    setMonteurIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function changeAppointments(next: AppointmentDraft[]) {
    appointmentsTouched.current = true
    setAppointments(next)
  }

  /**
   * Termine nachladen und zum Ausgangsstand machen — sonst gaelte die Maske
   * sofort als geaendert. Wird vom Screen beim Oeffnen gerufen; Fehler bleiben
   * still: ohne Modul «scheduling» antwortet der Endpunkt 403, die Kachel wird
   * dann ohnehin nicht gezeigt.
   */
  async function loadAppointments() {
    if (!project) return
    const rows = await getProjectAppointments(project.id).catch(() => null)
    if (!rows || appointmentsTouched.current) return
    const drafts = rows.map(apptToDraft)
    setAppointments(drafts)
    setBaseline(b => ({ ...b, appointments: drafts }))
  }

  /**
   * Schreibt die Terminliste: erst löschen, dann ändern, dann anlegen. Sequenziell,
   * weil jede Mutation serverseitig den Ersttermin-Spiegel auf projects nachzieht.
   * Wirft bei jedem fehlgeschlagenen Schritt — der Aufrufer lädt danach den
   * echten Serverstand nach, statt auf dem halben Formularstand weiterzurechnen.
   */
  async function syncAppointments(projectId: string, saved: AppointmentDraft[], current: AppointmentDraft[]) {
    const diff = diffAppointments(saved, current)
    for (const id of diff.removeIds) await deleteAppointment(id)
    for (const d of diff.update) await updateAppointment(d.id!, draftPayload(d))
    for (const d of diff.create) await createAppointment(projectId, draftPayload(d))
  }

  async function persist(): Promise<Project | null | false> {
    const fail = (message: string) => { setError(message); focusDetails(); return false as const }

    if (!name.trim()) return fail('Projektname ist erforderlich.')
    const apptError = validateDrafts(appointments)
    if (apptError) return fail(apptError)

    // Ohne Projektleiter gibt es niemanden, der Rückfragen aus der Monteur-App
    // beantwortet, und das Projekt fehlt in jeder Auswertung je Projektleiter.
    // Trotzdem keine Sperre: manchmal steht der Zuständige beim Anlegen noch
    // nicht fest. Also fragen statt ablehnen — seit der Erfasser nicht mehr
    // automatisch eingetragen wird (agents/routers/admin_projects.py), bliebe
    // das Feld sonst still leer.
    if (!projektleiterId) {
      const answer = await new Promise<ProjektleiterAnswer>(resolve => {
        projektleiterAnswer.current = resolve
        setProjektleiterQuestion(true)
      })
      if (answer === 'cancel') { focusDetails(); return false }
    }

    setError('')
    setSaving(true)
    try {
      // Ein Termin ohne eigenes Team erbt das Projekt-Team live. Wechselt das
      // Team, während bereits gespeicherte Termine daran hängen, würden die
      // still mit umbesetzt — auch längst vergangene. Deshalb erst fragen.
      let currentAppointments = appointments
      let baselineAppointments = baseline.appointments
      const followers = schedulingEnabled && baseline.monteurIds.length > 0
        && teamsDiffer(baseline.monteurIds, monteurIds)
        ? appointmentsFollowingProjectTeam(appointments)
        : []
      if (followers.length > 0) {
        const answer = await new Promise<TeamAnswer>(resolve => {
          teamAnswer.current = resolve
          setTeamQuestion({ count: followers.length })
        })
        if (answer === 'cancel') return false
        if (answer === 'keep') {
          try {
            // VOR dem Projekt-Write: danach sähe der Termin-Änderungs-Push das
            // schon neue Projekt-Team als Vorher-Zustand und meldete jedem
            // Monteur eine Änderung, die es gar nicht gibt
            // (services/project_change_push_service.py::diff_appointment_change).
            for (const d of followers) {
              await updateAppointment(d.id!, { monteur_ids: baseline.monteurIds })
            }
          } catch {
            return fail('Das bisherige Team konnte nicht auf den bestehenden Terminen festgehalten werden. Bitte erneut versuchen.')
          }
          // Auch im Ausgangsstand festschreiben: serverseitig stehen sie jetzt
          // genau so da, der Termin-Diff weiter unten soll sie nicht ein zweites
          // Mal schicken.
          const keys = new Set(followers.map(d => d.key))
          currentAppointments = pinProjectTeam(appointments, keys, baseline.monteurIds)
          baselineAppointments = pinProjectTeam(baseline.appointments, keys, baseline.monteurIds)
          setAppointments(currentAppointments)
        }
      }

      const res = await saveProjectForm({
        name: name.trim(),
        customer_id: customerId || null,
        object_name: objectName.trim() || null,
        object_address: objectAddress || null,
        // Nur senden, wenn sie noch zur angezeigten Adresse gehoeren. Sonst
        // (frei getippt, aus dem Kundenstamm uebernommen) bleibt es bei null
        // und das Backend schlaegt selbst nach.
        object_lat: pickedAddress?.label === objectAddress ? pickedAddress.lat : null,
        object_lon: pickedAddress?.label === objectAddress ? pickedAddress.lon : null,
        // '' statt null, damit ein entfernter Override auch persistiert wird
        // (das Backend filtert null-Werte weg — kein Clear möglich).
        billing_name: billingDiffers ? projBillingName.trim() : '',
        billing_address: billingDiffers ? projBillingAddress : '',
        art_der_arbeit: artDerArbeit,
        bemerkung: bemerkung || null,
        geruestfach: geruestfach.trim() ? parseInt(geruestfach, 10) : null,
        projektleiter_id: projektleiterId || null,
        monteur_ids: monteurIds,
        // Terminfelder (start_date/end_date/start_time/end_time) sendet die
        // Maske bewusst NICHT mehr: Termine laufen über die appointment-
        // Endpunkte, der Server spiegelt daraus den Ersttermin auf projects.
        // Beides zu schreiben würde den Ersttermin doppelt bewegen.
        kontakte,
        // Immer mitschicken (auch leer), damit ein geleertes Feld auch persistiert
        // wird — das Backend filtert null-Werte weg (kein Clear möglich).
        eigentuemer,
        disposal_details: entsorgungsart && !disposalEmpty(disposal) ? disposal : null,
        wartung_interval_months: wartungInterval ? parseInt(wartungInterval, 10) : null,
        wartung_last_at: wartungLastAt || null,
        wartung_next_due_at: wartungNextDueAt || null,
        // Die drei Garantie-Felder (Spec §3.9/§3.3) gehen nur mit, wenn sie sich
        // vom Ausgangsstand unterscheiden — dann aber IMMER, auch als `null`
        // oder `false`.
        //
        // Beide Hälften sind noetig. Ein leerer Wert muss mitgeschickt werden,
        // weil der Server auf `v is not None` filtert: ohne das mitgeschickte
        // Feld raeumte «Entfernen» nur die Maske auf, die Zeile in der Datenbank
        // bliebe unveraendert, und beim naechsten Oeffnen stuende der alte Wert
        // wieder da. Unveraenderte Felder duerfen umgekehrt NICHT mit: der
        // Audit-Eintrag nennt die geschickten Feldnamen, und der Projekt-Verlauf
        // meldete sonst bei jedem Speichern «Garantiefall geändert», auch wenn
        // niemand das Häkchen angefasst hat.
        ...(parentProjectId !== baseline.parentProjectId
          ? { parent_project_id: parentProjectId || null } : {}),
        ...(isWarranty !== baseline.isWarranty ? { is_warranty: isWarranty } : {}),
        ...(completedAt !== baseline.completedAt
          ? { completed_at: completedAt || null } : {}),
      }, project?.id)   // POST liefert die neu angelegte Zeile mit

      // Termine (eigene Tabelle, eigene Endpunkte) nachziehen. Erst jetzt, weil
      // ein neu angelegtes Projekt vorher keine id hat, an der Termine hängen.
      const created = isNew ? (res?.project ?? null) : null
      const targetId = created?.id ?? project?.id ?? null
      let apptSyncError = ''
      let savedAppointments = currentAppointments
      if (targetId && schedulingEnabled) {
        try {
          await syncAppointments(targetId, baselineAppointments, currentAppointments)
        } catch (err: unknown) {
          apptSyncError = err instanceof Error && err.message
            ? `Projektdaten gespeichert — Termine nicht vollständig: ${err.message}`
            : 'Projektdaten gespeichert, aber die Termine konnten nicht übernommen werden.'
        }
        // Serverstand nachladen: nach einem Teilfehler ist er die einzige
        // verlässliche Grundlage für den nächsten Diff.
        const rows = await getProjectAppointments(targetId).catch(() => null)
        if (rows) {
          savedAppointments = rows.map(apptToDraft)
          setAppointments(savedAppointments)
          appointmentsTouched.current = false
        }
      } else if (!targetId && currentAppointments.length > 0) {
        // Projekt-POST ohne zurückgelieferte Zeile: es gibt keine id, an die sich
        // die Termine hängen liessen. Lieber melden als still verschlucken.
        apptSyncError = 'Projekt gespeichert, die Termine konnten aber nicht zugeordnet werden. Bitte im Projekt erneut erfassen.'
      }

      // Ab hier gilt der aktuelle Stand als gespeichert — sonst würde die
      // „ungespeicherte Änderungen"-Abfrage direkt nochmal zuschlagen.
      setBaseline({ ...currentForm, appointments: savedAppointments })
      if (apptSyncError) {
        setError(apptSyncError)
        focusDetails()
        // Beim BESTEHENDEN Projekt offen bleiben, damit die Meldung sichtbar ist
        // und der Anwender es erneut versuchen kann. Beim frisch ANGELEGTEN
        // Projekt trotzdem durchreichen: 'false' liesse die Neu-Maske offen, und
        // der nächste Speicherversuch legte ein zweites Projekt an. Der Anwender
        // landet stattdessen im gespeicherten Projekt und sieht dort den echten
        // (nachgeladenen) Terminstand.
        if (!created) return false
      }
      return created
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
      return false
    } finally {
      setSaving(false)
    }
  }

  return {
    name, setName,
    customerId, selectCustomer, selectedCustomer, billingRecipient, billingAddress,
    objectName, setObjectName, objectAddress, setObjectAddress, setObjectAddressTouched,
    pickObjectAddress,
    billingDiffers, setBillingDiffers,
    projBillingName, setProjBillingName, projBillingAddress, setProjBillingAddress,
    artDerArbeit, toggleArt, entsorgungsart,
    bemerkung, setBemerkung, geruestfach, setGeruestfach,
    projektleiterId, setProjektleiterId, monteurIds, toggleMonteur,
    appointments, changeAppointments, loadAppointments,
    teamQuestion, answerTeamQuestion,
    projektleiterQuestion, answerProjektleiterQuestion,
    kontakte, addKontakt, updateKontakt, pickKontaktCustomer, removeKontakt, toggleSiteContact,
    kontakteOhneKundenstamm: kontakteOhneKundenstammNow,
    eigentuemer, updateEigentuemer, disposal, updateDisposal,
    wartungInterval, setWartungInterval,
    wartungLastAt, setWartungLastAt,
    wartungNextDueAt, setWartungNextDueAt,
    parentProjectId, parentProjectLabel, pickReferenceProject,
    completedAt, setCompletedAt,
    isWarranty, setIsWarranty,
    saving, error, setError,
    isDirty: isProjectFormDirty(baseline, currentForm),
    persist,
  }
}

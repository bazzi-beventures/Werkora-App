import { useRef, useState } from 'react'
import {
  createAppointment, deleteAppointment, getProjectAppointments, updateAppointment,
} from '../../../api/admin'
import { saveProjectForm } from '../../../api/admin/projects'
import type { Customer } from '../../../api/admin/customers'
import type { DisposalDetails, Eigentuemer, Kontakt, Project } from '../../../api/admin/projects'
import {
  AppointmentDraft, apptToDraft, diffAppointments, draftPayload, validateDrafts,
} from '../projectAppointments'
import { NewProjectPrefill, takeNewProjectPrefill } from '../newProjectPrefill'
import { projectBillingAddress, projectCustomerName } from '../../utils/project'
import { KontaktCandidate, applyKontaktCandidate, kontakteOhneKundenstamm } from './kontaktKundenstamm'
import {
  ProjectFormValues, disposalEmpty, hasEntsorgungsart, initialProjectForm, isProjectFormDirty,
} from './projectForm'

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

export interface UseProjectForm {
  name: string
  setName: (v: string) => void
  customerId: string
  /** Kunde waehlen — seedet Objektadresse und Baustellenkontakt aus dem Stamm. */
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
  // Eigentümer des Objekts — eigene Rolle, kein Kontakt. Kann pro Projekt ein Dritter sein.
  const [eigentuemer, setEigentuemer] = useState<Eigentuemer>(baseline.eigentuemer)
  const [disposal, setDisposal] = useState<DisposalDetails>(baseline.disposal)
  const [wartungInterval, setWartungInterval] = useState<string>(baseline.wartungInterval)
  const [wartungLastAt, setWartungLastAt] = useState<string>(baseline.wartungLastAt)
  const [wartungNextDueAt, setWartungNextDueAt] = useState<string>(baseline.wartungNextDueAt)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
  }

  const entsorgungsart = hasEntsorgungsart(artDerArbeit)
  const toggleArt = (value: string) =>
    setArtDerArbeit(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  const updateEigentuemer = (field: keyof Eigentuemer, value: string) =>
    setEigentuemer(prev => ({ ...prev, [field]: value }))
  const updateDisposal = (field: keyof DisposalDetails, value: string) =>
    setDisposal(prev => ({ ...prev, [field]: value }))

  function selectCustomer(id: string) {
    setCustomerId(id)
    if (!id) return
    const c = customers.find(x => x.id === id)
    if (!c) return
    if (!objectAddressTouched) setObjectAddress(c.object_address || c.billing_address || c.address || '')
    // Baustellenkontakt aus Kundenstamm seeden, falls noch keiner markiert ist
    // und der Kunde einen Standardkontakt hat.
    if ((c.local_contact_name || c.local_contact_phone) && !kontakte.some(k => k.is_site_contact)) {
      setKontakte(prev => [...prev, {
        name: c.local_contact_name ?? '',
        kommentar: 'Baustellenkontakt',
        telefon: c.local_contact_phone ?? '',
        email: '',
        is_site_contact: true,
        customer_id: c.id,
      }])
    }
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
    setError('')
    setSaving(true)
    try {
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
      }, project?.id)   // POST liefert die neu angelegte Zeile mit

      // Termine (eigene Tabelle, eigene Endpunkte) nachziehen. Erst jetzt, weil
      // ein neu angelegtes Projekt vorher keine id hat, an der Termine hängen.
      const created = isNew ? (res?.project ?? null) : null
      const targetId = created?.id ?? project?.id ?? null
      let apptSyncError = ''
      let savedAppointments = appointments
      if (targetId && schedulingEnabled) {
        try {
          await syncAppointments(targetId, baseline.appointments, appointments)
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
      } else if (!targetId && appointments.length > 0) {
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
    kontakte, addKontakt, updateKontakt, pickKontaktCustomer, removeKontakt, toggleSiteContact,
    kontakteOhneKundenstamm: kontakteOhneKundenstammNow,
    eigentuemer, updateEigentuemer, disposal, updateDisposal,
    wartungInterval, setWartungInterval,
    wartungLastAt, setWartungLastAt,
    wartungNextDueAt, setWartungNextDueAt,
    saving, error, setError,
    isDirty: isProjectFormDirty(baseline, currentForm),
    persist,
  }
}

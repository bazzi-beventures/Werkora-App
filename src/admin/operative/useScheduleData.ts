// Daten der Einsatzplanung: Erst-Laden (gestaffelt, nahes Fenster zuerst) und die
// Live-Aktualisierung über den Fingerabdruck, mit Vorrang der eigenen Änderungen.
//
// Seit Charge M4b (Spec refactoring-wachstum.md §17) eigener Hook; vorher Zustand,
// Refs und Ladefunktionen direkt in ProjectScheduleScreen.tsx. Der Screen ruft
// ``loadAll``/``refreshLive`` weiter selbst über ``useVisibilityPolling`` auf — an
// derselben Stelle der Effekt-Reihenfolge wie vorher.
import { useRef, useState } from 'react'
import {
  getScheduleStand, listAppointments, listScheduleAbsences,
  type ProjectAppointment, type ScheduleAbsence, type ScheduleStand,
} from '../../api/admin'
import { getScheduleProjects, type ScheduleProject } from '../../api/admin/projects'
import { getAdminStaff } from '../../api/admin/staff'
import { getAllProjectSkills, getSkillMatrix, type Skill, type StaffSkill } from '../../api/admin/skills'
import { getVorschlaege, type Vormerkung } from '../../api/admin/hagelschadenDispo'
import { shiftISO, toDateStr } from '../utils/calendarHelpers'
import type { ToastFn } from '../components/useToast'
import {
  APPT_WINDOW_AHEAD_DAYS, APPT_WINDOW_BACK_DAYS, FULL_SYNC_MS, NEAR_WINDOW_AHEAD_DAYS,
  NEAR_WINDOW_BACK_DAYS, SLOW_REFRESH_MS, sameRows, type StaffLite,
} from './scheduleScreenModel'

interface Optionen {
  /** Ebene «Vorschläge» der Hagelschaden-Disposition (Modul + Feature). */
  hagelVorschlaege: boolean
  showToast: ToastFn
  /** Offene Rückfrage (Absenz/Doppelbelegung): solange pausiert der Live-Takt. */
  pausiert: boolean
}

export function useScheduleData({ hagelVorschlaege, showToast, pausiert }: Optionen) {
  const [projects, setProjects] = useState<ScheduleProject[]>([])
  const [appointments, setAppointments] = useState<ProjectAppointment[]>([])
  // Genehmigte Absenzen im geladenen Fenster — Markierung in der Plantafel.
  const [absences, setAbsences] = useState<ScheduleAbsence[]>([])
  // Vorgemerkte Hagel-Einsätze (keine Termine) — gestrichelte Ebene, Phase 2b.
  const [vorschlaege, setVorschlaege] = useState<Vormerkung[]>([])
  // Skill-Pillen (Spec mitarbeiterdisposition-faehigkeiten-routen.md §4): wer für
  // einen Einsatz passt, markiert an den Team-Chips. Fehlt etwas, bleibt die
  // Markierung einfach weg — geplant wird wie bisher.
  const [skillKatalog, setSkillKatalog] = useState<Skill[]>([])
  const [staffPillen, setStaffPillen] = useState<StaffSkill[]>([])
  const [projektPillen, setProjektPillen] = useState<Map<string, string[]>>(new Map())
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [loading, setLoading] = useState(true)

  // ─── Live-Aktualisierung ────────────────────────────────────────────────
  // Termine, die anderswo entstehen (Projektmaske, ein Kollege, die App),
  // erschienen hier bisher erst nach Verlassen und Wiederöffnen der Ansicht.
  // Jetzt fragt die Ansicht alle 2 s nach — still (kein Spinner, kein Toast),
  // nur bei sichtbarem Tab und nie zwei Abrufe übereinander
  // (useVisibilityPolling). Unveränderte Antworten lösen kein Re-Render aus
  // (sameRows); die Fahrdistanzen fragt die Tafel erst nach ein paar Sekunden
  // Ruhe an (scheduleShared.ts, DISTANCE_SETTLE_MS).
  //
  // Gefragt wird seit 20261106 nur der Fingerabdruck (`standRef`), nicht mehr
  // die Listen selbst: bis dahin holte jeder Takt alle Projekte und das volle
  // Terminfenster, rund 4 MB alle 2 s — 159 GB Railway-Egress in zehn Tagen,
  // und der Browser verglich dabei jedes Mal zwei Mal 4 MB Text (sameRows).
  //
  // Eigene Änderungen haben Vorrang: `localGen` zählt jede lokale Änderung,
  // und ein Abruf, der davor gestartet ist, wird verworfen — sonst spränge ein
  // eben verschobener Einsatz für 2 s an seinen alten Platz zurück.
  // `pendingWrites` hält den Abruf an, solange ein optimistisch angezeigtes
  // Verschieben noch nicht beim Server ist.
  const localGen = useRef(0)
  const pendingWrites = useRef(0)
  const lastSlowRefresh = useRef(0)
  const lastFullSync = useRef(0)
  // Der Fingerabdruck, zu dem die angezeigten Listen gehören.
  const standRef = useRef<ScheduleStand | null>(null)
  // Liegt das volle Terminfenster vor, oder erst das nahe (erste Sekunde nach
  // dem Öffnen)? Ohne volles Fenster holt der nächste Takt die Termine.
  const fullLoaded = useRef(false)
  // Gestaffelt geladen wird nur beim ERSTEN Öffnen. Nach einer eigenen Änderung
  // (loadAll aus handleSave & Co.) ersetzte das nahe Fenster sonst kurz das
  // volle — wer gerade in fünf Monaten plant, sähe seine Woche leer blinken.
  const loadedOnce = useRef(false)
  // Klammer um jeden eigenen Schreibvorgang (Speichern, Verschieben, Löschen).
  function beginWrite() { pendingWrites.current += 1; localGen.current += 1 }
  function endWrite() { pendingWrites.current -= 1; localGen.current += 1 }

  async function refreshLive() {
    if (loading || pausiert || pendingWrites.current > 0) return
    const gen = localGen.current
    const todayIso = toDateStr(new Date())
    const now = Date.now()
    const slowDue = now - lastSlowRefresh.current >= SLOW_REFRESH_MS
    const fullSyncDue = now - lastFullSync.current >= FULL_SYNC_MS
    // Erst der Fingerabdruck, DANN die Listen: was sich zwischen den beiden
    // Abrufen ändert, steckt schon in den Listen und meldet sich beim nächsten
    // Takt noch einmal als Änderung — schlimmstenfalls ein Abruf zu viel, nie
    // einer zu wenig.
    const stand = await getScheduleStand()
    const prev = standRef.current
    // Ohne Fingerabdruck (Route oder Datenbank-Funktion nicht erreichbar) wird
    // blind voll abgeglichen — aber nur im Minutentakt, nicht alle 2 s wie früher.
    const changed = (k: keyof ScheduleStand) =>
      stand === null ? slowDue : fullSyncDue || prev === null || stand[k] !== prev[k]
    const needProjects = changed('projekte')
    const needAppts = changed('termine') || (stand !== null && !fullLoaded.current)
    if (!needProjects && !needAppts && !slowDue) return
    try {
      // Anders als loadAll ohne `.catch(() => [])`: ein fehlgeschlagener
      // Hintergrund-Abruf darf die Tafel nicht leeren — er fällt aus, der
      // nächste Takt versucht es wieder (der Fingerabdruck bleibt dafür alt).
      const [proj, appts, abs, st] = await Promise.all([
        needProjects ? getScheduleProjects() : null,
        needAppts
          ? listAppointments(shiftISO(todayIso, -APPT_WINDOW_BACK_DAYS), shiftISO(todayIso, APPT_WINDOW_AHEAD_DAYS))
          : null,
        slowDue ? listScheduleAbsences(shiftISO(todayIso, -60), shiftISO(todayIso, APPT_WINDOW_AHEAD_DAYS)) : null,
        slowDue ? getAdminStaff() : null,
      ])
      if (gen !== localGen.current || pendingWrites.current > 0) return
      if (proj) setProjects(prev => sameRows(prev, proj) ? prev : proj)
      if (appts) {
        setAppointments(prev => sameRows(prev, appts) ? prev : appts)
        fullLoaded.current = true
      }
      if (abs) setAbsences(prev => sameRows(prev, abs) ? prev : abs)
      if (st) setStaff(prev => sameRows(prev, st) ? prev : st)
      if (stand) standRef.current = stand
      if (proj && appts) lastFullSync.current = Date.now()
      if (slowDue) {
        lastSlowRefresh.current = Date.now()
        void ladeVorschlaege()
      void ladeSkills()
      }
    } catch {
      // still — siehe oben
    }
  }

  // Vorschläge laden — still bei Fehlern: ohne Ebene plant man wie bisher.
  async function ladeSkills() {
    try {
      const [m, p] = await Promise.all([getSkillMatrix(), getAllProjectSkills()])
      setSkillKatalog(m.skills)
      setStaffPillen(m.cells)
      const map = new Map<string, string[]>()
      for (const r of p.project_skills) map.set(r.project_id, [...(map.get(r.project_id) ?? []), r.skill_id])
      setProjektPillen(map)
    } catch { /* still: ohne Pillen keine Markierung */ }
  }

  async function ladeVorschlaege() {
    if (!hagelVorschlaege) return
    const todayIso = toDateStr(new Date())
    try {
      const r = await getVorschlaege(shiftISO(todayIso, -7), shiftISO(todayIso, APPT_WINDOW_AHEAD_DAYS))
      setVorschlaege(prev => sameRows(prev, r.vorschlaege) ? prev : r.vorschlaege)
    } catch { /* still */ }
  }

  async function loadAll() {
    localGen.current += 1
    const gen = localGen.current
    fullLoaded.current = false
    setLoading(true)
    const todayIso = toDateStr(new Date())
    // Fingerabdruck zuerst abschicken: er ist die Basis, gegen die der
    // Live-Takt vergleicht (Reihenfolge-Begründung bei refreshLive).
    const standP = getScheduleStand()
    // Das volle Terminfenster läuft PARALLEL zum nahen. Der Kalender wartet
    // nicht darauf; es ersetzt das nahe Fenster, sobald es da ist. Bei Gehlhaar
    // sind das drei Seiten à 1000 Termine nacheinander beim Server — die
    // musste der Kalender bis 20261106 abwarten, bevor er etwas zeigte.
    const fullP = listAppointments(shiftISO(todayIso, -APPT_WINDOW_BACK_DAYS), shiftISO(todayIso, APPT_WINDOW_AHEAD_DAYS))
      .catch(() => null)
    const firstP = loadedOnce.current
      ? fullP.then(full => full ?? [])
      : listAppointments(shiftISO(todayIso, -NEAR_WINDOW_BACK_DAYS), shiftISO(todayIso, NEAR_WINDOW_AHEAD_DAYS))
        .catch(() => [] as ProjectAppointment[])
    let ok = false
    try {
      const [proj, appts, abs, st] = await Promise.all([
        // /projects/schedule statt /projects: schon server-seitig auf planbare
        // Projekte gefiltert, ohne Offerten-/Rechnungs-Embeds und nur mit den
        // Feldern, die der Kalender liest (SCHEDULE_PROJECT_FIELDS).
        getScheduleProjects(),
        firstP,
        // Absenzen nur für das Fenster, in dem geplant wird — rückwärts kurz
        // (die Vergangenheit ändert niemand mehr), vorwärts so weit wie die
        // Termine. Fehler bleiben still: ohne Markierung plant man wie bisher,
        // und die Sperre sitzt ohnehin serverseitig.
        listScheduleAbsences(shiftISO(todayIso, -60), shiftISO(todayIso, APPT_WINDOW_AHEAD_DAYS))
          .catch(() => [] as ScheduleAbsence[]),
        getAdminStaff(),
      ])
      setProjects(proj)
      setAppointments(appts)
      setAbsences(abs)
      setStaff(st)
      lastSlowRefresh.current = Date.now()
      loadedOnce.current = true
      ok = true
      void ladeVorschlaege()
    } catch {
      showToast('Daten konnten nicht geladen werden.', 'error')
    } finally {
      setLoading(false)
    }
    // Erst nach dem nahen Fenster einhängen: so ersetzt das volle es immer,
    // nie umgekehrt. Hat inzwischen eine eigene Änderung stattgefunden, ist
    // das Ergebnis veraltet — dann holt der nächste Takt die Termine
    // (fullLoaded bleibt false).
    const [full, stand] = await Promise.all([fullP, standP])
    if (gen !== localGen.current) return
    if (full) {
      setAppointments(full)
      fullLoaded.current = true
    }
    standRef.current = stand
    if (ok && full) lastFullSync.current = Date.now()
  }

  // Ein Abruf, der vor diesem Aufruf gestartet ist, wird verworfen (Abbruch einer
  // Rückfrage: die zurückgesetzte Anzeige darf kein alter Abruf überschreiben).
  function verwerfeLaufendeAbrufe() { localGen.current += 1 }

  return {
    projects, appointments, setAppointments, absences, vorschlaege, setVorschlaege,
    skillKatalog, staffPillen, projektPillen, staff, loading,
    beginWrite, endWrite, verwerfeLaufendeAbrufe, refreshLive, ladeVorschlaege, loadAll,
  }
}

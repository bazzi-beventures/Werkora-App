import { useEffect, useState } from 'react'
import { getMe } from '../../../api/auth'
import { getFeature, hasModule, isFeatureEnabled } from '../../../api/modules'
import { BeschaffungStep, enabledBeschaffungSteps } from '../../constants/beschaffungSteps'

// Was der Mandant im Projekt-Detail ueberhaupt sieht (Charge H, H3) — ein
// einziger /me-Aufruf statt sechs verstreuter Flag-States im Screen.
//
// Alles faellt auf «aus» zurueck, wenn der Aufruf scheitert: eine Kachel, die
// wegen eines Netzfehlers fehlt, ist harmlos — eine, die ohne freigeschaltetes
// Modul erscheint, laeuft beim ersten Klick in einen 403.

export interface ProjectFeatures {
  /** Modul «scheduling» — ohne das antworten die Termin-Endpunkte 403. */
  scheduling: boolean
  /** Feature «geruestfach» — Gerüstfach-Nummer nur bei Mandanten mit Gerüstbau. */
  geruestfach: boolean
  /** Feature «offerte_dank_mail» — „Dankeschön senden" bei angenommenen Offerten. */
  dankMail: boolean
  /** Feature «offerte_absage_mail» — „Absage senden" bei abgelehnten Offerten. */
  absageMail: boolean
  /** Feature «teilrapport» — Teilrapport-Checkbox und Bündeln-Knopf im Rapport-Reiter. */
  teilrapport: boolean
  /** Leer = Feature «beschaffungsstatus» aus; sonst die konfigurierten Schritte. */
  beschaffungSteps: BeschaffungStep[]
  /**
   * Reiter «Nachkalkulation»: Modul «kpis» UND Management-Rolle — dieselben zwei
   * Gates wie der Kennzahlen-Screen. Der Reiter zeigt Eigenkosten und Gewinn des
   * Projekts; das ist keine Zahl für den Projektleiter-Alltag, sondern dieselbe
   * Auswertung, nur an dem Ort, an dem man sie braucht.
   */
  nachkalkulation: boolean
  /**
   * Feature «projekt_verlauf» (Beta): der Abschnitt «Verlauf» im Reiter
   * «Status». Ohne das Flag wird er nicht gerendert und nichts geladen —
   * hinter ihm stehen rund zehn Abfragen (docs/specs/projekt-verlauf.md §6.4).
   */
  verlauf: boolean
  /**
   * Feature «garantiefall» (Beta): Garantie-Vermerk, Abnahmedatum-Feld und die
   * Rückverweise am Projekt. Ohne das Flag fallen sie weg — `completed_at`
   * schreibt der Server trotzdem, es kostet nichts und macht das spätere
   * Einschalten rückwirkend nutzbar.
   *
   * Die Fristen (Monate, Anker) stehen NICHT hier: die Projektmaske nimmt die
   * fertige Auskunft des Servers (`project.warranty`), und nur die Projektliste
   * rechnet selbst — die holt sich die Parameter dort, wo sie sie braucht.
   */
  garantiefall: boolean
  /**
   * Modul «warranty»: Reiter «Garantie» mit den Garantiefällen (Phase 2).
   * Unabhängig vom Flag — ohne Flag gibt es Fälle, aber keine Fristen.
   */
  warranty: boolean
  /** Der angemeldete Benutzer — entscheidet, wer eine Freigabe visieren darf. */
  currentUserId: string | null
}

const NONE: ProjectFeatures = {
  scheduling: false,
  geruestfach: false,
  dankMail: false,
  absageMail: false,
  teilrapport: false,
  beschaffungSteps: [],
  nachkalkulation: false,
  verlauf: false,
  garantiefall: false,
  warranty: false,
  currentUserId: null,
}

export function useProjectFeatures(): ProjectFeatures {
  const [features, setFeatures] = useState<ProjectFeatures>(NONE)

  useEffect(() => {
    getMe().then(me => {
      setFeatures({
        scheduling: hasModule(me, 'scheduling'),
        geruestfach: isFeatureEnabled(me, 'geruestfach'),
        dankMail: isFeatureEnabled(me, 'offerte_dank_mail'),
        absageMail: isFeatureEnabled(me, 'offerte_absage_mail'),
        teilrapport: isFeatureEnabled(me, 'teilrapport'),
        beschaffungSteps: isFeatureEnabled(me, 'beschaffungsstatus')
          ? enabledBeschaffungSteps(getFeature(me, 'beschaffungsstatus'))
          : [],
        nachkalkulation:
          hasModule(me, 'kpis')
          && (me.role === 'management' || me.role === 'superadmin'),
        verlauf: isFeatureEnabled(me, 'projekt_verlauf'),
        garantiefall: isFeatureEnabled(me, 'garantiefall'),
        // Modul, nicht Feature-Flag: die Fälle. `hasModule` liest die Liste aus
        // /pwa/me, und die ist für ein Modul im Betatest schon pro Konto gefiltert.
        warranty: hasModule(me, 'warranty'),
        currentUserId: me.authorized_user_id,
      })
    }).catch(() => {})
  }, [])

  return features
}

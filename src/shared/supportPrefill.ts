/**
 * «Rückmeldung geben» → das bestehende Support-Formular öffnen, vorbelegt.
 *
 * docs/specs/beta-tester.md §6.3: Beta bekommt KEINEN eigenen Feedback-Kanal.
 * Die Meldung läuft über das Support-Ticket, damit der Betreiber sie in seiner
 * Support-Liste findet — mit dem Aktivitäts-Snapshot der letzten 15 Minuten
 * gleich dabei, also genau dem, was man für eine Beta-Rückmeldung braucht.
 *
 * Warum ein Event und kein Prop: Die Hilfe-Blase wird EINMAL auf App-Ebene
 * gerendert (App.tsx bzw. AdminApp.tsx), der Knopf sitzt beliebig tief im
 * Screen-Baum. Ein Prop durchzureichen hiesse, jeden Screen dazwischen um einen
 * Parameter zu erweitern, den er nicht braucht — und der Beta-Abschnitt sitzt in
 * zwei verschiedenen Bäumen (Profil der PWA, Sidebar/Drawer des Admin).
 */

export const SUPPORT_PREFILL_EVENT = 'werkora:support-prefill'

export interface SupportPrefill {
  /** Vorbelegter Text im Meldungsfeld — der Melder kann ihn ändern. */
  message: string
  /** Feature-Key, der als `beta_feature` in den Snapshot wandert. */
  betaFeature?: string
}

/** Öffnet die Hilfe-Blase auf dem Reiter «Problem melden», mit vorbelegtem Text. */
export function openSupportWithPrefill(prefill: SupportPrefill): void {
  window.dispatchEvent(new CustomEvent<SupportPrefill>(SUPPORT_PREFILL_EVENT, { detail: prefill }))
}

/**
 * Der Präfix, an dem der Betreiber Beta-Rückmeldungen in der Support-Liste
 * erkennt und filtert. Rein, damit die Form an einer Stelle steht und getestet
 * werden kann — sie steht sonst in jeder Meldung und lässt sich nachträglich
 * nicht mehr korrigieren.
 */
export function betaPrefillText(label: string): string {
  return `[Beta: ${label}] `
}

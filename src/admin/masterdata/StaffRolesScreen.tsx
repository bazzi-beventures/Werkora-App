import { SkillMatrixPanel } from './SkillMatrixPanel'

// Stammdaten → «Skill-Matrix» (wer kann was, Spec
// mitarbeiterdisposition-faehigkeiten-routen.md §4.5). Der Eintrag hiess bis 2026-11
// «Personal» und trug zusätzlich den Reiter «Stundensätze»; der ist als Reiter in die
// Einstellungen umgezogen (configuration/tabs/StundensaetzeTab.tsx) — im Menü stand
// sonst zweimal «Personal». Der Routen-Schlüssel `staff-roles` bleibt, weil Wünsche
// und Support-Meldungen ihn als `route` gespeichert haben.
export default function StaffRolesScreen() {
  return (
    <div className="admin-page">
      <SkillMatrixPanel />
    </div>
  )
}

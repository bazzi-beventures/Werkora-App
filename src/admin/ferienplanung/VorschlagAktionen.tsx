// «Übernehmen» / «Verwerfen» für Vorschläge des Ferien-Assistenten (Spec §11.3):
// ein Vorschlag wirkt erst, wenn die Geschäftsleitung ihn übernimmt (status → aktiv).
import { fehlerText, type FerienArt } from '../../api/admin/ferienplanung'
import { loeschen, speichern } from './useFerienStammdaten'

export function VorschlagAktionen({ art, id, onMeldung }: {
  art: FerienArt
  id: string
  onMeldung: (text: string, kind?: 'success' | 'error') => void
}) {
  async function uebernehmen() {
    try {
      await speichern(art, { status: 'aktiv' }, id)
      onMeldung('Vorschlag übernommen')
    } catch (err) {
      onMeldung(fehlerText(err), 'error')
    }
  }
  async function verwerfen() {
    try {
      await loeschen(art, id)
      onMeldung('Vorschlag verworfen')
    } catch (err) {
      onMeldung(fehlerText(err), 'error')
    }
  }
  return (
    <>
      <span className="ferien-vorschlag-badge">Vorschlag des Assistenten</span>
      <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => void uebernehmen()}>Übernehmen</button>
      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => void verwerfen()}>Verwerfen</button>
    </>
  )
}

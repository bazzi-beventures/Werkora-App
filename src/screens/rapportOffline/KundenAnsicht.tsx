import SignaturePad from '../../chat/SignaturePad'
import type { PendingRapport } from '../../api/rapportQueue'
import { workTypeLabel } from '../../api/workTypes'

/**
 * Was der Monteur dem Kunden hinhält —
 * [docs/specs/offline-modus.md](../../../../docs/specs/offline-modus.md) §4.5.4.
 *
 * Vollbild, nichts anderes auf dem Schirm: das Handy wird umgedreht, und wer
 * darauf schaut, ist nicht der Monteur. Grosse Schrift, wenig Text, und in
 * dieser Reihenfolge: Firma und Objekt, die Stunden, das Material, dann erst
 * Leistungsart und Beschrieb.
 *
 * **Ohne Preise.** Der verrechnete Preis entsteht erst serverseitig — aus der
 * Offerten-Preisbindung, `montage_in_produktpreis`, Sonderpositionen und
 * Mindestrechnung. Eine hier gezeigte Zahl wäre eine Zusage, die das Büro später
 * nicht einlösen muss. Der Katalog trägt zwar ein `calc_vk` mit sich, aber das
 * ist der Listenpreis, nicht die Rechnung.
 *
 * **Mit Unterschrift, und die ist die Abnahme.** Deshalb friert der Rapport
 * danach ein (der Aufrufer sperrt das Formular): der Kunde unterschreibt, was er
 * sieht. Wer danach noch korrigieren muss, verwirft die Unterschrift
 * ausdrücklich — eine stillschweigend weiterverwendete Unterschrift unter
 * geänderten Zahlen wäre eine Fälschung.
 *
 * Die Ansicht ist **nicht** das Dokument. Das PDF entsteht wie immer auf dem
 * Server, mit derselben Unterschrift; hier steht nur, was der Kunde zum
 * Widersprechen braucht, solange der Monteur noch da ist.
 */

interface Props {
  entry: PendingRapport
  /** Firmenname des Mandanten für den Kopf. */
  tenantName: string
  logoUrl?: string
  /** Übernimmt die Unterschrift in die Queue. `false` heisst «nicht gespeichert»
   *  — das Pad bleibt dann stehen und meldet es, statt eine Abnahme zu
   *  quittieren, die nirgends liegt. */
  onSign: (dataUrl: string) => Promise<boolean>
  /** «Überspringen»: der Kunde ist nicht greifbar. Der Rapport geht als pendent
   *  hoch, die Unterschrift wird später im Projekt-Detail nachgetragen. Beim
   *  Teilrapport ist das der einzige Abschluss — er wird nie einzeln
   *  unterschrieben. */
  onSkip: () => void
  /** Zurück ins Formular — nur solange nicht unterschrieben ist. */
  onBack: () => void
}

function hoursLabel(n: number): string {
  // «8 h» statt «8.0 h», «8.5 h» wo nötig. Der Kunde liest eine Zahl, keine
  // Fliesskomma-Darstellung.
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')} h`
}

export default function KundenAnsicht({ entry, tenantName, logoUrl, onSign, onSkip, onBack }: Props) {
  const staff = entry.staff.filter(s => s.name.trim() && (s.hours ?? 0) > 0)
  const total = staff.reduce((sum, s) => sum + (s.hours ?? 0), 0)
  const materials = entry.materials.filter(m => m.amount > 0)
  const klein = entry.kleinmaterial
  const hasKlein = !!klein && (klein.amount_chf ?? 0) > 0 && klein.count > 0

  return (
    <div className="kundenansicht">
      <div className="kundenansicht-kopf">
        {logoUrl && <img src={logoUrl} alt="" className="kundenansicht-logo" />}
        <div>
          <div className="kundenansicht-firma">{tenantName}</div>
          <div className="kundenansicht-projekt">{entry.projectName}</div>
          <div className="kundenansicht-datum">{entry.date}</div>
        </div>
      </div>

      <div className="kundenansicht-block">
        <h2 className="kundenansicht-titel">Stunden</h2>
        {staff.map((s, i) => (
          <div key={`${s.name}-${i}`} className="kundenansicht-zeile">
            <span>{s.name}</span>
            <strong>{hoursLabel(s.hours ?? 0)}</strong>
          </div>
        ))}
        <div className="kundenansicht-zeile kundenansicht-summe">
          <span>Total</span>
          <strong>{hoursLabel(total)}</strong>
        </div>
      </div>

      {(materials.length > 0 || hasKlein) && (
        <div className="kundenansicht-block">
          <h2 className="kundenansicht-titel">Material</h2>
          {materials.map(m => (
            <div key={m.art_nr} className="kundenansicht-zeile">
              <span>
                {m.name}
                {/* Die Artikelnummer als Nebentext: sie hilft beim Nachfragen,
                    soll aber nicht die Zeile beherrschen. */}
                <span className="kundenansicht-artnr"> {m.art_nr}</span>
              </span>
              <strong>{m.amount} {m.unit}</strong>
            </div>
          ))}
          {hasKlein && (
            <div className="kundenansicht-zeile">
              <span>Klein-/Schmiermaterial, pauschal</span>
              <strong>{klein!.count}×</strong>
            </div>
          )}
        </div>
      )}

      {(entry.workTypes.length > 0 || entry.description.trim() || entry.einbauort.trim()) && (
        <div className="kundenansicht-block kundenansicht-klein">
          {entry.workTypes.length > 0 && (
            <div className="kundenansicht-arbeit">
              {entry.workTypes.map(workTypeLabel).join(' · ')}
            </div>
          )}
          {entry.einbauort.trim() && (
            <div className="kundenansicht-arbeit">Ort: {entry.einbauort}</div>
          )}
          {entry.description.trim() && (
            <p className="kundenansicht-beschrieb">{entry.description}</p>
          )}
        </div>
      )}

      {entry.isPartial ? (
        // Teilrapport: kein Unterschriftsfeld. Die eine Unterschrift kommt am
        // Ende auf den Gesamtrapport (docs/specs/teilrapport.md §3.2) — hier
        // eines anzubieten hiesse, dem Kunden eine Abnahme vorzulegen, die der
        // Server anschliessend ablehnt.
        <div className="kundenansicht-block">
          <div className="kundenansicht-teilrapport">
            Teilrapport — der Kunde unterschreibt am Ende der Baustelle den
            Gesamtrapport.
          </div>
          <button type="button" className="confirm-btn confirm-btn-yes" onClick={onSkip}>
            Teilrapport merken
          </button>
          <button type="button" className="kundenansicht-zurueck" onClick={onBack}>
            Zurück zum Rapport
          </button>
        </div>
      ) : entry.signature ? (
        // Bereits unterschrieben: die Ansicht bleibt lesbar (der Kunde darf
        // nachschauen), aber es gibt nichts mehr zu tun. Verworfen wird die
        // Unterschrift ausdrücklich im Formular, nicht hier nebenbei.
        <div className="kundenansicht-block">
          <div className="kundenansicht-signiert">✓ Unterschrieben</div>
          <img src={entry.signature} alt="Unterschrift" className="kundenansicht-signatur" />
          <button type="button" className="confirm-btn confirm-btn-no" onClick={onBack}>
            Zurück
          </button>
        </div>
      ) : (
        <div className="kundenansicht-block">
          <SignaturePad
            onCapture={onSign}
            onDone={signed => { if (!signed) onSkip() }}
            skipLabel="Kunde ist nicht da — später unterschreiben"
          />
          <button type="button" className="kundenansicht-zurueck" onClick={onBack}>
            Zurück zum Rapport
          </button>
        </div>
      )}
    </div>
  )
}

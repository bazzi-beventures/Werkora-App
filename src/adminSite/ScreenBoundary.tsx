/**
 * Fängt einen Absturz **eines Screens** ab, statt die ganze Seite zu verlieren.
 *
 * Der Anlass ist nachgestellt und nicht hypothetisch: wirft ein Screen beim
 * Rendern (ein Feld, das der Server diesmal nicht mitschickt, reicht — `t.map
 * is not a function`), reisst React den kompletten Baum ab. Auf der
 * Betreiber-Seite heisst das: **weisse Seite**. Keine Seitenleiste, kein
 * Mandanten-Wähler, kein Hinweis — und damit auch kein Weg zu einem anderen
 * Werkzeug, mit dem man nachsehen könnte, was los ist. Genau das ist hier
 * teurer als in der Mandanten-App: der Betreiber ist allein, und die Seite ist
 * sein Werkzeugkasten.
 *
 * Deshalb steht die Grenze **um den Screen und nicht um die App**: die Shell
 * daneben (Navigation, Wähler, Abmelden) überlebt, und ein Klick auf ein
 * anderes Werkzeug bringt einen weiter. Die Shell selbst bleibt ungeschützt —
 * sie wäre der Rahmen, in dem die Meldung stünde; bricht sie, gibt es nichts
 * mehr, worin man sie zeigen könnte.
 *
 * `resetKey` ist der Screen-Schlüssel: React setzt eine Fehlergrenze von sich
 * aus nie zurück, ein einmal kaputter Bereich bliebe also für den Rest der
 * Sitzung kaputt — auch nach dem Wechsel auf ein Werkzeug, das nichts damit zu
 * tun hat.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Wechselt der Wert, wird die Grenze zurückgesetzt (= Screenwechsel). */
  resetKey: string
  /** Name des Screens für die Meldung — der Betreiber soll ihn nennen können. */
  screenTitel: string
  children: ReactNode
}

interface State {
  fehler: Error | null
}

export default class ScreenBoundary extends Component<Props, State> {
  state: State = { fehler: null }

  static getDerivedStateFromError(fehler: Error): State {
    return { fehler }
  }

  componentDidUpdate(vorher: Props): void {
    if (vorher.resetKey !== this.props.resetKey && this.state.fehler) {
      this.setState({ fehler: null })
    }
  }

  componentDidCatch(fehler: Error, info: ErrorInfo): void {
    // Die Konsole ist hier die einzige Spur: die Betreiber-Seite schickt keine
    // Support-Meldung (dafür ist sie selbst der Eingang), und ein eigener
    // Fehler-Melder wäre ein zweiter Kanal neben dem Fehlerbestand, den sie
    // ohnehin anzeigt.
    console.error(`[${this.props.screenTitel}] Screen abgestürzt:`, fehler, info.componentStack)
  }

  render(): ReactNode {
    const { fehler } = this.state
    if (!fehler) return this.props.children

    return (
      <div className="adminsite-screen-error">
        <div className="adminsite-screen-error-title">
          «{this.props.screenTitel}» konnte nicht angezeigt werden
        </div>
        <p className="adminsite-screen-error-text">
          Der Screen hat beim Aufbau abgebrochen. Die übrigen Werkzeuge links
          funktionieren weiter — der Fehler betrifft nur diesen einen.
        </p>
        <pre className="adminsite-screen-error-detail">{fehler.message}</pre>
        <button
          type="button"
          className="admin-btn admin-btn-secondary"
          onClick={() => this.setState({ fehler: null })}
        >
          Nochmal versuchen
        </button>
      </div>
    )
  }
}

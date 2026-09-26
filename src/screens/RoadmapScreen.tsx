import Roadmap from '../shared/Roadmap'

/**
 * Roadmap in der Mitarbeiter-PWA — Spec docs/specs/feature-anfragen.md §5.4.
 *
 * Kein eigener Tab in der unteren Leiste: dafür ist der Platz zu knapp und die
 * Fläche zu selten gebraucht. Erreichbar über die Hilfe-Blase («Roadmap
 * ansehen») und das Profil.
 */
interface Props {
  userId: string
  role: string
  logoUrl?: string
  onBack: () => void
}

export default function RoadmapScreen({ userId, role, logoUrl, onBack }: Props) {
  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </div>
        <div className="inner-title">Wünsche &amp; Roadmap</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        <Roadmap userId={userId} role={role} appContext="pwa" compact />
      </div>
    </div>
  )
}

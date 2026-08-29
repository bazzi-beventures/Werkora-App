import { useEffect, useState } from 'react'
import { apiFetch, ApiError, apiUrl } from '../api/client'
import { QUOTE_STATUS_LABELS } from '../admin/constants/statuses'
import { groupQuotesByProject, quoteCountLabel } from './offerten/groupQuotes'

interface Quote {
  id: number
  quote_number: string
  project_id: string | null
  project_name: string
  status: string
  total_amount: number | null
  quote_date: string | null
  valid_until: string | null
  created_at: string
  storage_path?: string | null
}

interface Props {
  logoUrl?: string
  onNavHome: () => void
  onNavArbeitszeit: () => void
  onNavProjekte: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

// Labels zentral aus der kanonischen Map — sonst driften die Bezeichnungen zwischen
// Admin-PWA und Mitarbeiter-PWA auseinander. Die Farben bleiben lokal: hier werden
// farbige Pills gerendert, nicht die admin-badge-CSS-Klassen.
const STATUS_COLORS: Record<string, string> = {
  entwurf: 'var(--muted)',
  gesendet: 'var(--info)',
  akzeptiert: 'var(--accent-green)',
  abgelehnt: 'var(--accent-red)',
  absage: 'var(--accent-red)',
  archiviert: 'var(--muted)',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

function formatChf(amount: number | null): string {
  if (amount == null) return ''
  return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount)
}

export default function OffertenScreen({ logoUrl, onNavHome, onNavArbeitszeit, onNavProjekte, onNavProfile, onLoggedOut }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await apiFetch('/pwa/quotes') as Quote[]
        if (!cancelled) setQuotes(data)
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 401) onLoggedOut()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Nach Projekt gruppieren (Reihenfolge = neueste Offerte zuerst, vom Backend sortiert)
  const groups = groupQuotesByProject(quotes)

  return (
    <div className="app-screen">
      <div className="inner-header">
        <div className="inner-title">Offerten</div>
        {logoUrl && <img src={logoUrl} alt="Logo" className="header-logo" />}
      </div>

      <div className="projekte-grid-scroll">
        {loading && (
          <div className="bericht-loading">Offerten werden geladen…</div>
        )}

        {!loading && quotes.length === 0 && (
          <div className="projekte-empty">Keine Offerten zu deinen Projekten vorhanden.</div>
        )}

        {/* Der Projektname führt die Gruppe an, nicht die Offertennummer: der
            Monteur sucht den Auftrag, an dem er heute steht — OF-2026-91 ist eine
            Bürogrösse. Die Nummer bleibt sichtbar (sie nennt er dem Büro am
            Telefon), aber klein. */}
        {!loading && groups.map(group => (
          <div key={group.project} className="projekte-group" style={{ marginBottom: 16 }}>
            <div className="offerten-group-header">
              <div className={`offerten-group-title${group.project ? '' : ' offerten-group-title-empty'}`}>
                {group.project || 'Ohne Projekt'}
              </div>
              <div className="offerten-group-count">{quoteCountLabel(group.quotes.length)}</div>
            </div>
            {group.quotes.map(q => (
              <div key={q.id} className="projekte-detail-card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="offerten-quote-number">{q.quote_number}</span>
                  <span
                    className="projekte-detail-badge"
                    style={{ background: STATUS_COLORS[q.status] || 'var(--muted)', color: '#fff' }}
                  >
                    {QUOTE_STATUS_LABELS[q.status] || q.status}
                  </span>
                </div>
                <div className="projekte-detail-row" style={{ marginTop: 6 }}>
                  <span className="projekte-detail-label">Datum</span>
                  <span className="projekte-detail-value">{formatDate(q.quote_date)}</span>
                </div>
                {q.total_amount != null && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Betrag (inkl. MwSt.)</span>
                    <span className="projekte-detail-value" style={{ fontWeight: 600 }}>{formatChf(q.total_amount)}</span>
                  </div>
                )}
                {q.valid_until && (
                  <div className="projekte-detail-row">
                    <span className="projekte-detail-label">Gültig bis</span>
                    <span className="projekte-detail-value">{formatDate(q.valid_until)}</span>
                  </div>
                )}
                {q.storage_path ? (
                  <a
                    href={apiUrl(`/pwa/quotes/${q.id}/pdf`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      width: '100%', marginTop: 12, padding: '12px 16px',
                      borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: '#fff',
                      fontSize: 14, fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    PDF öffnen
                  </a>
                ) : (
                  <div className="projekte-detail-empty" style={{ marginTop: 10 }}>Noch kein PDF verfügbar.</div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="nav-bar">
        <div className="nav-item" onClick={onNavHome}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span>Home</span>
        </div>
        <div className="nav-item" onClick={onNavArbeitszeit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Arbeitszeit</span>
        </div>
        <div className="nav-item" onClick={onNavProjekte}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <path d="M9 22V12h6v10"/>
          </svg>
          <span>Projekte</span>
        </div>
        <div className="nav-item" onClick={onNavProfile}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profil</span>
        </div>
      </div>
    </div>
  )
}

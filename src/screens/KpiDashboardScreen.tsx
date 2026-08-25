import { useEffect, useState, type JSX } from 'react'
import { fetchKpis, KpiCategory, KpiItem, KpiStatus } from '../api/kpis'
import { ApiError } from '../api/client'

const CATEGORY_META: Record<KpiCategory, { label: string; color: string; icon: JSX.Element }> = {
  mandanten: {
    label: 'Mandant & Nutzer',
    color: '#0d9488',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  pricing: {
    label: 'Pricing & Supplier',
    color: '#7c3aed',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  projekte: {
    label: 'Projekte & Reports',
    color: '#b45309',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  arbeitszeit: {
    label: 'Arbeitszeit & HR',
    color: '#15803d',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  finanzen: {
    label: 'Finanzen',
    color: '#be123c',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  material: {
    label: 'Material & Lager',
    color: '#4338ca',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
}

const STATUS_DOT: Record<KpiStatus, string> = {
  normal: '#93bcd4',
  good: '#22c55e',
  warning: '#f59e0b',
  critical: '#f87171',
}

function KpiCard({ item, accentColor }: { item: KpiItem; accentColor: string }) {
  const dotColor = STATUS_DOT[item.status]
  return (
    <div className="kpi-card">
      <div className="kpi-card-label">{item.label}</div>
      <div className="kpi-card-value" style={{ color: accentColor }}>
        {item.value}
        {item.unit && <span className="kpi-card-unit"> {item.unit}</span>}
      </div>
      <div className="kpi-card-status-dot" style={{ background: dotColor }} />
    </div>
  )
}

interface Props {
  category: KpiCategory
  onBack: () => void
  onNavRapport: () => void
  onNavArbeitszeit: () => void
  onNavProfile: () => void
  onLoggedOut: () => void
}

export default function KpiDashboardScreen({
  category,
  onBack,
  onNavRapport,
  onNavArbeitszeit,
  onNavProfile,
  onLoggedOut,
}: Props) {
  const meta = CATEGORY_META[category]
  const [kpis, setKpis] = useState<KpiItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setKpis(null)
    setError(null)
    fetchKpis(category)
      .then((res) => { if (!cancelled) setKpis(res.kpis) })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) return onLoggedOut()
        setError('Daten konnten nicht geladen werden.')
      })
    return () => { cancelled = true }
  }, [category])

  return (
    <div className="app-screen">
      {/* Header */}
      <div className="kpi-dash-header" style={{ borderBottomColor: `${meta.color}33` }}>
        <button className="kpi-back-btn" onClick={onBack} aria-label="Zurück">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="kpi-dash-icon" style={{ color: meta.color, background: `${meta.color}22` }}>
          {meta.icon}
        </div>
        <div>
          <div className="kpi-dash-title">{meta.label}</div>
          <div className="kpi-dash-sub">Aktuelle Kennzahlen</div>
        </div>
      </div>

      {/* Content */}
      <div className="kpi-dash-content">
        {!kpis && !error && (
          <div className="kpi-loading">
            <div className="kpi-spinner" style={{ borderTopColor: meta.color }} />
            <span>Laden…</span>
          </div>
        )}

        {error && (
          <div className="kpi-error">{error}</div>
        )}

        {kpis && (
          <div className="kpi-cards-list">
            {kpis.map((item, i) => (
              <KpiCard key={i} item={item} accentColor={meta.color} />
            ))}
          </div>
        )}
      </div>

      {/* Nav bar */}
      <div className="nav-bar">
        <div className="nav-item" onClick={onBack}>
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

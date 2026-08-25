import type { JSX } from 'react'
import type { KpiCategory } from '../api/kpis'

interface CategoryDef {
  id: KpiCategory
  label: string
  desc: string
  color: string
  iconColor: string
  borderColor: string
  bgColor: string
  icon: JSX.Element
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'mandanten',
    label: 'Mandant & Nutzer',
    desc: 'Mandanten, Benutzer, Rollen',
    color: '#0d9488',
    iconColor: 'rgba(13,148,136,0.18)',
    borderColor: 'rgba(13,148,136,0.25)',
    bgColor: 'rgba(13,148,136,0.08)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="1.8">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    id: 'pricing',
    label: 'Pricing & Supplier',
    desc: 'Margen, Lieferanten, Aufschläge',
    color: '#7c3aed',
    iconColor: 'rgba(124,58,237,0.18)',
    borderColor: 'rgba(124,58,237,0.25)',
    bgColor: 'rgba(124,58,237,0.08)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  {
    id: 'projekte',
    label: 'Projekte & Reports',
    desc: 'Status, Unterschriften, PDFs',
    color: '#b45309',
    iconColor: 'rgba(180,83,9,0.18)',
    borderColor: 'rgba(180,83,9,0.25)',
    bgColor: 'rgba(180,83,9,0.08)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    id: 'arbeitszeit',
    label: 'Arbeitszeit & HR',
    desc: 'Stunden, Absenzen, Überstunden',
    color: '#15803d',
    iconColor: 'rgba(21,128,61,0.18)',
    borderColor: 'rgba(21,128,61,0.25)',
    bgColor: 'rgba(21,128,61,0.08)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    id: 'finanzen',
    label: 'Finanzen',
    desc: 'Umsatz, Rechnungen, Offerten',
    color: '#be123c',
    iconColor: 'rgba(190,18,60,0.18)',
    borderColor: 'rgba(190,18,60,0.25)',
    bgColor: 'rgba(190,18,60,0.08)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#be123c" strokeWidth="1.8">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'material',
    label: 'Material & Lager',
    desc: 'Bestand, Low-Stock, Verbrauch',
    color: '#4338ca',
    iconColor: 'rgba(67,56,202,0.18)',
    borderColor: 'rgba(67,56,202,0.25)',
    bgColor: 'rgba(67,56,202,0.08)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="1.8">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
]

interface Props {
  onSelectCategory: (cat: KpiCategory) => void
  onBack: () => void
  onNavRapport: () => void
  onNavArbeitszeit: () => void
  onNavProfile: () => void
}

export default function KpiHubScreen({ onSelectCategory, onBack, onNavRapport, onNavArbeitszeit, onNavProfile }: Props) {
  return (
    <div className="app-screen">
      {/* Header */}
      <div className="kpi-hub-header">
        <button className="kpi-back-btn" onClick={onBack} aria-label="Zurück">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div>
          <div className="kpi-hub-title">Kennzahlen</div>
          <div className="kpi-hub-sub">Wähle eine Kategorie</div>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Category grid */}
      <div className="kpi-hub-grid">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className="kpi-cat-tile"
            style={{ borderColor: cat.borderColor, background: cat.bgColor }}
            onClick={() => onSelectCategory(cat.id)}
          >
            <div className="kpi-cat-icon" style={{ background: cat.iconColor }}>
              {cat.icon}
            </div>
            <div className="kpi-cat-label" style={{ color: cat.color }}>{cat.label}</div>
            <div className="kpi-cat-desc">{cat.desc}</div>
            <div className="kpi-cat-arrow" style={{ color: cat.color }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8h10M9 4l4 4-4 4"/>
              </svg>
            </div>
          </button>
        ))}
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

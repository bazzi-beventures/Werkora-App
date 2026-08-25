import type { FilterGroup } from '../types'

interface Props {
  groups: FilterGroup[]
  selected: Record<string, Set<string>>
  onToggle: (groupKey: string, value: string) => void
  onToggleAll: (groupKey: string, selectAll: boolean) => void
}

export default function FilterPanel({ groups, selected, onToggle, onToggleAll }: Props) {
  if (!groups.length) return null

  return (
    <div className="kpi-bi-filters">
      {groups.map((g) => {
        const sel = selected[g.key] ?? new Set<string>()
        const allSelected = g.options.length > 0 && g.options.every((o) => sel.has(o.value))
        return (
          <div key={g.key} className="kpi-bi-filter-group">
            <div className="kpi-bi-filter-header">
              <span className="kpi-bi-filter-title">{g.label}</span>
              <button
                className="kpi-bi-filter-toggle"
                onClick={() => onToggleAll(g.key, !allSelected)}
              >
                {allSelected ? 'Keine' : 'Alle'}
              </button>
            </div>
            <div className="kpi-bi-filter-options">
              {g.options.map((o) => (
                <label key={o.value} className="kpi-bi-filter-option">
                  <input
                    type="checkbox"
                    checked={sel.has(o.value)}
                    onChange={() => onToggle(g.key, o.value)}
                  />
                  <span className="kpi-bi-filter-label">{o.value || '(leer)'}</span>
                  <span className="kpi-bi-filter-count">{o.count}</span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

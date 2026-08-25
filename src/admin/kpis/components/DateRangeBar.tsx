import { PRESETS } from '../dateRange'
import type { DateRangeState } from '../useDateRange'

/**
 * Presets + freie von/bis-Auswahl. Die Klassennamen (`llm-cost-filter`,
 * `kpi-date-presets`, `llm-cost-range`) bleiben aus der LLM-Kosten-Zeit
 * erhalten — an ihnen hängen die Mobile-Regeln in kpi-dashboard.css.
 */
export default function DateRangeBar({ range }: { range: DateRangeState }) {
  return (
    <div className="llm-cost-filter">
      <div className="kpi-date-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`kpi-date-btn${range.preset === p.id ? ' active' : ''}`}
            onClick={() => range.applyPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="llm-cost-range">
        <label>
          von
          <input
            type="date"
            value={range.von}
            max={range.bis}
            onChange={(e) => range.changeVon(e.target.value)}
          />
        </label>
        <label>
          bis
          <input
            type="date"
            value={range.bis}
            min={range.von}
            onChange={(e) => range.changeBis(e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

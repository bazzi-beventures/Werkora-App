interface Option {
  id: string
  name: string
}

interface Props {
  options: Option[]
  value: string | null
  onChange: (next: string | null) => void
}

export function ProjektleiterFilter({ options, value, onChange }: Props) {
  return (
    <select
      className="admin-form-select"
      style={{ width: 'auto', flexShrink: 0 }}
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      title="Nach Projektleiter filtern"
    >
      <option value="">Projektleiter: Alle</option>
      {options.map(o => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  )
}

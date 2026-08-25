export const WORK_TYPES = [
  { value: 'Neumontage',    label: 'Neumontage' },
  { value: 'Wiedermontage', label: 'Wiedermontage' },
  { value: 'Umbau',         label: 'Umbau / Ersatz' },
  { value: 'Reparatur',     label: 'Reparatur' },
  { value: 'Wartung',       label: 'Service / Wartung' },
  { value: 'Demontage',     label: 'Demontage' },
] as const

export type WorkType = typeof WORK_TYPES[number]['value']

export const WORK_TYPE_VALUES: WorkType[] = WORK_TYPES.map(t => t.value) as WorkType[]

export function workTypeLabel(value: string | null | undefined): string {
  if (!value) return ''
  return WORK_TYPES.find(t => t.value === value)?.label ?? value
}

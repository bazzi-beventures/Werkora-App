// Personalordner je Mitarbeiter (WW-106, docs/specs/personalordner.md).
// Nur Manager und Manager light, Feature `personalordner`.
import { apiFetch, apiFormFetch, apiUrl } from '../client'
import type { Antwort } from '../generated'

export type PersonalDatei = Antwort<'PersonalDatei'>
export type PersonalRegister = PersonalDatei['category']

/** Die vier Register in der Reihenfolge des Wunsches. */
export const PERSONAL_REGISTER: { key: PersonalRegister; label: string }[] = [
  { key: 'gespraech', label: 'MA-Gespräche' },
  { key: 'vertrag', label: 'Vertrag/Unterschriften' },
  { key: 'versicherung', label: 'Versicherungen' },
  { key: 'zertifikat', label: 'Zertifikate' },
]

/** Was der Ordner annimmt — Spiegel von `_ERLAUBT` in admin_staff_files.py. */
export const PERSONALORDNER_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx'

const basis = (staffId: string) => `/pwa/admin/staff/${encodeURIComponent(staffId)}/files`

export async function listStaffFiles(staffId: string): Promise<PersonalDatei[]> {
  const res = await apiFetch<Antwort<'Personalordner'>>(basis(staffId))
  return Array.isArray(res?.dateien) ? res.dateien : []
}

export function uploadStaffFile(staffId: string, category: PersonalRegister, file: File): Promise<PersonalDatei> {
  const form = new FormData()
  form.append('file', file)
  form.append('category', category)
  return apiFormFetch<PersonalDatei>(basis(staffId), form)
}

export async function deleteStaffFile(staffId: string, fileId: string): Promise<void> {
  await apiFetch(`${basis(staffId)}/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

/** Download über den Backend-Proxy (Sitzungs-Cookie) — nie eine signierte Bucket-URL. */
export function staffFileUrl(staffId: string, fileId: string): string {
  return apiUrl(`${basis(staffId)}/${encodeURIComponent(fileId)}/download`)
}

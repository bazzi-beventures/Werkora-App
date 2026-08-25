import { describe, it, expect } from 'vitest'
import { PROJECT_FILE_ACCEPT, projectFileIcon } from './projectFileTypes'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('PROJECT_FILE_ACCEPT', () => {
  it('lässt Bilder und PDFs weiter durch', () => {
    expect(PROJECT_FILE_ACCEPT).toContain('image/*')
    expect(PROJECT_FILE_ACCEPT).toContain('application/pdf')
  })

  it('enthält Excel und Word je als MIME-Typ UND als Endung', () => {
    // Endung nötig, weil Windows für .xls/.doc je nach Office-Version
    // abweichende MIME-Typen meldet.
    for (const token of ['.xlsx', XLSX, '.xls', 'application/vnd.ms-excel',
                         '.docx', DOCX, '.doc', 'application/msword']) {
      expect(PROJECT_FILE_ACCEPT.split(',')).toContain(token)
    }
  })
})

describe('projectFileIcon', () => {
  it('unterscheidet PDF, Excel, Word und Bild', () => {
    expect(projectFileIcon('application/pdf')).toBe('📄')
    expect(projectFileIcon(XLSX)).toBe('📊')
    expect(projectFileIcon('application/vnd.ms-excel')).toBe('📊')
    expect(projectFileIcon(DOCX)).toBe('📝')
    expect(projectFileIcon('application/msword')).toBe('📝')
    expect(projectFileIcon('image/jpeg')).toBe('🖼️')
  })

  it('fällt auf die Dateiendung zurück, wenn mime_type fehlt', () => {
    // Altbestand aus der Drive-Migration hat teils mime_type = NULL.
    expect(projectFileIcon(null, 'Ausmass.xlsx')).toBe('📊')
    expect(projectFileIcon(null, 'Protokoll.DOCX')).toBe('📝')
    expect(projectFileIcon(undefined, 'Offerte.pdf')).toBe('📄')
  })

  it('nimmt ohne jeden Hinweis das Bild-Icon (bisheriges Verhalten)', () => {
    expect(projectFileIcon(null, null)).toBe('🖼️')
    expect(projectFileIcon(null, 'foto_ohne_endung')).toBe('🖼️')
  })
})

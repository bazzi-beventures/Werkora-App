import { describe, it, expect } from 'vitest'
import { PROJECT_FILE_ACCEPT, projectFileIcon, projectFileTooLarge } from './projectFileTypes'

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

describe('E-Mails und Videos (WW-53, WW-45)', () => {
  it('nimmt E-Mails über die Endung und Videos in den Picker auf', () => {
    const tokens = PROJECT_FILE_ACCEPT.split(',')
    for (const token of ['.eml', '.msg', 'video/mp4', 'video/quicktime', '.mov']) {
      expect(tokens).toContain(token)
    }
  })

  it('zeigt eigene Symbole — auch beim Altbestand ohne MIME-Typ', () => {
    expect(projectFileIcon('video/quicktime')).toBe('🎬')
    expect(projectFileIcon('message/rfc822')).toBe('✉️')
    expect(projectFileIcon('application/vnd.ms-outlook')).toBe('✉️')
    expect(projectFileIcon(null, 'Rückfrage.MSG')).toBe('✉️')
    expect(projectFileIcon(null, 'Geraeusch.mp4')).toBe('🎬')
  })
})

describe('projectFileTooLarge', () => {
  const MB = 1024 * 1024
  it('lässt Videos bis 50 MB zu, andere Dateien bis 20 MB', () => {
    expect(projectFileTooLarge({ name: 'a.mov', type: 'video/quicktime', size: 45 * MB })).toBeNull()
    expect(projectFileTooLarge({ name: 'a.mov', type: 'video/quicktime', size: 51 * MB })).toMatch(/50 MB/)
    expect(projectFileTooLarge({ name: 'a.pdf', type: 'application/pdf', size: 19 * MB })).toBeNull()
    expect(projectFileTooLarge({ name: 'a.pdf', type: 'application/pdf', size: 21 * MB })).toMatch(/20 MB/)
  })

  it('erkennt ein Video auch ohne gemeldeten Typ an der Endung', () => {
    expect(projectFileTooLarge({ name: 'clip.MP4', type: '', size: 30 * MB })).toBeNull()
  })
})

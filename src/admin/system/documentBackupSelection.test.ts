import { describe, it, expect } from 'vitest'
import { DocumentBackupPreview } from '../../api/admin'
import {
  defaultContents,
  defaultRange,
  describeContents,
  describeScope,
  driveOnlyCount,
  isEmptySelection,
  isoLocal,
  previewLines,
  rangeInvalid,
  supportsBulkDownload,
  toggleContent,
} from './documentBackupSelection'

// Auswahl-Logik der Datensicherung (docs/specs/datensicherung-v2.md). Der heikle
// Teil ist die Zeitzone bei der Vorbelegung und die Frage, was „nichts zu sichern"
// heisst — Stammdaten zaehlen nicht in den Dateizaehler, sind aber trotzdem Inhalt.

describe('isoLocal', () => {
  it('nimmt die lokalen Feldwerte, nicht die UTC-Sicht', () => {
    // 1. Januar 00:30 Ortszeit ist in UTC noch der 31. Dezember — toISOString()
    // haette hier den Vortag geliefert und den Zeitraum um einen Tag verschoben.
    expect(isoLocal(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(isoLocal(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31')
  })
})

describe('defaultRange', () => {
  it('spannt die letzten zwei Monate bis heute auf', () => {
    expect(defaultRange(new Date(2026, 7, 25))).toEqual({
      from: '2026-06-25', to: '2026-08-25',
    })
  })

  it('rechnet ueber den Jahreswechsel zurueck', () => {
    expect(defaultRange(new Date(2026, 0, 15))).toEqual({
      from: '2025-11-15', to: '2026-01-15',
    })
  })
})

describe('defaultContents', () => {
  it('Vollbackup nimmt alles', () => {
    expect(defaultContents('full')).toEqual([
      'documents', 'photos', 'project_files', 'master_data',
    ])
  })

  it('Teilbackup nimmt nur Dokumente und Fotos', () => {
    expect(defaultContents('partial')).toEqual(['documents', 'photos'])
  })
})

describe('toggleContent', () => {
  it('entfernt einen gesetzten Haken', () => {
    expect(toggleContent(['documents', 'photos'], 'photos')).toEqual(['documents'])
  })

  it('setzt einen fehlenden Haken', () => {
    expect(toggleContent(['documents'], 'photos')).toEqual(['documents', 'photos'])
  })

  it('haelt die Reihenfolge unabhaengig von der Klick-Reihenfolge', () => {
    // Die Auswahl landet 1:1 als `contents` auf der Job-Zeile — sonst stuende dort
    // je nach Klickfolge eine andere Liste fuer dieselbe Auswahl.
    const a = toggleContent(['master_data'], 'documents')
    expect(a).toEqual(['documents', 'master_data'])
  })

  it('kann bis auf leer abwaehlen (das Backend lehnt das dann mit 400 ab)', () => {
    expect(toggleContent(['documents'], 'documents')).toEqual([])
  })
})

describe('rangeInvalid', () => {
  it('Vollbackup braucht keinen Zeitraum', () => {
    expect(rangeInvalid('full', '', '')).toBe(false)
  })

  it('Teilbackup ohne Datum ist ungueltig', () => {
    expect(rangeInvalid('partial', '', '2026-08-25')).toBe(true)
    expect(rangeInvalid('partial', '2026-06-01', '')).toBe(true)
  })

  it('Von nach Bis ist ungueltig, gleicher Tag ist gueltig', () => {
    expect(rangeInvalid('partial', '2026-08-25', '2026-06-01')).toBe(true)
    expect(rangeInvalid('partial', '2026-06-01', '2026-06-01')).toBe(false)
  })
})

describe('describeScope', () => {
  it('nennt den Zeitraum beim Teilbackup', () => {
    expect(describeScope('partial', '2026-06-01', '2026-07-31'))
      .toBe('Teilbackup 2026-06-01 bis 2026-07-31')
  })

  it('faellt ohne Zeitraum auf die Voll-Beschreibung zurueck', () => {
    expect(describeScope('partial', null, null)).toBe('Vollbackup (Gesamtbestand)')
    expect(describeScope('full', null, null)).toBe('Vollbackup (Gesamtbestand)')
  })
})

describe('describeContents', () => {
  it('kuerzt die Labels auf den Teil vor der Klammer', () => {
    expect(describeContents(['documents', 'photos']))
      .toBe('Dokumente, Rapport-Fotos')
  })
})

function makePreview(over: Partial<DocumentBackupPreview> = {}): DocumentBackupPreview {
  return {
    scope: 'full', range_from: null, range_to: null,
    contents: ['documents'],
    document_count: 0, invoices: 0, quotes: 0, reports: 0, photos: 0, project_files: 0,
    photos_drive_only: 0, project_files_drive_only: 0,
    max_per_month: 1, max_full_per_month: 1, max_partial_per_month: 3,
    used_this_month: 0, remaining_this_month: 1, limit_reached: false, active: false,
    ...over,
  }
}

describe('previewLines', () => {
  it('zeigt nur die gewaehlten Kategorien', () => {
    const lines = previewLines(makePreview({
      contents: ['photos'], photos: 12, invoices: 99,
    }))
    expect(lines).toEqual(['12 Rapport-Foto(s)'])
  })

  it('nennt die Stammdaten-Mappen, obwohl sie nicht mitgezaehlt werden', () => {
    const lines = previewLines(makePreview({ contents: ['master_data'] }))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Stammdaten-Arbeitsmappen')
  })
})

describe('driveOnlyCount', () => {
  it('zaehlt nur die Kategorien, die gewaehlt sind', () => {
    const preview = makePreview({
      contents: ['photos'], photos_drive_only: 12, project_files_drive_only: 5,
    })
    expect(driveOnlyCount(preview)).toBe(12)
  })

  it('summiert Fotos und Projekt-Dateien', () => {
    const preview = makePreview({
      contents: ['photos', 'project_files'],
      photos_drive_only: 12, project_files_drive_only: 5,
    })
    expect(driveOnlyCount(preview)).toBe(17)
  })
})

describe('isEmptySelection', () => {
  it('0 Dateien ohne Stammdaten ist leer', () => {
    expect(isEmptySelection(makePreview({ document_count: 0 }))).toBe(true)
  })

  it('0 Dateien MIT Stammdaten ist nicht leer', () => {
    // Die Arbeitsmappen entstehen erst beim Export und zaehlen deshalb nicht im
    // document_count — ein Stammdaten-Backup darf trotzdem starten.
    expect(isEmptySelection(makePreview({
      document_count: 0, contents: ['master_data'],
    }))).toBe(false)
  })
})

describe('supportsBulkDownload', () => {
  const nav = (userAgent: string, maxTouchPoints = 0) =>
    ({ userAgent, maxTouchPoints }) as Navigator

  it('Chrome auf Windows kann es', () => {
    expect(supportsBulkDownload(nav('Mozilla/5.0 (Windows NT 10.0) Chrome/140'))).toBe(true)
  })

  it('iPhone nicht', () => {
    expect(supportsBulkDownload(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari'))).toBe(false)
  })

  it('iPad erkennt man am Touch, nicht am UA (meldet sich als Macintosh)', () => {
    expect(supportsBulkDownload(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari', 5))).toBe(false)
    expect(supportsBulkDownload(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari', 0))).toBe(true)
  })

  it('ohne navigator lieber nicht anbieten', () => {
    expect(supportsBulkDownload(null)).toBe(false)
  })
})

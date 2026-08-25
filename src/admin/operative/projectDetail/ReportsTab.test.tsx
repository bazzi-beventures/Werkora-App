import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportsTab, reportStatusBadge } from './tabs'
import type { ProjectReport } from './tabs'

function makeReport(over: Partial<ProjectReport> = {}): ProjectReport {
  return {
    id: 1,
    report_date: '2026-07-21',
    description: 'Arbeiten gemäss Offerte',
    created_by: 'Chef',
    pdf_url: null,
    storage_path: null,
    signature_timestamp: null,
    invoice_id: null,
    created_at: '2026-07-21T10:00:00Z',
    source: 'chat',
    ...over,
  }
}

describe('ReportsTab — Badge-Logik', () => {
  it('zeigt «Manuell» für einen admin_manual-Rapport ohne Unterschrift', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual' })]} />)
    expect(screen.getByText('Manuell')).toBeInTheDocument()
    expect(screen.queryByText('Pendent')).not.toBeInTheDocument()
    expect(screen.queryByText('Unterschrieben')).not.toBeInTheDocument()
  })

  it('zeigt «Pendent» für einen Chat-Rapport ohne Unterschrift', () => {
    render(<ReportsTab reports={[makeReport({ source: 'chat' })]} />)
    expect(screen.getByText('Pendent')).toBeInTheDocument()
  })

  it('zeigt «Unterschrieben» wenn signiert (Vorrang vor Manuell)', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual', signature_timestamp: '2026-07-21T12:00:00Z' })]} />)
    expect(screen.getByText('Unterschrieben')).toBeInTheDocument()
    expect(screen.queryByText('Manuell')).not.toBeInTheDocument()
  })

  it('zeigt «Abgerechnet» mit Vorrang, auch bei manuellem Rapport', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual', invoice_id: 7 })]} />)
    expect(screen.getByText('Abgerechnet')).toBeInTheDocument()
    expect(screen.queryByText('Manuell')).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Erstellen-Button', () => {
  it('zeigt «+ Neuer Rapport» und feuert onShowCreateForm', async () => {
    const onShow = vi.fn()
    render(<ReportsTab reports={[]} onShowCreateForm={onShow} />)
    const btn = screen.getByRole('button', { name: '+ Neuer Rapport' })
    await userEvent.click(btn)
    expect(onShow).toHaveBeenCalledTimes(1)
  })

  it('zeigt den Button nicht ohne onShowCreateForm-Prop', () => {
    render(<ReportsTab reports={[]} />)
    expect(screen.queryByRole('button', { name: '+ Neuer Rapport' })).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Löschen', () => {
  it('zeigt keinen Löschen-Knopf ohne onDelete-Prop', () => {
    render(<ReportsTab reports={[makeReport()]} />)
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('zeigt Löschen für einen pendenten Rapport', () => {
    render(<ReportsTab reports={[makeReport()]} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument()
  })

  it('zeigt Löschen auch für einen unterschriebenen Rapport (PL verantwortet das Projekt)', () => {
    render(<ReportsTab reports={[makeReport({ signature_timestamp: '2026-07-21T12:00:00Z' })]} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument()
  })

  it('zeigt KEIN Löschen für einen abgerechneten Rapport', () => {
    // Die Positionen stehen auf einer Rechnung — der Server sperrt es ebenfalls (409).
    render(<ReportsTab reports={[makeReport({ invoice_id: 7 })]} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('löscht erst nach Bestätigung im Dialog', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<ReportsTab reports={[makeReport({ id: 99 })]} onDelete={onDelete} />)

    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(onDelete).not.toHaveBeenCalled()          // Dialog offen, noch nichts passiert

    await userEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    expect(onDelete).toHaveBeenCalledWith(99)
  })

  it('bricht ohne Löschen ab', async () => {
    const onDelete = vi.fn()
    render(<ReportsTab reports={[makeReport()]} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('warnt im Dialog zusätzlich bei unterschriebenem Rapport', async () => {
    render(<ReportsTab reports={[makeReport({ signature_timestamp: '2026-07-21T12:00:00Z' })]} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.getByText('Dieser Rapport ist vom Kunden unterschrieben.')).toBeInTheDocument()
  })
})

describe('ReportsTab — hochgeladene Rapporte', () => {
  const uploadProps = {
    files: [],
    uploading: false,
    uploadingCategory: null,
    onUploadFile: vi.fn(),
    onDeleteFile: vi.fn(),
    onRenameFile: vi.fn(),
  }

  it('zeigt die Upload-Sektion, wenn die Datei-Props gesetzt sind', () => {
    render(<ReportsTab reports={[]} {...uploadProps} />)
    expect(screen.getByText('Hochgeladene Rapporte (Papier / Fremdsystem)')).toBeInTheDocument()
  })

  it('zeigt die Sektion nicht ohne Datei-Props', () => {
    render(<ReportsTab reports={[]} />)
    expect(screen.queryByText('Hochgeladene Rapporte (Papier / Fremdsystem)')).not.toBeInTheDocument()
  })

  it('listet nur Dateien der Kategorie rapport', () => {
    const files = [
      { id: 'f-1', filename: 'papier-rapport.pdf', file_url: null, storage_path: 'p/1', mime_type: 'application/pdf', category: 'rapport' as const, created_at: '2026-07-27T08:00:00Z' },
      { id: 'f-2', filename: 'baustellenfoto.jpg', file_url: null, storage_path: 'p/2', mime_type: 'image/jpeg', category: 'fotos' as const, created_at: '2026-07-27T08:00:00Z' },
    ]
    render(<ReportsTab reports={[]} {...uploadProps} files={files} />)
    expect(screen.getByText('papier-rapport.pdf')).toBeInTheDocument()
    expect(screen.queryByText('baustellenfoto.jpg')).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Papier-Rapport', () => {
  it('verlinkt das Blanko-PDF, wenn paperRapportUrl gesetzt ist', () => {
    render(<ReportsTab reports={[]} paperRapportUrl="https://api.test/pwa/admin/projects/p-1/paper-rapport.pdf" />)
    const link = screen.getByRole('link', { name: 'Papier-Rapport (PDF)' })
    expect(link).toHaveAttribute('href', 'https://api.test/pwa/admin/projects/p-1/paper-rapport.pdf')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('zeigt den Link nicht ohne paperRapportUrl-Prop', () => {
    render(<ReportsTab reports={[]} onShowCreateForm={vi.fn()} />)
    expect(screen.queryByRole('link', { name: 'Papier-Rapport (PDF)' })).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Bearbeiten', () => {
  it('zeigt Bearbeiten für einen manuellen, unverrechneten Rapport', async () => {
    const onEdit = vi.fn()
    render(<ReportsTab reports={[makeReport({ id: 9, source: 'admin_manual' })]} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    expect(onEdit).toHaveBeenCalledWith(9)
  })

  it('zeigt Bearbeiten nicht am Chat-Rapport', () => {
    // Was der Monteur diktiert hat, schreibt der Projektleiter nicht um — für ihn
    // bleibt es beim Löschen und Neuerfassen.
    render(<ReportsTab reports={[makeReport({ source: 'chat' })]} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })

  it('zeigt Bearbeiten nicht am abgerechneten Rapport', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual', invoice_id: 7 })]} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })

  it('zeigt Bearbeiten nicht am unterschriebenen Rapport', () => {
    render(<ReportsTab
      reports={[makeReport({ source: 'admin_manual', signature_timestamp: '2026-07-21T12:00:00Z' })]}
      onEdit={vi.fn()}
    />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })

  it('zeigt den Knopf nicht ohne onEdit-Prop', () => {
    render(<ReportsTab reports={[makeReport({ source: 'admin_manual' })]} />)
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
  })
})

describe('ReportsTab — Monteur statt Erfasser', () => {
  // Der Befund aus dem Feld: derselbe Rapport nannte in der Liste das Büro
  // (created_by) und im PDF den Monteur aus den erfassten Stunden.
  it('zeigt den Monteur, nicht den Erfasser', () => {
    render(<ReportsTab reports={[makeReport({
      source: 'admin_manual', created_by: 'Isabelle Zecchini', monteure: 'Franco Schäfler',
    })]} />)
    expect(screen.getByText(/Franco Schäfler/)).toBeInTheDocument()
  })

  it('nennt den Erfasser als Zusatz, wenn er nicht selbst vor Ort war', () => {
    render(<ReportsTab reports={[makeReport({
      source: 'admin_manual', created_by: 'Isabelle Zecchini', monteure: 'Franco Schäfler',
    })]} />)
    expect(screen.getByText(/erfasst von Isabelle Zecchini/)).toBeInTheDocument()
  })

  it('nennt den Erfasser nicht doppelt, wenn er der Monteur ist', () => {
    render(<ReportsTab reports={[makeReport({
      created_by: 'Franco Schäfler', monteure: 'Franco Schäfler',
    })]} />)
    expect(screen.queryByText(/erfasst von/)).not.toBeInTheDocument()
  })

  it('fällt ohne monteure auf created_by zurück (ältere Antwort, Rapport ohne Stunden)', () => {
    render(<ReportsTab reports={[makeReport({ created_by: 'Chef', monteure: null })]} />)
    expect(screen.getByText(/Chef/)).toBeInTheDocument()
  })

  it('nennt im Löschen-Dialog den Monteur', async () => {
    render(<ReportsTab
      reports={[makeReport({ created_by: 'Isabelle Zecchini', monteure: 'Franco Schäfler' })]}
      onDelete={vi.fn()}
    />)
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.getByText(/\(Franco Schäfler\)/)).toBeInTheDocument()
  })
})

describe('ReportsTab — fehlendes PDF nacherzeugen', () => {
  // Der Befund aus dem Feld: ein unterschriebener, bereits abgerechneter Rapport
  // stand ohne Dokument da (Storage-Upload beim Signieren gescheitert). Er war
  // damit gar nicht mehr zu öffnen — Bearbeiten, das sonst neu rendert, sperrt
  // das billed-Gate.
  const missingPdf = { storage_path: null, pdf_url: null }

  it('bietet «PDF erzeugen» statt der toten Zeile «kein PDF»', () => {
    render(<ReportsTab reports={[makeReport(missingPdf)]} onRegeneratePdf={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'PDF erzeugen' })).toBeInTheDocument()
    expect(screen.queryByText('kein PDF')).not.toBeInTheDocument()
  })

  it('bietet den Knopf auch am abgerechneten Rapport', () => {
    // Das PDF ist abgeleitet, nicht Inhalt: neu rendern ändert weder Stunden noch
    // Material. Ohne diese Ausnahme bliebe genau der Fall aus dem Feld unlesbar.
    render(<ReportsTab
      reports={[makeReport({ ...missingPdf, invoice_id: 77 })]}
      onRegeneratePdf={vi.fn()}
    />)
    expect(screen.getByText('Abgerechnet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF erzeugen' })).toBeInTheDocument()
  })

  it('reicht die Rapport-id an den Aufrufer', async () => {
    const onRegeneratePdf = vi.fn().mockResolvedValue(undefined)
    render(<ReportsTab reports={[makeReport({ ...missingPdf, id: 42 })]} onRegeneratePdf={onRegeneratePdf} />)
    await userEvent.click(screen.getByRole('button', { name: 'PDF erzeugen' }))
    expect(onRegeneratePdf).toHaveBeenCalledWith(42)
  })

  it('zeigt den Knopf nicht, wenn bereits ein PDF vorliegt', () => {
    // Der Kunde hat die erste Fassung — es darf keine zweite unter derselben
    // Nummer entstehen (der Server lehnt das zusätzlich mit 409 ab).
    render(<ReportsTab
      reports={[makeReport({ storage_path: 'reports/RAP-1.pdf' })]}
      onRegeneratePdf={vi.fn()}
    />)
    expect(screen.queryByRole('button', { name: 'PDF erzeugen' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PDF' })).toBeInTheDocument()
  })

  it('bleibt ohne den Prop bei der alten Anzeige', () => {
    render(<ReportsTab reports={[makeReport(missingPdf)]} />)
    expect(screen.getByText('kein PDF')).toBeInTheDocument()
  })
})

// ── Teilrapport / Gesamtrapport (docs/specs/teilrapport.md §6.3) ──

describe('ReportsTab — Teilrapport-Badges', () => {
  it('markiert den freien Teilrapport als offen', () => {
    expect(reportStatusBadge(makeReport({ is_partial: true }))).toMatchObject({
      label: 'Teilrapport – offen', cls: 'admin-badge-warning',
    })
  })

  it('markiert den gebündelten Teilrapport als gebündelt', () => {
    expect(reportStatusBadge(makeReport({ is_partial: true, merged_into_report_id: 100 })).label)
      .toBe('Teilrapport – gebündelt')
  })

  it('unterscheidet unterschriebenen, unsignierten und aufgelösten Gesamtrapport', () => {
    expect(reportStatusBadge(makeReport({ is_aggregate: true })).label)
      .toBe('Gesamtrapport – ohne Unterschrift')
    expect(reportStatusBadge(makeReport({
      is_aggregate: true, signature_timestamp: '2026-08-08T10:00:00Z',
    })).label).toBe('Gesamtrapport')
    expect(reportStatusBadge(makeReport({
      is_aggregate: true, signature_timestamp: '2026-08-08T10:00:00Z',
      dissolved_at: '2026-08-09T08:00:00Z',
    })).label).toBe('Gesamtrapport – aufgelöst')
  })

  it('lässt «Abgerechnet» alles andere schlagen', () => {
    expect(reportStatusBadge(makeReport({ is_partial: true, invoice_id: 9 })).label)
      .toBe('Abgerechnet')
  })
})

describe('ReportsTab — Bündeln und Auflösen', () => {
  it('zeigt den Bündeln-Knopf erst ab einem freien Teilrapport', () => {
    const { rerender } = render(
      <ReportsTab reports={[makeReport()]} teilrapportEnabled onAggregate={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /Gesamtrapport erstellen/ })).not.toBeInTheDocument()

    rerender(
      <ReportsTab reports={[makeReport({ is_partial: true })]} teilrapportEnabled onAggregate={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /Gesamtrapport erstellen \(1\)/ })).toBeInTheDocument()
  })

  it('zeigt ihn ohne Feature nicht — das Badge aber schon', () => {
    render(<ReportsTab reports={[makeReport({ is_partial: true })]} onAggregate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Gesamtrapport erstellen/ })).not.toBeInTheDocument()
    expect(screen.getByText('Teilrapport – offen')).toBeInTheDocument()
  })

  it('schickt genau die angehakten IDs ans Backend', async () => {
    const user = userEvent.setup()
    const onAggregate = vi.fn(async () => {})
    render(
      <ReportsTab
        reports={[
          makeReport({ id: 1, is_partial: true, report_date: '2026-08-05' }),
          makeReport({ id: 2, is_partial: true, report_date: '2026-08-06' }),
        ]}
        teilrapportEnabled
        onAggregate={onAggregate}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Gesamtrapport erstellen \(2\)/ }))
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map(b => b.checked)).toEqual([true, true])

    await user.click(boxes[0])
    await user.click(screen.getByRole('button', { name: 'Gesamtrapport erstellen' }))
    expect(onAggregate).toHaveBeenCalledWith([2])
  })

  it('sperrt Bearbeiten und Löschen am gebündelten Teilrapport', () => {
    render(
      <ReportsTab
        reports={[makeReport({
          source: 'admin_manual', is_partial: true, merged_into_report_id: 100,
        })]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('benennt beim Auflösen des unterschriebenen Gesamtrapports ausdrücklich das PDF', async () => {
    const user = userEvent.setup()
    render(
      <ReportsTab
        reports={[makeReport({
          id: 100, is_aggregate: true, signature_timestamp: '2026-08-08T10:00:00Z',
        })]}
        onDissolve={vi.fn(async () => {})}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Auflösen' }))
    expect(screen.getByText(/Der Kunde hat dieses PDF unterschrieben/)).toBeInTheDocument()
  })

  it('bietet das Auflösen am abgerechneten Gesamtrapport nicht an', () => {
    render(
      <ReportsTab
        reports={[makeReport({ id: 100, is_aggregate: true, invoice_id: 7 })]}
        onDissolve={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Auflösen' })).not.toBeInTheDocument()
  })
})


// ── Abnahme durch den Projektleiter (Migration 20260824d) ──

describe('ReportsTab — ohne Unterschrift abschliessen', () => {
  it('bietet den Knopf am nicht abgenommenen Gesamtrapport an', () => {
    render(
      <ReportsTab
        reports={[makeReport({ id: 100, is_aggregate: true })]}
        onAccept={vi.fn(async () => {})}
      />,
    )
    expect(screen.getByRole('button', { name: 'Ohne Unterschrift abschliessen' })).toBeInTheDocument()
  })

  it('bietet ihn nicht mehr an, sobald unterschrieben oder schon abgeschlossen', () => {
    const { rerender } = render(
      <ReportsTab
        reports={[makeReport({
          id: 100, is_aggregate: true, signature_timestamp: '2026-08-08T10:00:00Z',
        })]}
        onAccept={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Ohne Unterschrift abschliessen' })).not.toBeInTheDocument()

    rerender(
      <ReportsTab
        reports={[makeReport({
          id: 100, is_aggregate: true, pl_accepted_at: '2026-08-20T09:00:00Z',
        })]}
        onAccept={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Ohne Unterschrift abschliessen' })).not.toBeInTheDocument()
  })

  it('nennt im Dialog, wie viele Einsätze verrechenbar werden', async () => {
    const user = userEvent.setup()
    render(
      <ReportsTab
        reports={[
          makeReport({ id: 100, is_aggregate: true }),
          makeReport({ id: 1, is_partial: true, merged_into_report_id: 100 }),
          makeReport({ id: 2, is_partial: true, merged_into_report_id: 100 }),
        ]}
        onAccept={vi.fn(async () => {})}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Ohne Unterschrift abschliessen' }))
    expect(screen.getByText(/2\s*Einsätze werden verrechenbar/)).toBeInTheDocument()
  })

  it('zeigt das eigene Badge für den abgeschlossenen Gesamtrapport', () => {
    expect(reportStatusBadge(makeReport({
      is_aggregate: true, pl_accepted_at: '2026-08-20T09:00:00Z',
    })).label).toBe('Gesamtrapport – ohne Unterschrift abgeschlossen')
  })
})

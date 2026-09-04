import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WikiBot, { dedupeSources } from './WikiBot'
import HelpBubble from './HelpBubble'

// Die API wird gemockt — geprüft wird, was der Monteur sieht, nicht das Netz.
const listWikiHandbooks = vi.fn()
const askWiki = vi.fn()
const identifyByPhoto = vi.fn()

vi.mock('../api/wiki', () => ({
  listWikiHandbooks: (...a: unknown[]) => listWikiHandbooks(...a),
  askWiki: (...a: unknown[]) => askWiki(...a),
  identifyByPhoto: (...a: unknown[]) => identifyByPhoto(...a),
}))

const HB = {
  id: 'hb-1', supplier_id: null, supplier_name: 'Viessmann',
  title: 'Vitodens 200 Montageanleitung', file_name: 'vitodens.pdf',
  size_bytes: 2_100_000, index_status: 'indexed' as const, chunk_count: 42,
  index_error: null, indexed_at: null, url: 'https://signed/vitodens.pdf',
}

async function* stream(events: unknown[]) {
  for (const e of events) yield e
}

beforeEach(() => {
  listWikiHandbooks.mockReset().mockResolvedValue([HB])
  askWiki.mockReset()
  identifyByPhoto.mockReset()
})

/** Eine Frage stellen und auf die Antwort warten. */
async function ask(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Frage zum Gerät stellen…'), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
}

describe('WikiBot — Handbuchliste', () => {
  it('zeigt Titel, Lieferant und einen Öffnen-Link auf das PDF', async () => {
    render(<WikiBot tenantName="Meier AG" />)
    fireEvent.click(await screen.findByRole('button', { name: /Handbücher/ }))

    expect(await screen.findByText('Vitodens 200 Montageanleitung')).toBeTruthy()
    expect(screen.getByText(/Viessmann/)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Öffnen' })
    expect(link.getAttribute('href')).toBe('https://signed/vitodens.pdf')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('sagt beim leeren Wiki, wo die Handbücher herkommen', async () => {
    listWikiHandbooks.mockResolvedValue([])
    render(<WikiBot />)
    fireEvent.click(await screen.findByRole('button', { name: /Handbücher/ }))
    expect(await screen.findByText(/noch keine Lieferantenhandbücher/i)).toBeTruthy()
  })

  it('markiert ein noch nicht eingelesenes Handbuch, ohne das Öffnen zu sperren', async () => {
    listWikiHandbooks.mockResolvedValue([{ ...HB, index_status: 'pending', chunk_count: 0 }])
    render(<WikiBot />)
    fireEvent.click(await screen.findByRole('button', { name: /Handbücher/ }))
    expect(await screen.findByText(/wird noch eingelesen/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Öffnen' })).toBeTruthy()
  })
})

describe('WikiBot — Fragen', () => {
  it('streamt die Antwort und verlinkt die Quelle aufs PDF', async () => {
    askWiki.mockImplementation(() => stream([
      { type: 'delta', text: '25 Nm.' },
      { type: 'sources', sources: [{ section: 'Anschluss', handbook_id: 'hb-1', label: 'Viessmann — Vitodens 200' }] },
      { type: 'done' },
    ]))
    render(<WikiBot />)
    // Auf das Laden der Handbücher warten — sonst fehlt die URL für die Quelle.
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText('Frage zum Gerät stellen…'), {
      target: { value: 'Drehmoment?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))

    expect(await screen.findByText('25 Nm.')).toBeTruthy()
    const source = await screen.findByRole('link', { name: 'Viessmann — Vitodens 200' })
    expect(source.getAttribute('href')).toBe('https://signed/vitodens.pdf')
  })

  it('zeigt einen Fehler statt einer leeren Blase, wenn der Stream scheitert', async () => {
    askWiki.mockImplementation(() => stream([{ type: 'error', message: 'Antwort fehlgeschlagen.' }]))
    render(<WikiBot />)
    fireEvent.change(screen.getByPlaceholderText('Frage zum Gerät stellen…'), {
      target: { value: 'Was nun?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByText('Antwort fehlgeschlagen.')).toBeTruthy()
  })
})

describe('dedupeSources', () => {
  it('führt mehrere Treffer im selben Handbuch zu einer Quelle zusammen', () => {
    const out = dedupeSources([
      { section: 'A', handbook_id: 'hb-1' },
      { section: 'B', handbook_id: 'hb-1' },
      { section: 'C', handbook_id: 'hb-2' },
    ])
    expect(out.map(s => s.handbook_id)).toEqual(['hb-1', 'hb-2'])
    // Der stärkste Treffer (zuerst geliefert) bleibt stehen.
    expect(out[0].section).toBe('A')
  })
})

describe('WikiBot — Gerät eingrenzen statt raten (Spec §13)', () => {
  const HB2 = { ...HB, id: 'hb-2', supplier_name: 'Hoval', title: 'UltraGas 2', url: 'https://signed/ultragas.pdf' }

  it('zeigt Chips statt einer Antwort, wenn das Gerät unklar ist', async () => {
    askWiki.mockImplementation(() => stream([
      {
        type: 'choice', message: 'Um welches Gerät geht es?',
        handbooks: [
          { handbook_id: 'hb-1', label: 'Viessmann — Vitodens 200' },
          { handbook_id: 'hb-2', label: 'Hoval — UltraGas 2' },
        ],
      },
      { type: 'done' },
    ]))
    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await ask('Welches Drehmoment?')

    expect(await screen.findByText('Um welches Gerät geht es?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Viessmann — Vitodens 200' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hoval — UltraGas 2' })).toBeTruthy()
  })

  it('beantwortet die offene Frage nach dem Antippen — ohne erneutes Tippen', async () => {
    askWiki
      .mockImplementationOnce(() => stream([
        { type: 'choice', message: 'Um welches Gerät geht es?', handbooks: [{ handbook_id: 'hb-1', label: 'Vitodens 200' }] },
        { type: 'done' },
      ]))
      .mockImplementationOnce(() => stream([{ type: 'delta', text: '25 Nm' }, { type: 'done' }]))

    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await ask('Welches Drehmoment?')
    fireEvent.click(await screen.findByRole('button', { name: 'Vitodens 200' }))

    expect(await screen.findByText('25 Nm')).toBeTruthy()
    // Die zweite Frage trug dieselbe Formulierung UND das gewählte Gerät.
    expect(askWiki).toHaveBeenLastCalledWith('Welches Drehmoment?', 'hb-1')
  })

  it('merkt sich das Gerät für Folgefragen und lässt es wechseln', async () => {
    askWiki.mockImplementation(() => stream([{ type: 'delta', text: 'ok' }, { type: 'done' }]))
    render(<WikiBot />)
    fireEvent.click(await screen.findByRole('button', { name: /Handbücher/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Dazu fragen' }))

    await ask('Und der Druck?')
    await waitFor(() => expect(askWiki).toHaveBeenLastCalledWith('Und der Druck?', 'hb-1'))
    expect(screen.getByText('Gerät:')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'wechseln' }))
    await ask('Und beim anderen?')
    await waitFor(() => expect(askWiki).toHaveBeenLastCalledWith('Und beim anderen?', null))
  })

  it('fragt ohne bekanntes Gerät ohne Filter', async () => {
    askWiki.mockImplementation(() => stream([{ type: 'delta', text: 'ok' }, { type: 'done' }]))
    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await ask('Drehmoment beim Vitodens?')
    await waitFor(() => expect(askWiki).toHaveBeenCalledWith('Drehmoment beim Vitodens?', null))
  })

  it('bietet «Dazu fragen» je Handbuch an', async () => {
    listWikiHandbooks.mockResolvedValue([HB, HB2])
    render(<WikiBot />)
    fireEvent.click(await screen.findByRole('button', { name: /Handbücher/ }))
    expect((await screen.findAllByRole('button', { name: 'Dazu fragen' })).length).toBe(2)
  })
})

describe('WikiBot — Typenschild fotografieren (Spec §14)', () => {
  const photo = () => new File([new Uint8Array([1, 2, 3])], 'schild.jpg', { type: 'image/jpeg' })

  const shoot = async () => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [photo()] } })
  }

  it('nimmt bei einem Treffer das Gerät direkt an', async () => {
    identifyByPhoto.mockResolvedValue({
      recognized: true, handbooks: [{ handbook_id: 'hb-1', label: 'Viessmann — Vitodens 200' }],
    })
    askWiki.mockImplementation(() => stream([{ type: 'delta', text: '25 Nm' }, { type: 'done' }]))
    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await shoot()

    expect(await screen.findByText('Gerät:')).toBeTruthy()
    await ask('Drehmoment?')
    await waitFor(() => expect(askWiki).toHaveBeenLastCalledWith('Drehmoment?', 'hb-1'))
  })

  it('legt bei mehreren Treffern zur Auswahl vor, statt zu entscheiden', async () => {
    identifyByPhoto.mockResolvedValue({
      recognized: true,
      handbooks: [
        { handbook_id: 'hb-1', label: 'Vitodens 200 Montage' },
        { handbook_id: 'hb-2', label: 'Vitodens 200 Bedienung' },
      ],
    })
    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await shoot()

    expect(await screen.findByText('Um welches dieser Geräte geht es?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Vitodens 200 Montage' })).toBeTruthy()
    // Nichts vorschnell festgelegt.
    expect(screen.queryByText('Gerät:')).toBeNull()
  })

  it('sagt es, wenn auf dem Foto nichts Passendes stand', async () => {
    identifyByPhoto.mockResolvedValue({ recognized: false, handbooks: [] })
    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await shoot()
    expect(await screen.findByText(/keine Typenbezeichnung zu erkennen/)).toBeTruthy()
  })

  it('meldet einen Fehler, statt still nichts zu tun', async () => {
    identifyByPhoto.mockRejectedValue(new Error('kaputt'))
    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await shoot()
    expect(await screen.findByText('Das Foto konnte nicht ausgewertet werden.')).toBeTruthy()
  })

  it('legt das Foto nirgends auf dem Gerät ab', async () => {
    identifyByPhoto.mockResolvedValue({
      recognized: true, handbooks: [{ handbook_id: 'hb-1', label: 'Vitodens 200' }],
    })
    render(<WikiBot />)
    await waitFor(() => expect(listWikiHandbooks).toHaveBeenCalled())
    await shoot()
    await screen.findByText('Gerät:')
    // Kein localStorage-Schlüssel trägt Bilddaten (Spec §14).
    const keys = Object.keys(localStorage)
    expect(keys.filter(k => /photo|foto|image|schild/i.test(k))).toEqual([])
  })
})

// ── Der dritte Reiter in der Blase ──────────────────────────────────────────

describe('HelpBubble — Wiki-Reiter', () => {
  const openPanel = () => {
    const fab = screen.getByRole('button', { expanded: false })
    fireEvent.pointerDown(fab, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(fab, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.click(fab)
  }

  it('heisst nach der Firma des Mandanten', () => {
    render(<HelpBubble showHelp showWiki tenantName="Meier AG" />)
    openPanel()
    expect(screen.getByRole('button', { name: 'Meier AG Wiki' })).toBeTruthy()
  })

  it('heisst schlicht «Wiki», wenn der Firmenname fehlt', () => {
    render(<HelpBubble showHelp showWiki />)
    openPanel()
    expect(screen.getByRole('button', { name: 'Wiki' })).toBeTruthy()
  })

  it('ist ohne die anderen Teile direkt das Wiki — ohne Reiterleiste', () => {
    render(<HelpBubble showHelp={false} showWiki tenantName="Meier AG" />)
    openPanel()
    expect(screen.queryByRole('button', { name: /^Fragen$/ })).toBeNull()
    expect(screen.getByPlaceholderText('Frage zum Gerät stellen…')).toBeTruthy()
  })

  it('erscheint nicht, wenn das Modul aus ist', () => {
    render(<HelpBubble showHelp showSupport />)
    openPanel()
    expect(screen.queryByRole('button', { name: /Wiki/ })).toBeNull()
  })

  it('zeigt alle drei Reiter, wenn alles gebucht ist — Hilfe zuerst', () => {
    render(<HelpBubble showHelp showWiki showSupport tenantName="Meier AG" />)
    openPanel()
    expect(screen.getByRole('button', { name: /^Fragen$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Meier AG Wiki' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Problem melden/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Meier AG Wiki' }))
    expect(screen.getByPlaceholderText('Frage zum Gerät stellen…')).toBeTruthy()
  })
})

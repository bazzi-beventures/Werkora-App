import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OfflineRapportScreen from './OfflineRapportScreen'
import { DB_NAME, pendingRapporte, saveRapport, type PendingRapport } from '../../api/rapportQueue'
import type { UserInfo } from '../../api/auth'
import * as catalog from '../../api/materialCatalog'

// Der Ersatzteil-Schritt fragt beim Öffnen die Artikel ab. In jsdom gibt es kein
// Backend — ohne diese Attrappe überspringt er sich selbst («nichts verfügbar»),
// und der Test unten prüfte eine Vorbelegung, die er nie zu sehen bekommt.
vi.mock('../../api/chat', () => ({
  fetchMaterialGalleryCount: vi.fn().mockResolvedValue(0),
  fetchFrequentMaterials: vi.fn().mockResolvedValue([]),
  fetchMaterialGallery: vi.fn().mockResolvedValue([]),
  signReport: vi.fn().mockResolvedValue(undefined),
}))

/**
 * Offline erfasster Rapport, docs/specs/offline-modus.md §4.5.
 *
 * Geprüft wird der Weg, der dem Feature seinen Sinn gibt: erfassen ohne Netz,
 * dem Kunden zeigen, unterschreiben lassen — und danach ist der Rapport
 * eingefroren. Die Kundenansicht trägt dabei **keine Preise**, und ein
 * Teilrapport bekommt gar kein Unterschriftsfeld.
 *
 * Die Materialschritte sind hier ausgeschaltet (Features aus): sie sind die
 * unveränderten Prompts des Chat-Abschlusses und in dessen Tests abgedeckt —
 * hier ginge es nur darum, sie ein zweites Mal zu prüfen.
 */

function resetDb(): Promise<void> {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

// jsdom bringt keinen 2D-Kontext mit — `getContext('2d')` liefert `null`, und
// das Unterschriftsfeld wirft beim ersten Render. Der Stub ist absichtlich
// minimal: gezeichnet wird hier nichts, geprüft wird nur, was mit der fertigen
// PNG passiert. `toDataURL` überschreibt jeder Test selbst.
function stubCanvas(): void {
  const ctx = {
    scale: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillRect: () => {},
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
  }
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA'
}

beforeEach(async () => {
  localStorage.clear()
  stubCanvas()
  await resetDb()
})

const PROJECT = { id: 'p-1', name: 'Baustelle Nord' }

function user(flags: Record<string, { enabled: boolean }> = {}): UserInfo {
  return {
    authorized_user_id: 'u-1',
    display_name: 'Mario',
    staff_name: 'Mario',
    role: 'worker',
    enabled_modules: ['ai', 'timekeeping'],
    feature_flags: { rapport_offline_formular: { enabled: true }, ...flags },
  } as unknown as UserInfo
}

function renderScreen(over: Partial<Parameters<typeof OfflineRapportScreen>[0]> = {}) {
  const onQueued = vi.fn()
  const onBack = vi.fn()
  render(
    <OfflineRapportScreen
      user={user()}
      project={PROJECT}
      tenantName="Muster AG"
      onBack={onBack}
      onQueued={onQueued}
      {...over}
    />,
  )
  return { onQueued, onBack }
}

/** Das Minimum, mit dem «Weiter» freigegeben wird. */
async function fillMinimum(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText('Stunden Zeile 1'), '8')
  await u.type(screen.getByLabelText(/Was habt ihr gemacht/), 'Storen montiert.')
}

describe('Formular', () => {
  it('sperrt «Weiter», bis Stunden und Beschrieb da sind', async () => {
    const u = userEvent.setup()
    renderScreen()

    const weiter = screen.getByRole('button', { name: /Weiter/ })
    expect(weiter).toBeDisabled()
    // Und sagt WARUM — nicht erst nach dem Antippen.
    expect(screen.getByText(/Trag mindestens eine Person/)).toBeInTheDocument()

    await u.type(screen.getByLabelText('Stunden Zeile 1'), '8')
    expect(screen.getByText(/Beschreib kurz/)).toBeInTheDocument()

    await u.type(screen.getByLabelText(/Was habt ihr gemacht/), 'Storen montiert.')
    expect(weiter).toBeEnabled()
  })

  it('belegt die erste Stundenzeile mit dem Monteur vor, aber nicht die Stunden', async () => {
    renderScreen()
    expect(screen.getByLabelText('Name Zeile 1')).toHaveValue('Mario')
    // Eine geratene Stundenzahl (etwa aus der Stempeldauer) wäre eine Zahl, die
    // der Kunde gleich unterschreibt.
    expect(screen.getByLabelText('Stunden Zeile 1')).toHaveValue(null)
  })

  it('nimmt weitere Personen auf', async () => {
    const u = userEvent.setup()
    renderScreen()
    await u.click(screen.getByRole('button', { name: '+ Person' }))
    expect(screen.getByLabelText('Name Zeile 2')).toBeInTheDocument()
  })

  it('merkt den Zwischenstand pro Projekt', async () => {
    const u = userEvent.setup()
    renderScreen()
    await u.type(screen.getByLabelText(/Was habt ihr gemacht/), 'Halbfertig')
    await waitFor(() => {
      expect(localStorage.getItem('offline-rapport-entwurf:u-1:p-1')).toContain('Halbfertig')
    })
  })
})

describe('Kundenansicht', () => {
  async function bisZurKundenansicht() {
    const u = userEvent.setup()
    const handles = renderScreen()
    await fillMinimum(u)
    await u.click(screen.getByRole('button', { name: /Weiter/ }))
    return { u, ...handles }
  }

  it('zeigt Stunden und Total, aber keine Preise', async () => {
    await bisZurKundenansicht()

    expect(screen.getByText('Stunden')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getAllByText('8 h').length).toBeGreaterThan(0)
    // Der verrechnete Preis entsteht erst serverseitig — eine hier gezeigte Zahl
    // wäre eine Zusage, die das Büro später nicht einlösen muss.
    expect(screen.queryByText(/CHF/)).not.toBeInTheDocument()
  })

  it('nennt Firma, Projekt und Datum', async () => {
    await bisZurKundenansicht()
    expect(screen.getByText('Muster AG')).toBeInTheDocument()
    expect(screen.getByText('Baustelle Nord')).toBeInTheDocument()
  })

  it('legt den Rapport MIT Unterschrift in die Queue', async () => {
    const { u } = await bisZurKundenansicht()

    // Das Unterschriftsfeld ist ein Canvas; in jsdom wird nicht gezeichnet.
    // Geprüft wird deshalb der Weg dahinter: was passiert, wenn das Pad seine
    // PNG nach oben gibt.
    const canvas = document.querySelector('canvas')!
    await u.pointer([{ target: canvas, coords: { x: 5, y: 5 }, keys: '[MouseLeft>]' },
                      { target: canvas, coords: { x: 20, y: 20 } },
                      { keys: '[/MouseLeft]' }])
    await u.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const rows = await pendingRapporte('u-1')
      expect(rows).toHaveLength(1)
      expect(rows[0].signature).toBe('data:image/png;base64,AAA')
      expect(rows[0].signedAt).toBeTruthy()
      expect(rows[0].staff[0]).toMatchObject({ name: 'Mario', hours: 8 })
    })
  })

  it('legt ihn auch OHNE Unterschrift ab, wenn der Kunde nicht da ist', async () => {
    const { u, onQueued } = await bisZurKundenansicht()

    await u.click(screen.getByRole('button', { name: /Kunde ist nicht da/ }))

    await waitFor(async () => {
      const rows = await pendingRapporte('u-1')
      expect(rows).toHaveLength(1)
      expect(rows[0].signature).toBeNull()
    })
    expect(onQueued).toHaveBeenCalled()
  })

  it('friert den Rapport nach der Unterschrift ein', async () => {
    const { u } = await bisZurKundenansicht()
    const canvas = document.querySelector('canvas')!
    await u.pointer([{ target: canvas, coords: { x: 5, y: 5 }, keys: '[MouseLeft>]' },
                      { target: canvas, coords: { x: 20, y: 20 } },
                      { keys: '[/MouseLeft]' }])
    await u.click(screen.getByRole('button', { name: 'Speichern' }))

    // Der Kunde hat unterschrieben, was er gesehen hat: zurück ins Formular geht
    // nur über das ausdrückliche Verwerfen.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Unterschrift verwerfen/ })).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Stunden Zeile 1')).not.toBeInTheDocument()
  })
})

describe('Teilrapport', () => {
  it('bekommt kein Unterschriftsfeld', async () => {
    // Ein Teilrapport wird nie einzeln unterschrieben — die eine Unterschrift
    // kommt am Ende auf den Gesamtrapport. Eines anzubieten hiesse, dem Kunden
    // eine Abnahme vorzulegen, die der Server anschliessend ablehnt.
    const u = userEvent.setup()
    render(
      <OfflineRapportScreen
        user={user({ teilrapport: { enabled: true } })}
        project={PROJECT}
        tenantName="Muster AG"
        onBack={vi.fn()}
        onQueued={vi.fn()}
      />,
    )
    await fillMinimum(u)
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: /Weiter/ }))

    expect(screen.getByText(/der Kunde unterschreibt am Ende der Baustelle/i)).toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()

    await u.click(screen.getByRole('button', { name: 'Teilrapport merken' }))
    await waitFor(async () => {
      const rows = await pendingRapporte('u-1')
      expect(rows[0].isPartial).toBe(true)
      expect(rows[0].signature).toBeNull()
    })
  })
})


describe('Material bleibt beim zweiten Durchgang stehen', () => {
  it('gibt die schon gewählten Teile an den Ersatzteil-Schritt zurück', async () => {
    // Ohne Vorbelegung löschte der zweite Weg durch den Schritt die erste Wahl
    // still weg — der Monteur geht zwischen Formular und Material hin und her.
    vi.spyOn(catalog, 'loadFrequentMaterials').mockResolvedValue({
      items: [{ id: 'f-1', art_nr: 'A-1', name: 'Motor', unit: 'Stk', calc_vk: 120 }],
      offline: false, savedAt: '',
    })
    const u = userEvent.setup()
    render(
      <OfflineRapportScreen
        user={user({ ersatzteil_prompt: { enabled: true } })}
        project={PROJECT}
        tenantName="Muster AG"
        onBack={vi.fn()}
        onQueued={vi.fn()}
        resume={{
          clientId: 'c-1', userId: 'u-1', projectId: 'p-1', projectName: 'Baustelle Nord',
          date: '07.09.2026', recordedAt: '2026-09-07T12:00:00.000Z',
          staff: [{ name: 'Mario', hours: 8 }], description: 'Storen montiert.',
          workTypes: [], einbauort: '',
          materials: [{ art_nr: 'A-1', name: 'Motor', unit: 'Stk', amount: 3 }],
          kleinmaterial: null, isPartial: false, signature: null, signedAt: null,
          attempts: 0, lastError: null,
        }}
      />,
    )
    // Das Formular zeigt die Materialzeile des wartenden Rapports.
    expect(screen.getByText('Motor')).toBeInTheDocument()
    expect(screen.getByText('3 Stk')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: /Weiter/ }))
    // Und der Ersatzteil-Schritt kennt sie ebenfalls (Menge 3 vorgewählt).
    await waitFor(() => expect(screen.getByText(/Ersatzteile verbraucht/)).toBeInTheDocument())
    expect(screen.getByRole('checkbox', { checked: true })).toBeInTheDocument()
  })
})

describe('Wartenden Rapport bearbeiten', () => {
  function abgelehnt(over: Partial<PendingRapport> = {}): PendingRapport {
    return {
      clientId: 'c-1', userId: 'u-1', projectId: 'p-1', projectName: 'Baustelle Nord',
      date: '07.09.2026', recordedAt: '2026-09-07T12:00:00.000Z',
      staff: [{ name: 'Mario', hours: 8 }], description: 'Storen montiert.',
      workTypes: [], einbauort: '', materials: [], kleinmaterial: null,
      isPartial: false, signature: null, signedAt: null,
      attempts: 3, lastError: 'Stunden ungültig.', ...over,
    }
  }

  it('behält die clientId und setzt Fehler und Versuche zurück', async () => {
    // Dieselbe id: ging der erste Upload doch durch und nur seine Antwort
    // verloren, erkennt der Server das Duplikat — statt einen zweiten Rapport
    // mit korrigierten Zahlen daneben zu legen.
    await saveRapport(abgelehnt())
    const u = userEvent.setup()
    render(
      <OfflineRapportScreen
        user={user()} project={PROJECT} tenantName="Muster AG"
        onBack={vi.fn()} onQueued={vi.fn()} resume={abgelehnt()}
      />,
    )
    // Der Fehler steht im Formular, nicht nur in der Karte.
    expect(screen.getByText('Stunden ungültig.')).toBeInTheDocument()

    await u.clear(screen.getByLabelText('Stunden Zeile 1'))
    await u.type(screen.getByLabelText('Stunden Zeile 1'), '9')
    await u.click(screen.getByRole('button', { name: /Weiter/ }))
    await u.click(screen.getByRole('button', { name: /Kunde ist nicht da/ }))

    await waitFor(async () => {
      const rows = await pendingRapporte('u-1')
      expect(rows).toHaveLength(1)
      expect(rows[0].clientId).toBe('c-1')
      expect(rows[0].staff[0].hours).toBe(9)
      // Wieder zustellbar: der Drain überspringt sonst jeden Eintrag mit
      // `lastError` und jeden am Versuchs-Deckel.
      expect(rows[0].lastError).toBeNull()
      expect(rows[0].attempts).toBe(0)
    })
  })

  it('übernimmt die alte Unterschrift NICHT', async () => {
    // Wer korrigiert, ändert die Zahlen, unter denen unterschrieben wurde.
    render(
      <OfflineRapportScreen
        user={user()} project={PROJECT} tenantName="Muster AG"
        onBack={vi.fn()} onQueued={vi.fn()}
        resume={abgelehnt({ signature: 'data:image/png;base64,ALT', signedAt: '2026-09-07T14:00:00.000Z' })}
      />,
    )
    // Kein eingefrorener Zustand: das Formular ist bedienbar.
    expect(screen.getByLabelText('Stunden Zeile 1')).toBeEnabled()
  })
})

describe('Unterschrift verwerfen', () => {
  it('nimmt den Queue-Eintrag mit', async () => {
    // Sonst ginge beim nächsten Drain die Unterschrift unter den ALTEN Zahlen
    // hoch — der React-State zurückzusetzen genügt nicht.
    const u = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderScreen()
    await fillMinimum(u)
    await u.click(screen.getByRole('button', { name: /Weiter/ }))
    const canvas = document.querySelector('canvas')!
    await u.pointer([{ target: canvas, coords: { x: 5, y: 5 }, keys: '[MouseLeft>]' },
                      { target: canvas, coords: { x: 20, y: 20 } },
                      { keys: '[/MouseLeft]' }])
    await u.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect(await pendingRapporte('u-1')).toHaveLength(1))

    await u.click(await screen.findByRole('button', { name: /Unterschrift verwerfen/ }))

    await waitFor(async () => expect(await pendingRapporte('u-1')).toHaveLength(0))
    expect(screen.getByLabelText('Stunden Zeile 1')).toBeInTheDocument()
  })
})


describe('Leistungsart', () => {
  it('belegt die Chips aus dem Projekt vor — wie der Chat', async () => {
    // Ohne Vorbelegung könnte der Server ein leeres [] nicht von «nichts gesagt»
    // unterscheiden; mit ihr heisst [] «alles abgewählt».
    render(
      <OfflineRapportScreen
        user={user()} project={{ ...PROJECT, workTypes: ['Wartung'] }} tenantName="Muster AG"
        onBack={vi.fn()} onQueued={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Service/Wartung', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neumontage', pressed: false })).toBeInTheDocument()
  })
})


describe('Verwerfen im Bearbeiten-Modus', () => {
  it('rettet die Arbeit in den Entwurf, bevor der Queue-Eintrag fällt', async () => {
    // Der teuerste Fall: der Eintrag wird gelöscht, ein Entwurf existiert im
    // Bearbeiten-Modus nicht — wer danach zurückgeht, hat Stunden, Material und
    // Beschrieb verloren.
    const u = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const resume: PendingRapport = {
      clientId: 'c-1', userId: 'u-1', projectId: 'p-1', projectName: 'Baustelle Nord',
      date: '07.09.2026', recordedAt: '2026-09-07T12:00:00.000Z',
      staff: [{ name: 'Mario', hours: 8 }], description: 'Storen montiert.',
      workTypes: [], einbauort: '', materials: [], kleinmaterial: null,
      isPartial: false, signature: 'data:image/png;base64,ALT',
      signedAt: '2026-09-07T14:00:00.000Z', attempts: 0, lastError: 'Stunden ungültig.',
    }
    await saveRapport(resume)
    render(
      <OfflineRapportScreen
        user={user()} project={PROJECT} tenantName="Muster AG"
        onBack={vi.fn()} onQueued={vi.fn()} resume={resume}
      />,
    )

    // Erneut unterschreiben, damit der Verwerfen-Weg erreichbar ist.
    await u.click(screen.getByRole('button', { name: /Weiter/ }))
    const canvas = document.querySelector('canvas')!
    await u.pointer([{ target: canvas, coords: { x: 5, y: 5 }, keys: '[MouseLeft>]' },
                      { target: canvas, coords: { x: 20, y: 20 } },
                      { keys: '[/MouseLeft]' }])
    await u.click(screen.getByRole('button', { name: 'Speichern' }))
    await u.click(await screen.findByRole('button', { name: /Unterschrift verwerfen/ }))

    await waitFor(async () => expect(await pendingRapporte('u-1')).toHaveLength(0))
    // Und die Arbeit liegt im Entwurf.
    const entwurf = localStorage.getItem('offline-rapport-entwurf:u-1:p-1')
    expect(entwurf).toContain('Storen montiert.')
  })
})

describe('Leistungsart über den Chat-Ausweg', () => {
  it('schickt keine leere Auswahl, wenn die Vorbelegung mitkam', async () => {
    // `[]` liest der Server als «alles abgewählt» und übergeht damit die
    // Vorbelegung des Projekts.
    const u = userEvent.setup()
    render(
      <OfflineRapportScreen
        user={user()} project={{ ...PROJECT, workTypes: ['Reparatur'] }} tenantName="Muster AG"
        onBack={vi.fn()} onQueued={vi.fn()}
      />,
    )
    await fillMinimum(u)
    await u.click(screen.getByRole('button', { name: /Weiter/ }))
    await u.click(screen.getByRole('button', { name: /Kunde ist nicht da/ }))

    await waitFor(async () => {
      const rows = await pendingRapporte('u-1')
      expect(rows[0].workTypes).toEqual(['Reparatur'])
    })
  })
})

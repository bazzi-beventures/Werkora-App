import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError } from './client'
import {
  DB_NAME, MAX_DRAIN_ATTEMPTS,
  drainRapportQueue, getRapport, newClientId, pendingForProject, pendingRapporte,
  removeRapport, retryRapport, saveRapport, verdictFor,
  type PendingRapport,
} from './rapportQueue'

// Warteschlange der offline erfassten Rapporte, docs/specs/offline-modus.md §4.5.5.
//
// Der Unterschied zum Foto-Puffer nebenan ist der Einsatz: ein Foto lässt sich neu
// aufnehmen, ein Rapport sind Stunden auf der Baustelle plus die Unterschrift des
// Kunden. Die Regeln hier sind deshalb noch konservativer — ein Rapport wird NIE
// weggeworfen, auch nicht bei einer klaren Ablehnung des Servers.

function resetDb(): Promise<void> {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(resetDb)

function entry(over: Partial<PendingRapport> = {}): PendingRapport {
  return {
    clientId: 'c-1',
    userId: 'u-1',
    projectId: 'p-1',
    projectName: 'Baustelle Nord',
    date: '07.09.2026',
    recordedAt: '2026-09-07T12:00:00.000Z',
    staff: [{ name: 'Mario', hours: 8 }],
    description: 'Storen montiert.',
    workTypes: ['Neumontage'],
    einbauort: '',
    materials: [{ art_nr: 'A-1', name: 'Motor', unit: 'Stk', amount: 2 }],
    kleinmaterial: null,
    isPartial: false,
    signature: null,
    signedAt: null,
    attempts: 0,
    lastError: null,
    ...over,
  }
}

describe('verdictFor', () => {
  it('lässt einen Rapport bei fehlendem Netz liegen', () => {
    expect(verdictFor(new ApiError(0, 'offline'))).toBe('retry')
  })

  it('hält bei abgelaufener Sitzung an, statt Versuche zu verbrennen', () => {
    // Nicht der Rapport ist kaputt, sondern die Anmeldung.
    expect(verdictFor(new ApiError(401, 'unauthorized'))).toBe('abort')
    expect(verdictFor(new ApiError(403, 'feature_disabled'))).toBe('abort')
    expect(verdictFor(new ApiError(429, 'rate_limited'))).toBe('abort')
  })

  it('versucht Serverfehler später erneut', () => {
    expect(verdictFor(new ApiError(503, 'unavailable'))).toBe('retry')
  })

  it('wirft einen abgelehnten Rapport NICHT weg, sondern hält ihn fest', () => {
    // Der entscheidende Unterschied zum Foto-Puffer: dort heisst 4xx «dieses Foto
    // kommt nie durch, weg damit». Hier heisst es «der Server nimmt ihn SO nicht
    // an» — und die Antwort darauf ist der Monteur, nicht der Papierkorb.
    expect(verdictFor(new ApiError(422, 'Stunden ungültig'))).toBe('hold')
    expect(verdictFor(new ApiError(404, 'Projekt nicht gefunden.'))).toBe('hold')
  })
})

describe('newClientId', () => {
  it('vergibt verschiedene Schlüssel', () => {
    expect(newClientId()).not.toBe(newClientId())
  })
})

describe('Ablage', () => {
  it('legt einen Rapport ab und liest ihn zurück', async () => {
    expect(await saveRapport(entry())).toBe(true)
    const rows = await pendingRapporte('u-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Storen montiert.')
  })

  it('kennt denselben Rapport nur einmal — der Schlüssel ist die clientId', async () => {
    // Zweimal «Rapport merken» (etwa nach einem Zurück) darf keine zwei Einträge
    // ergeben; der Server erkennt zwar auch das Duplikat, aber die Karte im
    // Projekt-Detail zeigte sonst zwei wartende Rapporte, wo einer ist.
    await saveRapport(entry())
    await saveRapport(entry({ description: 'Storen montiert und eingestellt.' }))
    const rows = await pendingRapporte('u-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Storen montiert und eingestellt.')
  })

  it('trennt nach Mitarbeiter — geteiltes Werkhof-Tablet', async () => {
    await saveRapport(entry({ clientId: 'c-1', userId: 'u-1' }))
    await saveRapport(entry({ clientId: 'c-2', userId: 'u-2' }))
    expect(await pendingRapporte('u-1')).toHaveLength(1)
    expect(await pendingRapporte('u-2')).toHaveLength(1)
  })

  it('filtert nach Projekt für die Karte im Detail', async () => {
    await saveRapport(entry({ clientId: 'c-1', projectId: 'p-1' }))
    await saveRapport(entry({ clientId: 'c-2', projectId: 'p-2' }))
    const rows = await pendingForProject('u-1', 'p-2')
    expect(rows.map(r => r.clientId)).toEqual(['c-2'])
  })

  it('gibt den ältesten Rapport zuerst zurück', async () => {
    await saveRapport(entry({ clientId: 'c-neu', recordedAt: '2026-09-07T16:00:00.000Z' }))
    await saveRapport(entry({ clientId: 'c-alt', recordedAt: '2026-09-07T08:00:00.000Z' }))
    expect((await pendingRapporte('u-1')).map(r => r.clientId)).toEqual(['c-alt', 'c-neu'])
  })

  it('entfernt einen Rapport', async () => {
    await saveRapport(entry())
    await removeRapport('c-1')
    expect(await getRapport('c-1')).toBeNull()
  })
})

describe('drainRapportQueue', () => {
  it('lädt hoch und räumt ab', async () => {
    await saveRapport(entry())
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: true })

    const res = await drainRapportQueue('u-1', upload)

    expect(upload).toHaveBeenCalledOnce()
    expect(res.uploaded.map(r => r.clientId)).toEqual(['c-1'])
    expect(res.remaining).toBe(0)
    expect(await pendingRapporte('u-1')).toHaveLength(0)
  })

  it('behandelt ein Duplikat wie einen Erfolg', async () => {
    // Der Upload ging beim ersten Mal durch, die Antwort ging im Funkloch
    // verloren. Der Rapport IST auf dem Server — ihn weiter in der Queue zu
    // halten hiesse, dem Monteur eine Arbeit anzuzeigen, die längst erledigt ist.
    await saveRapport(entry())
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: true, signed: false })

    const res = await drainRapportQueue('u-1', upload)

    expect(res.uploaded).toHaveLength(1)
    expect(await pendingRapporte('u-1')).toHaveLength(0)
  })

  it('hält einen abgelehnten Rapport mit Fehlertext fest', async () => {
    await saveRapport(entry())
    const upload = vi.fn().mockRejectedValue(new ApiError(422, 'Stunden ungültig.'))

    const res = await drainRapportQueue('u-1', upload)

    expect(res.held).toHaveLength(1)
    const rows = await pendingRapporte('u-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].lastError).toBe('Stunden ungültig.')
  })

  it('versucht einen abgelehnten Rapport nicht von selbst erneut', async () => {
    // Derselbe Body ergibt dieselbe Ablehnung. Er wartet auf den Monteur.
    await saveRapport(entry({ lastError: 'Projekt nicht gefunden.' }))
    const upload = vi.fn()

    const res = await drainRapportQueue('u-1', upload)

    expect(upload).not.toHaveBeenCalled()
    expect(res.held).toHaveLength(1)
  })

  it('zählt Netz-Fehlversuche und hält an', async () => {
    await saveRapport(entry({ clientId: 'c-1', recordedAt: '2026-09-07T08:00:00.000Z' }))
    await saveRapport(entry({ clientId: 'c-2', recordedAt: '2026-09-07T09:00:00.000Z' }))
    const upload = vi.fn().mockRejectedValue(new ApiError(0, 'offline'))

    await drainRapportQueue('u-1', upload)

    // Nur EIN Versuch: geht der erste nicht durch, geht der zweite auch nicht.
    expect(upload).toHaveBeenCalledOnce()
    const rows = await pendingRapporte('u-1')
    expect(rows.find(r => r.clientId === 'c-1')!.attempts).toBe(1)
    expect(rows.find(r => r.clientId === 'c-2')!.attempts).toBe(0)
  })

  it('zählt eine abgelaufene Sitzung NICHT gegen den Deckel', async () => {
    await saveRapport(entry())
    const upload = vi.fn().mockRejectedValue(new ApiError(401, 'unauthorized'))

    await drainRapportQueue('u-1', upload)

    expect((await pendingRapporte('u-1'))[0].attempts).toBe(0)
  })

  it('gibt nach dem Versuchs-Deckel auf, wirft aber nichts weg', async () => {
    // Ein Rapport, der nicht durchgeht, darf nie stumm verschwinden: die Karte im
    // Projekt-Detail zeigt ihn weiter und bittet, ihn dem Büro zu melden.
    await saveRapport(entry({ attempts: MAX_DRAIN_ATTEMPTS }))
    const upload = vi.fn()

    const res = await drainRapportQueue('u-1', upload)

    expect(upload).not.toHaveBeenCalled()
    expect(res.remaining).toBe(1)
    expect(await pendingRapporte('u-1')).toHaveLength(1)
  })

  it('macht nach einer Ablehnung mit dem nächsten Rapport weiter', async () => {
    // Die Ablehnung betrifft diesen Rapport, nicht die Leitung.
    await saveRapport(entry({ clientId: 'c-1', recordedAt: '2026-09-07T08:00:00.000Z' }))
    await saveRapport(entry({ clientId: 'c-2', recordedAt: '2026-09-07T09:00:00.000Z' }))
    const upload = vi.fn()
      .mockRejectedValueOnce(new ApiError(422, 'Stunden ungültig.'))
      .mockResolvedValueOnce({ report_id: 43, duplicate: false, signed: false })

    const res = await drainRapportQueue('u-1', upload)

    expect(upload).toHaveBeenCalledTimes(2)
    expect(res.uploaded.map(r => r.clientId)).toEqual(['c-2'])
    expect(res.held.map(r => r.clientId)).toEqual(['c-1'])
  })

  it('lädt nur die Rapporte dieses Mitarbeiters hoch', async () => {
    await saveRapport(entry({ clientId: 'c-1', userId: 'u-1' }))
    await saveRapport(entry({ clientId: 'c-2', userId: 'u-2' }))
    const upload = vi.fn().mockResolvedValue({ report_id: 1, duplicate: false, signed: false })

    await drainRapportQueue('u-1', upload)

    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0][0].clientId).toBe('c-1')
    // Der Rapport des Kollegen bleibt liegen — er gehört nicht in DIESE Sitzung.
    expect(await pendingRapporte('u-2')).toHaveLength(1)
  })

  it('schickt die Unterschrift und ihren Zeitpunkt mit', async () => {
    await saveRapport(entry({
      signature: 'data:image/png;base64,AAA',
      signedAt: '2026-09-07T14:00:00.000Z',
    }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: true })

    await drainRapportQueue('u-1', upload)

    const sent = upload.mock.calls[0][0] as PendingRapport
    expect(sent.signature).toBe('data:image/png;base64,AAA')
    // Der Zeitpunkt der Baustelle, nicht der des Uploads: auf dem Beleg muss
    // stehen, wann der Kunde unterschrieben hat.
    expect(sent.signedAt).toBe('2026-09-07T14:00:00.000Z')
  })
})


describe('Wege aus der Sackgasse', () => {
  it('ein bearbeiteter Rapport wird wieder versucht', async () => {
    // Der Kern: ein einmal abgelehnter Rapport wird vom Drain nicht von selbst
    // erneut versucht. Ohne das Zurückschreiben aus dem Formular (dieselbe
    // clientId, `lastError` und `attempts` zurückgesetzt) wären Stunden und
    // Unterschrift dauerhaft unzustellbar.
    await saveRapport(entry({ lastError: 'Stunden ungültig.', attempts: 3 }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: false })

    // Was das Formular beim Speichern tut:
    await saveRapport(entry({ staff: [{ name: 'Mario', hours: 8 }] }))

    const res = await drainRapportQueue('u-1', upload)
    expect(upload).toHaveBeenCalledOnce()
    expect(res.uploaded).toHaveLength(1)
    expect(await pendingRapporte('u-1')).toHaveLength(0)
  })

  it('meldet eine vom Server verworfene Unterschrift, statt sie zu verschlucken', async () => {
    // Der Rapport ist gespeichert (der Eintrag verschwindet zu Recht), aber die
    // Abnahme fehlt. Eine Kundenunterschrift, die niemand vermisst, fällt erst
    // bei der Rechnung auf.
    await saveRapport(entry({ signature: 'data:image/png;base64,AAA', signedAt: '2026-09-07T14:00:00.000Z' }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: false })

    const res = await drainRapportQueue('u-1', upload)

    expect(res.uploaded).toHaveLength(1)
    expect(res.signatureLost.map(r => r.clientId)).toEqual(['c-1'])
  })

  it('meldet nichts, wenn die Unterschrift angekommen ist', async () => {
    await saveRapport(entry({ signature: 'data:image/png;base64,AAA', signedAt: '2026-09-07T14:00:00.000Z' }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: true })
    expect((await drainRapportQueue('u-1', upload)).signatureLost).toEqual([])
  })

  it('meldet beim Duplikat nichts — die Unterschrift hing am ersten Versuch', async () => {
    await saveRapport(entry({ signature: 'data:image/png;base64,AAA', signedAt: '2026-09-07T14:00:00.000Z' }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: true, signed: false })
    expect((await drainRapportQueue('u-1', upload)).signatureLost).toEqual([])
  })
})

describe('newClientId ist eine UUID', () => {
  it('auch ohne crypto.randomUUID', () => {
    // `reports.client_id` ist serverseitig `uuid`. Ein anderer String scheitert
    // am Cast in der RPC — der Rapport liefe in eine Schleife aus 503 und
    // Wiederholung, bis der Versuchs-Deckel greift.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(newClientId()).toMatch(uuid)

    const echt = crypto.randomUUID
    try {
      // @ts-expect-error — absichtlich entfernt, um den Rückfallweg zu prüfen
      crypto.randomUUID = undefined
      expect(newClientId()).toMatch(uuid)
    } finally {
      crypto.randomUUID = echt
    }
  })
})


describe('retryRapport — «Jetzt senden»', () => {
  it('lädt auch einen abgelehnten Rapport hoch', async () => {
    // Der automatische Drain fasst ihn nicht an (derselbe Body ergäbe dieselbe
    // Ablehnung). Der Monteur darf es trotzdem erzwingen — er steht im Werkhof
    // und weiss mehr über die Lage als die Heuristik.
    await saveRapport(entry({ lastError: 'Projekt nicht gefunden.', attempts: 4 }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: false })

    const res = await retryRapport('c-1', upload)

    expect(res.ok).toBe(true)
    expect(upload).toHaveBeenCalledOnce()
    expect(await pendingRapporte('u-1')).toHaveLength(0)
  })

  it('lädt auch am Versuchs-Deckel noch hoch', async () => {
    await saveRapport(entry({ attempts: MAX_DRAIN_ATTEMPTS + 5 }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: false })
    expect((await retryRapport('c-1', upload)).ok).toBe(true)
  })

  it('meldet eine verworfene Unterschrift', async () => {
    await saveRapport(entry({ signature: 'data:image/png;base64,AAA', signedAt: '2026-09-07T14:00:00.000Z' }))
    const upload = vi.fn().mockResolvedValue({ report_id: 42, duplicate: false, signed: false })
    expect((await retryRapport('c-1', upload)).signatureLost).toBe(true)
  })

  it('schreibt die Ablehnung zurück in den Eintrag', async () => {
    await saveRapport(entry())
    const upload = vi.fn().mockRejectedValue(new ApiError(422, 'Stunden ungültig.'))

    const res = await retryRapport('c-1', upload)

    expect(res.ok).toBe(false)
    expect(res.error).toBe('Stunden ungültig.')
    const rows = await pendingRapporte('u-1')
    expect(rows[0].lastError).toBe('Stunden ungültig.')
  })

  it('macht aus einem Netzfehler KEINE Ablehnung', async () => {
    // Sonst schöbe ein einziger Fehlversuch den Eintrag in den Zustand «wartet
    // auf Bearbeitung», aus dem der automatische Drain ihn nicht mehr anfasst —
    // und der Rapport bliebe liegen, bis jemand von Hand nachhilft.
    await saveRapport(entry())
    const upload = vi.fn().mockRejectedValue(new ApiError(0, 'offline'))

    const res = await retryRapport('c-1', upload)

    expect(res.ok).toBe(false)
    const rows = await pendingRapporte('u-1')
    expect(rows[0].lastError).toBeNull()
    expect(rows[0].attempts).toBe(1)
  })

  it('zählt eine abgelaufene Sitzung nicht gegen den Deckel', async () => {
    await saveRapport(entry())
    const upload = vi.fn().mockRejectedValue(new ApiError(401, 'unauthorized'))
    await retryRapport('c-1', upload)
    expect((await pendingRapporte('u-1'))[0].attempts).toBe(0)
  })

  it('sagt es, wenn der Eintrag gar nicht mehr da ist', async () => {
    const res = await retryRapport('gibt-es-nicht', vi.fn())
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })
})

/**
 * Warteschlange für offline erfasste Rapporte —
 * [docs/specs/offline-modus.md](../../../docs/specs/offline-modus.md) §4.5.5.
 *
 * Der Monteur füllt auf der Baustelle ohne Empfang das Formular, zeigt dem
 * Kunden die Übersicht, lässt ihn dort unterschreiben — und der fertige Rapport
 * liegt hier, bis die Verbindung zurück ist.
 *
 * **IndexedDB, nicht localStorage:** ein Rapport allein wäre klein genug, seine
 * Unterschrift ist es nicht (ein PNG-Data-URI sind 10–30 KB, und es können
 * mehrere Rapporte warten). Vor allem aber teilt sich localStorage sein 5-MB-
 * Budget mit Entwurf, Lesepaket und Stempel-Queue: ein vollgelaufener Speicher
 * dürfte nie ein Ereignis sein, das einen fertigen, unterschriebenen Rapport
 * kostet.
 *
 * **Schlüssel ist die `clientId`**, nicht eine laufende Nummer. Derselbe Rapport
 * lässt sich damit schon lokal nicht zweimal einreihen, und dieselbe id geht bei
 * jedem Versuch mit — der Server erkennt daran den wiederholten Upload und legt
 * keinen zweiten Rapport an (`reports.client_id`, Migration 20260907).
 *
 * **Kein Löschen beim Logout.** Anders als Lesepaket und API-Cache: das hier ist
 * unversandte Arbeit, dieselbe Regel wie bei Stempel-Queue und Foto-Puffer. Der
 * Eintrag ist nach `userId` geschlüsselt, damit auf dem geteilten Werkhof-Tablet
 * der nächste Monteur weder den Rapport sieht noch ihn hochlädt.
 */
import { ApiError, apiFetch, isNetworkError } from './client'
import { createIdbStore, ENV_SUFFIX } from './idb'

export const DB_NAME = `werkora-rapporte${ENV_SUFFIX}`
export const STORE = 'pending'

/**
 * Nach so vielen erfolglosen Anläufen gilt ein Rapport als nicht zustellbar und
 * wird dem Monteur gemeldet (statt still weiterzuwandern).
 *
 * Doppelt so hoch wie beim Foto-Puffer (5): ein Foto ist eine Sekunde Arbeit und
 * lässt sich im Zweifel neu aufnehmen, ein Rapport sind Stunden auf der
 * Baustelle plus die Unterschrift des Kunden — beim Aufgeben ist mehr verloren,
 * also wird länger versucht. Ein Deckel muss es trotzdem geben: ohne ihn wächst
 * die Queue bei einem CORS-/Origin-Problem ewig, und niemand merkt es.
 */
export const MAX_DRAIN_ATTEMPTS = 10

/** Stundenzeile des Formulars. */
export interface RapportStaffLine {
  name: string
  hours: number | null
}

/** Materialposition (Ersatzteil aus Liste oder Katalog). */
export interface RapportMaterialLine {
  art_nr: string
  name: string
  unit: string
  amount: number
}

/** Klein-/Schmiermaterial als Pauschale. */
export interface RapportKleinmaterial {
  amount_chf: number | null
  count: number
  scope: string
}

export interface PendingRapport {
  /** Idempotenz-Schlüssel, beim ersten «Rapport merken» vergeben. Zugleich der
   *  Primärschlüssel des Stores. */
  clientId: string
  /** Wem der Rapport gehört (geteiltes Werkhof-Tablet). */
  userId: string
  projectId: string
  /** Anzeige-Schnappschuss für die Karte im Projekt-Detail und die
   *  Kundenansicht — der Server nimmt das Projekt über die id, nicht über den
   *  Namen. */
  projectName: string
  /** Rapport-Datum im Format DD.MM.YYYY (dasselbe wie im Chat-Pfad). */
  date: string
  /** Zeitpunkt der Erfassung auf der Baustelle (ISO). Der Server prüft ihn auf
   *  Plausibilität; er ist NICHT der Upload-Zeitpunkt. */
  recordedAt: string
  staff: RapportStaffLine[]
  description: string
  workTypes: string[]
  einbauort: string
  materials: RapportMaterialLine[]
  kleinmaterial: RapportKleinmaterial | null
  isPartial: boolean
  /** Unterschrift des Kunden als PNG-Data-URI. Fehlt sie, geht der Rapport als
   *  pendent hoch und wird später im Projekt-Detail nachsigniert. */
  signature: string | null
  /** Zeitpunkt der Unterschrift (ISO) — der von der Baustelle, nicht der des
   *  Uploads. Er landet als `signature_timestamp` am Rapport. */
  signedAt: string | null
  attempts: number
  /** Letzter Fehlertext vom Server, für die Karte im Projekt-Detail. Ein
   *  Rapport, der nicht durchgeht, darf nie stumm warten. */
  lastError: string | null
}

const { withStore } = createIdbStore(DB_NAME, STORE, { keyPath: 'clientId' })

/**
 * Erzeugt eine `clientId`.
 *
 * Muss eine **UUID** sein: `reports.client_id` ist serverseitig `uuid`, und ein
 * anderer String scheitert am Cast in der RPC — der Rapport liefe dann in eine
 * Endlosschleife aus 503 und Wiederholung, bis der Versuchs-Deckel greift.
 * `crypto.randomUUID` ist auf jedem Browser da, der eine installierbare PWA
 * trägt; der Rückfallweg deckt alte WebViews und Test-Umgebungen ab und baut
 * eine gültige v4 aus `getRandomValues` bzw. zuletzt aus `Math.random`.
 */
export function newClientId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* kein randomUUID — Rückfallweg unten */ }

  const bytes = new Uint8Array(16)
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
    }
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40   // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80   // Variante
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Alle wartenden Rapporte dieses Nutzers, ältester zuerst. */
export async function pendingRapporte(userId: string): Promise<PendingRapport[]> {
  return withStore<PendingRapport[]>('readonly', [], (store, done) => {
    const req = store.getAll()
    req.onsuccess = () => {
      const all = (req.result || []) as PendingRapport[]
      done(
        all
          .filter(r => r.userId === userId)
          .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
      )
    }
    req.onerror = () => done([])
  })
}

/** Die wartenden Rapporte EINES Projekts — die Karte im Projekt-Detail. */
export async function pendingForProject(userId: string, projectId: string): Promise<PendingRapport[]> {
  return (await pendingRapporte(userId)).filter(r => r.projectId === projectId)
}

export async function getRapport(clientId: string): Promise<PendingRapport | null> {
  return withStore<PendingRapport | null>('readonly', null, (store, done) => {
    const req = store.get(clientId)
    req.onsuccess = () => done((req.result as PendingRapport) ?? null)
    req.onerror = () => done(null)
  })
}

/**
 * Legt einen Rapport in die Queue (oder ersetzt ihn unter derselben `clientId`).
 *
 * `true` heisst: er liegt wirklich. Nur dann darf dem Monteur «gemerkt» gesagt
 * werden — ein Versprechen auf einen Rapport, der nirgends liegt, wäre der
 * teuerste Fehler dieses Features.
 */
export async function saveRapport(entry: PendingRapport): Promise<boolean> {
  return withStore<boolean>('readwrite', false, (store, done) => {
    const req = store.put(entry)
    req.onsuccess = () => done(true)
    req.onerror = () => done(false)
  })
}

export async function removeRapport(clientId: string): Promise<void> {
  await withStore<boolean>('readwrite', false, (store, done) => {
    const req = store.delete(clientId)
    req.onsuccess = () => done(true)
    req.onerror = () => done(false)
  })
}

/**
 * Wie auf einen fehlgeschlagenen Upload zu reagieren ist — reine Funktion,
 * damit die Entscheidung «nochmal / liegen lassen / anhalten» einzeln prüfbar
 * ist statt in einem IndexedDB-Test zu verschwinden.
 *
 * Der Unterschied zum Foto-Puffer ([photoQueue.ts](./photoQueue.ts)) ist das
 * fehlende `drop`: ein Rapport wird **nie** weggeworfen. Ein 4xx heisst hier
 * «der Server nimmt ihn so nicht an» — Projekt geschlossen, Artikel deaktiviert,
 * Stunden unplausibel —, und die Antwort darauf ist der Monteur, nicht der
 * Papierkorb. Der Eintrag bleibt mit dem Fehlertext in der Karte stehen und
 * lässt sich bearbeiten.
 */
export type RapportVerdict = 'retry' | 'hold' | 'abort'

export function verdictFor(err: unknown): RapportVerdict {
  if (isNetworkError(err)) return 'retry'
  if (err instanceof ApiError) {
    // Abgelaufene Sitzung oder fehlende Freigabe: nicht der Rapport ist kaputt.
    // Anhalten, damit der Versuchs-Deckel nicht an einem Login-Problem verbrennt.
    if (err.status === 401 || err.status === 403) return 'abort'
    if (err.status === 429) return 'abort'
    // 5xx (auch das 503 des Endpoints, wenn der Speicherpfad klemmt): später nochmal.
    if (err.status >= 500) return 'retry'
    // 4xx: so nimmt der Server ihn nicht an. Liegen lassen UND melden.
    return 'hold'
  }
  return 'retry'
}

export interface OfflineUploadResponse {
  report_id: number
  duplicate: boolean
  signed: boolean
}

export async function uploadRapport(entry: PendingRapport): Promise<OfflineUploadResponse> {
  return apiFetch<OfflineUploadResponse>('/pwa/reports/offline', {
    method: 'POST',
    body: JSON.stringify({
      client_id: entry.clientId,
      project_id: entry.projectId,
      date: entry.date,
      recorded_at: entry.recordedAt,
      staff: entry.staff
        .filter(s => s.name.trim() && s.hours)
        .map(s => ({ name: s.name.trim(), hours: Number(s.hours) })),
      description: entry.description,
      art_der_arbeit: entry.workTypes,
      einbauort: entry.einbauort || null,
      ersatzteile: entry.materials
        .filter(m => m.art_nr && m.amount > 0)
        .map(m => ({ art_nr: m.art_nr, amount: m.amount })),
      kleinmaterial: entry.kleinmaterial,
      is_partial: entry.isPartial,
      signature_base64: entry.signature,
      signed_at: entry.signedAt,
    }),
  })
}

export interface RapportDrainResult {
  /** Angekommen (auch als Duplikat — der Rapport IST auf dem Server). */
  uploaded: PendingRapport[]
  /** Vom Server abgelehnt; liegt weiterhin, mit Fehlertext. */
  held: PendingRapport[]
  /**
   * Angekommen, aber OHNE die mitgeschickte Unterschrift (der Server hat sie
   * verworfen, etwa weil die Data-URI unbrauchbar war). Der Rapport ist
   * gespeichert und pendent; die Abnahme fehlt.
   *
   * Eigene Liste, damit dieser Fall nicht unter `uploaded` verschwindet: eine
   * Kundenunterschrift, die niemand vermisst, ist genau die Art Verlust, die
   * erst bei der Rechnung auffällt. Sichtbar wird er im Projekt-Detail — der
   * Rapport steht dort in der Rapportliste als pendent, und der bestehende Weg
   * «Unterschrift nachtragen» führt weiter.
   */
  signatureLost: PendingRapport[]
  /** Wartet noch (Netz, Serverfehler, Versuchs-Deckel erreicht). */
  remaining: number
}

/**
 * Arbeitet die Queue der Reihe nach ab (ältester Rapport zuerst).
 *
 * Sequenziell und mit Abbruch beim ersten Netzfehler: geht der erste nicht
 * durch, geht der zweite auch nicht — und jeder weitere Versuch verbrennt nur
 * Anläufe gegen den Deckel.
 */
export async function drainRapportQueue(
  userId: string,
  upload: (entry: PendingRapport) => Promise<OfflineUploadResponse> = uploadRapport,
): Promise<RapportDrainResult> {
  const queue = await pendingRapporte(userId)
  const uploaded: PendingRapport[] = []
  const held: PendingRapport[] = []
  const signatureLost: PendingRapport[] = []

  for (const entry of queue) {
    // Deckel erreicht: nicht mehr versuchen, aber auch nicht wegwerfen. Der
    // Rapport bleibt sichtbar in der Karte, mit der Bitte, ihn dem Büro zu
    // melden — stillschweigend verschwinden darf er nie.
    if (entry.attempts >= MAX_DRAIN_ATTEMPTS) continue
    // Ein bereits abgelehnter Rapport wird nicht von selbst erneut versucht:
    // derselbe Body ergibt dieselbe Ablehnung. Er wartet auf die Bearbeitung
    // durch den Monteur (die `lastError` zurücksetzt).
    if (entry.lastError) { held.push(entry); continue }

    try {
      const res = await upload(entry)
      await removeRapport(entry.clientId)
      uploaded.push(entry)
      // Wir haben unterschrieben abgeschickt, der Server hat den Rapport ohne
      // Unterschrift gespeichert. Der Eintrag ist trotzdem erledigt — ihn
      // liegen zu lassen hiesse, denselben Rapport ein zweites Mal anzubieten.
      // Aber verschwiegen wird es nicht.
      if (entry.signature && !res.duplicate && !res.signed) signatureLost.push(entry)
    } catch (err) {
      const verdict = verdictFor(err)
      if (verdict === 'hold') {
        const withError = {
          ...entry,
          lastError: err instanceof ApiError ? err.message : 'Abgelehnt',
        }
        await saveRapport(withError)
        held.push(withError)
        // Weitermachen: die Ablehnung betrifft diesen Rapport, nicht die Leitung.
        continue
      }
      if (verdict === 'retry') {
        await saveRapport({ ...entry, attempts: entry.attempts + 1 })
      }
      // Netz weg oder Sitzung abgelaufen — der nächste scheitert genauso.
      break
    }
  }

  return { uploaded, held, signatureLost, remaining: (await pendingRapporte(userId)).length }
}

/**
 * Einen einzelnen Rapport **jetzt** hochladen — der Knopf «Jetzt senden».
 *
 * Der automatische Drain wartet auf einen der drei Netz-Momente und überspringt
 * einen Eintrag, der schon einmal abgelehnt wurde oder den Versuchs-Deckel
 * erreicht hat. Beides ist im Normalfall richtig und im Einzelfall im Weg: der
 * Monteur steht im Werkhof, sieht den wartenden Rapport und will ihn loswerden —
 * jetzt, nicht beim nächsten Einstempeln. Er darf das erzwingen; er weiss mehr
 * über die Lage als die Heuristik.
 *
 * Deshalb ignoriert diese Funktion `lastError` und `attempts`. Was sie NICHT
 * ignoriert: das Ergebnis. Scheitert es erneut, steht der Fehler wieder in der
 * Karte, und der Zähler ist um eins höher.
 */
export async function retryRapport(
  clientId: string,
  upload: (entry: PendingRapport) => Promise<OfflineUploadResponse> = uploadRapport,
): Promise<{ ok: boolean; duplicate: boolean; signatureLost: boolean; error: string | null }> {
  const entry = await getRapport(clientId)
  if (!entry) return { ok: false, duplicate: false, signatureLost: false, error: 'Rapport nicht mehr da.' }

  try {
    const res = await upload(entry)
    await removeRapport(clientId)
    return {
      ok: true,
      duplicate: res.duplicate,
      signatureLost: Boolean(entry.signature) && !res.duplicate && !res.signed,
      error: null,
    }
  } catch (err) {
    const verdict = verdictFor(err)
    const text = err instanceof ApiError ? err.message : 'Keine Verbindung'
    await saveRapport({
      ...entry,
      // Nur ein echter Fehlversuch zählt: bei 'abort' (Sitzung abgelaufen,
      // Drosselung) liegt es nicht am Rapport.
      attempts: verdict === 'retry' ? entry.attempts + 1 : entry.attempts,
      // Ein Netzfehler ist keine Ablehnung — er darf den Eintrag nicht in den
      // Zustand «wartet auf Bearbeitung» schieben, aus dem der automatische
      // Drain ihn nicht mehr anfasst.
      lastError: verdict === 'hold' ? text : entry.lastError,
    })
    return { ok: false, duplicate: false, signatureLost: false, error: text }
  }
}

/** «Erfasst 14:20» für die Karte im Projekt-Detail. */
export function recordedAtLabel(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return ''
  return new Date(ts).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Der Mandanten-Wähler der Betreiber-Seite.
 *
 * Spec: docs/specs/admin-werkora-ch.md §4.2.
 *
 * Er hält **eine** Auswahl an drei Orten, und die Rangfolge ist Absicht:
 *
 * 1. **URL-Hash** gewinnt. Wer einen Link öffnet, will den Mandanten aus dem
 *    Link sehen, nicht den, den er zuletzt offen hatte.
 * 2. **localStorage** ist die Bequemlichkeit für den Alltag — sie greift nur,
 *    wenn die Adresse keinen Mandanten nennt.
 * 3. **Kein Mandant** ist ein gültiger Zustand, kein Fehler: die Mandantenliste
 *    braucht keinen, und der Mandanten-Bereich bleibt dann leer mit Hinweis.
 *
 * Diese Rangfolge gilt **einmal, beim Laden**. Danach führt der Hash allein:
 * er wird beim Laden auf die aufgelöste Auswahl nachgezogen, und jede spätere
 * Änderung — Vor/Zurück im Browser, ein Link aus einer Mail, ein von Hand
 * getippter Slug — zieht den Wähler mit. Ohne diesen Abgleich zeigte die
 * Adresse nach einem einzigen Druck auf «Zurück» einen anderen Mandanten als
 * Kopfzeile und API-Aufruf, und geschrieben würde beim alten (§12).
 *
 * Was der Hook **nicht** tut: einen Mandanten raten. Genau ein Mandant in der
 * Liste heisst nicht, dass er gemeint ist — die Vorauswahl wäre der Anfang der
 * Verwechslung, vor der §12 warnt.
 *
 * `requireTenantId()` wirft statt `null` zurückzugeben. Eine schreibende Aktion
 * ohne Mandanten darf nicht stillschweigend irgendwo landen; ein Fehler an der
 * Aufrufstelle ist die billigste Stelle, an der das auffallen kann.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listTenants, type PlatformTenant } from '../api/platform'
import { SK } from '../api/storageKeys'
import { buildHash, parseHash } from './route'

/** localStorage kann werfen (privates Fenster, gesperrte Site-Daten) — die
 *  Auswahl ist Bequemlichkeit und darf die Seite nie mitreissen. */
function lesenGespeichert(): string | null {
  try {
    return localStorage.getItem(SK.ADMIN_TENANT_ID)
  } catch {
    return null
  }
}

function speichern(tenantId: string | null): void {
  try {
    if (tenantId) localStorage.setItem(SK.ADMIN_TENANT_ID, tenantId)
    else localStorage.removeItem(SK.ADMIN_TENANT_ID)
  } catch {
    /* egal — beim nächsten Start steht der Wähler eben auf «kein Mandant» */
  }
}

/** Schreibt den Slug in die Adresse, ohne den Rest der Route anzufassen. */
function hashAufMandantenZiehen(slug: string | null): void {
  const jetzt = parseHash(window.location.hash)
  if (jetzt.tenantSlug === slug) return
  const ziel = buildHash({ ...jetzt, tenantSlug: slug })
  if (ziel !== window.location.hash) window.location.hash = ziel
}

export interface TenantScope {
  tenants: PlatformTenant[]
  loading: boolean
  error: string | null
  /** Der gewählte Mandant — oder null, solange keiner gewählt ist. */
  tenant: PlatformTenant | null
  tenantId: string | null
  /** Wirft, wenn kein Mandant gewählt ist. Für jede Stelle, die ohne nicht kann. */
  requireTenantId: () => string
  selectTenant: (tenantId: string | null) => void
  reload: () => void
}

export function useTenantScope(): TenantScope {
  const [tenants, setTenants] = useState<PlatformTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let abgebrochen = false
    setLoading(true)
    listTenants()
      .then((liste) => {
        if (abgebrochen) return
        setTenants(liste)
        setError(null)
        // Erst jetzt lässt sich die Auswahl auflösen: aus dem Hash kommt ein
        // SLUG, gespeichert ist eine ID, und ob beides noch existiert, weiss
        // man ohne die Liste nicht. Ein Mandant, den es nicht mehr gibt (oder
        // der zu einer anderen Umgebung gehört), fällt hier still heraus —
        // besser als ein Wähler, der auf einen Namen zeigt, den der Server
        // mit 404 beantwortet.
        const ausHash = parseHash(window.location.hash).tenantSlug
        const vomSlug = ausHash ? liste.find((t) => t.slug === ausHash) : undefined
        const gespeichert = lesenGespeichert()
        const vomSpeicher = gespeichert ? liste.find((t) => t.id === gespeichert) : undefined
        const aufgeloest = vomSlug ?? vomSpeicher ?? null
        setTenantId(aufgeloest?.id ?? null)
        // Ab hier führt die Adresse — also muss sie jetzt dasselbe sagen wie der
        // Wähler. Kam die Auswahl aus dem Speicher, nennt der Hash sie noch
        // nicht: der nächste Screenwechsel schriebe den (leeren) Slug zurück,
        // und der Abgleich unten liesse den Mandanten fallen.
        hashAufMandantenZiehen(aufgeloest?.slug ?? null)
      })
      .catch((e: unknown) => {
        if (abgebrochen) return
        setError(e instanceof Error ? e.message : 'Mandanten konnten nicht geladen werden.')
      })
      .finally(() => {
        if (!abgebrochen) setLoading(false)
      })
    return () => {
      abgebrochen = true
    }
  }, [tick])

  // Der Hash kann sich ändern, ohne dass `selectTenant` je läuft: Vor/Zurück im
  // Browser (jede Wahl legt einen History-Eintrag an), ein geöffneter Link, ein
  // von Hand getippter Slug. Wer das nicht mitliest, hat eine Oberfläche, deren
  // Adresse «Gehlhaar» sagt, während die Kopfzeile «Stähli» zeigt und die
  // Schreibaktion bei Stähli landet.
  useEffect(() => {
    function beiWechsel() {
      // Solange die Liste fehlt (Ladevorgang, fehlgeschlagener Load), lässt sich
      // kein Slug auflösen — und «nicht auflösbar» hiesse hier «kein Mandant».
      // Das Laden selbst löst die Auswahl auf, diese Weiche hält sie bis dahin.
      if (tenants.length === 0) return

      const slug = parseHash(window.location.hash).tenantSlug
      const gefunden = slug ? tenants.find((t) => t.slug === slug) : undefined
      // Unbekannter Slug (getippt, veraltet, andere Umgebung): lieber kein
      // Mandant als der zuletzt gewählte. Der leere Zustand ist harmlos, ein
      // stillschweigend anderer Mandant nicht.
      const naechste = gefunden?.id ?? null
      setTenantId((vorher) => (vorher === naechste ? vorher : naechste))
      speichern(naechste)
    }
    window.addEventListener('hashchange', beiWechsel)
    return () => window.removeEventListener('hashchange', beiWechsel)
  }, [tenants])

  const tenant = useMemo(
    () => tenants.find((t) => t.id === tenantId) ?? null,
    [tenants, tenantId],
  )

  const selectTenant = useCallback(
    (naechste: string | null) => {
      setTenantId(naechste)
      speichern(naechste)
      // Den Hash mitziehen, damit die Adresse den gewählten Mandanten nennt.
      // Der Screen bleibt, wie er ist — wer von «Module» auf einen anderen
      // Mandanten wechselt, will dessen Module sehen, nicht wieder die Übersicht.
      const slug = naechste ? (tenants.find((t) => t.id === naechste)?.slug ?? null) : null
      hashAufMandantenZiehen(slug)
    },
    [tenants],
  )

  const requireTenantId = useCallback((): string => {
    if (!tenantId) {
      throw new Error('Kein Mandant gewählt — diese Aktion braucht einen.')
    }
    return tenantId
  }, [tenantId])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { tenants, loading, error, tenant, tenantId, requireTenantId, selectTenant, reload }
}

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
        setTenantId((vomSlug ?? vomSpeicher)?.id ?? null)
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
      const jetzt = parseHash(window.location.hash)
      const ziel = buildHash({ ...jetzt, tenantSlug: slug })
      if (ziel !== window.location.hash) window.location.hash = ziel
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

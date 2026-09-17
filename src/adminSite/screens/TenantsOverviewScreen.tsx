/**
 * Mandanten-Übersicht — die Startseite der Betreiber-Seite.
 *
 * Spec: docs/specs/admin-werkora-ch.md §4.3/1.
 *
 * Bewusst **Zähler statt Matrix**: das ist die Beta-Übersicht aus
 * [beta-tester.md §11 Phase 3] in ihrer einfachsten Form — nicht
 * Beta-Keys × Mandanten, sondern Mandanten mit Zahlen daneben. Die Matrix kommt,
 * wenn die Zähler nicht mehr reichen; sie vorher zu bauen hiesse, eine Tabelle
 * zu pflegen, bevor jemand sie gelesen hat.
 *
 * Die Zähler kommen je Mandant aus `/summary` — ein Aufruf pro Zeile. Bei einer
 * Handvoll Mandanten ist das billiger als ein Sammel-Endpunkt, den es sonst
 * nirgends gibt; sie laufen parallel und jeder fällt einzeln auf «—» zurück,
 * statt die ganze Tabelle mitzureissen.
 */
import { useEffect, useState } from 'react'
import { getTenantSummary, type PlatformTenantSummary } from '../../api/platform'
import type { TenantScope } from '../useTenantScope'

interface Props {
  scope: TenantScope
  onOpen: (tenantId: string) => void
}

function datum(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-CH')
}

export default function TenantsOverviewScreen({ scope, onOpen }: Props) {
  const [zaehler, setZaehler] = useState<Record<string, PlatformTenantSummary>>({})

  useEffect(() => {
    let abgebrochen = false
    if (scope.tenants.length === 0) return
    Promise.all(
      scope.tenants.map((t) =>
        getTenantSummary(t.id)
          .then((s) => [t.id, s] as const)
          .catch(() => null),
      ),
    ).then((paare) => {
      if (abgebrochen) return
      const naechste: Record<string, PlatformTenantSummary> = {}
      for (const p of paare) if (p) naechste[p[0]] = p[1]
      setZaehler(naechste)
    })
    return () => { abgebrochen = true }
  }, [scope.tenants])

  if (scope.loading) {
    return <div className="admin-loading"><div className="admin-spinner" /></div>
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Übersicht</div>
          <div className="admin-page-subtitle">
            {scope.tenants.length} Mandant{scope.tenants.length === 1 ? '' : 'en'} in dieser Umgebung
          </div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mandant</th>
              <th>Slug</th>
              <th className="num">Module</th>
              <th className="num">davon Beta</th>
              <th className="num">Konten</th>
              <th className="num">Beta-Tester</th>
              <th>Letzter Zugriff</th>
            </tr>
          </thead>
          <tbody>
            {scope.tenants.map((t) => {
              const s = zaehler[t.id]
              return (
                <tr
                  key={t.id}
                  className="admin-row-clickable"
                  onClick={() => onOpen(t.id)}
                  title="Mandant wählen und Konfiguration öffnen"
                >
                  <td>{t.name}</td>
                  <td><code>{t.slug}</code></td>
                  <td className="num">{s?.module_count ?? t.enabled_modules.length}</td>
                  <td className="num">{s?.beta_module_count ?? t.beta_modules.length}</td>
                  <td className="num">{s?.account_count ?? '—'}</td>
                  <td className="num">{s?.beta_tester_count ?? '—'}</td>
                  <td>{s ? datum(s.last_access_at) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {scope.tenants.length === 0 && !scope.error && (
        <div className="admin-empty">Keine Mandanten in dieser Umgebung.</div>
      )}
    </div>
  )
}

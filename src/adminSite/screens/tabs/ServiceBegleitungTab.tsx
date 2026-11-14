import { useEffect, useState } from 'react'
import * as scoped from '../../tenantScopedApi'
import type { ServiceBegleitungView, WerkzeugKatalogEintrag } from '../../tenantScopedApi'
import { useToast, ToastHost } from '../../../admin/components/useToast'

// ─── Reiter «Servicebegleitung»: Werkzeuge und Depot je Mandant ─────────────
//
// Spec: docs/specs/servicebegleitung.md §4.3. Das Modul selbst (und den
// Betatest) schaltet der Reiter «Module»; hier steht, WELCHE Werkzeuge an sind
// und mit welchen Parametern. Nur auf der Betreiber-Seite: ein falsch gestellter
// Schalter verschickt Mails an fremde Kunden, und die Werte entstehen ohnehin im
// Workshop mit dem Betrieb (Entscheid 3 in §15 offen).

const SECTION: React.CSSProperties = { padding: 24, maxWidth: 820, marginBottom: 16 }
const MUTED: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }

type Werte = ServiceBegleitungView['werkzeuge']

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function WerkzeugKarte({ eintrag, werte, onChange }: {
  eintrag: WerkzeugKatalogEintrag
  werte: Record<string, boolean | number | string>
  onChange: (feld: string, wert: boolean | number | string) => void
}) {
  const an = werte.enabled === true
  return (
    <div className="admin-table-wrap" style={SECTION} data-testid={`werkzeug-${eintrag.key}`}>
      <div className="admin-section-title" style={{ marginTop: 0 }}>
        {eintrag.label}
        {eintrag.kundenwirksam && (
          <span className="admin-badge admin-badge-draft" style={{ marginLeft: 8 }}>an Kunden</span>
        )}
      </div>
      <p style={MUTED}>{eintrag.description}</p>
      {eintrag.schema.map(f => (
        <label key={f.key} style={{ display: 'block', marginBottom: 12 }}>
          {f.type === 'bool' ? (
            <>
              <input
                type="checkbox"
                checked={werte[f.key] === true}
                onChange={e => onChange(f.key, e.target.checked)}
              />{' '}
              {f.label}
            </>
          ) : f.type === 'time' ? (
            <>
              <span className="admin-form-label">{f.label}</span>
              <input
                className="admin-form-input"
                type="time"
                value={String(werte[f.key] ?? '')}
                onChange={e => onChange(f.key, e.target.value)}
                style={{ maxWidth: 140 }}
              />
            </>
          ) : (
            <>
              <span className="admin-form-label">{f.label}</span>
              <input
                className="admin-form-input"
                type="number"
                min={f.min}
                max={f.max}
                step={f.step}
                value={Number(werte[f.key] ?? 0)}
                onChange={e => onChange(f.key, Number(e.target.value))}
                style={{ maxWidth: 140 }}
              />
            </>
          )}
        </label>
      ))}
      {an && eintrag.kundenwirksam && eintrag.hinweis_kunde && (
        <p className="admin-form-hint-warn" style={{ marginBottom: 0 }}>{eintrag.hinweis_kunde}</p>
      )}
    </div>
  )
}

export function ServiceBegleitungTab({ tenantId }: { tenantId: string }) {
  const { toast, showToast } = useToast(5000)
  const [view, setView] = useState<ServiceBegleitungView | null>(null)
  const [werte, setWerte] = useState<Werte>({})
  const [adresse, setAdresse] = useState('')
  const [loading, setLoading] = useState(true)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [serverFehler, setServerFehler] = useState<string | null>(null)

  function uebernehmen(v: ServiceBegleitungView) {
    setView(v)
    setWerte(v.werkzeuge)
    setAdresse(v.depot.adresse ?? '')
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    scoped.getServiceBegleitung(tenantId)
      .then(v => { if (alive) { uebernehmen(v); setLadeFehler(null) } })
      .catch(e => { if (alive) setLadeFehler(errorText(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tenantId])

  if (loading) {
    return <div className="admin-loading"><div className="admin-spinner" /> Servicebegleitung wird geladen…</div>
  }
  if (!view) {
    return <div role="alert" className="admin-error">{ladeFehler ?? 'Die Einstellungen konnten nicht geladen werden.'}</div>
  }

  const dirty = JSON.stringify(werte) !== JSON.stringify(view.werkzeuge)
    || adresse.trim() !== (view.depot.adresse ?? '')

  function setFeld(werkzeug: string, feld: string, wert: boolean | number | string) {
    setWerte(prev => ({ ...prev, [werkzeug]: { ...prev[werkzeug], [feld]: wert } }))
    setServerFehler(null)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setServerFehler(null)
    try {
      const v = await scoped.setServiceBegleitung(tenantId, { werkzeuge: werte, depot: { adresse: adresse.trim() } })
      uebernehmen(v)
      showToast('Servicebegleitung gespeichert', 'success')
    } catch (e) {
      setServerFehler(errorText(e))
      showToast('Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  const depotOhnePunkt = !!view.depot.adresse && (view.depot.lat == null || view.depot.lon == null)

  return (
    <div>
      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>Stand</div>
        <span className={`admin-badge ${view.modul_aktiv ? 'admin-badge-approved' : 'admin-badge-draft'}`}>
          {view.modul_aktiv ? 'Modul eingeschaltet' : 'Modul aus — kein Werkzeug wirkt'}
        </span>
        <p style={{ ...MUTED, marginBottom: 0, marginTop: 12 }}>
          Das Modul (und den Betatest) schaltest du im Reiter <strong>Module</strong> ein. Ein Werkzeug wirkt
          erst, wenn Modul <em>und</em> Werkzeug an sind.
        </p>
      </div>

      {view.katalog.map(eintrag => (
        <WerkzeugKarte
          key={eintrag.key}
          eintrag={eintrag}
          werte={werte[eintrag.key] ?? eintrag.default}
          onChange={(feld, wert) => setFeld(eintrag.key, feld, wert)}
        />
      ))}

      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>Depot</div>
        <p style={MUTED}>
          Startpunkt der Ankunftszeit, wenn der Monteur am Tag noch keinen Einsatz davor hat. Wohnadressen
          werden nicht gespeichert.
        </p>
        <input
          className="admin-form-input"
          aria-label="Depot-Adresse"
          value={adresse}
          maxLength={200}
          placeholder="Werkstrasse 1, 8400 Winterthur"
          onChange={e => { setAdresse(e.target.value); setServerFehler(null) }}
        />
        {depotOhnePunkt && (
          <p className="admin-form-hint-warn">
            Zu dieser Adresse wurde kein Punkt gefunden — der erste Einsatz des Tages bekommt keine Vorwahl.
          </p>
        )}
      </div>

      <div className="admin-table-wrap" style={SECTION}>
        <div className="admin-section-title" style={{ marginTop: 0 }}>Information der Mitarbeitenden</div>
        <p style={MUTED}>Vorlage für den Betrieb — vor dem Einschalten an die Servicetechniker weitergeben.</p>
        <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{view.info_mitarbeitende}</p>
      </div>

      {serverFehler && <div role="alert" className="admin-error" style={{ maxWidth: 820 }}>{serverFehler}</div>}
      <button className="admin-btn admin-btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
        {saving ? 'Speichern…' : 'Speichern'}
      </button>
      <ToastHost toast={toast} />
    </div>
  )
}

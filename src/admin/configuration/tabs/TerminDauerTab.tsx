import {
  type Dauer, type TerminDauerVorgaben, fetchTerminDauer, speichereTerminDauer,
} from '../../../api/serviceBegleitung'
import { DauerAuswahl } from '../../components/DauerAuswahl'
import { useTenantSetting } from '../useTenantSetting'
import { useToast, ToastHost } from '../../components/useToast'

// ─── Reiter «Termindauer»: Dauer-Vorgaben je Termin-Art ─────────────────────
//
// Spec: docs/specs/servicebegleitung.md Entscheid 9. Jeder Betrieb hat andere
// Einsätze, deshalb pflegt das Management die Vorgaben hier selbst (nicht der
// Betreiber). Der Dialog «Dem Kunden zur Wahl senden» belegt die Dauer mit der
// Vorgabe der gewählten Art vor; die Disposition kann sie je Anfrage ändern. Der
// Kunde liest sie als «Der Einsatz dauert etwa 1 bis 2 Stunden». Eine Art ohne
// Vorgabe bleibt leer — dann steht in der Mail keine Dauer.

type Eintrag = Partial<Dauer>

function zuEingabe(v: TerminDauerVorgaben): Record<string, Eintrag> {
  return Object.fromEntries(v.arten.map(a => [a.key, { ...v.vorgaben[a.key] }]))
}

export function TerminDauerTab() {
  const { toast, showToast } = useToast()
  const {
    value, setValue, loading, saving, dirty, reload, persist,
  } = useTenantSetting<TerminDauerVorgaben>({
    load: fetchTerminDauer,
    save: async v => {
      const eingabe = Object.fromEntries(Object.entries(zuEingabe(v)).map(([k, d]) => [k, {
        von: d.von ?? d.bis ?? null, bis: d.bis ?? d.von ?? null,
      }]))
      return speichereTerminDauer(eingabe as Record<string, Partial<Dauer>>)
    },
    onToast: showToast,
    savedMsg: 'Termindauer gespeichert',
    serialize: v => JSON.stringify(zuEingabe(v)),
  })

  if (loading || !value) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Termindauer wird geladen…</div><ToastHost toast={toast} /></>
  }

  function setze(art: string, teil: Eintrag) {
    if (!value) return
    const alt = value.vorgaben[art] ?? {}
    const neu = { ...alt, ...teil } as Eintrag
    const vorgaben = { ...value.vorgaben }
    if (neu.von == null && neu.bis == null) delete vorgaben[art]
    else vorgaben[art] = neu as Dauer
    setValue({ ...value, vorgaben })
  }

  const ungueltig = value.arten.filter(a => {
    const d = value.vorgaben[a.key]
    return d && d.von != null && d.bis != null && d.von > d.bis
  })

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Wie lange ein Einsatz dauert, nennt die Terminwahl dem Kunden («Der Einsatz dauert etwa 1 bis
        2 Stunden»). Hier steht die Vorgabe je Termin-Art; im Dialog «Dem Kunden zur Wahl senden» lässt
        sie sich je Auftrag ändern. Ohne Vorgabe steht keine Dauer in der Mail.
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {value.arten.map(a => {
          const d = value.vorgaben[a.key] ?? {}
          return (
            <div key={a.key} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}
                 data-testid={`termindauer-${a.key}`}>
              <div style={{ flex: '1 1 160px', fontWeight: 600, paddingBottom: 10 }}>{a.label}</div>
              <DauerAuswahl label={`${a.label} von`} wert={d.von ?? null} disabled={saving}
                            onChange={v => setze(a.key, { von: v ?? undefined })} />
              <DauerAuswahl label={`${a.label} bis`} wert={d.bis ?? null} disabled={saving}
                            onChange={v => setze(a.key, { bis: v ?? undefined })} />
            </div>
          )
        })}
      </div>

      {ungueltig.length > 0 && (
        <div className="admin-form-error" role="alert" style={{ marginTop: 12 }}>
          «von» ist länger als «bis»: {ungueltig.map(a => a.label).join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="admin-btn admin-btn-primary" disabled={!dirty || saving || ungueltig.length > 0}
                onClick={() => void persist()}>
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        <button className="admin-btn admin-btn-secondary" disabled={!dirty || saving} onClick={() => void reload()}>
          Verwerfen
        </button>
      </div>
      <ToastHost toast={toast} />
    </div>
  )
}

import { useState } from 'react'
import * as scoped from '../../tenantScopedApi'
import { useTenantSetting } from '../../../admin/configuration/useTenantSetting'
import { useToast, ToastHost } from '../../../admin/components/useToast'

// ─── Rapport-Bot-Tab: Fachgebiet des Betriebs ───────────────────────────────
//
// Spec: docs/specs/rapport-bot-guardrails.md §4.8. Der Rapport-Chat der
// Monteur-App kennt von sich aus keine Branche. Was der Betrieb macht, welche
// Produkte und Fachwörter vorkommen und wie die Monteure sie in Mundart nennen,
// steht hier und geht in den System-Prompt jedes Chat-Turns dieses Mandanten.
//
// Nur hier auf der Betreiber-Seite, nicht in den Einstellungen des Betriebs: der
// Text wirkt auf das Verhalten des Bots, und das verantwortet, wer auch Modell und
// Regeln verantwortet. Die Regeln selbst (was gespeichert werden darf, was auf den
// Rapport kommt) stehen im Backend und lassen sich hier nicht ändern.

const BEISPIEL = `Der Betrieb ist eine Schweizer Storenfirma (Storen, Rollläden, Markisen, Antriebe).

Fachwörter (Mundart → Hochdeutsch):
  • "Lamellestore" = Lamellenstoren
  • "Müggegitter" = Insektenschutz`

export function RapportBotTab({ tenantId }: { tenantId: string }) {
  const { toast, showToast } = useToast()
  const [maxZeichen, setMaxZeichen] = useState(4000)
  const { value, setValue, loading, saving, dirty, reload, persist } = useTenantSetting<string>({
    load: async () => {
      const res = await scoped.getRapportBotPrompt(tenantId)
      setMaxZeichen(res.max_zeichen)
      return res.text
    },
    save: async (text) => (await scoped.setRapportBotPrompt(tenantId, text)).text,
    onToast: showToast,
    savedMsg: 'Fachgebiet gespeichert',
    reloadKey: tenantId,
  })

  if (loading || value === null) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Rapport-Bot wird geladen…</div><ToastHost toast={toast} /></>
  }

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 820 }}>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Fachgebiet dieses Betriebs für den Rapport-Bot: Branche, Produkte und Fachwörter, gern mit
        den Mundart-Ausdrücken der Monteure. Der Text geht in jeden Chat dieses Betriebs. Leer
        lassen heisst: der Bot arbeitet ohne Branchenwissen. Die Regeln des Bots (was gespeichert
        werden darf, was auf den Rapport kommt) stehen im Code und lassen sich hier nicht ändern.
      </div>
      <label className="admin-form-group" style={{ display: 'block' }}>
        <span className="admin-form-label">Fachgebiet des Betriebs</span>
        <textarea className="admin-form-input" aria-label="Fachgebiet des Betriebs"
                  rows={16} style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
                  value={value} maxLength={maxZeichen} disabled={saving} placeholder={BEISPIEL}
                  onChange={e => setValue(e.target.value)} />
        <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
          {value.length} / {maxZeichen} Zeichen
        </span>
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="admin-btn admin-btn-primary" disabled={!dirty || saving}
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

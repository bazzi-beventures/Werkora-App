// Bestellvorschläge (Lager v2, Modul `inventory` + Flag `lager_v2`).
//
// Der Nachtlauf legt je Lieferant einen Entwurf ab, gesendet wird nie
// automatisch. Was den Betrieb verlässt, entscheidet ein Mensch — dieselbe
// Linie wie beim Aftersales-Review.

import { useCallback, useEffect, useState } from 'react'
import {
  discardReorderDraft, generateReorderDrafts, listReorderDrafts,
  sendReorderDraft, updateReorderDraft,
} from '../../api/admin/inventory'
import type { ReorderDraft } from '../../api/admin/inventory'
import { ConfirmDialog } from '../components/ConfirmDialog'

function Karte({ draft, lieferantName, onChanged }: {
  draft: ReorderDraft
  lieferantName: string
  onChanged: () => void
}) {
  const [body, setBody] = useState(draft.body)
  const [offen, setOffen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verwerfenFrage, setVerwerfenFrage] = useState(false)
  const geaendert = body !== draft.body

  async function aktion(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onChanged()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong>{lieferantName}</strong>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {draft.items.length} Position(en)
            {draft.to_email
              ? ` · ${draft.to_email}`
              : ' · keine E-Mail-Adresse hinterlegt'}
          </div>
        </div>
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setOffen(o => !o)}>
          {offen ? 'Zuklappen' : 'Text ansehen'}
        </button>
      </div>

      {error && <div className="admin-form-error" style={{ marginTop: 8 }}>{error}</div>}

      <ul style={{ margin: '8px 0', paddingLeft: 18, fontSize: 13 }}>
        {draft.items.map(it => (
          <li key={it.material_id}>
            {it.name} <span style={{ color: 'var(--muted)' }}>· {it.art_nr}</span>: {it.qty} {it.unit || 'Stk'}
          </li>
        ))}
      </ul>

      {offen && (
        <div className="admin-form-group">
          <label className="admin-form-label" htmlFor={`body-${draft.id}`}>Text der Bestellung</label>
          <textarea
            id={`body-${draft.id}`} className="admin-form-input" rows={12}
            value={body} onChange={e => setBody(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
          />
          <div className="admin-form-hint">
            Keine Preise — Konditionen sind Sache des Lieferanten.
          </div>
          {geaendert && (
            <button
              className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy}
              onClick={() => aktion(() => updateReorderDraft(draft.id, { body }))}
            >
              Text speichern
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button
          className="admin-btn admin-btn-primary admin-btn-sm"
          disabled={busy || !draft.to_email}
          title={draft.to_email ? undefined : 'Beim Lieferanten ist keine E-Mail-Adresse hinterlegt'}
          onClick={() => aktion(() => sendReorderDraft(draft.id))}
        >
          An Lieferant senden
        </button>
        <button
          className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy}
          title="Sie haben anders bestellt (Telefon, Webshop) — es geht keine Mail raus"
          onClick={() => aktion(() => sendReorderDraft(draft.id, true))}
        >
          Als gesendet markieren
        </button>
        <button
          className="admin-btn admin-btn-secondary admin-btn-sm" disabled={busy}
          onClick={() => setVerwerfenFrage(true)}
        >
          Verwerfen
        </button>
      </div>

      {verwerfenFrage && (
        <ConfirmDialog
          title="Bestellvorschlag verwerfen?"
          message="Die Artikel bleiben unter Meldebestand. Vorgeschlagen werden sie erst in einer Woche wieder."
          confirmLabel="Verwerfen"
          onConfirm={() => { setVerwerfenFrage(false); void aktion(() => discardReorderDraft(draft.id)) }}
          onCancel={() => setVerwerfenFrage(false)}
        />
      )}
    </div>
  )
}

export default function ReorderDrafts({ lieferantNamen }: { lieferantNamen: Record<string, string> }) {
  const [drafts, setDrafts] = useState<ReorderDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const laden = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listReorderDrafts('entwurf')
      setDrafts(res.rows)
      setError('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void laden() }, [laden])

  async function jetztErzeugen() {
    setBusy(true)
    try {
      await generateReorderDrafts()
      await laden()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erzeugen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Bestellvorschläge</h3>
        <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={jetztErzeugen} disabled={busy}>
          {busy ? 'Wird erstellt…' : 'Jetzt erstellen'}
        </button>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Wird geladen…</div>
      ) : drafts.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          Kein offener Vorschlag. Der Lagerbericht erstellt morgens welche, sobald ein
          Artikel unter den Meldebestand fällt.
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {drafts.map(d => (
            <Karte
              key={d.id}
              draft={d}
              lieferantName={d.supplier_id ? (lieferantNamen[d.supplier_id] ?? 'Lieferant') : 'Artikel ohne Lieferant'}
              onChanged={laden}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { RichTextField } from './RichTextField'
import type { ToastFn } from './useToast'

// Mandanten-Textbaustein (Offert-/Rechnungstexte): GET/PATCH auf einen Endpoint
// der Backend-Factory make_tenant_text_endpoints (agents/routers/_tenant_texts.py).
// Der Vertrag ist überall gleich: Response { <key>: string, is_default: boolean },
// PATCH { <key>: string | null }. Zwei Semantiken:
//   2-Zustand: Default oder eigener Text — Reset via null (bzw. '' bei den
//              Standard-Bemerkungen, historischer Vertrag).
//   3-Zustand: zusätzlich «bewusst leer» — '' wird gespeichert, null resettet.
// Vor dieser Konsolidierung war der identische Rumpf 10× im QuoteTemplatesScreen.

export interface UseTenantTextResult {
  value: string
  setValue: (v: string) => void
  saved: string
  isDefault: boolean
  loading: boolean
  saving: boolean
  error: string
  // Weitere Felder der letzten Server-Antwort (z.B. `days` der Zahlungskondition).
  meta: Record<string, unknown>
  save: (reset?: boolean) => Promise<void>
}

export function useTenantText(
  endpoint: string,
  key: string,
  opts: {
    showToast: ToastFn
    savedMsg: string
    // Was der Reset-Knopf PATCHt: null (Standard) oder '' (Standard-Bemerkungen).
    resetPayload?: '' | null
  },
): UseTenantTextResult {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')
  const [isDefault, setIsDefault] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState<Record<string, unknown>>({})

  function apply(res: Record<string, unknown>) {
    const v = typeof res[key] === 'string' ? (res[key] as string) : ''
    setValue(v)
    setSaved(v)
    setIsDefault(!!res.is_default)
    setMeta(res)
  }

  useEffect(() => {
    let cancelled = false
    ;(apiFetch(endpoint) as Promise<Record<string, unknown>>)
      .then(res => { if (!cancelled) apply(res) })
      .catch(() => { /* Feld startet dann mit dem leeren Editor; Speichern meldet den Fehler */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  async function save(reset = false) {
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: reset ? (opts.resetPayload ?? null) : value }),
      }) as Record<string, unknown>
      apply(res)
      opts.showToast(reset ? 'Auf Standardtext zurückgesetzt' : opts.savedMsg)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  return { value, setValue, saved, isDefault, loading, saving, error, meta, save }
}

interface TenantTextSettingProps {
  title: string
  // Beschreibung; die Zustands-Hinweise (Default / bewusst leer) hängt die
  // Komponente selbst an.
  subtitle: React.ReactNode
  state: UseTenantTextResult
  editor: 'rich' | 'textarea'
  rows: number
  placeholder: string
  saveLabel: string
  // Grauer Hinweistext rechts neben den Knöpfen.
  hint: React.ReactNode
  // 3-Zustand: Text, der erscheint, wenn bewusst leer gespeichert wurde.
  emptyStateHint?: string
  // Erste Sektion eines Panels rückt weniger weit vom Kopf ab.
  first?: boolean
}

export function TenantTextSetting({
  title, subtitle, state, editor, rows, placeholder, saveLabel, hint, emptyStateHint, first = false,
}: TenantTextSettingProps) {
  return (
    <>
      <div className="admin-page-header" style={{ marginTop: first ? 8 : 24 }}>
        <div>
          <div className="admin-page-title" style={{ fontSize: 18 }}>{title}</div>
          <div className="admin-page-subtitle">
            {subtitle}
            {state.isDefault && ' Aktuell wird der System-Standardtext verwendet.'}
            {emptyStateHint && !state.isDefault && state.saved.trim() === '' && ` ${emptyStateHint}`}
          </div>
        </div>
      </div>
      <div className="admin-table-wrap" style={{ padding: 16 }}>
        {state.error && <div className="admin-form-error" style={{ marginBottom: 8 }}>{state.error}</div>}
        {editor === 'rich' ? (
          <RichTextField
            rows={rows}
            value={state.value}
            onChange={state.setValue}
            placeholder={placeholder}
          />
        ) : (
          <textarea
            className="admin-form-input"
            rows={rows}
            value={state.value}
            onChange={e => state.setValue(e.target.value)}
            placeholder={placeholder}
            style={{ resize: 'vertical', lineHeight: 1.5 }}
          />
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => void state.save(false)}
            disabled={state.saving || state.value === state.saved}
          >
            {state.saving ? 'Speichern…' : saveLabel}
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => void state.save(true)}
            disabled={state.saving || state.isDefault}
          >
            Auf Standardtext zurücksetzen
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{hint}</span>
        </div>
      </div>
    </>
  )
}

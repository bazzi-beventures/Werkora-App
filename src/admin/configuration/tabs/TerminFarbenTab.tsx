import {
  loadSchedulingConfig, saveTerminFarben, TERMIN_FARBE_LABEL_MAXLEN, TERMIN_FARBEN_MAX,
} from '../../../api/admin/tenant'
import { NEUE_TERMINFARBE, terminFarbenNeuLaden } from '../../operative/terminFarben'
import { useTenantSetting } from '../useTenantSetting'
import { useToast, ToastHost } from '../../components/useToast'

// ─── Reiter «Terminfarben»: Farbkategorien je Termin ────────────────────────
//
// Spec: docs/specs/termin-farbkategorien.md. Welche Kategorien es gibt (Schulung,
// Büro, Ferien …) ist eine Frage des Betriebs, deshalb pflegt das Management sie
// hier selbst. Im Termin-Formular erscheint die Auswahl, sobald die Liste nicht
// leer ist; der Einsatzplan zeichnet den Termin dann in dieser Farbe. Der
// Schlüssel entsteht beim ersten Speichern aus dem Namen und bleibt danach fest —
// umbenennen behält die Farbe an allen Terminen, löschen lässt sie auf die Farbe
// der Einsatz-Art zurückfallen.

interface Zeile { key?: string; label: string; color: string }

async function laden(): Promise<Zeile[]> {
  const cfg = await loadSchedulingConfig()
  return (cfg.termin_farben ?? []).map(k => ({ key: k.key, label: k.label, color: k.color }))
}

async function speichern(zeilen: Zeile[]): Promise<Zeile[]> {
  const res = await saveTerminFarben(zeilen.map(z => ({ ...z, label: z.label.trim() })))
  await terminFarbenNeuLaden()
  return res.kategorien
}

export function fehlerDerListe(zeilen: Zeile[]): string {
  const namen = zeilen.map(z => z.label.trim())
  if (namen.some(n => !n)) return 'Jede Farbe braucht einen Namen — Zeile ausfüllen oder entfernen.'
  if (namen.some(n => n.length > TERMIN_FARBE_LABEL_MAXLEN)) {
    return `Ein Name darf höchstens ${TERMIN_FARBE_LABEL_MAXLEN} Zeichen haben.`
  }
  const gesehen = new Set<string>()
  for (const n of namen) {
    if (gesehen.has(n.toLowerCase())) return `«${n}» steht doppelt in der Liste.`
    gesehen.add(n.toLowerCase())
  }
  return ''
}

export function TerminFarbenTab() {
  const { toast, showToast } = useToast()
  const { value, setValue, loading, saving, dirty, reload, persist } = useTenantSetting<Zeile[]>({
    load: laden,
    save: speichern,
    onToast: showToast,
    savedMsg: 'Terminfarben gespeichert',
  })

  if (loading || !value) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Terminfarben werden geladen…</div><ToastHost toast={toast} /></>
  }

  const setze = (i: number, teil: Partial<Zeile>) =>
    setValue(value.map((z, j) => (j === i ? { ...z, ...teil } : z)))
  const verschiebe = (i: number, d: -1 | 1) => {
    const neu = [...value]
    ;[neu[i], neu[i + d]] = [neu[i + d], neu[i]]
    setValue(neu)
  }
  const fehler = fehlerDerListe(value)

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        Eigene Farben für Termine, z.&nbsp;B. «Schulung», «Büro» oder «Ferien». Beim Erfassen eines
        Termins lässt sich eine davon wählen; der Einsatzplan zeigt den Termin dann in dieser Farbe.
        Ohne Auswahl bleibt die Farbe der Einsatz-Art. Umbenennen behält die Farbe an allen Terminen.
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {value.map((z, i) => (
          <div key={z.key ?? `neu-${i}`} className="termin-farben-zeile" data-testid="terminfarbe-zeile">
            <input type="color" aria-label={`Farbe ${z.label || i + 1}`} value={z.color}
                   disabled={saving} onChange={e => setze(i, { color: e.target.value })} />
            <input className="admin-form-input" style={{ flex: '1 1 200px' }} aria-label="Name"
                   value={z.label} maxLength={TERMIN_FARBE_LABEL_MAXLEN} disabled={saving}
                   placeholder="z. B. Schulung / Schule Lehrlinge"
                   onChange={e => setze(i, { label: e.target.value })} />
            <button className="admin-btn admin-btn-secondary" aria-label="Nach oben"
                    disabled={saving || i === 0} onClick={() => verschiebe(i, -1)}>↑</button>
            <button className="admin-btn admin-btn-secondary" aria-label="Nach unten"
                    disabled={saving || i === value.length - 1} onClick={() => verschiebe(i, 1)}>↓</button>
            <button className="admin-btn admin-btn-secondary" aria-label={`${z.label || 'Zeile'} entfernen`}
                    disabled={saving} onClick={() => setValue(value.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {value.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Noch keine Terminfarben angelegt.</div>
        )}
      </div>

      <button className="admin-btn admin-btn-secondary" style={{ marginTop: 12 }}
              disabled={saving || value.length >= TERMIN_FARBEN_MAX}
              onClick={() => setValue([...value, { label: '', color: NEUE_TERMINFARBE }])}>
        + Farbe hinzufügen
      </button>

      {fehler && <div className="admin-form-error" role="alert" style={{ marginTop: 12 }}>{fehler}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="admin-btn admin-btn-primary" disabled={!dirty || saving || !!fehler}
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

// Hagelschaden-Disposition, Phase 1 — Bausteine für die Arbeitsliste.
// Spec: docs/specs/hagelschaden-disposition.md §4, §5, §15.
//
// Alles hier erscheint nur, wenn der Server `dispo` mitschickt — er entscheidet
// (Feature `hagelschaden_disposition`, seit 20261011 GA). Ein zweites
// `isFeatureEnabled` im Client wäre eine zweite Wahrheit.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  putHagelDispoParameter,
  type HagelDispo, type HagelDispoInfo, type HagelDispoParameter, type HagelKampagne,
  type HagelPatch, type HagelZeile,
} from '../../../api/admin/hagelschaden'
import { EINSATZART_LABELS, dauerText, stundenText, type OffeneArbeit } from './dispoAnzeige'

const DAUER_MIN = 5
const DAUER_MAX = 4800

// ─── Summe «Offene Arbeit» ────────────────────────────────────────

export function DispoSumme({ o, onParameter }: { o: OffeneArbeit; onParameter: () => void }) {
  const teile = (Object.keys(EINSATZART_LABELS) as (keyof typeof EINSATZART_LABELS)[])
    .filter(art => o.je[art] > 0)
    .map(art => `${EINSATZART_LABELS[art]} ${stundenText(o.je[art])}`)
  return (
    <section className="hagel-dispo-summe" aria-label="Offene Arbeit">
      <div className="hagel-dispo-summe-text">
        <span className="hagel-dispo-summe-titel">Offene Arbeit</span>
        <span>
          <strong>{stundenText(o.minuten)}</strong> ≈ <strong>{o.equipentage.toLocaleString('de-CH')}</strong> Equipentage
          {' '}· {o.faelle} {o.faelle === 1 ? 'Fall' : 'Fälle'} pendent ohne Einsatz
        </span>
        {teile.length > 0 && <span className="hagel-sub">{teile.join(' · ')}</span>}
        {o.geschaetzt > 0 && (
          <span className="hagel-sub">
            {o.geschaetzt} {o.geschaetzt === 1 ? 'Fall' : 'Fälle'} ohne Mengenangabe — Umfang geschätzt
          </span>
        )}
      </div>
      <button type="button" className="admin-btn admin-btn-secondary" onClick={onParameter}>
        Dauer-Parameter
      </button>
    </section>
  )
}

// ─── Zelle in Tabelle und Karte ───────────────────────────────────

/** «Aufnahme · 23 min» — ✎ bei überschriebener Dauer, ≈ bei geschätztem Umfang. */
export function DispoKurz({ d }: { d: HagelDispo | null | undefined }) {
  if (!d) return <span className="hagel-sub">—</span>
  return (
    <span className="hagel-dispo-kurz" title={d.umfang_geschaetzt ? 'Umfang geschätzt — keine Mengenangabe des Kunden' : undefined}>
      {EINSATZART_LABELS[d.einsatzart]} · {d.umfang_geschaetzt && !d.dauer_ueberschrieben ? '≈ ' : ''}{dauerText(d.dauer_min)}
      {d.dauer_ueberschrieben && <span aria-label="Dauer überschrieben" title="Dauer von Hand gesetzt"> ✎</span>}
      {d.personen > 1 && <span className="hagel-sub"> · {d.personen} Pers.</span>}
    </span>
  )
}

// ─── Block im Detail ──────────────────────────────────────────────

export function DispoBlock({ z, info, onSave }: {
  z: HagelZeile
  info: HagelDispoInfo
  onSave: (z: HagelZeile, felder: HagelPatch, vorschau: Partial<HagelZeile>) => Promise<boolean>
}) {
  const d = z.dispo
  const [dauer, setDauer] = useState(d?.dauer_ueberschrieben ? String(d.dauer_min) : '')
  useEffect(() => { setDauer(d?.dauer_ueberschrieben ? String(d.dauer_min) : '') }, [d?.dauer_ueberschrieben, d?.dauer_min])

  if (!d) {
    return (
      <section className="hagel-detail-block betrieb">
        <h4>Disposition</h4>
        <div className="hagel-sub">Ohne Antwort des Kunden gibt es keine Einsatzart und keine Dauer.</div>
      </section>
    )
  }
  const ueber = new Set(d.ueberschrieben)
  const labelArt = (k: string) => info.einsatzarten.find(o => o.key === k)?.label ?? k
  const labelKat = (k: string) => info.kategorien.find(o => o.key === k)?.label ?? k
  const speichere = (felder: HagelPatch) => void onSave(z, felder, {})

  function dauerSpeichern() {
    const roh = dauer.trim()
    const alt = d!.dauer_ueberschrieben ? String(d!.dauer_min) : ''
    if (roh === alt) return
    if (!roh) { speichere({ dauer_min: null }); return }
    const n = Number(roh)
    if (!Number.isInteger(n) || n < DAUER_MIN || n > DAUER_MAX) {
      setDauer(alt)
      return
    }
    speichere({ dauer_min: n })
  }

  const stufen = (Object.entries(d.stufen_min) as [keyof typeof EINSATZART_LABELS, number][])
    .map(([art, min]) => `${EINSATZART_LABELS[art]} ${dauerText(min)}`)

  return (
    <section className="hagel-detail-block betrieb">
      <h4>Disposition</h4>
      <div className="hagel-dispo-grid">
        <label>
          <span>Nächster Einsatz</span>
          <select className="admin-form-select" aria-label="Einsatzart"
            value={ueber.has('einsatzart') ? d.einsatzart : ''}
            onChange={e => speichere({ einsatzart: (e.target.value || null) as HagelPatch['einsatzart'] })}>
            <option value="">Regel: {labelArt(d.einsatzart_regel)}</option>
            {info.einsatzarten.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label>
          <span>Kategorie</span>
          <select className="admin-form-select" aria-label="Kategorie"
            value={ueber.has('kategorie') ? d.kategorie : ''}
            onChange={e => speichere({ kategorie: (e.target.value || null) as HagelPatch['kategorie'] })}>
            <option value="">Regel: {labelKat(d.kategorie_regel)}</option>
            {info.kategorien.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label>
          <span>Dauer (min)</span>
          <input className="admin-form-input" type="number" inputMode="numeric" aria-label="Dauer in Minuten"
            min={DAUER_MIN} max={DAUER_MAX} step={5}
            value={dauer}
            placeholder={`Regel: ${d.dauer_regel_min}`}
            onChange={e => setDauer(e.target.value)}
            onBlur={dauerSpeichern}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        </label>
        <label>
          <span>Personen</span>
          <select className="admin-form-select" aria-label="Personen"
            value={ueber.has('personen') ? String(d.personen) : ''}
            onChange={e => speichere({ personen: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Regel: {d.personen_regel}</option>
            {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          <span>Nicht vor</span>
          <input className="admin-form-input" type="date" aria-label="Nicht vor"
            value={d.nicht_vor ?? ''}
            onChange={e => speichere({ nicht_vor: e.target.value || null })} />
        </label>
        <label>
          <span>Zeitfenster</span>
          <select className="admin-form-select" aria-label="Zeitfenster"
            value={d.zeitfenster ?? ''}
            onChange={e => speichere({ zeitfenster: (e.target.value || null) as HagelPatch['zeitfenster'] })}>
            <option value="">beliebig</option>
            <option value="vormittag">nur vormittags</option>
            <option value="nachmittag">nur nachmittags</option>
          </select>
        </label>
      </div>
      <div className="hagel-sub">
        Restarbeit {dauerText(d.rest_min)}: {stufen.join(' · ')} · {d.elemente} {d.elemente === 1 ? 'Element' : 'Elemente'}
        {d.umfang_geschaetzt ? ' (geschätzt, keine Mengenangabe)' : ''}
      </div>
    </section>
  )
}

// ─── Parameter-Dialog ─────────────────────────────────────────────

type ZahlFeld = Exclude<keyof HagelDispoParameter, 'min_je_element' | 'plan'>

const ZAHLFELDER: { key: ZahlFeld; label: string; hilfe?: string }[] = [
  { key: 'grundzeit_min', label: 'Grundzeit je Reparatur (min)', hilfe: 'Einrichten, Abdecken, Aufräumen' },
  { key: 'zuschlag_zusatzprodukt_min', label: 'Zuschlag je weiteres Produkt (min)' },
  { key: 'sicherung_min', label: 'Sicherung (min)' },
  { key: 'aufnahme_grund_min', label: 'Aufnahme: Grundzeit (min)' },
  { key: 'aufnahme_je_element_min', label: 'Aufnahme: je Element (min)' },
  { key: 'elemente_ohne_angabe', label: 'Elemente ohne Mengenangabe', hilfe: 'Annahme, wenn der Kunde nichts angibt' },
  { key: 'elemente_je_objekt', label: 'Elemente je Objekt', hilfe: 'Bei «mehrere Objekte betroffen»' },
  { key: 'tageskapazitaet_min', label: 'Tageskapazität einer Equipe (min)', hilfe: 'Bezug für «Equipentage»' },
]

export function DispoParameterDialog({ info, kampagne, onClose, onSaved }: {
  info: HagelDispoInfo
  kampagne: HagelKampagne
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<HagelDispoParameter>(() => structuredClone(info.parameter))
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function speichern() {
    setLaeuft(true)
    setFehler(null)
    try {
      await putHagelDispoParameter(draft, kampagne.key)
      onSaved()
      onClose()
    } catch (e) {
      setFehler(e instanceof Error && e.message ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setLaeuft(false)
    }
  }

  const zahl = (v: string) => (v === '' ? 0 : Number(v))

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal hagel-dispo-dialog" role="dialog" aria-label="Dauer-Parameter"
        onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Dauer-Parameter</div>
          <button className="admin-modal-close" aria-label="Schliessen" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="hagel-sub">
            Daraus rechnet die Liste die Dauer jedes Falls. Eine Dauer, die im Fall von Hand gesetzt ist,
            bleibt davon unberührt.
          </p>
          <h4 className="hagel-dispo-dialog-titel">Reparatur: Minuten je Element</h4>
          <div className="hagel-dispo-grid">
            {kampagne.produkte.map(prod => (
              <label key={prod.key}>
                <span>{prod.label}</span>
                <input className="admin-form-input" type="number" inputMode="numeric" min={0} max={600}
                  aria-label={`${prod.label}, Minuten je Element`}
                  value={draft.min_je_element[prod.key] ?? ''}
                  onChange={e => setDraft({ ...draft, min_je_element: { ...draft.min_je_element, [prod.key]: zahl(e.target.value) } })} />
              </label>
            ))}
          </div>
          <h4 className="hagel-dispo-dialog-titel">Übrige Werte</h4>
          <div className="hagel-dispo-grid">
            {ZAHLFELDER.map(f => (
              <label key={f.key} title={f.hilfe}>
                <span>{f.label}</span>
                <input className="admin-form-input" type="number" inputMode="numeric" aria-label={f.label}
                  value={draft[f.key]}
                  onChange={e => setDraft({ ...draft, [f.key]: zahl(e.target.value) })} />
              </label>
            ))}
          </div>
          {fehler && <div className="admin-form-error" role="alert">{fehler}</div>}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-secondary" onClick={() => setDraft(structuredClone(info.defaults))}>
            Vorgaben
          </button>
          <button className="admin-btn admin-btn-primary" disabled={laeuft} onClick={() => void speichern()}>
            {laeuft ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Reiter «Ferienkonten» der Ferienplanung (docs/specs/ferienplanung.md §5, §9 — E7):
// je Person Anspruch, Übertrag, Korrektur, bezogen, geplant, Rest und die gesetzlichen
// Hinweise (P1/P3/P7/P8/P9). Nichts wirkt automatisch: eine Kürzung ist eine Korrektur
// von Hand, Krankheit in den Ferien wird erst auf Knopfdruck herausgenommen.
// Ändern darf, wer freigibt; den Jahresabschluss macht die Geschäftsleitung.
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  aendereKonto, ferienKuerzen, getKonten, jahresabschluss, kontoFehlerText,
  type FerienKonten, type FerienKonto, type KontoHinweis,
} from '../../api/admin/ferienkonten'
import { queryClient } from '../../shared/queryClient'
import { ToastHost, useToast } from '../components/useToast'
import { PLANER_KEY } from './Plantafel'
import './ferienplanung.css'

export const KONTEN_KEY = ['ferienplanung', 'konten'] as const

const QUELLE: Record<string, string> = {
  personal: 'persönlich', tenant_default: 'Standard', unter_20: 'unter 20', age_50plus: '50+',
}

function tage(wert: number): string {
  return `${wert > 0 ? '' : wert < 0 ? '−' : ''}${Math.abs(wert)} d`
}

function Hinweise({ hinweise, darfBearbeiten, onKuerzen }: {
  hinweise: KontoHinweis[]
  darfBearbeiten: boolean
  onKuerzen: (absenceId: string) => void
}) {
  if (!hinweise.length) return null
  return (
    <div className="ferien-befunde">
      {hinweise.map((h, i) => (
        <span key={`${h.code}-${i}`} className="ferien-befund ferien-befund-weich ferien-hinweis"
          title={h.gesetz ? `${h.text} [${h.gesetz}]` : h.text}>
          {h.text}{h.gesetz && ` [${h.gesetz}]`}
          {h.code === 'P8' && darfBearbeiten && h.absence_id && (
            <button className="admin-btn admin-btn-secondary admin-btn-sm ferien-hinweis-knopf"
              onClick={() => onKuerzen(h.absence_id as string)}>Ferien um {h.tage} Tage kürzen</button>
          )}
        </span>
      ))}
    </div>
  )
}

function Bearbeiten({ konto, jahr, onFertig }: { konto: FerienKonto; jahr: number; onFertig: (meldung: string, fehler?: boolean) => void }) {
  const [uebertrag, setUebertrag] = useState(String(konto.uebertrag))
  const [korrektur, setKorrektur] = useState(String(konto.korrektur))
  const [notiz, setNotiz] = useState(konto.notiz)

  async function sichern() {
    try {
      await aendereKonto(konto.staff_id, jahr, {
        uebertrag_tage: Number(uebertrag) || 0, korrektur_tage: Number(korrektur) || 0, notiz: notiz.trim(),
      })
      onFertig('Ferienkonto gespeichert')
    } catch (err) {
      onFertig(kontoFehlerText(err), true)
    }
  }

  return (
    <div className="ferien-panel" aria-label={`Ferienkonto ${konto.name}`}>
      <div className="admin-section-title">{konto.name} · {jahr}</div>
      <div className="ferien-formular">
        <label className="admin-form-group">
          <span className="admin-form-label">Übertrag aus {jahr - 1} (Tage)</span>
          <input className="admin-form-input" type="number" step="0.5" aria-label="Übertrag" value={uebertrag}
            onChange={e => setUebertrag(e.target.value)} />
        </label>
        <label className="admin-form-group">
          <span className="admin-form-label">Korrektur (Tage, z. B. −2 für eine Kürzung)</span>
          <input className="admin-form-input" type="number" step="0.5" aria-label="Korrektur" value={korrektur}
            onChange={e => setKorrektur(e.target.value)} />
        </label>
        <label className="admin-form-group">
          <span className="admin-form-label">Notiz</span>
          <input className="admin-form-input" aria-label="Notiz" maxLength={500} value={notiz}
            onChange={e => setNotiz(e.target.value)} />
        </label>
      </div>
      <div className="ferien-panel-aktionen">
        <button className="admin-btn admin-btn-primary" onClick={() => void sichern()}>Speichern</button>
        <button className="admin-btn admin-btn-secondary" onClick={() => onFertig('')}>Abbrechen</button>
      </div>
    </div>
  )
}

export function KontenTab() {
  const [jahr, setJahr] = useState(() => new Date().getFullYear())
  const [bearbeitet, setBearbeitet] = useState<FerienKonto | null>(null)
  const [abschluss, setAbschluss] = useState(false)
  const { toast, showToast } = useToast()
  const { data, isLoading, isError } = useQuery<FerienKonten>(
    { queryKey: [...KONTEN_KEY, jahr], queryFn: () => getKonten(jahr) }, queryClient)

  async function neuLaden() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KONTEN_KEY }),
      queryClient.invalidateQueries({ queryKey: PLANER_KEY }),
    ])
  }

  function fertig(meldung: string, fehler = false) {
    setBearbeitet(null)
    if (meldung) showToast(meldung, fehler ? 'error' : 'success')
    if (!fehler) void neuLaden()
  }

  async function kuerzen(absenceId: string) {
    try {
      const r = await ferienKuerzen(absenceId)
      fertig(`Ferien um ${r.tage} Tage gekürzt`)
    } catch (err) {
      fertig(kontoFehlerText(err), true)
    }
  }

  async function abschliessen() {
    setAbschluss(false)
    try {
      const r = await jahresabschluss(jahr)
      fertig(`Jahresabschluss ${r.jahr}: ${r.uebertrag_summe} Tage nach ${r.jahr + 1} übertragen`)
    } catch (err) {
      fertig(kontoFehlerText(err), true)
    }
  }

  const konten = data?.konten ?? []
  return (
    <div className="admin-table-wrap ferien-panel">
      <div className="ferien-toolbar">
        <button className="admin-btn admin-btn-secondary admin-btn-sm" aria-label="Vorjahr" onClick={() => setJahr(j => j - 1)}>‹</button>
        <span className="ferien-toolbar-titel">Ferienkonten {jahr}</span>
        <button className="admin-btn admin-btn-secondary admin-btn-sm" aria-label="Folgejahr" onClick={() => setJahr(j => j + 1)}>›</button>
        {data?.darf_abschliessen && jahr <= new Date().getFullYear() && (
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => setAbschluss(true)}>
            Jahresabschluss {jahr}
          </button>
        )}
      </div>

      {abschluss && (
        <div className="ferien-panel" role="dialog" aria-label="Jahresabschluss">
          <p>
            Der Rest jeder Person wird als Übertrag nach {jahr + 1} gebucht (mit Herkunftsjahr, für die
            Verjährung nach 5 Jahren). Wiederholbar, solange {jahr + 1} nicht abgeschlossen ist — eine
            Korrektur in {jahr + 1} bleibt stehen.
          </p>
          <div className="ferien-panel-aktionen">
            <button className="admin-btn admin-btn-primary" onClick={() => void abschliessen()}>Abschliessen</button>
            <button className="admin-btn admin-btn-secondary" onClick={() => setAbschluss(false)}>Abbrechen</button>
          </div>
        </div>
      )}

      {isLoading && <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>}
      {isError && <div className="admin-form-error" role="alert">Ferienkonten konnten nicht geladen werden.</div>}
      {data && konten.length === 0 && <p className="admin-empty">Keine aktiven Mitarbeitenden.</p>}
      {konten.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Person</th>
              <th className="ferien-konto-zahl">Anspruch</th>
              <th className="ferien-konto-zahl">Übertrag</th>
              <th className="ferien-konto-zahl">Korrektur</th>
              <th className="ferien-konto-zahl">Bezogen</th>
              <th className="ferien-konto-zahl">Geplant</th>
              <th className="ferien-konto-zahl">Rest</th>
              <th>Hinweise</th>
              {data?.darf_bearbeiten && <th />}
            </tr>
          </thead>
          <tbody>
            {konten.map(k => (
              <tr key={k.staff_id} data-testid="ferien-konto">
                <td className="primary">
                  {k.name}{k.abgeschlossen && <span className="secondary" title="Jahr abgeschlossen"> ✓</span>}
                  {k.notiz && <div className="secondary">{k.notiz}</div>}
                </td>
                <td className="ferien-konto-zahl" title={QUELLE[k.quelle] ?? k.quelle}>{tage(k.anspruch)}</td>
                <td className="ferien-konto-zahl">{tage(k.uebertrag)}</td>
                <td className="ferien-konto-zahl">{tage(k.korrektur)}</td>
                <td className="ferien-konto-zahl">{tage(k.bezogen)}</td>
                <td className="ferien-konto-zahl">{tage(k.geplant)}</td>
                <td className="ferien-konto-zahl"><strong>{tage(k.rest)}</strong></td>
                <td>
                  <Hinweise hinweise={k.hinweise} darfBearbeiten={!!data?.darf_bearbeiten}
                    onKuerzen={id => void kuerzen(id)} />
                </td>
                {data?.darf_bearbeiten && (
                  <td>
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setBearbeitet(k)}>
                      Bearbeiten
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {bearbeitet && <Bearbeiten key={bearbeitet.staff_id} konto={bearbeitet} jahr={jahr} onFertig={fertig} />}
      <ToastHost toast={toast} />
    </div>
  )
}

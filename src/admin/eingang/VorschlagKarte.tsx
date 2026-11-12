import { useId, useRef, useState } from 'react'
import {
  acceptMailVorschlag, rejectMailVorschlag,
  type EingangVorschlag, type VorschlagEntscheid,
} from '../../api/admin/mailEingang'
import type { ProjectTab } from '../operative/projectDetail/ProjectTabBar'
import type { AdminScreen } from '../useAdminNav'
import EingangProjektAuswahl from './EingangProjektAuswahl'
import KontaktErgaenzen from './KontaktErgaenzen'
import {
  ENTWURF_FELDER, NOTIZ_MAX, acceptPayload, entscheidText, ergebnisHinweis, ergebnisZiel,
  fehltZumUebernehmen, fmtGroesse, istBekannterTyp, startEingabe, typTitel, uebernehmenLabel,
  type VorschlagEingabe,
} from './mailEingang'

/**
 * Ein Vorschlag aus dem Mail-Eingang — docs/specs/mail-eingang-triage.md §4.
 *
 * Solange er offen ist, sind genau die Felder editierbar, die der Server beim
 * Übernehmen überschreiben lässt. Geschrieben wird erst mit «Übernehmen»; danach
 * steht hier, wer wann entschieden hat und wo das Ergebnis liegt.
 *
 * «Kontakt ergänzen» ist die Ausnahme (§4.2): sein Knopf öffnet die Kundenmaske
 * (KontaktErgaenzen.tsx), und übernommen wird erst, nachdem dort gespeichert ist.
 */

export type EntscheidArt = 'accept' | 'reject'

interface Props {
  itemId: string
  vorschlag: EingangVorschlag
  onEntschieden: (entscheid: VorschlagEntscheid, art: EntscheidArt) => void
  /** Fehler beim Entscheiden — der Screen meldet ihn und lädt bei 409 neu. */
  onFehler: (fehler: unknown, art: EntscheidArt) => void
  /** `tab`: der Reiter der Projektmaske, auf dem das Ergebnis liegt. */
  onNav?: (screen: AdminScreen, detailId?: string, tab?: ProjectTab) => void
}

export default function VorschlagKarte({ itemId, vorschlag: v, onEntschieden, onFehler, onNav }: Props) {
  const feldId = useId()
  const [eingabe, setEingabe] = useState<VorschlagEingabe>(() => startEingabe(v))
  const [laeuft, setLaeuft] = useState<EntscheidArt | null>(null)
  // Zusätzlich zum `disabled` der Knöpfe: zwei Klicks im selben Augenblick
  // kommen beide an, bevor React den gesperrten Knopf gerendert hat.
  const sperre = useRef(false)

  const offen = v.status === 'offen'
  const bekannt = istBekannterTyp(v.typ)
  const fehlt = offen ? fehltZumUebernehmen(v, eingabe) : null

  function setFeld(key: string, wert: string) {
    setEingabe(prev => ({ ...prev, felder: { ...prev.felder, [key]: wert } }))
  }

  async function entscheiden(art: EntscheidArt) {
    if (sperre.current) return
    sperre.current = true
    setLaeuft(art)
    try {
      const entscheid = art === 'accept'
        ? await acceptMailVorschlag(itemId, v.id, acceptPayload(v, eingabe))
        : await rejectMailVorschlag(itemId, v.id)
      onEntschieden(entscheid, art)
    } catch (e) {
      onFehler(e, art)
    } finally {
      sperre.current = false
      setLaeuft(null)
    }
  }

  const textFeld = (label: string) => (
    <label className="admin-form-group eingang-feld-breit" htmlFor={`${feldId}-text`}>
      <span className="admin-form-label">{label}</span>
      <textarea
        id={`${feldId}-text`}
        className="admin-form-input"
        rows={4}
        maxLength={NOTIZ_MAX}
        value={eingabe.felder.text ?? ''}
        disabled={laeuft !== null}
        onChange={e => setFeld('text', e.target.value)}
      />
    </label>
  )

  // Der Dateiname ist Fremdtext aus der Mail: als Textknoten, nie als Link.
  const datei = (name: string, size: number) => (
    <dl className="eingang-werte">
      <div><dt>Datei:</dt><dd>{[name?.trim() || '(ohne Namen)', fmtGroesse(size)].filter(Boolean).join(' · ')}</dd></div>
    </dl>
  )

  function formular() {
    switch (v.typ) {
      case 'projekt_entwurf':
        return (
          <div className="eingang-felder">
            {ENTWURF_FELDER.map(f => (
              <label key={f.key} htmlFor={`${feldId}-${f.key}`}
                     className={`admin-form-group${f.mehrzeilig ? ' eingang-feld-breit' : ''}`}>
                <span className="admin-form-label">{f.label}</span>
                {f.mehrzeilig ? (
                  <textarea id={`${feldId}-${f.key}`} className="admin-form-input" rows={4} maxLength={f.max}
                            value={eingabe.felder[f.key] ?? ''} disabled={laeuft !== null}
                            onChange={e => setFeld(f.key, e.target.value)} />
                ) : (
                  <input id={`${feldId}-${f.key}`} className="admin-form-input" type="text" autoComplete="off"
                         maxLength={f.max}
                         value={eingabe.felder[f.key] ?? ''} disabled={laeuft !== null}
                         onChange={e => setFeld(f.key, e.target.value)} />
                )}
              </label>
            ))}
          </div>
        )
      case 'projektnotiz':
        return (
          <div className="eingang-felder">
            <div className="eingang-feld-breit">
              <EingangProjektAuswahl
                candidates={v.payload.projects ?? []}
                selected={eingabe.projekt}
                disabled={laeuft !== null}
                onPick={p => setEingabe(prev => ({ ...prev, projekt: p }))}
              />
            </div>
            {textFeld('Notiz')}
          </div>
        )
      case 'kundennotiz':
        return (
          <div className="eingang-felder">
            <div className="eingang-hinweis eingang-feld-breit">Kunde: {v.payload.customer_name}</div>
            {textFeld('Notiz')}
          </div>
        )
      case 'kontakt_ergaenzen':
        return (
          <dl className="eingang-werte">
            <div><dt>Kunde:</dt><dd>{v.payload.customer_name}</dd></div>
            <div><dt>{v.payload.feld_label}:</dt><dd>{v.payload.wert}</dd></div>
          </dl>
        )
      case 'projektdokument':
        return (
          <div className="eingang-felder">
            <div className="eingang-feld-breit">{datei(v.payload.filename, v.payload.size)}</div>
            <div className="eingang-feld-breit">
              <EingangProjektAuswahl
                candidates={v.payload.projects ?? []}
                selected={eingabe.projekt}
                disabled={laeuft !== null}
                onPick={p => setEingabe(prev => ({ ...prev, projekt: p }))}
              />
            </div>
          </div>
        )
      default:
        return null
    }
  }

  /** Ein entschiedener Vorschlag: nur noch lesen. */
  function werte() {
    switch (v.typ) {
      case 'projekt_entwurf':
        return (
          <dl className="eingang-werte">
            {ENTWURF_FELDER.filter(f => (v.payload[f.key] ?? '').trim()).map(f => (
              <div key={f.key}><dt>{f.label}:</dt><dd>{v.payload[f.key]}</dd></div>
            ))}
          </dl>
        )
      case 'projektnotiz':
        return <dl className="eingang-werte"><div><dt>Notiz:</dt><dd>{v.payload.text}</dd></div></dl>
      case 'kundennotiz':
        return (
          <dl className="eingang-werte">
            <div><dt>Kunde:</dt><dd>{v.payload.customer_name}</dd></div>
            <div><dt>Notiz:</dt><dd>{v.payload.text}</dd></div>
          </dl>
        )
      case 'kontakt_ergaenzen':
        return formular()
      case 'projektdokument':
        return datei(v.payload.filename, v.payload.size)
      default:
        return null
    }
  }

  const entscheid = entscheidText(v)
  const hinweis = ergebnisHinweis(v)
  const ziel = ergebnisZiel(v)

  return (
    <div className="eingang-vorschlag" data-testid={`vorschlag-${v.id}`}>
      <div className="eingang-vorschlag-titel">{typTitel(v.typ)}</div>

      {offen ? formular() : werte()}

      {offen && !bekannt && (
        <div className="eingang-hinweis">Diesen Vorschlag kennt die App noch nicht — er lässt sich nur verwerfen.</div>
      )}

      {offen ? (
        <div className="eingang-aktionen">
          {bekannt && v.typ === 'kontakt_ergaenzen' && (
            // Erst die Kundenmaske, dann das Bestätigen: der Server prüft beim
            // `accept` nur noch, dass das Feld beim Kunden gefüllt ist.
            <KontaktErgaenzen
              customerId={v.payload.customer_id}
              feld={v.payload.feld}
              wert={v.payload.wert}
              disabled={laeuft !== null}
              bestaetigt={laeuft === 'accept'}
              onGespeichert={() => void entscheiden('accept')}
            />
          )}
          {bekannt && v.typ !== 'kontakt_ergaenzen' && (
            <button type="button" className="admin-btn admin-btn-primary admin-btn-sm"
                    disabled={laeuft !== null || fehlt !== null} onClick={() => void entscheiden('accept')}>
              {uebernehmenLabel(v.typ, laeuft === 'accept')}
            </button>
          )}
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  disabled={laeuft !== null} onClick={() => void entscheiden('reject')}>
            {laeuft === 'reject' ? 'Wird verworfen…' : 'Verwerfen'}
          </button>
          {bekannt && fehlt && <span className="eingang-hinweis">{fehlt}</span>}
        </div>
      ) : (
        <>
          <div className={`eingang-entscheid${v.status === 'uebernommen' ? ' uebernommen' : ''}`}>{entscheid}</div>
          {hinweis && <div className="eingang-hinweis">{hinweis}</div>}
          {ziel && onNav && (
            <div className="eingang-aktionen">
              <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => ('detailId' in ziel ? onNav(ziel.screen, ziel.detailId, ziel.tab) : onNav(ziel.screen))}>
                {ziel.label}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

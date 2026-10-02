/**
 * Projektauswahl der Kunden-Rückmeldung — suchen, filtern, anhaken.
 *
 * Spec: docs/specs/kunden-rueckmeldung-kampagne.md §8.
 *
 * Angeschrieben wird nur, was hier angehakt ist. Die Namensregel der Kampagne
 * («HS» als Wort) ist ein Filter, der vorbelegt ist — kein Automatismus. Der
 * Server prüft die Auswahl beim Versand noch einmal (Kundenprojekt, Status,
 * Mandant); eine veraltete Liste kann also niemanden anschreiben, der nicht
 * ohnehin in Frage kam.
 *
 * Gefiltert wird im Browser: gut 500 Zeilen, und jeder Klick auf einen Filter
 * soll sofort wirken statt eine Runde zum Server zu drehen.
 */
import { useMemo, useState } from 'react'
import type { AuswahlProjekt } from '../../api/rueckmeldung'
import {
  auswaehlbar, filtere, sperrGrund, FILTER_START, OFFERTE_LABEL, UMFRAGE_LABEL,
  type EmailFilter, type Filter, type OfferteFilter, type UmfrageFilter,
} from './rueckmeldungFilter'

function csvZelle(v: string): string {
  // Formel-Anfänge neutralisieren — Kundennamen kommen aus der Datenbank, aber
  // irgendwann hat sie jemand eingetippt.
  const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

function ladeCsv(zeilen: AuswahlProjekt[]) {
  const kopf = ['Projekt-Nr', 'Projekt', 'Kunde', 'E-Mail', 'Objekt', 'Offerte', 'Umfrage']
  const text = [kopf, ...zeilen.map((p) => [
    p.projekt_nr, p.projekt_name, p.kunde_name, p.email || '(keine)', p.objekt_adresse,
    OFFERTE_LABEL[p.offerte], UMFRAGE_LABEL[p.umfrage],
  ])].map((z) => z.map(csvZelle).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'Projektauswahl.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface Props {
  projekte: AuswahlProjekt[]
  regelText: string
  auswahl: Set<string>
  onAuswahl: (neu: Set<string>) => void
  gesperrt?: boolean
}

export default function RueckmeldungAuswahl({ projekte, regelText, auswahl, onAuswahl, gesperrt = false }: Props) {
  const [f, setF] = useState<Filter>(FILTER_START)
  const sichtbar = useMemo(() => filtere(projekte, f), [projekte, f])
  const sichtbarWaehlbar = sichtbar.filter(auswaehlbar)
  const ohneEmail = projekte.filter((p) => !p.email).length
  const setze = (patch: Partial<Filter>) => setF((alt) => ({ ...alt, ...patch }))

  function umschalten(id: string) {
    const neu = new Set(auswahl)
    if (neu.has(id)) neu.delete(id)
    else neu.add(id)
    onAuswahl(neu)
  }

  function alleSichtbaren() {
    const neu = new Set(auswahl)
    for (const p of sichtbarWaehlbar) neu.add(p.project_id)
    onAuswahl(neu)
  }

  function sichtbareAbwaehlen() {
    const neu = new Set(auswahl)
    for (const p of sichtbar) neu.delete(p.project_id)
    onAuswahl(neu)
  }

  return (
    <div>
      <div className="adminsite-rm-filter">
        <input className="admin-search" type="search" value={f.suche}
               placeholder="Suchen: Projekt, Nummer, Kunde, E-Mail, Adresse, Offerte"
               aria-label="Projekte durchsuchen"
               onChange={(e) => setze({ suche: e.target.value })} />
        <label className="adminsite-rm-check">
          <input type="checkbox" checked={f.nurRegel} onChange={(e) => setze({ nurRegel: e.target.checked })} />
          Nur Kampagnen-Regel <code>{regelText}</code>
        </label>
        <label className="admin-form-group">
          <span className="admin-form-label">Offerte</span>
          <select className="admin-form-select" value={f.offerte} aria-label="Filter Offerte"
                  onChange={(e) => setze({ offerte: e.target.value as OfferteFilter })}>
            <option value="alle">alle</option>
            <option value="versendet">versendet</option>
            <option value="nicht_versendet">nicht versendet</option>
            <option value="keine">keine Offerte</option>
          </select>
        </label>
        <label className="admin-form-group">
          <span className="admin-form-label">E-Mail</span>
          <select className="admin-form-select" value={f.email} aria-label="Filter E-Mail"
                  onChange={(e) => setze({ email: e.target.value as EmailFilter })}>
            <option value="alle">alle</option>
            <option value="mit">mit Adresse</option>
            <option value="ohne">ohne Adresse</option>
          </select>
        </label>
        <label className="admin-form-group">
          <span className="admin-form-label">Umfrage</span>
          <select className="admin-form-select" value={f.umfrage} aria-label="Filter Umfrage"
                  onChange={(e) => setze({ umfrage: e.target.value as UmfrageFilter })}>
            <option value="alle">alle</option>
            <option value="offen">noch nicht angeschrieben</option>
            <option value="angeschrieben">angeschrieben</option>
            <option value="beantwortet">beantwortet</option>
          </select>
        </label>
      </div>

      <div className="adminsite-rm-auswahlzeile">
        <span>
          <strong>{sichtbar.length}</strong> von {projekte.length} offenen Projekten sichtbar
          {' · '}<strong>{auswahl.size}</strong> ausgewählt
          {ohneEmail > 0 && <> · {ohneEmail} ohne E-Mail</>}
        </span>
        <span className="adminsite-rm-knoepfe">
          <button type="button" className="admin-btn admin-btn-secondary" disabled={gesperrt || sichtbarWaehlbar.length === 0}
                  onClick={alleSichtbaren}>
            Sichtbare auswählen ({sichtbarWaehlbar.length})
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" disabled={gesperrt || auswahl.size === 0}
                  onClick={sichtbareAbwaehlen}>
            Sichtbare abwählen
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" disabled={sichtbar.length === 0}
                  onClick={() => ladeCsv(sichtbar)}>
            Sichtbare als CSV
          </button>
        </span>
      </div>

      <div className="admin-table-wrap adminsite-rm-tabelle">
        <table className="admin-table">
          <thead>
            <tr>
              <th aria-label="Auswahl" />
              <th>Projekt-Nr.</th><th>Projekt</th><th>Kunde</th><th>E-Mail</th><th>Offerte</th><th>Umfrage</th>
            </tr>
          </thead>
          <tbody>
            {sichtbar.map((p) => {
              const grund = sperrGrund(p)
              return (
                <tr key={p.project_id}>
                  <td>
                    <input type="checkbox" aria-label={`${p.projekt_name} auswählen`}
                           checked={auswahl.has(p.project_id)}
                           disabled={gesperrt || (!!grund && !auswahl.has(p.project_id))}
                           title={grund || undefined}
                           onChange={() => umschalten(p.project_id)} />
                  </td>
                  <td>{p.projekt_nr}</td>
                  <td>
                    {p.projekt_name}
                    {p.objekt_adresse && <div className="admin-form-hint">{p.objekt_adresse}</div>}
                  </td>
                  <td>{p.kunde_name || '—'}</td>
                  <td>
                    {p.email
                      ? p.email
                      : <span className="admin-badge admin-badge-rejected">keine E-Mail</span>}
                  </td>
                  <td>
                    <span className={`admin-badge ${p.offerte === 'versendet' ? 'admin-badge-approved' : p.offerte === 'entwurf' ? 'admin-badge-pending' : 'admin-badge-draft'}`}
                          title={p.offerten.join(', ') || undefined}>
                      {OFFERTE_LABEL[p.offerte]}
                    </span>
                  </td>
                  <td>{UMFRAGE_LABEL[p.umfrage]}</td>
                </tr>
              )
            })}
            {sichtbar.length === 0 && (
              <tr><td colSpan={7} className="admin-empty">Keine Projekte für diese Filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

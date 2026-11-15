import type { EingangAufgabe, EingangZustaendigkeiten } from '../../api/admin/mailEingang'

/**
 * Das Organigramm im Eingang, nur lesend — docs/specs/mail-eingang-zustaendigkeiten.md §3, §7.4.
 *
 * Das Büro soll wissen, wer was macht, ohne den Betreiber zu fragen. Ein Block
 * je Aufgabe, nur wirksame Einträge, nur Namen — keine Rollen, keine Zahlen.
 */

interface Props {
  katalog: readonly EingangAufgabe[]
  zust: EingangZustaendigkeiten
  onClose: () => void
}

export default function ZustaendigkeitenAnsicht({ katalog, zust, onClose }: Props) {
  const namen = (ids: readonly string[]) => ids.map(id => zust.personen[id] ?? 'Ohne Namen').join(', ')
  return (
    <section className="eingang-organigramm" aria-label="Zuständigkeiten">
      <div className="eingang-organigramm-kopf">
        <strong>Zuständigkeiten</strong>
        <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm" onClick={onClose}>
          Schliessen
        </button>
      </div>
      <div className="eingang-organigramm-bloecke">
        {katalog.map(a => {
          const b = zust.aufgaben[a.key]
          const niemand = !b || b.zustaendig.length + b.stellvertretung.length === 0
          return (
            <div key={a.key} className="eingang-organigramm-block">
              <div className="eingang-organigramm-titel">{a.label}</div>
              {niemand ? (
                <div className="eingang-hinweis">Niemand zuständig — diese Mails sehen alle.</div>
              ) : (
                <dl>
                  <dt>Zuständig</dt>
                  <dd>{b.zustaendig.length ? namen(b.zustaendig) : '—'}</dd>
                  <dt>Stellvertretung</dt>
                  <dd>{b.stellvertretung.length ? namen(b.stellvertretung) : '—'}</dd>
                </dl>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

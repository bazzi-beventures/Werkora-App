import { useEffect, useState } from 'react'
import {
  dismissMailEingang, listMailEingang,
  type EingangAnsicht, type EingangItem, type EingangListe, type VorschlagEntscheid,
} from '../../api/admin/mailEingang'
import { ApiError } from '../../api/client'
import { BetaBadge } from '../../shared/BetaBadge'
import { abgewiesenZeile } from '../../shared/mailEingangGruende'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useToast, ToastHost } from '../components/useToast'
import type { ProjectTab } from '../operative/projectDetail/ProjectTabBar'
import type { AdminScreen } from '../useAdminNav'
import EingangKarte from './EingangKarte'
import type { EntscheidArt } from './VorschlagKarte'
import { neuesteZuerst, serverSatz } from './mailEingang'
import './eingang.css'

/**
 * «Eingang» des Büros — docs/specs/mail-eingang-triage.md §10.
 *
 * Mails, die jemand aus dem Betrieb ans Triage-Postfach weitergeleitet hat,
 * stehen hier als Karten mit Vorschlägen. **Nichts wird ohne Klick geschrieben**
 * (§4.3): übernehmen oder verwerfen entscheidet ein Mensch, je Vorschlag.
 *
 * Neueste zuoberst — anders als im Lieferschein-Eingang: dort wartet ein Bild,
 * hier eine Anfrage, und die jüngste ist die, an die sich jemand gerade erinnert.
 *
 * Bewusst **kein** Filter und keine Zählung je Mitarbeiter (§7.4): «weitergeleitet
 * von» steht an der Karte, mehr wird daraus nicht.
 */

interface Props {
  /** Nach jedem Entscheid: Zahl am Navigationspunkt neu laden. */
  onChanged?: () => void
  onNav?: (screen: AdminScreen, detailId?: string, tab?: ProjectTab) => void
}

const ANSICHTEN: { key: EingangAnsicht; label: string }[] = [
  { key: 'offen', label: 'Offen' },
  { key: 'erledigt', label: 'Erledigt' },
]

export default function MailEingangScreen({ onChanged, onNav }: Props) {
  const [ansicht, setAnsicht] = useState<EingangAnsicht>('offen')
  const [liste, setListe] = useState<EingangListe | null>(null)
  const [failed, setFailed] = useState(false)
  // Hochzählen lädt neu, ohne die Liste vorher zu leeren — offene Karten und
  // halb ausgefüllte Felder überleben so das Nachladen.
  const [ladeTick, setLadeTick] = useState(0)
  const [dismissFor, setDismissFor] = useState<EingangItem | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const { toast, showToast } = useToast(4500)

  useEffect(() => {
    let aktiv = true
    listMailEingang(ansicht)
      .then(l => { if (aktiv) { setListe(l); setFailed(false) } })
      .catch(() => { if (aktiv) setFailed(true) })
    return () => { aktiv = false }
  }, [ansicht, ladeTick])

  function wechsle(next: EingangAnsicht) {
    if (next === ansicht) return
    setListe(null)
    setFailed(false)
    setAnsicht(next)
  }

  const neuLaden = () => setLadeTick(t => t + 1)

  function onEntschieden(itemId: string, entscheid: VorschlagEntscheid, art: EntscheidArt) {
    // Die Karte bleibt stehen, auch wenn die Mail damit erledigt ist: dort steht
    // jetzt, wer übernommen hat und wo das Ergebnis liegt.
    setListe(l => l && {
      ...l,
      items: l.items.map(i => i.id !== itemId ? i : {
        ...i,
        status: entscheid.item_status,
        suggestions: i.suggestions.map(v => v.id === entscheid.suggestion.id ? entscheid.suggestion : v),
      }),
    })
    showToast(art === 'accept' ? 'Vorschlag übernommen' : 'Vorschlag verworfen', 'success')
    onChanged?.()
  }

  function onFehler(fehler: unknown, art: EntscheidArt) {
    const satz = fehler instanceof ApiError ? serverSatz(fehler.message) : null
    if (fehler instanceof ApiError && fehler.status === 409) {
      // Jemand war schneller (oder das Feld beim Kunden ist inzwischen gefüllt).
      // Nicht still übergehen — sagen und den Stand holen.
      showToast(`${satz ?? 'Dieser Vorschlag wurde inzwischen von jemand anderem bearbeitet.'} `
        + 'Der Eingang wurde neu geladen.', 'info')
      neuLaden()
      onChanged?.()
      return
    }
    const was = art === 'accept' ? 'Übernehmen' : 'Verwerfen'
    showToast(satz ? `${was} fehlgeschlagen: ${satz}` : `${was} fehlgeschlagen`, 'error')
  }

  async function dismiss() {
    const item = dismissFor
    if (!item || dismissing) return
    setDismissing(true)
    try {
      await dismissMailEingang(item.id)
      setListe(l => l && { ...l, items: l.items.filter(i => i.id !== item.id) })
      showToast('Verworfen — die Zusammenfassung ist gelöscht, die Mail bleibt im Postfach.', 'success')
      onChanged?.()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        showToast('Diese Mail wurde inzwischen von jemand anderem bearbeitet. Der Eingang wurde neu geladen.', 'info')
        onChanged?.()
      } else {
        showToast('Verwerfen fehlgeschlagen', 'error')
      }
      neuLaden()
    } finally {
      setDismissing(false)
      setDismissFor(null)
    }
  }

  const items = liste ? neuesteZuerst(liste.items) : []
  const offene = items.filter(i => i.status === 'offen').length
  const abgewiesen = liste ? abgewiesenZeile(liste.abgewiesen, liste.abgewiesen_tage) : null

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Eingang <BetaBadge /></div>
          <div className="admin-page-subtitle">
            {liste === null
              ? (failed ? 'Weitergeleitete Mails als Vorschläge' : 'Laden…')
              : ansicht === 'offen'
                ? `${offene} offen — weitergeleitete Mails als Vorschläge`
                : `${items.length} erledigt`}
          </div>
        </div>
        <div className="eingang-umschalter" role="group" aria-label="Ansicht">
          {ANSICHTEN.map(a => (
            <button
              key={a.key}
              type="button"
              className={`admin-btn ${ansicht === a.key ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
              aria-pressed={ansicht === a.key}
              onClick={() => wechsle(a.key)}
              style={{ fontSize: 13 }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Damit eine falsch gepflegte Domain-Liste auffällt, statt still alles zu
          verschlucken (Spec §6.4). Nur Zähler — über Abgewiesenes gibt es sonst nichts. */}
      {abgewiesen && (
        <div className="admin-form-hint-warn eingang-abgewiesen" role="note">{abgewiesen}</div>
      )}

      {liste === null && !failed && (
        <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
      )}
      {liste === null && failed && (
        <div role="alert" className="admin-error">
          Der Eingang konnte nicht geladen werden.{' '}
          <button type="button" className="admin-btn admin-btn-secondary admin-btn-sm"
                  onClick={() => { setFailed(false); neuLaden() }}>
            Erneut versuchen
          </button>
        </div>
      )}
      {liste !== null && items.length === 0 && (
        <div className="admin-empty">
          {ansicht === 'offen'
            ? 'Der Eingang ist leer — keine weitergeleitete Mail wartet.'
            : 'Noch nichts erledigt.'}
        </div>
      )}
      {liste !== null && items.length > 0 && (
        <div className="eingang-liste">
          {items.map(item => (
            <EingangKarte
              key={item.id}
              item={item}
              busy={dismissing && dismissFor?.id === item.id}
              onEntschieden={onEntschieden}
              onFehler={onFehler}
              onDismiss={setDismissFor}
              onNav={onNav}
            />
          ))}
        </div>
      )}

      {dismissFor && (
        <ConfirmDialog
          title="Nicht für Werkora?"
          message={<>
            Alle Vorschläge zu «{dismissFor.subject?.trim() || '(ohne Betreff)'}» werden verworfen und die
            Zusammenfassung wird sofort gelöscht. Die Mail selbst bleibt unverändert im Postfach.
          </>}
          confirmLabel="Ja, verwerfen"
          variant="danger"
          busy={dismissing}
          busyLabel="Wird verworfen…"
          onConfirm={() => void dismiss()}
          onCancel={() => setDismissFor(null)}
        />
      )}
      <ToastHost toast={toast} />
    </div>
  )
}

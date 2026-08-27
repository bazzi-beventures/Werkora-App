import { ApiError } from '../../api/client'

type DescPriceRow = { description: string; total_price: string }

/** Fehlertext für den Lieferanten-PDF-Upload (OCR) — geteilt von Erstell- und Bearbeiten-Formular.
 *
 * Der OCR-Endpoint läuft lange (Mistral OCR + Retries). Bricht dabei die Verbindung ab,
 * liefert der Client ApiError(0) mit dem generischen Text "Keine Internetverbindung" —
 * was hier fast immer falsch ist: nicht das Gerät ist offline, sondern der Edge-Proxy
 * hat die Verbindung gekappt, während die Analyse noch lief. Deshalb hier ein eigener,
 * ehrlicher Text; nur wenn der Browser sich selbst als offline meldet, bleibt es bei
 * der Offline-Aussage. */
export function pdfUploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'Keine Internetverbindung — die PDF konnte nicht gesendet werden. Bitte erneut versuchen.'
      : 'Die Verbindung zum Server ist abgebrochen, bevor die PDF-Analyse fertig war. Bitte erneut versuchen.'
  }
  if (err instanceof Error && err.message.trim()) return err.message
  return 'PDF-Extraktion fehlgeschlagen. Bitte erneut versuchen.'
}

interface DescPriceFieldsetProps<T extends DescPriceRow> {
  title: string
  rows: T[]
  onChange: (rows: T[]) => void
  addLabel: string
  defaultDescription?: string
}

export function DescPriceFieldset<T extends DescPriceRow>({
  title, rows, onChange, addLabel, defaultDescription = '',
}: DescPriceFieldsetProps<T>) {
  function update(i: number, patch: Partial<DescPriceRow>) {
    onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function remove(i: number) {
    onChange(rows.filter((_, j) => j !== i))
  }
  function add() {
    onChange([...rows, { description: defaultDescription, total_price: '' } as T])
  }
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>{title}</legend>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input className="admin-form-input" style={{ flex: 3 }} placeholder="Beschreibung" value={row.description}
            onChange={e => update(i, { description: e.target.value })} />
          <input className="admin-form-input" style={{ flex: 1 }} placeholder="Betrag CHF" value={row.total_price}
            onChange={e => update(i, { total_price: e.target.value })} />
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => remove(i)} title="Entfernen">✕</button>
        </div>
      ))}
      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={add}>{addLabel}</button>
    </fieldset>
  )
}

interface DiscountsFieldsetProps {
  laborDiscount: string
  materialDiscount: string
  fixedPrice: string
  onLaborChange: (v: string) => void
  onMaterialChange: (v: string) => void
  onFixedPriceChange: (v: string) => void
}

/** Ist ein brauchbarer Fixpreis eingetippt? Bestimmt, ob das Material-%-Feld gesperrt
 *  wird — bewusst dieselbe Regel wie im Backend (`_normalize_fixed_price`): alles,
 *  was nicht als Zahl > 0 lesbar ist, heisst "kein Fixpreis". Sonst sperrte ein
 *  halb getippter Wert das Prozentfeld, ohne dass der Fixpreis je wirkt. */
export function hasFixedPrice(raw: string): boolean {
  return parseFloat(raw.replace(',', '.')) > 0
}

export function DiscountsFieldset({
  laborDiscount, materialDiscount, fixedPrice,
  onLaborChange, onMaterialChange, onFixedPriceChange,
}: DiscountsFieldsetProps) {
  // Fixpreis ersetzt den Material-Rabattsatz (das Backend ignoriert ihn dann) —
  // das Feld wird gesperrt statt still übergangen zu werden.
  const fixed = hasFixedPrice(fixedPrice)
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>Rabatte</legend>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label">Rabatt auf Lohn (%)</label>
          <input className="admin-form-input" placeholder="0" value={laborDiscount} onChange={e => onLaborChange(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Gilt auf Materialpositionen sowie auf Weitere Produkte / Freie Positionen (inkl. per PDF eingelesene Materialien)">Rabatt auf Material &amp; Produkte (%)</label>
          <input className="admin-form-input" placeholder="0" value={materialDiscount} disabled={fixed}
            title={fixed ? 'Deaktiviert, solange ein Fixpreis gesetzt ist' : undefined}
            onChange={e => onMaterialChange(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Endbetrag inkl. MwSt, den der Kunde zahlen soll. Die Differenz zur Kalkulation wird als Rabatt auf Material & Produkte abgezogen.">Fixpreis (CHF, inkl. MwSt)</label>
          <input className="admin-form-input" placeholder="z.B. 5500" value={fixedPrice} onChange={e => onFixedPriceChange(e.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #888)', margin: '8px 8px 0' }}>
        {fixed
          ? 'Der Fixpreis ist das gedruckte Total. Die Differenz zur Kalkulation erscheint als Rabatt auf Material & Produkte; der Material-Rabatt in Prozent ist deshalb deaktiviert. Liegt der Fixpreis über der Kalkulation oder unter Lohn + Fahrt, wird er nicht erreicht — das Total auf der Offerte zeigt dann den tatsächlichen Betrag.'
          : 'Fixpreis leer lassen, um mit Rabatt-Prozenten zu rechnen.'}
      </p>
    </fieldset>
  )
}

interface SkontoFieldsetProps {
  skontoActive: boolean
  skontoPct: string
  skontoDays: string
  onActiveChange: (v: boolean) => void
  onPctChange: (v: string) => void
  onDaysChange: (v: string) => void
  error?: string
}

// Prüft die Skonto-Eingaben, sobald das Häkchen gesetzt ist. Gibt die Meldung zurück
// (null = in Ordnung). Reine Funktion, damit beide Formulare — Erstellen und
// Bearbeiten — dieselbe Regel benutzen und sie unit-testbar bleibt.
//
// Ohne Häkchen wird NICHT geprüft: die Felder dürfen dann stehenbleiben (ein erneutes
// Anhaken bringt die Werte zurück), gespeichert wird trotzdem kein Skonto.
//
// Die Grenzen spiegeln services/quote_service.py::normalize_skonto — weichen sie
// auseinander, meldet entweder das Formular etwas, das der Server akzeptiert, oder
// der Server lehnt etwas ab, das das Formular durchgelassen hat.
export function skontoValidationError(active: boolean, pct: string, days: string): string | null {
  if (!active) return null
  const p = pct.trim()
  if (!p) return 'Skonto ist aktiviert — bitte den Prozentsatz eintragen oder das Häkchen entfernen.'
  const pNum = Number(p.replace(',', '.'))
  if (!Number.isFinite(pNum) || pNum <= 0 || pNum > 100) {
    return 'Skonto-Prozentsatz muss eine Zahl über 0 und höchstens 100 sein.'
  }
  const d = days.trim()
  if (!d) return 'Skonto ist aktiviert — bitte die Zahlungsfrist in Tagen eintragen oder das Häkchen entfernen.'
  const dNum = Number(d.replace(',', '.'))
  if (!Number.isFinite(dNum) || dNum < 0) return 'Zahlungsfrist muss eine Zahl ab 0 Tagen sein.'
  return null
}

// Skonto = Abzug bei früher Zahlung. Reiner Hinweis auf der Offerte (ändert das Total
// NICHT). Der konkrete Satz wird aus dem Begleittext der Offert-Vorlagen
// ({prozent}/{tage}/{betrag}) gebildet.
//
// Das Häkchen ersetzt die frühere Regel "leeres Feld = kein Skonto": die schluckte eine
// vergessene Eingabe wortlos, und die Offerte ging ohne Hinweis zum Kunden. Jetzt ist
// die Absicht explizit und ein angehaktes, aber leeres Feld ein Fehler.
export function SkontoFieldset({
  skontoActive, skontoPct, skontoDays, onActiveChange, onPctChange, onDaysChange, error,
}: SkontoFieldsetProps) {
  return (
    <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20 }}>
      <legend style={{ fontWeight: 600, padding: '0 8px' }}>Skonto</legend>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={skontoActive}
          onChange={e => onActiveChange(e.target.checked)}
        />
        <span>Skonto auf dieser Offerte ausweisen</span>
      </label>
      <div style={{ display: 'flex', gap: 16, opacity: skontoActive ? 1 : 0.5 }}>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Abzug bei Zahlung innerhalb der Frist. Nur ein Hinweis auf der Offerte — das Total bleibt unverändert.">Skonto (%)</label>
          <input
            className="admin-form-input" placeholder="0" value={skontoPct}
            disabled={!skontoActive}
            onChange={e => onPctChange(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="admin-form-label" title="Zahlungsfrist in Tagen, innerhalb der der Skonto gilt">Frist (Tage)</label>
          <input
            className="admin-form-input" placeholder="z.B. 10" value={skontoDays}
            disabled={!skontoActive}
            onChange={e => onDaysChange(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" style={{ fontSize: '0.85rem', color: 'var(--danger, #c0392b)', margin: '8px 8px 0' }}>
          {error}
        </p>
      )}
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted, #888)', margin: '8px 8px 0' }}>
        Nur ein Hinweis auf der Offerte — das Total bleibt unverändert. Der Begleittext stammt aus den Offert-Vorlagen.
      </p>
    </fieldset>
  )
}

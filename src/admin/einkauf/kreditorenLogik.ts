// Reine Helfer der Lieferantenrechnungen — docs/specs/lieferantenrechnung-bexio.md §8.1.
//
// Alles, was rechnet oder entscheidet, steht hier statt in den Komponenten:
// Status-Beschriftung, Summenprüfung, der Filter «Nur meine» und der Bau des
// PATCH aus dem Formular. So ist es ohne DOM testbar (kreditorenLogik.test.ts).

import type {
  CompactProject, KreditorAnsicht, KreditorBucket, KreditorDetail, KreditorLinePatch,
  KreditorPatch, KreditorStatus, KreditorSummary,
} from '../../api/kreditoren'

// ─── Status ──────────────────────────────────────────────────

export const STATUS_LABELS: Record<KreditorStatus, string> = {
  neu: 'Neu',
  zu_pruefen: 'Zu prüfen',
  zu_visieren: 'Zu visieren',
  visiert: 'Visiert',
  uebergeben: 'In bexio',
  gebucht: 'Gebucht',
  bezahlt: 'Bezahlt',
  abgelehnt: 'Abgelehnt',
  verworfen: 'Verworfen',
}

/** Klasse der bestehenden `admin-badge-*`-Pillen je Status. */
const STATUS_BADGE: Record<KreditorStatus, string> = {
  neu: 'draft',
  zu_pruefen: 'pending',
  zu_visieren: 'open',
  visiert: 'approved',
  uebergeben: 'sent',
  gebucht: 'sent',
  bezahlt: 'paid',
  abgelehnt: 'rejected',
  verworfen: 'closed',
}

export function statusLabel(s: KreditorStatus | string): string {
  return STATUS_LABELS[s as KreditorStatus] ?? s
}

export function statusBadgeClass(s: KreditorStatus | string): string {
  return `admin-badge admin-badge-${STATUS_BADGE[s as KreditorStatus] ?? 'draft'}`
}

export const LESE_FEHLER_LABELS: Record<string, string> = {
  kontingent: 'Lese-Kontingent erschöpft — wird im nächsten Lauf gelesen',
  ocr_fehler: 'Lesen fehlgeschlagen',
  unlesbar: 'Beleg nicht lesbar',
}

export function leseFehlerLabel(code: string | null): string {
  if (!code) return 'Lesen fehlgeschlagen'
  return LESE_FEHLER_LABELS[code] ?? 'Lesen fehlgeschlagen'
}

// ─── Reiter ──────────────────────────────────────────────────

export const ANSICHTEN: { key: KreditorAnsicht; label: string }[] = [
  { key: 'zu_pruefen', label: 'Zu prüfen' },
  { key: 'zu_visieren', label: 'Zu visieren' },
  { key: 'visiert', label: 'Visiert' },
  { key: 'alle', label: 'Alle' },
]

/** «Nur meine» im Reiter «Zu visieren»: nur Rechnungen, deren Projektleiter
 *  das angemeldete Konto ist (`meine` setzt der Server). */
export function filterMeine<T extends Pick<KreditorSummary, 'meine'>>(bills: T[], nurMeine: boolean): T[] {
  return nurMeine ? bills.filter(b => b.meine) : bills
}

/** Läuft für irgendeine sichtbare Rechnung noch das Lesen? Dann pollt die Liste. */
export function liestNoch(bills: Pick<KreditorSummary, 'lese_status'>[]): boolean {
  return bills.some(b => b.lese_status === 'laeuft')
}

export const POLL_MS = 4000

// ─── Zahlen ──────────────────────────────────────────────────

/** Toleranz der Summenprüfung — dieselbe wie die Gegenprobe des Servers (§4.3). */
export const SUMMEN_TOLERANZ = 0.05

export function fmtBetrag(n: number | null | undefined, currency = 'CHF'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${currency} ${n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Eingabe → Zahl. Nimmt, was man in der Schweiz tippt: «1'234.50», «1 234,50»,
 * «-12». Leer → null. Unlesbar → NaN (der Aufrufer meldet es).
 */
export function parseZahl(s: string): number | null {
  const t = s.trim().replace(/['’\s]/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : Number.NaN
}

/** Zahl → Eingabefeld (ohne Tausender-Trenner, damit es wieder parst). */
export function zahlFeld(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n)
}

const rund2 = (n: number) => Math.round(n * 100) / 100

export interface SummenPruefung {
  /** Summe der Netto-Zeilen (unlesbare Zeilen zählen als 0). */
  summe: number
  /** Netto laut Beleg, null = unbekannt. */
  netto: number | null
  /** summe − netto, null wenn netto unbekannt. */
  differenz: number | null
  /** Innerhalb der Toleranz (oder kein Netto zum Vergleich). */
  stimmt: boolean
}

export function pruefeSumme(zeilenNetto: (number | null)[], netto: number | null): SummenPruefung {
  const summe = rund2(zeilenNetto.reduce<number>((a, n) => a + (n !== null && Number.isFinite(n) ? n : 0), 0))
  if (netto === null || !Number.isFinite(netto)) return { summe, netto: null, differenz: null, stimmt: true }
  const differenz = rund2(summe - netto)
  return { summe, netto, differenz, stimmt: Math.abs(differenz) <= SUMMEN_TOLERANZ + 1e-9 }
}

/** Effektiv gegen geplant (Nachkalkulation): Abweichung in CHF und Prozent. */
export function abweichung(
  effektiv: number | null, geplant: number | null,
): { chf: number | null; pct: number | null } {
  if (effektiv === null || geplant === null || !Number.isFinite(effektiv) || !Number.isFinite(geplant)) {
    return { chf: null, pct: null }
  }
  const chf = rund2(effektiv - geplant)
  return { chf, pct: geplant !== 0 ? Math.round((chf / geplant) * 1000) / 10 : null }
}

// ─── Formular ────────────────────────────────────────────────

export interface KopfEntwurf {
  supplier_id: string
  bill_number: string
  bill_date: string
  due_date: string
  currency: string
  net_total: string
  vat_total: string
  gross_total: string
  skonto_pct: string
  skonto_until: string
  is_credit_note: boolean
  iban: string
  reference: string
}

export interface ZeilenEntwurf {
  /** Stabiler React-Schlüssel, auch für neue Zeilen ohne id. */
  key: string
  text: string
  quantity: string
  net_amount: string
  vat_rate: string
  account_no: string
  project: CompactProject | null
  bucket: KreditorBucket
}

export const BUCKET_LABELS: Record<KreditorBucket, string> = {
  projekt: 'Projekt',
  lager: 'Lager',
  gemeinkosten: 'Gemeinkosten',
}

export function kopfAus(b: KreditorDetail): KopfEntwurf {
  return {
    supplier_id: b.supplier_id ?? '',
    bill_number: b.bill_number ?? '',
    bill_date: b.bill_date ?? '',
    due_date: b.due_date ?? '',
    currency: b.currency || 'CHF',
    net_total: zahlFeld(b.net_total),
    vat_total: zahlFeld(b.vat_total),
    gross_total: zahlFeld(b.gross_total),
    skonto_pct: zahlFeld(b.skonto_pct),
    skonto_until: b.skonto_until ?? '',
    is_credit_note: b.is_credit_note,
    iban: b.payment_source === 'qr' ? '' : b.payment?.iban ?? '',
    reference: b.payment_source === 'qr' ? '' : b.payment?.reference ?? '',
  }
}

let zeilenZaehler = 0
function neuerKey(): string {
  zeilenZaehler += 1
  return `neu-${zeilenZaehler}`
}

export function zeilenAus(b: KreditorDetail): ZeilenEntwurf[] {
  return [...b.lines].sort((x, y) => x.pos - y.pos).map((l, i) => ({
    key: l.id ?? `pos-${l.pos}-${i}`,
    text: l.text ?? '',
    quantity: zahlFeld(l.quantity),
    net_amount: zahlFeld(l.net_amount),
    vat_rate: zahlFeld(l.vat_rate),
    account_no: l.account_no ?? '',
    project: l.project ?? null,
    bucket: l.bucket,
  }))
}

/** Neue Zeile mit den Vorgaben des Lieferanten (Konto, Ziel). */
export function leereZeile(b: KreditorDetail): ZeilenEntwurf {
  const satz = b.mwst_saetze.includes(8.1) ? 8.1 : b.mwst_saetze[0]
  return {
    key: neuerKey(),
    text: '',
    quantity: '',
    net_amount: '',
    vat_rate: satz === undefined ? '' : String(satz),
    account_no: b.supplier?.default_account ?? '',
    project: null,
    bucket: b.supplier?.default_bucket ?? 'projekt',
  }
}

const leerZuNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

/**
 * Formular → PATCH. Nur geänderte Kopf-Felder; `lines` als vollständige Liste,
 * sobald sich an den Positionen irgendetwas geändert hat. `fehler` nennt, was
 * nicht gespeichert werden kann (unlesbare Zahl, Zeile ohne Konto) — dann wird
 * nicht gesendet.
 */
export function baueKreditorPatch(
  b: KreditorDetail, kopf: KopfEntwurf, zeilen: ZeilenEntwurf[],
): { patch: KreditorPatch; fehler: string[] } {
  const patch: KreditorPatch = {}
  const fehler: string[] = []
  const alt = kopfAus(b)

  const text = (k: 'bill_number' | 'bill_date' | 'due_date' | 'skonto_until') => {
    if (kopf[k] !== alt[k]) patch[k] = leerZuNull(kopf[k])
  }
  const zahl = (k: 'net_total' | 'vat_total' | 'gross_total' | 'skonto_pct', label: string) => {
    if (kopf[k] === alt[k]) return
    const n = parseZahl(kopf[k])
    if (n !== null && Number.isNaN(n)) fehler.push(`${label}: keine gültige Zahl`)
    else patch[k] = n
  }

  if (kopf.supplier_id !== alt.supplier_id) patch.supplier_id = kopf.supplier_id || null
  text('bill_number')
  text('bill_date')
  text('due_date')
  text('skonto_until')
  if (kopf.currency !== alt.currency && kopf.currency.trim()) patch.currency = kopf.currency.trim().toUpperCase()
  zahl('net_total', 'Netto')
  zahl('vat_total', 'MWST')
  zahl('gross_total', 'Brutto')
  zahl('skonto_pct', 'Skonto %')
  if (kopf.is_credit_note !== alt.is_credit_note) patch.is_credit_note = kopf.is_credit_note

  // Zahlung von Hand — nie über einen QR-Zahlteil hinweg (E4).
  if (b.payment_source !== 'qr' && (kopf.iban !== alt.iban || kopf.reference !== alt.reference)) {
    const iban = kopf.iban.replace(/\s/g, '').toUpperCase()
    patch.payment = iban ? { iban, reference: leerZuNull(kopf.reference) } : null
  }

  if (zeilenGeaendert(b, zeilen)) {
    const lines: KreditorLinePatch[] = []
    zeilen.forEach((z, i) => {
      const nr = i + 1
      const netto = parseZahl(z.net_amount)
      const menge = parseZahl(z.quantity)
      const satz = parseZahl(z.vat_rate)
      if (netto === null || Number.isNaN(netto)) fehler.push(`Zeile ${nr}: Netto fehlt oder ist keine Zahl`)
      if (menge !== null && Number.isNaN(menge)) fehler.push(`Zeile ${nr}: Menge ist keine Zahl`)
      if (!z.account_no.trim()) fehler.push(`Zeile ${nr}: Konto fehlt`)
      lines.push({
        text: leerZuNull(z.text),
        quantity: menge !== null && !Number.isNaN(menge) ? menge : null,
        net_amount: netto !== null && !Number.isNaN(netto) ? netto : 0,
        vat_rate: satz !== null && !Number.isNaN(satz) ? satz : null,
        account_no: z.account_no.trim(),
        project_id: z.bucket === 'projekt' ? z.project?.project_id ?? null : null,
        bucket: z.bucket,
      })
    })
    patch.lines = lines
  }

  return { patch, fehler }
}

function zeilenSchluessel(z: ZeilenEntwurf): string {
  return JSON.stringify([
    z.text, z.quantity, z.net_amount, z.vat_rate, z.account_no,
    z.bucket === 'projekt' ? z.project?.project_id ?? null : null, z.bucket,
  ])
}

export function zeilenGeaendert(b: KreditorDetail, zeilen: ZeilenEntwurf[]): boolean {
  const alt = zeilenAus(b)
  if (alt.length !== zeilen.length) return true
  return alt.some((z, i) => zeilenSchluessel(z) !== zeilenSchluessel(zeilen[i]))
}

export function istGeaendert(b: KreditorDetail, kopf: KopfEntwurf, zeilen: ZeilenEntwurf[]): boolean {
  const alt = kopfAus(b)
  const kopfAnders = (Object.keys(alt) as (keyof KopfEntwurf)[]).some(k => alt[k] !== kopf[k])
  return kopfAnders || zeilenGeaendert(b, zeilen)
}

/** Vorschlag fürs Präfix eines neuen Lieferanten: die ersten drei Buchstaben. */
export function praefixVorschlag(name: string): string {
  return name.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
}

/** «2600515 Bad Muster» — eine Zeile je Projekt. */
export function projektText(p: Pick<CompactProject, 'number' | 'name'>): string {
  return [p.number, p.name].filter(Boolean).join(' ')
}

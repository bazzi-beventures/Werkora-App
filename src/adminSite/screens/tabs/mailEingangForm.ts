/**
 * Reine Hilfen des Reiters «Mail-Eingang» — ohne React, unit-getestet.
 *
 * Spec: docs/specs/mail-eingang-triage.md §6.4 (Absenderschranke), §10.
 *
 * Normalisiert wird hier nur für die Anzeige und damit der Betreiber sieht, was
 * er speichert (trimmen, klein schreiben, Duplikate weg). **Geprüft wird auf dem
 * Server** — die Schranke selbst ist dort eine reine Funktion mit eigenen Tests.
 */
import type { MailEingangEinstellung, MailEingangView, MailSystem } from '../../tenantScopedApi'

/** Wie der Betreiber die Mailsysteme liest — dieselben Wörter wie im Backend. */
export const MAILSYSTEM_LABEL: Record<MailSystem, string> = {
  graph: 'Microsoft 365',
  gmail: 'Google Workspace',
}

/** Die Maske: Listen als Text (ein Eintrag je Zeile), die Zahl als Eingabetext. */
export interface MailEingangForm {
  anbieter: MailSystem
  mailbox: string
  domains: string
  funktionsadressen: string
  tageslimit: string
}

/** Text in Einträge zerlegen — Zeilenumbruch, Komma, Strichpunkt oder Leerraum trennen. */
export function listeAusText(text: string): string[] {
  return text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
}

function ohneDuplikate(werte: string[]): string[] {
  return [...new Set(werte)]
}

/** `@Gehlhaar.CH ` → `gehlhaar.ch`. Ein führendes `@` ist die übliche Schreibweise, kein Fehler. */
export function normalisiereDomain(wert: string): string {
  return wert.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '')
}

export function normalisiereAdresse(wert: string): string {
  return wert.trim().toLowerCase()
}

export function normalisiereDomains(werte: readonly string[]): string[] {
  return ohneDuplikate(werte.map(normalisiereDomain).filter(Boolean))
}

export function normalisiereAdressen(werte: readonly string[]): string[] {
  return ohneDuplikate(werte.map(normalisiereAdresse).filter(Boolean))
}

// Dieselben Muster wie services/mail_eingang_regeln.py (`_DOMAIN`, `_ADRESSE`).
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const DOMAIN = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`)
const ADRESSE = new RegExp(`^[a-z0-9._%+-]+@${LABEL}(?:\\.${LABEL})+$`)

/** Spiegel von `services/mail_eingang_regeln.TAGESLIMIT_MAX`. */
export const TAGESLIMIT_MAX = 400

export function istDomain(wert: string): boolean {
  return DOMAIN.test(wert)
}

export function istAdresse(wert: string): boolean {
  return ADRESSE.test(wert)
}

/** Der Teil nach dem letzten @ — leer ohne @. */
export function domainVon(adresse: string): string {
  const at = adresse.lastIndexOf('@')
  return at < 0 ? '' : adresse.slice(at + 1)
}

export function formAus(view: MailEingangEinstellung): MailEingangForm {
  return {
    anbieter: view.anbieter ?? 'graph',
    mailbox: view.mailbox ?? '',
    domains: (view.domains ?? []).join('\n'),
    funktionsadressen: (view.funktionsadressen ?? []).join('\n'),
    tageslimit: String(view.tageslimit ?? ''),
  }
}

/** Was gespeichert wird: normalisiert. Ein unlesbares Tageslimit wird `NaN` — `pruefe` meldet es. */
export function einstellungAus(form: MailEingangForm): MailEingangEinstellung {
  const limit = form.tageslimit.trim()
  return {
    anbieter: form.anbieter,
    mailbox: normalisiereAdresse(form.mailbox),
    domains: normalisiereDomains(listeAusText(form.domains)),
    funktionsadressen: normalisiereAdressen(listeAusText(form.funktionsadressen)),
    tageslimit: /^\d+$/.test(limit) ? Number(limit) : Number.NaN,
  }
}

/**
 * Fehler, mit denen das Speichern nicht losgeht. Leer = in Ordnung.
 *
 * Dieselben Regeln wie `pruefe_config` auf dem Server — dort ist die Liste
 * bewusst streng, weil sie die Schranke *ist*: eine Funktionsadresse ausserhalb
 * der Domains oder das Triage-Postfach als eigener Absender wären Löcher, die
 * niemand bemerkt. Hier stehen sie nur, damit der Fehler am Feld erscheint statt
 * erst nach dem Klick; massgebend bleibt der Server.
 */
export function pruefe(e: MailEingangEinstellung): string[] {
  const fehler: string[] = []
  for (const d of e.domains.filter(d => !istDomain(d))) {
    fehler.push(d.includes('@')
      ? `«${d}» ist eine Adresse, keine Domain — nur den Teil nach dem @ eintragen.`
      : `«${d}» ist keine Mail-Domain (erwartet z. B. «firma.ch»).`)
  }
  for (const a of e.funktionsadressen) {
    if (!istAdresse(a)) fehler.push(`«${a}» ist keine Mailadresse.`)
    else if (!e.domains.includes(domainVon(a))) fehler.push(`Funktionsadresse ausserhalb der Mail-Domains: ${a}`)
  }
  if (e.mailbox) {
    if (!istAdresse(e.mailbox)) fehler.push(`«${e.mailbox}» ist keine Mailadresse.`)
    else if (!e.domains.includes(domainVon(e.mailbox))) {
      fehler.push('Das Triage-Postfach muss in einer der Mail-Domains des Betriebs liegen.')
    } else if (e.funktionsadressen.includes(e.mailbox)) {
      fehler.push('Das Triage-Postfach darf nicht selbst als Funktionsadresse eingetragen sein.')
    }
  }
  if (!Number.isInteger(e.tageslimit) || e.tageslimit < 0 || e.tageslimit > TAGESLIMIT_MAX) {
    fehler.push(`Das Tageslimit ist eine ganze Zahl zwischen 0 und ${TAGESLIMIT_MAX}.`)
  }
  return fehler
}

/** Hat die Maske etwas, das noch nicht gespeichert ist? Verglichen wird normalisiert. */
export function geaendert(form: MailEingangForm, view: MailEingangEinstellung): boolean {
  const a = einstellungAus(form)
  const b = einstellungAus(formAus(view))
  const gleicheListe = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i])
  return a.anbieter !== b.anbieter
    || a.mailbox !== b.mailbox
    || !gleicheListe(a.domains, b.domains)
    || !gleicheListe(a.funktionsadressen, b.funktionsadressen)
    || !Object.is(a.tageslimit, b.tageslimit)
}

/**
 * Was noch fehlt, bevor eine Mail ausgewertet wird — in der Reihenfolge der
 * Einrichtung. Leer = der Abruf läuft und die Schranke lässt etwas durch.
 */
export function offenePunkte(
  view: Pick<MailEingangView, 'graph_bereit' | 'mailbox' | 'domains' | 'modul_aktiv'>
    & Partial<Pick<MailEingangView, 'anbieter' | 'postfach_bereit'>>,
): string[] {
  const out: string[] = []
  if (!postfachBereit(view)) {
    out.push(`Der Postfach-Zugang ist in dieser Umgebung nicht eingerichtet (${MAILSYSTEM_LABEL[view.anbieter ?? 'graph']}).`)
  }
  if (!view.mailbox?.trim()) out.push('Kein Triage-Postfach eingetragen.')
  if ((view.domains ?? []).length === 0) out.push('Keine Mail-Domain eingetragen — es wird nichts ausgewertet.')
  if (!view.modul_aktiv) out.push('Das Modul «Mail-Eingang» ist aus (Reiter «Module») — es wird nichts abgeholt.')
  return out
}

/** Ist der Zugang zum **gewählten** Mailsystem eingerichtet? Ältere Server melden nur Graph. */
export function postfachBereit(
  view: Pick<MailEingangView, 'graph_bereit'> & Partial<Pick<MailEingangView, 'anbieter' | 'postfach_bereit'>>,
): boolean {
  return view.postfach_bereit ?? view.graph_bereit
}

/** «12.11.2026, 14:05» — «noch nie» ohne Zeitpunkt. */
export function abholungText(iso: string | null | undefined): string {
  if (!iso) return 'noch nie'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'noch nie'
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

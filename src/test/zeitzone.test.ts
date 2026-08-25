import { describe, expect, it } from 'vitest'

// Die Zeitzone der Testläufe ist eine Zusicherung, keine Umgebungslaune.
//
// Vorgeschichte (2026-08-25): Wochenplan.test.tsx baute seine Fixture-Woche mit
// lokaler Mitternacht und las sie mit toISOString() wieder aus — also in UTC.
// Östlich von Greenwich fällt lokale Mitternacht auf den Vortag in UTC, die
// Woche war damit um einen Tag verschoben. Ergebnis: zwölf Tests grün in der CI
// (ubuntu-latest läuft unter UTC) und alle zwölf rot auf jedem Rechner in der
// Schweiz. Der Testlauf hat damit genau das Gegenteil von dem geleistet, wofür
// er da ist.
//
// vite.config.ts setzt deshalb test.env.TZ auf Europe/Zurich. Dieser Test hält
// fest, dass die Einstellung greift und die Shell-Variable sticht — sonst würde
// ihr Wegfall wieder still zu einer CI unter UTC führen.
//
// Warum Europe/Zurich und nicht UTC: die App läuft nur dort. Zeiterfassung,
// Wochenplan und die ArG-Prüfungen rechnen in Schweizer Zeit, inklusive
// Sommerzeit — die UTC gar nicht kennt. Ein Testlauf unter UTC prüft eine
// Umgebung, die es nicht gibt.

describe('Testumgebung', () => {
  it('läuft in Europe/Zurich, unabhängig von der Shell', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Zurich')
  })

  it('steht im Sommer auf UTC+2 — der Versatz, der den Fehler ausgelöst hat', () => {
    // Ein positiver Versatz ist die Bedingung, unter der lokale Mitternacht in
    // UTC auf den Vortag fällt. getTimezoneOffset() zählt andersherum: -120.
    expect(new Date(2026, 7, 26, 9, 0, 0).getTimezoneOffset()).toBe(-120)
  })

  it('kennt die Sommerzeitumstellung', () => {
    // Ende Oktober fällt die Schweiz auf UTC+1 zurück. Unter UTC wäre beides
    // gleich — genau die Sorte Unterschied, die ein UTC-Testlauf verschluckt.
    expect(new Date(2026, 0, 15, 12, 0, 0).getTimezoneOffset()).toBe(-60)
  })
})

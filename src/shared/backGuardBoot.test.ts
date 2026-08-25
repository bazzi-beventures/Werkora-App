import { describe, it, expect } from 'vitest'
import indexHtml from '../../index.html?raw'
import viteConfig from '../../vite.config.ts?raw'
import appSource from '../App.tsx?raw'

// Der Zurück-Wächter im Inline-Boot-Skript hält die App fest, solange React noch
// lädt. Er ist per Konstruktion nicht unit-testbar — er lebt in index.html und
// läuft, bevor irgendein Modul existiert. Was hier geprüft wird, sind die
// Eigenschaften, deren Verlust ihn still ausschaltet:
//
//   1. Das Skript steht im <head>. Im <body> wartet ein klassisches <script>
//      zusätzlich auf das Stylesheet — nachgemessen (Playwright, Bundle
//      künstlich gebremst) stand der Parser nach einer Sekunde noch auf
//      readyState=loading, `window.werkoraBackGuard` existierte nicht, und der
//      Zurück-Druck verliess die App.
//   2. Es enthält überhaupt einen Wächter (pushState + popstate-Listener).
//   3. Der CSP-Hash wird über den GANZEN Skript-Body gebildet. Deckt er nur den
//      Kill-Switch ab, blockt der Browser das Skript im Production-Build — und
//      zwar lautlos für jeden, der die Konsole nicht offen hat.
//
// Alle drei Fehler sehen in der laufenden Entwicklung nach «alles gut» aus: in
// Dev fehlt die CSP, und wer schnelles WLAN hat, trifft das Ladefenster nie.
//
// `?raw` statt node:fs, weil das App-tsconfig keine Node-Typen führt.

describe('Zurück-Wächter im Boot-Skript', () => {
  it('steht im <head>, nicht im <body>', () => {
    const platzhalter = indexHtml.indexOf('__BOOT_SCRIPT__')
    expect(platzhalter).toBeGreaterThan(-1)
    expect(platzhalter).toBeLessThan(indexHtml.indexOf('</head>'))
  })

  it('steht nach dem app-build-id-Meta, das der Kill-Switch ausliest', () => {
    expect(indexHtml.indexOf('name="app-build-id"'))
      .toBeLessThan(indexHtml.indexOf('__BOOT_SCRIPT__'))
  })

  it('setzt einen History-Eintrag und hört auf popstate', () => {
    const guard = viteConfig.match(/const BOOT_BACK_GUARD = `([^`]*)`/)?.[1]

    expect(guard, 'BOOT_BACK_GUARD fehlt in vite.config.ts').toBeTruthy()
    expect(guard).toContain('pushState')
    expect(guard).toContain("addEventListener('popstate'")
    // Der Übergabe-Schalter, den App.tsx umlegt.
    expect(guard).toContain('werkoraBackGuard')
  })

  it('der CSP-Hash deckt Kill-Switch UND Wächter ab', () => {
    expect(viteConfig).toContain('const BOOT_SCRIPT_BODY = BOOT_KILL_SWITCH + BOOT_BACK_GUARD')
    expect(viteConfig).toContain("createHash('sha256').update(BOOT_SCRIPT_BODY)")
  })

  it('App.tsx übernimmt vom Bootstrap, statt doppelt zu pushen', () => {
    expect(appSource).toContain('window.werkoraBackGuard?.(false)')
    expect(appSource).toContain('window.werkoraBackGuard?.(true)')
  })
})

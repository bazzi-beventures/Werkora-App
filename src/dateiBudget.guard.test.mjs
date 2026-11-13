import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Grössen-Budget für das Frontend (Ratchet) — Spec
 * docs/specs/refactoring-wachstum.md §2 (Charge I), Gegenstück zu
 * tests/unit/test_datei_budget.py im Backend.
 *
 * Warum: Charge H hat im August 2026 die grossen Screens zerlegt. Zwei Monate
 * später waren ProjectScheduleScreen (1'324 → 2'343) und ProjekteScreen
 * (1'137 → 2'164) wieder fast doppelt so gross — ein Feature landet dort, wo
 * der Nachbar-Code schon steht. Ohne Ratchet hält ein Schnitt nicht.
 *
 * Regel: .tsx höchstens 600 Zeilen, .ts und .css höchstens 800 (Tests und
 * src/test/ zählen nicht). Was beim Einführen darüber lag, steht in BESTAND
 * mit eigener Decke (heutige Grösse + 20, auf 50 aufgerundet). Wer anstösst,
 * zieht zuerst etwas heraus — eine Karte, einen Hook, ein eigenes Stylesheet
 * neben der Komponente —, statt die Decke anzuheben. Wer eine Datei deutlich
 * verkleinert, senkt ihre Decke (der Test verlangt es ab SPIELRAUM Zeilen
 * Abstand) oder streicht den Eintrag unter dem Limit.
 *
 * Bewusst .mjs mit node:fs statt .ts mit `import.meta.glob('…?raw')`: CSS kommt
 * unter Vitest über `?raw` als leerer String an (`css: false`), und für
 * node:fs fehlen im App-tsconfig die Node-Typen — wie bei mobileShell.test.mjs.
 */
const SRC = resolve(process.cwd(), 'src')

const LIMIT = { tsx: 600, ts: 800, css: 800 }
const SPIELRAUM = 100

// Stand 2026-11-10 (develop da92460f). Kommentar = Zeilen beim Einfrieren.
const BESTAND = {
  'admin/admin.css': 5350, // 5322
  'index.css': 2750, // 2705
  'admin/operative/ProjectScheduleScreen.tsx': 2400, // 2343
  'screens/ProjekteScreen.tsx': 2200, // 2164
  'admin/operative/ProjectScheduleCalendar.tsx': 1600, // 1550
  'admin/operative/ReportCreateForm.tsx': 1300, // 1253
  'chat/ChatScreen.tsx': 1250, // 1222
  'admin/operative/InvoicesScreen.tsx': 1200, // 1142
  'admin/operative/projectDetail/useProjectForm.ts': 1100, // 1046
  'admin/kpis/kpi-dashboard.css': 1100, // 1068
  'admin/operative/MaterialsScreen.tsx': 1050, // 1010
  'admin/operative/ProjectsScreen.tsx': 1050, // 981
  'App.tsx': 1050, // 991
  'adminSite/screens/FeatureRequestsScreen.tsx': 1000, // 971
  'admin/dashboard/DashboardScreen.tsx': 750, // 675 — Überfällig-Dialog herausgezogen (20261113)
  'admin/operative/ProjectDetailScreen.tsx': 1000, // 942
  'adminSite/screens/SupportTicketsScreen.tsx': 900, // 863
  'admin/tasks/TaskBoardScreen.tsx': 900, // 850
  'admin/mobile.css': 850, // 814
  'admin/personal/MyTimeScreen.tsx': 800, // 755
  'admin/operative/projectDetail/DetailsForm.tsx': 750, // 725
  'admin/operative/projectDetail/InvoicesTab.tsx': 750, // 698
  'admin/operative/PdfExtractionReviewModal.tsx': 700, // 672
  'admin/operative/hagelschaden/HagelschadenScreen.tsx': 700, // 655
  'admin/operative/CustomerForm.tsx': 700, // 648
  'screens/ArbeitsZeitScreen.tsx': 700, // 644
  'admin/personal/HrReportsScreen.tsx': 650, // 622
}

/** Zeilen wie `wc -l`: ein abschliessender Zeilenumbruch eröffnet keine Zeile. */
function zeilen(src) {
  if (src === '') return 0
  const n = src.split('\n').length
  return src.endsWith('\n') ? n - 1 : n
}

function limitFuer(rel) {
  if (rel.endsWith('.tsx')) return LIMIT.tsx
  if (rel.endsWith('.css')) return LIMIT.css
  return LIMIT.ts
}

function zaehlen() {
  const ist = {}
  for (const eintrag of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!eintrag.isFile() || !/\.(tsx?|css)$/.test(eintrag.name)) continue
    const rel = join(eintrag.parentPath, eintrag.name).slice(SRC.length + 1).replaceAll('\\', '/')
    if (/\.test\.tsx?$/.test(rel) || rel.startsWith('test/')) continue
    ist[rel] = zeilen(readFileSync(join(SRC, rel), 'utf8'))
  }
  return ist
}

function pruefe(ist, bestand, spielraum = SPIELRAUM) {
  const probleme = []
  for (const [rel, n] of Object.entries(ist).sort()) {
    const limit = limitFuer(rel)
    const decke = bestand[rel] ?? limit
    if (n > decke) {
      probleme.push(bestand[rel] !== undefined
        ? `${rel}: ${n} Zeilen, Decke ${decke} — erst etwas herausziehen, die Decke nicht anheben`
        : `${rel}: ${n} Zeilen, Limit ${limit} — aufteilen`)
    }
  }
  for (const [rel, decke] of Object.entries(bestand).sort()) {
    const n = ist[rel]
    const limit = limitFuer(rel)
    if (n === undefined) probleme.push(`${rel}: steht im Bestand, gibt es aber nicht mehr — Eintrag streichen`)
    else if (n <= limit) probleme.push(`${rel}: nur noch ${n} Zeilen, unter dem Limit ${limit} — Eintrag streichen`)
    else if (decke - n > spielraum) probleme.push(`${rel}: ${n} Zeilen, Decke ${decke} — Decke senken (Ratchet)`)
  }
  return probleme
}

describe('Datei-Budget (Frontend)', () => {
  // Ohne diese Probe wäre der Ratchet auch grün, wenn der Scan ins Leere greift.
  it('scannt die Quellen, auch CSS', () => {
    const ist = zaehlen()
    expect(Object.keys(ist).length).toBeGreaterThan(300)
    expect(ist['admin/admin.css']).toBeGreaterThan(800)
    expect(ist['App.tsx']).toBeGreaterThan(0)
    expect(Object.keys(ist).some((rel) => rel.includes('.test.'))).toBe(false)
    expect(zeilen('a\nb\n')).toBe(2)
    expect(zeilen('a\nb')).toBe(2)
  })

  it('meldet jede Abweichung (Regel an erfundenen Zahlen)', () => {
    const probleme = pruefe(
      { 'neu.tsx': 601, 'gross.tsx': 1001, 'geschrumpft.tsx': 850, 'klein.tsx': 500, 'ok.ts': 800 },
      { 'gross.tsx': 1000, 'geschrumpft.tsx': 1000, 'weg.tsx': 900, 'klein.tsx': 900 },
    ).join('\n')
    expect(probleme).toContain('neu.tsx: 601 Zeilen, Limit 600')
    expect(probleme).toContain('gross.tsx: 1001 Zeilen, Decke 1000')
    expect(probleme).toContain('geschrumpft.tsx: 850 Zeilen, Decke 1000 — Decke senken')
    expect(probleme).toContain('weg.tsx: steht im Bestand')
    expect(probleme).toContain('klein.tsx: nur noch 500 Zeilen')
    expect(probleme).not.toContain('ok.ts')
  })

  it('keine Datei über ihrem Budget', () => {
    expect(pruefe(zaehlen(), BESTAND)).toEqual([])
  })
})

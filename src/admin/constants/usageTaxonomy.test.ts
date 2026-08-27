import { describe, it, expect } from 'vitest'
import {
  KNOWN_ACTIONS, PSEUDO_MODULES, UNMAPPED,
  actionLabel, coverageNote, moduleCoverage, moduleLabel, moduleOfAction,
} from './usageTaxonomy'

// Spiegel von config.KNOWN_MODULES (Python). Muss zusammenpassen — ein Tippfehler
// im Modulschlüssel liesse die Zeile im Modul-Inventar sonst neben dem echten
// Modul stehen, statt sich mit ihm zu verrechnen.
//
// BEWUSST nicht der TS-Typ ModuleName aus api/modules.ts: der kennt nur 21 der
// 27 Module — es fehlen die Hintergrund-Module ohne eigenen Screen
// (clock_out_reminder, approval_push, morning_briefing …). Spec §7f.
const KNOWN_MODULES = [
  'timekeeping', 'scheduling', 'quotes', 'invoicing', 'payment_matching',
  'inventory', 'hr', 'arg_compliance', 'violation_emails', 'kpis', 'kpis_email',
  'ai', 'help_bot', 'clock_in_reminder', 'hr_weekly_report', 'clock_out_reminder',
  'auto_clockout_correction_reminder', 'approval_push', 'morning_briefing',
  'project_change_push', 'admin_clock_in_push', 'aftersales', 'document_backup',
  'rapport_check_mail', 'task_board', 'newsletter', 'support',
]

describe('moduleOfAction', () => {
  it('ordnet jede bekannte Aktion einem Modul oder Pseudomodul zu', () => {
    const erlaubt = new Set([...KNOWN_MODULES, ...Object.keys(PSEUDO_MODULES)])
    const offen = KNOWN_ACTIONS.filter(a => !erlaubt.has(moduleOfAction(a)))
    expect(offen).toEqual([])
  })

  it('liefert UNMAPPED statt zu werfen, wenn keine Regel greift', () => {
    expect(moduleOfAction('voellig_neue_sache')).toBe(UNMAPPED)
    expect(moduleOfAction('')).toBe(UNMAPPED)
  })

  // Diese sieben treffen mehrere Regeln — hier entscheidet die Reihenfolge, und
  // genau hier ging es beim Bauen schief (report_kleinmaterial_recorded landete
  // unter 'inventory', weil /material/ vor der Rapport-Regel stand).
  it.each([
    ['report_kleinmaterial_recorded',      'rapport'],
    ['admin_paper_rapport_pdf',            'rapport'],
    ['admin_update_tenant_scheduling',     'konfiguration'],
    ['admin_update_project_schedule',      'scheduling'],
    ['admin_create_project_task_template', 'task_board'],
    ['admin_reconcile_camt',               'payment_matching'],
    ['admin_extract_quote_pdf',            'quotes'],
  ])('%s → %s', (action, modul) => {
    expect(moduleOfAction(action)).toBe(modul)
  })

  it('hält den rohen Audit-Trail aus db/ getrennt', () => {
    for (const a of ['INSERT', 'UPDATE', 'DELETE', 'ANONYMIZE']) {
      expect(moduleOfAction(a)).toBe('datenkorrektur')
    }
  })
})

describe('actionLabel', () => {
  it('hat für jede bekannte Aktion einen deutschen Namen', () => {
    for (const a of KNOWN_ACTIONS) {
      expect(actionLabel(a)).not.toBe('')
      expect(actionLabel(a)).not.toBe(a)
    }
  })

  it('bereitet Unbekanntes lesbar auf, statt roh oder leer zu bleiben', () => {
    expect(actionLabel('admin_foo_bar')).toBe('Foo bar')
    expect(actionLabel('etwas_neues')).toBe('Etwas neues')
  })
})

describe('moduleLabel', () => {
  it('benennt Pseudomodule aus, echte Module bleiben ihr Schlüssel', () => {
    expect(moduleLabel('rapport')).toBe('Rapporte')
    expect(moduleLabel('quotes')).toBe('quotes')
    expect(moduleLabel(UNMAPPED)).toBe('nicht zugeordnet')
  })
})

describe('moduleCoverage', () => {
  // Der Grund für die ganze Unterscheidung: diese Module haben keine Regel und
  // koennen deshalb nie eine Aktion bekommen. Sie als "ungenutzt" zu zaehlen
  // behauptet einen Befund, den die Daten nicht hergeben.
  it.each([
    'admin_clock_in_push', 'ai', 'approval_push', 'auto_clockout_correction_reminder',
    'clock_in_reminder', 'clock_out_reminder', 'help_bot', 'kpis',
    'morning_briefing', 'project_change_push',
  ])('%s ist nicht protokolliert', mod => {
    expect(moduleCoverage(mod)).toBe('keine')
  })

  // Gegenprobe: alles, worauf eine Regel zeigt, muss messbar bleiben — sonst
  // verschwindet ein echter Befund aus der Kachel.
  it.each(['quotes', 'invoicing', 'inventory', 'scheduling', 'hr', 'document_backup',
           'aftersales', 'payment_matching', 'task_board'])('%s ist messbar', mod => {
    expect(moduleCoverage(mod)).toBe('voll')
  })

  it('kennt timekeeping als nur teilweise erfasst', () => {
    expect(moduleCoverage('timekeeping')).toBe('teilweise')
    expect(coverageNote('timekeeping')).toMatch(/Ein- und Ausstempeln/)
  })

  it('erklaert nur, wo es etwas zu erklaeren gibt', () => {
    expect(coverageNote('quotes')).toBeUndefined()
    expect(coverageNote('ai')).toBeUndefined()
  })

  // Die Abdeckung wird aus RULES abgeleitet. Faellt das auseinander, meldet
  // dieser Test es, bevor die Kachel wieder falsch zaehlt.
  it('leitet die Messbarkeit aus denselben Regeln ab wie die Zuordnung', () => {
    for (const action of KNOWN_ACTIONS) {
      const mod = moduleOfAction(action)
      if (mod === UNMAPPED) continue
      expect(moduleCoverage(mod)).not.toBe('keine')
    }
  })
})

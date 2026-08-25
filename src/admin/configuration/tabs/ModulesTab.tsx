import { useState } from 'react'
import {
  getTenantModules, updateTenantModules,
  getTenantFeatures, updateTenantFeature,
} from '../../../api/admin'
import { useTenantSetting } from '../useTenantSetting'
import { useToast, ToastHost } from '../../components/useToast'

// Modul-Kategorien für die gruppierte Darstellung im Module-Tab.
// 'notifications' wird zusätzlich nach Kanal (Mail/Push) unterteilt.
type ModuleCategory = 'operativ' | 'hr' | 'analyse' | 'ki' | 'notifications' | 'other'
type NotifChannel = 'mail' | 'push'

interface ModuleMeta {
  label: string
  desc: string
  category: ModuleCategory
  channel?: NotifChannel  // nur relevant für category 'notifications'
}

const MODULE_LABELS: Record<string, ModuleMeta> = {
  timekeeping:      { label: 'Zeiterfassung',     desc: 'Stempeln, Sessions, Pausen für Mitarbeiter', category: 'operativ' },
  scheduling:       { label: 'Einsatzplanung',    desc: 'Wochenplan inkl. interne Einsätze', category: 'operativ' },
  quotes:           { label: 'Offerten',          desc: 'Offerten mit PDF-Generierung', category: 'operativ' },
  invoicing:        { label: 'Rechnungen',        desc: 'Rechnungen mit PDF-Generierung', category: 'operativ' },
  payment_matching: { label: 'Zahlungsabgleich',  desc: 'CAMT-Bankauszug einlesen und Zahlungseingänge automatisch mit Rechnungen abgleichen (benötigt Rechnungen)', category: 'operativ' },
  inventory:        { label: 'Lager',             desc: 'Bestände & Lagerbewegungen (Material-Katalog bleibt verfügbar)', category: 'operativ' },
  aftersales:       { label: 'After Sales',       desc: 'Feedback- und saisonale Reparatur-/Service-Nachfassmails nach bezahlter Rechnung (benötigt Rechnungen)', category: 'operativ' },
  hr:               { label: 'HR',                desc: 'Absenzen, Ferien, HR-Berichte', category: 'hr' },
  arg_compliance:   { label: 'ArG-Compliance',    desc: 'Arbeitsgesetz-Verstoss-Erkennung (benötigt HR + Zeiterfassung)', category: 'hr' },
  kpis:             { label: 'Kennzahlen',        desc: 'KPI-Dashboard', category: 'analyse' },
  ai:               { label: 'AI-Funktionen',     desc: 'Mistral-Chat, Voxtral-Voice, KPI-Insights', category: 'ki' },
  help_bot:         { label: 'Hilfe-Bot',         desc: 'In-App-Hilfe per Chat über die Bedien-Handbücher', category: 'ki' },
  document_backup:  { label: 'Datensicherung',    desc: 'Management kann alle Dokumente (Rechnungen/Offerten/Rapporte) als ein ZIP exportieren; Fertig-Meldung per Push, Download-Link 12 h gültig', category: 'other' },
  // Benachrichtigungen — Mail
  hr_weekly_report: { label: 'Wochen-HR-Übersicht', desc: 'Wöchentliches HR-Journal per Mail am Montag (benötigt HR). Journal & Überstunden-Salden werden weiterhin erstellt — nur die Mail entfällt.', category: 'notifications', channel: 'mail' },
  violation_emails: { label: 'ArG-Verstoss-Mails', desc: 'Wöchentliche Verstoss-E-Mails an die Admins (benötigt ArG-Compliance)', category: 'notifications', channel: 'mail' },
  kpis_email:       { label: 'KPI-Analyse-Mail',  desc: 'Wöchentliche KI-Kennzahlen-Analyse per Mail am Montag (benötigt Kennzahlen)', category: 'notifications', channel: 'mail' },
  rapport_check_mail:{ label: 'Rapport-Check-Mail', desc: 'Admin-Mail, wenn die gestempelte Zeit eines Mitarbeiters die auf Projekte verbuchten Stunden um mehr als 45 min übersteigt (Hinweis auf fehlende Rapporte). Standard aus — nur bei aktivem Modul (benötigt Zeiterfassung).', category: 'notifications', channel: 'mail' },
  // Benachrichtigungen — Push
  clock_in_reminder:{ label: 'Einstempel-Erinnerung', desc: 'Push werktags um 07:15 an eingeplante, noch nicht eingestempelte Mitarbeiter (benötigt Zeiterfassung)', category: 'notifications', channel: 'push' },
  clock_out_reminder:{ label: 'Ausstempel-Erinnerung', desc: 'Abend-Push (Standard 18:00, einstellbar) an Mitarbeiter, die noch eingestempelt sind — verhindert die automatische Schliessung um 23:59 (benötigt Zeiterfassung)', category: 'notifications', channel: 'push' },
  auto_clockout_correction_reminder:{ label: 'Korrektur-Erinnerung (Folgetag)', desc: 'Morgen-Push (Standard 07:00, einstellbar) an Mitarbeiter, deren Session am Vortag automatisch um 23:59 geschlossen wurde (benötigt HR + Zeiterfassung)', category: 'notifications', channel: 'push' },
  approval_push:{ label: 'Genehmigungs-Push', desc: 'Sofort-Push an Mitarbeiter, wenn ihr Ferien- oder Korrekturantrag genehmigt oder abgelehnt wurde', category: 'notifications', channel: 'push' },
  admin_clock_in_push:{ label: 'Einstempel-Bestätigung', desc: 'Push an Mitarbeiter, wenn ein Admin sie über die Massen-Einstempel-Maske einstempelt (benötigt Zeiterfassung)', category: 'notifications', channel: 'push' },
  morning_briefing:{ label: 'Morgen-Briefing', desc: 'Push beim Einstempeln mit den heutigen Baustellen + Adressen (benötigt Einsatzplanung + Zeiterfassung)', category: 'notifications', channel: 'push' },
  project_change_push:{ label: 'Projektänderungs-Push', desc: 'Sofort-Push an betroffene Monteure, wenn Einsatztag, Startzeit oder Team eines Projekts geändert wird (benötigt Einsatzplanung)', category: 'notifications', channel: 'push' },
}

// Module mit zusätzlich konfigurierbarer Uhrzeit. Das An/Aus ist das Modul-Toggle;
// die Uhrzeit liegt als Feature-Flag (feature_flags.<feature>.time, HH:MM) und wird
// inline unter dem Toggle gepflegt. Defaults spiegeln feature_registry.py.
const MODULE_TIME_FEATURE: Record<string, { feature: string; default: string }> = {
  clock_out_reminder: { feature: 'clock_out_reminder_time', default: '18:00' },
  auto_clockout_correction_reminder: { feature: 'auto_clockout_correction_reminder_time', default: '07:00' },
}

const CATEGORY_ORDER: ModuleCategory[] = ['operativ', 'hr', 'analyse', 'ki', 'notifications', 'other']
const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  operativ: 'Operativ',
  hr: 'HR & Compliance',
  analyse: 'Analyse',
  ki: 'KI & Hilfe',
  notifications: 'Benachrichtigungen',
  other: 'Sonstige',
}
const CHANNEL_ORDER: NotifChannel[] = ['mail', 'push']
const CHANNEL_LABELS: Record<NotifChannel, string> = { mail: 'Mail', push: 'Push' }

export function ModulesTab({ view }: { view: 'modules' | 'notifications' }) {
  const { toast, showToast } = useToast()
  // Registry-Teil der Antwort (bekannte Module + Dependencies) — ändert sich nur
  // durch Neuladen, deshalb neben dem editierbaren Wert (enabled-Liste) gehalten.
  const [meta, setMeta] = useState<{ known: string[]; deps: Record<string, string[]> } | null>(null)
  // Reminder-Uhrzeiten (Feature-Flags): feature-key -> HH:MM. Nur im Notifications-View relevant.
  const [reminderTimes, setReminderTimes] = useState<Record<string, string>>({})

  const {
    value: enabled, setValue: setEnabled, loading, saving, dirty, reload, persist,
  } = useTenantSetting<string[]>({
    load: async () => {
      const result = await getTenantModules()
      setMeta({ known: result.known_modules, deps: result.dependencies })
      // Aktuelle Reminder-Uhrzeiten aus den Feature-Overrides ziehen (nur Notifications-Tab).
      if (view === 'notifications') {
        try {
          const features = await getTenantFeatures()
          const times: Record<string, string> = {}
          for (const { feature, default: def } of Object.values(MODULE_TIME_FEATURE)) {
            const ov = features.overrides?.[feature] as { time?: string } | undefined
            times[feature] = (ov?.time as string) || def
          }
          setReminderTimes(times)
        } catch { /* Uhrzeiten optional — Toggle funktioniert auch ohne */ }
      }
      return [...result.enabled_modules].sort()
    },
    save: async (mods) => {
      const result = await updateTenantModules([...mods].sort())
      return [...result.enabled_modules].sort()
    },
    onToast: showToast,
    savedMsg: 'Module gespeichert',
  })

  async function saveReminderTime(feature: string, time: string) {
    setReminderTimes(prev => ({ ...prev, [feature]: time }))
    try {
      await updateTenantFeature(feature, { time })
      showToast('Uhrzeit gespeichert', 'success')
    } catch {
      showToast('Uhrzeit speichern fehlgeschlagen', 'error')
    }
  }

  if (loading || !enabled || !meta) {
    return <><div className="admin-loading"><div className="admin-spinner" /> Module werden geladen…</div><ToastHost toast={toast} /></>
  }

  const selected = new Set(enabled)
  const dependencies = meta.deps

  // Live-Validierung: fehlende Dependencies pro Modul
  const errors: string[] = []
  for (const m of selected) {
    const deps = dependencies[m] ?? []
    const missing = deps.filter(d => !selected.has(d))
    if (missing.length > 0) {
      errors.push(`${MODULE_LABELS[m]?.label ?? m} benötigt: ${missing.map(d => MODULE_LABELS[d]?.label ?? d).join(', ')}`)
    }
  }

  function toggle(module: string) {
    const next = new Set(selected)
    if (next.has(module)) next.delete(module)
    else next.add(module)
    setEnabled(Array.from(next).sort())
  }

  function save() {
    if (errors.length > 0) {
      showToast('Bitte zuerst Dependency-Fehler beheben', 'error')
      return
    }
    void persist()
  }

  function renderModuleRow(m: string) {
    const meta = MODULE_LABELS[m] ?? { label: m, desc: '' }
    const deps = dependencies[m] ?? []
    const isOn = selected.has(m)
    return (
      <label
        key={m}
        style={{
          display: 'flex', gap: 12, padding: 12, alignItems: 'flex-start',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
          background: isOn ? 'rgba(34,197,94,0.06)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={isOn}
          onChange={() => toggle(m)}
          style={{ marginTop: 2 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {meta.label} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>({m})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{meta.desc}</div>
          {deps.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Benötigt: {deps.map(d => MODULE_LABELS[d]?.label ?? d).join(', ')}
            </div>
          )}
          {MODULE_TIME_FEATURE[m] && isOn && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}
              onClick={e => { e.preventDefault(); e.stopPropagation() }}
            >
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Uhrzeit:</span>
              <input
                type="time"
                value={reminderTimes[MODULE_TIME_FEATURE[m].feature] ?? MODULE_TIME_FEATURE[m].default}
                onClick={e => e.stopPropagation()}
                onChange={e => saveReminderTime(MODULE_TIME_FEATURE[m].feature, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                  color: 'inherit',
                }}
              />
            </div>
          )}
        </div>
      </label>
    )
  }

  const visibleCategories = view === 'notifications'
    ? CATEGORY_ORDER.filter(c => c === 'notifications')
    : CATEGORY_ORDER.filter(c => c !== 'notifications')

  return (
    <div className="admin-table-wrap" style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        {view === 'notifications' ? (
          <>
            Steuere die automatischen Benachrichtigungen pro Mandant, gruppiert nach Kanal (Mail / Push).
            Manche benötigen ein zugehöriges Modul (z. B. die KPI-Analyse-Mail braucht <code>Kennzahlen</code>);
            fehlt eine Voraussetzung, aktiviere sie zuerst im Tab <strong>Module</strong>.
          </>
        ) : (
          <>
            Schalte Endpunkt-Features pro Mandant ein oder aus. Stammdaten (Kunden, Projekte, Material, Lieferanten,
            Preisregeln) bleiben immer verfügbar — sie sind Voraussetzung für mehrere Module.
            Abhängige Module (z. B. <code>arg_compliance</code>) lassen sich nur mit ihren Voraussetzungen aktivieren.
            Benachrichtigungen findest du im eigenen Tab <strong>Benachrichtigungen</strong>.
          </>
        )}
      </div>

      <div style={{ display: 'grid', gap: 20, marginBottom: 20 }}>
        {visibleCategories.map(cat => {
          const mods = meta.known.filter(m => (MODULE_LABELS[m]?.category ?? 'other') === cat)
          if (mods.length === 0) return null
          return (
            <div key={cat}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8,
              }}>
                {CATEGORY_LABELS[cat]}
              </div>
              {cat === 'notifications' ? (
                CHANNEL_ORDER.map(ch => {
                  const chMods = mods.filter(m => MODULE_LABELS[m]?.channel === ch)
                  if (chMods.length === 0) return null
                  return (
                    <div key={ch} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                        {CHANNEL_LABELS[ch]}
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>{chMods.map(renderModuleRow)}</div>
                    </div>
                  )
                })
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>{mods.map(renderModuleRow)}</div>
              )}
            </div>
          )
        })}
      </div>

      {errors.length > 0 && (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          fontSize: 13, color: '#fca5a5',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Dependency-Fehler:</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="admin-btn admin-btn-primary"
          onClick={save}
          disabled={!dirty || saving || errors.length > 0}
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        <button
          className="admin-btn admin-btn-secondary"
          onClick={reload}
          disabled={saving || !dirty}
        >
          Verwerfen
        </button>
      </div>
      <ToastHost toast={toast} />
    </div>
  )
}

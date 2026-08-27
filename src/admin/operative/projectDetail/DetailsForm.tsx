import { AddressAutocomplete } from '../../../shared/AddressAutocomplete'
import AppointmentsCard from './AppointmentsCard'
import { CustomerCombobox } from '../CustomerCombobox'
import { WORK_TYPES } from '../../../api/workTypes'
import { recomputeNextDue } from './projectForm'
import type { UseProjectForm } from './useProjectForm'
import type { Customer } from '../../../api/admin/customers'

// Der Reiter «Projekt Details» (Charge H, H3) — die eigentliche Projektmaske.
// Reines JSX: jeder Wert und jeder Setter kommt aus useProjectForm, damit hier
// kein zweiter Zustand entsteht, der mit dem Speichern auseinanderlaufen kann.

export interface StaffMember {
  id: string
  name: string
  projektleiter: boolean
  authorized_user_id: string | null
}

export function DetailsForm({
  form, staff, customers, schedulingEnabled, showGeruestfach, onSubmit, onCancel,
}: {
  form: UseProjectForm
  staff: StaffMember[]
  customers: Customer[]
  /** Modul «scheduling» — ohne das gibt es die Termin-Kachel nicht. */
  schedulingEnabled: boolean
  /** Feature «geruestfach» — Gerüstfach-Nummer nur für Mandanten mit Gerüstbau. */
  showGeruestfach: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}) {
  // Verbatim aus dem Screen uebernommen: die Felder heissen hier wie dort, damit
  // der Umzug am JSX nichts geaendert hat und im Diff nachvollziehbar bleibt.
  const {
    name, setName, customerId, selectCustomer, selectedCustomer, billingRecipient, billingAddress,
    objectName, setObjectName, objectAddress, setObjectAddress, setObjectAddressTouched,
    pickObjectAddress,
    billingDiffers, setBillingDiffers,
    projBillingName, setProjBillingName, projBillingAddress, setProjBillingAddress,
    artDerArbeit, toggleArt, entsorgungsart: hasEntsorgungsart,
    bemerkung, setBemerkung, geruestfach, setGeruestfach,
    projektleiterId, setProjektleiterId, monteurIds, toggleMonteur,
    appointments, changeAppointments: handleAppointmentsChange,
    kontakte, addKontakt, updateKontakt, removeKontakt, toggleSiteContact,
    eigentuemer, updateEigentuemer, disposal, updateDisposal,
    wartungInterval, setWartungInterval,
    wartungLastAt, setWartungLastAt,
    wartungNextDueAt, setWartungNextDueAt,
    saving, error,
  } = form

  return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {error && <div className="admin-form-error">{error}</div>}

          {/* ── Projektdaten ─────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Projektdaten</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="project-name">Projektname *</label>
                <input id="project-name" className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Art der Arbeit <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(Mehrfachauswahl)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {WORK_TYPES.map(t => {
                    const active = artDerArbeit.includes(t.value)
                    return (
                      <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 'var(--radius-xs)', background: active ? 'var(--primary)' : 'var(--surface-2)', color: active ? '#fff' : 'var(--text)', border: '1px solid', borderColor: active ? 'var(--primary)' : 'var(--border)' }}>
                        <input type="checkbox" style={{ display: 'none' }} checked={active} onChange={() => toggleArt(t.value)} />
                        {t.label}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Bemerkung
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>
                    wird für Monteure rot hervorgehoben
                  </span>
                </label>
                <textarea
                  className="admin-form-input"
                  value={bemerkung}
                  onChange={e => setBemerkung(e.target.value)}
                  placeholder="Wichtiger Hinweis für Monteure…"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              {showGeruestfach && (
                <div className="admin-form-group">
                  <label className="admin-form-label">Gerüstfach (Lagerort)</label>
                  <input
                    className="admin-form-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={geruestfach}
                    onChange={e => setGeruestfach(e.target.value)}
                    placeholder="z. B. 12"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Kunde & Adressen ──────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24, overflow: 'visible' }}>
            <div className="admin-section-title">Kunde & Adressen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Kunde (Rechnungsempfänger)</label>
                <CustomerCombobox
                  customers={customers}
                  value={customerId}
                  onChange={selectCustomer}
                />
                {customerId && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--bg-subtle, #f5f5f5)', borderRadius: 'var(--radius-xs)', fontSize: 13, color: 'var(--muted)' }}>
                    <strong>Rechnung an:</strong> {billingRecipient || '—'}{billingAddress ? `, ${billingAddress}` : ''}
                  </div>
                )}
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={billingDiffers}
                    onChange={e => setBillingDiffers(e.target.checked)}
                  />
                  Abweichende Rechnungsadresse (nur dieses Projekt)
                </label>
                {billingDiffers && (
                  <>
                    <div className="admin-form-row" style={{ marginTop: 10 }}>
                      <div>
                        <label className="admin-form-label">Empfänger (Rechnung)</label>
                        <input
                          className="admin-form-input"
                          value={projBillingName}
                          onChange={e => setProjBillingName(e.target.value)}
                          placeholder={(selectedCustomer?.billing_name || selectedCustomer?.name) ?? 'z.B. Verwaltung AG'}
                        />
                      </div>
                      <div>
                        <label className="admin-form-label">Rechnungsadresse</label>
                        <AddressAutocomplete className="admin-form-input" value={projBillingAddress} onChange={setProjBillingAddress} />
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Gilt nur für Offerte/Rechnung dieses Projekts — der Kundenstamm bleibt unverändert.
                    </div>
                  </>
                )}
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Objekt-Name (optional)</label>
                <input
                  className="admin-form-input"
                  value={objectName}
                  onChange={e => setObjectName(e.target.value)}
                  placeholder="z.B. MFH Sonnhalde oder Familie Muster"
                />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Bezeichnung des Objekts — erscheint auf Offerte/Rechnung. Getrennt von der Adresse.
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Objektadresse (Baustelle)</label>
                <AddressAutocomplete
                  className="admin-form-input"
                  value={objectAddress}
                  onChange={v => { setObjectAddress(v); setObjectAddressTouched(true) }}
                  onPick={pickObjectAddress}
                />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Nur die reine Adresse — sie bestimmt die Fahrspesen (Distanz Firmensitz → Objekt)
                  und den Punkt auf der Auftragskarte.
                  Wird beim Auswählen des Kunden als Vorschlag übernommen und kann pro Projekt überschrieben werden.
                </div>
              </div>

            </div>
          </div>

          {/* ── Ansprechpersonen ──────────────────────────────── */}
          <div className="admin-table-wrap project-contacts" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div className="admin-section-title" style={{ margin: 0 }}>Ansprechpersonen</div>
              <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={addKontakt}>
                + Kontakt hinzufügen
              </button>
            </div>
            {kontakte.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Ansprechpersonen eingetragen.</div>
            )}
            {kontakte.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Stern markiert den <strong>Baustellenkontakt</strong> — diese Person sieht der Monteur ganz oben und sie wird auf Offerte/Rechnung gedruckt.
              </div>
            )}
            {kontakte.map((k, i) => (
              // Spaltentitel nur über der ersten Zeile — ab der zweiten wären
              // NAME/KOMMENTAR/TELEFON/E-MAIL reine Wiederholung und schieben die
              // Liste unnötig auseinander. Gestapelt (Handy) bleiben sie sichtbar,
              // dort steht jedes Feld für sich; die aria-labels bleiben immer.
              <div key={i} className={`project-pos-row${i > 0 ? ' project-pos-row-repeat' : ''}`}>
                <button
                  type="button"
                  onClick={() => toggleSiteContact(i)}
                  title={k.is_site_contact ? 'Baustellenkontakt — klicken zum Aufheben' : 'Als Baustellenkontakt markieren'}
                  style={{
                    width: 36, height: 36, marginBottom: 1,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: '1px solid', borderColor: k.is_site_contact ? 'var(--primary)' : 'var(--border)',
                    background: k.is_site_contact ? 'var(--primary)' : 'transparent',
                    color: k.is_site_contact ? '#fff' : 'var(--muted)',
                    fontSize: 18, lineHeight: 1, padding: 0,
                  }}
                >
                  {k.is_site_contact ? '★' : '☆'}
                </button>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Name</label>
                  {/* autoComplete mit unbekanntem Token: verhindert, dass Chrome/Edge das leere
                      Feld ungefragt mit dem Browser-Profilnamen (z.B. "Luca Bazzi") befüllt. */}
                  <input className="admin-form-input" aria-label="Name" autoComplete="new-kontakt-name" value={k.name} onChange={e => updateKontakt(i, 'name', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Kommentar</label>
                  <input className="admin-form-input" aria-label="Kommentar" autoComplete="new-kontakt-kommentar" value={k.kommentar} onChange={e => updateKontakt(i, 'kommentar', e.target.value)} placeholder="z.B. Hausabwart" />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">Telefon</label>
                  <input className="admin-form-input" aria-label="Telefon" autoComplete="new-kontakt-telefon" value={k.telefon} onChange={e => updateKontakt(i, 'telefon', e.target.value)} />
                </div>
                <div className="admin-form-group" style={{ margin: 0 }}>
                  <label className="admin-form-label">E-Mail</label>
                  <input className="admin-form-input" aria-label="E-Mail" autoComplete="new-kontakt-email" type="email" value={k.email} onChange={e => updateKontakt(i, 'email', e.target.value)} />
                </div>
                <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" style={{ marginBottom: 1 }} onClick={() => removeKontakt(i)}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ── Eigentümer ────────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Eigentümer</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              Optional: Eigentümer des Objekts — eine <strong>eigene Rolle</strong>, unabhängig von
              Auftraggeber, Rechnungsempfänger und Baustellenkontakt. Wird auf Offerte und Rechnung gedruckt.
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Name</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-name" value={eigentuemer.name} onChange={e => updateEigentuemer('name', e.target.value)} placeholder="z.B. Erika Muster / Eigentümergemeinschaft" />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Adresse</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-adresse" value={eigentuemer.adresse} onChange={e => updateEigentuemer('adresse', e.target.value)} placeholder="Strasse Nr, PLZ Ort" />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Telefon</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-telefon" value={eigentuemer.telefon} onChange={e => updateEigentuemer('telefon', e.target.value)} />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">E-Mail</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-email" type="email" value={eigentuemer.email} onChange={e => updateEigentuemer('email', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Entsorgung (bei Demontage / Wiedermontage) ────── */}
          {hasEntsorgungsart && (
            <div className="admin-table-wrap" style={{ padding: 24 }}>
              <div className="admin-section-title">Entsorgung</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Material</label>
                  <input className="admin-form-input" value={disposal.material} onChange={e => updateDisposal('material', e.target.value)} placeholder="z.B. Aluminium-Storen, Rollladen-Lamellen" />
                </div>
                <div className="admin-form-row">
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Menge</label>
                    <input className="admin-form-input" value={disposal.menge} onChange={e => updateDisposal('menge', e.target.value)} placeholder="z.B. 12 Stk · 45 kg" />
                  </div>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label className="admin-form-label">Entsorger</label>
                    <input className="admin-form-input" value={disposal.entsorger} onChange={e => updateDisposal('entsorger', e.target.value)} placeholder="Firma / Sammelstelle" />
                  </div>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Nachweis (URL)</label>
                  <input className="admin-form-input" type="url" value={disposal.nachweis_url} onChange={e => updateDisposal('nachweis_url', e.target.value)} placeholder="Link zu Entsorgungsbeleg / Foto" />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Bemerkung</label>
                  <textarea className="admin-form-input" value={disposal.bemerkung} onChange={e => updateDisposal('bemerkung', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Wartungs-Intervall ────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Wartung</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              Optional: Wartungs-Intervall (in Monaten) + letzter Service → nächste Fälligkeit wird automatisch berechnet.
            </div>
            <div className="admin-form-row admin-form-row-3">
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Intervall (Monate)</label>
                <input
                  className="admin-form-input" type="number" min="1" step="1"
                  value={wartungInterval}
                  onChange={e => {
                    const v = e.target.value
                    setWartungInterval(v)
                    setWartungNextDueAt(recomputeNextDue(wartungLastAt, v))
                  }}
                  placeholder="z.B. 12"
                />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Letzter Service</label>
                <input
                  className="admin-form-input" type="date"
                  value={wartungLastAt}
                  onChange={e => {
                    const v = e.target.value
                    setWartungLastAt(v)
                    setWartungNextDueAt(recomputeNextDue(v, wartungInterval))
                  }}
                />
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Nächste Fälligkeit</label>
                <input
                  className="admin-form-input" type="date"
                  value={wartungNextDueAt}
                  onChange={e => setWartungNextDueAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Einsatzplanung (Zuständigkeiten) ──────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Einsatzplanung</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Projektleiter</label>
                <select className="admin-form-select" value={projektleiterId} onChange={e => setProjektleiterId(e.target.value)}>
                  <option value="">— auswählen —</option>
                  {staff.filter(s => s.projektleiter || s.id === projektleiterId).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Monteure</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {staff.length === 0 && (
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Mitarbeiter gefunden.</span>
                  )}
                  {staff.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 'var(--radius-xs)', background: monteurIds.includes(s.id) ? 'var(--primary)' : 'var(--surface-2)', color: monteurIds.includes(s.id) ? '#fff' : 'var(--text)', border: '1px solid', borderColor: monteurIds.includes(s.id) ? 'var(--primary)' : 'var(--border)' }}>
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        checked={monteurIds.includes(s.id)}
                        onChange={() => toggleMonteur(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>

              {schedulingEnabled && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Standard-Team für alle Termine — je Termin lässt sich unten davon abweichen.
                </div>
              )}
            </div>
          </div>

          {/* ── Termine (mehrere je Projekt, project_appointments) ─── */}
          {schedulingEnabled && (
            <AppointmentsCard
              appointments={appointments}
              onChange={handleAppointmentsChange}
              staff={staff}
              projectTeam={monteurIds}
            />
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onCancel}>Abbrechen</button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
  )
}

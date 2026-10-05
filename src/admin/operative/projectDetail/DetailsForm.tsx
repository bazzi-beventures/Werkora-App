import { AddressAutocomplete } from '../../../shared/AddressAutocomplete'
import { ReferenceProjectPicker } from './ReferenceProjectPicker'
import AppointmentsCard from './AppointmentsCard'
import { CustomerCombobox } from '../CustomerCombobox'
import { WORK_TYPES } from '../../../api/workTypes'
import { recomputeNextDue } from './projectForm'
import type { UseProjectForm } from './useProjectForm'
import type { Customer } from '../../../api/admin/customers'
import { KontaktNameInput } from './KontaktNameInput'
import GeruestfaecherInput from './GeruestfaecherInput'
import { eigentuemerFeldFehler } from './eigentuemerGrenzen'
import type { Kontakt } from '../../../api/admin/projects'
import { BetaBadge } from '../../../shared/BetaBadge'
import type { ProjectAutosave } from './useProjectAutosave'
import { CustomerLink } from '../../components/CustomerLink'

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
  form, staff, customers, schedulingEnabled, showGeruestfach, showAbnahme, onSubmit, onCancel,
  autosave, onCreateCustomerFromKontakt, onOpenCustomer,
}: {
  form: UseProjectForm
  staff: StaffMember[]
  customers: Customer[]
  /** Modul «scheduling» — ohne das gibt es die Termin-Kachel nicht. */
  schedulingEnabled: boolean
  /** Feature «geruestfach» — Gerüstfächer (mehrere, z. B. 2C) nur für Mandanten mit Gerüstbau. */
  showGeruestfach: boolean
  /**
   * Feature «garantiefall» und ein gespeichertes Projekt: dann steht das
   * Abnahmedatum zum Nachtragen da.
   *
   * Bewusst nicht nur an abgeschlossenen Projekten: eines, das nach «Fehler beim
   * Abschluss» wieder offen ist, hat sein Datum verloren, und ohne das Feld wäre
   * es nicht mehr nachtragbar (Spec §3.3).
   */
  showAbnahme: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  /**
   * Gesetzt = die Maske speichert sich selbst (Feature `projekt_autosave`,
   * docs/specs/projektmaske-autosave.md): Statuszeile statt Knopf, Team und
   * Termine mit eigener Übernahme, «Als Kunde anlegen» an der Kontaktzeile.
   */
  autosave?: ProjectAutosave | null
  /** §3.8 — öffnet den Dialog «als Kunde anlegen» für genau diese Zeile. */
  onCreateCustomerFromKontakt?: (k: Kontakt) => void
  /** Sprung auf die Kundenstammseite des gewählten Kunden (WW-9). */
  onOpenCustomer?: (customerId: string) => void
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
    bemerkung, setBemerkung, geruestfaecher, setGeruestfaecher,
    projektleiterId, setProjektleiterId, monteurIds, toggleMonteur,
    appointments, changeAppointments: handleAppointmentsChange,
    kontakte, addKontakt, updateKontakt, pickKontaktCustomer, removeKontakt, toggleSiteContact,
    eigentuemer, updateEigentuemer, disposal, updateDisposal,
    wartungInterval, setWartungInterval,
    wartungLastAt, setWartungLastAt,
    wartungNextDueAt, setWartungNextDueAt,
    parentProjectId, parentProjectLabel, pickReferenceProject,
    completedAt, setCompletedAt,
    isWarranty, setIsWarranty,
    saving, error,
  } = form
  // Kontaktzeilen, die in dieser Sitzung neu sind und keinen Stammkunden
  // haben — sie bekommen den Link «+ Als Kunde anlegen» (§3.8).
  const ohneStamm = autosave && onCreateCustomerFromKontakt ? new Set(form.kontakteOhneKundenstamm()) : null
  const staffName = (id: string) => staff.find(s => s.id === id)?.name ?? '?'

  return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
        <form
          onSubmit={onSubmit}
          // Ein Feld verlassen = fertig getippt: sofort speichern statt die Pause
          // abzuwarten (§3.2). onBlur bubbelt in React (focusout).
          onBlur={autosave ? () => { void autosave.flush() } : undefined}
          style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
        >

          {autosave && <AutosaveStatusLine a={autosave} />}

          {error && <div className="admin-form-error">{error}</div>}

          {/* ── Projektdaten ─────────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Projektdaten</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="project-name">Projektname *</label>
                <input id="project-name" className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
                {autosave && !name.trim() && (
                  <div className="admin-form-error" role="alert">Ohne Namen wird die Bezeichnung nicht gespeichert.</div>
                )}
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
              {/* Referenzprojekt — nur bei «Reparatur» (Spec garantiefall.md §3.9).
                  Ein einmal gesetzter Verweis bleibt sichtbar, auch wenn der Chip
                  wieder abgewaehlt wird: er ist eine Tatsache ueber die Herkunft
                  der Arbeit, keine Eigenschaft der Leistungsart — und wer ihn
                  loswerden will, findet «Entfernen» daneben. */}
              {(artDerArbeit.includes('Reparatur') || !!parentProjectId || isWarranty) && (
                <>
                  <ReferenceProjectPicker
                    value={parentProjectId}
                    label={parentProjectLabel}
                    onPick={pickReferenceProject}
                  />
                  {/* Das Häkchen stand bis 20260922 nur im Reopen-Dialog und traf
                      dort das ALTE Projekt. Hier trifft es das Projekt, das die
                      Garantiearbeit trägt — und es ist eine bewusste Entscheidung
                      des Büros, keine Folge des Referenzprojekts (Spec §3.9). */}
                  <div className="admin-form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={isWarranty}
                        onChange={e => setIsWarranty(e.target.checked)}
                      />
                      Garantiefall — wird nicht oder nur reduziert verrechnet
                    </label>
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                      Unterdrückt Mindestrechnung und Aufrundung, setzt den Vermerk
                      aufs Rechnungs-PDF und belegt das Garantie-Feld neuer Rapporte vor.
                      Positionen werden <strong>nicht</strong> automatisch auf null gesetzt.
                    </p>
                  </div>
                </>
              )}
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
              {showAbnahme && (
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="project-completed-at">
                    Abgeschlossen am
                    <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
                      (Abnahme — ab hier läuft die Garantiefrist)
                    </span>
                  </label>
                  <input
                    id="project-completed-at"
                    className="admin-form-input"
                    type="date"
                    value={completedAt}
                    onChange={e => setCompletedAt(e.target.value)}
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    Wird beim Abschliessen automatisch gesetzt. Nachtragen musst du es nur
                    bei Projekten, die vor der Einführung dieses Feldes geschlossen wurden.
                  </p>
                </div>
              )}
              {showGeruestfach && (
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="project-geruestfaecher">Gerüstfächer</label>
                  <GeruestfaecherInput value={geruestfaecher} onChange={setGeruestfaecher} />
                </div>
              )}
            </div>
          </div>

          {/* ── Kunde & Adressen ──────────────────────────────── */}
          <div className="admin-table-wrap" style={{ padding: 24, overflow: 'visible' }}>
            <div className="admin-section-title">Kunde & Adressen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <label className="admin-form-label">Kunde (Rechnungsempfänger)</label>
                  {/* Das Feld selbst ist eine Suche — ein Klick darauf öffnet die
                      Vorschlagsliste. Der Weg in den Kundenstamm steht deshalb daneben. */}
                  {selectedCustomer && onOpenCustomer && (
                    <CustomerLink customerId={selectedCustomer.id} onOpen={onOpenCustomer} style={{ fontSize: 12 }}>
                      Im Kundenstamm öffnen →
                    </CustomerLink>
                  )}
                </div>
                <CustomerCombobox
                  customers={customers}
                  value={customerId}
                  onChange={selectCustomer}
                />
                {customerId && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius-xs)', fontSize: 13, color: 'var(--muted)' }}>
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
          {/* overflow visible: die Vorschlagsliste des Namensfelds ragt auf dem
              Handy (in-flow) unter die Karte hinaus. */}
          <div className="admin-table-wrap project-contacts" style={{ padding: 24, overflow: 'visible' }}>
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
                {' '}Beim Tippen des Namens werden Treffer aus dem Kundenstamm vorgeschlagen; ohne Treffer bleibt die Person frei erfasst.
                {' '}Solange keine Person erfasst ist, übernimmt die Auswahl des Kunden dessen Angaben (Name, Telefon, E-Mail) als Vorschlag.
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
                  <label className="admin-form-label">
                    Name
                    {k.customer_id && (
                      <span title="Aus dem Kundenstamm übernommen" style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--primary)', textTransform: 'none', letterSpacing: 0 }}>
                        · Kundenstamm
                      </span>
                    )}
                  </label>
                  {/* autoComplete mit unbekanntem Token: verhindert, dass Chrome/Edge das leere
                      Feld ungefragt mit dem Browser-Profilnamen (z.B. "Luca Bazzi") befüllt. */}
                  <KontaktNameInput
                    ariaLabel="Name"
                    autoComplete="new-kontakt-name"
                    customers={customers}
                    value={k.name}
                    onChange={v => updateKontakt(i, 'name', v)}
                    onPick={cand => pickKontaktCustomer(i, cand)}
                  />
                  {ohneStamm?.has(k) && (
                    <button
                      type="button"
                      className="admin-link-btn"
                      style={{ fontSize: 12, marginTop: 4, padding: 0, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                      onClick={() => onCreateCustomerFromKontakt?.(k)}
                    >
                      + Als Kunde anlegen
                    </button>
                  )}
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
                {eigentuemerFeldFehler('name', eigentuemer.name) && (
                  <div className="admin-form-error" role="alert">{eigentuemerFeldFehler('name', eigentuemer.name)}</div>
                )}
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Adresse</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-adresse" value={eigentuemer.adresse} onChange={e => updateEigentuemer('adresse', e.target.value)} placeholder="Strasse Nr, PLZ Ort" />
                {eigentuemerFeldFehler('adresse', eigentuemer.adresse) && (
                  <div className="admin-form-error" role="alert">{eigentuemerFeldFehler('adresse', eigentuemer.adresse)}</div>
                )}
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">Telefon</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-telefon" value={eigentuemer.telefon} onChange={e => updateEigentuemer('telefon', e.target.value)} />
                {eigentuemerFeldFehler('telefon', eigentuemer.telefon) && (
                  <div className="admin-form-error" role="alert">{eigentuemerFeldFehler('telefon', eigentuemer.telefon)}</div>
                )}
              </div>
              <div className="admin-form-group" style={{ margin: 0 }}>
                <label className="admin-form-label">E-Mail</label>
                <input className="admin-form-input" autoComplete="new-eigentuemer-email" type="email" value={eigentuemer.email} onChange={e => updateEigentuemer('email', e.target.value)} />
                {eigentuemerFeldFehler('email', eigentuemer.email) && (
                  <div className="admin-form-error" role="alert">{eigentuemerFeldFehler('email', eigentuemer.email)}</div>
                )}
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
                {/* Statt der Rückfrage bei jedem Speichern (§3.5). */}
                {autosave && !projektleiterId && (
                  <div className="project-pl-hint">
                    Kein Projektleiter zugewiesen — Rückfragen aus der Mitarbeiter-App finden dann
                    niemanden, und das Projekt fehlt in den Auswertungen je Projektleiter.
                  </div>
                )}
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Monteure</label>
                <div className="project-team-chips">
                  {staff.length === 0 && (
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>Keine Mitarbeiter gefunden.</span>
                  )}
                  {staff.map(s => {
                    const active = monteurIds.includes(s.id)
                    // Lead = der zuerst angewählte Monteur (monteur_ids[0]) — dieselbe
                    // Regel wie in der Einsatzplanung, wo er rot erscheint. Ohne die
                    // Markierung hier sieht man erst im Kalender, wen man gewählt hat.
                    const lead = monteurIds[0] === s.id
                    return (
                      <label
                        key={s.id}
                        className={`project-team-chip${active ? ' active' : ''}${lead ? ' lead' : ''}`}
                        title={lead ? 'Lead-Monteur (zuerst gewählt)' : undefined}
                      >
                        <input
                          type="checkbox"
                          style={{ display: 'none' }}
                          checked={active}
                          onChange={() => toggleMonteur(s.id)}
                        />
                        {s.name}
                      </label>
                    )
                  })}
                </div>
                {monteurIds.length > 1 && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    Rot = Lead-Monteur (der zuerst gewählte). Abwählen und neu wählen ändert ihn.
                  </div>
                )}
                {/* Team sammeln, dann übernehmen (§3.3): jeder Wechsel meldet sich
                    per Push bei den Monteuren — nicht für jeden Zwischenklick. */}
                {autosave && form.teamDirty && (
                  <div className="project-team-pending" role="status">
                    <span className="project-team-pending-text">
                      Team geändert
                      {(() => {
                        const plus = monteurIds.filter(id => !form.savedMonteurIds.includes(id))
                        const minus = form.savedMonteurIds.filter(id => !monteurIds.includes(id))
                        const teile = [
                          ...plus.map(id => `+ ${staffName(id)}`),
                          ...minus.map(id => `− ${staffName(id)}`),
                        ]
                        return teile.length ? ` (${teile.join(', ')})` : ' (Reihenfolge / Lead)'
                      })()}
                    </span>
                    <button
                      type="button"
                      className="admin-btn admin-btn-sm admin-btn-primary"
                      disabled={autosave.busy}
                      onClick={() => { void autosave.run(f => f.commitTeam()) }}
                    >
                      Team übernehmen
                    </button>
                    <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={form.resetTeam}>
                      Verwerfen
                    </button>
                  </div>
                )}
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
              autosave={autosave ? {
                commit: key => autosave.run(f => f.commitAppointment(key)),
                remove: key => autosave.run(f => f.removeAppointmentNow(key)),
                isDirty: form.isAppointmentDirty,
              } : undefined}
            />
          )}

          {!autosave && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onCancel}>Abbrechen</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          )}
        </form>
      </div>
  )
}

/**
 * «Speichert… / Gespeichert ✓ 14:32 / Nicht gespeichert» (§3.7). Kein
 * automatischer Neuversuch: «Erneut versuchen» stösst ihn an, ebenso die
 * nächste Änderung.
 */
function AutosaveStatusLine({ a }: { a: ProjectAutosave }) {
  const zeit = a.savedAt
    ? a.savedAt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
    : ''
  return (
    <div className={`project-autosave-status ${a.status}`} role="status" aria-live="polite">
      {a.status === 'saving' && <span>Speichert…</span>}
      {a.status === 'saved' && <span>Gespeichert ✓ {zeit}</span>}
      {a.status === 'idle' && <span>Änderungen werden automatisch gespeichert</span>}
      {a.status === 'error' && (
        <>
          <span>Nicht gespeichert{a.error ? ` — ${a.error}` : ''}</span>
          <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={() => { void a.flush() }}>
            Erneut versuchen
          </button>
        </>
      )}
      <BetaBadge />
    </div>
  )
}

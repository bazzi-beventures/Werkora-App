import { TenantTextSetting, type UseTenantTextResult } from '../../components/TenantTextSetting'

// Die reinen Textbausteine des Offert-Panels — je Baustein ein useTenantText-Hook
// im Panel, hier nur Titel/Hilfetexte und die Editor-Art. Zwei Gruppen, weil
// zwischen ihnen die Skonto-Vorgabe steht (eigener Vertrag, kein Textbaustein).

// Texte, die im Offerten-PDF landen.
export function QuotePdfTextSettings({ stdNotes, disc, discR, skontoText, richtoffAvailable }: {
  stdNotes: UseTenantTextResult
  disc: UseTenantTextResult
  discR: UseTenantTextResult
  skontoText: UseTenantTextResult
  // Feature 'richtofferte': zweiter Disclaimer nur dann sichtbar/pflegbar.
  richtoffAvailable: boolean
}) {
  return (
    <>
      <TenantTextSetting
        title="Standard-Bemerkungen"
        subtitle="Vorausgefüllter Bemerkungstext im Offerte-Formular — gibt dem Kunden mehr Flexibilität."
        state={stdNotes}
        editor="rich"
        rows={10}
        placeholder="Standard-Bemerkungstext für neue Offerten…"
        saveLabel="Bemerkungen speichern"
        hint="Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF."
      />

      <TenantTextSetting
        title={`Schlusstext / Disclaimer${richtoffAvailable ? ' — Offerte' : ''}`}
        subtitle={richtoffAvailable
          ? 'Erscheint zuunterst auf Offerten vom Typ „Offerte", unter den Bemerkungen.'
          : 'Erscheint zuunterst auf jedem Offerten-PDF, unter den Bemerkungen.'}
        state={disc}
        editor="rich"
        rows={4}
        placeholder="Schlusstext / Disclaimer fürs Offerten-PDF…"
        saveLabel="Disclaimer speichern"
        hint="Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF."
        emptyStateHint="Aktuell ist kein Schlusstext gesetzt — das PDF zeigt unten keinen Disclaimer."
      />

      {/* Zweiter Disclaimer für den Typ "Richtofferte" — eigenes Tenant-Feld +
          eigener System-Default. */}
      {richtoffAvailable && (
        <TenantTextSetting
          title="Schlusstext / Disclaimer — Richtofferte"
          subtitle={'Erscheint nur auf Offerten vom Typ „Richtofferte", unter den Bemerkungen.'}
          state={discR}
          editor="rich"
          rows={4}
          placeholder="Schlusstext / Disclaimer für Richtofferten…"
          saveLabel="Disclaimer speichern"
          hint="Zeilenumbrüche bleiben erhalten und erscheinen so auch im Offerten-PDF."
          emptyStateHint="Aktuell ist kein Schlusstext gesetzt — das PDF zeigt unten keinen Disclaimer."
        />
      )}

      <TenantTextSetting
        title="Skonto-Begleittext"
        subtitle={
          <>
            Erscheint auf der Offerte unter dem Total, sobald bei einer Offerte ein Skonto-%
            gesetzt ist. Platzhalter <code>{'{prozent}'}</code>, <code>{'{tage}'}</code> und{' '}
            <code>{'{betrag}'}</code> werden beim PDF aus den Offert-Werten gefüllt
            (<code>{'{betrag}'}</code> = Brutto-Skonto-Betrag).
          </>
        }
        state={skontoText}
        editor="textarea"
        rows={3}
        placeholder="Bei Zahlung innerhalb von {tage} Tagen {prozent}% Skonto."
        saveLabel="Begleittext speichern"
        hint="Leer lassen setzt auf den System-Standardtext zurück."
      />
    </>
  )
}

// Danke-/Absage-Text: immer pflegbar (kein Feature-Flag am Editor, damit man die
// Texte vor dem Aktivieren der Mail-Features vorbereiten kann).
export function QuoteMailTextSettings({ thankyou, rejection, orderConfirmation }: {
  thankyou: UseTenantTextResult
  rejection: UseTenantTextResult
  orderConfirmation: UseTenantTextResult
}) {
  return (
    <>
      <TenantTextSetting
        title="Danke-Text (Offerten-Annahme)"
        subtitle={
          <>
            Inhalt der Dankesmail, die dem Kunden nach Annahme einer Offerte zugeht —
            sobald das Feature „Danke-Mail bei Offerten-Annahme" aktiv ist (unter
            Konfiguration). Platzhalter <code>{'{kunde}'}</code>, <code>{'{offerte}'}</code>{' '}
            und <code>{'{projekt}'}</code> werden beim Versand aus der Offerte gefüllt.
            Anrede und Grussformel gehören in den Text.
          </>
        }
        state={thankyou}
        editor="textarea"
        rows={8}
        placeholder={'Guten Tag {kunde}\n\nVielen Dank für die Annahme unserer Offerte {offerte}…'}
        saveLabel="Danke-Text speichern"
        hint="Zeilenumbrüche bleiben erhalten. Leer lassen setzt auf den System-Standardtext zurück."
      />

      <TenantTextSetting
        title="Absage-Text (Offerten-Ablehnung)"
        subtitle={
          <>
            Inhalt der Mail, die dem Kunden nach der Ablehnung einer Offerte zugeht —
            sobald das Feature „Absage-Mail bei Offerten-Ablehnung" aktiv ist (unter
            Konfiguration). Platzhalter <code>{'{kunde}'}</code>, <code>{'{offerte}'}</code>{' '}
            und <code>{'{projekt}'}</code> werden beim Versand aus der Offerte gefüllt.
            Anrede und Grussformel gehören in den Text.
          </>
        }
        state={rejection}
        editor="textarea"
        rows={8}
        placeholder={'Guten Tag {kunde}\n\nBesten Dank für Ihre Rückmeldung zu unserer Offerte {offerte}…'}
        saveLabel="Absage-Text speichern"
        hint="Zeilenumbrüche bleiben erhalten. Leer lassen setzt auf den System-Standardtext zurück."
      />

      <TenantTextSetting
        title="Auftragsbestätigung (Offerten-Annahme)"
        subtitle={
          <>
            Inhalt der Auftragsbestätigung an den Kunden. Sie lässt sich bei jeder
            angenommenen Offerte von Hand senden („Auftragsbestätigung" in der
            Offerten-Liste) — dafür braucht es kein Feature. Das Feature
            „Auftragsbestätigung automatisch senden" (unter Konfiguration) schickt sie
            zusätzlich bei jeder Annahme automatisch. Platzhalter{' '}
            <code>{'{kunde}'}</code>, <code>{'{offerte}'}</code> und{' '}
            <code>{'{projekt}'}</code> werden beim Versand aus der Offerte gefüllt.
            Anrede und Grussformel gehören in den Text.
          </>
        }
        state={orderConfirmation}
        editor="textarea"
        rows={8}
        placeholder={'Guten Tag {kunde}\n\nHiermit bestätigen wir Ihnen die Annahme unserer Offerte {offerte}…'}
        saveLabel="Auftragsbestätigung speichern"
        hint="Zeilenumbrüche bleiben erhalten. Leer lassen setzt auf den System-Standardtext zurück."
      />
    </>
  )
}

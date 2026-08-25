import { useToast, ToastHost } from '../../components/useToast'
import { useTenantText, TenantTextSetting } from '../../components/TenantTextSetting'

// Rechnungs-Vorlagen: Zahlungskondition (immer), Skonto-Warnhinweis (nur bei Abrechnung
// einer Offerte mit Skonto) und Schlusssatz. Je ein eigenes Tenant-Feld + System-Default.
export function RechnungsVorlagenPanel() {
  const { toast, showToast } = useToast()

  // Zahlungskondition ("Zahlbar innert 30 Tagen netto."). Steht auf JEDER Rechnung.
  // 3 Zustände wie beim Schlusssatz; {tage} wird serverseitig beim Rendern durch die
  // konfigurierte Frist ersetzt (die Response nennt sie im Zusatzfeld `days`).
  const payment = useTenantText('/pwa/admin/invoice-payment-terms', 'text', {
    showToast, savedMsg: 'Zahlungskondition gespeichert',
  })
  const skontoWarn = useTenantText('/pwa/admin/invoice-skonto-warning', 'text', {
    showToast, savedMsg: 'Skonto-Warnhinweis gespeichert',
  })
  const footer = useTenantText('/pwa/admin/invoice-footer-text', 'text', {
    showToast, savedMsg: 'Schlusssatz gespeichert',
  })
  const loading = [payment, skontoWarn, footer].some(s => s.loading)
  const paymentDays = typeof payment.meta.days === 'number' ? payment.meta.days : 30

  return (
    <>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Rechnungs-Vorlagen</div>
          <div className="admin-page-subtitle">Texte, die auf der Rechnung erscheinen</div>
        </div>
      </div>

      {loading ? (
        <div className="admin-table-wrap"><div className="admin-loading"><div className="admin-spinner" /> Laden…</div></div>
      ) : (
        <>
          <TenantTextSetting
            first
            title="Zahlungskondition"
            subtitle={
              <>
                Erscheint auf jeder Rechnung unter dem Total — unabhängig vom Skonto.
                Der Platzhalter <code>{'{tage}'}</code> wird durch die Zahlungsfrist ersetzt
                ({paymentDays} Tage); nach dieser Frist laufen auch Zahlungserinnerung und Mahnung.
              </>
            }
            state={payment}
            editor="textarea"
            rows={2}
            placeholder="Zahlbar innert {tage} Tagen netto."
            saveLabel="Zahlungskondition speichern"
            hint={'Feld leeren und speichern entfernt die Zahlungskondition ganz; „zurücksetzen" stellt den Standardtext wieder her.'}
            emptyStateHint="Aktuell ist keine Zahlungskondition gesetzt — die Rechnung nennt dem Kunden keine Frist."
          />

          <TenantTextSetting
            title="Skonto-Warnhinweis (Rechnung)"
            subtitle={
              <>
                Erscheint auf der Rechnung unter dem Total, sobald eine Offerte mit Skonto
                abgerechnet wird — zusammen mit der wiederholten Skonto-Kondition. Standardsatz,
                falls ein Kunde Skonto abzieht, ohne rechtzeitig zu zahlen.
              </>
            }
            state={skontoWarn}
            editor="textarea"
            rows={2}
            placeholder="Ungerechtfertigte Skontoabzüge werden nachbelastet."
            saveLabel="Warnhinweis speichern"
            hint="Leer lassen setzt auf den System-Standardtext zurück."
          />

          <TenantTextSetting
            title="Schlusssatz (Dankestext)"
            subtitle={
              <>
                Erscheint zuunterst auf der Rechnung, direkt vor dem QR-Zahlteil — z.B.
                „Vielen Dank für Ihr Vertrauen".
              </>
            }
            state={footer}
            editor="rich"
            rows={3}
            placeholder="Vielen Dank für Ihr Vertrauen und die angenehme Zusammenarbeit."
            saveLabel="Schlusssatz speichern"
            hint={'Feld leeren und speichern entfernt den Schlusssatz ganz; „zurücksetzen" stellt den Standardtext wieder her.'}
            emptyStateHint="Aktuell ist kein Schlusssatz gesetzt — die Rechnung zeigt vor dem QR-Teil keinen Text."
          />
        </>
      )}

      <ToastHost toast={toast} />
    </>
  )
}

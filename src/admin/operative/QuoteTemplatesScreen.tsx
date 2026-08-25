import { useState } from 'react'
import { AufgabenVorlagenPanel } from './quoteTemplates/AufgabenVorlagenPanel'
import { OffertenVorlagenPanel } from './quoteTemplates/OffertenVorlagenPanel'
import { RechnungsVorlagenPanel } from './quoteTemplates/RechnungsVorlagenPanel'
import { useTabStrip } from '../hooks/useTabStrip'

type VorlagenTab = 'offerte' | 'rechnung' | 'aufgaben'

// "Vorlagen" bündelt die Offert-, Rechnungs- und Aufgaben-Vorlagen unter einem Tab-Layout
// analog zum Material-Screen. Die Panels und ihre Sektionen liegen in
// quoteTemplates/ — hier steht nur die Reiter-Schale.
export default function QuoteTemplatesScreen() {
  const [tab, setTab] = useState<VorlagenTab>('offerte')
  const tabsRef = useTabStrip(tab)

  return (
    <div className="admin-page">
      {/* kpi-admin-tabs-sticky: die Reiter bleiben beim Scrollen oben sichtbar
          (der Screen wird durch die vielen Vorlagen-Abschnitte lang). */}
      <div className="kpi-admin-tabs kpi-admin-tabs-sticky" ref={tabsRef} style={{ marginBottom: 20 }}>
        <button
          className={`kpi-admin-tab${tab === 'offerte' ? ' active' : ''}`}
          onClick={() => setTab('offerte')}
        >
          Offerte
        </button>
        <button
          className={`kpi-admin-tab${tab === 'rechnung' ? ' active' : ''}`}
          onClick={() => setTab('rechnung')}
        >
          Rechnung
        </button>
        <button
          className={`kpi-admin-tab${tab === 'aufgaben' ? ' active' : ''}`}
          onClick={() => setTab('aufgaben')}
        >
          Aufgaben
        </button>
      </div>

      {tab === 'offerte' && <OffertenVorlagenPanel />}
      {tab === 'rechnung' && <RechnungsVorlagenPanel />}
      {tab === 'aufgaben' && <AufgabenVorlagenPanel />}
    </div>
  )
}

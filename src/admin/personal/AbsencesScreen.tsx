import { useEffect, useState } from 'react'
import { getAdminAbsences, approveAbsence, rejectAbsence, Absence } from '../../api/admin'
import AbsenceCalendar from './AbsenceCalendar'
import { countWorkdays } from '../utils/calendarHelpers'
import { AdminCardList } from '../components/AdminCardList'
import { useIsMobile } from '../useIsMobile'
import { useToast, ToastHost } from '../components/useToast'

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  military: 'Militärdienst',
  other: 'Sonstiges',
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dayCount(start: string, end: string, canton: string) {
  const d = countWorkdays(start, end, canton)
  return d === 1 ? '1 Tag' : `${d} Tage`
}

// Statusanzeige und Aktionen teilen sich Tabelle und Karten-Ansicht — sonst
// muesste jede Aenderung an Label oder Badge-Klasse an zwei Stellen nachgezogen
// werden, und die Mobile-Variante sieht man beim Testen am Desktop nicht.
const STATUS_LABELS: Record<string, string> = {
  approved: 'Genehmigt',
  rejected: 'Abgelehnt',
}
const STATUS_BADGE: Record<string, string> = {
  approved: 'admin-badge admin-badge-approved',
  rejected: 'admin-badge admin-badge-rejected',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={STATUS_BADGE[status] ?? 'admin-badge admin-badge-pending'}>
      {STATUS_LABELS[status] ?? 'Pendent'}
    </span>
  )
}

function AbsenceActions({ a, acting, onApprove, onReject }: {
  a: Absence
  acting: string | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  return (
    <>
      <button
        className="admin-btn admin-btn-success admin-btn-sm"
        onClick={() => onApprove(a.id)}
        disabled={acting === a.id}
      >
        {acting === a.id ? '…' : '✓ Genehmigen'}
      </button>
      <button
        className="admin-btn admin-btn-danger admin-btn-sm"
        onClick={() => onReject(a.id)}
        disabled={acting === a.id}
      >
        {acting === a.id ? '…' : '✕ Ablehnen'}
      </button>
    </>
  )
}

type TabType = 'requested' | 'approved' | 'rejected' | 'calendar'

export default function AbsencesScreen({ onBadgeChange, canton = 'ZH' }: { onBadgeChange?: () => void; canton?: string }) {
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabType>('requested')
  const [acting, setActing] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  const [calendarAbsences, setCalendarAbsences] = useState<Absence[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarLoaded, setCalendarLoaded] = useState(false)
  const isMobile = useIsMobile()

  async function load() {
    if (tab === 'calendar') return
    setLoading(true)
    try {
      setAbsences(await getAdminAbsences(tab))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'calendar') {
      if (!calendarLoaded) {
        setCalendarLoading(true)
        getAdminAbsences()
          .then(data => {
            setCalendarAbsences(data.filter(a => a.status !== 'rejected'))
            setCalendarLoaded(true)
          })
          .finally(() => setCalendarLoading(false))
      }
      return
    }
    load()
  }, [tab])

  async function handleApprove(id: string) {
    setActing(id)
    try {
      await approveAbsence(id)
      showToast('Absenz genehmigt', 'success')
      load()
      onBadgeChange?.()
    } catch {
      showToast('Fehler beim Genehmigen', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleReject(id: string) {
    setActing(id)
    try {
      await rejectAbsence(id)
      showToast('Absenz abgelehnt', 'success')
      load()
      onBadgeChange?.()
    } catch {
      showToast('Fehler beim Ablehnen', 'error')
    } finally {
      setActing(null)
    }
  }

  const TAB_LABELS: Record<TabType, string> = {
    requested: 'Pendent',
    approved: 'Genehmigt',
    rejected: 'Abgelehnt',
    calendar: 'Kalender',
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Absenzen</div>
          <div className="admin-page-subtitle">
            {tab === 'calendar' ? 'Kalenderansicht' : `${absences.length} Einträge`}
          </div>
        </div>
      </div>

      {/* Tabs — flexWrap, weil vier Buttons auf 375px sonst aus dem Viewport
          laufen und die Mobile-Shell (overflow-x: hidden) sie abschneidet. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {(['requested', 'approved', 'rejected', 'calendar'] as const).map(t => (
          <button
            key={t}
            className={`admin-btn ${tab === t ? 'admin-btn-primary' : 'admin-btn-secondary'} admin-btn-sm`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <AbsenceCalendar absences={calendarAbsences} loading={calendarLoading} canton={canton} />
      ) : (
        <div className="admin-table-wrap">
          {loading ? (
            <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
          ) : isMobile ? (
            <AdminCardList
              items={absences}
              keyFor={a => a.id}
              empty="Keine Absenzen gefunden."
              renderCard={a => (
                <>
                  <div className="admin-card-head">
                    <span className="admin-card-title">{a.staff_name}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="admin-card-meta">{TYPE_LABELS[a.absence_type] ?? a.absence_type}</div>
                  <div className="admin-card-meta">
                    {fmt(a.start_date)} – {fmt(a.end_date)} · {dayCount(a.start_date, a.end_date, canton)}
                  </div>
                  {tab === 'requested' && (
                    <div className="admin-card-actions">
                      <AbsenceActions a={a} acting={acting} onApprove={handleApprove} onReject={handleReject} />
                    </div>
                  )}
                </>
              )}
            />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>Typ</th>
                  <th>Von</th>
                  <th>Bis</th>
                  <th>Dauer</th>
                  <th>Status</th>
                  {tab === 'requested' && <th>Aktionen</th>}
                </tr>
              </thead>
              <tbody>
                {absences.length === 0 ? (
                  <tr><td colSpan={7} className="admin-table-empty">Keine Absenzen gefunden.</td></tr>
                ) : absences.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.staff_name}</strong></td>
                    <td>{TYPE_LABELS[a.absence_type] ?? a.absence_type}</td>
                    <td>{fmt(a.start_date)}</td>
                    <td>{fmt(a.end_date)}</td>
                    <td style={{ color: 'var(--muted)' }}>{dayCount(a.start_date, a.end_date, canton)}</td>
                    <td><StatusBadge status={a.status} /></td>
                    {tab === 'requested' && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <AbsenceActions a={a} acting={acting} onApprove={handleApprove} onReject={handleReject} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ToastHost toast={toast} />
    </div>
  )
}

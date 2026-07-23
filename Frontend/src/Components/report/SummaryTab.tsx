import { memo } from 'react'
import { MdPeople, MdCheckCircle, MdAccessTime, MdCalendarToday, MdAssessment } from 'react-icons/md'
import { parsePermissionData, calcPermissionHours, calcHours } from '../../utils/attendanceUtils'

interface SummaryTabProps {
  enriched: any[]
  stats: {
    total: number
    present: number
    halfday: number
    leave: number
    overtime: number
  }
  dateLabel: string
}

const STATUS_CLASS: Record<string, string> = {
  'Present': 'badge-present',
  'Half Day': 'badge-halfday',
  'Leave': 'badge-absent',
  'Holiday': 'badge-holiday',
  'Weekend Working': 'badge-weekend',
}

const TAG_CLASS: Record<string, string> = {
  earlycome: 'badge-earlycome',
  earlyout: 'badge-earlyout',
  overtime: 'badge-overtime',
}

const TAG_LABEL: Record<string, string> = {
  earlycome: 'Early Come',
  earlyout: 'Early Out',
  overtime: 'Overtime',
}

function getDynamicWorkTag(inT: string, outT: string): string | null {
  const tags: string[] = []
  const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  
  if (inT && toM(inT) < toM('10:00')) {
    tags.push('earlycome')
  }
  if (outT) {
    if (toM(outT) > toM('18:30')) {
      tags.push('overtime')
    } else if (toM(outT) < toM('18:30')) {
      tags.push('earlyout')
    }
  }
  return tags.length > 0 ? tags.join(',') : null
}

function renderTags(tagStr: string | null) {
  if (!tagStr) return <span style={{ color: '#bdc3c7' }}>—</span>
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {tagStr.split(',').map(tag => {
        if (tag.startsWith('permission_')) {
          const pData = parsePermissionData(tag)
          if (pData) {
            const pHours = calcPermissionHours(pData.start, pData.end)
            return (
              <span key={tag} className="badge badge-overtime" style={{ background: '#3b82f6', color: '#fff' }}>
                Permission ({pData.start} - {pData.end}, {pHours?.toFixed(1)}h)
              </span>
            )
          }
        }
        return (
          <span key={tag} className={`badge ${TAG_CLASS[tag] || 'badge-present'}`}>
            {TAG_LABEL[tag] || tag}
          </span>
        )
      })}
    </div>
  )
}

const SummaryTab = memo(function SummaryTab({ enriched, stats, dateLabel }: SummaryTabProps) {
  return (
    <>
      <div className="report-stats-grid">
        <div className="report-stat-card blue">
          <div className="rsc-icon"><MdPeople size={22} aria-hidden="true" /></div>
          <div>
            <h3>{stats.total}</h3>
            <p>Total Records</p>
          </div>
        </div>
        <div className="report-stat-card green">
          <div className="rsc-icon"><MdCheckCircle size={22} aria-hidden="true" /></div>
          <div>
            <h3>{stats.present}</h3>
            <p>Present</p>
          </div>
        </div>
        <div className="report-stat-card yellow">
          <div className="rsc-icon"><MdAccessTime size={22} aria-hidden="true" /></div>
          <div>
            <h3>{stats.halfday}</h3>
            <p>Half Day</p>
          </div>
        </div>
        <div className="report-stat-card red">
          <div className="rsc-icon"><MdCalendarToday size={22} aria-hidden="true" /></div>
          <div>
            <h3>{stats.leave}</h3>
            <p>On Leave</p>
          </div>
        </div>
        <div className="report-stat-card indigo">
          <div className="rsc-icon"><MdAssessment size={22} aria-hidden="true" /></div>
          <div>
            <h3>{stats.overtime}</h3>
            <p>Overtime</p>
          </div>
        </div>
      </div>

      {enriched.length === 0 ? (
        <div className="table-card">
          <div className="empty-state">
            No attendance records found for <strong>{dateLabel}</strong>.
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-card-header">
            <h2>Summary &nbsp;·&nbsp; {dateLabel}</h2>
            <span className="record-count">{enriched.length} record{enriched.length !== 1 ? 's' : ''}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Emp ID</th><th>Name</th><th>Department</th>
                <th>Status</th><th>Work Tag</th><th>Working Hours</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((a, i) => (
                <tr key={`${a.emp_id}-${a.date}`}>
                  <td>{i + 1}</td>
                  <td><span className="badge badge-overtime">{a.emp_id}</span></td>
                  <td>{a.emp_name}</td>
                  <td>{a.department}</td>
                  <td><span className={`badge ${STATUS_CLASS[a.status] || 'badge-present'}`}>{a.status}</span></td>
                  <td>{renderTags(a.work_tag || getDynamicWorkTag(a.check_in || '', a.check_out || ''))}</td>
                  <td>{calcHours(a.check_in, a.check_out, a.work_tag) !== null ? `${calcHours(a.check_in, a.check_out, a.work_tag)!.toFixed(1)}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
})

export default SummaryTab

import { memo } from 'react'
import { parsePermissionData, calcPermissionHours, calcHours, autoTag } from '../../utils/attendanceUtils'

interface DetailTabProps {
  enriched: any[]
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
  latein: 'badge-latein',
  earlyout: 'badge-earlyout',
  overtime: 'badge-overtime',
}

const TAG_LABEL: Record<string, string> = {
  earlycome: 'Early Come',
  latein: 'Late In',
  earlyout: 'Early Out',
  overtime: 'Overtime',
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

const DetailTab = memo(function DetailTab({ enriched, dateLabel }: DetailTabProps) {
  return (
    enriched.length === 0 ? (
      <div className="table-card">
        <div className="empty-state">
          No attendance records found for <strong>{dateLabel}</strong>.
        </div>
      </div>
    ) : (
      <div className="table-card">
        <div className="table-card-header">
          <h2>Detailed Report &nbsp;·&nbsp; {dateLabel}</h2>
          <span className="record-count">{enriched.length} record{enriched.length !== 1 ? 's' : ''}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Emp ID</th><th>Name</th><th>Department</th>
              <th>Check In</th><th>Check Out</th><th>Working Hours</th><th>Status</th><th>Work Tag</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((a, i) => {
              const hrs = calcHours(a.check_in, a.check_out, a.work_tag)
              return (
                <tr key={`${a.emp_id}-${a.date}-${i}`}>
                  <td>{i + 1}</td>
                  <td><span className="badge badge-overtime">{a.emp_id}</span></td>
                  <td>{a.emp_name}</td>
                  <td>{a.department}</td>
                  <td>{a.check_in || '—'}</td>
                  <td>{a.check_out || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{hrs !== null ? `${hrs.toFixed(1)}h` : '—'}</td>
                  <td><span className={`badge ${STATUS_CLASS[a.status] || 'badge-present'}`}>{a.status}</span></td>
                  <td>{renderTags(a.work_tag || autoTag(a.check_in || '', a.check_out || '', a.work_tag))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  )
})

export default DetailTab

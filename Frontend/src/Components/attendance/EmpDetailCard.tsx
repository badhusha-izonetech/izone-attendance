import { MdClose } from 'react-icons/md'
import { memo } from 'react'
import type { Employee, DailyAttendance } from '../../types'
import { parsePermissionData, calcPermissionHours } from '../../utils/attendanceUtils'

function calcHours(inT: string, outT: string, work_tag?: string | null): number | null {
  if (!inT || !outT) return null
  const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  
  let outM = toM(outT)
  const inM = toM(inT)
  if (outM <= inM) outM += 24 * 60 // handle overnight

  let diff = (outM - inM) / 60
  
  if (work_tag && work_tag.includes('permission_')) {
    const match = work_tag.match(/permission_([0-9:]*)_([0-9:]*)/)
    if (match && match[1] && match[2]) {
      let pOut = toM(match[2])
      const pIn = toM(match[1])
      if (pOut <= pIn) pOut += 24 * 60
      
      const overlapStart = Math.max(inM, pIn)
      const overlapEnd = Math.min(outM, pOut)
      if (overlapEnd > overlapStart) {
        diff -= (overlapEnd - overlapStart) / 60
      }
    }
  }

  return diff > 0 ? diff : null
}

function statusBadgeClass(s: string) {
  if (s === 'Present') return 'badge-present'
  if (s === 'Leave')   return 'badge-leave'
  if (s === 'Holiday') return 'badge-holiday'
  if (s === 'Weekend Working') return 'badge-weekend'
  return 'badge-halfday'
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

function renderTags(tagStr: string | null) {
  if (!tagStr) return '—'
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

interface EmpDetailCardProps {
  emp: Employee
  rec: DailyAttendance | undefined
  onClose: () => void
}

const EmpDetailCard = memo(function EmpDetailCard({ emp, rec, onClose }: EmpDetailCardProps) {
  const hrs = rec ? calcHours(rec.check_in, rec.check_out, rec.work_tag) : null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="emp-detail-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '650px', marginBottom: 0 }}>
        <div className="emp-detail-header">
          <div className="emp-avatar">{emp.name.charAt(0).toUpperCase()}</div>
          <div>
            <h3>{emp.name}</h3>
            <span className="badge badge-overtime">{emp.emp_id}</span>
          </div>
          <button className="modal-close" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close details">
            <MdClose size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="emp-detail-grid">
          <div><span>Department</span><strong>{emp.department || '—'}</strong></div>
          <div><span>Email</span><strong>{emp.email || '—'}</strong></div>
          <div><span>Phone</span><strong>{emp.phone || '—'}</strong></div>
          <div>
            <span>Status</span>
            <strong>
              {rec ? <span className={`badge ${statusBadgeClass(rec.status)}`}>{rec.status}</span> : '—'}
            </strong>
          </div>
          <div><span>Check In</span><strong>{rec?.check_in || '—'}</strong></div>
          <div><span>Check Out</span><strong>{rec?.check_out || '—'}</strong></div>
          <div><span>Hours Worked</span><strong>{hrs !== null ? `${hrs.toFixed(1)}h` : '—'}</strong></div>
          <div>
            <span>Work Tag</span>
            <strong>
              {renderTags(rec?.work_tag || null)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  )
})

export default EmpDetailCard

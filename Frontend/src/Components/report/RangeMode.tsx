import { MdPeople, MdCheckCircle, MdAccessTime, MdCalendarToday, MdAssessment } from 'react-icons/md'
import { memo } from 'react'

interface RangeModeProps {
  employeeSummary: any[]
  stats: {
    total: number
    present: number
    halfday: number
    leave: number
    overtime: number
  }
  dateLabel: string
  enrichedLength: number
}

function formatMins(mins: number): string {
  if (mins <= 0) return '—'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const RangeMode = memo(function RangeMode({ employeeSummary, stats, dateLabel, enrichedLength }: RangeModeProps) {
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
            <p>Overtime Records</p>
          </div>
        </div>
      </div>

      {enrichedLength === 0 ? (
        <div className="table-card">
          <div className="empty-state">
            No attendance records found for <strong>{dateLabel}</strong>.
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-card-header">
            <h2>Employee Summary &nbsp;·&nbsp; {dateLabel}</h2>
            <span className="record-count">{employeeSummary.length} employee{employeeSummary.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Emp ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Working Days</th>
                  <th>Holidays</th>
                  <th>Present</th>
                  <th>Leave</th>
                  <th>Half Day</th>
                  <th>Total Hours</th>
                  <th>Overtime</th>
                  <th>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {employeeSummary.map((emp, i) => (
                  <tr key={emp.emp_id}>
                    <td>{i + 1}</td>
                    <td><span className="badge badge-overtime">{emp.emp_id}</span></td>
                    <td>{emp.emp_name}</td>
                    <td>{emp.department}</td>
                    <td>{emp.expectedWorkingDays}</td>
                    <td>{emp.weekendWorked}</td>
                    <td>{emp.present}</td>
                    <td>{emp.leave}</td>
                    <td>{emp.halfday}</td>
                    <td>{emp.totalHours.toFixed(1)}h</td>
                    <td>{emp.overtimeMins > 0 ? formatMins(emp.overtimeMins) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{emp.attendancePercentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
})

export default RangeMode

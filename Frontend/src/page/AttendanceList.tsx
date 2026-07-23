import { useState, useMemo, useRef, useEffect, memo } from 'react'
import { MdCalendarToday, MdMoreVert } from 'react-icons/md'
import type { Employee, DailyAttendance, LeaveRecord, HolidayRecord, Department } from '../types'
import {
  getAttendanceMetrics,
  formatMins
} from '../utils/attendanceUtils'

interface AttendanceListProps {
  employees: Employee[]
  attendance: DailyAttendance[]
  leaves: LeaveRecord[]
  holidays: HolidayRecord[]
  departments: Department[]
  onNavigateToEditDate?: (dateStr: string) => void
}

const STATUS_CLASS: Record<string, string> = {
  'Present': 'badge-present',
  'Half Day': 'badge-halfday',
  'Leave': 'badge-absent',
  'Holiday': 'badge-holiday',
  'Weekend Working': 'badge-weekend',
}

function getTodayDateStr(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface HeaderMenuProps {
  visibleColumns: {
    overtime: boolean
    earlycome: boolean
    latein: boolean
    earlyout: boolean
    permission: boolean
  }
  onToggleColumn: (tag: string, enabled: boolean) => void
}

function HeaderThreeDotMenu({ visibleColumns, onToggleColumn }: HeaderMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleToggle = (key: string) => {
    onToggleColumn(key, !visibleColumns[key as keyof typeof visibleColumns])
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        title="Toggle Optional Columns"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          padding: 0,
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '6px',
          background: open ? 'rgba(255,255,255,0.2)' : 'transparent',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <MdMoreVert size={18} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            background: '#1f2937',
            border: '1.5px solid #374151',
            borderRadius: '8px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
            minWidth: '170px',
            zIndex: 150,
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            textAlign: 'left',
          }}
        >
          {[
            { key: 'earlycome', label: 'Early In' },
            { key: 'latein', label: 'Late In' },
            { key: 'earlyout', label: 'Early Out' },
            { key: 'overtime', label: 'Overtime' },
            { key: 'permission', label: 'Permission Hours' },
          ].map(col => (
            <label
              key={col.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                fontSize: '12px',
                color: '#ffffff',
                cursor: 'pointer',
                borderRadius: '6px',
                background: visibleColumns[col.key as keyof typeof visibleColumns] ? '#374151' : 'none',
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={visibleColumns[col.key as keyof typeof visibleColumns]}
                onChange={() => handleToggle(col.key)}
                style={{ cursor: 'pointer' }}
              />
              <span>{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const AttendanceList = memo(function AttendanceList({
  employees,
  attendance,
  leaves,
  holidays,
  departments,
}: AttendanceListProps) {
  const [selectedDate, setSelectedDate] = useState(getTodayDateStr)

  const [search, setSearch] = useState('')
  const [selectedDept, setSelectedDept] = useState('')

  const [visibleColumns, setVisibleColumns] = useState({
    overtime: false,
    earlycome: false,
    latein: false,
    earlyout: false,
    permission: false,
  })

  // Reset columns visibility on date change or initial load
  useEffect(() => {
    setVisibleColumns({ overtime: false, earlycome: false, latein: false, earlyout: false, permission: false })
  }, [selectedDate])

  const toggleColumn = (tag: string, enabled: boolean) => {
    const key = tag === 'earlycome' ? 'earlycome' : tag === 'latein' ? 'latein' : tag === 'earlyout' ? 'earlyout' : tag === 'permission' ? 'permission' : 'overtime'
    setVisibleColumns(prev => ({
      ...prev,
      [key]: enabled
    }))
  }

  const isSunday = (dateStr: string) => {
    if (!dateStr) return false
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d).getDay() === 0
  }

  // Get records for the active date
  const dayRecords = useMemo(() => {
    return employees.map(emp => {
      // Find database record
      const dbRec = attendance.find(a => a.emp_id === emp.emp_id && a.date === selectedDate)
      // Find if leave exists for this date
      const hasLeave = leaves.some(l => {
        if (l.emp_id !== emp.emp_id) return false
        const curDate = new Date(selectedDate)
        const fromD = new Date(l.from_date)
        const toD = new Date(l.to_date)
        return curDate >= fromD && curDate <= toD
      })

      // Find if holiday exists for this date
      const hasHoliday = holidays.some(h => h.emp_id === emp.emp_id && h.date === selectedDate)

      let status: DailyAttendance['status'] = dbRec?.status ?? (isSunday(selectedDate) ? 'Holiday' : 'Present')
      if (!dbRec) {
        if (hasLeave) status = 'Leave'
        else if (hasHoliday) status = 'Holiday'
      }

      return {
        emp_id: emp.emp_id,
        name: emp.name,
        department: emp.department,
        check_in: dbRec?.check_in || '',
        check_out: dbRec?.check_out || '',
        status,
        work_tag: dbRec?.work_tag || null,
      }
    }).sort((a, b) => a.emp_id.localeCompare(b.emp_id, undefined, { numeric: true }))
  }, [employees, attendance, leaves, holidays, selectedDate])

  const showOvertime = visibleColumns.overtime
  const showEarlyCome = visibleColumns.earlycome
  const showLateIn = visibleColumns.latein
  const showEarlyOut = visibleColumns.earlyout
  const showPermission = visibleColumns.permission

  const [sortFilter, setSortFilter] = useState<'all' | 'overtime' | 'earlyin' | 'earlyout' | 'latein'>('all')

  // Processed and sorted day records based on sortFilter (showing matching employees on top, ranked by amount)
  const sortedDayRecords = useMemo(() => {
    if (sortFilter === 'all') return dayRecords

    // Attach original index to maintain stable employee order
    const indexed = dayRecords.map((item, index) => ({ item, index }))

    indexed.sort((aObj, bObj) => {
      const a = aObj.item
      const b = bObj.item

      const isLeaveOrHolidayA = a.status === 'Leave' || a.status === 'Holiday'
      const isLeaveOrHolidayB = b.status === 'Leave' || b.status === 'Holiday'

      const metricsA = !isLeaveOrHolidayA ? getAttendanceMetrics(a.check_in, a.check_out, a.work_tag) : null
      const metricsB = !isLeaveOrHolidayB ? getAttendanceMetrics(b.check_in, b.check_out, b.work_tag) : null

      const earlyInA = metricsA ? metricsA.earlyInMins : 0
      const earlyInB = metricsB ? metricsB.earlyInMins : 0

      const lateInA = metricsA ? metricsA.lateInMins : 0
      const lateInB = metricsB ? metricsB.lateInMins : 0

      const earlyOutA = metricsA ? metricsA.earlyOutMins : 0
      const earlyOutB = metricsB ? metricsB.earlyOutMins : 0

      const otA = metricsA ? metricsA.overtimeMins : 0
      const otB = metricsB ? metricsB.overtimeMins : 0

      let valA = 0
      let valB = 0

      if (sortFilter === 'overtime') { valA = otA; valB = otB }
      else if (sortFilter === 'earlyin') { valA = earlyInA; valB = earlyInB }
      else if (sortFilter === 'latein') { valA = lateInA; valB = lateInB }
      else if (sortFilter === 'earlyout') { valA = earlyOutA; valB = earlyOutB }

      if (valA > 0 || valB > 0) {
        if (valB !== valA) return valB - valA
      }

      // Order strictly by numerical employee ID for non-matching or equal records
      return a.emp_id.localeCompare(b.emp_id, undefined, { numeric: true })
    })

    return indexed.map(o => o.item)
  }, [dayRecords, sortFilter])

  const filteredDayRecords = useMemo(() => {
    return sortedDayRecords.filter(r => {
      const matchSearch = !search ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.emp_id.toLowerCase().includes(search.toLowerCase())
      const matchDept = !selectedDept || r.department === selectedDept
      return matchSearch && matchDept
    })
  }, [sortedDayRecords, search, selectedDept])

  return (
    <div className="reports-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--grey-dark)', margin: 0 }}>Attendance List</h1>
          <p style={{ color: 'var(--grey-mid)', fontSize: '13px', margin: '4px 0 0 0' }}>
            Select a date to inspect daily attendance.
          </p>
        </div>
        <div className="att-date-picker">
          <MdCalendarToday size={16} color="#1e5799" />
          <input
            type="date"
            className="date-input"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      <div className="table-card" style={{ padding: '0 0 20px 0' }}>
        <div className="table-card-header" style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <div className="search-wrap" style={{ margin: 0, flexShrink: 0 }}>
            <input
              className="search-input"
              placeholder="Search name or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '200px' }}
            />
          </div>
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1.5px solid #dce1e7',
              borderRadius: '8px',
              fontSize: '13px',
              color: 'var(--grey-dark)',
              background: '#fff',
              outline: 'none',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>

          {/* Quick Sort / Highlight Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', flexShrink: 0, marginLeft: 'auto' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--grey-mid)', padding: '0 6px 0 4px', textTransform: 'uppercase' }}>Prioritize Top:</span>
            <button
              onClick={() => setSortFilter('all')}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: sortFilter === 'all' ? '#fff' : 'transparent',
                color: sortFilter === 'all' ? 'var(--blue-mid)' : 'var(--grey-mid)',
                boxShadow: sortFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              Default
            </button>
            <button
              onClick={() => setSortFilter('overtime')}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: sortFilter === 'overtime' ? '#2563eb' : 'transparent',
                color: sortFilter === 'overtime' ? '#fff' : 'var(--grey-dark)',
                boxShadow: sortFilter === 'overtime' ? '0 2px 6px rgba(37,99,235,0.3)' : 'none'
              }}
            >
              Overtime
            </button>
            <button
              onClick={() => setSortFilter('earlyin')}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: sortFilter === 'earlyin' ? '#16a34a' : 'transparent',
                color: sortFilter === 'earlyin' ? '#fff' : 'var(--grey-dark)',
                boxShadow: sortFilter === 'earlyin' ? '0 2px 6px rgba(22,163,74,0.3)' : 'none'
              }}
            >
              Early In
            </button>
            <button
              onClick={() => setSortFilter('earlyout')}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: sortFilter === 'earlyout' ? '#dc2626' : 'transparent',
                color: sortFilter === 'earlyout' ? '#fff' : 'var(--grey-dark)',
                boxShadow: sortFilter === 'earlyout' ? '0 2px 6px rgba(220,38,38,0.3)' : 'none'
              }}
            >
              Early Out
            </button>
            <button
              onClick={() => setSortFilter('latein')}
              style={{
                padding: '5px 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: sortFilter === 'latein' ? '#d97706' : 'transparent',
                color: sortFilter === 'latein' ? '#fff' : 'var(--grey-dark)',
                boxShadow: sortFilter === 'latein' ? '0 2px 6px rgba(217,119,6,0.3)' : 'none'
              }}
            >
              Late In
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Emp ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
                {showEarlyCome && <th style={{ textAlign: 'center' }}>Early In</th>}
                {showLateIn && <th style={{ textAlign: 'center' }}>Late In</th>}
                {showEarlyOut && <th style={{ textAlign: 'center' }}>Early Out</th>}
                {showOvertime && <th style={{ textAlign: 'center' }}>Overtime</th>}
                {showPermission && <th style={{ textAlign: 'center' }}>Permission</th>}
                <th style={{ textAlign: 'center' }}>Working Hours</th>
                <th style={{ textAlign: 'center' }}>Total</th>
                <th style={{ textAlign: 'center', width: '45px' }}>
                  <HeaderThreeDotMenu visibleColumns={visibleColumns} onToggleColumn={toggleColumn} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDayRecords.map((rec, i) => {
                const isLeaveOrHoliday = rec.status === 'Leave' || rec.status === 'Holiday'
                const metrics = !isLeaveOrHoliday
                  ? getAttendanceMetrics(rec.check_in, rec.check_out, rec.work_tag)
                  : { workingHours: null, earlyInMins: 0, lateInMins: 0, earlyOutMins: 0, overtimeMins: 0, permissionHours: 0 }

                const targetHrs = metrics.workingHours
                const diffMins = targetHrs !== null ? Math.round((targetHrs - 8.5) * 60) : null
                const earlyInMins = metrics.earlyInMins
                const lateInMins = metrics.lateInMins
                const earlyOutMins = metrics.earlyOutMins
                const overtimeMins = metrics.overtimeMins
                const pHours = metrics.permissionHours > 0 ? metrics.permissionHours : null
                const hasPermission = pHours !== null || !!rec.work_tag?.includes('permission_')

                return (
                  <tr key={rec.emp_id}>
                    <td>{i + 1}</td>
                    <td><span className="badge badge-overtime">{rec.emp_id}</span></td>
                    <td>{rec.name}</td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[rec.status] || 'badge-present'}`}>
                        {rec.status}
                      </span>
                    </td>
                    <td>{rec.check_in || '—'}</td>
                    <td>{rec.check_out || '—'}</td>
                    {showEarlyCome && (
                      <td style={{ textAlign: 'center' }}>
                        {!isLeaveOrHoliday && earlyInMins > 0 ? (
                          <span
                            style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '5px', whiteSpace: 'nowrap', background: '#d5f5e3', color: '#1e8449', fontWeight: 700, display: 'inline-block' }}
                          >
                            {formatMins(earlyInMins)}
                          </span>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                    )}

                    {showLateIn && (
                      <td style={{ textAlign: 'center' }}>
                        {!isLeaveOrHoliday && lateInMins > 0 ? (
                          <span
                            style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '5px', whiteSpace: 'nowrap', background: '#fadbd8', color: '#c0392b', fontWeight: 700, display: 'inline-block' }}
                          >
                            {formatMins(lateInMins)}
                          </span>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                    )}

                    {showEarlyOut && (
                      <td style={{ textAlign: 'center' }}>
                        {!isLeaveOrHoliday && earlyOutMins > 0 ? (
                          <span
                            className="badge badge-earlyout"
                            style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '5px', whiteSpace: 'nowrap', fontWeight: 700 }}
                          >
                            {formatMins(earlyOutMins)}
                          </span>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                    )}

                    {showOvertime && (
                      <td style={{ textAlign: 'center' }}>
                        {!isLeaveOrHoliday && overtimeMins > 0 ? (
                          <span
                            className="badge badge-overtime"
                            style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '5px', whiteSpace: 'nowrap', fontWeight: 700 }}
                          >
                            {formatMins(overtimeMins)}
                          </span>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                    )}

                    {showPermission && (
                      <td style={{ textAlign: 'center' }}>
                        {!isLeaveOrHoliday && hasPermission ? (
                          <span
                            className="badge badge-primary"
                            style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '5px', whiteSpace: 'nowrap', background: '#eaf4fb', color: '#1e5799', fontWeight: 700 }}
                          >
                            {pHours !== null ? `${pHours.toFixed(1)}h` : 'Yes'}
                          </span>
                        ) : (
                          <span style={{ color: '#ccc' }}>—</span>
                        )}
                      </td>
                    )}

                    <td style={{ textAlign: 'center' }}>
                      {targetHrs !== null ? (
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '12px',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: targetHrs >= 8.5 ? '#d5f5e3' : '#fadbd8',
                            color: targetHrs >= 8.5 ? '#1e8449' : '#c0392b',
                            display: 'inline-block'
                          }}
                        >
                          {targetHrs.toFixed(1)}h
                        </span>
                      ) : (
                        <span style={{ color: '#ccc' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {diffMins !== null ? (
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '12px',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: diffMins >= 0 ? '#d5f5e3' : '#fadbd8',
                            color: diffMins >= 0 ? '#1e8449' : '#c0392b',
                            display: 'inline-block'
                          }}
                        >
                          {diffMins > 0 ? `+${formatMins(diffMins)}` : diffMins < 0 ? `-${formatMins(Math.abs(diffMins))}` : '0m'}
                        </span>
                      ) : (
                        <span style={{ color: '#ccc' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
})

export default AttendanceList

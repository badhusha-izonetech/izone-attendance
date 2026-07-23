import { useState, useMemo, useCallback, memo } from 'react'
import XLSX from 'xlsx-js-style'
import { MdSearch, MdDownload } from 'react-icons/md'
import type { LeaveRecord, Employee, DailyAttendance, HolidayRecord } from '../types'

interface LeaveListProps {
  leaves: LeaveRecord[]
  attendance: DailyAttendance[]
  employees: Employee[]
  holidays?: HolidayRecord[]
  onAddLeave?: (leave: LeaveRecord) => void
}

type DateMode = 'range' | 'single'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

const LeaveList = memo(function LeaveList({ leaves, attendance, employees, holidays = [] }: LeaveListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [dateMode, setDateMode] = useState<DateMode>('single')
  const [fromDate, setFromDate] = useState(todayStr())
  const [toDate, setToDate] = useState(todayStr())
  const [singleDate, setSingleDate] = useState(todayStr())

  // Deduplicate manual leaves + attendance leaves strictly by (emp_id, date)
  const allLeaves = useMemo(() => {
    const seen = new Set<string>()
    const result: Array<{ emp_id: string; emp_name: string; from_date: string; to_date: string }> = []

    // 1. Process manual leaves
    leaves.forEach(l => {
      const emp = employees.find(e => e.emp_id === l.emp_id)
      const name = l.emp_name || emp?.name || l.emp_id

      const fromD = String(l.from_date).split('T')[0]
      const toD = String(l.to_date).split('T')[0]

      let cur = new Date(fromD)
      const endD = new Date(toD)

      while (cur <= endD) {
        const dStr = cur.toISOString().split('T')[0]
        const key = `${l.emp_id}_${dStr}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push({ emp_id: l.emp_id, emp_name: name, from_date: dStr, to_date: dStr })
        }
        cur.setDate(cur.getDate() + 1)
      }
    })

    // 2. Process attendance leaves
    attendance.forEach(a => {
      if (a.status === 'Leave') {
        const dStr = String(a.date).split('T')[0]
        const key = `${a.emp_id}_${dStr}`
        if (!seen.has(key)) {
          seen.add(key)
          const emp = employees.find(e => e.emp_id === a.emp_id)
          result.push({
            emp_id: a.emp_id,
            emp_name: emp?.name || a.emp_id,
            from_date: dStr,
            to_date: dStr,
          })
        }
      }
    })

    return result.sort((a, b) => b.from_date.localeCompare(a.from_date))
  }, [leaves, attendance, employees])

  // Filter by search and date
  const filtered = useMemo(() => {
    return allLeaves.filter(l => {
      const q = searchQuery.trim().toLowerCase()
      const matchSearch = !q ||
        l.emp_id.toLowerCase().includes(q) ||
        l.emp_name.toLowerCase().includes(q)

      let matchDate = true
      if (dateMode === 'single' && singleDate) {
        matchDate = l.from_date <= singleDate && l.to_date >= singleDate
      } else if (dateMode === 'range' && fromDate && toDate) {
        matchDate = l.from_date <= toDate && l.to_date >= fromDate
      } else if (dateMode === 'range' && fromDate && !toDate) {
        matchDate = l.to_date >= fromDate
      } else if (dateMode === 'range' && !fromDate && toDate) {
        matchDate = l.from_date <= toDate
      }
      return matchSearch && matchDate
    })
  }, [allLeaves, searchQuery, dateMode, singleDate, fromDate, toDate])

  const hasFilter =
    searchQuery !== '' ||
    (dateMode === 'single' && singleDate !== todayStr()) ||
    (dateMode === 'range' && (fromDate !== todayStr() || toDate !== todayStr()))

  // Group leave records per employee for the selected range/filter
  const groupedPerEmployee = useMemo(() => {
    const map = new Map<string, {
      emp_id: string
      emp_name: string
      from_date: string
      to_date: string
      totalLeaves: number
    }>()

    filtered.forEach(l => {
      const existing = map.get(l.emp_id)
      const emp = employees.find(e => e.emp_id === l.emp_id)
      const name = l.emp_name || emp?.name || l.emp_id

      if (!existing) {
        map.set(l.emp_id, {
          emp_id: l.emp_id,
          emp_name: name,
          from_date: l.from_date,
          to_date: l.to_date,
          totalLeaves: 1,
        })
      } else {
        const minFrom = l.from_date < existing.from_date ? l.from_date : existing.from_date
        const maxTo = l.to_date > existing.to_date ? l.to_date : existing.to_date
        map.set(l.emp_id, {
          ...existing,
          from_date: minFrom,
          to_date: maxTo,
          totalLeaves: existing.totalLeaves + 1,
        })
      }
    })

    return Array.from(map.values()).sort((a, b) => a.emp_id.localeCompare(b.emp_id, undefined, { numeric: true }))
  }, [filtered, employees])

  const handleDownload = useCallback(() => {
    // 1. Generate dates in range
    const datesInRange: string[] = []
    const cur = new Date(dateMode === 'single' ? singleDate : fromDate)
    const end = new Date(dateMode === 'single' ? singleDate : toDate)
    while (cur <= end) {
      datesInRange.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }

    const aoa: any[][] = []

    // Row 1: Day Numbers header
    const headerDates = ['Emp ID', 'Name', 'Department']
    datesInRange.forEach(dStr => {
      const dayNum = Number(dStr.split('-')[2])
      headerDates.push(String(dayNum))
    })
    headerDates.push('Leave Count')
    headerDates.push('Present Count')
    aoa.push(headerDates)

    // Row 2: Weekday Names header
    const headerWeekdays = ['', '', '']
    const weekdayShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    datesInRange.forEach(dStr => {
      const [y, m, d] = dStr.split('-').map(Number)
      const dayIndex = new Date(y, m - 1, d).getDay()
      headerWeekdays.push(weekdayShort[dayIndex])
    })
    headerWeekdays.push('')
    headerWeekdays.push('')
    aoa.push(headerWeekdays)

    // Rows: Employee data
    employees.forEach(emp => {
      const row: any[] = [emp.emp_id, emp.name, emp.department]
      let leaveCount = 0
      let presentCount = 0

      datesInRange.forEach(dStr => {
        const dbRec = attendance.find(a => a.emp_id === emp.emp_id && a.date === dStr)
        const hasLeave = leaves.some(l => {
          if (l.emp_id !== emp.emp_id) return false
          const curDate = new Date(dStr)
          const fromD = new Date(l.from_date)
          const toD = new Date(l.to_date)
          return curDate >= fromD && curDate <= toD
        })
        const hasHoliday = holidays.some(h => h.emp_id === emp.emp_id && h.date === dStr)
        const [y, m, d] = dStr.split('-').map(Number)
        const isSun = new Date(y, m - 1, d).getDay() === 0

        let status = dbRec?.status
        if (!status) {
          if (hasLeave) status = 'Leave'
          else if (hasHoliday) status = 'Holiday'
          else if (isSun) status = 'Holiday'
        }

        let symbol = ''
        if (status === 'Present' || status === 'Weekend Working') {
          symbol = 'P'
          presentCount++
        } else if (status === 'Leave') {
          symbol = 'L'
          leaveCount++
        } else if (status === 'Half Day') {
          symbol = 'H/D'
          presentCount += 0.5
          leaveCount += 0.5
        } else if (status === 'Holiday') {
          symbol = 'H'
        }

        row.push(symbol)
      })

      // Add Leave Count and Present Count columns
      row.push(leaveCount)
      row.push(presentCount)
      aoa.push(row)
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Set styling for cells to match user's image exactly
    for (const key in ws) {
      if (key.startsWith('!')) continue

      const cell = ws[key]
      const colLetter = key.replace(/[0-9]/g, '')
      const rowNum = Number(key.replace(/[^0-9]/g, ''))

      let colIdx = 0
      for (let i = 0; i < colLetter.length; i++) {
        colIdx = colIdx * 26 + (colLetter.charCodeAt(i) - 64)
      }
      colIdx = colIdx - 1

      // Common style defaults
      cell.s = {
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        },
        font: { name: 'Calibri', size: 11, bold: false }
      }

      // Headers (Row 1 and 2)
      if (rowNum === 1 || rowNum === 2) {
        cell.s.font.bold = true
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } }
        continue
      }

      // Metadata columns (Emp ID, Name, Department)
      if (colIdx < 3) {
        if (colIdx === 1) {
          cell.s.alignment.horizontal = 'left'
        }
        continue
      }

      // Summary columns (Leave Count & Present Count)
      const leaveColIdx = 3 + datesInRange.length
      const presentColIdx = 4 + datesInRange.length

      if (colIdx === leaveColIdx) {
        cell.s.font.bold = true
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } }
        cell.s.font.color = { rgb: 'B91C1C' }
        continue
      }
      if (colIdx === presentColIdx) {
        cell.s.font.bold = true
        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'E0F2FE' } }
        cell.s.font.color = { rgb: '0369A1' }
        continue
      }

      // Date cells:
      const dStr = datesInRange[colIdx - 3]
      const [y, m, d] = dStr.split('-').map(Number)
      const isSun = new Date(y, m - 1, d).getDay() === 0

      if (isSun) {
        if (cell.v === 'P' || cell.v === 'H/D') {
          // Sunday Working: Blue background (#4F81BD)
          cell.s.fill = { patternType: 'solid', fgColor: { rgb: '4F81BD' } }
          cell.s.font.bold = true
        } else {
          // Sunday Holiday: Green background (#00B050)
          cell.s.fill = { patternType: 'solid', fgColor: { rgb: '00B050' } }
          cell.v = '' // make empty like in user's image
        }
      } else {
        // Weekday cells:
        if (cell.v === 'P') {
          // Weekday Present: White background, normal black text
        } else if (cell.v === 'L') {
          // Leave: Bright Red background (#FF0000)
          cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FF0000' } }
          cell.s.font.bold = true
        } else if (cell.v === 'H/D') {
          // Half Day: Yellow background (#FFFF00)
          cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }
          cell.s.font.bold = true
        } else if (cell.v === 'H') {
          // Holiday (Weekday Holiday): Green background (#00B050)
          cell.s.fill = { patternType: 'solid', fgColor: { rgb: '00B050' } }
          cell.v = '' // make empty like in user's image
        }
      }
    }

    // Auto-fit column widths
    const colsWidths: any[] = []
    colsWidths.push({ wch: 10 }) // Emp ID
    colsWidths.push({ wch: 22 }) // Name
    colsWidths.push({ wch: 18 }) // Department
    datesInRange.forEach(() => {
      colsWidths.push({ wch: 4 })  // Day status columns
    })
    colsWidths.push({ wch: 14 }) // Leave Count
    colsWidths.push({ wch: 15 }) // Present Count
    ws['!cols'] = colsWidths

    const dateLabel = dateMode === 'single'
      ? singleDate
      : `${fromDate}_to_${toDate}`

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `Leave_Report_${dateLabel}.xlsx`)
  }, [dateMode, singleDate, fromDate, toDate, employees, attendance, leaves, holidays])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Leave List</h1>
          <p>Track and manage employee leaves</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="leave-filter-bar">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 300 }}>
          <MdSearch size={16} className="search-icon" />
          <input
            className="search-input"
            style={{ width: '100%' }}
            aria-label="Search by Emp ID or Name"
            placeholder="Search by Emp ID or Name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="date-mode-toggle">
          <button aria-label="Select date range" className={`toggle-btn ${dateMode === 'range' ? 'active' : ''}`} onClick={() => setDateMode('range')}>Date Range</button>
          <button aria-label="Select single date" className={`toggle-btn ${dateMode === 'single' ? 'active' : ''}`} onClick={() => setDateMode('single')}>Single Date</button>
        </div>

        {dateMode === 'range' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input aria-label="From date" type="date" className="date-input" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span style={{ color: '#7f8c8d', fontSize: 13 }}>to</span>
            <input aria-label="To date" type="date" className="date-input" value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
        ) : (
          <input aria-label="Single date" type="date" className="date-input" value={singleDate} onChange={e => setSingleDate(e.target.value)} />
        )}

        {hasFilter && (
          <button aria-label="Clear filters" className="clear-btn" onClick={() => { setFromDate(todayStr()); setToDate(todayStr()); setSingleDate(todayStr()); setSearchQuery('') }}>Clear</button>
        )}

        <button
          onClick={handleDownload}
          disabled={filtered.length === 0}
          aria-label="Download Excel"
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            background: filtered.length === 0 ? '#cbd5e1' : 'var(--blue-mid)',
            border: 'none',
            color: '#fff',
            cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
            marginLeft: 'auto'
          }}
        >
          <MdDownload size={18} />
          Download Excel
        </button>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <h2>Leave Records ({groupedPerEmployee.length})</h2>
          {groupedPerEmployee.length > 0 && (
            <span className="record-count">{groupedPerEmployee.length} total employees</span>
          )}
        </div>
        {groupedPerEmployee.length === 0 ? (
          <div className="empty-state">
            {allLeaves.length === 0
              ? 'No leave records found. Mark employees as "Leave" in the Attendance page and save to track them here.'
              : 'No leave records match your search/filter criteria.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Emp ID</th>
                <th>Name</th>
                <th>From</th>
                <th>To</th>
                <th style={{ textAlign: 'center' }}>Total Leaves</th>
              </tr>
            </thead>
            <tbody>
              {groupedPerEmployee.map((l, i) => (
                <tr key={l.emp_id}>
                  <td>{i + 1}</td>
                  <td>
                    <span className="badge badge-overtime">{l.emp_id}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{l.emp_name}</td>
                  <td>{l.from_date}</td>
                  <td>{l.to_date}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        background: '#fadbd8',
                        color: '#c0392b',
                        display: 'inline-block'
                      }}
                    >
                      {l.totalLeaves} {l.totalLeaves === 1 ? 'Day' : 'Days'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
})

export default LeaveList

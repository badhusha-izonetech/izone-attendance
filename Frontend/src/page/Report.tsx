import { useState, useMemo, useCallback, memo } from 'react'
import * as XLSX from 'xlsx'
import {
  MdCalendarToday,
  MdDateRange,
  MdDownload,
  MdSearch,
  MdAssessment,
  MdPeople,
  MdAccessTime,
  MdCheckCircle,
  MdDelete,
} from 'react-icons/md'
import type { DailyAttendance, Employee, LeaveRecord, HolidayRecord } from '../types'

interface ReportProps {
  attendance: DailyAttendance[]
  employees: Employee[]
  leaves: LeaveRecord[]
  holidays?: HolidayRecord[]
  onDeleteAttendance?: (fromDate: string, toDate: string) => Promise<void>
}

type ReportMode = 'single' | 'range'
type ReportTab = 'summary' | 'detail'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

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

const STANDARD_OUT = '18:30'

function toMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getOvertimeMinutes(inT: string, outT: string, work_tag?: string | null): number {
  if (!inT || !outT) return 0
  let outMins = toMinutes(outT)
  const inMins = toMinutes(inT)
  if (outMins <= inMins) outMins += 24 * 60

  if (outMins <= toMinutes(STANDARD_OUT)) return 0

  const workedHrs = calcHours(inT, outT, work_tag)
  if (workedHrs === null || workedHrs <= 8.5) return 0

  const otHrs = workedHrs - 8.5
  return Math.round(otHrs * 60)
}

function formatMins(mins: number): string {
  if (mins <= 0) return '—'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
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
      {tagStr.split(',').map(tag => (
        <span key={tag} className={`badge ${TAG_CLASS[tag] || 'badge-present'}`}>
          {TAG_LABEL[tag] || tag}
        </span>
      ))}
    </div>
  )
}

const Report = memo(function Report({ attendance, employees, leaves, holidays, onDeleteAttendance }: ReportProps) {
  const [mode, setMode] = useState<ReportMode>('single')
  const [activeTab, setActiveTab] = useState<ReportTab>('summary')
  const [singleDate, setSingleDate] = useState(todayStr())
  const [fromDate, setFromDate] = useState(todayStr())
  const [toDate, setToDate] = useState(todayStr())
  const [search, setSearch] = useState('')

  /* ── Filtered attendance records based on mode ── */
  const filtered = useMemo(() => {
    return attendance.filter(a => {
      if (mode === 'single') return a.date === singleDate
      return a.date >= fromDate && a.date <= toDate
    })
  }, [attendance, mode, singleDate, fromDate, toDate])

  /* ── Manual leaves that fall in range but aren't in attendance ── */
  const manualLeaveRecords = useMemo(() => {
    const attSet = new Set(filtered.map(a => `${a.emp_id}_${a.date}`))
    const result: DailyAttendance[] = []
    leaves.forEach(l => {
      // Expand each leave record into daily records within the selected range
      const startDate = mode === 'single' ? singleDate : fromDate
      const endDate = mode === 'single' ? singleDate : toDate
      // Get the overlapping date range
      const overlapStart = l.from_date > startDate ? l.from_date : startDate
      const overlapEnd = l.to_date < endDate ? l.to_date : endDate
      if (overlapStart > overlapEnd) return
      // Add daily entries for each day in the overlap
      let cursor = new Date(overlapStart)
      const endD = new Date(overlapEnd)
      while (cursor <= endD) {
        const dateStr = cursor.toISOString().split('T')[0]
        const key = `${l.emp_id}_${dateStr}`
        if (!attSet.has(key)) {
          result.push({
            emp_id: l.emp_id,
            date: dateStr,
            check_in: '',
            check_out: '',
            status: 'Leave',
            work_tag: null,
          })
          attSet.add(key) // prevent duplicates
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    })
    return result
  }, [leaves, filtered, mode, singleDate, fromDate, toDate])

  /* ── Holiday records that fall in range but aren't in attendance ── */
  const manualHolidayRecords = useMemo(() => {
    if (!holidays) return []
    const attSet = new Set([
      ...filtered.map(a => `${a.emp_id}_${a.date}`),
      ...manualLeaveRecords.map(a => `${a.emp_id}_${a.date}`)
    ])
    const result: DailyAttendance[] = []

    holidays.forEach(h => {
      const startDate = mode === 'single' ? singleDate : fromDate
      const endDate = mode === 'single' ? singleDate : toDate

      if (h.date >= startDate && h.date <= endDate) {
        const key = `${h.emp_id}_${h.date}`
        if (!attSet.has(key)) {
          result.push({
            emp_id: h.emp_id,
            date: h.date,
            check_in: '',
            check_out: '',
            status: 'Holiday',
            work_tag: null
          })
          attSet.add(key)
        }
      }
    })
    return result
  }, [holidays, filtered, manualLeaveRecords, mode, singleDate, fromDate, toDate])



  const [sortFilter, setSortFilter] = useState<'all' | 'overtime' | 'earlyin' | 'earlyout' | 'latein'>('all')

  /* ── Enrich records with employee name (include manual leaves and holidays) ── */
  const enriched = useMemo(() => {
    const list = [...filtered, ...manualLeaveRecords, ...manualHolidayRecords].map(a => {
      const emp = employees.find(e => e.emp_id === a.emp_id || e.name === a.emp_id)
      // For leave/holiday records, try to find emp_name
      const leaveRec = leaves.find(l => l.emp_id === a.emp_id)
      const holidayRec = holidays?.find(h => h.emp_id === a.emp_id)
      return {
        ...a,
        emp_name: emp?.name || leaveRec?.emp_name || holidayRec?.emp_name || a.emp_id,
        department: emp?.department || '—'
      }
    }).filter(a => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        a.emp_id.toLowerCase().includes(q) ||
        a.emp_name.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q)
      )
    })

    if (sortFilter === 'all') {
      return list.sort((a, b) => a.emp_id.localeCompare(b.emp_id, undefined, { numeric: true }))
    }

    const indexed = list.map((item, index) => ({ item, index }))

    indexed.sort((aObj, bObj) => {
      const a = aObj.item
      const b = bObj.item

      const toM = (t: string) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m }

      const isLeaveOrHolidayA = a.status === 'Leave' || a.status === 'Holiday'
      const isLeaveOrHolidayB = b.status === 'Leave' || b.status === 'Holiday'

      const earlyInMinsA = !isLeaveOrHolidayA && a.check_in ? Math.max(0, toM('10:00') - toM(a.check_in)) : 0
      const earlyInMinsB = !isLeaveOrHolidayB && b.check_in ? Math.max(0, toM('10:00') - toM(b.check_in)) : 0

      const lateInMinsA = !isLeaveOrHolidayA && a.check_in ? Math.max(0, toM(a.check_in) - toM('10:05')) : 0
      const lateInMinsB = !isLeaveOrHolidayB && b.check_in ? Math.max(0, toM(b.check_in) - toM('10:05')) : 0

      let outMA = toM(a.check_out)
      let outMB = toM(b.check_out)
      if (a.check_in && outMA <= toM(a.check_in)) outMA += 24 * 60
      if (b.check_in && outMB <= toM(b.check_in)) outMB += 24 * 60

      const earlyOutMinsA = !isLeaveOrHolidayA && a.check_in && a.check_out ? Math.max(0, toM('18:30') - outMA) : 0
      const earlyOutMinsB = !isLeaveOrHolidayB && b.check_in && b.check_out ? Math.max(0, toM('18:30') - outMB) : 0

      const otMinsA = !isLeaveOrHolidayA && a.check_in && a.check_out ? Math.max(0, outMA - toM('18:30')) : 0
      const otMinsB = !isLeaveOrHolidayB && b.check_in && b.check_out ? Math.max(0, outMB - toM('18:30')) : 0

      let valA = 0
      let valB = 0

      if (sortFilter === 'overtime') { valA = otMinsA; valB = otMinsB }
      else if (sortFilter === 'earlyin') { valA = earlyInMinsA; valB = earlyInMinsB }
      else if (sortFilter === 'latein') { valA = lateInMinsA; valB = lateInMinsB }
      else if (sortFilter === 'earlyout') { valA = earlyOutMinsA; valB = earlyOutMinsB }

      if (valA > 0 || valB > 0) {
        if (valB !== valA) return valB - valA
      }

      // Order strictly by numerical employee ID for non-matching or equal records
      return a.emp_id.localeCompare(b.emp_id, undefined, { numeric: true })
    })

    return indexed.map(o => o.item)
  }, [filtered, manualLeaveRecords, manualHolidayRecords, employees, leaves, holidays, search, sortFilter])

  /* ── Group enriched by date (for range mode) ── */
  const groupedByDate = useMemo(() => {
    const map = new Map<string, typeof enriched>()
    enriched.forEach(a => {
      const list = map.get(a.date) || []
      list.push(a)
      map.set(a.date, list)
    })
    // Sort dates ascending
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [enriched])

  /* ── Employee summary (for range mode aggregation) ── */
  const employeeSummary = useMemo(() => {
    if (mode !== 'range') return []

    // 1. Calculate all dates in the range
    const datesInRange: string[] = []
    const cur = new Date(fromDate)
    const end = new Date(toDate)
    while (cur <= end) {
      datesInRange.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }

    // Helper: Check if a date is a holiday (Sunday or declared office holiday) for an employee
    const isHolidayForEmp = (empId: string, dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number)
      const isSunday = new Date(y, m - 1, d).getDay() === 0
      if (isSunday) return true

      if (holidays && holidays.some(h => (h.emp_id === empId || h.emp_id === 'all' || !h.emp_id) && h.date === dateStr)) {
        return true
      }

      if (enriched.some(a => a.emp_id === empId && a.date === dateStr && a.status === 'Holiday')) {
        return true
      }

      return false
    }

    // 3. Group enriched records by employee ID
    const empMap = new Map<string, {
      emp_id: string
      emp_name: string
      department: string
      present: number
      halfday: number
      leave: number
      totalHours: number
      overtimeMins: number
      weekendWorked: number
    }>()

    enriched.forEach(a => {
      const key = a.emp_id
      const [y, m, d] = a.date.split('-').map(Number)
      const day = new Date(y, m - 1, d).getDay()
      const isDayWeekend = day === 0

      if (!empMap.has(key)) {
        empMap.set(key, {
          emp_id: a.emp_id,
          emp_name: a.emp_name,
          department: a.department,
          present: 0,
          halfday: 0,
          leave: 0,
          totalHours: 0,
          overtimeMins: 0,
          weekendWorked: 0
        })
      }

      const info = empMap.get(key)!

      // Update department and name if they were empty/placeholder
      if (a.department && a.department !== '—') info.department = a.department
      if (a.emp_name) info.emp_name = a.emp_name

      if (a.status === 'Present' || a.status === 'Weekend Working') {
        info.present += 1
        if (isDayWeekend) {
          info.weekendWorked += 1
        }
      } else if (a.status === 'Half Day') {
        info.halfday += 1
        if (isDayWeekend) {
          info.weekendWorked += 0.5
        }
      } else if (a.status === 'Leave') {
        if (!isDayWeekend) {
          info.leave += 1
        }
      }

      const hrs = calcHours(a.check_in, a.check_out, a.work_tag)
      if (hrs !== null) {
        info.totalHours += hrs
      }

      if (a.check_in && a.check_out) {
        info.overtimeMins += getOvertimeMinutes(a.check_in, a.check_out)
      }
    })

    // 4. Convert map to list and calculate attendance percentage
    return Array.from(empMap.values()).map(info => {
      let expectedWorkingDays = 0
      let expectedHolidays = 0

      datesInRange.forEach(dateStr => {
        if (isHolidayForEmp(info.emp_id, dateStr)) {
          expectedHolidays += 1
        } else {
          expectedWorkingDays += 1
        }
      })

      let attPercentage = 0
      if (expectedWorkingDays > 0) {
        attPercentage = ((info.present + info.halfday * 0.5) / expectedWorkingDays) * 100
      } else if (info.present > 0 || info.halfday > 0) {
        attPercentage = 100
      }

      return {
        ...info,
        expectedWorkingDays,
        expectedHolidays,
        attendancePercentage: Math.min(100, Math.max(0, attPercentage))
      }
    }).sort((a, b) => {
      if (sortFilter === 'overtime') {
        if (b.overtimeMins !== a.overtimeMins) return b.overtimeMins - a.overtimeMins
      }
      return a.emp_id.localeCompare(b.emp_id, undefined, { numeric: true })
    })
  }, [enriched, mode, fromDate, toDate, sortFilter])

  /* ── Summary stats ── */
  const stats = useMemo(() => ({
    total: enriched.length,
    present: enriched.filter(a => a.status === 'Present' || a.status === 'Weekend Working').length,
    halfday: enriched.filter(a => a.status === 'Half Day').length,
    leave: enriched.filter(a => a.status === 'Leave').length,
    overtime: enriched.filter(a => a.work_tag === 'overtime').length,
  }), [enriched])

  /* ── Date label for display ── */
  const dateLabel = mode === 'single'
    ? singleDate
    : `${fromDate} → ${toDate}`

  /* ── Export to Excel ── */
  const handleDownload = useCallback(() => {
    if (enriched.length === 0) return

    const wb = XLSX.utils.book_new()
    const fileName = mode === 'single'
      ? `Report_${singleDate}.xlsx`
      : `Report_${fromDate}_to_${toDate}.xlsx`

    const sheetRows: any[] = []

    if (mode === 'single') {
      groupedByDate.forEach(([_, rows], groupIdx) => {
        // Add empty row between dates
        if (groupIdx > 0) {
          sheetRows.push({
            '#': '',
            'Employee ID': '',
            'Name': '',
            'Department': '',
            'Date': '',
            'Check In': '',
            'Check Out': '',
            'Working Hours': '',
            'Overtime': '',
            'Status': '',
            'Work Tag': '',
          })
        }

        rows.forEach((a, i) => {
          const otMins = a.check_in && a.check_out ? getOvertimeMinutes(a.check_in, a.check_out, a.work_tag) : 0
          const dynamicTag = a.work_tag || getDynamicWorkTag(a.check_in || '', a.check_out || '')
          sheetRows.push({
            '#': i + 1,
            'Employee ID': a.emp_id,
            'Name': a.emp_name,
            'Department': a.department,
            'Date': a.date,
            'Check In': a.check_in || '—',
            'Check Out': a.check_out || '—',
            'Working Hours': calcHours(a.check_in, a.check_out, a.work_tag)?.toFixed(1) ?? '—',
            'Overtime': otMins > 0 ? formatMins(otMins) : '—',
            'Status': a.status,
            'Work Tag': dynamicTag ? dynamicTag.split(',').map(t => TAG_LABEL[t] || t).join(', ') : '—',
          })
        })
      })
    } else {
      employeeSummary.forEach((emp, i) => {
        sheetRows.push({
          '#': i + 1,
          'Employee ID': emp.emp_id,
          'Name': emp.emp_name,
          'Department': emp.department,
          'Working Days': emp.expectedWorkingDays,
          'Holidays': emp.weekendWorked,
          'Present': emp.present,
          'Leave': emp.leave,
          'Half Day': emp.halfday,
          'Overtime': emp.overtimeMins > 0 ? formatMins(emp.overtimeMins) : '—',
          'Total Hours': emp.totalHours.toFixed(1),
        })
      })
    }

    const ws = XLSX.utils.json_to_sheet(sheetRows)

    /* Auto column width */
    const cols = Object.keys(sheetRows[0] || {}).map(k => ({ wch: Math.max(k.length, 12) }))
    ws['!cols'] = cols

    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report')
    XLSX.writeFile(wb, fileName)
  }, [enriched, mode, singleDate, fromDate, toDate, groupedByDate, employeeSummary])

  const handleDelete = useCallback(() => {
    if (!onDeleteAttendance) return
    const start = mode === 'single' ? singleDate : fromDate
    const end = mode === 'single' ? singleDate : toDate
    if (!start || !end) return

    const confirmMsg = mode === 'single'
      ? `Are you sure you want to delete all attendance records for ${singleDate}? This action cannot be undone.`
      : `Are you sure you want to delete all attendance records from ${fromDate} to ${toDate}? This action cannot be undone.`

    if (window.confirm(confirmMsg)) {
      onDeleteAttendance(start, end)
    }
  }, [onDeleteAttendance, mode, singleDate, fromDate, toDate])

  return (
    <div className="report-page">

      {/* ── Page Header & Navbar controls ── */}
      <div className="report-top-header">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Attendance Report</h1>
          <p>Generate and export attendance reports by date or date range</p>
        </div>

        {/* ── Mode Toggle ── */}
        <div className="report-mode-toggle">
          <button
            className={`mode-btn ${mode === 'single' ? 'active' : ''}`}
            aria-label="Single date report"
            onClick={() => setMode('single')}
          >
            <MdCalendarToday size={14} />
            Single Date
          </button>
          <button
            className={`mode-btn ${mode === 'range' ? 'active' : ''}`}
            aria-label="Date range report"
            onClick={() => setMode('range')}
          >
            <MdDateRange size={14} />
            Date Range
          </button>
        </div>
      </div>

      {/* ── Navbar Tabs ── */}
      <div className="report-navbar">
        {mode === 'single' ? (
          <div className="report-nav-tabs">
            <button
              className={`report-nav-tab ${activeTab === 'summary' ? 'active' : ''}`}
              aria-label="Summary view"
              onClick={() => setActiveTab('summary')}
            >
              <MdAssessment size={16} />
              Summary
            </button>
            <button
              className={`report-nav-tab ${activeTab === 'detail' ? 'active' : ''}`}
              aria-label="Detailed view"
              onClick={() => setActiveTab('detail')}
            >
              <MdPeople size={16} />
              Detailed View
            </button>
          </div>
        ) : (
          <div className="report-nav-tabs">
            <span className="report-nav-tab active">
              <MdAssessment size={16} />
              Employee Summary Report
            </span>
          </div>
        )}
      </div>

      {/* ── Filter Bar ── */}
      <div className="report-filter-bar">
        <div className="report-filter-left">
          {mode === 'single' ? (
            <div className="report-date-group">
              <label><MdCalendarToday size={13} aria-hidden="true" /> Date</label>
              <input
                type="date"
                className="date-input"
                aria-label="Date"
                value={singleDate}
                onChange={e => setSingleDate(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="report-date-group">
                <label>From</label>
                <input
                  type="date"
                  className="date-input"
                  aria-label="From date"
                  value={fromDate}
                  max={toDate}
                  onChange={e => setFromDate(e.target.value)}
                />
              </div>
              <span className="date-sep">→</span>
              <div className="report-date-group">
                <label>To</label>
                <input
                  type="date"
                  className="date-input"
                  aria-label="To date"
                  value={toDate}
                  min={fromDate}
                  onChange={e => setToDate(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="search-wrap">
            <MdSearch size={16} className="search-icon" aria-hidden="true" />
            <input
              className="search-input"
              aria-label="Search employee"
              placeholder="Search employee..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Prioritize / Sort option buttons & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="prior-filter-group">
            <span className="prior-label">Prioritize Top:</span>
            <button
              className={`prior-btn ${sortFilter === 'all' ? 'active-all' : ''}`}
              onClick={() => setSortFilter('all')}
            >
              Default
            </button>
            <button
              className={`prior-btn ${sortFilter === 'overtime' ? 'active-overtime' : ''}`}
              onClick={() => setSortFilter('overtime')}
            >
              Overtime
            </button>
            <button
              className={`prior-btn ${sortFilter === 'earlyin' ? 'active-earlyin' : ''}`}
              onClick={() => setSortFilter('earlyin')}
            >
              Early In
            </button>
            <button
              className={`prior-btn ${sortFilter === 'earlyout' ? 'active-earlyout' : ''}`}
              onClick={() => setSortFilter('earlyout')}
            >
              Early Out
            </button>
            <button
              className={`prior-btn ${sortFilter === 'latein' ? 'active-latein' : ''}`}
              onClick={() => setSortFilter('latein')}
            >
              Late In
            </button>
          </div>

          <div className="report-filter-right-actions">
            {onDeleteAttendance && (
              <button
                className={`btn-delete-report ${enriched.length === 0 ? 'disabled' : ''}`}
                onClick={handleDelete}
                disabled={enriched.length === 0}
                aria-label="Delete records"
                title={enriched.length === 0 ? 'No data to delete' : `Delete records for ${dateLabel}`}
              >
                <MdDelete size={17} aria-hidden="true" />
                Delete Records
              </button>
            )}

            <button
              className={`btn-download ${enriched.length === 0 ? 'disabled' : ''}`}
              onClick={handleDownload}
              disabled={enriched.length === 0}
              aria-label="Download Excel"
              title={enriched.length === 0 ? 'No data to export' : `Download Excel for ${dateLabel}`}
            >
              <MdDownload size={17} aria-hidden="true" />
              Download Excel
              {enriched.length > 0 && <span className="dl-count">{enriched.length}</span>}
            </button>
          </div>
        </div>
      </div>

      {mode === 'single' ? (
        <>
          {/* ── Summary Tab ── */}
          {activeTab === 'summary' && (
            <>
              <div className="report-stats-grid">
                <div className="report-stat-card blue">
                  <div className="rsc-icon"><MdPeople size={22} /></div>
                  <div>
                    <h3>{stats.total}</h3>
                    <p>Total Records</p>
                  </div>
                </div>
                <div className="report-stat-card green">
                  <div className="rsc-icon"><MdCheckCircle size={22} /></div>
                  <div>
                    <h3>{stats.present}</h3>
                    <p>Present</p>
                  </div>
                </div>
                <div className="report-stat-card yellow">
                  <div className="rsc-icon"><MdAccessTime size={22} /></div>
                  <div>
                    <h3>{stats.halfday}</h3>
                    <p>Half Day</p>
                  </div>
                </div>
                <div className="report-stat-card red">
                  <div className="rsc-icon"><MdCalendarToday size={22} /></div>
                  <div>
                    <h3>{stats.leave}</h3>
                    <p>On Leave</p>
                  </div>
                </div>
                <div className="report-stat-card indigo">
                  <div className="rsc-icon"><MdAssessment size={22} /></div>
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
          )}

          {/* ── Detail Tab ── */}
          {activeTab === 'detail' && (
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
                          <td>{renderTags(a.work_tag || getDynamicWorkTag(a.check_in || '', a.check_out || ''))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      ) : (
        <>
          {/* ── Range Mode (Aggregated Summary) ── */}
          <div className="report-stats-grid">
            <div className="report-stat-card blue">
              <div className="rsc-icon"><MdPeople size={22} /></div>
              <div>
                <h3>{stats.total}</h3>
                <p>Total Records</p>
              </div>
            </div>
            <div className="report-stat-card green">
              <div className="rsc-icon"><MdCheckCircle size={22} /></div>
              <div>
                <h3>{stats.present}</h3>
                <p>Present</p>
              </div>
            </div>
            <div className="report-stat-card yellow">
              <div className="rsc-icon"><MdAccessTime size={22} /></div>
              <div>
                <h3>{stats.halfday}</h3>
                <p>Half Day</p>
              </div>
            </div>
            <div className="report-stat-card red">
              <div className="rsc-icon"><MdCalendarToday size={22} /></div>
              <div>
                <h3>{stats.leave}</h3>
                <p>On Leave</p>
              </div>
            </div>
            <div className="report-stat-card indigo">
              <div className="rsc-icon"><MdAssessment size={22} /></div>
              <div>
                <h3>{stats.overtime}</h3>
                <p>Overtime Records</p>
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
                      <th>Overtime</th>
                      <th>Total Hours</th>
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
                        <td>{emp.overtimeMins > 0 ? formatMins(emp.overtimeMins) : '—'}</td>
                        <td>{emp.totalHours.toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
})

export default Report

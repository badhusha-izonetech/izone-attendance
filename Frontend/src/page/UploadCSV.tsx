import { useRef, useState, useCallback, memo } from 'react'
import * as XLSX from 'xlsx'
import { MdUploadFile, MdCheckCircle, MdClose, MdCalendarToday } from 'react-icons/md'
import type { AttendanceRecord } from '../types'

interface UploadProps {
  onUpload: (records: AttendanceRecord[], targetDate: string) => void
}

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeStatus(raw: string): AttendanceRecord['status'] {
  const v = (raw || '').trim().toLowerCase()
  if (v === 'p' || v === 'present' || v === 'prs') return 'Present'
  if (
    v === 'l' || v === 'leave' || v === 'a' || v === 'absent' ||
    v === 'cl' || v === 'sl' || v === 'el' || v === 'pl' ||
    v.includes('leave') || v.includes('absent')
  ) {
    return 'Leave'
  }
  if (v === 'h' || v === 'half day' || v === 'halfday' || v === 'hd') return 'Half Day'
  if (v === 'holiday') return 'Holiday'
  if (v === 'weekend working' || v === 'weekendworking' || v === 'ww') return 'Weekend Working'
  return 'Present'
}

function formatToISODate(rawDate: string): string {
  let clean = (rawDate || '').trim()
  if (!clean) return ''
  clean = clean.split(/[ T]/)[0]
  const parts = clean.split(/[-/]/)
  if (parts.length === 3) {
    let y = parts[0], m = parts[1], d = parts[2]
    if (parts[2].length === 4) { y = parts[2]; m = parts[1]; d = parts[0] }
    const year = y.length === 2 ? `20${y}` : y
    const monthVal = Number(m), dayVal = Number(d)
    let month = String(monthVal).padStart(2, '0')
    let day   = String(dayVal).padStart(2, '0')
    if (monthVal > 12 && dayVal <= 12) { month = String(dayVal).padStart(2, '0'); day = String(monthVal).padStart(2, '0') }
    const ny = Number(year), nm = Number(month), nd = Number(day)
    if (!isNaN(ny) && !isNaN(nm) && !isNaN(nd) && nm >= 1 && nm <= 12 && nd >= 1 && nd <= 31)
      return `${year}-${month}-${day}`
  }
  return clean
}

// Convert any raw Excel value → "HH:MM" 24-hour string
function formatToTimeStr(rawTime: any): string {
  if (rawTime === null || rawTime === undefined || rawTime === '') return ''

  if (rawTime instanceof Date) {
    return `${String(rawTime.getHours()).padStart(2, '0')}:${String(rawTime.getMinutes()).padStart(2, '0')}`
  }

  const rawStr = String(rawTime).trim()
  if (!rawStr) return ''

  // 0. If string contains date + time with space or 'T' (e.g. "2026-07-23 18:30:00", "23/07/2026 6:30 PM", "2026-07-23T18:30:00")
  if (rawStr.includes('T') || rawStr.includes(' ')) {
    const timePart = rawStr.split(/[T\s]+/)[1]
    if (timePart) {
      const ampmMatch = timePart.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/i)
      if (ampmMatch) {
        let h = parseInt(ampmMatch[1], 10)
        const m = ampmMatch[2]
        const p = ampmMatch[3].replace(/\./g, '').toLowerCase()
        if (p === 'am') { if (h === 12) h = 0 } else { if (h !== 12) h += 12 }
        return `${String(h).padStart(2, '0')}:${m}`
      }
      const hhmmMatch = timePart.match(/^(\d{1,2}):(\d{2})/)
      if (hhmmMatch) return `${String(hhmmMatch[1]).padStart(2, '0')}:${hhmmMatch[2]}`
    }
  }

  // 1. Standard AM/PM string: "10:00 AM", "6:30 PM", "10.45 AM"
  const ampm = rawStr.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = ampm[2]
    const p = ampm[3].replace(/\./g, '').toLowerCase()
    if (p === 'am') { if (h === 12) h = 0 } else { if (h !== 12) h += 12 }
    return `${String(h).padStart(2, '0')}:${m}`
  }

  // 2. Standard HH:MM 24-hr string: "10:00", "19:30", "20:25", "09:50"
  const hhmm = rawStr.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) {
    const h = parseInt(hhmm[1], 10)
    const m = parseInt(hhmm[2], 10)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }

  const num = Number(rawTime)

  // 3. Excel raw time fraction or datetime serial (e.g. 0.416666 = 10:00, or 45480.791666 = 19:00)
  if (!isNaN(num) && num > 0) {
    const frac = num < 1 ? num : num - Math.floor(num)
    const totalMins = Math.round(frac * 24 * 60)
    if (totalMins > 0 && totalMins < 24 * 60) {
      const h = Math.floor(totalMins / 60)
      const m = totalMins % 60
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }

  // 4. Excel decimal time (e.g. 10.00, 10.45, 9.50, 19.00, 19.30, 20.25, 20.50, 10.27)
  if (rawStr.includes('.')) {
    const parts = rawStr.split('.')
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10)
      let mStr = parts[1]
      if (mStr.length === 1) mStr = mStr + '0'
      const m = parseInt(mStr.substring(0, 2), 10)
      if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 24 && m >= 0 && m <= 59) {
        const finalH = h === 24 ? 0 : h
        return `${String(finalH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
    }
  }

  // 5. Integer hour numbers: 10 -> "10:00", 12 -> "12:00", 19 -> "19:00"
  if (!isNaN(num) && num >= 1 && num <= 24) {
    const h = Math.floor(num)
    const finalH = h === 24 ? 0 : h
    return `${String(finalH).padStart(2, '0')}:00`
  }

  return ''
}

function toMinutes(t: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function calcHours(inT: string, outT: string): number | null {
  if (!inT || !outT) return null
  let outMins = toMinutes(outT)
  const inMins = toMinutes(inT)
  // Handle overnight shift: if checkout is before check-in, assume next day
  if (outMins <= inMins) outMins += 24 * 60
  const diff = (outMins - inMins) / 60
  return diff > 0 ? diff : null
}

function findHeaderRowIndex(ws: XLSX.WorkSheet): number {
  // Read raw 2D array
  const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
  
  const targetHeaders = [
    'empname', 'employeename', 'name', 
    'empid', 'employeeid', 'id',
    'checkintime', 'checkin', 'intime', 'in', 'cin', 'punchin', 'timein', 'clockin', 'firstin', 'entry', 'entrytime', 'start', 'starttime',
    'checkouttime', 'checkout', 'outtime', 'out', 'cout', 'checkinout', 'punchout', 'timeout', 'clockout', 'lastout', 'logout', 'signout', 'exit', 'exittime', 'offduty', 'dutyout', 'shiftout',
    'today', 'status', 'attendance', 'att', 'state', 'remarks'
  ]

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!Array.isArray(row)) continue
    
    // Count how many items in this row match any of our target headers
    let matchCount = 0
    row.forEach(cell => {
      const normCell = String(cell || '').toLowerCase().replace(/[\s_\-\/\.]/g, '')
      if (normCell && targetHeaders.includes(normCell)) {
        matchCount++
      }
    })

    // If at least 2 headers match, we assume this is the header row
    if (matchCount >= 2) {
      return i
    }
  }

  return 0 // default to the first row if we can't find anything
}
function extractTimesFromString(str: string): string[] {
  if (!str) return []
  const matches = str.match(/(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/gi)
  if (!matches) return []
  return matches.map(m => formatToTimeStr(m)).filter(Boolean)
}

function extractAllTimesFromRow(row: Record<string, any>): string[] {
  const times: string[] = []
  const ignoreKeys = [
    'id', 'empid', 'employeeid', 'name', 'empname', 'employeename', 'date', 'status',
    'today', 'hours', 'workinghours', 'total', 'totalhours', 'workhours', 'remarks', 'att', 'state'
  ]

  Object.keys(row).forEach(k => {
    const normK = k.toLowerCase().replace(/[\s_\-\/\.]/g, '')
    if (ignoreKeys.includes(normK)) return

    const val = row[k]
    if (val === null || val === undefined || val === '') return

    const strVal = String(val).trim()
    const extracted = extractTimesFromString(strVal)
    if (extracted.length > 0) {
      extracted.forEach(t => {
        if (!times.includes(t)) times.push(t)
      })
    } else {
      const t = formatToTimeStr(val)
      if (t && !times.includes(t)) {
        times.push(t)
      }
    }
  })
  return times
}

function normalizeRow(row: Record<string, any>, targetDate: string): AttendanceRecord | null {
  const normalizedRow: Record<string, any> = {}
  Object.keys(row).forEach(k => {
    const normKey = k.toLowerCase().replace(/[\s_\-\/\.]/g, '')
    normalizedRow[normKey] = row[k]
  })

  const name = normalizedRow['empname'] || normalizedRow['employeename'] || normalizedRow['name'] || ''
  const empIdRaw = normalizedRow['empid'] || normalizedRow['employeeid'] || normalizedRow['id'] || ''
  const emp_id = String(empIdRaw).trim()

  if (!String(name).trim() && !emp_id) return null

  // Parse date — raw numeric serial or formatted string
  let date = ''
  const dateRaw = normalizedRow['date'] || ''
  const dateNum = Number(dateRaw)
  if (!isNaN(dateNum) && dateNum > 1) {
    const jsDate = XLSX.SSF.parse_date_code(Math.floor(dateNum))
    if (jsDate) date = `${jsDate.y}-${String(jsDate.m).padStart(2, '0')}-${String(jsDate.d).padStart(2, '0')}`
  } else if (dateRaw) {
    date = formatToISODate(String(dateRaw).split(/[ T]/)[0])
  }

  let check_in_time = formatToTimeStr(
    normalizedRow['checkintime'] ??
    normalizedRow['checkin'] ??
    normalizedRow['intime'] ??
    normalizedRow['in'] ??
    normalizedRow['cin'] ??
    normalizedRow['punchin'] ??
    normalizedRow['timein'] ??
    normalizedRow['clockin'] ??
    normalizedRow['firstin'] ??
    normalizedRow['entry'] ??
    normalizedRow['entrytime'] ??
    normalizedRow['start'] ??
    normalizedRow['starttime'] ??
    normalizedRow['onduty'] ??
    normalizedRow['dutyin'] ??
    normalizedRow['shiftin'] ??
    normalizedRow['punch1'] ??
    normalizedRow['in1'] ??
    normalizedRow['time1'] ??
    ''
  )
  let check_out_time = formatToTimeStr(
    normalizedRow['checkouttime'] ??
    normalizedRow['checkout'] ??
    normalizedRow['outtime'] ??
    normalizedRow['out'] ??
    normalizedRow['cout'] ??
    normalizedRow['punchout'] ??
    normalizedRow['timeout'] ??
    normalizedRow['clockout'] ??
    normalizedRow['lastout'] ??
    normalizedRow['logout'] ??
    normalizedRow['signout'] ??
    normalizedRow['exit'] ??
    normalizedRow['exittime'] ??
    normalizedRow['end'] ??
    normalizedRow['endtime'] ??
    normalizedRow['offduty'] ??
    normalizedRow['dutyout'] ??
    normalizedRow['shiftout'] ??
    normalizedRow['punch2'] ??
    normalizedRow['lastpunch'] ??
    normalizedRow['out1'] ??
    normalizedRow['out2'] ??
    normalizedRow['p2'] ??
    normalizedRow['exit1'] ??
    normalizedRow['time2'] ??
    ''
  )

  // Fallback 1: check single combined column containing both times e.g. "09:30 - 18:30" or "09:30 18:30"
  const combinedVal = normalizedRow['checkinout'] ?? normalizedRow['time'] ?? normalizedRow['punches'] ?? normalizedRow['logs'] ?? normalizedRow['punch'] ?? normalizedRow['attlog'] ?? ''
  if (combinedVal) {
    const combinedTimes = extractTimesFromString(String(combinedVal))
    if (combinedTimes.length >= 2) {
      if (!check_in_time) check_in_time = combinedTimes[0]
      if (!check_out_time || check_out_time === check_in_time) check_out_time = combinedTimes[combinedTimes.length - 1]
    } else if (combinedTimes.length === 1 && !check_in_time) {
      check_in_time = combinedTimes[0]
    }
  }

  // Fallback 2: Scan all cells in the row for sequential punch times if check_out_time is still missing or duplicate
  if (!check_out_time || check_out_time === check_in_time) {
    const timesInRow = extractAllTimesFromRow(normalizedRow)
    if (timesInRow.length >= 2) {
      if (!check_in_time) check_in_time = timesInRow[0]
      check_out_time = timesInRow[timesInRow.length - 1]
    }
  }
  
  const statusVal = String(
    normalizedRow['today'] ??
    normalizedRow['status'] ??
    normalizedRow['attendance'] ??
    normalizedRow['att'] ??
    normalizedRow['state'] ??
    normalizedRow['remarks'] ??
    normalizedRow['presentabsent'] ??
    normalizedRow['present'] ??
    normalizedRow['absent'] ??
    ''
  ).trim()

  let status = normalizeStatus(statusVal)

  // Identify if Sunday
  const recordDate = date || targetDate
  let isSunday = false
  if (recordDate) {
    const [y, m, d] = recordDate.split('-').map(Number)
    const day = new Date(y, m - 1, d).getDay()
    isSunday = (day === 0)
  }

  const hasTimes = Boolean(check_in_time || check_out_time)

  if (isSunday) {
    const sLower = statusVal.trim().toLowerCase()
    const isExplicitNonWorking = ['l', 'leave', 'a', 'absent', 'h', 'holiday'].includes(sLower)
    if (hasTimes || (statusVal && !isExplicitNonWorking)) {
      status = 'Weekend Working'
    } else {
      status = 'Holiday'
    }
  } else if (!hasTimes && !statusVal) {
    status = 'Leave'
  }

  if (check_in_time && check_out_time && status !== 'Weekend Working') {
    const hours = calcHours(check_in_time, check_out_time)
    if (hours !== null && hours <= 4) {
      status = 'Half Day'
    }
  }

  return {
    emp_name:       String(name).trim(),
    emp_id:         emp_id || undefined,
    check_in_time,
    check_out_time,
    status,
    date,
  }
}

const UploadCSV = memo(function UploadCSV({ onUpload }: UploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview]       = useState<AttendanceRecord[]>([])
  const [error, setError]           = useState('')
  const [fileName, setFileName]     = useState('')
  const [uploaded, setUploaded]     = useState(false)
  const [targetDate, setTargetDate] = useState(todayLocal)  // default = today

  const parseFile = useCallback((file: File) => {
    setError('')
    setUploaded(false)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array', cellDates: false })
        
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          setError('The uploaded Excel file does not contain any sheets.')
          setPreview([])
          return
        }

        // Find the sheet that contains valid records
        let targetSheetName = wb.SheetNames[0]
        let ws = wb.Sheets[targetSheetName]
        let headerIdx = findHeaderRowIndex(ws)
        let rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: true, range: headerIdx })

        if (rows.length === 0 || (rows.map(r => normalizeRow(r, targetDate)).filter(Boolean).length === 0)) {
          // Look through other sheets in the workbook
          for (const sheetName of wb.SheetNames) {
            const sheet = wb.Sheets[sheetName]
            const idx = findHeaderRowIndex(sheet)
            const sheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: true, range: idx })
            const sheetRecords = sheetRows.map(r => normalizeRow(r, targetDate)).filter(Boolean)
            if (sheetRecords.length > 0) {
              targetSheetName = sheetName
              ws = sheet
              headerIdx = idx
              rows = sheetRows
              break
            }
          }
        }

        const records = rows.map(r => normalizeRow(r, targetDate)).filter(Boolean) as AttendanceRecord[]
        if (records.length === 0) {
          const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
          const detectedHeaders = rawRows.length > headerIdx ? rawRows[headerIdx] : []
          const headersStr = detectedHeaders.length > 0 
            ? `Detected columns: [${detectedHeaders.join(', ')}]` 
            : 'No columns detected (empty sheet)'
          
          const sampleRows = rawRows.slice(0, 5).map((row, idx) => `Row ${idx + 1}: [${row.join(', ')}]`).join(' | ')
          
          setError(`No valid records found in sheet "${targetSheetName}". ${headersStr}. Sample rows: ${sampleRows}. Ensure your sheet has columns like: emp_name (or emp_id), check_in_time, check_out_time, today.`)
          setPreview([])
          return
        }

        // Strictly enforce that if the Excel file contains a date, it matches the Target Date
        const mismatched = records.find(r => r.date && r.date !== targetDate)
        if (mismatched) {
          setError(`Date mismatch! The Excel file has data for ${mismatched.date}, but the target date is ${targetDate}. Please change the target date first, then upload the file again.`)
          setPreview([])
          if (inputRef.current) inputRef.current.value = ''
          return
        }

        setFileName(file.name)
        setPreview(records)
      } catch (err) {
        setError('Failed to read file. Please upload a valid Excel or CSV file.')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [targetDate])

  const handleCommit = useCallback(() => {
    if (!targetDate) { setError('Please select a target date before uploading.'); return }
    onUpload(preview, targetDate)
    setUploaded(true)
  }, [preview, targetDate, onUpload])

  const handleClear = useCallback(() => {
    setPreview([])
    setFileName('')
    setError('')
    setUploaded(false)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const isToday = targetDate === todayLocal()

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Upload Attendance</h1>
          <p>Import attendance data via Excel (.xlsx, .xls) or CSV (.csv)</p>
        </div>
        {preview.length === 0 && (
          <div>
            <button className="btn-add" aria-label="Select Excel or CSV File" onClick={() => inputRef.current?.click()}>
              <MdUploadFile size={18} aria-hidden="true" /> Select Excel / CSV File
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              aria-label="Hidden file input"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])}
            />
          </div>
        )}
      </div>

      {/* ── Target Date Picker ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: '#fff', border: '1.5px solid #dce1e7', borderRadius: 10,
        padding: '14px 20px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}>
        <MdCalendarToday size={20} color="#2563eb" style={{ flexShrink: 0 }} aria-hidden="true" />
        <div>
          <label htmlFor="target-date-input" style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', cursor: 'pointer', display: 'block' }}>Upload Target Date</label>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
            All records will be saved under this date — change to upload old attendance data
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {isToday && (
            <span style={{ fontSize: 11, fontWeight: 700, background: '#d5f5e3', color: '#1e8449', padding: '3px 10px', borderRadius: 20 }}>
              Today
            </span>
          )}
          <input
            id="target-date-input"
            type="date"
            className="date-input"
            aria-label="Upload Target Date"
            value={targetDate}
            max={todayLocal()}
            onChange={e => {
              setTargetDate(e.target.value)
              handleClear()
            }}
            style={{ fontWeight: 600 }}
          />
        </div>
      </div>

      <div className="upload-hint-box">
        <strong>Short-code support in <code>today</code> column:</strong>
        <div className="upload-hint-codes">
          <span className="badge badge-present">P = Present</span>
          <span className="badge badge-leave">L = Leave</span>
          <span className="badge badge-halfday">H = Half Day</span>
        </div>
        <p style={{ marginTop: 8, fontSize: 12, color: '#7f8c8d' }}>
          Required columns: <code>emp_name</code> (or <code>emp_id</code> for uniqueness), <code>check_in_time</code>, <code>check_out_time</code>, <code>today</code>
          &nbsp;— the <em>date picker above</em> sets the upload date (no date column needed in Excel).
        </p>
      </div>

      {error && <p className="error-msg" style={{ marginTop: 16 }}>{error}</p>}

      {preview.length > 0 && (
        <div className="table-card" style={{ marginTop: 20 }}>
          <div className="table-card-header" style={{ borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MdCheckCircle color="#27ae60" size={18} />
              <h2>
                {fileName} — {preview.length} record{preview.length !== 1 ? 's' : ''} ready
                &nbsp;for <strong>{targetDate}</strong>
                {isToday && <span style={{ fontSize: 11, fontWeight: 700, background: '#d5f5e3', color: '#1e8449', padding: '2px 8px', borderRadius: 20, marginLeft: 8 }}>Today</span>}
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {uploaded ? (
                <span className="badge badge-present" style={{ padding: '6px 14px', fontSize: 13 }}>
                  ✓ Saved to Attendance
                </span>
              ) : (
                <button className="btn-add" style={{ background: '#27ae60' }} onClick={handleCommit} aria-label="Upload to Attendance">
                  <MdUploadFile size={16} aria-hidden="true" /> Upload to Attendance
                </button>
              )}
              <button
                className="modal-close"
                style={{ border: '1.5px solid #dce1e7', borderRadius: 8, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={handleClear}
                title="Clear and upload another file"
                aria-label="Clear file selection"
              >
                <MdClose size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

export default UploadCSV

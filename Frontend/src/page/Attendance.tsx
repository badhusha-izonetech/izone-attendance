import { useState, useEffect } from 'react'
import { MdSearch, MdCalendarToday, MdSave, MdCheckCircle, MdError, MdEventBusy, MdClose, MdRefresh } from 'react-icons/md'
import EmpDetailCard from '../Components/attendance/EmpDetailCard'
import { attendanceApi, holidayApi } from '../api'
import type { Employee, DailyAttendance, HolidayRecord } from '../types'

interface AttendanceProps {
  employees: Employee[]
  attendance: DailyAttendance[]
  holidays: HolidayRecord[]
  onUpdateAttendance: (records: DailyAttendance[]) => void
  onAttendanceSaved: (records: DailyAttendance[], savedHolidays?: any[]) => void
  selectedDate: string
  onDateChange: (date: string) => void
}

import {
  calcHours,
  formatMins,
  parsePermissionData,
  upsertPermission,
  calcPermissionHours,
  toMinutes
} from '../utils/attendanceUtils'


export default function Attendance({
  employees,
  attendance,          // DB-confirmed records from App.tsx (read-only here)
  holidays,
  onUpdateAttendance: _onUpdateAttendance,  // kept in interface but not used for every keystroke
  onAttendanceSaved,
  selectedDate,
  onDateChange,
}: AttendanceProps) {
  const [search, setSearch] = useState('')
  const [detailEmp, setDetailEmp] = useState<Employee | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMsg, setSaveMsg] = useState('')
  const [showHolidayModal, setShowHolidayModal] = useState(false)
  const [holidayReason, setHolidayReason] = useState('Camera maintenance')

  // Local editing state — changes here do NOT flow to Dashboard/Report/LeaveList
  const [localRecords, setLocalRecords] = useState<DailyAttendance[]>(attendance)

  const getRecord = (empId: string) =>
    localRecords.find(a => a.emp_id === empId && a.date === selectedDate)

  useEffect(() => {
    setLocalRecords(attendance)
  }, [attendance, selectedDate])

  const [y, m, d] = selectedDate.split('-').map(Number)
  const isSunday = new Date(y, m - 1, d).getDay() === 0

  const updateField = (empId: string, field: 'check_in' | 'check_out' | 'status' | 'work_tag', value: string) => {
    const existing = getRecord(empId)
    const isEmpHoliday = holidays.some(h => h.emp_id === empId && h.date === selectedDate)
    const defaultStatus = isEmpHoliday || isSunday ? 'Holiday' : 'Present'
    const updated: DailyAttendance = existing
      ? { ...existing, [field]: value }
      : { emp_id: empId, date: selectedDate, check_in: '', check_out: '', status: defaultStatus, work_tag: null, [field]: value }

    const newIn = field === 'check_in' ? value : updated.check_in
    const newOut = field === 'check_out' ? value : updated.check_out

    if (field === 'check_in' || field === 'check_out') {
      if (isSunday || isEmpHoliday) {
        if (newIn || newOut) {
          updated.status = 'Weekend Working'
        } else {
          updated.status = 'Holiday'
        }
      } else {
        if (newIn && newOut) {
          const hours = calcHours(newIn, newOut, updated.work_tag)
          if (hours !== null && hours <= 4) {
            updated.status = 'Half Day'
          } else if (hours !== null && hours > 4 && updated.status === 'Half Day') {
            updated.status = 'Present'
          }
        }
      }
    }

    // Update LOCAL state only — Dashboard is NOT affected
    setLocalRecords(prev => [
      ...prev.filter(a => !(a.emp_id === empId && a.date === selectedDate)),
      updated,
    ])
  }

  // Row-level Update & Merge handler for multiple check-in/outs and permission adjustment
  const handleUpdateRow = async (empId: string) => {
    const rec = getRecord(empId)
    const dbRec = attendance.find(a => a.emp_id === empId && a.date === selectedDate)
    const isEmpHoliday = holidays.some(h => h.emp_id === empId && h.date === selectedDate)

    let inT = rec?.check_in || dbRec?.check_in || ''
    let outT = rec?.check_out || dbRec?.check_out || ''
    let tag = rec?.work_tag || dbRec?.work_tag || null
    let currentStatus = rec?.status || dbRec?.status || (isEmpHoliday || isSunday ? 'Holiday' : 'Present')

    // If dbRec had an earlier check_in and current inT is later or empty, merge earliest
    if (dbRec?.check_in && inT) {
      if (toMinutes(dbRec.check_in) < toMinutes(inT)) {
        inT = dbRec.check_in
      }
    } else if (dbRec?.check_in && !inT) {
      inT = dbRec.check_in
    }

    // If dbRec had a check_out and current outT is later, merge latest
    if (dbRec?.check_out && outT) {
      if (toMinutes(dbRec.check_out) > toMinutes(outT)) {
        outT = dbRec.check_out
      }
    } else if (dbRec?.check_out && !outT) {
      outT = dbRec.check_out
    }

    // Recalculate net hours deducting permission
    const hrs = calcHours(inT, outT, tag)
    if (hrs !== null && hrs > 4 && currentStatus === 'Half Day') {
      currentStatus = 'Present'
    }

    const recordToSave: DailyAttendance = {
      emp_id: empId,
      date: selectedDate,
      check_in: inT,
      check_out: outT,
      status: currentStatus,
      work_tag: tag,
    }

    setSaveStatus('saving')
    try {
      const saved = await attendanceApi.upsert(recordToSave)
      const empObj = employees.find(e => e.emp_id === empId)
      setSaveMsg(`Merged & Updated ${empObj?.name || empId}: ${inT}–${outT} (${hrs !== null ? hrs.toFixed(1) + 'h' : ''})`)
      setSaveStatus('saved')
      onAttendanceSaved([saved], [])
    } catch (err: any) {
      setSaveMsg(err.message || 'Update failed')
      setSaveStatus('error')
    } finally {
      setTimeout(() => setSaveStatus('idle'), 3500)
    }
  }

  const filteredEmps = employees.filter(e => {
    const matchSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.emp_id.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  // ── Save: persist localRecords to DB, then notify App.tsx to update confirmed state ──
  const handleSave = async () => {
    // Generate a record for every employee on the selected date, using defaults if not in localRecords
    const dayRecords = employees.map(emp => {
      const rec = getRecord(emp.emp_id)
      const isEmpHoliday = holidays.some(h => h.emp_id === emp.emp_id && h.date === selectedDate)
      return rec || {
        emp_id: emp.emp_id,
        date: selectedDate,
        check_in: '',
        check_out: '',
        status: isEmpHoliday || isSunday ? 'Holiday' : 'Present',
        work_tag: null,
      }
    })

    const attendanceRecords = dayRecords.filter(a => {
      // Holiday records go to holiday table, not daily_attendance
      if (a.status === 'Holiday') return false
      // If weekday and not holiday, default Present status with no times -> do NOT store in daily_attendance
      const isEmpHoliday = holidays.some(h => h.emp_id === a.emp_id && h.date === selectedDate)
      if (!isEmpHoliday && !isSunday && a.status === 'Present' && !a.check_in && !a.check_out) return false
      // If check-in and check-out and status are all empty -> do NOT store in database
      if (!a.check_in && !a.check_out && !a.status) return false
      return true
    })

    const holidayRecords = dayRecords.filter(a => {
      // Only store in holiday table if status is 'Holiday'
      return a.status === 'Holiday'
    })

    if (attendanceRecords.length === 0 && holidayRecords.length === 0) {
      setSaveMsg('No records to save. Set status or enter check-in times first.')
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
      return
    }

    setSaveStatus('saving')
    try {
      const attendancePayload = attendanceRecords.map(r => {
        const isEmpHoliday = holidays.some(h => h.emp_id === r.emp_id && h.date === selectedDate)
        return {
          emp_id: r.emp_id,
          date: r.date,
          check_in: r.check_in || '',
          check_out: r.check_out || '',
          status: r.status || (isEmpHoliday || isSunday ? 'Holiday' : 'Present'),
          work_tag: r.work_tag || null,
        }
      })

      const holidayPayload = holidayRecords.map(r => {
        const emp = employees.find(e => e.emp_id === r.emp_id)
        return {
          emp_id: r.emp_id,
          emp_name: emp ? emp.name : r.emp_id,
          date: r.date,
          holiday_name: isSunday ? 'Sunday Holiday' : 'Holiday',
        }
      })

      const promises: Promise<any>[] = []
      if (attendancePayload.length > 0) {
        promises.push(attendanceApi.bulkUpsert(attendancePayload as any))
      } else {
        promises.push(Promise.resolve([]))
      }

      if (holidayPayload.length > 0) {
        promises.push(holidayApi.bulkUpsert(holidayPayload))
      } else {
        promises.push(Promise.resolve([]))
      }

      const [savedAttendance, savedHolidays] = await Promise.all(promises)
      const totalSaved = attendancePayload.length + holidayPayload.length

      setSaveMsg(`Saved ${totalSaved} record${totalSaved !== 1 ? 's' : ''} for ${selectedDate}`)
      setSaveStatus('saved')
      // ✅ Only NOW does Dashboard / Report / LeaveList get updated
      onAttendanceSaved(savedAttendance, savedHolidays)
    } catch (err: any) {
      setSaveMsg(err.message || 'Save failed')
      setSaveStatus('error')
    } finally {
      setTimeout(() => setSaveStatus('idle'), 3500)
    }
  }

  /* ── Mark selected date as Office Holiday ── */
  const handleConfirmMarkHoliday = async () => {
    const nameToUse = holidayReason.trim() || 'Office Holiday'

    // Update local records for all employees to status 'Holiday'
    const newLocalRecords: DailyAttendance[] = employees.map(emp => ({
      emp_id: emp.emp_id,
      date: selectedDate,
      check_in: '',
      check_out: '',
      status: 'Holiday',
      work_tag: null,
    }))

    setLocalRecords(prev => [
      ...prev.filter(a => a.date !== selectedDate),
      ...newLocalRecords,
    ])

    setShowHolidayModal(false)
    setSaveStatus('saving')
    try {
      const holidayPayload = employees.map(emp => ({
        emp_id: emp.emp_id,
        emp_name: emp.name,
        date: selectedDate,
        holiday_name: nameToUse,
      }))

      // Save holiday records to DB
      const savedHolidays = await holidayApi.bulkUpsert(holidayPayload)

      // Delete any working daily attendance records for this date from DB so there is no conflict
      await attendanceApi.deleteByDate(selectedDate, selectedDate).catch(() => { })

      setSaveMsg(`Marked ${selectedDate} as Office Holiday (${nameToUse})`)
      setSaveStatus('saved')

      // Notify App.tsx to update global attendance and holidays state
      onAttendanceSaved([], savedHolidays)
    } catch (err: any) {
      setSaveMsg(err.message || 'Failed to mark holiday')
      setSaveStatus('error')
    } finally {
      setTimeout(() => setSaveStatus('idle'), 3500)
    }
  }

  const hasPermissionOnPage = localRecords.some(r => r.date === selectedDate && (!!r.work_tag?.includes('permission_') || r.status === 'Permission Request'))

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Attendance</h1>
          <p>Track daily check-in, check-out and work hours</p>
        </div>
        <div className="att-date-picker">
          <MdCalendarToday size={16} color="#1e5799" />
          <input
            type="date"
            className="date-input"
            value={selectedDate}
            onChange={e => onDateChange(e.target.value)}
          />
        </div>
      </div>

      {detailEmp && (
        <EmpDetailCard
          emp={detailEmp}
          rec={getRecord(detailEmp.emp_id)}
          onClose={() => setDetailEmp(null)}
        />
      )}

      <div className="table-card">
        <div className="table-card-header">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
            <div className="search-wrap">
              <MdSearch size={16} className="search-icon" />
              <input
                className="search-input"
                placeholder="Search name or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              className="btn-mark-holiday"
              onClick={() => {
                setHolidayReason('Camera maintenance')
                setShowHolidayModal(true)
              }}
              title="Mark selected date as Office Holiday"
            >
              <MdEventBusy size={16} />
              Mark Holiday
            </button>
            <button
              className="btn-save-att"
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              style={{ marginLeft: 'auto' }}
            >
              {saveStatus === 'saving' ? (
                <span className="btn-save-spinner" />
              ) : (
                <MdSave size={16} />
              )}
              {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Save toast */}
        {saveStatus !== 'idle' && saveStatus !== 'saving' && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px',
              background: saveStatus === 'saved' ? '#d5f5e3' : '#fadbd8',
              color: saveStatus === 'saved' ? '#1e8449' : '#c0392b',
              fontSize: 13, fontWeight: 600,
              borderBottom: '1px solid',
              borderColor: saveStatus === 'saved' ? '#a9dfbf' : '#f5b7b1',
            }}
          >
            {saveStatus === 'saved'
              ? <MdCheckCircle size={16} />
              : <MdError size={16} />}
            {saveMsg}
          </div>
        )}

        {employees.length === 0 ? (
          <div className="empty-state">No employees found. Add employees from the Employee List page first.</div>
        ) : filteredEmps.length === 0 ? (
          <div className="empty-state">No records match the current filter.</div>
        ) : (
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
                  {hasPermissionOnPage && <th style={{ textAlign: 'center' }}>Permission</th>}
                  <th style={{ textAlign: 'center' }}>Working Hours</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmps.map((emp, i) => {
                  const rec = getRecord(emp.emp_id)
                  const isEmpHoliday = holidays.some(h => h.emp_id === emp.emp_id && h.date === selectedDate)
                  const currentStatus = rec?.status || (isEmpHoliday || isSunday ? 'Holiday' : 'Present')
                  const isLeaveOrHoliday = currentStatus === 'Leave' || currentStatus === 'Holiday'
                  const isDetail = detailEmp?.id === emp.id

                  const pData = parsePermissionData(rec?.work_tag || null)
                  const pHours = pData ? calcPermissionHours(pData.start, pData.end) : null
                  const hrs = !isLeaveOrHoliday && rec?.check_in && rec?.check_out ? calcHours(rec.check_in, rec.check_out, rec.work_tag) : null
                  const rawHrs = !isLeaveOrHoliday && rec?.check_in && rec?.check_out ? calcHours(rec.check_in, rec.check_out) : null
                  const targetHrs = hrs !== null ? hrs : rawHrs
                  const diffMins = targetHrs !== null ? Math.round((targetHrs - 8.5) * 60) : null

                  return (
                    <tr key={emp.id} style={isDetail ? { background: '#eaf4fb' } : undefined}>
                      <td>{i + 1}</td>
                      <td>
                        <button className="emp-id-link" onClick={() => setDetailEmp(isDetail ? null : emp)}>
                          {emp.emp_id}
                        </button>
                      </td>
                      <td>
                        <button className="emp-id-link" onClick={() => setDetailEmp(isDetail ? null : emp)}>
                          {emp.name}
                        </button>
                      </td>
                      <td>
                        <select
                          className={`att-select att-select-${currentStatus.toLowerCase().replace(' ', '')}`}
                          value={currentStatus}
                          onChange={e => updateField(emp.emp_id, 'status', e.target.value)}
                        >
                          <option value="Present">Present</option>
                          <option value="Half Day">Half Day</option>
                          <option value="Leave">Leave</option>
                          <option value="Holiday">Holiday</option>
                          <option value="Weekend Working">Weekend Working</option>
                          <option value="Permission Request">Permission Request</option>
                        </select>
                      </td>
                      <td>
                        {isLeaveOrHoliday ? (
                          <span className="att-leave-dash">—</span>
                        ) : (
                          <input
                            type="time"
                            className="att-time-input"
                            value={rec?.check_in || ''}
                            onChange={e => updateField(emp.emp_id, 'check_in', e.target.value)}
                          />
                        )}
                      </td>
                      <td>
                        {isLeaveOrHoliday ? (
                          <span className="att-leave-dash">—</span>
                        ) : (
                          <input
                            type="time"
                            className="att-time-input"
                            value={rec?.check_out || ''}
                            onChange={e => updateField(emp.emp_id, 'check_out', e.target.value)}
                          />
                        )}
                      </td>
                      {/* Permission column — shown conditionally when permission exists or is selected */}
                      {hasPermissionOnPage && (
                        <td style={{ textAlign: 'center' }}>
                          {!isLeaveOrHoliday && (currentStatus === 'Permission Request' || pData !== null) ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: '#eaf4fb', padding: '4px 8px', borderRadius: '6px' }}>
                              <input
                                type="time"
                                className="att-time-input"
                                style={{ width: 'auto', padding: '2px 4px', fontSize: '12px' }}
                                value={pData?.start || ''}
                                onChange={e => updateField(emp.emp_id, 'work_tag', upsertPermission(rec?.work_tag || null, e.target.value, pData?.end || ''))}
                              />
                              <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700 }}>-</span>
                              <input
                                type="time"
                                className="att-time-input"
                                style={{ width: 'auto', padding: '2px 4px', fontSize: '12px' }}
                                value={pData?.end || ''}
                                onChange={e => updateField(emp.emp_id, 'work_tag', upsertPermission(rec?.work_tag || null, pData?.start || '', e.target.value))}
                              />
                              {pHours !== null && (
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', marginLeft: '4px' }}>
                                  {pHours.toFixed(1)}h
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="att-leave-dash">—</span>
                          )}
                        </td>
                      )}

                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--grey-dark)' }}>
                          {hrs !== null ? `${hrs.toFixed(1)}h` : '—'}
                        </span>
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
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleUpdateRow(emp.emp_id)}
                          title="Update & Merge old saved data with current times"
                          style={{
                            padding: '5px 10px',
                            background: 'var(--blue-mid)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <MdRefresh size={14} /> Update
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Modal: Mark Office Holiday */}
      {showHolidayModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90%',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8 }}>
                <MdEventBusy color="#8e44ad" size={22} /> Mark Office Holiday
              </h3>
              <button
                onClick={() => setShowHolidayModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <MdClose size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: '1.5' }}>
              Mark <strong>{selectedDate}</strong> as an office holiday for all employees?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                Holiday Reason / Description
              </label>
              <input
                type="text"
                placeholder="e.g. Camera maintenance, Office Maintenance, Festival"
                value={holidayReason}
                onChange={e => setHolidayReason(e.target.value)}
                style={{
                  padding: '10px 12px', borderRadius: '6px', border: '1px solid #d1d5db',
                  fontSize: '14px', outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setShowHolidayModal(false)}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db',
                  background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMarkHoliday}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none',
                  background: '#8e44ad', color: '#fff', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Confirm & Save Holiday
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import Login from './Components/Login'
import Layout from './Components/Layout'
import type { Page } from './Components/Layout'
import { autoTag } from './utils/attendanceUtils'
import Dashboard from './page/Dashboard'
import EmployeeList from './page/EmployeeList'
import Attendance from './page/Attendance'
import AttendanceList from './page/AttendanceList'
import UploadCSV from './page/UploadCSV'
import Departments from './page/Departments'
import LeaveList from './page/LeaveList'
import Report from './page/Report'
import { employeeApi, departmentApi, attendanceApi, leaveApi, holidayApi } from './api'
import type { ApiDailyAttendance, ApiHolidayRecord } from './api'
import type { AttendanceRecord, Employee, Department, LeaveRecord, DailyAttendance, HolidayRecord } from './types'

// Use local date — matches how Excel/CSV dates are parsed
function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ── Map backend types → frontend types ── */
function mapEmployee(e: { id: string | number; name: string; emp_id: string; email: string; phone?: string | null; department: string }): Employee {
  return { id: String(e.id), name: e.name, emp_id: e.emp_id, email: e.email, phone: e.phone || '', department: e.department }
}

function matchEmpId(id1: string, id2: string): boolean {
  if (!id1 || !id2) return false
  const a = id1.trim().toLowerCase()
  const b = id2.trim().toLowerCase()
  if (a === b) return true
  const numA = parseInt(a.replace(/\D/g, ''), 10)
  const numB = parseInt(b.replace(/\D/g, ''), 10)
  return !isNaN(numA) && !isNaN(numB) && numA === numB
}

function mapDepartment(d: { id: string | number; name: string }): Department {
  return { id: String(d.id), name: d.name }
}

function mapAttendance(a: { emp_id: string; date: string; check_in: string; check_out: string; status: 'Present' | 'Half Day' | 'Leave' | 'Holiday' | 'Weekend Working' | 'Permission Request'; work_tag: string | null }): DailyAttendance {
  return {
    emp_id:    a.emp_id,
    date:      a.date,
    check_in:  a.check_in  || '',
    check_out: a.check_out || '',
    status:    a.status,
    work_tag:  a.work_tag,
  }
}

function mapLeave(l: { emp_id: string; emp_name: string; from_date: string; to_date: string; leave_type: string; reason: string }): LeaveRecord {
  return {
    emp_id:     l.emp_id,
    emp_name:   l.emp_name,
    from_date:  String(l.from_date),
    to_date:    String(l.to_date),
    leave_type: l.leave_type,
    reason:     l.reason,
  }
}

function mapHoliday(h: { emp_id: string; emp_name: string; date: string; holiday_name: string | null }): HolidayRecord {
  return {
    emp_id:       h.emp_id,
    emp_name:     h.emp_name,
    date:         String(h.date),
    holiday_name: h.holiday_name,
  }
}

/* ── Loading overlay ── */
function LoadingOverlay({ text }: { text: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999, gap: 16,
    }}>
      <div className="app-spinner" />
      <p style={{ color: '#374151', fontSize: 14, fontWeight: 600 }}>{text}</p>
    </div>
  )
}

export default function App() {
  const [isAuth, setIsAuth] = useState(() => localStorage.getItem('at_auth') === 'true')
  const [page, setPage]     = useState<Page>('dashboard')

  const [employees,    setEmployees]    = useState<Employee[]>([])
  const [departments,  setDepartments]  = useState<Department[]>([])
  const [leaves,       setLeaves]       = useState<LeaveRecord[]>([])
  const [holidays,     setHolidays]     = useState<HolidayRecord[]>([])
  // attendance = DB-confirmed state. Only updates after Save/Upload/loadAll.
  // Dashboard, Report, LeaveList all read from this.
  const [attendance,   setAttendance]   = useState<DailyAttendance[]>([])
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const [loading,   setLoading]   = useState(false)
  const [loadMsg,   setLoadMsg]   = useState('')
  const [apiError,  setApiError]  = useState('')

  /* ── Load all data from backend ── */
  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadMsg('Loading data…')
    setApiError('')
    try {
      const [emps, depts, atts, lvs, hols] = await Promise.all([
        employeeApi.getAll(),
        departmentApi.getAll(),
        attendanceApi.getAll(),
        leaveApi.getAll(),
        holidayApi.getAll(),
      ])
      setEmployees(emps.map(mapEmployee))
      setDepartments(depts.map(mapDepartment))
      setAttendance(atts.map(mapAttendance))   // DB-confirmed state
      setLeaves(lvs.map(mapLeave))
      setHolidays(hols.map(mapHoliday))
    } catch (err) {
      setApiError(`Could not connect to the backend. Make sure the server is running.\n${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuth) loadAll()
  }, [isAuth, loadAll])

  const handleLogout = () => { localStorage.removeItem('at_auth'); setIsAuth(false) }

  /* ────────────────────────────────────────────
     Employee handlers
  ──────────────────────────────────────────── */
  const handleAddEmployee = async (emp: Employee) => {
    try {
      setLoading(true); setLoadMsg('Saving employee…')
      const created = await employeeApi.create({
        name: emp.name, emp_id: emp.emp_id, email: emp.email,
        phone: emp.phone, department: emp.department,
      })
      setEmployees(prev => [...prev, mapEmployee(created)])
    } catch (e) { alert(`Error: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  const handleEditEmployee = async (emp: Employee) => {
    try {
      setLoading(true); setLoadMsg('Updating employee…')
      const updated = await employeeApi.update(emp.id, {
        name: emp.name, emp_id: emp.emp_id, email: emp.email,
        phone: emp.phone, department: emp.department,
      })
      setEmployees(prev => prev.map(x => x.id === emp.id ? mapEmployee(updated) : x))
    } catch (e) { alert(`Error: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  const handleDeleteEmployee = async (id: string) => {
    try {
      setLoading(true); setLoadMsg('Deleting employee…')
      await employeeApi.delete(id)
      setEmployees(prev => prev.filter(x => x.id !== id))
    } catch (e) { alert(`Error: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  /* ────────────────────────────────────────────
     Department handlers
  ──────────────────────────────────────────── */
  const handleAddDept = async (dept: Department) => {
    try {
      setLoading(true); setLoadMsg('Saving department…')
      const created = await departmentApi.create(dept.name)
      setDepartments(prev => [...prev, mapDepartment(created)])
    } catch (e) { alert(`Error: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  const handleEditDept = async (dept: Department) => {
    try {
      setLoading(true); setLoadMsg('Updating department…')
      const updated = await departmentApi.update(Number(dept.id), dept.name)
      setDepartments(prev => prev.map(x => x.id === dept.id ? mapDepartment(updated) : x))
    } catch (e) { alert(`Error: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  const handleDeleteDept = async (id: string) => {
    try {
      setLoading(true); setLoadMsg('Deleting department…')
      await departmentApi.delete(Number(id))
      setDepartments(prev => prev.filter(x => x.id !== id))
    } catch (e) { alert(`Error: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  /* ────────────────────────────────────────────
     Attendance: local edit handler (no API, no global state change)
     The Attendance page manages its own local copy for editing.
     Global `attendance` state only updates after Save or Upload.
  ──────────────────────────────────────────── */
  const handleUpdateAttendance = (_records: DailyAttendance[]) => {
    // Unused since uploads are committed directly to DB
  }

  /* Called by Attendance page after successful bulkUpsert */
  const handleAttendanceSaved = async (savedRecords: DailyAttendance[], savedHolidays?: any[]) => {
    // Merge into global attendance — Dashboard/Report/LeaveList will update
    if (savedRecords && savedRecords.length > 0) {
      setAttendance(prev => {
        const next = [...prev]
        savedRecords.forEach(r => {
          const idx = next.findIndex(a => matchEmpId(a.emp_id, r.emp_id) && a.date === r.date)
          if (idx >= 0) next[idx] = r
          else next.push(r)
        })
        return next
      })

      // Remove from holidays state any employee who now has active attendance (e.g. Weekend Working)
      setHolidays(prev => prev.filter(h => !savedRecords.some(r => matchEmpId(r.emp_id, h.emp_id) && r.date === h.date)))
    }

    if (savedHolidays && savedHolidays.length > 0) {
      const holidayDates = new Set(savedHolidays.map((h: any) => h.date))
      setAttendance(prev => prev.filter(a => !(holidayDates.has(a.date) && savedHolidays.some((h: any) => matchEmpId(a.emp_id, h.emp_id) && a.date === h.date))))
      setHolidays(prev => {
        const next = [...prev]
        savedHolidays.forEach(h => {
          const idx = next.findIndex(x => matchEmpId(x.emp_id, h.emp_id) && x.date === h.date)
          if (idx >= 0) next[idx] = mapHoliday(h)
          else next.push(mapHoliday(h))
        })
        return next
      })
    }

    // ── AUTO-SYNC: any Leave-status attendance records → leaves DB table ──
    const leaveRecords = savedRecords.filter(r => r.status === 'Leave')
    if (leaveRecords.length > 0) {
      try {
        const payload = leaveRecords.map(r => {
          const emp = employees.find(e => e.emp_id === r.emp_id)
          return {
            emp_id:     r.emp_id,
            emp_name:   emp?.name || r.emp_id,
            from_date:  r.date,
            to_date:    r.date,
            leave_type: 'Attendance Leave',
            reason:     'Auto-synced from attendance record',
          }
        })
        const created = await leaveApi.bulkCreate(payload)
        // Merge newly created leave records into leaves state
        if (created.length > 0) {
          setLeaves(prev => {
            const next = [...prev]
            created.forEach(l => {
              const exists = next.some(x => x.emp_id === l.emp_id && x.from_date === String(l.from_date))
              if (!exists) next.push(mapLeave(l))
            })
            return next
          })
        }
      } catch (e) {
        // Non-fatal — attendance is saved; leave sync failure is logged silently
        console.warn('Leave auto-sync failed:', (e as Error).message)
      }
    }
  }

  /* ────────────────────────────────────────────
     Attendance: Delete by Date
  ──────────────────────────────────────────── */
  const handleDeleteAttendance = async (fromDate: string, toDate: string) => {
    try {
      setLoading(true); setLoadMsg('Deleting attendance records…')
      const res = await attendanceApi.deleteByDate(fromDate, toDate)
      alert(`Deleted ${res.deleted_count} attendance record(s).`)
      
      // Refresh local state by filtering locally:
      setAttendance(prev => prev.filter(a => a.date < fromDate || a.date > toDate))
      setLeaves(prev => prev.filter(l => !(l.from_date >= fromDate && l.to_date <= toDate)))
      setHolidays(prev => prev.filter(h => h.date < fromDate || h.date > toDate))
    } catch (e) { alert(`Error deleting attendance: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  /* ────────────────────────────────────────────
     Leave handler — manual add from LeaveList page
  ──────────────────────────────────────────── */
  const handleAddLeave = async (leave: LeaveRecord) => {
    try {
      setLoading(true); setLoadMsg('Saving leave…')
      const created = await leaveApi.create({
        emp_id:     leave.emp_id,
        emp_name:   leave.emp_name,
        from_date:  leave.from_date,
        to_date:    leave.to_date,
        leave_type: leave.leave_type,
        reason:     leave.reason,
      })
      setLeaves(prev => [...prev, mapLeave(created)])
    } catch (e) { alert(`Error saving leave: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  /* ────────────────────────────────────────────
     CSV Upload handler
  ──────────────────────────────────────────── */
  const handleUpload = async (csvRecords: AttendanceRecord[], targetDate: string) => {
    const uploadDate = targetDate || todayStr()

    const matchEmpName = (dbName: string, csvName: string) => {
      const normalize = (name: string) => {
        return (name || '')
          .toLowerCase()
          .replace(/^(dr\.|dr\b|mr\.|mr\b|mrs\.|mrs\b|ms\.|ms\b)\s*/g, '')
          .replace(/[.,]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }
      return normalize(dbName) === normalize(csvName)
    }

    // Build DailyAttendance and HolidayRecord lists
    const attendanceToUpsert: Omit<ApiDailyAttendance, 'id'>[] = []
    const holidaysToUpsert: Omit<ApiHolidayRecord, 'id'>[] = []

    csvRecords.forEach(r => {
      const recDate = r.date || uploadDate
      const emp = r.emp_id
        ? employees.find(e => matchEmpId(e.emp_id, r.emp_id!))
        : employees.find(e => matchEmpName(e.name, r.emp_name))
      const key = emp ? emp.emp_id : (r.emp_id || r.emp_name)
      const empNameStr = emp ? emp.name : r.emp_name

      const existingAtt = attendance.find(a => matchEmpId(a.emp_id, key) && a.date === recDate)
      const finalCheckIn = r.check_in_time || (existingAtt?.check_in || '')
      const finalCheckOut = r.check_out_time || (existingAtt?.check_out || '')

      const hasPunchTimes = Boolean(finalCheckIn || finalCheckOut)
      const [y, m, d] = recDate.split('-').map(Number)
      const isSundayDate = new Date(y, m - 1, d).getDay() === 0

      if (isSundayDate) {
        if (hasPunchTimes || (r.status && r.status !== 'Holiday' && r.status !== 'Leave')) {
          attendanceToUpsert.push({
            emp_id:    key,
            date:      recDate,
            check_in:  finalCheckIn,
            check_out: finalCheckOut,
            status:    'Weekend Working',
            work_tag:  autoTag(finalCheckIn, finalCheckOut),
          })
        } else {
          holidaysToUpsert.push({
            emp_id:       key,
            emp_name:     empNameStr,
            date:         recDate,
            holiday_name: 'Sunday Holiday'
          })
        }
      } else if (r.status === 'Holiday' && !hasPunchTimes) {
        holidaysToUpsert.push({
          emp_id:       key,
          emp_name:     empNameStr,
          date:         recDate,
          holiday_name: 'Holiday'
        })
      } else {
        attendanceToUpsert.push({
          emp_id:    key,
          date:      recDate,
          check_in:  finalCheckIn,
          check_out: finalCheckOut,
          status:    r.status,
          work_tag:  autoTag(finalCheckIn, finalCheckOut),
        })
      }
    })

    if (attendanceToUpsert.length === 0 && holidaysToUpsert.length === 0) {
      alert('No valid records found in the uploaded file.')
      return
    }

    try {
      setLoading(true)
      setLoadMsg('Saving uploaded attendance records…')
      
      const promises: Promise<any>[] = []
      if (attendanceToUpsert.length > 0) {
        promises.push(attendanceApi.bulkUpsert(attendanceToUpsert))
      } else {
        promises.push(Promise.resolve([]))
      }

      if (holidaysToUpsert.length > 0) {
        promises.push(holidayApi.bulkUpsert(holidaysToUpsert))
      } else {
        promises.push(Promise.resolve([]))
      }

      const [savedAttendance, savedHolidays] = await Promise.all(promises)
      
      // Update attendance & holidays states
      handleAttendanceSaved(savedAttendance, savedHolidays)
      
      setSelectedDate(uploadDate)
      setPage('attendance')
    } catch (err: any) {
      alert(`Upload failed to save: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }



  /* ────────────────────────────────────────────
     Render
  ──────────────────────────────────────────── */
  if (!isAuth) return <Login onLogin={() => setIsAuth(true)} />

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard attendance={attendance} employees={employees} leaves={leaves} />

      case 'employees':
        return (
          <EmployeeList
            employees={employees}
            departments={departments}
            onAddEmployee={handleAddEmployee}
            onEditEmployee={handleEditEmployee}
            onDeleteEmployee={handleDeleteEmployee}
          />
        )

      case 'attendance':
        return (
          <Attendance
            employees={employees}
            attendance={attendance}
            holidays={holidays}
            onUpdateAttendance={handleUpdateAttendance}
            onAttendanceSaved={handleAttendanceSaved}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        )

      case 'departments':
        return (
          <Departments
            departments={departments}
            employees={employees}
            onAdd={handleAddDept}
            onEdit={handleEditDept}
            onDelete={handleDeleteDept}
          />
        )

      case 'leaves':
        return (
          <LeaveList
            leaves={leaves}
            attendance={attendance}
            employees={employees}
            holidays={holidays}
            onAddLeave={handleAddLeave}
          />
        )

      case 'report':
        return (
          <Report
            attendance={attendance}
            employees={employees}
            leaves={leaves}
            holidays={holidays}
            onDeleteAttendance={handleDeleteAttendance}
          />
        )

      case 'attendancelist':
        return (
          <AttendanceList
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            holidays={holidays}
            departments={departments}
            onNavigateToEditDate={(dateStr) => {
              setSelectedDate(dateStr)
              setPage('attendance')
            }}
          />
        )

      case 'upload':
        return <UploadCSV onUpload={handleUpload} />
    }
  }

  return (
    <Layout currentPage={page} onNavigate={setPage} onLogout={handleLogout}>
      {loading && <LoadingOverlay text={loadMsg} />}

      {apiError && (
        <div style={{
          background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10,
          padding: '16px 20px', marginBottom: 20, color: '#b91c1c',
          fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
        }}>
          <span>⚠️ {apiError}</span>
          <button
            onClick={loadAll}
            style={{ padding: '6px 14px', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      )}
      <div style={{ flex: 1, padding: '24px' }}>
        {renderPage()}
      </div>
    </Layout>
  )
}

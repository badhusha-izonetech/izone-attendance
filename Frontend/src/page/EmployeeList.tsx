import { useState, memo } from 'react'
import { MdAdd, MdClose, MdSearch, MdEdit, MdDelete } from 'react-icons/md'
import type { Employee, Department } from '../types'

interface EmployeeListProps {
  employees: Employee[]
  departments: Department[]
  onAddEmployee: (emp: Employee) => void
  onEditEmployee: (emp: Employee) => void
  onDeleteEmployee: (id: string) => void
}

const emptyForm = (): Omit<Employee, 'id'> => ({
  name: '', emp_id: '', phone: '', email: '', department: ''
})

function generateEmpId(employees: Employee[]): string {
  const nums = employees
    .map(e => parseInt(e.emp_id.replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return String(next).padStart(3, '0')
}

const EmployeeList = memo(function EmployeeList({
  employees,
  departments,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee
}: EmployeeListProps) {
  const [search, setSearch] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof Omit<Employee, 'id'>, string>>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 30

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.emp_id.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedEmployees = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const validate = (): typeof errors => {
    const errs: typeof errors = {}

    // Name: required, letters, spaces & dots only
    if (!form.name.trim()) {
      errs.name = 'Employee name is required'
    } else if (!/^[a-zA-Z\s.]+$/.test(form.name)) {
      errs.name = 'Name must contain letters, spaces and dots only'
    }

    // Email: required and must be a valid email with @
    if (!form.email.trim()) {
      errs.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email address (must contain @)'
    }

    if (!form.department) errs.department = 'Required'

    // Phone: numbers only, max 10 digits (only if entered)
    if (form.phone.trim()) {
      if (!/^\d+$/.test(form.phone)) {
        errs.phone = 'Phone number must contain digits only'
      } else if (form.phone.length > 10) {
        errs.phone = 'Phone number must be max 10 digits'
      } else {
        const dupPhone = employees.find(e => e.phone.trim() === form.phone.trim() && e.id !== editingEmployeeId)
        if (dupPhone) errs.phone = `Phone already used by ${dupPhone.name}`
      }
    }

    // Duplicate emp_id check (only if manually entered)
    if (form.emp_id.trim()) {
      if (!/^\d+$/.test(form.emp_id)) {
        errs.emp_id = 'Employee ID must contain numbers only'
      } else if (form.emp_id.length > 10) {
        errs.emp_id = 'Employee ID must be max 10 digits'
      } else {
        const dupId = employees.find(e => e.emp_id.toLowerCase() === form.emp_id.trim().toLowerCase() && e.id !== editingEmployeeId)
        if (dupId) errs.emp_id = `ID already used by ${dupId.name}`
      }
    }

    return errs
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    if (editingEmployeeId) {
      // Edit Mode
      onEditEmployee({
        id: editingEmployeeId,
        name: form.name.trim(),
        emp_id: form.emp_id.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        department: form.department,
      })
    } else {
      // Add Mode
      const emp_id = form.emp_id.trim() || generateEmpId(employees)
      onAddEmployee({
        id: Date.now().toString(),
        name: form.name.trim(),
        emp_id,
        phone: form.phone.trim(),
        email: form.email.trim(),
        department: form.department,
      })
    }

    setForm(emptyForm())
    setErrors({})
    setEditingEmployeeId(null)
    setShowDialog(false)
  }

  const openAddDialog = () => {
    setForm(emptyForm())
    setErrors({})
    setEditingEmployeeId(null)
    setShowDialog(true)
  }

  const openEditDialog = (emp: Employee) => {
    setForm({
      name: emp.name,
      emp_id: emp.emp_id,
      phone: emp.phone,
      email: emp.email,
      department: emp.department,
    })
    setErrors({})
    setEditingEmployeeId(emp.id)
    setShowDialog(true)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Employee List</h1>
        <p>Manage all employees in the system</p>
      </div>

      <div className="table-card">
        <div className="table-card-header">
          <h2>Employees ({filtered.length})</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="search-wrap">
              <MdSearch size={16} className="search-icon" />
              <input
                aria-label="Search employees"
                className="search-input"
                placeholder="Search by name or ID..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
              />
            </div>
            <button className="btn-add" onClick={openAddDialog} aria-label="Add Employee">
              <MdAdd size={18} aria-hidden="true" /> Add Employee
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">No employees found. Click "Add Employee" to get started.</div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Emp ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Department</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.map((e, i) => (
                  <tr key={e.id}>
                    <td>{(currentPage - 1) * itemsPerPage + i + 1}</td>
                    <td><span className="badge badge-overtime">{e.emp_id}</span></td>
                    <td>{e.name}</td>
                    <td>{e.email}</td>
                    <td>{e.phone || '—'}</td>
                    <td>{e.department}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn-edit-small"
                          onClick={() => openEditDialog(e)}
                          title="Edit Employee"
                          aria-label={`Edit ${e.name}`}
                        >
                          <MdEdit size={18} aria-hidden="true" />
                        </button>
                        <button
                          className="btn-delete-small"
                          onClick={() => onDeleteEmployee(e.id)}
                          title="Delete Employee"
                          aria-label={`Delete ${e.name}`}
                        >
                          <MdDelete size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '16px 24px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="btn-page"
                  style={{
                    padding: '6px 12px',
                    border: '1.5px solid #dce1e7',
                    borderRadius: 6,
                    background: '#fff',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 1 ? 0.5 : 1,
                    fontSize: 14,
                    fontWeight: 500
                  }}
                >
                  Previous
                </button>
                <span style={{ fontSize: 14, color: '#64748b' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="btn-page"
                  style={{
                    padding: '6px 12px',
                    border: '1.5px solid #dce1e7',
                    borderRadius: 6,
                    background: '#fff',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages ? 0.5 : 1,
                    fontSize: 14,
                    fontWeight: 500
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showDialog && (
        <div className="modal-overlay" onClick={() => setShowDialog(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEmployeeId ? 'Edit Employee Details' : 'Add New Employee'}</h3>
              <button className="modal-close" onClick={() => setShowDialog(false)}><MdClose size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">

              {/* Name */}
              <div className="form-group">
                <label htmlFor="emp-name">Name <span style={{ color: '#e74c3c' }}>*</span></label>
                <input
                  id="emp-name"
                  type="text"
                  placeholder="Enter full name"
                  value={form.name}
                  onChange={e => {
                    const cleanVal = e.target.value.replace(/[^a-zA-Z\s.]/g, '')
                    setForm(f => ({ ...f, name: cleanVal }))
                    setErrors(x => ({ ...x, name: '' }))
                  }}
                  style={{ borderColor: errors.name ? '#e74c3c' : undefined }}
                />
                {errors.name && <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.name}</span>}
              </div>

              {/* Emp ID — optional */}
              <div className="form-group">
                <label htmlFor="emp-id">
                  Employee ID
                  <span style={{ color: '#95a5a6', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>
                    {editingEmployeeId ? '(numbers only — max 10 digits)' : '(optional — numbers only, max 10 digits)'}
                  </span>
                </label>
                <input
                  id="emp-id"
                  type="text"
                  placeholder={editingEmployeeId ? "Enter Employee ID" : `e.g. ${generateEmpId(employees)}`}
                  value={form.emp_id}
                  onChange={e => {
                    const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setForm(f => ({ ...f, emp_id: cleanVal }))
                    setErrors(x => ({ ...x, emp_id: '' }))
                  }}
                  style={{ borderColor: errors.emp_id ? '#e74c3c' : undefined }}
                />
                {errors.emp_id && <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.emp_id}</span>}
              </div>

              {/* Phone */}
              <div className="form-group">
                <label htmlFor="emp-phone">
                  Number
                  <span style={{ color: '#95a5a6', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>(numbers only, max 10 digits)</span>
                </label>
                <input
                  id="emp-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="Enter phone number"
                  maxLength={10}
                  value={form.phone}
                  onChange={e => {
                    const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setForm(f => ({ ...f, phone: cleanVal }))
                    setErrors(x => ({ ...x, phone: '' }))
                  }}
                  style={{ borderColor: errors.phone ? '#e74c3c' : undefined }}
                />
                {errors.phone && <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.phone}</span>}
              </div>

              {/* Email */}
              <div className="form-group">
                <label htmlFor="emp-email">Email<span style={{ color: '#e74c3c' }}>*</span></label>
                <input
                  id="emp-email"
                  type="email"
                  placeholder="Enter email"
                  value={form.email}
                  onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setErrors(x => ({ ...x, email: '' })) }}
                  style={{ borderColor: errors.email ? '#e74c3c' : undefined }}
                />
                {errors.email && <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.email}</span>}
              </div>

              {/* Department */}
              <div className="form-group">
                <label htmlFor="emp-dept">Department <span style={{ color: '#e74c3c' }}>*</span></label>
                <select
                  id="emp-dept"
                  value={form.department}
                  onChange={e => { setForm(f => ({ ...f, department: e.target.value })); setErrors(x => ({ ...x, department: '' })) }}
                  style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${errors.department ? '#e74c3c' : '#dce1e7'}`, borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff' }}
                >
                  <option value="">Select Department</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                {errors.department && <span style={{ color: '#e74c3c', fontSize: 12 }}>{errors.department}</span>}
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                {editingEmployeeId ? 'Save Changes' : 'Add Employee'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
})

export default EmployeeList

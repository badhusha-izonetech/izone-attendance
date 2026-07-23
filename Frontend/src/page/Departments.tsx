import { useState, memo } from 'react'
import { MdAdd, MdClose, MdEdit, MdDelete, MdApartment } from 'react-icons/md'
import type { Department, Employee } from '../types'

interface DepartmentsProps {
  departments: Department[]
  employees: Employee[]
  onAdd: (dept: Department) => void
  onEdit: (dept: Department) => void
  onDelete: (id: string) => void
}

const Departments = memo(function Departments({ departments, employees, onAdd, onEdit, onDelete }: DepartmentsProps) {
  const [showDialog, setShowDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<Department | null>(null)
  const [name, setName] = useState('')
  const [nameErr, setNameErr] = useState('')

  const empCount = (deptName: string) => employees.filter(e => e.department === deptName).length

  const openAdd = () => { setEditTarget(null); setName(''); setNameErr(''); setShowDialog(true) }
  const openEdit = (d: Department) => { setEditTarget(d); setName(d.name); setNameErr(''); setShowDialog(true) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setNameErr('Department name is required'); return }
    if (editTarget) {
      onEdit({ ...editTarget, name: name.trim() })
    } else {
      onAdd({ id: Date.now().toString(), name: name.trim() })
    }
    setShowDialog(false)
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Departments</h1>
          <p>Manage company departments</p>
        </div>
        <button className="btn-add" onClick={openAdd} aria-label="Add Department"><MdAdd size={18} aria-hidden="true" /> Add Department</button>
      </div>

      {departments.length === 0 ? (
        <div className="empty-state" style={{ background: '#fff', borderRadius: 10, padding: 60 }}>
          No departments yet. Click "Add Department" to create one.
        </div>
      ) : (
        <div className="dept-grid">
          {departments.map(d => (
            <div key={d.id} className="dept-card">
              <div className="dept-card-icon"><MdApartment size={28} /></div>
              <div className="dept-card-info">
                <h3>{d.name}</h3>
                <p>{empCount(d.name)} Employee{empCount(d.name) !== 1 ? 's' : ''}</p>
              </div>
              <div className="dept-card-actions">
                <button className="dept-action-btn edit" onClick={() => openEdit(d)} title="Edit" aria-label={`Edit ${d.name}`}><MdEdit size={16} aria-hidden="true" /></button>
                <button className="dept-action-btn delete" onClick={() => onDelete(d.id)} title="Delete" aria-label={`Delete ${d.name}`}><MdDelete size={16} aria-hidden="true" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDialog && (
        <div className="modal-overlay" onClick={() => setShowDialog(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editTarget ? 'Edit Department' : 'Add Department'}</h3>
              <button className="modal-close" onClick={() => setShowDialog(false)} aria-label="Close dialog"><MdClose size={20} aria-hidden="true" /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label htmlFor="dept-name">Department Name</label>
                <input
                  id="dept-name"
                  type="text"
                  placeholder="e.g. Engineering"
                  value={name}
                  onChange={e => { setName(e.target.value); setNameErr('') }}
                  autoFocus
                  style={{ borderColor: nameErr ? '#e74c3c' : undefined }}
                />
                {nameErr && <span style={{ color: '#e74c3c', fontSize: 12 }}>{nameErr}</span>}
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
                {editTarget ? 'Save Changes' : 'Add Department'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
})

export default Departments

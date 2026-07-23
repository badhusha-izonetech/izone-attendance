from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api import deps
from app import model, schema

router = APIRouter()

@router.get("/", response_model=List[schema.Employee])
def read_employees(db: Session = Depends(deps.get_db)):
    return db.query(model.Employee).all()

@router.post("/", response_model=schema.Employee)
def create_employee(emp_in: schema.EmployeeCreate, db: Session = Depends(deps.get_db)):
    dup_email = db.query(model.Employee).filter(model.Employee.email == emp_in.email).first()
    if dup_email:
        raise HTTPException(status_code=400, detail="Email already used")
    
    dup_id = db.query(model.Employee).filter(model.Employee.emp_id == emp_in.emp_id).first()
    if dup_id:
        raise HTTPException(status_code=400, detail="Employee ID already used")
        
    db_emp = model.Employee(
        name=emp_in.name,
        emp_id=emp_in.emp_id,
        email=emp_in.email,
        phone=emp_in.phone,
        department=emp_in.department
    )
    db.add(db_emp)
    db.commit()
    db.refresh(db_emp)
    return db_emp

@router.put("/{emp_id}", response_model=schema.Employee)
def update_employee(emp_id: int, emp_in: schema.EmployeeUpdate, db: Session = Depends(deps.get_db)):
    db_emp = db.query(model.Employee).filter(model.Employee.id == emp_id).first()
    if not db_emp:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    dup_email = db.query(model.Employee).filter(model.Employee.email == emp_in.email, model.Employee.id != emp_id).first()
    if dup_email:
        raise HTTPException(status_code=400, detail="Email already used by another employee")
    
    dup_id = db.query(model.Employee).filter(model.Employee.emp_id == emp_in.emp_id, model.Employee.id != emp_id).first()
    if dup_id:
        raise HTTPException(status_code=400, detail="Employee ID already used by another employee")
        
    db_emp.name = emp_in.name
    db_emp.emp_id = emp_in.emp_id
    db_emp.email = emp_in.email
    db_emp.phone = emp_in.phone
    db_emp.department = emp_in.department
    
    db.commit()
    db.refresh(db_emp)
    return db_emp

@router.delete("/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(deps.get_db)):
    db_emp = db.query(model.Employee).filter(model.Employee.id == emp_id).first()
    if not db_emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    db.delete(db_emp)
    db.commit()
    return {"status": "success"}

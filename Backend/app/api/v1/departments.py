from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api import deps
from app import model, schema

router = APIRouter()

@router.get("/", response_model=List[schema.Department])
def read_departments(db: Session = Depends(deps.get_db)):
    return db.query(model.Department).all()

@router.post("/", response_model=schema.Department)
def create_department(dep_in: schema.DepartmentCreate, db: Session = Depends(deps.get_db)):
    existing = db.query(model.Department).filter(model.Department.name == dep_in.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department already exists")
    db_dep = model.Department(name=dep_in.name)
    db.add(db_dep)
    db.commit()
    db.refresh(db_dep)
    return db_dep

@router.put("/{dep_id}", response_model=schema.Department)
def update_department(dep_id: int, dep_in: schema.DepartmentUpdate, db: Session = Depends(deps.get_db)):
    db_dep = db.query(model.Department).filter(model.Department.id == dep_id).first()
    if not db_dep:
        raise HTTPException(status_code=404, detail="Department not found")
    db_dep.name = dep_in.name
    db.commit()
    db.refresh(db_dep)
    return db_dep

@router.delete("/{dep_id}")
def delete_department(dep_id: int, db: Session = Depends(deps.get_db)):
    db_dep = db.query(model.Department).filter(model.Department.id == dep_id).first()
    if not db_dep:
        raise HTTPException(status_code=404, detail="Department not found")
    db.delete(db_dep)
    db.commit()
    return {"status": "success"}

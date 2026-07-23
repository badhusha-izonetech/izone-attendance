from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api import deps
from app import model, schema

router = APIRouter()

@router.get("/", response_model=List[schema.LeaveRecord])
def read_leaves(db: Session = Depends(deps.get_db)):
    return db.query(model.LeaveRecord).all()

@router.post("/", response_model=schema.LeaveRecord)
def create_leave(leave_in: schema.LeaveRecordCreate, db: Session = Depends(deps.get_db)):
    db_leave = model.LeaveRecord(
        emp_id=leave_in.emp_id,
        emp_name=leave_in.emp_name,
        from_date=leave_in.from_date,
        to_date=leave_in.to_date,
        leave_type=leave_in.leave_type,
        reason=leave_in.reason
    )
    db.add(db_leave)
    db.commit()
    db.refresh(db_leave)
    return db_leave

@router.post("/bulk", response_model=List[schema.LeaveRecord])
def bulk_create_leaves(leaves_in: List[schema.LeaveRecordCreate], db: Session = Depends(deps.get_db)):
    """
    Bulk-create leave records. Skips any record that already exists for the
    same emp_id + from_date + to_date (avoids duplicates when syncing from attendance).
    """
    created = []
    for leave_in in leaves_in:
        existing = db.query(model.LeaveRecord).filter(
            model.LeaveRecord.emp_id == leave_in.emp_id,
            model.LeaveRecord.from_date == leave_in.from_date,
            model.LeaveRecord.to_date == leave_in.to_date,
        ).first()
        if existing:
            continue
        db_leave = model.LeaveRecord(
            emp_id=leave_in.emp_id,
            emp_name=leave_in.emp_name,
            from_date=leave_in.from_date,
            to_date=leave_in.to_date,
            leave_type=leave_in.leave_type,
            reason=leave_in.reason
        )
        db.add(db_leave)
        db.flush()
        created.append(db_leave)
    db.commit()
    for l in created:
        db.refresh(l)
    return created

@router.delete("/{leave_id}")
def delete_leave(leave_id: int, db: Session = Depends(deps.get_db)):
    db_leave = db.query(model.LeaveRecord).filter(model.LeaveRecord.id == leave_id).first()
    if not db_leave:
        raise HTTPException(status_code=404, detail="Leave record not found")
    db.delete(db_leave)
    db.commit()
    return {"status": "success"}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from typing import List
from app.api import deps
from app import model, schema

router = APIRouter()

@router.get("/", response_model=List[schema.DailyAttendance])
def read_attendance(db: Session = Depends(deps.get_db)):
    return db.query(model.DailyAttendance).all()

@router.post("/", response_model=schema.DailyAttendance)
def create_or_update_attendance(att_in: schema.DailyAttendanceCreate, db: Session = Depends(deps.get_db)):
    stmt = insert(model.DailyAttendance).values(
        emp_id=att_in.emp_id,
        date=att_in.date,
        check_in=att_in.check_in,
        check_out=att_in.check_out,
        status=att_in.status,
        work_tag=att_in.work_tag
    )
    
    update_dict = {
        "check_in": att_in.check_in,
        "check_out": att_in.check_out,
        "status": att_in.status,
        "work_tag": att_in.work_tag
    }
    
    stmt = stmt.on_conflict_do_update(
        constraint='uix_emp_id_date',
        set_=update_dict
    )
    
    db.execute(stmt)
    db.commit()
    
    record = db.query(model.DailyAttendance).filter(
        model.DailyAttendance.emp_id == att_in.emp_id,
        model.DailyAttendance.date == att_in.date
    ).first()
    
    return record

@router.post("/bulk", response_model=List[schema.DailyAttendance])
def create_bulk_attendance(records_in: List[schema.DailyAttendanceCreate], db: Session = Depends(deps.get_db)):
    for att_in in records_in:
        stmt = insert(model.DailyAttendance).values(
            emp_id=att_in.emp_id,
            date=att_in.date,
            check_in=att_in.check_in,
            check_out=att_in.check_out,
            status=att_in.status,
            work_tag=att_in.work_tag
        )
        update_dict = {
            "check_in": att_in.check_in,
            "check_out": att_in.check_out,
            "status": att_in.status,
            "work_tag": att_in.work_tag
        }
        stmt = stmt.on_conflict_do_update(
            constraint='uix_emp_id_date',
            set_=update_dict
        )
        db.execute(stmt)
    db.commit()
    
    records_out = []
    for att_in in records_in:
        record = db.query(model.DailyAttendance).filter(
            model.DailyAttendance.emp_id == att_in.emp_id,
            model.DailyAttendance.date == att_in.date
        ).first()
        if record:
            records_out.append(record)
            
    return records_out

@router.delete("/by-date")
def delete_attendance_by_date(from_date: str, to_date: str, db: Session = Depends(deps.get_db)):
    import datetime
    try:
        from_date_obj = datetime.datetime.strptime(from_date, "%Y-%m-%d").date()
        to_date_obj = datetime.datetime.strptime(to_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    # Delete daily attendance records
    att_deleted = db.query(model.DailyAttendance).filter(
        model.DailyAttendance.date >= from_date_obj,
        model.DailyAttendance.date <= to_date_obj
    ).delete(synchronize_session=False)

    # Delete leave records falling within this range
    leave_deleted = db.query(model.LeaveRecord).filter(
        model.LeaveRecord.from_date >= from_date_obj,
        model.LeaveRecord.to_date <= to_date_obj
    ).delete(synchronize_session=False)

    # Delete holiday records falling within this range
    holiday_deleted = db.query(model.Holiday).filter(
        model.Holiday.date >= from_date_obj,
        model.Holiday.date <= to_date_obj
    ).delete(synchronize_session=False)

    db.commit()
    count_to_report = att_deleted if att_deleted > 0 else (leave_deleted + holiday_deleted)
    return {
        "status": "success",
        "deleted_count": count_to_report,
        "att_deleted": att_deleted,
        "leave_deleted": leave_deleted,
        "holiday_deleted": holiday_deleted
    }

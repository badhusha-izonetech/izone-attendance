from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api import deps
from app import model, schema

router = APIRouter()

@router.get("/", response_model=List[schema.Holiday])
def read_holidays(db: Session = Depends(deps.get_db)):
    return db.query(model.Holiday).all()

@router.post("/", response_model=schema.Holiday)
def create_holiday(holiday_in: schema.HolidayCreate, db: Session = Depends(deps.get_db)):
    existing = db.query(model.Holiday).filter(
        model.Holiday.emp_id == holiday_in.emp_id,
        model.Holiday.date == holiday_in.date
    ).first()
    if existing:
        existing.emp_name = holiday_in.emp_name
        existing.holiday_name = holiday_in.holiday_name
        db.commit()
        db.refresh(existing)
        return existing

    db_holiday = model.Holiday(
        emp_id=holiday_in.emp_id,
        emp_name=holiday_in.emp_name,
        date=holiday_in.date,
        holiday_name=holiday_in.holiday_name
    )
    db.add(db_holiday)
    db.commit()
    db.refresh(db_holiday)
    return db_holiday

@router.post("/bulk", response_model=List[schema.Holiday])
def bulk_create_holidays(holidays_in: List[schema.HolidayCreate], db: Session = Depends(deps.get_db)):
    created = []
    for h_in in holidays_in:
        existing = db.query(model.Holiday).filter(
            model.Holiday.emp_id == h_in.emp_id,
            model.Holiday.date == h_in.date
        ).first()
        if existing:
            existing.emp_name = h_in.emp_name
            existing.holiday_name = h_in.holiday_name
            created.append(existing)
        else:
            db_holiday = model.Holiday(
                emp_id=h_in.emp_id,
                emp_name=h_in.emp_name,
                date=h_in.date,
                holiday_name=h_in.holiday_name
            )
            db.add(db_holiday)
            db.flush()
            created.append(db_holiday)
    db.commit()
    for h in created:
        db.refresh(h)
    return created

@router.delete("/{holiday_id}")
def delete_holiday(holiday_id: int, db: Session = Depends(deps.get_db)):
    db_holiday = db.query(model.Holiday).filter(model.Holiday.id == holiday_id).first()
    if not db_holiday:
        raise HTTPException(status_code=404, detail="Holiday record not found")
    db.delete(db_holiday)
    db.commit()
    return {"status": "success"}

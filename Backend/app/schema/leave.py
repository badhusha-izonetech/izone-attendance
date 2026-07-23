from pydantic import BaseModel
import datetime

class LeaveRecordBase(BaseModel):
    emp_id: str
    emp_name: str
    from_date: datetime.date
    to_date: datetime.date
    leave_type: str
    reason: str

class LeaveRecordCreate(LeaveRecordBase):
    pass

class LeaveRecordUpdate(LeaveRecordBase):
    pass

class LeaveRecord(LeaveRecordBase):
    id: int

    class Config:
        from_attributes = True

from pydantic import BaseModel
from typing import Optional
import datetime

class DailyAttendanceBase(BaseModel):
    emp_id: str
    date: datetime.date
    check_in: Optional[str] = ""
    check_out: Optional[str] = ""
    status: str
    work_tag: Optional[str] = None

class DailyAttendanceCreate(DailyAttendanceBase):
    pass

class DailyAttendanceUpdate(DailyAttendanceBase):
    pass

class DailyAttendance(DailyAttendanceBase):
    id: int

    class Config:
        from_attributes = True

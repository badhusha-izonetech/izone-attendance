from pydantic import BaseModel
from typing import Optional
import datetime

class HolidayBase(BaseModel):
    emp_id: str
    emp_name: str
    date: datetime.date
    holiday_name: Optional[str] = None

class HolidayCreate(HolidayBase):
    pass

class HolidayUpdate(HolidayBase):
    pass

class Holiday(HolidayBase):
    id: int

    class Config:
        from_attributes = True

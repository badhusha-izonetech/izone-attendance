from sqlalchemy import String, Date
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base_class import Base
import datetime

class LeaveRecord(Base):
    __tablename__ = "leave_record"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    emp_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    emp_name: Mapped[str] = mapped_column(String(100), nullable=False)
    from_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    to_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    leave_type: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)

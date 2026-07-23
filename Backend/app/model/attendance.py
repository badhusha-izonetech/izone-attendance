from sqlalchemy import String, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base_class import Base
import datetime

class DailyAttendance(Base):
    __tablename__ = "daily_attendance"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    emp_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False, index=True)
    check_in: Mapped[str] = mapped_column(String(10), nullable=True)
    check_out: Mapped[str] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    work_tag: Mapped[str] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint('emp_id', 'date', name='uix_emp_id_date'),
    )

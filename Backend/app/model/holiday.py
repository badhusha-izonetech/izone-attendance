from sqlalchemy import String, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base_class import Base
import datetime

class Holiday(Base):
    __tablename__ = "holiday"
    
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    emp_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    emp_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date: Mapped[datetime.date] = mapped_column(Date, nullable=False, index=True)
    holiday_name: Mapped[str] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint('emp_id', 'date', name='uix_holiday_emp_id_date'),
    )

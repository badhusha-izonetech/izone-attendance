from app.db.session import SessionLocal
from app.model.attendance import DailyAttendance
from app.model.leave import LeaveRecord

def clear_data():
    db = SessionLocal()
    try:
        deleted_attendance = db.query(DailyAttendance).delete()
        deleted_leaves = db.query(LeaveRecord).delete()
        db.commit()
        print(f"Successfully deleted {deleted_attendance} attendance records and {deleted_leaves} leave records.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_data()

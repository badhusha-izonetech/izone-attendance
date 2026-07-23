import smtplib
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.core.config import settings

router = APIRouter()

class SendOTPRequest(BaseModel):
    email: str
    otp: str

@router.post("/send-otp")
def send_otp(payload: SendOTPRequest):
    if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SMTP credentials are not configured on the backend server."
        )
    
    # Compose mail
    msg = MIMEText(
        f"Hello,\n\nYour OTP for resetting your Attendance Izone password is: {payload.otp}\n\n"
        "This code is valid for 10 minutes. If you did not request this, please ignore this email.\n\n"
        "Best regards,\nAttendance Izone Team"
    )
    msg["Subject"] = "Attendance Izone - Password Reset OTP"
    msg["From"] = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
    msg["To"] = payload.email
    
    try:
        # Connect to SMTP
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.ehlo()
        if settings.SMTP_TLS:
            server.starttls()
            server.ehlo()
        
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.sendmail(msg["From"], [msg["To"]], msg.as_string())
        server.close()
        
        return {"status": "success", "message": f"OTP successfully sent to {payload.email}"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send email: {str(e)}"
        )

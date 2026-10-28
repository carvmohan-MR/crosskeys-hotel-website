import json, os, smtplib
from email.message import EmailMessage
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from .config import settings

def send_email(to_email: str, subject: str, body: str, pdf_bytes: bytes | None = None):
    if not (settings.smtp_host and settings.smtp_from):
        return False  # email is intentionally a no-op until SMTP is configured
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, settings.smtp_from, to_email
    msg.set_content(body)
    if pdf_bytes:
        msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename="crosskeys-booking-confirmation.pdf")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(msg)
    return True

def booking_pdf(booking, room_name):
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    pdf.setTitle("CROSSKEYS Booking Confirmation")
    y = 740
    for line in [
        settings.hotel_name, "Booking confirmation", "",
        f"Reference: {booking.reference}",
        f"Guest: {booking.guest_name}",
        f"Room: {room_name}",
        f"Check-in: {booking.check_in}",
        f"Check-out: {booking.check_out}",
        f"Guests: {booking.guests}",
        f"Nights: {booking.nights}",
        f"Total paid: INR {float(booking.amount):.2f}",
        f"Booking status: {booking.booking_status}",
        "", settings.hotel_address, settings.hotel_phone,
    ]:
        pdf.drawString(60, y, line[:110])
        y -= 25
    pdf.save()
    return buffer.getvalue()

def image_list(room):
    try: return json.loads(room.image_urls or "[]")
    except Exception: return []

def set_image_list(room, values):
    room.image_urls = json.dumps(values)

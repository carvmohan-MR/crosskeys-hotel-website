import os, json, hmac, hashlib, secrets
from datetime import date
from decimal import Decimal
from pathlib import Path
import razorpay
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from .config import settings

import cloudinary
import cloudinary.uploader

def upload_to_cloudinary(content: bytes, folder: str) -> str:
    if not settings.cloudinary_cloud_name or not settings.cloudinary_api_key or not settings.cloudinary_api_secret:
        raise HTTPException(503, "Cloudinary is not configured")

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )

    result = cloudinary.uploader.upload(
        content,
        folder=f"crosskeys/{folder}",
        resource_type="image",
    )
    return result["secure_url"]

from .db import Base, engine, get_db, SessionLocal
from .models import RoomType, Booking, SiteImage, SiteSetting
from .schemas import BookingCreate, RoomCreate, LoginIn, PaymentVerify
from .security import make_token, require_admin
from .services import send_email, booking_pdf, image_list, set_image_list

app = FastAPI(title="CROSSKEYS Booking API", version="1.0.0")
origins = [x.strip() for x in settings.cors_origins.split(",") if x.strip()]
# In local development, allow the Vite app opened from localhost or a private LAN IP
# (for example, a tablet opening http://192.168.1.12:5173). Keep explicit configured
# origins above for production deployments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    # Additive migration for databases created by earlier versions of this starter.
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE room_types ADD COLUMN IF NOT EXISTS standard_capacity INTEGER NOT NULL DEFAULT 2"))
        conn.execute(text("ALTER TABLE room_types ADD COLUMN IF NOT EXISTS inventory_count INTEGER NOT NULL DEFAULT 1"))
        conn.execute(text("ALTER TABLE room_types ADD COLUMN IF NOT EXISTS extra_guest_fee NUMERIC(10,2) NOT NULL DEFAULT 750"))
        conn.execute(text("ALTER TABLE site_images ADD COLUMN IF NOT EXISTS section VARCHAR(30) NOT NULL DEFAULT 'slideshow'"))
        conn.execute(text("UPDATE site_images SET section = 'slideshow' WHERE section IS NULL OR section = ''"))
    with SessionLocal() as db:
        if db.query(RoomType).count() == 0:
            db.add_all([
                RoomType(name="Suite Room", description="", max_capacity=5, standard_capacity=4, inventory_count=2, extra_guest_fee=Decimal("750"), price_per_night=Decimal("3500"), image_urls="[]"),
                RoomType(name="Deluxe Room", description="", max_capacity=3, standard_capacity=2, inventory_count=6, extra_guest_fee=Decimal("750"), price_per_night=Decimal("2200"), image_urls="[]"),
            ])
            db.commit()
        # Keep actual in-service inventory accurate; four rooms under construction are not bookable.
        for room in db.query(RoomType).all():
            if room.name.strip().lower() == "suite room":
                room.standard_capacity = 4; room.max_capacity = 5; room.inventory_count = 2; room.extra_guest_fee = Decimal("750")
                room.description = ""
            elif room.name.strip().lower() == "deluxe room":
                room.standard_capacity = 2; room.max_capacity = 3; room.inventory_count = 6; room.extra_guest_fee = Decimal("750")
                room.description = ""
        db.commit()

def room_json(room):
    return {"id": room.id, "name": room.name, "description": room.description, "standard_capacity": room.standard_capacity,
            "max_capacity": room.max_capacity, "inventory_count": room.inventory_count, "extra_guest_fee": float(room.extra_guest_fee),
            "price_per_night": float(room.price_per_night), "image_urls": image_list(room), "active": room.active}

def booking_json(b):
    return {"id": b.id, "reference": b.reference, "room_type_id": b.room_type_id, "room_name": b.room_type.name,
            "guest_name": b.guest_name, "guest_email": b.guest_email, "guest_phone": b.guest_phone, "guests": b.guests,
            "check_in": str(b.check_in), "check_out": str(b.check_out), "nights": b.nights, "amount": float(b.amount),
            "payment_status": b.payment_status, "booking_status": b.booking_status,
            "payment_method": "razorpay" if b.gateway_order_id else "upi_manual",
            "cancellation_fee": float(b.cancellation_fee) if b.cancellation_fee is not None else None,
            "refund_amount": float(b.refund_amount) if b.refund_amount is not None else None}

@app.get("/api/health")
def health(): return {"ok": True, "service": "crosskeys-api"}

@app.get("/api/rooms")
def list_rooms(db: Session = Depends(get_db)):
    return [room_json(r) for r in db.query(RoomType).filter(RoomType.active.is_(True)).order_by(RoomType.id).all()]


def slideshow_interval(db: Session) -> int:
    setting = db.get(SiteSetting, "slideshow_interval")
    try:
        return max(3, min(60, int(setting.value))) if setting else 10
    except (TypeError, ValueError):
        return 10


def site_image_json(image: SiteImage):
    return {"id": image.id, "image_url": image.image_url, "section": image.section, "sort_order": image.sort_order, "active": image.active}


@app.get("/api/slideshow")
def get_slideshow(db: Session = Depends(get_db)):
    images = db.query(SiteImage).filter(SiteImage.section == "slideshow", SiteImage.active.is_(True)).order_by(SiteImage.sort_order, SiteImage.id).all()
    return {"images": [site_image_json(i) for i in images], "interval_seconds": slideshow_interval(db)}


@app.get("/api/admin/slideshow")
def admin_get_slideshow(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    images = db.query(SiteImage).filter(SiteImage.section == "slideshow").order_by(SiteImage.sort_order, SiteImage.id).all()
    return {"images": [site_image_json(i) for i in images], "interval_seconds": slideshow_interval(db)}



@app.post("/api/admin/slideshow/images")
async def admin_upload_slideshow_images(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    count = db.query(SiteImage).filter(
        SiteImage.section == "slideshow"
    ).count()
    created = []

    for file in files:
        if file.content_type not in allowed:
            raise HTTPException(400, "Only JPG, PNG or WEBP images are allowed")

        content = await file.read()
        if not content or len(content) > 20 * 1024 * 1024:
            raise HTTPException(400, "Each image must be non-empty and 20 MB or smaller")

        try:
            image_url = upload_to_cloudinary(content, "slideshow")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, "Unable to upload image to Cloudinary")

        image = SiteImage(
            image_url=image_url,
            section="slideshow",
            sort_order=count,
            active=True,
        )
        db.add(image)
        created.append(image)
        count += 1

    db.commit()
    for image in created:
        db.refresh(image)

    return {
        "images": [site_image_json(i) for i in created],
        "message": f"Uploaded {len(created)} slideshow image(s).",
    }


@app.patch("/api/admin/slideshow/images/{image_id}")
def admin_update_slideshow_image(image_id: int, data: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    image = db.get(SiteImage, image_id)
    if not image or image.section != "slideshow":
        raise HTTPException(404, "Slideshow image not found")
    if "active" in data:
        image.active = bool(data["active"])
    if "sort_order" in data:
        try:
            image.sort_order = max(0, int(data["sort_order"]))
        except (TypeError, ValueError):
            raise HTTPException(400, "sort_order must be a non-negative integer")
    db.commit()
    db.refresh(image)
    return site_image_json(image)


@app.delete("/api/admin/slideshow/images/{image_id}")
def admin_delete_slideshow_image(image_id: int, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    image = db.get(SiteImage, image_id)
    if not image or image.section != "slideshow":
        raise HTTPException(404, "Slideshow image not found")
    image_path = image.image_url.removeprefix("/uploads/")
    if image_path and Path(image_path).name == image_path:
        try:
            (Path(settings.upload_dir) / image_path).unlink(missing_ok=True)
        except OSError:
            pass
    db.delete(image)
    db.commit()
    return {"message": "Slideshow image deleted."}


@app.get("/api/gallery")
def get_gallery(db: Session = Depends(get_db)):
    images = db.query(SiteImage).filter(SiteImage.section == "gallery", SiteImage.active.is_(True)).order_by(SiteImage.sort_order, SiteImage.id).all()
    return {"images": [site_image_json(i) for i in images]}


@app.get("/api/admin/gallery")
def admin_get_gallery(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    images = db.query(SiteImage).filter(SiteImage.section == "gallery").order_by(SiteImage.sort_order, SiteImage.id).all()
    return {"images": [site_image_json(i) for i in images]}



@app.post("/api/admin/gallery/images")
async def admin_upload_gallery_images(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    count = db.query(SiteImage).filter(
        SiteImage.section == "gallery"
    ).count()
    created = []

    for file in files:
        if file.content_type not in allowed:
            raise HTTPException(400, "Only JPG, PNG or WEBP images are allowed")

        content = await file.read()
        if not content or len(content) > 20 * 1024 * 1024:
            raise HTTPException(400, "Each image must be non-empty and 20 MB or smaller")

        try:
            image_url = upload_to_cloudinary(content, "gallery")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, "Unable to upload image to Cloudinary")

        image = SiteImage(
            image_url=image_url,
            section="gallery",
            sort_order=count,
            active=True,
        )
        db.add(image)
        created.append(image)
        count += 1

    db.commit()
    for image in created:
        db.refresh(image)

    return {
        "images": [site_image_json(i) for i in created],
        "message": f"Uploaded {len(created)} gallery image(s).",
    }


@app.patch("/api/admin/gallery/images/{image_id}")
def admin_update_gallery_image(image_id: int, data: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    image = db.get(SiteImage, image_id)
    if not image or image.section != "gallery": raise HTTPException(404, "Gallery image not found")
    if "active" in data: image.active = bool(data["active"])
    if "sort_order" in data:
        try: image.sort_order = max(0, int(data["sort_order"]))
        except (TypeError, ValueError): raise HTTPException(400, "sort_order must be a non-negative integer")
    db.commit(); db.refresh(image); return site_image_json(image)



@app.delete("/api/admin/gallery/images/{image_id}")
def admin_delete_gallery_image(
    image_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    image = db.get(SiteImage, image_id)
    if not image or image.section != "gallery":
        raise HTTPException(404, "Gallery image not found")

    image_url = image.image_url

    if image_url.startswith("/uploads/"):
        image_path = image_url.removeprefix("/uploads/")
        if image_path and Path(image_path).name == image_path:
            try:
                (Path(settings.upload_dir) / image_path).unlink(missing_ok=True)
            except OSError:
                pass

    db.delete(image)
    db.commit()
    return {"message": "Gallery image deleted."}



@app.patch("/api/admin/slideshow/settings")
def admin_update_slideshow_settings(data: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    try:
        interval = int(data.get("interval_seconds", 10))
    except (TypeError, ValueError):
        raise HTTPException(400, "Interval must be a number of seconds")
    if interval < 3 or interval > 60:
        raise HTTPException(400, "Slideshow interval must be between 3 and 60 seconds")
    setting = db.get(SiteSetting, "slideshow_interval")
    if setting:
        setting.value = str(interval)
    else:
        db.add(SiteSetting(key="slideshow_interval", value=str(interval)))
    db.commit()
    return {"interval_seconds": interval, "message": "Slideshow settings saved."}

@app.post("/api/bookings")
def create_booking(data: BookingCreate, db: Session = Depends(get_db)):
    room = db.query(RoomType).filter(RoomType.id == data.room_type_id, RoomType.active.is_(True)).first()
    if not room: raise HTTPException(404, "Room type not found")
    if data.guests > room.max_capacity: raise HTTPException(400, f"{room.name} maximum capacity is {room.max_capacity}")
    if data.check_in < date.today(): raise HTTPException(400, "Check-in date cannot be in the past")
    # Inventory counts only active, confirmed stays; the four rooms under construction are excluded.
    overlap = db.query(Booking).filter(
        Booking.room_type_id == room.id, Booking.booking_status == "confirmed",
        Booking.check_in < data.check_out, Booking.check_out > data.check_in
    ).count()
    if overlap >= room.inventory_count:
        raise HTTPException(409, f"All {room.inventory_count} {room.name.lower()}s are booked for those dates. Please choose other dates.")
    nights = (data.check_out - data.check_in).days
    amount = Decimal(str(room.price_per_night)) * nights
    if data.guests > room.standard_capacity:
        # One extra guest is allowed, at ₹750 per night, for either room type.
        amount += Decimal(str(room.extra_guest_fee)) * nights
    ref = "CK" + secrets.token_hex(5).upper()
    booking = Booking(reference=ref, room_type_id=room.id, guest_name=data.guest_name, guest_email=str(data.guest_email),
        guest_phone=data.guest_phone, guests=data.guests, check_in=data.check_in, check_out=data.check_out,
        nights=nights, amount=amount, payment_status="pending", booking_status="pending_payment")
    db.add(booking); db.commit(); db.refresh(booking)
    order_id = None
    if settings.razorpay_key_id and settings.razorpay_key_secret:
        client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
        order = client.order.create({"amount": int(amount * 100), "currency": "INR", "receipt": ref,
                                     "notes": {"booking_reference": ref}})
        order_id = order["id"]; booking.gateway_order_id = order_id
        db.commit()
    return {"booking": booking_json(booking), "razorpay_key_id": settings.razorpay_key_id or None, "razorpay_order_id": order_id,
            "upi_id": settings.upi_id, "message": "Booking created. Complete payment to confirm."}

@app.post("/api/payments/verify")
def verify_payment(data: PaymentVerify, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.reference == data.booking_reference).first()
    if not booking: raise HTTPException(404, "Booking not found")
    if not booking.gateway_order_id or data.razorpay_order_id != booking.gateway_order_id:
        raise HTTPException(400, "Payment order does not match this booking")
    expected = hmac.new(settings.razorpay_key_secret.encode(), f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
    if not settings.razorpay_key_secret or not hmac.compare_digest(expected, data.razorpay_signature):
        raise HTTPException(400, "Payment signature verification failed")
    booking.gateway_payment_id = data.razorpay_payment_id
    booking.payment_status = "paid"; booking.booking_status = "confirmed"
    db.commit(); db.refresh(booking)
    pdf = booking_pdf(booking, booking.room_type.name)
    body = f"Your CROSSKEYS booking is confirmed. Reference: {booking.reference}. Room: {booking.room_type.name}. Check-in: {booking.check_in}. Check-out: {booking.check_out}. Total: INR {float(booking.amount):.2f}."
    try:
        send_email(booking.guest_email, "CROSSKEYS booking confirmation", body, pdf)
        if settings.admin_notification_email:
            send_email(settings.admin_notification_email, "New CROSSKEYS booking confirmed", body, pdf)
    except Exception:
        # Payment stays confirmed; email failures should be handled through operational logs/retries.
        pass
    return {"message": "Payment was completed and booking was confirmed.", "booking": booking_json(booking)}

@app.post("/api/admin/bookings/{reference}/confirm-upi-payment")
def admin_confirm_upi_payment(reference: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    """Admin-only manual confirmation after independently verifying funds arrived."""
    booking = db.query(Booking).filter(Booking.reference == reference).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.payment_status == "paid" and booking.booking_status == "confirmed":
        return {"booking": booking_json(booking), "message": "Booking is already confirmed."}
    if booking.gateway_order_id is not None or booking.booking_status != "pending_payment" or booking.payment_status != "pending":
        raise HTTPException(400, "Only pending manual UPI bookings can be confirmed")
    # Do not accept a customer claim as proof: admin must verify the credit in the bank/UPI app.
    booking.payment_status = "paid"
    booking.booking_status = "confirmed"
    db.commit(); db.refresh(booking)
    pdf = booking_pdf(booking, booking.room_type.name)
    body = f"Your CROSSKEYS booking is confirmed. Reference: {booking.reference}. Room: {booking.room_type.name}. Check-in: {booking.check_in}. Check-out: {booking.check_out}. Total: INR {float(booking.amount):.2f}."
    try:
        send_email(booking.guest_email, "CROSSKEYS booking confirmation", body, pdf)
        if settings.admin_notification_email:
            send_email(settings.admin_notification_email, "CROSSKEYS booking confirmed (manual UPI)", body, pdf)
    except Exception:
        pass
    return {"booking": booking_json(booking), "message": "UPI payment manually verified and booking confirmed."}

@app.post("/api/admin/login")
def admin_login(data: LoginIn):
    import hmac as _hmac
    if data.username != settings.admin_username or not _hmac.compare_digest(data.password, settings.admin_password):
        raise HTTPException(401, "Invalid username or password")
    return {"access_token": make_token(data.username), "token_type": "bearer"}

@app.get("/api/admin/bookings")
def admin_bookings(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    return [booking_json(b) for b in db.query(Booking).order_by(Booking.created_at.desc()).all()]

@app.post("/api/admin/rooms")
def admin_add_room(data: RoomCreate, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    if db.query(RoomType).filter(RoomType.name.ilike(data.name)).first(): raise HTTPException(409, "Room type already exists")
    room = RoomType(name=data.name, description=data.description, max_capacity=data.max_capacity, price_per_night=Decimal(str(data.price_per_night)), active=data.active)
    db.add(room); db.commit(); db.refresh(room)
    return room_json(room)

@app.patch("/api/admin/rooms/{room_id}")
def admin_update_room(room_id: int, data: RoomCreate, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    room = db.get(RoomType, room_id)
    if not room: raise HTTPException(404, "Room type not found")
    room.name=data.name; room.description=data.description; room.max_capacity=data.max_capacity
    room.price_per_night=Decimal(str(data.price_per_night)); room.active=data.active
    db.commit(); db.refresh(room)
    return room_json(room)


@app.post("/api/admin/rooms/{room_id}/images")
async def admin_upload_images(
    room_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    room = db.get(RoomType, room_id)
    if not room:
        raise HTTPException(404, "Room type not found")

    allowed = {"image/jpeg", "image/png", "image/webp"}
    current = image_list(room)

    for file in files:
        if file.content_type not in allowed:
            raise HTTPException(400, "Only JPG, PNG or WEBP images are allowed")

        content = await file.read()
        if not content or len(content) > 20 * 1024 * 1024:
            raise HTTPException(400, "Each image must be non-empty and 20 MB or smaller")

        try:
            image_url = upload_to_cloudinary(content, "rooms")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, "Unable to upload image to Cloudinary")

        current.append(image_url)

    set_image_list(room, current)
    db.commit()
    db.refresh(room)

    return room_json(room)
   


@app.delete("/api/admin/rooms/{room_id}/images/{image_index}")
def admin_delete_room_image(
    room_id: int,
    image_index: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    room = db.get(RoomType, room_id)
    if not room:
        raise HTTPException(404, "Room type not found")

    images = image_list(room)
    if image_index < 0 or image_index >= len(images):
        raise HTTPException(404, "Room image not found")

    removed = images.pop(image_index)
    set_image_list(room, images)
    db.commit()

    if removed.startswith("/uploads/"):
        image_path = removed.removeprefix("/uploads/")
        if image_path and Path(image_path).name == image_path:
            try:
                (Path(settings.upload_dir) / image_path).unlink(missing_ok=True)
            except OSError:
                pass

    return room_json(room)



@app.post("/api/admin/bookings/{reference}/cancel")
def admin_cancel(reference: str, reason: str = "no_prior_notice", db: Session = Depends(get_db), _: str = Depends(require_admin)):
    booking = db.query(Booking).filter(Booking.reference == reference).first()
    if not booking: raise HTTPException(404, "Booking not found")
    if booking.booking_status != "confirmed" or booking.payment_status != "paid": raise HTTPException(400, "Only paid, confirmed bookings can be cancelled")
    if reason == "arrival_date": pct = Decimal("0.80")
    elif reason == "one_day_before": pct = Decimal("0.20")
    elif reason == "no_prior_notice": pct = Decimal("1.00")
    else: raise HTTPException(400, "Unknown cancellation policy")
    fee = (Decimal(str(booking.amount)) * pct).quantize(Decimal("0.01"))
    refund = max(Decimal("0.00"), Decimal(str(booking.amount)) - fee)
    booking.cancellation_fee = fee; booking.refund_amount = refund
    booking.booking_status = "cancelled"; booking.payment_status = "refund_pending" if refund > 0 else "retained"
    # Refund must be initiated/confirmed with payment gateway; this starter does not falsely claim a refund was sent.
    db.commit(); db.refresh(booking)
    return {"booking": booking_json(booking), "cancellation_fee_percent": int(pct*100),
            "message": "Booking cancelled. Refund amount calculated; gateway refund must be initiated and confirmed separately.",
            "refund_initiated": False}

@app.get("/api/admin/settings")
def admin_settings(_: str = Depends(require_admin)):
    return {"hotel_name": settings.hotel_name, "hotel_address": settings.hotel_address, "hotel_phone": settings.hotel_phone,
            "admin_notification_email": settings.admin_notification_email}

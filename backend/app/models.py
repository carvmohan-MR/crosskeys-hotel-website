from datetime import datetime, date
from sqlalchemy import String, Integer, Boolean, Date, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

class RoomType(Base):
    __tablename__ = "room_types"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    max_capacity: Mapped[int] = mapped_column(Integer)
    standard_capacity: Mapped[int] = mapped_column(Integer, default=2)
    inventory_count: Mapped[int] = mapped_column(Integer, default=1)
    extra_guest_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=750)
    price_per_night: Mapped[float] = mapped_column(Numeric(10, 2))
    image_urls: Mapped[str] = mapped_column(Text, default="[]")  # JSON string
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    room_type_id: Mapped[int] = mapped_column(ForeignKey("room_types.id"))
    guest_name: Mapped[str] = mapped_column(String(150))
    guest_email: Mapped[str] = mapped_column(String(254))
    guest_phone: Mapped[str] = mapped_column(String(30))
    guests: Mapped[int] = mapped_column(Integer)
    check_in: Mapped[date] = mapped_column(Date)
    check_out: Mapped[date] = mapped_column(Date)
    nights: Mapped[int] = mapped_column(Integer)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    payment_status: Mapped[str] = mapped_column(String(20), default="pending")
    booking_status: Mapped[str] = mapped_column(String(20), default="pending_payment")
    gateway_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cancellation_fee: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    refund_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    room_type = relationship("RoomType")


class SiteImage(Base):
    __tablename__ = "site_images"
    id: Mapped[int] = mapped_column(primary_key=True)
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    section: Mapped[str] = mapped_column(String(30), default="slideshow", index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SiteSetting(Base):
    __tablename__ = "site_settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(500), nullable=False)

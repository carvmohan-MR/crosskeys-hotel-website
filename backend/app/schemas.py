from datetime import date
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator

class BookingCreate(BaseModel):
    room_type_id: int
    guest_name: str = Field(min_length=2, max_length=150)
    guest_email: EmailStr
    guest_phone: str = Field(min_length=7, max_length=30)
    guests: int = Field(ge=1, le=10)
    check_in: date
    check_out: date

    @model_validator(mode="after")
    def valid_dates(self):
        if self.check_out <= self.check_in:
            raise ValueError("Check-out must be after check-in")
        return self

class RoomCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = ""
    max_capacity: int = Field(ge=1, le=20)
    standard_capacity: int = Field(default=2, ge=1, le=20)
    inventory_count: int = Field(default=1, ge=1, le=100)
    extra_guest_fee: float = Field(default=750, ge=0)
    price_per_night: float = Field(gt=0)
    active: bool = True

class RoomOut(BaseModel):
    id: int
    name: str
    description: str
    max_capacity: int
    price_per_night: float
    image_urls: list[str] = []
    active: bool
    model_config = ConfigDict(from_attributes=True)

class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)

class PaymentVerify(BaseModel):
    booking_reference: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

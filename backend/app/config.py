from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://crosskeys:change_this_password@localhost:5432/crosskeys"
    jwt_secret: str = "replace-me"
    admin_username: str = "admin"
    admin_password: str = "Crosskeys@123"
    frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"
    hotel_name: str = "CROSSKEYS"
    hotel_address: str = "Add your full hotel address, Puducherry, India"
    hotel_phone: str = "Add your phone number"
    admin_notification_email: str = "admin@crosskeys.example"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    upi_id: str = "crosskeys@okaxis"
    upload_dir: str = "uploads"
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .config import settings

bearer = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"

def make_token(subject: str):
    return jwt.encode({"sub": subject, "exp": datetime.now(timezone.utc) + timedelta(hours=8)}, settings.jwt_secret, algorithm=ALGORITHM)

def require_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Admin login required")
    try:
        data = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[ALGORITHM])
        if data.get("sub") != settings.admin_username:
            raise ValueError("wrong admin")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired admin session")
    return data["sub"]

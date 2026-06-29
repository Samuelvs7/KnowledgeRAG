from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    access_token: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    headers = {
        "apikey": settings.supabase_publishable_key,
        "Authorization": f"Bearer {credentials.credentials}",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.supabase_timeout_seconds) as client:
            response = await client.get(f"{settings.supabase_url.rstrip('/')}/auth/v1/user", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication service unavailable") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token")

    payload = response.json()
    user_id = payload.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token does not identify a user")
    return AuthenticatedUser(id=str(user_id), email=payload.get("email"), access_token=credentials.credentials)

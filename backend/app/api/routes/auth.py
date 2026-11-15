from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_token, get_current_user
from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit, reset_rate_limit
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    AccessToken,
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models import Organization, OrganizationMember, User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    MembershipSummary,
    MeResponse,
    RegisterRequest,
    UpdateProfileRequest,
    UserOut,
)
from app.services.sessions import revoke_token

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookie(response: Response, token: str, expires_at: datetime) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        expires=expires_at,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/")


async def _memberships(db: AsyncSession, user: User) -> list[MembershipSummary]:
    rows = await db.execute(
        select(Organization, OrganizationMember.role)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == user.id)
        .order_by(Organization.name)
    )
    return [
        MembershipSummary(
            organization_id=org.id,
            organization_name=org.name,
            organization_slug=org.slug,
            role=role,
        )
        for org, role in rows.all()
    ]


async def _issue_session(db: AsyncSession, user: User, response: Response) -> AuthResponse:
    token, claims = create_access_token(user.id, user.token_version)
    _set_session_cookie(response, token, claims.expires_at)
    return AuthResponse(
        user=UserOut.model_validate(user),
        memberships=await _memberships(db, user),
        access_token=token,
        expires_at=claims.expires_at,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    await enforce_rate_limit(f"register:{_client_ip(request)}", 20, 60 * 60)
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        last_login_at=datetime.now(UTC),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    await db.refresh(user)
    return await _issue_session(db, user, response)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    limit_key = f"login:{payload.email}:{_client_ip(request)}"
    await enforce_rate_limit(
        limit_key, settings.login_rate_limit, settings.login_rate_window_seconds
    )
    user = await db.scalar(select(User).where(User.email == payload.email))
    # Always run a bcrypt comparison so response time doesn't reveal whether
    # the email is registered.
    valid = verify_password(payload.password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if not user or not valid or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")

    await reset_rate_limit(limit_key)
    user.last_login_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(user)
    return await _issue_session(db, user, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, token: AccessToken = Depends(get_current_token)) -> Response:
    await revoke_token(token)
    _clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return MeResponse(user=UserOut.model_validate(user), memberships=await _memberships(db, user))


@router.patch("/me", response_model=UserOut)
async def update_profile(
    payload: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    user.full_name = payload.full_name
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/change-password", response_model=AuthResponse)
async def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """Changes the password and signs out every other session by bumping the
    token version. The caller receives a fresh session."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "New password must differ from the current one."
        )
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    await db.commit()
    await db.refresh(user)
    return await _issue_session(db, user, response)

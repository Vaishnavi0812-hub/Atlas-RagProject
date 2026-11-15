from fastapi import APIRouter

from app.api.routes import auth, health, invitations, organizations, workspaces

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(organizations.router)
api_router.include_router(workspaces.router)
api_router.include_router(invitations.router)

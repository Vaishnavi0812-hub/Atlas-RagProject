"""Role model.

Organization roles, highest first: owner > admin > editor > viewer.

Workspace access is derived from the organization role:
  * Owners and admins can access every workspace in their organization.
  * Workspaces with visibility "organization" are open to every member,
    who act there with their organization role.
  * "restricted" workspaces are visible only to owners/admins and to members
    explicitly granted access; an explicit grant can never exceed the
    member's organization role.
"""

from enum import StrEnum


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class WorkspaceVisibility(StrEnum):
    ORGANIZATION = "organization"
    RESTRICTED = "restricted"


ROLE_RANK: dict[Role, int] = {Role.VIEWER: 1, Role.EDITOR: 2, Role.ADMIN: 3, Role.OWNER: 4}

# Roles that can be granted on an individual workspace.
WORKSPACE_GRANTABLE_ROLES = (Role.EDITOR, Role.VIEWER)


def has_role(actual: Role | str, minimum: Role | str) -> bool:
    return ROLE_RANK[Role(actual)] >= ROLE_RANK[Role(minimum)]


def lower_role(a: Role | str, b: Role | str) -> Role:
    a, b = Role(a), Role(b)
    return a if ROLE_RANK[a] <= ROLE_RANK[b] else b


def workspace_capabilities(role: Role | str) -> dict[str, bool]:
    """Capabilities the UI can use to tailor controls. The API re-checks."""
    return {
        "can_view": True,
        "can_edit": has_role(role, Role.EDITOR),
        "can_manage": has_role(role, Role.ADMIN),
    }

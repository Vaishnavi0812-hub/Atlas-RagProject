import re

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 128


def validate_password_strength(password: str) -> str:
    """Enforce a reasonable baseline policy. Mirrored in the frontend meter."""
    problems = []
    if len(password) < PASSWORD_MIN_LENGTH:
        problems.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if len(password) > PASSWORD_MAX_LENGTH:
        problems.append(f"at most {PASSWORD_MAX_LENGTH} characters")
    if not re.search(r"[a-z]", password):
        problems.append("a lowercase letter")
    if not re.search(r"[A-Z]", password):
        problems.append("an uppercase letter")
    if not re.search(r"\d", password):
        problems.append("a number")
    if problems:
        raise ValueError("Password must contain " + ", ".join(problems) + ".")
    return password


def clean_name(value: str, field: str = "Name") -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError(f"{field} cannot be empty.")
    return value

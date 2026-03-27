from dataclasses import dataclass, field


@dataclass(slots=True)
class UserProfile:
    email: str
    display_name: str
    role_code: str
    service_code: str
    is_active: bool = True
    permissions: list[str] = field(default_factory=list)
from dataclasses import dataclass, field

from app.models.user_profile import UserProfile


@dataclass(slots=True)
class SessionContext:
    user: UserProfile
    auth_mode: str
    sharepoint_site_name: str
    sharepoint_library_name: str
    sharepoint_base_path: str
    dashboard_layout: str = "default"
    feature_flags: dict[str, bool] = field(default_factory=dict)

    @property
    def display_name(self) -> str:
        return self.user.display_name

    @property
    def email(self) -> str:
        return self.user.email

    @property
    def role_code(self) -> str:
        return self.user.role_code

    def has_permission(self, permission_code: str) -> bool:
        return permission_code in self.user.permissions
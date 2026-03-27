import os

from app.models.session_context import SessionContext
from app.models.user_profile import UserProfile
from app.repositories.security_repository import SecurityRepository


class SessionService:
    def __init__(self) -> None:
        self._session: SessionContext | None = None
        self._security_repository = SecurityRepository()

    def get_session(self) -> SessionContext | None:
        return self._session

    def clear_session(self) -> None:
        self._session = None

    def create_dev_session(self, email: str) -> SessionContext:
        normalized_email = email.strip().lower()

        user_row = self._security_repository.get_user_by_email(normalized_email)
        if user_row is None:
            raise ValueError(f"Utilisateur inconnu : {normalized_email}")

        if int(user_row["is_active"]) != 1:
            raise ValueError(f"Utilisateur inactif : {normalized_email}")

        permissions = self._security_repository.get_permissions_for_role(user_row["role_code"])
        sharepoint_context = self._security_repository.get_sharepoint_context(user_row["service_code"])

        user = UserProfile(
            email=user_row["email"],
            display_name=user_row["display_name"],
            role_code=user_row["role_code"],
            service_code=user_row["service_code"],
            is_active=bool(user_row["is_active"]),
            permissions=permissions,
        )

        session = SessionContext(
            user=user,
            auth_mode="dev",
            sharepoint_site_name=sharepoint_context["site_name"],
            sharepoint_library_name=sharepoint_context["library_name"],
            sharepoint_base_path=sharepoint_context["base_path"],
            dashboard_layout=self._resolve_dashboard_layout(user.role_code),
            feature_flags={
                "microsoft_auth_ready": False,
                "sharepoint_enabled": True,
            },
        )

        self._session = session
        return session

    def try_build_local_hint(self) -> str:
        username = os.environ.get("USERNAME", "").strip()
        if not username:
            return ""
        return username

    def get_available_dev_users(self) -> list[UserProfile]:
        rows = self._security_repository.list_active_users()

        users: list[UserProfile] = []
        for row in rows:
            permissions = self._security_repository.get_permissions_for_role(row["role_code"])
            users.append(
                UserProfile(
                    email=row["email"],
                    display_name=row["display_name"],
                    role_code=row["role_code"],
                    service_code=row["service_code"],
                    is_active=bool(row["is_active"]),
                    permissions=permissions,
                )
            )

        return users

    def _resolve_dashboard_layout(self, role_code: str) -> str:
        layouts = {
            "admin": "admin",
            "labo": "labo",
            "etudes": "etudes",
            "consult": "light",
        }
        return layouts.get(role_code, "default")
"""
app/services/affaire_dossier_service.py
Machine-aware dossier handling for affaires RST.
"""
from __future__ import annotations

import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from app.models.affaire_rst import AffaireRstRecord
from app.services.affaire_folder_naming import (
    build_affaire_folder_name_from_record,
    is_auto_affaire_folder_name,
)


DOSSIER_MODE_LOCAL = "local"
DOSSIER_MODE_PENDING = "pending"
DEFAULT_DOSSIER_MODE = DOSSIER_MODE_PENDING

DOSSIER_STATUS_PENDING = "pending"
DOSSIER_STATUS_READY = "ready"
DOSSIER_STATUS_MISSING = "missing"
DOSSIER_STATUS_OUTDATED = "outdated"
DOSSIER_STATUS_ROOT_MISSING = "root_missing"


@dataclass(slots=True)
class DossierInfo:
    mode: str
    status: str
    folder_name: str
    folder_path: str
    root_path: str
    exists: bool
    can_sync: bool
    can_open: bool
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "dossier_mode": self.mode,
            "dossier_status": self.status,
            "dossier_nom": self.folder_name,
            "dossier_path": self.folder_path,
            "dossier_root": self.root_path,
            "dossier_exists": self.exists,
            "dossier_can_sync": self.can_sync,
            "dossier_can_open": self.can_open,
            "dossier_message": self.message,
        }


@dataclass(slots=True)
class DossierSyncResult:
    success: bool
    action: str
    folder_name: str
    folder_path: str
    root_path: str
    error: str = ""


class AffaireDossierService:
    def get_mode(self) -> str:
        value = os.environ.get("RALAB_DOSSIER_MODE", DEFAULT_DOSSIER_MODE).strip().lower()
        if value in {DOSSIER_MODE_LOCAL, DOSSIER_MODE_PENDING}:
            return value
        return DEFAULT_DOSSIER_MODE

    def describe(self, record: AffaireRstRecord) -> DossierInfo:
        desired_name = self._desired_name(record)
        mode = self.get_mode()

        if mode != DOSSIER_MODE_LOCAL:
            return DossierInfo(
                mode=DOSSIER_MODE_PENDING,
                status=DOSSIER_STATUS_PENDING,
                folder_name=desired_name,
                folder_path=(record.dossier_path or "").strip(),
                root_path="",
                exists=False,
                can_sync=False,
                can_open=False,
                message="Creation locale differee jusqu'au poste de travail synchronise.",
            )

        root = self.get_root()
        current_path = self._resolve_current_path(record, root)

        if current_path and current_path.exists():
            is_ready = current_path.name == desired_name
            return DossierInfo(
                mode=DOSSIER_MODE_LOCAL,
                status=DOSSIER_STATUS_READY if is_ready else DOSSIER_STATUS_OUTDATED,
                folder_name=desired_name,
                folder_path=str(current_path),
                root_path=str(root) if root else "",
                exists=True,
                can_sync=not is_ready,
                can_open=True,
                message="" if is_ready else "Le dossier local doit etre renomme pour refleter la reference courante.",
            )

        if root is None:
            return DossierInfo(
                mode=DOSSIER_MODE_LOCAL,
                status=DOSSIER_STATUS_ROOT_MISSING,
                folder_name=desired_name,
                folder_path=(record.dossier_path or "").strip(),
                root_path="",
                exists=False,
                can_sync=False,
                can_open=False,
                message="Racine affaire introuvable. Definis RALAB_AFFAIRES_ROOT sur le poste de travail.",
            )

        return DossierInfo(
            mode=DOSSIER_MODE_LOCAL,
            status=DOSSIER_STATUS_MISSING,
            folder_name=desired_name,
            folder_path=str(root / desired_name) if desired_name else "",
            root_path=str(root),
            exists=False,
            can_sync=bool(desired_name),
            can_open=False,
            message="Le dossier d'affaire sera cree dans la racine synchronisee.",
        )

    def sync(self, record: AffaireRstRecord) -> DossierSyncResult:
        desired_name = self._desired_name(record)
        record.dossier_nom = desired_name

        if not desired_name:
            return DossierSyncResult(False, "invalid", "", "", "", "Nom de dossier cible vide.")

        mode = self.get_mode()
        if mode != DOSSIER_MODE_LOCAL:
            return DossierSyncResult(True, DOSSIER_STATUS_PENDING, desired_name, (record.dossier_path or "").strip(), "")

        root = self.get_root()
        if root is None:
            return DossierSyncResult(
                False,
                DOSSIER_STATUS_ROOT_MISSING,
                desired_name,
                (record.dossier_path or "").strip(),
                "",
                "Racine affaire introuvable. Definis RALAB_AFFAIRES_ROOT sur le poste de travail.",
            )

        current_path = self._resolve_current_path(record, root)
        target = root / desired_name

        if current_path and current_path.exists():
            if current_path.name == desired_name:
                record.dossier_path = str(current_path)
                return DossierSyncResult(True, "exists", desired_name, str(current_path), str(root))

            if target.exists() and target != current_path:
                return DossierSyncResult(
                    False,
                    DOSSIER_STATUS_OUTDATED,
                    desired_name,
                    str(current_path),
                    str(root),
                    f"Impossible de renommer : le dossier cible existe deja.\n{target}",
                )

            try:
                current_path.rename(target)
            except OSError as exc:
                return DossierSyncResult(False, "rename_failed", desired_name, str(current_path), str(root), str(exc))

            record.dossier_path = str(target)
            return DossierSyncResult(True, "renamed", desired_name, str(target), str(root))

        try:
            target.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            return DossierSyncResult(False, "create_failed", desired_name, str(target), str(root), str(exc))

        record.dossier_path = str(target)
        return DossierSyncResult(True, "created", desired_name, str(target), str(root))

    def open(self, record: AffaireRstRecord) -> DossierSyncResult:
        info = self.describe(record)
        if not info.can_open or not info.folder_path:
            return DossierSyncResult(False, "unavailable", info.folder_name, info.folder_path, info.root_path, "Dossier affaire introuvable.")

        path = Path(info.folder_path)
        if not path.exists():
            return DossierSyncResult(False, "missing", info.folder_name, info.folder_path, info.root_path, "Dossier affaire introuvable.")

        try:
            if sys.platform == "win32":
                os.startfile(str(path))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(path)])
            else:
                subprocess.Popen(["xdg-open", str(path)])
        except Exception as exc:
            return DossierSyncResult(False, "open_failed", info.folder_name, info.folder_path, info.root_path, str(exc))

        return DossierSyncResult(True, "opened", info.folder_name, info.folder_path, info.root_path)

    def get_root(self) -> Path | None:
        env_value = os.environ.get("RALAB_AFFAIRES_ROOT", "").strip()
        if env_value:
            candidate = Path(env_value)
            if candidate.exists() and candidate.is_dir():
                return candidate
            return None

        username = os.environ.get("USERNAME", "").strip()
        candidates = [
            Path.home() / "NGE" / "Labo ARS - Documents" / "Affaires RST",
            Path.home() / "NGE" / "Labo ARS - Documents" / "00 - Affaires RST",
            Path.home() / "OneDrive" / "NGE" / "Labo ARS - Documents" / "Affaires RST",
            Path.home() / "OneDrive" / "NGE" / "Labo ARS - Documents" / "00 - Affaires RST",
            Path("C:/Users") / username / "OneDrive - NGE" / "Labo ARS - Documents" / "Affaires RST",
            Path("C:/Users") / username / "OneDrive - NGE" / "Labo ARS - Documents" / "00 - Affaires RST",
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_dir():
                return candidate
        return None

    def get_root_info(self) -> dict:
        root = self.get_root()
        return {
            "mode": self.get_mode(),
            "root": str(root) if root else "",
            "exists": bool(root and root.exists()),
            "managed_by": "affaires",
        }

    @staticmethod
    def _desired_name(record: AffaireRstRecord) -> str:
        current_name = (record.dossier_nom or "").strip()
        if current_name and not is_auto_affaire_folder_name(current_name, record):
            return current_name
        return build_affaire_folder_name_from_record(record)

    @staticmethod
    def _resolve_current_path(record: AffaireRstRecord, root: Path | None) -> Path | None:
        path_text = (record.dossier_path or "").strip()
        if path_text:
            candidate = Path(path_text)
            if candidate.exists():
                return candidate

        if root is None:
            return None

        candidates: list[str] = []
        for name in (
            (record.dossier_nom or "").strip(),
            build_affaire_folder_name_from_record(record),
            (record.reference or "").strip(),
        ):
            if name and name not in candidates:
                candidates.append(name)

        for name in candidates:
            if not name:
                continue
            candidate = root / name
            if candidate.exists():
                return candidate

        return None
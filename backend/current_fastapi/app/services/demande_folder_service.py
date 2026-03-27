"""
app/services/demande_folder_service.py — RaLab4
Service de gestion des dossiers physiques des demandes RST.

Reproduit la logique de _sync_record_folder() du RaLab4/PySide6
mais côté serveur FastAPI, pour que le browser puisse déclencher
la création/renommage de dossiers via l'API.

Utilisation dans api/demandes.py :
    from app.services.demande_folder_service import DemandeFolderService
    svc = DemandeFolderService()
    result = svc.sync_folder(record)
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

from app.models.demande import DemandeRecord
from app.services.demande_folder_naming import build_demande_folder_name


class FolderSyncResult:
    def __init__(
        self,
        success: bool,
        folder_path: Optional[str] = None,
        folder_name: Optional[str] = None,
        action: str = "none",          # created | renamed | exists | skipped
        error: Optional[str] = None,
    ):
        self.success = success
        self.folder_path = folder_path
        self.folder_name = folder_name
        self.action = action
        self.error = error

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "folder_path": self.folder_path,
            "folder_name": self.folder_name,
            "action": self.action,
            "error": self.error,
        }


class DemandeFolderService:
    """
    Gère les dossiers physiques des demandes RST.
    Le chemin racine est résolu dans cet ordre :
      1. Variable d'environnement RALAB_DEMANDES_ROOT
      2. Dossier '01 - Demandes' à la racine du projet
      3. OneDrive NGE (chemin typique Windows)
    """

    def __init__(self, root: Optional[Path] = None):
        self._root = root  # override pour tests

    def get_root(self) -> Path:
        if self._root:
            return self._root

        # 1. Variable d'environnement
        env = os.environ.get("RALAB_DEMANDES_ROOT", "").strip()
        if env:
            p = Path(env)
            if p.exists():
                return p

        # 2. Chemin relatif au projet (api_main.py est à la racine)
        project_root = Path(__file__).resolve().parents[2]
        candidates = [
            project_root / "01 - Demandes",
            Path.home() / "NGE" / "Labo ARS - Documents" / "01 - Demandes",
            Path.home() / "OneDrive" / "NGE" / "Labo ARS - Documents" / "01 - Demandes",
            # Windows OneDrive typique
            Path("C:/Users") / os.environ.get("USERNAME", "") / "OneDrive - NGE" / "Labo ARS - Documents" / "01 - Demandes",
        ]
        for c in candidates:
            if c.exists() and c.is_dir():
                return c

        # Fallback : créer à côté du projet
        fallback = project_root / "01 - Demandes"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback

    # ── Méthode principale ────────────────────────────────────────────────────
    def sync_folder(self, record: DemandeRecord) -> FolderSyncResult:
        """
        Crée ou renomme le dossier physique correspondant à la demande.
        Met à jour record.dossier_nom_actuel et record.dossier_path_actuel.
        Retourne un FolderSyncResult avec le résultat.
        """
        desired_name = (record.reference or "").strip()
        if not desired_name:
            return FolderSyncResult(False, error="Nom de dossier cible vide.")

        root = self.get_root()

        # Chemin actuel connu
        current_path = self._resolve_current_path(record, root)

        if current_path and current_path.exists():
            # Dossier existe déjà
            if current_path.name == desired_name:
                # Rien à faire
                record.dossier_nom_actuel = current_path.name
                record.dossier_path_actuel = str(current_path)
                return FolderSyncResult(
                    True,
                    folder_path=str(current_path),
                    folder_name=current_path.name,
                    action="exists",
                )
            else:
                # Renommer
                target = current_path.parent / desired_name
                if target.exists() and target != current_path:
                    return FolderSyncResult(
                        False,
                        error=f"Impossible de renommer : le dossier cible existe déjà.\n{target}",
                    )
                try:
                    current_path.rename(target)
                    record.dossier_nom_actuel = target.name
                    record.dossier_path_actuel = str(target)
                    return FolderSyncResult(
                        True,
                        folder_path=str(target),
                        folder_name=target.name,
                        action="renamed",
                    )
                except OSError as e:
                    return FolderSyncResult(False, error=str(e))
        else:
            # Créer le dossier
            target = root / desired_name
            try:
                target.mkdir(parents=True, exist_ok=True)
                record.dossier_nom_actuel = target.name
                record.dossier_path_actuel = str(target)
                return FolderSyncResult(
                    True,
                    folder_path=str(target),
                    folder_name=target.name,
                    action="created",
                )
            except OSError as e:
                return FolderSyncResult(False, error=str(e))

    def open_folder(self, record: DemandeRecord) -> FolderSyncResult:
        """
        Ouvre le dossier de la demande dans l'explorateur Windows/macOS/Linux.
        Utilisé via un endpoint GET /api/demandes/{uid}/open-folder.
        """
        path_str = (record.dossier_path_actuel or "").strip()
        if not path_str:
            # Essayer de trouver par nom
            root = self.get_root()
            name = (record.dossier_nom_actuel or record.reference or "").strip()
            if name:
                candidate = root / name
                if candidate.exists():
                    path_str = str(candidate)

        if not path_str or not Path(path_str).exists():
            return FolderSyncResult(False, error="Dossier introuvable.")

        path = Path(path_str)
        try:
            if sys.platform == "win32":
                os.startfile(str(path))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(path)])
            else:
                subprocess.Popen(["xdg-open", str(path)])
            return FolderSyncResult(
                True, folder_path=str(path), folder_name=path.name, action="opened"
            )
        except Exception as e:
            return FolderSyncResult(False, error=str(e))

    def folder_exists(self, record: DemandeRecord) -> bool:
        root = self.get_root()
        p = self._resolve_current_path(record, root)
        return p is not None and p.exists()

    # ── Helpers ───────────────────────────────────────────────────────────────
    @staticmethod
    def _resolve_current_path(record: DemandeRecord, root: Path) -> Optional[Path]:
        # 1. Chemin absolu connu
        if record.dossier_path_actuel:
            p = Path(record.dossier_path_actuel)
            if p.exists():
                return p

        # 2. Nom connu → chercher dans la racine
        for name in filter(None, [record.dossier_nom_actuel, record.reference]):
            p = root / name.strip()
            if p.exists():
                return p

        return None

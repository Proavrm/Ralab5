"""Server-side storage for affaire documents (quadro C)."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]
STORAGE_ROOT = PROJECT_ROOT / "storage"
DOCUMENTS_DIR = "documents"
PLANS_DIR = "Plans"


def normalize_affaire_reference(reference: str | None) -> str:
    return str(reference or "").strip().upper()


def sanitize_filename(name: str) -> str:
    base = Path(str(name or "")).name.strip()
    cleaned = re.sub(r"[^\w.\- ()]", "_", base).strip()
    return cleaned or "document"


def normalize_document_storage_path(raw_path: str | None, affaire_reference: str | None) -> str:
    path = str(raw_path or "").strip().replace("\\", "/").lstrip("/")
    if not path:
        return ""
    if path.lower().startswith("storage/"):
        path = path[len("storage/") :]
    if not affaire_reference:
        return path

    normalized_affaire = normalize_affaire_reference(affaire_reference)
    if not normalized_affaire or not path.lower().startswith("documents/"):
        return path

    parts = [segment for segment in path.split("/") if segment]
    if len(parts) < 3:
        return path

    tail = "/".join(parts[2:])
    return f"{DOCUMENTS_DIR}/{normalized_affaire}/{tail}"


def normalize_stored_path(stored_path: str | None) -> str:
    """Normalize legacy stored_path values read from the database."""
    path = str(stored_path or "").strip().replace("\\", "/").lstrip("/")
    if not path:
        return ""
    if path.lower().startswith("storage/"):
        path = path[len("storage/") :]
    if path.startswith("Documents/"):
        path = f"{DOCUMENTS_DIR}/{path[len('Documents/'):]}"
    if path.lower().startswith("plans/"):
        parts = [segment for segment in path.split("/") if segment]
        if len(parts) >= 2:
            tail = "/".join(parts[1:])
            return f"{PLANS_DIR}/{tail}"
    return path


def _unique_target_path(target_dir: Path, filename: str) -> Path:
    candidate = target_dir / filename
    if not candidate.exists():
        return candidate

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return target_dir / f"{stem}__{stamp}{suffix}"


def _save_to_affaire_folder(
    affaire_reference: str,
    content: bytes,
    original_filename: str,
    folder_name: str,
) -> dict:
    ref = normalize_affaire_reference(affaire_reference)
    if not ref:
        raise ValueError("Référence affaire manquante")
    if not content:
        raise ValueError("Fichier vide")

    filename = sanitize_filename(original_filename)
    target_dir = STORAGE_ROOT / folder_name / ref
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = _unique_target_path(target_dir, filename)
    target_path.write_bytes(content)

    stored_path = f"{folder_name}/{ref}/{target_path.name}"
    return {
        "stored_path": stored_path,
        "version": target_path.name,
        "url": f"/api/storage/{stored_path}",
    }


def save_affaire_document(affaire_reference: str, content: bytes, original_filename: str) -> dict:
    return _save_to_affaire_folder(affaire_reference, content, original_filename, DOCUMENTS_DIR)


def save_affaire_plan(affaire_reference: str, content: bytes, original_filename: str) -> dict:
    from app.services.plan_image_conversion_service import (
        convert_plan_bytes_to_png,
        is_plan_image_filename,
    )

    original_name = sanitize_filename(original_filename)
    converted = not is_plan_image_filename(original_name)
    image_content, image_name = convert_plan_bytes_to_png(content, original_name)
    if not converted and Path(image_name).suffix.lower() != Path(original_name).suffix.lower():
        converted = True

    saved = _save_to_affaire_folder(affaire_reference, image_content, image_name, PLANS_DIR)
    saved["converted_to_image"] = converted
    saved["original_filename"] = original_name if converted else None
    saved["storage_target"] = "plans"
    return saved


def _resolve_document_file(stored_path: str, affaire_reference: str | None = None) -> Path:
    path = normalize_stored_path(stored_path)
    lower = path.lower()
    if lower.startswith(f"{DOCUMENTS_DIR}/"):
        folder_name = DOCUMENTS_DIR
    elif lower.startswith(f"{PLANS_DIR.lower()}/"):
        folder_name = PLANS_DIR
    else:
        raise ValueError("Chemin document invalide")

    parts = [segment for segment in path.split("/") if segment and segment not in {".", ".."}]
    target = STORAGE_ROOT.joinpath(*parts)
    storage_root = STORAGE_ROOT.resolve()
    try:
        target.resolve().relative_to(storage_root)
    except ValueError as exc:
        raise ValueError("Chemin document invalide") from exc

    if affaire_reference:
        ref = normalize_affaire_reference(affaire_reference)
        affaire_dir = (STORAGE_ROOT / folder_name / ref).resolve()
        try:
            target.resolve().relative_to(affaire_dir)
        except ValueError as exc:
            raise ValueError("Fichier hors dossier affaire") from exc

    if not target.is_file():
        raise FileNotFoundError("Fichier introuvable")
    return target


def delete_affaire_document(stored_path: str, affaire_reference: str | None = None) -> bool:
    target = _resolve_document_file(stored_path, affaire_reference)
    target.unlink()
    return True


def write_affaire_document_bytes(
    stored_path: str,
    affaire_reference: str,
    content: bytes,
) -> dict:
    if not content:
        raise ValueError("Fichier vide")
    target = _resolve_document_file(stored_path, affaire_reference)
    target.write_bytes(content)
    normalized = normalize_stored_path(stored_path)
    return {
        "stored_path": normalized,
        "version": target.name,
        "url": f"/api/storage/{normalized}",
    }


def write_affaire_sidecar_json(
    stored_path: str,
    affaire_reference: str,
    payload: dict,
) -> str:
    import json

    path = normalize_stored_path(stored_path)
    if path.lower().endswith(".png"):
        sidecar = path[:-4] + ".site_plan.json"
    else:
        sidecar = f"{path}.site_plan.json"

    ref = normalize_affaire_reference(affaire_reference)
    parts = [segment for segment in sidecar.split("/") if segment]
    target = STORAGE_ROOT.joinpath(*parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return sidecar


def read_affaire_sidecar_json(stored_path: str, affaire_reference: str | None = None) -> dict | None:
    import json

    path = normalize_stored_path(stored_path)
    if path.lower().endswith(".png"):
        sidecar = path[:-4] + ".site_plan.json"
    else:
        sidecar = f"{path}.site_plan.json"

    parts = [segment for segment in sidecar.split("/") if segment]
    target = STORAGE_ROOT.joinpath(*parts)
    storage_root = STORAGE_ROOT.resolve()
    try:
        target.resolve().relative_to(storage_root)
    except ValueError:
        return None

    if affaire_reference:
        ref = normalize_affaire_reference(affaire_reference)
        affaire_dir = (STORAGE_ROOT / DOCUMENTS_DIR / ref).resolve()
        try:
            target.resolve().relative_to(affaire_dir)
        except ValueError:
            return None

    if not target.is_file():
        return None

    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


PLAN_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def list_affaire_plan_images(affaire_reference: str | None) -> dict:
    ref = normalize_affaire_reference(affaire_reference)
    if not ref:
        return {
            "affaire_reference": "",
            "directory": "",
            "files": [],
        }

    plans_dir = STORAGE_ROOT / PLANS_DIR / ref
    if not plans_dir.exists() or not plans_dir.is_dir():
        return {
            "affaire_reference": ref,
            "directory": f"{PLANS_DIR}/{ref}",
            "files": [],
        }

    files: list[dict] = []
    for item in plans_dir.rglob("*"):
        if not item.is_file():
            continue
        if item.suffix.lower() not in PLAN_IMAGE_EXTENSIONS:
            continue
        rel_to_affaire = item.relative_to(plans_dir).as_posix()
        rel_storage_path = f"{PLANS_DIR}/{ref}/{rel_to_affaire}"
        stat = item.stat()
        files.append({
            "name": item.name,
            "path": rel_storage_path,
            "relative_path": rel_to_affaire,
            "size_bytes": int(stat.st_size),
            "updated_at": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        })

    files.sort(key=lambda row: (row["relative_path"].lower(), row["name"].lower()))
    return {
        "affaire_reference": ref,
        "directory": f"{PLANS_DIR}/{ref}",
        "files": files,
    }

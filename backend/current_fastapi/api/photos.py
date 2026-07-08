"""
api/photos.py

Photo serving endpoint for essais (DE, SC, etc).
Serves images from storage directory.
"""

from datetime import datetime
from pathlib import Path
import json
import re
import sqlite3

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from fastapi.responses import FileResponse

from app.core.database import get_db_path
from app.core.wbs import build_sc_wbs_short, join_wbs_display
from app.services.feuille_rapport_validation_service import (
    assert_feuille_rapport_editable,
    parse_resultats_payload,
)

router = APIRouter(prefix="/api/photos", tags=["Photos"])

# Base storage path where photos are organized
STORAGE_ROOT = Path(__file__).resolve().parents[3] / "storage"
PHOTO_EXTENSIONS = [".jpg", ".JPG", ".jpeg", ".JPEG", ".png", ".PNG"]
PHOTO_EXTENSIONS_SET = {ext.lower() for ext in PHOTO_EXTENSIONS}


class EssaiPhotoPrimaryPayload(BaseModel):
    stored_name: str


class FeuillePhotoPrimaryPayload(BaseModel):
    stored_name: str


def _get_photos_root() -> Path:
    return STORAGE_ROOT / "essais_photos"


def _get_feuilles_photos_root() -> Path:
    return STORAGE_ROOT / "feuilles_photos"


def _metadata_filename(essai_id: int) -> str:
    return f"essai_{essai_id}.photos.json"


def _load_photo_metadata(metadata_path: Path) -> list[dict]:
    if not metadata_path.exists() or not metadata_path.is_file():
        return []
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _save_photo_metadata(metadata_path: Path, entries: list[dict]) -> None:
    metadata_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")


def _collect_legacy_entries(essai_id: int, affaire_dir: Path, metadata_entries: list[dict]) -> list[dict]:
    known_names = {str(item.get("stored_name") or "") for item in metadata_entries}
    legacy_entries: list[dict] = []
    for ext in PHOTO_EXTENSIONS:
        file_path = affaire_dir / f"essai_{essai_id}{ext}"
        if not file_path.exists() or not file_path.is_file() or file_path.name in known_names:
            continue
        legacy_entries.append({
            "stored_name": file_path.name,
            "original_name": file_path.name,
            "created_at": datetime.fromtimestamp(file_path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "is_primary": not metadata_entries and not legacy_entries,
        })
    return legacy_entries


def _list_essai_photo_entries(essai_id: int) -> list[dict]:
    photos_root = _get_photos_root()
    if not photos_root.exists():
        return []

    entries: list[dict] = []
    for affaire_dir in photos_root.iterdir():
        if not affaire_dir.is_dir():
            continue
        metadata_path = affaire_dir / _metadata_filename(essai_id)
        metadata_entries = _load_photo_metadata(metadata_path)
        all_entries = metadata_entries + _collect_legacy_entries(essai_id, affaire_dir, metadata_entries)
        for item in all_entries:
            stored_name = str(item.get("stored_name") or "").strip()
            if not stored_name:
                continue
            file_path = affaire_dir / stored_name
            if not file_path.exists() or not file_path.is_file():
                continue
            entries.append({
                "affaire": affaire_dir.name,
                "stored_name": stored_name,
                "original_name": str(item.get("original_name") or stored_name),
                "created_at": str(item.get("created_at") or ""),
                "is_primary": bool(item.get("is_primary")),
                "path": file_path,
            })

    if entries and not any(item["is_primary"] for item in entries):
        entries[0]["is_primary"] = True
    entries.sort(key=lambda item: (0 if item["is_primary"] else 1, item["created_at"] or "", item["stored_name"]))
    return entries


def _serialize_gallery_item(essai_id: int, item: dict) -> dict:
    path = item["path"]
    return {
        "affaire": item["affaire"],
        "stored_name": item["stored_name"],
        "original_name": item["original_name"],
        "created_at": item["created_at"],
        "is_primary": item["is_primary"],
        "filename": path.name,
        "url": f"/api/photos/essai/{essai_id}/files/{path.name}",
    }


def _get_essai_photo(essai_id: int) -> Path | None:
    """
    Find photo file for a given essai_id.
    Searches in: /storage/essais_photos/{affaire}/essai_{essai_id}.*
    
    Returns: Path to image file if found, None otherwise
    """
    entries = _list_essai_photo_entries(essai_id)
    if not entries:
        return None
    primary = next((item for item in entries if item["is_primary"]), entries[0])
    return primary["path"]


def _get_essais_result_column(conn: sqlite3.Connection) -> str:
    cols = [row[1] for row in conn.execute("PRAGMA table_info(essais)").fetchall()]
    return "resultats_json" if "resultats_json" in cols else "resultats"


def _resolve_affaire_for_essai(essai_id: int, affaire_override: str | None = None) -> str:
    override = str(affaire_override or "").strip()
    if override:
        return override

    existing_photo = _get_essai_photo(essai_id)
    if existing_photo is not None:
        return existing_photo.parent.name

    try:
        with sqlite3.connect(str(get_db_path())) as conn:
            conn.row_factory = sqlite3.Row
            result_col = _get_essais_result_column(conn)
            row = conn.execute(
                f"SELECT COALESCE({result_col}, '') AS result_blob FROM essais WHERE id = ?",
                (essai_id,),
            ).fetchone()
    except Exception:
        row = None

    if row:
        try:
            payload = json.loads(row["result_blob"] or "{}")
        except Exception:
            payload = {}
        affaire = str((payload.get("meta") or {}).get("affaire_nge_raw") or "").strip()
        if affaire:
            return affaire

    return "UNKNOWN"


def _resolve_wbs_for_essai(essai_id: int) -> tuple[str, str]:
    try:
        with sqlite3.connect(str(get_db_path())) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """
                SELECT
                    a.reference AS affaire_reference,
                    d.reference AS demande_reference,
                    c.reference AS campagne_reference,
                    i.reference AS intervention_reference
                FROM essais e
                LEFT JOIN echantillons ech ON ech.id = e.echantillon_id
                LEFT JOIN interventions i ON i.id = e.intervention_id
                LEFT JOIN demandes d ON d.id = COALESCE(ech.demande_id, i.demande_id)
                LEFT JOIN campagnes c ON c.id = i.campagne_id
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                WHERE e.id = ?
                LIMIT 1
                """,
                (int(essai_id),),
            ).fetchone()
            sc_row = conn.execute(
                """
                SELECT
                    ft.reference AS sc_reference,
                    pt.point_code AS sc_code
                FROM points_terrain pt
                LEFT JOIN feuilles_terrain ft ON ft.serie_id = pt.serie_id
                WHERE pt.source_essai_id = ?
                ORDER BY pt.id ASC
                LIMIT 1
                """,
                (int(essai_id),),
            ).fetchone()
    except Exception:
        return "", ""

    row_data = dict(row) if row is not None else {}
    sc_data = dict(sc_row) if sc_row is not None else {}
    affaire_ref = str(row_data.get("affaire_reference") or "").strip()
    demande_ref = str(row_data.get("demande_reference") or "").strip()
    campagne_ref = str(row_data.get("campagne_reference") or "").strip()
    intervention_ref = str(row_data.get("intervention_reference") or "").strip()
    sc_ref = str(sc_data.get("sc_reference") or "").strip()
    sc_code = str(sc_data.get("sc_code") or "").strip()
    if sc_ref and sc_code:
        short = build_sc_wbs_short(affaire_ref, demande_ref, campagne_ref, intervention_ref, sc_ref, sc_code)
        full = join_wbs_display(affaire_ref, demande_ref, campagne_ref, intervention_ref, sc_ref, sc_code)
        return full, short

    full = join_wbs_display(affaire_ref, demande_ref, campagne_ref, intervention_ref, f"ESSAI-{essai_id}")
    short = full.replace(" > ", "_").replace(" ", "_")
    short = "".join(ch if ch.isalnum() or ch in {"_", "-", "."} else "_" for ch in short).strip("._")
    return full, short


def _next_photo_index(existing_names: list[str], prefix: str) -> int:
    max_idx = 0
    for name in existing_names:
        if not name.startswith(prefix):
            continue
        rest = name[len(prefix):]
        match = re.match(r"^(\d+)", rest)
        if match:
            max_idx = max(max_idx, int(match.group(1)))
    return max_idx + 1


def _validate_stored_photo_name(stored_name: str) -> str:
    name = str(stored_name or "").strip()
    if not name or Path(name).name != name:
        raise HTTPException(status_code=400, detail="Nom de photo invalide.")
    if Path(name).suffix.lower() not in PHOTO_EXTENSIONS_SET:
        raise HTTPException(status_code=400, detail="Format de photo invalide.")
    return name


def _replace_metadata_photo_file(
    *,
    photos_root: Path,
    metadata_path_builder,
    entity_id: int,
    stored_name: str,
    content: bytes,
    original_name: str = "",
    list_entries_builder=None,
) -> tuple[str, str] | None:
    validated = _validate_stored_photo_name(stored_name)
    for affaire_dir in photos_root.iterdir() if photos_root.exists() else []:
        if not affaire_dir.is_dir():
            continue
        metadata_path = metadata_path_builder(affaire_dir, entity_id)
        metadata_entries = _load_photo_metadata(metadata_path)
        if metadata_entries:
            for item in metadata_entries:
                if str(item.get("stored_name") or "") != validated:
                    continue
                file_path = affaire_dir / validated
                with open(file_path, "wb") as out:
                    out.write(content)
                item["created_at"] = _resolve_upload_time(file_path)
                if original_name:
                    item["original_name"] = original_name
                _save_photo_metadata(metadata_path, metadata_entries)
                return affaire_dir.name, validated

    if list_entries_builder is not None:
        for item in list_entries_builder(entity_id):
            if str(item.get("stored_name") or "") != validated:
                continue
            file_path = item.get("path")
            if file_path is None:
                continue
            file_path = Path(file_path)
            if not file_path.exists() or not file_path.is_file():
                continue
            with open(file_path, "wb") as out:
                out.write(content)
            affaire_dir = file_path.parent
            metadata_path = metadata_path_builder(affaire_dir, entity_id)
            metadata_entries = _load_photo_metadata(metadata_path)
            updated = False
            for entry in metadata_entries:
                if str(entry.get("stored_name") or "") != validated:
                    continue
                entry["created_at"] = _resolve_upload_time(file_path)
                if original_name:
                    entry["original_name"] = original_name
                updated = True
                break
            if not updated:
                metadata_entries.append({
                    "stored_name": validated,
                    "original_name": original_name or validated,
                    "created_at": _resolve_upload_time(file_path),
                    "is_primary": not metadata_entries,
                })
            _save_photo_metadata(metadata_path, metadata_entries)
            return affaire_dir.name, validated

    return None


def _set_primary_photo(essai_id: int, stored_name: str) -> dict:
    photos_root = _get_photos_root()
    target_item: dict | None = None
    updated_gallery: list[dict] = []

    for affaire_dir in photos_root.iterdir() if photos_root.exists() else []:
        if not affaire_dir.is_dir():
            continue
        metadata_path = affaire_dir / _metadata_filename(essai_id)
        metadata_entries = _load_photo_metadata(metadata_path)
        if not metadata_entries:
            legacy_entries = _collect_legacy_entries(essai_id, affaire_dir, [])
            metadata_entries = legacy_entries
        if not metadata_entries:
            continue

        changed = False
        for item in metadata_entries:
            item_name = str(item.get("stored_name") or "")
            is_primary = item_name == stored_name
            if item.get("is_primary") != is_primary:
                item["is_primary"] = is_primary
                changed = True
            if is_primary:
                target_item = {
                    "affaire": affaire_dir.name,
                    "stored_name": item_name,
                    "original_name": str(item.get("original_name") or item_name),
                    "created_at": str(item.get("created_at") or ""),
                    "is_primary": True,
                    "path": affaire_dir / item_name,
                }
        if changed or not metadata_path.exists():
            _save_photo_metadata(metadata_path, metadata_entries)

    if target_item is None:
        raise HTTPException(status_code=404, detail="Photo introuvable pour cet essai.")

    updated_gallery = [_serialize_gallery_item(essai_id, item) for item in _list_essai_photo_entries(essai_id)]
    return {
        "ok": True,
        "essai_id": essai_id,
        "selected": _serialize_gallery_item(essai_id, target_item),
        "photos": updated_gallery,
    }


def _delete_photo_entry(essai_id: int, stored_name: str) -> dict:
    photos_root = _get_photos_root()
    deleted = False

    for affaire_dir in photos_root.iterdir() if photos_root.exists() else []:
        if not affaire_dir.is_dir():
            continue
        metadata_path = affaire_dir / _metadata_filename(essai_id)
        metadata_entries = _load_photo_metadata(metadata_path)
        if not metadata_entries:
            metadata_entries = _collect_legacy_entries(essai_id, affaire_dir, [])
        if not metadata_entries:
            continue

        remaining_entries: list[dict] = []
        changed = False
        for item in metadata_entries:
            item_name = str(item.get("stored_name") or "")
            if item_name != stored_name:
                remaining_entries.append(item)
                continue
            file_path = affaire_dir / item_name
            if file_path.exists() and file_path.is_file():
                try:
                    file_path.unlink()
                except Exception:
                    pass
            deleted = True
            changed = True

        if not changed:
            continue

        if remaining_entries and not any(bool(item.get("is_primary")) for item in remaining_entries):
            remaining_entries[0]["is_primary"] = True

        if remaining_entries:
            _save_photo_metadata(metadata_path, remaining_entries)
        elif metadata_path.exists():
            try:
                metadata_path.unlink()
            except Exception:
                pass

    if not deleted:
        raise HTTPException(status_code=404, detail="Photo introuvable pour cet essai.")

    updated_gallery = [_serialize_gallery_item(essai_id, item) for item in _list_essai_photo_entries(essai_id)]
    return {
        "ok": True,
        "essai_id": essai_id,
        "photos": updated_gallery,
    }


@router.get("/essai/{essai_id}")
def get_essai_photo(essai_id: int):
    """
    Get the photo for a specific essai by ID.
    Path: /api/photos/essai/{essai_id}
    
    Returns: JPEG/PNG image file or 404 if not found
    """
    photo_file = _get_essai_photo(essai_id)
    
    if not photo_file:
        raise HTTPException(
            status_code=404,
            detail=f"Photo for essai {essai_id} not found"
        )
    
    return FileResponse(
        path=photo_file,
        media_type="image/jpeg" if photo_file.suffix.lower() in [".jpg", ".jpeg"] else "image/png",
        filename=photo_file.name,
    )


@router.get("/essai/{essai_id}/gallery")
def get_essai_photo_gallery(essai_id: int):
    items = [_serialize_gallery_item(essai_id, item) for item in _list_essai_photo_entries(essai_id)]
    return {
        "essai_id": essai_id,
        "photos": items,
    }


@router.get("/essai/{essai_id}/files/{stored_name}")
def get_essai_photo_file(essai_id: int, stored_name: str):
    items = _list_essai_photo_entries(essai_id)
    match = next((item for item in items if item["stored_name"] == stored_name), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Photo introuvable pour cet essai.")
    photo_file = match["path"]
    return FileResponse(
        path=photo_file,
        media_type="image/jpeg" if photo_file.suffix.lower() in [".jpg", ".jpeg"] else "image/png",
        filename=match["original_name"] or photo_file.name,
    )


@router.post("/essai/{essai_id}")
async def upload_essai_photo(
    essai_id: int,
    file: UploadFile = File(...),
    affaire: str = Form(""),
    make_primary: bool = Form(True),
    coupe_code: str = Form(""),
    replace_stored_name: str = Form(""),
):
    """
    Upload/replace photo for an essai.
    Path: /api/photos/essai/{essai_id}
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=400, detail="Format non supporté (jpg, jpeg, png).")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fichier photo vide.")

    replace_name = str(replace_stored_name or "").strip()
    if replace_name:
        replaced = _replace_metadata_photo_file(
            photos_root=_get_photos_root(),
            metadata_path_builder=lambda affaire_dir, entity_id: affaire_dir / _metadata_filename(entity_id),
            entity_id=essai_id,
            stored_name=replace_name,
            content=content,
            original_name=str(file.filename or "").strip(),
            list_entries_builder=_list_essai_photo_entries,
        )
        if replaced is None:
            raise HTTPException(status_code=404, detail="Photo introuvable pour cet essai.")
        affaire_name, target_name = replaced
        gallery_items = [_serialize_gallery_item(essai_id, item) for item in _list_essai_photo_entries(essai_id)]
        selected = next((item for item in gallery_items if item["stored_name"] == target_name), None)
        return {
            "ok": True,
            "essai_id": essai_id,
            "affaire": affaire_name,
            "filename": target_name,
            "photo": selected,
            "photos": gallery_items,
            "replaced": True,
        }

    affaire_name = _resolve_affaire_for_essai(essai_id, affaire_override=affaire)
    target_dir = STORAGE_ROOT / "essais_photos" / affaire_name
    target_dir.mkdir(parents=True, exist_ok=True)

    metadata_path = target_dir / _metadata_filename(essai_id)
    metadata_entries = _load_photo_metadata(metadata_path)
    _, wbs_short = _resolve_wbs_for_essai(essai_id)
    coupe_token = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in str(coupe_code or "").strip())
    coupe_token = coupe_token.strip("._")
    base_prefix = wbs_short or f"essai_{essai_id}"
    prefix = f"{base_prefix}__{coupe_token}__F" if coupe_token else f"{base_prefix}__F"
    existing_names = [str(item.get("stored_name") or "") for item in metadata_entries if str(item.get("stored_name") or "")]
    photo_idx = _next_photo_index(existing_names, prefix)
    target_name = f"{prefix}{photo_idx:02d}{suffix}"
    target_path = target_dir / target_name
    with open(target_path, "wb") as out:
        out.write(content)

    if make_primary:
        for item in metadata_entries:
            item["is_primary"] = False
    metadata_entries.append({
        "stored_name": target_name,
        "original_name": file.filename or target_name,
        "created_at": _resolve_upload_time(target_path),
        "is_primary": bool(make_primary or not metadata_entries),
    })
    _save_photo_metadata(metadata_path, metadata_entries)

    gallery_items = [_serialize_gallery_item(essai_id, item) for item in _list_essai_photo_entries(essai_id)]
    selected = next((item for item in gallery_items if item["stored_name"] == target_name), None)

    return {
        "ok": True,
        "essai_id": essai_id,
        "affaire": affaire_name,
        "filename": target_name,
        "photo": selected,
        "photos": gallery_items,
    }


def _resolve_upload_time(target_path: Path) -> str:
    try:
        return datetime.fromtimestamp(target_path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@router.patch("/essai/{essai_id}/primary")
def set_essai_photo_primary(essai_id: int, body: EssaiPhotoPrimaryPayload):
    stored_name = str(body.stored_name or "").strip()
    if not stored_name or Path(stored_name).name != stored_name:
        raise HTTPException(status_code=400, detail="Nom de photo invalide.")
    if Path(stored_name).suffix.lower() not in PHOTO_EXTENSIONS_SET:
        raise HTTPException(status_code=400, detail="Format de photo invalide.")
    return _set_primary_photo(essai_id, stored_name)


@router.delete("/essai/{essai_id}/files/{stored_name}")
def delete_essai_photo(essai_id: int, stored_name: str):
    stored_name = str(stored_name or "").strip()
    if not stored_name or Path(stored_name).name != stored_name:
        raise HTTPException(status_code=400, detail="Nom de photo invalide.")
    if Path(stored_name).suffix.lower() not in PHOTO_EXTENSIONS_SET:
        raise HTTPException(status_code=400, detail="Format de photo invalide.")
    return _delete_photo_entry(essai_id, stored_name)


def _feuille_metadata_filename(feuille_id: int) -> str:
    return f"feuille_{feuille_id}.photos.json"


def _list_feuille_photo_entries(feuille_id: int) -> list[dict]:
    photos_root = _get_feuilles_photos_root()
    if not photos_root.exists():
        return []

    entries: list[dict] = []
    for affaire_dir in photos_root.iterdir():
        if not affaire_dir.is_dir():
            continue
        metadata_path = affaire_dir / _feuille_metadata_filename(feuille_id)
        metadata_entries = _load_photo_metadata(metadata_path)
        for item in metadata_entries:
            stored_name = str(item.get("stored_name") or "").strip()
            if not stored_name:
                continue
            file_path = affaire_dir / stored_name
            if not file_path.exists() or not file_path.is_file():
                continue
            entries.append({
                "affaire": affaire_dir.name,
                "stored_name": stored_name,
                "original_name": str(item.get("original_name") or stored_name),
                "created_at": str(item.get("created_at") or ""),
                "is_primary": bool(item.get("is_primary")),
                "path": file_path,
            })

    if entries and not any(item["is_primary"] for item in entries):
        entries[0]["is_primary"] = True
    entries.sort(key=lambda item: (0 if item["is_primary"] else 1, item["created_at"] or "", item["stored_name"]))
    return entries


def _serialize_feuille_gallery_item(feuille_id: int, item: dict) -> dict:
    path = item["path"]
    return {
        "affaire": item["affaire"],
        "stored_name": item["stored_name"],
        "original_name": item["original_name"],
        "created_at": item["created_at"],
        "is_primary": item["is_primary"],
        "filename": path.name,
        "url": f"/api/photos/feuille/{feuille_id}/files/{path.name}",
    }


def _resolve_affaire_for_feuille(feuille_id: int, affaire_override: str | None = None) -> str:
    override = str(affaire_override or "").strip()
    if override:
        return override

    existing_entries = _list_feuille_photo_entries(feuille_id)
    if existing_entries:
        return existing_entries[0]["affaire"]

    try:
        with sqlite3.connect(str(get_db_path())) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """
                SELECT
                    a.reference AS affaire_reference,
                    d.reference AS demande_reference,
                    f.reference AS feuille_reference
                FROM feuilles_terrain f
                LEFT JOIN interventions i ON i.id = f.intervention_id
                LEFT JOIN demandes d ON d.id = COALESCE(f.demande_id, i.demande_id)
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                WHERE f.id = ?
                LIMIT 1
                """,
                (int(feuille_id),),
            ).fetchone()
    except Exception:
        row = None

    if row:
        affaire = str(row["affaire_reference"] or "").strip()
        if affaire:
            return affaire
        demande = str(row["demande_reference"] or "").strip()
        if demande:
            return demande

    return "UNKNOWN"


def _sanitize_photo_token(value: str) -> str:
    token = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in str(value or "").strip())
    return token.strip("._")


def _resolve_wbs_for_feuille_point(feuille_id: int, point_code: str = "") -> tuple[str, str]:
    try:
        with sqlite3.connect(str(get_db_path())) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """
                SELECT
                    f.reference AS sc_reference,
                    a.reference AS affaire_reference,
                    d.reference AS demande_reference,
                    c.reference AS campagne_reference,
                    i.reference AS intervention_reference
                FROM feuilles_terrain f
                LEFT JOIN interventions i ON i.id = f.intervention_id
                LEFT JOIN demandes d ON d.id = COALESCE(f.demande_id, i.demande_id)
                LEFT JOIN campagnes c ON c.id = COALESCE(f.campagne_id, i.campagne_id)
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                WHERE f.id = ?
                LIMIT 1
                """,
                (int(feuille_id),),
            ).fetchone()
    except Exception:
        return "", ""

    row_data = dict(row) if row is not None else {}
    affaire_ref = str(row_data.get("affaire_reference") or "").strip()
    demande_ref = str(row_data.get("demande_reference") or "").strip()
    campagne_ref = str(row_data.get("campagne_reference") or "").strip()
    intervention_ref = str(row_data.get("intervention_reference") or "").strip()
    sc_ref = str(row_data.get("sc_reference") or "").strip()
    sc_code = str(point_code or "").strip()
    if sc_ref and sc_code:
        short = build_sc_wbs_short(affaire_ref, demande_ref, campagne_ref, intervention_ref, sc_ref, sc_code)
        full = join_wbs_display(affaire_ref, demande_ref, campagne_ref, intervention_ref, sc_ref, sc_code)
        return full, short

    if sc_ref:
        short = build_sc_wbs_short(affaire_ref, demande_ref, campagne_ref, intervention_ref, sc_ref, sc_ref)
        full = join_wbs_display(affaire_ref, demande_ref, campagne_ref, intervention_ref, sc_ref, sc_ref)
        return full, short

    fallback = sc_ref or f"FEUILLE-{feuille_id}"
    full = join_wbs_display(affaire_ref, demande_ref, campagne_ref, intervention_ref, fallback)
    short = _sanitize_photo_token(full.replace(" > ", "_").replace(" ", "_")) or f"feuille_{feuille_id}"
    return full, short


def _build_sc_photo_prefix(*, wbs_short: str, feuille_id: int, coupe_code: str = "") -> str:
    base_prefix = wbs_short or f"feuille_{feuille_id}"
    coupe_token = _sanitize_photo_token(coupe_code)
    if coupe_token:
        return f"{base_prefix}__{coupe_token}__F"
    return f"{base_prefix}__F"


def _feuille_photo_prefix(feuille_id: int) -> str:
    _, wbs_short = _resolve_wbs_for_feuille_point(feuille_id)
    if wbs_short:
        return _build_sc_photo_prefix(wbs_short=wbs_short, feuille_id=feuille_id)
    return f"feuille_{feuille_id}__F"


def _assert_feuille_photos_editable(feuille_id: int) -> None:
    with sqlite3.connect(str(get_db_path())) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT resultats_json FROM feuilles_terrain WHERE id = ? LIMIT 1",
            (int(feuille_id),),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Feuille terrain introuvable.")
    assert_feuille_rapport_editable(
        parse_resultats_payload(row["resultats_json"]),
        action="modifier les photos de cette feuille",
    )


def _set_primary_feuille_photo(feuille_id: int, stored_name: str) -> dict:
    photos_root = _get_feuilles_photos_root()
    target_item: dict | None = None

    for affaire_dir in photos_root.iterdir() if photos_root.exists() else []:
        if not affaire_dir.is_dir():
            continue
        metadata_path = affaire_dir / _feuille_metadata_filename(feuille_id)
        metadata_entries = _load_photo_metadata(metadata_path)
        if not metadata_entries:
            continue

        changed = False
        for item in metadata_entries:
            item_name = str(item.get("stored_name") or "")
            is_primary = item_name == stored_name
            if item.get("is_primary") != is_primary:
                item["is_primary"] = is_primary
                changed = True
            if is_primary:
                target_item = {
                    "affaire": affaire_dir.name,
                    "stored_name": item_name,
                    "original_name": str(item.get("original_name") or item_name),
                    "created_at": str(item.get("created_at") or ""),
                    "is_primary": True,
                    "path": affaire_dir / item_name,
                }
        if changed:
            _save_photo_metadata(metadata_path, metadata_entries)

    if target_item is None:
        raise HTTPException(status_code=404, detail="Photo introuvable pour cette feuille.")

    updated_gallery = [_serialize_feuille_gallery_item(feuille_id, item) for item in _list_feuille_photo_entries(feuille_id)]
    return {
        "ok": True,
        "feuille_id": feuille_id,
        "selected": _serialize_feuille_gallery_item(feuille_id, target_item),
        "photos": updated_gallery,
    }


def _delete_feuille_photo_entry(feuille_id: int, stored_name: str) -> dict:
    photos_root = _get_feuilles_photos_root()
    deleted = False

    for affaire_dir in photos_root.iterdir() if photos_root.exists() else []:
        if not affaire_dir.is_dir():
            continue
        metadata_path = affaire_dir / _feuille_metadata_filename(feuille_id)
        metadata_entries = _load_photo_metadata(metadata_path)
        if not metadata_entries:
            continue

        remaining_entries: list[dict] = []
        changed = False
        for item in metadata_entries:
            item_name = str(item.get("stored_name") or "")
            if item_name != stored_name:
                remaining_entries.append(item)
                continue
            file_path = affaire_dir / item_name
            if file_path.exists() and file_path.is_file():
                try:
                    file_path.unlink()
                except Exception:
                    pass
            deleted = True
            changed = True

        if not changed:
            continue

        if remaining_entries and not any(bool(item.get("is_primary")) for item in remaining_entries):
            remaining_entries[0]["is_primary"] = True

        if remaining_entries:
            _save_photo_metadata(metadata_path, remaining_entries)
        elif metadata_path.exists():
            try:
                metadata_path.unlink()
            except Exception:
                pass

    if not deleted:
        raise HTTPException(status_code=404, detail="Photo introuvable pour cette feuille.")

    updated_gallery = [_serialize_feuille_gallery_item(feuille_id, item) for item in _list_feuille_photo_entries(feuille_id)]
    return {
        "ok": True,
        "feuille_id": feuille_id,
        "photos": updated_gallery,
    }


@router.get("/feuille/{feuille_id}/gallery")
def get_feuille_photo_gallery(feuille_id: int):
    items = [_serialize_feuille_gallery_item(feuille_id, item) for item in _list_feuille_photo_entries(feuille_id)]
    return {
        "feuille_id": feuille_id,
        "photos": items,
    }


@router.get("/feuille/{feuille_id}/files/{stored_name}")
def get_feuille_photo_file(feuille_id: int, stored_name: str):
    items = _list_feuille_photo_entries(feuille_id)
    match = next((item for item in items if item["stored_name"] == stored_name), None)
    if match is None:
        raise HTTPException(status_code=404, detail="Photo introuvable pour cette feuille.")
    photo_file = match["path"]
    return FileResponse(
        path=photo_file,
        media_type="image/jpeg" if photo_file.suffix.lower() in [".jpg", ".jpeg"] else "image/png",
        filename=match["original_name"] or photo_file.name,
    )


@router.post("/feuille/{feuille_id}")
async def upload_feuille_photo(
    feuille_id: int,
    file: UploadFile = File(...),
    affaire: str = Form(""),
    make_primary: bool = Form(False),
    coupe_code: str = Form(""),
    point_code: str = Form(""),
    replace_stored_name: str = Form(""),
):
    _assert_feuille_photos_editable(feuille_id)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=400, detail="Format non supporté (jpg, jpeg, png).")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Fichier photo vide.")

    replace_name = str(replace_stored_name or "").strip()
    if replace_name:
        replaced = _replace_metadata_photo_file(
            photos_root=_get_feuilles_photos_root(),
            metadata_path_builder=lambda affaire_dir, entity_id: affaire_dir / _feuille_metadata_filename(entity_id),
            entity_id=feuille_id,
            stored_name=replace_name,
            content=content,
            original_name=str(file.filename or "").strip(),
            list_entries_builder=_list_feuille_photo_entries,
        )
        if replaced is None:
            raise HTTPException(status_code=404, detail="Photo introuvable pour cette feuille.")
        affaire_name, target_name = replaced
        gallery_items = [_serialize_feuille_gallery_item(feuille_id, item) for item in _list_feuille_photo_entries(feuille_id)]
        selected = next((item for item in gallery_items if item["stored_name"] == target_name), None)
        return {
            "ok": True,
            "feuille_id": feuille_id,
            "affaire": affaire_name,
            "filename": target_name,
            "photo": selected,
            "photos": gallery_items,
            "replaced": True,
        }

    affaire_name = _resolve_affaire_for_feuille(feuille_id, affaire_override=affaire)
    target_dir = _get_feuilles_photos_root() / affaire_name
    target_dir.mkdir(parents=True, exist_ok=True)

    metadata_path = target_dir / _feuille_metadata_filename(feuille_id)
    metadata_entries = _load_photo_metadata(metadata_path)
    _, wbs_short = _resolve_wbs_for_feuille_point(feuille_id, point_code=point_code)
    prefix = _build_sc_photo_prefix(
        wbs_short=wbs_short,
        feuille_id=feuille_id,
        coupe_code=coupe_code,
    )
    existing_names = [str(item.get("stored_name") or "") for item in metadata_entries if str(item.get("stored_name") or "")]
    photo_idx = _next_photo_index(existing_names, prefix)
    target_name = f"{prefix}{photo_idx:02d}{suffix}"
    target_path = target_dir / target_name
    with open(target_path, "wb") as out:
        out.write(content)

    coupe_token = _sanitize_photo_token(coupe_code)
    is_first_photo = len(metadata_entries) == 0
    if make_primary or is_first_photo:
        for item in metadata_entries:
            item["is_primary"] = False
    metadata_entries.append({
        "stored_name": target_name,
        "original_name": file.filename or target_name,
        "created_at": _resolve_upload_time(target_path),
        "is_primary": bool(make_primary or is_first_photo),
        "coupe_code": coupe_token,
        "point_code": _sanitize_photo_token(point_code),
    })
    _save_photo_metadata(metadata_path, metadata_entries)

    gallery_items = [_serialize_feuille_gallery_item(feuille_id, item) for item in _list_feuille_photo_entries(feuille_id)]
    selected = next((item for item in gallery_items if item["stored_name"] == target_name), None)

    return {
        "ok": True,
        "feuille_id": feuille_id,
        "affaire": affaire_name,
        "filename": target_name,
        "photo": selected,
        "photos": gallery_items,
    }


@router.patch("/feuille/{feuille_id}/primary")
def set_feuille_photo_primary(feuille_id: int, body: FeuillePhotoPrimaryPayload):
    _assert_feuille_photos_editable(feuille_id)
    stored_name = str(body.stored_name or "").strip()
    if not stored_name or Path(stored_name).name != stored_name:
        raise HTTPException(status_code=400, detail="Nom de photo invalide.")
    if Path(stored_name).suffix.lower() not in PHOTO_EXTENSIONS_SET:
        raise HTTPException(status_code=400, detail="Format de photo invalide.")
    return _set_primary_feuille_photo(feuille_id, stored_name)


@router.delete("/feuille/{feuille_id}/files/{stored_name}")
def delete_feuille_photo(feuille_id: int, stored_name: str):
    _assert_feuille_photos_editable(feuille_id)
    stored_name = str(stored_name or "").strip()
    if not stored_name or Path(stored_name).name != stored_name:
        raise HTTPException(status_code=400, detail="Nom de photo invalide.")
    if Path(stored_name).suffix.lower() not in PHOTO_EXTENSIONS_SET:
        raise HTTPException(status_code=400, detail="Format de photo invalide.")
    return _delete_feuille_photo_entry(feuille_id, stored_name)


@router.get("/sc/{affaire}/{photo_number}")
def get_sc_photo(affaire: str, photo_number: str):
    """
    Get a photo for SC (Sondage Carotté) essai by affaire and photo number.
    Path: /api/photos/sc/{affaire}/{photo_number}
    (Legacy endpoint - prefer /essai/{essai_id})
    """
    affaire_photos = STORAGE_ROOT / "essais_photos" / affaire
    
    if not affaire_photos.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Photos for affaire {affaire} not found"
        )
    
    # Look for SC{photo_number}.* files
    for ext in PHOTO_EXTENSIONS:
        file_path = affaire_photos / f"SC{photo_number}{ext}"
        if file_path.exists() and file_path.is_file():
            return FileResponse(
                path=file_path,
                media_type="image/jpeg" if ext.lower() in [".jpg", ".jpeg"] else "image/png",
                filename=file_path.name,
            )
    
    raise HTTPException(
        status_code=404,
        detail=f"Photo SC{photo_number} for affaire {affaire} not found"
    )


@router.get("/de/{affaire}/{photo_number}")
def get_de_photo(affaire: str, photo_number: str):
    """
    Get a photo for DE (Densité Enrobés) essai.
    Path: /api/photos/de/{affaire}/{photo_number}
    """
    affaire_photos = STORAGE_ROOT / "essais_photos" / affaire
    
    if not affaire_photos.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Photos for affaire {affaire} not found"
        )
    
    # Look for DE{photo_number}.* files
    for ext in PHOTO_EXTENSIONS:
        file_path = affaire_photos / f"DE{photo_number}{ext}"
        if file_path.exists() and file_path.is_file():
            return FileResponse(
                path=file_path,
                media_type="image/jpeg" if ext.lower() in [".jpg", ".jpeg"] else "image/png",
                filename=file_path.name,
            )
    
    raise HTTPException(
        status_code=404,
        detail=f"Photo DE{photo_number} for affaire {affaire} not found"
    )

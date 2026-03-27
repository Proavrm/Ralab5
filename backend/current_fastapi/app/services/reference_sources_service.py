# File: reference_sources_service.py
from __future__ import annotations

import hashlib
import shutil
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = PROJECT_ROOT / "backend" / "current_fastapi" / "data"
STORAGE_DIR = PROJECT_ROOT / "storage"
REFERENCE_DIR = STORAGE_DIR / "references"
SYNC_DB_PATH = DATA_DIR / "reference_sync.db"

AFFAIRES_DB_PATH = DATA_DIR / "affaires.db"
ETUDES_DB_PATH = DATA_DIR / "etudes.db"

SOURCE_CONFIG: dict[str, dict[str, Any]] = {
    "affaires": {
        "label": "Affaires",
        "db_path": AFFAIRES_DB_PATH,
        "table": "affaires",
        "patterns": [
            "LISTE AFFAIRES*.xls",
            "LISTE AFFAIRES*.xlsx",
            "*AFFAIRES*.xls",
            "*AFFAIRES*.xlsx",
        ],
        "relative_dir": Path("references/affaires"),
        "skip_first_sheets": 2,
    },
    "etudes": {
        "label": "Études",
        "db_path": ETUDES_DB_PATH,
        "table": "etudes",
        "patterns": [
            "DEPA_Tableau de bord*.xlsx",
            "*Tableau de bord*.xlsx",
            "*ETUDES*.xlsx",
        ],
        "relative_dir": Path("references/etudes"),
        "skip_first_sheets": 0,
    },
}


@dataclass(slots=True)
class SourceFile:
    source_type: str
    path: Path | None
    exists: bool
    mtime: float | None
    hash_value: str | None


class ReferenceSourcesService:
    def __init__(self) -> None:
        self._ensure_sync_db()

    def _ensure_sync_db(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(SYNC_DB_PATH)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS reference_sync_state (
                    source_type TEXT PRIMARY KEY,
                    file_path TEXT,
                    file_mtime REAL,
                    file_hash TEXT,
                    last_checked_at TEXT,
                    last_imported_at TEXT,
                    last_import_status TEXT,
                    last_message TEXT,
                    last_row_count INTEGER,
                    last_sheet_count INTEGER,
                    ignored_sheet_names TEXT,
                    backup_path TEXT
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    def get_status_report(self) -> dict[str, Any]:
        now_iso = datetime.now().isoformat(timespec="seconds")
        result: dict[str, Any] = {
            "checked_at": now_iso,
            "sources": {},
            "update_available": False,
        }
        for source_type in ("affaires", "etudes"):
            source_info = self._build_source_status(source_type)
            result["sources"][source_type] = source_info
            if source_info["update_available"]:
                result["update_available"] = True
        return result

    def preview_update(self, source_type: str) -> dict[str, Any]:
        source_file = self._resolve_source_file(source_type)
        config = SOURCE_CONFIG[source_type]
        stored = self._get_sync_state(source_type)
        if not source_file.exists or source_file.path is None:
            return {
                "source_type": source_type,
                "label": config["label"],
                "available": False,
                "message": "Aucun fichier de référence détecté.",
            }

        parsed = self._parse_source(source_type, source_file.path)
        db_count = self._table_count(config["db_path"], config["table"])
        db_snapshot = self._table_snapshot(config["db_path"], config["table"])
        change_summary = self._compute_change_summary(source_type, config["db_path"], config["table"], parsed["rows"])
        return {
            "source_type": source_type,
            "label": config["label"],
            "available": True,
            "file_path": str(source_file.path),
            "file_name": source_file.path.name,
            "file_mtime": self._format_mtime(source_file.mtime),
            "file_hash": source_file.hash_value,
            "update_available": bool(stored is None or stored.get("file_hash") != source_file.hash_value),
            "stored_hash": stored.get("file_hash") if stored else None,
            "db_row_count_before": db_count,
            "preview_row_count": parsed["row_count"],
            "preview_sheet_count": parsed["sheet_count"],
            "ignored_sheet_names": parsed.get("ignored_sheet_names", []),
            "sheet_names": parsed.get("sheet_names", []),
            "columns": parsed["columns"],
            "sample_rows": parsed["sample_rows"],
            "db_columns": db_snapshot["columns"],
            "db_sample_rows": db_snapshot["sample_rows"],
            "change_summary": change_summary,
            "message": parsed["message"],
        }

    def apply_update(self, source_type: str) -> dict[str, Any]:
        source_file = self._resolve_source_file(source_type)
        config = SOURCE_CONFIG[source_type]
        if not source_file.exists or source_file.path is None:
            raise FileNotFoundError("Aucun fichier de référence détecté pour cette source.")

        parsed = self._parse_source(source_type, source_file.path)
        backup_path = self._backup_db(config["db_path"], source_type)
        before_count = self._table_count(config["db_path"], config["table"])
        self._replace_table(config["db_path"], config["table"], parsed["rows"])
        after_count = self._table_count(config["db_path"], config["table"])

        self._upsert_sync_state(
            source_type=source_type,
            file_path=str(source_file.path),
            file_mtime=source_file.mtime,
            file_hash=source_file.hash_value,
            last_import_status="ok",
            last_message=f"Base {config['label']} mise à jour depuis {source_file.path.name}",
            last_row_count=after_count,
            last_sheet_count=parsed["sheet_count"],
            ignored_sheet_names=parsed.get("ignored_sheet_names", []),
            backup_path=str(backup_path),
        )

        return {
            "source_type": source_type,
            "label": config["label"],
            "file_name": source_file.path.name,
            "before_count": before_count,
            "after_count": after_count,
            "sheet_count": parsed["sheet_count"],
            "ignored_sheet_names": parsed.get("ignored_sheet_names", []),
            "backup_path": str(backup_path),
            "message": f"Base {config['label']} mise à jour ({after_count} lignes).",
        }

    def _build_source_status(self, source_type: str) -> dict[str, Any]:
        config = SOURCE_CONFIG[source_type]
        source_file = self._resolve_source_file(source_type)
        stored = self._get_sync_state(source_type)
        db_count = self._table_count(config["db_path"], config["table"])

        update_available = bool(source_file.exists and (stored is None or stored.get("file_hash") != source_file.hash_value))
        return {
            "source_type": source_type,
            "label": config["label"],
            "available": source_file.exists,
            "file_path": str(source_file.path) if source_file.path else None,
            "file_name": source_file.path.name if source_file.path else None,
            "file_mtime": self._format_mtime(source_file.mtime),
            "file_hash": source_file.hash_value,
            "db_path": str(config["db_path"]),
            "db_row_count": db_count,
            "update_available": update_available,
            "last_imported_at": stored.get("last_imported_at") if stored else None,
            "last_import_status": stored.get("last_import_status") if stored else None,
            "last_message": stored.get("last_message") if stored else None,
            "last_row_count": stored.get("last_row_count") if stored else None,
            "last_sheet_count": stored.get("last_sheet_count") if stored else None,
            "ignored_sheet_names": self._split_csv(stored.get("ignored_sheet_names")) if stored else [],
            "backup_path": stored.get("backup_path") if stored else None,
        }

    def _resolve_source_file(self, source_type: str) -> SourceFile:
        config = SOURCE_CONFIG[source_type]
        candidates: list[Path] = []
        target_dir = REFERENCE_DIR / config["relative_dir"].relative_to("references")
        if target_dir.exists():
            for pattern in config["patterns"]:
                candidates.extend(sorted(target_dir.glob(pattern)))
        if not candidates:
            # Fallback: search recursively under storage only.
            if STORAGE_DIR.exists():
                for pattern in config["patterns"]:
                    candidates.extend(sorted(STORAGE_DIR.rglob(pattern)))
        if not candidates:
            return SourceFile(source_type, None, False, None, None)

        chosen = max(candidates, key=lambda p: p.stat().st_mtime)
        stat = chosen.stat()
        return SourceFile(
            source_type=source_type,
            path=chosen,
            exists=True,
            mtime=stat.st_mtime,
            hash_value=self._file_hash(chosen),
        )

    def _parse_source(self, source_type: str, file_path: Path) -> dict[str, Any]:
        if source_type == "affaires":
            return self._parse_affaires(file_path)
        if source_type == "etudes":
            return self._parse_etudes(file_path)
        raise ValueError(f"Unsupported source type: {source_type}")

    def _parse_affaires(self, file_path: Path) -> dict[str, Any]:
        xl = pd.ExcelFile(file_path, engine="xlrd" if file_path.suffix.lower() == ".xls" else None)
        sheet_names = xl.sheet_names
        ignored = sheet_names[: SOURCE_CONFIG["affaires"]["skip_first_sheets"]]
        rows: list[dict[str, Any]] = []
        parsed_sheets: list[str] = []

        for sheet_name in sheet_names[SOURCE_CONFIG["affaires"]["skip_first_sheets"]:]:
            raw = xl.parse(sheet_name=sheet_name, header=None)
            header_row_idx = self._find_header_row(raw, ["N°Affaire", "Code Agence", "Libellé", "Titulaire"])
            if header_row_idx is None:
                continue
            header = [self._clean_header(v) for v in raw.iloc[header_row_idx].tolist()]
            data = raw.iloc[header_row_idx + 1 :].copy()
            data.columns = header
            data = data.dropna(how="all")
            data = data[data["N°Affaire"].notna()]
            data = data[data["N°Affaire"].astype(str).str.strip() != ""]
            data = data[data["N°Affaire"].astype(str).str.upper() != "N°AFFAIRE"]

            for original_index, row in data.iterrows():
                n_affaire = self._text(row.get("N°Affaire"))
                code_agence = self._text(row.get("Code Agence"))
                libelle = self._text(row.get("Libellé")) or self._text(row.get("Libellé "))
                titulaire = self._text(row.get("Titulaire"))
                if not n_affaire or not code_agence or not libelle:
                    continue
                composite_id = f"{sheet_name}-{int(original_index) + 1}"
                rows.append(
                    {
                        "id": composite_id,
                        "n°affaire": n_affaire,
                        "code_agence": code_agence,
                        "libellé": libelle,
                        "titulaire": titulaire,
                        "gsa": self._text(row.get("GSA")),
                        "ehtp": self._text(row.get("EHTP")),
                        "nge_routes": self._text(row.get("NGE ROUTES")),
                        "nge_gc": self._text(row.get("NGE GC")),
                        "lyaudet": self._text(row.get("LYAUDET")),
                        "nge_e.s.": self._text(row.get("NGE E.S.")),
                        "nge_transitions": self._text(row.get("NGE Transitions")),
                        "responsable": self._text(row.get("Responsable")),
                        "marche_n°": self._text(row.get("Marché n°")),
                        "compte_bancaire": self._text(row.get("Compte bancaire")),
                        "observations": self._text(row.get("Observations")),
                        "source_sheet": sheet_name,
                    }
                )
            parsed_sheets.append(sheet_name)

        return {
            "row_count": len(rows),
            "sheet_count": len(parsed_sheets),
            "sheet_names": parsed_sheets,
            "ignored_sheet_names": ignored,
            "columns": [
                "id",
                "n°affaire",
                "code_agence",
                "libellé",
                "titulaire",
                "gsa",
                "ehtp",
                "nge_routes",
                "nge_gc",
                "lyaudet",
                "nge_e.s.",
                "nge_transitions",
                "responsable",
                "marche_n°",
                "compte_bancaire",
                "observations",
                "source_sheet",
            ],
            "rows": rows,
            "sample_rows": rows[:5],
            "message": f"{len(rows)} lignes détectées sur {len(parsed_sheets)} feuilles utiles.",
        }

    def _parse_etudes(self, file_path: Path) -> dict[str, Any]:
        raw = pd.read_excel(file_path, sheet_name=0, header=None)
        header_row_idx = self._find_header_row(raw, ["N° Affaire", "Direction", "Filiale", "Nom affaire"])
        if header_row_idx is None:
            raise ValueError("Impossible de trouver la ligne d'entête dans le fichier Études.")
        headers = [self._clean_header(v) for v in raw.iloc[header_row_idx].tolist()]
        data = raw.iloc[header_row_idx + 1 :].copy()
        data.columns = headers
        data = data.dropna(how="all")
        data = data[data["N° Affaire"].notna()]
        rows: list[dict[str, Any]] = []
        for _, row in data.iterrows():
            n_affaire = self._text(row.get("N° Affaire"))
            if not n_affaire:
                continue
            rows.append(
                {
                    "id": None,
                    "nAffaire": n_affaire,
                    "direction": self._text(row.get("Direction")),
                    "filiale": self._text(row.get("Filiale")),
                    "orga1": self._text(row.get("Orga 1")),
                    "orga2": self._text(row.get("Orga 2")),
                    "nomAffaire": self._text(row.get("Nom affaire")),
                    "pays": self._text(row.get("Pays")),
                    "dept": self._text(row.get("Dépt")),
                    "ville": self._text(row.get("Ville")),
                    "maitreOuvrage": self._text(row.get("Maitre d'ouvrage")),
                    "maitreOuvre": self._text(row.get("Maitre d'œuvre")),
                    "formatReponse": self._text(row.get("Format de réponse")),
                    "mandataire": self._text(row.get("Mandataire")),
                    "membresGroupement": self._text(row.get("Membres Groupement")),
                    "taxonimie": self._text(row.get("Taxonomie")),
                    "dateCandidature": self._text(row.get("Date candidature")),
                    "dateReceptionDossier": self._text(row.get("Date réception dossier")),
                    "datePremierRO": self._text(row.get("Date première RO")),
                    "dateDernierRO": self._text(row.get("Date dernière RO")),
                    "heureRemise": self._text(row.get("Heure de remise")),
                    "respEtude": self._text(row.get("Resp. Etude")),
                    "statuAffaire": self._text(row.get("Statut affaire")),
                    "dateInformationAttribution": self._text(row.get("Date information attribution")),
                }
            )

        return {
            "row_count": len(rows),
            "sheet_count": 1,
            "sheet_names": ["Tableau de bord Etudes (ligne)"],
            "ignored_sheet_names": [],
            "columns": [
                "nAffaire",
                "direction",
                "filiale",
                "orga1",
                "orga2",
                "nomAffaire",
                "pays",
                "dept",
                "ville",
                "maitreOuvrage",
                "maitreOuvre",
                "formatReponse",
                "mandataire",
                "membresGroupement",
                "taxonimie",
                "dateCandidature",
                "dateReceptionDossier",
                "datePremierRO",
                "dateDernierRO",
                "heureRemise",
                "respEtude",
                "statuAffaire",
                "dateInformationAttribution",
            ],
            "rows": rows,
            "sample_rows": rows[:5],
            "message": f"{len(rows)} lignes détectées sur la feuille principale.",
        }

    def _replace_table(self, db_path: Path, table_name: str, rows: list[dict[str, Any]]) -> None:
        conn = sqlite3.connect(db_path)
        try:
            cur = conn.cursor()
            cols = [r[1] for r in cur.execute(f"PRAGMA table_info({table_name})").fetchall()]
            insert_cols = list(cols)
            if table_name == "etudes" and "id" in insert_cols:
                insert_cols = [c for c in insert_cols if c != "id"]
            prepared_rows = self._prepare_rows_for_insert(table_name, insert_cols, rows)
            cur.execute(f"DELETE FROM {table_name}")
            if prepared_rows:
                placeholders = ",".join(["?"] * len(insert_cols))
                col_sql = ",".join([f'"{c}"' for c in insert_cols])
                values = []
                for row in prepared_rows:
                    values.append([row.get(col) for col in insert_cols])
                cur.executemany(f"INSERT INTO {table_name} ({col_sql}) VALUES ({placeholders})", values)
            conn.commit()
        finally:
            conn.close()

    def _prepare_rows_for_insert(self, table_name: str, cols: list[str], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        prepared: list[dict[str, Any]] = []
        used_ids: set[str] = set()
        for idx, row in enumerate(rows, start=1):
            clean_row = {col: row.get(col) for col in cols}
            if table_name == "affaires":
                base_id = self._text(clean_row.get("id")) or f"affaires-refresh-{idx:06d}"
                unique_id = base_id
                suffix = 2
                while unique_id in used_ids:
                    unique_id = f"{base_id}__{suffix}"
                    suffix += 1
                clean_row["id"] = unique_id
                used_ids.add(unique_id)
            prepared.append(clean_row)
        return prepared

    def _table_snapshot(self, db_path: Path, table_name: str, limit: int = 5) -> dict[str, Any]:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            cols = [r[1] for r in cur.execute(f"PRAGMA table_info({table_name})").fetchall()]
            rows = [dict(row) for row in cur.execute(f'SELECT * FROM "{table_name}" LIMIT {int(limit)}').fetchall()]
            return {"columns": cols, "sample_rows": rows}
        finally:
            conn.close()

    def _compute_change_summary(self, source_type: str, db_path: Path, table_name: str, parsed_rows: list[dict[str, Any]]) -> dict[str, Any]:
        existing_keys = self._existing_business_keys(source_type, db_path, table_name)
        incoming_keys: list[str] = []
        for row in parsed_rows:
            key = self._business_key(source_type, row)
            if key:
                incoming_keys.append(key)
        incoming_set = set(incoming_keys)
        return {
            "incoming_rows": len(parsed_rows),
            "matched_rows": sum(1 for key in incoming_keys if key in existing_keys),
            "new_rows": sum(1 for key in incoming_keys if key not in existing_keys),
            "db_only_rows": sum(1 for key in existing_keys if key not in incoming_set),
        }

    def _existing_business_keys(self, source_type: str, db_path: Path, table_name: str) -> set[str]:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            rows = [dict(row) for row in cur.execute(f'SELECT * FROM "{table_name}"').fetchall()]
            return {key for row in rows if (key := self._business_key(source_type, row))}
        finally:
            conn.close()

    def _business_key(self, source_type: str, row: dict[str, Any]) -> str:
        if source_type == "affaires":
            parts = [
                self._normalize_key_value(row.get("n°affaire")),
                self._normalize_key_value(row.get("code_agence")),
                self._normalize_key_value(row.get("libellé")),
                self._normalize_key_value(row.get("titulaire")),
                self._normalize_key_value(row.get("source_sheet")),
            ]
        else:
            parts = [
                self._normalize_key_value(row.get("nAffaire")),
                self._normalize_key_value(row.get("direction")),
                self._normalize_key_value(row.get("filiale")),
                self._normalize_key_value(row.get("nomAffaire")),
            ]
        if not any(parts):
            return ""
        return "||".join(parts)

    @staticmethod
    def _normalize_key_value(value: Any) -> str:
        return ReferenceSourcesService._text(value).strip().upper()

    def _backup_db(self, db_path: Path, source_type: str) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backups_dir = DATA_DIR / "backups"
        backups_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backups_dir / f"{db_path.stem}_{source_type}_{timestamp}.db"
        shutil.copy2(db_path, backup_path)
        return backup_path

    def _table_count(self, db_path: Path, table_name: str) -> int:
        conn = sqlite3.connect(db_path)
        try:
            return int(conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])
        finally:
            conn.close()

    def _get_sync_state(self, source_type: str) -> dict[str, Any] | None:
        conn = sqlite3.connect(SYNC_DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute(
                "SELECT * FROM reference_sync_state WHERE source_type = ?",
                (source_type,),
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def _upsert_sync_state(
        self,
        *,
        source_type: str,
        file_path: str,
        file_mtime: float | None,
        file_hash: str | None,
        last_import_status: str,
        last_message: str,
        last_row_count: int,
        last_sheet_count: int,
        ignored_sheet_names: list[str],
        backup_path: str,
    ) -> None:
        conn = sqlite3.connect(SYNC_DB_PATH)
        try:
            now_iso = datetime.now().isoformat(timespec="seconds")
            conn.execute(
                """
                INSERT INTO reference_sync_state (
                    source_type, file_path, file_mtime, file_hash, last_checked_at,
                    last_imported_at, last_import_status, last_message,
                    last_row_count, last_sheet_count, ignored_sheet_names, backup_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_type) DO UPDATE SET
                    file_path = excluded.file_path,
                    file_mtime = excluded.file_mtime,
                    file_hash = excluded.file_hash,
                    last_checked_at = excluded.last_checked_at,
                    last_imported_at = excluded.last_imported_at,
                    last_import_status = excluded.last_import_status,
                    last_message = excluded.last_message,
                    last_row_count = excluded.last_row_count,
                    last_sheet_count = excluded.last_sheet_count,
                    ignored_sheet_names = excluded.ignored_sheet_names,
                    backup_path = excluded.backup_path
                """,
                (
                    source_type,
                    file_path,
                    file_mtime,
                    file_hash,
                    now_iso,
                    now_iso,
                    last_import_status,
                    last_message,
                    last_row_count,
                    last_sheet_count,
                    ",".join(ignored_sheet_names),
                    backup_path,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    @staticmethod
    def _file_hash(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def _format_mtime(mtime: float | None) -> str | None:
        if mtime is None:
            return None
        return datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _text(value: Any) -> str:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return ""
        text = str(value).strip()
        if text == "nan":
            return ""
        return text

    @staticmethod
    def _clean_header(value: Any) -> str:
        text = ReferenceSourcesService._text(value)
        return text.replace("\n", " ").strip()

    @staticmethod
    def _find_header_row(df: pd.DataFrame, required_headers: list[str], scan_rows: int = 20) -> int | None:
        for idx in range(min(scan_rows, len(df.index))):
            row_values = [ReferenceSourcesService._clean_header(v) for v in df.iloc[idx].tolist()]
            joined = " | ".join(row_values)
            if all(any(req.lower() in cell.lower() for cell in row_values) for req in required_headers):
                return idx
            if all(req.lower() in joined.lower() for req in required_headers):
                return idx
        return None

    @staticmethod
    def _split_csv(value: str | None) -> list[str]:
        if not value:
            return []
        return [part for part in value.split(",") if part]

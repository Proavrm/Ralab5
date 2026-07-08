"""Renommage du code laboratoire — propagation dans les tables liées."""
from __future__ import annotations

import re
import sqlite3

from app.core.database import get_db_path
from app.repositories.laboratoires_repository import LaboratoiresRepository
from app.repositories.security_repository import SecurityRepository
from app.services.lab_geo_catalog import invalidate_lab_geo_cache


def _normalize_code(code: str | None) -> str:
    return str(code or "").strip().upper()


def _tables_with_column(conn: sqlite3.Connection, column: str) -> list[str]:
    tables: list[str] = []
    for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        table = str(row[0])
        if table.startswith("sqlite_"):
            continue
        cols = [info[1] for info in conn.execute(f"PRAGMA table_info({table})")]
        if column in cols:
            tables.append(table)
    return tables


def rename_laboratoire_code(old_code: str, new_code: str) -> dict:
    old = _normalize_code(old_code)
    new = _normalize_code(new_code)
    if not old:
        raise ValueError("Code actuel requis.")
    if not new:
        raise ValueError("Nouveau code requis.")
    if old == new:
        raise ValueError("Le nouveau code est identique à l'actuel.")
    if not re.fullmatch(r"[A-Z0-9_]{2,12}", new):
        raise ValueError("Code invalide (2–12 caractères alphanumériques).")

    repo = LaboratoiresRepository()
    if repo.get_by_code(old) is None:
        raise LookupError(f"Laboratoire {old} introuvable.")
    if repo.get_by_code(new) is not None:
        raise ValueError(f"Le code {new} est déjà utilisé.")

    stats: dict[str, int] = {"laboratoires": 0, "service_code": 0}
    db_path = get_db_path()

    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        for table in _tables_with_column(conn, "labo_code"):
            cur = conn.execute(
                f"UPDATE {table} SET labo_code = ? WHERE upper(trim(labo_code)) = ?",
                (new, old),
            )
            stats[f"{table}.labo_code"] = cur.rowcount

        cur = conn.execute(
            """
            UPDATE demandes
            SET reference = REPLACE(reference, ?, ?)
            WHERE upper(trim(labo_code)) = ? OR instr(reference, ?) > 0
            """,
            (f"-{old}-", f"-{new}-", old, f"-{old}-"),
        )
        stats["demandes.reference"] = cur.rowcount

        cur = conn.execute(
            "UPDATE laboratoires SET code = ? WHERE upper(code) = ?",
            (new, old),
        )
        stats["laboratoires"] = cur.rowcount
        conn.commit()

    try:
        security = SecurityRepository()
        with security._connect() as conn:
            cur = conn.execute(
                "UPDATE users SET service_code = ? WHERE upper(trim(service_code)) = ?",
                (new, old),
            )
            stats["users.service_code"] = cur.rowcount
            if "sharepoint_contexts" in _tables_with_column(conn, "service_code"):
                cur = conn.execute(
                    "UPDATE sharepoint_contexts SET service_code = ? WHERE upper(trim(service_code)) = ?",
                    (new, old),
                )
                stats["sharepoint_contexts.service_code"] = cur.rowcount
            conn.commit()
    except FileNotFoundError:
        stats["users.service_code"] = 0

    record = repo.get_by_code(new)
    if record is None:
        raise LookupError(f"Renommage échoué pour {old} → {new}")

    invalidate_lab_geo_cache()

    return {
        "old_code": old,
        "new_code": new,
        "stats": stats,
        "laboratoire": record,
    }


def count_laboratoire_references(code: str) -> dict[str, int]:
    normalized = _normalize_code(code)
    if not normalized:
        return {}

    stats: dict[str, int] = {}
    db_path = get_db_path()

    with sqlite3.connect(str(db_path)) as conn:
        for table in _tables_with_column(conn, "labo_code"):
            count = conn.execute(
                f"SELECT COUNT(*) FROM {table} WHERE upper(trim(labo_code)) = ?",
                (normalized,),
            ).fetchone()[0]
            if count:
                stats[f"{table}.labo_code"] = int(count)

    try:
        security = SecurityRepository()
        with security._connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM users WHERE upper(trim(service_code)) = ?",
                (normalized,),
            ).fetchone()[0]
            if count:
                stats["users.service_code"] = int(count)
            if "sharepoint_contexts" in _tables_with_column(conn, "service_code"):
                count = conn.execute(
                    "SELECT COUNT(*) FROM sharepoint_contexts WHERE upper(trim(service_code)) = ?",
                    (normalized,),
                ).fetchone()[0]
                if count:
                    stats["sharepoint_contexts.service_code"] = int(count)
    except FileNotFoundError:
        pass

    return stats


def delete_laboratoire_code(code: str) -> dict:
    normalized = _normalize_code(code)
    if not normalized:
        raise ValueError("Code laboratoire requis.")

    repo = LaboratoiresRepository()
    if repo.get_by_code(normalized) is None:
        raise LookupError(f"Laboratoire {normalized} introuvable.")

    refs = count_laboratoire_references(normalized)
    if refs:
        details = ", ".join(f"{key} ({count})" for key, count in sorted(refs.items()))
        raise ValueError(
            f"Impossible de supprimer {normalized} : références actives — {details}."
        )

    with sqlite3.connect(str(get_db_path())) as conn:
        cur = conn.execute("DELETE FROM laboratoires WHERE upper(code) = ?", (normalized,))
        if cur.rowcount <= 0:
            raise LookupError(f"Laboratoire {normalized} introuvable.")
        conn.commit()

    invalidate_lab_geo_cache()

    return {"deleted_code": normalized, "references": refs}

"""Génération et normalisation des références prélèvement ({année}-{labo}-PRL{0001}).

Règle métier :
- Le labo dans la référence vient du `labo_code` de la demande (laboratoire RST qui porte le dossier).
- Le numéro PRL est attribué une seule fois à la création et ne change jamais, même si l'échantillon
  part ensuite vers un autre laboratoire pour exécution d'essais — c'est notre numéro de traçabilité.
- La séquence numérique est globale par année (0005 RST puis 0006 SP, etc.).
"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime

LEGACY_PRELEVEMENT_REF_PATTERN = re.compile(r"^(\d{4})-([A-Z0-9-]+)-P(\d+)$")
CANONICAL_PRELEVEMENT_REF_PATTERN = re.compile(r"^(\d{4})-([A-Z0-9-]+)-PRL(\d+)$")
PRELEVEMENT_REF_SEQUENCE_PATTERN = re.compile(r"^(\d{4})-[A-Z0-9-]+-(?:PRL|P)(\d+)$")


def normalize_labo_code(labo_code: object) -> str:
    value = str(labo_code or "").strip().upper()
    return value or "SP"


def prelevement_reference_prefix(*, year: int, labo_code: object) -> str:
    return f"{int(year)}-{normalize_labo_code(labo_code)}-PRL"


def _max_prelevement_sequence_for_year(conn: sqlite3.Connection, year: int) -> int:
    """Numéro séquentiel partagé sur l'année (RST-PRL0005 puis SP-PRL0006, etc.)."""
    numbers: list[int] = []
    for row in conn.execute("SELECT reference FROM prelevements").fetchall():
        ref = str(row["reference"] or "")
        match = PRELEVEMENT_REF_SEQUENCE_PATTERN.match(ref)
        if not match or int(match.group(1)) != int(year):
            continue
        numbers.append(int(match.group(2)))
    return max(numbers, default=0)


def next_prelevement_reference(
    conn: sqlite3.Connection,
    *,
    demande_id: int | None = None,
    year: int | None = None,
    labo_code: object | None = None,
) -> str:
    resolved_year = int(year) if year is not None else datetime.now().year
    resolved_labo = normalize_labo_code(labo_code)

    if demande_id:
        row = conn.execute(
            "SELECT annee, labo_code FROM demandes WHERE id = ?",
            (int(demande_id),),
        ).fetchone()
        if row:
            if row["annee"] is not None:
                resolved_year = int(row["annee"])
            if row["labo_code"]:
                resolved_labo = normalize_labo_code(row["labo_code"])

    prefix = prelevement_reference_prefix(year=resolved_year, labo_code=resolved_labo)
    next_num = _max_prelevement_sequence_for_year(conn, resolved_year) + 1
    return f"{prefix}{next_num:04d}"


def canonicalize_prelevement_reference(reference: object) -> str | None:
    """Convertit une référence legacy `-P0001` en `-PRL0001`. Retourne None si déjà canonique."""
    raw = str(reference or "").strip()
    if not raw:
        return None
    if CANONICAL_PRELEVEMENT_REF_PATTERN.match(raw):
        return None
    match = LEGACY_PRELEVEMENT_REF_PATTERN.match(raw)
    if not match:
        return None
    year, labo, numero = match.groups()
    return f"{year}-{labo}-PRL{numero}"


def build_prelevement_reference_migration_map(conn: sqlite3.Connection) -> dict[str, str]:
    mapping: dict[str, str] = {}
    rows = conn.execute("SELECT id, reference FROM prelevements ORDER BY id").fetchall()
    for row in rows:
        old_ref = str(row["reference"] or "").strip()
        new_ref = canonicalize_prelevement_reference(old_ref)
        if not new_ref or new_ref == old_ref:
            continue
        if new_ref in mapping.values():
            raise ValueError(f"Collision de migration: {old_ref} -> {new_ref}")
        existing = conn.execute(
            "SELECT id FROM prelevements WHERE reference = ? AND id != ?",
            (new_ref, int(row["id"])),
        ).fetchone()
        if existing:
            raise ValueError(f"Référence cible déjà utilisée: {new_ref}")
        mapping[old_ref] = new_ref
    return mapping


def apply_prelevement_reference_migration(conn: sqlite3.Connection, mapping: dict[str, str]) -> list[tuple[str, str]]:
    if not mapping:
        return []

    applied: list[tuple[str, str]] = []
    for old_ref, new_ref in mapping.items():
        conn.execute(
            "UPDATE prelevements SET reference = ?, updated_at = datetime('now') WHERE reference = ?",
            (new_ref, old_ref),
        )
        conn.execute(
            "UPDATE task_assignments SET object_reference = ? WHERE object_reference = ?",
            (new_ref, old_ref),
        )
        applied.append((old_ref, new_ref))

    text_tables = (
        ("echantillons", ("notes", "designation", "localisation")),
        ("essais", ("notes", "observations")),
        ("interventions", ("observations", "notes")),
        ("prelevements", ("notes", "description", "finalite")),
    )
    for table, columns in text_tables:
        if not conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone():
            continue
        table_cols = {
            row["name"]
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for column in columns:
            if column not in table_cols:
                continue
            for old_ref, new_ref in mapping.items():
                conn.execute(
                    f"""
                    UPDATE {table}
                    SET {column} = REPLACE({column}, ?, ?)
                    WHERE {column} LIKE ?
                    """,
                    (old_ref, new_ref, f"%{old_ref}%"),
                )

    conn.commit()
    return applied

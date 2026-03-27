"""
affaire_regularisation_service.py
Regularisation helpers for imported affaires in RaLab4.
"""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REFERENCE_AFFAIRE_COLUMNS = [
    "n°affaire",
    "gsa",
    "ehtp",
    "nge_routes",
    "nge_gc",
    "lyaudet",
    "nge_e.s.",
    "nge_transitions",
]


@dataclass(slots=True)
class RegularisationPaths:
    target_db_path: Path
    affaires_db_path: Path


class AffaireRegularisationService:
    """Service used to inspect and correct imported affaires after historical import."""

    def __init__(self, target_db_path: Path, affaires_db_path: Path) -> None:
        self.paths = RegularisationPaths(
            target_db_path=target_db_path,
            affaires_db_path=affaires_db_path,
        )

    def status(self) -> dict[str, Any]:
        with sqlite3.connect(self.paths.target_db_path) as conn:
            conn.row_factory = sqlite3.Row
            self._ensure_schema(conn)
            imported_count = self._safe_scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM affaires_rst
                WHERE statut = 'Importée' OR responsable = 'Import historique'
                """,
                default=0,
            )
            with_site = self._safe_scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM affaires_rst
                WHERE COALESCE(site, '') <> ''
                """,
                default=0,
            )
        return {
            "target_db_path": str(self.paths.target_db_path),
            "affaires_db_path": str(self.paths.affaires_db_path),
            "target_db_exists": self.paths.target_db_path.exists(),
            "affaires_db_exists": self.paths.affaires_db_path.exists(),
            "imported_affaires_count": imported_count,
            "imported_affaires_with_site": with_site,
            "site_column_ready": True,
        }

    def build_report(self, limit: int = 200) -> dict[str, Any]:
        reference_rows = self._load_reference_affaires()
        with sqlite3.connect(self.paths.target_db_path) as conn:
            conn.row_factory = sqlite3.Row
            self._ensure_schema(conn)
            imported_affaires = self._load_imported_affaires(conn, limit=limit)

        enrichable: list[dict[str, Any]] = []
        unresolved: list[dict[str, Any]] = []
        chantier_site_suspects: list[dict[str, Any]] = []

        for raw_row in imported_affaires:
            match = self._resolve_reference_match(reference_rows, raw_row)
            normalized_row = self._normalize_imported_row(raw_row, match)
            affaire_key = self._normalize_affaire_key(normalized_row.get("affaire_nge", ""))
            suggestion = self._build_suggestion(normalized_row, match)
            enriched_row = {
                **normalized_row,
                "affaire_key": affaire_key,
                "reference_match": match,
                "suggestion": suggestion,
            }
            if match is not None:
                enrichable.append(enriched_row)
            else:
                unresolved.append({
                    **enriched_row,
                    "reference_candidates": self._find_reference_candidates(
                        reference_rows,
                        normalized_row.get("affaire_nge", "") or raw_row.get("affaire_nge", ""),
                        normalized_row.get("chantier", "") or raw_row.get("chantier", ""),
                        limit=5,
                    ),
                })
            if self._looks_like_site(raw_row.get("chantier", "")) or (
                normalized_row.get("site", "") and not normalized_row.get("chantier", "")
            ):
                chantier_site_suspects.append(enriched_row)

        return {
            "summary": {
                "imported_affaires": len(imported_affaires),
                "enrichable_from_reference": len(enrichable),
                "unresolved_affaires": len(unresolved),
                "chantier_site_suspects": len(chantier_site_suspects),
            },
            "enrichable_affaires": enrichable[:limit],
            "unresolved_affaires": unresolved[:limit],
            "chantier_site_suspects": chantier_site_suspects[:limit],
        }

    def update_affaire_fields(
        self,
        affaire_id: int,
        chantier: str | None = None,
        site: str | None = None,
        affaire_nge: str | None = None,
    ) -> dict[str, Any]:
        reference_rows = self._load_reference_affaires()
        with sqlite3.connect(self.paths.target_db_path) as conn:
            conn.row_factory = sqlite3.Row
            self._ensure_schema(conn)
            row = conn.execute(
                "SELECT * FROM affaires_rst WHERE id = ?",
                (affaire_id,),
            ).fetchone()
            if row is None:
                raise ValueError(f"Affaire not found: {affaire_id}")

            current_raw = dict(row)
            current_match = self._resolve_reference_match(reference_rows, current_raw)
            current = self._normalize_imported_row(current_raw, current_match)

            chantier_value = self._stringify(chantier) if chantier is not None else current.get("chantier", "")
            site_value = self._stringify(site) if site is not None else current.get("site", "")
            affaire_nge_value = self._stringify(affaire_nge) if affaire_nge is not None else current.get("affaire_nge", "")

            if affaire_nge_value and not self._looks_like_affaire_code(affaire_nge_value):
                # Keep the current resolved code instead of saving a title in the code field.
                affaire_nge_value = current.get("affaire_nge", "")

            conn.execute(
                """
                UPDATE affaires_rst
                SET chantier = ?,
                    site = ?,
                    affaire_nge = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (chantier_value, site_value, affaire_nge_value, affaire_id),
            )
            conn.commit()
            updated = conn.execute(
                "SELECT * FROM affaires_rst WHERE id = ?",
                (affaire_id,),
            ).fetchone()

        updated_raw = dict(updated) if updated else {}
        updated_match = self._resolve_reference_match(reference_rows, updated_raw)
        return {"before": current, "after": self._normalize_imported_row(updated_raw, updated_match)}

    def apply_reference_enrichment(self, affaire_id: int, reference_code: str | None = None) -> dict[str, Any]:
        reference_rows = self._load_reference_affaires()
        with sqlite3.connect(self.paths.target_db_path) as conn:
            conn.row_factory = sqlite3.Row
            self._ensure_schema(conn)
            row = conn.execute(
                "SELECT * FROM affaires_rst WHERE id = ?",
                (affaire_id,),
            ).fetchone()
            if row is None:
                raise ValueError(f"Affaire not found: {affaire_id}")
            current_raw = dict(row)
            current_match = self._resolve_reference_match(reference_rows, current_raw)
            current = self._normalize_imported_row(current_raw, current_match)

            lookup_code = self._stringify(reference_code) or current.get("affaire_nge", "") or current_raw.get("affaire_nge", "")
            match = self._find_reference_match(reference_rows, self._normalize_affaire_key(lookup_code))
            if match is None:
                raise ValueError(f"No reference match found for: {lookup_code}")

            suggestion = self._build_suggestion(current, match)
            chantier_value = suggestion["suggested_chantier"] or current.get("chantier", "")
            site_value = suggestion["suggested_site"] or current.get("site", "")
            affaire_nge_value = self._stringify(match.get("matched_code_raw", "")) or self._stringify(reference_code) or current.get("affaire_nge", "")
            titulaire_value = current_raw.get("titulaire", "") or self._stringify(match.get("titulaire", ""))

            conn.execute(
                """
                UPDATE affaires_rst
                SET chantier = ?,
                    site = ?,
                    affaire_nge = ?,
                    titulaire = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (chantier_value, site_value, affaire_nge_value, titulaire_value, affaire_id),
            )
            conn.commit()
            updated = conn.execute(
                "SELECT * FROM affaires_rst WHERE id = ?",
                (affaire_id,),
            ).fetchone()
        updated_raw = dict(updated) if updated else {}
        updated_match = self._resolve_reference_match(reference_rows, updated_raw)
        return {
            "match": match,
            "suggestion": suggestion,
            "after": self._normalize_imported_row(updated_raw, updated_match),
        }

    def search_reference_candidates(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        rows = self._load_reference_affaires()
        return self._find_reference_candidates(rows, query, query, limit=limit)

    def _ensure_schema(self, conn: sqlite3.Connection) -> None:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(affaires_rst)").fetchall()}
        if "site" not in columns:
            conn.execute("ALTER TABLE affaires_rst ADD COLUMN site TEXT")
            conn.commit()

    def _load_imported_affaires(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT
                id,
                reference,
                affaire_nge,
                chantier,
                COALESCE(site, '') AS site,
                titulaire,
                statut,
                responsable,
                updated_at,
                created_at,
                (
                    SELECT COUNT(*)
                    FROM demandes d
                    WHERE d.affaire_rst_id = a.id
                ) AS demandes_count
            FROM affaires_rst a
            WHERE a.statut = 'Importée' OR a.responsable = 'Import historique'
            ORDER BY a.reference ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _load_reference_affaires(self) -> list[dict[str, Any]]:
        if not self.paths.affaires_db_path.exists():
            return []
        with sqlite3.connect(self.paths.affaires_db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM affaires").fetchall()
        return [dict(row) for row in rows]

    def _resolve_reference_match(self, rows: list[dict[str, Any]], affaire: dict[str, Any]) -> dict[str, Any] | None:
        raw_candidates = [
            affaire.get("affaire_nge", ""),
            affaire.get("chantier", ""),
            affaire.get("site", ""),
        ]
        for raw in raw_candidates:
            for code in self._extract_affaire_codes(raw):
                match = self._find_reference_match(rows, self._normalize_affaire_key(code))
                if match is not None:
                    return match
        return None

    def _normalize_imported_row(self, affaire: dict[str, Any], match: dict[str, Any] | None) -> dict[str, Any]:
        current_affaire_raw = self._stringify(affaire.get("affaire_nge", ""))
        current_chantier_raw = self._stringify(affaire.get("chantier", ""))
        current_site_raw = self._stringify(affaire.get("site", ""))

        matched_code = self._stringify(match.get("matched_code_raw", "")) if match else ""
        ref_chantier, ref_site = self._extract_chantier_and_site(match) if match else ("", "")

        normalized_affaire = matched_code if matched_code else current_affaire_raw
        if normalized_affaire and not self._looks_like_affaire_code(normalized_affaire):
            extracted_from_noise = self._extract_first_affaire_code(current_site_raw) or self._extract_first_affaire_code(current_chantier_raw)
            normalized_affaire = extracted_from_noise or matched_code or normalized_affaire

        normalized_chantier = ""
        if current_chantier_raw and not self._looks_like_site(current_chantier_raw) and not self._looks_like_affaire_code(current_chantier_raw):
            normalized_chantier = current_chantier_raw
        elif current_affaire_raw and not self._looks_like_affaire_code(current_affaire_raw) and not self._looks_like_site(current_affaire_raw):
            normalized_chantier = current_affaire_raw
        elif ref_chantier:
            normalized_chantier = ref_chantier

        normalized_site = ""
        clean_site = self._clean_noisy_site(current_site_raw)
        if clean_site and self._looks_like_site(clean_site):
            normalized_site = clean_site
        elif current_chantier_raw and self._looks_like_site(current_chantier_raw):
            normalized_site = current_chantier_raw
        elif ref_site:
            normalized_site = ref_site

        row = dict(affaire)
        row["affaire_nge"] = self._stringify(normalized_affaire)
        row["chantier"] = self._stringify(normalized_chantier)
        row["site"] = self._stringify(normalized_site)
        row["raw_affaire_nge"] = current_affaire_raw
        row["raw_chantier"] = current_chantier_raw
        row["raw_site"] = current_site_raw
        return row

    def _clean_noisy_site(self, value: str) -> str:
        text = self._stringify(value)
        if not text:
            return ""
        lines = [line.strip() for line in re.split(r"[\r\n]+", text) if line.strip()]
        for line in lines:
            if self._looks_like_site(line):
                return line
        if " colonne " in text.lower():
            text = re.split(r"\bcolonne\b", text, flags=re.IGNORECASE)[0].strip()
        code = self._extract_first_affaire_code(text)
        if code:
            text = text.replace(code, " ").strip()
        # If the whole noisy text still contains an explicit site fragment at the end, keep only that fragment.
        for separator in [" à ", " au ", " aux "]:
            if separator in text:
                tail = text.rsplit(separator, 1)[1].strip()
                if self._looks_like_site(tail):
                    return tail
        return text if self._looks_like_site(text) else ""

    def _build_suggestion(self, affaire: dict[str, Any], match: dict[str, Any] | None) -> dict[str, str]:
        current_chantier = self._stringify(affaire.get("chantier", ""))
        current_site = self._stringify(affaire.get("site", ""))
        suggested_chantier = ""
        suggested_site = current_site

        if match:
            title_from_ref, site_from_ref = self._extract_chantier_and_site(match)
            suggested_chantier = title_from_ref
            if site_from_ref:
                suggested_site = site_from_ref

        if not suggested_site and current_site:
            suggested_site = current_site
        if not suggested_site and self._looks_like_site(current_chantier):
            suggested_site = current_chantier
        if not suggested_chantier and current_chantier and not self._looks_like_site(current_chantier):
            suggested_chantier = current_chantier

        return {
            "suggested_chantier": self._stringify(suggested_chantier),
            "suggested_site": self._stringify(suggested_site),
        }

    def _extract_chantier_and_site(self, match: dict[str, Any] | None) -> tuple[str, str]:
        if not match:
            return "", ""
        libelle = self._stringify(match.get("libellé", ""))
        if not libelle:
            return "", ""
        for separator in [" à ", " au ", " aux "]:
            if separator in libelle:
                left, right = libelle.rsplit(separator, 1)
                if self._looks_like_site(right):
                    return left.strip(), right.strip()
        return libelle, ""

    def _find_reference_candidates(
        self,
        rows: list[dict[str, Any]],
        code_query: str,
        title_query: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        code_key = self._normalize_affaire_key(code_query)
        title_tokens = [
            token for token in re.split(r"[^A-Za-zÀ-ÿ0-9]+", self._stringify(title_query).upper())
            if len(token) >= 4
        ]
        candidates: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in rows:
            score = 0
            matched_column = ""
            matched_code_raw = ""
            for column_name in REFERENCE_AFFAIRE_COLUMNS:
                raw_value = self._stringify(row.get(column_name, ""))
                normalized = self._normalize_affaire_key(raw_value)
                if code_key and normalized == code_key:
                    score += 100
                    matched_column = column_name
                    matched_code_raw = raw_value
                    break
                if code_key and code_key in normalized:
                    score += 40
                    matched_column = column_name
                    matched_code_raw = raw_value
            libelle = self._stringify(row.get("libellé", "")).upper()
            if title_tokens:
                token_hits = sum(1 for token in title_tokens if token in libelle)
                score += token_hits * 10
            if score <= 0:
                continue
            candidate_id = self._stringify(row.get("id", ""))
            if candidate_id in seen:
                continue
            seen.add(candidate_id)
            chantier_title, site_from_ref = self._extract_chantier_and_site(row)
            candidates.append({
                **row,
                "score": score,
                "matched_column": matched_column,
                "matched_code_raw": matched_code_raw,
                "suggested_chantier": chantier_title,
                "suggested_site": site_from_ref,
            })
        candidates.sort(key=lambda item: (-int(item.get("score", 0)), self._stringify(item.get("libellé", ""))))
        return candidates[:limit]

    def _find_reference_match(self, rows: list[dict[str, Any]], affaire_key: str) -> dict[str, Any] | None:
        if not affaire_key:
            return None
        for row in rows:
            for column_name in REFERENCE_AFFAIRE_COLUMNS:
                raw_value = self._stringify(row.get(column_name, ""))
                if self._normalize_affaire_key(raw_value) == affaire_key:
                    matched = dict(row)
                    matched["matched_column"] = column_name
                    matched["matched_code_raw"] = raw_value
                    return matched
        return None

    def _extract_affaire_codes(self, value: Any) -> list[str]:
        text = self._stringify(value).upper()
        if not text:
            return []
        patterns = [
            r"\bRA\s?[A-Z0-9]{2,6}\b",
            r"\bRAP\s?[A-Z0-9]{2,6}\b",
            r"\bRAO\s?[A-Z0-9]{2,6}\b",
            r"\bRAM\s?[A-Z0-9]{2,6}\b",
        ]
        found: list[str] = []
        for pattern in patterns:
            found.extend(re.findall(pattern, text))
        normalized_unique: list[str] = []
        seen: set[str] = set()
        for raw in found:
            cleaned = self._normalize_affaire_key(raw)
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                normalized_unique.append(raw.strip())
        return normalized_unique

    def _extract_first_affaire_code(self, value: Any) -> str:
        codes = self._extract_affaire_codes(value)
        return self._stringify(codes[0]) if codes else ""

    def _looks_like_affaire_code(self, value: str) -> bool:
        text = self._normalize_affaire_key(value)
        if not text:
            return False
        return bool(re.fullmatch(r"RA[A-Z0-9]{3,8}", text))

    def _normalize_affaire_key(self, value: str) -> str:
        text = self._stringify(value).upper()
        text = re.sub(r"[\s\-_/\\.]+", "", text)
        return text.strip()

    def _looks_like_site(self, value: str) -> bool:
        text = self._stringify(value)
        if not text:
            return False
        if re.search(r"\(\d{2,3}\)", text):
            return True
        words = [w for w in re.split(r"[^A-Za-zÀ-ÿ0-9]+", text.upper()) if w]
        if any(token in words for token in ["ST", "STE", "SAINT", "LYON", "CLERMONT", "RILLIEUX", "AUVERGNE", "RHONE", "ETIENNE"]):
            return True
        upper_ratio = sum(1 for char in text if char.isupper()) / max(len([c for c in text if c.isalpha()]), 1)
        if upper_ratio > 0.75 and len(words) <= 6:
            return True
        return False

    def _safe_scalar(self, conn: sqlite3.Connection, sql: str, default: int = 0) -> int:
        try:
            row = conn.execute(sql).fetchone()
            if row is None:
                return default
            return int(row[0])
        except sqlite3.Error:
            return default

    def _stringify(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

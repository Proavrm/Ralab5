from __future__ import annotations

import os
import re
import sqlite3
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class LegacyDemandeRow:
    legacy_id: int
    numero_demande: str
    numero_demande_base: str
    numero_dst: str
    demandeur: str
    date_demande: date | None
    affaire: str
    intitule_affaire: str
    etude: str
    intitule_etude: str
    region: str
    service: str
    prestation: str
    mission: str
    objet_demande: str
    etat: str
    attitre: str
    delai: str
    date_remise_souhaitee: date | None
    observations: str
    titre_dst: str
    titre_demande: str
    adresse: str
    ville: str
    departement: str
    dossier_candidates: list[Path]
    dossier_match_status: str
    dossier_selected: Path | None
    source_payload: dict[str, Any]


@dataclass(slots=True)
class LegacyImportReport:
    legacy_db_path: Path
    demandes_root: Path | None
    total_legacy_rows: int
    imported_rows: list[LegacyDemandeRow]
    exact_folder_matches: int
    missing_folder_matches: int
    ambiguous_folder_matches: int
    orphan_folders: list[Path]


class DemandesLegacyImporter:
    TABLE_NAME = "demandes"

    COL_ID = "id"
    COL_NUMERO_DEMANDE = "N° de la demande"
    COL_NUMERO_DEMANDE_BASE = "N° demande base"
    COL_NUMERO_DST = "N° DST"
    COL_DEMANDEUR = "Demandeur"
    COL_DATE_DEMANDE = "Date de la demande"
    COL_AFFAIRE = "affaire"
    COL_INTITULE_AFFAIRE = "Intitulé affaire"
    COL_ETUDE = "etude"
    COL_INTITULE_ETUDE = "IntituleEtude"
    COL_REGION = "Région"
    COL_SERVICE = "Service"
    COL_PRESTATION = "Prestation"
    COL_MISSION = "mission"
    COL_OBJET_DEMANDE = "Objet de la demande"
    COL_ETAT = "Etat"
    COL_ATTITRE = "Attitré"
    COL_DELAI = "Delai"
    COL_DATE_REMISE = "Date de remise du rapport souhaitée"
    COL_OBSERVATIONS = "Observations"
    COL_TITRE_DST = "Titulo DST"
    COL_TITRE_DEMANDE = "Titre Demande"
    COL_ADRESSE = "adresse"
    COL_VILLE = "ville"
    COL_DEPARTEMENT = "departement"

    def __init__(
        self,
        legacy_db_path: Path | None = None,
        demandes_root: Path | None = None,
    ) -> None:
        project_root = Path(__file__).resolve().parents[2]

        self.project_root = project_root
        self.legacy_db_path = legacy_db_path or (project_root / "data" / "legacy_demandes.db")
        self.explicit_demandes_root = demandes_root

    def run(self) -> LegacyImportReport:
        self._ensure_legacy_db_exists()

        raw_rows = self._read_legacy_rows()
        demandes_root = self.resolve_demandes_root()
        folders = self._scan_demandes_folders(demandes_root)

        imported_rows: list[LegacyDemandeRow] = []
        matched_folder_keys: set[str] = set()

        for row in raw_rows:
            imported_row = self._build_import_row(row=row, folders=folders)
            imported_rows.append(imported_row)

            for folder_path in imported_row.dossier_candidates:
                matched_folder_keys.add(str(folder_path).lower())

        orphan_folders = []
        for folder in folders:
            folder_key = str(folder).lower()
            if folder_key not in matched_folder_keys:
                orphan_folders.append(folder)

        exact_count = sum(1 for row in imported_rows if row.dossier_match_status == "EXACT")
        missing_count = sum(1 for row in imported_rows if row.dossier_match_status == "MISSING")
        ambiguous_count = sum(1 for row in imported_rows if row.dossier_match_status == "AMBIGUOUS")

        return LegacyImportReport(
            legacy_db_path=self.legacy_db_path,
            demandes_root=demandes_root,
            total_legacy_rows=len(raw_rows),
            imported_rows=imported_rows,
            exact_folder_matches=exact_count,
            missing_folder_matches=missing_count,
            ambiguous_folder_matches=ambiguous_count,
            orphan_folders=orphan_folders,
        )

    def resolve_demandes_root(self) -> Path | None:
        candidates: list[Path] = []

        if self.explicit_demandes_root is not None:
            candidates.append(self.explicit_demandes_root)

        env_value = os.environ.get("RALAB_DEMANDES_ROOT", "").strip()
        if env_value:
            candidates.append(Path(env_value))

        candidates.append(self.project_root / "01 - Demandes")
        candidates.append(Path.home() / "NGE" / "Labo ARS - Documents" / "01 - Demandes")
        candidates.append(Path.home() / "OneDrive" / "Área de Trabalho" / "Logiciels labo marco" / "RaLab4" / "01 - Demandes")

        seen: set[str] = set()

        for candidate in candidates:
            candidate_str = str(candidate).strip()
            if not candidate_str:
                continue

            normalized = candidate_str.lower()
            if normalized in seen:
                continue
            seen.add(normalized)

            if candidate.exists() and candidate.is_dir():
                return candidate

        return None

    def build_seed_payloads(self) -> list[dict[str, Any]]:
        report = self.run()

        payloads: list[dict[str, Any]] = []

        for row in report.imported_rows:
            payloads.append(
                {
                    "legacy_id": row.legacy_id,
                    "reference_base": self._compute_reference_base(
                        numero_demande=row.numero_demande,
                        numero_demande_base=row.numero_demande_base,
                    ),
                    "reference": self._build_display_reference(
                        numero_demande=row.numero_demande,
                        numero_demande_base=row.numero_demande_base,
                        titre_demande=row.titre_demande,
                        ville=row.ville,
                        departement=row.departement,
                    ),
                    "numero_demande": row.numero_demande,
                    "numero_demande_base": row.numero_demande_base,
                    "numero_dst": row.numero_dst,
                    "demandeur": row.demandeur,
                    "date_demande": row.date_demande,
                    "affaire": self._compute_affaire(
                        affaire=row.affaire,
                        intitule_affaire=row.intitule_affaire,
                        etude=row.etude,
                        intitule_etude=row.intitule_etude,
                    ),
                    "titre": self._compute_title(
                        titre_demande=row.titre_demande,
                        titre_dst=row.titre_dst,
                        objet_demande=row.objet_demande,
                    ),
                    "client": self._extract_client(
                        titre_demande=row.titre_demande,
                        intitule_affaire=row.intitule_affaire,
                        intitule_etude=row.intitule_etude,
                    ),
                    "chantier": self._compute_chantier(
                        ville=row.ville,
                        departement=row.departement,
                        adresse=row.adresse,
                    ),
                    "service": row.service,
                    "nature": self._compute_nature(
                        prestation=row.prestation,
                        mission=row.mission,
                    ),
                    "statut": row.etat or "À qualifier",
                    "laboratoire": row.attitre,
                    "priorite": self._compute_priorite(
                        delai=row.delai,
                        date_remise=row.date_remise_souhaitee,
                        etat=row.etat,
                    ),
                    "description": row.objet_demande,
                    "observations": row.observations,
                    "legacy_region": row.region,
                    "dossier_match_status": row.dossier_match_status,
                    "dossier_path": str(row.dossier_selected) if row.dossier_selected else None,
                    "source_payload": row.source_payload,
                }
            )

        return payloads

    def _build_import_row(self, row: sqlite3.Row, folders: list[Path]) -> LegacyDemandeRow:
        numero_demande = self._clean_text(row[self.COL_NUMERO_DEMANDE])
        numero_demande_base = self._clean_text(row[self.COL_NUMERO_DEMANDE_BASE])
        numero_dst = self._clean_text(row[self.COL_NUMERO_DST])

        dossier_candidates = self._match_folders(
            folders=folders,
            numero_demande=numero_demande,
            numero_demande_base=numero_demande_base,
            titre_demande=self._clean_text(row[self.COL_TITRE_DEMANDE]),
            ville=self._clean_text(row[self.COL_VILLE]),
            departement=self._clean_text(row[self.COL_DEPARTEMENT]),
        )

        if len(dossier_candidates) == 1:
            dossier_status = "EXACT"
            dossier_selected = dossier_candidates[0]
        elif len(dossier_candidates) == 0:
            dossier_status = "MISSING"
            dossier_selected = None
        else:
            dossier_status = "AMBIGUOUS"
            dossier_selected = None

        return LegacyDemandeRow(
            legacy_id=int(row[self.COL_ID]),
            numero_demande=numero_demande,
            numero_demande_base=numero_demande_base,
            numero_dst=numero_dst,
            demandeur=self._clean_text(row[self.COL_DEMANDEUR]),
            date_demande=self._parse_date(row[self.COL_DATE_DEMANDE]),
            affaire=self._clean_text(row[self.COL_AFFAIRE]),
            intitule_affaire=self._clean_text(row[self.COL_INTITULE_AFFAIRE]),
            etude=self._clean_text(row[self.COL_ETUDE]),
            intitule_etude=self._clean_text(row[self.COL_INTITULE_ETUDE]),
            region=self._clean_text(row[self.COL_REGION]),
            service=self._clean_text(row[self.COL_SERVICE]),
            prestation=self._clean_text(row[self.COL_PRESTATION]),
            mission=self._clean_text(row[self.COL_MISSION]),
            objet_demande=self._clean_text(row[self.COL_OBJET_DEMANDE]),
            etat=self._clean_text(row[self.COL_ETAT]),
            attitre=self._clean_text(row[self.COL_ATTITRE]),
            delai=self._clean_text(row[self.COL_DELAI]),
            date_remise_souhaitee=self._parse_date(row[self.COL_DATE_REMISE]),
            observations=self._clean_text(row[self.COL_OBSERVATIONS]),
            titre_dst=self._clean_text(row[self.COL_TITRE_DST]),
            titre_demande=self._clean_text(row[self.COL_TITRE_DEMANDE]),
            adresse=self._clean_text(row[self.COL_ADRESSE]),
            ville=self._clean_text(row[self.COL_VILLE]),
            departement=self._clean_text(row[self.COL_DEPARTEMENT]),
            dossier_candidates=dossier_candidates,
            dossier_match_status=dossier_status,
            dossier_selected=dossier_selected,
            source_payload={key: row[key] for key in row.keys()},
        )

    def _match_folders(
        self,
        folders: list[Path],
        numero_demande: str,
        numero_demande_base: str,
        titre_demande: str,
        ville: str,
        departement: str,
    ) -> list[Path]:
        if not folders:
            return []

        strong_keys: list[str] = []
        if numero_demande:
            strong_keys.append(numero_demande)
        if numero_demande_base and numero_demande_base not in strong_keys:
            strong_keys.append(numero_demande_base)

        exact_matches: list[Path] = []

        for folder in folders:
            folder_name = folder.name

            for key in strong_keys:
                if self._folder_starts_with_reference(folder_name, key):
                    exact_matches.append(folder)
                    break

        exact_matches = self._deduplicate_paths(exact_matches)

        if len(exact_matches) <= 1:
            return exact_matches

        narrowed_matches = self._narrow_matches_with_context(
            matches=exact_matches,
            titre_demande=titre_demande,
            ville=ville,
            departement=departement,
        )

        if narrowed_matches:
            return narrowed_matches

        return exact_matches

    def _narrow_matches_with_context(
        self,
        matches: list[Path],
        titre_demande: str,
        ville: str,
        departement: str,
    ) -> list[Path]:
        title_tokens = self._tokenize_for_match(titre_demande)
        city_tokens = self._tokenize_for_match(self._normalize_city_department(ville, departement))

        scored: list[tuple[int, Path]] = []

        for folder in matches:
            folder_tokens = self._tokenize_for_match(folder.name)
            score = 0

            for token in title_tokens:
                if token in folder_tokens:
                    score += 3

            for token in city_tokens:
                if token in folder_tokens:
                    score += 2

            scored.append((score, folder))

        if not scored:
            return []

        best_score = max(score for score, _ in scored)
        if best_score <= 0:
            return []

        best_matches = [folder for score, folder in scored if score == best_score]
        return self._deduplicate_paths(best_matches)

    def _scan_demandes_folders(self, demandes_root: Path | None) -> list[Path]:
        if demandes_root is None:
            return []

        folders = [path for path in demandes_root.iterdir() if path.is_dir()]
        folders.sort(key=lambda path: path.name.lower())
        return folders

    def _read_legacy_rows(self) -> list[sqlite3.Row]:
        with self._connect_legacy() as connection:
            rows = connection.execute(
                f"""
                SELECT *
                FROM "{self.TABLE_NAME}"
                ORDER BY "{self.COL_ID}" ASC
                """
            ).fetchall()

        return rows

    def _connect_legacy(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.legacy_db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_legacy_db_exists(self) -> None:
        if not self.legacy_db_path.exists():
            raise FileNotFoundError(f"Base legacy introuvable: {self.legacy_db_path}")

        with self._connect_legacy() as connection:
            exists = connection.execute(
                """
                SELECT 1
                FROM sqlite_master
                WHERE type = 'table' AND name = ?
                """,
                (self.TABLE_NAME,),
            ).fetchone()

        if exists is None:
            raise RuntimeError(f'Table "{self.TABLE_NAME}" introuvable dans {self.legacy_db_path}')

    def _compute_reference_base(self, numero_demande: str, numero_demande_base: str) -> str:
        numero_demande = (numero_demande or "").strip()
        numero_demande_base = (numero_demande_base or "").strip()

        if numero_demande_base:
            return numero_demande_base

        if numero_demande:
            return numero_demande

        return ""

    def _compute_affaire(
        self,
        affaire: str,
        intitule_affaire: str,
        etude: str,
        intitule_etude: str,
    ) -> str:
        for candidate in [affaire, intitule_affaire, etude, intitule_etude]:
            text = (candidate or "").strip()
            if text:
                return text
        return "Non communiqué"

    def _compute_title(self, titre_demande: str, titre_dst: str, objet_demande: str) -> str:
        for candidate in [titre_demande, titre_dst, objet_demande]:
            text = (candidate or "").strip()
            if text:
                return text
        return "Non communiqué"

    def _compute_nature(self, prestation: str, mission: str) -> str:
        for candidate in [prestation, mission]:
            text = (candidate or "").strip()
            if text:
                return text
        return "Non communiqué"

    def _compute_chantier(self, ville: str, departement: str, adresse: str) -> str:
        parts: list[str] = []

        city_part = self._normalize_city_department(ville, departement)
        if city_part:
            parts.append(city_part)

        adresse = (adresse or "").strip()
        if adresse:
            parts.append(adresse)

        if parts:
            return " - ".join(parts)

        return "Non communiqué"

    def _compute_priorite(self, delai: str, date_remise: date | None, etat: str) -> str:
        delai_lower = self._normalize_text(delai)
        etat_lower = self._normalize_text(etat)

        if any(token in delai_lower for token in ["urgent", "asap", "au plus vite", "immediat"]):
            return "Critique"

        if date_remise is not None:
            delta_days = (date_remise - date.today()).days
            if delta_days <= 2:
                return "Critique"
            if delta_days <= 7:
                return "Haute"
            if delta_days <= 21:
                return "Normale"
            return "Basse"

        if etat_lower in {"en cours", "bloquee", "bloqué", "bloquee "}:
            return "Haute"

        return "Normale"

    def _extract_client(self, titre_demande: str, intitule_affaire: str, intitule_etude: str) -> str:
        candidates = [titre_demande, intitule_affaire, intitule_etude]

        for candidate in candidates:
            text = (candidate or "").strip()
            if not text:
                continue

            parts = [part.strip() for part in text.split(" - ") if part.strip()]
            if len(parts) >= 2:
                return parts[0]

        return "Non communiqué"

    def _build_display_reference(
        self,
        numero_demande: str,
        numero_demande_base: str,
        titre_demande: str,
        ville: str,
        departement: str,
    ) -> str:
        head = numero_demande or numero_demande_base
        parts = [head] if head else []

        chantier = self._normalize_city_department(ville, departement)
        if chantier:
            parts.append(chantier)

        titre_demande = (titre_demande or "").strip()
        if titre_demande:
            parts.append(titre_demande)

        return " - ".join(parts)

    def _normalize_city_department(self, ville: str, departement: str) -> str:
        ville_clean = self._clean_location_piece(ville)
        departement_clean = self._clean_location_piece(departement)

        if ville_clean and departement_clean:
            if departement_clean in ville_clean:
                return ville_clean
            return f"{ville_clean} {departement_clean}".strip()

        return ville_clean or departement_clean

    def _clean_location_piece(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            return ""

        text = text.replace("[", "(").replace("]", ")")
        text = re.sub(r"\(\(+", "(", text)
        text = re.sub(r"\)+", ")", text)
        text = re.sub(r"\s+", " ", text).strip()

        if re.fullmatch(r"\d{2,3}", text):
            return f"({text})"

        return text

    def _folder_starts_with_reference(self, folder_name: str, reference: str) -> bool:
        folder_norm = self._normalize_text(folder_name)
        ref_norm = self._normalize_text(reference)

        if not ref_norm:
            return False

        if folder_norm == ref_norm:
            return True

        for separator in [" - ", "_", " ", "."]:
            if folder_norm.startswith(ref_norm + separator.strip()):
                return True

        if folder_norm.startswith(ref_norm + "-"):
            return True

        if folder_norm.startswith(ref_norm + "_"):
            return True

        if folder_norm.startswith(ref_norm + " "):
            return True

        return False

    def _tokenize_for_match(self, text: str) -> set[str]:
        normalized = self._normalize_text(text)
        normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
        tokens = {token for token in normalized.split() if len(token) >= 3}
        return tokens

    def _deduplicate_paths(self, paths: list[Path]) -> list[Path]:
        seen: set[str] = set()
        unique_paths: list[Path] = []

        for path in paths:
            key = str(path).lower()
            if key in seen:
                continue
            seen.add(key)
            unique_paths.append(path)

        return unique_paths

    def _parse_date(self, value: Any) -> date | None:
        if value is None:
            return None

        if isinstance(value, datetime):
            return value.date()

        if isinstance(value, date):
            return value

        text = str(value).strip()
        if not text:
            return None

        formats = [
            "%Y-%m-%d",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y",
            "%d/%m/%y",
            "%d-%m-%Y",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue

        return None

    def _clean_text(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _normalize_text(self, value: str) -> str:
        text = unicodedata.normalize("NFKD", value or "")
        text = "".join(ch for ch in text if not unicodedata.combining(ch))
        text = text.lower()
        text = text.replace("’", "'")
        text = re.sub(r"\s+", " ", text).strip()
        return text
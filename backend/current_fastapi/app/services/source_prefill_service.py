"""
File: source_prefill_service.py
Purpose: Build source-based prefill payloads for Affaires RST and Demandes.
"""
from __future__ import annotations

import re
import sqlite3
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Any

from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.dst_repository import DstRepository


class SourcePrefillService:
    def __init__(self) -> None:
        root_dir = Path(__file__).resolve().parents[2]
        data_dir = root_dir / "data"
        self.affaires_db_path = data_dir / "affaires.db"
        self.etudes_db_path = data_dir / "etudes.db"
        self.dst_repo = DstRepository(data_dir / "dst.db")
        self.affaires_rst_repo = AffairesRstRepository()

    def build_affaire_prefill(self, source_type: str, source_id: int) -> dict[str, Any]:
        source_type = (source_type or "").strip().lower()
        source_id = int(source_id or 0)

        if source_type == "dst":
            return self._build_affaire_prefill_from_dst(source_id)
        if source_type == "affaire_nge":
            return self._build_affaire_prefill_from_affaire_nge(source_id)
        if source_type == "etude":
            return self._build_affaire_prefill_from_etude(source_id)

        raise ValueError(f"Unsupported source type: {source_type}")

    def enrich_affaire_payload(self, payload: dict[str, Any], source_type: str | None, source_id: int | None) -> dict[str, Any]:
        result = deepcopy(payload)
        if not source_type or not source_id:
            return result

        prefill = self.build_affaire_prefill(source_type, int(source_id))
        fields = prefill.get("affaire", {})
        for key, value in fields.items():
            if key in {"source_type", "source_id", "source_label"}:
                continue
            if self._is_empty(result.get(key)):
                result[key] = value
        return result

    def build_demande_prefill(self, source_type: str, source_id: int) -> dict[str, Any]:
        source_type = (source_type or "").strip().lower()
        source_id = int(source_id or 0)

        if source_type == "dst":
            return self._build_demande_prefill_from_dst(source_id)
        if source_type == "affaire_nge":
            return self._build_demande_prefill_from_affaire_nge(source_id)
        if source_type == "etude":
            return self._build_demande_prefill_from_etude(source_id)

        raise ValueError(f"Unsupported source type: {source_type}")

    def enrich_demande_payload(self, payload: dict[str, Any], source_type: str | None, source_id: int | None) -> dict[str, Any]:
        result = deepcopy(payload)
        if not source_type or not source_id:
            return result

        prefill = self.build_demande_prefill(source_type, int(source_id))
        fields = prefill.get("demande", {})
        for key, value in fields.items():
            if key in {"source_type", "source_id", "source_label", "match", "source_resume"}:
                continue
            if key == "affaire_rst_id":
                if not result.get("affaire_rst_id") and value:
                    result["affaire_rst_id"] = value
                continue
            if self._is_empty(result.get(key)):
                result[key] = value
        return result

    def _build_affaire_prefill_from_dst(self, source_id: int) -> dict[str, Any]:
        record = self.dst_repo.get_by_id(source_id)
        if not record:
            raise LookupError(f"DST #{source_id} introuvable")

        affaire_nge = record.first_text("N° affaire demandeur")
        chantier = record.first_text("Libellé du projet")
        site = record.first_text("Situation Géographique", "Situation géographique projet")
        client = record.first_text("Société")
        return {
            "source_type": "dst",
            "source_id": source_id,
            "affaire": {
                "source_type": "dst",
                "source_id": source_id,
                "source_label": record.first_text("N° chrono") or f"DST #{source_id}",
                "client": client,
                "chantier": chantier,
                "site": site,
                "numero_etude": "",
                "affaire_nge": affaire_nge,
                "filiale": "",
                "titulaire": "",
                "responsable": "",
                "statut": "À qualifier",
                "date_ouverture": self._today_iso(),
            },
        }

    def _build_affaire_prefill_from_affaire_nge(self, source_id: int) -> dict[str, Any]:
        row = self._get_affaire_nge_by_id(source_id)
        if not row:
            raise LookupError(f"Affaire NGE #{source_id} introuvable")

        numero_affaire_complet = self._build_affaire_nge_full_code(row)
        return {
            "source_type": "affaire_nge",
            "source_id": source_id,
            "affaire": {
                "source_type": "affaire_nge",
                "source_id": source_id,
                "source_label": numero_affaire_complet or self._txt(row.get("n°affaire")),
                "client": "",
                "chantier": self._txt(row.get("libellé")),
                "site": "",
                "numero_etude": "",
                "affaire_nge": numero_affaire_complet,
                "filiale": "",
                "titulaire": self._txt(row.get("titulaire")),
                "responsable": self._txt(row.get("responsable")),
                "statut": "À qualifier",
                "date_ouverture": self._today_iso(),
            },
        }

    def _build_affaire_prefill_from_etude(self, source_id: int) -> dict[str, Any]:
        row = self._get_etude_by_id(source_id)
        if not row:
            raise LookupError(f"Étude #{source_id} introuvable")

        return {
            "source_type": "etude",
            "source_id": source_id,
            "affaire": {
                "source_type": "etude",
                "source_id": source_id,
                "source_label": self._txt(row.get("nAffaire")),
                "client": "",
                "chantier": self._txt(row.get("nomAffaire")),
                "site": self._format_site(row.get("ville"), row.get("dept")),
                "numero_etude": self._txt(row.get("nAffaire")),
                "affaire_nge": "",
                "filiale": self._txt(row.get("filiale")),
                "titulaire": "",
                "responsable": "",
                "statut": "À qualifier",
                "date_ouverture": self._today_iso(),
            },
        }

    def _build_demande_prefill_from_dst(self, source_id: int) -> dict[str, Any]:
        record = self.dst_repo.get_by_id(source_id)
        if not record:
            raise LookupError(f"DST #{source_id} introuvable")

        numero_dst = record.first_text("N° chrono")
        chantier = record.first_text("Libellé du projet")
        site = record.first_text("Situation Géographique", "Situation géographique projet")
        demandeur = record.first_text("Demandeur").split(",")[0].strip()
        affaire_nge = record.first_text("N° affaire demandeur")
        objet = self._clean_multiline(record.first_text("Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)"))
        description_parts = [f"DST: {numero_dst}" if numero_dst else "", chantier, objet]
        description = "\n".join([part for part in description_parts if part])

        affaire_match = self._find_affaire_rst_by_affaire_nge(affaire_nge)
        return {
            "source_type": "dst",
            "source_id": source_id,
            "demande": {
                "source_type": "dst",
                "source_id": source_id,
                "source_label": numero_dst or f"DST #{source_id}",
                "affaire_rst_id": affaire_match["uid"] if affaire_match else None,
                "labo_code": "SP",
                "numero_dst": numero_dst,
                "type_mission": "À définir",
                "nature": record.first_text("Cadre de la demande") or "Demande DST",
                "description": description,
                "observations": f"Demande préparée depuis DST {numero_dst}" if numero_dst else "Demande préparée depuis DST",
                "demandeur": demandeur,
                "date_reception": self._today_iso(),
                "date_echeance": self._to_iso_date(record.first_text("Remise souhaitée", "Echéance estimée", "Echéance")),
                "statut": "À qualifier",
                "priorite": "Normale",
                "match": affaire_match,
                "source_resume": {
                    "chantier": chantier,
                    "site": site,
                    "client_suggestion": record.first_text("Société"),
                    "affaire_nge": affaire_nge,
                },
            },
        }

    def _build_demande_prefill_from_affaire_nge(self, source_id: int) -> dict[str, Any]:
        row = self._get_affaire_nge_by_id(source_id)
        if not row:
            raise LookupError(f"Affaire NGE #{source_id} introuvable")

        affaire_nge = self._build_affaire_nge_full_code(row)
        chantier = self._txt(row.get("libellé"))
        titulaire = self._txt(row.get("titulaire"))
        responsable = self._txt(row.get("responsable"))
        affaire_match = self._find_affaire_rst_by_affaire_nge(affaire_nge)

        description_parts = [
            f"Préremplie depuis Affaires NGE {affaire_nge}" if affaire_nge else "Préremplie depuis Affaires NGE",
            chantier,
            f"Titulaire: {titulaire}" if titulaire else "",
            f"Responsable: {responsable}" if responsable else "",
        ]
        description = "\n".join([part for part in description_parts if part])

        return {
            "source_type": "affaire_nge",
            "source_id": source_id,
            "demande": {
                "source_type": "affaire_nge",
                "source_id": source_id,
                "source_label": affaire_nge or f"Affaire NGE #{source_id}",
                "affaire_rst_id": affaire_match["uid"] if affaire_match else None,
                "labo_code": "SP",
                "numero_dst": "",
                "type_mission": "À définir",
                "nature": "Demande liée à affaire NGE",
                "description": description,
                "observations": "",
                "demandeur": responsable,
                "date_reception": self._today_iso(),
                "date_echeance": None,
                "statut": "À qualifier",
                "priorite": "Normale",
                "match": affaire_match,
                "source_resume": {
                    "chantier": chantier,
                    "site": "",
                    "client_suggestion": "",
                    "affaire_nge": affaire_nge,
                    "titulaire": titulaire,
                },
            },
        }

    def _build_demande_prefill_from_etude(self, source_id: int) -> dict[str, Any]:
        row = self._get_etude_by_id(source_id)
        if not row:
            raise LookupError(f"Étude #{source_id} introuvable")

        numero_etude = self._txt(row.get("nAffaire"))
        chantier = self._txt(row.get("nomAffaire"))
        site = self._format_site(row.get("ville"), row.get("dept"))
        filiale = self._txt(row.get("filiale"))
        resp_etude = self._txt(row.get("respEtude"))
        affaire_match = self._find_affaire_rst_by_numero_etude(numero_etude)

        description_parts = [
            f"Préremplie depuis Études {numero_etude}" if numero_etude else "Préremplie depuis Études",
            chantier,
            site,
        ]
        description = "\n".join([part for part in description_parts if part])

        return {
            "source_type": "etude",
            "source_id": source_id,
            "demande": {
                "source_type": "etude",
                "source_id": source_id,
                "source_label": numero_etude or f"Étude #{source_id}",
                "affaire_rst_id": affaire_match["uid"] if affaire_match else None,
                "labo_code": "SP",
                "numero_dst": "",
                "type_mission": "À définir",
                "nature": "Demande liée à étude",
                "description": description,
                "observations": "",
                "demandeur": resp_etude,
                "date_reception": self._today_iso(),
                "date_echeance": self._to_iso_date(self._txt(row.get("dateReceptionDossier"))),
                "statut": "À qualifier",
                "priorite": "Normale",
                "match": affaire_match,
                "source_resume": {
                    "chantier": chantier,
                    "site": site,
                    "client_suggestion": "",
                    "numero_etude": numero_etude,
                    "filiale": filiale,
                },
            },
        }

    def _find_affaire_rst_by_affaire_nge(self, affaire_nge: str) -> dict[str, Any] | None:
        numero = self._normalize_affaire_key(affaire_nge)
        if not numero:
            return None
        with self.affaires_rst_repo._connect() as conn:  # noqa: SLF001 - controlled internal use
            rows = conn.execute(
                """
                SELECT id, reference, chantier, affaire_nge
                FROM affaires_rst
                WHERE TRIM(COALESCE(affaire_nge, '')) <> ''
                ORDER BY id DESC
                """
            ).fetchall()
        for row in rows:
            if self._normalize_affaire_key(row["affaire_nge"]) == numero:
                return {"uid": int(row["id"]), "reference": row["reference"], "chantier": row["chantier"] or ""}
        return None

    def _find_affaire_rst_by_numero_etude(self, numero_etude: str) -> dict[str, Any] | None:
        numero = self._txt(numero_etude)
        if not numero:
            return None
        with self.affaires_rst_repo._connect() as conn:  # noqa: SLF001 - controlled internal use
            row = conn.execute(
                """
                SELECT id, reference, chantier
                FROM affaires_rst
                WHERE TRIM(COALESCE(numero_etude, '')) = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (numero,),
            ).fetchone()
        if not row:
            return None
        return {"uid": int(row["id"]), "reference": row["reference"], "chantier": row["chantier"] or ""}

    def _get_affaire_nge_by_id(self, row_id: int) -> dict[str, Any] | None:
        if not self.affaires_db_path.exists():
            return None
        with sqlite3.connect(str(self.affaires_db_path)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute('SELECT * FROM affaires WHERE id = ?', (row_id,)).fetchone()
        return dict(row) if row else None

    def _get_etude_by_id(self, row_id: int) -> dict[str, Any] | None:
        if not self.etudes_db_path.exists():
            return None
        with sqlite3.connect(str(self.etudes_db_path)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute('SELECT * FROM etudes WHERE id = ?', (row_id,)).fetchone()
        return dict(row) if row else None

    @staticmethod
    def _today_iso() -> str:
        return date.today().isoformat()

    @staticmethod
    def _txt(value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @classmethod
    def _is_empty(cls, value: Any) -> bool:
        return cls._txt(value) == ""

    @classmethod
    def _format_site(cls, ville: Any, dept: Any) -> str:
        ville_txt = cls._txt(ville)
        dept_txt = cls._txt(dept)
        if ville_txt and dept_txt:
            if dept_txt.startswith("(") and dept_txt.endswith(")"):
                return f"{ville_txt} {dept_txt}".strip()
            return f"{ville_txt} ({dept_txt})".strip()
        return ville_txt or dept_txt

    @classmethod
    def _clean_multiline(cls, value: str) -> str:
        text = cls._txt(value)
        if not text:
            return ""
        return text.replace("_x000D_\n", "\n").replace("_x000d_\n", "\n").strip()

    @classmethod
    def _to_iso_date(cls, value: Any) -> str | None:
        text = cls._txt(value)
        if not text:
            return None

        from datetime import datetime

        candidates = (
            "%Y-%m-%d",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y",
            "%d-%m-%Y",
        )
        for source_fmt in candidates:
            try:
                parsed = datetime.strptime(text[:19], source_fmt)
                return parsed.strftime("%Y-%m-%d")
            except Exception:
                continue
        return None

    @classmethod
    def _clean_affaire_code(cls, value: Any) -> str:
        return cls._txt(value).replace("*", "")

    @classmethod
    def _build_affaire_nge_full_code(cls, row: dict[str, Any]) -> str:
        if not row:
            return ""
        for key in ("gsa", "ehtp", "nge_routes", "nge_gc", "lyaudet", "nge_e.s.", "nge_transitions"):
            code = cls._clean_affaire_code(row.get(key))
            if code:
                return code
        raw = cls._txt(row.get("n°affaire"))
        if not raw:
            return ""
        code_agence = cls._txt(row.get("code_agence"))
        return f"RA{raw}{code_agence}".upper()

    @classmethod
    def _normalize_affaire_key(cls, value: Any) -> str:
        text = cls._clean_affaire_code(value).upper()
        text = re.sub(r"[\s\-_/\.]+", "", text)
        return text.strip()

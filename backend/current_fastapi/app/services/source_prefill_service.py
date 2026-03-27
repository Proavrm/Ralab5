"""
app/services/source_prefill_service.py — RaLab4
Build prefill payloads for source pages and popup creation flows.
"""
from __future__ import annotations

from typing import Any

from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.dst_repository import DstRepository
from app.repositories.reference_affaires_repository import ReferenceAffairesRepository
from app.repositories.reference_etudes_repository import ReferenceEtudesRepository


class SourcePrefillService:
    def __init__(self) -> None:
        self.affaires_rst_repo = AffairesRstRepository()
        self.dst_repo = DstRepository()
        self.ref_aff_repo = ReferenceAffairesRepository()
        self.ref_etu_repo = ReferenceEtudesRepository()

    @staticmethod
    def _text(value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @staticmethod
    def _site(ville: Any, dept: Any) -> str:
        ville_txt = SourcePrefillService._text(ville)
        dept_txt = SourcePrefillService._text(dept)
        if ville_txt and dept_txt and f"({dept_txt})" not in ville_txt:
            return f"{ville_txt} ({dept_txt})"
        return ville_txt or (f"({dept_txt})" if dept_txt else "")

    def _match_affaire_uid(self, *, affaire_nge: str = "", numero_etude: str = "") -> int | None:
        if affaire_nge:
            match = self.affaires_rst_repo.find_by_affaire_nge(affaire_nge)
            if match:
                return match.uid
        if numero_etude:
            match = self.affaires_rst_repo.find_by_numero_etude(numero_etude)
            if match:
                return match.uid
        return None

    def affaire_prefill_from_affaire_nge(self, row_id: str) -> dict[str, Any]:
        row = self.ref_aff_repo.get_row(row_id)
        if not row:
            raise KeyError(row_id)
        return {
            "source": {"type": "affaire_nge", "id": self._text(row.get("id"))},
            "affaire": {
                "client": "",
                "chantier": self._text(row.get("libellé")),
                "site": "",
                "numero_etude": "",
                "affaire_nge": self._text(row.get("n°affaire")),
                "titulaire": self._text(row.get("titulaire")),
                "responsable": self._text(row.get("responsable")),
                "filiale": "",
                "statut": "À qualifier",
            },
        }

    def demande_prefill_from_affaire_nge(self, row_id: str) -> dict[str, Any]:
        row = self.ref_aff_repo.get_row(row_id)
        if not row:
            raise KeyError(row_id)
        affaire_nge = self._text(row.get("n°affaire"))
        matched_uid = self._match_affaire_uid(affaire_nge=affaire_nge)
        chantier = self._text(row.get("libellé"))
        titulaire = self._text(row.get("titulaire"))
        responsable = self._text(row.get("responsable"))
        description = "\n".join([x for x in [chantier, f"Titulaire: {titulaire}" if titulaire else "", f"Responsable affaire NGE: {responsable}" if responsable else ""] if x])
        return {
            "source": {"type": "affaire_nge", "id": self._text(row.get("id"))},
            "demande": {
                "affaire_rst_id": matched_uid,
                "numero_dst": "",
                "type_mission": "À définir",
                "nature": "Demande affaire NGE",
                "description": description,
                "observations": f"Demande ouverte depuis Affaires NGE {affaire_nge}" if affaire_nge else "Demande ouverte depuis Affaires NGE",
                "demandeur": responsable,
            },
        }

    def affaire_prefill_from_etude(self, row_id: int) -> dict[str, Any]:
        row = self.ref_etu_repo.get_row(row_id)
        if not row:
            raise KeyError(row_id)
        return {
            "source": {"type": "etude", "id": int(row.get("id"))},
            "affaire": {
                "client": "",
                "chantier": self._text(row.get("nomAffaire")),
                "site": self._site(row.get("ville"), row.get("dept")),
                "numero_etude": self._text(row.get("nAffaire")),
                "affaire_nge": "",
                "titulaire": "",
                "responsable": self._text(row.get("respEtude")),
                "filiale": self._text(row.get("filiale")),
                "statut": "À qualifier",
            },
        }

    def demande_prefill_from_etude(self, row_id: int) -> dict[str, Any]:
        row = self.ref_etu_repo.get_row(row_id)
        if not row:
            raise KeyError(row_id)
        numero_etude = self._text(row.get("nAffaire"))
        matched_uid = self._match_affaire_uid(numero_etude=numero_etude)
        chantier = self._text(row.get("nomAffaire"))
        site = self._site(row.get("ville"), row.get("dept"))
        filiale = self._text(row.get("filiale"))
        maitre_ouvrage = self._text(row.get("maitreOuvrage"))
        description = "\n".join([x for x in [chantier, site, f"Filiale: {filiale}" if filiale else "", f"MOA: {maitre_ouvrage}" if maitre_ouvrage else ""] if x])
        return {
            "source": {"type": "etude", "id": int(row.get("id"))},
            "demande": {
                "affaire_rst_id": matched_uid,
                "numero_dst": "",
                "type_mission": "À définir",
                "nature": "Demande étude",
                "description": description,
                "observations": f"Demande ouverte depuis Études {numero_etude}" if numero_etude else "Demande ouverte depuis Études",
                "demandeur": self._text(row.get("respEtude")),
            },
        }

    def affaire_prefill_from_dst(self, row_id: int) -> dict[str, Any]:
        record = self.dst_repo.get_by_id(row_id)
        if not record:
            raise KeyError(row_id)
        data = record.data
        return {
            "source": {"type": "dst", "id": record.row_id},
            "affaire": {
                "client": self._text(data.get("Société")),
                "chantier": self._text(data.get("Libellé du projet")),
                "site": self._text(data.get("Situation Géographique") or data.get("Situation géographique projet")),
                "numero_etude": "",
                "affaire_nge": self._text(data.get("N° affaire demandeur")),
                "titulaire": "",
                "responsable": self._text(data.get("Demandeur")),
                "filiale": "",
                "statut": "À qualifier",
            },
        }

    def demande_prefill_from_dst(self, row_id: int) -> dict[str, Any]:
        record = self.dst_repo.get_by_id(row_id)
        if not record:
            raise KeyError(row_id)
        data = record.data
        affaire_nge = self._text(data.get("N° affaire demandeur"))
        matched_uid = self._match_affaire_uid(affaire_nge=affaire_nge)
        objet = self._text(data.get("Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)") or data.get("Objet"))
        description = "\n".join([x for x in [self._text(data.get("Libellé du projet")), objet] if x])
        return {
            "source": {"type": "dst", "id": record.row_id},
            "demande": {
                "affaire_rst_id": matched_uid,
                "numero_dst": self._text(data.get("N° chrono") or data.get("Numéro dossier DST")),
                "type_mission": "À définir",
                "nature": self._text(data.get("Cadre de la demande")) or "Demande DST",
                "description": description,
                "observations": f"Demande ouverte depuis DST {self._text(data.get('N° chrono') or data.get('Numéro dossier DST'))}".strip(),
                "demandeur": self._text(data.get("Demandeur")),
            },
        }

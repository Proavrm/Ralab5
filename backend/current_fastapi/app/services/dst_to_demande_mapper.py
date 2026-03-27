from __future__ import annotations

from datetime import date, datetime
from typing import Any

from app.models.demande import DemandeRecord
from app.repositories.demandes_repository import DemandesRepository
from app.repositories.dst_repository import DstRecord


class DstToDemandeMapper:
    PLACEHOLDER_AFFAIRE = "Non communiqué"
    PLACEHOLDER_CLIENT = "Non communiqué"

    @classmethod
    def build_demande(
        cls,
        uid: int,
        demande_reference: str,
        dst_record: DstRecord,
    ) -> DemandeRecord:
        chrono = dst_record.first_text("N° chrono", "Numéro dossier DST")
        affaire_etude = dst_record.first_text("N° affaire demandeur") or cls.PLACEHOLDER_AFFAIRE
        titre = dst_record.first_text("Libellé du projet") or "Non communiqué"
        demandeur = dst_record.first_text("Demandeur")
        chantier_site = dst_record.first_text("Situation Géographique") or "Non communiqué"
        service_dst = dst_record.first_text("Service DST")
        direction_regionale = dst_record.first_text("Direction régionale")
        objet_demande = dst_record.first_text("Objet de la demande")
        ouverture = dst_record.first_value("Ouverture")

        date_demande = cls._parse_date(ouverture) or date.today()

        description_parts: list[str] = [f"Titre DST: {titre}"]

        if objet_demande:
            description_parts.append("")
            description_parts.append(objet_demande)

        if direction_regionale:
            description_parts.append("")
            description_parts.append(f"Direction régionale: {direction_regionale}")

        if service_dst:
            description_parts.append(f"Service DST: {service_dst}")

        description = "\n".join(description_parts).strip()

        observations_parts: list[str] = [
            "Demande pré-remplie depuis la base DST.",
        ]

        if chrono:
            observations_parts.append(f"Référence DST source: {chrono}")

        observations = "\n".join(observations_parts).strip()

        client = cls.PLACEHOLDER_CLIENT
        reference = DemandesRepository.build_full_reference(
            reference_base=demande_reference,
            affaire=affaire_etude,
            chantier=chantier_site,
            client=client,
            titre=titre,
        )

        return DemandeRecord(
            uid=uid,
            reference_base=demande_reference,
            reference=reference,
            affaire=affaire_etude,
            titre=titre,
            client=client,
            chantier=chantier_site,
            numero_dst=chrono,
            nature="Demande DST",
            statut="À qualifier",
            demandeur=demandeur,
            service=service_dst or "DST",
            laboratoire="À définir",
            date_demande=date_demande,
            echeance=None,
            priorite="Normale",
            description=description,
            observations=observations,
        )

    @staticmethod
    def _parse_date(value: Any) -> date | None:
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
            "%d/%m/%Y",
            "%Y-%m-%d",
            "%d-%m-%Y",
            "%d/%m/%y",
            "%Y/%m/%d",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue

        return None
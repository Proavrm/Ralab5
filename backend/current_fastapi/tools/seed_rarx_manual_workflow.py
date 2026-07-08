#!/usr/bin/env python3
"""
Simule le flux passation → demande → préparation → campagnes → interventions
— DESACTIVÉ par défaut.

Usage autorisé uniquement sur demande explicite de l'utilisateur:
  python tools/seed_rarx_manual_workflow.py --allow-manual-mimic
  python tools/seed_rarx_manual_workflow.py --allow-manual-mimic --passation-id 2 --dry-run
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools._manual_entry_guard import GUARD_FLAG, require_manual_entry_authorization

if __name__ == "__main__":
    require_manual_entry_authorization("seed_rarx_manual_workflow.py")

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path
from app.models.demande_rst import DemandeRstCreateSchema
from app.models.passation import PassationUpdateSchema
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.repositories.passations_repository import PassationsRepository
from app.services.passation_delta_service import (
    PASSATION_DEMANDE_SLOT,
    build_demande_payload_from_passation,
    build_demande_signature,
    infer_modules,
)

PASSATION_PATCH = {
    "operation_type": "Route",
    "phase_operation": "Préparation",
    "synthese": (
        "Planche expérimentale BB-Perf RARx — Boulevard du Rhône RD1407 à Vienne. "
        "Diagnostic initial, section témoin et section RARx comparables, mise en œuvre contrôlée, "
        "suivi comparatif protocole CIRR. Contraintes : travaux de nuit, circulation maintenue, "
        "proximité Rhône, phasage — ne pas biaiser la comparaison témoin / RARx."
    ),
    "besoins_ressources_humaines": "",
    "points_sensibles": "Homogénéité sections PL2/PL3, zones de transition exclues des mesures comparatives.",
    "notes": "Groupe de comparaison CIRR-RARX-VIENNE. Longueur cible 400-500 ml par section.",
}


def link_generated_demande(
    passations_repo: PassationsRepository,
    passation_uid: int,
    module_code: str,
    signature_hash: str,
    demande_uid: int,
) -> None:
    with passations_repo._connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO passation_generated_demandes
            (passation_id, module_code, signature_hash, demande_id)
            VALUES (?, ?, ?, ?)
            """,
            (passation_uid, module_code, signature_hash, demande_uid),
        )
        conn.execute(
            """
            UPDATE demandes
            SET passation_source_id = ?, passation_module_code = ?
            WHERE id = ?
            """,
            (passation_uid, module_code, demande_uid),
        )
        conn.commit()


def seed_demande_from_passation(
    prep_repo: DemandePreparationRepository,
    demande_uid: int,
    row,
) -> None:
    prep_repo.update_preparation(
        demande_uid,
        {
            "phase_operation": row.phase_operation or "À qualifier",
            "contexte_operationnel": row.contexte_marche or "",
            "objectifs": row.besoins_etude or row.besoins_laboratoire or row.besoins_terrain or "",
            "points_vigilance": row.points_sensibles or "",
            "contraintes_delais": row.synthese or "",
            "ressources_notes": row.besoins_ressources_humaines or row.besoins_equipements_specifiques or "",
            "commentaires": row.notes or "",
            "types_essais_prevus": getattr(row, "types_essais_prevus", "") or "",
            "livrables_attendus": getattr(row, "livrables_attendus", "") or "",
            "criteres_conformite": getattr(row, "criteres_conformite", "") or "",
        },
    )
    prep_repo.update_modules(
        demande_uid,
        [{"module_code": module_code, "is_enabled": True} for module_code in infer_modules(row)],
    )


def find_linked_demande(conn, passation_uid: int) -> tuple[int | None, str]:
    row = conn.execute(
        "SELECT id, reference FROM demandes WHERE passation_source_id=? ORDER BY id DESC LIMIT 1",
        (passation_uid,),
    ).fetchone()
    if row:
        return int(row["id"]), str(row["reference"] or "")
    return None, ""


def generate_demande(
    passation_uid: int,
    passations_repo: PassationsRepository,
    demandes_repo: DemandesRstRepository,
    prep_repo: DemandePreparationRepository,
    dry_run: bool,
) -> tuple[int | None, str]:
    row = passations_repo.get_by_uid(passation_uid)
    if not row:
        raise SystemExit(f"Passation #{passation_uid} introuvable")

    with passations_repo._connect() as conn:
        existing_uid, existing_ref = find_linked_demande(conn, passation_uid)
    if existing_uid:
        return existing_uid, existing_ref

    payload = build_demande_payload_from_passation(row)
    signature_hash = build_demande_signature(
        passation_uid,
        row.affaire_rst_id,
        PASSATION_DEMANDE_SLOT,
        payload["nature"],
        payload["description"],
    )

    if dry_run:
        return None, "(dry-run)"

    demande = demandes_repo.add(
        DemandeRstCreateSchema(
            affaire_rst_id=payload["affaire_rst_id"],
            labo_code=payload["labo_code"],
            numero_dst=payload["numero_dst"],
            type_mission=payload["type_mission"],
            nature=payload["nature"],
            description=payload["description"],
            demandeur=payload["demandeur"],
            date_reception=payload["date_reception"],
            priorite=payload["priorite"],
            statut=payload["statut"],
        )
    )
    link_generated_demande(
        passations_repo,
        passation_uid,
        PASSATION_DEMANDE_SLOT,
        signature_hash,
        demande.uid,
    )
    seed_demande_from_passation(prep_repo, demande.uid, row)
    return demande.uid, demande.reference


def run_comparative_seed(demande_id: int, dry_run: bool) -> str:
    cmd = [
        sys.executable,
        str(ROOT / "tools" / "seed_comparative_workflow.py"),
        GUARD_FLAG,
        "--demande-id",
        str(demande_id),
    ]
    if dry_run:
        cmd.append("--dry-run")
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    output = (result.stdout or "") + (result.stderr or "")
    if result.returncode != 0:
        raise SystemExit(f"seed_comparative_workflow failed:\n{output}")
    return output.strip()


def print_gaps_report() -> None:
    print("\n--- BILAN ÉCARTS UI / PROGRAMME ---")
    gaps = [
        "Passation : consignes structurées (picker catalog) vs champs texte types_essais/livrables/criteres — OK en BD, UI à valider visuellement.",
        "Génération demande : copie partielle vers préparation (pas objectif_mission, zone, responsables structurés depuis passation).",
        "Préparation complète (Sylvain) : seed script nécessaire pour comparison_group + 4 responsables — pas tout hérité de la passation.",
        "Campagnes : champs structurés OK en API/UI ; PK/voie/sens encore vides (normal avant choix terrain).",
        "Interventions : observations JSON enrichies ; pas encore de lien automatique essai SC/PMT depuis types_essais_prevus.",
        "Dashboard comparatif témoin/RARx : pas encore — données en texte + zone_type/comparison_group.",
        "Feuilles essai SC/PMT : modèles JSX existants ; autres codes (HAP, ADH, ACO…) sans modèle dédié.",
    ]
    for item in gaps:
        print(f"  • {item}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--passation-id", type=int, default=2)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db_path = get_db_path()
    ensure_ralab4_schema(db_path)
    passations_repo = PassationsRepository(db_path)
    demandes_repo = DemandesRstRepository(db_path)
    prep_repo = DemandePreparationRepository(db_path)

    report: list[str] = []
    report.append(f"DB: {db_path}")
    report.append(f"Passation #{args.passation_id}")
    report.append(f"Mode: {'DRY-RUN' if args.dry_run else 'WRITE'}")

    row_before = passations_repo.get_by_uid(args.passation_id)
    if not row_before:
        raise SystemExit(f"Passation #{args.passation_id} introuvable")
    report.append(f"Réf. passation: {row_before.reference}")

    if args.dry_run:
        report.append("[DRY] Mettrait à jour passation avec codes catalog essais/consignes")
    else:
        patch = dict(PASSATION_PATCH)
        affaire_resp = str(row_before.responsable or "").strip()
        if not affaire_resp and row_before.affaire_rst_id:
            with passations_repo._connect() as conn:
                aff_row = conn.execute(
                    "SELECT responsable FROM affaires_rst WHERE id = ?",
                    (row_before.affaire_rst_id,),
                ).fetchone()
                if aff_row:
                    affaire_resp = str(aff_row["responsable"] or "").strip()
        if affaire_resp:
            patch["responsable"] = affaire_resp
            if not patch.get("besoins_ressources_humaines"):
                patch["besoins_ressources_humaines"] = (
                    "RST : Marco Costa Pereira. Innovation/produit : Jérôme Muller / LC². "
                    "Travaux : exploitation chantier. Contrôles chantier : laboratoire régional NGE. "
                    "Suivi complémentaire : LC² / UGE / CEREMA."
                )
        passations_repo.update(args.passation_id, PassationUpdateSchema(**patch))
        report.append("[OK] Passation complétée (cadrage texte)")

    demande_uid, demande_ref = generate_demande(
        args.passation_id,
        passations_repo,
        demandes_repo,
        prep_repo,
        args.dry_run,
    )
    if demande_uid:
        report.append(f"[OK] Demande liée: #{demande_uid} ({demande_ref})")
        seed_output = run_comparative_seed(demande_uid, args.dry_run)
        report.append("--- seed_comparative_workflow ---")
        report.append(seed_output)
    elif args.dry_run:
        report.append("[DRY] Générerait 1 demande depuis passation")
        report.append("[DRY] Lancerait seed_comparative_workflow")
    else:
        report.append("[ERR] Demande non créée")

    print("\n".join(report))
    print_gaps_report()


if __name__ == "__main__":
    main()

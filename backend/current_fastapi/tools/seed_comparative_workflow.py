#!/usr/bin/env python3
"""
Seed du workflow préparation → campagnes → interventions — DESACTIVÉ par défaut.

Simule saisie manual via BD. Usage autorisé uniquement sur demande explicite:
  python tools/seed_comparative_workflow.py --allow-manual-mimic --reference 2026-SP-D0052
  python tools/seed_comparative_workflow.py --allow-manual-mimic --demande-id 415 --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools._manual_entry_guard import require_manual_entry_authorization

if __name__ == "__main__":
    require_manual_entry_authorization("seed_comparative_workflow.py")

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.services.intervention_campaign_service import create_campaign, list_campaigns_for_demande

COMPARISON_GROUP = "CIRR-RARX-VIENNE"

PREPARATION = {
    "phase_operation": "Préparation",
    "type_intervention_prevu": "Voirie / chaussée / enrobés",
    "finalite": "Diagnostic préalable + planche expérimentale + suivi comparatif CIRR",
    "zone_localisation": "Boulevard du Rhône RD1407 à Vienne, section courante PL2/PL3",
    "materiau_objet": "Chaussée existante, enrobés, BBM RARx",
    "objectif_mission": (
        "Préparer et encadrer une section témoin et une section RARx "
        "afin de comparer comportement mécanique, surfacique et acoustique dans le temps."
    ),
    "objectifs": (
        "Diagnostic chaussée + planche témoin + planche RARx + suivi comparatif CIRR"
    ),
    "attentes_client": "Cadrage, diagnostic, mise en œuvre et suivi comparatif planche BB-Perf RARx.",
    "contexte_operationnel": "Aménagement du Boulevard du Rhône RD1407 - Vienne",
    "programme_previsionnel": (
        "Diagnostic initial, définition zones témoin/RARx, validation formulations, "
        "mise en œuvre contrôlée, suivi comparatif protocole CIRR."
    ),
    "types_essais_prevus": "SC, HAP, AMI, DF, FWD, PMT, ADH, ACO, DE, CFE, EXT, PCG, ORN, ITSR, SCB, ARR",
    "nb_points_prevus": "8 à 12 SC + déflexions 25-50 m + PMT/adhérence selon protocole",
    "criteres_conformite": "CCTP, PAQ, formulation validée, protocole CIRR, validation MOE/MOA",
    "livrables_attendus": (
        "Note technique, diagnostic chaussée, PV sondages, rapport déflexions, "
        "plans localisation, PV mise en œuvre, résultats PMT/adhérence/acoustique, bilan comparatif"
    ),
    "contraintes_acces": "Travaux de nuit, maintien circulation, chantier urbain",
    "contraintes_delais": "Phasage contraint, comparaison témoin/RARx non biaisée",
    "contraintes_hse": "Proximité Rhône, coactivité chantier",
    "points_vigilance": "Ne pas biaiser la comparaison témoin / RARx",
    "comparison_group": COMPARISON_GROUP,
    "responsable_referent": "Marco Costa Pereira",
    "responsable_innovation": "Jérôme Muller / LC²",
    "responsable_travaux": "Exploitation chantier",
    "responsable_controle": "Laboratoire régional NGE",
    "responsable_suivi": "LC² / UGE / CEREMA selon protocole",
    "priorite": "Normale",
    "familles_prevues": [
        "essais_in_situ",
        "prelevements_terrain",
        "essais_laboratoire",
        "essais_externes",
    ],
}

CAMPAIGNS = [
    {
        "code": "DIAG-CH",
        "label": "Diagnostic chaussée initial - sections témoin et RARx",
        "designation": "Vérifier l'homogénéité des sections pressenties et identifier les contraintes de comparaison.",
        "zone_type": "Diagnostic",
        "zone_scope": "Boulevard du Rhône RD1407, sections pressenties PL2/PL3",
        "programme_specifique": (
            "Inspection visuelle, SC, HAP/amiante, déflexions/FWD, nivellement, PMT initiale, "
            "adhérence et acoustique initiale si demandée."
        ),
        "types_essais_prevus": "SC, HAP, AMI, DF, FWD, PMT, ADH, ACO, nivellement, relevé visuel",
        "nb_points_prevus": "8 à 12 SC + déflexions tous les 25-50 m",
        "livrables_attendus": "Plan localisation, rapport diagnostic, coupes SC, résultats HAP, rapport déflexions",
        "interventions": [
            "Inspection visuelle chaussée initiale",
            "SC structure chaussée + HAP/amiante",
            "Déflexions / FWD",
            "Relevé topo / nivellement / profils",
            "PMT initiale",
            "Adhérence initiale",
            "Mesure acoustique initiale",
            "Relevé singularités et émergences",
        ],
    },
    {
        "code": "TEMOIN",
        "label": "Planche témoin - solution de référence",
        "designation": "Section de référence comparable à la section RARx.",
        "zone_type": "Témoin",
        "zone_scope": "Section témoin en section courante, hors singularités",
        "longueur_ml": "400-500",
        "programme_specifique": "Réalisation solution témoin avec contrôles fabrication, MO, compacité, PMT, adhérence, acoustique.",
        "types_essais_prevus": "CFE, EXT, DE, SC, PMT, ADH, ACO",
        "criteres_controle": "CCTP + PAQ + formulation validée + planche d'essai",
        "interventions": [
            "Réception support zone témoin",
            "Contrôle fabrication enrobé témoin",
            "Mise en œuvre planche témoin",
            "Contrôle températures témoin",
            "Contrôle compacité / vides témoin",
            "SC de contrôle témoin : épaisseur / collage",
            "PMT / adhérence / acoustique témoin",
        ],
    },
    {
        "code": "RARX",
        "label": "Planche innovante BBM 0/10 RARx",
        "designation": "Section expérimentale BBM 0/10 avec additif RARx.",
        "zone_type": "RARx",
        "zone_scope": "Section RARx comparable à la section témoin",
        "longueur_ml": "400-500",
        "programme_specifique": (
            "MO solution RARx avec suivi dosage, températures, maniabilité, compactage, "
            "prélèvements LC²/UGE/CEREMA."
        ),
        "types_essais_prevus": "CFE, EXT, DE, SC, PMT, ADH, ACO, SCB, ARR, ORN, PCG, ITSR",
        "criteres_controle": "CCTP + formulation LC² + protocole CIRR + validation MOE/MOA",
        "interventions": [
            "Réception support zone RARx",
            "Contrôle centrale / dosage RARx",
            "Mise en œuvre BBM RARx",
            "Suivi températures RARx",
            "Contrôle compacité / vides RARx",
            "SC de contrôle RARx : épaisseur / collage",
            "Prélèvements foisonnés LC² / UGE",
            "PMT / adhérence / acoustique RARx",
        ],
    },
    {
        "code": "SUIVI-CIRR",
        "label": "Suivi comparatif témoin / RARx",
        "designation": "Comparer dans le temps les performances témoin et RARx.",
        "zone_type": "Suivi",
        "zone_scope": "Sections témoin + RARx, transitions exclues",
        "temporalite": "Réception, J+1, 1 mois, 6 mois, 1 an, 2 ans, 3 ans",
        "programme_specifique": "Suivi visuel, PMT, adhérence, acoustique, défauts, fissuration, arrachements.",
        "types_essais_prevus": "PMT, ADH, ACO, relevé visuel, suivi défauts",
        "interventions": [
            "Suivi réception initiale",
            "Suivi 1 mois",
            "Suivi 6 mois",
            "Suivi 1 an",
            "Suivi 2 ans",
            "Suivi 3 ans",
            "Bilan comparatif final",
        ],
    },
]

MODULES_TO_ENABLE = [
    "interventions",
    "essais_terrain",
    "echantillons",
    "essais_laboratoire",
    "documents",
    "planning",
]


def build_observations(campaign: dict, intervention_label: str) -> str:
    payload = {
        "zone_intervention": campaign.get("zone_scope") or "",
        "objectif_intervention": intervention_label,
        "prep_essais_a_effectuer": campaign.get("types_essais_prevus") or "",
        "prep_points_a_realiser": campaign.get("nb_points_prevus") or "",
        "responsable_referent": PREPARATION.get("responsable_referent") or "",
        "campaign_zone_type": campaign.get("zone_type") or "",
        "campaign_comparison_group": COMPARISON_GROUP,
        "campaign_pk_debut": campaign.get("pk_debut") or "",
        "campaign_pk_fin": campaign.get("pk_fin") or "",
        "campaign_voie": campaign.get("voie") or "",
        "campaign_sens": campaign.get("sens") or "",
        "campaign_cote": campaign.get("cote") or "",
        "campaign_planche": campaign.get("planche") or campaign.get("code") or "",
        "campaign_longueur_ml": campaign.get("longueur_ml") or "",
    }
    return json.dumps(payload, ensure_ascii=False)


def find_demande_id(conn, reference: str | None, demande_id: int | None) -> int:
    if demande_id:
        row = conn.execute("SELECT id, reference FROM demandes WHERE id=?", (demande_id,)).fetchone()
        if not row:
            raise SystemExit(f"Demande #{demande_id} introuvable")
        return int(row["id"])
    if not reference:
        raise SystemExit("Indiquer --reference ou --demande-id")
    row = conn.execute("SELECT id FROM demandes WHERE reference=?", (reference,)).fetchone()
    if not row:
        raise SystemExit(f"Demande {reference} introuvable")
    return int(row["id"])


def next_intervention_ref(conn, demande_id: int) -> tuple[str, int, str, int]:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id=?", (demande_id,)).fetchone()
    annee = int(row["annee"]) if row and row["annee"] else date.today().year
    labo = str(row["labo_code"] or "SP") if row else "SP"
    prefix = f"{annee}-{labo}-INT"
    rows = conn.execute(
        "SELECT reference FROM interventions WHERE reference LIKE ? ORDER BY id DESC LIMIT 1",
        (f"{prefix}%",),
    ).fetchall()
    numbers = []
    for item in rows:
        ref = str(item["reference"] or "")
        if ref.startswith(prefix):
            try:
                numbers.append(int(ref.replace(prefix, "")))
            except ValueError:
                pass
    numero = max(numbers, default=0) + 1
    reference = f"{prefix}{numero:04d}"
    return reference, annee, labo, numero


def create_intervention_row(conn, demande_id: int, campagne_id: int, campaign: dict, label: str, dry_run: bool) -> dict:
    obs = build_observations(campaign, label)
    if dry_run:
        return {"dry_run": True, "label": label, "campagne_id": campagne_id}
    ref, annee, labo, numero = next_intervention_ref(conn, demande_id)
    now = date.today().isoformat()
    conn.execute(
        """
        INSERT INTO interventions (
            reference, annee, labo_code, numero, demande_id, campagne_id,
            type_intervention, sujet, date_intervention, duree_heures,
            geotechnicien, technicien, observations, anomalie_detectee,
            niveau_alerte, pv_ref, rapport_ref, photos_dossier, statut,
            nature_reelle, finalite, zone, heure_debut, heure_fin,
            tri_updated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Aucun', '', '', '', 'Planifiée',
                  'Intervention', ?, ?, '', '', ?, ?, ?)
        """,
        (
            ref,
            annee,
            labo,
            numero,
            demande_id,
            campagne_id,
            "Essai in situ",
            label,
            now,
            None,
            "",
            "",
            obs,
            campaign.get("designation") or label,
            campaign.get("zone_scope") or "",
            now,
            now,
            now,
        ),
    )
    uid = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    return {"uid": uid, "reference": ref, "label": label}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default="2026-SP-D0052")
    parser.add_argument("--demande-id", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db_path = get_db_path()
    ensure_ralab4_schema(db_path)
    conn = connect_db(db_path)
    demande_id = find_demande_id(conn, args.reference or None, args.demande_id or None)
    prep_repo = DemandePreparationRepository(db_path)

    report: list[str] = []
    report.append(f"Demande #{demande_id} ({args.reference})")
    report.append(f"DB: {db_path}")
    report.append(f"Mode: {'DRY-RUN' if args.dry_run else 'WRITE'}")

    if args.dry_run:
        report.append("[OK] Préparation — prêt à écrire")
    else:
        prep_repo.update_preparation(demande_id, PREPARATION)
        report.append("[OK] Préparation enregistrée")

        modules = prep_repo.list_modules(demande_id)
        payload = []
        for item in modules:
            enabled = item.is_enabled or item.module_code in MODULES_TO_ENABLE
            if item.module_code in MODULES_TO_ENABLE:
                enabled = True
            payload.append({"module_code": item.module_code, "is_enabled": enabled})
        prep_repo.update_modules(demande_id, payload)
        report.append(f"[OK] Modules activés: {', '.join(MODULES_TO_ENABLE)}")

    existing = list_campaigns_for_demande(demande_id)
    by_code = {str(item.get("code") or "").upper(): item for item in existing}
    report.append(f"Campagnes existantes: {len(existing)}")

    created_campaigns: dict[str, dict] = {}
    for spec in CAMPAIGNS:
        code = spec["code"].upper()
        if code in by_code:
            created_campaigns[code] = by_code[code]
            report.append(f"[SKIP] Campagne {code} existe déjà ({by_code[code].get('reference')})")
            continue
        if args.dry_run:
            report.append(f"[DRY] Créerait campagne {code}")
            created_campaigns[code] = {"uid": 0, **spec}
            continue
        saved = create_campaign(
            demande_id,
            code=spec["code"],
            label=spec["label"],
            designation=spec.get("designation", ""),
            zone_scope=spec.get("zone_scope", ""),
            temporalite=spec.get("temporalite", ""),
            programme_specifique=spec.get("programme_specifique", ""),
            nb_points_prevus=spec.get("nb_points_prevus", ""),
            types_essais_prevus=spec.get("types_essais_prevus", ""),
            criteres_controle=spec.get("criteres_controle", ""),
            livrables_attendus=spec.get("livrables_attendus", ""),
            zone_type=spec.get("zone_type", ""),
            comparison_group=COMPARISON_GROUP,
            longueur_ml=spec.get("longueur_ml", ""),
            responsable_technique=PREPARATION["responsable_referent"],
            responsable_innovation=PREPARATION["responsable_innovation"],
            responsable_travaux=PREPARATION["responsable_travaux"],
            responsable_controle=PREPARATION["responsable_controle"],
            responsable_suivi=PREPARATION["responsable_suivi"],
        )
        created_campaigns[code] = saved
        report.append(f"[OK] Campagne {code} -> {saved.get('reference')} (uid={saved.get('uid')})")

    if not args.dry_run:
        conn.commit()

    for spec in CAMPAIGNS:
        code = spec["code"].upper()
        campaign_row = created_campaigns.get(code) or by_code.get(code)
        if not campaign_row:
            report.append(f"[ERR] Campagne {code} indisponible pour interventions")
            continue
        campagne_id = int(campaign_row.get("uid") or 0)
        if args.dry_run:
            report.append(f"[DRY] {len(spec['interventions'])} intervention(s) pour {code}")
            continue
        existing_int = conn.execute(
            "SELECT COUNT(*) AS c FROM interventions WHERE campagne_id=?",
            (campagne_id,),
        ).fetchone()
        if int(existing_int["c"] or 0) > 0:
            report.append(f"[SKIP] {code} a déjà {existing_int['c']} intervention(s)")
            continue
        for label in spec["interventions"]:
            row = create_intervention_row(conn, demande_id, campagne_id, spec, label, dry_run=False)
            report.append(f"  [OK] Intervention {row['reference']} — {label}")
        conn.commit()

    print("\n".join(report))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Preencher campagne C001 (DIAG-CH) + interventions — DESACTIVÉ par défaut.

Simule saisie manual via BD. Usage autorisé uniquement sur demande explicite:
  python tools/fill_campagne_c001_manual.py --allow-manual-mimic
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools._manual_entry_guard import require_manual_entry_authorization

if __name__ == "__main__":
    require_manual_entry_authorization("fill_campagne_c001_manual.py")

from api.interventions import InterventionCreate, create_intervention
from app.core.database import connect_db, get_db_path
from app.services.intervention_campaign_service import update_campaign

DEMANDE_ID = 421
CAMPAIGN_ID = 42
ZONE = "Boulevard du Rhône RD1407 à Vienne, sections pressenties PL2/PL3"
COMPARISON_GROUP = "CIRR-RARX-VIENNE"
GEOTECH = "Sylvain LHOPITAL"

INTERVENTION_PLAN = """1. Visite initiale de chantier (CR obligatoire)
2. Inspection visuelle chaussée initiale
3. SC structure chaussée + HAP/amiante
4. Déflexions / FWD
5. Relevé topo / nivellement / profils
6. PMT initiale
7. Adhérence initiale
8. Mesure acoustique initiale
9. Relevé singularités et émergences"""

CAMPAIGN_PAYLOAD = {
    "label": "Diagnostic chaussée initial - sections témoin et RARx",
    "designation": (
        "Vérifier l'homogénéité des sections pressenties et identifier les contraintes "
        "susceptibles de biaiser la comparaison entre la section témoin et la section RARx."
    ),
    "zone_type": "Diagnostic",
    "zone_scope": ZONE,
    "comparison_group": COMPARISON_GROUP,
    "programme_specifique": (
        "Inspection visuelle, relevé des singularités, sondages carottés SC, diagnostic HAP/amiante, "
        "déflexions ou FWD, nivellement/profils, PMT initiale, adhérence initiale et acoustique "
        "initiale si demandée."
    ),
    "intervention_plan": INTERVENTION_PLAN,
    "types_essais_prevus": "SC, HAP, AMI, DF/FWD, PMT, ADH, ACO, nivellement, relevé visuel",
    "nb_points_prevus": (
        "8 à 12 SC au total pour les deux sections, à adapter selon linéaire réel et hétérogénéités "
        "observées. Déflexions tous les 25 à 50 m. PMT/adhérence selon protocole retenu."
    ),
    "criteres_controle": "CCTP, PAQ enrobés, protocole CIRR, comparabilité témoin/RARx non biaisée",
    "livrables_attendus": (
        "Plan de localisation, rapport diagnostic chaussée, coupes de carottes, résultats HAP/amiante, "
        "rapport déflexions, synthèse d'homogénéité témoin / RARx."
    ),
    "temporalite": "Visite initiale puis diagnostic — avant planche d'essai MOA (juin 2026)",
    "date_debut_prevue": "2026-06-09",
    "date_fin_prevue": "2026-06-20",
    "priorite": "Normale",
    "statut": "Planifiée",
    "responsable_technique": GEOTECH,
    "attribue_a": GEOTECH,
    "responsable_innovation": "Jérôme Muller / LC²",
    "responsable_travaux": "Exploitation chantier GUINTOLI",
    "responsable_controle": "Laboratoire régional NGE",
    "responsable_suivi": "LC² / UGE / CEREMA selon protocole",
    "notes": (
        "Campagne 1/4 — saisie manuelle. Visite initiale puis diagnostic avant planches témoin/RARx. "
        "Affaire 2026-RA-023 · passation 2026-RA-P0002 · demande 2026-SP-D0052."
    ),
}

VISITE_SPEC = {
    "type_intervention": "Visite chantier",
    "sujet": "Visite initiale de chantier — reconnaissance sections témoin / RARx",
    "date_intervention": date(2026, 6, 9),
    "finalite": (
        "Valider accès, phasage, coactivité, repères des sections pressenties et contraintes "
        "de comparabilité témoin/RARx avant le diagnostic chaussée."
    ),
}

DIAG_INTERVENTIONS = [
    {
        "type_intervention": "Auscultation",
        "sujet": "Inspection visuelle chaussée initiale",
        "date_intervention": date(2026, 6, 10),
        "finalite": "Relevé visuel initial des sections pressenties témoin et RARx avant sondages.",
        "prep_points_a_realiser": "Inspection continue chaussée existante — sections pressenties PL2/PL3.",
        "prep_essais_a_effectuer": "Relevé visuel, photos, fissures, réseaux, infiltrations.",
        "mission_essais_prevus": [],
    },
    {
        "type_intervention": "Essai in situ",
        "sujet": "SC structure chaussée + HAP/amiante",
        "date_intervention": date(2026, 6, 11),
        "finalite": "Carottages structure chaussée et prélèvements pour HAP / amiante.",
        "prep_points_a_realiser": "8 à 12 SC répartis sur sections pressenties témoin/RARx.",
        "prep_essais_a_effectuer": "SC, HAP, AMI — coupes et prélèvements selon protocole.",
        "mission_essais_prevus": [
            {"code": "SC", "label": "Sondage carotté / carottage chaussée", "norme": ""},
            {"code": "HAP", "label": "Analyse HAP", "norme": ""},
            {"code": "AMI", "label": "Diagnostic amiante", "norme": ""},
        ],
    },
    {
        "type_intervention": "Essai in situ",
        "sujet": "Déflexions / FWD",
        "date_intervention": date(2026, 6, 12),
        "finalite": "Mesure des déflexions / FWD sur sections pressenties.",
        "prep_points_a_realiser": "Points tous les 25 à 50 m sur linéaire pressenti.",
        "prep_essais_a_effectuer": "Déflexions légères ou FWD selon faisabilité chantier.",
        "mission_essais_prevus": [
            {"code": "DF", "label": "Déflexions", "norme": ""},
            {"code": "FWD", "label": "FWD / déflexions lourdes", "norme": ""},
        ],
    },
    {
        "type_intervention": "Levé topographique",
        "sujet": "Relevé topo / nivellement / profils",
        "date_intervention": date(2026, 6, 13),
        "finalite": "Relevé topographique, nivellement et profils longitudinaux/transversaux.",
        "prep_points_a_realiser": "Profils et repères altimétriques sections pressenties.",
        "prep_essais_a_effectuer": "Nivellement, profils, repères pour localisation des essais.",
        "mission_essais_prevus": [],
    },
    {
        "type_intervention": "Essai in situ",
        "sujet": "PMT initiale",
        "date_intervention": date(2026, 6, 16),
        "finalite": "Mesure initiale de macrotexture (PMT) avant travaux.",
        "prep_points_a_realiser": "PMT selon protocole retenu sur sections pressenties.",
        "prep_essais_a_effectuer": "Profondeur de macrotexture — état initial.",
        "mission_essais_prevus": [
            {"code": "PMT", "label": "Profondeur de macrotexture (PMT)", "norme": ""},
        ],
    },
    {
        "type_intervention": "Essai in situ",
        "sujet": "Adhérence initiale",
        "date_intervention": date(2026, 6, 17),
        "finalite": "Mesure initiale d'adhérence enrobés / support.",
        "prep_points_a_realiser": "Points adhérence selon protocole CIRR / PAQ.",
        "prep_essais_a_effectuer": "Adhérence initiale avant mise en œuvre planches.",
        "mission_essais_prevus": [
            {"code": "ADH", "label": "Adhérence", "norme": ""},
        ],
    },
    {
        "type_intervention": "Essai in situ",
        "sujet": "Mesure acoustique initiale",
        "date_intervention": date(2026, 6, 18),
        "finalite": "Mesure acoustique initiale si demandée dans le protocole.",
        "prep_points_a_realiser": "Points acoustiques sur sections pressenties.",
        "prep_essais_a_effectuer": "Mesure acoustique — état initial chaussée existante.",
        "mission_essais_prevus": [
            {"code": "ACO", "label": "Mesure acoustique", "norme": ""},
        ],
    },
    {
        "type_intervention": "Inspection géotechnique",
        "sujet": "Relevé singularités et émergences",
        "date_intervention": date(2026, 6, 19),
        "finalite": "Cartographier singularités et émergences pouvant biaiser la comparaison témoin/RARx.",
        "prep_points_a_realiser": "Regards, bouches, joints, réseaux, zones affaiblies.",
        "prep_essais_a_effectuer": "Relevé des singularités, photos, repérage sur plan.",
        "mission_essais_prevus": [],
    },
]


def build_observations(
    *,
    objectif: str,
    prep_points_a_realiser: str = "",
    prep_essais_a_effectuer: str = "",
    mission_essais_prevus: list | None = None,
    extra: dict | None = None,
) -> str:
    payload = {
        "zone_intervention": ZONE,
        "objectif_intervention": objectif,
        "prep_points_a_realiser": prep_points_a_realiser,
        "prep_essais_a_effectuer": prep_essais_a_effectuer,
        "prep_contraintes_acces": (
            "Travaux de nuit possibles, maintien circulation 2x2, coactivité GUINTOLI, proximité Rhône."
        ),
        "prep_contact_chantier": "MOE SEGIC / exploitation GUINTOLI — contact à confirmer",
        "prep_plan_prevention": "EPI standard + vigilance circulation et coactivité",
        "campaign_zone_type": "Diagnostic",
        "campaign_comparison_group": COMPARISON_GROUP,
        "mission_essais_prevus": mission_essais_prevus or [],
        "suite_nb_essais_prevus": str(len(mission_essais_prevus or [])),
    }
    if extra:
        payload.update(extra)
    return json.dumps(payload, ensure_ascii=False)


def build_visite_observations() -> str:
    return build_observations(
        objectif="Visite initiale de chantier — reconnaissance opérationnelle avant campagne DIAG-CH",
        prep_essais_a_effectuer=(
            "Relevé visuel, photos, repères sections témoin/RARx, contrôle faisabilité accès diagnostic"
        ),
        extra={
            "visite_motif": (
                "Reconnaissance initiale : accès, phasage, coactivité, repères sections pressenties "
                "témoin/RARx avant diagnostic chaussée"
            ),
            "visite_moment": "Avant démarrage travaux — phasage juin 2026 (OS préparation 18/05, travaux 15/07)",
            "visite_cr_obligatoire": "oui",
            "visite_statut": "Planifiée",
        },
    )


def find_intervention(conn, *, sujet: str | None = None, type_intervention: str | None = None):
    clauses = ["demande_id=?", "campagne_id=?"]
    params: list[object] = [DEMANDE_ID, CAMPAIGN_ID]
    if sujet:
        clauses.append("sujet=?")
        params.append(sujet)
    if type_intervention:
        clauses.append("type_intervention=?")
        params.append(type_intervention)
    return conn.execute(
        f"""
        SELECT id, reference, sujet, type_intervention, date_intervention
        FROM interventions
        WHERE {' AND '.join(clauses)}
        ORDER BY id ASC LIMIT 1
        """,
        tuple(params),
    ).fetchone()


def create_manual_intervention(spec: dict) -> dict:
    mission = spec.get("mission_essais_prevus") or []
    return create_intervention(
        InterventionCreate(
            demande_id=DEMANDE_ID,
            campagne_id=CAMPAIGN_ID,
            type_intervention=spec["type_intervention"],
            sujet=spec["sujet"],
            date_intervention=spec["date_intervention"],
            geotechnicien=GEOTECH,
            technicien=GEOTECH,
            finalite=spec.get("finalite") or spec["sujet"],
            zone=ZONE,
            observations=build_observations(
                objectif=spec.get("finalite") or spec["sujet"],
                prep_points_a_realiser=spec.get("prep_points_a_realiser") or "",
                prep_essais_a_effectuer=spec.get("prep_essais_a_effectuer") or "",
                mission_essais_prevus=mission,
            ),
            statut="Planifiée",
        )
    )


def main() -> None:
    campaign = update_campaign(CAMPAIGN_ID, **CAMPAIGN_PAYLOAD)
    print(f"Campagne OK: {campaign.get('reference')} | {campaign.get('code')}")

    conn = connect_db(get_db_path())
    try:
        visite = find_intervention(
            conn,
            sujet=VISITE_SPEC["sujet"],
            type_intervention=VISITE_SPEC["type_intervention"],
        )
        if visite:
            print(
                f"Visite deja presente: {visite['reference']} | {visite['sujet']} | "
                f"{visite['date_intervention']}"
            )
        else:
            visite = create_intervention(
                InterventionCreate(
                    demande_id=DEMANDE_ID,
                    campagne_id=CAMPAIGN_ID,
                    type_intervention=VISITE_SPEC["type_intervention"],
                    sujet=VISITE_SPEC["sujet"],
                    date_intervention=VISITE_SPEC["date_intervention"],
                    geotechnicien=GEOTECH,
                    technicien=GEOTECH,
                    finalite=VISITE_SPEC["finalite"],
                    zone=ZONE,
                    observations=build_visite_observations(),
                    statut="Planifiée",
                )
            )
            print(
                f"Visite OK: {visite.get('reference')} | {visite.get('type_intervention')} | "
                f"{visite.get('date_intervention')}"
            )

        created = 0
        skipped = 0
        for spec in DIAG_INTERVENTIONS:
            existing = find_intervention(conn, sujet=spec["sujet"])
            if existing:
                skipped += 1
                print(
                    f"SKIP: {existing['reference']} | {existing['sujet']} | "
                    f"{existing['date_intervention']}"
                )
                continue
            row = create_manual_intervention(spec)
            created += 1
            essais = ", ".join(
                item["code"] for item in (spec.get("mission_essais_prevus") or []) if item.get("code")
            ) or "—"
            print(
                f"OK: {row.get('reference')} | {row.get('type_intervention')} | {spec['sujet']} | "
                f"essais plan: {essais}"
            )

        total = conn.execute(
            "SELECT COUNT(*) AS c FROM interventions WHERE demande_id=? AND campagne_id=?",
            (DEMANDE_ID, CAMPAIGN_ID),
        ).fetchone()["c"]
        print(f"Termine — {created} cree(s), {skipped} deja present(s), {total} intervention(s) sur DIAG-CH.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

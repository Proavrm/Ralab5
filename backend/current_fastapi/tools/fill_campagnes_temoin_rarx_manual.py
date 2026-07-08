#!/usr/bin/env python3
"""Preencher campagnes TEMOIN (C002) et RARX (C003) — DESACTIVÉ par défaut.

Simule saisie manual via BD. Usage autorisé uniquement sur demande explicite:
  python tools/fill_campagnes_temoin_rarx_manual.py --allow-manual-mimic
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
    require_manual_entry_authorization("fill_campagnes_temoin_rarx_manual.py")

from datetime import datetime

from app.core.database import connect_db, get_db_path
from app.services.intervention_campaign_service import create_campaign, list_campaigns_for_demande, update_campaign

DEMANDE_ID = 421
COMPARISON_GROUP = "CIRR-RARX-VIENNE"
GEOTECH = "Sylvain LHOPITAL"

SHARED_RESPONSIBLES = {
    "responsable_technique": GEOTECH,
    "attribue_a": GEOTECH,
    "responsable_innovation": "Jérôme Muller / LC²",
    "responsable_travaux": "Exploitation chantier GUINTOLI",
    "responsable_controle": "Laboratoire régional NGE",
    "responsable_suivi": "LC² / UGE / CEREMA selon protocole",
    "priorite": "Normale",
    "statut": "Planifiée",
    "comparison_group": COMPARISON_GROUP,
}

TEMOIN_ZONE = "Section témoin à définir en section courante, comparable à la section RARx, hors singularités"
RARX_ZONE = "Section RARx à définir en section courante, comparable à la section témoin"

TEMOIN_INTERVENTION_PLAN = """1. Réception support zone témoin
2. Contrôle fabrication enrobé témoin
3. Mise en œuvre planche témoin
4. Contrôle températures témoin
5. Contrôle compacité / vides témoin
6. SC de contrôle témoin : épaisseur / collage
7. PMT / adhérence / acoustique témoin"""

RARX_INTERVENTION_PLAN = """1. Réception support zone RARx
2. Contrôle centrale / dosage RARx
3. Contrôle stockage et lot RARx
4. Mise en œuvre BBM RARx
5. Suivi températures RARx
6. Contrôle compacité / vides RARx
7. SC de contrôle RARx : épaisseur / collage
8. Prélèvements foisonnés LC² / UGE
9. PMT / adhérence / acoustique RARx
10. Essais complémentaires LC² / UGE : SCB, arrachement, orniérage selon protocole"""

CAMPAIGNS = [
    {
        "code": "TEMOIN",
        "label": "Planche témoin - solution de référence",
        "designation": (
            "Réaliser une section de référence permettant la comparaison avec la section innovante RARx."
        ),
        "zone_type": "Témoin",
        "zone_scope": TEMOIN_ZONE,
        "longueur_ml": "400-500",
        "programme_specifique": (
            "Réalisation de la solution témoin retenue, avec contrôle de fabrication, mise en œuvre, "
            "compacité, épaisseur, collage, PMT, adhérence et acoustique si prévu."
        ),
        "types_essais_prevus": "CFE, EXT, DE, SC, PMT, ADH, ACO",
        "nb_points_prevus": (
            "Température fabrication, température arrivée chantier, température répandage, température "
            "compactage, tonnage, surface, épaisseur théorique, compacité, vides, collage, PMT, aspect visuel."
        ),
        "criteres_controle": "CCTP + PAQ + formulation validée + planche d'essai",
        "livrables_attendus": (
            "Fiche de suivi témoin, PV de fabrication, PV de mise en œuvre, PV compacité, coupes SC, "
            "résultats PMT/adhérence/acoustique."
        ),
        "temporalite": "Mise en œuvre planche témoin — après diagnostic chaussée, phasage juillet 2026",
        "date_debut_prevue": "2026-07-14",
        "date_fin_prevue": "2026-07-18",
        "intervention_plan": TEMOIN_INTERVENTION_PLAN,
        "notes": (
            "Campagne 2/4 — saisie manuelle. Section témoin de référence pour comparaison RARx. "
            "Affaire 2026-RA-023 · demande 2026-SP-D0052."
        ),
        "zone": TEMOIN_ZONE,
        "interventions": [
            {
                "type_intervention": "Visite chantier",
                "sujet": "Réception support zone témoin",
                "date_intervention": date(2026, 7, 15),
                "finalite": "Réception et contrôle du support avant mise en œuvre de la planche témoin.",
                "prep_points_a_realiser": "Section témoin — état support, propreté, humidité, planéité.",
                "prep_essais_a_effectuer": "Constat visuel, photos, repères, conformité support PAQ.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Visite de constat",
                "sujet": "Contrôle fabrication enrobé témoin",
                "date_intervention": date(2026, 7, 14),
                "finalite": "Contrôle fabrication enrobé témoin à la centrale.",
                "prep_points_a_realiser": "Centrale — formulation témoin validée.",
                "prep_essais_a_effectuer": "CFE, EXT, température fabrication, conformité formulation PAQ.",
                "mission_essais_prevus": [
                    {"code": "CFE", "label": "Contrôle fabrication enrobé", "norme": ""},
                    {"code": "EXT", "label": "Essai extensibilité", "norme": ""},
                ],
            },
            {
                "type_intervention": "Visite de constat",
                "sujet": "Mise en œuvre planche témoin",
                "date_intervention": date(2026, 7, 16),
                "finalite": "Suivi opérationnel de la mise en œuvre de la planche témoin.",
                "prep_points_a_realiser": "Section témoin — répandage, compactage, finitions.",
                "prep_essais_a_effectuer": "Suivi températures, tonnage, surface, épaisseur théorique, aspect visuel.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Visite de constat",
                "sujet": "Contrôle températures témoin",
                "date_intervention": date(2026, 7, 16),
                "finalite": "Suivi des températures fabrication, arrivée chantier, répandage et compactage.",
                "prep_points_a_realiser": "Points de contrôle température sur toute la chaîne MO témoin.",
                "prep_essais_a_effectuer": "Températures fabrication, arrivée, répandage, compactage.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Essai de plaque",
                "sujet": "Contrôle compacité / vides témoin",
                "date_intervention": date(2026, 7, 16),
                "finalite": "Contrôle compacité et teneur en vides de la planche témoin.",
                "prep_points_a_realiser": "Points compacité selon PAQ — section témoin.",
                "prep_essais_a_effectuer": "Compacité, vides, conformité PAQ.",
                "mission_essais_prevus": [
                    {"code": "DE", "label": "Densité enrobé", "norme": ""},
                ],
            },
            {
                "type_intervention": "Carottage",
                "sujet": "SC de contrôle témoin : épaisseur / collage",
                "date_intervention": date(2026, 7, 17),
                "finalite": "Carottages de contrôle épaisseur et collage sur planche témoin.",
                "prep_points_a_realiser": "SC répartis sur section témoin — épaisseur et collage.",
                "prep_essais_a_effectuer": "SC, coupes, mesure épaisseur, contrôle collage.",
                "mission_essais_prevus": [
                    {"code": "SC", "label": "Sondage carotté / carottage chaussée", "norme": ""},
                ],
            },
            {
                "type_intervention": "Essai de plaque",
                "sujet": "PMT / adhérence / acoustique témoin",
                "date_intervention": date(2026, 7, 18),
                "finalite": "Mesures surfaciques initiales sur planche témoin.",
                "prep_points_a_realiser": "PMT, adhérence, acoustique selon protocole CIRR / PAQ.",
                "prep_essais_a_effectuer": "PMT, ADH, ACO — état initial planche témoin.",
                "mission_essais_prevus": [
                    {"code": "PMT", "label": "Profondeur de macrotexture (PMT)", "norme": ""},
                    {"code": "ADH", "label": "Adhérence", "norme": ""},
                    {"code": "ACO", "label": "Mesure acoustique", "norme": ""},
                ],
            },
        ],
    },
    {
        "code": "RARX",
        "label": "Planche innovante BBM 0/10 RARx",
        "designation": (
            "Réaliser une section expérimentale avec BBM 0/10 intégrant l'additif RARx, "
            "conformément à la formulation et au dimensionnement validés."
        ),
        "zone_type": "RARx",
        "zone_scope": RARX_ZONE,
        "longueur_ml": "400-500",
        "programme_specifique": (
            "Mise en œuvre de la solution RARx avec suivi spécifique du produit, du dosage, des températures, "
            "de la maniabilité, du compactage, des prélèvements et des performances initiales."
        ),
        "types_essais_prevus": "CFE, EXT, DE, SC, PMT, ADH, ACO, SCB, ARR, ORN, PCG, ITSR",
        "nb_points_prevus": (
            "Lot RARx, bigbag ou livraison vrac, état du produit, absence d'agglomérats, régularité dosage, "
            "température fabrication, température arrivée chantier, température répandage, température compactage, "
            "maniabilité, compactabilité, prélèvements conservatoires."
        ),
        "criteres_controle": "CCTP + formulation LC² + protocole CIRR + validation MOE/MOA",
        "livrables_attendus": (
            "Fiche de suivi RARx, fiche lot produit, PV dosage centrale, PV de fabrication, PV de mise en œuvre, "
            "PV compacité, coupes SC, résultats PMT/adhérence/acoustique, résultats essais LC² / UGE."
        ),
        "temporalite": "Mise en œuvre planche RARx — après planche témoin, phasage juillet 2026",
        "date_debut_prevue": "2026-07-21",
        "date_fin_prevue": "2026-07-26",
        "intervention_plan": RARX_INTERVENTION_PLAN,
        "notes": (
            "Campagne 3/4 — saisie manuelle. Section expérimentale BBM 0/10 RARx. "
            "Affaire 2026-RA-023 · demande 2026-SP-D0052."
        ),
        "zone": RARX_ZONE,
        "interventions": [
            {
                "type_intervention": "Visite chantier",
                "sujet": "Réception support zone RARx",
                "date_intervention": date(2026, 7, 22),
                "finalite": "Réception et contrôle du support avant mise en œuvre de la planche RARx.",
                "prep_points_a_realiser": "Section RARx — état support, propreté, humidité, planéité.",
                "prep_essais_a_effectuer": "Constat visuel, photos, repères, comparabilité avec section témoin.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Visite de constat",
                "sujet": "Contrôle centrale / dosage RARx",
                "date_intervention": date(2026, 7, 21),
                "finalite": "Contrôle centrale, dosage additif RARx et fabrication BBM 0/10.",
                "prep_points_a_realiser": "Centrale — formulation RARx validée LC².",
                "prep_essais_a_effectuer": "CFE, EXT, dosage RARx, température fabrication.",
                "mission_essais_prevus": [
                    {"code": "CFE", "label": "Contrôle fabrication enrobé", "norme": ""},
                    {"code": "EXT", "label": "Essai extensibilité", "norme": ""},
                ],
            },
            {
                "type_intervention": "Visite de constat",
                "sujet": "Contrôle stockage et lot RARx",
                "date_intervention": date(2026, 7, 21),
                "finalite": "Contrôle lot produit RARx, stockage, état et absence d'agglomérats.",
                "prep_points_a_realiser": "Lot RARx — bigbag ou vrac, traçabilité, état produit.",
                "prep_essais_a_effectuer": "Fiche lot produit, état additif, régularité dosage.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Visite de constat",
                "sujet": "Mise en œuvre BBM RARx",
                "date_intervention": date(2026, 7, 23),
                "finalite": "Suivi opérationnel de la mise en œuvre de la planche RARx.",
                "prep_points_a_realiser": "Section RARx — répandage, compactage, maniabilité, finitions.",
                "prep_essais_a_effectuer": "Suivi températures, tonnage, surface, épaisseur, aspect visuel.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Visite de constat",
                "sujet": "Suivi températures RARx",
                "date_intervention": date(2026, 7, 23),
                "finalite": "Suivi des températures fabrication, arrivée chantier, répandage et compactage RARx.",
                "prep_points_a_realiser": "Points de contrôle température sur toute la chaîne MO RARx.",
                "prep_essais_a_effectuer": "Températures fabrication, arrivée, répandage, compactage.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Essai de plaque",
                "sujet": "Contrôle compacité / vides RARx",
                "date_intervention": date(2026, 7, 23),
                "finalite": "Contrôle compacité et teneur en vides de la planche RARx.",
                "prep_points_a_realiser": "Points compacité selon protocole CIRR — section RARx.",
                "prep_essais_a_effectuer": "Compacité, vides, compactabilité, conformité PAQ.",
                "mission_essais_prevus": [
                    {"code": "DE", "label": "Densité enrobé", "norme": ""},
                ],
            },
            {
                "type_intervention": "Carottage",
                "sujet": "SC de contrôle RARx : épaisseur / collage",
                "date_intervention": date(2026, 7, 24),
                "finalite": "Carottages de contrôle épaisseur et collage sur planche RARx.",
                "prep_points_a_realiser": "SC répartis sur section RARx — épaisseur et collage.",
                "prep_essais_a_effectuer": "SC, coupes, mesure épaisseur, contrôle collage.",
                "mission_essais_prevus": [
                    {"code": "SC", "label": "Sondage carotté / carottage chaussée", "norme": ""},
                ],
            },
            {
                "type_intervention": "Prélèvement",
                "sujet": "Prélèvements foisonnés LC² / UGE",
                "date_intervention": date(2026, 7, 24),
                "finalite": "Prélèvements conservatoires pour essais LC² / UGE selon protocole.",
                "prep_points_a_realiser": "Prélèvements foisonnés sur section RARx.",
                "prep_essais_a_effectuer": "Prélèvements conservatoires — traçabilité lot RARx.",
                "mission_essais_prevus": [],
            },
            {
                "type_intervention": "Essai de plaque",
                "sujet": "PMT / adhérence / acoustique RARx",
                "date_intervention": date(2026, 7, 25),
                "finalite": "Mesures surfaciques initiales sur planche RARx.",
                "prep_points_a_realiser": "PMT, adhérence, acoustique selon protocole CIRR / PAQ.",
                "prep_essais_a_effectuer": "PMT, ADH, ACO — état initial planche RARx.",
                "mission_essais_prevus": [
                    {"code": "PMT", "label": "Profondeur de macrotexture (PMT)", "norme": ""},
                    {"code": "ADH", "label": "Adhérence", "norme": ""},
                    {"code": "ACO", "label": "Mesure acoustique", "norme": ""},
                ],
            },
            {
                "type_intervention": "Essai de plaque",
                "sujet": "Essais complémentaires LC² / UGE : SCB, arrachement, orniérage selon protocole",
                "date_intervention": date(2026, 7, 26),
                "finalite": "Essais complémentaires LC² / UGE sur section RARx.",
                "prep_points_a_realiser": "Points essais SCB, arrachement, orniérage selon protocole CIRR.",
                "prep_essais_a_effectuer": "SCB, ARR, ORN, PCG, ITSR selon protocole retenu.",
                "mission_essais_prevus": [
                    {"code": "SCB", "label": "Essai SCB", "norme": ""},
                    {"code": "ARR", "label": "Arrachement", "norme": ""},
                    {"code": "ORN", "label": "Orniérage", "norme": ""},
                    {"code": "PCG", "label": "Essai PCG", "norme": ""},
                    {"code": "ITSR", "label": "Essai ITSR", "norme": ""},
                ],
            },
        ],
    },
]


def build_observations(
    *,
    zone: str,
    zone_type: str,
    objectif: str,
    prep_points_a_realiser: str = "",
    prep_essais_a_effectuer: str = "",
    mission_essais_prevus: list | None = None,
) -> str:
    payload = {
        "zone_intervention": zone,
        "objectif_intervention": objectif,
        "prep_points_a_realiser": prep_points_a_realiser,
        "prep_essais_a_effectuer": prep_essais_a_effectuer,
        "prep_contraintes_acces": (
            "Travaux de nuit possibles, maintien circulation 2x2, coactivité GUINTOLI, proximité Rhône."
        ),
        "prep_contact_chantier": "MOE SEGIC / exploitation GUINTOLI — contact à confirmer",
        "prep_plan_prevention": "EPI standard + vigilance circulation et coactivité",
        "campaign_zone_type": zone_type,
        "campaign_comparison_group": COMPARISON_GROUP,
        "mission_essais_prevus": mission_essais_prevus or [],
        "suite_nb_essais_prevus": str(len(mission_essais_prevus or [])),
    }
    return json.dumps(payload, ensure_ascii=False)


def find_campaign_by_code(code: str) -> dict | None:
    for item in list_campaigns_for_demande(DEMANDE_ID):
        if str(item.get("code") or "").upper() == code.upper():
            return item
    return None


def ensure_campaign(spec: dict) -> dict:
    existing = find_campaign_by_code(spec["code"])
    payload = {**SHARED_RESPONSIBLES}
    for key in (
        "label",
        "designation",
        "zone_type",
        "zone_scope",
        "longueur_ml",
        "programme_specifique",
        "types_essais_prevus",
        "nb_points_prevus",
        "criteres_controle",
        "livrables_attendus",
        "temporalite",
        "date_debut_prevue",
        "date_fin_prevue",
        "intervention_plan",
        "notes",
    ):
        payload[key] = spec[key]

    if existing:
        campaign = update_campaign(int(existing["uid"]), **payload)
        print(f"Campagne MAJ: {campaign.get('reference')} | {campaign.get('code')}")
        return campaign

    campaign = create_campaign(
        DEMANDE_ID,
        code=spec["code"],
        **{k: v for k, v in payload.items() if k != "intervention_plan"},
    )
    campaign = update_campaign(int(campaign["uid"]), intervention_plan=spec["intervention_plan"])
    print(f"Campagne CREEE: {campaign.get('reference')} | {campaign.get('code')}")
    return campaign


def next_intervention_ref(conn, demande_id: int) -> tuple[str, int, str, int]:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id=?", (demande_id,)).fetchone()
    annee = int(row["annee"]) if row and row["annee"] else date.today().year
    labo = str(row["labo_code"] or "SP") if row else "SP"
    prefix = f"{annee}-{labo}-INT"
    rows = conn.execute(
        "SELECT reference FROM interventions WHERE reference LIKE ? ORDER BY id DESC LIMIT 1",
        (f"{prefix}%",),
    ).fetchall()
    numbers: list[int] = []
    for item in rows:
        ref = str(item["reference"] or "")
        if ref.startswith(prefix):
            try:
                numbers.append(int(ref.replace(prefix, "")))
            except ValueError:
                pass
    numero = max(numbers, default=0) + 1
    return f"{prefix}{numero:04d}", annee, labo, numero


def find_intervention(conn, *, campagne_id: int, sujet: str):
    return conn.execute(
        """
        SELECT id, reference, sujet, type_intervention, date_intervention
        FROM interventions
        WHERE demande_id=? AND campagne_id=? AND sujet=?
        ORDER BY id ASC LIMIT 1
        """,
        (DEMANDE_ID, campagne_id, sujet),
    ).fetchone()


def create_manual_intervention(
    conn,
    *,
    campagne_id: int,
    zone: str,
    zone_type: str,
    spec: dict,
) -> dict:
    mission = spec.get("mission_essais_prevus") or []
    ref, annee, labo, numero = next_intervention_ref(conn, DEMANDE_ID)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    finalite = spec.get("finalite") or spec["sujet"]
    observations = build_observations(
        zone=zone,
        zone_type=zone_type,
        objectif=finalite,
        prep_points_a_realiser=spec.get("prep_points_a_realiser") or "",
        prep_essais_a_effectuer=spec.get("prep_essais_a_effectuer") or "",
        mission_essais_prevus=mission,
    )
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
            DEMANDE_ID,
            campagne_id,
            spec["type_intervention"],
            spec["sujet"],
            spec["date_intervention"].isoformat(),
            None,
            GEOTECH,
            GEOTECH,
            observations,
            finalite,
            zone,
            now,
            now,
            now,
        ),
    )
    uid = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    conn.commit()
    return {
        "uid": uid,
        "reference": ref,
        "type_intervention": spec["type_intervention"],
        "sujet": spec["sujet"],
    }


def process_campaign(spec: dict, conn) -> None:
    campaign = ensure_campaign(spec)
    campagne_id = int(campaign["uid"])
    zone = spec["zone"]
    zone_type = spec["zone_type"]
    created = 0
    skipped = 0

    for item in spec["interventions"]:
        existing = find_intervention(conn, campagne_id=campagne_id, sujet=item["sujet"])
        if existing:
            skipped += 1
            print(
                f"  SKIP: {existing['reference']} | {existing['sujet']} | "
                f"{existing['date_intervention']}"
            )
            continue
        row = create_manual_intervention(
            conn,
            campagne_id=campagne_id,
            zone=zone,
            zone_type=zone_type,
            spec=item,
        )
        created += 1
        essais = ", ".join(
            entry["code"] for entry in (item.get("mission_essais_prevus") or []) if entry.get("code")
        ) or "—"
        print(
            f"  OK: {row.get('reference')} | {row.get('type_intervention')} | {item['sujet']} | "
            f"essais plan: {essais}"
        )

    total = conn.execute(
        "SELECT COUNT(*) AS c FROM interventions WHERE demande_id=? AND campagne_id=?",
        (DEMANDE_ID, campagne_id),
    ).fetchone()["c"]
    print(
        f"  -> {spec['code']}: {created} cree(s), {skipped} deja present(s), "
        f"{total} intervention(s) au total."
    )


def main() -> None:
    conn = connect_db(get_db_path())
    try:
        for spec in CAMPAIGNS:
            print(f"\n=== {spec['code']} — {spec['label']} ===")
            process_campaign(spec, conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()

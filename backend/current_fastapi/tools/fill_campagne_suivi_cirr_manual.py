#!/usr/bin/env python3
"""Preencher campagne SUIVI-CIRR (C004) — DESACTIVÉ par défaut.

Simule saisie manual via BD. Usage autorisé uniquement sur demande explicite:
  python tools/fill_campagne_suivi_cirr_manual.py --allow-manual-mimic
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools._manual_entry_guard import require_manual_entry_authorization

if __name__ == "__main__":
    require_manual_entry_authorization("fill_campagne_suivi_cirr_manual.py")

from app.core.database import connect_db, get_db_path
from app.services.intervention_campaign_service import create_campaign, list_campaigns_for_demande, update_campaign

DEMANDE_ID = 421
COMPARISON_GROUP = "CIRR-RARX-VIENNE"
GEOTECH = "Sylvain LHOPITAL"
SUIVI_ZONE = (
    "Sections témoin et RARx sur le Boulevard du Rhône RD1407 — zones de transition "
    "exclues des mesures comparatives"
)

SUIVI_INTERVENTION_PLAN = """1. Suivi réception initiale
2. Suivi 1 mois
3. Suivi 6 mois
4. Suivi 1 an
5. Suivi 2 ans
6. Suivi 3 ans
7. Bilan comparatif final"""

SUIVI_ESSAIS_PLAN = [
    {"code": "PMT", "label": "Profondeur de macrotexture (PMT)", "norme": ""},
    {"code": "ADH", "label": "Adhérence", "norme": ""},
    {"code": "ACO", "label": "Mesure acoustique", "norme": ""},
]

CAMPAIGN = {
    "code": "SUIVI-CIRR",
    "label": "Suivi comparatif témoin / RARx",
    "designation": (
        "Comparer dans le temps les performances de la section témoin et de la section RARx "
        "selon un protocole commun."
    ),
    "zone_type": "Suivi",
    "zone_scope": SUIVI_ZONE,
    "zone_transition": "Transitions témoin/RARx exclues des mesures de comparaison",
    "programme_specifique": (
        "Suivi aux mêmes échéances et avec les mêmes méthodes sur les deux sections : aspect visuel, "
        "PMT, adhérence, acoustique, défauts de surface, fissuration, arrachements, joints, "
        "orniérage éventuel."
    ),
    "types_essais_prevus": "PMT, ADH, ACO, relevé visuel, suivi défauts, SC ponctuels si pathologie",
    "nb_points_prevus": "Points comparables témoin/RARx — mêmes repères, transitions exclues",
    "criteres_controle": "Protocole CIRR + comparabilité témoin/RARx + même méthode aux échéances",
    "livrables_attendus": (
        "Fiches de suivi périodique, photos géolocalisées, tableaux comparatifs, "
        "résultats PMT/adhérence/acoustique, bilan final témoin / RARx."
    ),
    "temporalite": "Réception initiale, J+1, 1 mois, 6 mois, 1 an, 2 ans, 3 ans",
    "date_debut_prevue": "2026-07-28",
    "date_fin_prevue": "2029-08-15",
    "intervention_plan": SUIVI_INTERVENTION_PLAN,
    "notes": (
        "Campagne 4/4 — saisie manuelle. Suivi comparatif long terme témoin/RARx. "
        "Affaire 2026-RA-023 · demande 2026-SP-D0052."
    ),
    "zone": SUIVI_ZONE,
    "interventions": [
        {
            "type_intervention": "Visite de constat",
            "sujet": "Suivi réception initiale",
            "date_intervention": date(2026, 7, 28),
            "finalite": "Suivi comparatif à réception des planches témoin et RARx.",
            "prep_points_a_realiser": "Sections témoin + RARx — repères, photos, état initial.",
            "prep_essais_a_effectuer": "Relevé visuel, PMT, adhérence, acoustique — protocole CIRR.",
            "mission_essais_prevus": SUIVI_ESSAIS_PLAN,
        },
        {
            "type_intervention": "Visite de constat",
            "sujet": "Suivi 1 mois",
            "date_intervention": date(2026, 8, 28),
            "finalite": "Suivi comparatif à 1 mois — témoin vs RARx.",
            "prep_points_a_realiser": "Mêmes repères témoin/RARx, transitions exclues.",
            "prep_essais_a_effectuer": "Aspect visuel, défauts, PMT, adhérence, acoustique.",
            "mission_essais_prevus": SUIVI_ESSAIS_PLAN,
        },
        {
            "type_intervention": "Visite de constat",
            "sujet": "Suivi 6 mois",
            "date_intervention": date(2027, 1, 28),
            "finalite": "Suivi comparatif à 6 mois — témoin vs RARx.",
            "prep_points_a_realiser": "Sections témoin + RARx — fissuration, arrachements, joints.",
            "prep_essais_a_effectuer": "Relevé visuel, PMT, adhérence, acoustique, suivi défauts.",
            "mission_essais_prevus": SUIVI_ESSAIS_PLAN,
        },
        {
            "type_intervention": "Visite de constat",
            "sujet": "Suivi 1 an",
            "date_intervention": date(2027, 7, 28),
            "finalite": "Suivi comparatif à 1 an — témoin vs RARx.",
            "prep_points_a_realiser": "Points de mesure comparables — protocole CIRR.",
            "prep_essais_a_effectuer": "PMT, adhérence, acoustique, relevé visuel, orniérage si besoin.",
            "mission_essais_prevus": SUIVI_ESSAIS_PLAN,
        },
        {
            "type_intervention": "Visite de constat",
            "sujet": "Suivi 2 ans",
            "date_intervention": date(2028, 7, 28),
            "finalite": "Suivi comparatif à 2 ans — témoin vs RARx.",
            "prep_points_a_realiser": "Sections témoin + RARx — même protocole qu'échéances antérieures.",
            "prep_essais_a_effectuer": "Relevé visuel, PMT, adhérence, acoustique, suivi pathologies.",
            "mission_essais_prevus": SUIVI_ESSAIS_PLAN,
        },
        {
            "type_intervention": "Visite de constat",
            "sujet": "Suivi 3 ans",
            "date_intervention": date(2029, 7, 28),
            "finalite": "Suivi comparatif à 3 ans — dernière échéance terrain avant bilan.",
            "prep_points_a_realiser": "Repères témoin/RARx, photos géolocalisées, transitions exclues.",
            "prep_essais_a_effectuer": "PMT, ADH, ACO, relevé visuel, SC ponctuels si pathologie.",
            "mission_essais_prevus": SUIVI_ESSAIS_PLAN + [
                {"code": "SC", "label": "Sondage carotté / carottage chaussée", "norme": ""},
            ],
        },
        {
            "type_intervention": "Visite de constat",
            "sujet": "Bilan comparatif final",
            "date_intervention": date(2029, 8, 15),
            "finalite": "Synthèse comparative finale témoin / RARx — restitution protocole CIRR.",
            "prep_points_a_realiser": "Consolidation résultats toutes échéances, tableaux comparatifs.",
            "prep_essais_a_effectuer": "Bilan PMT/adhérence/acoustique, synthèse défauts et performances.",
            "mission_essais_prevus": [],
        },
    ],
}

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


def build_observations(
    *,
    zone: str,
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
        "campaign_zone_type": "Suivi",
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
        "zone_transition",
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
        "SELECT reference FROM interventions WHERE reference LIKE ? ORDER BY id DESC",
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


def create_manual_intervention(conn, *, campagne_id: int, zone: str, spec: dict) -> dict:
    mission = spec.get("mission_essais_prevus") or []
    ref, annee, labo, numero = next_intervention_ref(conn, DEMANDE_ID)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    finalite = spec.get("finalite") or spec["sujet"]
    observations = build_observations(
        zone=zone,
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
    return {"uid": uid, "reference": ref, "type_intervention": spec["type_intervention"]}


def main() -> None:
    spec = CAMPAIGN
    conn = connect_db(get_db_path())
    try:
        print(f"\n=== {spec['code']} — {spec['label']} ===")
        campaign = ensure_campaign(spec)
        campagne_id = int(campaign["uid"])
        zone = spec["zone"]
        created = skipped = 0

        for item in spec["interventions"]:
            existing = find_intervention(conn, campagne_id=campagne_id, sujet=item["sujet"])
            if existing:
                skipped += 1
                print(f"  SKIP: {existing['reference']} | {existing['sujet']}")
                continue
            row = create_manual_intervention(conn, campagne_id=campagne_id, zone=zone, spec=item)
            created += 1
            essais = ", ".join(
                e["code"] for e in (item.get("mission_essais_prevus") or []) if e.get("code")
            ) or "—"
            print(f"  OK: {row['reference']} | {item['sujet']} | essais: {essais}")

        total = conn.execute(
            "SELECT COUNT(*) AS c FROM interventions WHERE demande_id=? AND campagne_id=?",
            (DEMANDE_ID, campagne_id),
        ).fetchone()["c"]
        print(f"  -> {created} cree(s), {skipped} skip, {total} intervention(s) total.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

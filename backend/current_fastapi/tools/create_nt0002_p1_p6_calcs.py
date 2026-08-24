"""Create Alizé P1–P6 calcs on D0054 from NT0002 structures, link avis annexes."""
from __future__ import annotations

import json
from pathlib import Path

from app.models.avis_technique import AvisInstanceUpdateSchema
from app.models.calculs import (
    AlizeLayerSchema,
    AlizePayloadUpdateSchema,
    CalculationCreateSchema,
    CalculationUpdateSchema,
)
from app.repositories.avis_technique_repository import AvisTechniqueRepository
from app.repositories.calculs_repository import CalculsRepository
from app.core.database import connect_db, get_db_path
import sqlite3

from app.services.alize_reglementaire import DEFAULT_EV2_TO_E_FACTOR

INSTANCE_ID = 3
DID = 424
AUTEUR = "COSTA PEREIRA Marco"

# E Young de calcul pour les arases NT0002 (≠ EV2 réception).
# Rétabli pour reproduire les εz de la note avec le moteur RaLab
# (validé à E catalogue PF2=50 vs fiches Alizé de référence).
NT0002_YOUNG_E_BY_EV2 = {
    30: 63.0,
    35: 66.0,
}

TRAFFIC = {
    "mja_pl": 50,
    "croissance_pct": 0,
    "duree_ans": 15,
    "cam": 1.0,
    "risque": 5,
    "progression": "geometrique",
    "classe_trafic": "T3",
    "ne_calcule": "",
    "ne_retenu": "",
    "commentaire": "Hypothèses NT0002 Riom — 50 PL/j, 15 ans, CAM 1,0, risque 5 %",
}

PARAMS = {
    "charge_type": "jumelage_fr",
    "temperature": 15,
    "norme": "NF P98-086",
    "logiciel": "RaLab Alizé",
    "cam": 1.0,
    "risque": 5,
}


def layer(
    *,
    ordre: int,
    fonction: str,
    materiau: str,
    famille: str,
    epaisseur: float | None,
    module: float | None,
    poisson: float = 0.35,
    classe: str = "",
    formulation: str = "",
    assise: bool = False,
    interface_inf: str = "collé",
    lie: bool = False,
    justification: str = "",
) -> AlizeLayerSchema:
    return AlizeLayerSchema(
        ordre=ordre,
        fonction=fonction,
        materiau=materiau,
        famille=famille,
        classe=classe,
        formulation=formulation,
        epaisseur=epaisseur,
        unite="cm",
        module=module,
        poisson=poisson,
        temperature_calcul=15,
        frequence=10,
        bibliotheque="NF P98-086 2019",
        assise=assise,
        interface_sup="",
        interface_inf=interface_inf,
        lie=lie,
        from_library=True,
        modified_manually=False,
        justification=justification or "Structure NT0002 / G3 Riom",
        commentaire="NT0002",
    )


def plateforme_commune(ev2: float, *, gnt_ep: float = 7.5, start_ordre: int = 2) -> list[AlizeLayerSchema]:
    """GNT réglage + mâchefer 15@270 + 25@90 + arase PF (E Young ≠ EV2)."""
    e_young = float(NT0002_YOUNG_E_BY_EV2.get(int(ev2), round(float(ev2) * DEFAULT_EV2_TO_E_FACTOR, 1)))
    return [
        layer(
            ordre=start_ordre,
            fonction="Réglage",
            materiau="GNT 0/31,5",
            famille="GNT/Sols",
            epaisseur=gnt_ep,
            module=200,
            interface_inf="géotextile",
            justification="GNT de réglage plateforme commune NT0002",
        ),
        layer(
            ordre=start_ordre + 1,
            fonction="Mâchefer supérieur",
            materiau="Mâchefer 0/40",
            famille="GNT/Sols",
            epaisseur=15,
            module=270,
            interface_inf="aucune",
            justification="Sous-couche équivalente NT0002 (15 cm / 270 MPa)",
        ),
        layer(
            ordre=start_ordre + 2,
            fonction="Mâchefer inférieur",
            materiau="Mâchefer 0/40",
            famille="GNT/Sols",
            epaisseur=25,
            module=90,
            interface_inf="géotextile",
            justification="Sous-couche équivalente NT0002 (25 cm / 90 MPa)",
        ),
        layer(
            ordre=start_ordre + 3,
            fonction="Plateforme",
            materiau=f"PF arase EV2≥{int(ev2)}",
            famille="plateforme",
            classe="PF2" if ev2 <= 50 else "PF2qs",
            epaisseur=None,
            module=e_young,
            interface_inf="",
            justification=(
                f"Arase PST2/AR1 — objectif EV2 ≥ {int(ev2)} MPa ; "
                f"E Young calcul = {e_young:g} MPa (≠ EV2)"
            ),
        ),
    ]


def platform_payload(ev2: float) -> dict:
    e_young = float(NT0002_YOUNG_E_BY_EV2.get(int(ev2), round(float(ev2) * DEFAULT_EV2_TO_E_FACTOR, 1)))
    return {
        "classe": "PF2",
        "ev2": float(ev2),
        "module_pf": e_young,
        "module_source": "explicit",
        "poisson": 0.35,
        "source": "NT0002 arase",
        "commentaire": (
            f"Objectif réception EV2 ≥ {int(ev2)} MPa ; "
            f"E Young calcul = {e_young:g} MPa (distinct de l'EV2)"
        ),
    }


def build_variants() -> list[dict]:
    """P1–P6 definitions from NT0002."""
    return [
        {
            "code": "P1",
            "nom": "P1 — Voirie lourde BBSG (arase 35 MPa)",
            "zone": "P1",
            "ouvrage": "Voirie lourde BBSG",
            "pf": 35,
            "a_retenir": True,
            "surface": layer(
                ordre=1,
                fonction="Roulement",
                materiau="BBSG3",
                famille="bitumineux",
                classe="3",
                epaisseur=5,
                module=7000,
                lie=True,
                interface_inf="collé",
                justification="5 cm BBSG3 0/10 — NT0002 P1",
            ),
        },
        {
            "code": "P2",
            "nom": "P2 — Voirie lourde BBME (plateforme commune 30 MPa)",
            "zone": "P2",
            "ouvrage": "Voirie lourde BBME",
            "pf": 30,
            "a_retenir": True,
            "surface": layer(
                ordre=1,
                fonction="Roulement",
                materiau="BBME3",
                famille="bitumineux",
                classe="3",
                formulation="147.10B",
                epaisseur=5,
                module=11728,
                lie=True,
                interface_inf="collé",
                justification="5 cm BBME3 formule 147.10B E=11728 MPa — NT0002 P2",
            ),
        },
        {
            "code": "P3",
            "nom": "P3 — Voirie légère enrobé grenaillé",
            "zone": "P3",
            "ouvrage": "Voirie légère",
            "pf": 30,
            "a_retenir": True,
            "surface": layer(
                ordre=1,
                fonction="Roulement",
                materiau="BBSG3",
                famille="bitumineux",
                classe="3",
                epaisseur=5,
                module=7000,
                lie=True,
                interface_inf="collé",
                justification="5 cm BBSG3 finition grenaillée — NT0002 P3 (enveloppe P2)",
            ),
        },
        {
            "code": "P4",
            "nom": "P4 — Béton balayé BC5",
            "zone": "P4",
            "ouvrage": "Béton balayé",
            "pf": 30,
            "a_retenir": True,
            "surface": layer(
                ordre=1,
                fonction="Revêtement",
                materiau="BC5",
                famille="beton",
                classe="S2,7",
                epaisseur=20,
                module=23000,
                poisson=0.25,
                lie=True,
                interface_inf="collé",
                justification="20 cm BC5 classe S2,7 — NT0002 P4 (module indicatif)",
            ),
        },
        {
            "code": "P5",
            "nom": "P5 — Pavés béton joints enherbés",
            "zone": "P5",
            "ouvrage": "Pavés béton",
            "pf": 30,
            "a_retenir": True,
            "surface": layer(
                ordre=1,
                fonction="Revêtement",
                materiau="Pavés béton / substrat",
                famille="beton",
                epaisseur=10,
                module=5000,
                poisson=0.25,
                lie=False,
                interface_inf="aucune",
                justification="10 cm pavés/substrat/engazonnement — NT0002 P5 (équiv. simplifié)",
            ),
        },
        {
            "code": "P6",
            "nom": "P6 — Béton désactivé (GNT min. 5 cm)",
            "zone": "P6",
            "ouvrage": "Béton désactivé",
            "pf": 30,
            "a_retenir": True,
            "gnt_ep": 5.0,
            "surface": layer(
                ordre=1,
                fonction="Revêtement",
                materiau="Béton désactivé",
                famille="beton",
                epaisseur=12,
                module=23000,
                poisson=0.25,
                lie=True,
                interface_inf="collé",
                justification="12 cm béton désactivé — NT0002 P6",
            ),
        },
    ]


def find_existing_p_calcs(repo: CalculsRepository) -> dict[str, int]:
    found: dict[str, int] = {}
    # list via SQL for demande
    conn = connect_db(get_db_path())
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, nom_calcul FROM calculations WHERE demande_id=? AND type_calcul='alize'",
        (DID,),
    ).fetchall()
    for r in rows:
        nom = (r["nom_calcul"] or "").upper()
        for code in ("P1", "P2", "P3", "P4", "P5", "P6"):
            if nom.startswith(code) or f" {code} " in f" {nom} " or nom.startswith(f"{code} —") or nom.startswith(f"{code} -"):
                found[code] = int(r["id"])
    return found


def main() -> None:
    repo = CalculsRepository()
    conn = connect_db(get_db_path())
    conn.row_factory = sqlite3.Row
    dem = conn.execute(
        "SELECT id, affaire_rst_id FROM demandes WHERE id=?",
        (DID,),
    ).fetchone()
    affaire_id = dem["affaire_rst_id"] if dem else None

    existing = find_existing_p_calcs(repo)
    created_ids: dict[str, int] = dict(existing)
    report = []

    for var in build_variants():
        code = var["code"]
        layers = [var["surface"], *plateforme_commune(var["pf"], gnt_ep=var.get("gnt_ep", 7.5))]
        platform = platform_payload(var["pf"])
        general = {
            "a_retenir": bool(var["a_retenir"]),
            "pour_impression": True,
            "nom_sortie": code,
            "origin": "nt0002_riom",
            "ref_document": "2025-RA-008-D0054-NT0002",
            "ref_structure": var["nom"],
            "note": f"Créé depuis structures proposées NT0002 ({code})",
        }

        if code in created_ids:
            calc_id = created_ids[code]
            repo.update(
                calc_id,
                CalculationUpdateSchema(
                    nom_calcul=var["nom"],
                    ouvrage=var["ouvrage"],
                    zone_label=var["zone"],
                    general=general,
                    statut="Prêt pour calcul",
                ),
                user_name=AUTEUR,
            )
            report.append(f"UPDATE {code} id={calc_id}")
        else:
            detail = repo.create(
                CalculationCreateSchema(
                    type_calcul="alize",
                    nom_calcul=var["nom"],
                    affaire_rst_id=affaire_id,
                    demande_id=DID,
                    ouvrage=var["ouvrage"],
                    zone_label=var["zone"],
                    auteur=AUTEUR,
                    general=general,
                ),
                user_name=AUTEUR,
            )
            calc_id = int(detail.id)
            created_ids[code] = calc_id
            report.append(f"CREATE {code} id={calc_id} ref={detail.reference}")

        repo.update_alize(
            calc_id,
            AlizePayloadUpdateSchema(
                traffic=TRAFFIC,
                platform=platform,
                params=PARAMS,
                layers=layers,
            ),
            user_name=AUTEUR,
        )

        try:
            updated = repo.run_complet(calc_id, user_name=AUTEUR)
            avis = ""
            if updated and updated.alize:
                avis = (updated.alize.get("results") or {}).get("conclusion") or ""
            report.append(f"  RUN OK {code}: {avis}")
        except Exception as e:
            report.append(f"  RUN FAIL {code}: {e}")

        # ensure flags after runs
        repo.update(
            calc_id,
            CalculationUpdateSchema(general=general),
            user_name=AUTEUR,
        )

    # Link avis instance annexes G–L to calcul_fiches
    avis_repo = AvisTechniqueRepository()
    inst = avis_repo.get_instance(INSTANCE_ID, with_template=True)
    contents = dict(inst.get("contents") or {})
    letter = {"P1": "g", "P2": "h", "P3": "i", "P4": "j", "P5": "k", "P6": "l"}
    all_p_ids = [created_ids[c] for c in ("P1", "P2", "P3", "P4", "P5", "P6") if c in created_ids]

    for code, let in letter.items():
        cid = created_ids.get(code)
        if not cid:
            continue
        sec = f"annexe_{let}"
        contents.setdefault(sec, {})["fiches"] = {
            "block_type": "calcul_fiches",
            "content": {"calcul_ids": [cid], "auto_from_binding": True},
        }
        contents.setdefault(sec, {})["texte"] = {
            "block_type": "rich_text",
            "content": {
                "text": (
                    f"Annexe — Fiche de calcul {code}\n\n"
                    f"Source RaLab : calcul Alizé « {code} » (id {cid}), marqué pour impression.\n"
                    f"Structure et trafic issus de la note NT0002 ; résultats du moteur RaLab "
                    f"(EV2 = réception, module E Young = calcul)."
                )
            },
        }

    # Update synthèse / résultats tables
    contents.setdefault("s7_2", {})["calculs"] = {
        "block_type": "calculs_table",
        "content": {"calcul_ids": all_p_ids, "auto_from_binding": True},
    }
    contents.setdefault("s3_1", {})["resume_calculs"] = {
        "block_type": "calculs_table",
        "content": {"calcul_ids": all_p_ids, "auto_from_binding": True},
    }
    contents.setdefault("ch11" if False else "s11_1", {})
    contents.setdefault("s11_1", {})["retenus"] = {
        "block_type": "calculs_table",
        "content": {
            "calcul_ids": [created_ids[c] for c in ("P1", "P2") if c in created_ids],
            "auto_from_binding": True,
        },
    }
    contents.setdefault("annexe_b", {})["calculs"] = {
        "block_type": "calculs_table",
        "content": {"calcul_ids": all_p_ids, "auto_from_binding": True},
    }
    contents.setdefault("annexe_fiches_alize", {})["fiches"] = {
        "block_type": "calcul_fiches",
        "content": {"calcul_ids": all_p_ids, "auto_from_binding": True},
    }

    # Rebuild results table from engine
    result_headers = ["Calcul", "εt calc", "εt adm", "εz calc", "εz adm", "Avis"]
    result_rows = []
    for code in ("P1", "P2", "P3", "P4", "P5", "P6"):
        cid = created_ids.get(code)
        if not cid:
            continue
        d = repo.get(cid)
        res = ((d.alize or {}).get("results") or {}) if d else {}
        result_rows.append(
            [
                code,
                str(res.get("epsT_calc") or ""),
                str(res.get("epsT_adm") or ""),
                str(res.get("epsZ_calc") or ""),
                str(res.get("epsZ_adm") or ""),
                str(res.get("conclusion") or d.statut if d else ""),
            ]
        )
    contents.setdefault("s7_2", {})["resultats"] = {
        "block_type": "free_table",
        "content": {"headers": result_headers, "rows": result_rows},
    }
    contents.setdefault("annexe_b", {})["tableau"] = {
        "block_type": "free_table",
        "content": {"headers": result_headers, "rows": result_rows},
    }

    avis_repo.update_instance(
        INSTANCE_ID,
        AvisInstanceUpdateSchema(
            contents=contents,
            linked_calcul_ids=sorted(set([6, 8, *all_p_ids])),
        ),
    )

    out = Path("tools/_tmp_create_p_report.txt")
    out.write_text("\n".join(report) + "\nIDS=" + json.dumps(created_ids), encoding="utf-8")
    print(out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

"""Repository SQLite — Calculs de dimensionnement (Phase 1 Alizé)."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.database import connect_db, ensure_ralab5_schema, get_db_path
from app.models.calculs import (
    AlizeCriterionSchema,
    AlizeLayerSchema,
    AlizePayloadUpdateSchema,
    CalculationCreateSchema,
    CalculationDetailSchema,
    CalculationListItemSchema,
    CalculationUpdateSchema,
    CalculsSummarySchema,
)
from app.services.alize_reglementaire import run_reglementaire_payload
from app.services.alize_mecanique import run_complet_payload, run_mecanique_payload


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _json_loads(raw: Any, default: Any = None):
    if default is None:
        default = {}
    if raw is None or raw == "":
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return default


def _selection_flags_from_general(general: Any) -> dict[str, Any]:
    payload = general if isinstance(general, dict) else {}
    return {
        "pour_impression": bool(payload.get("pour_impression")),
        "a_retenir": bool(payload.get("a_retenir")),
        "nom_sortie": str(payload.get("nom_sortie") or "").strip(),
    }


def _avis_from_results_and_statuts(results: Any, criteria_statuts: list[str] | None = None) -> str:
    """Réutilise le résultat déjà stocké (critères / ε) — pas de recalcul moteur."""
    ranks = {"Non conforme": 3, "Limite": 2, "Conforme": 1}
    best = 0
    for raw in criteria_statuts or []:
        label = str(raw or "").strip()
        best = max(best, ranks.get(label, 0))
    if best == 3:
        return "Non conforme"
    if best == 2:
        return "Limite"
    if best == 1:
        return "Conforme"

    payload = results if isinstance(results, dict) else {}
    try:
        adm_t = payload.get("epsT_adm")
        calc_t = payload.get("epsT_calc")
        adm_z = payload.get("epsZ_adm")
        calc_z = payload.get("epsZ_calc")
        ratios: list[float] = []
        if adm_t not in (None, "") and calc_t not in (None, "") and float(adm_t) != 0:
            ratios.append(float(calc_t) / float(adm_t))
        if adm_z not in (None, "") and calc_z not in (None, "") and float(adm_z) != 0:
            ratios.append(float(calc_z) / float(adm_z))
        if ratios:
            mx = max(ratios)
            if mx <= 0.9:
                return "Conforme"
            if mx <= 1.0:
                return "Limite"
            return "Non conforme"
    except (TypeError, ValueError):
        pass
    return "Indicatif"


def _json_dumps(value: Any) -> str:
    return json.dumps(value or {}, ensure_ascii=False)


def _criterion_status(adm: float | None, calc: float | None, sens: str) -> tuple[float | None, float | None, str]:
    if adm is None or calc is None or adm == 0:
        return None, None, "Non renseigné"
    if sens == "superieur_ou_egal":
        marge = calc - adm
        conso = adm / calc if calc else None
        if conso is None:
            return marge, None, "Non renseigné"
        pct = conso * 100
        if pct <= 90:
            return marge, conso, "Conforme"
        if pct <= 100:
            return marge, conso, "Limite"
        return marge, conso, "Non conforme"
    # défaut: inférieur ou égal (déformation)
    marge = adm - calc
    conso = calc / adm
    pct = conso * 100
    if pct <= 90:
        return marge, conso, "Conforme"
    if pct <= 100:
        return marge, conso, "Limite"
    return marge, conso, "Non conforme"


class CalculsRepository:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or get_db_path()
        ensure_ralab5_schema(self.db_path)

    def _connect(self):
        return connect_db(self.db_path)

    def _next_reference(self, conn, type_calcul: str) -> str:
        year = datetime.utcnow().year
        prefix = {
            "alize": f"{year}-CALC-AL",
            "gel_degel": f"{year}-CALC-GD",
            "talren": f"{year}-CALC-TA",
        }.get(type_calcul, f"{year}-CALC")
        row = conn.execute(
            "SELECT reference FROM calculations WHERE reference LIKE ? ORDER BY id DESC LIMIT 1",
            (f"{prefix}-%",),
        ).fetchone()
        n = 1
        if row and row["reference"]:
            try:
                n = int(str(row["reference"]).rsplit("-", 1)[-1]) + 1
            except ValueError:
                n = 1
        return f"{prefix}-{n:04d}"

    def summary(self, *, affaire_rst_id: int | None = None) -> CalculsSummarySchema:
        sql = "SELECT type_calcul, statut, COUNT(*) AS c FROM calculations WHERE 1=1"
        params: list[Any] = []
        if affaire_rst_id is not None:
            sql += " AND affaire_rst_id = ?"
            params.append(affaire_rst_id)
        sql += " GROUP BY type_calcul, statut"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        out = CalculsSummarySchema()
        for row in rows:
            c = int(row["c"] or 0)
            out.total += c
            t = row["type_calcul"]
            if t == "alize":
                out.alize += c
            elif t == "gel_degel":
                out.gel_degel += c
            elif t == "talren":
                out.talren += c
            st = row["statut"]
            if st in {"Brouillon", "Données incomplètes", "Prêt pour calcul", "Calcul en cours", "Résultats importés"}:
                out.variantes_en_cours += c
            if st in {"À vérifier", "Résultats importés"}:
                out.a_verifier += c
            if st in {"Vérifié", "Validé"}:
                out.valides += c
        return out

    def list_calculations(
        self,
        *,
        type_calcul: str | None = None,
        affaire_rst_id: int | None = None,
        demande_id: int | None = None,
        mission_id: int | None = None,
        statut: str | None = None,
        search: str | None = None,
    ) -> list[CalculationListItemSchema]:
        sql = """
            SELECT c.*,
                   a.reference AS affaire_ref,
                   a.chantier,
                   a.client,
                   d.reference AS demande_ref
            FROM calculations c
            LEFT JOIN affaires_rst a ON a.id = c.affaire_rst_id
            LEFT JOIN demandes d ON d.id = c.demande_id
            WHERE 1=1
        """
        params: list[Any] = []
        if type_calcul:
            sql += " AND c.type_calcul = ?"
            params.append(type_calcul)
        if affaire_rst_id is not None:
            sql += " AND c.affaire_rst_id = ?"
            params.append(affaire_rst_id)
        if demande_id is not None:
            sql += " AND c.demande_id = ?"
            params.append(demande_id)
        if mission_id is not None:
            sql += " AND c.mission_id = ?"
            params.append(mission_id)
        if statut:
            sql += " AND c.statut = ?"
            params.append(statut)
        if search:
            like = f"%{search}%"
            sql += """ AND (
                c.reference LIKE ? OR c.nom_calcul LIKE ? OR c.ouvrage LIKE ?
                OR a.reference LIKE ? OR d.reference LIKE ? OR a.chantier LIKE ?
            )"""
            params.extend([like] * 6)
        sql += " ORDER BY c.updated_at DESC, c.id DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
            avis_by_id = self._avis_map_for_ids(conn, [int(r["id"]) for r in rows])
        return [
            CalculationListItemSchema(
                id=int(r["id"]),
                reference=r["reference"] or "",
                type_calcul=r["type_calcul"] or "",
                nom_calcul=r["nom_calcul"] or "",
                indice=r["indice"] or "A",
                version=int(r["version"] or 1),
                statut=r["statut"] or "",
                affaire_rst_id=r["affaire_rst_id"],
                demande_id=r["demande_id"],
                mission_id=r["mission_id"],
                affaire_ref=r["affaire_ref"] or "",
                demande_ref=r["demande_ref"] or "",
                chantier=r["chantier"] or "",
                client=r["client"] or "",
                ouvrage=r["ouvrage"] or "",
                zone_label=r["zone_label"] or "",
                auteur=r["auteur"] or "",
                updated_at=r["updated_at"] or "",
                avis=avis_by_id.get(int(r["id"]), "Indicatif"),
                **_selection_flags_from_general(_json_loads(r["general_json"])),
            )
            for r in rows
        ]

    def _avis_map_for_ids(self, conn, ids: list[int]) -> dict[int, str]:
        if not ids:
            return {}
        placeholders = ",".join("?" for _ in ids)
        results_by_id: dict[int, dict] = {}
        for row in conn.execute(
            f"SELECT calculation_id, results_json FROM alize_projects WHERE calculation_id IN ({placeholders})",
            ids,
        ).fetchall():
            results_by_id[int(row["calculation_id"])] = _json_loads(row["results_json"])

        statuts_by_id: dict[int, list[str]] = {i: [] for i in ids}
        for row in conn.execute(
            f"SELECT calculation_id, statut FROM alize_criteria WHERE calculation_id IN ({placeholders})",
            ids,
        ).fetchall():
            cid = int(row["calculation_id"])
            statuts_by_id.setdefault(cid, []).append(row["statut"] or "")

        return {
            cid: _avis_from_results_and_statuts(results_by_id.get(cid), statuts_by_id.get(cid))
            for cid in ids
        }

    def create(self, body: CalculationCreateSchema, *, user_name: str = "") -> CalculationDetailSchema:
        type_calcul = (body.type_calcul or "alize").strip().lower()
        if type_calcul not in {"alize", "gel_degel", "talren"}:
            raise ValueError("type_calcul invalide")
        now = _now()
        with self._connect() as conn:
            ref = self._next_reference(conn, type_calcul)
            cur = conn.execute(
                """
                INSERT INTO calculations (
                    reference, type_calcul, nom_calcul, indice, version, statut,
                    affaire_rst_id, demande_id, mission_id, campaign_id, intervention_id,
                    ouvrage, zone_label, auteur, general_json, created_at, updated_at
                ) VALUES (?, ?, ?, 'A', 1, 'Brouillon', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ref,
                    type_calcul,
                    body.nom_calcul or f"Calcul {type_calcul}",
                    body.affaire_rst_id,
                    body.demande_id,
                    body.mission_id,
                    body.campaign_id,
                    body.intervention_id,
                    body.ouvrage or "",
                    body.zone_label or "",
                    body.auteur or user_name or "",
                    _json_dumps(body.general),
                    now,
                    now,
                ),
            )
            calc_id = int(cur.lastrowid)
            if type_calcul == "alize":
                conn.execute(
                    "INSERT INTO alize_projects (calculation_id, updated_at) VALUES (?, ?)",
                    (calc_id, now),
                )
                self._seed_alize_defaults(conn, calc_id, now=now)
            conn.commit()
        return self.get(calc_id)

    def _seed_alize_defaults(self, conn, calculation_id: int, *, now: str) -> None:
        """Préremplit comme Alizé à l'ouverture d'un nouveau projet (pas de saisie vide)."""
        traffic = {
            "mja_pl": "",
            "croissance_pct": 2,
            "duree_ans": 20,
            "cam": 0.8,
            "risque": 5,
            "progression": "geometrique",
            "classe_trafic": "",
            "ne_calcule": "",
            "ne_retenu": "",
            "commentaire": "Valeurs par défaut RaLab (à ajuster)",
        }
        platform = {
            "classe": "PF2",
            "module_pf": 50,
            "poisson": 0.35,
            "source": "Défaut catalogue",
            "commentaire": "",
        }
        params = {
            "charge_type": "jumelage_fr",
            "temperature": 15,
            "norme": "NF P98-086",
            "logiciel": "RaLab imitation Alizé",
            "cam": 0.8,
            "risque": 5,
        }
        conn.execute(
            """
            UPDATE alize_projects
            SET traffic_json = ?, platform_json = ?, params_json = ?, updated_at = ?
            WHERE calculation_id = ?
            """,
            (_json_dumps(traffic), _json_dumps(platform), _json_dumps(params), now, calculation_id),
        )
        default_layers = [
            ("Roulement", "BBSG3", "bitumineux", "", 5, 7000, 0.35),
            ("Assise", "GB4", "bitumineux", "", 8, 11000, 0.35),
            ("Plateforme", "PF2", "plateforme", "PF2", None, 50, 0.35),
        ]
        for i, (fonction, materiau, famille, classe, ep, module, poisson) in enumerate(default_layers, start=1):
            conn.execute(
                """
                INSERT INTO alize_layers (
                    calculation_id, ordre, fonction, materiau, famille, classe, formulation,
                    epaisseur, unite, module, poisson, temperature_calcul, frequence, bibliotheque, assise,
                    interface_sup, interface_inf, lie, from_library, modified_manually,
                    justification, commentaire, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, '', ?, 'cm', ?, ?, 15, 10, 'NF P98-086 2019', ?, '', 'collé', 0, 1, 0, ?, '', ?, ?)
                """,
                (
                    calculation_id,
                    i,
                    fonction,
                    materiau,
                    famille,
                    classe,
                    ep,
                    module,
                    poisson,
                    1 if i == 2 else 0,  # assise = couche d'assise GB par défaut
                    "Structure type par défaut (5 BBSG3 + 8 GB4 / PF2)",
                    now,
                    now,
                ),
            )
        for critere, materiau, adm, calc, unite in (
            ("fatigue_epsilonT", "GB4", None, None, "µdéf"),
            ("plateforme_epsilonZ", "PF2", None, None, "µdéf"),
        ):
            conn.execute(
                """
                INSERT INTO alize_criteria (
                    calculation_id, critere, materiau, couche, profondeur,
                    valeur_admissible, valeur_calculee, unite, marge, consommation,
                    sens_verification, statut, commentaire, created_at, updated_at
                ) VALUES (?, ?, ?, ?, '', ?, ?, ?, NULL, NULL, 'inferieur_ou_egal', 'Non renseigné', ?, ?, ?)
                """,
                (
                    calculation_id,
                    critere,
                    materiau,
                    materiau,
                    adm,
                    calc,
                    unite,
                    "Critère préparé (valeurs à renseigner / imitation)",
                    now,
                    now,
                ),
            )

    def alize_catalogs(self) -> dict:
        """Bibliothèques pour saisie assistée (style Alizé)."""
        with self._connect() as conn:
            mats = conn.execute(
                """
                SELECT materiau AS code,
                       COUNT(*) AS usage_count,
                       AVG(module_MPa) AS module_avg,
                       AVG(epaisseur_cm) AS epaisseur_avg
                FROM ref_alize_couches
                WHERE TRIM(COALESCE(materiau, '')) <> ''
                GROUP BY materiau
                ORDER BY usage_count DESC, materiau
                """
            ).fetchall()
            labo = conn.execute(
                """
                SELECT id,
                       famille,
                       produit_ou_reference AS label,
                       module_E_MPa AS module,
                       eps6_microdef AS eps6,
                       document,
                       formule,
                       source_ref,
                       commentaire,
                       granulats,
                       bitume
                FROM ref_materiaux_labo
                WHERE TRIM(COALESCE(produit_ou_reference, '')) <> ''
                ORDER BY id
                """
            ).fetchall()
            pfs = conn.execute(
                """
                SELECT plateforme AS classe,
                       COUNT(*) AS usage_count,
                       AVG(module_pf_MPa) AS module_avg
                FROM ref_alize_etudes
                WHERE TRIM(COALESCE(plateforme, '')) <> ''
                GROUP BY plateforme
                ORDER BY usage_count DESC
                """
            ).fetchall()
            structures = conn.execute(
                """
                SELECT structure AS label,
                       COUNT(*) AS usage_count,
                       MIN(id) AS sample_etude_id
                FROM ref_alize_etudes
                WHERE TRIM(COALESCE(structure, '')) <> ''
                GROUP BY structure
                ORDER BY usage_count DESC, structure
                LIMIT 40
                """
            ).fetchall()

        materials = []
        seen_ids: set[str] = set()

        def _push_material(entry: dict) -> None:
            mid = str(entry.get("id") or "").strip()
            if not mid or mid in seen_ids:
                return
            seen_ids.add(mid)
            code = str(entry.get("code") or "").strip()
            famille = entry.get("famille") or self._guess_famille(code or str(entry.get("label") or ""))
            # Formulations labo/FTP type « Formulation matériau » → bitumineux si code GB/BB/…
            if famille in {"labo", "Formulation matériau", "Référence matériau", "autre"}:
                guessed = self._guess_famille(code or str(entry.get("label") or ""))
                if guessed != "autre":
                    famille = guessed
            materials.append(
                {
                    **entry,
                    "id": mid,
                    "code": code or mid,
                    "label": entry.get("label") or code or mid,
                    "famille": famille,
                    "poisson": entry.get("poisson") if entry.get("poisson") is not None else 0.35,
                    "usage_count": int(entry.get("usage_count") or 0),
                }
            )

        # 1) Catalogue Excel (couches d'études) — codes génériques
        for row in mats:
            code = (row["code"] or "").strip()
            if not code:
                continue
            is_pf = code.upper().startswith("PF")
            _push_material(
                {
                    "id": f"excel::{code}",
                    "code": code,
                    "label": code,
                    "famille": "plateforme" if is_pf else self._guess_famille(code),
                    "module": row["module_avg"],
                    "epaisseur_typique": row["epaisseur_avg"],
                    "usage_count": int(row["usage_count"] or 0),
                    "source": "biblio",
                }
            )

        # 2) Matériaux labo / FTP (fiches) — toujours listés, même si le code base existe déjà
        for row in labo:
            label = (row["label"] or "").strip()
            if not label:
                continue
            # Ignorer lignes purement documentaires sans module
            if row["module"] is None and not any(
                x in label.upper() for x in ("GB", "BB", "EME", "PF", "GNT")
            ):
                continue
            blob = " ".join(
                str(row[k] or "")
                for k in ("label", "document", "formule", "source_ref", "commentaire")
            ).lower()
            is_ftp = any(x in blob for x in ("ftp", "f117", "ftae", "sec", "dop", "déclaration"))
            # Code court pour Alizé (couche) + label long pour la liste
            code_hint = "GB4" if "gb4" in label.lower() or "gb4" in blob else label
            if "f117.30" in blob or "f117.30" in label.lower():
                code_hint = "GB4 F117.30"
            centrale = ""
            if "sec" in blob:
                centrale = "SEC"
            _push_material(
                {
                    "id": f"{'ftp' if is_ftp else 'labo'}::{row['id']}",
                    "code": code_hint,
                    "label": label,
                    "famille": row["famille"] or self._guess_famille(label),
                    "module": row["module"],
                    "epaisseur_typique": 8 if "GB" in label.upper() else None,
                    "eps6": row["eps6"],
                    "source": "ftp" if is_ftp else "labo",
                    "ftp_url": row["document"] or "",
                    "centrale": centrale,
                    "formule": row["formule"] or "",
                }
            )

        # 3) Compléments standards NF (si absents)
        for code, famille, module, ep in (
            ("BBSG2", "bitumineux", 7000, 5),
            ("BBSG3", "bitumineux", 7000, 5),
            ("BBME2", "bitumineux", 11000, 6),
            ("BBME3", "bitumineux", 11000, 6),
            ("GB3", "bitumineux", 9000, 10),
            ("GB4", "bitumineux", 11000, 8),
            ("EME2", "bitumineux", 14000, 8),
            ("GNT", "GNT/Sols", None, 20),
            ("PF1", "plateforme", 20, None),
            ("PF2", "plateforme", 50, None),
            ("PF2qs", "plateforme", 80, None),
            ("PF3", "plateforme", 120, None),
            ("PF4", "plateforme", 200, None),
        ):
            if any(m.get("code") == code and m.get("source") in {"biblio", "catalogue_standard", "excel_couches"} for m in materials):
                continue
            _push_material(
                {
                    "id": f"nf::{code}",
                    "code": code,
                    "label": code,
                    "famille": famille,
                    "module": module,
                    "epaisseur_typique": ep,
                    "source": "catalogue_standard",
                }
            )

        # Tri : FTP / labo d'abord pour les formulations, puis biblio
        def _mat_sort_key(m: dict) -> tuple:
            src = str(m.get("source") or "")
            rank = 0 if src == "ftp" else 1 if src == "labo" else 2
            return (rank, str(m.get("label") or m.get("code") or ""))

        materials.sort(key=_mat_sort_key)

        structure_templates = []
        for row in structures:
            packed = self.get_ref_etude(int(row["sample_etude_id"]))
            if not packed:
                continue
            payload = packed["alize_payload"]
            structure_templates.append(
                {
                    "label": row["label"],
                    "usage_count": int(row["usage_count"] or 0),
                    "ref_etude_id": int(row["sample_etude_id"]),
                    "plateforme": (packed["etude"] or {}).get("plateforme") or "",
                    "layers": payload.get("layers") or [],
                    "traffic_hint": {
                        "cam": (packed["etude"] or {}).get("CAM"),
                        "risque": (packed["etude"] or {}).get("risque_pct"),
                    },
                }
            )

        return {
            "materials": materials,
            "material_families": [
                {"id": "bitumineux", "label": "Matériaux bitumineux"},
                {"id": "MTLH", "label": "MTLH (liés hydrauliques)"},
                {"id": "betons", "label": "Bétons"},
                {"id": "GNT/Sols", "label": "GNT / Sols"},
                {"id": "STLH", "label": "STLH (sols traités)"},
                {"id": "plateforme", "label": "Plateforme"},
                {"id": "autre", "label": "Autre / libre"},
            ],
            "bibliotheques": [
                {"id": "Catalogue 1998", "label": "Catalogue 1998"},
                {"id": "NF P98-086 2011", "label": "NF P98-086 2011"},
                {"id": "NF P98-086 2019", "label": "NF P98-086 2019"},
                {"id": "autre", "label": "Autre (hors bibliothèque)"},
            ],
            # Futur : centrales enrobés (peuplé via ref_materiaux_labo / FTP).
            "centrales": sorted(
                {
                    str(m.get("centrale") or "").strip()
                    for m in materials
                    if str(m.get("centrale") or "").strip()
                }
            ),
            "ftp_sources": [
                {
                    "id": m["id"],
                    "code": m["code"],
                    "label": m["label"],
                    "module": m.get("module"),
                    "eps6": m.get("eps6"),
                    "document": m.get("ftp_url") or "",
                }
                for m in materials
                if m.get("source") == "ftp"
            ],
            "interfaces": [
                {"id": "collé", "label": "Collé", "color": "#22c55e"},
                {"id": "semi-collé", "label": "Semi-collé", "color": "#f59e0b"},
                {"id": "glissant", "label": "Glissant", "color": "#ef4444"},
                {"id": "géotextile", "label": "Géotextile", "color": "#0ea5e9"},
                {"id": "aucune", "label": "Aucune (granulaires)", "color": "#94a3b8"},
            ],
            "plateformes": [
                {
                    "classe": r["classe"],
                    "module": r["module_avg"],
                    "usage_count": int(r["usage_count"] or 0),
                }
                for r in pfs
            ],
            "structure_templates": structure_templates,
            "cam_presets": [0.2, 0.3, 0.5, 0.8, 1.0, 1.3],
            "risque_presets": [2, 5, 12, 25, 30, 50],
            "criterion_presets": [
                {"critere": "fatigue_epsilonT", "label": "εt fatigue", "unite": "µdéf", "sens_verification": "inferieur_ou_egal"},
                {"critere": "plateforme_epsilonZ", "label": "εz plateforme", "unite": "µdéf", "sens_verification": "inferieur_ou_egal"},
                {"critere": "contrainte_sigmaT", "label": "σt", "unite": "MPa", "sens_verification": "inferieur_ou_egal"},
            ],
            "defaults": {
                "poisson": 0.35,
                "temperature": 15,
                "frequence": 10,
                "bibliotheque": "NF P98-086 2019",
                "charge_type": "jumelage_fr",
                "norme": "NF P98-086",
            },
        }

    @staticmethod
    def _guess_famille(code: str) -> str:
        u = code.upper()
        if u.startswith("PF"):
            return "plateforme"
        if u.startswith("GNT") or "SOL" in u:
            return "GNT/Sols"
        if any(u.startswith(p) for p in ("BB", "GB", "EME", "BBTM", "BBME")):
            return "bitumineux"
        if "BETON" in u or u.startswith("BC"):
            return "betons"
        if "STLH" in u:
            return "STLH"
        if "MTLH" in u or "GH" in u or "GC" in u:
            return "MTLH"
        return "autre"
    def get(self, calculation_id: int) -> CalculationDetailSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT c.*,
                       a.reference AS affaire_ref,
                       a.chantier, a.client, a.site AS commune, a.adresse_ouvrage AS adresse,
                       a.maitre_ouvrage AS moa, a.maitre_oeuvre AS moe,
                       a.responsable, a.statut AS affaire_statut,
                       d.reference AS demande_ref,
                       d.service_interne AS laboratoire
                FROM calculations c
                LEFT JOIN affaires_rst a ON a.id = c.affaire_rst_id
                LEFT JOIN demandes d ON d.id = c.demande_id
                WHERE c.id = ?
                """,
                (calculation_id,),
            ).fetchone()
            if not row:
                return None
            alize = None
            if row["type_calcul"] == "alize":
                alize = self._load_alize(conn, calculation_id)
            detail = self._detail_from_row(row, alize=alize)
            detail.readiness = self._readiness_alize(detail) if detail.type_calcul == "alize" else {}
            return detail

    def update(self, calculation_id: int, body: CalculationUpdateSchema, *, user_name: str = "") -> CalculationDetailSchema | None:
        updates = body.model_dump(exclude_unset=True)
        merge_general = "general" in updates
        incoming_general = updates.pop("general", None) if merge_general else None
        if not updates and not merge_general:
            return self.get(calculation_id)
        updates["updated_at"] = _now()
        with self._connect() as conn:
            exists = conn.execute(
                "SELECT id, general_json FROM calculations WHERE id = ?",
                (calculation_id,),
            ).fetchone()
            if not exists:
                return None
            if merge_general:
                current = _json_loads(exists["general_json"])
                if isinstance(incoming_general, dict):
                    current.update(incoming_general)
                updates["general_json"] = _json_dumps(current)
            cols = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE calculations SET {cols} WHERE id = ?",
                list(updates.values()) + [calculation_id],
            )
            conn.execute(
                """
                INSERT INTO calculation_change_log (calculation_id, field_path, new_value, user_name, reason)
                VALUES (?, ?, ?, ?, ?)
                """,
                (calculation_id, "update", json.dumps(list(updates.keys())), user_name, "patch"),
            )
            conn.commit()
        return self.get(calculation_id)

    def duplicate(self, calculation_id: int, *, user_name: str = "") -> CalculationDetailSchema | None:
        src = self.get(calculation_id)
        if not src:
            return None
        created = self.create(
            CalculationCreateSchema(
                type_calcul=src.type_calcul,
                nom_calcul=f"{src.nom_calcul} (copie)",
                affaire_rst_id=src.affaire_rst_id,
                demande_id=src.demande_id,
                mission_id=src.mission_id,
                campaign_id=src.campaign_id,
                intervention_id=src.intervention_id,
                ouvrage=src.ouvrage,
                zone_label=src.zone_label,
                auteur=user_name or src.auteur,
                general=src.general,
            ),
            user_name=user_name,
        )
        if src.type_calcul == "alize" and src.alize:
            self.update_alize(
                created.id,
                AlizePayloadUpdateSchema(
                    traffic=src.alize.get("traffic") or {},
                    platform=src.alize.get("platform") or {},
                    params=src.alize.get("params") or {},
                    results=src.alize.get("results") or {},
                    gel=src.alize.get("gel") or {},
                    layers=[AlizeLayerSchema(**x) for x in (src.alize.get("layers") or [])],
                    criteria=[AlizeCriterionSchema(**x) for x in (src.alize.get("criteria") or [])],
                ),
                user_name=user_name,
            )
        with self._connect() as conn:
            conn.execute(
                "UPDATE calculations SET parent_calculation_id = ?, updated_at = ? WHERE id = ?",
                (calculation_id, _now(), created.id),
            )
            conn.commit()
        return self.get(created.id)

    def update_alize(
        self,
        calculation_id: int,
        body: AlizePayloadUpdateSchema,
        *,
        user_name: str = "",
    ) -> CalculationDetailSchema | None:
        detail = self.get(calculation_id)
        if not detail or detail.type_calcul != "alize":
            return None
        now = _now()
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO alize_projects (calculation_id, updated_at) VALUES (?, ?)",
                (calculation_id, now),
            )
            sets = []
            params: list[Any] = []
            mapping = {
                "traffic": "traffic_json",
                "platform": "platform_json",
                "params": "params_json",
                "results": "results_json",
                "gel": "gel_json",
            }
            payload = body.model_dump(exclude_unset=True)
            for key, col in mapping.items():
                if key in payload and payload[key] is not None:
                    sets.append(f"{col} = ?")
                    params.append(_json_dumps(payload[key]))
            if sets:
                sets.append("updated_at = ?")
                params.append(now)
                params.append(calculation_id)
                conn.execute(f"UPDATE alize_projects SET {', '.join(sets)} WHERE calculation_id = ?", params)

            if body.layers is not None:
                conn.execute("DELETE FROM alize_layers WHERE calculation_id = ?", (calculation_id,))
                for i, layer in enumerate(body.layers, start=1):
                    conn.execute(
                        """
                        INSERT INTO alize_layers (
                            calculation_id, ordre, fonction, materiau, famille, classe, formulation,
                            epaisseur, unite, module, poisson, temperature_calcul, frequence, bibliotheque, assise,
                            interface_sup, interface_inf, lie, from_library, modified_manually,
                            justification, commentaire, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            calculation_id,
                            layer.ordre or i,
                            layer.fonction,
                            layer.materiau,
                            layer.famille,
                            layer.classe,
                            layer.formulation,
                            layer.epaisseur,
                            layer.unite or "cm",
                            layer.module,
                            layer.poisson,
                            layer.temperature_calcul,
                            layer.frequence if layer.frequence is not None else 10,
                            layer.bibliotheque or "NF P98-086 2019",
                            1 if layer.assise else 0,
                            layer.interface_sup,
                            layer.interface_inf,
                            1 if layer.lie else 0,
                            1 if layer.from_library else 0,
                            1 if layer.modified_manually else 0,
                            layer.justification,
                            layer.commentaire,
                            now,
                            now,
                        ),
                    )

            if body.criteria is not None:
                conn.execute("DELETE FROM alize_criteria WHERE calculation_id = ?", (calculation_id,))
                for crit in body.criteria:
                    marge, conso, statut = _criterion_status(
                        crit.valeur_admissible,
                        crit.valeur_calculee,
                        crit.sens_verification or "inferieur_ou_egal",
                    )
                    if crit.marge is not None:
                        marge = crit.marge
                    if crit.consommation is not None:
                        conso = crit.consommation
                    if crit.statut and crit.statut != "Non renseigné":
                        statut = crit.statut
                    conn.execute(
                        """
                        INSERT INTO alize_criteria (
                            calculation_id, critere, materiau, couche, profondeur,
                            valeur_admissible, valeur_calculee, unite, marge, consommation,
                            sens_verification, statut, commentaire, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            calculation_id,
                            crit.critere,
                            crit.materiau,
                            crit.couche,
                            crit.profondeur,
                            crit.valeur_admissible,
                            crit.valeur_calculee,
                            crit.unite,
                            marge,
                            conso,
                            crit.sens_verification or "inferieur_ou_egal",
                            statut,
                            crit.commentaire,
                            now,
                            now,
                        ),
                    )

            conn.execute(
                "UPDATE calculations SET updated_at = ? WHERE id = ?",
                (now, calculation_id),
            )
            conn.commit()
        return self.get(calculation_id)

    def run_reglementaire(self, calculation_id: int, *, user_name: str = "") -> CalculationDetailSchema | None:
        detail = self.get(calculation_id)
        if not detail or detail.type_calcul != "alize":
            return None
        alize = detail.alize or {}
        outcome = run_reglementaire_payload(
            traffic=alize.get("traffic") or {},
            platform=alize.get("platform") or {},
            params=alize.get("params") or {},
            layers=alize.get("layers") or [],
            criteria=alize.get("criteria") or [],
        )
        if not outcome.get("ok"):
            raise ValueError("; ".join(outcome.get("warnings") or ["Calcul réglementaire impossible"]))

        results = dict(outcome.get("results") or {})
        results["reglementaire_report"] = outcome.get("report") or {}

        updated = self.update_alize(
            calculation_id,
            AlizePayloadUpdateSchema(
                traffic=outcome["traffic"],
                params=outcome["params"],
                results=results,
                criteria=[AlizeCriterionSchema(**c) for c in outcome["criteria"]],
            ),
            user_name=user_name,
        )
        if updated and updated.statut in {"Brouillon", "Données incomplètes"}:
            updated = self.update(
                calculation_id,
                CalculationUpdateSchema(statut="Prêt pour calcul"),
                user_name=user_name,
            )
        return updated

    def run_mecanique(self, calculation_id: int, *, user_name: str = "") -> CalculationDetailSchema | None:
        detail = self.get(calculation_id)
        if not detail or detail.type_calcul != "alize":
            return None
        alize = detail.alize or {}
        outcome = run_mecanique_payload(
            layers=alize.get("layers") or [],
            platform=alize.get("platform") or {},
            params=alize.get("params") or {},
            criteria=alize.get("criteria") or [],
            results=alize.get("results") or {},
        )
        if not outcome.get("ok"):
            raise ValueError("; ".join(outcome.get("warnings") or ["Calcul mécanique impossible"]))
        updated = self.update_alize(
            calculation_id,
            AlizePayloadUpdateSchema(
                params=outcome["params"],
                results=outcome["results"],
                criteria=[AlizeCriterionSchema(**c) for c in outcome["criteria"]],
            ),
            user_name=user_name,
        )
        if updated and updated.statut in {"Brouillon", "Données incomplètes", "Prêt pour calcul"}:
            updated = self.update(
                calculation_id,
                CalculationUpdateSchema(statut="À vérifier"),
                user_name=user_name,
            )
        return updated

    def run_complet(self, calculation_id: int, *, user_name: str = "") -> CalculationDetailSchema | None:
        detail = self.get(calculation_id)
        if not detail or detail.type_calcul != "alize":
            return None
        alize = detail.alize or {}
        outcome = run_complet_payload(
            traffic=alize.get("traffic") or {},
            platform=alize.get("platform") or {},
            params=alize.get("params") or {},
            layers=alize.get("layers") or [],
            criteria=alize.get("criteria") or [],
        )
        if not outcome.get("ok"):
            raise ValueError("; ".join(outcome.get("warnings") or ["Calcul complet impossible"]))
        updated = self.update_alize(
            calculation_id,
            AlizePayloadUpdateSchema(
                traffic=outcome.get("traffic"),
                params=outcome["params"],
                results=outcome["results"],
                criteria=[AlizeCriterionSchema(**c) for c in outcome["criteria"]],
            ),
            user_name=user_name,
        )
        if updated and updated.statut in {"Brouillon", "Données incomplètes", "Prêt pour calcul"}:
            updated = self.update(
                calculation_id,
                CalculationUpdateSchema(statut="À vérifier"),
                user_name=user_name,
            )
        return updated

    def search_ref_etudes(self, *, search: str = "", limit: int = 50) -> list[dict]:
        sql = "SELECT * FROM ref_alize_etudes WHERE is_primary = 1"
        params: list[Any] = []
        if search:
            like = f"%{search}%"
            sql += " AND (projet LIKE ? OR document LIKE ? OR structure LIKE ? OR plateforme LIKE ? OR conclusion LIKE ?)"
            params.extend([like] * 5)
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def get_ref_etude(self, ref_etude_id: int) -> dict | None:
        with self._connect() as conn:
            etude = conn.execute(
                "SELECT * FROM ref_alize_etudes WHERE id = ?",
                (ref_etude_id,),
            ).fetchone()
            if not etude:
                return None
            source_key = None
            try:
                source_key = int(etude["source_id"]) if etude["source_id"] not in (None, "") else None
            except (TypeError, ValueError):
                source_key = None
            id_keys = [int(etude["id"])]
            if source_key is not None and source_key not in id_keys:
                id_keys.append(source_key)
            placeholders = ",".join("?" * len(id_keys))
            couches = conn.execute(
                f"SELECT * FROM ref_alize_couches WHERE id_etude IN ({placeholders}) ORDER BY ordre, id",
                id_keys,
            ).fetchall()
            criteres = conn.execute(
                f"SELECT * FROM ref_alize_criteres WHERE id_etude IN ({placeholders}) ORDER BY id",
                id_keys,
            ).fetchall()
        payload = self._map_ref_to_alize_payload(dict(etude), [dict(c) for c in couches], [dict(c) for c in criteres])
        return {
            "etude": dict(etude),
            "couches": [dict(c) for c in couches],
            "criteres": [dict(c) for c in criteres],
            "alize_payload": payload,
        }

    def _map_ref_to_alize_payload(self, etude: dict, couches: list[dict], criteres: list[dict]) -> dict:
        """Transforme une étude Excel en payload Alizé éditable (imitation)."""
        label = etude.get("projet") or etude.get("document") or f"Réf. #{etude.get('id')}"
        source_note = (
            f"Imitation Alizé à partir de la référence Excel « {label} » "
            f"({etude.get('source_ref') or etude.get('document') or 'sans source'}). "
            "Valeurs historiques — non recalculées dans RaLab."
        )
        traffic = {
            "mja_pl": etude.get("MJA_PL"),
            "croissance_pct": etude.get("croissance_pct"),
            "duree_ans": etude.get("duree_ans"),
            "cam": etude.get("CAM"),
            "ne_calcule": etude.get("NE"),
            "ne_retenu": etude.get("NE"),
            "risque": etude.get("risque_pct"),
            "classe_trafic": etude.get("trafic_PL") or "",
            "commentaire": source_note,
            "origin": "imitation_ref_excel",
        }
        platform = {
            "classe": etude.get("plateforme") or "",
            "module_pf": etude.get("module_pf_MPa"),
            "source": etude.get("document") or "",
            "commentaire": source_note,
            "origin": "imitation_ref_excel",
        }
        params = {
            "cam": etude.get("CAM"),
            "risque": etude.get("risque_pct"),
            "logiciel": "Imitation référence Excel (pré-Alizé)",
            "norme": "Référence historique compilée",
            "materiau_critique": etude.get("materiau_critique") or "",
            "module_critique": etude.get("module_crit_MPa"),
            "origin": "imitation_ref_excel",
        }
        results = {
            "epsT_adm": etude.get("epsT_adm"),
            "epsT_calc": etude.get("epsT_calc"),
            "epsZ_adm": etude.get("epsZ_adm"),
            "epsZ_calc": etude.get("epsZ_calc"),
            "sigmaT": etude.get("sigmaT_MPa"),
            "sigmaZ": etude.get("sigmaZ_MPa"),
            "marge_fatigue": etude.get("marge_fatigue"),
            "conso_fatigue": etude.get("conso_fatigue"),
            "marge_pf": etude.get("marge_pf"),
            "conso_pf": etude.get("conso_pf"),
            "conclusion": etude.get("conclusion") or "",
            "observations": source_note,
            "origin": "imitation_ref_excel",
        }

        layers = []
        for i, row in enumerate(couches, start=1):
            materiau = (row.get("materiau") or "").strip()
            is_pf = materiau.upper().startswith("PF") or "plateforme" in materiau.lower()
            layers.append(
                {
                    "ordre": int(row.get("ordre") or i),
                    "fonction": "Plateforme" if is_pf else "",
                    "materiau": materiau,
                    "famille": "",
                    "classe": materiau if is_pf else "",
                    "formulation": "",
                    "epaisseur": row.get("epaisseur_cm"),
                    "unite": "cm",
                    "module": row.get("module_MPa"),
                    "poisson": None,
                    "temperature_calcul": 15,
                    "frequence": 10,
                    "bibliotheque": "NF P98-086 2019",
                    "assise": (not is_pf) and i > 1,
                    "interface_sup": "",
                    "interface_inf": "collé",
                    "lie": False,
                    "from_library": True,
                    "modified_manually": False,
                    "justification": "Couche issue de la référence Excel (imitation)",
                    "commentaire": row.get("source_ref") or "",
                }
            )

        criteria = []
        for row in criteres:
            conso_pct = row.get("consommation_pct")
            conso = (conso_pct / 100.0) if conso_pct is not None else None
            criteria.append(
                {
                    "critere": row.get("critere") or "",
                    "materiau": row.get("materiau") or "",
                    "couche": row.get("materiau") or "",
                    "profondeur": "",
                    "valeur_admissible": row.get("admissible_microdef"),
                    "valeur_calculee": row.get("calcule_microdef"),
                    "unite": "µdéf" if row.get("admissible_microdef") is not None else ("MPa" if row.get("sigma_MPa") is not None else ""),
                    "marge": row.get("marge_microdef"),
                    "consommation": conso,
                    "sens_verification": "inferieur_ou_egal",
                    "statut": row.get("statut") or "Non renseigné",
                    "commentaire": "Critère historique Excel (imitation Alizé)",
                }
            )
        # Si pas de critères détaillés, dériver εt / εz depuis l'étude
        if not criteria:
            if etude.get("epsT_adm") is not None or etude.get("epsT_calc") is not None:
                criteria.append(
                    {
                        "critere": "fatigue_epsilonT",
                        "materiau": etude.get("materiau_critique") or "",
                        "couche": "",
                        "profondeur": "",
                        "valeur_admissible": etude.get("epsT_adm"),
                        "valeur_calculee": etude.get("epsT_calc"),
                        "unite": "µdéf",
                        "marge": etude.get("marge_fatigue"),
                        "consommation": etude.get("conso_fatigue"),
                        "sens_verification": "inferieur_ou_egal",
                        "statut": "Non renseigné",
                        "commentaire": "Dérivé de l'étude Excel",
                    }
                )
            if etude.get("epsZ_adm") is not None or etude.get("epsZ_calc") is not None:
                criteria.append(
                    {
                        "critere": "plateforme_epsilonZ",
                        "materiau": etude.get("plateforme") or "",
                        "couche": "",
                        "profondeur": "",
                        "valeur_admissible": etude.get("epsZ_adm"),
                        "valeur_calculee": etude.get("epsZ_calc"),
                        "unite": "µdéf",
                        "marge": etude.get("marge_pf"),
                        "consommation": etude.get("conso_pf"),
                        "sens_verification": "inferieur_ou_egal",
                        "statut": "Non renseigné",
                        "commentaire": "Dérivé de l'étude Excel",
                    }
                )

        return {
            "traffic": traffic,
            "platform": platform,
            "params": params,
            "results": results,
            "gel": {},
            "layers": layers,
            "criteria": criteria,
            "meta": {
                "nom_calcul": f"Imitation · {label}"[:180],
                "ouvrage": label,
                "zone_label": etude.get("structure") or "",
                "statut": "Résultats importés",
                "general": {
                    "origin": "imitation_ref_excel",
                    "ref_etude_id": etude.get("id"),
                    "ref_source_id": etude.get("source_id"),
                    "ref_document": etude.get("document") or "",
                    "ref_source_ref": etude.get("source_ref") or "",
                    "ref_structure": etude.get("structure") or "",
                    "note": source_note,
                },
            },
        }

    def create_from_reference(
        self,
        ref_etude_id: int,
        *,
        nom_calcul: str = "",
        affaire_rst_id: int | None = None,
        demande_id: int | None = None,
        user_name: str = "",
    ) -> CalculationDetailSchema | None:
        packed = self.get_ref_etude(ref_etude_id)
        if not packed:
            return None
        payload = packed["alize_payload"]
        meta = payload["meta"]
        created = self.create(
            CalculationCreateSchema(
                type_calcul="alize",
                nom_calcul=nom_calcul or meta["nom_calcul"],
                affaire_rst_id=affaire_rst_id,
                demande_id=demande_id,
                ouvrage=meta.get("ouvrage") or "",
                zone_label=meta.get("zone_label") or "",
                auteur=user_name,
                general=meta.get("general") or {},
            ),
            user_name=user_name,
        )
        self.update(
            created.id,
            CalculationUpdateSchema(statut=meta.get("statut") or "Résultats importés"),
            user_name=user_name,
        )
        return self.update_alize(
            created.id,
            AlizePayloadUpdateSchema(
                traffic=payload["traffic"],
                platform=payload["platform"],
                params=payload["params"],
                results=payload["results"],
                gel=payload.get("gel") or {},
                layers=[AlizeLayerSchema(**x) for x in payload["layers"]],
                criteria=[AlizeCriterionSchema(**x) for x in payload["criteria"]],
            ),
            user_name=user_name,
        )

    def apply_reference(
        self,
        calculation_id: int,
        ref_etude_id: int,
        *,
        user_name: str = "",
        replace_existing: bool = True,
    ) -> CalculationDetailSchema | None:
        detail = self.get(calculation_id)
        if not detail or detail.type_calcul != "alize":
            return None
        packed = self.get_ref_etude(ref_etude_id)
        if not packed:
            return None
        payload = packed["alize_payload"]
        meta = payload["meta"]
        if not replace_existing and detail.alize:
            # merge soft: ne remplace que les blocs vides
            alize = detail.alize
            if alize.get("traffic"):
                payload["traffic"] = alize["traffic"]
            if alize.get("platform"):
                payload["platform"] = alize["platform"]
            if alize.get("layers"):
                payload["layers"] = alize["layers"]
            if alize.get("criteria"):
                payload["criteria"] = alize["criteria"]
            if alize.get("results"):
                payload["results"] = alize["results"]
        general = dict(detail.general or {})
        general.update(meta.get("general") or {})
        self.update(
            calculation_id,
            CalculationUpdateSchema(
                nom_calcul=detail.nom_calcul or meta.get("nom_calcul"),
                ouvrage=detail.ouvrage or meta.get("ouvrage") or "",
                zone_label=detail.zone_label or meta.get("zone_label") or "",
                statut=meta.get("statut") or detail.statut,
                general=general,
            ),
            user_name=user_name,
        )
        return self.update_alize(
            calculation_id,
            AlizePayloadUpdateSchema(
                traffic=payload["traffic"],
                platform=payload["platform"],
                params=payload["params"],
                results=payload["results"],
                gel=payload.get("gel") or {},
                layers=[AlizeLayerSchema(**x) for x in payload["layers"]],
                criteria=[AlizeCriterionSchema(**x) for x in payload["criteria"]],
            ),
            user_name=user_name,
        )

    def build_fiche_html(self, calculation_id: int) -> str | None:
        detail = self.get(calculation_id)
        if not detail:
            return None
        from app.services.alize_fiche_export import build_annexe_html

        return build_annexe_html(detail)

    def build_fiche_pdf(self, calculation_id: int) -> bytes | None:
        detail = self.get(calculation_id)
        if not detail:
            return None
        from app.services.alize_fiche_export import build_annexe_pdf_bytes

        return build_annexe_pdf_bytes(detail)

    def _load_alize(self, conn, calculation_id: int) -> dict:
        proj = conn.execute(
            "SELECT * FROM alize_projects WHERE calculation_id = ?",
            (calculation_id,),
        ).fetchone()
        layers = conn.execute(
            "SELECT * FROM alize_layers WHERE calculation_id = ? ORDER BY ordre, id",
            (calculation_id,),
        ).fetchall()
        criteria = conn.execute(
            "SELECT * FROM alize_criteria WHERE calculation_id = ? ORDER BY id",
            (calculation_id,),
        ).fetchall()
        return {
            "traffic": _json_loads(proj["traffic_json"] if proj else "{}"),
            "platform": _json_loads(proj["platform_json"] if proj else "{}"),
            "params": _json_loads(proj["params_json"] if proj else "{}"),
            "results": _json_loads(proj["results_json"] if proj else "{}"),
            "gel": _json_loads(proj["gel_json"] if proj else "{}"),
            "layers": [
                {
                    "id": int(r["id"]),
                    "ordre": int(r["ordre"] or 0),
                    "fonction": r["fonction"] or "",
                    "materiau": r["materiau"] or "",
                    "famille": r["famille"] or "",
                    "classe": r["classe"] or "",
                    "formulation": r["formulation"] or "",
                    "epaisseur": r["epaisseur"],
                    "unite": r["unite"] or "cm",
                    "module": r["module"],
                    "poisson": r["poisson"],
                    "temperature_calcul": r["temperature_calcul"],
                    "frequence": r["frequence"] if "frequence" in r.keys() else 10,
                    "bibliotheque": (r["bibliotheque"] if "bibliotheque" in r.keys() else "") or "NF P98-086 2019",
                    "assise": bool(r["assise"]) if "assise" in r.keys() else False,
                    "interface_sup": r["interface_sup"] or "",
                    "interface_inf": r["interface_inf"] or "",
                    "lie": bool(r["lie"]),
                    "from_library": bool(r["from_library"]),
                    "modified_manually": bool(r["modified_manually"]),
                    "justification": r["justification"] or "",
                    "commentaire": r["commentaire"] or "",
                }
                for r in layers
            ],
            "criteria": [
                {
                    "id": int(r["id"]),
                    "critere": r["critere"] or "",
                    "materiau": r["materiau"] or "",
                    "couche": r["couche"] or "",
                    "profondeur": r["profondeur"] or "",
                    "valeur_admissible": r["valeur_admissible"],
                    "valeur_calculee": r["valeur_calculee"],
                    "unite": r["unite"] or "",
                    "marge": r["marge"],
                    "consommation": r["consommation"],
                    "sens_verification": r["sens_verification"] or "inferieur_ou_egal",
                    "statut": r["statut"] or "",
                    "commentaire": r["commentaire"] or "",
                }
                for r in criteria
            ],
        }

    def _detail_from_row(self, row, *, alize=None) -> CalculationDetailSchema:
        return CalculationDetailSchema(
            id=int(row["id"]),
            reference=row["reference"] or "",
            type_calcul=row["type_calcul"] or "",
            nom_calcul=row["nom_calcul"] or "",
            indice=row["indice"] or "A",
            version=int(row["version"] or 1),
            statut=row["statut"] or "",
            affaire_rst_id=row["affaire_rst_id"],
            demande_id=row["demande_id"],
            mission_id=row["mission_id"],
            campaign_id=row["campaign_id"],
            intervention_id=row["intervention_id"],
            ouvrage=row["ouvrage"] or "",
            zone_label=row["zone_label"] or "",
            auteur=row["auteur"] or "",
            calculateur=row["calculateur"] or "",
            verificateur=row["verificateur"] or "",
            validateur=row["validateur"] or "",
            date_verification=row["date_verification"],
            date_validation=row["date_validation"],
            parent_calculation_id=row["parent_calculation_id"],
            general=_json_loads(row["general_json"]),
            affaire_ref=row["affaire_ref"] or "",
            demande_ref=row["demande_ref"] or "",
            chantier=row["chantier"] or "",
            client=row["client"] or "",
            commune=row["commune"] or "",
            adresse=row["adresse"] or "",
            moa=row["moa"] or "",
            moe=row["moe"] or "",
            responsable=row["responsable"] or "",
            laboratoire=row["laboratoire"] or "",
            affaire_statut=row["affaire_statut"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
            alize=alize,
        )

    def _readiness_alize(self, detail: CalculationDetailSchema) -> dict:
        alize = detail.alize or {}
        traffic = alize.get("traffic") or {}
        platform = alize.get("platform") or {}
        layers = alize.get("layers") or []
        missing = []
        if not (traffic.get("ne_retenu") or traffic.get("ne_calcule") or traffic.get("mja_pl")):
            missing.append("Trafic / NE")
        if not (platform.get("classe") or platform.get("module_pf")):
            missing.append("Plateforme")
        if not layers:
            missing.append("Structure (couches)")
        else:
            incomplete = False
            for layer in layers:
                materiau = (layer.get("materiau") or "").strip()
                if not materiau:
                    incomplete = True
                    break
                is_pf = materiau.upper().startswith("PF") or (layer.get("fonction") or "").lower() == "plateforme"
                if not is_pf and layer.get("epaisseur") in (None, ""):
                    incomplete = True
                    break
            if incomplete:
                missing.append("Épaisseurs / matériaux incomplets")
        if not (traffic.get("cam") or (alize.get("params") or {}).get("cam")):
            missing.append("CAM")
        if not (traffic.get("risque") or (alize.get("params") or {}).get("risque")):
            missing.append("Risque")
        return {
            "ready": len(missing) == 0,
            "missing": missing,
            "blocking": missing,
            "warnings": [],
        }

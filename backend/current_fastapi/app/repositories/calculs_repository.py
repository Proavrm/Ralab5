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
                affaire_ref=r["affaire_ref"] or "",
                demande_ref=r["demande_ref"] or "",
                chantier=r["chantier"] or "",
                client=r["client"] or "",
                ouvrage=r["ouvrage"] or "",
                zone_label=r["zone_label"] or "",
                auteur=r["auteur"] or "",
                updated_at=r["updated_at"] or "",
            )
            for r in rows
        ]

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
            conn.commit()
        return self.get(calc_id)

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
        if "general" in updates:
            updates["general_json"] = _json_dumps(updates.pop("general"))
        if not updates:
            return self.get(calculation_id)
        updates["updated_at"] = _now()
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            exists = conn.execute("SELECT id FROM calculations WHERE id = ?", (calculation_id,)).fetchone()
            if not exists:
                return None
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
                            epaisseur, unite, module, poisson, temperature_calcul,
                            interface_sup, interface_inf, lie, from_library, modified_manually,
                            justification, commentaire, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    "temperature_calcul": None,
                    "interface_sup": "",
                    "interface_inf": "",
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
        alize = detail.alize or {}
        layers = alize.get("layers") or []
        criteria = alize.get("criteria") or []
        traffic = alize.get("traffic") or {}
        platform = alize.get("platform") or {}
        results = alize.get("results") or {}

        def esc(v: Any) -> str:
            return (
                str(v if v is not None else "—")
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
            )

        layers_html = "".join(
            f"<tr><td>{esc(l.get('ordre'))}</td><td>{esc(l.get('fonction'))}</td>"
            f"<td>{esc(l.get('materiau'))}</td><td>{esc(l.get('epaisseur'))} {esc(l.get('unite'))}</td>"
            f"<td>{esc(l.get('module'))}</td></tr>"
            for l in layers
        ) or "<tr><td colspan='5'>—</td></tr>"
        crit_html = "".join(
            f"<tr><td>{esc(c.get('critere'))}</td><td>{esc(c.get('materiau'))}</td>"
            f"<td>{esc(c.get('valeur_admissible'))}</td><td>{esc(c.get('valeur_calculee'))}</td>"
            f"<td>{esc(round((c.get('consommation') or 0)*100, 1) if c.get('consommation') is not None else '—')}%</td>"
            f"<td>{esc(c.get('statut'))}</td></tr>"
            for c in criteria
        ) or "<tr><td colspan='6'>—</td></tr>"

        return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><title>Fiche {esc(detail.reference)}</title>
<style>
body{{font-family:Segoe UI,Arial,sans-serif;color:#172033;margin:24px}}
h1{{color:#003170}} table{{border-collapse:collapse;width:100%;margin:12px 0}}
th,td{{border:1px solid #dbe1ea;padding:6px 8px;font-size:12px}} th{{background:#f1f5f9;text-align:left}}
.meta{{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}}
.box{{border:1px solid #dbe1ea;border-radius:8px;padding:10px}}
.banner{{background:#003170;color:#fff;padding:12px 16px;border-radius:8px}}
</style></head><body>
<div class="banner"><strong>RaLab5</strong> — Fiche de calcul Alizé</div>
<h1>{esc(detail.nom_calcul)}</h1>
<p>{esc(detail.reference)} · Indice {esc(detail.indice)} · v{esc(detail.version)} · {esc(detail.statut)}</p>
<div class="meta">
  <div class="box"><b>Affaire</b><br/>{esc(detail.affaire_ref)}<br/>{esc(detail.chantier)}<br/>{esc(detail.client)}</div>
  <div class="box"><b>Demande</b><br/>{esc(detail.demande_ref)}<br/>Ouvrage: {esc(detail.ouvrage)}<br/>Zone: {esc(detail.zone_label)}</div>
</div>
<h2>Trafic</h2>
<div class="box">TMJA: {esc(traffic.get('tmja'))} · MJA PL: {esc(traffic.get('mja_pl'))} · NE: {esc(traffic.get('ne_retenu') or traffic.get('ne_calcule'))} · CAM: {esc(traffic.get('cam'))} · Risque: {esc(traffic.get('risque'))}</div>
<h2>Plateforme</h2>
<div class="box">Classe: {esc(platform.get('classe'))} · Module: {esc(platform.get('module_pf'))} MPa · EV2: {esc(platform.get('ev2'))}</div>
<h2>Structure</h2>
<table><thead><tr><th>#</th><th>Fonction</th><th>Matériau</th><th>Épaisseur</th><th>Module</th></tr></thead>
<tbody>{layers_html}</tbody></table>
<h2>Critères</h2>
<table><thead><tr><th>Critère</th><th>Matériau</th><th>Admissible</th><th>Calculé</th><th>Conso.</th><th>Statut</th></tr></thead>
<tbody>{crit_html}</tbody></table>
<h2>Conclusion</h2>
<div class="box">{esc(results.get('conclusion') or results.get('statut_global') or '—')}</div>
<p style="margin-top:24px;font-size:11px;color:#69758a">Généré par RaLab5 — {esc(_now())} — Auteur: {esc(detail.auteur)}</p>
</body></html>"""

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

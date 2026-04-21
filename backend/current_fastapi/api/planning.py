"""
api/planning.py
Endpoints:
    GET   /api/planning/demandes        → ancien feed demandes-only
    PATCH /api/planning/demandes/{uid}  → ancien patch demandes-only
    GET   /api/planning/items           → feed multi-objets unifie
    PATCH /api/planning/items/{kind}/{uid} → mise a jour planning multi-objets
"""
from __future__ import annotations

import sqlite3
import unicodedata
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.database import ensure_ralab4_schema, get_db_path
from app.repositories.demandes_rst_repository import DemandesRstRepository

router = APIRouter()
_repo = DemandesRstRepository()
DB_PATH = get_db_path()

LABO_NOM = {
    "SP":  "Saint-Priest",
    "PDC": "Pont-du-Ch.",
    "CHB": "Chambéry",
    "CLM": "Clermont",
}


def _urg(ech: Optional[date]) -> str:
    if not ech: return "done"
    diff = (ech - date.today()).days
    if diff < 0:  return "late"
    if diff <= 7: return "soon"
    return "ok"


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _norm(value: Optional[str]) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def _parse_iso(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(400, f"Format date invalide: {value}") from exc


def _iso_from_value(value: object) -> Optional[str]:
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    if not text:
        return None
    try:
        datetime.strptime(text, "%Y-%m-%d")
        return text
    except ValueError:
        return None


def _labo_label(code: Optional[str]) -> str:
    raw = str(code or "").strip()
    return LABO_NOM.get(raw, raw)


def _urg_from_dates(start: Optional[str], ech: Optional[str], state: str) -> str:
    if state in {"Termine", "Annule"}:
        return "done"
    target = _parse_iso(ech) or _parse_iso(start)
    if not target:
        return "ok"
    diff = (target - date.today()).days
    if diff < 0:
        return "late"
    if diff <= 7:
        return "soon"
    return "ok"


def _planning_state(kind: str, raw_status: Optional[str], start: Optional[str], ech: Optional[str]) -> str:
    normalized = _norm(raw_status)
    has_start = bool(start)
    has_ech = bool(ech)
    if kind == "passation":
        target = _parse_iso(ech) or _parse_iso(start)
        if target and target < date.today():
            return "Termine"
        return "Planifie" if target else "A planifier"
    if any(token in normalized for token in ("annul", "rejete", "perdu", "abandon")):
        return "Annule"
    if any(token in normalized for token in ("term", "realis", "fini", "repondu", "envoye")):
        return "Termine"
    if any(token in normalized for token in ("cours", "recu", "attente", "bloque", "execution")):
        return "En cours"
    if any(token in normalized for token in ("qualifier", "cadrer", "lancer")) and not has_start and not has_ech:
        return "A planifier"
    if has_start or has_ech or any(token in normalized for token in ("demande", "planif", "programm", "prevu", "prepare")):
        return "Planifie"
    return "A planifier"


def _display_state(state: str) -> str:
    mapping = {
        "A planifier": "A planifier",
        "Planifie": "Planifie",
        "En cours": "En cours",
        "Termine": "Termine",
        "Annule": "Annule",
    }
    return mapping.get(state, state)


def _raw_status_for_state(kind: str, state: Optional[str], current: Optional[str]) -> Optional[str]:
    if state is None:
        return None
    normalized = _norm(state)
    aliases = {
        "a planifier": "A planifier",
        "planifie": "Planifie",
        "en cours": "En cours",
        "termine": "Termine",
        "annule": "Annule",
    }
    canonical = aliases.get(normalized)
    if not canonical:
        return current
    mapping = {
        "demande": {
            "A planifier": "A qualifier",
            "Planifie": "Demande",
            "En cours": "En Cours",
            "Termine": "Fini",
            "Annule": "Envoye - Perdu",
        },
        "campagne": {
            "A planifier": "A cadrer",
            "Planifie": "Planifiee",
            "En cours": "En cours",
            "Termine": "Terminee",
            "Annule": "Annulee",
        },
        "intervention": {
            "A planifier": "Planifiee",
            "Planifie": "Planifiee",
            "En cours": "En cours",
            "Termine": "Realisee",
            "Annule": "Annulee",
        },
        "prelevement": {
            "A planifier": "En attente",
            "Planifie": "En attente",
            "En cours": "En cours",
            "Termine": "Termine",
            "Annule": "Rejete",
        },
        "echantillon": {
            "A planifier": "En attente",
            "Planifie": "Recu",
            "En cours": "En cours",
            "Termine": "Termine",
            "Annule": "Rejete",
        },
        "essai": {
            "A planifier": "Programme",
            "Planifie": "Programme",
            "En cours": "En cours",
            "Termine": "Termine",
            "Annule": "Annule",
        },
    }
    kind_map = mapping.get(kind)
    return kind_map.get(canonical) if kind_map else current


def _build_item(
    *,
    uid: int,
    kind: str,
    ref: str,
    tit: str,
    raw_stat: Optional[str],
    start: Optional[str],
    ech: Optional[str],
    labo_code: Optional[str],
    route: str,
    views: list[str],
    kind_label: str,
    editable_start: bool = True,
    editable_ech: bool = True,
    editable_stat: bool = True,
    dst: bool = False,
    subtitle: str = "",
    open_label: str = "Ouvrir",
    source_demande_id: Optional[int] = None,
) -> dict:
    state = _display_state(_planning_state(kind, raw_stat, start, ech))
    return {
        "uid": uid,
        "kind": kind,
        "kind_label": kind_label,
        "ref": ref,
        "tit": tit,
        "subtitle": subtitle,
        "raw_stat": raw_stat or "",
        "stat": state,
        "start": start,
        "ech": ech,
        "dst": dst,
        "urg": _urg_from_dates(start, ech, state),
        "labo": _labo_label(labo_code),
        "labo_code": str(labo_code or ""),
        "route": route,
        "open_label": open_label,
        "views": views,
        "editable_start": editable_start,
        "editable_ech": editable_ech,
        "editable_stat": editable_stat,
        "source_demande_id": source_demande_id,
    }


# Schémas — mêmes champs que l'ancien (ref, tit, stat, start, ech, dst, urg, labo)
# → planning.html n'a pas besoin d'être modifié
class PlanningDemandeOut(BaseModel):
    uid:   int
    ref:   str           # référence demande : 2026-SP-D0003
    tit:   str           # chantier ou client (depuis affaire liée)
    stat:  str
    start: Optional[str]   # date_reception  YYYY-MM-DD
    ech:   Optional[str]   # date_echeance   YYYY-MM-DD
    dst:   bool
    urg:   str
    labo:  Optional[str]   # nom lisible du labo


class PlanningPatchIn(BaseModel):
    start: Optional[str] = None   # YYYY-MM-DD → date_reception
    ech:   Optional[str] = None   # YYYY-MM-DD → date_echeance
    stat:  Optional[str] = None   # statut demande


class PlanningItemOut(BaseModel):
    uid: int
    kind: str
    kind_label: str
    ref: str
    tit: str
    subtitle: str = ""
    raw_stat: str = ""
    stat: str
    start: Optional[str] = None
    ech: Optional[str] = None
    dst: bool = False
    urg: str
    labo: str = ""
    labo_code: str = ""
    route: str
    open_label: str = "Ouvrir"
    views: list[str] = Field(default_factory=list)
    editable_start: bool = True
    editable_ech: bool = True
    editable_stat: bool = True
    source_demande_id: Optional[int] = None


def _to_out(r) -> PlanningDemandeOut:
    return PlanningDemandeOut(
        uid=r.uid,
        ref=r.reference,                        # ex: 2026-SP-D0003
        tit=r.chantier or r.client or "",       # depuis la JOIN avec affaire
        stat=r.statut or "À qualifier",
        start=r.date_reception.isoformat() if r.date_reception else None,
        ech=r.date_echeance.isoformat()    if r.date_echeance   else None,
        dst=bool((r.numero_dst or "").strip()),
        urg=_urg(r.date_echeance),
        labo=LABO_NOM.get(r.labo_code) if r.labo_code else None,
    )


def _load_demande_items() -> list[dict]:
    items: list[dict] = []
    for row in _repo.all():
        start = row.date_reception.isoformat() if row.date_reception else None
        ech = row.date_echeance.isoformat() if row.date_echeance else None
        items.append(
            _build_item(
                uid=row.uid,
                kind="demande",
                kind_label="Demande",
                ref=row.reference,
                tit=row.chantier or row.client or row.reference,
                subtitle=row.client or "",
                raw_stat=row.statut or "A qualifier",
                start=start,
                ech=ech,
                labo_code=row.labo_code,
                route=f"/demandes/{row.uid}",
                views=["organiser", "demandes", "analyser"],
                dst=bool((row.numero_dst or "").strip()),
                source_demande_id=row.uid,
            )
        )
    return items


def _load_campaign_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            c.id,
            c.reference,
            c.label,
            c.designation,
            c.statut,
            c.date_debut_prevue,
            c.date_fin_prevue,
            c.priorite,
            c.attribue_a,
            c.responsable_technique,
            d.id AS demande_id,
            d.labo_code,
            d.reference AS demande_reference,
            a.chantier,
            a.client
        FROM campagnes c
        JOIN demandes d ON d.id = c.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        ORDER BY COALESCE(NULLIF(c.date_debut_prevue, ''), NULLIF(c.date_fin_prevue, ''), c.id)
        """
    ).fetchall()
    items: list[dict] = []
    for row in rows:
        title = row["designation"] or row["label"] or row["chantier"] or row["reference"]
        subtitle = " | ".join(part for part in [row["demande_reference"] or "", row["attribue_a"] or row["responsable_technique"] or ""] if part)
        items.append(
            _build_item(
                uid=int(row["id"]),
                kind="campagne",
                kind_label="Campagne",
                ref=row["reference"] or f"Campagne #{row['id']}",
                tit=title,
                subtitle=subtitle,
                raw_stat=row["statut"] or "A cadrer",
                start=_iso_from_value(row["date_debut_prevue"]),
                ech=_iso_from_value(row["date_fin_prevue"]),
                labo_code=row["labo_code"],
                route=f"/demandes/{int(row['demande_id'])}",
                open_label="Ouvrir la demande",
                views=["organiser", "terrain", "analyser"],
                source_demande_id=int(row["demande_id"]),
            )
        )
    return items


def _load_intervention_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            i.id,
            i.reference,
            i.sujet,
            i.type_intervention,
            i.date_intervention,
            i.statut,
            i.technicien,
            i.geotechnicien,
            i.demande_id,
            d.reference AS demande_reference,
            d.labo_code,
            a.chantier,
            a.client
        FROM interventions i
        JOIN demandes d ON d.id = i.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        ORDER BY COALESCE(NULLIF(i.date_intervention, ''), i.created_at) DESC, i.id DESC
        """
    ).fetchall()
    items: list[dict] = []
    for row in rows:
        title = row["sujet"] or row["type_intervention"] or row["chantier"] or row["reference"]
        subtitle = " | ".join(part for part in [row["demande_reference"] or "", row["technicien"] or row["geotechnicien"] or ""] if part)
        date_iso = _iso_from_value(row["date_intervention"])
        items.append(
            _build_item(
                uid=int(row["id"]),
                kind="intervention",
                kind_label="Intervention",
                ref=row["reference"] or f"Intervention #{row['id']}",
                tit=title,
                subtitle=subtitle,
                raw_stat=row["statut"] or "Planifiee",
                start=date_iso,
                ech=date_iso,
                labo_code=row["labo_code"],
                route=f"/interventions/{int(row['id'])}",
                views=["organiser", "terrain", "labo", "analyser"],
                editable_ech=False,
                source_demande_id=int(row["demande_id"]),
            )
        )
    return items


def _load_passation_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            p.id,
            p.reference,
            p.date_passation,
            p.operation_type,
            p.chantier,
            p.client,
            p.responsable,
            p.affaire_rst_id
        FROM passations p
        ORDER BY COALESCE(NULLIF(p.date_passation, ''), p.created_at) DESC, p.id DESC
        """
    ).fetchall()
    items: list[dict] = []
    for row in rows:
        title = row["chantier"] or row["client"] or row["operation_type"] or row["reference"]
        subtitle = " | ".join(part for part in [row["client"] or "", row["responsable"] or ""] if part)
        date_iso = _iso_from_value(row["date_passation"])
        items.append(
            _build_item(
                uid=int(row["id"]),
                kind="passation",
                kind_label="Passation",
                ref=row["reference"] or f"Passation #{row['id']}",
                tit=title,
                subtitle=subtitle,
                raw_stat="",
                start=date_iso,
                ech=date_iso,
                labo_code="",
                route=f"/passations/{int(row['id'])}",
                views=["organiser", "terrain", "analyser"],
                editable_ech=False,
                editable_stat=False,
            )
        )
    return items


def _load_prelevement_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            p.id,
            p.reference,
            p.date_prelevement,
            p.date_reception_labo,
            p.description,
            p.zone,
            p.materiau,
            p.technicien,
            p.finalite,
            p.statut,
            p.demande_id,
            d.reference AS demande_reference,
            d.labo_code,
            a.chantier,
            a.client
        FROM prelevements p
        LEFT JOIN demandes d ON d.id = p.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        ORDER BY COALESCE(NULLIF(p.date_reception_labo, ''), NULLIF(p.date_prelevement, ''), p.created_at) DESC, p.id DESC
        """
    ).fetchall()
    items: list[dict] = []
    for row in rows:
        title = row["description"] or row["materiau"] or row["zone"] or row["reference"]
        subtitle = " | ".join(part for part in [row["demande_reference"] or "", row["technicien"] or row["finalite"] or ""] if part)
        items.append(
            _build_item(
                uid=int(row["id"]),
                kind="prelevement",
                kind_label="Prelevement",
                ref=row["reference"] or f"Prelevement #{row['id']}",
                tit=title,
                subtitle=subtitle,
                raw_stat=row["statut"] or "En attente",
                start=_iso_from_value(row["date_prelevement"]),
                ech=_iso_from_value(row["date_reception_labo"]),
                labo_code=row["labo_code"],
                route=f"/prelevements/{int(row['id'])}",
                open_label="Ouvrir le prelevement",
                views=["organiser", "terrain", "labo", "analyser"],
                source_demande_id=int(row["demande_id"]) if row["demande_id"] is not None else None,
            )
        )
    return items


def _load_echantillon_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            ech.id,
            ech.reference,
            ech.designation,
            ech.localisation,
            ech.date_prelevement,
            ech.date_reception_labo,
            ech.statut,
            ech.demande_id,
            d.reference AS demande_reference,
            COALESCE(ech.labo_code, d.labo_code) AS labo_code,
            a.chantier,
            a.client
        FROM echantillons ech
        LEFT JOIN demandes d ON d.id = ech.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        ORDER BY COALESCE(NULLIF(ech.date_reception_labo, ''), NULLIF(ech.date_prelevement, ''), ech.created_at) DESC, ech.id DESC
        """
    ).fetchall()
    items: list[dict] = []
    for row in rows:
        title = row["designation"] or row["localisation"] or row["reference"]
        subtitle = " | ".join(part for part in [row["demande_reference"] or "", row["chantier"] or row["client"] or ""] if part)
        items.append(
            _build_item(
                uid=int(row["id"]),
                kind="echantillon",
                kind_label="Echantillon",
                ref=row["reference"] or f"Echantillon #{row['id']}",
                tit=title,
                subtitle=subtitle,
                raw_stat=row["statut"] or "Recu",
                start=_iso_from_value(row["date_prelevement"]),
                ech=_iso_from_value(row["date_reception_labo"]),
                labo_code=row["labo_code"],
                route=f"/echantillons/{int(row['id'])}",
                views=["organiser", "labo", "analyser"],
                source_demande_id=int(row["demande_id"]) if row["demande_id"] is not None else None,
            )
        )
    return items


def _load_essai_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            e.id,
            e.essai_code,
            e.type_essai,
            e.statut,
            e.date_debut,
            e.date_fin,
            e.operateur,
            ech.reference AS echantillon_reference,
            d.id AS demande_id,
            d.reference AS demande_reference,
            COALESCE(ech.labo_code, d.labo_code) AS labo_code,
            a.chantier,
            a.client
        FROM essais e
        LEFT JOIN echantillons ech ON ech.id = e.echantillon_id
        LEFT JOIN interventions i ON i.id = e.intervention_id
        LEFT JOIN demandes d ON d.id = COALESCE(ech.demande_id, i.demande_id)
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        ORDER BY COALESCE(NULLIF(e.date_fin, ''), NULLIF(e.date_debut, ''), e.created_at) DESC, e.id DESC
        """
    ).fetchall()
    items: list[dict] = []
    for row in rows:
        ref = row["essai_code"] or row["type_essai"] or f"Essai #{row['id']}"
        title = row["type_essai"] or row["echantillon_reference"] or ref
        subtitle = " | ".join(part for part in [row["demande_reference"] or "", row["operateur"] or ""] if part)
        items.append(
            _build_item(
                uid=int(row["id"]),
                kind="essai",
                kind_label="Essai",
                ref=ref,
                tit=title,
                subtitle=subtitle,
                raw_stat=row["statut"] or "Programme",
                start=_iso_from_value(row["date_debut"]),
                ech=_iso_from_value(row["date_fin"]),
                labo_code=row["labo_code"],
                route=f"/essais/{int(row['id'])}",
                views=["organiser", "labo", "analyser"],
                source_demande_id=int(row["demande_id"]) if row["demande_id"] is not None else None,
            )
        )
    return items


def _load_all_items() -> list[dict]:
    with _conn() as conn:
        items = []
        items.extend(_load_demande_items())
        items.extend(_load_campaign_items(conn))
        items.extend(_load_intervention_items(conn))
        items.extend(_load_passation_items(conn))
        items.extend(_load_prelevement_items(conn))
        items.extend(_load_echantillon_items(conn))
        items.extend(_load_essai_items(conn))
    items.sort(key=lambda item: (item.get("ech") or item.get("start") or "9999-12-31", item["ref"]))
    return items


def _get_item(kind: str, uid: int) -> dict:
    for item in _load_all_items():
        if item["kind"] == kind and int(item["uid"]) == uid:
            return item
    raise HTTPException(404, f"Element planning introuvable: {kind} #{uid}")


def _patch_sql_table(table: str, uid: int, fields: dict[str, object]) -> None:
    if not fields:
        return
    clause = ", ".join(f"{key} = ?" for key in fields)
    values = list(fields.values()) + [uid]
    with _conn() as conn:
        cur = conn.execute(f"UPDATE {table} SET {clause} WHERE id = ?", values)
        if not cur.rowcount:
            raise HTTPException(404, f"Element introuvable dans {table}: #{uid}")


def _patch_demande_item(uid: int, body: PlanningPatchIn) -> dict:
    current = _repo.get_by_uid(uid)
    if not current:
        raise HTTPException(404, f"Demande #{uid} introuvable")
    fields: dict[str, object] = {}
    if body.stat is not None:
        fields["statut"] = _raw_status_for_state("demande", body.stat, current.statut or "A qualifier")
    if body.start is not None:
        fields["date_reception"] = _parse_iso(body.start)
    if body.ech is not None:
        fields["date_echeance"] = _parse_iso(body.ech)
    if fields:
        _repo.update(uid, fields)
    return _get_item("demande", uid)


def _patch_campaign_item(uid: int, body: PlanningPatchIn) -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT statut FROM campagnes WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Campagne #{uid} introuvable")
        fields: dict[str, object] = {"updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if body.stat is not None:
            fields["statut"] = _raw_status_for_state("campagne", body.stat, row["statut"] or "A cadrer")
        if body.start is not None:
            fields["date_debut_prevue"] = body.start or ""
            _parse_iso(body.start)
        if body.ech is not None:
            fields["date_fin_prevue"] = body.ech or ""
            _parse_iso(body.ech)
        clause = ", ".join(f"{key} = ?" for key in fields)
        cur = conn.execute(f"UPDATE campagnes SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, f"Campagne #{uid} introuvable")
    return _get_item("campagne", uid)


def _patch_intervention_item(uid: int, body: PlanningPatchIn) -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT statut FROM interventions WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        fields: dict[str, object] = {"updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if body.stat is not None:
            fields["statut"] = _raw_status_for_state("intervention", body.stat, row["statut"] or "Planifiee")
        if body.start is not None:
            _parse_iso(body.start)
            fields["date_intervention"] = body.start or ""
        elif body.ech is not None:
            _parse_iso(body.ech)
            fields["date_intervention"] = body.ech or ""
        clause = ", ".join(f"{key} = ?" for key in fields)
        cur = conn.execute(f"UPDATE interventions SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
    return _get_item("intervention", uid)


def _patch_passation_item(uid: int, body: PlanningPatchIn) -> dict:
    fields: dict[str, object] = {}
    if body.start is not None:
        _parse_iso(body.start)
        fields["date_passation"] = body.start or ""
    elif body.ech is not None:
        _parse_iso(body.ech)
        fields["date_passation"] = body.ech or ""
    if fields:
        fields["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _patch_sql_table("passations", uid, fields)
    return _get_item("passation", uid)


def _patch_prelevement_item(uid: int, body: PlanningPatchIn) -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT statut FROM prelevements WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Prelevement #{uid} introuvable")
        fields: dict[str, object] = {"updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if body.stat is not None:
            fields["statut"] = _raw_status_for_state("prelevement", body.stat, row["statut"] or "En attente")
        if body.start is not None:
            _parse_iso(body.start)
            fields["date_prelevement"] = body.start or ""
        if body.ech is not None:
            _parse_iso(body.ech)
            fields["date_reception_labo"] = body.ech or ""
        clause = ", ".join(f"{key} = ?" for key in fields)
        cur = conn.execute(f"UPDATE prelevements SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, f"Prelevement #{uid} introuvable")
    return _get_item("prelevement", uid)


def _patch_echantillon_item(uid: int, body: PlanningPatchIn) -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT statut FROM echantillons WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Echantillon #{uid} introuvable")
        fields: dict[str, object] = {"updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if body.stat is not None:
            fields["statut"] = _raw_status_for_state("echantillon", body.stat, row["statut"] or "Recu")
        if body.start is not None:
            _parse_iso(body.start)
            fields["date_prelevement"] = body.start or ""
        if body.ech is not None:
            _parse_iso(body.ech)
            fields["date_reception_labo"] = body.ech or ""
        clause = ", ".join(f"{key} = ?" for key in fields)
        cur = conn.execute(f"UPDATE echantillons SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, f"Echantillon #{uid} introuvable")
    return _get_item("echantillon", uid)


def _patch_essai_item(uid: int, body: PlanningPatchIn) -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT statut FROM essais WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        fields: dict[str, object] = {"updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if body.stat is not None:
            fields["statut"] = _raw_status_for_state("essai", body.stat, row["statut"] or "Programme")
        if body.start is not None:
            _parse_iso(body.start)
            fields["date_debut"] = body.start or ""
        if body.ech is not None:
            _parse_iso(body.ech)
            fields["date_fin"] = body.ech or ""
        clause = ", ".join(f"{key} = ?" for key in fields)
        cur = conn.execute(f"UPDATE essais SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, f"Essai #{uid} introuvable")
    return _get_item("essai", uid)


@router.get("/demandes", response_model=list[PlanningDemandeOut])
def get_planning_demandes():
    return [_to_out(r) for r in _repo.all()]


@router.get("/items", response_model=list[PlanningItemOut])
def get_planning_items():
    return [PlanningItemOut(**item) for item in _load_all_items()]


@router.patch("/demandes/{uid}", response_model=PlanningDemandeOut)
def patch_planning_demande(uid: int, body: PlanningPatchIn):
    if not _repo.get_by_uid(uid):
        raise HTTPException(404, f"Demande #{uid} introuvable")
    fields: dict = {}
    if body.stat is not None:
        fields["statut"] = body.stat
    if body.start is not None:
        try:    fields["date_reception"] = datetime.strptime(body.start, "%Y-%m-%d").date()
        except: raise HTTPException(400, f"Format date invalide: {body.start}")
    if body.ech is not None:
        try:    fields["date_echeance"]  = datetime.strptime(body.ech,   "%Y-%m-%d").date()
        except: raise HTTPException(400, f"Format date invalide: {body.ech}")
    if not fields:
        return _to_out(_repo.get_by_uid(uid))
    return _to_out(_repo.update(uid, fields))


@router.patch("/items/{kind}/{uid}", response_model=PlanningItemOut)
def patch_planning_item(kind: str, uid: int, body: PlanningPatchIn):
    normalized_kind = _norm(kind)
    handlers = {
        "demande": _patch_demande_item,
        "campagne": _patch_campaign_item,
        "intervention": _patch_intervention_item,
        "passation": _patch_passation_item,
        "prelevement": _patch_prelevement_item,
        "echantillon": _patch_echantillon_item,
        "essai": _patch_essai_item,
    }
    handler = handlers.get(normalized_kind)
    if not handler:
        raise HTTPException(400, f"Type planning non supporte: {kind}")
    return PlanningItemOut(**handler(uid, body))

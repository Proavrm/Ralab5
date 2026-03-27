"""
api/planning.py — RaLab4
Endpoints:
  GET   /api/planning/demandes        → demandes formatées pour le planning HTML
  PATCH /api/planning/demandes/{uid}  → mise à jour dates/statut depuis le planning
"""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.repositories.demandes_rst_repository import DemandesRstRepository

router = APIRouter()
_repo = DemandesRstRepository()

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


@router.get("/demandes", response_model=list[PlanningDemandeOut])
def get_planning_demandes():
    return [_to_out(r) for r in _repo.all()]


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

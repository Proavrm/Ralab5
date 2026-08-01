"""Schémas Pydantic — Avis technique (templates + instances)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# Capacités techniques d'édition/export (pas de contenu métier).
BLOCK_TYPES = (
    "rich_text",
    "bullet_list",
    "key_value_table",
    "free_table",
    "meta_document",
    "media_cards",
    "document_gallery",
    "calculs_table",
    "calcul_fiches",
    "materiau_status",
    "checklist",
)

AVIS_STATUTS = (
    "Brouillon",
    "En rédaction",
    "En relecture",
    "Validé",
    "Envoyé",
)


class AvisTemplateUpsertSchema(BaseModel):
    code: str = Field(..., min_length=1)
    label: str = ""
    version: Optional[int] = None
    definition: dict[str, Any] = Field(default_factory=dict)
    docx_style_path: str = ""
    is_active: bool = True


class AvisTemplatePatchSchema(BaseModel):
    label: Optional[str] = None
    definition: Optional[dict[str, Any]] = None
    docx_style_path: Optional[str] = None
    is_active: Optional[bool] = None
    bump_version: bool = False


class AvisInstanceCreateSchema(BaseModel):
    demande_id: int
    template_id: Optional[int] = None
    template_code: Optional[str] = None
    reference: str = ""
    titre: str = ""
    auteur: str = ""
    meta: dict[str, Any] = Field(default_factory=dict)
    contents: dict[str, Any] = Field(default_factory=dict)
    linked_document_ids: list[int] = Field(default_factory=list)
    linked_calcul_ids: list[int] = Field(default_factory=list)
    linked_materiau_ids: list[str] = Field(default_factory=list)
    apply_bindings: bool = True


class AvisInstanceUpdateSchema(BaseModel):
    reference: Optional[str] = None
    titre: Optional[str] = None
    statut: Optional[str] = None
    auteur: Optional[str] = None
    meta: Optional[dict[str, Any]] = None
    contents: Optional[dict[str, Any]] = None
    linked_document_ids: Optional[list[int]] = None
    linked_calcul_ids: Optional[list[int]] = None
    linked_materiau_ids: Optional[list[str]] = None

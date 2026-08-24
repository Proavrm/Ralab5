"""Import contenu Word avis → instance avis_technique (données DB, pas de hardcode métier dans le code).

Usage:
  PYTHONPATH=. python tools/import_avis_word_to_instance.py --instance-id 1 --docx PATH
"""
from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path


DEFAULT_DOCX = (
    Path(__file__).resolve().parents[3]
    / "storage"
    / "documents"
    / "2026-RA-049_Avis_technique_Optimisation_chaussee_RST_D0100_Complet_V2.docx"
)


def extract_paragraphs(docx_path: Path) -> list[str]:
    with zipfile.ZipFile(docx_path) as zf:
        xml = zf.read("word/document.xml").decode("utf-8")
    paras: list[str] = []
    for para in re.split(r"</w:p>", xml):
        texts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", para)
        if not texts:
            continue
        line = "".join(texts).strip()
        if line:
            paras.append(line)
    return paras


def _find_body_start(paras: list[str]) -> int:
    """Ignore couverture + sommaire ; corps = premier 'PRÉAMBULE' suivi de '1.1'."""
    for i, line in enumerate(paras):
        if line.strip().upper() != "PRÉAMBULE":
            continue
        # Prefer the occurrence that has 1.1 shortly after
        window = paras[i : i + 8]
        if any(_is_heading(x, "1.1") for x in window):
            return i
    return 0


def _slice_between(paras: list[str], start_pred, end_pred, *, from_idx: int = 0) -> list[str]:
    start = None
    for i in range(from_idx, len(paras)):
        if start_pred(paras[i]):
            start = i + 1
            break
    if start is None:
        return []
    end = len(paras)
    for j in range(start, len(paras)):
        if end_pred(paras[j]):
            end = j
            break
    return paras[start:end]


def _is_heading(line: str, *needles: str) -> bool:
    low = line.lower().strip()
    return any(n.lower() in low for n in needles)


def _join(lines: list[str]) -> str:
    # Drop pure page/section markers like "1" / "PRÉAMBULE" duplicates
    skip = {"1", "2", "3", "4", "5", "6", "7", "PRÉAMBULE", "DIMENSIONNEMENT", "ANNEXES"}
    kept = []
    for line in lines:
        if line.strip().upper() in skip:
            continue
        if re.fullmatch(r"\d+(\.\d+)*\.?", line.strip()):
            continue
        kept.append(line)
    return "\n\n".join(kept).strip()


def _bullets_from_block(lines: list[str], *, skip_titles: set[str] | None = None) -> list[str]:
    skip_titles = {s.lower() for s in (skip_titles or set())}
    items = []
    for line in lines:
        low = line.lower().strip()
        if low in skip_titles:
            continue
        if _is_heading(line, "1.", "2.", "3.", "4.", "5.", "préambule", "dimensionnement", "annexe"):
            if re.match(r"^\d+(\.\d+)*\.", line.strip()):
                continue
        if len(line) < 3:
            continue
        items.append(line)
    return items


def build_contents_from_paras(paras: list[str], existing: dict) -> dict:
    """Remplit les slots du template à partir du texte Word (instance data)."""
    contents = json.loads(json.dumps(existing or {}))  # deep copy

    def set_slot(section: str, slot: str, block_type: str, content: dict) -> None:
        section_map = contents.setdefault(section, {})
        section_map[slot] = {"block_type": block_type, "content": content}

    # ── Meta / couverture ──────────────────────────────────────────────────
    titre = next((p for p in paras if "Optimisation" in p and "chaussée" in p.lower()), "")
    lieu = paras[0] if paras else ""
    auteur = "COSTA PEREIRA Marco"
    for i, line in enumerate(paras):
        if line.strip().lower() == "auteur" and i + 1 < len(paras):
            auteur = paras[i + 1]
            break
    set_slot(
        "qualite_document",
        "meta",
        "meta_document",
        {
            "fields": {
                "title": titre or lieu,
                "subtitle": lieu,
                "type": "Avis technique",
                "author": auteur,
                "document_date": "30/07/2026",
                "status": "V2",
                "destinataire": "Valentin MONTEIL / GUINTOLI",
                "modifications": "INTÉGRATION DE L’ENSEMBLE DES VARIANTES ET FICHES DE CALCUL",
                "source_word": "note V2 importée en base",
            }
        },
    )

    body0 = _find_body_start(paras)

    # ── Préambule ──────────────────────────────────────────────────────────
    presentation = _slice_between(
        paras,
        lambda l: _is_heading(l, "1.1. Présentation", "1.1 Présentation"),
        lambda l: _is_heading(l, "1.2. Objectifs", "1.2 Objectifs"),
        from_idx=body0,
    )
    # Drop the lone title "Présentation"
    presentation = [l for l in presentation if l.lower() not in {"présentation", "cadre de la mission"}]
    # Keep Cadre as part of presentation: re-include from Cadre until 1.2
    cadre = _slice_between(
        paras,
        lambda l: l.strip().lower() == "cadre de la mission",
        lambda l: _is_heading(l, "1.2"),
        from_idx=body0,
    )
    presentation_text = _join(presentation + (["Cadre de la mission"] + cadre if cadre else []))
    set_slot("preambule", "presentation", "rich_text", {"text": presentation_text})

    objectifs = _slice_between(
        paras,
        lambda l: _is_heading(l, "1.2. Objectifs", "1.2 Objectifs"),
        lambda l: _is_heading(l, "1.3. Contraintes", "1.3 Contraintes"),
        from_idx=body0,
    )
    set_slot(
        "preambule",
        "objectifs",
        "bullet_list",
        {"items": _bullets_from_block(objectifs, skip_titles={"objectifs recherchés"})},
    )

    contraintes = _slice_between(
        paras,
        lambda l: _is_heading(l, "1.3. Contraintes", "1.3 Contraintes"),
        lambda l: _is_heading(l, "1.4. Documents", "1.4 Documents"),
        from_idx=body0,
    )
    set_slot(
        "preambule",
        "contraintes",
        "bullet_list",
        {"items": _bullets_from_block(contraintes, skip_titles={"contraintes du site"})},
    )

    docs = _slice_between(
        paras,
        lambda l: _is_heading(l, "1.4. Documents", "1.4 Documents"),
        lambda l: _is_heading(l, "1.5.", "2. Informations", "2.1."),
        from_idx=body0,
    )
    doc_items = []
    # Pair reference / utilisation when possible
    cleaned = [l for l in docs if l.lower() not in {"documents de référence", "référence", "document / utilisation"}]
    i = 0
    while i < len(cleaned):
        ref = cleaned[i]
        util = cleaned[i + 1] if i + 1 < len(cleaned) else ""
        # Heuristic: short refs vs long descriptions
        if i + 1 < len(cleaned) and len(ref) < 40 and len(util) > 15:
            doc_items.append({"document_id": None, "label": ref, "caption": util})
            i += 2
        else:
            doc_items.append({"document_id": None, "label": ref, "caption": ""})
            i += 1
    set_slot("preambule", "docs_ref", "document_gallery", {"items": doc_items})

    # ── Projet ─────────────────────────────────────────────────────────────
    projet = _slice_between(
        paras,
        lambda l: _is_heading(l, "2.1. Implantation", "2. Informations sur le projet"),
        lambda l: _is_heading(l, "3. Analyse", "3.1."),
        from_idx=body0,
    )
    # Keep existing kv from bindings if present, else build from text snippets
    existing_kv = (
        ((contents.get("projet") or {}).get("projet_kv") or {}).get("content") or {}
    ).get("rows") or []
    set_slot(
        "projet",
        "projet_kv",
        "key_value_table",
        {
            "rows": existing_kv
            or [
                {"key": "lieu", "value": lieu},
                {"key": "titre", "value": titre},
            ]
        },
    )
    set_slot("projet", "projet_texte", "rich_text", {"text": _join(projet)})

    # ── Données ────────────────────────────────────────────────────────────
    donnees = _slice_between(
        paras,
        lambda l: _is_heading(l, "3. Analyse", "3.1. Données"),
        lambda l: _is_heading(l, "4. Dimensionnement", "4.1."),
        from_idx=body0,
    )
    # Split limites
    limites_block = _slice_between(
        paras,
        lambda l: _is_heading(l, "3.4. Limites", "3.4 Limites"),
        lambda l: _is_heading(l, "3.5.", "4. Dimensionnement", "4.1."),
        from_idx=body0,
    )
    set_slot(
        "donnees",
        "limites",
        "bullet_list",
        {"items": _bullets_from_block(limites_block, skip_titles={"limites des données disponibles", "limites des données"})},
    )
    # Store main analyse as free_table with one column "Texte" for editability
    set_slot(
        "donnees",
        "donnees_tables",
        "free_table",
        {
            "headers": ["Élément / donnée"],
            "rows": [[line] for line in donnees if len(line) > 8][:80],
        },
    )
    # Keep media_cards as-is (user attaches figures)
    if "donnees" not in contents or "donnees_figures" not in contents.get("donnees", {}):
        set_slot("donnees", "donnees_figures", "media_cards", {"cards": []})

    # ── Dimensionnement ────────────────────────────────────────────────────
    dim = _slice_between(
        paras,
        lambda l: _is_heading(l, "4. Dimensionnement", "4.1."),
        lambda l: _is_heading(l, "5. Synthèse", "5.1."),
        from_idx=body0,
    )
    hyp = _slice_between(
        paras,
        lambda l: _is_heading(l, "4.4. Hypothèses", "4.4 Hypothèses"),
        lambda l: _is_heading(l, "4.5.", "4.6."),
        from_idx=body0,
    )
    hyp_rows: list[dict[str, str]] = []
    # Table-like: Parameter then Value on next line(s)
    skip_hyp = {
        "hypothèses",
        "paramètre",
        "valeur retenue / statut",
        "calcul du trafic de base",
        "choix du cam",
    }
    pending_key = None
    for line in hyp:
        low = line.lower().strip()
        if low in skip_hyp or _is_heading(line, "4.4"):
            continue
        if ":" in line and len(line) < 140:
            key, _, val = line.partition(":")
            if key.strip() and val.strip():
                hyp_rows.append({"key": key.strip(), "value": val.strip()})
                pending_key = None
                continue
        if pending_key is None:
            pending_key = line
        else:
            hyp_rows.append({"key": pending_key, "value": line})
            pending_key = None
    if pending_key:
        hyp_rows.append({"key": pending_key, "value": ""})
    # Also capture CAM narrative paragraphs into choix later if hyp empty
    set_slot("dimensionnement", "hypotheses", "key_value_table", {"rows": hyp_rows})

    # Keep materiaux from bindings if already filled
    mat = ((contents.get("dimensionnement") or {}).get("materiaux") or {}).get("content")
    if not mat or not mat.get("items"):
        set_slot("dimensionnement", "materiaux", "materiau_status", {"items": [], "auto_from_binding": True})

    variantes = ((contents.get("dimensionnement") or {}).get("variantes") or {}).get("content") or {
        "calcul_ids": [],
        "auto_from_binding": True,
    }
    set_slot("dimensionnement", "variantes", "calculs_table", variantes)

    choix = _slice_between(
        paras,
        lambda l: _is_heading(l, "4.9.", "4.10.", "Comparaison et choix"),
        lambda l: _is_heading(l, "5. Synthèse", "5.1."),
        from_idx=body0,
    )
    set_slot("dimensionnement", "choix", "rich_text", {"text": _join(choix) or _join(dim[-40:])})

    # ── Synthèse ───────────────────────────────────────────────────────────
    synth = _slice_between(
        paras,
        lambda l: _is_heading(l, "5. Synthèse", "5.1."),
        lambda l: _is_heading(l, "6. Annexes", "Annexe 1"),
        from_idx=body0,
    )
    dispositions = _bullets_from_block(
        synth,
        skip_titles={
            "synthèse et dispositions constructives",
            "structures de chaussée proposées",
            "pst",
            "couche de forme",
            "réception plateforme",
            "gb4 duron",
            "couches de roulement",
            "contrôles",
            "limites",
        },
    )
    # Checklist items
    set_slot(
        "synthese",
        "dispositions",
        "checklist",
        {"items": [{"text": t, "done": False} for t in dispositions[:40]]},
    )
    limites_prop = _slice_between(
        paras,
        lambda l: _is_heading(l, "5.7.", "5.8.", "Limites de la proposition"),
        lambda l: _is_heading(l, "6. Annexes", "Annexe 1"),
        from_idx=body0,
    )
    set_slot(
        "synthese",
        "limites_proposition",
        "bullet_list",
        {"items": _bullets_from_block(limites_prop, skip_titles={"limites", "contrôles"})},
    )

    # ── Annexes: keep structure; fill comparatif text note into free content if empty
    if "annexe_plans" not in contents:
        set_slot("annexe_plans", "plans", "media_cards", {"cards": []})
    for section, slot, bt in (
        ("annexe_comparatif", "comparatif", "calculs_table"),
        ("annexe_calculs", "fiches", "calcul_fiches"),
    ):
        cur = ((contents.get(section) or {}).get(slot) or {}).get("content")
        if not cur:
            set_slot(section, slot, bt, {"calcul_ids": [], "auto_from_binding": True})

    return contents


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--instance-id", type=int, default=1)
    parser.add_argument("--docx", type=Path, default=DEFAULT_DOCX)
    args = parser.parse_args()

    from app.models.avis_technique import AvisInstanceUpdateSchema
    from app.repositories.avis_technique_repository import AvisTechniqueRepository

    if not args.docx.exists():
        raise SystemExit(f"DOCX introuvable: {args.docx}")

    repo = AvisTechniqueRepository()
    inst = repo.get_instance(args.instance_id, with_template=True)
    if not inst:
        raise SystemExit(f"Instance #{args.instance_id} introuvable")

    paras = extract_paragraphs(args.docx)
    contents = build_contents_from_paras(paras, inst.get("contents") or {})

    titre = (
        (contents.get("qualite_document") or {})
        .get("meta", {})
        .get("content", {})
        .get("fields", {})
        .get("title")
        or inst.get("titre")
    )
    meta = dict(inst.get("meta") or {})
    fields = (
        (contents.get("qualite_document") or {})
        .get("meta", {})
        .get("content", {})
        .get("fields", {})
    )
    meta.update(fields)
    meta["reference"] = inst.get("reference")  # keep NT ref, ignore RST-D0100 from Word

    updated = repo.update_instance(
        args.instance_id,
        AvisInstanceUpdateSchema(
            titre=str(titre or inst.get("titre") or ""),
            meta=meta,
            contents=contents,
            statut="En rédaction",
        ),
    )
    print(f"OK instance #{updated['id']} {updated['reference']}")
    print(f"sections: {list((updated.get('contents') or {}).keys())}")
    pre = ((updated["contents"].get("preambule") or {}).get("presentation") or {}).get("content", {})
    print(f"presentation chars: {len(str(pre.get('text') or ''))}")
    obj = ((updated["contents"].get("preambule") or {}).get("objectifs") or {}).get("content", {})
    print(f"objectifs: {len(obj.get('items') or [])}")
    hyp = ((updated["contents"].get("dimensionnement") or {}).get("hypotheses") or {}).get("content", {})
    print(f"hypotheses rows: {len(hyp.get('rows') or [])}")


if __name__ == "__main__":
    main()

"""Bring NT0002 image annexes + Alizé data into RaLab instance 3 slots."""
from __future__ import annotations

import json
import re
import shutil
import sqlite3
import zipfile
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

from app.core.database import connect_db, get_db_path
from app.models.avis_technique import AvisInstanceUpdateSchema
from app.repositories.avis_technique_repository import AvisTechniqueRepository
from app.repositories.calculs_repository import CalculsRepository

INSTANCE_ID = 3
DID = 424
ROOT = Path(__file__).resolve().parents[3]
DOCX = ROOT / "storage/documents/2025-RA-008-D0054-NT0002.docx"
STORAGE_REL = Path("documents/2025-RA-008/nt_g3_annexes")
STORAGE_ABS = ROOT / "storage" / STORAGE_REL


# Context snippet → (document_type, annex section_id, slot)
IMAGE_ROUTES: list[tuple[str, str, str, str]] = [
    ("document marché", "NT0002 — Coupe structures marché (plan)", "s2_1", "figures"),
    ("synthèse géotechnique", "NT0002 — Proctor/IPI (courbe §5)", "s5_1", "figures"),
    ("annexe c", "NT0002 — Annexe C plan SP1–SP8", "annexe_c", "figures"),
    ("annexe d", "NT0002 — Annexe D fiches coupe/identification", "annexe_d", "figures"),
    ("annexe e", "NT0002 — Annexe E fiche BBME", "annexe_e", "figures"),
    ("annexe f", "NT0002 — Annexe F Proctor/IPI", "annexe_f", "figures"),
    ("annexe g", "NT0002 — Annexe G fiche calcul P1", "annexe_g", "figures"),
    ("annexe h", "NT0002 — Annexe H fiche calcul P2", "annexe_h", "figures"),
    ("annexe i", "NT0002 — Annexe I fiche P3", "annexe_i", "figures"),
    ("annexe j", "NT0002 — Annexe J fiche P4", "annexe_j", "figures"),
    ("annexe k", "NT0002 — Annexe K fiche P5", "annexe_k", "figures"),
    ("annexe l", "NT0002 — Annexe L fiche P6", "annexe_l", "figures"),
]


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower().replace("’", "'"))


def _load_rid_map(docx: Path) -> dict[str, str]:
    with zipfile.ZipFile(docx) as zf:
        rels = zf.read("word/_rels/document.xml.rels").decode("utf-8", errors="ignore")
    out = {}
    for m in re.finditer(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels):
        out[m.group(1)] = m.group(2).replace("\\", "/")
    # sometimes Target before Id
    for m in re.finditer(r'Target="([^"]+)"[^>]*Id="(rId\d+)"', rels):
        out[m.group(2)] = m.group(1).replace("\\", "/")
    return out


def _iter_images_with_context(docx: Path) -> list[tuple[str, str]]:
    """Return list of (context_text, rId)."""
    d = Document(str(docx))
    last = ""
    pairs: list[tuple[str, str]] = []
    for child in d.element.body:
        tag = child.tag.split("}")[-1]
        if tag == "p":
            text = "".join(t.text or "" for t in child.iter(qn("w:t"))).strip()
            if text:
                last = text
            for blip in child.iter(qn("a:blip")):
                rid = blip.get(qn("r:embed"))
                if rid:
                    pairs.append((last, rid))
        elif tag == "tbl":
            texts = [t.text or "" for t in child.iter(qn("w:t"))]
            joined = " ".join(t.strip() for t in texts if t.strip())
            if joined:
                last = joined
            for blip in child.iter(qn("a:blip")):
                rid = blip.get(qn("r:embed"))
                if rid:
                    pairs.append((last, rid))
    return pairs


def _route_image(context: str) -> tuple[str, str, str] | None:
    n = _norm(context)
    for needle, doc_type, sec, slot in IMAGE_ROUTES:
        if needle in n:
            # refine Annexe D page number into type
            if needle == "annexe d":
                m = re.search(r"page\s*(\d+)\s*/\s*9", n)
                page = m.group(1) if m else "?"
                doc_type = f"NT0002 — Annexe D fiches coupe page {page}/9"
            elif needle == "annexe g":
                doc_type = "NT0002 — Annexe G fiche calcul P1"
            return doc_type, sec, slot
    return None


def ensure_docs_from_word(conn: sqlite3.Connection) -> dict[str, list[int]]:
    """Extract images → storage + demande_documents. Return section → [doc_ids]."""
    STORAGE_ABS.mkdir(parents=True, exist_ok=True)
    rid_map = _load_rid_map(DOCX)
    pairs = _iter_images_with_context(DOCX)
    section_docs: dict[str, list[int]] = {}

    with zipfile.ZipFile(DOCX) as zf:
        for idx, (context, rid) in enumerate(pairs, 1):
            routed = _route_image(context)
            if not routed:
                continue
            doc_type, sec, slot = routed
            target = rid_map.get(rid or "")
            if not target:
                continue
            media_name = Path(target).name
            zip_path = "word/" + target.lstrip("/")
            if zip_path.startswith("word/../"):
                zip_path = "word/" + target.split("/")[-1]
            # normalize media path
            candidates = [
                f"word/media/{media_name}",
                "word/" + target.replace("../", ""),
                f"word/{target}" if not target.startswith("word") else target,
            ]
            data = None
            used = None
            for cand in candidates:
                cand = cand.replace("\\", "/")
                if cand in zf.namelist():
                    data = zf.read(cand)
                    used = cand
                    break
            if data is None:
                continue

            # skip duplicate doc_type already present
            existing = conn.execute(
                "SELECT id, stored_path FROM demande_documents WHERE demande_id=? AND document_type=?",
                (DID, doc_type),
            ).fetchone()
            if existing:
                section_docs.setdefault(f"{sec}:{slot}", []).append(int(existing["id"]))
                continue

            fname = f"nt0002_{idx:02d}_{media_name}"
            abs_path = STORAGE_ABS / fname
            abs_path.write_bytes(data)
            rel = str(STORAGE_REL / fname).replace("\\", "/")
            now = _now()
            cur = conn.execute(
                """
                INSERT INTO demande_documents (
                    demande_id, document_type, is_received, version, document_date,
                    comment, stored_path, uploaded_at, created_at, updated_at
                ) VALUES (?, ?, 1, 'NT0002', date('now'), ?, ?, ?, ?, ?)
                """,
                (
                    DID,
                    doc_type,
                    f"Image annexe importée depuis Word NT0002 ({context[:80]})",
                    rel,
                    now,
                    now,
                    now,
                ),
            )
            doc_id = int(cur.lastrowid)
            section_docs.setdefault(f"{sec}:{slot}", []).append(doc_id)
            print("DOC", doc_id, doc_type, "from", used)

    conn.commit()
    return section_docs


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return f"{v:.3f}".rstrip("0").rstrip(".")
    return str(v)


def tables_from_alize(repo: CalculsRepository) -> dict[str, dict]:
    """Build traffic KV + results free_table from linked Alizé calcs."""
    out: dict[str, dict] = {}
    traffic_rows = []
    result_headers = [
        "Calcul",
        "εt calc",
        "εt adm",
        "εt %",
        "εz calc",
        "εz adm",
        "εz %",
        "Avis",
    ]
    result_rows = []
    for cid in (6, 8):
        detail = repo.get(cid)
        if not detail:
            continue
        alize = detail.alize or {}
        traffic = alize.get("traffic") or {}
        results = alize.get("results") or {}
        name = detail.nom_calcul or detail.reference or str(cid)

        if not traffic_rows:
            # Prefer note values from NT0002 text for display + calc values
            mapping = [
                ("PL/j (MJA)", traffic.get("mja_pl")),
                ("Croissance %", traffic.get("croissance_pct")),
                ("Durée (ans)", traffic.get("duree_ans")),
                ("CAM", traffic.get("cam")),
                ("Risque %", traffic.get("risque")),
                ("NE calculé", traffic.get("ne_calcule")),
                ("NE retenu", traffic.get("ne_retenu")),
                ("Classe / commentaire", traffic.get("classe_trafic") or traffic.get("commentaire")),
            ]
            traffic_rows = [{"key": k, "value": _fmt(v)} for k, v in mapping if v not in (None, "")]

        eps_t = results.get("epsT_calc")
        eps_t_adm = results.get("epsT_adm")
        eps_z = results.get("epsZ_calc")
        eps_z_adm = results.get("epsZ_adm")
        pct_t = ""
        pct_z = ""
        if eps_t is not None and eps_t_adm:
            try:
                pct_t = f"{100 * float(eps_t) / float(eps_t_adm):.1f}"
            except Exception:
                pass
        if eps_z is not None and eps_z_adm:
            try:
                pct_z = f"{100 * float(eps_z) / float(eps_z_adm):.1f}"
            except Exception:
                pass
        result_rows.append(
            [
                name,
                _fmt(eps_t),
                _fmt(eps_t_adm),
                pct_t,
                _fmt(eps_z),
                _fmt(eps_z_adm),
                pct_z,
                str(results.get("conclusion") or ""),
            ]
        )

        # layers table for structures proposées
        layers = alize.get("layers") or []
        if cid == 6 and layers:
            headers = ["#", "Fonction", "Matériau", "Épaisseur", "Module (MPa)"]
            rows = []
            for i, L in enumerate(layers, 1):
                if not isinstance(L, dict):
                    continue
                rows.append(
                    [
                        str(i),
                        str(L.get("fonction") or ""),
                        str(L.get("materiau") or ""),
                        _fmt(L.get("epaisseur")),
                        _fmt(L.get("module")),
                    ]
                )
            out["layers_p_retenu"] = {"headers": headers, "rows": rows}

    out["traffic"] = {"rows": traffic_rows}
    out["results"] = {"headers": result_headers, "rows": result_rows}
    # NT0002 design hypotheses (from note text) as complementary KV
    out["traffic_note"] = {
        "rows": [
            {"key": "Trafic dimensionnant (note NT0002)", "value": "50 PL/j"},
            {"key": "Durée", "value": "15 ans"},
            {"key": "CAM", "value": "1,0"},
            {"key": "Risque", "value": "5 %"},
            {"key": "Cas enveloppe", "value": "P2 BBME — plateforme commune EV2 = 30 MPa"},
            {"key": "Source", "value": "Note NT0002 + calculs Alizé liés demande"},
        ]
    }
    return out


def set_media(contents: dict, sec: str, slot: str, doc_ids: list[int], labels: dict[int, str]) -> None:
    cards = [
        {
            "document_id": did,
            "caption": labels.get(did, ""),
            "order": i,
            "display": "full_width",
        }
        for i, did in enumerate(doc_ids)
    ]
    contents.setdefault(sec, {})[slot] = {"block_type": "media_cards", "content": {"cards": cards}}


def set_rich(contents: dict, sec: str, slot: str, text: str) -> None:
    contents.setdefault(sec, {})[slot] = {"block_type": "rich_text", "content": {"text": text}}


def main() -> None:
    conn = connect_db(get_db_path())
    conn.row_factory = sqlite3.Row
    section_docs = ensure_docs_from_word(conn)

    # Also ensure plan 05.PL.07 already in docs goes to s2_1 if present
    plan = conn.execute(
        "SELECT id, document_type FROM demande_documents WHERE demande_id=? AND (document_type LIKE '%Plan%' OR stored_path LIKE '%05.PL.07%')",
        (DID,),
    ).fetchall()
    for r in plan:
        if "05.PL.07" in (r["document_type"] or "") or "Revêtement" in (r["document_type"] or "") or "Plans" == r["document_type"]:
            section_docs.setdefault("s2_1:figures", []).append(int(r["id"]))
            section_docs.setdefault("annexe_c:figures", []).append(int(r["id"]))

    labels = {
        int(r["id"]): r["document_type"]
        for r in conn.execute("SELECT id, document_type FROM demande_documents WHERE demande_id=?", (DID,))
    }

    repo = AvisTechniqueRepository()
    inst = repo.get_instance(INSTANCE_ID, with_template=True)
    contents = dict(inst.get("contents") or {})

    # Attach media cards
    for key, ids in section_docs.items():
        sec, slot = key.split(":", 1)
        # unique preserve order
        seen = set()
        uniq = []
        for i in ids:
            if i not in seen:
                seen.add(i)
                uniq.append(i)
        set_media(contents, sec, slot, uniq, labels)

    # Alizé-derived tables
    alize_tables = tables_from_alize(CalculsRepository())
    contents.setdefault("s6_1", {})["trafic"] = {
        "block_type": "key_value_table",
        "content": alize_tables.get("traffic_note") or alize_tables.get("traffic") or {"rows": []},
    }
    contents.setdefault("s6_1", {})["tableau"] = {
        "block_type": "free_table",
        "content": {
            "headers": ["Paramètre", "Valeur (calculs liés)"],
            "rows": [[r["key"], r["value"]] for r in (alize_tables.get("traffic") or {}).get("rows") or []],
        },
    }
    set_rich(
        contents,
        "s6_1",
        "texte",
        "Données retenues — hypothèses de la note NT0002 et paramètres trafic issus des calculs Alizé liés à la demande.\n"
        "Les fiches P1–P6 du Word sont des exports de vérification ; dans RaLab elles doivent être regénérées "
        "depuis les calculs Alizé correspondants dès qu'ils existent (aujourd'hui : images d'annexe + calculs 0006/0008).",
    )

    contents.setdefault("annexe_a", {})["trafic"] = {
        "block_type": "key_value_table",
        "content": alize_tables.get("traffic_note") or {"rows": []},
    }
    contents.setdefault("annexe_a", {})["tableau"] = {
        "block_type": "free_table",
        "content": {
            "headers": ["Paramètre Alizé (calculs liés)", "Valeur"],
            "rows": [[r["key"], r["value"]] for r in (alize_tables.get("traffic") or {}).get("rows") or []],
        },
    }
    set_rich(
        contents,
        "annexe_a",
        "texte",
        "Annexe A — Hypothèses de trafic et critères de calcul\n\n"
        "Source RaLab : paramètres trafic des calculs Alizé + hypothèses retenues dans la note NT0002.",
    )

    contents.setdefault("s7_2", {})["resultats"] = {
        "block_type": "free_table",
        "content": alize_tables.get("results") or {"headers": [], "rows": []},
    }
    contents.setdefault("annexe_b", {})["tableau"] = {
        "block_type": "free_table",
        "content": alize_tables.get("results") or {"headers": [], "rows": []},
    }
    set_rich(
        contents,
        "annexe_b",
        "texte",
        "Annexe B — Synthèse des vérifications\n\n"
        "Source RaLab : résultats εt / εz des calculs Alizé liés (à remplacer/compléter par P1–P6 quand créés).",
    )
    contents.setdefault("annexe_b", {})["calculs"] = {
        "block_type": "calculs_table",
        "content": {"calcul_ids": [6, 8], "auto_from_binding": True},
    }

    if alize_tables.get("layers_p_retenu"):
        contents.setdefault("s3_1", {})["tableau"] = {
            "block_type": "free_table",
            "content": alize_tables["layers_p_retenu"],
        }

    # Sensitivity placeholder table structure (will be filled when PF series calcs exist)
    contents.setdefault("s7_1", {})["sensibilite"] = {
        "block_type": "free_table",
        "content": {
            "headers": ["Variante", "EV2 arase (MPa)", "εz (µdéf)", "εz,adm", "Taux %", "Avis"],
            "rows": [
                ["P2 BBME (note)", "30", "724.8", "744.9", "97.3", "Conforme (NT0002)"],
                ["P1 BBSG (note)", "35", "733.1", "744.9", "98.4", "Conforme (NT0002)"],
                ["Alizé 0006 (lié)", "", "", "", "", "Voir tableau §7.2"],
                ["Alizé 0008 (lié)", "", "", "", "", "Voir tableau §7.2"],
            ],
        },
    }
    set_rich(
        contents,
        "s7_1",
        "texte",
        "Calage / sensibilité — valeurs de la note NT0002 (cas P1/P2) et renvoi aux calculs Alizé RaLab.\n"
        "Quand une série de calculs PF (20/30/35/40 MPa) existera, ce tableau sera alimenté automatiquement.",
    )

    # Points d'arrêt — structure from note (Documents G3 list already in s10_2)
    contents.setdefault("s10_1", {})["pa"] = {
        "block_type": "free_table",
        "content": {
            "headers": ["Code", "Point d'arrêt", "Contrôle", "Statut"],
            "rows": [
                ["PA-ARASE", "Réception arase par zone", "EV2 ≥ 30 MPa (35 MPa local P1)", "À suivre"],
                ["PA-MACHEFER", "Tête 40 cm mâchefer", "EV2 ≥ 80 MPa", "À suivre"],
                ["PA-GNT", "Couche GNT", "Épaisseur / portance", "À suivre"],
                ["PA-P6", "Adaptation P6 / planche d'essai", "Garde malaxeur / géotextile", "À confirmer"],
            ],
        },
    }
    set_rich(
        contents,
        "s10_1",
        "texte",
        "Points d'arrêt G3 — grille alignée sur la note NT0002.\n"
        "À synchroniser avec les hold points G3 de la mission dès qu'elle est liée à la demande.",
    )

    # Annex texts explaining source = Word export until Alizé P* exist
    for letter, title in [
        ("g", "P1 BBSG"),
        ("h", "P2 BBME"),
        ("i", "P3"),
        ("j", "P4"),
        ("k", "P5"),
        ("l", "P6"),
    ]:
        sec = f"annexe_{letter}"
        set_rich(
            contents,
            sec,
            "texte",
            f"Annexe — Fiche de calcul {title}\n\n"
            f"Image issue de l'export Word NT0002 (feuille de vérification).\n"
            f"Dans RaLab, cette annexe doit être produite par le bloc fiches Alizé "
            f"dès qu'un calcul nommé {title.split()[0]} existe et est marqué pour impression.\n"
            f"En attendant : figure jointe (document demande) + calculs liés 0006/0008 en annexe fiches Alizé.",
        )

    set_rich(
        contents,
        "annexe_fiches_alize",
        "texte",
        "Fiches Alizé générées par RaLab à partir des calculs marqués pour impression "
        "(aujourd'hui 0006 et 0008). Remplaceront progressivement les images P1–P6 du Word.",
    )
    contents.setdefault("annexe_fiches_alize", {})["fiches"] = {
        "block_type": "calcul_fiches",
        "content": {"calcul_ids": [6, 8], "auto_from_binding": True},
    }

    # Documents gallery refresh
    all_ids = [int(r["id"]) for r in conn.execute(
        "SELECT id FROM demande_documents WHERE demande_id=? ORDER BY id", (DID,)
    )]
    contents.setdefault("s1_2", {})["docs_ref"] = {
        "block_type": "document_gallery",
        "content": {
            "items": [{"document_id": i, "label": labels.get(i, ""), "caption": ""} for i in all_ids],
            "auto_from_binding": True,
        },
    }
    set_rich(
        contents,
        "s1_2",
        "texte",
        "Documents de référence — pièces liées à la demande RaLab "
        "(plans, annexes NT0002 importées depuis les images du Word, etc.).",
    )

    # Link all docs + calcs on instance
    repo.update_instance(
        INSTANCE_ID,
        AvisInstanceUpdateSchema(
            contents=contents,
            linked_document_ids=all_ids,
            linked_calcul_ids=[6, 8],
        ),
    )

    print("sections with media:")
    for k, ids in sorted(section_docs.items()):
        print(" ", k, ids)
    print("docs total", len(all_ids))
    print("OK /avis-technique/3")


if __name__ == "__main__":
    main()

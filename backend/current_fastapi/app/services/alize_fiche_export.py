"""
Export fiche calcul mécanique style annexe NGE / Alizé
(HTML imprimable + PDF via PyMuPDF).
"""

from __future__ import annotations

from typing import Any


NGE_BLUE = (0 / 255, 49 / 255, 112 / 255)  # #003170 for fitz 0-1
NGE_YELLOW = (1.0, 204 / 255, 0.0)


def _esc(v: Any) -> str:
    return (
        str(v if v is not None else "—")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def sanitize_export_basename(value: str, *, fallback: str = "calcul") -> str:
    """Nom de fichier sûr (sans extension), pour PDF / HTML."""
    text = str(value or "").strip()
    if not text:
        text = fallback
    for char in '<>:"/\\|?*\n\r\t':
        text = text.replace(char, "-")
    text = " ".join(text.split()).strip(" .")
    return (text or fallback)[:180]


def build_fiche_export_basename(detail: Any) -> str:
    """
    Nom de sortie du PDF/HTML : priorise general.nom_sortie,
    sinon affaire + demande + nom_calcul (pas un libellé générique).
    """
    general = getattr(detail, "general", None) or {}
    if isinstance(general, dict):
        custom = str(general.get("nom_sortie") or "").strip()
        if custom:
            return sanitize_export_basename(custom, fallback=f"calcul_{getattr(detail, 'id', '')}")

    parts = [
        str(getattr(detail, "affaire_ref", "") or "").strip(),
        str(getattr(detail, "demande_ref", "") or "").strip(),
        str(getattr(detail, "nom_calcul", "") or getattr(detail, "reference", "") or "").strip(),
    ]
    label = " — ".join(part for part in parts if part)
    return sanitize_export_basename(
        label,
        fallback=f"calcul_{getattr(detail, 'id', 'alize')}",
    )


def _num(v: Any, digits: int = 1) -> str:
    if v is None or v == "":
        return "—"
    try:
        return f"{float(v):.{digits}f}"
    except (TypeError, ValueError):
        return str(v)


def _structure_label(layers: list[dict], platform: dict) -> str:
    parts = []
    for layer in layers:
        code = str(layer.get("materiau") or "").upper()
        if code.startswith("PF") or str(layer.get("fonction") or "").lower() == "plateforme":
            continue
        ep = layer.get("epaisseur")
        mat = layer.get("materiau") or "?"
        if ep is not None and ep != "":
            parts.append(f"{ep} cm {mat}")
    pf = platform.get("classe") or next(
        (l.get("materiau") for l in layers if str(l.get("materiau") or "").upper().startswith("PF")),
        "",
    )
    e_pf = platform.get("module_pf")
    label = " + ".join(parts) if parts else "Structure"
    if pf:
        label += f" sur {pf}"
    if e_pf not in (None, ""):
        label += f" — E = {e_pf} MPa"
    return label


def _avis(results: dict, criteria: list[dict]) -> tuple[str, str]:
    consos = []
    for c in criteria or []:
        if c.get("consommation") is not None:
            try:
                consos.append(float(c["consommation"]))
            except (TypeError, ValueError):
                pass
    if not consos:
        try:
            if results.get("epsT_calc") is not None and results.get("epsT_adm"):
                consos.append(float(results["epsT_calc"]) / float(results["epsT_adm"]))
            if results.get("epsZ_calc") is not None and results.get("epsZ_adm"):
                consos.append(float(results["epsZ_calc"]) / float(results["epsZ_adm"]))
        except (TypeError, ValueError, ZeroDivisionError):
            pass
    if not consos:
        return "INDICATIF", "#0ea5e9"
    m = max(consos)
    if m <= 0.9:
        return "CONFORME", "#15803d"
    if m <= 1.0:
        return "LIMITE", "#b45309"
    return "NON CONFORME", "#b91c1c"


def _crit(criteria: list[dict], key: str) -> dict:
    for c in criteria or []:
        if key in str(c.get("critere") or ""):
            return c
    return {}


def build_annexe_html(detail: Any) -> str:
    alize = detail.alize or {}
    layers = alize.get("layers") or []
    criteria = alize.get("criteria") or []
    traffic = alize.get("traffic") or {}
    platform = alize.get("platform") or {}
    params = alize.get("params") or {}
    results = alize.get("results") or {}

    label = _structure_label(layers, platform)
    avis, avis_color = _avis(results, criteria)
    crit_t = _crit(criteria, "epsilonT") or _crit(criteria, "fatigue")
    crit_z = _crit(criteria, "epsilonZ") or _crit(criteria, "plateforme")

    layers_rows = ""
    for layer in layers:
        code = str(layer.get("materiau") or "").upper()
        is_pf = code.startswith("PF") or str(layer.get("fonction") or "").lower() == "plateforme"
        ep = "semi-infini" if is_pf or layer.get("epaisseur") in (None, "") else f"{layer.get('epaisseur')} cm"
        layers_rows += (
            f"<tr><td>{_esc(layer.get('materiau'))}</td>"
            f"<td>{_esc(ep)}</td>"
            f"<td>{_esc(layer.get('module'))}</td>"
            f"<td>{_esc(layer.get('poisson') if layer.get('poisson') is not None else 0.35)}</td></tr>"
        )
    if not layers_rows:
        layers_rows = "<tr><td colspan='4'>—</td></tr>"

    charge = "Jumelage standard de 65 kN"
    if str(params.get("charge_type") or "") == "roue_isolee":
        charge = "Roue isolée"
    elif str(params.get("charge_type") or "") == "autre_jumelage":
        charge = "Autre jumelage"

    pression = params.get("charge_pression") or 0.662
    rayon = params.get("charge_rayon") or 0.125
    entraxe = params.get("charge_entraxe") or 0.375

    conso_t = crit_t.get("consommation")
    conso_z = crit_z.get("consommation")
    taux_t = f"{float(conso_t) * 100:.1f} %" if conso_t is not None else "—"
    taux_z = f"{float(conso_z) * 100:.1f} %" if conso_z is not None else "—"

    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/>
<title>{_esc(detail.reference)} — CALCUL MÉCANIQUE</title>
<style>
@page {{ size: A4; margin: 14mm; }}
* {{ box-sizing: border-box; }}
body {{
  font-family: "Segoe UI", Arial, sans-serif;
  color: #172033;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.35;
}}
.header {{
  background: #003170;
  color: #fff;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 700;
}}
.yellow {{ height: 4px; background: #ffcc00; }}
h1 {{
  color: #003170;
  font-size: 15px;
  margin: 14px 0 4px;
  letter-spacing: 0.02em;
}}
.subtitle {{ color: #69758a; font-size: 11px; margin-bottom: 6px; }}
.case {{ font-weight: 800; font-size: 13px; margin-bottom: 12px; }}
.section {{
  border: 1px solid #d0d7e2;
  margin: 10px 0;
}}
.section-title {{
  background: #eef2f7;
  color: #003170;
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 6px 10px;
  border-bottom: 1px solid #d0d7e2;
}}
.section-body {{ padding: 10px; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border: 1px solid #d0d7e2; padding: 6px 8px; text-align: left; }}
th {{ background: #f8fafc; color: #003170; font-size: 10px; text-transform: uppercase; }}
.grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }}
.box {{ border: 1px solid #d0d7e2; padding: 10px; }}
.box h3 {{ margin: 0 0 8px; color: #003170; font-size: 11px; text-transform: uppercase; }}
.avis {{
  display: inline-block;
  padding: 4px 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #fff;
  background: {avis_color};
}}
.conclusion {{
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 10px 12px;
  margin-top: 10px;
}}
.footer {{
  margin-top: 18px;
  padding-top: 8px;
  border-top: 1px solid #d0d7e2;
  display: flex;
  justify-content: space-between;
  color: #69758a;
  font-size: 10px;
}}
.meta-line {{ margin: 3px 0; }}
@media print {{
  .no-print {{ display: none !important; }}
  body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
}}
</style></head><body>
<div class="header">
  <div>{_esc(detail.affaire_ref or detail.reference)} — CALCUL MÉCANIQUE</div>
  <div>Fiche {_esc(detail.indice or 'R0')} · {_esc(detail.reference)}</div>
</div>
<div class="yellow"></div>

<h1>DIMENSIONNEMENT DES STRUCTURES DE CHAUSSÉES</h1>
<div class="subtitle">Méthode rationnelle LCPC-Sétra — modèle élastique multicouche</div>
<div class="case">{_esc(label)}</div>

<div class="section">
  <div class="section-title">Signalement du calcul</div>
  <div class="section-body">
    <div class="meta-line"><b>Étude / calcul :</b> {_esc(detail.nom_calcul)} · {_esc(detail.reference)}</div>
    <div class="meta-line"><b>Affaire :</b> {_esc(detail.affaire_ref)} — {_esc(detail.chantier)}</div>
    <div class="meta-line"><b>Chargement :</b> {_esc(charge)} · p={_esc(pression)} MPa · a={_esc(rayon)} m · entraxe={_esc(entraxe)} m</div>
    <div class="meta-line"><b>Trafic :</b> MJA PL={_esc(traffic.get('mja_pl'))} · durée={_esc(traffic.get('duree_ans'))} ans · croissance={_esc(traffic.get('croissance_pct'))}% · CAM={_esc(traffic.get('cam'))} · NE={_esc(traffic.get('ne_retenu') or traffic.get('ne_calcule') or results.get('ne'))} · risque={_esc(traffic.get('risque'))}%</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Structure modélisée</div>
  <div class="section-body" style="padding:0">
    <table>
      <thead><tr><th>Couche</th><th>Épaisseur</th><th>Module E (MPa)</th><th>Poisson</th></tr></thead>
      <tbody>{layers_rows}</tbody>
    </table>
  </div>
</div>

<div class="section">
  <div class="section-title">Tableau de synthèse mécanique</div>
  <div class="section-body" style="padding:0">
    <table>
      <thead>
        <tr>
          <th>Niveau</th><th>εt (µdéf)</th><th>εz (µdéf)</th><th>Avis</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Base assise / sommet PF</td>
          <td>{_num(results.get('epsT_calc'))}</td>
          <td>{_num(results.get('epsZ_calc'))}</td>
          <td><span class="avis">{avis}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<div class="grid2">
  <div class="box">
    <h3>Valeur admissible — couche critique</h3>
    <div class="meta-line"><b>Matériau :</b> {_esc(crit_t.get('materiau') or '—')}</div>
    <div class="meta-line"><b>εt admissible :</b> {_num(results.get('epsT_adm') or crit_t.get('valeur_admissible'))} µdéf</div>
    <div class="meta-line"><b>εt calculé :</b> {_num(results.get('epsT_calc') or crit_t.get('valeur_calculee'))} µdéf</div>
    <div class="meta-line"><b>Taux fatigue :</b> {_esc(taux_t)}</div>
    <div class="meta-line"><b>Statut :</b> {_esc(crit_t.get('statut') or '—')}</div>
  </div>
  <div class="box">
    <h3>Valeur admissible — plateforme</h3>
    <div class="meta-line"><b>Classe :</b> {_esc(platform.get('classe') or crit_z.get('materiau') or 'PF')}</div>
    <div class="meta-line"><b>εz admissible :</b> {_num(results.get('epsZ_adm') or crit_z.get('valeur_admissible'))} µdéf</div>
    <div class="meta-line"><b>εz calculé :</b> {_num(results.get('epsZ_calc') or crit_z.get('valeur_calculee'))} µdéf</div>
    <div class="meta-line"><b>Taux plateforme :</b> {_esc(taux_z)}</div>
    <div class="meta-line"><b>Statut :</b> {_esc(crit_z.get('statut') or '—')}</div>
  </div>
</div>

<div class="conclusion">
  <b>Conclusion — {avis}</b><br/>
  {_esc(results.get('conclusion') or 'Lancer le calcul pour générer la conclusion mécanique.')}
br/>
  <span style="color:#69758a">{_esc(results.get('observations') or '')}</span>
</div>

<div class="footer">
  <div>C2-LIMITÉ : Propriété de NGE · RaLab5</div>
  <div>Calcul multicouche · {_esc(detail.auteur or '')}</div>
</div>

<div class="no-print" style="margin-top:16px">
  <button onclick="window.print()" style="background:#003170;color:#fff;border:0;padding:8px 14px;border-radius:6px;font-weight:700;cursor:pointer">
    Imprimer / PDF
  </button>
</div>
</body></html>"""


def build_annexe_pdf_bytes(detail: Any) -> bytes:
    """Génère un PDF A4 proche de l'annexe NGE via PyMuPDF."""
    import fitz

    alize = detail.alize or {}
    layers = alize.get("layers") or []
    criteria = alize.get("criteria") or []
    traffic = alize.get("traffic") or {}
    platform = alize.get("platform") or {}
    params = alize.get("params") or {}
    results = alize.get("results") or {}

    label = _structure_label(layers, platform)
    avis, _ = _avis(results, criteria)
    crit_t = _crit(criteria, "epsilonT") or _crit(criteria, "fatigue")
    crit_z = _crit(criteria, "epsilonZ") or _crit(criteria, "plateforme")

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    blue = (0, 0.192, 0.439)  # #003170

    # Header
    page.draw_rect(fitz.Rect(0, 0, 595, 36), color=blue, fill=blue)
    page.insert_text((16, 22), f"{detail.affaire_ref or detail.reference} — CALCUL MÉCANIQUE", fontsize=10, color=(1, 1, 1), fontname="helv")
    page.insert_text((430, 22), f"Fiche {detail.indice or 'R0'} · {detail.reference}", fontsize=9, color=(1, 1, 1), fontname="helv")
    page.draw_rect(fitz.Rect(0, 36, 595, 40), color=(1, 0.8, 0), fill=(1, 0.8, 0))

    y = 58
    page.insert_text((16, y), "DIMENSIONNEMENT DES STRUCTURES DE CHAUSSÉES", fontsize=12, color=blue, fontname="helv")
    y += 14
    page.insert_text((16, y), "Méthode rationnelle LCPC-Sétra — modèle élastique multicouche", fontsize=9, color=(0.4, 0.45, 0.5), fontname="helv")
    y += 16
    page.insert_text((16, y), label[:95], fontsize=10, color=(0.1, 0.12, 0.18), fontname="helv")
    y += 20

    def section(title: str, y0: float) -> float:
        page.draw_rect(fitz.Rect(16, y0, 579, y0 + 18), color=(0.82, 0.85, 0.9), fill=(0.93, 0.95, 0.97))
        page.insert_text((22, y0 + 12), title.upper(), fontsize=9, color=blue, fontname="helv")
        return y0 + 26

    y = section("Signalement du calcul", y)
    lines = [
        f"Étude / calcul : {detail.nom_calcul} · {detail.reference}",
        f"Affaire : {detail.affaire_ref or '—'} — {detail.chantier or ''}",
        f"Chargement : jumelage FR · p={params.get('charge_pression') or 0.662} MPa · a={params.get('charge_rayon') or 0.125} m",
        (
            f"Trafic : MJA PL={traffic.get('mja_pl') or '—'} · durée={traffic.get('duree_ans') or '—'} ans · "
            f"CAM={traffic.get('cam') or '—'} · NE={traffic.get('ne_retenu') or traffic.get('ne_calcule') or results.get('ne') or '—'} · "
            f"risque={traffic.get('risque') or '—'}%"
        ),
    ]
    for line in lines:
        page.insert_text((22, y), line[:110], fontsize=9, color=(0.1, 0.12, 0.18), fontname="helv")
        y += 13
    y += 8

    y = section("Structure modélisée", y)
    # table header
    page.draw_rect(fitz.Rect(16, y, 579, y + 16), color=(0.82, 0.85, 0.9), fill=(0.97, 0.98, 0.99))
    for x, h in ((22, "Couche"), (200, "Épaisseur"), (320, "Module E"), (450, "Poisson")):
        page.insert_text((x, y + 11), h, fontsize=8, color=blue, fontname="helv")
    y += 18
    for layer in layers:
        code = str(layer.get("materiau") or "").upper()
        is_pf = code.startswith("PF") or str(layer.get("fonction") or "").lower() == "plateforme"
        ep = "semi-infini" if is_pf or layer.get("epaisseur") in (None, "") else f"{layer.get('epaisseur')} cm"
        page.insert_text((22, y + 10), str(layer.get("materiau") or "—")[:28], fontsize=9, fontname="helv")
        page.insert_text((200, y + 10), ep, fontsize=9, fontname="helv")
        page.insert_text((320, y + 10), str(layer.get("module") if layer.get("module") is not None else "—"), fontsize=9, fontname="helv")
        page.insert_text((450, y + 10), str(layer.get("poisson") if layer.get("poisson") is not None else 0.35), fontsize=9, fontname="helv")
        page.draw_line(fitz.Point(16, y + 14), fitz.Point(579, y + 14), color=(0.88, 0.9, 0.93), width=0.5)
        y += 16
    y += 10

    y = section("Tableau de synthèse mécanique", y)
    page.insert_text((22, y + 10), f"εt calc = {_num(results.get('epsT_calc'))} µdéf", fontsize=10, fontname="helv")
    page.insert_text((220, y + 10), f"εz calc = {_num(results.get('epsZ_calc'))} µdéf", fontsize=10, fontname="helv")
    page.insert_text((420, y + 10), f"Avis : {avis}", fontsize=10, color=blue, fontname="helv")
    y += 28

    y = section("Valeurs admissibles", y)
    page.insert_text((22, y), "Couche critique", fontsize=9, color=blue, fontname="helv")
    page.insert_text((310, y), "Plateforme", fontsize=9, color=blue, fontname="helv")
    y += 14
    left = [
        f"Matériau : {crit_t.get('materiau') or '—'}",
        f"εt adm : {_num(results.get('epsT_adm') or crit_t.get('valeur_admissible'))} µdéf",
        f"εt calc : {_num(results.get('epsT_calc') or crit_t.get('valeur_calculee'))} µdéf",
        f"Statut : {crit_t.get('statut') or '—'}",
    ]
    right = [
        f"Classe : {platform.get('classe') or crit_z.get('materiau') or 'PF'}",
        f"εz adm : {_num(results.get('epsZ_adm') or crit_z.get('valeur_admissible'))} µdéf",
        f"εz calc : {_num(results.get('epsZ_calc') or crit_z.get('valeur_calculee'))} µdéf",
        f"Statut : {crit_z.get('statut') or '—'}",
    ]
    for a, b in zip(left, right):
        page.insert_text((22, y), a[:48], fontsize=9, fontname="helv")
        page.insert_text((310, y), b[:48], fontsize=9, fontname="helv")
        y += 13
    y += 12

    y = section("Conclusion", y)
    page.insert_text((22, y), f"{avis} — {str(results.get('conclusion') or 'Lancer le calcul pour générer la conclusion.')[:90]}", fontsize=9, fontname="helv")
    y += 24
    page.insert_text((16, 820), "C2-LIMITÉ : Propriété de NGE · RaLab5", fontsize=8, color=(0.4, 0.45, 0.5), fontname="helv")
    page.insert_text((360, 820), "Calcul multicouche reconstitué", fontsize=8, color=(0.4, 0.45, 0.5), fontname="helv")

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

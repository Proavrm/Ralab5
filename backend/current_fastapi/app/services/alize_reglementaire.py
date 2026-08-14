"""
Calculs réglementaires type méthode française / NF P98-086 (Etape 1).

Ce module calcule :
- NPL (trafic cumulé) et NE = CAM × NPL
- valeurs admissibles εt (couches bitumineuses) et εz (plateforme / GNT)

Il ne calcule PAS encore les sollicitations mécaniques (εt_calc, εz_calc) :
cela relève de l'Etape 2 (modèle multicouche).

Références : NF P98-086, documentation Alizé2 (formules VA), guides pédagogiques.
Les paramètres matériaux par défaut sont des valeurs typiques de catalogue,
ajustables via params / couche.
"""

from __future__ import annotations

import math
from typing import Any


# Paramètres fatigue / rigidité typiques (catalogue simplifié)
# SN : écart-type log10(N) — Annexe F NF P98-086 (GB souvent 0,30)
MATERIAL_DEFAULTS: dict[str, dict[str, float]] = {
    "BBSG2": {"eps6": 100.0, "b": -0.2, "kc": 1.0, "e10": 7000.0, "sn": 0.25},
    "BBSG3": {"eps6": 100.0, "b": -0.2, "kc": 1.0, "e10": 7000.0, "sn": 0.25},
    "BBME2": {"eps6": 100.0, "b": -0.2, "kc": 1.0, "e10": 11000.0, "sn": 0.25},
    "BBME3": {"eps6": 100.0, "b": -0.2, "kc": 1.0, "e10": 11000.0, "sn": 0.25},
    "GB3": {"eps6": 100.0, "b": -0.2, "kc": 1.3, "e10": 9000.0, "sn": 0.30},
    "GB4": {"eps6": 100.0, "b": -0.2, "kc": 1.3, "e10": 11000.0, "sn": 0.30},
    "EME2": {"eps6": 100.0, "b": -0.2, "kc": 1.0, "e10": 14000.0, "sn": 0.25},
    "BBTM": {"eps6": 100.0, "b": -0.2, "kc": 1.0, "e10": 5500.0, "sn": 0.25},
}

# ks selon classe de plateforme (NF P98-086 / catalogues usuels)
KS_BY_PF = {
    "PF1": 1.0 / 1.2,
    "PF2": 1.0 / 1.1,
    "PF2QS": 1.0 / 1.065,
    "PF3": 1.0,
    "PF4": 1.0,
}

# Coefficient c (m^-1) reliant variation d'épaisseur → variation de déformation
C_THICKNESS = 2.0

# Variable réduite u associée au risque (loi normale, queue gauche)
RISK_U = {
    1: 2.326,
    2: 2.054,
    5: 1.645,
    10: 1.282,
    12: 1.175,
    15: 1.036,
    20: 0.842,
    25: 0.674,
    30: 0.524,
    50: 0.0,
}


def _num(value: Any, default: float | None = None) -> float | None:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _norm_code(value: Any) -> str:
    return str(value or "").strip().upper().replace(" ", "")


def compute_npl(
    *,
    mja_pl: float | None,
    croissance_pct: float | None,
    duree_ans: float | None,
    progression: str = "geometrique",
) -> float | None:
    if mja_pl is None or duree_ans is None or mja_pl < 0 or duree_ans <= 0:
        return None
    tau = (croissance_pct or 0.0) / 100.0
    mode = (progression or "geometrique").lower()
    if mode.startswith("arith"):
        return mja_pl * 365.0 * duree_ans * (1.0 + ((duree_ans - 1.0) * tau) / 2.0)
    if abs(tau) < 1e-12:
        return mja_pl * 365.0 * duree_ans
    return mja_pl * 365.0 * ((math.pow(1.0 + tau, duree_ans) - 1.0) / tau)


def compute_ne(*, npl: float | None, cam: float | None) -> float | None:
    if npl is None or cam is None:
        return None
    return npl * cam


def risk_u(risque_pct: float | None) -> float:
    if risque_pct is None:
        return RISK_U[5]
    r = float(risque_pct)
    # interpolation simple sur les bornes connues
    keys = sorted(RISK_U.keys())
    if r <= keys[0]:
        return RISK_U[keys[0]]
    if r >= keys[-1]:
        return RISK_U[keys[-1]]
    for i in range(len(keys) - 1):
        a, b = keys[i], keys[i + 1]
        if a <= r <= b:
            t = (r - a) / (b - a)
            return RISK_U[a] * (1 - t) + RISK_U[b] * t
    return RISK_U[5]


def compute_sh_m(*, epaisseur_m: float | None, materiau: str = "") -> float:
    """
    Écart-type d'épaisseur Sh (m) — formulation usuelle Alizé / catalogues bitumineux d'assise :
    Sh = max(0, 0.3·e − 0.02) avec e en mètres (calée sur fiches type GB).
    """
    e = float(epaisseur_m or 0.0)
    if e <= 0:
        return 0.0
    code = _norm_code(materiau)
    # Couches de roulement / liaison : dispersion plus faible (souvent négligée si non critique)
    if code.startswith(("BBSG", "BBME", "BBTM", "BB")) and not code.startswith(("GB", "EME")):
        return max(0.0, 0.25 * e - 0.015)
    return max(0.0, 0.3 * e - 0.02)


def compute_delta(*, sn: float, b: float, sh_m: float, c: float = C_THICKNESS) -> float:
    """δ = √(SN² + (c·Sh / |b|)²) — NF P98-086 Éq. 4."""
    b_abs = abs(float(b)) or 1e-9
    return math.sqrt(max(sn, 0.0) ** 2 + (c * max(sh_m, 0.0) / b_abs) ** 2)


def compute_kr(
    *,
    risque_pct: float | None,
    b: float,
    sn: float,
    sh_m: float = 0.0,
    c: float = C_THICKNESS,
) -> float:
    """kr = 10^(-u · |b| · δ) avec δ intégrant SN et Sh (NF P98-086)."""
    u = risk_u(risque_pct)
    delta = compute_delta(sn=sn, b=b, sh_m=sh_m, c=c)
    return 10.0 ** (-u * abs(b) * delta)


def ks_for_platform(classe: str | None, module_pf: float | None = None) -> float:
    code = _norm_code(classe)
    if code in KS_BY_PF:
        return KS_BY_PF[code]
    # fallback module
    m = _num(module_pf)
    if m is None:
        return 1.0 / 1.1
    if m < 40:
        return 1.0 / 1.2
    if m < 70:
        return 1.0 / 1.1
    if m < 100:
        return 1.0 / 1.065
    return 1.0


def material_params(materiau: str, layer: dict | None = None, params: dict | None = None) -> dict[str, float]:
    layer = layer or {}
    params = params or {}
    code = _norm_code(materiau)
    base = None
    for key, conf in MATERIAL_DEFAULTS.items():
        if code.startswith(key) or key in code:
            base = dict(conf)
            break
    if base is None:
        base = {"eps6": 100.0, "b": -0.2, "kc": 1.0, "e10": _num(layer.get("module"), 7000.0) or 7000.0, "sn": 0.25}

    # surcharges éventuelles stockées dans params.materiaux[code]
    overrides = ((params.get("materiaux") or {}).get(materiau)
                 or (params.get("materiaux") or {}).get(code)
                 or {})
    for field in ("eps6", "b", "kc", "e10", "sn"):
        if field in overrides and overrides[field] not in (None, ""):
            base[field] = float(overrides[field])
    if layer.get("module") not in (None, ""):
        # module couche = E(θ) ; e10 reste catalogue sauf override
        base["e_theta"] = float(layer["module"])
    else:
        base["e_theta"] = base["e10"]
    return base


def compute_eps_t_adm(
    *,
    ne: float,
    materiau: str,
    layer: dict | None = None,
    params: dict | None = None,
    risque_pct: float | None = None,
    platform_classe: str | None = None,
    platform_module: float | None = None,
) -> dict[str, Any]:
    layer = layer or {}
    conf = material_params(materiau, layer, params)
    eps6 = conf["eps6"]
    b = conf["b"]
    kc = conf["kc"]
    sn = conf["sn"]
    e10 = conf["e10"]
    e_theta = conf.get("e_theta", e10) or e10
    # NF P98-086 : kθ = √(E(10 °C) / E(θeq))
    ktheta = math.sqrt(e10 / e_theta) if e_theta else 1.0

    # Épaisseur structurale de la couche critique (m)
    ep_cm = _num(layer.get("epaisseur"))
    if ep_cm is not None and ep_cm > 0:
        ep_m = ep_cm / 100.0
    else:
        h_cm = _num((params or {}).get("h_assise_cm"), 0.0) or 0.0
        ep_m = h_cm / 100.0
    sh_m = compute_sh_m(epaisseur_m=ep_m, materiau=materiau)
    # Surcharge éventuelle Sh / SN via params
    overrides = ((params or {}).get("materiaux") or {}).get(materiau) or ((params or {}).get("materiaux") or {}).get(_norm_code(materiau)) or {}
    if overrides.get("sh") not in (None, ""):
        sh_m = float(overrides["sh"])
    if overrides.get("sn") not in (None, ""):
        sn = float(overrides["sn"])

    delta = compute_delta(sn=sn, b=b, sh_m=sh_m)
    kr = compute_kr(risque_pct=risque_pct, b=b, sn=sn, sh_m=sh_m)
    ks = ks_for_platform(platform_classe, platform_module)
    ratio = max(ne, 1.0) / 1_000_000.0
    eps_adm = eps6 * (ratio ** b) * kc * kr * ks * ktheta
    return {
        "valeur_admissible": eps_adm,
        "unite": "µdéf",
        "details": {
            "eps6": eps6,
            "b": b,
            "kc": kc,
            "kr": kr,
            "ks": ks,
            "ktheta": ktheta,
            "sn": sn,
            "sh_m": sh_m,
            "delta": delta,
            "epaisseur_m": ep_m,
            "e10": e10,
            "e_theta": e_theta,
            "ne": ne,
            "formule": "εt,adm = ε6·(NE/1e6)^b·kc·kr·ks·√(E10/Eθ) · kr=10^(-u·|b|·δ)",
        },
    }


def compute_eps_z_adm(*, ne: float) -> dict[str, Any]:
    """εz,adm = A · NE^b avec b=-0.222 ; A=16000 si NE≤250000 sinon 12000 (µdéf)."""
    b = -0.222
    a = 16000.0 if ne <= 250_000 else 12000.0
    eps_adm = a * (max(ne, 1.0) ** b)
    return {
        "valeur_admissible": eps_adm,
        "unite": "µdéf",
        "details": {
            "A": a,
            "b": b,
            "ne": ne,
            "formule": "εz,adm = A·NE^(-0.222)",
        },
    }


def is_bituminous_layer(layer: dict) -> bool:
    code = _norm_code(layer.get("materiau"))
    famille = str(layer.get("famille") or "").lower()
    if "plateforme" in famille or code.startswith("PF"):
        return False
    if "gnt" in famille or code.startswith("GNT"):
        return False
    if any(code.startswith(p) for p in ("BB", "GB", "EME", "BBTM", "BBME")):
        return True
    return "bitum" in famille


def is_platform_layer(layer: dict) -> bool:
    code = _norm_code(layer.get("materiau"))
    famille = str(layer.get("famille") or "").lower()
    fonction = str(layer.get("fonction") or "").lower()
    return code.startswith("PF") or "plateforme" in famille or fonction == "plateforme"


def is_unbound_layer(layer: dict) -> bool:
    """GNT / sols non liés (pas de condition de collage type enrobés)."""
    if is_platform_layer(layer):
        return False
    code = _norm_code(layer.get("materiau"))
    famille = str(layer.get("famille") or "").lower()
    if "gnt" in famille or famille in {"gnt/sols", "sols"} or "sol" in famille:
        if "stlh" in famille or "mtlh" in famille:
            return False
        return True
    if code.startswith("GNT") or code.startswith("SOL"):
        return True
    return False


def is_bound_layer(layer: dict) -> bool:
    """Couche liée (bitumineux, MTLH, bétons…) — interfaces collé/semi/glissant pertinentes."""
    if is_platform_layer(layer):
        return False
    return not is_unbound_layer(layer)


def normalize_interface_type(iface: str | None, upper: dict | None, lower: dict | None) -> str:
    """
    Entre deux couches non liées : aucune | géotextile.
    Sinon (au moins une couche liée) : collé | semi-collé | glissant | géotextile.
    """
    raw = str(iface or "").strip().lower().replace("geotextile", "géotextile")
    unbound_pair = bool(upper and lower and is_unbound_layer(upper) and is_unbound_layer(lower))
    if unbound_pair:
        if raw in {"géotextile", "geotextile"}:
            return "géotextile"
        return "aucune"
    if raw in {"semi-collé", "semi-colle", "semi"}:
        return "semi-collé"
    if raw in {"glissant", "slip"}:
        return "glissant"
    if raw in {"géotextile", "geotextile"}:
        return "géotextile"
    if raw in {"aucune", "none", ""}:
        return "collé"
    return "collé"


def virtual_interface_layer(iface: str) -> dict | None:
    """
    Approximation continuum : couche virtuelle mince pour interfaces non collées.
    (Le noyau Maina–Matsui RaLab est à contact collé ; ces intercalaires modélisent
     glissement / semi-collage / géotextile.)
    """
    kind = str(iface or "").strip().lower()
    if kind in {"collé", "colle", "aucune", "none", ""}:
        return None
    if kind in {"géotextile", "geotextile"}:
        return {
            "h_mm": 1.0,
            "E": 80.0,
            "nu": 0.35,
            "materiau": "Géotextile (interface)",
            "bitumineux": False,
            "virtual_interface": "géotextile",
        }
    if kind in {"semi-collé", "semi-colle", "semi"}:
        return {
            "h_mm": 1.0,
            "E": 200.0,
            "nu": 0.35,
            "materiau": "Interface semi-collée",
            "bitumineux": False,
            "virtual_interface": "semi-collé",
        }
    if kind in {"glissant", "slip"}:
        return {
            "h_mm": 1.0,
            "E": 5.0,
            "nu": 0.45,
            "materiau": "Interface glissante",
            "bitumineux": False,
            "virtual_interface": "glissant",
        }
    return None



def h_assise_cm(layers: list[dict]) -> float:
    """Hauteur d'assise bitumineuse hors roulement (approx.)."""
    bit = [l for l in layers if is_bituminous_layer(l)]
    if len(bit) <= 1:
        return _num(bit[0].get("epaisseur"), 0.0) or 0.0 if bit else 0.0
    # exclure la première couche (roulement)
    total = 0.0
    for layer in bit[1:]:
        total += _num(layer.get("epaisseur"), 0.0) or 0.0
    return total


def run_reglementaire_payload(
    *,
    traffic: dict,
    platform: dict,
    params: dict,
    layers: list[dict],
    criteria: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Produit un payload Alizé mis à jour (traffic/results/criteria/params)
    à partir des hypothèses saisies.
    """
    traffic = dict(traffic or {})
    platform = dict(platform or {})
    params = dict(params or {})
    layers = list(layers or [])
    criteria = list(criteria or [])

    mja = _num(traffic.get("mja_pl"))
    croissance = _num(traffic.get("croissance_pct"), 0.0)
    duree = _num(traffic.get("duree_ans"))
    cam = _num(traffic.get("cam"), _num(params.get("cam")))
    risque = _num(traffic.get("risque"), _num(params.get("risque"), 5.0))
    progression = traffic.get("progression") or "geometrique"

    npl = compute_npl(
        mja_pl=mja,
        croissance_pct=croissance,
        duree_ans=duree,
        progression=progression,
    )
    ne_from_traffic = compute_ne(npl=npl, cam=cam)
    ne_retenu = _num(traffic.get("ne_retenu"))
    ne_calcule_manual = _num(traffic.get("ne_calcule"))
    ne = ne_retenu or ne_from_traffic or ne_calcule_manual

    warnings: list[str] = []
    if ne is None:
        warnings.append("NE manquant : renseigner MJA/CAM/durée ou NE retenu")
        return {
            "ok": False,
            "warnings": warnings,
            "traffic": traffic,
            "params": params,
            "results": {},
            "criteria": criteria,
            "report": {"ne": None, "npl": npl},
        }

    traffic_out = {
        **traffic,
        "cam": cam if cam is not None else traffic.get("cam"),
        "risque": risque,
        "progression": progression,
    }
    if npl is not None:
        traffic_out["npl_calcule"] = round(npl)
    if ne_from_traffic is not None:
        traffic_out["ne_calcule"] = round(ne_from_traffic)
    if not ne_retenu:
        traffic_out["ne_retenu"] = round(ne)

    params_out = {
        **params,
        "cam": cam if cam is not None else params.get("cam"),
        "risque": risque,
        "h_assise_cm": h_assise_cm(layers),
        "engine": "ralab_reglementaire_v1",
        "norme": params.get("norme") or "NF P98-086 (VA réglementaires)",
    }

    pf_classe = platform.get("classe") or ""
    pf_module = _num(platform.get("module_pf"))

    # Couches candidates εt : assise bitumineuse (hors PF), priorité GB/EME
    bit_layers = [l for l in layers if is_bituminous_layer(l)]
    eps_t_targets = [l for l in bit_layers if _norm_code(l.get("materiau")).startswith(("GB", "EME"))]
    if not eps_t_targets and bit_layers:
        # fallback dernière couche bitumineuse
        eps_t_targets = [bit_layers[-1]]

    new_criteria: list[dict] = []
    report_criteria: list[dict] = []

    for layer in eps_t_targets:
        mat = layer.get("materiau") or ""
        va = compute_eps_t_adm(
            ne=ne,
            materiau=mat,
            layer=layer,
            params=params_out,
            risque_pct=risque,
            platform_classe=pf_classe,
            platform_module=pf_module,
        )
        new_criteria.append(
            {
                "critere": "fatigue_epsilonT",
                "materiau": mat,
                "couche": mat,
                "profondeur": "base couche",
                "valeur_admissible": round(va["valeur_admissible"], 3),
                "valeur_calculee": None,
                "unite": "µdéf",
                "marge": None,
                "consommation": None,
                "sens_verification": "inferieur_ou_egal",
                "statut": "Non renseigné",
                "commentaire": (
                    f"VA réglementaire RaLab · ε6={va['details']['eps6']} · "
                    f"kr={va['details']['kr']:.3f} · Sh={va['details']['sh_m']:.3f} m · "
                    f"ks={va['details']['ks']:.3f}"
                ),
            }
        )
        report_criteria.append({"type": "epsilonT", "materiau": mat, **va})

    # εz plateforme
    va_z = compute_eps_z_adm(ne=ne)
    pf_label = pf_classe or "PF"
    new_criteria.append(
        {
            "critere": "plateforme_epsilonZ",
            "materiau": pf_label,
            "couche": pf_label,
            "profondeur": "sommet PF",
            "valeur_admissible": round(va_z["valeur_admissible"], 3),
            "valeur_calculee": None,
            "unite": "µdéf",
            "marge": None,
            "consommation": None,
            "sens_verification": "inferieur_ou_egal",
            "statut": "Non renseigné",
            "commentaire": f"VA réglementaire RaLab · A={va_z['details']['A']} · b={va_z['details']['b']}",
        }
    )
    report_criteria.append({"type": "epsilonZ", "materiau": pf_label, **va_z})

    # conserver d'éventuels critères manuels non couverts
    kept = []
    for crit in criteria:
        key = (str(crit.get("critere") or ""), str(crit.get("materiau") or ""))
        if key[0] in {"fatigue_epsilonT", "plateforme_epsilonZ"}:
            continue
        kept.append(crit)

    eps_t_adm = next((c["valeur_admissible"] for c in new_criteria if c["critere"] == "fatigue_epsilonT"), None)
    eps_z_adm = next((c["valeur_admissible"] for c in new_criteria if c["critere"] == "plateforme_epsilonZ"), None)

    results = {
        "epsT_adm": eps_t_adm,
        "epsZ_adm": eps_z_adm,
        "epsT_calc": None,
        "epsZ_calc": None,
        "conclusion": "Valeurs admissibles calculées (Etape 1). Sollicitations mécaniques : Etape 2.",
        "observations": (
            "Calcul réglementaire RaLab v1 (NE + VA εt/εz). "
            "Les valeurs calculées εt/εz mécaniques ne sont pas encore produites."
        ),
        "origin": "ralab_reglementaire_v1",
        "ne": round(ne),
        "npl": round(npl) if npl is not None else None,
    }

    return {
        "ok": True,
        "warnings": warnings,
        "traffic": traffic_out,
        "params": params_out,
        "results": results,
        "criteria": new_criteria + kept,
        "report": {
            "ne": round(ne),
            "npl": round(npl) if npl is not None else None,
            "cam": cam,
            "risque": risque,
            "h_assise_cm": params_out.get("h_assise_cm"),
            "criteria": report_criteria,
        },
    }

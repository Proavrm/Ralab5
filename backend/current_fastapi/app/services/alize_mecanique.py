"""
Etape 2 — Calcul mécanique multicouche (Burmister / Maina–Matsui).

εt (traction horizontale, µdéf) en base de couche bitumineuse liée
εz (compression verticale, µdéf) au sommet de la plateforme

Charge défaut : jumelage FR NF P98-086 (0.662 MPa, entraxe 0.375 m).

Noyau numérique adapté de PyMastic (Apache-2.0, Mostafa Nakhaei, 2020)
https://github.com/Mostafa-Nakhaei/PyMastic — reformulé en unités SI (mm, MPa).
Ce n'est PAS le moteur propriétaire Alizé.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import special

from app.services.alize_reglementaire import (
    _num,
    is_bituminous_layer,
    is_platform_layer,
    material_params,
)

FR_CHARGE = {
    "pression_mpa": 0.662,
    "force_roue_kn": 32.5,
    "entraxe_m": 0.375,
}

# Zéros de Bessel (extrait PyMastic) — utilisés pour l'intégration Hankel
_J1_ZEROS = np.array(
    [
        3.83170597020751, 7.01558666981562, 10.1734681350627, 13.3236919363142,
        16.4706300508776, 19.6158585104682, 22.7600843805928, 25.9036720876184,
        29.0468285349169, 32.1896799109744, 35.3323075500839, 38.4747662347716,
        41.6170942128145, 44.759318997652, 47.9014608871855, 51.0435351835715,
        54.1855536410613, 57.3275254379010, 60.4694578453475, 63.6113566984812,
        66.7532267340985, 69.8950718374958, 73.0368952255738, 76.1786995846415,
        79.3204871754763, 82.4622599143736, 85.6040194363502, 88.7457671449263,
        91.8875042516950, 95.0292318080447, 98.1709507307908, 101.312661823039,
        104.454365791283, 107.596063259509, 110.737754780899, 113.879440847595,
        117.021121898892, 120.162798328149, 123.304470488636, 126.446138698517,
    ]
)
_J0_ZEROS = np.array(
    [
        2.40482555769577, 5.52007811028631, 8.65372791291101, 11.7915344390143,
        14.9309177084878, 18.0710639679109, 21.2116366298793, 24.3524715307493,
        27.4934791320403, 30.6346064684320, 33.7758202135736, 36.9170983536640,
        40.0584257646282, 43.1997917131767, 46.3411883716618, 49.4826098973978,
        52.6240518411150, 55.7655107550200, 58.9069839260809, 62.0484691902272,
        65.1899648002069, 68.3314693298568, 71.4729816035937, 74.6145006437018,
        77.7560256303881, 80.8975558711376, 84.0390907769382, 87.1806298436412,
        90.3221726372105, 93.4637187819448, 96.6052679509963, 99.7468198586806,
        102.888374254195, 106.029930916452, 109.171489649805, 112.313050280495,
        115.454612653667, 118.596176630873, 121.737742087951, 124.879308913233,
    ]
)


def fr_load_radius_m(pression_mpa: float | None = None, force_kn: float | None = None) -> float:
    p = pression_mpa if pression_mpa not in (None, "") else FR_CHARGE["pression_mpa"]
    f = (force_kn if force_kn not in (None, "") else FR_CHARGE["force_roue_kn"]) * 1000.0
    return math.sqrt(f / (math.pi * p * 1e6))


def resolve_charge(params: dict | None) -> dict[str, float]:
    params = params or {}
    charge_type = str(params.get("charge_type") or "jumelage_fr")
    if charge_type == "jumelage_fr" or not params.get("charge_pression"):
        pression = FR_CHARGE["pression_mpa"]
        force = FR_CHARGE["force_roue_kn"]
        entraxe = FR_CHARGE["entraxe_m"]
        rayon = fr_load_radius_m(pression, force)
    else:
        pression = _num(params.get("charge_pression"), FR_CHARGE["pression_mpa"]) or FR_CHARGE["pression_mpa"]
        force = _num(params.get("charge_poids_roue"), FR_CHARGE["force_roue_kn"]) or FR_CHARGE["force_roue_kn"]
        entraxe = _num(params.get("charge_entraxe"), FR_CHARGE["entraxe_m"]) or FR_CHARGE["entraxe_m"]
        rayon = _num(params.get("charge_rayon")) or fr_load_radius_m(pression, force)
    n_roues = 1 if charge_type == "roue_isolee" else 2
    return {
        "pression_mpa": float(pression),
        "rayon_m": float(rayon),
        "entraxe_m": float(entraxe),
        "force_roue_kn": float(force),
        "n_roues": float(n_roues),
        "charge_type": charge_type,
    }


def build_elastic_stack(
    layers: list[dict],
    platform: dict | None = None,
) -> tuple[list[float], list[float], list[float], list[dict]]:
    platform = platform or {}
    finite: list[dict] = []
    halfspace: dict | None = None
    ordered = sorted([dict(l) for l in (layers or [])], key=lambda l: int(l.get("ordre") or 0) or 0)
    for layer in ordered:
        if is_platform_layer(layer):
            halfspace = layer
            continue
        ep_cm = _num(layer.get("epaisseur"))
        if ep_cm is None or ep_cm <= 0:
            continue
        code = layer.get("materiau") or ""
        conf = material_params(code, layer, {})
        e = _num(layer.get("module"), conf.get("e_theta") or conf.get("e10") or 7000.0) or 7000.0
        nu = _num(layer.get("poisson"), 0.35) or 0.35
        finite.append(
            {
                "h_mm": ep_cm * 10.0,
                "E": float(e),
                "nu": float(nu),
                "materiau": code,
                "bitumineux": is_bituminous_layer(layer),
            }
        )
    if halfspace is None:
        halfspace = {
            "materiau": platform.get("classe") or "PF",
            "module": platform.get("module_pf"),
            "poisson": platform.get("poisson") or 0.35,
        }
    e_pf = _num(halfspace.get("module"), _num(platform.get("module_pf"), 50.0)) or 50.0
    nu_pf = _num(halfspace.get("poisson"), _num(platform.get("poisson"), 0.35)) or 0.35
    meta = finite + [
        {
            "h_mm": None,
            "E": float(e_pf),
            "nu": float(nu_pf),
            "materiau": halfspace.get("materiau") or platform.get("classe") or "PF",
            "bitumineux": False,
            "halfspace": True,
        }
    ]
    if not finite:
        raise ValueError("Structure vide : au moins une couche d'épaisseur > 0 est requise")
    H = [m["h_mm"] for m in finite]
    E = [m["E"] for m in meta]
    nu = [m["nu"] for m in meta]
    return H, E, nu, meta


def _pymastic_core(
    q: float,
    a: float,
    x: np.ndarray,
    z: np.ndarray,
    H: np.ndarray,
    E: np.ndarray,
    nu: np.ndarray,
    *,
    iteration: int = 30,
) -> dict[str, np.ndarray]:
    """
    Cœur Maina–Matsui (port PyMastic, unités cohérentes : q et E en MPa, a/H/x/z en mm).
    Convention PyMastic : compression positive.
    """
    x = np.asarray(x, dtype=np.float64).copy()
    z = np.asarray(z, dtype=np.float64).copy()
    H = np.asarray(H, dtype=np.float64)
    # E et q en MPa (SI) — ne pas appliquer le *1000 interne de PyMastic (prévu pour ksi)
    E = np.asarray(E, dtype=np.float64)
    nu = np.asarray(nu, dtype=np.float64)
    x[x == 0] = 1e-6
    z[z == 0] = 1e-6

    n_layers = len(nu)
    sum_h = float(np.sum(H))
    lamda = np.hstack((0.0, np.cumsum(H) / sum_h, 1e3))
    L = z / sum_h
    ro = x / sum_h
    alpha = a / sum_h

    ind = np.array([np.where(lamda > Li)[0][0] for Li in L], dtype=int)

    j0z = _J0_ZEROS / ro[:, None]
    j1z = _J1_ZEROS / alpha
    bessel_zeros = np.hstack(([0.0], j0z.flatten(), j1z.flatten()))
    bessel_zeros = np.sort(bessel_zeros)
    d1 = (bessel_zeros[1] - bessel_zeros[0]) / 6 - 1e-5
    d2 = (bessel_zeros[2] - bessel_zeros[1]) / 2 - 1e-5
    aux1 = np.arange(bessel_zeros[0], bessel_zeros[1], max(d1, 1e-6))
    aux2 = np.arange(bessel_zeros[1], bessel_zeros[2], max(d2, 1e-6))
    m_values = np.hstack((aux1, aux2[1:], bessel_zeros[3:iteration])).flatten()
    get_diff = np.diff(m_values)
    m_mat = np.vstack((m_values, m_values, m_values, m_values)).T
    ft_gauss = np.zeros((4, m_mat.shape[0] - 1))
    coefficient = np.zeros((m_mat.shape[0] - 1, 4))
    coefficient[:, 0] = get_diff / 2 - 0.86114 * (get_diff / 2)
    coefficient[:, 1] = get_diff / 2 - 0.33998 * (get_diff / 2)
    coefficient[:, 2] = get_diff / 2 + 0.33998 * (get_diff / 2)
    coefficient[:, 3] = get_diff / 2 + 0.86114 * (get_diff / 2)
    ft_gauss[0, :] = 0.34786 * (get_diff / 2)
    ft_gauss[1, :] = 0.65215 * (get_diff / 2)
    ft_gauss[2, :] = 0.65215 * (get_diff / 2)
    ft_gauss[3, :] = 0.34786 * (get_diff / 2)
    ft = ft_gauss.flatten(order="F")
    m_final = m_mat[0:-1, :] + coefficient
    m = np.sort(m_final.flatten(order="F"))

    A = np.zeros((len(m), n_layers))
    B = np.zeros((len(m), n_layers))
    C = np.zeros((len(m), n_layers))
    D = np.zeros((len(m), n_layers))

    left_matrix = np.zeros((n_layers - 1, 4, 4))
    right_matrix = np.zeros((n_layers - 1, 4, 4))
    solved_matrix = np.zeros((n_layers - 1, 4, 4))
    h_bc = np.hstack((H, max(H) * 1e3))
    lamda_bc = np.cumsum(h_bc) / sum_h
    r_ratio = E[0:-1] / E[1:] * ((1 + nu[1:]) / (1 + nu[0:-1]))

    for j in range(len(m)):
        a_bc = np.zeros((n_layers, 1))
        b_bc = np.zeros((n_layers, 1))
        c_bc = np.zeros((n_layers, 1))
        d_bc = np.zeros((n_layers, 1))
        left1 = np.array(
            [[np.exp(-m[j] * lamda_bc[0]), 1], [np.exp(-m[j] * lamda_bc[0]), -1]],
            dtype=np.float64,
        )
        right1 = np.array(
            [
                [-(1 - 2 * nu[0]) * np.exp(-m[j] * lamda_bc[0]), 1 - 2 * nu[0]],
                [2 * nu[0] * np.exp(-m[j] * lamda_bc[0]), 2 * nu[0]],
            ],
            dtype=np.float64,
        )
        d_lambda = np.diff(np.hstack((0, lamda_bc)))
        f_exp = np.exp(-m[j] * d_lambda)
        for i in range(n_layers - 1):
            left_matrix[i, :, :] = np.array(
                [
                    [1, f_exp[i], -(1 - 2 * nu[i] - m[j] * lamda_bc[i]), (1 - 2 * nu[i] + m[j] * lamda_bc[i]) * f_exp[i]],
                    [1, -f_exp[i], 2 * nu[i] + m[j] * lamda_bc[i], (2 * nu[i] - m[j] * lamda_bc[i]) * f_exp[i]],
                    [1, f_exp[i], 1 + m[j] * lamda_bc[i], -(1 - m[j] * lamda_bc[i]) * f_exp[i]],
                    [1, -f_exp[i], -(2 - 4 * nu[i] - m[j] * lamda_bc[i]), -(2 - 4 * nu[i] + m[j] * lamda_bc[i]) * f_exp[i]],
                ],
                dtype=np.float64,
            )
            right_matrix[i, :, :] = np.array(
                [
                    [f_exp[i + 1], 1, -(1 - 2 * nu[i + 1] - m[j] * lamda_bc[i]) * f_exp[i + 1], 1 - 2 * nu[i + 1] + m[j] * lamda_bc[i]],
                    [f_exp[i + 1], -1, (2 * nu[i + 1] + m[j] * lamda_bc[i]) * f_exp[i + 1], 2 * nu[i + 1] - m[j] * lamda_bc[i]],
                    [r_ratio[i] * f_exp[i + 1], r_ratio[i], (1 + m[j] * lamda_bc[i]) * r_ratio[i] * f_exp[i + 1], -(1 - m[j] * lamda_bc[i]) * r_ratio[i]],
                    [
                        r_ratio[i] * f_exp[i + 1],
                        -r_ratio[i],
                        -(2 - 4 * nu[i + 1] - m[j] * lamda_bc[i]) * r_ratio[i] * f_exp[i + 1],
                        -(2 - 4 * nu[i + 1] + m[j] * lamda_bc[i]) * r_ratio[i],
                    ],
                ],
                dtype=np.float64,
            )
            try:
                solved_matrix[i, :, :] = np.linalg.solve(left_matrix[i], right_matrix[i])
            except np.linalg.LinAlgError:
                solved_matrix[i, :, :] = np.linalg.pinv(left_matrix[i]) @ right_matrix[i]

        bn_dn = solved_matrix[0]
        for i in range(1, n_layers - 1):
            bn_dn = bn_dn @ solved_matrix[i]
        bn_dn = bn_dn[:, [1, 3]]
        nn = np.hstack([left1, right1]) @ bn_dn
        try:
            bd = np.linalg.solve(nn, np.array([[1.0], [0.0]]))
        except np.linalg.LinAlgError:
            bd = np.linalg.pinv(nn) @ np.array([[1.0], [0.0]])
        b_bc[-1] = bd[0]
        d_bc[-1] = bd[1]
        for i in reversed(range(n_layers - 1)):
            bc = solved_matrix[i] @ np.vstack((a_bc[i + 1], b_bc[i + 1], c_bc[i + 1], d_bc[i + 1]))
            a_bc[i], b_bc[i], c_bc[i], d_bc[i] = bc[0], bc[1], bc[2], bc[3]
        A[j, :] = a_bc.flatten()
        B[j, :] = b_bc.flatten()
        C[j, :] = c_bc.flatten()
        D[j, :] = d_bc.flatten()

    sigma_r = np.zeros((len(z), len(x)))
    sigma_t = np.zeros((len(z), len(x)))
    sigma_z = np.zeros((len(z), len(x)))
    eps_r = np.zeros((len(z), len(x)))
    eps_t = np.zeros((len(z), len(x)))
    eps_z = np.zeros((len(z), len(x)))

    for jx in range(len(x)):
        for iz in range(len(z)):
            li = int(ind[iz] - 1)
            nu_l = nu[li]
            e_l = E[li]
            rs = -m * special.jv(0, m * ro[jx]) * (
                (A[:, li] - C[:, li] * (1 - 2 * nu_l - m * L[iz])) * np.exp(-m * (lamda[int(ind[iz])] - L[iz]))
                + (B[:, li] + D[:, li] * (1 - 2 * nu_l + m * L[iz])) * np.exp(-m * (L[iz] - lamda[li]))
            )
            sigma_z[iz, jx] = -q * alpha * np.sum(ft * rs * special.jv(1, m * alpha) / m)

            rs = (m * special.jv(0, m * ro[jx]) - (1 / ro[jx]) * special.jv(1, m * ro[jx])) * (
                (A[:, li] + C[:, li] * (1 + m * L[iz])) * np.exp(-m * (lamda[int(ind[iz])] - L[iz]))
                + (B[:, li] - D[:, li] * (1 - m * L[iz])) * np.exp(-m * (L[iz] - lamda[li]))
            ) + 2 * nu_l * m * special.jv(0, m * ro[jx]) * (
                C[:, li] * np.exp(-m * (lamda[int(ind[iz])] - L[iz])) - D[:, li] * np.exp(-m * (L[iz] - lamda[li]))
            )
            sigma_r[iz, jx] = -q * alpha * np.sum(ft * rs * special.jv(1, m * alpha) / m)

            rs = (1 / ro[jx]) * special.jv(1, m * ro[jx]) * (
                (A[:, li] + C[:, li] * (1 + m * L[iz])) * np.exp(-m * (lamda[int(ind[iz])] - L[iz]))
                + (B[:, li] - D[:, li] * (1 - m * L[iz])) * np.exp(-m * (L[iz] - lamda[li]))
            ) + 2 * nu_l * m * special.jv(0, m * ro[jx]) * (
                C[:, li] * np.exp(-m * (lamda[int(ind[iz])] - L[iz])) - D[:, li] * np.exp(-m * (L[iz] - lamda[li]))
            )
            sigma_t[iz, jx] = -q * alpha * np.sum(ft * rs * special.jv(1, m * alpha) / m)

            eps_z[iz, jx] = (1 / e_l) * (sigma_z[iz, jx] - nu_l * (sigma_t[iz, jx] + sigma_r[iz, jx]))
            eps_r[iz, jx] = (1 / e_l) * (sigma_r[iz, jx] - nu_l * (sigma_z[iz, jx] + sigma_t[iz, jx]))
            eps_t[iz, jx] = (1 / e_l) * (sigma_t[iz, jx] - nu_l * (sigma_z[iz, jx] + sigma_r[iz, jx]))

    return {
        "Stress_Z": sigma_z,
        "Stress_R": sigma_r,
        "Stress_T": sigma_t,
        "Strain_Z": eps_z,
        "Strain_R": eps_r,
        "Strain_T": eps_t,
    }


def critical_depths_mm(meta: list[dict], H_mm: list[float]) -> dict[str, Any]:
    interfaces = np.cumsum(H_mm)
    bit_indices = [i for i, m in enumerate(meta[:-1]) if m.get("bitumineux")]
    if not bit_indices:
        z_t = float(interfaces[-1]) - 0.01
        mat_t = meta[len(H_mm) - 1]["materiau"]
    else:
        i_last = bit_indices[-1]
        z_t = float(interfaces[i_last]) - 0.01
        mat_t = meta[i_last]["materiau"]
    z_z = float(interfaces[-1]) + 0.01
    return {
        "z_eps_t_mm": z_t,
        "z_eps_z_mm": z_z,
        "materiau_eps_t": mat_t,
        "materiau_eps_z": meta[-1]["materiau"],
    }


def compute_mecanical_strains(
    *,
    layers: list[dict],
    platform: dict | None = None,
    params: dict | None = None,
) -> dict[str, Any]:
    H_mm, E, nu, meta = build_elastic_stack(layers, platform)
    charge = resolve_charge(params)
    depths = critical_depths_mm(meta, H_mm)

    a_mm = charge["rayon_m"] * 1000.0
    d_mm = charge["entraxe_m"] * 1000.0
    q = charge["pression_mpa"]

    # offsets absolus (origine = milieu du jumelage)
    if charge.get("n_roues", 2) >= 2:
        wheel_offsets = [-d_mm / 2.0, d_mm / 2.0]
        x_eval = np.array([0.0, d_mm / 2.0, d_mm / 2.0 + a_mm * 0.5], dtype=float)
    else:
        wheel_offsets = [0.0]
        x_eval = np.array([0.0, a_mm * 0.5], dtype=float)

    z_eval = np.array([depths["z_eps_t_mm"], depths["z_eps_z_mm"]], dtype=float)

    # superposition des roues
    acc_r = np.zeros((len(z_eval), len(x_eval)))
    acc_t = np.zeros((len(z_eval), len(x_eval)))
    acc_z = np.zeros((len(z_eval), len(x_eval)))
    for wx in wheel_offsets:
        # distance radiale de chaque point d'évaluation à la roue
        r_rel = np.abs(x_eval - wx)
        resp = _pymastic_core(q, a_mm, r_rel, z_eval, np.array(H_mm), np.array(E), np.array(nu))
        acc_r += resp["Strain_R"]
        acc_t += resp["Strain_T"]
        acc_z += resp["Strain_Z"]

    samples_t = []
    samples_z = []
    for ix, x in enumerate(x_eval):
        # traction = -strain (compression positive)
        eps_t_udef = max(-acc_r[0, ix], -acc_t[0, ix], 0.0) * 1e6
        eps_z_udef = max(acc_z[1, ix], 0.0) * 1e6
        samples_t.append({"x_mm": float(x), "eps_t_udef": eps_t_udef})
        samples_z.append({"x_mm": float(x), "eps_z_udef": eps_z_udef})

    best_t = max(samples_t, key=lambda s: s["eps_t_udef"])
    best_z = max(samples_z, key=lambda s: s["eps_z_udef"])

    return {
        "ok": True,
        "epsT_calc": round(float(best_t["eps_t_udef"]), 2),
        "epsZ_calc": round(float(best_z["eps_z_udef"]), 2),
        "charge": charge,
        "stack": {"H_mm": H_mm, "E_mpa": E, "nu": nu, "materiaux": [m["materiau"] for m in meta]},
        "depths": depths,
        "samples_t": [{"x_mm": s["x_mm"], "eps_t_udef": round(s["eps_t_udef"], 2)} for s in samples_t],
        "samples_z": [{"x_mm": s["x_mm"], "eps_z_udef": round(s["eps_z_udef"], 2)} for s in samples_z],
        "engine": "ralab_mecanique_v1",
        "warnings": [],
    }


def _conclusion_from_values(adm_t, calc_t, adm_z, calc_z) -> str:
    parts = []
    for label, adm, calc in (("εt", adm_t, calc_t), ("εz", adm_z, calc_z)):
        if adm is None or calc is None or float(adm) == 0:
            continue
        conso = float(calc) / float(adm)
        if conso <= 0.9:
            parts.append(f"{label} conforme ({conso * 100:.0f}%)")
        elif conso <= 1.0:
            parts.append(f"{label} limite ({conso * 100:.0f}%)")
        else:
            parts.append(f"{label} non conforme ({conso * 100:.0f}%)")
    return " · ".join(parts) if parts else "Sollicitations calculées"


def _apply_calc_to_criteria(
    criteria: list[dict],
    *,
    eps_t: float,
    eps_z: float,
    mat_t: str,
    mat_z: str,
) -> list[dict]:
    out = []
    found_t = found_z = False
    for crit in criteria:
        c = dict(crit)
        key = str(c.get("critere") or "")
        if key == "fatigue_epsilonT":
            c["valeur_calculee"] = eps_t
            if not c.get("materiau"):
                c["materiau"] = mat_t
            found_t = True
        elif key == "plateforme_epsilonZ":
            c["valeur_calculee"] = eps_z
            if not c.get("materiau"):
                c["materiau"] = mat_z
            found_z = True
        out.append(c)
    if not found_t:
        out.append(
            {
                "critere": "fatigue_epsilonT",
                "materiau": mat_t,
                "couche": mat_t,
                "profondeur": "base couche",
                "valeur_admissible": None,
                "valeur_calculee": eps_t,
                "unite": "µdéf",
                "sens_verification": "inferieur_ou_egal",
                "statut": "Non renseigné",
                "commentaire": "εt calc RaLab mécanique v1",
            }
        )
    if not found_z:
        out.append(
            {
                "critere": "plateforme_epsilonZ",
                "materiau": mat_z,
                "couche": mat_z,
                "profondeur": "sommet PF",
                "valeur_admissible": None,
                "valeur_calculee": eps_z,
                "unite": "µdéf",
                "sens_verification": "inferieur_ou_egal",
                "statut": "Non renseigné",
                "commentaire": "εz calc RaLab mécanique v1",
            }
        )
    return out


def run_mecanique_payload(
    *,
    layers: list[dict],
    platform: dict | None = None,
    params: dict | None = None,
    criteria: list[dict] | None = None,
    results: dict | None = None,
) -> dict[str, Any]:
    try:
        mech = compute_mecanical_strains(layers=layers, platform=platform, params=params)
    except Exception as exc:
        return {
            "ok": False,
            "warnings": [str(exc)],
            "results": results or {},
            "criteria": criteria or [],
            "report": {},
            "params": params or {},
        }

    results_out = dict(results or {})
    results_out["epsT_calc"] = mech["epsT_calc"]
    results_out["epsZ_calc"] = mech["epsZ_calc"]
    results_out["mecanique_report"] = {
        "engine": mech["engine"],
        "charge": mech["charge"],
        "depths": mech["depths"],
        "samples_t": mech["samples_t"],
        "samples_z": mech["samples_z"],
        "stack": mech["stack"],
    }
    results_out["origin"] = "ralab_mecanique_v1"
    if results_out.get("epsT_adm") is not None or results_out.get("epsZ_adm") is not None:
        results_out["conclusion"] = _conclusion_from_values(
            results_out.get("epsT_adm"),
            results_out.get("epsT_calc"),
            results_out.get("epsZ_adm"),
            results_out.get("epsZ_calc"),
        )
    else:
        results_out["conclusion"] = "Sollicitations mécaniques calculées (Etape 2). Lancer Etape 1 pour VA."
    results_out["observations"] = (
        "Calcul mécanique RaLab v1 (multicouche élastique + jumelage FR). "
        "Approximation Burmister — à confronter aux références Excel / Alizé."
    )

    criteria_out = _apply_calc_to_criteria(
        list(criteria or []),
        eps_t=mech["epsT_calc"],
        eps_z=mech["epsZ_calc"],
        mat_t=mech["depths"]["materiau_eps_t"],
        mat_z=mech["depths"]["materiau_eps_z"],
    )
    params_out = dict(params or {})
    params_out["engine_mecanique"] = "ralab_mecanique_v1"
    params_out["charge_rayon"] = mech["charge"]["rayon_m"]
    params_out["charge_pression"] = mech["charge"]["pression_mpa"]
    params_out["charge_entraxe"] = mech["charge"]["entraxe_m"]
    params_out["charge_poids_roue"] = mech["charge"]["force_roue_kn"]

    return {
        "ok": True,
        "warnings": mech.get("warnings") or [],
        "results": results_out,
        "criteria": criteria_out,
        "params": params_out,
        "report": results_out["mecanique_report"],
    }


def run_complet_payload(
    *,
    traffic: dict,
    platform: dict,
    params: dict,
    layers: list[dict],
    criteria: list[dict] | None = None,
) -> dict[str, Any]:
    from app.services.alize_reglementaire import run_reglementaire_payload

    reg = run_reglementaire_payload(
        traffic=traffic,
        platform=platform,
        params=params,
        layers=layers,
        criteria=criteria,
    )
    if not reg.get("ok"):
        return reg

    mec = run_mecanique_payload(
        layers=layers,
        platform=platform,
        params=reg.get("params") or params,
        criteria=reg.get("criteria") or [],
        results=reg.get("results") or {},
    )
    if not mec.get("ok"):
        out = dict(reg)
        out["ok"] = False
        out["warnings"] = list(reg.get("warnings") or []) + list(mec.get("warnings") or [])
        return out

    results = dict(mec["results"])
    results["reglementaire_report"] = reg.get("report") or {}
    results["origin"] = "ralab_complet_v1"
    results["conclusion"] = _conclusion_from_values(
        results.get("epsT_adm"),
        results.get("epsT_calc"),
        results.get("epsZ_adm"),
        results.get("epsZ_calc"),
    )
    results["observations"] = (
        "Calcul complet RaLab v1 : NE + VA (NF P98-086) + sollicitations multicouche. "
        "Comparer aux études Excel pour calibration."
    )
    params_out = dict(mec.get("params") or {})
    params_out["engine"] = "ralab_complet_v1"
    return {
        "ok": True,
        "warnings": list(reg.get("warnings") or []) + list(mec.get("warnings") or []),
        "traffic": reg["traffic"],
        "params": params_out,
        "results": results,
        "criteria": mec["criteria"],
        "report": {"reglementaire": reg.get("report"), "mecanique": mec.get("report")},
    }

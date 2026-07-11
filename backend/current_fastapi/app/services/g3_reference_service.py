"""Génération des références mission G3 : {affaire_ref}-D{numero}-G{NNNN}."""

from __future__ import annotations

import re


def build_g3_mission_reference_stem(*, affaire_ref: str, demande_numero: int) -> str:
    affaire = str(affaire_ref or "").strip()
    numero = max(int(demande_numero or 0), 0)
    if affaire:
        return f"{affaire}-D{numero:04d}"
    return f"D{numero:04d}"


def g3_mission_reference_prefix(*, affaire_ref: str, demande_numero: int) -> str:
    return f"{build_g3_mission_reference_stem(affaire_ref=affaire_ref, demande_numero=demande_numero)}-G"


def parse_g3_mission_sequence(reference: str, *, affaire_ref: str = "") -> int | None:
    """Extrait le numéro séquentiel G d'une référence (formats actuels et legacy)."""
    ref = str(reference or "").strip()
    if not ref:
        return None

    affaire = re.escape(str(affaire_ref or "").strip())
    patterns: list[re.Pattern[str]] = []
    if affaire:
        patterns.extend([
            re.compile(rf"^{affaire}-D\d{{4}}-G(\d{{4}})$"),
            re.compile(rf"^{affaire}-RST-G(\d{{4}})$"),
            re.compile(rf"^{affaire}-G3(?:-(\d{{2}}))?$"),
        ])
    patterns.append(re.compile(r"^D\d{4}-G(\d{4})$"))
    patterns.append(re.compile(r"^RST-G(\d{4})$"))
    patterns.append(re.compile(r"^G3(?:-(\d{2}))?$"))

    for pattern in patterns:
        match = pattern.match(ref)
        if not match:
            continue
        suffix = match.group(1)
        if suffix is None:
            return 1
        return int(suffix)
    return None


def next_g3_mission_reference(
    conn,
    *,
    demande_id: int,
    affaire_ref: str,
    demande_numero: int,
) -> str:
    prefix = g3_mission_reference_prefix(
        affaire_ref=affaire_ref,
        demande_numero=demande_numero,
    )
    rows = conn.execute(
        "SELECT reference FROM g3_missions WHERE demande_id = ? ORDER BY id",
        (int(demande_id),),
    ).fetchall()
    max_seq = 0
    for row in rows:
        seq = parse_g3_mission_sequence(str(row["reference"]), affaire_ref=affaire_ref)
        if seq is not None:
            max_seq = max(max_seq, seq)
    return f"{prefix}{max_seq + 1:04d}"

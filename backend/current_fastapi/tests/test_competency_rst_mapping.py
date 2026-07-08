from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.competency_rst_mapping import infer_rst_code


def test_gr_enrobe_after_extraction() -> None:
    assert infer_rst_code(
        "Analyse Granulométrique par tamisage",
        "NF EN 12697-2+A1",
        "HMA / WMA",
        "Labo",
    ) == "GR"


def test_gr_granulats_933_1() -> None:
    assert infer_rst_code(
        "Analyse Granulométrique par tamisage",
        "NF EN 933-1",
        "Granulats",
        "Labo",
    ) == "GR"


def test_gr_sols_17892_4() -> None:
    assert infer_rst_code(
        "Analyse granulométrique",
        "NF EN ISO 17892-4",
        "Sols naturels",
        "Labo",
    ) == "GR"


def test_el_12697_1() -> None:
    assert infer_rst_code(
        "Extraction de liant",
        "NF EN 12697-1",
        "HMA / WMA",
        "Labo",
    ) == "EL"


def test_el_12697_39() -> None:
    assert infer_rst_code(
        "Teneur en liant par calcination",
        "NF EN 12697-39",
        "HMA / WMA",
        "Labo",
    ) == "EL"


def test_prep_12697_28() -> None:
    assert infer_rst_code(
        "Préparation des prises d'essai – W%, TL et granularité",
        "NF EN 12697-28",
        "HMA / WMA",
        "Labo",
    ) == "PREP"


def test_prep_932_2() -> None:
    assert infer_rst_code(
        "Préparation / réduction d'un échantillon de laboratoire",
        "NF EN 932-2",
        "Granulats",
        "Labo",
    ) == "PREP"


def test_prep_12594() -> None:
    assert infer_rst_code(
        "Préparation des échantillons de liants bitumineux",
        "NF EN 12594",
        "Bitume",
        "Labo",
    ) == "PREP"


def test_prel_932_1() -> None:
    assert infer_rst_code(
        "Prélèvement / échantillonnage des granulats",
        "NF EN 932-1",
        "Granulats",
        "Labo",
    ) == "PREL"


def test_prel_en_58() -> None:
    assert infer_rst_code(
        "Prélèvement / échantillonnage des liants bitumineux",
        "NF EN 58",
        "Liants bitumineux",
        "Labo",
    ) == "PREL"


def test_12697_2_not_matched_as_12697_28() -> None:
    assert infer_rst_code(
        "Analyse Granulométrique par tamisage",
        "NF EN 12697-2",
        "HMA / WMA",
        "Labo",
    ) == "GR"


def test_emulsion_tamis_not_prel() -> None:
    assert infer_rst_code(
        "Résidus sur tamis - Stabilité au stockage par tamisage",
        "NF EN 1429",
        "Emulsion",
        "Labo",
    ) is None

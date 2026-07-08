from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.passation_delta_service import classify_affaire_demande_link


def test_manual_demande_on_affaire() -> None:
    row = classify_affaire_demande_link(
        passation_uid=2,
        demande_uid=415,
        passation_source_id=None,
        passation_module_code="",
    )
    assert row["link_kind"] == "manual"
    assert row["linkable"] is True
    assert row["linked_to_this_passation"] is False


def test_demande_linked_to_current_passation() -> None:
    row = classify_affaire_demande_link(
        passation_uid=2,
        demande_uid=415,
        passation_source_id=2,
        passation_module_code="etude_technique",
    )
    assert row["link_kind"] == "linked"
    assert row["linkable"] is False
    assert row["linked_to_this_passation"] is True
    assert row["passation_module_code"] == "etude_technique"


def test_demande_linked_to_other_passation() -> None:
    row = classify_affaire_demande_link(
        passation_uid=2,
        demande_uid=99,
        passation_source_id=5,
        passation_module_code="planning",
    )
    assert row["link_kind"] == "other_passation"
    assert row["linkable"] is False

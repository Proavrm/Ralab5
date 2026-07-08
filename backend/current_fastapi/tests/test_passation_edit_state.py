from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.passation_delta_service import passation_demande_state, passation_edit_state


def test_editable_before_any_demande() -> None:
    state = passation_demande_state(linked_demande_uid=None)
    assert state["is_editable"] is True
    assert state["generated_demande_count"] == 0


def test_locked_when_demande_linked() -> None:
    state = passation_demande_state(linked_demande_uid=415, linked_demande_reference="2026-SP-D0052")
    assert state["is_editable"] is False
    assert state["generated_demande_count"] == 1
    assert state["linked_demande_reference"] == "2026-SP-D0052"


def test_edit_state_wrapper_from_single_item() -> None:
    state = passation_edit_state(
        [{"already_generated": True, "existing_demande_uid": 12, "existing_demande_reference": "D001"}]
    )
    assert state["is_editable"] is False
    assert state["generated_demande_count"] == 1

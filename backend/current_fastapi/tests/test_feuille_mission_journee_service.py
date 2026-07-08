from app.services.feuille_mission_journee_service import resolve_mission_feuille_status, technicien_key_from_label


def test_resolve_mission_feuille_status_none():
    assert resolve_mission_feuille_status(None, "abc") == "none"


def test_resolve_mission_feuille_status_printed():
    row = {
        "generated_at": "2026-06-18 10:00:00",
        "printed_at": "2026-06-18 11:00:00",
        "snapshot_hash": "deadbeefcafebabe",
    }
    assert resolve_mission_feuille_status(row, "deadbeefcafebabe") == "printed"


def test_resolve_mission_feuille_status_stale():
    row = {
        "generated_at": "2026-06-18 10:00:00",
        "printed_at": "2026-06-18 11:00:00",
        "snapshot_hash": "oldhash000000000",
    }
    assert resolve_mission_feuille_status(row, "newhash000000000") == "stale"


def test_technicien_key_unassigned():
    assert technicien_key_from_label("Sans technicien") == "__unassigned__"

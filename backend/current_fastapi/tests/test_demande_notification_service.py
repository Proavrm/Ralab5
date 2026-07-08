from __future__ import annotations

import sqlite3

from app.core.database import ensure_ralab4_schema, get_db_path
from app.services.demande_notification_service import notify_demande_created_from_passation


def test_notify_demande_created_writes_assignment_and_email():
    ensure_ralab4_schema()
    path = get_db_path()
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        result = notify_demande_created_from_passation(
            conn,
            demande_uid=999001,
            demande_reference="TEST-DEM-001",
            passation_uid=999002,
            passation_reference="TEST-P-001",
            affaire_rst_id=None,
            recipient_email="slhopital@guintoli.fr",
            recipient_display_name="Sylvain LHOPITAL",
            passation_synthese="Synthèse test",
        )
        conn.commit()
        assert result["notified"] is True
        assert result["email_mock_uid"] > 0

        assignment = conn.execute(
            "SELECT module_type, assignee_user_email FROM task_assignments WHERE object_uid = 999001 ORDER BY id DESC LIMIT 1"
        ).fetchone()
        assert assignment is not None
        assert assignment["module_type"] == "DEMANDE"
        assert assignment["assignee_user_email"] == "slhopital@guintoli.fr"

        email = conn.execute(
            "SELECT recipient_email, subject FROM email_outbox WHERE id = ?",
            (result["email_mock_uid"],),
        ).fetchone()
        assert email is not None
        assert "TEST-DEM-001" in email["subject"]
    finally:
        conn.execute("DELETE FROM task_assignments WHERE object_uid = 999001")
        conn.execute("DELETE FROM email_outbox WHERE id >= ?", (result.get("email_mock_uid", 0),))
        conn.commit()
        conn.close()

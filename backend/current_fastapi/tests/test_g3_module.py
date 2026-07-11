"""Tests du module G3 — Phase 1."""

from __future__ import annotations

import sqlite3
import unittest

from app.core.database import G3_DDL
from app.models.g3 import G3MissionCreateSchema, G3MissionResponseSchema, G3InterventionSchema
from app.models.g3_catalogs import G3_PROGRAMME_DEFAULT_TEMPLATE
from app.repositories.g3_repository import G3Repository
from app.services.g3_programme_service import build_g3002_html


MINIMAL_DDL = """
CREATE TABLE affaires_rst (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    client TEXT NOT NULL DEFAULT '',
    chantier TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL DEFAULT '',
    adresse_ouvrage TEXT NOT NULL DEFAULT '',
    maitre_ouvrage TEXT NOT NULL DEFAULT '',
    maitre_oeuvre TEXT NOT NULL DEFAULT '',
    responsable TEXT NOT NULL DEFAULT ''
);

CREATE TABLE demandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    annee INTEGER NOT NULL DEFAULT 2026,
    labo_code TEXT NOT NULL DEFAULT 'SP',
    numero INTEGER NOT NULL DEFAULT 0,
    affaire_rst_id INTEGER NOT NULL REFERENCES affaires_rst(id) ON DELETE RESTRICT,
    type_mission TEXT NOT NULL DEFAULT 'Exploitation G3',
    nature TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    type_prestation_attendue TEXT NOT NULL DEFAULT '',
    service_interne TEXT NOT NULL DEFAULT '',
    date_reception TEXT NOT NULL DEFAULT '2026-01-01',
    statut TEXT NOT NULL DEFAULT 'Demande',
    priorite TEXT NOT NULL DEFAULT 'Normale'
);

CREATE TABLE interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT
);
"""


class G3ModuleTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(MINIMAL_DDL + G3_DDL)
        self.conn.execute(
            """
            INSERT INTO affaires_rst (reference, client, chantier, site, adresse_ouvrage)
            VALUES ('2026-RA-TEST', 'Client test', 'Chantier test', 'Site test', '1 rue Test')
            """
        )
        affaire_id = self.conn.execute("SELECT id FROM affaires_rst").fetchone()[0]
        self.conn.execute(
            """
            INSERT INTO demandes (
                reference, annee, labo_code, numero, affaire_rst_id,
                type_mission, nature, description, date_reception, statut, priorite
            ) VALUES ('2026-SP-9999', 2026, 'SP', 9999, ?, 'Exploitation G3', 'G3 EXE', 'Mission test', '2026-01-01', 'Demande', 'Normale')
            """,
            (affaire_id,),
        )
        self.conn.commit()
        self.db_path = None
        self.repo = G3Repository.__new__(G3Repository)
        self.repo.db_path = None
        self.repo._connect = lambda: self.conn

    def test_programme_default_template_is_generic(self):
        labels = " ".join(item["type"] for item in G3_PROGRAMME_DEFAULT_TEMPLATE)
        self.assertNotIn("Riom", labels)
        self.assertEqual(len(G3_PROGRAMME_DEFAULT_TEMPLATE), 10)

    def test_build_g3002_html_from_mission(self):
        mission = G3MissionResponseSchema(
            id=1,
            reference="2026-RA-TEST-G3",
            affaire_rst_id=1,
            demande_id=1,
            affaire_ref="2026-RA-TEST",
            demande_ref="2026-SP-9999",
            title="Mission test",
            chantier="Chantier test",
            main_objective="Objectif test",
            planned_interventions=[
                G3InterventionSchema(id=1, number="01", type="Visite initiale chantier", objective="Visite"),
            ],
        )
        html = build_g3002_html(mission)
        self.assertIn("Programme des reconnaissances G3", html)
        self.assertIn("Visite initiale chantier", html)
        self.assertNotIn("Riom", html)

    def test_create_mission_and_default_programme(self):
        mission = self.repo.create_mission(G3MissionCreateSchema(demande_id=1))
        self.assertRegex(mission.reference, r"-D\d{4}-G\d{4}$")
        rows = self.repo.create_default_programme(mission.id)
        self.assertEqual(len(rows), 10)
        reloaded = self.repo.get_mission(mission.id)
        self.assertEqual(len(reloaded.planned_interventions), 10)

    def test_promote_planned_to_realized(self):
        mission = self.repo.create_mission(G3MissionCreateSchema(demande_id=1))
        planned = self.repo.create_default_programme(mission.id)[0]
        realized = self.repo.promote_to_realized(planned.id)
        self.assertEqual(realized.phase, "realized")
        updated_planned = self.repo._get_intervention(planned.id)
        self.assertEqual(updated_planned.status, "Réalisé")

    def test_zones_documents_objectives(self):
        mission = self.repo.create_mission(G3MissionCreateSchema(demande_id=1))
        zone = self.repo.create_zone(mission.id, {"name": "Plateforme A", "type": "Plateforme"})
        doc = self.repo.create_document(mission.id, {
            "type": "CCTP", "name": "CCTP lot 1", "received": True, "zone_id": zone.id,
        })
        objectives = self.repo.create_default_objectives(mission.id)
        reloaded = self.repo.get_mission(mission.id)
        self.assertEqual(len(reloaded.zones), 1)
        self.assertEqual(reloaded.zones[0].name, "Plateforme A")
        self.assertEqual(len(reloaded.documents), 1)
        self.assertEqual(reloaded.documents[0].name, "CCTP lot 1")
        self.assertTrue(reloaded.documents[0].received)
        self.assertEqual(len(reloaded.objectives), len(objectives))
        self.assertGreater(len(reloaded.objectives), 0)

    def test_realized_interventions_tests_photos(self):
        mission = self.repo.create_mission(G3MissionCreateSchema(demande_id=1))
        zone = self.repo.create_zone(mission.id, {"name": "Plateforme A", "type": "Plateforme"})
        planned = self.repo.create_default_programme(mission.id)[0]
        realized = self.repo.promote_to_realized(planned.id)
        direct = self.repo.create_realized_intervention(mission.id, {
            "type": "Essai EV2",
            "zone_id": zone.id,
            "objective": "Contrôle portance",
        })
        test = self.repo.create_test(mission.id, {
            "type": "EV2",
            "label": "EV2 zone A",
            "zone_id": zone.id,
            "intervention_id": realized.id,
            "conformity": "Conforme",
        })
        photo = self.repo.create_photo(mission.id, {
            "caption": "Vue générale",
            "stored_path": "Documents/test/photo.jpg",
            "zone_id": zone.id,
            "use_in_report": True,
        })
        reloaded = self.repo.get_mission(mission.id)
        self.assertEqual(len(reloaded.realized_interventions), 2)
        self.assertEqual(reloaded.realized_interventions[0].phase, "realized")
        self.assertEqual(direct.type, "Essai EV2")
        self.assertEqual(len(reloaded.tests), 1)
        self.assertEqual(reloaded.tests[0].id, test.id)
        self.assertEqual(reloaded.tests[0].conformity, "Conforme")
        self.assertEqual(len(reloaded.photos), 1)
        self.assertEqual(reloaded.photos[0].caption, "Vue générale")
        self.assertTrue(reloaded.photos[0].use_in_report)

    def test_notices_hold_points_planning(self):
        mission = self.repo.create_mission(G3MissionCreateSchema(demande_id=1))
        zone = self.repo.create_zone(mission.id, {"name": "Plateforme A", "type": "Plateforme"})
        notice = self.repo.create_notice(mission.id, {
            "type": "Avis plateforme",
            "reference": "AV-001",
            "title": "Avis plateforme A",
            "zone_id": zone.id,
            "status": "Brouillon",
        })
        hold_points = self.repo.create_default_hold_points(mission.id)
        reloaded = self.repo.get_mission(mission.id)
        self.assertEqual(len(reloaded.notices), 1)
        self.assertEqual(reloaded.notices[0].reference, "AV-001")
        self.assertEqual(len(reloaded.hold_points), len(hold_points))
        self.assertGreater(len(reloaded.hold_points), 0)
        self.assertTrue(reloaded.hold_points[0].requires_tests)

        from app.services.g3_notice_service import build_notice_draft
        from app.services.g3_planning_service import build_g3_planning_overview

        draft = build_notice_draft(reloaded, notice_type="Avis plateforme", zone_id=zone.id)
        self.assertIn(reloaded.reference, draft.formulation)
        overview = build_g3_planning_overview(reloaded)
        self.assertGreaterEqual(len(overview.items), 1)

    def test_deliverables_and_g3008(self):
        from app.services.g3_deliverable_service import build_deliverable_html, build_g3008_html, deliverable_type_code

        mission = self.repo.create_mission(G3MissionCreateSchema(demande_id=1))
        deliverables = self.repo.create_default_deliverables(mission.id)
        self.assertEqual(len(deliverables), 8)
        self.assertEqual(deliverable_type_code(deliverables[0].type), "G3001")

        reloaded = self.repo.get_mission(mission.id)
        html_g3001 = build_deliverable_html(reloaded, "G3001 Note de cadrage G3")
        html_g3008 = build_g3008_html(reloaded)
        self.assertIn("G3001", html_g3001)
        self.assertIn("G3008", html_g3008)
        self.assertNotIn("Riom", html_g3008)


if __name__ == "__main__":
    unittest.main()

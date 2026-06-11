"""
tests/test_passation_delta_service.py
Unit tests for passation delta service rules and safeguards.
"""
from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.services.passation_delta_service import (
    build_agency_proposal,
    build_demande_signature,
    build_readiness_blocks,
    infer_modules,
    is_protected_a432,
)


class PassationDeltaServiceTests(unittest.TestCase):
    def _base_passation(self, **kwargs):
        payload = {
            "affaire_ref": "2026-RA-001",
            "numero_affaire_nge": "NGE-001",
            "chantier": "Chantier pilote",
            "affaire_rst_id": 1,
            "synthese": "Synthèse OK",
            "workflow_decision": "À décider",
            "startup_items": [
                SimpleNamespace(item_code="CCTP_STRUCTURE", status="Confirmé"),
                SimpleNamespace(item_code="CONTROL_PLAN", status="Confirmé"),
                SimpleNamespace(item_code="INITIAL_VISIT", status="Confirmé"),
            ],
            "role_assignments": [
                SimpleNamespace(role_code="INTERVENTION_PLANNER", assignment_status="Confirmé"),
                SimpleNamespace(role_code="TECHNICIAN_ASSIGNER", assignment_status="Confirmé"),
            ],
            "demande_preparation_items": [],
            "besoins_terrain": "",
            "besoins_laboratoire": "",
            "besoins_etude": "",
            "besoins_g3": "",
            "besoins_essais_externes": "",
            "notes": "",
        }
        payload.update(kwargs)
        return SimpleNamespace(**payload)

    def test_auvergne_proposal_contains_christelle(self):
        proposal = build_agency_proposal("Agence Auvergne")
        assignees = [item.get("assignee") for item in proposal["roles"]]
        self.assertIn("Christelle", assignees)

    def test_a432_protection_detection(self):
        row = self._base_passation(affaire_ref="2026-A432")
        self.assertTrue(is_protected_a432(row))

    def test_readiness_blocks_on_a432_cancellation(self):
        row = self._base_passation(affaire_ref="A432 chantier", workflow_decision="Annuler")
        blocks = build_readiness_blocks(row)
        self.assertTrue(any("Protection A432" in item for item in blocks))

    def test_infer_modules_prefers_explicit_required_modules(self):
        row = self._base_passation(
            demande_preparation_items=[
                SimpleNamespace(module_code="interventions", is_required=True),
                SimpleNamespace(module_code="documents", is_required=False),
            ],
            besoins_terrain="terrain",
        )
        modules = infer_modules(row)
        self.assertEqual(modules, ["interventions"])

    def test_demande_signature_is_idempotent(self):
        sig_a = build_demande_signature(10, 99, "interventions", "Nature", "Description")
        sig_b = build_demande_signature(10, 99, "interventions", "Nature", "Description")
        self.assertEqual(sig_a, sig_b)


if __name__ == "__main__":
    unittest.main()

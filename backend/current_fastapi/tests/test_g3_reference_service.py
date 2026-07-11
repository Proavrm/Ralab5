"""Tests des références mission G3."""

from __future__ import annotations

import unittest

from app.services.g3_reference_service import (
    build_g3_mission_reference_stem,
    g3_mission_reference_prefix,
    parse_g3_mission_sequence,
)


class G3ReferenceServiceTests(unittest.TestCase):
    def test_build_stem_without_labo(self):
        self.assertEqual(
            build_g3_mission_reference_stem(affaire_ref="2025-RA-008", demande_numero=54),
            "2025-RA-008-D0054",
        )
        self.assertEqual(
            g3_mission_reference_prefix(affaire_ref="2025-RA-008", demande_numero=54),
            "2025-RA-008-D0054-G",
        )

    def test_parse_sequences_across_formats(self):
        affaire = "2025-RA-008"
        self.assertEqual(
            parse_g3_mission_sequence("2025-RA-008-D0054-G0002", affaire_ref=affaire),
            2,
        )
        self.assertEqual(
            parse_g3_mission_sequence("2025-RA-008-RST-G0004", affaire_ref=affaire),
            4,
        )
        self.assertEqual(
            parse_g3_mission_sequence("2025-RA-008-G3-03", affaire_ref=affaire),
            3,
        )


if __name__ == "__main__":
    unittest.main()

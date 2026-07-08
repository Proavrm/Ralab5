import sqlite3
import unittest

from app.services.prelevement_reference_service import (
    canonicalize_prelevement_reference,
    next_prelevement_reference,
    prelevement_reference_prefix,
)


class PrelevementReferenceServiceTests(unittest.TestCase):
    def test_prelevement_reference_prefix(self):
        self.assertEqual(prelevement_reference_prefix(year=2026, labo_code="sp"), "2026-SP-PRL")

    def test_canonicalize_legacy_reference(self):
        self.assertEqual(canonicalize_prelevement_reference("2026-RST-P0005"), "2026-RST-PRL0005")
        self.assertIsNone(canonicalize_prelevement_reference("2026-SP-PRL0001"))
        self.assertIsNone(canonicalize_prelevement_reference("2025-RA-PRL0012"))

    def test_next_prelevement_reference_uses_demande_labo_code(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript(
            """
            CREATE TABLE demandes (
                id INTEGER PRIMARY KEY,
                reference TEXT,
                annee INTEGER,
                labo_code TEXT
            );
            CREATE TABLE prelevements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT NOT NULL
            );
            """
        )
        conn.execute(
            "INSERT INTO demandes (id, reference, annee, labo_code) VALUES (9001, '2026-SP-D0048', 2026, 'RST')"
        )
        conn.execute(
            "INSERT INTO demandes (id, reference, annee, labo_code) VALUES (9002, '2026-SP-D0052', 2026, 'SP')"
        )
        conn.commit()
        self.assertEqual(next_prelevement_reference(conn, demande_id=9001), "2026-RST-PRL0001")
        conn.execute("INSERT INTO prelevements (reference) VALUES ('2026-RST-PRL0001')")
        conn.commit()
        self.assertEqual(next_prelevement_reference(conn, demande_id=9002), "2026-SP-PRL0002")

    def test_global_year_sequence_across_labo_prefixes(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript(
            """
            CREATE TABLE demandes (
                id INTEGER PRIMARY KEY,
                reference TEXT,
                annee INTEGER,
                labo_code TEXT
            );
            CREATE TABLE prelevements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT NOT NULL
            );
            """
        )
        for ref in (
            "2026-RST-PRL0001",
            "2026-RST-PRL0002",
            "2026-RST-PRL0003",
            "2026-RST-PRL0004",
            "2026-RST-PRL0005",
        ):
            conn.execute("INSERT INTO prelevements (reference) VALUES (?)", (ref,))
        conn.execute(
            "INSERT INTO demandes (id, reference, annee, labo_code) VALUES (421, '2026-SP-D0052', 2026, 'SP')"
        )
        conn.commit()
        self.assertEqual(next_prelevement_reference(conn, demande_id=421), "2026-SP-PRL0006")
        conn.execute("INSERT INTO prelevements (reference) VALUES ('2026-SP-PRL0006')")
        conn.commit()
        self.assertEqual(next_prelevement_reference(conn, demande_id=421), "2026-SP-PRL0007")

    def test_next_prelevement_reference_counts_legacy_and_prl(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.executescript(
            """
            CREATE TABLE demandes (
                id INTEGER PRIMARY KEY,
                reference TEXT,
                annee INTEGER,
                labo_code TEXT
            );
            CREATE TABLE prelevements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT NOT NULL
            );
            """
        )
        conn.execute(
            "INSERT INTO demandes (id, reference, annee, labo_code) VALUES (9001, '2026-SP-DTEST', 2026, 'RST')"
        )
        conn.execute("INSERT INTO prelevements (reference) VALUES ('2026-RST-P0003')")
        conn.execute("INSERT INTO prelevements (reference) VALUES ('2026-RST-PRL0004')")
        conn.execute("INSERT INTO prelevements (reference) VALUES ('2026-SP-PRL0002')")
        conn.commit()

        self.assertEqual(next_prelevement_reference(conn, demande_id=9001), "2026-RST-PRL0005")


if __name__ == "__main__":
    unittest.main()

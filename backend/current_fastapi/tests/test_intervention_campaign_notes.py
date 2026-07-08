"""Notes techniques: scope demande vs campagne."""
from __future__ import annotations

import sqlite3

from app.services.intervention_campaign_service import (
    list_campaigns_for_demande,
    list_demande_scope_notes_techniques,
)


def test_demande_scope_note_not_duplicated_in_campaigns(tmp_path, monkeypatch):
    db_path = tmp_path / "notes_scope.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE demandes (
            id INTEGER PRIMARY KEY, reference TEXT, annee INTEGER, labo_code TEXT
        );
        CREATE TABLE campagnes (
            id INTEGER PRIMARY KEY, demande_id INTEGER, reference TEXT, label TEXT,
            type_campagne TEXT, code TEXT, designation TEXT, zone_scope TEXT,
            temporalite TEXT, programme_specifique TEXT, nb_points_prevus TEXT,
            types_essais_prevus TEXT, date_debut_prevue TEXT, date_fin_prevue TEXT,
            priorite TEXT, responsable_technique TEXT, attribue_a TEXT,
            criteres_controle TEXT, livrables_attendus TEXT, zone_type TEXT,
            comparison_group TEXT, pk_debut TEXT, pk_fin TEXT, voie TEXT, sens TEXT,
            cote TEXT, planche TEXT, longueur_ml TEXT, zone_transition TEXT,
            responsable_innovation TEXT, responsable_travaux TEXT,
            responsable_controle TEXT, responsable_suivi TEXT, notes TEXT,
            statut TEXT, workflow_label TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE interventions (
            id INTEGER PRIMARY KEY, reference TEXT, demande_id INTEGER, campagne_id INTEGER,
            type_intervention TEXT, nature_reelle TEXT, sujet TEXT, statut TEXT,
            date_intervention TEXT, date_fin TEXT, date_envoi TEXT,
            technicien TEXT, geotechnicien TEXT
        );
        INSERT INTO demandes (id, reference, annee, labo_code) VALUES (1, '2026-SP-D0001', 2026, 'SP');
        INSERT INTO campagnes (
            id, demande_id, reference, label, type_campagne, code, designation,
            zone_scope, temporalite, programme_specifique, nb_points_prevus,
            types_essais_prevus, date_debut_prevue, date_fin_prevue, priorite,
            responsable_technique, attribue_a, criteres_controle, livrables_attendus,
            zone_type, comparison_group, pk_debut, pk_fin, voie, sens, cote, planche,
            longueur_ml, zone_transition, responsable_innovation, responsable_travaux,
            responsable_controle, responsable_suivi, notes, statut, workflow_label,
            created_at, updated_at
        ) VALUES (
            10, 1, '2026-SP-C001', 'Diagnostic', 'DIAG', 'DIAG', 'Diag',
            '', '', '', '', '', '', '', 'Normale', '', '', '', '', '', '', '', '', '',
            '', '', '', '', '', '', '', '', '', '', 'A cadrer', '', '', ''
        );
        INSERT INTO interventions (
            id, reference, demande_id, campagne_id, type_intervention, nature_reelle,
            sujet, statut, date_intervention
        ) VALUES
            (100, '2026-RA-NT0001', 1, NULL, 'Note technique', 'Note technique', 'NT demande', 'Planifiée', '2026-06-15'),
            (101, '2026-SP-INT0001', 1, 10, 'Visite chantier', 'Intervention', 'Visite', 'Planifiée', '2026-06-16');
        """
    )
    conn.commit()
    conn.close()

    monkeypatch.setenv("RALAB4_DB_PATH", str(db_path))

    notes = list_demande_scope_notes_techniques(1)
    campaigns = list_campaigns_for_demande(1)

    assert len(notes) == 1
    assert notes[0]["reference"] == "2026-RA-NT0001"
    assert notes[0]["is_demande_scope"] is True

    assert len(campaigns) == 1
    campaign_intervention_refs = [item["reference"] for item in campaigns[0]["interventions"]]
    assert campaign_intervention_refs == ["2026-SP-INT0001"]

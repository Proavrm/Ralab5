# -*- coding: utf-8 -*-
import shutil
import sqlite3
import tempfile
from pathlib import Path
import openpyxl

import api.import_essais_de as de
from app.core.database import get_db_path

source_db = Path(get_db_path())
workbook_path = Path(r"c:\Users\marco\OneDrive\Área de Trabalho\Logiciels labo marco\RaLab5\storage\documents\RA L1EC - Enrobés\Enrobés\Densités - PPI Réseaux vélo express.xlsx")

with tempfile.TemporaryDirectory() as tmp_dir:
    temp_db = Path(tmp_dir) / "ralab3_test.db"
    shutil.copy2(source_db, temp_db)
    de.DB_PATH = temp_db

    workbook1 = openpyxl.load_workbook(workbook_path, data_only=True, read_only=True)
    result1 = de._materialize_sheet_import(
        workbook=workbook1,
        file_name="Densités - PPI Réseaux vélo express TEST.xlsx",
        file_hash="de-test-same-date",
        sheet_name="120722",
        affaire_reference="",
        affaire_nge="",
        demande_gap_days=120,
        campagne_gap_days=7,
    )
    workbook1.close()

    workbook2 = openpyxl.load_workbook(workbook_path, data_only=True, read_only=True)
    result2 = de._materialize_sheet_import(
        workbook=workbook2,
        file_name="Densités - PPI Réseaux vélo express TEST.xlsx",
        file_hash="de-test-same-date",
        sheet_name="120722 (2)",
        affaire_reference="",
        affaire_nge="",
        demande_gap_days=120,
        campagne_gap_days=7,
    )
    workbook2.close()

    conn = sqlite3.connect(temp_db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, reference, date_intervention FROM interventions WHERE id IN (?, ?) ORDER BY id",
        (result1['ids']['intervention_id'], result2['ids']['intervention_id'])
    ).fetchall()
    print({
        'first_intervention_id': result1['ids']['intervention_id'],
        'second_intervention_id': result2['ids']['intervention_id'],
        'same_intervention': result1['ids']['intervention_id'] == result2['ids']['intervention_id'],
        'created_flags': [result1['created']['intervention'], result2['created']['intervention']],
        'rows': [dict(r) for r in rows],
    })

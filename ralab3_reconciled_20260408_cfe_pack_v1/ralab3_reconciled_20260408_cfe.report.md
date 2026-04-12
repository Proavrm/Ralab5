# Rebuilt Reconciliation Report

- Source DB: C:\Users\marco\OneDrive\Área de Trabalho\Logiciels labo marco\RaLab5\backend\current_fastapi\data\ralab3.db
- Rebuilt DB: C:\Users\marco\OneDrive\Área de Trabalho\Logiciels labo marco\RaLab5\backend\current_fastapi\data\ralab_rebuilt_2025_2026_v1.db
- Output DB: C:\Users\marco\OneDrive\Área de Trabalho\Logiciels labo marco\RaLab5\backend\current_fastapi\data\ralab3_reconciled_20260408_cfe.db

## Applied
- Inserted interventions_reelles: 547
- Inserted prelevements: 529
- Updated interventions: 877
- Backfilled intervention nature_reelle: 877
- Backfilled intervention -> prelevement links: 382
- Backfilled intervention -> intervention_reelle links: 877
- Backfilled essai_code from observations: 276
- Backfilled essai_code from rebuilt match: 0
- Backfilled essai_code from type fallback: 0
- Split IPI - PR -> PN: 2
- Inserted IPI siblings from split: 2
- Materialized CFE échantillons: 136
- Inserted GR siblings from CFE: 36
- Inserted EL siblings from CFE: 142
- Inserted CFE pages: 136
- Remaining blank essai_code rows: 0

## Forms Missing

| Code | Label | Count | UI status | Types |
| --- | --- | ---: | --- | --- |
| none | none | 0 | n/a | n/a |

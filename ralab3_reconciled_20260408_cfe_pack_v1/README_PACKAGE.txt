RaLab reconciled package
========================

Purpose
- share the latest reconciled historical snapshot used by the app
- include the generated reconciliation reports beside the packaged SQLite DB
- keep Excel-friendly review exports for prelevements / interventions_reelles / review items

Files included
- ralab3_reconciled_20260408_cfe.db: reconciled SQLite snapshot
- prelevements.csv: full export of the prelevements table
- interventions_reelles.csv: full export of the interventions_reelles table
- review_required_items.csv: raw interventions and generated interventions_reelles flagged for manual review
- SUMMARY_RECONCILED.txt: packaged count summary for the reconciled snapshot
- ralab3_reconciled_20260408_cfe.report.json: reconciliation sidecar copied next to the SQLite DB
- ralab3_reconciled_20260408_cfe.report.md: reconciliation sidecar copied next to the SQLite DB

How to use this DB in RaLab5 from this repository
1. Extract the zip anywhere.
2. In PowerShell, point RaLab5 to the extracted DB:
   $env:RALAB4_DB_PATH = "C:\path\to\ralab3_reconciled_20260408_cfe_pack_v1\ralab3_reconciled_20260408_cfe.db"
3. Start the app with launch_ralab5_test.cmd from the repository root.

Notes
- CSV files use ';' as separator for Excel-friendly opening on Windows.
- review_required_items.csv reflects the review flags kept in the reconciled DB; the sidecar reports explain the reconciliation decisions.

# Index des outils CLI

Scripts dans `backend/current_fastapi/tools/`. Exécution typique :

```bash
cd backend/current_fastapi
python tools/<script>.py [--help]
```

> Les scripts marqués **manual guard** simulent une saisie utilisateur via écriture directe en BD.
> Ils sont bloqués par défaut (`_manual_entry_guard.py`) — usage uniquement sur demande explicite.

---

## Initialisation et schéma

| Script | Description |
|---|---|
| `init_ralab5_db.py` | Initialise le schéma bootstrap RaLab5 |
| `init_ralab4_db.py` | Alias legacy → `init_ralab5_db.py` |
| `init_security_db.py` | Crée `security.db` (rôles, permissions, utilisateurs) |
| `migrate_to_ralab3.py` | Migration legacy vers RaLab3 |
| `migrate_to_ralab4.py` | Migration legacy vers RaLab4 |
| `migrate_g3_mission_references.py` | Renomme refs G3 → `{affaire_ref}-D{numero}-G{NNNN}` |
| `migrate_prelevement_references_prl.py` | Migre refs prélèvement `-P0001` → `-PRL0001` |

---

## Sécurité et admin

| Script | Description |
|---|---|
| `admin_users.py` | GUI PySide6 gestion utilisateurs (legacy desktop) |
| `import_competency_catalog.py` | Import catalogue compétences depuis Excel |
| `apply_competency_rst_codes.py` | Applique codes RST opérationnels au catalogue |
| `fix_competency_catalog_labels.py` | Corrige labels/domaines PREP/PREL/GR |

---

## Import historique labo

| Script | Description |
|---|---|
| `import_historical_labo_folder.py` | Import Excel labo one-shot (v1) |
| `import_historical_labo_folder_v2.py` | Import Excel labo groupé (v2) |
| `audit_historical_reimport_perimeter.py` | Audit périmètre purge avant réimport |
| `purge_historical_reimport_scope.py` | Purge données import historique legacy |
| `reconcile_rebuilt_lab_history.py` | Copie nettoyée DB après réconciliation historique |
| `run_demandes_legacy_importer.py` | Import demandes legacy RaLab2 |

---

## Import terrain (DE, SC, photos)

| Script | Description |
|---|---|
| `reimport_de_existing_essais.py` | Réimporte essais DE depuis Excel source |
| `repair_de_imported_interventions.py` | Répare doublons interventions DE importées |
| `normalize_de_point_codes.py` | Normalise `point_code` DE par intervention |
| `backfill_sc_photos.py` | Backfill/audit photos SC déjà importées |

---

## Hiérarchie temporelle (PMT/SC)

| Script | Description |
|---|---|
| `audit_hierarchy_temporal.py` | Audit hiérarchie vs règles temporelles |
| `apply_hierarchy_temporal_fixes.py` | Réaligne PMT/SC sans réimport Excel |
| `cleanup_orphan_import_shell_demandes.py` | Supprime demandes « shell » sans données terrain |
| `recompute_demande_aggregate_labels.py` | Recalcule `demandes.nature` depuis DE/PMT/SC |

---

## QSSE

| Script | Description |
|---|---|
| `import_qsse_workbooks.py` | Import snapshot QSSE |
| `import_qsse_rex_codir_excel.py` | Import CODIR REX depuis Excel |
| `reimport_qsse_live_safe.py` | Preview/réimport QSSE 2026 sans toucher le reste |
| `reset_qsse_independent_db.py` | Reset QSSE + DB QSSE indépendante vide |

---

## Affaires, DST, référentiels

| Script | Description |
|---|---|
| `reconcile_affaires_titulaires_from_nge.py` | Réconcilie titulaires affaires depuis NGE |
| `repair_dst_demandeur_names.py` | Répare noms demandeur DST |

---

## Seeds et démos (**manual guard**)

| Script | Description |
|---|---|
| `seed_g3_demo_riom.py` | Mission G3 démo (Riom) |
| `seed_comparative_workflow.py` | Workflow préparation → campagnes → interventions |
| `seed_rarx_manual_workflow.py` | Flux passation → demande → préparation complet |
| `seed_note_technique_d421.py` | Note technique demande 421 |
| `fill_campagne_c001_manual.py` | Campagne C001 (DIAG-CH) |
| `fill_campagnes_temoin_rarx_manual.py` | Campagnes TEMOIN (C002) + RARX (C003) |
| `fill_campagne_suivi_cirr_manual.py` | Campagne SUIVI-CIRR (C004) |

---

## Simulation passation (**manual guard**)

| Script | Description |
|---|---|
| `simulate_generate_demande_manual.py` | Simule « Générer demande » depuis passation |
| `simulate_passation_docs_manual.py` | Section C : documents |
| `simulate_passation_section_e_manual.py` | Section E : prestations |
| `simulate_passation_section_f_manual.py` | Section F : actions |

---

## Utilitaire interne

| Script | Description |
|---|---|
| `_manual_entry_guard.py` | Garde-fou scripts saisie manual (ne pas exécuter directement) |

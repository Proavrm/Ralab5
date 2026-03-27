"""
tools/migrate_to_ralab4.py
─────────────────────────────────────────────────────────────────────────────
Migration propre : demandes.db → ralab3.db

Schema final :
  affaires_rst  → données administratives (client, titulaire, chantier…)
  demandes      → données techniques (DST, nature, labo, description…)

Usage :
    python tools/migrate_to_ralab4.py
    python tools/migrate_to_ralab4.py --dry-run
    python tools/migrate_to_ralab4.py --reset
"""
from __future__ import annotations
import argparse, sqlite3, sys
from datetime import datetime
from pathlib import Path

ROOT    = Path(__file__).resolve().parents[1]
SRC_DB  = ROOT / "data" / "demandes.db"
DEST_DB = ROOT / "data" / "ralab3.db"

DDL = """
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS laboratoires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'RA',
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affaires_rst (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    reference       TEXT NOT NULL UNIQUE,
    annee           INTEGER NOT NULL DEFAULT 2026,
    region          TEXT NOT NULL DEFAULT 'RA',
    numero          INTEGER NOT NULL DEFAULT 0,
    client          TEXT NOT NULL DEFAULT '',
    titulaire       TEXT NOT NULL DEFAULT '',
    chantier        TEXT NOT NULL DEFAULT '',
    affaire_nge     TEXT NOT NULL DEFAULT '',
    date_ouverture  TEXT NOT NULL,
    date_cloture    TEXT,
    statut          TEXT NOT NULL DEFAULT 'À qualifier',
    responsable     TEXT NOT NULL DEFAULT '',
    source_legacy_id INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demandes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    reference           TEXT NOT NULL UNIQUE,
    annee               INTEGER NOT NULL DEFAULT 2026,
    labo_code           TEXT NOT NULL DEFAULT 'SP',
    numero              INTEGER NOT NULL DEFAULT 0,
    affaire_rst_id      INTEGER NOT NULL REFERENCES affaires_rst(id) ON DELETE RESTRICT,
    numero_dst          TEXT NOT NULL DEFAULT '',
    type_mission        TEXT NOT NULL DEFAULT 'À définir',
    nature              TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL DEFAULT '',
    observations        TEXT NOT NULL DEFAULT '',
    demandeur           TEXT NOT NULL DEFAULT '',
    date_reception      TEXT NOT NULL,
    date_echeance       TEXT,
    date_cloture        TEXT,
    statut              TEXT NOT NULL DEFAULT 'À qualifier',
    priorite            TEXT NOT NULL DEFAULT 'Normale',
    a_revoir            INTEGER NOT NULL DEFAULT 0,
    note_reconciliation TEXT NOT NULL DEFAULT '',
    suivi_notes         TEXT NOT NULL DEFAULT '',
    dossier_nom         TEXT NOT NULL DEFAULT '',
    dossier_path        TEXT NOT NULL DEFAULT '',
    rapport_ref         TEXT NOT NULL DEFAULT '',
    rapport_envoye      INTEGER NOT NULL DEFAULT 0,
    date_envoi_rapport  TEXT,
    devis_ref           TEXT NOT NULL DEFAULT '',
    facture_ref         TEXT NOT NULL DEFAULT '',
    source_legacy_id    INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS echantillons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    annee INTEGER NOT NULL DEFAULT 2026,
    labo_code TEXT NOT NULL DEFAULT 'SP',
    numero INTEGER NOT NULL DEFAULT 0,
    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE RESTRICT,
    designation TEXT NOT NULL DEFAULT '',
    profondeur_haut REAL,
    profondeur_bas REAL,
    date_prelevement TEXT,
    localisation TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'Reçu',
    date_reception_labo TEXT,
    observations TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS essais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    echantillon_id INTEGER NOT NULL REFERENCES echantillons(id) ON DELETE RESTRICT,
    type_essai TEXT NOT NULL DEFAULT '',
    norme TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'Programmé',
    date_debut TEXT, date_fin TEXT,
    resultats TEXT NOT NULL DEFAULT '{}',
    operateur TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    annee INTEGER NOT NULL DEFAULT 2026,
    labo_code TEXT NOT NULL DEFAULT 'SP',
    numero INTEGER NOT NULL DEFAULT 0,
    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE RESTRICT,
    type_intervention TEXT NOT NULL DEFAULT '',
    sujet TEXT NOT NULL DEFAULT '',
    date_intervention TEXT NOT NULL,
    duree_heures REAL,
    geotechnicien TEXT NOT NULL DEFAULT '',
    technicien TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    anomalie_detectee INTEGER NOT NULL DEFAULT 0,
    niveau_alerte TEXT NOT NULL DEFAULT 'Aucun',
    pv_ref TEXT NOT NULL DEFAULT '',
    rapport_ref TEXT NOT NULL DEFAULT '',
    photos_dossier TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'Planifiée',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_affaires_ref    ON affaires_rst(reference);
CREATE INDEX IF NOT EXISTS idx_affaires_statut ON affaires_rst(statut);
CREATE INDEX IF NOT EXISTS idx_dem_affaire     ON demandes(affaire_rst_id);
CREATE INDEX IF NOT EXISTS idx_dem_statut      ON demandes(statut);
CREATE INDEX IF NOT EXISTS idx_dem_dst         ON demandes(numero_dst);

CREATE VIEW IF NOT EXISTS v_affaires_synthese AS
SELECT a.id, a.reference, a.client, a.titulaire, a.chantier, a.affaire_nge,
    a.statut, a.date_ouverture, a.date_cloture, a.responsable,
    COUNT(d.id) AS nb_demandes,
    COUNT(CASE WHEN d.statut NOT IN ('Fini','Archivée','Envoyé - Perdu') THEN 1 END) AS nb_demandes_actives
FROM affaires_rst a LEFT JOIN demandes d ON d.affaire_rst_id = a.id
GROUP BY a.id;

CREATE VIEW IF NOT EXISTS v_demandes_synthese AS
SELECT d.id, d.reference, d.affaire_rst_id,
    a.reference AS affaire_ref, a.client, a.chantier, a.affaire_nge,
    d.numero_dst, d.type_mission, d.nature, d.statut, d.priorite,
    d.demandeur, d.date_reception, d.date_echeance, d.labo_code,
    d.a_revoir, d.dossier_nom,
    COUNT(DISTINCT e.id) AS nb_echantillons,
    COUNT(DISTINCT i.id) AS nb_interventions
FROM demandes d
JOIN affaires_rst a ON a.id = d.affaire_rst_id
LEFT JOIN echantillons e ON e.demande_id = d.id
LEFT JOIN interventions i ON i.demande_id = d.id
GROUP BY d.id;
"""

LABOS = [("SP","Saint-Priest","RA"),("PDC","Pont-du-Château","RA"),("CHB","Chambéry","RA"),("CLM","Clermont","AUV")]

STATUT_AFF = {
    "À qualifier":"À qualifier","Demande":"À qualifier",
    "En Cours":"En cours","Répondu":"En cours",
    "Fini":"Terminée","Envoyé - Perdu":"Terminée",
}

def _parse_ref(ref):
    p = ref.strip().split("-")
    try: return int(p[0]), p[1], int(p[2])
    except: return datetime.now().year,"RA",0

def migrate(dry_run=False, reset=False):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if not SRC_DB.exists():
        print(f"[ERREUR] {SRC_DB} introuvable"); sys.exit(1)

    src = sqlite3.connect(str(SRC_DB)); src.row_factory = sqlite3.Row
    rows = src.execute("SELECT * FROM demandes ORDER BY id").fetchall(); src.close()
    print(f"[INFO] {len(rows)} demandes à migrer depuis {SRC_DB.name}")

    if dry_run:
        for r in rows[:5]:
            ref = r["reference_base"] or "?"
            print(f"  → {ref} | {(r['titre'] or r['chantier'] or '?')[:50]}")
        print("  ... (dry-run, rien écrit)"); return

    DEST_DB.parent.mkdir(parents=True, exist_ok=True)
    if reset and DEST_DB.exists():
        DEST_DB.unlink(); print(f"[INFO] {DEST_DB.name} effacé")

    dst = sqlite3.connect(str(DEST_DB))
    dst.executescript(DDL)
    dst.execute("DELETE FROM demandes")
    dst.execute("DELETE FROM affaires_rst")
    dst.execute("DELETE FROM laboratoires")
    try: dst.execute("DELETE FROM sqlite_sequence WHERE name IN ('affaires_rst','demandes','laboratoires')")
    except: pass

    for code,nom,region in LABOS:
        dst.execute("INSERT OR IGNORE INTO laboratoires (code,nom,region) VALUES (?,?,?)",(code,nom,region))

    dem_counter = {}
    for r in rows:
        ref = r["reference_base"] or r["reference"] or f"2026-RA-{r['id']:04d}"
        if " - " in ref: ref = ref.split(" - ")[0].strip()
        annee, region, numero = _parse_ref(ref)
        statut_legacy = r["statut"] or "À qualifier"
        statut_aff = STATUT_AFF.get(statut_legacy, "À qualifier")

        existing = dst.execute("SELECT id FROM affaires_rst WHERE reference = ?", (ref,)).fetchone()
        if existing:
            aff_id = existing[0]
        else:
            dst.execute("""
                INSERT INTO affaires_rst
                (reference,annee,region,numero,client,titulaire,chantier,affaire_nge,
                 date_ouverture,date_cloture,statut,responsable,source_legacy_id,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                ref,annee,region,numero,
                r["client"] or "Non communiqué",
                "",  # titulaire vide — à remplir
                r["chantier"] or "Non communiqué",
                r["affaire"] or "",
                r["date_demande"] or now[:10],
                None, statut_aff,
                r["demandeur"] or "",
                r["source_legacy_id"],
                r["created_at"] or now, r["updated_at"] or now,
            ))
            aff_id = dst.execute("SELECT last_insert_rowid()").fetchone()[0]

        labo = "SP"
        dem_num = numero  # même numéro que l'affaire
        dem_ref = f"{annee}-{labo}-D{dem_num:04d}"

        dst.execute("""
            INSERT OR IGNORE INTO demandes
            (reference,annee,labo_code,numero,affaire_rst_id,
             numero_dst,type_mission,nature,description,observations,
             demandeur,date_reception,date_echeance,date_cloture,
             statut,priorite,a_revoir,note_reconciliation,
             dossier_nom,dossier_path,source_legacy_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            dem_ref,annee,labo,dem_num,aff_id,
            r["numero_dst"] or "","À définir",
            r["nature"] or "",r["description"] or "",r["observations"] or "",
            r["demandeur"] or "",
            r["date_demande"] or now[:10],
            r["echeance"] or None, None,
            statut_legacy, r["priorite"] or "Normale",
            1 if r["a_revoir"] else 0,
            r["note_reconciliation"] or "",
            r["dossier_nom_actuel"] or "",
            r["dossier_path_actuel"] or "",
            r["source_legacy_id"],
            r["created_at"] or now, r["updated_at"] or now,
        ))

    dst.commit()
    n_aff = dst.execute("SELECT COUNT(*) FROM affaires_rst").fetchone()[0]
    n_dem = dst.execute("SELECT COUNT(*) FROM demandes").fetchone()[0]
    dst.close()
    print(f"[OK] → {DEST_DB.name}: {n_aff} affaires | {n_dem} demandes")
    print("     champ 'titulaire' vide — à remplir dans l'interface")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--reset",   action="store_true")
    args = ap.parse_args()
    migrate(dry_run=args.dry_run, reset=args.reset)

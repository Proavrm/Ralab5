"""Create note technique for demande 421 — DESACTIVÉ par défaut.

Simule saisie manual via BD. Usage autorisé uniquement sur demande explicite:
  python tools/seed_note_technique_d421.py --allow-manual-mimic
"""
from __future__ import annotations

import re
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools._manual_entry_guard import require_manual_entry_authorization

if __name__ == "__main__":
    require_manual_entry_authorization("seed_note_technique_d421.py")

DB = ROOT / "data" / "ralab3.db"
DEMANDE_ID = 421
NOTE_TECHNIQUE_NATURE = "Note technique"


def demande_ref_context(conn: sqlite3.Connection, demande_id: int) -> tuple[int, str, str]:
    row = conn.execute(
        """
        SELECT d.annee, d.labo_code, a.region, a.reference AS affaire_reference
        FROM demandes d
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE d.id = ?
        """,
        (demande_id,),
    ).fetchone()
    annee = int(row["annee"]) if row and row["annee"] else datetime.now().year
    labo = str(row["labo_code"] or "SP").strip().upper() if row else "SP"
    region = str(row["region"] or "").strip().upper() if row else ""
    if not region and row and row["affaire_reference"]:
        match = re.match(r"^\d+-([A-Z0-9]+)-", str(row["affaire_reference"]))
        if match:
            region = match.group(1).upper()
    if not region:
        region = "RA"
    return annee, region, labo


def next_nt_ref(conn: sqlite3.Connection, demande_id: int) -> tuple[str, int, str, int]:
    annee, region, labo = demande_ref_context(conn, demande_id)
    prefix = f"{annee}-{region}-NT"
    rows = conn.execute("SELECT reference FROM interventions WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    nums = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", row[0])
        if match:
            nums.append(int(match.group(1)))
    number = max(nums, default=0) + 1
    return f"{prefix}{number:04d}", annee, labo, number


def interventions_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM demande_enabled_modules WHERE demande_id = ? AND module_code = 'interventions' AND is_enabled = 1 LIMIT 1",
        (demande_id,),
    ).fetchone()
    return row is not None


def main() -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    today = date.today().isoformat()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    try:
        if not interventions_enabled(conn, DEMANDE_ID):
            raise SystemExit(f"Interventions not enabled for demande {DEMANDE_ID}")

        existing = conn.execute(
            """
            SELECT id, reference FROM interventions
            WHERE demande_id = ?
              AND campagne_id IS NULL
              AND (
                LOWER(COALESCE(type_intervention, '')) LIKE '%note technique%'
                OR LOWER(COALESCE(nature_reelle, '')) LIKE '%note technique%'
              )
            LIMIT 1
            """,
            (DEMANDE_ID,),
        ).fetchone()
        if existing:
            print(f"Already exists: #{existing['id']} {existing['reference']}")
            return

        prep = conn.execute(
            "SELECT objectif_mission, responsable_referent, zone_localisation FROM demande_preparations WHERE demande_id = ?",
            (DEMANDE_ID,),
        ).fetchone()
        demande = conn.execute(
            """
            SELECT d.reference, d.nature, a.chantier, a.site
            FROM demandes d
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE d.id = ?
            """,
            (DEMANDE_ID,),
        ).fetchone()

        objectif = str(
            (prep["objectif_mission"] if prep else None)
            or (demande["nature"] if demande else None)
            or "",
        ).strip()
        zone = str(
            (prep["zone_localisation"] if prep else None)
            or (demande["chantier"] if demande else None)
            or (demande["site"] if demande else None)
            or "",
        ).strip()
        responsable = str(prep["responsable_referent"] or "").strip() if prep else ""
        sujet = f"Note technique — {objectif[:120]}" if objectif else "Note technique synthétique"
        finalite = objectif or "Cadrage méthodologique et présentation de la démarche"

        ref, annee, labo, numero = next_nt_ref(conn, DEMANDE_ID)
        conn.execute(
            """
            INSERT INTO interventions (
                reference, annee, labo_code, numero, demande_id, campagne_id,
                type_intervention, sujet, date_intervention, duree_heures,
                geotechnicien, technicien, observations, anomalie_detectee,
                niveau_alerte, pv_ref, rapport_ref, photos_dossier, statut,
                nature_reelle, finalite, zone, heure_debut, heure_fin,
                tri_updated_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ref, annee, labo, numero, DEMANDE_ID, None,
                "Note technique", sujet, today, None,
                responsable, responsable, "", 0,
                "Aucun", "", "", "", "Planifiée",
                NOTE_TECHNIQUE_NATURE, finalite, zone, "", "",
                now, now, now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()
        demande_ref = demande["reference"] if demande else ""
        print(f"Created note technique #{uid} {ref} for demande {DEMANDE_ID} ({demande_ref})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

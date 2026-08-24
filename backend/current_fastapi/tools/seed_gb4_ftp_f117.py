"""Seed FTP GB4 F117.30 SEC (E=14600, ε6=119) + aligne couches CAM 14000→14600."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.database import connect_db, ensure_ralab5_schema, get_db_path


FTP = {
    "document": "22DTL0330-02-GB4014-St-Jean-Combronde-AE30-N2-F117.30-new-ftae-1.pdf",
    "source_ref": "FTP F117.30 SEC / mémoire variante Lot 2",
    "famille": "bitumineux",
    "produit_ou_reference": "GB4 F117.30 SEC — St-Jean / Combronde AE30 (FTP)",
    "norme_source": "NF EN 13108-1 / NF EN 12697-26",
    "formule": "F117.30",
    "bitume": "35/50",
    "granulats": "SOPOULE St Jean + Combronde + AE30%",
    "TL_pct": 4.7,
    "module_E_MPa": 14600.0,
    "eps6_microdef": 119.0,
    "commentaire": (
        "FTP mesurée E=14636 MPa (retenu 14600) · ε6=119 µdéf · "
        "DoP 177-30147 · Mémoire technique variante Lot 2"
    ),
}


def main() -> None:
    db = get_db_path()
    ensure_ralab5_schema(db)
    with connect_db(db) as conn:
        # Harmoniser famille des fiches GB existantes
        conn.execute(
            """
            UPDATE ref_materiaux_labo
            SET famille = 'bitumineux'
            WHERE produit_ou_reference LIKE '%GB4%'
               OR formule LIKE '%F117%'
               OR document LIKE '%GB%'
            """
        )

        existing = conn.execute(
            """
            SELECT id FROM ref_materiaux_labo
            WHERE formule = 'F117.30'
               OR produit_ou_reference LIKE '%F117.30%'
               OR (module_E_MPa BETWEEN 14500 AND 14700 AND produit_ou_reference LIKE '%GB4%')
            """
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE ref_materiaux_labo SET
                    document = ?, source_ref = ?, famille = ?, produit_ou_reference = ?,
                    norme_source = ?, formule = ?, bitume = ?, granulats = ?,
                    TL_pct = ?, module_E_MPa = ?, eps6_microdef = ?, commentaire = ?
                WHERE id = ?
                """,
                (
                    FTP["document"],
                    FTP["source_ref"],
                    FTP["famille"],
                    FTP["produit_ou_reference"],
                    FTP["norme_source"],
                    FTP["formule"],
                    FTP["bitume"],
                    FTP["granulats"],
                    FTP["TL_pct"],
                    FTP["module_E_MPa"],
                    FTP["eps6_microdef"],
                    FTP["commentaire"],
                    int(existing["id"]),
                ),
            )
            print("updated ref_materiaux_labo id", existing["id"])
        else:
            cur = conn.execute(
                """
                INSERT INTO ref_materiaux_labo (
                    document, source_ref, famille, produit_ou_reference, norme_source,
                    formule, bitume, granulats, TL_pct, module_E_MPa, eps6_microdef, commentaire
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    FTP["document"],
                    FTP["source_ref"],
                    FTP["famille"],
                    FTP["produit_ou_reference"],
                    FTP["norme_source"],
                    FTP["formule"],
                    FTP["bitume"],
                    FTP["granulats"],
                    FTP["TL_pct"],
                    FTP["module_E_MPa"],
                    FTP["eps6_microdef"],
                    FTP["commentaire"],
                ),
            )
            print("inserted ref_materiaux_labo id", cur.lastrowid)

        # CAM / DURON : 14000 → 14600 (FTP réelle)
        cur = conn.execute(
            """
            UPDATE alize_layers
            SET module = 14600,
                modified_manually = 0,
                justification = CASE
                    WHEN justification IS NULL OR TRIM(justification) = ''
                        THEN 'FTP GB4 F117.30 SEC · E=14600 · ε6=119'
                    WHEN justification LIKE '%F117.30%' OR justification LIKE '%14600%'
                        THEN justification
                    ELSE justification || ' · FTP F117.30 E=14600'
                END
            WHERE UPPER(TRIM(materiau)) LIKE 'GB4%'
              AND module BETWEEN 13900 AND 14100
            """
        )
        print("alize_layers GB4 14000→14600 updated", cur.rowcount)
        conn.commit()

    # Smoke catalog
    from app.repositories.calculs_repository import CalculsRepository

    cats = CalculsRepository(db).alize_catalogs()
    gb = [m for m in cats["materials"] if "GB4" in str(m.get("code") or "").upper() or "GB4" in str(m.get("label") or "").upper()]
    print("catalog GB4 entries:")
    for m in gb:
        print(" ", m.get("source"), m.get("id"), m.get("code"), "E=", m.get("module"), "eps6=", m.get("eps6"))
    print("ftp_sources", len(cats.get("ftp_sources") or []))


if __name__ == "__main__":
    main()

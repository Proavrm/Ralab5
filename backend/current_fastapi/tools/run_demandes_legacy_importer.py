from pathlib import Path

from app.services.demandes_legacy_importer import DemandesLegacyImporter


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]

    importer = DemandesLegacyImporter(
        legacy_db_path=project_root / "data" / "demandes.db",
        demandes_root=project_root / "01 - Demandes",
    )

    report = importer.run()

    print()
    print(f"Base legacy                : {report.legacy_db_path}")
    print(f"Pasta demandes             : {report.demandes_root}")
    print(f"Total de demandes legacy   : {report.total_legacy_rows}")
    print(f"Matches exactos            : {report.exact_folder_matches}")
    print(f"Matches em falta           : {report.missing_folder_matches}")
    print(f"Matches ambiguos           : {report.ambiguous_folder_matches}")
    print(f"Dossiers orfãos            : {len(report.orphan_folders)}")
    print()

    for row in report.imported_rows:
        print("=" * 120)
        print(f"legacy_id              : {row.legacy_id}")
        print(f"numero_demande         : {row.numero_demande}")
        print(f"numero_demande_base    : {row.numero_demande_base}")
        print(f"numero_dst             : {row.numero_dst}")
        print(f"titre_demande          : {row.titre_demande}")
        print(f"ville                  : {row.ville}")
        print(f"departement            : {row.departement}")
        print(f"dossier_match_status   : {row.dossier_match_status}")
        print(f"dossier_selected       : {row.dossier_selected}")

        if row.dossier_candidates:
            print("dossier_candidates     :")
            for path in row.dossier_candidates:
                print(f"    {path}")
        else:
            print("dossier_candidates     : nenhum")

    print()
    print("DOSSIERS ORFÃOS")
    print("-" * 120)
    for folder in report.orphan_folders:
        print(folder)

    print()
    print("TESTE build_seed_payloads()")
    print("-" * 120)
    payloads = importer.build_seed_payloads()
    print(f"Total payloads: {len(payloads)}")
    if payloads:
        print("Primeiro payload:")
        for key, value in payloads[0].items():
            print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
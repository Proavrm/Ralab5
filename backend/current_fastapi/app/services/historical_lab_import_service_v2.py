"""Historical laboratory import V2 with grouped intervention campaigns."""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.historical_lab_import_service import HistoricalLabImportService


GROUPABLE_INTERVENTION_CODES = {"PLD", "DE", "DF", "PMT", "SC", "SO"}
PRELEVEMENT_CHAIN_FAMILIES = {"traitement"}


class HistoricalLabImportServiceV2(HistoricalLabImportService):
    """Second-pass historical import with demand-family reclassification and grouped interventions."""

    def preview_folder(self, folder_path: Path, limit: int = 300) -> dict[str, Any]:
        raw = self._collect_folder_candidates(folder_path, include_workbooks=True)
        grouped_candidates = self._prepare_candidates_v2(raw["candidates"])

        preview_rows = []
        for item in grouped_candidates[:limit]:
            preview_rows.append(
                {
                    "file_name": item["file_name"],
                    "sheet_name": item["sheet_name"],
                    "essai_code": item["essai_code"],
                    "essai_label": item["essai_label"],
                    "affaire_nge": item["affaire_nge"],
                    "affaire_nge_normalized": self._normalize_affaire_key(item["affaire_nge"]),
                    "campaign_date": item.get("campaign_date", ""),
                    "date_essai": item.get("date_essai", ""),
                    "date_prelevement": item.get("date_prelevement", ""),
                    "target_entity": item.get("target_entity", "echantillon"),
                    "import_family": item.get("import_family", "sols"),
                    "v2_demand_family": item.get("v2_demand_family", ""),
                    "materialization_route": item.get("materialization_route", self._materialization_route(item)),
                    "group_signature": item.get("group_signature", ""),
                    "source_count": len(item.get("source_candidates", [item])),
                }
            )

        return {
            "v2": True,
            "folder_path": str(folder_path),
            "xlsx_files_found": len(raw["files"]),
            "sheet_count": raw["sheet_count"],
            "raw_candidate_count": len(raw["candidates"]),
            "grouped_candidate_count": len(grouped_candidates),
            "skipped_count": len(raw["skipped"]),
            "preview_rows": preview_rows,
            "skipped_rows": raw["skipped"][:limit],
            "workbook_rows": raw["workbook_rows"][:limit],
        }

    def run_import(self, folder_path: Path, dry_run: bool = False) -> dict[str, Any]:
        self.ensure_import_schema()
        raw = self._collect_folder_candidates(folder_path, include_workbooks=False)
        candidates = self._prepare_candidates_v2(raw["candidates"])

        if dry_run:
            dry_run_stats = self._estimate_dry_run_counts(candidates)
            return {
                "v2": True,
                "dry_run": True,
                "folder_path": str(folder_path),
                "xlsx_files_found": len(raw["files"]),
                "sheet_count": raw["sheet_count"],
                "raw_candidate_count": len(raw["candidates"]),
                "grouped_candidate_count": len(candidates),
                "skipped_count": len(raw["skipped"]),
                "created_affaires": 0,
                "created_demandes": 0,
                **dry_run_stats,
                "skipped_rows": raw["skipped"][:200],
            }

        created_affaires = 0
        created_demandes = 0
        created_echantillons = 0
        created_interventions = 0
        created_essais = 0
        created_prelevements = 0
        created_interventions_reelles = 0
        linked_existing_affaires = 0
        linked_existing_demandes = 0
        linked_existing_echantillons = 0
        linked_existing_interventions = 0
        linked_existing_prelevements = 0
        linked_existing_interventions_reelles = 0

        with sqlite3.connect(self.paths.target_db_path) as conn:
            conn.row_factory = sqlite3.Row
            batch_id = self._create_batch(conn, folder_path, len(raw["candidates"]), dry_run=False)

            for candidate in candidates:
                source_candidates = candidate.get("source_candidates", [candidate])
                route = candidate.get("materialization_route") or self._materialization_route(candidate)
                try:
                    affaire_id, affaire_created = self._find_or_create_affaire(conn, candidate)
                    if affaire_created:
                        created_affaires += 1
                    else:
                        linked_existing_affaires += 1

                    demande_id, demande_created = self._find_or_create_demande(conn, affaire_id, candidate)
                    if demande_created:
                        created_demandes += 1
                    else:
                        linked_existing_demandes += 1

                    if route == "intervention":
                        intervention_id, intervention_created = self._find_or_create_intervention(conn, demande_id, candidate)
                        if intervention_created:
                            created_interventions += 1
                        else:
                            linked_existing_interventions += 1
                        created_essais += self._store_intervention_payload_if_missing(conn, intervention_id, candidate)
                    elif route == "prelevement_chain":
                        intervention_reelle_id, intervention_reelle_created = self._find_or_create_intervention_reelle(conn, demande_id, candidate)
                        if intervention_reelle_created:
                            created_interventions_reelles += 1
                        else:
                            linked_existing_interventions_reelles += 1

                        prelevement_id, prelevement_created = self._find_or_create_prelevement(
                            conn,
                            demande_id,
                            intervention_reelle_id,
                            candidate,
                        )
                        if prelevement_created:
                            created_prelevements += 1
                        else:
                            linked_existing_prelevements += 1

                        if candidate.get("v2_demand_family") == "traitement":
                            parent_candidate = dict(candidate)
                            parent_candidate["intervention_type"] = self._group_intervention_type(parent_candidate)
                            parent_candidate["intervention_subject"] = self._build_group_subject([parent_candidate], parent_candidate)
                            intervention_id, intervention_created = self._find_or_create_intervention(
                                conn,
                                demande_id,
                                parent_candidate,
                                prelevement_id=prelevement_id,
                                intervention_reelle_id=intervention_reelle_id,
                                nature_reelle="Intervention",
                            )
                            if intervention_created:
                                created_interventions += 1
                            else:
                                linked_existing_interventions += 1

                        echantillon_id, echantillon_created = self._find_or_create_echantillon(
                            conn,
                            demande_id,
                            candidate,
                            prelevement_id=prelevement_id,
                            intervention_reelle_id=intervention_reelle_id,
                            auto_reason=self._historical_auto_reason(candidate),
                        )
                        if echantillon_created:
                            created_echantillons += 1
                        else:
                            linked_existing_echantillons += 1
                        created_essais += self._create_essai_if_missing(conn, echantillon_id, candidate)
                    else:
                        echantillon_id, echantillon_created = self._find_or_create_echantillon(conn, demande_id, candidate)
                        if echantillon_created:
                            created_echantillons += 1
                        else:
                            linked_existing_echantillons += 1
                        created_essais += self._create_essai_if_missing(conn, echantillon_id, candidate)

                    for source_candidate in source_candidates:
                        self._create_file_log(
                            conn,
                            batch_id,
                            self._file_log_candidate(source_candidate, candidate),
                            "imported",
                            candidate.get("group_signature", ""),
                        )
                except Exception as exc:
                    for source_candidate in source_candidates:
                        self._create_file_log(
                            conn,
                            batch_id,
                            self._file_log_candidate(source_candidate, candidate),
                            "error",
                            str(exc),
                        )

            self._finalize_batch(
                conn=conn,
                batch_id=batch_id,
                created_affaires=created_affaires,
                created_demandes=created_demandes,
                created_echantillons=created_echantillons,
                created_essais=created_essais,
                status="done",
                notes=(
                    f"Skipped worksheets: {len(raw['skipped'])}; grouped candidates: {len(candidates)}; "
                    f"prelevements: {created_prelevements}; interventions_reelles: {created_interventions_reelles}"
                ),
            )

        unmatched_report = self.report_unmatched_imported_affaires(limit=50)
        return {
            "v2": True,
            "dry_run": False,
            "folder_path": str(folder_path),
            "xlsx_files_found": len(raw["files"]),
            "sheet_count": raw["sheet_count"],
            "raw_candidate_count": len(raw["candidates"]),
            "grouped_candidate_count": len(candidates),
            "skipped_count": len(raw["skipped"]),
            "created_affaires": created_affaires,
            "created_demandes": created_demandes,
            "created_echantillons": created_echantillons,
            "created_interventions": created_interventions,
            "created_essais": created_essais,
            "created_prelevements": created_prelevements,
            "created_interventions_reelles": created_interventions_reelles,
            "linked_existing_affaires": linked_existing_affaires,
            "linked_existing_demandes": linked_existing_demandes,
            "linked_existing_echantillons": linked_existing_echantillons,
            "linked_existing_interventions": linked_existing_interventions,
            "linked_existing_prelevements": linked_existing_prelevements,
            "linked_existing_interventions_reelles": linked_existing_interventions_reelles,
            "unmatched_imported_affaires_count": unmatched_report["count"],
            "skipped_rows": raw["skipped"][:200],
        }

    def _estimate_dry_run_counts(self, candidates: list[dict[str, Any]]) -> dict[str, int]:
        created_echantillons = 0
        created_interventions = 0
        created_essais = 0
        created_prelevements = 0
        created_interventions_reelles = 0

        for candidate in candidates:
            route = candidate.get("materialization_route") or self._materialization_route(candidate)
            if route == "intervention":
                created_interventions += 1
                continue
            if route == "prelevement_chain":
                created_interventions_reelles += 1
                created_prelevements += 1
                if candidate.get("v2_demand_family") == "traitement":
                    created_interventions += 1
                created_echantillons += 1
                created_essais += max(1, len(candidate.get("composite_subtests", [])))
                continue
            created_echantillons += 1
            created_essais += max(1, len(candidate.get("composite_subtests", [])))

        return {
            "created_echantillons": created_echantillons,
            "created_interventions": created_interventions,
            "created_essais": created_essais,
            "created_prelevements": created_prelevements,
            "created_interventions_reelles": created_interventions_reelles,
        }

    def _collect_folder_candidates(self, folder_path: Path, include_workbooks: bool) -> dict[str, Any]:
        files = self._scan_supported_files(folder_path)
        candidates: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []
        workbook_rows: list[dict[str, Any]] = []
        total_sheet_count = 0

        for file_path in files:
            try:
                parsed = self._parse_workbook(file_path)
                total_sheet_count += parsed["sheet_count"]
                candidates.extend(parsed["supported_candidates"])
                skipped.extend(parsed["skipped_sheets"])
                if include_workbooks:
                    workbook_rows.append(
                        {
                            "file_name": file_path.name,
                            "sheet_count": parsed["sheet_count"],
                            "supported_sheet_count": len(parsed["supported_candidates"]),
                            "skipped_sheet_count": len(parsed["skipped_sheets"]),
                        }
                    )
            except Exception as exc:
                skipped.append(
                    {
                        "file_name": file_path.name,
                        "sheet_name": "",
                        "reason": f"Workbook read error: {exc}",
                    }
                )

        return {
            "files": files,
            "candidates": candidates,
            "skipped": skipped,
            "sheet_count": total_sheet_count,
            "workbook_rows": workbook_rows,
        }

    def _prepare_candidates_v2(self, raw_candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        passthrough: list[dict[str, Any]] = []

        for raw_candidate in raw_candidates:
            candidate = dict(raw_candidate)
            candidate["v2_demand_family"] = self._classify_demand_family_v2(candidate)
            candidate["materialization_route"] = self._materialization_route(candidate)
            group_signature = self._build_group_signature(candidate)
            if not group_signature:
                candidate["group_signature"] = ""
                candidate["source_candidates"] = [dict(raw_candidate)]
                passthrough.append(candidate)
                continue
            grouped.setdefault(group_signature, []).append(candidate)

        merged_candidates = [self._merge_candidate_group(signature, items) for signature, items in grouped.items()]
        ordered = merged_candidates + passthrough
        ordered.sort(
            key=lambda item: (
                self._extract_year(item.get("date_essai", "") or item.get("date_redaction", "") or "") or 0,
                self._normalize_affaire_key(item.get("affaire_nge", "")),
                item.get("essai_code", ""),
                item.get("date_essai", "") or item.get("date_prelevement", "") or item.get("date_redaction", ""),
                item.get("sheet_name", ""),
            )
        )
        return ordered

    def _materialization_route(self, candidate: dict[str, Any]) -> str:
        family = candidate.get("v2_demand_family") or candidate.get("import_family", "")
        if family in PRELEVEMENT_CHAIN_FAMILIES:
            return "prelevement_chain"
        if candidate.get("target_entity") == "intervention":
            return "intervention"
        return "echantillon"

    def _classify_demand_family_v2(self, candidate: dict[str, Any]) -> str:
        code = candidate.get("essai_code", "")
        if code in {"SO", "SC"}:
            return "sondage"
        if self._is_treatment_candidate(candidate) and code in {"DE", "WE"}:
            return "traitement"
        return str(candidate.get("import_family", "sols"))

    def _is_treatment_candidate(self, candidate: dict[str, Any]) -> bool:
        haystack = " ".join(
            [
                self._stringify(candidate.get("file_name", "")),
                self._stringify(candidate.get("sheet_name", "")),
                self._stringify(candidate.get("title", "")),
                self._stringify(candidate.get("provenance", "")),
                self._stringify(candidate.get("destination", "")),
                self._stringify(candidate.get("nature_materiau", "")),
                self._stringify(candidate.get("section_controlee", "")),
                self._stringify(candidate.get("couche", "")),
            ]
        ).lower()
        return "traitement" in haystack

    def _build_group_signature(self, candidate: dict[str, Any]) -> str:
        code = candidate.get("essai_code", "")
        if candidate.get("target_entity") != "intervention" or code not in GROUPABLE_INTERVENTION_CODES:
            return ""
        affaire_key = self._normalize_affaire_key(candidate.get("affaire_nge", ""))
        if not affaire_key:
            return ""
        date_key = self._group_date_key(candidate)
        family = candidate.get("v2_demand_family", candidate.get("import_family", "sols"))
        return f"V2|AFF={affaire_key}|FAMILY={family}|CODE={code}|DATE={date_key}"

    def _group_date_key(self, candidate: dict[str, Any]) -> str:
        for field in ["date_mise_en_oeuvre", "date_essai", "date_prelevement", "date_redaction"]:
            value = self._stringify(candidate.get(field, ""))
            if value:
                return value[:10]
        year_value = self._extract_year(candidate.get("date_essai", "") or candidate.get("date_redaction", "")) or 2026
        return f"{year_value}-unknown"

    def _merge_candidate_group(self, group_signature: str, group_items: list[dict[str, Any]]) -> dict[str, Any]:
        first = dict(group_items[0])
        source_candidates = [self._strip_group_metadata(item) for item in group_items]
        merged_payload = self._merge_group_payloads(first.get("essai_code", ""), group_items)
        campaign_date = self._group_date_key(first)
        first["group_signature"] = group_signature
        first["campaign_date"] = campaign_date
        first["source_candidates"] = source_candidates
        first["file_name"] = source_candidates[0]["file_name"]
        first["sheet_name"] = source_candidates[0]["sheet_name"] if len(source_candidates) == 1 else f"{len(source_candidates)} feuilles regroupées"
        first["sample_local_ref"] = self._build_group_sample_ref(first, len(source_candidates))
        first["intervention_type"] = self._group_intervention_type(first)
        first["intervention_subject"] = self._build_group_subject(group_items, first)
        first["result_payload"] = merged_payload
        return first

    def _group_intervention_type(self, candidate: dict[str, Any]) -> str:
        family = candidate.get("v2_demand_family") or candidate.get("import_family", "")
        if family == "sondage":
            return "Reconnaissance géotechnique"
        if family == "traitement":
            return "Suivi traitement"
        return self._stringify(candidate.get("intervention_type", "") or candidate.get("essai_label", "") or "Intervention historique")

    def _merge_group_payloads(self, code: str, group_items: list[dict[str, Any]]) -> dict[str, Any]:
        payloads = [dict(item.get("result_payload", {})) for item in group_items if isinstance(item.get("result_payload"), dict)]
        merged = dict(payloads[0]) if payloads else {}
        merged["grouped"] = len(group_items) > 1
        merged["group_signature"] = group_items[0].get("group_signature", "")
        merged["source_count"] = len(group_items)
        merged["source_files"] = [self._stringify(item.get("file_name", "")) for item in group_items]
        merged["source_sheets"] = [self._stringify(item.get("sheet_name", "")) for item in group_items]

        if all(isinstance(payload.get("points"), list) for payload in payloads):
            merged_points: list[dict[str, Any]] = []
            for index, (item, payload) in enumerate(zip(group_items, payloads), start=1):
                for point in payload.get("points", []):
                    enriched = dict(point)
                    enriched.setdefault("source_sheet", self._stringify(item.get("sheet_name", "")))
                    enriched.setdefault("source_file", self._stringify(item.get("file_name", "")))
                    enriched.setdefault("campaign_index", index)
                    merged_points.append(enriched)
            merged["points"] = merged_points
            if code == "PLD":
                ev2_values = [self._safe_float(point.get("ev2_mpa")) for point in merged_points]
                numeric_values = [value for value in ev2_values if value is not None]
                merged["moyenne_ev2_mpa"] = self._average(numeric_values)
                merged["valeur_min_mpa"] = min(numeric_values) if numeric_values else None
                merged["valeur_max_mpa"] = max(numeric_values) if numeric_values else None
            if code == "DE":
                density_values = [self._safe_float(point.get("density_g_cm3")) for point in merged_points]
                compacity_values = [self._safe_float(point.get("compacite_percent")) for point in merged_points]
                voids_values = [self._safe_float(point.get("vides_percent")) for point in merged_points]
                merged["moyenne_density_g_cm3"] = self._average([value for value in density_values if value is not None])
                merged["moyenne_compacite_percent"] = self._average([value for value in compacity_values if value is not None])
                merged["moyenne_vides_percent"] = self._average([value for value in voids_values if value is not None])

        if all(isinstance(payload.get("rows"), list) for payload in payloads):
            merged_rows: list[dict[str, Any]] = []
            for item, payload in zip(group_items, payloads):
                for row in payload.get("rows", []):
                    if isinstance(row, dict):
                        enriched_row = dict(row)
                        enriched_row.setdefault("source_sheet", self._stringify(item.get("sheet_name", "")))
                        enriched_row.setdefault("source_file", self._stringify(item.get("file_name", "")))
                        merged_rows.append(enriched_row)
                    else:
                        merged_rows.append({"value": row, "source_sheet": self._stringify(item.get("sheet_name", "")), "source_file": self._stringify(item.get("file_name", ""))})
            merged["rows"] = merged_rows

        return merged

    def _build_group_sample_ref(self, candidate: dict[str, Any], source_count: int) -> str:
        date_key = self._group_date_key(candidate)
        code = self._stringify(candidate.get("essai_code", "")) or "HIST"
        if source_count <= 1:
            return self._stringify(candidate.get("sample_local_ref", "")) or f"{code} {date_key}"
        return f"{code} campagne {date_key}"

    def _build_group_subject(self, group_items: list[dict[str, Any]], candidate: dict[str, Any]) -> str:
        family = candidate.get("v2_demand_family") or candidate.get("import_family", "")
        if family == "sondage":
            return "Reconnaissance géotechnique"
        if family == "traitement":
            return self._stringify(candidate.get("destination", "") or candidate.get("section_controlee", ""))
        if candidate.get("essai_code") == "PLD":
            first_subject = self._stringify(group_items[0].get("intervention_subject", ""))
            if first_subject:
                return first_subject

        values = self._unique_non_empty(
            [
                self._stringify(item.get("section_controlee", "")) for item in group_items
            ]
            + [self._stringify(item.get("couche", "")) for item in group_items]
            + [self._stringify(item.get("nature_materiau", "")) for item in group_items]
            + [self._stringify(item.get("destination", "")) for item in group_items]
        )
        if values:
            return " / ".join(values)
        return self._stringify(candidate.get("intervention_subject", "")) or self._stringify(candidate.get("sheet_name", ""))

    def _strip_group_metadata(self, candidate: dict[str, Any]) -> dict[str, Any]:
        return {
            "file_name": self._stringify(candidate.get("file_name", "")),
            "file_path": self._stringify(candidate.get("file_path", "")),
            "sheet_name": self._stringify(candidate.get("sheet_name", "")),
            "file_hash": self._stringify(candidate.get("file_hash", "")),
            "essai_code": self._stringify(candidate.get("essai_code", "")),
            "sample_local_ref": self._stringify(candidate.get("sample_local_ref", "")),
            "date_essai": self._stringify(candidate.get("date_essai", "")),
            "date_prelevement": self._stringify(candidate.get("date_prelevement", "")),
            "date_mise_en_oeuvre": self._stringify(candidate.get("date_mise_en_oeuvre", "")),
        }

    def _file_log_candidate(self, source_candidate: dict[str, Any], fallback_candidate: dict[str, Any]) -> dict[str, Any]:
        return {
            "file_name": self._stringify(source_candidate.get("file_name") or fallback_candidate.get("file_name", "")),
            "file_path": self._stringify(source_candidate.get("file_path") or fallback_candidate.get("file_path", "")),
            "file_hash": self._stringify(source_candidate.get("file_hash") or fallback_candidate.get("file_hash", "")),
            "sheet_name": self._stringify(source_candidate.get("sheet_name") or fallback_candidate.get("sheet_name", "")),
            "essai_code": self._stringify(source_candidate.get("essai_code") or fallback_candidate.get("essai_code", "")),
            "sample_local_ref": self._stringify(source_candidate.get("sample_local_ref") or fallback_candidate.get("sample_local_ref", "")),
        }

    def _unique_non_empty(self, values: list[str]) -> list[str]:
        unique: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = self._stringify(value)
            if not text:
                continue
            normalized = self._normalize_text(text)
            if normalized in seen:
                continue
            seen.add(normalized)
            unique.append(text)
        return unique

    def _average(self, values: list[float]) -> float | None:
        if not values:
            return None
        return round(sum(values) / len(values), 3)

    def _normalize_text(self, value: str) -> str:
        return " ".join(self._stringify(value).lower().split())

    def _demande_profile_for_candidate(self, candidate: dict[str, Any]) -> tuple[str, str, str, tuple[str, ...]]:
        family = candidate.get("v2_demand_family") or candidate.get("import_family", "sols")
        year_label = candidate.get("date_essai", "")[:4] or candidate.get("date_redaction", "")[:4] or "2026"
        if family == "traitement":
            return (
                "Import historique suivi traitement",
                f"Import historique suivi traitement {year_label}",
                "Import historique suivi traitement",
                ("interventions", "echantillons", "essais_laboratoire", "documents"),
            )
        if family == "sondage":
            return (
                "Import historique sondages",
                f"Import historique sondages {year_label}",
                "Import historique sondages",
                ("interventions", "echantillons", "essais_laboratoire", "documents"),
            )
        return super()._demande_profile_for_candidate(candidate)

    def _historical_auto_reason(self, candidate: dict[str, Any]) -> str:
        family = candidate.get("v2_demand_family") or candidate.get("import_family", "historique")
        return f"historical_import_v2_{self._normalize_text(family).replace(' ', '_')}"

    def _candidate_year_value(self, candidate: dict[str, Any]) -> int:
        return self._extract_year(
            candidate.get("date_prelevement", "")
            or candidate.get("date_essai", "")
            or candidate.get("date_mise_en_oeuvre", "")
            or candidate.get("date_redaction", "")
            or candidate.get("campaign_date", "")
        ) or 2026

    def _candidate_reference_signature(self, candidate: dict[str, Any]) -> str:
        return candidate.get("group_signature") or (
            f"SRC_HASH={candidate.get('file_hash', '')}|SHEET={candidate.get('sheet_name', '')}|CODE={candidate.get('essai_code', '')}"
        )

    def _candidate_date_value(self, candidate: dict[str, Any]) -> str:
        return (
            self._stringify(candidate.get("date_prelevement", ""))
            or self._stringify(candidate.get("date_essai", ""))
            or self._stringify(candidate.get("date_mise_en_oeuvre", ""))
            or self._stringify(candidate.get("date_redaction", ""))
            or self._stringify(candidate.get("campaign_date", ""))
            or datetime.now().date().isoformat()
        )

    def _candidate_zone_value(self, candidate: dict[str, Any]) -> str:
        return self._stringify(
            candidate.get("section_controlee", "")
            or candidate.get("destination", "")
            or candidate.get("provenance", "")
            or candidate.get("intervention_subject", "")
            or candidate.get("sheet_name", "")
        )

    def _candidate_material_value(self, candidate: dict[str, Any]) -> str:
        return self._stringify(
            candidate.get("nature_materiau", "")
            or candidate.get("couche", "")
            or candidate.get("destination", "")
            or candidate.get("essai_label", "")
        )

    def _candidate_finalite_value(self, candidate: dict[str, Any]) -> str:
        family = candidate.get("v2_demand_family") or candidate.get("import_family", "")
        if family == "sondage":
            return "Sondage"
        if family == "traitement":
            return "Suivi traitement"
        return self._stringify(candidate.get("intervention_type", "") or candidate.get("essai_label", ""))

    def _candidate_intervention_reelle_type(self, candidate: dict[str, Any]) -> str:
        family = candidate.get("v2_demand_family") or candidate.get("import_family", "")
        if family == "sondage":
            return "Sondage"
        if family == "traitement":
            return "Suivi traitement"
        return self._stringify(candidate.get("intervention_type", "") or candidate.get("essai_label", "") or "Intervention historique")

    def _candidate_prelevement_description(self, candidate: dict[str, Any]) -> str:
        return self._stringify(
            candidate.get("sample_local_ref", "")
            or candidate.get("intervention_subject", "")
            or candidate.get("sheet_name", "")
        )

    def _candidate_signature_note(self, prefix: str, signature: str, candidate: dict[str, Any]) -> str:
        return (
            f"{prefix} | signature={signature} | code={candidate.get('essai_code', '')} | "
            f"file={candidate.get('file_name', '')}"
        )

    def _update_row_if_needed(self, conn: sqlite3.Connection, table_name: str, row_id: int, updates: dict[str, Any]) -> bool:
        if not updates:
            return False
        assignments = ", ".join(f"{column} = ?" for column in updates)
        conn.execute(
            f"UPDATE {table_name} SET {assignments}, updated_at = datetime('now') WHERE id = ?",
            tuple(updates.values()) + (row_id,),
        )
        conn.commit()
        return True

    def _find_or_create_intervention_reelle(
        self,
        conn: sqlite3.Connection,
        demande_id: int,
        candidate: dict[str, Any],
    ) -> tuple[int, bool]:
        signature = self._candidate_reference_signature(candidate)
        date_value = self._candidate_date_value(candidate)
        type_value = self._candidate_intervention_reelle_type(candidate)
        zone_value = self._candidate_zone_value(candidate)
        finalite_value = self._candidate_finalite_value(candidate)
        notes = self._candidate_signature_note("Import historique V2 intervention réelle", signature, candidate)

        existing = conn.execute(
            """
            SELECT id, date_intervention, type_intervention, zone, technicien, finalite, notes, statut
            FROM interventions_reelles
            WHERE demande_id = ?
              AND COALESCE(notes, '') LIKE ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (demande_id, f"%signature={signature}%"),
        ).fetchone()
        if existing:
            updates: dict[str, Any] = {}
            if str(existing["date_intervention"] or "") != date_value:
                updates["date_intervention"] = date_value
            if str(existing["type_intervention"] or "") != type_value:
                updates["type_intervention"] = type_value
            if str(existing["zone"] or "") != zone_value:
                updates["zone"] = zone_value
            if str(existing["technicien"] or "") != self._stringify(candidate.get("operator", "")):
                updates["technicien"] = self._stringify(candidate.get("operator", ""))
            if str(existing["finalite"] or "") != finalite_value:
                updates["finalite"] = finalite_value
            if str(existing["notes"] or "") != notes:
                updates["notes"] = notes
            if str(existing["statut"] or "") != "Préparée":
                updates["statut"] = "Préparée"
            self._update_row_if_needed(conn, "interventions_reelles", int(existing["id"]), updates)
            return int(existing["id"]), False

        year_value = self._candidate_year_value(candidate)
        reference = self._next_intervention_reelle_reference(conn, year_value)
        cursor = conn.execute(
            """
            INSERT INTO interventions_reelles (
                reference,
                demande_id,
                source_year,
                date_intervention,
                type_intervention,
                zone,
                technicien,
                finalite,
                notes,
                statut,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Préparée', datetime('now'), datetime('now'))
            """,
            (
                reference,
                demande_id,
                year_value,
                date_value,
                type_value,
                zone_value,
                self._stringify(candidate.get("operator", "")),
                finalite_value,
                notes,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid), True

    def _find_or_create_prelevement(
        self,
        conn: sqlite3.Connection,
        demande_id: int,
        intervention_reelle_id: int,
        candidate: dict[str, Any],
    ) -> tuple[int, bool]:
        signature = self._candidate_reference_signature(candidate)
        date_value = self._candidate_date_value(candidate)
        date_reception_labo = self._stringify(candidate.get("date_essai", "") or candidate.get("date_redaction", "") or date_value)
        description = self._candidate_prelevement_description(candidate)
        quantite = ""
        source_count = len(candidate.get("source_candidates", [candidate]))
        if source_count > 1:
            quantite = f"{source_count} feuille(s) regroupée(s)"
        notes = self._candidate_signature_note("Import historique V2 prélèvement", signature, candidate)

        existing = conn.execute(
            """
            SELECT id, intervention_reelle_id, date_prelevement, date_reception_labo, description,
                   quantite, receptionnaire, zone, materiau, technicien, finalite, notes, statut
            FROM prelevements
            WHERE demande_id = ?
              AND COALESCE(notes, '') LIKE ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (demande_id, f"%signature={signature}%"),
        ).fetchone()
        if existing:
            updates: dict[str, Any] = {}
            if existing["intervention_reelle_id"] != intervention_reelle_id:
                updates["intervention_reelle_id"] = intervention_reelle_id
            if str(existing["date_prelevement"] or "") != date_value:
                updates["date_prelevement"] = date_value
            if str(existing["date_reception_labo"] or "") != date_reception_labo:
                updates["date_reception_labo"] = date_reception_labo
            if str(existing["description"] or "") != description:
                updates["description"] = description
            if str(existing["quantite"] or "") != quantite:
                updates["quantite"] = quantite
            if str(existing["receptionnaire"] or "") != self._stringify(candidate.get("operator", "")):
                updates["receptionnaire"] = self._stringify(candidate.get("operator", ""))
            if str(existing["zone"] or "") != self._candidate_zone_value(candidate):
                updates["zone"] = self._candidate_zone_value(candidate)
            if str(existing["materiau"] or "") != self._candidate_material_value(candidate):
                updates["materiau"] = self._candidate_material_value(candidate)
            if str(existing["technicien"] or "") != self._stringify(candidate.get("operator", "")):
                updates["technicien"] = self._stringify(candidate.get("operator", ""))
            if str(existing["finalite"] or "") != self._candidate_finalite_value(candidate):
                updates["finalite"] = self._candidate_finalite_value(candidate)
            if str(existing["notes"] or "") != notes:
                updates["notes"] = notes
            if str(existing["statut"] or "") != "Prêt labo":
                updates["statut"] = "Prêt labo"
            self._update_row_if_needed(conn, "prelevements", int(existing["id"]), updates)
            return int(existing["id"]), False

        year_value = self._candidate_year_value(candidate)
        reference = self._next_prelevement_reference(conn, year_value)
        cursor = conn.execute(
            """
            INSERT INTO prelevements (
                reference,
                demande_id,
                intervention_reelle_id,
                source_year,
                date_prelevement,
                date_reception_labo,
                description,
                quantite,
                receptionnaire,
                zone,
                materiau,
                technicien,
                finalite,
                notes,
                statut,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Prêt labo', datetime('now'), datetime('now'))
            """,
            (
                reference,
                demande_id,
                intervention_reelle_id,
                year_value,
                date_value,
                date_reception_labo,
                description,
                quantite,
                self._stringify(candidate.get("operator", "")),
                self._candidate_zone_value(candidate),
                self._candidate_material_value(candidate),
                self._stringify(candidate.get("operator", "")),
                self._candidate_finalite_value(candidate),
                notes,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid), True

    def _find_or_create_echantillon(
        self,
        conn: sqlite3.Connection,
        demande_id: int,
        candidate: dict[str, Any],
        prelevement_id: int | None = None,
        intervention_reelle_id: int | None = None,
        auto_reason: str = "",
    ) -> tuple[int, bool]:
        local_ref = candidate["sample_local_ref"].strip() or candidate["sheet_name"].strip()
        existing = conn.execute(
            """
            SELECT id, observations, prelevement_id, intervention_reelle_id, auto_reason
            FROM echantillons
            WHERE demande_id = ?
              AND COALESCE(designation, '') = ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (demande_id, local_ref),
        ).fetchone()
        observations_payload = self._build_echantillon_observations_payload(
            candidate,
            local_ref,
            existing["observations"] if existing else "",
        )
        next_observations = json.dumps(observations_payload, ensure_ascii=False)
        if existing:
            updates: dict[str, Any] = {}
            if str(existing["observations"] or "") != next_observations:
                updates["observations"] = next_observations
            if prelevement_id is not None and existing["prelevement_id"] != prelevement_id:
                updates["prelevement_id"] = prelevement_id
            if intervention_reelle_id is not None and existing["intervention_reelle_id"] != intervention_reelle_id:
                updates["intervention_reelle_id"] = intervention_reelle_id
            if auto_reason and str(existing["auto_reason"] or "") != auto_reason:
                updates["auto_reason"] = auto_reason
            self._update_row_if_needed(conn, "echantillons", int(existing["id"]), updates)
            return int(existing["id"]), False

        year_value = self._candidate_year_value(candidate)
        reference, numero = self._next_echantillon_reference(conn, year_value, "SP")
        localisation = " / ".join(
            [value for value in [candidate.get("provenance", ""), candidate.get("destination", "")] if value]
        )

        cursor = conn.execute(
            """
            INSERT INTO echantillons (
                reference,
                annee,
                labo_code,
                numero,
                demande_id,
                designation,
                date_prelevement,
                localisation,
                statut,
                date_reception_labo,
                observations,
                prelevement_id,
                intervention_reelle_id,
                auto_reason,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Importé', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (
                reference,
                year_value,
                "SP",
                numero,
                demande_id,
                local_ref,
                candidate["date_prelevement"] or candidate["date_essai"],
                localisation,
                candidate["date_essai"] or candidate["date_redaction"],
                next_observations,
                prelevement_id,
                intervention_reelle_id,
                auto_reason,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid), True

    def _build_echantillon_observations_payload(self, candidate: dict[str, Any], local_ref: str, existing_raw: str = "") -> dict[str, Any]:
        payload = super()._build_echantillon_observations_payload(candidate, local_ref, existing_raw)
        payload["group_signature"] = candidate.get("group_signature", "")
        payload["v2_demand_family"] = candidate.get("v2_demand_family", "")
        payload["materialization_route"] = candidate.get("materialization_route", self._materialization_route(candidate))
        payload["campaign_date"] = candidate.get("campaign_date", "")
        if candidate.get("source_candidates"):
            payload["source_candidates"] = candidate.get("source_candidates", [])
        return payload

    def _materialize_sondage_raw_interventions(
        self,
        conn: sqlite3.Connection,
        demande_id: int,
        prelevement_id: int,
        intervention_reelle_id: int,
        candidate: dict[str, Any],
    ) -> dict[str, int]:
        counts = {"created": 0, "linked": 0}
        source_candidates = candidate.get("source_candidates") or [self._strip_group_metadata(candidate)]
        for source_candidate in source_candidates:
            _, created = self._find_or_create_sondage_raw_intervention(
                conn,
                demande_id,
                prelevement_id,
                intervention_reelle_id,
                candidate,
                source_candidate,
            )
            if created:
                counts["created"] += 1
            else:
                counts["linked"] += 1
        return counts

    def _find_or_create_sondage_raw_intervention(
        self,
        conn: sqlite3.Connection,
        demande_id: int,
        prelevement_id: int,
        intervention_reelle_id: int,
        candidate: dict[str, Any],
        source_candidate: dict[str, Any],
    ) -> tuple[int, bool]:
        signature = (
            f"SRC_HASH={source_candidate.get('file_hash', '')}|SHEET={source_candidate.get('sheet_name', '')}"
            f"|CODE={candidate.get('essai_code', '')}|GROUP={candidate.get('group_signature', '')}"
        )
        existing = conn.execute(
            """
            SELECT id, nature_reelle, prelevement_id, intervention_reelle_id, tri_comment
            FROM interventions
            WHERE demande_id = ?
              AND COALESCE(observations, '') LIKE ?
            LIMIT 1
            """,
            (demande_id, f"%{signature}%"),
        ).fetchone()
        if existing:
            updates: dict[str, Any] = {}
            if str(existing["nature_reelle"] or "") != "Sondage":
                updates["nature_reelle"] = "Sondage"
            if existing["prelevement_id"] != prelevement_id:
                updates["prelevement_id"] = prelevement_id
            if existing["intervention_reelle_id"] != intervention_reelle_id:
                updates["intervention_reelle_id"] = intervention_reelle_id
            if str(existing["tri_comment"] or "") != "Import historique V2 sondage":
                updates["tri_comment"] = "Import historique V2 sondage"
            if updates:
                assignments = ", ".join(f"{column} = ?" for column in updates)
                conn.execute(
                    f"UPDATE interventions SET {assignments}, tri_updated_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
                    tuple(updates.values()) + (int(existing["id"]),),
                )
                conn.commit()
            return int(existing["id"]), False

        year_value = self._candidate_year_value(candidate)
        reference, numero = self._next_intervention_reference(conn, year_value, "SP")
        observations = {
            "source_file": source_candidate.get("file_name", candidate.get("file_name", "")),
            "sheet_name": source_candidate.get("sheet_name", candidate.get("sheet_name", "")),
            "signature": signature,
            "group_signature": candidate.get("group_signature", ""),
            "source_candidate": source_candidate,
            "essai_code": candidate.get("essai_code", ""),
            "essai_label": candidate.get("essai_label", ""),
            "payload": candidate.get("result_payload", {}),
            "import_mode": candidate.get("import_mode", "simple"),
            "v2_demand_family": candidate.get("v2_demand_family", ""),
            "materialization_route": candidate.get("materialization_route", self._materialization_route(candidate)),
        }
        cursor = conn.execute(
            """
            INSERT INTO interventions (
                reference,
                annee,
                labo_code,
                numero,
                demande_id,
                type_intervention,
                sujet,
                date_intervention,
                geotechnicien,
                technicien,
                observations,
                statut,
                nature_reelle,
                prelevement_id,
                intervention_reelle_id,
                tri_comment,
                tri_updated_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 'Importée', 'Sondage', ?, ?, 'Import historique V2 sondage', datetime('now'), datetime('now'), datetime('now'))
            """,
            (
                reference,
                year_value,
                "SP",
                numero,
                demande_id,
                candidate.get("intervention_type", candidate.get("essai_label", "Sondage historique")),
                candidate.get("intervention_subject", candidate.get("sheet_name", "")),
                source_candidate.get("date_prelevement", "")
                or source_candidate.get("date_essai", "")
                or source_candidate.get("date_mise_en_oeuvre", "")
                or self._candidate_date_value(candidate),
                self._stringify(candidate.get("operator", "")),
                json.dumps(observations, ensure_ascii=False),
                prelevement_id,
                intervention_reelle_id,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid), True

    def _find_or_create_intervention(
        self,
        conn: sqlite3.Connection,
        demande_id: int,
        candidate: dict[str, Any],
        prelevement_id: int | None = None,
        intervention_reelle_id: int | None = None,
        nature_reelle: str | None = None,
    ) -> tuple[int, bool]:
        signature = candidate.get("group_signature") or f"SRC_HASH={candidate['file_hash']}|SHEET={candidate['sheet_name']}|CODE={candidate['essai_code']}"
        existing = conn.execute(
            """
            SELECT id, prelevement_id, intervention_reelle_id, nature_reelle
            FROM interventions
            WHERE demande_id = ?
              AND COALESCE(observations, '') LIKE ?
            LIMIT 1
            """,
            (demande_id, f"%{signature}%"),
        ).fetchone()
        if existing:
            updates: dict[str, Any] = {}
            if prelevement_id is not None and existing["prelevement_id"] != prelevement_id:
                updates["prelevement_id"] = prelevement_id
            if intervention_reelle_id is not None and existing["intervention_reelle_id"] != intervention_reelle_id:
                updates["intervention_reelle_id"] = intervention_reelle_id
            if nature_reelle is not None and str(existing["nature_reelle"] or "") != nature_reelle:
                updates["nature_reelle"] = nature_reelle
            self._update_row_if_needed(conn, "interventions", int(existing["id"]), updates)
            return int(existing["id"]), False

        year_value = self._extract_year(candidate.get("date_essai", "") or candidate.get("date_mise_en_oeuvre", "") or candidate.get("date_redaction", "")) or 2026
        reference, numero = self._next_intervention_reference(conn, year_value, "SP")
        observations = {
            "source_file": candidate.get("file_name", ""),
            "sheet_name": candidate.get("sheet_name", ""),
            "signature": signature,
            "group_signature": candidate.get("group_signature", ""),
            "source_candidates": candidate.get("source_candidates", [self._strip_group_metadata(candidate)]),
            "essai_code": candidate.get("essai_code", ""),
            "essai_label": candidate.get("essai_label", ""),
            "payload": candidate.get("result_payload", {}),
            "import_mode": candidate.get("import_mode", "simple"),
            "composite_subtests": candidate.get("composite_subtests", []),
            "v2_demand_family": candidate.get("v2_demand_family", ""),
        }
        cursor = conn.execute(
            """
            INSERT INTO interventions (
                reference,
                annee,
                labo_code,
                numero,
                demande_id,
                type_intervention,
                sujet,
                date_intervention,
                geotechnicien,
                technicien,
                observations,
                statut,
                nature_reelle,
                prelevement_id,
                intervention_reelle_id,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, 'Importée', ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (
                reference,
                year_value,
                "SP",
                numero,
                demande_id,
                candidate.get("intervention_type", candidate.get("essai_label", "Intervention historique")),
                candidate.get("intervention_subject", candidate.get("sheet_name", "")),
                candidate.get("date_mise_en_oeuvre", "") or candidate.get("date_essai", "") or candidate.get("date_redaction", "") or datetime.now().date().isoformat(),
                candidate.get("operator", ""),
                json.dumps(observations, ensure_ascii=False),
                nature_reelle or "",
                prelevement_id,
                intervention_reelle_id,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid), True

    def _next_sequenced_reference(self, conn: sqlite3.Connection, table_name: str, prefix: str) -> str:
        rows = conn.execute(
            f"SELECT reference FROM {table_name} WHERE reference LIKE ?",
            (f"{prefix}%",),
        ).fetchall()
        numbers: list[int] = []
        for row in rows:
            match = re.match(rf"^{re.escape(prefix)}(\d+)$", str(row[0] or ""))
            if match:
                numbers.append(int(match.group(1)))
        return f"{prefix}{max(numbers, default=0) + 1:04d}"

    def _next_prelevement_reference(self, conn: sqlite3.Connection, year_value: int) -> str:
        return self._next_sequenced_reference(conn, "prelevements", f"{year_value}-RA-PRL")

    def _next_intervention_reelle_reference(self, conn: sqlite3.Connection, year_value: int) -> str:
        return self._next_sequenced_reference(conn, "interventions_reelles", f"{year_value}-RA-INT")
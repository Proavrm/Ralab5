"""Conversion entre documents G3 et le quadro DocumentTrackingTable."""

from __future__ import annotations

from typing import Any


def tracking_row_to_g3_document(row: dict[str, Any]) -> dict[str, Any]:
    comment = str(row.get("comment") or "").strip()
    doc_type = str(row.get("document_type") or "").strip()
    return {
        "id": row.get("uid") or row.get("id"),
        "type": doc_type,
        "name": comment or doc_type,
        "reference": str(row.get("reference") or "").strip(),
        "version": str(row.get("version") or "").strip(),
        "document_date": row.get("document_date"),
        "author": str(row.get("author") or "").strip(),
        "received": bool(row.get("is_received")),
        "analyzed": bool(row.get("is_analyzed")),
        "used_in_report": bool(row.get("used_in_report")),
        "observations": comment,
        "stored_path": str(row.get("stored_path") or "").strip(),
        "uploaded_at": row.get("uploaded_at"),
        "zone_id": row.get("zone_id"),
    }


def g3_document_to_tracking_row(doc: dict[str, Any]) -> dict[str, Any]:
    observations = str(doc.get("observations") or doc.get("name") or "").strip()
    return {
        "uid": doc.get("id"),
        "document_type": str(doc.get("type") or "").strip(),
        "is_received": bool(doc.get("received")),
        "is_analyzed": bool(doc.get("analyzed")),
        "used_in_report": bool(doc.get("used_in_report")),
        "version": str(doc.get("version") or "").strip(),
        "document_date": doc.get("document_date"),
        "uploaded_at": doc.get("uploaded_at"),
        "comment": observations,
        "stored_path": str(doc.get("stored_path") or doc.get("file_url") or "").strip(),
        "zone_id": doc.get("zone_id"),
        "reference": str(doc.get("reference") or "").strip(),
        "author": str(doc.get("author") or "").strip(),
    }

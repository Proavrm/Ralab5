"""Annuaire contacts dossier — normalisation et alimentation depuis le terrain."""
from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from datetime import datetime
from typing import Any

from app.repositories.affaire_contacts_repository import AffaireContactsRepository
from app.services.laboratoire_org_catalog import (
    agence_for_lab,
    agence_label,
    is_agence_code,
    normalize_org_code,
    org_region_for_lab,
    org_region_label,
)

DEFAULT_CONTACT_REGION = "ARS"
DEFAULT_CONTACT_AGENCE = "RA"

_JUNK_NAME_MARKERS = (
    "cas de test",
    "inséré automatiquement",
    "insert automatiquement",
    "insere automatiquement",
    "test inséré",
    "test insere",
    "validation du parcours",
    "placeholder",
    "lorem ipsum",
    "exemple automatique",
)


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def normalize_contact_key(*parts: str) -> str:
    tokens = [_clean(part).lower() for part in parts if _clean(part)]
    if not tokens:
        return ""
    raw = "|".join(tokens)
    normalized = unicodedata.normalize("NFD", raw)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def build_contact_display_label(
    *,
    full_name: str = "",
    role_label: str = "",
    organisation: str = "",
    phone: str = "",
    email: str = "",
    notes: str = "",
    fallback_text: str = "",
) -> str:
    identity = " — ".join(
        part for part in (_clean(full_name), _clean(role_label), _clean(organisation)) if part
    )
    details = ", ".join(part for part in (_clean(phone), _clean(email), _clean(notes)) if part)
    if identity and details:
        return f"{identity} ({details})"
    if identity:
        return identity
    if details:
        return details
    return _clean(fallback_text)


def parse_intervention_observations(raw: str | None) -> dict:
    if not raw or not isinstance(raw, str):
        return {}
    text = raw.strip()
    if not text.startswith("{"):
        return {}
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


_SKIP_TOKENS = {
    "",
    "-",
    "—",
    "n/a",
    "na",
    "none",
    "null",
    "non communiqué",
    "non communique",
    "à définir",
    "a definir",
    "inconnu",
    "?",
    "...",
    "nc",
    "non renseigné",
    "non renseigne",
}

_PHONE_RE = re.compile(r"(?:\+33|0)[1-9](?:[\s.\-]?\d{2}){4}")
_EMAIL_RE = re.compile(r"[\w.+\-]+@[\w\-]+\.[\w.\-]+")

_PASSATION_ROLE_LABELS = {
    "DEMANDEUR_INITIAL": "Demandeur initial",
    "RCE_CHANTIER": "RCE chantier",
    "REFERENT_RST": "Référent RST",
    "CONTROL_PLAN_AUTHOR": "Auteur plan de contrôle",
    "CONTROL_PLAN_VALIDATOR": "Valideur plan de contrôle",
    "INITIAL_VISIT_OWNER": "Responsable visite initiale",
    "INITIAL_VISIT_RST_PARTICIPANT": "Participant RST visite initiale",
    "INTERVENTION_PLANNER": "Planificateur intervention",
    "TECHNICIAN_ASSIGNER": "Affectation techniciens",
    "LAB_COORDINATOR": "Coordinateur labo",
    "FIELD_COORDINATOR": "Coordinateur terrain",
    "EXTERNAL_TESTS_OWNER": "Responsable essais externes",
    "RESULTS_COORDINATOR": "Coordinateur résultats",
}


def _is_meaningful(value: Any) -> bool:
    text = _clean(value).lower()
    return text not in _SKIP_TOKENS and len(text) >= 2


def _empty_sync_stats() -> dict[str, int]:
    return {"scanned": 0, "synced": 0, "skipped": 0}


def _merge_sync_stats(total: dict[str, int], part: dict[str, int]) -> None:
    for key in total:
        total[key] += int(part.get(key) or 0)


def _affaire_sql_filter(affaire_rst_id: int | None, column: str, params: list[Any]) -> str:
    if affaire_rst_id is None:
        return ""
    params.append(int(affaire_rst_id))
    return f" AND {column} = ?"


_ROLE_PREFIX_LINE_RE = re.compile(
    r"^(MOA|MOE|MOU|RST|RCE|Entreprise|Exploitation|MO\s*/\s*MOE|"
    r"Référent|Referent|Laboratoire|Labo|NGE)\s*[:\-–—]\s*(.+)$",
    re.IGNORECASE,
)

_ORG_ROLE_PREFIXES = frozenset({"moa", "moe", "mou", "entreprise", "exploitation"})


def _parse_contact_line(line: str, *, default_role: str = "Interlocuteur") -> dict[str, str]:
    text = _clean(line)
    if not _is_meaningful(text):
        return {}

    email_match = _EMAIL_RE.search(text)
    phone_match = _PHONE_RE.search(text)
    email = email_match.group(0) if email_match else ""
    phone = phone_match.group(0) if phone_match else ""

    role_match = _ROLE_PREFIX_LINE_RE.match(text)
    if role_match and not phone and not email:
        role_raw = _clean(role_match.group(1))
        role_key = role_raw.lower().replace("é", "e")
        remainder = _clean(role_match.group(2))
        if role_key in _ORG_ROLE_PREFIXES or role_key.startswith("mo/"):
            return {}
        if remainder:
            return {
                "full_name": remainder,
                "role_label": role_raw,
                "organisation": "",
                "phone": "",
                "email": "",
                "notes": "",
            }
        return {}

    working = text
    if email:
        working = working.replace(email, " ")
    if phone:
        working = working.replace(phone, " ")
    working = _clean(working)

    parts = [_clean(part) for part in re.split(r"\s*[—–|]\s*|\s*;\s*", working) if _clean(part)]
    full_name = parts[0] if parts else working
    role_label = default_role
    organisation = ""

    if len(parts) == 2:
        second = parts[1]
        upper = second.upper()
        if upper in {"MOE", "MOA", "MOU", "ENTREPRISE", "EXPLOITATION"}:
            role_label = second
        else:
            organisation = second
    elif len(parts) >= 3:
        role_label = parts[1] or default_role
        organisation = parts[2]

    role_upper = role_label.upper()
    if role_upper in {"MOE", "MOA", "MOU"} and not organisation and len(parts) >= 2:
        organisation = parts[-1] if len(parts) > 1 and parts[-1] != full_name else organisation

    return {
        "full_name": full_name,
        "role_label": role_label,
        "organisation": organisation,
        "phone": phone,
        "email": email,
        "notes": "",
    }


def _parse_free_text_contacts(text: str, *, default_role: str = "Interlocuteur") -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for raw_line in re.split(r"[\n\r]+", text or ""):
        for chunk in re.split(r";", raw_line):
            parsed = _parse_contact_line(chunk, default_role=default_role)
            if parsed:
                items.append(parsed)
    return items


_INITIALS_ONLY_RE = re.compile(
    r"^(?:[A-ZÀ-ÖØ-Þ]\.[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þa-zà-öø-ÿ'\-]{1,})(?:\s*/\s*[A-ZÀ-ÖØ-Þ]\.[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þa-zà-öø-ÿ'\-]{1,})*$"
)


def _normalize_phone_key(phone: str) -> str:
    return re.sub(r"\D+", "", phone or "")


def _is_initials_only(name: str) -> bool:
    text = _clean(name)
    if not text:
        return False
    return bool(_INITIALS_ONLY_RE.match(text))


_ORG_SITE_MARKERS = (
    "chantier",
    "exploitation",
    " ouvrage",
    "ouvrage ",
    " lot ",
    "lot ",
    "travaux",
    "entreprise",
    "groupe ",
    "groupe/",
    "société",
    "societe",
    "direction",
    "service ",
    "maîtrise",
    "maitrise",
    "secteur",
    "atelier",
    "concession",
    "agence ",
)


def _looks_like_person_name(full_name: str) -> bool:
    text = _clean(full_name)
    if not _is_meaningful(text):
        return False
    if _is_initials_only(text):
        return False
    if _ROLE_PREFIX_LINE_RE.match(text):
        role_key = _clean(_ROLE_PREFIX_LINE_RE.match(text).group(1)).lower().replace("é", "e")
        if role_key in _ORG_ROLE_PREFIXES or role_key.startswith("mo/"):
            return False
    lower = text.lower()
    if any(marker in lower for marker in _ORG_SITE_MARKERS):
        return False
    words = [part for part in text.split() if part]
    if not words:
        return False
    if len(words) == 1 and words[0].isupper() and len(words[0]) > 4:
        return False
    if len(words) >= 3 and all(word[:1].isupper() for word in words):
        # Titres longs type « Exploitation chantier GUINTOLI »
        if any(token in lower for token in ("exploitation", "chantier", "travaux", "ouvrage", "lot")):
            return False
    return True


def _is_junk_contact_text(text: str) -> bool:
    lower = _clean(text).lower()
    if not lower:
        return False
    if any(marker in lower for marker in _JUNK_NAME_MARKERS):
        return True
    if len(lower) > 72 and not _EMAIL_RE.search(lower) and not _PHONE_RE.search(lower):
        return True
    return False


def resolve_contact_org(
    *,
    labo_code: str | None = None,
    agence_hint: str | None = None,
    service_code: str | None = None,
    region_hint: str | None = None,
) -> dict[str, str]:
    agence = normalize_org_code(agence_hint) if is_agence_code(agence_hint) else ""
    if not agence and is_agence_code(service_code):
        agence = normalize_org_code(service_code)
    if not agence:
        agence = agence_for_lab(labo_code) or DEFAULT_CONTACT_AGENCE
    region = normalize_org_code(region_hint) if region_hint else ""
    if not region:
        region = org_region_for_lab(labo_code, DEFAULT_CONTACT_REGION) or DEFAULT_CONTACT_REGION
    return {
        "agence_code": agence,
        "region_code": region,
        "agence_label": agence_label(agence),
        "region_label": org_region_label(region),
    }


def _with_contact_org(
    payload: dict,
    *,
    labo_code: str | None = None,
    agence_hint: str | None = None,
    service_code: str | None = None,
) -> dict:
    org = resolve_contact_org(
        labo_code=labo_code,
        agence_hint=agence_hint or payload.get("agence_code"),
        service_code=service_code,
        region_hint=payload.get("region_code"),
    )
    return {**payload, **org}


def _enrich_contact_row(contact: dict | None) -> dict | None:
    if not contact:
        return None
    org = resolve_contact_org(
        labo_code=None,
        agence_hint=contact.get("agence_code"),
        region_hint=contact.get("region_code"),
    )
    enriched = {**contact}
    for key, value in org.items():
        enriched.setdefault(key, value)
    return enriched


def _is_directory_quality(contact: dict) -> bool:
    full_name = _clean(contact.get("full_name"))
    organisation = _clean(contact.get("organisation"))
    phone = _clean(contact.get("phone"))
    email = _clean(contact.get("email"))
    notes = _clean(contact.get("notes"))

    if _is_junk_contact_text(full_name) or _is_junk_contact_text(notes):
        return False
    if "/" in full_name or "/" in organisation:
        return False
    if phone or email:
        return _looks_like_person_name(full_name) or _is_meaningful(organisation)
    if not _looks_like_person_name(full_name):
        return False
    return True


def global_directory_key(contact: dict) -> str:
    phone_key = _normalize_phone_key(contact.get("phone"))
    if len(phone_key) >= 8:
        return f"phone:{phone_key}"
    email = _clean(contact.get("email")).lower()
    if email and "@" in email:
        return f"email:{email}"
    return normalize_contact_key(
        contact.get("full_name"),
        contact.get("organisation"),
    )


def _contact_completeness_score(contact: dict) -> int:
    score = 0
    if _clean(contact.get("phone")):
        score += 4
    if _clean(contact.get("email")):
        score += 4
    if _clean(contact.get("full_name")):
        score += 2
    if _clean(contact.get("organisation")):
        score += 1
    if _clean(contact.get("role_label")):
        score += 1
    score += int(contact.get("use_count") or 0)
    return score


def dedupe_directory_contacts(contacts: list[dict]) -> list[dict]:
    best_by_key: dict[str, dict] = {}
    for contact in contacts:
        if not _is_directory_quality(contact):
            continue
        key = global_directory_key(contact)
        if not key:
            continue
        current = best_by_key.get(key)
        if current is None or _contact_completeness_score(contact) > _contact_completeness_score(current):
            best_by_key[key] = contact
    rows = list(best_by_key.values())
    rows.sort(
        key=lambda item: (
            _clean(item.get("full_name")).lower(),
            _clean(item.get("organisation")).lower(),
        ),
    )
    return rows


def _contact_listing_keys(contact: dict) -> set[str]:
    keys: set[str] = set()
    phone_key = _normalize_phone_key(contact.get("phone"))
    if len(phone_key) >= 8:
        keys.add(f"phone:{phone_key}")
    email = _clean(contact.get("email")).lower()
    if email and "@" in email:
        keys.add(f"email:{email}")
    name_key = normalize_contact_key(_clean(contact.get("full_name")))
    if name_key:
        keys.add(f"name:{name_key}")
    return keys


def _build_existing_contact_index(
    conn: sqlite3.Connection,
    affaire_rst_id: int | None,
) -> dict[int, set[str]]:
    params: list[Any] = []
    sql = """
        SELECT affaire_rst_id, full_name, phone, email
        FROM affaire_contacts
        WHERE trim(COALESCE(full_name, '')) != ''
           OR trim(COALESCE(phone, '')) != ''
           OR trim(COALESCE(email, '')) != ''
    """
    if affaire_rst_id is not None:
        sql += " AND affaire_rst_id = ?"
        params.append(int(affaire_rst_id))
    index: dict[int, set[str]] = {}
    for row in conn.execute(sql, params).fetchall():
        affaire_id = int(row["affaire_rst_id"])
        bucket = index.setdefault(affaire_id, set())
        bucket.update(_contact_listing_keys(dict(row)))
    return index


def _is_already_listed(
    index: dict[int, set[str]],
    affaire_rst_id: int,
    payload: dict,
) -> bool:
    keys = index.get(int(affaire_rst_id), set())
    if not keys:
        return False
    return bool(_contact_listing_keys(payload) & keys)


def _is_dismissed(
    dismissal_index: dict[int, set[str]],
    affaire_rst_id: int,
    payload: dict,
) -> bool:
    keys = dismissal_index.get(int(affaire_rst_id), set())
    if not keys:
        return False
    return bool(_contact_listing_keys(payload) & keys)


def _should_skip_sync_contact(
    existing_index: dict[int, set[str]],
    dismissal_index: dict[int, set[str]],
    affaire_rst_id: int,
    payload: dict,
) -> bool:
    return _is_already_listed(existing_index, affaire_rst_id, payload) or _is_dismissed(
        dismissal_index, affaire_rst_id, payload
    )


def _register_listed(
    index: dict[int, set[str]],
    affaire_rst_id: int,
    payload: dict,
) -> None:
    bucket = index.setdefault(int(affaire_rst_id), set())
    bucket.update(_contact_listing_keys(payload))


def _normalize_stored_role_prefix_contacts(
    conn: sqlite3.Connection,
    affaire_rst_id: int | None,
) -> None:
    params: list[Any] = []
    sql = """
        SELECT id, full_name, role_label
        FROM affaire_contacts
        WHERE instr(COALESCE(full_name, ''), ':') > 0
    """
    if affaire_rst_id is not None:
        sql += " AND affaire_rst_id = ?"
        params.append(int(affaire_rst_id))
    for row in conn.execute(sql, params).fetchall():
        text = _clean(row["full_name"])
        match = _ROLE_PREFIX_LINE_RE.match(text)
        if not match:
            continue
        role_raw = _clean(match.group(1))
        role_key = role_raw.lower().replace("é", "e")
        if role_key in _ORG_ROLE_PREFIXES or role_key.startswith("mo/"):
            continue
        remainder = _clean(match.group(2))
        if not remainder:
            continue
        role_label = _clean(row["role_label"]) or role_raw
        conn.execute(
            """
            UPDATE affaire_contacts
            SET full_name = ?,
                role_label = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
            """,
            (remainder, role_label, int(row["id"])),
        )


class AffaireContactService:
    def __init__(self, repository: AffaireContactsRepository | None = None) -> None:
        self._repo = repository or AffaireContactsRepository()

    def list_contacts(
        self,
        affaire_rst_id: int,
        *,
        q: str = "",
        organisation: str = "",
        role_label: str = "",
    ) -> list[dict]:
        rows = self._repo.list_for_affaire(
            int(affaire_rst_id),
            q=q,
            organisation=organisation,
            role_label=role_label,
        )
        return self._enrich_rows(dedupe_directory_contacts(rows))

    def list_organisations(self, affaire_rst_id: int) -> list[str]:
        return self._repo.list_organisations(int(affaire_rst_id))

    def list_all_contacts(
        self,
        *,
        q: str = "",
        organisation: str = "",
        role_label: str = "",
        affaire_rst_id: int | None = None,
    ) -> list[dict]:
        rows = self._repo.list_all(
            q=q,
            organisation=organisation,
            role_label=role_label,
            affaire_rst_id=affaire_rst_id,
        )
        return self._enrich_rows(dedupe_directory_contacts(rows))

    def list_all_organisations(self, affaire_rst_id: int | None = None) -> list[str]:
        rows = self.list_all_contacts(affaire_rst_id=affaire_rst_id)
        organisations = {_clean(row.get("organisation")) for row in rows if _clean(row.get("organisation"))}
        return sorted(organisations, key=lambda item: item.lower())

    def _enrich_rows(self, rows: list[dict]) -> list[dict]:
        return [row for row in (_enrich_contact_row(item) for item in rows) if row]

    def create_contact(
        self,
        affaire_rst_id: int,
        payload: dict,
        *,
        service_code: str | None = None,
    ) -> dict:
        enriched = _with_contact_org(payload, service_code=service_code)
        record = self._build_record(int(affaire_rst_id), enriched, source_type=enriched.get("source_type") or "manual")
        return _enrich_contact_row(self._repo.upsert(record))

    def update_contact(self, affaire_rst_id: int, contact_id: int, payload: dict) -> dict:
        existing = self._repo.get_by_id(int(contact_id), int(affaire_rst_id))
        if not existing:
            raise ValueError("Contact introuvable.")
        merged = {**existing, **payload}
        record = self._build_record(int(affaire_rst_id), merged, source_type=merged.get("source_type") or existing.get("source_type") or "manual")
        record["id"] = int(contact_id)
        return _enrich_contact_row(self._repo.upsert(record))

    def touch_contact(self, affaire_rst_id: int, contact_id: int) -> dict | None:
        return _enrich_contact_row(self._repo.touch(int(contact_id), int(affaire_rst_id)))

    def delete_contact(
        self,
        affaire_rst_id: int,
        contact_id: int,
        *,
        dismissed_by: str = "",
    ) -> None:
        existing = self._repo.get_by_id(int(contact_id), int(affaire_rst_id))
        if not existing:
            raise ValueError("Contact introuvable.")
        listing_keys = _contact_listing_keys(existing)
        self._repo.register_dismissals(
            int(affaire_rst_id),
            listing_keys,
            full_name=_clean(existing.get("full_name")),
            agence_code=_clean(existing.get("agence_code")),
            dismissed_by=_clean(dismissed_by),
        )
        if not self._repo.delete(int(contact_id), int(affaire_rst_id)):
            raise ValueError("Contact introuvable.")

    def record_from_intervention(
        self,
        conn: sqlite3.Connection,
        *,
        affaire_rst_id: int,
        observations_raw: str | None,
        intervention_id: int | None = None,
        intervention_reference: str = "",
        increment_usage: bool = True,
    ) -> dict | None:
        obs = parse_intervention_observations(observations_raw)
        contact_id = obs.get("prep_contact_id")
        if contact_id not in (None, "", 0):
            try:
                if increment_usage:
                    touched = self._repo.touch(int(contact_id), int(affaire_rst_id), conn=conn)
                    if touched:
                        return touched
                else:
                    existing = self._repo.get_by_id(int(contact_id), int(affaire_rst_id), conn=conn)
                    if existing:
                        return existing
            except (TypeError, ValueError):
                pass

        free_text = _clean(obs.get("prep_contact_chantier"))
        if not free_text:
            return None

        structured_name = _clean(obs.get("prep_contact_name"))
        structured_role = _clean(obs.get("prep_contact_role")) or "Contact chantier / accès"
        structured_org = _clean(obs.get("prep_contact_organisation"))
        structured_phone = _clean(obs.get("prep_contact_phone"))
        structured_email = _clean(obs.get("prep_contact_email"))
        structured_notes = _clean(obs.get("prep_contact_notes"))

        if structured_name or structured_org or structured_phone:
            record = self._build_record(
                int(affaire_rst_id),
                {
                    "full_name": structured_name,
                    "role_label": structured_role,
                    "organisation": structured_org,
                    "phone": structured_phone,
                    "email": structured_email,
                    "notes": structured_notes,
                    "display_label": free_text,
                },
                source_type="intervention",
                source_ref=intervention_reference or (f"intervention:{intervention_id}" if intervention_id else ""),
            )
        else:
            record = self._build_record(
                int(affaire_rst_id),
                {
                    "full_name": "",
                    "role_label": "Contact chantier / accès",
                    "organisation": "",
                    "phone": "",
                    "email": "",
                    "notes": "",
                    "display_label": free_text,
                },
                source_type="intervention",
                source_ref=intervention_reference or (f"intervention:{intervention_id}" if intervention_id else ""),
            )
            record["normalized_key"] = normalize_contact_key("free", free_text)

        if not _is_directory_quality({**record, "source_type": "intervention"}):
            return None

        return self._repo.upsert(record, conn=conn, increment_usage=increment_usage)

    def _record_contact(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int,
        payload: dict,
        *,
        source_type: str,
        source_ref: str,
        increment_usage: bool = False,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
        labo_code: str | None = None,
        agence_hint: str | None = None,
    ) -> bool:
        enriched = _with_contact_org(payload, labo_code=labo_code, agence_hint=agence_hint)
        full_name = _clean(enriched.get("full_name"))
        role_label = _clean(enriched.get("role_label"))
        organisation = _clean(enriched.get("organisation"))
        phone = _clean(enriched.get("phone"))
        email = _clean(enriched.get("email"))
        notes = _clean(enriched.get("notes"))
        has_signal = bool(phone or email or _is_meaningful(full_name) or (_is_meaningful(organisation) and _is_meaningful(role_label)))
        if not has_signal:
            return False
        candidate = {
            "full_name": full_name,
            "role_label": role_label or "Autre",
            "organisation": organisation,
            "phone": phone,
            "email": email,
            "notes": notes,
            "source_type": source_type,
        }
        if not _is_directory_quality(candidate):
            return False
        if existing_index is not None and dismissal_index is not None:
            if _should_skip_sync_contact(existing_index, dismissal_index, affaire_rst_id, candidate):
                return False
        record = self._build_record(
            int(affaire_rst_id),
            enriched,
            source_type=source_type,
            source_ref=source_ref,
        )
        self._repo.upsert(record, conn=conn, increment_usage=increment_usage)
        if existing_index is not None:
            _register_listed(existing_index, affaire_rst_id, candidate)
        return True

    def _scan_record(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int,
        payload: dict,
        *,
        source_type: str,
        source_ref: str,
        stats: dict[str, int],
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
        labo_code: str | None = None,
        agence_hint: str | None = None,
    ) -> None:
        stats["scanned"] += 1
        if self._record_contact(
            conn,
            affaire_rst_id,
            payload,
            source_type=source_type,
            source_ref=source_ref,
            existing_index=existing_index,
            dismissal_index=dismissal_index,
            labo_code=labo_code,
            agence_hint=agence_hint,
        ):
            stats["synced"] += 1
        else:
            stats["skipped"] += 1

    def _sync_affaires(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT a.id, a.reference, a.responsable, a.maitre_ouvrage, a.maitre_oeuvre,
                   (
                       SELECT d.labo_code
                       FROM demandes d
                       WHERE d.affaire_rst_id = a.id
                         AND trim(COALESCE(d.labo_code, '')) != ''
                       ORDER BY d.date_reception DESC, d.id DESC
                       LIMIT 1
                   ) AS labo_code
            FROM affaires_rst a
            WHERE 1 = 1
        """
        sql += _affaire_sql_filter(affaire_rst_id, "a.id", params)
        for row in conn.execute(sql, params).fetchall():
            affaire_id = int(row["id"])
            ref = str(row["reference"] or "")
            labo_code = _clean(row["labo_code"])
            responsable = _clean(row["responsable"])
            if _is_meaningful(responsable):
                parsed_items = _parse_free_text_contacts(responsable, default_role="Responsable affaire")
                if parsed_items:
                    for item in parsed_items:
                        self._scan_record(
                            conn,
                            affaire_id,
                            item,
                            source_type="affaire",
                            source_ref=f"affaire:{ref}:responsable",
                            stats=stats,
                            existing_index=existing_index,
                            dismissal_index=dismissal_index,
                            labo_code=labo_code,
                        )
                else:
                    self._scan_record(
                        conn,
                        affaire_id,
                        {"full_name": responsable, "role_label": "Responsable affaire"},
                        source_type="affaire",
                        source_ref=f"affaire:{ref}:responsable",
                        stats=stats,
                        existing_index=existing_index,
                        dismissal_index=dismissal_index,
                        labo_code=labo_code,
                    )
            for item in _parse_free_text_contacts(row["maitre_ouvrage"], default_role="MOA"):
                self._scan_record(
                    conn,
                    affaire_id,
                    item,
                    source_type="affaire",
                    source_ref=f"affaire:{ref}:maitre_ouvrage",
                    stats=stats,
                    existing_index=existing_index,
                    dismissal_index=dismissal_index,
                    labo_code=labo_code,
                )
            for item in _parse_free_text_contacts(row["maitre_oeuvre"], default_role="MOE"):
                self._scan_record(
                    conn,
                    affaire_id,
                    item,
                    source_type="affaire",
                    source_ref=f"affaire:{ref}:maitre_oeuvre",
                    stats=stats,
                    existing_index=existing_index,
                    dismissal_index=dismissal_index,
                    labo_code=labo_code,
                )
        return stats

    def _sync_interventions(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT i.id, i.reference, i.observations, d.affaire_rst_id, d.labo_code
            FROM interventions i
            INNER JOIN demandes d ON d.id = i.demande_id
            WHERE d.affaire_rst_id IS NOT NULL
              AND trim(COALESCE(i.observations, '')) LIKE '%prep_contact_chantier%'
        """
        sql += _affaire_sql_filter(affaire_rst_id, "d.affaire_rst_id", params)
        for row in conn.execute(sql, params).fetchall():
            stats["scanned"] += 1
            affaire_id = int(row["affaire_rst_id"])
            labo_code = _clean(row["labo_code"])
            obs = parse_intervention_observations(row["observations"])
            candidate = {
                "full_name": _clean(obs.get("prep_contact_name")),
                "role_label": _clean(obs.get("prep_contact_role")) or "Contact chantier / accès",
                "organisation": _clean(obs.get("prep_contact_organisation")),
                "phone": _clean(obs.get("prep_contact_phone")),
                "email": _clean(obs.get("prep_contact_email")),
            }
            if existing_index is not None and dismissal_index is not None:
                if _should_skip_sync_contact(existing_index, dismissal_index, affaire_id, candidate):
                    stats["skipped"] += 1
                    continue
            result = self.record_from_intervention(
                conn,
                affaire_rst_id=affaire_id,
                observations_raw=row["observations"],
                intervention_id=int(row["id"]),
                intervention_reference=str(row["reference"] or ""),
                increment_usage=False,
            )
            if result:
                if existing_index is not None:
                    _register_listed(existing_index, affaire_id, {
                        "full_name": result.get("full_name"),
                        "phone": result.get("phone"),
                        "email": result.get("email"),
                    })
                stats["synced"] += 1
            else:
                stats["skipped"] += 1
        return stats

    def _purge_directory_noise(self, conn: sqlite3.Connection, affaire_rst_id: int | None) -> None:
        params: list[Any] = []
        sql = """
            DELETE FROM affaire_contacts
            WHERE instr(COALESCE(full_name, ''), '/') > 0
               OR instr(COALESCE(organisation, ''), '/') > 0
               OR lower(COALESCE(full_name, '')) LIKE '%chantier%'
               OR lower(COALESCE(full_name, '')) LIKE '%exploitation%'
               OR lower(COALESCE(full_name, '')) LIKE 'moa :%'
               OR lower(COALESCE(full_name, '')) LIKE 'moe :%'
               OR lower(COALESCE(full_name, '')) LIKE 'mou :%'
               OR lower(COALESCE(full_name, '')) LIKE 'entreprise :%'
               OR lower(COALESCE(full_name, '')) LIKE '%cas de test%'
               OR lower(COALESCE(full_name, '')) LIKE '%inséré automatiquement%'
               OR lower(COALESCE(full_name, '')) LIKE '%insere automatiquement%'
               OR lower(COALESCE(full_name, '')) LIKE '%validation du parcours%'
        """
        if affaire_rst_id is not None:
            sql += " AND affaire_rst_id = ?"
            params.append(int(affaire_rst_id))
        conn.execute(sql, params)

    def _sync_demandes(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT id, reference, demandeur, societe_interne, service_interne,
                   observations, affaire_rst_id, labo_code
            FROM demandes
            WHERE affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "affaire_rst_id", params)
        for row in conn.execute(sql, params).fetchall():
            affaire_id = int(row["affaire_rst_id"])
            demande_ref = str(row["reference"] or "")
            labo_code = _clean(row["labo_code"])
            demandeur = _clean(row["demandeur"])
            if _is_meaningful(demandeur):
                self._scan_record(
                    conn,
                    affaire_id,
                    {
                        "full_name": demandeur,
                        "role_label": "Demandeur",
                        "organisation": _clean(row["societe_interne"]) or _clean(row["service_interne"]),
                    },
                    source_type="demande",
                    source_ref=f"demande:{demande_ref}:demandeur",
                    stats=stats,
                    existing_index=existing_index,
                    dismissal_index=dismissal_index,
                    labo_code=labo_code,
                )
            for item in _parse_free_text_contacts(row["observations"], default_role="Contact demande"):
                self._scan_record(
                    conn,
                    affaire_id,
                    item,
                    source_type="demande",
                    source_ref=f"demande:{demande_ref}:observations",
                    stats=stats,
                    existing_index=existing_index,
                    dismissal_index=dismissal_index,
                    labo_code=labo_code,
                )
        return stats

    def _sync_demande_preparations(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT dp.id, d.reference AS demande_ref, d.affaire_rst_id, d.labo_code,
                   dp.responsable_referent, dp.attribue_a,
                   dp.responsable_innovation, dp.responsable_travaux,
                   dp.responsable_controle, dp.responsable_suivi
            FROM demande_preparations dp
            INNER JOIN demandes d ON d.id = dp.demande_id
            WHERE d.affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "d.affaire_rst_id", params)
        role_fields = (
            ("responsable_referent", "Référent RST"),
            ("attribue_a", "Attribué à"),
            ("responsable_innovation", "Responsable innovation"),
            ("responsable_travaux", "Responsable travaux"),
            ("responsable_controle", "Responsable contrôle"),
            ("responsable_suivi", "Responsable suivi"),
        )
        for row in conn.execute(sql, params).fetchall():
            affaire_id = int(row["affaire_rst_id"])
            demande_ref = str(row["demande_ref"] or "")
            labo_code = _clean(row["labo_code"])
            for field, role in role_fields:
                name = _clean(row[field])
                if not _is_meaningful(name):
                    continue
                self._scan_record(
                    conn,
                    affaire_id,
                    {"full_name": name, "role_label": role},
                    source_type="demande_preparation",
                    source_ref=f"demande:{demande_ref}:{field}",
                    stats=stats,
                    existing_index=existing_index,
                    dismissal_index=dismissal_index,
                    labo_code=labo_code,
                )
        return stats

    def _sync_passations(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT id, reference, affaire_rst_id, interlocuteurs_principaux,
                   responsable, entreprise_responsable, agence
            FROM passations
            WHERE affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "affaire_rst_id", params)
        for row in conn.execute(sql, params).fetchall():
            affaire_id = int(row["affaire_rst_id"])
            ref = str(row["reference"] or "")
            agence_hint = _clean(row["agence"])
            for item in _parse_free_text_contacts(row["interlocuteurs_principaux"], default_role="Interlocuteur"):
                self._scan_record(
                    conn,
                    affaire_id,
                    item,
                    source_type="passation",
                    source_ref=f"passation:{ref}:interlocuteur",
                    stats=stats,
                    existing_index=existing_index,
                    dismissal_index=dismissal_index,
                    agence_hint=agence_hint,
                )
            responsable = _clean(row["responsable"])
            if _is_meaningful(responsable):
                parsed_items = _parse_free_text_contacts(responsable, default_role="Responsable passation")
                if parsed_items:
                    for item in parsed_items:
                        item.setdefault("organisation", _clean(row["entreprise_responsable"]))
                        self._scan_record(
                            conn,
                            affaire_id,
                            item,
                            source_type="passation",
                            source_ref=f"passation:{ref}:responsable",
                            stats=stats,
                            existing_index=existing_index,
                            dismissal_index=dismissal_index,
                            agence_hint=agence_hint,
                        )
                else:
                    self._scan_record(
                        conn,
                        affaire_id,
                        {
                            "full_name": responsable,
                            "role_label": "Responsable passation",
                            "organisation": _clean(row["entreprise_responsable"]),
                        },
                        source_type="passation",
                        source_ref=f"passation:{ref}:responsable",
                        stats=stats,
                        existing_index=existing_index,
                        dismissal_index=dismissal_index,
                        agence_hint=agence_hint,
                    )
        return stats

    def _sync_passation_participants(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT pp.id, pp.participant_role, pp.full_name, pp.organisation,
                   pp.email, pp.phone, pp.comment,
                   p.reference AS passation_ref, p.affaire_rst_id, p.agence
            FROM passation_participants pp
            INNER JOIN passations p ON p.id = pp.passation_id
            WHERE p.affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "p.affaire_rst_id", params)
        for row in conn.execute(sql, params).fetchall():
            self._scan_record(
                conn,
                int(row["affaire_rst_id"]),
                {
                    "full_name": row["full_name"],
                    "role_label": row["participant_role"] or "Participant passation",
                    "organisation": row["organisation"],
                    "phone": row["phone"],
                    "email": row["email"],
                    "notes": row["comment"],
                },
                source_type="passation_participant",
                source_ref=f"passation:{row['passation_ref']}:participant:{row['id']}",
                stats=stats,
                existing_index=existing_index,
                dismissal_index=dismissal_index,
                agence_hint=_clean(row["agence"]),
            )
        return stats

    def _sync_passation_roles(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT pra.id, pra.role_code, pra.assignee, pra.comment,
                   p.reference AS passation_ref, p.affaire_rst_id, p.agence
            FROM passation_role_assignments pra
            INNER JOIN passations p ON p.id = pra.passation_id
            WHERE p.affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "p.affaire_rst_id", params)
        for row in conn.execute(sql, params).fetchall():
            role_code = _clean(row["role_code"])
            role_label = _PASSATION_ROLE_LABELS.get(role_code, role_code or "Rôle passation")
            self._scan_record(
                conn,
                int(row["affaire_rst_id"]),
                {
                    "full_name": row["assignee"],
                    "role_label": role_label,
                    "notes": row["comment"],
                },
                source_type="passation_role",
                source_ref=f"passation:{row['passation_ref']}:role:{row['id']}",
                stats=stats,
                existing_index=existing_index,
                dismissal_index=dismissal_index,
                agence_hint=_clean(row["agence"]),
            )
        return stats

    def _sync_passation_actions(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT pa.id, pa.responsable, pa.action_label, pa.commentaire,
                   p.reference AS passation_ref, p.affaire_rst_id, p.agence
            FROM passation_actions pa
            INNER JOIN passations p ON p.id = pa.passation_id
            WHERE p.affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "p.affaire_rst_id", params)
        for row in conn.execute(sql, params).fetchall():
            self._scan_record(
                conn,
                int(row["affaire_rst_id"]),
                {
                    "full_name": row["responsable"],
                    "role_label": "Responsable action passation",
                    "notes": _clean(row["action_label"]) + (f" — {row['commentaire']}" if _clean(row["commentaire"]) else ""),
                },
                source_type="passation_action",
                source_ref=f"passation:{row['passation_ref']}:action:{row['id']}",
                stats=stats,
                existing_index=existing_index,
                dismissal_index=dismissal_index,
                agence_hint=_clean(row["agence"]),
            )
        return stats

    def _sync_passation_startup(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT psi.id, psi.item_code, psi.owner_role_code, psi.owner_name, psi.notes,
                   p.reference AS passation_ref, p.affaire_rst_id, p.agence
            FROM passation_startup_items psi
            INNER JOIN passations p ON p.id = psi.passation_id
            WHERE p.affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "p.affaire_rst_id", params)
        for row in conn.execute(sql, params).fetchall():
            role_code = _clean(row["owner_role_code"])
            role_label = _PASSATION_ROLE_LABELS.get(role_code, role_code or "Démarrage passation")
            self._scan_record(
                conn,
                int(row["affaire_rst_id"]),
                {
                    "full_name": row["owner_name"],
                    "role_label": role_label,
                    "notes": row["notes"] or row["item_code"],
                },
                source_type="passation_startup",
                source_ref=f"passation:{row['passation_ref']}:startup:{row['id']}",
                stats=stats,
                existing_index=existing_index,
                dismissal_index=dismissal_index,
                agence_hint=_clean(row["agence"]),
            )
        return stats

    def _sync_campagnes(
        self,
        conn: sqlite3.Connection,
        affaire_rst_id: int | None,
        existing_index: dict[int, set[str]] | None = None,
        dismissal_index: dict[int, set[str]] | None = None,
    ) -> dict[str, int]:
        stats = _empty_sync_stats()
        params: list[Any] = []
        sql = """
            SELECT c.id, c.reference, d.affaire_rst_id, d.labo_code,
                   c.responsable_technique, c.responsable_innovation,
                   c.responsable_travaux, c.responsable_controle, c.responsable_suivi
            FROM campagnes c
            INNER JOIN demandes d ON d.id = c.demande_id
            WHERE d.affaire_rst_id IS NOT NULL
        """
        sql += _affaire_sql_filter(affaire_rst_id, "d.affaire_rst_id", params)
        role_fields = (
            ("responsable_technique", "Responsable technique"),
            ("responsable_innovation", "Responsable innovation"),
            ("responsable_travaux", "Responsable travaux"),
            ("responsable_controle", "Responsable contrôle"),
            ("responsable_suivi", "Responsable suivi"),
        )
        for row in conn.execute(sql, params).fetchall():
            affaire_id = int(row["affaire_rst_id"])
            campagne_ref = str(row["reference"] or "")
            labo_code = _clean(row["labo_code"])
            for field, role in role_fields:
                name = _clean(row[field])
                if not _is_meaningful(name):
                    continue
                self._scan_record(
                    conn,
                    affaire_id,
                    {"full_name": name, "role_label": role},
                    source_type="campagne",
                    source_ref=f"campagne:{campagne_ref}:{field}",
                    stats=stats,
                    existing_index=existing_index,
                    dismissal_index=dismissal_index,
                    labo_code=labo_code,
                )
        return stats

    def sync_all_sources(self, affaire_rst_id: int | None = None) -> dict[str, Any]:
        from app.core.database import connect_db

        total = _empty_sync_stats()
        sources: dict[str, dict[str, int]] = {}
        sync_steps = (
            ("affaires", self._sync_affaires),
            ("demandes", self._sync_demandes),
            ("demande_preparations", self._sync_demande_preparations),
            ("campagnes", self._sync_campagnes),
            ("passations", self._sync_passations),
            ("passation_participants", self._sync_passation_participants),
            ("passation_roles", self._sync_passation_roles),
            ("passation_actions", self._sync_passation_actions),
            ("passation_startup", self._sync_passation_startup),
            ("interventions", self._sync_interventions),
        )

        with connect_db(self._repo.db_path) as conn:
            self._purge_directory_noise(conn, affaire_rst_id)
            _normalize_stored_role_prefix_contacts(conn, affaire_rst_id)
            existing_index = _build_existing_contact_index(conn, affaire_rst_id)
            dismissal_index = self._repo.list_dismissal_keys(affaire_rst_id, conn=conn)
            for name, handler in sync_steps:
                step_stats = handler(conn, affaire_rst_id, existing_index, dismissal_index)
                sources[name] = step_stats
                _merge_sync_stats(total, step_stats)
            conn.commit()

        return {**total, "sources": sources}

    def sync_from_interventions(self, affaire_rst_id: int | None = None) -> dict[str, int]:
        return self.sync_all_sources(affaire_rst_id)

    def _build_record(self, affaire_rst_id: int, payload: dict, *, source_type: str, source_ref: str = "") -> dict:
        full_name = _clean(payload.get("full_name"))
        role_label = _clean(payload.get("role_label"))
        organisation = _clean(payload.get("organisation"))
        phone = _clean(payload.get("phone"))
        email = _clean(payload.get("email"))
        notes = _clean(payload.get("notes"))
        display_label = _clean(payload.get("display_label")) or build_contact_display_label(
            full_name=full_name,
            role_label=role_label,
            organisation=organisation,
            phone=phone,
            email=email,
            notes=notes,
        )
        normalized_key = _clean(payload.get("normalized_key")) or normalize_contact_key(
            full_name,
            role_label,
            organisation,
            phone,
            email,
            display_label,
        )
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        org = resolve_contact_org(
            labo_code=payload.get("labo_code"),
            agence_hint=payload.get("agence_code"),
            region_hint=payload.get("region_code"),
        )
        return {
            "affaire_rst_id": int(affaire_rst_id),
            "full_name": full_name,
            "role_label": role_label,
            "organisation": organisation,
            "phone": phone,
            "email": email,
            "notes": notes,
            "display_label": display_label,
            "normalized_key": normalized_key,
            "agence_code": org["agence_code"],
            "region_code": org["region_code"],
            "source_type": _clean(source_type) or "manual",
            "source_ref": _clean(source_ref or payload.get("source_ref")),
            "use_count": int(payload.get("use_count") or 0),
            "last_used_at": payload.get("last_used_at") or now,
        }

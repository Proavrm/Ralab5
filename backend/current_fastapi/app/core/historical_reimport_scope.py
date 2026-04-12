"""Shared helpers for historical reimport affaire scope."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Mapping

CANONICAL_AFFAIRE_SUFFIX_WIDTH = 3
DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES: dict[int, tuple[int, int]] = {
    2025: (1, 16),
    2026: (1, 24),
}

_RA_AFFAIRE_REFERENCE_PATTERN = re.compile(
    r"^(?P<year>20\d{2})-RA-?(?P<suffix>\d+)$",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class ParsedRaAffaireReference:
    raw: str
    year: int
    suffix: int
    raw_suffix_width: int

    @property
    def canonical(self) -> str:
        return f"{self.year}-RA-{self.suffix:0{CANONICAL_AFFAIRE_SUFFIX_WIDTH}d}"

    @property
    def is_canonical(self) -> bool:
        return self.raw == self.canonical


def parse_ra_affaire_reference(value: str | None) -> ParsedRaAffaireReference | None:
    text = (value or "").strip().upper()
    if not text:
        return None
    match = _RA_AFFAIRE_REFERENCE_PATTERN.fullmatch(text)
    if match is None:
        return None
    suffix_raw = match.group("suffix")
    return ParsedRaAffaireReference(
        raw=text,
        year=int(match.group("year")),
        suffix=int(suffix_raw),
        raw_suffix_width=len(suffix_raw),
    )


def canonicalize_ra_affaire_reference(value: str | None) -> str | None:
    parsed = parse_ra_affaire_reference(value)
    if parsed is None:
        return None
    return parsed.canonical


def is_kept_ra_affaire_reference(
    value: str | None,
    keep_ranges: Mapping[int, tuple[int, int]] | None = None,
) -> bool:
    parsed = parse_ra_affaire_reference(value)
    if parsed is None:
        return False
    bounds = (keep_ranges or DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES).get(parsed.year)
    if bounds is None:
        return False
    lower, upper = bounds
    return lower <= parsed.suffix <= upper


def describe_keep_ranges(
    keep_ranges: Mapping[int, tuple[int, int]] | None = None,
) -> dict[str, dict[str, int | str]]:
    description: dict[str, dict[str, int | str]] = {}
    for year, (lower, upper) in sorted((keep_ranges or DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES).items()):
        description[str(year)] = {
            "min_suffix": lower,
            "max_suffix": upper,
            "min_reference": f"{year}-RA-{lower:0{CANONICAL_AFFAIRE_SUFFIX_WIDTH}d}",
            "max_reference": f"{year}-RA-{upper:0{CANONICAL_AFFAIRE_SUFFIX_WIDTH}d}",
        }
    return description
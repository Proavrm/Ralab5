# GLOBAL ESSAI IMPORTER ENGINE - Architectural Overview

## Vision

**NOT** "DE importer adapted for SC"  
**IS** a reusable **GLOBAL orchestration pattern** for importing all essai types.

## Problem Solved

Before: Each essai type (DE, SC, etc.) would need its own:
- Hierarchy resolution logic (Demande → Campagne → Intervention find/create)
- Reference prediction logic
- Already-imported filtering
- Temporal grouping for proposals

Result: **duplicated logic across 5+ essai types** = maintenance nightmare, inconsistent behavior.

## Solution: Unified Core Engine

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│          GLOBAL IMPORTER ENGINE (import_essais_base.py)     │
├─────────────────────────────────────────────────────────────┤
│ Core Functions (shared by ALL types):                       │
│  • _resolve_affaire_context() - affaire lookup/matching     │
│  • _find_demandes_by_affaire()                              │
│  • _find_campagnes_by_demande()                             │
│  • _find_interventions_by_campagne()                        │
│  • _predict_references() - generate D/C/I sequences         │
│  • group_rows_by_temporal_gap() - demande/campagne grouping │
└─────────────────────────────────────────────────────────────┘
         ▲                           ▲                    ▲
         │                           │                    │
         │ imports + uses            │                    │
    ┌────┴──────┐         ┌──────────┴─────┐     ┌────────┴─────┐
    │     DE    │         │       SC       │     │   Triaxial   │ (future)
    │  (v1)     │         │     (v1)       │     │    (v2)      │
    └───────────┘         └────────────────┘     └──────────────┘
    • DE extractor        • SC extractor         • Triaxial extractor
    • DE-specific form    • SC-specific form     • Triaxial form
    • DE preview endpoint • SC preview endpoint  • Triaxial preview endpoint
    • DE materialize      • SC materialize       • Triaxial materialize
```

### How Each Type Works

**Example: DE (Densités Enrobés)**

```python
# import_essais_de.py

from import_essais_base import (
    _resolve_affaire_context,
    _find_demandes_by_affaire,
    _predict_references,
    group_rows_by_temporal_gap,
)

def _preview_de_workbook(...):
    """Type-specific preview using shared core."""
    # 1. Use BASE to resolve affaire context
    affaire_context = _resolve_affaire_context(conn, affaire_ref, affaire_nge)
    
    # 2. Use BASE to find existing hierarchy
    demandes = _find_demandes_by_affaire(conn, hierarchy_key)
    
    # 3. DE-specific: extract DE headers from Excel
    sheets = _extract_de_header(ws)  # ← ONLY this is DE-specific
    
    # 4. Use BASE to group sheets and predict refs
    demande_groups = group_rows_by_temporal_gap(sheets, 120)
    predictions = _predict_references(conn, demande_groups, 7)
    
    # 5. Return preview to frontend (same structure as SC)
    return { proposals, affaire_context, ... }
```

**Example: SC (Sondage Carotté)**

```python
# import_essais_sc.py

from import_essais_base import (
    _resolve_affaire_context,
    _find_demandes_by_affaire,
    _predict_references,
    group_rows_by_temporal_gap,
)

def _preview_sc_workbook(...):
    """Type-specific preview using shared core."""
    # 1. Use BASE to resolve affaire context
    affaire_context = _resolve_affaire_context(conn, affaire_ref, affaire_nge)
    
    # 2. Use BASE to find existing hierarchy
    demandes = _find_demandes_by_affaire(conn, hierarchy_key)
    
    # 3. SC-specific: extract SC headers from Excel (different cell positions!)
    sheets = _extract_sc_header(ws)  # ← ONLY this is SC-specific
    
    # 4. Use BASE to group sheets and predict refs
    demande_groups = group_rows_by_temporal_gap(sheets, 120)
    predictions = _predict_references(conn, demande_groups, 7)
    
    # 5. Return preview to frontend (same structure as DE!)
    return { proposals, affaire_context, ... }
```

**Example: Future Type (Triaxial)**

```python
# import_essais_triaxial.py (NEW)

from import_essais_base import (
    _resolve_affaire_context,
    _find_demandes_by_affaire,
    _predict_references,
    group_rows_by_temporal_gap,
)

def _preview_triaxial_workbook(...):
    """Triaxial preview using same shared core."""
    # 1-2. Same as DE/SC
    affaire_context = _resolve_affaire_context(...)
    demandes = _find_demandes_by_affaire(...)
    
    # 3. Triaxial-specific: extract Triaxial headers
    sheets = _extract_triaxial_header(ws)  # ← NEW extractor
    
    # 4-5. Use BASE core again
    demande_groups = group_rows_by_temporal_gap(sheets, 120)
    predictions = _predict_references(conn, demande_groups, 7)
    return { proposals, affaire_context, ... }
```

## Frontend Unification

Single import block in `ToolsPage.jsx` with type selector:

```jsx
<select value={importEssaiType} onChange={...}>
  <option value="DE">DE - Densités</option>
  <option value="SC">SC - Sondage Carotté</option>
  <option value="TRIAXIAL">Triaxial (future)</option>
</select>

// Same preview UI for all types:
// - proposals structure identical (demandes_count, campagnes_count, interventions_count)
// - predicted_intervention_references extracted from backend responses
// - already_imported filtering consistent
```

## Benefits

| Aspect | Before (Duplicated) | After (Unified) |
|--------|---------------------|-----------------|
| Hierarchy logic | Duplicated in DE + SC + ... | 1 copy in `base.py` |
| Reference prediction | Duplicated in DE + SC + ... | 1 copy in `base.py` |
| Filter already-imported | Duplicated in DE + SC + ... | 1 copy in `base.py` |
| Add new type (e.g., Triaxial) | Copy all hierarchy + filtering code | Just write `_extract_triaxial_header()` + form |
| Preview consistency | Risk of drift between types | Guaranteed same via shared core |
| Bug fixes | Fix in 1 type, forget in others | Fix once in base, all types benefit |

## Module Layout

```
backend/current_fastapi/api/
├── import_essais_base.py          ← SHARED (core orchestration)
├── import_essais_de.py            ← Type-specific (DE extractor + endpoints)
├── import_essais_sc.py            ← Type-specific (SC extractor + endpoints)
└── import_essais_triaxial.py      ← Type-specific (Triaxial extractor + endpoints) [FUTURE]
```

## Next Steps

1. ✅ **Base module created** (`import_essais_base.py`)
   - Shared: affaire resolution, hierarchy lookup, ref prediction, temporal grouping

2. ⏳ **Refactor DE** (`import_essais_de.py`)
   - Import base functions
   - Remove duplicated hierarchy/prediction logic
   - Keep DE-specific: `_extract_de_header()`, `_extract_de_payload()`, form validation

3. ⏳ **Refactor SC** (`import_essais_sc.py`)
   - Import base functions
   - Remove duplicated hierarchy/prediction logic  
   - Keep SC-specific: `_extract_sc_header()`, `_extract_sc_payload()`, form validation

4. ⏳ **Validate** both types work identically via shared core

5. ✏️ **Document extractor interface** for future types (template for new essai types)

6. 🚀 **When ready**: Add Triaxial, IPI, etc. by implementing only:
   - `_extract_<type>_header()`
   - `_extract_<type>_payload()`
   - Type-specific form (React)
   - Type-specific DB insertion (if needed)

## Key Principle

> **"Add a new essai type = write 1 extractor + 1 form. Everything else is provided by the global engine."**

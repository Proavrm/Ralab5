# Handoff DE -> General Runtime/Report Architecture (2026-05-01)

## Current status (DE)

DE workflow is now split into 3 clear areas:

- `ModeleBasePage`:
  - builds/edits DE feuille model and DE rapport model,
  - supports multiple model versions,
  - controls model approval state.
- `WorkDePage`:
  - management-only page (no runtime edition),
  - creates work document from selected approved model,
  - associates approved rapport model,
  - validates and publishes runtime package.
- `FeuilleDeRuntimePage`:
  - execution-only page for technicians,
  - loads DB values + published model structure,
  - saves runtime values,
  - computes DE fields,
  - opens report.

Report:

- `RapportDEPage` remains the rendering page.
- Runtime/report opening now supports explicit context contract:
  - `source_kind`
  - `source_id`
  - `source_family`
  - `source_uid`
  - optional explicit context IDs (`demande_id`, `intervention_id`, `campagne_id`, `feuille_uid`)

## Routes

DE report now has a dedicated view route for explicit-context opening:

- `GET /rapports/de/view?...` (new preferred route)
- `GET /rapports/de/:essaiId` (legacy/backward-compatible route)

## Navigation and toolbar behavior

### Feuille runtime toolbar

- top bar = navigation/context only:
  - retour
  - demande / intervention / campagne links
  - debug styling (amber) when IDs are missing
- bottom bar = actions:
  - enregistrer
  - imprimer / ouvrir rapport

### Rapport toolbar (work mode)

- added navigation bar with:
  - retour
  - feuille
  - demande
  - intervention
  - campagne
- explicit context IDs are consumed first;
- fallback lookup used only when explicit context is unavailable.

## Campaign dedicated page

Added dedicated campaign page:

- route: `GET /campagnes/:uid`
- frontend page: `CampaignPage`
- backend endpoint: `GET /api/intervention-campaigns/{uid}`
- page includes:
  - campaign configuration editing,
  - linked interventions list,
  - quick open per intervention,
  - "Nouvelle intervention" with campaign-prefilled context.

Demand page updates:

- `Configurer la campagne` now opens `CampaignPage`.
- `Nouvelle campagne` creates campaign then redirects to `CampaignPage`.
- legacy campaign modal flow removed from active usage.

## Data compatibility fixes applied for DE

- Date parsing in runtime accepts broader formats.
- Runtime alias normalization maps legacy imported keys:
  - `criteria_vides_min/max` -> `criteria_void_min/max`
  - `date_essai_raw` -> `date_essai`
  - `conclusion` -> `conclusion_courte`

## What should be generalized next

This DE implementation is now the reference template to replicate by type (SC, next types).

### Recommended generic contracts

1. Work publication (by code/type, not DE-only):
   - `publishRuntimeByCode(code, payload)`
   - `getRuntimePublicationByCode(code)`

2. Runtime page pattern per type:
   - execution-only behavior
   - explicit context contract in report opening
   - type-specific alias mapper + compute rules

3. Report open contract (shared):
   - route form: `/rapports/<code>/view`
   - query:
     - `source_kind`
     - `source_id`
     - optional context IDs

4. Navigation debug policy:
   - show context links always
   - amber visual state when required ID is missing.

## Recommended implementation order (DE -> generic)

Use this order to reduce regressions and keep features mergeable.

1. **Generic publication storage contract**
   - create `publishRuntimeByCode(code, payload)` and `getRuntimePublicationByCode(code)`,
   - keep DE wrappers (`publishRuntimeDE`, `getRuntimePublicationDE`) as compatibility aliases.

2. **Generic report open contract**
   - standardize `/rapports/<code>/view`,
   - require `source_kind` + `source_id`,
   - keep legacy routes for compatibility.

3. **Type runtime adapters**
   - extract per-type alias normalizers (`normalizeMetaAliases<Code>`),
   - extract per-type computed fields logic (`applyComputedFields<Code>`),
   - keep runtime pages execution-only.

4. **Work pages alignment by type**
   - enforce explicit model selection when needed,
   - keep creation/association/validation/publication only in Work pages,
   - no runtime editing blocks inside Work pages.

5. **Report navigation consistency**
   - include unified top nav on report runtime mode:
     - retour, feuille, demande, intervention, campagne,
   - consume explicit query IDs first, fallback only when needed.

6. **Campaign and context consistency**
   - ensure all flows pass `demande_id/intervention_id/campagne_id/feuille_uid` explicitly,
   - keep debug visual state when context is missing.

7. **Apply pattern to next type (SC first)**
   - replicate DE contract to SC,
   - verify same separation:
     - `ModeleBase` (modeling),
     - `Work` (publish),
     - `Runtime` (execution),
     - `Rapport` (rendering).

8. **Cleanup phase**
   - remove deprecated route/legacy parsing only after all callers migrated,
   - remove dead modal/legacy UI blocks once replacement pages are stable.

## Important implementation principle kept

Runtime pages do not perform:

- model management,
- approval,
- association,
- version choice.

Those remain in Work pages.

## Operator instruction sheet (program usage)

This is the practical operating sequence for current DE flow.

### A) Build and approve models

1. Open `ModeleBasePage` for DE.
2. Create/edit feuille model and rapport model.
3. Approve the versions that must be used in production.

### B) Publish active runtime package

1. Open `WorkDePage`.
2. Select approved feuille model explicitly.
3. Create work document from model.
4. Associate approved rapport model.
5. Validate document to publish active runtime package.

### C) Technician execution

1. Open a DE terrain sheet (runtime entry).
2. Runtime page loads:
   - published approved structure,
   - DB values from the target feuille.
3. Fill/update values.
4. Save (`Enregistrer`).
5. Open report (`Imprimer / Ouvrir rapport`).

### D) Navigation rules (runtime/report)

- Top bar is for navigation/context.
- Bottom actions are execution actions.
- If a context button is amber/disabled, required ID is missing and context should be checked.

### E) Campaign usage

- `Configurer la campagne` from demande opens dedicated `CampaignPage`.
- `Nouvelle campagne` creates campaign and redirects to `CampaignPage`.
- Campaign page supports:
  - campaign update,
  - intervention list,
  - quick "Nouvelle intervention" with campaign prefill.

### F) Troubleshooting quick checks

1. Wrong feuille/report opened:
   - verify Work publication used intended approved model + rapport pair.
2. Missing navigation links:
   - verify explicit context IDs are passed in report open URL.
3. Empty criteria/dates:
   - verify payload aliases and date normalization in runtime adapter.


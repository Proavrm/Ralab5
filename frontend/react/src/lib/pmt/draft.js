import { normalizePmtRuntimeValues } from './normalize'

function createDefaultRows() {
  return [
    { id: 1, point: 'P1', profondeur_macrotexture_mm: '', observation: '' },
    { id: 2, point: 'P2', profondeur_macrotexture_mm: '', observation: '' },
    { id: 3, point: 'P3', profondeur_macrotexture_mm: '', observation: '' },
  ]
}

export function createDefaultPmtDraft() {
  return normalizePmtRuntimeValues({
    meta: {
      reference_chantier: '',
      date_essai: '',
      emplacement: '',
      criteria_pmt_min: 0.8,
      criteria_conformity_min_pct: 80,
    },
    points_rows: createDefaultRows(),
  })
}

export function buildPmtDraftFromModel(modelDefinition = null) {
  if (!modelDefinition?.values) return createDefaultPmtDraft()
  return normalizePmtRuntimeValues(modelDefinition.values)
}

export function buildPmtDraftFromPublication(publication = null, fallbackModel = null) {
  const snapshotValues = publication?.model_snapshot?.values || publication?.model_snapshot
  if (snapshotValues && typeof snapshotValues === 'object') {
    return normalizePmtRuntimeValues(snapshotValues)
  }
  return buildPmtDraftFromModel(fallbackModel)
}

/** Noms et libellés laboratoires / agences — source : GET /admin/labs (BD). */
import { normalizeLaboCode } from '@/lib/labGeo'

export function buildLaboratoireCatalog(laboratoires = [], orgRegions = []) {
  const byCode = new Map()
  for (const lab of laboratoires) {
    const code = normalizeLaboCode(lab.code)
    if (!code) continue
    byCode.set(code, {
      code,
      name: String(lab.name || lab.nom || code).trim(),
      agence_code: String(lab.agence_code || '').trim().toUpperCase(),
      agence_label: String(lab.agence_label || '').trim(),
      region: String(lab.region || lab.rst_region || '').trim().toUpperCase(),
      region_label: String(lab.region_label || lab.rst_region_label || '').trim(),
      is_active: lab.is_active !== false,
      raw: lab,
    })
  }

  const agenceByCode = new Map()
  for (const region of orgRegions) {
    for (const agence of region.agences || []) {
      agenceByCode.set(String(agence.code || '').trim().toUpperCase(), {
        code: agence.code,
        label: agence.label,
        region_code: region.code,
        region_label: region.label,
      })
    }
  }

  return { byCode, agenceByCode, list: laboratoires, orgRegions }
}

export function labDisplayName(code, catalog) {
  const key = normalizeLaboCode(code)
  if (!key) return ''
  const entry = catalog?.byCode?.get(key)
  return entry?.name || key
}

export function labDisplayLine(code, catalog) {
  const key = normalizeLaboCode(code)
  if (!key) return ''
  const entry = catalog?.byCode?.get(key)
  if (!entry) return key
  return `${entry.code} — ${entry.name}`
}

export function agenceDisplayLabel(code, catalog) {
  const key = String(code || '').trim().toUpperCase()
  if (!key) return ''
  return catalog?.agenceByCode?.get(key)?.label || key
}

/** Ligne type « SP — Saint-Priest · agence RA (Rhône-Ain) » depuis la BD. */
export function formatLabOrgLine(labOrCode, catalog) {
  const code = typeof labOrCode === 'string' ? normalizeLaboCode(labOrCode) : normalizeLaboCode(labOrCode?.code)
  const entry = catalog?.byCode?.get(code)
  if (!entry) return code || '—'

  const parts = [`${entry.code} — ${entry.name}`]
  if (entry.agence_code) {
    const agLabel = entry.agence_label || agenceDisplayLabel(entry.agence_code, catalog)
    parts.push(`agence ${entry.agence_code}${agLabel && agLabel !== entry.agence_code ? ` (${agLabel})` : ''}`)
  }
  return parts.join(' · ')
}

export function activeLaboratoires(catalog) {
  return (catalog?.list || []).filter((lab) => lab.is_active !== false)
}

export function labCodesFromCatalog(catalog) {
  return activeLaboratoires(catalog).map((lab) => normalizeLaboCode(lab.code)).filter(Boolean)
}

const SPECIAL_LABO_LABELS = {
  RST: 'RST / G3',
}

/** Nom affiché d'un code labo (alias AUV → PDC, libellés fonctionnels RST). */
export function resolveLaboDisplayName(code, catalog) {
  const raw = String(code || '').trim().toUpperCase()
  if (!raw) return ''
  if (SPECIAL_LABO_LABELS[raw]) return SPECIAL_LABO_LABELS[raw]
  if (raw === 'AUV') return labDisplayName('PDC', catalog) || raw
  return labDisplayName(code, catalog) || raw
}

export function buildLaboSelectOptions(catalog, extraCodes = []) {
  const options = []
  const seen = new Set()

  for (const lab of activeLaboratoires(catalog)) {
    const code = normalizeLaboCode(lab.code)
    if (!code || seen.has(code)) continue
    seen.add(code)
    options.push({ code, label: labDisplayLine(code, catalog) })
  }

  if (!seen.has('AUV')) {
    const pdcName = resolveLaboDisplayName('PDC', catalog)
    if (pdcName) {
      options.push({ code: 'AUV', label: `${pdcName} (AUV)` })
      seen.add('AUV')
    }
  }

  for (const code of extraCodes) {
    const key = String(code || '').trim().toUpperCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    options.push({ code: key, label: resolveLaboDisplayName(key, catalog) || key })
  }

  return options
}

/** Options filtre planning (noms BD + valeurs déjà présentes dans le feed). */
export function buildPlanningLabFilterOptions(items = [], catalog) {
  const names = activeLaboratoires(catalog)
    .map((lab) => String(lab.name || lab.code || '').trim())
    .filter(Boolean)
  const fromData = items.map((item) => String(item.labo || '').trim()).filter(Boolean)
  return ['', ...new Set([...names, ...fromData])].sort((a, b) => a.localeCompare(b, 'fr'))
}

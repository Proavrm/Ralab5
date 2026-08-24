/**
 * Densité d’affichage RaLab — confortable / compact / auto (viewport).
 */

export const UI_DENSITY_PREF_KEY = 'ralab5.uiDensity'
export const UI_DENSITY_PREFS = ['auto', 'comfortable', 'compact']
export const UI_DENSITY_AUTO_MQ = '(max-width: 1440px), (max-height: 900px)'

export function loadUiDensityPreference() {
  try {
    const raw = String(window.localStorage.getItem(UI_DENSITY_PREF_KEY) || '').trim().toLowerCase()
    if (UI_DENSITY_PREFS.includes(raw)) return raw
  } catch {
    // ignore
  }
  return 'auto'
}

export function saveUiDensityPreference(pref) {
  const next = UI_DENSITY_PREFS.includes(pref) ? pref : 'auto'
  try {
    window.localStorage.setItem(UI_DENSITY_PREF_KEY, next)
  } catch {
    // ignore
  }
  return next
}

export function cycleUiDensityPreference(current) {
  const idx = UI_DENSITY_PREFS.indexOf(current)
  const next = UI_DENSITY_PREFS[(idx + 1) % UI_DENSITY_PREFS.length]
  return saveUiDensityPreference(next)
}

export function resolveUiDensity(preference, matchesCompactViewport = false) {
  if (preference === 'compact') return 'compact'
  if (preference === 'comfortable') return 'comfortable'
  return matchesCompactViewport ? 'compact' : 'comfortable'
}

export function uiDensityPreferenceLabel(pref) {
  if (pref === 'compact') return 'Compact'
  if (pref === 'comfortable') return 'Confort'
  return 'Auto'
}

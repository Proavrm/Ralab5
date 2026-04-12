import { hasAllPermissions, hasAnyPermission, hasRole } from '@/lib/permissions'

export const DASHBOARD_WIDGETS = [
  {
    id: 'overview-metrics',
    title: 'Indicateurs globaux',
    description: 'Vue synthetique sur les volumes, urgences et alertes du moment.',
    permissionsAny: ['view_dashboard'],
  },
  {
    id: 'module-shortcuts',
    title: 'Acces rapides',
    description: 'Acces contextuels vers les modules prioritaires du moment.',
    permissionsAny: ['view_dashboard'],
  },
  {
    id: 'planning-focus',
    title: 'Pilotage et planning',
    description: 'Demandes a cadrer, arbitrages et echeances a tenir a court terme.',
    permissionsAny: ['view_demandes', 'view_planning'],
  },
  {
    id: 'quality-compliance',
    title: 'Qualite et conformite',
    description: 'NC, metrologie, documents, equipements et relais qualite a connecter.',
    permissionsAny: ['view_dashboard'],
  },
  {
    id: 'lab-overview',
    title: 'Laboratoire',
    description: 'Receptions, paillasse, clotures, resultats et relais labo a connecter.',
    permissionsAny: ['view_labo'],
  },
  {
    id: 'terrain-passations',
    title: 'Terrain et passations',
    description: 'Interventions, retards, passations, transmissions et relais terrain a connecter.',
    permissionsAny: ['view_labo'],
  },
]

const DEFAULT_WIDGETS_BY_ROLE = {
  admin: [
    'overview-metrics',
    'module-shortcuts',
    'planning-focus',
    'quality-compliance',
    'lab-overview',
    'terrain-passations',
  ],
  labo: [
    'overview-metrics',
    'module-shortcuts',
    'planning-focus',
    'lab-overview',
    'terrain-passations',
  ],
  etudes: [
    'overview-metrics',
    'module-shortcuts',
    'planning-focus',
    'quality-compliance',
  ],
  consult: [
    'overview-metrics',
    'module-shortcuts',
    'planning-focus',
  ],
}

export function canUseDashboardWidget(user, widget) {
  if (!widget) return false
  if (!hasRole(user, widget.roles)) return false
  if (!hasAnyPermission(user, widget.permissionsAny)) return false
  if (!hasAllPermissions(user, widget.permissionsAll)) return false
  return true
}

export function getAvailableDashboardWidgets(user) {
  return DASHBOARD_WIDGETS.filter((widget) => canUseDashboardWidget(user, widget))
}

export function getDefaultDashboardWidgetIds(user) {
  const roleCode = String(user?.role_code || user?.role || '').trim().toLowerCase()
  const fallbackIds = DASHBOARD_WIDGETS.map((widget) => widget.id)
  const rolePreset = DEFAULT_WIDGETS_BY_ROLE[roleCode] || fallbackIds
  const availableIds = new Set(getAvailableDashboardWidgets(user).map((widget) => widget.id))

  const filteredPreset = rolePreset.filter((widgetId) => availableIds.has(widgetId))
  if (filteredPreset.length > 0) return filteredPreset

  return fallbackIds.filter((widgetId) => availableIds.has(widgetId))
}

export function getDashboardPresetLabel(user) {
  const roleCode = String(user?.role_code || user?.role || '').trim().toLowerCase()

  return {
    admin: 'Preset pilotage',
    labo: 'Preset laboratoire',
    etudes: 'Preset etudes',
    consult: 'Preset consultation',
  }[roleCode] || 'Preset standard'
}
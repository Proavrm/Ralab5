/** Périmètre orga utilisateur — région ARS, agences, labos SP/PDC. */
import { getRegionalRstTitle, isRegionalRstUser } from '@/lib/userOrgScope'

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function buildDashboardDescription(roleCode, serviceCode) {
  if (isRegionalRstUser({ service_code: serviceCode })) {
    return 'Vue région ARS — périmètre SP et PDC (Référent Scientifique et Technique).'
  }

  if (roleCode === 'admin') {
    return 'Vue configurable de pilotage global pour RaLab5.'
  }

  if (roleCode === 'labo') {
    return serviceCode && !['RST', 'ARS'].includes(serviceCode)
      ? `Portail du laboratoire ${serviceCode} centre sur les arrivages, la reception et les essais.`
      : 'Portail de production et coordination laboratoire.'
  }

  if (roleCode === 'etudes') {
    return 'Vue configurable de preparation, planning et suivi etudes.'
  }

  if (roleCode === 'consult') {
    return 'Vue configurable de consultation et de suivi synthetique.'
  }

  return 'Vue configurable de pilotage global RaLab5.'
}

function buildDashboardTitle(roleCode, serviceCode) {
  if (isRegionalRstUser({ service_code: serviceCode })) return getRegionalRstTitle()
  if (roleCode === 'admin') return 'Dashboard de pilotage'
  if (roleCode === 'labo' && serviceCode && !['RST', 'ARS'].includes(serviceCode)) return `Laboratoire ${serviceCode}`
  if (roleCode === 'labo') return 'Portail laboratoire'
  if (roleCode === 'etudes') return 'Dashboard etudes'
  if (roleCode === 'consult') return 'Dashboard consultation'
  return 'Dashboard transverse'
}

export function getUserHomeConfig(user) {
  const roleCode = String(user?.role_code || user?.role || '').trim().toLowerCase()
  const serviceCode = normalizeCode(user?.service_code || user?.service)

  return {
    path: roleCode === 'labo' ? '/labo' : '/dashboard',
    navLabel: roleCode === 'labo' ? 'Mon laboratoire' : 'Mon dashboard',
    title: buildDashboardTitle(roleCode, serviceCode),
    description: buildDashboardDescription(roleCode, serviceCode),
  }
}

export function getUserHomeRoute(user) {
  return getUserHomeConfig(user).path
}
export function getUserPermissions(user) {
  return Array.isArray(user?.permissions)
    ? user.permissions.filter(Boolean)
    : []
}

export function hasPermission(user, permissionCode) {
  if (!permissionCode) return true
  return getUserPermissions(user).includes(permissionCode)
}

export function hasAnyPermission(user, permissionCodes = []) {
  if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) return true
  return permissionCodes.some((permissionCode) => hasPermission(user, permissionCode))
}

export function hasAllPermissions(user, permissionCodes = []) {
  if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) return true
  return permissionCodes.every((permissionCode) => hasPermission(user, permissionCode))
}

export function hasRole(user, roleCodes = []) {
  if (!Array.isArray(roleCodes) || roleCodes.length === 0) return true
  const roleCode = String(user?.role_code || user?.role || '').trim().toLowerCase()
  return roleCodes.includes(roleCode)
}
import { useState, useCallback } from 'react'
import { authApi } from '@/services/api'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('ralab_user')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return {
        ...parsed,
        role: parsed.role ?? parsed.role_code ?? '',
        role_code: parsed.role_code ?? parsed.role ?? '',
        service: parsed.service ?? parsed.service_code ?? '',
        service_code: parsed.service_code ?? parsed.service ?? '',
        employment_level_code: parsed.employment_level_code ?? '',
        employment_level_label: parsed.employment_level_label ?? '',
        permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
      }
    } catch { return null }
  })

  const isAuthenticated = !!localStorage.getItem('ralab_token')

  const login = useCallback(async (identifier, accessKey) => {
    const payload = {}
    if (identifier) payload.identifier = identifier
    if (accessKey) payload.access_key = accessKey
    const data = await authApi.login(payload)
    localStorage.setItem('ralab_token', data.token)
    const userInfo = {
      email: data.user.email,
      display_name: data.user.display_name,
      role: data.user.role_code,
      role_code: data.user.role_code,
      service: data.user.service_code,
      service_code: data.user.service_code,
      employment_level_code: data.user.employment_level_code || '',
      employment_level_label: data.user.employment_level_label || '',
      permissions: data.user.permissions || [],
    }
    localStorage.setItem('ralab_user', JSON.stringify(userInfo))
    setUser(userInfo)
    return userInfo
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('ralab_token')
    localStorage.removeItem('ralab_user')
    setUser(null)
    window.location.href = '/login'
  }, [])

  return { user, isAuthenticated, login, logout }
}
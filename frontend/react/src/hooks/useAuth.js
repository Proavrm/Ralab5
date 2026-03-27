import { useState, useCallback } from 'react'
import { authApi } from '@/services/api'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('ralab_user')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })

  const isAuthenticated = !!localStorage.getItem('ralab_token')

  const login = useCallback(async (identifier) => {
    const data = await authApi.login({ identifier })
    localStorage.setItem('ralab_token', data.token)
    const userInfo = {
      email: data.user.email,
      display_name: data.user.display_name,
      role: data.user.role_code,
      service: data.user.service_code,
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
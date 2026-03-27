/**
 * hooks/useAuth.js
 * Hook de autenticação — JWT em localStorage.
 */
import { useState, useCallback } from 'react'
import { authApi } from '@/services/api'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('ralab_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const isAuthenticated = !!localStorage.getItem('ralab_token')

  const login = useCallback(async (username, password) => {
    const data = await authApi.login({ username, password })
    localStorage.setItem('ralab_token', data.access_token)
    const userInfo = { username: data.username, role: data.role, display_name: data.display_name }
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

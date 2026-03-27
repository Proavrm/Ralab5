import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { authApi } from '@/services/api'

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  // Auto-hint USERNAME Windows
  useEffect(() => {
    authApi.hint()
      .then(data => { if (data?.windows_username) setIdentifier(data.windows_username) })
      .catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(identifier)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Utilisateur introuvable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-purple-500 mb-4">
            <span className="text-white font-bold text-xl">R5</span>
          </div>
          <h1 className="text-2xl font-bold text-text">RaLab5</h1>
          <p className="text-text-muted text-sm mt-1">Laboratoire Géotechnique NGE</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">
                Identifiant
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="px-3 py-2 border border-border rounded text-sm outline-none focus:border-accent bg-bg transition-colors"
                placeholder="marco ou marco@nge.fr"
                required
                autoFocus
              />
              <p className="text-xs text-text-muted">
                Username Windows ou email
              </p>
            </div>

            {error && (
              <p className="text-danger text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !identifier}
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-medium text-sm rounded transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs mt-4">
          RaLab5 v0.1.0 — NGE Géotechnique
        </p>
      </div>
    </div>
  )
}
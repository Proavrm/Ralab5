import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { authApi, clearAuthSessionLocal } from '@/services/api'
import Button from '@/components/ui/Button'
import { DASHBOARD_HERO_BG, PAGE_BG } from '@/components/layout/FicheLayout'
import { ArrowRight, Building2, ShieldCheck, UserRound } from 'lucide-react'

const ROLE_LABELS = {
  admin: 'Administrateur',
  labo: 'Laboratoire',
  etudes: 'Études',
  consult: 'Consultation',
}

const ROLE_SUMMARIES = {
  admin: 'Pilotage global, navigation complète et supervision des modules.',
  labo: 'Échantillons, essais, résultats et suivi opérationnel du laboratoire.',
  etudes: "Demandes, affaires, planning et préparation des dossiers d'études.",
  consult: 'Lecture, suivi synthétique et consultation contrôlée des données.',
}

const ROLE_TONES = {
  admin: 'bg-[#eef3fa] border-[#c5d4ea] text-nge',
  labo: 'bg-[#eef5e6] border-[#d4e4c1] text-[#3b6d11]',
  etudes: 'bg-[#fbf1e2] border-[#ecd1a2] text-[#854f0b]',
  consult: 'bg-[#f4f1eb] border-[#e4ddd3] text-[#5f5e5a]',
}

function normalizeValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchesIdentifier(user, identifier) {
  const normalizedIdentifier = normalizeValue(identifier)
  if (!normalizedIdentifier) return true

  const email = normalizeValue(user?.email)
  const emailPrefix = normalizeValue((user?.email || '').split('@')[0])
  const displayName = normalizeValue(user?.display_name)
  const nameParts = displayName.split(/[ ._-]+/).filter(Boolean)

  return (
    email.includes(normalizedIdentifier)
    || emailPrefix === normalizedIdentifier
    || displayName.includes(normalizedIdentifier)
    || nameParts.includes(normalizedIdentifier)
  )
}

function roleLabel(roleCode) {
  return ROLE_LABELS[roleCode] || roleCode || 'Utilisateur'
}

function roleSummary(roleCode) {
  return ROLE_SUMMARIES[roleCode] || 'Connexion vers un espace de travail personnalisé.'
}

function roleTone(roleCode) {
  return ROLE_TONES[roleCode] || 'bg-[#f4f1eb] border-[#e4ddd3] text-[#5f5e5a]'
}

function IdentityPill({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  )
}

function IdentityButton({ user, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(user.email)}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-white px-3.5 py-3 text-left transition hover:border-nge/20 hover:bg-[#f3f6fb]"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eef3fa] text-nge">
        <UserRound size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{user.display_name}</p>
        <p className="truncate text-xs text-text-muted">{user.email}</p>
        {user.employment_level_label ? (
          <p className="mt-1 text-[11px] leading-5 text-[#7a5b27]">{user.employment_level_label}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <IdentityPill className={roleTone(user.role_code)}>{roleLabel(user.role_code)}</IdentityPill>
          {user.service_code ? (
            <IdentityPill className="border-border bg-bg text-text-muted">{user.service_code}</IdentityPill>
          ) : null}
        </div>
      </div>
    </button>
  )
}

function resolveAutoIdentifier(hint) {
  if (!hint || hint.auth_mode !== 'passwordless') return ''
  return String(hint.matched_email || hint.windows_username || '').trim()
}

let loginBootstrapCache = null

async function fetchLoginBootstrap() {
  if (loginBootstrapCache) return loginBootstrapCache

  loginBootstrapCache = (async () => {
    const data = await authApi.hint().catch(() => null)

    // Annuaire public uniquement en mode passwordless explicite (proxy/access_key → 401).
    if (!data || data.auth_mode !== 'passwordless') {
      return { hint: data, users: [] }
    }

    const directory = await authApi.users().catch(() => [])
    const users = [...(Array.isArray(directory) ? directory : [])].sort((left, right) =>
      String(left.display_name || '').localeCompare(String(right.display_name || ''), 'fr-FR')
    )
    return { hint: data || null, users }
  })()

  try {
    return await loginBootstrapCache
  } catch (error) {
    loginBootstrapCache = null
    throw error
  }
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState(null)
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)

  useEffect(() => {
    let active = true
    clearAuthSessionLocal()

    async function loadLoginContext() {
      try {
        const { hint: data, users: sorted } = await fetchLoginBootstrap()
        if (!active) return
        setHint(data)
        setUsers(sorted)
        const autoIdentifier = resolveAutoIdentifier(data)
        if (autoIdentifier) {
          setIdentifier(autoIdentifier)
        }
      } finally {
        if (!active) return
        setUsersLoading(false)
      }
    }

    loadLoginContext()

    return () => { active = false }
  }, [])

  const authMode = hint?.auth_mode
  const isProxyMode = authMode === 'proxy'
  const isAccessKeyMode = authMode === 'access_key'

  const selectedUser = useMemo(() => {
    const normalizedIdentifier = normalizeValue(identifier)
    if (!normalizedIdentifier) return null
    const fromList = users.find((user) => matchesIdentifier(user, normalizedIdentifier))
    if (fromList) return fromList
    if (hint?.matched_email && normalizeValue(hint.matched_email) === normalizedIdentifier) {
      return {
        email: hint.matched_email,
        display_name: hint.matched_name || hint.matched_email,
        role_code: '',
        service_code: '',
      }
    }
    return null
  }, [hint, identifier, users])

  const suggestedUsers = useMemo(() => {
    if (isProxyMode || isAccessKeyMode || !users.length) return []
    const normalizedIdentifier = normalizeValue(identifier)
    const filtered = normalizedIdentifier
      ? users.filter((user) => matchesIdentifier(user, identifier))
      : users
    return filtered.slice(0, 6)
  }, [identifier, isAccessKeyMode, isProxyMode, users])

  const accessKeyAllowsAllUsers = isAccessKeyMode && hint?.access_key_allows_all_users

  function applyIdentifier(value) {
    setIdentifier(value)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      clearAuthSessionLocal()
      await login(
        isProxyMode ? undefined : identifier,
        isAccessKeyMode ? accessKey : undefined,
      )
      loginBootstrapCache = null
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Utilisateur introuvable')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'rounded-xl border border-border bg-white px-3.5 py-3 text-sm outline-none transition-colors focus:border-nge'

  return (
    <div className="min-h-screen text-text" style={{ background: PAGE_BG }}>
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <section
          className="relative hidden overflow-hidden border-r border-nge/10 lg:flex"
          style={{ background: DASHBOARD_HERO_BG }}
        >
          <div className="absolute right-0 bottom-0 w-[220px] h-2 bg-nge-yellow rounded-tl-full" />
          <div className="relative flex flex-col justify-center p-10 text-white xl:p-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">NGE Géotechnique</p>
            <h1 className="mt-4 text-4xl font-black leading-tight">RaLab5</h1>
            <p className="mt-4 max-w-sm text-sm leading-7 text-white/80">
              Connexion à l'espace de travail — demandes, laboratoire, terrain et qualité.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md space-y-4">
            <div className="rounded-[20px] border border-border bg-white p-6 shadow-[0_10px_34px_rgba(0,49,112,0.08)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-nge text-lg font-black text-white">
                  R5
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted lg:hidden">NGE Géotechnique</p>
                  <h2 className="text-xl font-black text-nge min-h-[28px]">Connexion</h2>
                  {selectedUser ? (
                    <p className="mt-0.5 text-sm font-semibold text-text">{selectedUser.display_name}</p>
                  ) : null}
                </div>
              </div>

              <p className="mt-3 text-sm text-text-muted">
                {isProxyMode
                  ? "Le serveur vérifie votre identité avant l'entrée dans RaLab5."
                  : isAccessKeyMode
                    ? 'Email professionnel et clé de test pour accéder à RaLab5.'
                    : 'Identifiez-vous pour entrer dans votre espace.'}
              </p>

              {isProxyMode ? (
                <div className="mt-4 rounded-xl border border-border bg-bg p-3 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Identité serveur</p>
                  <p className="mt-1 font-medium">{hint?.proxy_identity || 'Non transmise'}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {hint?.can_auto_login
                      ? `Accès validé${hint?.matched_name ? ` pour ${hint.matched_name}` : ''}.`
                      : 'Aucun utilisateur RaLab5 associé à cette identité.'}
                  </p>
                </div>
              ) : isAccessKeyMode ? (
                <div className="mt-4 rounded-xl border border-border bg-bg p-3 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Mode test externe</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {accessKeyAllowsAllUsers
                      ? 'Test hors VPN — tous les utilisateurs actifs acceptés.'
                      : 'Test hors VPN — emails autorisés uniquement.'}
                  </p>
                </div>
              ) : hint?.windows_username ? (
                <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-border bg-bg p-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Poste détecté</p>
                    <p className="mt-1 text-sm font-medium">{hint.windows_username}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyIdentifier(hint.matched_email || hint.windows_username)}
                    className="shrink-0 rounded-full border border-nge/20 bg-[#eef3fa] px-3 py-1 text-xs font-medium text-nge hover:bg-[#e3ecf8]"
                  >
                    Utiliser
                  </button>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
                {isProxyMode ? (
                  <p className="rounded-xl border border-border bg-bg px-3.5 py-3 text-xs text-text-muted">
                    Accès piloté par le serveur — aucun annuaire public exposé.
                  </p>
                ) : isAccessKeyMode ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium">Email professionnel</label>
                      <input
                        type="email"
                        name="ralab_email"
                        value={identifier}
                        onChange={(event) => applyIdentifier(event.target.value)}
                        className={inputClass}
                        placeholder="crigo@guintoli.fr"
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium">Clé d&apos;accès</label>
                      <input
                        type="password"
                        value={accessKey}
                        onChange={(event) => {
                          setAccessKey(event.target.value)
                          setError('')
                        }}
                        className={inputClass}
                        placeholder="clé de test"
                        required
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Identifiant</label>
                    <input
                      type="text"
                      name="ralab_identifier"
                      value={identifier}
                      onChange={(event) => applyIdentifier(event.target.value)}
                      className={inputClass}
                      placeholder="marco ou marco@nge.fr"
                      required
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <p className="text-xs text-text-muted">Email professionnel ou identifiant Windows (local)</p>
                  </div>
                )}

                {selectedUser && !isAccessKeyMode ? (
                  <div className="rounded-xl border border-border bg-bg p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef3fa] text-nge">
                        <Building2 size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{selectedUser.display_name}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedUser.role_code ? (
                            <IdentityPill className={roleTone(selectedUser.role_code)}>
                              {roleLabel(selectedUser.role_code)}
                            </IdentityPill>
                          ) : null}
                          {selectedUser.service_code ? (
                            <IdentityPill className="border-border bg-white text-text-muted">
                              {selectedUser.service_code}
                            </IdentityPill>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs text-text-muted">{roleSummary(selectedUser.role_code)}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>
                ) : null}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full justify-center py-3"
                  disabled={
                    loading
                    || (isProxyMode ? !hint?.can_auto_login : false)
                    || (!isProxyMode && !identifier)
                    || (isAccessKeyMode && !accessKey)
                  }
                >
                  {loading ? 'Connexion…' : isProxyMode ? 'Entrer via le serveur' : isAccessKeyMode ? 'Entrer avec la clé' : 'Entrer dans RaLab5'}
                  {!loading ? <ArrowRight size={15} /> : null}
                </Button>
              </form>
            </div>

            {isProxyMode || isAccessKeyMode ? (
              <div className="rounded-[20px] border border-border bg-white p-4 text-xs text-text-muted">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-nge" />
                  <p>
                    {isProxyMode
                      ? 'Instance internet sécurisée — accès filtré par le serveur.'
                      : 'Test externe temporaire — clé partagée, usage limité.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[20px] border border-border bg-white p-4">
                <p className="text-sm font-semibold">Utilisateurs actifs</p>
                <p className="mt-1 text-xs text-text-muted">Sélection rapide</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {usersLoading ? (
                    <p className="text-xs text-text-muted sm:col-span-2">Chargement…</p>
                  ) : suggestedUsers.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-4 text-xs text-text-muted sm:col-span-2">
                      Aucun profil pour cette recherche.
                    </p>
                  ) : (
                    suggestedUsers.map((user) => (
                      <IdentityButton key={user.email} user={user} onSelect={applyIdentifier} />
                    ))
                  )}
                </div>
              </div>
            )}

            <p className="text-center text-xs text-text-muted">RaLab5 v0.1.0</p>
          </div>
        </section>
      </div>
    </div>
  )
}

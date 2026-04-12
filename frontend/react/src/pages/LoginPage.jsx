import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { authApi } from '@/services/api'
import {
  ArrowRight,
  Briefcase,
  Building2,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'

const ROLE_LABELS = {
  admin: 'Administrateur',
  labo: 'Laboratoire',
  etudes: 'Études',
  consult: 'Consultation',
}

const ROLE_SUMMARIES = {
  admin: 'Pilotage global, navigation complète et supervision des modules.',
  labo: 'Échantillons, essais, résultats et suivi opérationnel du laboratoire.',
  etudes: 'Demandes, affaires, planning et préparation des dossiers d’études.',
  consult: 'Lecture, suivi synthétique et consultation contrôlée des données.',
}

const ROLE_TONES = {
  admin: 'bg-[#eef6fd] border-[#cfe4f6] text-[#185fa5]',
  labo: 'bg-[#eef5e6] border-[#d4e4c1] text-[#3b6d11]',
  etudes: 'bg-[#fbf1e2] border-[#ecd1a2] text-[#854f0b]',
  consult: 'bg-[#f4f1eb] border-[#e4ddd3] text-[#5f5e5a]',
}

const DASHBOARD_PANELS = [
  {
    icon: Briefcase,
    title: 'Pilotage',
    text: 'Demandes, planning, passations et arbitrage global.',
    tone: 'border-[#cfe4f6] bg-[#eef6fd] text-[#185fa5]',
  },
  {
    icon: FlaskConical,
    title: 'Laboratoire',
    text: 'Échantillons, essais, résultats et production terrain/labo.',
    tone: 'border-[#d4e4c1] bg-[#eef5e6] text-[#3b6d11]',
  },
  {
    icon: ShieldCheck,
    title: 'Conformité',
    text: 'Métrologie, alertes qualité et suivi des non-conformités.',
    tone: 'border-[#ecd1a2] bg-[#fbf1e2] text-[#854f0b]',
  },
]

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
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-white px-3.5 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eef6fd] text-[#185fa5]">
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
            <IdentityPill className="border-[#d9ddd7] bg-[#f6f7f3] text-[#5f5e5a]">{user.service_code}</IdentityPill>
          ) : null}
        </div>
      </div>
    </button>
  )
}

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState(null)
  const [hintLoading, setHintLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    let active = true

    async function loadLoginContext() {
      let authMode = 'passwordless'

      setHintLoading(true)
      setUsersLoading(true)

      try {
        const data = await authApi.hint().catch(() => null)
        if (!active) return

        setHint(data || null)
        authMode = data?.auth_mode || authMode

        if (!identifier && authMode === 'passwordless' && (data?.matched_email || data?.windows_username)) {
          setIdentifier(data.matched_email || data.windows_username)
        }

        if (authMode === 'proxy' || authMode === 'access_key') {
          setUsers([])
          return
        }

        const directory = await authApi.users().catch(() => [])
        if (!active) return

        const sorted = [...(Array.isArray(directory) ? directory : [])].sort((left, right) =>
          String(left.display_name || '').localeCompare(String(right.display_name || ''), 'fr-FR')
        )
        setUsers(sorted)
      } finally {
        if (!active) return
        setHintLoading(false)
        setUsersLoading(false)
      }
    }

    loadLoginContext()

    return () => { active = false }
  }, [])

  const authMode = hint?.auth_mode || 'passwordless'
  const isProxyMode = authMode === 'proxy'
  const isAccessKeyMode = authMode === 'access_key'

  const hintedUser = useMemo(() => {
    if (!hint?.matched_email) return null
    return users.find((user) => user.email === hint.matched_email) || {
      email: hint.matched_email,
      display_name: hint.matched_name || hint.matched_email,
      role_code: '',
      service_code: '',
    }
  }, [hint, users])

  const selectedUser = useMemo(() => {
    const normalizedIdentifier = normalizeValue(identifier)
    if (!normalizedIdentifier) return hintedUser
    return users.find((user) => matchesIdentifier(user, normalizedIdentifier)) || hintedUser
  }, [hintedUser, identifier, users])

  const suggestedUsers = useMemo(() => {
    if (isProxyMode || isAccessKeyMode || !users.length) return []
    const filtered = users.filter((user) => matchesIdentifier(user, identifier))
    return filtered.slice(0, 6)
  }, [identifier, isAccessKeyMode, isProxyMode, users])

  const accessKeyAllowsAllUsers = isAccessKeyMode && hint?.access_key_allows_all_users
  const greeting = isProxyMode ? 'Accès serveur' : isAccessKeyMode ? 'Connexion sécurisée' : selectedUser ? 'Bonjour' : 'Connexion'

  function applyIdentifier(value) {
    setIdentifier(value)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(
        isProxyMode ? undefined : identifier,
        isAccessKeyMode ? accessKey : undefined,
      )
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Utilisateur introuvable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#efece4] text-text">
      <div className="grid min-h-screen lg:grid-cols-[1.12fr_0.88fr]">
        <section
          className="relative hidden overflow-hidden border-r border-[#234e51]/10 lg:flex"
          style={{
            background: [
              'radial-gradient(circle at top left, rgba(246, 205, 120, 0.24), transparent 28%)',
              'radial-gradient(circle at bottom right, rgba(94, 170, 156, 0.22), transparent 34%)',
              'linear-gradient(135deg, #17343a 0%, #24555d 46%, #8d5e32 100%)',
            ].join(', '),
          }}
        >
          <div className="relative flex w-full flex-col justify-between p-10 text-white xl:p-12">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur-sm">
                <Sparkles size={14} />
                Point d’entrée dashboard
              </div>
              <h1 className="mt-8 max-w-xl text-4xl font-semibold leading-tight">
                RaLab5 commence par une connexion qui prépare l’espace de chaque utilisateur.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/78">
                Cette page sert déjà de base au futur fonctionnement: chacun entre par son dashboard, avec des accès, des priorités et une navigation adaptés à son rôle.
              </p>
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              {DASHBOARD_PANELS.map((panel) => {
                const Icon = panel.icon
                return (
                  <div key={panel.title} className={`rounded-[20px] border p-4 backdrop-blur-sm ${panel.tone}`}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/60">
                      <Icon size={18} />
                    </div>
                    <p className="mt-4 text-sm font-semibold">{panel.title}</p>
                    <p className="mt-2 text-xs leading-6 opacity-85">{panel.text}</p>
                  </div>
                )
              })}
            </div>

            <div className="rounded-[20px] border border-white/15 bg-white/10 p-4 text-sm leading-6 text-white/78 backdrop-blur-sm">
              À terme, la sidebar générique pourra disparaître pour les profils standard; l’entrée principale deviendra le dashboard personnel de chacun.
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-4 sm:p-6 lg:p-10">
          <div className="w-full max-w-xl space-y-4">
            <div className="rounded-[24px] border border-[#d9ddd7] bg-white/85 p-5 shadow-[0_14px_40px_rgba(37,53,53,0.06)] backdrop-blur-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#17343a_0%,#24555d_55%,#8d5e32_100%)] text-xl font-bold text-white">
                    R5
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-text">
                    {hintLoading ? 'Connexion...' : `${greeting}${selectedUser?.display_name ? `, ${selectedUser.display_name}` : ''}`}
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    {isProxyMode
                      ? 'Le serveur vérifie votre identité avant l’entrée dans RaLab5.'
                      : isAccessKeyMode
                        ? 'Utilisez votre email professionnel et la clé de test fournie pour accéder à RaLab5.'
                      : 'Identifiez-vous pour entrer dans votre espace RaLab5.'}
                  </p>
                </div>
                <div className="hidden rounded-full border border-[#d9ddd7] bg-[#f7f5f0] px-3 py-1 text-[11px] font-medium text-[#5f5e5a] sm:block">
                  NGE Géotechnique
                </div>
              </div>

              {isProxyMode ? (
                <div className="mt-5 rounded-[18px] border border-[#d9ddd7] bg-[#f7f5f0] p-4">
                  <div className="flex items-start gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Identité serveur</p>
                      <p className="mt-1 text-sm font-medium text-text">{hint?.proxy_identity || 'Non transmise'}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {hint?.can_auto_login
                          ? `Accès validé${hint?.matched_name ? ` pour ${hint.matched_name}` : ''}.`
                          : 'Le proxy répond, mais aucun utilisateur RaLab5 n’est associé à cette identité.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : isAccessKeyMode ? (
                <div className="mt-5 rounded-[18px] border border-[#d9ddd7] bg-[#f7f5f0] p-4">
                  <div className="flex items-start gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Mode test externe</p>
                      <p className="mt-1 text-sm font-medium text-text">Accès par email autorisé + clé partagée</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {accessKeyAllowsAllUsers
                          ? 'Ce mode est prévu pour un test ponctuel hors VPN, avec accès ouvert à tous les utilisateurs RaLab5 actifs.'
                          : 'Ce mode est prévu pour un test ponctuel hors VPN, avec une liste d’emails autorisés.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : hint?.windows_username ? (
                <div className="mt-5 rounded-[18px] border border-[#d9ddd7] bg-[#f7f5f0] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Poste détecté</p>
                      <p className="mt-1 text-sm font-medium text-text">{hint.windows_username}</p>
                      <p className="mt-1 text-xs text-text-muted">
                        {hint.can_auto_login
                          ? `Correspondance trouvée${hint.matched_name ? `: ${hint.matched_name}` : ''}.`
                          : 'Aucune correspondance automatique trouvée, utilisez l’email ou choisissez un profil.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyIdentifier(hint.matched_email || hint.windows_username)}
                      className="shrink-0 rounded-full border border-[#cfe4f6] bg-[#eef6fd] px-3 py-1.5 text-xs font-medium text-[#185fa5] transition hover:bg-[#e3f0fb]"
                    >
                      Utiliser
                    </button>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
                {isProxyMode ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">Mode d’accès</label>
                    <div className="rounded-xl border border-border bg-[#fcfbf7] px-3.5 py-3">
                      <p className="text-sm font-medium text-text">Accès piloté par le serveur</p>
                      <p className="mt-1 text-xs text-text-muted">
                        Aucun identifiant libre ni annuaire public n’est exposé sur l’instance internet.
                      </p>
                    </div>
                  </div>
                ) : isAccessKeyMode ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-text">Email professionnel</label>
                      <input
                        type="email"
                        value={identifier}
                        onChange={(event) => applyIdentifier(event.target.value)}
                        className="rounded-xl border border-border bg-[#fcfbf7] px-3.5 py-3 text-sm outline-none transition-colors focus:border-[#24555d]"
                        placeholder="crigo@guintoli.fr"
                        required
                        autoFocus
                      />
                      <p className="text-xs text-text-muted">
                        {accessKeyAllowsAllUsers
                          ? 'Tout email d’un utilisateur actif RaLab5 est accepté pour ce test'
                          : 'Uniquement les emails explicitement autorisés pour ce test'}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-text">Clé d’accès</label>
                      <input
                        type="password"
                        value={accessKey}
                        onChange={(event) => {
                          setAccessKey(event.target.value)
                          setError('')
                        }}
                        className="rounded-xl border border-border bg-[#fcfbf7] px-3.5 py-3 text-sm outline-none transition-colors focus:border-[#24555d]"
                        placeholder="clé de test"
                        required
                      />
                      <p className="text-xs text-text-muted">Clé temporaire à partager uniquement avec les testeurs concernés</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text">Identifiant</label>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(event) => applyIdentifier(event.target.value)}
                      className="rounded-xl border border-border bg-[#fcfbf7] px-3.5 py-3 text-sm outline-none transition-colors focus:border-[#24555d]"
                      placeholder="marco ou marco@nge.fr"
                      required
                      autoFocus
                    />
                    <p className="text-xs text-text-muted">Username Windows ou email professionnel</p>
                  </div>
                )}

                {selectedUser && !isAccessKeyMode ? (
                  <div className="rounded-[18px] border border-[#d9ddd7] bg-[#f7f5f0] p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef6fd] text-[#185fa5]">
                        <Building2 size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Préparation dashboard</p>
                        <p className="mt-1 text-sm font-semibold text-text">{selectedUser.display_name}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedUser.role_code ? (
                            <IdentityPill className={roleTone(selectedUser.role_code)}>
                              {roleLabel(selectedUser.role_code)}
                            </IdentityPill>
                          ) : null}
                          {selectedUser.service_code ? (
                            <IdentityPill className="border-[#d9ddd7] bg-white text-[#5f5e5a]">
                              {selectedUser.service_code}
                            </IdentityPill>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs leading-6 text-text-muted">
                          {roleSummary(selectedUser.role_code)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={
                    loading
                    || (isProxyMode ? !hint?.can_auto_login : false)
                    || (!isProxyMode && !identifier)
                    || (isAccessKeyMode && !accessKey)
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#24555d] py-3 text-sm font-medium text-white transition hover:bg-[#17343a] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Connexion...' : isProxyMode ? 'Entrer via le serveur' : isAccessKeyMode ? 'Entrer avec la clé de test' : 'Entrer dans RaLab5'}
                  {!loading ? <ArrowRight size={15} /> : null}
                </button>
              </form>
            </div>

            {isProxyMode || isAccessKeyMode ? (
              <div className="rounded-[24px] border border-[#d9ddd7] bg-white/85 p-5 shadow-[0_14px_40px_rgba(37,53,53,0.04)] backdrop-blur-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef6fd] text-[#185fa5]">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text">{isProxyMode ? 'Instance internet sécurisée' : 'Test externe temporaire'}</p>
                    <p className="mt-1 text-xs leading-6 text-text-muted">
                      {isProxyMode
                        ? 'L’accès est filtré par le serveur ou son proxy d’authentification. Clara n’a besoin que du lien web; aucun annuaire public n’est exposé ici.'
                        : accessKeyAllowsAllUsers
                          ? 'Ce mode évite le VPN sur le PC de l’entreprise, mais il doit rester limité à un test court avec la clé partagée et les utilisateurs RaLab5 actifs.'
                          : 'Ce mode évite le VPN sur le PC de l’entreprise, mais il doit rester limité à un test court avec des emails autorisés et une clé partagée.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-[#d9ddd7] bg-white/85 p-5 shadow-[0_14px_40px_rgba(37,53,53,0.04)] backdrop-blur-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Utilisateurs actifs</p>
                    <p className="mt-1 text-xs text-text-muted">Sélection rapide pour préparer les dashboards par profil.</p>
                  </div>
                  {usersLoading ? (
                    <span className="text-xs text-text-muted">Chargement...</span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {suggestedUsers.length === 0 ? (
                    <div className="sm:col-span-2 rounded-2xl border border-dashed border-border px-4 py-5 text-xs text-text-muted">
                      Aucun profil affichable pour cette recherche.
                    </div>
                  ) : (
                    suggestedUsers.map((user) => (
                      <IdentityButton key={user.email} user={user} onSelect={applyIdentifier} />
                    ))
                  )}
                </div>
              </div>
            )}

            <p className="text-center text-xs text-text-muted">
              RaLab5 v0.1.0 - point d’entrée des dashboards NGE Géotechnique
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
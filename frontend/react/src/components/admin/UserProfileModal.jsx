import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, ClipboardList, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { adminApi } from '@/services/api'
import { cn, formatDate } from '@/lib/utils'

const ROLE_OPTIONS = ['admin', 'labo', 'etudes', 'consult']
const ROLE_LABELS = {
  admin: 'Administrateur',
  labo: 'Laboratoire',
  etudes: 'Études',
  consult: 'Consultation',
}

const LEVEL_TONES = {
  N0: 'bg-[#f4f1eb] text-[#6c655e] border-[#ddd5cb]',
  N1: 'bg-[#eef6fd] text-[#185fa5] border-[#cfe4f6]',
  N2: 'bg-[#eef5e6] text-[#3b6d11] border-[#d4e4c1]',
  N3: 'bg-[#fbf1e2] text-[#854f0b] border-[#ecd1a2]',
  N4: 'bg-[#fbe7df] text-[#9f4a13] border-[#efc4aa]',
  N5: 'bg-[#efe8fb] text-[#5f3ca0] border-[#d8c6f1]',
}

const TAB_OPTIONS = [
  { key: 'fiche', label: 'Fiche', icon: UserRound },
  { key: 'competences', label: 'Compétences', icon: ClipboardList },
  { key: 'habilitations', label: 'Habilitations', icon: ShieldCheck },
]

function emptyProfile(email = '') {
  return {
    user_email: email,
    phone: '',
    agency_name: '',
    location_name: '',
    manager_name: '',
    professional_title: '',
    employee_reference: '',
    employment_start_date: '',
    last_reviewed_at: '',
    next_review_due_date: '',
    certifications_notes: '',
    authorizations_notes: '',
    training_notes: '',
    documents_notes: '',
    profile_notes: '',
  }
}

function buildBaseForm(user) {
  if (!user) {
    return {
      display_name: '',
      role_code: 'labo',
      service_code: '',
      employment_level_code: '',
      is_active: true,
    }
  }

  return {
    display_name: user.display_name || '',
    role_code: user.role_code || 'labo',
    service_code: user.service_code || '',
    employment_level_code: user.employment_level_code || '',
    is_active: Boolean(user.is_active),
  }
}

function normalizeDateInput(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toISOString().slice(0, 10)
}

function buildProfileForm(profile, email = '') {
  const base = emptyProfile(email)
  if (!profile) return base
  return {
    ...base,
    ...profile,
    employment_start_date: normalizeDateInput(profile.employment_start_date),
    last_reviewed_at: normalizeDateInput(profile.last_reviewed_at),
    next_review_due_date: normalizeDateInput(profile.next_review_due_date),
  }
}

function buildAssessmentForm() {
  return {
    competency_id: '',
    level_code: 'N1',
    assessed_at: new Date().toISOString().slice(0, 10),
    assessor_name: '',
    source_type: 'manual',
    source_reference: '',
    notes: '',
  }
}

function FieldGroup({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
      {hint ? <span className="text-[10px] text-text-muted">{hint}</span> : null}
    </div>
  )
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function SummaryCard({ icon: Icon, title, value, tone = 'default', subtitle }) {
  const tones = {
    default: 'border-[#d9ddd7] bg-white',
    blue: 'border-[#cfe4f6] bg-[#eef6fd]',
    green: 'border-[#d4e4c1] bg-[#eef5e6]',
    amber: 'border-[#ecd1a2] bg-[#fbf1e2]',
  }

  return (
    <div className={cn('rounded-2xl border p-4', tones[tone] || tones.default)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">{title}</p>
          <p className="mt-2 text-lg font-semibold text-text">{value}</p>
          {subtitle ? <p className="mt-1 text-xs text-text-muted">{subtitle}</p> : null}
        </div>
        <div className="rounded-2xl bg-white/80 p-2.5 text-text-muted shadow-sm">
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

function LevelBadge({ levelCode, label }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', LEVEL_TONES[levelCode] || LEVEL_TONES.N0)}>
      {label || levelCode || '—'}
    </span>
  )
}

export default function UserProfileModal({ open, onClose, user, employmentLevels = [] }) {
  const queryClient = useQueryClient()
  const email = user?.email || ''
  const [activeTab, setActiveTab] = useState('fiche')
  const [baseForm, setBaseForm] = useState(() => buildBaseForm(user))
  const [profileForm, setProfileForm] = useState(() => buildProfileForm(null, email))
  const [assessmentForm, setAssessmentForm] = useState(() => buildAssessmentForm())
  const [catalogSearch, setCatalogSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('')
  const [contextFilter, setContextFilter] = useState('')

  const profileQuery = useQuery({
    queryKey: ['admin-user-profile', email],
    queryFn: () => adminApi.users.profile(email),
    enabled: open && !!email,
  })

  const competencyLevelsQuery = useQuery({
    queryKey: ['admin-competency-levels'],
    queryFn: () => adminApi.competencyLevels.list(),
    enabled: open && !!email,
  })

  const competenciesQuery = useQuery({
    queryKey: ['admin-competencies'],
    queryFn: () => adminApi.competencies.list(),
    enabled: open && !!email,
  })

  const currentCompetenciesQuery = useQuery({
    queryKey: ['admin-user-current-competencies', email],
    queryFn: () => adminApi.users.currentCompetencies(email),
    enabled: open && !!email,
  })

  const competencyHistoryQuery = useQuery({
    queryKey: ['admin-user-competency-history', email],
    queryFn: () => adminApi.users.competencyHistory(email),
    enabled: open && !!email,
  })

  useEffect(() => {
    if (!open) return
    setActiveTab('fiche')
    setBaseForm(buildBaseForm(user))
    setAssessmentForm(buildAssessmentForm())
    setCatalogSearch('')
    setDomainFilter('')
    setContextFilter('')
  }, [open, user])

  useEffect(() => {
    if (!open) return
    setBaseForm(buildBaseForm(user))
  }, [user, open])

  useEffect(() => {
    if (!open) return
    setProfileForm(buildProfileForm(profileQuery.data, email))
  }, [profileQuery.data, email, open])

  const saveProfileMutation = useMutation({
    mutationFn: async (mode) => {
      if (!email) return null
      if (mode === 'fiche') {
        await adminApi.users.update(email, {
          display_name: baseForm.display_name,
          role_code: baseForm.role_code,
          service_code: baseForm.service_code,
          employment_level_code: baseForm.employment_level_code || null,
          is_active: baseForm.is_active,
        })
      }

      await adminApi.users.updateProfile(email, {
        phone: profileForm.phone,
        agency_name: profileForm.agency_name,
        location_name: profileForm.location_name,
        manager_name: profileForm.manager_name,
        professional_title: profileForm.professional_title,
        employee_reference: profileForm.employee_reference,
        employment_start_date: profileForm.employment_start_date || null,
        last_reviewed_at: profileForm.last_reviewed_at || null,
        next_review_due_date: profileForm.next_review_due_date || null,
        certifications_notes: profileForm.certifications_notes,
        authorizations_notes: profileForm.authorizations_notes,
        training_notes: profileForm.training_notes,
        documents_notes: profileForm.documents_notes,
        profile_notes: profileForm.profile_notes,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-user-profile', email] }),
      ])
    },
  })

  const createAssessmentMutation = useMutation({
    mutationFn: async () => {
      if (!email) return null
      return adminApi.users.createCompetencyAssessment(email, {
        competency_id: Number(assessmentForm.competency_id),
        level_code: assessmentForm.level_code,
        assessed_at: assessmentForm.assessed_at || null,
        assessor_name: assessmentForm.assessor_name || null,
        source_type: assessmentForm.source_type,
        source_reference: assessmentForm.source_reference || null,
        notes: assessmentForm.notes || null,
      })
    },
    onSuccess: async () => {
      setAssessmentForm((current) => ({
        ...buildAssessmentForm(),
        assessor_name: current.assessor_name,
      }))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-user-current-competencies', email] }),
        queryClient.invalidateQueries({ queryKey: ['admin-user-competency-history', email] }),
      ])
    },
  })

  const deleteAssessmentMutation = useMutation({
    mutationFn: (assessmentId) => adminApi.users.deleteCompetencyAssessment(email, assessmentId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-user-current-competencies', email] }),
        queryClient.invalidateQueries({ queryKey: ['admin-user-competency-history', email] }),
      ])
    },
  })

  const competencyLevels = competencyLevelsQuery.data || []
  const competencies = competenciesQuery.data || []
  const currentCompetencies = currentCompetenciesQuery.data || []
  const competencyHistory = competencyHistoryQuery.data || []

  const domains = useMemo(
    () => [...new Set(competencies.map((item) => item.domain).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [competencies]
  )

  const contexts = useMemo(
    () => [...new Set(competencies.map((item) => item.context_type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [competencies]
  )

  const filteredCompetencies = useMemo(() => {
    const normalizedSearch = catalogSearch.trim().toLowerCase()
    return competencies.filter((item) => {
      const matchesSearch = !normalizedSearch || [item.label, item.reference, item.domain, item.context_type, item.certification]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch))

      const matchesDomain = !domainFilter || item.domain === domainFilter
      const matchesContext = !contextFilter || item.context_type === contextFilter
      return matchesSearch && matchesDomain && matchesContext
    })
  }, [catalogSearch, competencies, contextFilter, domainFilter])

  const displayedCompetencies = filteredCompetencies.slice(0, 80)
  const selectedCompetency = competencies.find((item) => String(item.competency_id) === String(assessmentForm.competency_id))

  function handleDeleteAssessment(assessment) {
    const confirmed = window.confirm(
      `Supprimer cette évaluation de l'historique ?\n\n` +
      `${assessment.competency_label}\n${formatDate(assessment.assessed_at)} • ${assessment.level_code}\n\n` +
      'Cette action retire seulement cette ligne d’historique. Si c’était la dernière évaluation de cet essai, le niveau courant sera recalculé automatiquement.'
    )
    if (!confirmed) return

    deleteAssessmentMutation.mutate(assessment.assessment_id)
  }

  const countsByLevel = useMemo(() => {
    const counts = {}
    for (const assessment of currentCompetencies) {
      counts[assessment.level_code] = (counts[assessment.level_code] || 0) + 1
    }
    return counts
  }, [currentCompetencies])

  const completionRatio = competencies.length ? Math.round((currentCompetencies.length / competencies.length) * 100) : 0

  if (!user) return null

  return (
    <Modal open={open} onClose={onClose} title={`Fiche utilisateur — ${user.display_name}`} size="2xl">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard icon={UserRound} title="Utilisateur" value={user.display_name} subtitle={user.email} />
          <SummaryCard icon={Briefcase} title="Emploi" value={user.employment_level_label || 'Non renseigné'} subtitle={ROLE_LABELS[user.role_code] || user.role_code} tone="blue" />
          <SummaryCard icon={ClipboardList} title="Compétences courantes" value={String(currentCompetencies.length)} subtitle={`${completionRatio}% du catalogue officiel`} tone="green" />
          <SummaryCard icon={ShieldCheck} title="Suivi" value={profileForm.next_review_due_date ? formatDate(profileForm.next_review_due_date) : 'À planifier'} subtitle="Prochaine revue" tone="amber" />
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          {TAB_OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                activeTab === key
                  ? 'border-accent bg-[#eef6fd] text-accent'
                  : 'border-border bg-surface text-text-muted hover:text-text'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'fiche' ? (
          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <SectionCard title="Identité" description="Informations de contact et référence interne du collaborateur.">
              <div className="grid gap-3 md:grid-cols-2">
                <FieldGroup label="Nom affiché">
                  <Input value={baseForm.display_name} onChange={(event) => setBaseForm((current) => ({ ...current, display_name: event.target.value }))} />
                </FieldGroup>
                <FieldGroup label="Email professionnel">
                  <Input value={email} readOnly className="text-text-muted" />
                </FieldGroup>
                <FieldGroup label="Téléphone">
                  <Input value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} placeholder="06 00 00 00 00" />
                </FieldGroup>
                <FieldGroup label="Référence interne">
                  <Input value={profileForm.employee_reference} onChange={(event) => setProfileForm((current) => ({ ...current, employee_reference: event.target.value }))} placeholder="Matricule, code RH, etc." />
                </FieldGroup>
                <FieldGroup label="Statut">
                  <Select value={String(baseForm.is_active)} onChange={(event) => setBaseForm((current) => ({ ...current, is_active: event.target.value === 'true' }))}>
                    <option value="true">Actif</option>
                    <option value="false">Inactif</option>
                  </Select>
                </FieldGroup>
              </div>
            </SectionCard>

            <SectionCard title="Emploi et parcours" description="Axe professionnel distinct du rôle de sécurité et des compétences par essai.">
              <div className="grid gap-3 md:grid-cols-2">
                <FieldGroup label="Rôle applicatif">
                  <Select value={baseForm.role_code} onChange={(event) => setBaseForm((current) => ({ ...current, role_code: event.target.value }))}>
                    {ROLE_OPTIONS.map((roleCode) => (
                      <option key={roleCode} value={roleCode}>{ROLE_LABELS[roleCode] || roleCode}</option>
                    ))}
                  </Select>
                </FieldGroup>
                <FieldGroup label="Patamar / emploi">
                  <Select value={baseForm.employment_level_code} onChange={(event) => setBaseForm((current) => ({ ...current, employment_level_code: event.target.value }))}>
                    <option value="">Non renseigné</option>
                    {employmentLevels.map((level) => (
                      <option key={level.employment_level_code} value={level.employment_level_code}>{level.label}</option>
                    ))}
                  </Select>
                </FieldGroup>
                <FieldGroup label="Service / code labo">
                  <Input value={baseForm.service_code} onChange={(event) => setBaseForm((current) => ({ ...current, service_code: event.target.value }))} placeholder="SP, AUV, rst..." />
                </FieldGroup>
                <FieldGroup label="Fonction affichée">
                  <Input value={profileForm.professional_title} onChange={(event) => setProfileForm((current) => ({ ...current, professional_title: event.target.value }))} placeholder="Titre libre si besoin" />
                </FieldGroup>
                <FieldGroup label="Agence">
                  <Input value={profileForm.agency_name} onChange={(event) => setProfileForm((current) => ({ ...current, agency_name: event.target.value }))} placeholder="Agence / entité" />
                </FieldGroup>
                <FieldGroup label="Localisation">
                  <Input value={profileForm.location_name} onChange={(event) => setProfileForm((current) => ({ ...current, location_name: event.target.value }))} placeholder="Ville, laboratoire, base vie..." />
                </FieldGroup>
                <FieldGroup label="Manager / référent">
                  <Input value={profileForm.manager_name} onChange={(event) => setProfileForm((current) => ({ ...current, manager_name: event.target.value }))} placeholder="Responsable direct" />
                </FieldGroup>
                <FieldGroup label="Date d'entrée">
                  <Input type="date" value={profileForm.employment_start_date} onChange={(event) => setProfileForm((current) => ({ ...current, employment_start_date: event.target.value }))} />
                </FieldGroup>
              </div>
            </SectionCard>

            <SectionCard title="Notes générales" description="Contexte libre, observations de suivi ou informations utiles pour la fiche.">
              <FieldGroup label="Observations">
                <Textarea rows={8} value={profileForm.profile_notes} onChange={(event) => setProfileForm((current) => ({ ...current, profile_notes: event.target.value }))} placeholder="Notes libres, points de vigilance, contexte du parcours..." />
              </FieldGroup>
            </SectionCard>

            <div className="flex flex-col justify-between rounded-2xl border border-[#d9ddd7] bg-[#f8fbfa] p-4">
              <div className="space-y-3 text-sm text-text-muted">
                <p className="font-semibold text-text">Ce bloc enregistre la fiche de base.</p>
                <p>Il ne remplace pas le rôle de sécurité ni la matrice de compétences. Il sert à structurer l'identité, l'emploi et le contexte RH/opérationnel du collaborateur.</p>
                <p>Les compétences par essai se gèrent dans l'onglet dédié avec historique daté.</p>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                {saveProfileMutation.error ? <p className="mr-auto text-xs text-danger">{saveProfileMutation.error.message}</p> : null}
                <Button variant="secondary" onClick={onClose}>Fermer</Button>
                <Button variant="primary" onClick={() => saveProfileMutation.mutate('fiche')} disabled={saveProfileMutation.isPending || !baseForm.display_name}>
                  {saveProfileMutation.isPending ? 'Enregistrement…' : 'Enregistrer la fiche'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'competences' ? (
          <div className="flex flex-col gap-4">
            <SectionCard title="Ajouter une évaluation" description="Nouveau niveau sur un essai du catalogue officiel. La dernière évaluation devient le niveau courant.">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.9fr_0.9fr]">
                <FieldGroup label="Recherche dans le catalogue" hint={`${filteredCompetencies.length} essai(s) correspondent aux filtres.`}>
                  <Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Chercher un essai, une référence, un domaine..." />
                </FieldGroup>
                <FieldGroup label="Domaine">
                  <Select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
                    <option value="">Tous</option>
                    {domains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                  </Select>
                </FieldGroup>
                <FieldGroup label="Contexte">
                  <Select value={contextFilter} onChange={(event) => setContextFilter(event.target.value)}>
                    <option value="">Tous</option>
                    {contexts.map((context) => <option key={context} value={context}>{context}</option>)}
                  </Select>
                </FieldGroup>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr]">
                <FieldGroup label="Essai / compétence" hint={filteredCompetencies.length > displayedCompetencies.length ? `Affichage limité aux ${displayedCompetencies.length} premiers résultats.` : null}>
                  <Select value={assessmentForm.competency_id} onChange={(event) => setAssessmentForm((current) => ({ ...current, competency_id: event.target.value }))}>
                    <option value="">Sélectionner un essai</option>
                    {displayedCompetencies.map((competency) => (
                      <option key={competency.competency_id} value={String(competency.competency_id)}>
                        {competency.domain} • {competency.context_type} • {competency.label}
                      </option>
                    ))}
                  </Select>
                </FieldGroup>
                <FieldGroup label="Niveau">
                  <Select value={assessmentForm.level_code} onChange={(event) => setAssessmentForm((current) => ({ ...current, level_code: event.target.value }))}>
                    {competencyLevels.map((level) => (
                      <option key={level.level_code} value={level.level_code}>{level.level_code} — {level.label}</option>
                    ))}
                  </Select>
                </FieldGroup>
                <FieldGroup label="Date d'évaluation">
                  <Input type="date" value={assessmentForm.assessed_at} onChange={(event) => setAssessmentForm((current) => ({ ...current, assessed_at: event.target.value }))} />
                </FieldGroup>
                <FieldGroup label="Source">
                  <Select value={assessmentForm.source_type} onChange={(event) => setAssessmentForm((current) => ({ ...current, source_type: event.target.value }))}>
                    <option value="manual">Manuel</option>
                    <option value="validation">Validation</option>
                    <option value="excel_import">Import Excel</option>
                  </Select>
                </FieldGroup>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <FieldGroup label="Évaluateur / formateur">
                  <Input value={assessmentForm.assessor_name} onChange={(event) => setAssessmentForm((current) => ({ ...current, assessor_name: event.target.value }))} placeholder="Nom du référent ou formateur" />
                </FieldGroup>
                <FieldGroup label="Référence source">
                  <Input value={assessmentForm.source_reference} onChange={(event) => setAssessmentForm((current) => ({ ...current, source_reference: event.target.value }))} placeholder="PV, mail, audit, fichier..." />
                </FieldGroup>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_320px]">
                <FieldGroup label="Notes d'évaluation">
                  <Textarea rows={3} value={assessmentForm.notes} onChange={(event) => setAssessmentForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Conditions, remarques, points à consolider..." />
                </FieldGroup>
                <div className="rounded-2xl border border-[#d9ddd7] bg-[#fafaf8] p-3 text-xs text-text-muted">
                  <p className="font-semibold text-text">Essai sélectionné</p>
                  {selectedCompetency ? (
                    <div className="mt-2 space-y-1.5">
                      <p>{selectedCompetency.label}</p>
                      <p>{selectedCompetency.domain} • {selectedCompetency.context_type}</p>
                      <p>Référence: {selectedCompetency.reference || '—'}</p>
                      <p>Certification: {selectedCompetency.certification || '—'}</p>
                    </div>
                  ) : (
                    <p className="mt-2">Choisis un essai pour voir son contexte.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                {createAssessmentMutation.error ? <p className="mr-auto text-xs text-danger">{createAssessmentMutation.error.message}</p> : null}
                <Button variant="primary" onClick={() => createAssessmentMutation.mutate()} disabled={createAssessmentMutation.isPending || !assessmentForm.competency_id}>
                  {createAssessmentMutation.isPending ? 'Ajout…' : 'Ajouter l’évaluation'}
                </Button>
              </div>
            </SectionCard>

            <div className="grid gap-3 md:grid-cols-4">
              <SummaryCard icon={ClipboardList} title="Catalogue officiel" value={String(competencies.length)} subtitle="Essais disponibles" />
              <SummaryCard icon={ClipboardList} title="Niveau courant" value={String(currentCompetencies.length)} subtitle="Essais évalués" tone="blue" />
              <SummaryCard icon={Briefcase} title="Historique" value={String(competencyHistory.length)} subtitle="Évaluations enregistrées" tone="green" />
              <SummaryCard icon={ShieldCheck} title="Couverture" value={`${completionRatio}%`} subtitle="Par rapport au catalogue" tone="amber" />
            </div>

            <SectionCard title="Répartition des niveaux courants" description="Vue synthétique du niveau actuellement retenu pour chaque essai évalué.">
              <div className="flex flex-wrap gap-2">
                {competencyLevels.map((level) => (
                  <div key={level.level_code} className="rounded-2xl border border-border bg-white px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <LevelBadge levelCode={level.level_code} label={level.level_code} />
                      <span className="font-semibold text-text">{countsByLevel[level.level_code] || 0}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">{level.label}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Niveaux courants" description="Dernière évaluation connue pour chaque essai.">
              {currentCompetenciesQuery.isLoading ? (
                <p className="text-xs text-text-muted">Chargement…</p>
              ) : currentCompetencies.length === 0 ? (
                <p className="text-xs text-text-muted">Aucune compétence évaluée pour l'instant.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        {['Essai','Domaine','Contexte','Niveau','Évalué le','Évaluateur'].map((header) => (
                          <th key={header} className="border-b border-border bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentCompetencies.map((assessment) => (
                        <tr key={assessment.assessment_id} className="border-b border-border">
                          <td className="px-3 py-2">
                            <div className="font-medium text-text">{assessment.competency_label}</div>
                            <div className="text-[11px] text-text-muted">{assessment.reference || 'Sans référence'}</div>
                          </td>
                          <td className="px-3 py-2 text-xs">{assessment.domain}</td>
                          <td className="px-3 py-2 text-xs">{assessment.context_type}</td>
                          <td className="px-3 py-2"><LevelBadge levelCode={assessment.level_code} label={assessment.level_code} /></td>
                          <td className="px-3 py-2 text-xs">{formatDate(assessment.assessed_at)}</td>
                          <td className="px-3 py-2 text-xs">{assessment.assessor_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Historique des évaluations" description="Traçabilité complète des niveaux saisis pour ce collaborateur.">
              {competencyHistoryQuery.isLoading ? (
                <p className="text-xs text-text-muted">Chargement…</p>
              ) : competencyHistory.length === 0 ? (
                <p className="text-xs text-text-muted">Aucun historique pour l'instant.</p>
              ) : (
                <div className="max-h-[320px] overflow-auto">
                  {deleteAssessmentMutation.error ? <p className="px-3 py-2 text-xs text-danger">{deleteAssessmentMutation.error.message}</p> : null}
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        {['Date','Essai','Niveau','Source','Notes','Action'].map((header) => (
                          <th key={header} className="border-b border-border bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {competencyHistory.map((assessment) => {
                        const isDeleting = deleteAssessmentMutation.isPending && deleteAssessmentMutation.variables === assessment.assessment_id

                        return (
                          <tr key={assessment.assessment_id} className="border-b border-border align-top">
                            <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDate(assessment.assessed_at)}</td>
                            <td className="px-3 py-2 text-xs">
                              <div className="font-medium text-text">{assessment.competency_label}</div>
                              <div className="text-[11px] text-text-muted">{assessment.domain} • {assessment.context_type}</div>
                            </td>
                            <td className="px-3 py-2"><LevelBadge levelCode={assessment.level_code} label={assessment.level_code} /></td>
                            <td className="px-3 py-2 text-xs">
                              <div>{assessment.source_type}</div>
                              <div className="text-[11px] text-text-muted">{assessment.assessor_name || assessment.source_reference || '—'}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-text-muted">{assessment.notes || '—'}</td>
                            <td className="px-3 py-2">
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => handleDeleteAssessment(assessment)}
                                disabled={isDeleting}
                              >
                                <Trash2 size={14} />
                                {isDeleting ? 'Suppression…' : 'Supprimer'}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'habilitations' ? (
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <SectionCard title="Pilotage des revues" description="Dates de revue et suivi documentaire global du collaborateur.">
              <div className="grid gap-3 md:grid-cols-2">
                <FieldGroup label="Dernière revue">
                  <Input type="date" value={profileForm.last_reviewed_at} onChange={(event) => setProfileForm((current) => ({ ...current, last_reviewed_at: event.target.value }))} />
                </FieldGroup>
                <FieldGroup label="Prochaine revue">
                  <Input type="date" value={profileForm.next_review_due_date} onChange={(event) => setProfileForm((current) => ({ ...current, next_review_due_date: event.target.value }))} />
                </FieldGroup>
              </div>

              <div className="mt-4 grid gap-3">
                <FieldGroup label="Habilitations / autorisations">
                  <Textarea rows={5} value={profileForm.authorizations_notes} onChange={(event) => setProfileForm((current) => ({ ...current, authorizations_notes: event.target.value }))} placeholder="Autorisations de conduite, nucléaire, terrain, laboratoire, etc." />
                </FieldGroup>
                <FieldGroup label="Certifications et documents">
                  <Textarea rows={5} value={profileForm.certifications_notes} onChange={(event) => setProfileForm((current) => ({ ...current, certifications_notes: event.target.value }))} placeholder="Certifications, attestations, dates de validité..." />
                </FieldGroup>
              </div>
            </SectionCard>

            <SectionCard title="Formation et pièces associées" description="Zone libre pour capitaliser les éléments qui ne relèvent pas directement d'un essai du catalogue.">
              <div className="grid gap-3">
                <FieldGroup label="Formations suivies / à prévoir">
                  <Textarea rows={5} value={profileForm.training_notes} onChange={(event) => setProfileForm((current) => ({ ...current, training_notes: event.target.value }))} placeholder="Formations externes, montée en compétence, besoins de formation..." />
                </FieldGroup>
                <FieldGroup label="Documents disponibles">
                  <Textarea rows={5} value={profileForm.documents_notes} onChange={(event) => setProfileForm((current) => ({ ...current, documents_notes: event.target.value }))} placeholder="Lien SharePoint, pièces RH, scans, habilitations..." />
                </FieldGroup>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                {saveProfileMutation.error ? <p className="mr-auto text-xs text-danger">{saveProfileMutation.error.message}</p> : null}
                <Button variant="secondary" onClick={onClose}>Fermer</Button>
                <Button variant="primary" onClick={() => saveProfileMutation.mutate('habilitations')} disabled={saveProfileMutation.isPending}>
                  {saveProfileMutation.isPending ? 'Enregistrement…' : 'Enregistrer habilitations'}
                </Button>
              </div>
            </SectionCard>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
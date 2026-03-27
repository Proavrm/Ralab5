/**
 * pages/DashboardPage.jsx
 * Dashboard principal — stats + accès rapide.
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { affairesApi, demandesApi, qualiteApi } from '@/services/api'
import Card, { CardBody, CardTitle, CardHeader } from '@/components/ui/Card'
import Badge from '@/components/shared/Badge'
import { Briefcase, ClipboardList, AlertTriangle, Clock, ArrowRight } from 'lucide-react'

function StatCard({ label, value, color = 'text-accent', icon: Icon }) {
  return (
    <Card>
      <CardBody className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-muted mb-1.5">{label}</p>
          <p className={`text-3xl font-bold leading-none ${color}`}>{value ?? '—'}</p>
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-bg">
            <Icon size={18} className="text-text-muted" />
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function QuickLink({ icon, title, desc, to }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-3 p-3 border border-border rounded hover:border-accent hover:bg-[#f7f7ff] transition-all text-left w-full"
    >
      <span className="text-xl w-7 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{title}</p>
        {desc && <p className="text-xs text-text-muted mt-0.5">{desc}</p>}
      </div>
      <ArrowRight size={14} className="text-text-muted shrink-0" />
    </button>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => affairesApi.list(),
  })

  const { data: demandes = [] } = useQuery({
    queryKey: ['demandes'],
    queryFn: () => demandesApi.list(),
  })

  const { data: qualiteStats } = useQuery({
    queryKey: ['qualite-stats'],
    queryFn: () => qualiteApi.stats(),
  })

  const affairesEnCours    = affaires.filter(a => a.statut === 'En cours').length
  const demandesEnCours    = demandes.filter(d => d.statut === 'En Cours').length
  const demandesAQualifier = demandes.filter(d => d.statut === 'À qualifier').length
  const ncOuvertes         = qualiteStats?.nc_ouvertes ?? 0

  const recentDemandes = [...demandes]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5)

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const displayName = user?.display_name || user?.username || ''

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <div className="rounded-xl p-6 text-white"
        style={{ background: 'linear-gradient(135deg, #5b6af0 0%, #8b5cf6 100%)' }}>
        <h2 className="text-xl font-semibold mb-1">
          {greeting}{displayName ? `, ${displayName}` : ''} 👋
        </h2>
        <p className="text-sm opacity-80">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            `${affairesEnCours} affaires en cours`,
            `${demandesEnCours} demandes actives`,
            demandesAQualifier > 0 ? `${demandesAQualifier} à qualifier` : null,
          ].filter(Boolean).map(label => (
            <span key={label} className="px-3 py-1 rounded-full text-xs"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Affaires en cours"   value={affairesEnCours}    color="text-accent"  icon={Briefcase} />
        <StatCard label="Demandes en cours"   value={demandesEnCours}    color="text-warn"    icon={ClipboardList} />
        <StatCard label="À qualifier"         value={demandesAQualifier} color="text-danger"  icon={Clock} />
        <StatCard label="NCs ouvertes"        value={ncOuvertes}
          color={ncOuvertes > 0 ? 'text-danger' : 'text-success'} icon={AlertTriangle} />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Accès rapide */}
        <Card>
          <CardHeader><CardTitle>Accès rapide</CardTitle></CardHeader>
          <CardBody className="flex flex-col gap-2">
            <QuickLink icon="📋" title="Nouvelle demande"  desc="Créer une demande RST"          to="/demandes" />
            <QuickLink icon="🏗️" title="Affaires RST"      desc="Gérer les affaires"              to="/affaires" />
            <QuickLink icon="🤝" title="Passations"        desc="Fiches de passation chantier"    to="/passations" />
            <QuickLink icon="📅" title="Planning"          desc="Kanban + calendrier"             to="/planning" />
            <QuickLink icon="🔬" title="Qualité Labo"      desc="Équipements, métrologie, NCs"    to="/qualite" />
          </CardBody>
        </Card>

        {/* Dernières demandes */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Dernières demandes</CardTitle>
            <button onClick={() => navigate('/demandes')}
              className="text-xs text-accent hover:underline flex items-center gap-1">
              Voir tout <ArrowRight size={11} />
            </button>
          </CardHeader>
          <CardBody className="p-0">
            {recentDemandes.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-8">Aucune demande</p>
            ) : (
              <div className="divide-y divide-border">
                {recentDemandes.map(d => (
                  <button key={d.uid}
                    onClick={() => navigate(`/demandes/${d.uid}`)}
                    className="w-full flex items-start gap-3 px-5 py-3 hover:bg-[#f8f8fc] transition-colors text-left">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{
                      background: d.statut === 'En Cours' ? '#ef9f27'
                        : d.statut === 'Fini' ? '#1d9e75'
                        : d.statut === 'À qualifier' ? '#e24b4a' : '#5b6af0'
                    }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{d.reference}</p>
                      <p className="text-xs text-text-muted truncate mt-0.5">
                        {d.chantier || d.affaire || '—'}
                      </p>
                    </div>
                    <Badge statut={d.statut} className="shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

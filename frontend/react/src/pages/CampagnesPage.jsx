/**
 * CampagnesPage.jsx — liste des campagnes (filtre demande_id)
 * Style aligné sur DemandePage (fiche demande)
 */
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { demandesApi, interventionCampaignsApi } from '@/services/api'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import { RefreshCw, X } from 'lucide-react'
import LabName from '@/components/laboratoire/LabName'

const STATUTS = ['À cadrer', 'En cours', 'Terminée', 'Archivée']

const STAT_CLS = {
  'À cadrer': 'bg-[#f1efe8] text-[#5f5e5a]',
  'En cours': 'bg-[#eaf3de] text-[#3b6d11]',
  Terminée: 'bg-[#e0f5ef] text-[#0f6e56]',
  Archivée: 'bg-[#eeedfe] text-[#534ab7]',
  'À qualifier': 'bg-[#f1efe8] text-[#5f5e5a]',
  Demande: 'bg-[#e6f1fb] text-[#185fa5]',
  'En Cours': 'bg-[#eaf3de] text-[#3b6d11]',
  Répondu: 'bg-[#eeedfe] text-[#534ab7]',
  Fini: 'bg-[#e0f5ef] text-[#0f6e56]',
}

const PRIO_CLS = {
  Basse: 'bg-[#f1efe8] text-[#5f5e5a]',
  Normale: 'bg-[#e6f1fb] text-[#185fa5]',
  Haute: 'bg-[#faeeda] text-[#854f0b]',
  Critique: 'bg-[#fcebeb] text-[#a32d2d]',
}

const PAGE_BG = 'radial-gradient(circle at top right, rgba(255,204,0,0.18), transparent 32%), linear-gradient(180deg, #f8fafc 0%, #f3f6fb 42%, #eef3fa 100%)'

function Badge({ s, map }) {
  const cls = (map || STAT_CLS)[s] || 'bg-[#f1efe8] text-[#5f5e5a]'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-black leading-none ${cls}`}>
      {s || '—'}
    </span>
  )
}

function FieldCard({ label, value, highlight, className = '' }) {
  return (
    <div className={`min-w-0 rounded-[14px] px-3 py-2.5 ${highlight ? 'border border-[#efd36b] bg-gradient-to-b from-[#fffdf2] to-[#fbfcfe]' : 'border border-[#e4e9f1] bg-[#fbfcfe]'} ${className}`}>
      <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a]">{label}</div>
      <div className="mt-1.5 min-h-[22px] text-[13px] font-black text-[#172033] break-words">{value || '—'}</div>
    </div>
  )
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-[#dbe1ea] bg-white p-4">
      <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(90deg, #ffcc00, transparent 78%)' }} />
      <div className="text-[10px] font-black uppercase tracking-[.12em] text-[#69758a]">{label}</div>
      <div className="mt-2.5 text-[28px] font-black leading-none text-[#003170]">{value}</div>
      <div className="mt-2.5 min-h-[16px] text-[11px] text-[#69758a]">{detail}</div>
    </div>
  )
}

function SectionCard({ title, subtitle, chip, actions, children }) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[#dbe1ea] bg-white shadow-[0_6px_22px_rgba(0,49,112,0.06)]">
      <div
        className="flex justify-between items-center gap-3.5 min-h-[52px] border-b border-[#e5e9f0] px-5 py-3.5"
        style={{ background: 'linear-gradient(90deg, #f8fafc 0%, #f8fafc 78%, #fff6cf 100%)' }}
      >
        <div>
          <div className="font-black uppercase tracking-[.12em] text-[13px] text-[#003170]">{title}</div>
          {subtitle ? <div className="mt-0.5 text-[11px] text-[#69758a]">{subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {chip}
          {actions}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function CampaignCard({ campaign, listReturnTo, navigate, demandeId }) {
  const statut = campaign.statut || campaign.preparation_status || 'À cadrer'
  const ficheHref = buildPathWithReturnTo(`/campagnes/${campaign.uid}`, listReturnTo)

  return (
    <article className="overflow-hidden rounded-[18px] border border-[#dbe1ea] bg-[#fbfcfe] transition-colors hover:border-[#003170]/25">
      <button
        type="button"
        onClick={() => navigate(ficheHref)}
        className="w-full text-left px-5 py-4 border-b border-[#e5e9f0]"
        style={{ background: 'linear-gradient(90deg, #ffffff 0%, #f8fafc 100%)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[16px] font-black text-[#003170]">{campaign.reference}</span>
              <span className="inline-flex items-center rounded-full border border-[#dbe1ea] bg-white px-2.5 py-1 text-[11px] font-bold text-[#69758a]">
                {campaign.label || 'Campagne'}
              </span>
            </div>
            <div className="mt-1.5 text-[13px] text-[#172033] line-clamp-2">
              {campaign.programme_specifique || campaign.designation || campaign.zone_scope || 'Programme à cadrer'}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge s={statut} />
            <span className="inline-flex items-center rounded-full border border-[#d8ead1] bg-[#edf8e8] px-2.5 py-1 text-[11px] font-bold text-[#3b6d11]">
              {campaign.intervention_count ?? 0} intervention{(campaign.intervention_count ?? 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
        <FieldCard label="Programme" value={campaign.programme_specifique || campaign.designation} />
        <FieldCard label="Zone / temporalité" value={[campaign.zone_scope, campaign.temporalite].filter(Boolean).join(' · ')} />
        <FieldCard label="Essais prévus" value={campaign.types_essais_prevus} />
        <FieldCard label="Priorité" value={campaign.priorite} />
        <FieldCard label="Responsable" value={campaign.responsable_technique} />
        <FieldCard label="Attribué à" value={campaign.attribue_a} />
        <FieldCard label="Essais liés" value={campaign.essai_count != null ? String(campaign.essai_count) : '0'} highlight={Number(campaign.essai_count) > 0} />
        <FieldCard label="Prochaine étape" value={campaign.next_step} className="sm:col-span-2 lg:col-span-1" />
      </div>

      <div className="flex flex-wrap gap-2 px-5 pb-5">
        <Button size="sm" variant="primary" onClick={() => navigate(ficheHref)}>Fiche campagne</Button>
        {demandeId ? (
          <Button
            size="sm"
            onClick={() => navigate(buildPathWithReturnTo(`/interventions?demande_id=${demandeId}`, listReturnTo))}
          >
            Interventions
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export default function CampagnesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const filterDemandeId = searchParams.get('demande_id') || null
  const detailReturnTo = `${location.pathname}${location.search || ''}`
  const explicitReturnTo = resolveReturnTo(searchParams, '')
  const listReturnTo = detailReturnTo

  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  const timer = useRef(null)

  const { data: demande, isLoading: demandeLoading } = useQuery({
    queryKey: ['demande', filterDemandeId],
    queryFn: () => demandesApi.get(filterDemandeId),
    enabled: Boolean(filterDemandeId),
  })

  const { data: campagnes = [], isLoading, refetch } = useQuery({
    queryKey: ['campagnes', filterDemandeId],
    queryFn: () => {
      const params = {}
      if (filterDemandeId) params.demande_id = filterDemandeId
      return interventionCampaignsApi.list(params)
    },
  })

  function onSearchChange(value) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSearch(value), 300)
  }

  function openPreparationForCreate() {
    if (!filterDemandeId) return
    const refParam = demande?.reference ? `?ref=${encodeURIComponent(demande.reference)}` : ''
    navigate(buildPathWithReturnTo(`/preparations/${filterDemandeId}${refParam}`, listReturnTo))
  }

  function handleBackNavigation() {
    if (explicitReturnTo) {
      navigate(explicitReturnTo)
      return
    }
    if (filterDemandeId) {
      navigate(`/demandes/${filterDemandeId}`)
      return
    }
    navigate('/demandes')
  }

  const filtered = [...campagnes]
    .filter((item) => {
      const matchStatut = !statut || item.statut === statut || item.preparation_status === statut
      const q = search.toLowerCase()
      const matchSearch = !q || [
        item.reference,
        item.label,
        item.designation,
        item.demande_reference,
        item.programme_specifique,
      ].some((value) => String(value || '').toLowerCase().includes(q))
      return matchStatut && matchSearch
    })
    .sort((a, b) => String(a.reference || '').localeCompare(String(b.reference || '')))

  const totalInterventions = filtered.reduce((sum, item) => sum + Number(item.intervention_count || 0), 0)
  const totalEssais = filtered.reduce((sum, item) => sum + Number(item.essai_count || 0), 0)
  const d = demande
  const urgDate = d?.date_echeance && !['Fini', 'Envoyé - Perdu', 'Archivée'].includes(d?.statut)
    ? (new Date(d.date_echeance) - new Date()) / 86400000
    : null

  const backLabel = filterDemandeId ? '← Demande' : '← Demandes'
  const pageEyebrow = filterDemandeId ? 'Campagnes demande' : 'Campagnes RST'
  const pageTitle = filterDemandeId
    ? (d?.reference || demandeLoading ? '…' : `#${filterDemandeId}`)
    : 'Toutes les campagnes'

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto" style={{ background: PAGE_BG }}>
      <div
        className="sticky top-0 z-10 border-b border-[#dbe1ea]"
        style={{ background: 'rgba(255,255,255,0.96)', boxShadow: '0 6px 24px rgba(0,49,112,0.08)', backdropFilter: 'blur(12px)' }}
      >
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)' }} />
        <div className="w-full max-w-full mx-auto px-7 flex flex-wrap items-center gap-2.5 py-3">
          <button
            type="button"
            onClick={handleBackNavigation}
            className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0"
          >
            {backLabel}
          </button>
          <div className="flex-1 min-w-[220px]">
            <div className="text-[#8a95a8] text-[11px] font-bold tracking-[.14em] uppercase">{pageEyebrow}</div>
            <div className="text-[15px] font-black">{pageTitle}</div>
          </div>
          {filterDemandeId && d?.affaire_rst_id ? (
            <Button size="sm" onClick={() => navigate(`/affaires/${d.affaire_rst_id}`)}>Affaire</Button>
          ) : null}
          {filterDemandeId ? (
            <>
              <Button size="sm" onClick={() => navigate(buildPathWithReturnTo(`/demandes/${filterDemandeId}`, explicitReturnTo))}>Demande</Button>
              <Button size="sm" onClick={() => navigate(buildPathWithReturnTo(`/preparations/${filterDemandeId}${d?.reference ? `?ref=${encodeURIComponent(d.reference)}` : ''}`, listReturnTo))}>
                Préparation
              </Button>
              <Button size="sm" onClick={() => navigate(buildPathWithReturnTo(`/interventions?demande_id=${filterDemandeId}`, listReturnTo))}>
                Interventions
              </Button>
            </>
          ) : null}
          {filterDemandeId ? (
            <Button size="sm" variant="primary" onClick={openPreparationForCreate}>
              Créer via la préparation
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 rounded-xl text-[#69758a] hover:bg-[#f3f6fb] transition-colors"
            title="Actualiser"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
        {filterDemandeId && d ? (
          <section
            className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white"
            style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
          >
            <div
              className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
              style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
            >
              <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />
              <div>
                <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
                  <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
                  RaLab 5 · Campagnes
                </div>
                <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{d.reference}</h1>
                <div className="mt-3 text-[20px] font-black">{d.nature || d.type_mission || '—'}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
                  {d.affaire_ref ? <span>Affaire : <strong className="text-white">{d.affaire_ref}</strong></span> : null}
                  {d.chantier ? <span>Chantier : <strong className="text-white">{d.chantier}</strong></span> : null}
                  {d.client ? <span>Client : <strong className="text-white">{d.client}</strong></span> : null}
                </div>
              </div>
              <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge s={d.statut} map={STAT_CLS} />
                  <Badge s={d.priorite} map={PRIO_CLS} />
                </div>
                <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Laboratoire</div>
                <div className="mt-1.5 text-[13px] font-black"><LabName code={d.labo_code} /></div>
                {urgDate !== null ? (
                  <div className={`mt-2 text-[12px] font-black ${urgDate < 0 ? 'text-[#ff6b6b]' : urgDate <= 7 ? 'text-[#ffcc00]' : 'text-white/70'}`}>
                    {urgDate < 0 ? `Échéance dépassée (${Math.abs(Math.round(urgDate))}j)` : `Échéance dans ${Math.round(urgDate)}j`}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
              <MetricCard
                label="Campagnes"
                value={filtered.length}
                detail={`${filtered.length} campagne${filtered.length !== 1 ? 's' : ''} cadrée${filtered.length !== 1 ? 's' : ''}`}
              />
              <MetricCard
                label="Interventions"
                value={totalInterventions}
                detail="Rattachées aux campagnes listées"
              />
              <MetricCard
                label="Essais"
                value={totalEssais}
                detail="Liés aux campagnes listées"
              />
              <MetricCard
                label="Échéance"
                value={d.date_echeance ? formatDate(d.date_echeance) : '—'}
                detail={d.date_echeance ? 'Date demande' : 'Non définie'}
              />
            </div>
          </section>
        ) : null}

        <SectionCard
          title="Campagnes d'intervention"
          subtitle={filterDemandeId ? 'Campagnes cadrées pour cette demande' : 'Vue globale des campagnes RST'}
          chip={(
            <span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
              {filtered.length}
            </span>
          )}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <input
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Référence, libellé, programme…"
                className="min-w-[180px] max-w-[240px] px-3 py-1.5 border border-[#dbe1ea] rounded-lg text-sm bg-white outline-none focus:border-[#003170]"
              />
              <Select value={statut} onChange={(event) => setStatut(event.target.value)} className="text-xs py-1.5 min-w-[120px]">
                <option value="">Tous statuts</option>
                {STATUTS.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
              {(statut || search) ? (
                <button
                  type="button"
                  onClick={() => { setStatut(''); setSearch('') }}
                  className="text-xs text-[#69758a] hover:text-[#a32d2d] flex items-center gap-1"
                >
                  <X size={11} /> Effacer
                </button>
              ) : null}
            </div>
          )}
        >
          {isLoading ? (
            <div className="text-xs text-[#69758a] text-center py-12">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 flex flex-col items-center gap-3 text-center">
              <div className="text-[32px]">📋</div>
              <div className="text-[15px] font-black text-[#172033]">Aucune campagne</div>
              <div className="text-[13px] text-[#69758a] max-w-[480px] leading-6">
                {filterDemandeId
                  ? 'Créez les campagnes depuis la préparation (DIAG-CH, Témoin, RARx, Suivi…).'
                  : 'Aucune campagne ne correspond aux filtres sélectionnés.'}
              </div>
              {filterDemandeId ? (
                <Button size="sm" variant="primary" onClick={openPreparationForCreate}>
                  Ouvrir la préparation
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((campaign) => (
                <CampaignCard
                  key={campaign.uid}
                  campaign={campaign}
                  listReturnTo={listReturnTo}
                  navigate={navigate}
                  demandeId={filterDemandeId || campaign.demande_id || campaign.demande_uid}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

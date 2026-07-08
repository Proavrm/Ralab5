import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, FlaskConical, Plus, Wrench } from 'lucide-react'
import Button from '@/components/ui/Button'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { buildCreateInterventionHref } from '@/lib/preparationBoard'
import CreateCampaignModal from '@/components/preparation/CreateCampaignModal'
import CreateEssaiModal from '@/components/preparation/CreateEssaiModal'
import SiteAccessRapportButton from '@/components/site/SiteAccessRapportButton'

function BoardRow({
  title,
  subtitle,
  meta,
  actions,
  onOpen,
}) {
  return (
    <div className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcfe] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left hover:opacity-80">
        <div className="text-[13px] font-bold text-[#003170]">{title}</div>
        {subtitle ? <div className="mt-0.5 text-[12px] text-[#69758a] line-clamp-1">{subtitle}</div> : null}
        {meta ? <div className="mt-1 text-[11px] text-[#8a95a8]">{meta}</div> : null}
      </button>
      {actions ? <div className="flex flex-wrap items-center gap-1.5 shrink-0">{actions}</div> : null}
    </div>
  )
}

function CampaignBoardCard({
  campaign,
  demandeUid,
  demande,
  preparation,
  returnTo,
  navigate,
  onCreateIntervention,
  onCreateEssai,
  expanded,
  onToggle,
}) {
  const title = campaign.code || campaign.label || campaign.reference
  const interventions = campaign.interventions || []
  const interventionCount = Number(campaign.intervention_count || interventions.length || 0)
  const essaiCount = Number(campaign.essai_count || 0)

  return (
    <section className="rounded-[16px] border border-[#dbe1ea] bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-left hover:bg-[#f8fafc] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-black text-[#003170]">{campaign.reference}</span>
            <span className="rounded-full bg-[#eef5ff] px-2 py-0.5 text-[11px] font-bold text-[#003170]">{title}</span>
          </div>
          <div className="mt-1 text-[12px] text-[#69758a]">
            {interventionCount} intervention{interventionCount !== 1 ? 's' : ''}
            {essaiCount ? ` · ${essaiCount} essai${essaiCount !== 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-[#69758a] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded ? (
        <div className="border-t border-[#edf1f7] px-4 pb-4 pt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(buildPathWithReturnTo(`/campagnes/${campaign.uid}`, returnTo))}
            >
              Ouvrir campagne
            </Button>
            <Button size="sm" onClick={() => onCreateIntervention?.(campaign)}>
              <Plus size={13} />
              <span className="ml-1">Intervention</span>
            </Button>
          </div>

          {interventions.length ? (
            <div className="flex flex-col gap-2">
              {interventions.map((item) => (
                <BoardRow
                  key={item.uid}
                  title={item.reference || `Intervention #${item.uid}`}
                  subtitle={item.sujet || item.type_intervention || '—'}
                  meta={[item.statut, item.date_intervention, item.essai_count ? `${item.essai_count} essai(s)` : ''].filter(Boolean).join(' · ')}
                  onOpen={() => navigate(buildPathWithReturnTo(`/interventions/${item.uid}`, returnTo))}
                  actions={(
                    <>
                      <Button size="sm" variant="secondary" onClick={() => onCreateEssai?.(item, campaign)}>
                        <FlaskConical size={13} />
                        <span className="ml-1">Essai</span>
                      </Button>
                    </>
                  )}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[10px] border border-dashed border-[#dbe1ea] px-3 py-3 text-[12px] text-[#69758a]">
              Aucune intervention dans cette campagne.
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

export default function PreparationDossierPanel({
  demandeUid,
  returnTo,
  preparation = {},
  demande = {},
  campaigns = [],
  interventions = [],
  essais = [],
  echantillons = [],
  onCreateCampaign,
  onCreateIntervention,
  onCreateEssai,
  isCreatingCampaign = false,
  isCreatingEssai = false,
}) {
  const navigate = useNavigate()
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [essaiModalOpen, setEssaiModalOpen] = useState(false)
  const [essaiDefaults, setEssaiDefaults] = useState({ interventionUid: '', campaignLabel: '' })

  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => String(a.reference || '').localeCompare(String(b.reference || ''), 'fr')),
    [campaigns],
  )
  const existingCampaignCodes = useMemo(
    () => [...new Set(campaigns.map((item) => String(item.code || '').trim().toUpperCase()).filter(Boolean))],
    [campaigns],
  )

  const campaignInterventionIds = useMemo(() => {
    const ids = new Set()
    sortedCampaigns.forEach((campaign) => {
      ;(campaign.interventions || []).forEach((item) => ids.add(String(item.uid)))
    })
    return ids
  }, [sortedCampaigns])

  const orphanInterventions = useMemo(
    () => (interventions || []).filter((item) => item?.uid && !campaignInterventionIds.has(String(item.uid))),
    [interventions, campaignInterventionIds],
  )

  const boardInterventions = useMemo(() => {
    const rows = []
    sortedCampaigns.forEach((campaign) => {
      ;(campaign.interventions || []).forEach((item) => {
        rows.push({
          ...item,
          campagne_reference: campaign.reference,
          campagne_label: campaign.label || campaign.code,
        })
      })
    })
    orphanInterventions.forEach((item) => rows.push(item))
    return rows
  }, [sortedCampaigns, orphanInterventions])

  const [expandedUid, setExpandedUid] = useState(null)

  useEffect(() => {
    if (!sortedCampaigns.length) {
      setExpandedUid(null)
      return
    }
    if (!expandedUid || !sortedCampaigns.some((item) => String(item.uid) === String(expandedUid))) {
      setExpandedUid(sortedCampaigns[0]?.uid ?? null)
    }
  }, [sortedCampaigns, expandedUid])

  function openInterventionFlow(campaign = null) {
    if (onCreateIntervention) {
      onCreateIntervention(campaign)
      return
    }
    const href = buildCreateInterventionHref({
      demandeUid,
      preparation,
      campaign,
      demande,
      returnTo,
    })
    navigate(href)
  }

  function openEssaiFlow(intervention = null, campaign = null) {
    setEssaiDefaults({
      interventionUid: intervention?.uid ? String(intervention.uid) : '',
      campaignLabel: campaign?.reference || campaign?.label || campaign?.code || '',
    })
    setEssaiModalOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[18px] border border-[#003170]/15 bg-gradient-to-r from-[#003170]/5 to-transparent px-5 py-4 flex flex-col gap-4">
        <div>
          <div className="text-[16px] font-black text-[#003170]">Tableau de bord opérationnel</div>
          <div className="mt-1 text-[12px] text-[#69758a] max-w-[720px]">
            Créez campagnes, interventions et essais directement depuis la préparation.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setCampaignModalOpen(true)} disabled={isCreatingCampaign}>
            {isCreatingCampaign ? 'Création…' : '+ Campagne'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openInterventionFlow(null)}>
            <Plus size={13} />
            <span className="ml-1">Intervention</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openEssaiFlow()}
            disabled={!boardInterventions.length && !echantillons.length}
          >
            <FlaskConical size={13} />
            <span className="ml-1">Essai</span>
          </Button>
          {demandeUid ? (
            <SiteAccessRapportButton
              demandeUid={demandeUid}
              returnTo={returnTo}
            />
          ) : null}
        </div>
      </div>

      <CreateCampaignModal
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        existingCodes={existingCampaignCodes}
        onConfirm={(template) => {
          onCreateCampaign?.(template)
          setCampaignModalOpen(false)
        }}
      />

      <CreateEssaiModal
        open={essaiModalOpen}
        onClose={() => setEssaiModalOpen(false)}
        interventions={boardInterventions}
        echantillons={echantillons}
        defaultInterventionUid={essaiDefaults.interventionUid}
        isSubmitting={isCreatingEssai}
        onConfirm={async (payload) => {
          try {
            await onCreateEssai?.({ ...payload, campaignLabel: essaiDefaults.campaignLabel })
            setEssaiModalOpen(false)
          } catch {
            // error surfaced by parent
          }
        }}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] font-black text-[#003170]">Campagnes</div>
          <span className="text-[11px] font-bold text-[#69758a]">{sortedCampaigns.length}</span>
        </div>
        {sortedCampaigns.length ? sortedCampaigns.map((campaign) => (
          <CampaignBoardCard
            key={campaign.uid}
            campaign={campaign}
            demandeUid={demandeUid}
            demande={demande}
            preparation={preparation}
            returnTo={returnTo}
            navigate={navigate}
            expanded={String(expandedUid) === String(campaign.uid)}
            onToggle={() => setExpandedUid((current) => (
              String(current) === String(campaign.uid) ? null : campaign.uid
            ))}
            onCreateIntervention={openInterventionFlow}
            onCreateEssai={openEssaiFlow}
          />
        )) : (
          <div className="rounded-[16px] border border-dashed border-[#dbe1ea] bg-white px-5 py-8 text-center">
            <div className="text-[14px] font-bold text-[#003170]">Aucune campagne</div>
            <div className="mt-1 text-[13px] text-[#69758a]">Commencez par un type du catalogue (DIAG-CH, Visite chantier, TOPO…) ou une campagne vierge.</div>
            <div className="mt-4">
              <Button size="sm" onClick={() => setCampaignModalOpen(true)} disabled={isCreatingCampaign}>
                {isCreatingCampaign ? 'Création…' : 'Créer la première campagne'}
              </Button>
            </div>
          </div>
        )}
      </section>

      {orphanInterventions.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-black text-[#003170]">Interventions hors campagne</div>
            <span className="text-[11px] font-bold text-[#69758a]">{orphanInterventions.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {orphanInterventions.map((item) => (
              <BoardRow
                key={item.uid}
                title={item.reference || `Intervention #${item.uid}`}
                subtitle={item.sujet || item.type_intervention || '—'}
                meta={[item.statut, item.date_intervention].filter(Boolean).join(' · ')}
                onOpen={() => navigate(buildPathWithReturnTo(`/interventions/${item.uid}`, returnTo))}
                actions={(
                  <Button size="sm" variant="secondary" onClick={() => openEssaiFlow(item)}>
                    <FlaskConical size={13} />
                    <span className="ml-1">Essai</span>
                  </Button>
                )}
              />
            ))}
          </div>
        </section>
      ) : null}

      {essais.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-black text-[#003170]">Essais</div>
            <span className="text-[11px] font-bold text-[#69758a]">{essais.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {essais.map((item) => (
              <BoardRow
                key={item.uid || item.id}
                title={item.type_essai || item.essai_code || `Essai #${item.uid || item.id}`}
                subtitle={[item.intervention_reference, item.echantillon_reference].filter(Boolean).join(' · ') || '—'}
                meta={[item.statut, item.resultat_principal ? `${item.resultat_principal} ${item.resultat_unite || ''}`.trim() : ''].filter(Boolean).join(' · ')}
                onOpen={() => navigate(buildPathWithReturnTo(`/essais/${item.uid || item.id}`, returnTo))}
                actions={(
                  item.intervention_reference ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(buildPathWithReturnTo(`/interventions?demande_id=${demandeUid}`, returnTo))}
                    >
                      <Wrench size={13} />
                    </Button>
                  ) : null
                )}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

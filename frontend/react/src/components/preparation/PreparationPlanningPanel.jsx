import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import PlanningWorkspace from '@/components/planning/PlanningWorkspace'
import CreateCampaignModal from '@/components/preparation/CreateCampaignModal'
import CreateEssaiModal from '@/components/preparation/CreateEssaiModal'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { filterPreparationPlanningItems, normalizePlanningItem, urgencyFromEch } from '@/lib/planningShared'
import { interventionCampaignsApi, planningApi } from '@/services/api'

const EMPTY_PLANNING_ROWS = []

export default function PreparationPlanningPanel({
  demandeUid,
  returnTo,
  campaigns = [],
  planningStartDate = '',
  planningFocusDate = '',
  planningEndDate = '',
  dossierContext = null,
  boardInterventions = [],
  echantillons = [],
  onCreateCampaign,
  onCreateIntervention,
  onCreateEssai,
  isCreatingCampaign = false,
  isCreatingEssai = false,
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [essaiModalOpen, setEssaiModalOpen] = useState(false)
  const [localError, setLocalError] = useState('')
  const [deletingCampagneUid, setDeletingCampagneUid] = useState(null)
  const [items, setItems] = useState([])

  const existingCampaignCodes = useMemo(
    () => [...new Set(campaigns.map((item) => String(item.code || '').trim().toUpperCase()).filter(Boolean))],
    [campaigns],
  )

  const { data: planningRows = EMPTY_PLANNING_ROWS, isLoading, error, refetch } = useQuery({
    queryKey: ['preparation-planning', demandeUid],
    queryFn: async () => {
      const rows = await planningApi.listItems()
      return filterPreparationPlanningItems(rows.map(normalizePlanningItem), demandeUid)
    },
    enabled: Boolean(demandeUid),
    staleTime: 0,
  })

  useEffect(() => {
    setItems(planningRows)
  }, [planningRows])

  async function patchItem(target, patch, closeAfter) {
    const targetKey = typeof target === 'object' ? target?.key : target?.key
    const currentItem = items.find((item) => item.key === targetKey)
      || (typeof target === 'object' ? target : null)
    if (!currentItem) return
    const currentKey = currentItem.key
    const optimistic = { ...currentItem, ...patch }
    if ('ech' in patch || 'start' in patch) {
      optimistic.urg = urgencyFromEch(optimistic.ech || optimistic.start)
    }
    if ('stat' in patch && ['Termine', 'Annule'].includes(patch.stat)) optimistic.urg = 'done'
    setItems((prev) => prev.map((entry) => (entry.key === currentKey ? { ...entry, ...optimistic } : entry)))
    setLocalError('')
    try {
      const payload = { ...patch }
      if (!currentItem.editable_ech) delete payload.ech
      if (!currentItem.editable_start) delete payload.start
      const saved = normalizePlanningItem(await planningApi.updateItem(currentItem.kind, currentItem.uid, payload))
      setItems((prev) => prev.map((entry) => (entry.key === currentKey ? saved : entry)))
      await qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })
      await qc.invalidateQueries({ queryKey: ['preparation-planning', demandeUid] })
      if (closeAfter) return
    } catch (err) {
      setItems((prev) => prev.map((entry) => (entry.key === currentKey ? currentItem : entry)))
      setLocalError(err.message || 'Erreur de mise à jour')
      throw err
    }
  }

  function openItem(item) {
    if (!item?.route) return
    navigate(buildPathWithReturnTo(item.route, returnTo))
  }

  async function refreshPlanning() {
    const result = await refetch()
    if (result.data) setItems(result.data)
  }

  async function handleCreateCampaign(template) {
    await onCreateCampaign?.(template)
    setCampaignModalOpen(false)
    await refreshPlanning()
  }

  async function handleCreateEssai(payload) {
    try {
      await onCreateEssai?.(payload)
      setEssaiModalOpen(false)
      await refreshPlanning()
    } catch {
      // parent surfaces error
    }
  }

  async function handleDeleteCampagne(row) {
    const interventionCount = Number(row?.interventionCount || 0)
    if (interventionCount > 0) {
      setLocalError('Impossible de supprimer une campagne avec des interventions rattachées.')
      return
    }

    const ref = row?.campagne?.ref || `Campagne #${row?.campagneUid || ''}`
    const label = row?.campagne?.tit || row?.campagne?.subtitle || ''
    const warning = label
      ? `Supprimer la campagne ${ref} (${label}) ?\n\nCette action est irréversible.`
      : `Supprimer la campagne ${ref} ?\n\nCette action est irréversible.`
    if (!window.confirm(warning)) return

    setLocalError('')
    setDeletingCampagneUid(row.campagneUid)
    try {
      await interventionCampaignsApi.delete(row.campagneUid)
      await qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })
      await qc.invalidateQueries({ queryKey: ['preparation-planning', demandeUid] })
    } catch (err) {
      setLocalError(err.message || 'Erreur de suppression')
    } finally {
      setDeletingCampagneUid(null)
    }
  }

  const toolbar = (
    <>
      <Button size="sm" onClick={() => setCampaignModalOpen(true)} disabled={isCreatingCampaign}>
        {isCreatingCampaign ? 'Création…' : '+ Campagne'}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => onCreateIntervention?.(null)}>
        <Plus size={13} />
        <span className="ml-1">Intervention</span>
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setEssaiModalOpen(true)}
        disabled={!boardInterventions.length && !echantillons.length}
      >
        <FlaskConical size={13} />
        <span className="ml-1">Essai</span>
      </Button>
    </>
  )

  return (
    <>
      <PlanningWorkspace
        items={items}
        campaigns={campaigns}
        demandeUid={demandeUid}
        loading={isLoading}
        error={localError || (error?.message || '')}
        toolbar={toolbar}
        onPatchItem={patchItem}
        onOpenItem={openItem}
        onDeleteCampagne={handleDeleteCampagne}
        deletingCampagneUid={deletingCampagneUid}
        planningStartDate={planningStartDate}
        planningFocusDate={planningFocusDate}
        planningEndDate={planningEndDate}
        dossierContext={dossierContext}
        embedded
        viewMode="agenda"
        agendaRowMode="campagne"
        showSidebar={false}
      />

      <CreateCampaignModal
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        existingCodes={existingCampaignCodes}
        onConfirm={handleCreateCampaign}
      />

      <CreateEssaiModal
        open={essaiModalOpen}
        onClose={() => setEssaiModalOpen(false)}
        interventions={boardInterventions}
        echantillons={echantillons}
        isSubmitting={isCreatingEssai}
        onConfirm={handleCreateEssai}
      />
    </>
  )
}

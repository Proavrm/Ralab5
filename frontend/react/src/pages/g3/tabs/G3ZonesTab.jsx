import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api, plansImplantationApi } from '@/services/api'
import { G3_ZONE_RISK_OPTIONS, G3_ZONE_TYPE_OPTIONS } from '@/lib/g3/g3Catalogs'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'

const EMPTY = {
  name: '',
  type: '',
  description: '',
  location: '',
  status: '',
  risk_level: 'Faible',
  responsible: '',
  observations: '',
  plan_id: '',
  plan_object_id: '',
}

export default function G3ZonesTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(EMPTY)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const rows = mission?.zones || []
  const typeOptions = catalogs?.zone_types || G3_ZONE_TYPE_OPTIONS
  const riskOptions = catalogs?.zone_risk_levels || G3_ZONE_RISK_OPTIONS
  const returnTo = buildPathWithReturnTo(`/g3/missions/${missionId}?tab=zones`, '/g3/missions')

  const { data: plans = [] } = useQuery({
    queryKey: ['g3-plans', mission?.demande_id],
    queryFn: () => plansImplantationApi.list({ demande_id: mission.demande_id }),
    enabled: !!mission?.demande_id,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const addMut = useMutation({
    mutationFn: (data) => g3Api.createZone(missionId, data),
    onSuccess: () => {
      setDraft(EMPTY)
      setShowAdd(false)
      setMessage('Zone ajoutée.')
      setError('')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Ajout impossible.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateZone(id, data),
    onSuccess: () => invalidate(),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteZone(id),
    onSuccess: () => { setMessage('Zone supprimée.'); invalidate() },
  })

  function updateRow(id, patch) {
    updateMut.mutate({ id, data: patch })
  }

  function submitDraft(e) {
    e.preventDefault()
    addMut.mutate(draft)
  }

  function openPlan(planId) {
    if (!planId) return
    navigate(buildPathWithReturnTo(`/plans-implantation/${planId}`, returnTo))
  }

  return (
    <SectionCard title="Ouvrages / zones">
      <p className="text-[12px] text-[#69758a] mb-3">
        Rattachez chaque zone à un plan d'implantation existant de la demande (identifiant plan + objet canvas).
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>Ajouter zone</Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      {showAdd ? (
        <form onSubmit={submitDraft} className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4">
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Nom zone
            <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} required />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Type zone
            <Select value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))}>
              <option value="">—</option>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Plan associé
            <Select value={draft.plan_id} onChange={(e) => setDraft((p) => ({ ...p, plan_id: e.target.value }))}>
              <option value="">—</option>
              {(plans || []).map((plan) => (
                <option key={plan.uid || plan.id} value={String(plan.uid || plan.id)}>
                  {plan.reference || plan.titre || `Plan #${plan.uid || plan.id}`}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Objet plan (ID canvas)
            <Input value={draft.plan_object_id} onChange={(e) => setDraft((p) => ({ ...p, plan_object_id: e.target.value }))} />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Localisation
            <Input value={draft.location} onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))} />
          </label>
          <div className="md:col-span-2 flex gap-2">
            <Button size="sm" type="submit">Ajouter</Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setShowAdd(false)}>Annuler</Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[12px]">
          <thead>
            <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
              <th className="py-2 pr-2">Nom</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Risque</th>
              <th className="py-2 pr-2">Localisation</th>
              <th className="py-2 pr-2">Plan</th>
              <th className="py-2 pr-2">Objet plan</th>
              <th className="py-2 pr-2">Responsable</th>
              <th className="py-2 pr-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-6 text-center text-[#69758a]">Aucune zone. Ajoutez les ouvrages / zones de la mission.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-[#eef2f7] align-top">
                <td className="py-2 pr-2">
                  <Input value={row.name || ''} onChange={(e) => updateRow(row.id, { name: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Select value={row.type} onChange={(e) => updateRow(row.id, { type: e.target.value })}>
                    <option value="">—</option>
                    {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Select value={row.risk_level} onChange={(e) => updateRow(row.id, { risk_level: e.target.value })}>
                    {riskOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.location || ''} onChange={(e) => updateRow(row.id, { location: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Select value={row.plan_id || ''} onChange={(e) => updateRow(row.id, { plan_id: e.target.value })}>
                    <option value="">—</option>
                    {(plans || []).map((plan) => (
                      <option key={plan.uid || plan.id} value={String(plan.uid || plan.id)}>
                        {plan.reference || `Plan #${plan.uid || plan.id}`}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.plan_object_id || ''} onChange={(e) => updateRow(row.id, { plan_object_id: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.responsible || ''} onChange={(e) => updateRow(row.id, { responsible: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <div className="flex flex-col gap-1">
                    {row.plan_id ? (
                      <Button size="sm" variant="secondary" onClick={() => openPlan(row.plan_id)}>Voir plan</Button>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={() => deleteMut.mutate(row.id)}>Supprimer</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

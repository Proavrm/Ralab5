import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import {
  G3_INTERVENTION_TYPE_OPTIONS,
  G3_INTERVENTION_REALIZED_STATUS_OPTIONS,
  G3_WEATHER_OPTIONS,
  G3_HYDRIC_CONDITION_OPTIONS,
} from '@/lib/g3/g3Catalogs'
import {
  draftToInterventionPayload,
  emptyInterventionDraft,
  getInterventionPayloadFields,
  interventionToDraft,
} from '@/lib/g3/g3InterventionPayload'
import { formatDate } from '@/lib/utils'

export default function G3InterventionsTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const rows = mission?.realized_interventions || []
  const zones = mission?.zones || []
  const typeOptions = catalogs?.intervention_types || G3_INTERVENTION_TYPE_OPTIONS
  const statusOptions = catalogs?.intervention_realized_statuses || G3_INTERVENTION_REALIZED_STATUS_OPTIONS
  const weatherOptions = catalogs?.weather_options || G3_WEATHER_OPTIONS
  const hydricOptions = catalogs?.hydric_condition_options || G3_HYDRIC_CONDITION_OPTIONS

  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(emptyInterventionDraft())
  const [showAdd, setShowAdd] = useState(false)
  const [addDraft, setAddDraft] = useState(emptyInterventionDraft())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId],
  )

  useEffect(() => {
    if (selected) {
      setDraft(interventionToDraft(selected))
    }
  }, [selected?.id, selected?.updated_at])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const saveMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateIntervention(id, data),
    onSuccess: () => {
      setMessage('Intervention enregistrée.')
      setError('')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Enregistrement impossible.'),
  })

  const addMut = useMutation({
    mutationFn: (data) => g3Api.createRealizedIntervention(missionId, data),
    onSuccess: (created) => {
      setShowAdd(false)
      setAddDraft(emptyInterventionDraft())
      setSelectedId(created.id)
      setMessage('Intervention réalisée créée.')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Création impossible.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteIntervention(id),
    onSuccess: () => {
      setSelectedId(null)
      setMessage('Intervention supprimée.')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Suppression impossible.'),
  })

  const payloadFields = getInterventionPayloadFields(draft.type, catalogs)

  function setPayloadField(key, value) {
    setDraft((prev) => ({
      ...prev,
      payload: { ...(prev.payload || {}), [key]: value },
    }))
  }

  function handleSave(e) {
    e.preventDefault()
    if (!selectedId) return
    saveMut.mutate({ id: selectedId, data: draftToInterventionPayload(draft) })
  }

  function submitAdd(e) {
    e.preventDefault()
    addMut.mutate(draftToInterventionPayload(addDraft))
  }

  return (
    <SectionCard title="Interventions réalisées">
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>
          Ajouter intervention réalisée
        </Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      {showAdd ? (
        <form onSubmit={submitAdd} className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4">
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Type
            <Select value={addDraft.type} onChange={(e) => setAddDraft((p) => ({ ...p, type: e.target.value }))} required>
              <option value="">—</option>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Zone
            <Select value={addDraft.zone_id} onChange={(e) => setAddDraft((p) => ({ ...p, zone_id: e.target.value }))}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Date
            <Input type="date" value={addDraft.date || ''} onChange={(e) => setAddDraft((p) => ({ ...p, date: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Responsable
            <Input value={addDraft.responsible} onChange={(e) => setAddDraft((p) => ({ ...p, responsible: e.target.value }))} />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Objectif
            <Input value={addDraft.objective} onChange={(e) => setAddDraft((p) => ({ ...p, objective: e.target.value }))} />
          </label>
          <div className="md:col-span-2 flex gap-2">
            <Button size="sm" type="submit" disabled={addMut.isPending}>Créer</Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setShowAdd(false)}>Annuler</Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto mb-4">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead>
            <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
              <th className="py-2 pr-2">N°</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Zone</th>
              <th className="py-2 pr-2">Statut</th>
              <th className="py-2 pr-2">Responsable</th>
              <th className="py-2 pr-2">Programme</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="py-4 text-[#69758a]">Aucune intervention réalisée. Transformez une ligne du programme ou ajoutez-en une.</td></tr>
            ) : rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={`border-b border-[#eef2f7] cursor-pointer ${selectedId === row.id ? 'bg-[#eef4fb]' : 'hover:bg-[#f8fafc]'}`}
              >
                <td className="py-2 pr-2 font-bold">{row.number || '—'}</td>
                <td className="py-2 pr-2">{row.type || '—'}</td>
                <td className="py-2 pr-2">{formatDate(row.date)}</td>
                <td className="py-2 pr-2">{row.zone_name || '—'}</td>
                <td className="py-2 pr-2">{row.status || '—'}</td>
                <td className="py-2 pr-2">{row.responsible || '—'}</td>
                <td className="py-2 pr-2">{row.realized_from_id ? `#${row.realized_from_id}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <form onSubmit={handleSave} className="rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-bold text-[#003170]">
              Intervention {selected.number} — {selected.type}
            </h3>
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={saveMut.isPending}>Enregistrer</Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => {
                  if (window.confirm('Supprimer cette intervention réalisée ?')) {
                    deleteMut.mutate(selected.id)
                  }
                }}
              >
                Supprimer
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Type
              <Select value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))}>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Zone
              <Select value={draft.zone_id} onChange={(e) => setDraft((p) => ({ ...p, zone_id: e.target.value }))}>
                <option value="">—</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Statut
              <Select value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Date
              <Input type="date" value={draft.date || ''} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Début
              <Input type="time" value={draft.start_time || ''} onChange={(e) => setDraft((p) => ({ ...p, start_time: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Fin
              <Input type="time" value={draft.end_time || ''} onChange={(e) => setDraft((p) => ({ ...p, end_time: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Responsable
              <Input value={draft.responsible} onChange={(e) => setDraft((p) => ({ ...p, responsible: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Participants
              <Input value={draft.participants} onChange={(e) => setDraft((p) => ({ ...p, participants: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              ID objet plan
              <Input value={draft.plan_object_id} onChange={(e) => setDraft((p) => ({ ...p, plan_object_id: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Météo
              <Select value={draft.weather} onChange={(e) => setDraft((p) => ({ ...p, weather: e.target.value }))}>
                <option value="">—</option>
                {weatherOptions.map((w) => <option key={w} value={w}>{w}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Condition hydrique
              <Select value={draft.hydric_condition} onChange={(e) => setDraft((p) => ({ ...p, hydric_condition: e.target.value }))}>
                <option value="">—</option>
                {hydricOptions.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Objectif
            <Input value={draft.objective} onChange={(e) => setDraft((p) => ({ ...p, objective: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Description / déroulement
            <Textarea rows={3} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Constats
            <Textarea rows={3} value={draft.findings} onChange={(e) => setDraft((p) => ({ ...p, findings: e.target.value }))} />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Décision
              <Textarea rows={2} value={draft.decision} onChange={(e) => setDraft((p) => ({ ...p, decision: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Actions suivantes
              <Textarea rows={2} value={draft.next_actions} onChange={(e) => setDraft((p) => ({ ...p, next_actions: e.target.value }))} />
            </label>
          </div>

          {payloadFields.length > 0 ? (
            <div className="rounded-lg border border-[#dbe1ea] bg-white p-3">
              <p className="text-[11px] font-bold text-[#003170] mb-2">Champs spécifiques — {draft.type}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {payloadFields.map((field) => (
                  <label key={field.key} className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
                    {field.label}
                    {field.type === 'textarea' ? (
                      <Textarea
                        rows={2}
                        value={draft.payload?.[field.key] || ''}
                        onChange={(e) => setPayloadField(field.key, e.target.value)}
                      />
                    ) : (
                      <Input
                        value={draft.payload?.[field.key] || ''}
                        onChange={(e) => setPayloadField(field.key, e.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Commentaires
            <Textarea rows={2} value={draft.comments} onChange={(e) => setDraft((p) => ({ ...p, comments: e.target.value }))} />
          </label>
        </form>
      ) : (
        <p className="text-[13px] text-[#69758a]">Sélectionnez une intervention pour la compléter.</p>
      )}
    </SectionCard>
  )
}

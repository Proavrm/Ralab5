import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import { G3_OBJECTIVE_PRIORITY_OPTIONS, G3_OBJECTIVE_STATUS_OPTIONS } from '@/lib/g3/g3Catalogs'

const EMPTY = {
  label: '',
  description: '',
  zone_id: '',
  priority: 'Moyenne',
  status: 'À faire',
  responsible: '',
  expected_result: '',
  comments: '',
}

export default function G3ObjectivesTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(EMPTY)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const rows = mission?.objectives || []
  const zones = mission?.zones || []
  const priorityOptions = catalogs?.objective_priorities || G3_OBJECTIVE_PRIORITY_OPTIONS
  const statusOptions = catalogs?.objective_statuses || G3_OBJECTIVE_STATUS_OPTIONS

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const defaultMut = useMutation({
    mutationFn: () => g3Api.createDefaultObjectives(missionId),
    onSuccess: () => { setMessage('Objectifs par défaut créés.'); setError(''); invalidate() },
    onError: (err) => setError(err?.message || 'Création impossible.'),
  })

  const addMut = useMutation({
    mutationFn: (data) => g3Api.createObjective(missionId, data),
    onSuccess: () => {
      setDraft(EMPTY)
      setShowAdd(false)
      setMessage('Objectif ajouté.')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Ajout impossible.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateObjective(id, data),
    onSuccess: () => invalidate(),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteObjective(id),
    onSuccess: () => { setMessage('Objectif supprimé.'); invalidate() },
  })

  function updateRow(id, patch) {
    updateMut.mutate({ id, data: patch })
  }

  function submitDraft(e) {
    e.preventDefault()
    addMut.mutate({
      ...draft,
      zone_id: draft.zone_id ? Number(draft.zone_id) : null,
    })
  }

  return (
    <SectionCard title="Objectifs G3">
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" onClick={() => defaultMut.mutate()} disabled={defaultMut.isPending || rows.length > 0}>
          Créer objectifs par défaut G3
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>Ajouter objectif</Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      {showAdd ? (
        <form onSubmit={submitDraft} className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4">
          <label className="md:col-span-2 flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Libellé
            <Input value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} required />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Description
            <Input value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Zone
            <Select value={draft.zone_id} onChange={(e) => setDraft((p) => ({ ...p, zone_id: e.target.value }))}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Priorité
            <Select value={draft.priority} onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value }))}>
              {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </label>
          <div className="md:col-span-2 flex gap-2">
            <Button size="sm" type="submit">Ajouter</Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setShowAdd(false)}>Annuler</Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead>
            <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
              <th className="py-2 pr-2">Libellé</th>
              <th className="py-2 pr-2">Zone</th>
              <th className="py-2 pr-2">Priorité</th>
              <th className="py-2 pr-2">Statut</th>
              <th className="py-2 pr-2">Responsable</th>
              <th className="py-2 pr-2">Résultat attendu</th>
              <th className="py-2 pr-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-center text-[#69758a]">Aucun objectif. Créez le jeu par défaut ou ajoutez un objectif.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-[#eef2f7] align-top">
                <td className="py-2 pr-2">
                  <Input value={row.label || ''} onChange={(e) => updateRow(row.id, { label: e.target.value })} />
                </td>
                <td className="py-2 pr-2">{row.zone_name || '—'}</td>
                <td className="py-2 pr-2">
                  <Select value={row.priority} onChange={(e) => updateRow(row.id, { priority: e.target.value })}>
                    {priorityOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Select value={row.status} onChange={(e) => updateRow(row.id, { status: e.target.value })}>
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.responsible || ''} onChange={(e) => updateRow(row.id, { responsible: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.expected_result || ''} onChange={(e) => updateRow(row.id, { expected_result: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Button size="sm" variant="secondary" onClick={() => deleteMut.mutate(row.id)}>Supprimer</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

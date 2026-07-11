import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import {
  G3_TEST_TYPE_OPTIONS,
  G3_TEST_STATUS_OPTIONS,
  G3_CONFORMITY_OPTIONS,
} from '@/lib/g3/g3Catalogs'
import { computeG3TestSummary } from '@/lib/g3/g3TestSummary'
import { formatDate } from '@/lib/utils'

const EMPTY = {
  type: '',
  label: '',
  reference: '',
  zone_id: '',
  intervention_id: '',
  test_date: '',
  status: 'En attente',
  result: '',
  conformity: 'En attente',
  observations: '',
}

export default function G3TestsTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const rows = mission?.tests || []
  const zones = mission?.zones || []
  const interventions = mission?.realized_interventions || []
  const typeOptions = catalogs?.test_types || G3_TEST_TYPE_OPTIONS
  const statusOptions = catalogs?.test_statuses || G3_TEST_STATUS_OPTIONS
  const conformityOptions = catalogs?.conformity_options || G3_CONFORMITY_OPTIONS
  const summary = computeG3TestSummary(rows)

  const [draft, setDraft] = useState(EMPTY)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const addMut = useMutation({
    mutationFn: (data) => g3Api.createTest(missionId, data),
    onSuccess: () => {
      setDraft(EMPTY)
      setShowAdd(false)
      setMessage('Essai ajouté.')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Ajout impossible.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateTest(id, data),
    onSuccess: () => invalidate(),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteTest(id),
    onSuccess: () => { setMessage('Essai supprimé.'); invalidate() },
  })

  function updateRow(id, patch) {
    updateMut.mutate({ id, data: patch })
  }

  function submitDraft(e) {
    e.preventDefault()
    addMut.mutate({
      ...draft,
      zone_id: draft.zone_id ? Number(draft.zone_id) : null,
      intervention_id: draft.intervention_id ? Number(draft.intervention_id) : null,
      test_date: draft.test_date || null,
    })
  }

  return (
    <SectionCard title="Essais / contrôles">
      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-full bg-[#eef2f7] px-3 py-1 font-bold">{summary.total} essai(s)</span>
        <span className="rounded-full bg-[#eaf3de] px-3 py-1 font-bold text-[#3b6d11]">{summary.conforme} conforme(s)</span>
        <span className="rounded-full bg-[#fde8e8] px-3 py-1 font-bold text-[#a32d2d]">{summary.non_conforme} non conforme(s)</span>
        <span className="rounded-full bg-[#faeeda] px-3 py-1 font-bold text-[#854f0b]">{summary.en_attente} en attente</span>
        {summary.non_applicable > 0 ? (
          <span className="rounded-full bg-[#f1efe8] px-3 py-1 font-bold">{summary.non_applicable} N/A</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>Ajouter essai</Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      {showAdd ? (
        <form onSubmit={submitDraft} className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4">
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Type
            <Select value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))} required>
              <option value="">—</option>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Libellé
            <Input value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Référence
            <Input value={draft.reference} onChange={(e) => setDraft((p) => ({ ...p, reference: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Date
            <Input type="date" value={draft.test_date} onChange={(e) => setDraft((p) => ({ ...p, test_date: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Zone
            <Select value={draft.zone_id} onChange={(e) => setDraft((p) => ({ ...p, zone_id: e.target.value }))}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Intervention
            <Select value={draft.intervention_id} onChange={(e) => setDraft((p) => ({ ...p, intervention_id: e.target.value }))}>
              <option value="">—</option>
              {interventions.map((i) => (
                <option key={i.id} value={i.id}>{i.number} — {i.type}</option>
              ))}
            </Select>
          </label>
          <div className="md:col-span-2 flex gap-2">
            <Button size="sm" type="submit">Ajouter</Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setShowAdd(false)}>Annuler</Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-[12px]">
          <thead>
            <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Libellé</th>
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Zone</th>
              <th className="py-2 pr-2">Intervention</th>
              <th className="py-2 pr-2">Statut</th>
              <th className="py-2 pr-2">Résultat</th>
              <th className="py-2 pr-2">Conformité</th>
              <th className="py-2 pr-2">Observations</th>
              <th className="py-2 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="py-4 text-[#69758a]">Aucun essai enregistré.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-[#eef2f7]">
                <td className="py-2 pr-2">
                  <Select
                    value={row.type || ''}
                    onChange={(e) => updateRow(row.id, { type: e.target.value })}
                    className="min-w-[120px]"
                  >
                    {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.label || ''} onChange={(e) => updateRow(row.id, { label: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Input
                    type="date"
                    value={row.test_date || ''}
                    onChange={(e) => updateRow(row.id, { test_date: e.target.value || null })}
                  />
                </td>
                <td className="py-2 pr-2">{row.zone_name || '—'}</td>
                <td className="py-2 pr-2">{row.intervention_number || '—'}</td>
                <td className="py-2 pr-2">
                  <Select value={row.status || 'En attente'} onChange={(e) => updateRow(row.id, { status: e.target.value })}>
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.result || ''} onChange={(e) => updateRow(row.id, { result: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Select value={row.conformity || 'En attente'} onChange={(e) => updateRow(row.id, { conformity: e.target.value })}>
                    {conformityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input value={row.observations || ''} onChange={(e) => updateRow(row.id, { observations: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm('Supprimer cet essai ?')) deleteMut.mutate(row.id)
                    }}
                  >
                    Suppr.
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

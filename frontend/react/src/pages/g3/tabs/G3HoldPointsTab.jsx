import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import { G3_HOLD_POINT_STATUS_OPTIONS } from '@/lib/g3/g3Catalogs'
import { formatDate } from '@/lib/utils'

const EMPTY = {
  code: '',
  label: '',
  description: '',
  zone_id: '',
  notice_id: '',
  status: 'À venir',
  due_date: '',
  observations: '',
  requires_tests: true,
  requires_notice: true,
}

export default function G3HoldPointsTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const rows = mission?.hold_points || []
  const zones = mission?.zones || []
  const notices = mission?.notices || []
  const statusOptions = catalogs?.hold_point_statuses || G3_HOLD_POINT_STATUS_OPTIONS

  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState(EMPTY)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const defaultMut = useMutation({
    mutationFn: () => g3Api.createDefaultHoldPoints(missionId),
    onSuccess: () => { setMessage('Points d\'arrêt type G3 créés.'); setError(''); invalidate() },
    onError: (err) => setError(err?.message || 'Création impossible.'),
  })

  const addMut = useMutation({
    mutationFn: (data) => g3Api.createHoldPoint(missionId, data),
    onSuccess: () => {
      setDraft(EMPTY)
      setShowAdd(false)
      setMessage('Point d\'arrêt ajouté.')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Ajout impossible.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateHoldPoint(id, data),
    onSuccess: () => invalidate(),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteHoldPoint(id),
    onSuccess: () => { setMessage('Point d\'arrêt supprimé.'); invalidate() },
  })

  function updateRow(id, patch) {
    updateMut.mutate({ id, data: patch })
  }

  function submitDraft(e) {
    e.preventDefault()
    addMut.mutate({
      ...draft,
      zone_id: draft.zone_id ? Number(draft.zone_id) : null,
      notice_id: draft.notice_id ? Number(draft.notice_id) : null,
      due_date: draft.due_date || null,
    })
  }

  return (
    <SectionCard title="Points d'arrêt">
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" onClick={() => defaultMut.mutate()} disabled={defaultMut.isPending || rows.length > 0}>
          Créer points d&apos;arrêt type G3
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>Ajouter point d&apos;arrêt</Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      {showAdd ? (
        <form onSubmit={submitDraft} className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4">
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Code
            <Input value={draft.code} onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))} required />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Libellé
            <Input value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} required />
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
              <th className="py-2 pr-2">Code</th>
              <th className="py-2 pr-2">Libellé</th>
              <th className="py-2 pr-2">Zone</th>
              <th className="py-2 pr-2">Échéance</th>
              <th className="py-2 pr-2">Statut</th>
              <th className="py-2 pr-2">Avis lié</th>
              <th className="py-2 pr-2">Alertes</th>
              <th className="py-2 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-4 text-[#69758a]">Aucun point d&apos;arrêt. Créez le jeu type G3.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className={`border-b border-[#eef2f7] ${row.alerts?.length ? 'bg-amber-50/60' : ''}`}>
                <td className="py-2 pr-2 font-bold">{row.code}</td>
                <td className="py-2 pr-2">{row.label}</td>
                <td className="py-2 pr-2">
                  <Select
                    value={row.zone_id ?? ''}
                    onChange={(e) => updateRow(row.id, { zone_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">—</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input
                    type="date"
                    value={row.due_date || ''}
                    onChange={(e) => updateRow(row.id, { due_date: e.target.value || null })}
                  />
                </td>
                <td className="py-2 pr-2">
                  <Select value={row.status || 'À venir'} onChange={(e) => updateRow(row.id, { status: e.target.value })}>
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Select
                    value={row.notice_id ?? ''}
                    onChange={(e) => updateRow(row.id, { notice_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">—</option>
                    {notices.map((n) => (
                      <option key={n.id} value={n.id}>{n.reference || n.title || `Avis #${n.id}`}</option>
                    ))}
                  </Select>
                </td>
                <td className="py-2 pr-2 text-[#a32d2d]">
                  {(row.alerts || []).length ? row.alerts.join(' · ') : '—'}
                </td>
                <td className="py-2 pr-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { if (window.confirm('Supprimer ce point d\'arrêt ?')) deleteMut.mutate(row.id) }}
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

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import { G3_NOTICE_STATUS_OPTIONS, G3_NOTICE_TYPE_OPTIONS } from '@/lib/g3/g3Catalogs'
import { formatDate } from '@/lib/utils'

const EMPTY = {
  type: '',
  reference: '',
  title: '',
  zone_id: '',
  intervention_id: '',
  notice_date: '',
  status: 'Brouillon',
  formulation: '',
  content: '',
  conditions: '',
  recommendations: '',
}

function emptyDraft() {
  return { ...EMPTY }
}

function noticeToDraft(row = {}) {
  return {
    type: row.type || '',
    reference: row.reference || '',
    title: row.title || '',
    zone_id: row.zone_id ?? '',
    intervention_id: row.intervention_id ?? '',
    notice_date: row.notice_date || '',
    status: row.status || 'Brouillon',
    formulation: row.formulation || '',
    content: row.content || '',
    conditions: row.conditions || '',
    recommendations: row.recommendations || '',
  }
}

export default function G3NoticesTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const rows = mission?.notices || []
  const zones = mission?.zones || []
  const interventions = mission?.realized_interventions || []
  const typeOptions = catalogs?.notice_types || G3_NOTICE_TYPE_OPTIONS
  const statusOptions = catalogs?.notice_statuses || G3_NOTICE_STATUS_OPTIONS

  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft())
  const [showAdd, setShowAdd] = useState(false)
  const [addDraft, setAddDraft] = useState(emptyDraft())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId])

  useEffect(() => {
    if (selected) setDraft(noticeToDraft(selected))
  }, [selected?.id, selected?.updated_at])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const draftMut = useMutation({
    mutationFn: (data) => g3Api.generateNoticeDraft(missionId, data),
    onSuccess: (result, variables) => {
      const apply = variables.target === 'add' ? setAddDraft : setDraft
      apply((prev) => ({
        ...prev,
        formulation: result.formulation || prev.formulation,
        content: result.content || prev.content,
        conditions: result.conditions || prev.conditions,
        recommendations: result.recommendations || prev.recommendations,
      }))
      setMessage('Formulation générée.')
    },
    onError: (err) => setError(err?.message || 'Génération impossible.'),
  })

  const addMut = useMutation({
    mutationFn: (data) => g3Api.createNotice(missionId, data),
    onSuccess: (created) => {
      setShowAdd(false)
      setAddDraft(emptyDraft())
      setSelectedId(created.id)
      setMessage('Avis créé.')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Création impossible.'),
  })

  const saveMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateNotice(id, data),
    onSuccess: () => { setMessage('Avis enregistré.'); invalidate() },
    onError: (err) => setError(err?.message || 'Enregistrement impossible.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteNotice(id),
    onSuccess: () => { setSelectedId(null); setMessage('Avis supprimé.'); invalidate() },
  })

  function payloadFromDraft(form) {
    return {
      ...form,
      zone_id: form.zone_id ? Number(form.zone_id) : null,
      intervention_id: form.intervention_id ? Number(form.intervention_id) : null,
      notice_date: form.notice_date || null,
    }
  }

  function requestDraft(form, target) {
    draftMut.mutate({
      target,
      type: form.type,
      zone_id: form.zone_id ? Number(form.zone_id) : null,
      intervention_id: form.intervention_id ? Number(form.intervention_id) : null,
    })
  }

  return (
    <SectionCard title="Avis G3">
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>Ajouter avis</Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      {showAdd ? (
        <form
          onSubmit={(e) => { e.preventDefault(); addMut.mutate(payloadFromDraft(addDraft)) }}
          className="mb-4 space-y-3 rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Type
              <Select value={addDraft.type} onChange={(e) => setAddDraft((p) => ({ ...p, type: e.target.value }))} required>
                <option value="">—</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Référence
              <Input value={addDraft.reference} onChange={(e) => setAddDraft((p) => ({ ...p, reference: e.target.value }))} />
            </label>
          </div>
          <Button size="sm" type="button" variant="secondary" onClick={() => requestDraft(addDraft, 'add')}>
            Générer formulation
          </Button>
          <div className="flex gap-2">
            <Button size="sm" type="submit">Créer</Button>
            <Button size="sm" variant="secondary" type="button" onClick={() => setShowAdd(false)}>Annuler</Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto mb-4">
        <table className="w-full min-w-[900px] text-[12px]">
          <thead>
            <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
              <th className="py-2 pr-2">Réf.</th>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Titre</th>
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Zone</th>
              <th className="py-2 pr-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-4 text-[#69758a]">Aucun avis G3.</td></tr>
            ) : rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={`border-b border-[#eef2f7] cursor-pointer ${selectedId === row.id ? 'bg-[#eef4fb]' : 'hover:bg-[#f8fafc]'}`}
              >
                <td className="py-2 pr-2 font-bold">{row.reference || '—'}</td>
                <td className="py-2 pr-2">{row.type || '—'}</td>
                <td className="py-2 pr-2">{row.title || '—'}</td>
                <td className="py-2 pr-2">{formatDate(row.notice_date)}</td>
                <td className="py-2 pr-2">{row.zone_name || '—'}</td>
                <td className="py-2 pr-2">{row.status || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <form
          onSubmit={(e) => { e.preventDefault(); saveMut.mutate({ id: selected.id, data: payloadFromDraft(draft) }) }}
          className="rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4 space-y-3"
        >
          <div className="flex flex-wrap gap-2 justify-between">
            <h3 className="text-[13px] font-bold text-[#003170]">Avis {selected.reference || `#${selected.id}`}</h3>
            <div className="flex gap-2">
              <Button size="sm" type="button" variant="secondary" onClick={() => requestDraft(draft, 'edit')}>
                Générer formulation
              </Button>
              <Button size="sm" type="submit" disabled={saveMut.isPending}>Enregistrer</Button>
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => { if (window.confirm('Supprimer cet avis ?')) deleteMut.mutate(selected.id) }}
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
              Statut
              <Select value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Date
              <Input type="date" value={draft.notice_date || ''} onChange={(e) => setDraft((p) => ({ ...p, notice_date: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Référence
              <Input value={draft.reference} onChange={(e) => setDraft((p) => ({ ...p, reference: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Titre
              <Input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Zone
              <Select value={draft.zone_id} onChange={(e) => setDraft((p) => ({ ...p, zone_id: e.target.value }))}>
                <option value="">—</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
              </Select>
            </label>
            <label className="md:col-span-3 flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Intervention
              <Select value={draft.intervention_id} onChange={(e) => setDraft((p) => ({ ...p, intervention_id: e.target.value }))}>
                <option value="">—</option>
                {interventions.map((i) => <option key={i.id} value={i.id}>{i.number} — {i.type}</option>)}
              </Select>
            </label>
          </div>

          {['formulation', 'content', 'conditions', 'recommendations'].map((field) => (
            <label key={field} className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              {field === 'formulation' ? 'Formulation introductive' : field === 'content' ? 'Contenu' : field === 'conditions' ? 'Conditions / réserves' : 'Recommandations'}
              <Textarea rows={3} value={draft[field]} onChange={(e) => setDraft((p) => ({ ...p, [field]: e.target.value }))} />
            </label>
          ))}
        </form>
      ) : (
        <p className="text-[13px] text-[#69758a]">Sélectionnez un avis pour l&apos;éditer.</p>
      )}
    </SectionCard>
  )
}

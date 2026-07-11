import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import { G3_INTERVENTION_TYPE_OPTIONS, G3_PROGRAMME_STATUS_OPTIONS } from '@/lib/g3/g3Catalogs'
import { openG3002Preview } from '@/lib/g3/g3DocumentBuilders'

const EMPTY_ROW = {
  type: '',
  zone_id: '',
  objective: '',
  means: '',
  responsible: '',
  prerequisites: '',
  date: '',
  status: 'À prévoir',
  expected_deliverable: '',
  comments: '',
}

export default function G3ProgrammeTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(EMPTY_ROW)
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const rows = mission?.planned_interventions || []
  const typeOptions = catalogs?.intervention_types || G3_INTERVENTION_TYPE_OPTIONS
  const statusOptions = catalogs?.programme_statuses || G3_PROGRAMME_STATUS_OPTIONS
  const zoneOptions = useMemo(() => mission?.zones || [], [mission?.zones])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const createDefaultMut = useMutation({
    mutationFn: () => g3Api.createDefaultProgramme(missionId),
    onSuccess: () => { setMessage('Programme type G3 créé.'); setError(''); invalidate() },
    onError: (err) => setError(err?.message || 'Impossible de créer le programme type.'),
  })

  const addMut = useMutation({
    mutationFn: (data) => g3Api.addProgrammeItem(missionId, data),
    onSuccess: () => {
      setDraft(EMPTY_ROW)
      setShowAdd(false)
      setMessage('Intervention ajoutée.')
      setError('')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Ajout impossible.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateIntervention(id, data),
    onSuccess: () => invalidate(),
    onError: (err) => setError(err?.message || 'Mise à jour impossible.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteIntervention(id),
    onSuccess: () => { setMessage('Intervention supprimée.'); invalidate() },
    onError: (err) => setError(err?.message || 'Suppression impossible.'),
  })

  const promoteMut = useMutation({
    mutationFn: (id) => g3Api.promoteIntervention(id),
    onSuccess: () => { setMessage('Intervention transformée en réalisée.'); invalidate() },
    onError: (err) => setError(err?.message || 'Transformation impossible.'),
  })

  const g3002Mut = useMutation({
    mutationFn: () => g3Api.generateG3002(missionId),
    onSuccess: (doc) => {
      openG3002Preview(doc.html, doc.title)
      setMessage('Document G3002 généré.')
    },
    onError: (err) => setError(err?.message || 'Génération G3002 impossible.'),
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
    <div className="space-y-4">
      <SectionCard title="Programme des reconnaissances">
        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" onClick={() => createDefaultMut.mutate()} disabled={createDefaultMut.isPending || rows.length > 0}>
            Créer programme type G3
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowAdd((v) => !v)}>
            Ajouter intervention
          </Button>
          <Button size="sm" variant="secondary" onClick={() => g3002Mut.mutate()} disabled={!rows.length || g3002Mut.isPending}>
            Générer G3002
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const subject = encodeURIComponent(`Programme G3 — ${mission?.reference || ''}`)
              const body = encodeURIComponent(`Bonjour,\n\nVeuillez trouver ci-joint le programme des reconnaissances G3 pour ${mission?.chantier || 'le chantier'}.\n\nRéf. mission : ${mission?.reference || ''}\n`)
              window.location.href = `mailto:?subject=${subject}&body=${body}`
            }}
          >
            Envoyer programme à chantier / labo
          </Button>
        </div>

        {message ? <div className="mb-3 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
        {error ? <div className="mb-3 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

        {showAdd ? (
          <form onSubmit={submitDraft} className="mb-4 rounded-xl border border-[#dbe1ea] bg-[#fbfcfe] p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Type d'intervention
              <Select value={draft.type} onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value }))}>
                <option value="">—</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Zone concernée
              <Select value={draft.zone_id} onChange={(e) => setDraft((p) => ({ ...p, zone_id: e.target.value }))}>
                <option value="">—</option>
                {zoneOptions.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
              </Select>
            </label>
            <label className="md:col-span-2 flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Objectif
              <Input value={draft.objective} onChange={(e) => setDraft((p) => ({ ...p, objective: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Moyen à mobiliser
              <Input value={draft.means} onChange={(e) => setDraft((p) => ({ ...p, means: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Responsable
              <Input value={draft.responsible} onChange={(e) => setDraft((p) => ({ ...p, responsible: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Prérequis
              <Input value={draft.prerequisites} onChange={(e) => setDraft((p) => ({ ...p, prerequisites: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Date prévue
              <Input type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Livrable attendu
              <Input value={draft.expected_deliverable} onChange={(e) => setDraft((p) => ({ ...p, expected_deliverable: e.target.value }))} />
            </label>
            <label className="md:col-span-2 flex flex-col gap-1 text-[10px] font-medium text-text-muted">
              Commentaires
              <Input value={draft.comments} onChange={(e) => setDraft((p) => ({ ...p, comments: e.target.value }))} />
            </label>
            <div className="md:col-span-2 flex gap-2">
              <Button size="sm" type="submit" disabled={addMut.isPending}>Ajouter</Button>
              <Button size="sm" variant="secondary" type="button" onClick={() => setShowAdd(false)}>Annuler</Button>
            </div>
          </form>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[12px]">
            <thead>
              <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
                <th className="py-2 pr-2">N°</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Zone</th>
                <th className="py-2 pr-2">Objectif</th>
                <th className="py-2 pr-2">Moyens</th>
                <th className="py-2 pr-2">Responsable</th>
                <th className="py-2 pr-2">Prérequis</th>
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Statut</th>
                <th className="py-2 pr-2">Livrable</th>
                <th className="py-2 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={11} className="py-6 text-center text-[#69758a]">Aucune intervention prévue. Créez le programme type ou ajoutez une ligne.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="border-b border-[#eef2f7] align-top">
                  <td className="py-2 pr-2 font-bold">{row.number}</td>
                  <td className="py-2 pr-2">
                    <Select value={row.type} onChange={(e) => updateRow(row.id, { type: e.target.value })} className="min-w-[160px]">
                      {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </td>
                  <td className="py-2 pr-2">{row.zone_name || '—'}</td>
                  <td className="py-2 pr-2">
                    <Input value={row.objective || ''} onChange={(e) => updateRow(row.id, { objective: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input value={row.means || ''} onChange={(e) => updateRow(row.id, { means: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input value={row.responsible || ''} onChange={(e) => updateRow(row.id, { responsible: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input value={row.prerequisites || ''} onChange={(e) => updateRow(row.id, { prerequisites: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <Input type="date" value={row.date || ''} onChange={(e) => updateRow(row.id, { date: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <Select value={row.status} onChange={(e) => updateRow(row.id, { status: e.target.value })} className="min-w-[120px]">
                      {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </td>
                  <td className="py-2 pr-2">
                    <Input value={row.expected_deliverable || ''} onChange={(e) => updateRow(row.id, { expected_deliverable: e.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="secondary" onClick={() => promoteMut.mutate(row.id)} disabled={promoteMut.isPending || row.status === 'Réalisé'}>
                        → Réalisée
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => deleteMut.mutate(row.id)} disabled={deleteMut.isPending}>
                        Supprimer
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}

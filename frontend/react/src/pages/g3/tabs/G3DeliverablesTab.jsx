import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import { G3_DELIVERABLE_STATUS_OPTIONS } from '@/lib/g3/g3Catalogs'
import { openG3002Preview } from '@/lib/g3/g3DocumentBuilders'
import { formatDate } from '@/lib/utils'

export default function G3DeliverablesTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const rows = mission?.deliverables || []
  const statusOptions = catalogs?.deliverable_statuses || G3_DELIVERABLE_STATUS_OPTIONS

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const defaultMut = useMutation({
    mutationFn: () => g3Api.createDefaultDeliverables(missionId),
    onSuccess: () => { setMessage('Livrables G3001–G3008 créés.'); setError(''); invalidate() },
    onError: (err) => setError(err?.message || 'Création impossible.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updateDeliverable(id, data),
    onSuccess: () => invalidate(),
  })

  const previewMut = useMutation({
    mutationFn: (id) => g3Api.previewDeliverable(id),
    onSuccess: (doc) => {
      openG3002Preview(doc.html, doc.title)
      setMessage('Document généré.')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Génération impossible.'),
  })

  const g3008Mut = useMutation({
    mutationFn: () => g3Api.generateG3008(missionId),
    onSuccess: (doc) => {
      openG3002Preview(doc.html, doc.title)
      setMessage('Rapport final G3008 généré.')
    },
    onError: (err) => setError(err?.message || 'Génération G3008 impossible.'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => g3Api.deleteDeliverable(id),
    onSuccess: () => { setMessage('Livrable supprimé.'); invalidate() },
  })

  function updateRow(id, patch) {
    updateMut.mutate({ id, data: patch })
  }

  return (
    <SectionCard title="Livrables / rapport">
      <div className="flex flex-wrap gap-2 mb-4">
        <Button size="sm" onClick={() => defaultMut.mutate()} disabled={defaultMut.isPending || rows.length > 0}>
          Créer livrables G3001–G3008
        </Button>
        <Button size="sm" variant="secondary" onClick={() => g3008Mut.mutate()} disabled={g3008Mut.isPending}>
          Générer rapport final G3008
        </Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[12px]">
          <thead>
            <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Titre</th>
              <th className="py-2 pr-2">Version</th>
              <th className="py-2 pr-2">Statut</th>
              <th className="py-2 pr-2">Échéance</th>
              <th className="py-2 pr-2">Généré le</th>
              <th className="py-2 pr-2">Observations</th>
              <th className="py-2 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-4 text-[#69758a]">Aucun livrable. Créez le jeu G3001–G3008.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-[#eef2f7]">
                <td className="py-2 pr-2 font-bold">{row.type?.split(' ')[0] || '—'}</td>
                <td className="py-2 pr-2">{row.title || row.type}</td>
                <td className="py-2 pr-2">
                  <Input value={row.version || '1'} onChange={(e) => updateRow(row.id, { version: e.target.value })} />
                </td>
                <td className="py-2 pr-2">
                  <Select value={row.status || 'À produire'} onChange={(e) => updateRow(row.id, { status: e.target.value })}>
                    {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Input
                    type="date"
                    value={row.due_date || ''}
                    onChange={(e) => updateRow(row.id, { due_date: e.target.value || null })}
                  />
                </td>
                <td className="py-2 pr-2">{formatDate(row.generated_at)}</td>
                <td className="py-2 pr-2">
                  <Input value={row.observations || ''} onChange={(e) => updateRow(row.id, { observations: e.target.value })} />
                </td>
                <td className="py-2 pr-2 whitespace-nowrap">
                  <Button size="sm" variant="secondary" onClick={() => previewMut.mutate(row.id)} disabled={previewMut.isPending}>
                    Générer
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-1"
                    onClick={() => { if (window.confirm('Supprimer ce livrable ?')) deleteMut.mutate(row.id) }}
                  >
                    Suppr.
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] text-[#69758a]">
        Chaque livrable G300x est généré en HTML à partir des données saisies dans le dossier (zones, programme, essais, avis…).
        Utilisez l&apos;impression du navigateur pour exporter en PDF.
      </p>
    </SectionCard>
  )
}

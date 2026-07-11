import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { g3Api, demandesApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import DemandeReferencePicker from '@/components/demande/DemandeReferencePicker'
import { FicheBadge, FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { G3_STATUS_CLS } from '@/lib/g3/g3Catalogs'
import { formatDate } from '@/lib/utils'

export default function G3MissionListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [demandeQuery, setDemandeQuery] = useState('')
  const [selectedDemandeId, setSelectedDemandeId] = useState(null)
  const [error, setError] = useState('')
  const returnTo = '/g3/missions'

  const demandeIdFromQuery = searchParams.get('demande_id')

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ['g3-missions', search, demandeIdFromQuery],
    queryFn: () => g3Api.listMissions({
      search: search || undefined,
      demande_id: demandeIdFromQuery || undefined,
    }),
  })

  const createMut = useMutation({
    mutationFn: (demandeId) => g3Api.createMission({ demande_id: Number(demandeId) }),
    onSuccess: (mission) => {
      qc.invalidateQueries({ queryKey: ['g3-missions'] })
      navigate(buildPathWithReturnTo(`/g3/missions/${mission.id}`, returnTo))
    },
    onError: (err) => setError(err?.message || 'Création impossible.'),
  })

  async function handleCreateFromDemande() {
    setError('')
    let demandeId = selectedDemandeId
    if (!demandeId) {
      const ref = String(demandeQuery || '').trim()
      if (!ref) {
        setError('Sélectionnez une demande.')
        return
      }
      const matches = await demandesApi.list({ search: ref })
      const exact = (matches || []).find((row) => String(row.reference || '').toLowerCase() === ref.toLowerCase())
      demandeId = exact?.uid ?? exact?.id ?? null
    }
    if (!demandeId) {
      setError('Demande introuvable.')
      return
    }
    createMut.mutate(demandeId)
  }

  const rows = useMemo(() => missions, [missions])

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← G3"
        onBack={() => navigate('/g3')}
        eyebrow="G3"
        title="Missions G3 EXE"
        subtitle="Dossiers de mission géotechnique d'exécution"
      />

      <FicheMain>
        <SectionCard title="Nouvelle mission G3">
          <p className="text-[13px] text-[#69758a] mb-3">
            Une mission G3 est toujours rattachée à une demande existante.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[280px] flex-1">
              <DemandeReferencePicker
                value={demandeQuery}
                onChange={setDemandeQuery}
                onSelect={(row) => {
                  setDemandeQuery(row?.reference || '')
                  setSelectedDemandeId(row?.id || row?.uid || null)
                }}
                listMode="inline"
                placeholder="Rechercher une demande…"
              />
            </div>
            <Button size="sm" onClick={handleCreateFromDemande} disabled={createMut.isPending}>
              Créer mission G3
            </Button>
          </div>
          {error ? <p className="mt-2 text-[12px] text-[#a32d2d] font-bold">{error}</p> : null}
        </SectionCard>

        <SectionCard
          title="Missions existantes"
          actions={(
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer…"
              className="max-w-[240px]"
            />
          )}
        >
          {isLoading ? (
            <p className="text-[13px] text-[#69758a]">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-[#69758a]">Aucune mission G3.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
                    <th className="py-2 pr-3">Référence</th>
                    <th className="py-2 pr-3">Affaire</th>
                    <th className="py-2 pr-3">Demande</th>
                    <th className="py-2 pr-3">Titre / chantier</th>
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 pr-3">Programme</th>
                    <th className="py-2 pr-3">Mise à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[#eef2f7] cursor-pointer hover:bg-[#f8fafc]"
                      onClick={() => navigate(buildPathWithReturnTo(`/g3/missions/${row.id}`, returnTo))}
                    >
                      <td className="py-2 pr-3 font-bold text-[#003170]">{row.reference}</td>
                      <td className="py-2 pr-3">{row.affaire_ref || '—'}</td>
                      <td className="py-2 pr-3">{row.demande_ref || '—'}</td>
                      <td className="py-2 pr-3">
                        <div>{row.title || '—'}</div>
                        <div className="text-[#69758a]">{row.chantier || row.client || ''}</div>
                      </td>
                      <td className="py-2 pr-3"><FicheBadge s={row.status} map={G3_STATUS_CLS} /></td>
                      <td className="py-2 pr-3">{row.nb_planned} prév. / {row.nb_realized} réal.</td>
                      <td className="py-2 pr-3">{formatDate(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </FicheMain>
    </FichePageShell>
  )
}

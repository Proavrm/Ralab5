import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { g3Api } from '@/services/api'
import Input from '@/components/ui/Input'
import { FicheBadge, FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { G3_STATUS_CLS } from '@/lib/g3/g3Catalogs'
import { formatDate } from '@/lib/utils'

export default function G3MissionListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const returnTo = '/g3/missions'

  const demandeIdFromQuery = searchParams.get('demande_id')

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ['g3-missions', search, demandeIdFromQuery],
    queryFn: () => g3Api.listMissions({
      search: search || undefined,
      demande_id: demandeIdFromQuery || undefined,
    }),
  })

  const rows = useMemo(() => missions, [missions])

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← G3"
        onBack={() => navigate('/g3')}
        eyebrow="G3"
        title="Missions G3 EXE"
        subtitle="Dossiers de mission géotechnique d'exécution (création depuis la demande)"
      />

      <FicheMain>
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
            <p className="text-[13px] text-[#69758a]">
              Aucune mission G3{demandeIdFromQuery ? ' pour cette demande' : ''}.
              {' '}Création depuis la fiche demande.
            </p>
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

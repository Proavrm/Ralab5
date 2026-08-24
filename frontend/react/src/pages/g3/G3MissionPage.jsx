import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { calculsApi, avisTechniqueApi, g3Api, getApiErrorMessage } from '@/services/api'
import Button from '@/components/ui/Button'
import { FicheBadge, FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { G3_MISSION_TABS, G3_STATUS_CLS, mergeG3Catalogs } from '@/lib/g3/g3Catalogs'
import G3GeneralTab from '@/pages/g3/tabs/G3GeneralTab'
import G3DocumentsTab from '@/pages/g3/tabs/G3DocumentsTab'
import G3ObjectivesTab from '@/pages/g3/tabs/G3ObjectivesTab'
import G3ZonesTab from '@/pages/g3/tabs/G3ZonesTab'
import G3ProgrammeTab from '@/pages/g3/tabs/G3ProgrammeTab'
import G3InterventionsTab from '@/pages/g3/tabs/G3InterventionsTab'
import G3TestsTab from '@/pages/g3/tabs/G3TestsTab'
import G3PhotosTab from '@/pages/g3/tabs/G3PhotosTab'
import G3NoticesTab from '@/pages/g3/tabs/G3NoticesTab'
import G3HoldPointsTab from '@/pages/g3/tabs/G3HoldPointsTab'
import G3PlanningTab from '@/pages/g3/tabs/G3PlanningTab'
import G3DeliverablesTab from '@/pages/g3/tabs/G3DeliverablesTab'
import { formatDate } from '@/lib/utils'

function G3HistoryTab({ mission }) {
  const rows = mission?.history || []
  return (
    <SectionCard title="Historique">
      {rows.length === 0 ? (
        <p className="text-[13px] text-[#69758a]">Aucun événement enregistré.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Utilisateur</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Objet</th>
                <th className="py-2 pr-3">Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[#eef2f7]">
                  <td className="py-2 pr-3">{formatDate(row.created_at)}</td>
                  <td className="py-2 pr-3">{row.user_name || '—'}</td>
                  <td className="py-2 pr-3">{row.action}</td>
                  <td className="py-2 pr-3">{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                  <td className="py-2 pr-3">{row.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

export default function G3MissionPage() {
  const { uid } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const returnTo = resolveReturnTo(searchParams.get('return_to'), '/g3/missions')
  const initialTab = searchParams.get('tab') || 'general'
  const [tab, setTab] = useState(initialTab)
  const [saveMessage, setSaveMessage] = useState('')
  const [creatingCalcul, setCreatingCalcul] = useState(false)
  const [calculError, setCalculError] = useState('')

  const { data: catalogsRaw } = useQuery({
    queryKey: ['g3-catalogs'],
    queryFn: () => g3Api.catalogs(),
  })
  const catalogs = useMemo(() => mergeG3Catalogs(catalogsRaw || {}), [catalogsRaw])

  const { data: mission, isLoading, error } = useQuery({
    queryKey: ['g3-mission', uid],
    queryFn: () => g3Api.getMission(uid),
    enabled: !!uid,
  })

  const { data: avisList = [] } = useQuery({
    queryKey: ['avis-technique', 'mission', mission?.demande_id],
    queryFn: () => avisTechniqueApi.listInstances({ demande_id: Number(mission.demande_id) }),
    enabled: Boolean(mission?.demande_id),
  })

  const saveMut = useMutation({
    mutationFn: (data) => g3Api.updateMission(uid, data),
    onSuccess: (updated) => {
      qc.setQueryData(['g3-mission', uid], updated)
      setSaveMessage('Enregistré')
      window.setTimeout(() => setSaveMessage(''), 2000)
    },
    onError: (err) => setSaveMessage(err?.message || 'Enregistrement impossible.'),
  })

  const demandeHref = mission?.demande_id
    ? buildPathWithReturnTo(`/demandes/${mission.demande_id}`, returnTo)
    : null

  async function createCalculAlize() {
    if (!mission) return
    setCreatingCalcul(true)
    setCalculError('')
    try {
      const created = await calculsApi.create({
        type_calcul: 'alize',
        nom_calcul: `Alizé · ${mission.reference || uid}`,
        demande_id: mission.demande_id != null ? Number(mission.demande_id) : undefined,
        affaire_rst_id: mission.affaire_rst_id != null ? Number(mission.affaire_rst_id) : undefined,
        mission_id: Number(mission.id || uid),
        ouvrage: mission.chantier || mission.title || '',
      })
      navigate(buildPathWithReturnTo(`/calculs/alize/${created.id}`, returnTo))
    } catch (err) {
      setCalculError(getApiErrorMessage(err, 'Création du calcul impossible'))
      setCreatingCalcul(false)
    }
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Missions G3"
        onBack={() => navigate(returnTo)}
        eyebrow="Mission G3"
        title={mission?.reference || 'Chargement…'}
        subtitle={[mission?.title, mission?.chantier].filter(Boolean).join(' · ')}
      >
        {mission?.status ? <FicheBadge s={mission.status} map={G3_STATUS_CLS} /> : null}
        {demandeHref ? (
          <Button size="sm" variant="secondary" onClick={() => window.open(demandeHref, '_blank', 'noopener,noreferrer')}>
            Voir demande
          </Button>
        ) : null}
        {mission ? (
          <>
            <Button size="sm" variant="primary" disabled={creatingCalcul} onClick={createCalculAlize}>
              {creatingCalcul ? 'Calcul…' : '+ Calcul Alizé'}
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(buildPathWithReturnTo(
                `/calculs?mission_id=${mission.id || uid}&demande_id=${mission.demande_id || ''}&affaire_rst_id=${mission.affaire_rst_id || ''}`,
                returnTo,
              ))}
            >
              Voir calculs
            </Button>
          </>
        ) : null}
      </FicheTopbar>

      <FicheMain>
        {isLoading ? <p className="text-[13px] text-[#69758a]">Chargement de la mission…</p> : null}
        {error ? <p className="text-[13px] text-[#a32d2d]">{String(error.message || error)}</p> : null}
        {calculError ? <p className="mb-3 text-[13px] text-[#a32d2d]">{calculError}</p> : null}

        {mission ? (
          <>
            <div className="mb-4">
              <SectionCard
                title="Notes techniques / Avis"
                subtitle="Livrables NT de la demande (série commune NT0001…)"
                actions={(
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(buildPathWithReturnTo(
                        `/avis-technique/nouveau?demande_id=${mission.demande_id}`,
                        returnTo,
                      ))}
                    >
                      + Avis / NT
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate(buildPathWithReturnTo('/g3/notes-techniques', returnTo))}
                    >
                      Portefeuille NT
                    </Button>
                  </div>
                )}
              >
                {!Array.isArray(avisList) || avisList.length === 0 ? (
                  <p className="text-[13px] text-[#69758a]">
                    Aucun avis technique sur cette demande — créez-en un pour démarrer la rédaction.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {avisList.map((avis) => (
                      <button
                        key={avis.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-lg border border-[#eef1f6] px-3 py-2 text-left text-[13px] hover:bg-[#f8fafc]"
                        onClick={() => navigate(buildPathWithReturnTo(`/avis-technique/${avis.id}`, returnTo))}
                      >
                        <span className="font-semibold text-[#003170]">{avis.reference || `Avis #${avis.id}`}</span>
                        <span className="text-[#69758a]">{avis.titre || 'Avis technique'} · {avis.statut || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {G3_MISSION_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border ${tab === item.id ? 'border-[#003170] bg-[#003170] text-white' : 'border-[#dbe1ea] bg-white text-[#69758a]'}`}
                >
                  {item.label}
                  {item.phase ? <span className="ml-1 opacity-60">· P{item.phase}</span> : null}
                </button>
              ))}
            </div>

            {tab === 'general' ? (
              <G3GeneralTab
                mission={mission}
                catalogs={catalogs}
                saving={saveMut.isPending}
                saveMessage={saveMessage}
                onSave={(data) => saveMut.mutate(data)}
              />
            ) : null}

            {tab === 'documents' ? (
              <G3DocumentsTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'objectives' ? (
              <G3ObjectivesTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'zones' ? (
              <G3ZonesTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'programme' ? (
              <G3ProgrammeTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'interventions' ? (
              <G3InterventionsTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'tests' ? (
              <G3TestsTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'photos' ? (
              <G3PhotosTab mission={mission} missionId={uid} />
            ) : null}

            {tab === 'notices' ? (
              <G3NoticesTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'holdpoints' ? (
              <G3HoldPointsTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'planning' ? (
              <G3PlanningTab missionId={uid} />
            ) : null}

            {tab === 'deliverables' ? (
              <G3DeliverablesTab mission={mission} catalogs={catalogs} missionId={uid} />
            ) : null}

            {tab === 'history' ? <G3HistoryTab mission={mission} /> : null}
          </>
        ) : null}
      </FicheMain>
    </FichePageShell>
  )
}

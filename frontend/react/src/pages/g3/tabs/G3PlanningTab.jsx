import { useQuery } from '@tanstack/react-query'
import { SectionCard } from '@/components/layout/FicheLayout'
import { g3Api } from '@/services/api'
import { formatDate } from '@/lib/utils'

const KIND_LABELS = {
  mission_start: 'Mission',
  mission_end: 'Mission',
  planned_intervention: 'Programme',
  realized_intervention: 'Intervention',
  hold_point: 'Point d\'arrêt',
  notice: 'Avis G3',
}

export default function G3PlanningTab({ missionId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['g3-planning', missionId],
    queryFn: () => g3Api.getMissionPlanning(missionId),
    enabled: !!missionId,
  })

  const items = data?.items || []
  const alerts = data?.alerts || []

  return (
    <SectionCard title="Planning mission">
      {isLoading ? <p className="text-[13px] text-[#69758a]">Chargement du planning…</p> : null}
      {error ? <p className="text-[13px] text-[#a32d2d]">{String(error.message || error)}</p> : null}

      {data ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full bg-[#eef2f7] px-3 py-1 font-bold">{items.length} élément(s)</span>
            {data.overdue_count > 0 ? (
              <span className="rounded-full bg-[#fde8e8] px-3 py-1 font-bold text-[#a32d2d]">
                {data.overdue_count} en retard
              </span>
            ) : (
              <span className="rounded-full bg-[#eaf3de] px-3 py-1 font-bold text-[#3b6d11]">Aucun retard</span>
            )}
          </div>

          {alerts.length > 0 ? (
            <div className="mb-4 rounded-xl border border-[#f5d0a9] bg-[#fff8ef] p-3">
              <p className="text-[11px] font-bold text-[#854f0b] mb-2">Alertes</p>
              <ul className="list-disc pl-5 text-[12px] text-[#854f0b] space-y-1">
                {alerts.map((alert) => <li key={alert}>{alert}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead>
                <tr className="text-left text-[#69758a] border-b border-[#dbe1ea]">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Libellé</th>
                  <th className="py-2 pr-2">Zone</th>
                  <th className="py-2 pr-2">Statut</th>
                  <th className="py-2 pr-2">Alerte</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="py-4 text-[#69758a]">Aucun élément planifié.</td></tr>
                ) : items.map((item) => (
                  <tr
                    key={`${item.kind}-${item.item_id}-${item.label}`}
                    className={`border-b border-[#eef2f7] ${item.overdue ? 'bg-[#fde8e8]/50' : ''}`}
                  >
                    <td className="py-2 pr-2">{formatDate(item.date)}</td>
                    <td className="py-2 pr-2">{KIND_LABELS[item.kind] || item.kind}</td>
                    <td className="py-2 pr-2">{item.label}</td>
                    <td className="py-2 pr-2">{item.zone_name || '—'}</td>
                    <td className="py-2 pr-2">{item.status || '—'}</td>
                    <td className="py-2 pr-2 text-[#a32d2d]">{item.alert || (item.overdue ? 'Retard' : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </SectionCard>
  )
}

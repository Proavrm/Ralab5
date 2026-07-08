import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { resolveReturnTo } from '@/lib/detailNavigation'
import {
  buildRapportSearchParams,
  buildTerrainContextFromSearchParams,
  readTerrainDraft,
  TERRAIN_HEADER_FIELDS,
  writeTerrainDraft,
} from '@/lib/terrainEssaiDraft'
import { getTerrainEssaiConfig, getTerrainRapportRoute } from '@/lib/terrainEssaiConfigs'

function emptyPoint(columns, index) {
  return Object.fromEntries((columns || []).map((col) => [col.key, col.key === 'point_code' ? `P${index + 1}` : '']))
}

export default function TerrainEssaiPage() {
  const navigate = useNavigate()
  const { code = 'FWD' } = useParams()
  const [searchParams] = useSearchParams()
  const config = useMemo(() => getTerrainEssaiConfig(code), [code])
  const essaiId = String(searchParams.get('essai_id') || searchParams.get('source_uid') || 'draft').trim()
  const returnTo = resolveReturnTo(searchParams.get('return_to'), '/labo/workbench?tab=essais')
  const [draft, setDraft] = useState(() => readTerrainDraft(code, essaiId))

  useEffect(() => {
    const loaded = readTerrainDraft(code, essaiId)
    const contextHeader = buildTerrainContextFromSearchParams(searchParams)
    setDraft({
      ...loaded,
      header: { ...loaded.header, ...contextHeader },
    })
  }, [code, essaiId, searchParams])

  if (!config) {
    return (
      <div className="p-8 text-center text-sm text-text-muted">
        Modèle terrain `{code}` introuvable.
      </div>
    )
  }

  function setHeader(key, value) {
    setDraft((current) => ({ ...current, header: { ...current.header, [key]: value } }))
  }

  function setValue(key, value) {
    setDraft((current) => ({ ...current, values: { ...current.values, [key]: value } }))
  }

  function setConclusion(key, value) {
    setDraft((current) => ({ ...current, conclusion: { ...current.conclusion, [key]: value } }))
  }

  function setPoint(index, key, value) {
    setDraft((current) => {
      const points = [...(current.points || [])]
      points[index] = { ...(points[index] || {}), [key]: value }
      return { ...current, points }
    })
  }

  function addPoint() {
    setDraft((current) => ({
      ...current,
      points: [...(current.points || []), emptyPoint(config.pointColumns, (current.points || []).length)],
    }))
  }

  function removePoint(index) {
    setDraft((current) => ({
      ...current,
      points: (current.points || []).filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  function handleSave() {
    const saved = writeTerrainDraft(config.code, essaiId, draft)
    setDraft(saved)
  }

  function handleOpenRapport() {
    handleSave()
    const params = buildRapportSearchParams(config.code, essaiId, draft, {
      return_to: returnTo,
    })
    navigate(`${getTerrainRapportRoute(config.code)}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto" style={{ background: 'radial-gradient(circle at top right, rgba(255,204,0,0.18), transparent 32%), linear-gradient(180deg, #f8fafc 0%, #f3f6fb 42%, #eef3fa 100%)' }}>
      <div className="sticky top-0 z-10 border-b border-[#dbe1ea] bg-white/95 backdrop-blur px-6 py-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => navigate(returnTo)} className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb]">
          ← Retour
        </button>
        <div className="flex-1 min-w-[220px]">
          <div className="text-[10px] font-black uppercase tracking-[.12em] text-[#8a95a8]">Feuille terrain · {config.code}</div>
          <div className="text-[15px] font-black text-[#003170]">{config.label}</div>
          <div className="text-[12px] text-[#69758a]">{config.subtitle}</div>
        </div>
        <Button size="sm" variant="secondary" onClick={handleOpenRapport}>Imprimer / Ouvrir rapport</Button>
        <Button size="sm" onClick={handleSave}>Enregistrer brouillon</Button>
      </div>

      <div className="mx-auto w-full max-w-[1100px] px-6 py-6 flex flex-col gap-4">
        {draft.saved_at ? (
          <div className="rounded-[12px] border border-[#dbe1ea] bg-white px-4 py-2 text-[12px] text-[#69758a]">
            Dernier enregistrement : {new Date(draft.saved_at).toLocaleString('fr-FR')}
          </div>
        ) : null}

        <section className="rounded-[18px] border border-[#dbe1ea] bg-white p-5">
          <div className="text-[12px] font-black uppercase tracking-[.12em] text-[#8a95a8] mb-3">Contexte commun</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TERRAIN_HEADER_FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-text-muted">{field.label}</label>
                <Input value={draft.header?.[field.key] || ''} onChange={(event) => setHeader(field.key, event.target.value)} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[18px] border border-[#dbe1ea] bg-white p-5">
          <div className="text-[12px] font-black uppercase tracking-[.12em] text-[#8a95a8] mb-3">Paramètres essai</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {config.valueFields.map((field) => (
              <div key={field.key} className={field.full ? 'md:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
                <label className="text-[11px] font-medium text-text-muted">{field.label}</label>
                <Input value={draft.values?.[field.key] || ''} onChange={(event) => setValue(field.key, event.target.value)} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[18px] border border-[#dbe1ea] bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-[12px] font-black uppercase tracking-[.12em] text-[#8a95a8]">Points de mesure</div>
            <Button size="sm" variant="secondary" onClick={addPoint}>+ Point</Button>
          </div>
          {(draft.points || []).length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[#69758a]">
                    {config.pointColumns.map((col) => (
                      <th key={col.key} className="px-2 py-2 font-bold">{col.label}</th>
                    ))}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.points.map((point, index) => (
                    <tr key={`point-${index}`} className="border-t border-[#edf1f7]">
                      {config.pointColumns.map((col) => (
                        <td key={col.key} className="px-2 py-2">
                          <Input
                            value={point[col.key] || ''}
                            onChange={(event) => setPoint(index, col.key, event.target.value)}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <button type="button" className="text-[#a32d2d] font-bold" onClick={() => removePoint(index)}>Retirer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-[13px] text-[#69758a]">Ajoutez les points de mesure terrain.</div>
          )}
        </section>

        <section className="rounded-[18px] border border-[#dbe1ea] bg-white p-5">
          <div className="text-[12px] font-black uppercase tracking-[.12em] text-[#8a95a8] mb-3">Conclusion provisoire</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Conformité</label>
              <select
                value={draft.conclusion?.conformity || 'pour_info'}
                onChange={(event) => setConclusion('conformity', event.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="pour_info">Pour information</option>
                <option value="conforme">Conforme</option>
                <option value="non_conforme">Non conforme</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Contrôleur</label>
              <Input value={draft.conclusion?.controller || ''} onChange={(event) => setConclusion('controller', event.target.value)} />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[11px] font-medium text-text-muted">Commentaires</label>
              <textarea
                value={draft.conclusion?.comments || ''}
                onChange={(event) => setConclusion('comments', event.target.value)}
                rows={3}
                className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

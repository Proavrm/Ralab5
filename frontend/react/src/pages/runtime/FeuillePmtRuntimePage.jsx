import React, { useMemo } from 'react'
import Button from '../../components/ui/Button'
import { getRuntimePublicationPMT } from '../../services/pmtModelWorkStore'
import { buildPmtDraftFromPublication } from '../../lib/pmt/draft'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

export default function FeuillePmtRuntimePage() {
  const navigate = useNavigate()
  const { uid = '' } = useParams()
  const [searchParams] = useSearchParams()
  const publication = useMemo(() => getRuntimePublicationPMT(), [])
  const draft = useMemo(() => buildPmtDraftFromPublication(publication, null), [publication])
  const returnTo = String(searchParams.get('return_to') || '').trim()

  function openReport() {
    if (!publication) return
    const params = new URLSearchParams()
    params.set('mode', 'work')
    params.set('source_kind', 'feuille_terrain')
    params.set('source_family', 'terrain')
    params.set('source_uid', String(uid || ''))
    params.set('source_id', String(uid || ''))
    params.set('feuille_uid', String(uid || ''))
    params.set('work_document_id', String(publication?.work_document_id || ''))
    if (returnTo) params.set('return_to', returnTo)
    const target = `/rapports/pmt/view?${params.toString()}`
    navigate(target)
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Feuille PMT Runtime</h1>
        <Button variant="secondary" size="sm" onClick={() => navigate(returnTo || '/tools')}>
          Retour
        </Button>
      </div>

      {!publication ? (
        <div className="rounded border border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d] px-3 py-2 text-sm">
          Aucune publication runtime PMT trouvée. Valide/associe d&apos;abord dans Work PMT.
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-sm text-text-muted mb-2">Aperçu runtime PMT (base F1/F2)</div>
        <pre className="text-xs overflow-auto bg-bg rounded border border-border p-3">
          {JSON.stringify(
            {
              publication,
              draftPreview: {
                meta: draft.meta,
                resume: draft.resume,
                points_rows_count: Array.isArray(draft.points_rows) ? draft.points_rows.length : 0,
              },
            },
            null,
            2
          )}
        </pre>
      </div>

      <div className="flex items-center justify-end">
        <Button variant="primary" size="sm" onClick={openReport} disabled={!publication}>
          Imprimer / Ouvrir rapport
        </Button>
      </div>
    </div>
  )
}

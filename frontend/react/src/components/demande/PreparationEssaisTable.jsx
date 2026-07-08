import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { api } from '@/services/api'
import {
  ESSAIS_CONSIGNES_FIELD,
  getCatalogItem,
  getEssaiDisplayParts,
  parseConsignesSelection,
} from '@/lib/consignesCatalog'

function buildEssaiRows(rawValue, essaisGroups, rstCodeCatalog) {
  const parsed = parseConsignesSelection(ESSAIS_CONSIGNES_FIELD, rawValue, essaisGroups)
  const rows = []

  for (const code of parsed.codes) {
    const item = getCatalogItem(ESSAIS_CONSIGNES_FIELD, code, essaisGroups)
    if (item) {
      const parts = getEssaiDisplayParts(item, rstCodeCatalog)
      rows.push({
        key: `item-${code}`,
        code: parts.code || code,
        essai: parts.title || parts.label || '—',
        reference: parts.reference || parts.label || '—',
      })
      continue
    }
    rows.push({
      key: `code-${code}`,
      code,
      essai: '—',
      reference: '—',
    })
  }

  for (const token of parsed.unknown) {
    rows.push({
      key: `unknown-${token}`,
      code: token,
      essai: 'Hors catalogue',
      reference: '—',
    })
  }

  return rows
}

export default function PreparationEssaisTable({
  preparation = {},
  preparationHref = '',
}) {
  const { data: essaisCatalog, isLoading } = useQuery({
    queryKey: ['consignes-essais-catalog'],
    queryFn: () => api.get('/demandes_rst/configuration/consignes-essais-catalog'),
    staleTime: 5 * 60 * 1000,
  })

  const essaisGroups = essaisCatalog?.groups || []
  const rstCodeCatalog = essaisCatalog?.rst_codes || []

  const rows = useMemo(
    () => buildEssaiRows(preparation?.types_essais_prevus, essaisGroups, rstCodeCatalog),
    [preparation?.types_essais_prevus, essaisGroups, rstCodeCatalog],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[12px] leading-relaxed text-[#69758a]">
        Essais retenus en préparation — affichage informatif sur la demande. Les modifications se font en
        préparation.
      </div>

      {isLoading ? (
        <p className="text-[12px] text-[#69758a]">Chargement du catalogue…</p>
      ) : rows.length ? (
        <div className="overflow-x-auto rounded-[14px] border border-[#dbe1ea]">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#dbe1ea] bg-[#f8fafc] text-left">
                <th className="px-3 py-2 font-bold uppercase tracking-[.06em] text-[#69758a]">Code RST</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[.06em] text-[#69758a]">Essai</th>
                <th className="px-3 py-2 font-bold uppercase tracking-[.06em] text-[#69758a]">Norme / référence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-[#edf1f7] last:border-b-0">
                  <td className="px-3 py-2.5 font-black text-[#003170]">{row.code || '—'}</td>
                  <td className="px-3 py-2.5 text-[#172033]">{row.essai}</td>
                  <td className="px-3 py-2.5 text-[#69758a]">{row.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-6 text-center text-[13px] text-[#69758a]">
          Aucun essai renseigné en préparation pour l&apos;instant.
        </div>
      )}

      {preparationHref ? (
        <p className="text-[11px] text-text-muted">
          <a
            href={preparationHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-[#003170] hover:underline"
          >
            Ouvrir la préparation
            <ExternalLink size={11} />
          </a>
        </p>
      ) : null}
    </div>
  )
}

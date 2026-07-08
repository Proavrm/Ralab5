import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/services/api'
import {
  activeLaboratoires,
  agenceDisplayLabel,
  buildLaboratoireCatalog,
  formatLabOrgLine,
  labDisplayLine,
  labDisplayName,
} from '@/lib/laboratoireCatalog'

export function useLaboratoireCatalog(options = {}) {
  const query = useQuery({
    queryKey: ['laboratoires-catalog'],
    queryFn: () => adminApi.labs.list(),
    staleTime: 5 * 60 * 1000,
    ...options,
  })

  const laboratoires = query.data?.laboratoires ?? []
  const orgRegions = query.data?.org_regions ?? query.data?.rst_regions ?? []

  const catalog = useMemo(
    () => buildLaboratoireCatalog(laboratoires, orgRegions),
    [laboratoires, orgRegions],
  )

  return {
    ...query,
    laboratoires,
    orgRegions,
    catalog,
    activeLabs: activeLaboratoires(catalog),
    labName: (code) => labDisplayName(code, catalog),
    labLine: (code) => labDisplayLine(code, catalog),
    labOrgLine: (labOrCode) => formatLabOrgLine(labOrCode, catalog),
    agenceLabel: (code) => agenceDisplayLabel(code, catalog),
  }
}

import { useLaboratoireCatalog } from '@/hooks/useLaboratoireCatalog'
import { resolveLaboDisplayName } from '@/lib/laboratoireCatalog'
import { normalizeLaboCode } from '@/lib/labGeo'

/** Affiche le nom du labo depuis le référentiel BD (fallback : code). */
export default function LabName({ code, fallback = '—', className }) {
  const { catalog, isLoading } = useLaboratoireCatalog()
  const key = normalizeLaboCode(code) || String(code || '').trim().toUpperCase()
  if (!key) return <span className={className}>{fallback}</span>
  if (isLoading) return <span className={className}>{key}</span>
  return <span className={className}>{resolveLaboDisplayName(code, catalog) || key || fallback}</span>
}

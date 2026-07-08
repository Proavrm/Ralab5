import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { api } from '@/services/api'
import { DIRECT_ESSAI_TEMPLATE_BY_CODE } from '@/lib/directEssaiTemplates'
import { ESSAI_CODE_BY_CODE } from '@/lib/essaiCodesCatalog'
import {
  filterTerrainEssaiCodes,
  missionEssaiFromEssaiCodeEntry,
} from '@/lib/essaiCodesCatalog'
import {
  filterMissionDocumentEssaiCodes,
  MISSION_DOCUMENT_ESSAI_CODES,
  missionEssaiFromDocumentEntry,
} from '@/lib/missionDocumentEssaiCodes'
import {
  filterEssaiGroupsBySearch,
  getConsignesStorageCode,
  getEssaiDisplayParts,
  isEssaiItemSelected,
} from '@/lib/consignesCatalog'

const TABLE_CLASS = 'w-full min-w-[720px] border-collapse text-xs'
const TH_CLASS = 'px-3 py-2 font-bold uppercase tracking-[.06em] text-[#69758a]'
const TD_CLASS = 'px-3 py-2.5 align-top'

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function itemKey(item) {
  return String(item.competency_id || item.code || item.rst_code || '')
}

function missionEssaiFromCatalogItem(item, rstCodeCatalog = []) {
  const parts = getEssaiDisplayParts(item, rstCodeCatalog)
  const storageCode = getConsignesStorageCode(item)
  const rstCode = normalizeCode(parts.code || parts.rstCode)
  const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[rstCode]
  return {
    code: template?.code || rstCode || storageCode,
    rst_code: String(item.rst_code || parts.rstCode || template?.code || '').trim().toUpperCase(),
    label: parts.title || parts.label || template?.label || storageCode,
    norme: parts.reference || template?.norme || '',
  }
}

function missionItemsToStorageCodes(items = []) {
  return items
    .map((item) => String(item?.code || '').trim())
    .filter(Boolean)
}

function missionEssaiKey(item) {
  return String(item?.code || '').trim().toLowerCase() || String(item?.label || '').trim().toLowerCase()
}

function getCatalogItemDisplayParts(catalogItem, rstCodeCatalog = []) {
  const parts = getEssaiDisplayParts(catalogItem, rstCodeCatalog)
  const rstCode = String(catalogItem?.rst_code || parts.rstCode || '').trim().toUpperCase()
  return {
    code: rstCode || '—',
    essai: parts.title || parts.label || '—',
    reference: parts.reference || '—',
  }
}

function flattenCatalogItems(groups = []) {
  return groups.flatMap((group) => group.items || [])
}

function resolveCatalogItemForMissionItem(item, groups = []) {
  const code = String(item?.code || '').trim()
  if (code.startsWith('id:')) {
    const competencyId = code.slice(3)
    return flattenCatalogItems(groups).find(
      (entry) => String(entry.competency_id) === competencyId,
    ) || null
  }
  const normalized = normalizeCode(code)
  return flattenCatalogItems(groups).find((entry) => {
    const entryRst = normalizeCode(entry.rst_code)
    if (entryRst && entryRst === normalized) return true
    return getConsignesStorageCode(entry) === code
  }) || null
}

function resolveCatalogGroupTitle(item, groups = []) {
  const catalogItem = resolveCatalogItemForMissionItem(item, groups)
  if (!catalogItem) return ''
  for (const group of groups) {
    if ((group.items || []).some((entry) => itemKey(entry) === itemKey(catalogItem))) {
      return group.title || ''
    }
  }
  return ''
}

function getMissionItemDisplayParts(item, essaisGroups = [], rstCodeCatalog = []) {
  const storedCode = normalizeCode(item?.code)
  const catalogEntry = ESSAI_CODE_BY_CODE[storedCode]
  if (catalogEntry) {
    return {
      code: catalogEntry.code,
      essai: catalogEntry.label,
      reference: catalogEntry.norme || item.norme || '—',
      domaine: '',
    }
  }

  const catalogItem = resolveCatalogItemForMissionItem(item, essaisGroups)
  const source = catalogItem || {
    label: item.label,
    reference: item.norme,
    rst_code: item.rst_code || '',
    code: item.code,
  }
  const parts = getEssaiDisplayParts(source, rstCodeCatalog)
  const storedRaw = String(item?.code || '').trim()
  const storedRst = normalizeCode(storedRaw)
  let rstCode = String(catalogItem?.rst_code || parts.rstCode || '').trim().toUpperCase()

  if (!rstCode && DIRECT_ESSAI_TEMPLATE_BY_CODE[storedRst]) {
    rstCode = storedRst
  }

  if (!rstCode && storedRaw.startsWith('id:')) {
    return {
      code: `#${storedRaw.slice(3)}`,
      essai: parts.title || parts.label || item.label || '—',
      reference: parts.reference || item.norme || '—',
      domaine: resolveCatalogGroupTitle(item, essaisGroups),
    }
  }

  return {
    code: rstCode || '—',
    essai: parts.title || parts.label || item.label || '—',
    reference: parts.reference || item.norme || '—',
    domaine: resolveCatalogGroupTitle(item, essaisGroups),
  }
}

function EssaisTableShell({ children }) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-[#dbe1ea]">
      <table className={TABLE_CLASS}>{children}</table>
    </div>
  )
}

function BrowseResultRow({ row, onToggle }) {
  const isCompetency = row.kind === 'competency'
  const subtitle = isCompetency
    ? [row.groupTitle, row.reference !== '—' ? row.reference : ''].filter(Boolean).join(' · ')
    : (row.reference !== '—' ? row.reference : 'Document mission')

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${row.selected ? 'border-[#003170]/35 bg-[#eef5ff]' : 'border-[#e8edf4] bg-white hover:border-[#003170]/25 hover:bg-[#f8fafc]'}`}
    >
      <span className="mt-0.5 shrink-0 rounded-[8px] border border-[#003170]/20 bg-[#eef5ff] px-2 py-1 text-[11px] font-black text-[#003170]">
        {row.code}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-snug text-[#172033]">
          {row.essai}
        </span>
        {subtitle ? (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {isCompetency && row.groupTitle ? (
              <span className="rounded-full border border-[#f0d9a8] bg-[#fff8eb] px-2 py-0.5 text-[10px] font-bold text-[#9a6700]">
                {row.groupTitle}
              </span>
            ) : null}
            {row.reference && row.reference !== '—' ? (
              <span className="rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2 py-0.5 text-[10px] font-semibold text-[#69758a]">
                {row.reference}
              </span>
            ) : null}
            {!isCompetency ? (
              <span className="rounded-full border border-[#c7d7f5] bg-[#f0f5ff] px-2 py-0.5 text-[10px] font-semibold text-[#003170]">
                {row.kind === 'terrain-code' ? 'Code terrain' : 'Document mission'}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className={`shrink-0 pt-0.5 text-[11px] font-bold ${row.selected ? 'text-[#003170]' : 'text-[#69758a]'}`}>
        {row.selected ? 'Retirer' : 'Ajouter'}
      </span>
    </button>
  )
}

export default function InterventionEssaisPrevusPicker({
  items = [],
  onChange,
  onCreateEssai,
  onBeforeRemove,
  planError = '',
  disabled = false,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showFullCatalog, setShowFullCatalog] = useState(false)

  const { data: essaisCatalog, isLoading } = useQuery({
    queryKey: ['consignes-essais-catalog'],
    queryFn: () => api.get('/demandes_rst/configuration/consignes-essais-catalog'),
    staleTime: 5 * 60 * 1000,
  })

  const essaisGroups = essaisCatalog?.groups || []
  const rstCodeCatalog = essaisCatalog?.rst_codes || []
  const selectedStorageCodes = useMemo(() => missionItemsToStorageCodes(items), [items])
  const searchActive = searchQuery.trim().length >= 2
  const browseActive = searchActive || showFullCatalog

  const competencyCatalogRows = useMemo(() => {
    const groups = searchActive
      ? filterEssaiGroupsBySearch(essaisGroups, searchQuery)
      : (showFullCatalog ? essaisGroups : [])

    return groups.flatMap((group) => (
      (group.items || []).map((catalogItem) => ({
        key: `${group.title}::${itemKey(catalogItem)}`,
        kind: 'competency',
        groupTitle: group.title,
        catalogItem,
        ...getCatalogItemDisplayParts(catalogItem, rstCodeCatalog),
        selected: isEssaiItemSelected(catalogItem, selectedStorageCodes)
          || items.some((item) => normalizeCode(item.code) === normalizeCode(getConsignesStorageCode(catalogItem))),
      }))
    ))
  }, [essaisGroups, items, rstCodeCatalog, searchActive, searchQuery, selectedStorageCodes, showFullCatalog])

  const documentBrowseRows = useMemo(() => {
    if (!browseActive) return []

    const documentEntries = searchActive
      ? filterMissionDocumentEssaiCodes(searchQuery)
      : MISSION_DOCUMENT_ESSAI_CODES

    return documentEntries.map((entry) => ({
      key: `rst-code::${entry.code}`,
      kind: 'rst-code',
      documentEntry: entry,
      code: entry.code,
      essai: entry.label,
      reference: entry.norme || '—',
      selected: items.some((item) => normalizeCode(item.code) === entry.code),
    }))
  }, [browseActive, items, searchActive, searchQuery])

  const terrainBrowseRows = useMemo(() => {
    if (!browseActive) return []

    const terrainEntries = searchActive
      ? filterTerrainEssaiCodes(searchQuery)
      : (showFullCatalog ? filterTerrainEssaiCodes('', { includeAll: true }) : [])

    return terrainEntries.map((entry) => ({
      key: `terrain-code::${entry.code}`,
      kind: 'terrain-code',
      documentEntry: entry,
      code: entry.code,
      essai: entry.label,
      reference: entry.norme || '—',
      selected: items.some((item) => normalizeCode(item.code) === entry.code),
    }))
  }, [browseActive, items, searchActive, searchQuery, showFullCatalog])

  const codeBrowseRows = useMemo(
    () => [...documentBrowseRows, ...terrainBrowseRows],
    [documentBrowseRows, terrainBrowseRows],
  )

  const competencyBrowseRows = useMemo(() => {
    if (!browseActive) return []
    return [...competencyCatalogRows].sort((left, right) => (
      String(left.code).localeCompare(String(right.code))
      || String(left.groupTitle).localeCompare(String(right.groupTitle))
      || String(left.reference).localeCompare(String(right.reference))
    ))
  }, [browseActive, competencyCatalogRows])

  const browseResultCount = codeBrowseRows.length + competencyBrowseRows.length

  function notifyRemoveBlocked(message) {
    if (!message) return false
    window.alert(message)
    return true
  }

  function toggleCatalogItem(catalogItem) {
    if (disabled || !onChange) return
    const nextItem = missionEssaiFromCatalogItem(catalogItem, rstCodeCatalog)
    const nextCode = missionEssaiKey(nextItem)
    const exists = items.some((item) => missionEssaiKey(item) === nextCode)
    if (exists) {
      const blockMessage = onBeforeRemove?.(nextItem)
      if (notifyRemoveBlocked(blockMessage)) return
    }
    onChange(
      exists
        ? items.filter((item) => missionEssaiKey(item) !== nextCode)
        : [...items, nextItem],
    )
  }

  function toggleDocumentItem(entry) {
    if (disabled || !onChange) return
    const nextItem = missionEssaiFromDocumentEntry(entry) || missionEssaiFromEssaiCodeEntry(entry)
    if (!nextItem) return
    const nextCode = missionEssaiKey(nextItem)
    const exists = items.some((item) => missionEssaiKey(item) === nextCode)
    if (exists) {
      const blockMessage = onBeforeRemove?.(nextItem)
      if (notifyRemoveBlocked(blockMessage)) return
    }
    onChange(
      exists
        ? items.filter((item) => missionEssaiKey(item) !== nextCode)
        : [...items, nextItem],
    )
  }

  function toggleBrowseRow(row) {
    if (row.kind === 'rst-code' || row.kind === 'terrain-code') {
      toggleDocumentItem(row.documentEntry)
      return
    }
    toggleCatalogItem(row.catalogItem)
  }

  function removeItem(itemToRemove) {
    if (disabled || !onChange) return
    const blockMessage = onBeforeRemove?.(itemToRemove)
    if (notifyRemoveBlocked(blockMessage)) return
    const removeKey = missionEssaiKey(itemToRemove)
    onChange(items.filter((item) => missionEssaiKey(item) !== removeKey))
  }

  function handleSearchChange(event) {
    setSearchQuery(event.target.value)
    if (event.target.value.trim().length >= 2) {
      setShowFullCatalog(false)
    }
  }

  const showBrowsePanel = !disabled && !isLoading && browseActive
  const showCodeBrowse = showBrowsePanel && codeBrowseRows.length > 0
  const showCompetencyBrowse = showBrowsePanel && competencyBrowseRows.length > 0

  function renderBrowsePanel() {
    if (!showBrowsePanel) return null

    if (!showCodeBrowse && !showCompetencyBrowse) {
      return (
        <div className="border-t border-[#dbe1ea] px-1 pt-2.5">
          <p className="px-2 py-2 text-[12px] text-[#69758a]">
            {searchActive
              ? 'Aucun essai ne correspond à cette recherche.'
              : 'Catalogue compétences vide.'}
          </p>
        </div>
      )
    }

    return (
      <div className="max-h-[340px] overflow-y-auto border-t border-[#dbe1ea] px-1 pt-2.5">
        {searchActive ? (
          <div className="px-2 pb-2 text-[11px] font-semibold text-[#69758a]">
            {browseResultCount} résultat{browseResultCount !== 1 ? 's' : ''}
          </div>
        ) : null}

        {documentBrowseRows.length > 0 ? (
          <div className="flex flex-col gap-1.5 px-1 pb-2">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wide text-[#69758a]">
              Documents mission
            </div>
            {documentBrowseRows.map((row) => (
              <BrowseResultRow
                key={row.key}
                row={row}
                onToggle={() => toggleBrowseRow(row)}
              />
            ))}
          </div>
        ) : null}

        {terrainBrowseRows.length > 0 ? (
          <div className="flex flex-col gap-1.5 px-1 pb-2">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wide text-[#69758a]">
              Codes essai terrain
            </div>
            {terrainBrowseRows.map((row) => (
              <BrowseResultRow
                key={row.key}
                row={row}
                onToggle={() => toggleBrowseRow(row)}
              />
            ))}
          </div>
        ) : null}

        {showCompetencyBrowse ? (
          <div className="flex flex-col gap-1.5 px-1 pb-2">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wide text-[#69758a]">
              Catalogue compétences
            </div>
            {competencyBrowseRows.map((row) => (
              <BrowseResultRow
                key={row.key}
                row={row}
                onToggle={() => toggleBrowseRow(row)}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Essais à réaliser
            </div>
            <p className="mt-1 text-[12px] text-[#69758a] leading-relaxed">
              Plan des essais prévus pour cette intervention. La fiche essai n&apos;existe pas tant que vous ne l&apos;avez pas créée.
            </p>
          </div>
          {!isLoading && essaisCatalog?.count ? (
            <span className="rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2.5 py-1 text-[10px] font-bold text-[#69758a]">
              {essaisCatalog.mapped_count ?? '?'}/{essaisCatalog.count} essais catalogue
            </span>
          ) : null}
        </div>

        <div
          className="rounded-[14px] border border-[#c7d7f5] bg-[#eef5ff] px-4 py-3 text-[12px] leading-relaxed text-[#172033]"
          style={{ boxShadow: '0 4px 14px rgba(0,49,112,0.06)' }}
        >
          <div className="text-[10px] font-black uppercase tracking-[.08em] text-[#003170]">
            Créer la fiche essai
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[#334155]">
            <li>Recherchez un essai ci-dessous et ajoutez-le au plan.</li>
            <li>
              Cliquez sur une ligne du plan ou sur <strong className="text-[#003170]">Créer la fiche</strong> pour
              {' '}matérialiser la fiche essai (feuille terrain, essai labo, etc.).
            </li>
          </ol>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#69758a]">
          Planifiés ({items.length})
        </div>

        {items.length > 0 ? (
          <EssaisTableShell>
            <thead>
              <tr className="border-b border-[#dbe1ea] bg-[#f8fafc] text-left">
                <th className={TH_CLASS}>Code RST</th>
                <th className={TH_CLASS}>Essai</th>
                <th className={TH_CLASS}>Domaine / norme</th>
                <th className={`${TH_CLASS} w-[132px]`}>Fiche essai</th>
                <th className={`${TH_CLASS} w-[72px]`} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const row = getMissionItemDisplayParts(item, essaisGroups, rstCodeCatalog)
                const canCreateFiche = Boolean(onCreateEssai) && !disabled
                const detail = row.domaine
                  ? `${row.domaine}${row.reference !== '—' ? ` · ${row.reference}` : ''}`
                  : row.reference
                return (
                  <tr
                    key={missionEssaiKey(item)}
                    className={`border-b border-[#edf1f7] last:border-b-0 bg-[#fbfcfe] transition-colors ${canCreateFiche ? 'cursor-pointer hover:bg-[#f8fafc]' : ''}`}
                    onClick={() => {
                      if (!canCreateFiche) return
                      onCreateEssai(item)
                    }}
                  >
                    <td className={`${TD_CLASS} font-black text-[#003170]`}>{row.code}</td>
                    <td className={`${TD_CLASS} text-[#172033]`}>{row.essai}</td>
                    <td className={`${TD_CLASS} text-[#69758a]`}>{detail}</td>
                    <td className={TD_CLASS}>
                      {canCreateFiche ? (
                        <span className="inline-flex items-center rounded-full border border-[#003170]/25 bg-[#eef5ff] px-2.5 py-1 text-[11px] font-black text-[#003170]">
                          Créer la fiche
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#69758a]">—</span>
                      )}
                    </td>
                    <td className={TD_CLASS}>
                      {!disabled ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            removeItem(item)
                          }}
                          className="inline-flex items-center justify-center rounded-full p-1 text-[#69758a] hover:bg-white hover:text-[#003170]"
                          aria-label={`Retirer ${row.essai}`}
                          title="Retirer"
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </EssaisTableShell>
        ) : (
          !isLoading ? (
            <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-4 text-center text-[12px] text-[#69758a]">
              Aucun essai planifié. Recherchez ci-dessous pour constituer le plan, puis créez la fiche en cliquant sur une ligne.
            </div>
          ) : null
        )}
      </div>

      {disabled ? (
        <p className="text-[12px] text-[#69758a] italic">Enregistrement en cours…</p>
      ) : null}

      {isLoading ? (
        <p className="text-[12px] text-[#69758a]">Chargement du catalogue…</p>
      ) : null}

      {planError ? (
        <div className="rounded-[12px] border border-[#f0a0a0] bg-[#fcebeb] px-3 py-2 text-[12px] text-[#b42318]">
          {planError}
        </div>
      ) : null}

      {!disabled ? (
        <div className="flex flex-col rounded-[12px] border border-[#dbe1ea] bg-[#f8fafc] p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[.08em] text-[#69758a]">
            Ajouter au plan
          </div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#69758a]" />
            <input
              type="search"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Code RST (VC, DE, FWD…), nom d'essai ou norme NF…"
              className="w-full rounded-[10px] border border-[#dbe1ea] bg-white py-2 pl-9 pr-3 text-[12px] text-[#334155] placeholder:text-[#8a95a8] focus:border-[#003170] focus:outline-none"
            />
          </div>

          {renderBrowsePanel()}

          {!searchActive ? (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#dbe1ea] pt-2.5">
              <p className="text-[11px] text-[#69758a]">
                {showFullCatalog
                  ? 'Parcours complet du catalogue compétences.'
                  : 'Tapez au moins 2 caractères pour rechercher.'}
              </p>
              <button
                type="button"
                onClick={() => setShowFullCatalog((current) => !current)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${showFullCatalog ? 'border-[#003170] bg-[#eef5ff] text-[#003170]' : 'border-[#dbe1ea] bg-white text-[#69758a] hover:border-[#003170]/35'}`}
              >
                {showFullCatalog
                  ? 'Fermer le catalogue'
                  : `Tout le catalogue (${essaisCatalog?.count || 0})`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

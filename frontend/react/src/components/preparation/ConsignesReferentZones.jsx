import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ExternalLink, Search } from 'lucide-react'
import { api } from '@/services/api'
import {
  ESSAIS_CONSIGNES_FIELD,
  countConsignesFilled,
  filterCatalogGroupsBySearch,
  filterEssaiGroupsBySearch,
  filterGroupsToSelected,
  formatConsignesPreview,
  getEssaiDisplayParts,
  isEssaiItemSelected,
  parseConsignesSelection,
  resolveCatalogGroups,
  serializeConsignesSelection,
  toggleEssaiStorageCode,
} from '@/lib/consignesCatalog'

export const CONSIGNES_REFERENT_FIELDS = [
  { key: ESSAIS_CONSIGNES_FIELD, label: "Types d'essais prévus" },
  { key: 'livrables_attendus', label: 'Livrables attendus' },
  { key: 'criteres_conformite', label: 'Critères de conformité' },
]

function itemKey(item) {
  return String(item.competency_id || item.code)
}

function SelectedEssaiRow({ item, selectable = false, selected = false, onToggle, rstCodeCatalog = [] }) {
  const parts = getEssaiDisplayParts(item, rstCodeCatalog)
  const className = selectable
    ? `rounded-[12px] border px-3 py-2.5 text-left transition-colors flex flex-col gap-1 w-full ${selected ? 'border-[#003170] bg-[#eef5ff]' : 'border-[#dbe1ea] bg-white hover:border-[#003170]/35'}`
    : 'rounded-[12px] border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2.5 flex flex-col gap-1'

  const content = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {parts.code ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[.04em] ${selected || !selectable ? 'border-[#003170] bg-[#eef5ff] text-[#003170]' : 'border-[#dbe1ea] bg-[#f8fafc] text-[#69758a]'}`}>
            {parts.code}
          </span>
        ) : null}
        <span className={`text-[12px] leading-snug ${selected || !selectable ? 'font-bold text-[#003170]' : 'font-medium text-[#334155]'}`}>
          {parts.title || parts.label || parts.reference}
        </span>
      </div>
      {parts.label && parts.title && parts.label !== parts.title ? (
        <div className="text-[10px] text-[#69758a] leading-relaxed">{parts.label}</div>
      ) : null}
      {parts.reference ? (
        <div className="text-[10px] text-[#69758a] leading-relaxed">{parts.reference}</div>
      ) : null}
    </>
  )

  if (selectable) {
    return (
      <button type="button" onClick={onToggle} className={className}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}

function SelectedCatalogRow({ item }) {
  return (
    <div className="rounded-[12px] border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2.5 flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-[#003170] bg-[#eef5ff] px-2 py-0.5 text-[10px] font-black uppercase tracking-[.04em] text-[#003170]">
        {item.code}
      </span>
      <span className="text-[12px] font-medium text-[#334155]">{item.label}</span>
    </div>
  )
}

export default function ConsignesReferentZones({
  values = {},
  onChange,
  readOnly = false,
  editHref = '',
  editLabel = 'Modifier dans la demande',
  subtitle = '',
}) {
  const [activeKey, setActiveKey] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [catalogMode, setCatalogMode] = useState('selected')

  useEffect(() => {
    setSearchQuery('')
    setCatalogMode('selected')
  }, [activeKey])

  const { data: essaisCatalog, isLoading: essaisCatalogLoading } = useQuery({
    queryKey: ['consignes-essais-catalog'],
    queryFn: () => api.get('/demandes_rst/configuration/consignes-essais-catalog'),
    staleTime: 5 * 60 * 1000,
  })

  const essaisGroups = essaisCatalog?.groups || []
  const rstCodeCatalog = essaisCatalog?.rst_codes || []

  const filledCount = useMemo(
    () => countConsignesFilled(values, essaisGroups),
    [values, essaisGroups],
  )

  const parsedByField = useMemo(() => (
    Object.fromEntries(
      CONSIGNES_REFERENT_FIELDS.map(({ key }) => [
        key,
        parseConsignesSelection(
          key,
          values[key],
          key === ESSAIS_CONSIGNES_FIELD ? essaisGroups : [],
        ),
      ]),
    )
  ), [values, essaisGroups])

  function toggleCode(fieldKey, item) {
    if (readOnly || !onChange) return
    const current = parsedByField[fieldKey]?.codes || []
    const nextCodes = fieldKey === ESSAIS_CONSIGNES_FIELD
      ? toggleEssaiStorageCode(item, current)
      : (() => {
        const code = item.code
        return current.includes(code)
          ? current.filter((entry) => entry !== code)
          : [...current, code]
      })()
    onChange?.({
      ...values,
      [fieldKey]: serializeConsignesSelection(
        fieldKey,
        nextCodes,
        fieldKey === ESSAIS_CONSIGNES_FIELD ? essaisGroups : [],
      ),
    })
  }

  const activeGroups = activeKey
    ? resolveCatalogGroups(activeKey, activeKey === ESSAIS_CONSIGNES_FIELD ? essaisGroups : [])
    : []

  const activeSelectedCodes = activeKey ? (parsedByField[activeKey]?.codes || []) : []
  const selectedGroups = useMemo(
    () => filterGroupsToSelected(activeGroups, activeSelectedCodes, activeKey || ''),
    [activeGroups, activeSelectedCodes, activeKey],
  )
  const selectedItems = useMemo(
    () => selectedGroups.flatMap((group) => group.items || []),
    [selectedGroups],
  )

  const isEssaisField = activeKey === ESSAIS_CONSIGNES_FIELD
  const searchActive = searchQuery.trim().length >= 2

  const filteredEssaiGroups = useMemo(() => {
    if (!isEssaisField) return []
    if (searchActive) {
      return filterEssaiGroupsBySearch(activeGroups, searchQuery)
    }
    if (catalogMode === 'all') {
      return activeGroups
    }
    return []
  }, [activeGroups, catalogMode, isEssaisField, searchActive, searchQuery])

  const filteredCatalogGroups = useMemo(() => {
    if (readOnly || isEssaisField) return []
    return filterCatalogGroupsBySearch(activeGroups, searchQuery)
  }, [activeGroups, isEssaisField, readOnly, searchQuery])

  const displayGroups = readOnly
    ? selectedGroups
    : (isEssaisField ? filteredEssaiGroups : filteredCatalogGroups)

  const visibleResultCount = displayGroups.reduce((total, group) => total + (group.items?.length || 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {subtitle ? (
        <p className="text-[12px] text-[#69758a] leading-relaxed">{subtitle}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-[#69758a]">
        <span className="rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2.5 py-1">
          {filledCount}/{CONSIGNES_REFERENT_FIELDS.length} renseignée{filledCount !== 1 ? 's' : ''}
        </span>
        {!readOnly && essaisCatalog?.count ? (
          <span className="rounded-full border border-[#dbe1ea] bg-white px-2.5 py-1">
            {essaisCatalog.mapped_count ?? '?'}/{essaisCatalog.count} mappé(s) · codes RST
          </span>
        ) : null}
        {readOnly && editHref ? (
          <a
            href={editHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[#003170] bg-[#eef5ff] px-2.5 py-1 text-[#003170] hover:bg-white"
          >
            {editLabel}
            <ExternalLink size={11} />
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {CONSIGNES_REFERENT_FIELDS.map(({ key, label }) => {
          const parsed = parsedByField[key] || { codes: [], unknown: [] }
          const filled = parsed.codes.length > 0 || parsed.unknown.length > 0
          const active = activeKey === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveKey((current) => (current === key ? null : key))}
              className={`rounded-[14px] border px-3.5 py-3 text-left transition-colors ${active ? 'border-[#003170] bg-[#eef5ff]' : filled ? 'border-[#b8cfe8] bg-white hover:border-[#003170]/35' : 'border-dashed border-[#cfd7e4] bg-[#fbfcfe] hover:border-[#003170]/30'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[12px] font-black text-[#003170]">{label}</div>
                <ChevronDown size={14} className={`shrink-0 text-[#69758a] transition-transform ${active ? 'rotate-180' : ''}`} />
              </div>
              <div className={`mt-1.5 text-[11px] leading-5 ${filled ? 'text-[#334155]' : 'text-[#8a95a8] italic'}`}>
                {formatConsignesPreview(
                  key,
                  values[key],
                  key === ESSAIS_CONSIGNES_FIELD ? essaisGroups : [],
                  72,
                  rstCodeCatalog,
                )}
              </div>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">
                {filled ? `${parsed.codes.length + parsed.unknown.length} sélection(s)` : 'À compléter'}
              </div>
            </button>
          )
        })}
      </div>

      {activeKey ? (
        <div className="rounded-[14px] border border-[#dbe1ea] bg-white p-3 flex flex-col gap-3">
          <div className="text-[11px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">
            {CONSIGNES_REFERENT_FIELDS.find((item) => item.key === activeKey)?.label}
            {readOnly ? ' — sélection amont' : ' — sélectionner'}
            {!readOnly && activeKey === ESSAIS_CONSIGNES_FIELD ? ' · catalogue compétences' : ''}
          </div>

          {activeKey === ESSAIS_CONSIGNES_FIELD && essaisCatalogLoading ? (
            <p className="text-[12px] text-[#69758a]">Chargement du catalogue compétences…</p>
          ) : null}

          {readOnly && !essaisCatalogLoading && selectedItems.length === 0 && !(parsedByField[activeKey]?.unknown || []).length ? (
            <p className="text-[12px] text-[#69758a] italic">Aucune sélection enregistrée sur la demande.</p>
          ) : null}

          {!readOnly && activeKey === ESSAIS_CONSIGNES_FIELD && !essaisCatalogLoading ? (
            <div className="flex flex-col gap-2.5 rounded-[12px] border border-[#dbe1ea] bg-[#f8fafc] p-3">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#69758a]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Code RST (FWD, PMT, SC…), nom d'essai ou norme NF…"
                  className="w-full rounded-[10px] border border-[#dbe1ea] bg-white py-2 pl-9 pr-3 text-[12px] text-[#334155] placeholder:text-[#8a95a8] focus:border-[#003170] focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatalogMode('selected')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${catalogMode === 'selected' ? 'border-[#003170] bg-[#eef5ff] text-[#003170]' : 'border-[#dbe1ea] bg-white text-[#69758a] hover:border-[#003170]/35'}`}
                >
                  Sélectionnés ({selectedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogMode('all')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${catalogMode === 'all' ? 'border-[#003170] bg-[#eef5ff] text-[#003170]' : 'border-[#dbe1ea] bg-white text-[#69758a] hover:border-[#003170]/35'}`}
                >
                  Tout le catalogue ({essaisCatalog?.count || 0})
                </button>
                {searchActive ? (
                  <span className="text-[11px] text-[#69758a]">
                    {visibleResultCount} résultat{visibleResultCount !== 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
              {!searchActive && catalogMode !== 'all' ? (
                <p className="text-[11px] text-[#69758a] leading-relaxed">
                  Le catalogue complet est masqué pour gagner du temps. Tapez au moins 2 caractères
                  {' '}ou cliquez « Tout le catalogue » pour parcourir les {essaisCatalog?.count || 0} essais.
                </p>
              ) : null}
            </div>
          ) : null}

          {!readOnly && activeKey && activeKey !== ESSAIS_CONSIGNES_FIELD ? (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#69758a]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filtrer par code ou libellé…"
                className="w-full rounded-[10px] border border-[#dbe1ea] bg-white py-2 pl-9 pr-3 text-[12px] text-[#334155] placeholder:text-[#8a95a8] focus:border-[#003170] focus:outline-none"
              />
            </div>
          ) : null}

          {!readOnly && isEssaisField && selectedItems.length > 0 && catalogMode === 'selected' && !searchActive ? (
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">
                Déjà sélectionnés
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {selectedItems.map((item) => (
                  <SelectedEssaiRow
                    key={itemKey(item)}
                    item={item}
                    selectable
                    selected
                    rstCodeCatalog={rstCodeCatalog}
                    onToggle={() => toggleCode(activeKey, item)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {!readOnly && activeKey === ESSAIS_CONSIGNES_FIELD && !essaisCatalogLoading && !displayGroups.length ? (
            <p className="text-[12px] text-[#69758a]">
              {essaisCatalog?.count
                ? (searchActive
                  ? 'Aucun essai ne correspond à cette recherche.'
                  : (catalogMode === 'selected' && !selectedItems.length
                    ? 'Aucun essai sélectionné pour l’instant — utilisez la recherche ou ouvrez le catalogue.'
                    : 'Catalogue compétences vide. Importez le tableau officiel via tools/import_competency_catalog.py.'))
                : 'Catalogue compétences vide. Importez le tableau officiel via tools/import_competency_catalog.py.'}
            </p>
          ) : null}

          {!readOnly && activeKey && activeKey !== ESSAIS_CONSIGNES_FIELD && !displayGroups.length && searchActive ? (
            <p className="text-[12px] text-[#69758a]">Aucun élément ne correspond à cette recherche.</p>
          ) : null}

          {readOnly ? (
            <div className="flex flex-col gap-2">
              {activeKey === ESSAIS_CONSIGNES_FIELD
                ? selectedItems.map((item) => (
                  <SelectedEssaiRow key={itemKey(item)} item={item} rstCodeCatalog={rstCodeCatalog} />
                ))
                : selectedItems.map((item) => <SelectedCatalogRow key={itemKey(item)} item={item} />)}
            </div>
          ) : activeKey === ESSAIS_CONSIGNES_FIELD && (catalogMode === 'all' || searchActive) ? (
            displayGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">
                  {searchActive ? 'Résultats · ' : ''}{group.title}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {(group.items || []).map((item) => {
                    const selected = isEssaiItemSelected(item, activeSelectedCodes)
                    return (
                      <SelectedEssaiRow
                        key={itemKey(item)}
                        item={item}
                        selectable
                        selected={selected}
                        rstCodeCatalog={rstCodeCatalog}
                        onToggle={() => toggleCode(activeKey, item)}
                      />
                    )
                  })}
                </div>
              </div>
            ))
          ) : (
            displayGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">{group.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(group.items || []).map((item) => {
                    const selected = activeSelectedCodes.includes(item.code)
                    return (
                      <button
                        key={itemKey(item)}
                        type="button"
                        onClick={() => toggleCode(activeKey, item)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold border transition-colors ${selected ? 'border-[#003170] bg-[#eef5ff] text-[#003170]' : 'border-[#dbe1ea] bg-white text-[#69758a] hover:border-[#003170]/35'}`}
                        title={item.label}
                      >
                        {item.code}
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(group.items || [])
                    .filter((item) => activeSelectedCodes.includes(item.code))
                    .map((item) => (
                      <span key={`${itemKey(item)}-lbl`} className="rounded-md bg-[#f8fafc] px-2 py-0.5 text-[10px] text-[#69758a]">
                        {item.label}
                      </span>
                    ))}
                </div>
              </div>
            ))
          )}

          {(parsedByField[activeKey]?.unknown || []).length ? (
            <div className="rounded-lg border border-[#f1d77a] bg-[#fff9df] px-3 py-2 text-[11px] text-[#6f5700]">
              <div className="font-bold">Valeurs hors catalogue (legacy)</div>
              <div className="mt-1">{parsedByField[activeKey].unknown.join(' · ')}</div>
            </div>
          ) : null}

          {readOnly && editHref ? (
            <p className="text-[11px] text-[#69758a]">
              Pour modifier cette sélection, ouvrez{' '}
              <a href={editHref} target="_blank" rel="noopener noreferrer" className="font-bold text-[#003170] hover:underline">
                {editLabel.toLowerCase()}
              </a>.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

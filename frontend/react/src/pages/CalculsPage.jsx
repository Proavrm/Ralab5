import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import DemandeReferencePicker from '@/components/demande/DemandeReferencePicker'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { calculsApi, getApiErrorMessage } from '@/services/api'

const TYPE_LABELS = {
  alize: 'Alizé',
  gel_degel: 'Gel-Dégel',
  talren: 'Talren',
}

function SummaryCard({ title, value, hint, onClick, muted }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        muted
          ? 'cursor-default border-[#e5e9f0] bg-[#f8fafc]'
          : 'border-[#dbe1ea] bg-white hover:border-[#003170] hover:bg-[#f8fafc]'
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</div>
      <div className="mt-1 text-[28px] font-black tabular-nums text-[#003170]">{value}</div>
      {hint ? <div className="mt-1 text-[12px] text-text-muted">{hint}</div> : null}
    </button>
  )
}

function parseOptionalInt(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function DemandeCalculsView({ demandeId, affaireId, missionId, returnTo }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('alize')
  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showAll, setShowAll] = useState(false)

  const demandeRef = items.find((item) => item.demande_ref)?.demande_ref || ''
  const affaireRef = items.find((item) => item.affaire_ref)?.affaire_ref || ''
  const acceptedItems = useMemo(() => items.filter((item) => item.a_retenir), [items])
  const visibleItems = showAll ? items : acceptedItems

  const query = useMemo(
    () => ({
      demande_id: demandeId,
      affaire_rst_id: affaireId || undefined,
      type_calcul: typeFilter || undefined,
      statut: statut || undefined,
      search: search.trim() || undefined,
    }),
    [demandeId, affaireId, typeFilter, statut, search],
  )

  async function load() {
    setLoading(true)
    setError('')
    try {
      const list = await calculsApi.list(query)
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Impossible de charger les calculs'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [query.demande_id, query.affaire_rst_id, query.type_calcul, query.statut, query.search])

  function backToDemande() {
    if (returnTo) {
      navigate(returnTo)
      return
    }
    navigate(`/demandes/${demandeId}`)
  }

  function listReturnPath() {
    const params = new URLSearchParams({ demande_id: String(demandeId) })
    if (affaireId) params.set('affaire_rst_id', String(affaireId))
    return buildPathWithReturnTo(`/calculs?${params}`, returnTo)
  }

  function openItem(item) {
    if (item.type_calcul === 'alize') {
      navigate(buildPathWithReturnTo(`/calculs/alize/${item.id}`, listReturnPath()))
      return
    }
    setError(`${TYPE_LABELS[item.type_calcul] || item.type_calcul} : disponible en phase suivante`)
  }

  async function createCalcul() {
    setCreating(true)
    setError('')
    try {
      if (!newName.trim()) {
        setError('Indiquez un nom de calcul explicite (ex. CAM05 A0 — structure / PF).')
        return
      }
      const created = await calculsApi.create({
        type_calcul: newType,
        nom_calcul: newName.trim(),
        demande_id: demandeId,
        affaire_rst_id: affaireId || undefined,
        mission_id: missionId || undefined,
      })
      if (created.type_calcul === 'alize') {
        navigate(buildPathWithReturnTo(`/calculs/alize/${created.id}`, listReturnPath()))
        return
      }
      await load()
      setNewName('')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Création impossible'))
    } finally {
      setCreating(false)
    }
  }

  const title = demandeRef || `Demande #${demandeId}`

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Demande"
        onBack={backToDemande}
        eyebrow="Calculs de la demande"
        title={title}
        subtitle={[
          affaireRef || null,
          showAll
            ? `${items.length} variante${items.length === 1 ? '' : 's'}`
            : `${acceptedItems.length} accepté${acceptedItems.length === 1 ? '' : 's'}`,
        ].filter(Boolean).join(' · ')}
      />

      <FicheMain>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </div>
        ) : null}

        <SectionCard
          title="Nouveau calcul"
          subtitle="Créé et lié automatiquement à cette demande — l’acceptation se fait dans la fiche calcul"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[140px]">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Type</label>
              <Select className="w-full" value={newType} onChange={(e) => setNewType(e.target.value)}>
                <option value="alize">Alizé</option>
                <option value="gel_degel">Gel-Dégel</option>
                <option value="talren">Talren</option>
              </Select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Nom</label>
              <Input
                placeholder="Ex. CAM05 A0 — 5 BBSG + 14 GB4 / PF2"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button size="sm" variant="primary" disabled={creating} onClick={createCalcul}>
              {creating ? 'Création…' : 'Créer'}
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title={showAll ? 'Toutes les variantes' : 'Calculs acceptés'}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-[12px] font-semibold text-[#003170] underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Voir les acceptés' : 'Toutes les variantes'}
              </button>
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[120px]">
                <option value="">Tous types</option>
                <option value="alize">Alizé</option>
                <option value="gel_degel">Gel-Dégel</option>
                <option value="talren">Talren</option>
              </Select>
              <Input
                className="w-[180px]"
                placeholder="Filtrer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="min-w-[140px]">
                <option value="">Tous statuts</option>
                <option value="Brouillon">Brouillon</option>
                <option value="À vérifier">À vérifier</option>
                <option value="Validé">Validé</option>
              </Select>
              <Button size="sm" onClick={load} disabled={loading}>Actualiser</Button>
            </div>
          )}
        >
          {loading ? (
            <p className="text-[13px] text-text-muted">Chargement…</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              {showAll
                ? 'Aucun calcul lié à cette demande.'
                : 'Aucun calcul accepté. Ouvrez une variante (Toutes les variantes) et marquez-la acceptée dans la fiche.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="pb-2 pr-3 font-semibold">Nom</th>
                    <th className="pb-2 pr-3 font-semibold">Type</th>
                    <th className="pb-2 pr-3 font-semibold">Statut</th>
                    <th className="pb-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.id} className="border-t border-[#eef1f6]">
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          className="text-left font-semibold text-[#003170] hover:underline"
                          onClick={() => openItem(item)}
                        >
                          {item.nom_calcul || item.reference}
                        </button>
                        <div className="text-[11px] text-text-muted">{item.reference}</div>
                      </td>
                      <td className="py-2.5 pr-3">{TYPE_LABELS[item.type_calcul] || item.type_calcul}</td>
                      <td className="py-2.5 pr-3">{item.statut}</td>
                      <td className="py-2.5">
                        <Button size="sm" onClick={() => openItem(item)}>Ouvrir</Button>
                      </td>
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

function GenericCalculsView({
  typeFilter,
  contextAffaireId,
  contextMissionId,
  setSearchParams,
  searchParams,
}) {
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [linkDemandeLabel, setLinkDemandeLabel] = useState('')
  const [linkDemandeId, setLinkDemandeId] = useState(null)
  const [linkAffaireId, setLinkAffaireId] = useState(contextAffaireId)

  useEffect(() => {
    setLinkAffaireId(contextAffaireId)
  }, [contextAffaireId])

  const query = useMemo(
    () => ({
      type_calcul: typeFilter || undefined,
      statut: statut || undefined,
      search: search.trim() || undefined,
      affaire_rst_id: contextAffaireId || undefined,
    }),
    [typeFilter, statut, search, contextAffaireId],
  )

  const demandeGroups = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const key = item.demande_id != null ? `d:${item.demande_id}` : 'none'
      if (!map.has(key)) {
        map.set(key, {
          key,
          demande_id: item.demande_id ?? null,
          demande_ref: item.demande_ref || '',
          affaire_rst_id: item.affaire_rst_id ?? null,
          affaire_ref: item.affaire_ref || '',
          items: [],
        })
      }
      const group = map.get(key)
      group.items.push(item)
      if (!group.demande_ref && item.demande_ref) group.demande_ref = item.demande_ref
      if (!group.affaire_ref && item.affaire_ref) group.affaire_ref = item.affaire_ref
      if (group.affaire_rst_id == null && item.affaire_rst_id != null) {
        group.affaire_rst_id = item.affaire_rst_id
      }
    }
    return [...map.values()]
      .map((group) => {
        const accepted = group.items.filter((i) => i.a_retenir).length
        const updated = group.items
          .map((i) => i.updated_at || '')
          .filter(Boolean)
          .sort()
          .at(-1) || ''
        const avisCounts = { Conforme: 0, Limite: 0, 'Non conforme': 0, Indicatif: 0 }
        for (const i of group.items) {
          const a = String(i.avis || 'Indicatif').trim() || 'Indicatif'
          if (avisCounts[a] != null) avisCounts[a] += 1
          else avisCounts.Indicatif += 1
        }
        return { ...group, accepted, updated, avisCounts, count: group.items.length }
      })
      .sort((a, b) => {
        const ra = a.demande_ref || ''
        const rb = b.demande_ref || ''
        if (!ra && rb) return 1
        if (ra && !rb) return -1
        return rb.localeCompare(ra, 'fr') || String(b.updated).localeCompare(String(a.updated))
      })
  }, [items])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [sum, list] = await Promise.all([
        calculsApi.summary(contextAffaireId ? { affaire_rst_id: contextAffaireId } : {}),
        calculsApi.list(query),
      ])
      setSummary(sum)
      setItems(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Impossible de charger les calculs'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [query.type_calcul, query.statut, query.search, query.affaire_rst_id])

  function buildLinkPayload(extraName) {
    return {
      type_calcul: 'alize',
      nom_calcul: extraName || newName.trim() || 'Nouveau calcul Alizé',
      affaire_rst_id: linkAffaireId || contextAffaireId || undefined,
      demande_id: linkDemandeId || undefined,
      mission_id: contextMissionId || undefined,
    }
  }

  async function createAlize() {
    setCreating(true)
    setError('')
    try {
      if (!linkDemandeId) {
        setError('Sélectionnez une demande pour créer le calcul.')
        return
      }
      const created = await calculsApi.create(buildLinkPayload())
      const calcId = created?.id ?? created?.uid
      if (!calcId) throw new Error('Identifiant calcul manquant dans la réponse API.')
      const params = new URLSearchParams({ demande_id: String(linkDemandeId) })
      if (linkAffaireId || contextAffaireId) {
        params.set('affaire_rst_id', String(linkAffaireId || contextAffaireId))
      }
      navigate(buildPathWithReturnTo(`/calculs/alize/${calcId}`, `/calculs?${params}`))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Création impossible'))
    } finally {
      setCreating(false)
    }
  }

  function setType(type) {
    const next = new URLSearchParams(searchParams)
    if (type) next.set('type', type)
    else next.delete('type')
    setSearchParams(next)
  }

  function openDemandeGroup(group) {
    if (!group.demande_id) {
      setError('Ces calculs ne sont liés à aucune demande.')
      return
    }
    const params = new URLSearchParams({ demande_id: String(group.demande_id) })
    if (group.affaire_rst_id) params.set('affaire_rst_id', String(group.affaire_rst_id))
    const listHref = `/calculs?${params}`

    const alizeItems = group.items.filter((item) => item.type_calcul === 'alize')
    const preferred = alizeItems.find((item) => item.a_retenir)
      || [...alizeItems].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0]
      || group.items[0]

    if (preferred?.type_calcul === 'alize' && preferred.id) {
      navigate(buildPathWithReturnTo(`/calculs/alize/${preferred.id}`, listHref))
      return
    }
    // Fallback : vue demande (Gel/Talren ou cas sans Alizé)
    navigate(listHref)
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Accueil"
        onBack={() => navigate('/dashboard')}
        eyebrow="Calculs"
        title="Dimensionnement"
        subtitle="Alizé · Gel-Dégel · Talren — accès par demande"
      />

      <FicheMain>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </div>
        ) : null}

        {contextAffaireId ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#c5d4ea] bg-[#eef4fb] px-3.5 py-2.5">
            <div className="text-[13px] text-[#172033]">
              Filtré sur l’affaire <strong>#{contextAffaireId}</strong>
              {items.find((i) => i.affaire_ref)?.affaire_ref
                ? ` · ${items.find((i) => i.affaire_ref)?.affaire_ref}`
                : ''}
              {' · '}
              {items.length} calcul(s)
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={creating} onClick={createAlize}>
                {creating ? 'Création…' : '+ Calcul Alizé'}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.delete('affaire_rst_id')
                  next.delete('affaire_id')
                  setSearchParams(next)
                }}
              >
                Voir tous les calculs
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <SummaryCard title="Total" value={summary?.total ?? '—'} muted />
          <SummaryCard title="Alizé" value={summary?.alize ?? '—'} onClick={() => setType('alize')} hint="Phase 1" />
          <SummaryCard title="Gel-Dégel" value={summary?.gel_degel ?? '—'} muted hint="Phase 2" />
          <SummaryCard title="Talren" value={summary?.talren ?? '—'} muted hint="Phase 3" />
          <SummaryCard title="En cours" value={summary?.variantes_en_cours ?? '—'} muted />
          <SummaryCard title="À vérifier" value={summary?.a_verifier ?? '—'} muted />
          <SummaryCard title="Validés" value={summary?.valides ?? '—'} muted />
        </div>

        <SectionCard title="Nouveau calcul Alizé" subtitle="Toujours rattaché à une demande">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Nom</label>
              <Input
                placeholder="Nom du calcul (optionnel)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="min-w-[260px] flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Demande</label>
              <DemandeReferencePicker
                value={linkDemandeLabel}
                onChange={(value) => {
                  setLinkDemandeLabel(value)
                  setLinkDemandeId(null)
                }}
                onSelect={(row) => {
                  setLinkDemandeLabel(row.reference)
                  setLinkDemandeId(Number(row.uid) || Number(row.id) || null)
                  setLinkAffaireId(row.affaire_rst_id != null ? Number(row.affaire_rst_id) : linkAffaireId)
                }}
                placeholder="Rechercher une demande…"
              />
            </div>
            <Button size="sm" variant="primary" disabled={creating || !linkDemandeId} onClick={createAlize}>
              {creating ? 'Création…' : 'Créer un Alizé'}
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Demandes avec calculs"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onChange={(e) => setType(e.target.value)} className="min-w-[120px]">
                <option value="">Tous types</option>
                <option value="alize">Alizé</option>
                <option value="gel_degel">Gel-Dégel</option>
                <option value="talren">Talren</option>
              </Select>
              <Input
                className="w-[180px]"
                placeholder="Filtrer demande / affaire…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={statut} onChange={(e) => setStatut(e.target.value)} className="min-w-[140px]">
                <option value="">Tous statuts</option>
                <option value="Brouillon">Brouillon</option>
                <option value="Prêt pour calcul">Prêt pour calcul</option>
                <option value="Résultats importés">Résultats importés</option>
                <option value="À vérifier">À vérifier</option>
                <option value="Validé">Validé</option>
              </Select>
              <Button size="sm" onClick={load} disabled={loading}>Actualiser</Button>
            </div>
          )}
        >
          {loading ? (
            <p className="text-[13px] text-text-muted">Chargement…</p>
          ) : demandeGroups.length === 0 ? (
            <p className="text-[13px] text-text-muted">Aucune demande avec calculs pour ces filtres.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="pb-2 pr-3 font-semibold">Demande</th>
                    <th className="pb-2 pr-3 font-semibold">Affaire</th>
                    <th className="pb-2 pr-3 font-semibold">Calculs</th>
                    <th className="pb-2 pr-3 font-semibold">Acceptés</th>
                    <th className="pb-2 pr-3 font-semibold">Avis</th>
                    <th className="pb-2 font-semibold">Maj</th>
                  </tr>
                </thead>
                <tbody>
                  {demandeGroups.map((group) => (
                    <tr
                      key={group.key}
                      className={`border-t border-[#eef1f6] ${group.demande_id ? 'cursor-pointer hover:bg-[#f8fafc]' : ''}`}
                      onClick={() => openDemandeGroup(group)}
                    >
                      <td className="py-2.5 pr-3 font-semibold text-[#003170]">
                        {group.demande_ref || (group.demande_id ? `#${group.demande_id}` : 'Sans demande')}
                      </td>
                      <td className="py-2.5 pr-3 text-text-muted">{group.affaire_ref || '—'}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{group.count}</td>
                      <td className="py-2.5 pr-3 tabular-nums">{group.accepted}</td>
                      <td className="py-2.5 pr-3 text-[11px] text-text-muted">
                        {[
                          group.avisCounts.Conforme ? `${group.avisCounts.Conforme} conf.` : null,
                          group.avisCounts.Limite ? `${group.avisCounts.Limite} lim.` : null,
                          group.avisCounts['Non conforme'] ? `${group.avisCounts['Non conforme']} NC` : null,
                          group.avisCounts.Indicatif ? `${group.avisCounts.Indicatif} ind.` : null,
                        ].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="py-2.5 text-text-muted">{String(group.updated || '').slice(0, 10) || '—'}</td>
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

export default function CalculsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const typeFilter = searchParams.get('type') || ''
  const contextAffaireId = parseOptionalInt(searchParams.get('affaire_rst_id') || searchParams.get('affaire_id'))
  const contextDemandeId = parseOptionalInt(searchParams.get('demande_id'))
  const contextMissionId = parseOptionalInt(searchParams.get('mission_id'))
  const returnTo = resolveReturnTo(searchParams, '')

  if (contextDemandeId) {
    return (
      <DemandeCalculsView
        demandeId={contextDemandeId}
        affaireId={contextAffaireId}
        missionId={contextMissionId}
        returnTo={returnTo}
      />
    )
  }

  return (
    <GenericCalculsView
      typeFilter={typeFilter}
      contextAffaireId={contextAffaireId}
      contextMissionId={contextMissionId}
      setSearchParams={setSearchParams}
      searchParams={searchParams}
    />
  )
}

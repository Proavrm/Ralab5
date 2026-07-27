import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
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

export default function CalculsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const typeFilter = searchParams.get('type') || ''
  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [refSearch, setRefSearch] = useState('')
  const [refs, setRefs] = useState([])
  const [imitatingId, setImitatingId] = useState(null)

  const query = useMemo(
    () => ({
      type_calcul: typeFilter || undefined,
      statut: statut || undefined,
      search: search.trim() || undefined,
    }),
    [typeFilter, statut, search],
  )

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [sum, list] = await Promise.all([
        calculsApi.summary(),
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
  }, [query.type_calcul, query.statut, query.search])

  useEffect(() => {
    searchRefs()
  }, [])

  async function createAlize() {
    setCreating(true)
    setError('')
    try {
      const created = await calculsApi.create({
        type_calcul: 'alize',
        nom_calcul: newName.trim() || 'Nouveau calcul Alizé',
      })
      navigate(`/calculs/alize/${created.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Création impossible'))
      setCreating(false)
    }
  }

  async function searchRefs() {
    try {
      const rows = await calculsApi.searchReferences({ search: refSearch.trim(), limit: 40 })
      setRefs(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Recherche références impossible'))
    }
  }

  async function imitateFromRef(ref) {
    setImitatingId(ref.id)
    setError('')
    try {
      const created = await calculsApi.createFromReference(ref.id, {
        nom_calcul: newName.trim() || undefined,
      })
      navigate(`/calculs/alize/${created.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Imitation impossible'))
      setImitatingId(null)
    }
  }

  function setType(type) {
    const next = new URLSearchParams(searchParams)
    if (type) next.set('type', type)
    else next.delete('type')
    setSearchParams(next)
  }

  function openItem(item) {
    if (item.type_calcul === 'alize') {
      navigate(`/calculs/alize/${item.id}`)
      return
    }
    setError(`${TYPE_LABELS[item.type_calcul] || item.type_calcul} : disponible en phase suivante`)
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Accueil"
        onBack={() => navigate('/dashboard')}
        eyebrow="Calculs"
        title="Dimensionnement"
        subtitle="Alizé · Gel-Dégel · Talren — module indépendant"
      />

      <FicheMain>
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <SummaryCard title="Total" value={summary?.total ?? '—'} muted />
          <SummaryCard
            title="Alizé"
            value={summary?.alize ?? '—'}
            onClick={() => setType('alize')}
            hint="Phase 1"
          />
          <SummaryCard
            title="Gel-Dégel"
            value={summary?.gel_degel ?? '—'}
            muted
            hint="Phase 2"
          />
          <SummaryCard
            title="Talren"
            value={summary?.talren ?? '—'}
            muted
            hint="Phase 3"
          />
          <SummaryCard title="En cours" value={summary?.variantes_en_cours ?? '—'} muted />
          <SummaryCard title="À vérifier" value={summary?.a_verifier ?? '—'} muted />
          <SummaryCard title="Validés" value={summary?.valides ?? '—'} muted />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
          <SectionCard title="Nouveau calcul Alizé">
            <p className="mb-3 text-[13px] text-text-muted">
              Crée une fiche Alizé (brouillon) avec trafic, plateforme, structure et critères.
            </p>
            <Input
              className="mb-2"
              placeholder="Nom du calcul (optionnel)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button size="sm" variant="primary" disabled={creating} onClick={createAlize}>
              {creating ? 'Création…' : 'Créer un Alizé'}
            </Button>
          </SectionCard>
          </div>

          <div className="lg:col-span-2">
          <SectionCard title="Références historiques Alizé">
            <p className="mb-3 text-[13px] text-text-muted">
              Utilisez une étude Excel pour <strong>imiter</strong> un Alizé (trafic, PF, couches, résultats)
              et travailler avant d&apos;avoir le calcul réel.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <Input
                className="min-w-[220px] flex-1"
                placeholder="Projet, structure, plateforme…"
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchRefs()}
              />
              <Button size="sm" onClick={searchRefs}>Rechercher</Button>
            </div>
            {refs.length === 0 ? (
              <p className="text-[13px] text-text-muted">
                Importez d&apos;abord le Excel de compilation pour peupler les références.
              </p>
            ) : (
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-white text-text-muted">
                    <tr>
                      <th className="py-1 pr-2 font-semibold">Projet</th>
                      <th className="py-1 pr-2 font-semibold">Structure</th>
                      <th className="py-1 pr-2 font-semibold">PF</th>
                      <th className="py-1 pr-2 font-semibold">NE / CAM</th>
                      <th className="py-1 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((r) => (
                      <tr key={r.id} className="border-t border-[#eef1f6]">
                        <td className="py-1.5 pr-2">{r.projet || r.document || '—'}</td>
                        <td className="py-1.5 pr-2">{r.structure || '—'}</td>
                        <td className="py-1.5 pr-2">{r.plateforme || '—'}</td>
                        <td className="py-1.5 pr-2 text-text-muted">
                          {r.NE ?? '—'} / {r.CAM ?? '—'}
                        </td>
                        <td className="py-1.5">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={imitatingId === r.id}
                            onClick={() => imitateFromRef(r)}
                          >
                            {imitatingId === r.id ? '…' : 'Imiter'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          </div>
        </div>

        <SectionCard
          title="Liste des calculs"
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
                placeholder="Filtrer…"
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
          ) : items.length === 0 ? (
            <p className="text-[13px] text-text-muted">Aucun calcul pour ces filtres.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="pb-2 pr-3 font-semibold">Référence</th>
                    <th className="pb-2 pr-3 font-semibold">Type</th>
                    <th className="pb-2 pr-3 font-semibold">Nom</th>
                    <th className="pb-2 pr-3 font-semibold">Affaire / Demande</th>
                    <th className="pb-2 pr-3 font-semibold">Statut</th>
                    <th className="pb-2 font-semibold">Maj</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-t border-[#eef1f6] hover:bg-[#f8fafc]"
                      onClick={() => openItem(item)}
                    >
                      <td className="py-2.5 pr-3 font-semibold text-[#003170]">{item.reference}</td>
                      <td className="py-2.5 pr-3">{TYPE_LABELS[item.type_calcul] || item.type_calcul}</td>
                      <td className="py-2.5 pr-3">{item.nom_calcul}</td>
                      <td className="py-2.5 pr-3 text-text-muted">
                        {[item.affaire_ref, item.demande_ref].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="py-2.5 pr-3">{item.statut}</td>
                      <td className="py-2.5 text-text-muted">{(item.updated_at || '').slice(0, 10)}</td>
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

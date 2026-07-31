import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import DemandeReferencePicker from '@/components/demande/DemandeReferencePicker'
import {
  AlizeCriteriaChart,
  AlizeLayersChart,
  AlizeResultsCompareChart,
  AlizeStructureStack,
} from '@/components/calcul/AlizeCharts'
import AlizeStructureEditor from '@/components/calcul/AlizeStructureEditor'
import { calculsApi, getApiErrorMessage } from '@/services/api'

/** Onglets alignés Alizé2 routier (doc utilisateur 2.2.2). */
const TABS = [
  { id: 'general', label: 'Général' },
  { id: 'structure', label: 'Structure' },
  { id: 'charge', label: 'Charge' },
  { id: 'trafic', label: 'Trafic' },
  { id: 'plateforme', label: 'Plateforme' },
  { id: 'criteres', label: 'Valeurs admissibles' },
  { id: 'resultats', label: 'Résultats' },
  { id: 'synthese', label: 'Synthèse' },
]

const STATUTS = [
  'Brouillon',
  'Données incomplètes',
  'Prêt pour calcul',
  'Calcul en cours',
  'Résultats importés',
  'À vérifier',
  'Vérifié',
  'Validé',
  'Archivé',
  'Annulé',
  'À recalculer',
]

const CHARGE_TYPES = [
  { id: 'jumelage_fr', label: 'Jumelage standard FR (NF P98-086)' },
  { id: 'autre_jumelage', label: 'Autre jumelage' },
  { id: 'roue_isolee', label: 'Roue isolée' },
]

function emptyLayer(ordre = 1) {
  return {
    ordre,
    fonction: '',
    materiau: '',
    famille: 'bitumineux',
    classe: '',
    formulation: '',
    epaisseur: null,
    unite: 'cm',
    module: null,
    poisson: 0.35,
    temperature_calcul: 15,
    frequence: 10,
    bibliotheque: 'NF P98-086 2019',
    assise: ordre > 1,
    interface_sup: '',
    interface_inf: 'collé',
    lie: false,
    from_library: false,
    modified_manually: false,
    justification: '',
    commentaire: '',
  }
}

function emptyCriterion() {
  return {
    critere: '',
    materiau: '',
    couche: '',
    profondeur: '',
    valeur_admissible: null,
    valeur_calculee: null,
    unite: 'µdéf',
    marge: null,
    consommation: null,
    sens_verification: 'inferieur_ou_egal',
    statut: 'Non renseigné',
    commentaire: '',
  }
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </label>
  )
}

function numOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Estimation PL cumulés + NE (aide imitation, pas le moteur Alizé). */
function estimateTrafficStats(traffic) {
  const mja = numOrNull(traffic.mja_pl)
  const growthPct = numOrNull(traffic.croissance_pct)
  const years = numOrNull(traffic.duree_ans)
  const cam = numOrNull(traffic.cam)
  const mode = traffic.progression || 'geometrique'
  let npl = null
  if (mja != null && years != null && years > 0) {
    const tau = (growthPct || 0) / 100
    if (mode === 'arithmetique') {
      npl = mja * 365 * years * (1 + ((years - 1) * tau) / 2)
    } else if (!tau) {
      npl = mja * 365 * years
    } else {
      npl = mja * 365 * ((Math.pow(1 + tau, years) - 1) / tau)
    }
  }
  const ne = npl != null && cam != null ? npl * cam : null
  return {
    npl: npl != null ? Math.round(npl) : null,
    ne: ne != null ? Math.round(ne) : null,
  }
}

export default function CalculAlizePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const calcId = Number(id)
  const [tab, setTab] = useState('general')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [meta, setMeta] = useState({
    nom_calcul: '',
    statut: 'Brouillon',
    ouvrage: '',
    zone_label: '',
    auteur: '',
    calculateur: '',
    verificateur: '',
    validateur: '',
    affaire_rst_id: null,
    demande_id: null,
    mission_id: null,
  })
  const [demandePicker, setDemandePicker] = useState('')
  const [traffic, setTraffic] = useState({})
  const [platform, setPlatform] = useState({})
  const [params, setParams] = useState({})
  const [results, setResults] = useState({})
  const [layers, setLayers] = useState([])
  const [criteria, setCriteria] = useState([])
  const [refSearch, setRefSearch] = useState('')
  const [refs, setRefs] = useState([])
  const [applyingRef, setApplyingRef] = useState(false)
  const [catalogs, setCatalogs] = useState(null)
  const [runningReglementaire, setRunningReglementaire] = useState(false)
  const [runningCalcul, setRunningCalcul] = useState(false)

  function hydrateFromDetail(row) {
    setDetail(row)
    setMeta({
      nom_calcul: row.nom_calcul || '',
      statut: row.statut || 'Brouillon',
      ouvrage: row.ouvrage || '',
      zone_label: row.zone_label || '',
      auteur: row.auteur || '',
      calculateur: row.calculateur || '',
      verificateur: row.verificateur || '',
      validateur: row.validateur || '',
      affaire_rst_id: row.affaire_rst_id ?? null,
      demande_id: row.demande_id ?? null,
      mission_id: row.mission_id ?? null,
    })
    setDemandePicker(row.demande_ref || '')
    const alize = row.alize || {}
    setTraffic(alize.traffic || {})
    setPlatform(alize.platform || {})
    setParams(alize.params || {})
    setResults(alize.results || {})
    setLayers(Array.isArray(alize.layers) && alize.layers.length ? alize.layers : [emptyLayer(1)])
    setCriteria(Array.isArray(alize.criteria) ? alize.criteria : [])
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const row = await calculsApi.get(calcId)
      hydrateFromDetail(row)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chargement impossible'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!Number.isFinite(calcId)) return
    load()
  }, [calcId])

  useEffect(() => {
    calculsApi.catalogs()
      .then((data) => setCatalogs(data || null))
      .catch(() => setCatalogs(null))
  }, [])

  const readiness = detail?.readiness || {}
  const imitationNote = detail?.general?.note || traffic?.commentaire || ''
  const trafficEstimate = useMemo(() => estimateTrafficStats(traffic), [traffic])
  const materials = catalogs?.materials || []
  const plateformes = catalogs?.plateformes || []
  const structureTemplates = catalogs?.structure_templates || []
  const camPresets = catalogs?.cam_presets || []
  const risquePresets = catalogs?.risque_presets || []
  const criterionPresets = catalogs?.criterion_presets || []

  function applyStructureTemplate(label) {
    const tpl = structureTemplates.find((t) => t.label === label)
    if (!tpl) return
    if (!window.confirm(`Charger la structure type « ${label} » ? Cela remplace les couches actuelles.`)) return
    const nextLayers = (tpl.layers || []).map((layer, index) => ({
      ...emptyLayer(index + 1),
      ...layer,
      ordre: layer.ordre || index + 1,
      from_library: true,
      justification: `Structure type Excel · ${label}`,
    }))
    setLayers(nextLayers.length ? nextLayers : [emptyLayer(1)])
    if (tpl.plateforme) {
      const pf = plateformes.find((p) => p.classe === tpl.plateforme)
      setPlatform({
        ...platform,
        classe: tpl.plateforme,
        module_pf: pf?.module != null ? Math.round(Number(pf.module)) : platform.module_pf,
        source: 'Structure type Excel',
      })
    }
    if (tpl.traffic_hint?.cam != null) {
      setTraffic((prev) => ({ ...prev, cam: tpl.traffic_hint.cam }))
    }
    if (tpl.traffic_hint?.risque != null) {
      setTraffic((prev) => ({ ...prev, risque: tpl.traffic_hint.risque }))
    }
    setInfo(`Structure type « ${label} » chargée`)
    setTab('structure')
  }

  function applyPlateformeClasse(classe) {
    const pf = plateformes.find((p) => p.classe === classe)
    setPlatform({
      ...platform,
      classe,
      module_pf: pf?.module != null ? Math.round(Number(pf.module)) : platform.module_pf,
      poisson: platform.poisson || catalogs?.defaults?.poisson || 0.35,
      source: platform.source || 'Catalogue PF',
    })
  }

  function addCriterionPreset(preset) {
    setCriteria([
      ...criteria,
      {
        ...emptyCriterion(),
        critere: preset.critere,
        unite: preset.unite || 'µdéf',
        sens_verification: preset.sens_verification || 'inferieur_ou_egal',
        commentaire: `Préréglage ${preset.label || preset.critere}`,
      },
    ])
  }

  async function searchRefs() {
    try {
      const rows = await calculsApi.searchReferences({ search: refSearch.trim(), limit: 20 })
      setRefs(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Recherche références impossible'))
    }
  }

  async function applyRef(refId) {
    if (!window.confirm('Remplacer trafic / plateforme / structure / résultats par cette référence Excel ?')) return
    setApplyingRef(true)
    setError('')
    setInfo('')
    try {
      const row = await calculsApi.applyReference(calcId, {
        ref_etude_id: refId,
        replace_existing: true,
      })
      hydrateFromDetail(row)
      setInfo('Référence Excel appliquée (imitation Alizé)')
      setTab('synthese')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Application référence impossible'))
    } finally {
      setApplyingRef(false)
    }
  }
  async function saveAll() {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await calculsApi.update(calcId, {
        nom_calcul: meta.nom_calcul,
        statut: meta.statut,
        ouvrage: meta.ouvrage,
        zone_label: meta.zone_label,
        auteur: meta.auteur,
        calculateur: meta.calculateur,
        verificateur: meta.verificateur,
        validateur: meta.validateur,
        affaire_rst_id: meta.affaire_rst_id,
        demande_id: meta.demande_id,
        mission_id: meta.mission_id,
      })
      const row = await calculsApi.updateAlize(calcId, {
        traffic,
        platform,
        params,
        results,
        layers: layers.map((layer, index) => ({
          ...layer,
          ordre: layer.ordre || index + 1,
          epaisseur: numOrNull(layer.epaisseur),
          module: numOrNull(layer.module),
          poisson: numOrNull(layer.poisson),
          temperature_calcul: numOrNull(layer.temperature_calcul),
        })),
        criteria: criteria.map((c) => ({
          ...c,
          valeur_admissible: numOrNull(c.valeur_admissible),
          valeur_calculee: numOrNull(c.valeur_calculee),
          marge: numOrNull(c.marge),
          consommation: numOrNull(c.consommation),
        })),
      })
      setDetail(row)
      const alize = row.alize || {}
      setLayers(alize.layers?.length ? alize.layers : [emptyLayer(1)])
      setCriteria(alize.criteria || [])
      setInfo('Enregistré')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Enregistrement impossible'))
    } finally {
      setSaving(false)
    }
  }

  async function duplicate() {
    try {
      const copy = await calculsApi.duplicate(calcId)
      navigate(`/calculs/alize/${copy.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Duplication impossible'))
    }
  }

  async function openFiche() {
    try {
      await calculsApi.openFiche(calcId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Fiche impossible'))
    }
  }

  async function persistDraft() {
    await calculsApi.update(calcId, {
      nom_calcul: meta.nom_calcul,
      statut: meta.statut,
      ouvrage: meta.ouvrage,
      zone_label: meta.zone_label,
      auteur: meta.auteur,
      calculateur: meta.calculateur,
      verificateur: meta.verificateur,
      validateur: meta.validateur,
      affaire_rst_id: meta.affaire_rst_id,
      demande_id: meta.demande_id,
      mission_id: meta.mission_id,
    })
    await calculsApi.updateAlize(calcId, {
      traffic,
      platform,
      params,
      results,
      layers: layers.map((layer, index) => ({
        ...layer,
        ordre: layer.ordre || index + 1,
        epaisseur: numOrNull(layer.epaisseur),
        module: numOrNull(layer.module),
        poisson: numOrNull(layer.poisson),
        temperature_calcul: numOrNull(layer.temperature_calcul),
      })),
      criteria: criteria.map((c) => ({
        ...c,
        valeur_admissible: numOrNull(c.valeur_admissible),
        valeur_calculee: numOrNull(c.valeur_calculee),
        marge: numOrNull(c.marge),
        consommation: numOrNull(c.consommation),
      })),
    })
  }

  async function runReglementaire() {
    setRunningReglementaire(true)
    setError('')
    setInfo('')
    try {
      await persistDraft()
      const row = await calculsApi.runReglementaire(calcId)
      hydrateFromDetail(row)
      const report = row?.alize?.results?.reglementaire_report || {}
      const neLabel = report.ne ?? row?.alize?.results?.ne ?? '—'
      setInfo(`Etape 1 terminée — NE = ${neLabel} · VA εt/εz recalculées`)
      setTab('criteres')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Calcul réglementaire impossible'))
    } finally {
      setRunningReglementaire(false)
    }
  }

  async function runMecanique() {
    setRunningCalcul(true)
    setError('')
    setInfo('')
    try {
      await persistDraft()
      const row = await calculsApi.runMecanique(calcId)
      hydrateFromDetail(row)
      const epsT = row?.alize?.results?.epsT_calc
      const epsZ = row?.alize?.results?.epsZ_calc
      setInfo(`Etape 2 terminée — εt = ${epsT ?? '—'} µdéf · εz = ${epsZ ?? '—'} µdéf`)
      setTab('resultats')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Calcul mécanique impossible'))
    } finally {
      setRunningCalcul(false)
    }
  }

  async function runComplet() {
    setRunningCalcul(true)
    setError('')
    setInfo('')
    try {
      await persistDraft()
      const row = await calculsApi.runComplet(calcId)
      hydrateFromDetail(row)
      const res = row?.alize?.results || {}
      setInfo(
        `Calcul complet — NE = ${res.ne ?? '—'} · εt ${res.epsT_calc ?? '—'}/${res.epsT_adm ?? '—'} · `
        + `εz ${res.epsZ_calc ?? '—'}/${res.epsZ_adm ?? '—'} µdéf`
        + (res.conclusion ? ` · ${res.conclusion}` : ''),
      )
      setTab('resultats')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Calcul complet impossible'))
    } finally {
      setRunningCalcul(false)
    }
  }

  const busy = saving || runningReglementaire || runningCalcul

  const title = useMemo(
    () => detail?.reference || `Calcul #${calcId}`,
    [detail, calcId],
  )

  if (loading) {
    return (
      <FichePageShell>
        <FicheMain>
          <p className="text-[13px] text-text-muted">Chargement…</p>
        </FicheMain>
      </FichePageShell>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Calculs"
        onBack={() => navigate('/calculs')}
        eyebrow="Alizé"
        title={title}
        subtitle={`${meta.nom_calcul || 'Sans nom'} · ${meta.statut}`}
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={duplicate}>Dupliquer</Button>
          <Button size="sm" onClick={openFiche}>Fiche HTML</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={runComplet}>
            {runningCalcul ? 'Calcul…' : 'Lancer calcul complet'}
          </Button>
          <Button size="sm" disabled={busy} onClick={saveAll}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </FicheTopbar>

      <FicheMain>
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>
        ) : null}
        {info ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{info}</div>
        ) : null}

        {detail?.general?.origin === 'imitation_ref_excel' || traffic?.origin === 'imitation_ref_excel' ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            Mode imitation Excel — valeurs historiques pour travailler avant le vrai Alizé.
            {imitationNote ? <div className="mt-1 text-[12px] opacity-90">{imitationNote}</div> : null}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                tab === t.id
                  ? 'border-[#003170] bg-[#003170] text-white'
                  : 'border-[#dbe1ea] bg-white text-[#475569] hover:border-[#003170]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' ? (
          <div className="space-y-4">
          <SectionCard title="Identification">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Nom du calcul">
                <Input value={meta.nom_calcul} onChange={(e) => setMeta({ ...meta, nom_calcul: e.target.value })} />
              </Field>
              <Field label="Statut">
                <Select value={meta.statut} onChange={(e) => setMeta({ ...meta, statut: e.target.value })} className="w-full">
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Ouvrage">
                <Input value={meta.ouvrage} onChange={(e) => setMeta({ ...meta, ouvrage: e.target.value })} />
              </Field>
              <Field label="Zone">
                <Input value={meta.zone_label} onChange={(e) => setMeta({ ...meta, zone_label: e.target.value })} />
              </Field>
              <Field label="Auteur">
                <Input value={meta.auteur} onChange={(e) => setMeta({ ...meta, auteur: e.target.value })} />
              </Field>
              <Field label="Calculateur">
                <Input value={meta.calculateur} onChange={(e) => setMeta({ ...meta, calculateur: e.target.value })} />
              </Field>
              <Field label="Vérificateur">
                <Input value={meta.verificateur} onChange={(e) => setMeta({ ...meta, verificateur: e.target.value })} />
              </Field>
              <Field label="Validateur">
                <Input value={meta.validateur} onChange={(e) => setMeta({ ...meta, validateur: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 text-[13px] text-text-muted md:grid-cols-2">
              <div>Affaire : <strong className="text-text">{detail?.affaire_ref || '—'}</strong> · {detail?.chantier || '—'}</div>
              <div>Demande : <strong className="text-text">{detail?.demande_ref || '—'}</strong></div>
              <div>Client : {detail?.client || '—'}</div>
              <div>Indice {detail?.indice} · v{detail?.version}</div>
              {meta.mission_id ? <div>Mission G3 id : {meta.mission_id}</div> : null}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Lier à une demande RST">
                <DemandeReferencePicker
                  value={demandePicker}
                  onChange={setDemandePicker}
                  onSelect={(row) => {
                    setDemandePicker(row.reference)
                    setMeta({
                      ...meta,
                      demande_id: Number(row.uid) || null,
                      affaire_rst_id: row.affaire_rst_id != null ? Number(row.affaire_rst_id) : meta.affaire_rst_id,
                      ouvrage: meta.ouvrage || row.chantier || '',
                    })
                  }}
                  placeholder="Référence demande…"
                />
              </Field>
              <div className="flex flex-wrap items-end gap-2">
                {meta.affaire_rst_id ? (
                  <Button size="sm" onClick={() => navigate(`/affaires/${meta.affaire_rst_id}`)}>Ouvrir affaire</Button>
                ) : null}
                {meta.demande_id ? (
                  <Button size="sm" onClick={() => navigate(`/demandes/${meta.demande_id}`)}>Ouvrir demande</Button>
                ) : null}
                {meta.mission_id ? (
                  <Button size="sm" onClick={() => navigate(`/g3/missions/${meta.mission_id}`)}>Ouvrir G3</Button>
                ) : null}
                {(meta.demande_id || meta.affaire_rst_id || meta.mission_id) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setMeta({ ...meta, demande_id: null, affaire_rst_id: null, mission_id: null })
                      setDemandePicker('')
                    }}
                  >
                    Délier
                  </Button>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Partir d’une référence Excel (imitation)">
            <p className="mb-3 text-[13px] text-text-muted">
              Remplit trafic, plateforme, couches, critères et résultats à partir d&apos;une étude historique
              pour simuler un Alizé avant le calcul réel.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <Input
                className="min-w-[200px] flex-1"
                placeholder="Projet, structure…"
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchRefs()}
              />
              <Button size="sm" onClick={searchRefs}>Rechercher</Button>
            </div>
            {refs.length > 0 ? (
              <div className="max-h-44 overflow-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-white text-text-muted">
                    <tr>
                      <th className="py-1 pr-2 font-semibold">Projet</th>
                      <th className="py-1 pr-2 font-semibold">Structure</th>
                      <th className="py-1 pr-2 font-semibold">PF</th>
                      <th className="py-1 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((r) => (
                      <tr key={r.id} className="border-t border-[#eef1f6]">
                        <td className="py-1.5 pr-2">{r.projet || r.document || '—'}</td>
                        <td className="py-1.5 pr-2">{r.structure || '—'}</td>
                        <td className="py-1.5 pr-2">{r.plateforme || '—'}</td>
                        <td className="py-1.5">
                          <Button size="sm" disabled={applyingRef} onClick={() => applyRef(r.id)}>
                            Appliquer
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </SectionCard>
          </div>
        ) : null}

        {tab === 'trafic' ? (
          <SectionCard title="Trafic PL (Alizé2)">
            <p className="mb-3 text-[13px] text-text-muted">
              Saisie directe du NE, ou estimation à partir de MJA / accroissement / durée (aide RaLab — à valider hors Alizé).
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Progression">
                <Select
                  className="w-full"
                  value={traffic.progression || 'geometrique'}
                  onChange={(e) => setTraffic({ ...traffic, progression: e.target.value })}
                >
                  <option value="geometrique">Géométrique</option>
                  <option value="arithmetique">Arithmétique</option>
                </Select>
              </Field>
              {[
                ['mja_pl', 'MJA PL'],
                ['croissance_pct', 'Accroissement annuel %'],
                ['duree_ans', 'Durée de service (ans)'],
                ['cam', 'CAM'],
                ['ne_calcule', 'NE calculé'],
                ['ne_retenu', 'NE retenu'],
                ['risque', 'Risque %'],
                ['classe_trafic', 'Classe trafic'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    value={traffic[key] ?? ''}
                    onChange={(e) => setTraffic({ ...traffic, [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Commentaire">
                <Textarea
                  rows={2}
                  value={traffic.commentaire ?? ''}
                  onChange={(e) => setTraffic({ ...traffic, commentaire: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-[11px] font-semibold uppercase text-text-muted self-center">CAM :</span>
              {camPresets.map((v) => (
                <Button key={`cam-${v}`} size="sm" onClick={() => setTraffic({ ...traffic, cam: v })}>{v}</Button>
              ))}
              <span className="ml-2 text-[11px] font-semibold uppercase text-text-muted self-center">Risque % :</span>
              {risquePresets.map((v) => (
                <Button key={`risque-${v}`} size="sm" onClick={() => setTraffic({ ...traffic, risque: v })}>{v}</Button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#e5e9f0] bg-[#f8fafc] px-4 py-3 text-[13px]">
              <div>PL cumulés estimés : <strong>{trafficEstimate.npl ?? '—'}</strong></div>
              <div>NE estimé (PL×CAM) : <strong>{trafficEstimate.ne ?? '—'}</strong></div>
              <Button
                size="sm"
                disabled={trafficEstimate.ne == null}
                onClick={() => setTraffic({
                  ...traffic,
                  ne_calcule: trafficEstimate.ne,
                  ne_retenu: traffic.ne_retenu || trafficEstimate.ne,
                })}
              >
                Appliquer NE estimé
              </Button>
            </div>
          </SectionCard>
        ) : null}

        {tab === 'charge' ? (
          <SectionCard title="Charge de référence (Alizé2)">
            <p className="mb-3 text-[13px] text-text-muted">
              Par défaut : jumelage standard français (0,662 MPa · entraxe 0,375 m).
              Utilisé par le moteur mécanique RaLab (Etape 2).
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Type de charge">
                <Select
                  className="w-full"
                  value={params.charge_type || 'jumelage_fr'}
                  onChange={(e) => setParams({ ...params, charge_type: e.target.value })}
                >
                  {CHARGE_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              {[
                ['charge_rayon', 'Rayon (m)'],
                ['charge_pression', 'Pression (MPa)'],
                ['charge_poids_roue', 'Poids / roue (kN)'],
                ['charge_entraxe', 'Entraxe jumelage (m)'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    value={params[key] ?? ''}
                    onChange={(e) => setParams({ ...params, [key]: e.target.value })}
                    disabled={(params.charge_type || 'jumelage_fr') === 'jumelage_fr'}
                  />
                </Field>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {tab === 'plateforme' ? (
          <SectionCard title="Plateforme">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Classe PF (catalogue)">
                <Select
                  className="w-full"
                  value={platform.classe || ''}
                  onChange={(e) => applyPlateformeClasse(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {plateformes.map((pf) => (
                    <option key={pf.classe} value={pf.classe}>
                      {pf.classe}{pf.module != null ? ` · ${Math.round(Number(pf.module))} MPa` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              {[
                ['classe', 'Classe PF (libre)'],
                ['module_pf', 'Module PF (MPa)'],
                ['ev2', 'EV2'],
                ['poisson', 'Poisson'],
                ['source', 'Source'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    value={platform[key] ?? ''}
                    onChange={(e) => setPlatform({ ...platform, [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Commentaire">
                <Textarea
                  rows={2}
                  value={platform.commentaire ?? ''}
                  onChange={(e) => setPlatform({ ...platform, commentaire: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Température calcul (°C)">
                <Input
                  value={params.temperature ?? ''}
                  onChange={(e) => setParams({ ...params, temperature: e.target.value })}
                />
              </Field>
              <Field label="Logiciel / version">
                <Input
                  value={params.logiciel ?? ''}
                  onChange={(e) => setParams({ ...params, logiciel: e.target.value })}
                />
              </Field>
              <Field label="Norme / guide">
                <Input
                  value={params.norme ?? ''}
                  onChange={(e) => setParams({ ...params, norme: e.target.value })}
                />
              </Field>
            </div>
          </SectionCard>
        ) : null}

        {tab === 'structure' ? (
          <div className="space-y-4">
            <SectionCard
              title="Structure (schéma Alizé)"
              actions={(
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    onClick={() => setLayers([...layers, emptyLayer(layers.length + 1)])}
                  >
                    + Couche
                  </Button>
                </div>
              )}
            >
              <p className="mb-3 text-[13px] text-text-muted">
                Comme Alizé2 (§3.2.1) : cliquer une couche pour éditer · glisser le bord bas pour l’épaisseur ·
                cliquer l’interface pour collé / semi-collé / glissant · bibliothèque + assise + T°/Hz.
              </p>
              <div className="mb-3">
                <Select
                  className="w-full max-w-xl"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) applyStructureTemplate(e.target.value)
                    e.target.value = ''
                  }}
                >
                  <option value="">Charger une structure type (bibliothèque Excel)…</option>
                  {structureTemplates.map((tpl) => (
                    <option key={tpl.label} value={tpl.label}>
                      {tpl.label}{tpl.usage_count ? ` · ×${tpl.usage_count}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <AlizeStructureEditor
                layers={layers}
                platform={platform}
                params={params}
                catalogs={catalogs}
                onChangeLayers={setLayers}
                onChangePlatform={setPlatform}
                onChangeParams={setParams}
              />
            </SectionCard>
            <SectionCard title="Graphique couches">
              <AlizeLayersChart layers={layers} />
            </SectionCard>
          </div>
        ) : null}

        {tab === 'resultats' ? (
          <div className="space-y-4">
            <SectionCard title="Résultats">
              <p className="mb-3 text-[13px] text-text-muted">
                Etape 1 : NE + VA εt/εz (NF P98-086). Etape 2 : sollicitations multicouche (jumelage FR).
                Les références Excel restent disponibles pour calibration.
              </p>
              {results.origin === 'ralab_complet_v1' || results.origin === 'ralab_mecanique_v1' || results.origin === 'ralab_reglementaire_v1' ? (
                <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
                  Moteur : {results.origin}
                  {results.ne != null ? ` · NE = ${results.ne}` : ''}
                  {results.epsT_calc != null ? ` · εt = ${results.epsT_calc}` : ''}
                  {results.epsZ_calc != null ? ` · εz = ${results.epsZ_calc}` : ''} µdéf
                </div>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={runComplet}>
                  {runningCalcul ? 'Calcul…' : 'Calcul complet (1+2)'}
                </Button>
                <Button size="sm" disabled={busy} onClick={runMecanique}>Etape 2 seule</Button>
                <Button size="sm" disabled={busy} onClick={runReglementaire}>Etape 1 seule (VA)</Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {[
                  ['epsT_adm', 'εt adm (µdéf)'],
                  ['epsT_calc', 'εt calc (µdéf)'],
                  ['epsZ_adm', 'εz adm (µdéf)'],
                  ['epsZ_calc', 'εz calc (µdéf)'],
                  ['sigmaT', 'σt (MPa)'],
                  ['sigmaZ', 'σz (MPa)'],
                  ['conclusion', 'Conclusion'],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input
                      value={results[key] ?? ''}
                      onChange={(e) => setResults({ ...results, [key]: e.target.value })}
                    />
                  </Field>
                ))}
                <Field label="Observations">
                  <Textarea
                    rows={3}
                    value={results.observations ?? ''}
                    onChange={(e) => setResults({ ...results, observations: e.target.value })}
                  />
                </Field>
              </div>
            </SectionCard>
            <SectionCard title="Comparaison dynamique calc / admissible">
              <AlizeResultsCompareChart results={results} criteria={criteria} />
            </SectionCard>
          </div>
        ) : null}

        {tab === 'criteres' ? (
          <div className="space-y-4">
            <SectionCard
              title="Valeurs admissibles / critères"
              actions={(
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={runComplet}
                  >
                    {runningCalcul ? 'Calcul…' : 'Calcul complet'}
                  </Button>
                  <Button size="sm" disabled={busy} onClick={runReglementaire}>
                    {runningReglementaire ? 'VA…' : 'VA seule'}
                  </Button>
                  {criterionPresets.map((preset) => (
                    <Button key={preset.critere} size="sm" onClick={() => addCriterionPreset(preset)}>
                      + {preset.label || preset.critere}
                    </Button>
                  ))}
                  <Button size="sm" onClick={() => setCriteria([...criteria, emptyCriterion()])}>
                    + Libre
                  </Button>
                </div>
              )}
            >
              {criteria.length === 0 ? (
                <p className="text-[13px] text-text-muted">Aucun critère. Ajoutez εt, εz, σt…</p>
              ) : (
                <div className="space-y-3">
                  {criteria.map((crit, index) => (
                    <div key={crit.id || `c-${index}`} className="rounded-xl border border-[#e5e9f0] p-3">
                      <div className="mb-2 flex justify-between">
                        <div className="text-[12px] font-black uppercase tracking-wide text-[#003170]">
                          {crit.critere || `Critère ${index + 1}`}
                          {crit.statut ? ` · ${crit.statut}` : ''}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setCriteria(criteria.filter((_, i) => i !== index))}>
                          Retirer
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
                        {[
                          ['critere', 'Critère'],
                          ['materiau', 'Matériau'],
                          ['couche', 'Couche'],
                          ['valeur_admissible', 'Admissible'],
                          ['valeur_calculee', 'Calculé'],
                          ['unite', 'Unité'],
                        ].map(([key, label]) => (
                          <Field key={key} label={label}>
                            <Input
                              value={crit[key] ?? ''}
                              onChange={(e) => {
                                const next = [...criteria]
                                next[index] = { ...crit, [key]: e.target.value }
                                setCriteria(next)
                              }}
                            />
                          </Field>
                        ))}
                        <Field label="Sens">
                          <Select
                            className="w-full"
                            value={crit.sens_verification || 'inferieur_ou_egal'}
                            onChange={(e) => {
                              const next = [...criteria]
                              next[index] = { ...crit, sens_verification: e.target.value }
                              setCriteria(next)
                            }}
                          >
                            <option value="inferieur_ou_egal">≤ admissible</option>
                            <option value="superieur_ou_egal">≥ admissible</option>
                          </Select>
                        </Field>
                      </div>
                      {(crit.marge != null || crit.consommation != null) ? (
                        <div className="mt-2 text-[12px] text-text-muted">
                          Marge : {crit.marge ?? '—'} · Consommation : {crit.consommation != null ? `${(Number(crit.consommation) * 100).toFixed(1)} %` : '—'}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            <SectionCard title="Consommation des critères">
              <AlizeCriteriaChart criteria={criteria} />
            </SectionCard>
          </div>
        ) : null}

        {tab === 'synthese' ? (
          <div className="space-y-4">
            <SectionCard title="Préparation au calcul">
              {readiness.ready ? (
                <p className="text-[13px] text-emerald-700">Données minimales présentes — prêt pour calcul complet (VA + mécanique).</p>
              ) : (
                <div>
                  <p className="mb-2 text-[13px] text-amber-800">Éléments manquants :</p>
                  <ul className="list-disc pl-5 text-[13px] text-text-muted">
                    {(readiness.missing || []).map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={runComplet}>
                  {runningCalcul ? 'Calcul…' : 'Lancer calcul complet'}
                </Button>
                <Button size="sm" disabled={busy} onClick={runReglementaire}>Etape 1 (VA)</Button>
                <Button size="sm" disabled={busy} onClick={runMecanique}>Etape 2 (mécanique)</Button>
              </div>
            </SectionCard>
            <SectionCard title="Rappel">
              <div className="grid grid-cols-1 gap-2 text-[13px] md:grid-cols-2">
                <div>Trafic NE : {traffic.ne_retenu || traffic.ne_calcule || trafficEstimate.ne || '—'}</div>
                <div>CAM / risque : {traffic.cam || '—'} / {traffic.risque || '—'}</div>
                <div>Charge : {CHARGE_TYPES.find((c) => c.id === (params.charge_type || 'jumelage_fr'))?.label}</div>
                <div>Plateforme : {platform.classe || '—'} · {platform.module_pf || '—'} MPa</div>
                <div>Couches : {layers.filter((l) => l.materiau).length}</div>
                <div>Critères : {criteria.length}</div>
                <div>Conclusion : {results.conclusion || '—'}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={busy} onClick={saveAll}>Enregistrer</Button>
                <Button size="sm" onClick={openFiche}>Ouvrir fiche HTML</Button>
              </div>
            </SectionCard>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard
                title="Schéma"
                actions={(
                  <Button size="sm" onClick={() => setTab('structure')}>Éditer la structure</Button>
                )}
              >
                <AlizeStructureStack layers={layers} platform={platform} />
                <p className="mt-2 text-[12px] text-text-muted">
                  Pour modifier épaisseurs / matériaux / interfaces : onglet Structure.
                </p>
              </SectionCard>
              <SectionCard title="Critères">
                <AlizeCriteriaChart criteria={criteria} />
              </SectionCard>
              <SectionCard title="Couches">
                <AlizeLayersChart layers={layers} />
              </SectionCard>
              <SectionCard title="Résultats">
                <AlizeResultsCompareChart results={results} criteria={criteria} />
              </SectionCard>
            </div>
          </div>
        ) : null}
      </FicheMain>
    </FichePageShell>
  )
}

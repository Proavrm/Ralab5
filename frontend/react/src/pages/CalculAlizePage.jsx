import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import DemandeReferencePicker from '@/components/demande/DemandeReferencePicker'
import {
  AlizeCriteriaChart,
  AlizeResultsCompareChart,
} from '@/components/calcul/AlizeCharts'
import AlizeStructureEditor from '@/components/calcul/AlizeStructureEditor'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { calculsApi, getApiErrorMessage } from '@/services/api'

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

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-[10px] text-text-muted">{hint}</span> : null}
    </label>
  )
}

function numOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function classeTraficFromMja(mjaPl) {
  const mja = numOrNull(mjaPl)
  if (mja == null || mja < 0) return null
  // Classes catalogue / pratique courante (MJA PL / j / sens, voie la plus chargée)
  if (mja < 25) return 'T5'
  if (mja < 50) return 'T4'
  if (mja < 150) return 'T3'
  if (mja < 300) return 'T2'
  if (mja < 750) return 'T1'
  if (mja < 2000) return 'T0'
  if (mja < 5000) return 'TS'
  return 'Texp'
}

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
    classe: classeTraficFromMja(mja),
  }
}

function formatUdef(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? `${n.toFixed(1)} µdéf` : String(v)
}

function avisFromResults(results, criteria) {
  const fatigues = (criteria || []).filter((c) => String(c.critere || '').includes('epsilonT') || String(c.critere || '').includes('fatigue'))
  const pfs = (criteria || []).filter((c) => String(c.critere || '').includes('epsilonZ') || String(c.critere || '').includes('plateforme'))
  const consos = [...fatigues, ...pfs]
    .map((c) => (c.consommation != null ? Number(c.consommation) : null))
    .filter((x) => x != null && Number.isFinite(x))
  if (!consos.length) {
    if (results?.epsT_calc != null && results?.epsT_adm != null) {
      const t = Number(results.epsT_calc) / Number(results.epsT_adm)
      const z = results.epsZ_adm ? Number(results.epsZ_calc) / Number(results.epsZ_adm) : 0
      consos.push(t, z)
    }
  }
  if (!consos.length) return { label: 'INDICATIF', tone: 'info' }
  const max = Math.max(...consos)
  if (max <= 0.9) return { label: 'CONFORME', tone: 'ok' }
  if (max <= 1) return { label: 'LIMITE', tone: 'warn' }
  return { label: 'NON CONFORME', tone: 'bad' }
}

function avisSortRank(item) {
  const key = String(item?.avis || '').trim().toLowerCase()
  if (key === 'indicatif' || !key) return 0 // en tête : à traiter / pas encore calculé
  if (key === 'conforme') return 1
  if (key === 'limite') return 2
  if (key === 'non conforme') return 3
  return 0
}

function sortVariantsByAvis(items) {
  return [...(items || [])].sort((a, b) => {
    const ra = avisSortRank(a)
    const rb = avisSortRank(b)
    if (ra !== rb) return ra - rb
    const aa = a?.a_retenir ? 0 : 1
    const ab = b?.a_retenir ? 0 : 1
    if (aa !== ab) return aa - ab
    return String(a.nom_calcul || a.reference || '').localeCompare(
      String(b.nom_calcul || b.reference || ''),
      'fr',
    )
  })
}

function Chip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-[#003170] bg-[#003170] text-white'
          : 'border-[#dbe1ea] bg-white text-[#003170] hover:border-[#003170]/40'
      }`}
    >
      {children}
    </button>
  )
}

function AvisBadge({ avis }) {
  const tones = {
    ok: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warn: 'bg-amber-100 text-amber-900 border-amber-200',
    bad: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-sky-100 text-sky-900 border-sky-200',
  }
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${tones[avis.tone] || tones.info}`}>
      {avis.label}
    </span>
  )
}

function variantRowTone(item) {
  const avis = String(item?.avis || '').trim()
  const key = avis.toLowerCase()
  if (key === 'conforme') {
    return {
      row: 'border-l-[3px] border-l-emerald-500 bg-emerald-50/80',
      badge: 'bg-emerald-700 text-white',
      label: 'Conforme',
    }
  }
  if (key === 'limite') {
    return {
      row: 'border-l-[3px] border-l-amber-400 bg-amber-50/80',
      badge: 'bg-amber-600 text-white',
      label: 'Limite',
    }
  }
  if (key === 'non conforme') {
    return {
      row: 'border-l-[3px] border-l-red-500 bg-red-50/80',
      badge: 'bg-red-700 text-white',
      label: 'Non conforme',
    }
  }
  if (key === 'indicatif') {
    return {
      row: 'border-l-[3px] border-l-sky-400 bg-sky-50/70',
      badge: 'bg-sky-700 text-white',
      label: 'Indicatif',
    }
  }
  return {
    row: 'border-l-[3px] border-l-[#cfd7e4] bg-white',
    badge: 'bg-[#e8eef6] text-[#536079]',
    label: avis || '—',
  }
}

/** Dropdown variantes demande : ouvrir + accepter (accepté ⇒ impression). */
function VariantDropdown({
  currentId,
  items,
  onSelect,
  onToggleAccept,
  busyId,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const current = items.find((item) => Number(item.id) === Number(currentId))
  const currentTone = variantRowTone(current)
  const label = current
    ? `${current.a_retenir ? '★ ' : ''}${current.nom_calcul || current.reference}`
    : 'Variantes…'

  useEffect(() => {
    if (!open) return undefined
    function onDoc(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!items.length) return null

  return (
    <div ref={rootRef} className="relative min-w-[220px] max-w-[360px]">
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-2 rounded border px-2 py-1 text-left text-[12px] font-semibold ${
          current?.a_retenir
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
            : 'border-[#dbe1ea] bg-white text-[#003170]'
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{label}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${currentTone.badge}`}>
          {currentTone.label}
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 max-h-72 w-[min(420px,90vw)] overflow-auto rounded border border-[#dbe1ea] bg-white shadow-lg">
          <div className="border-b border-[#eef1f6] px-2 py-1.5 text-[10px] text-text-muted">
            ★ Accepté = retenu pour impression · badge = avis mécanique (Conforme / Limite / Non conforme)
          </div>
          {items.map((item, index) => {
            const active = Number(item.id) === Number(currentId)
            const accepted = Boolean(item.a_retenir)
            const tone = variantRowTone(item)
            const prevAvis = index > 0 ? String(items[index - 1]?.avis || '').trim() : null
            const avisLabel = String(item?.avis || '').trim() || 'Indicatif'
            const showGroup = index === 0 || avisLabel !== prevAvis
            return (
              <div key={item.id}>
                {showGroup ? (
                  <div className="sticky top-0 border-b border-[#eef1f6] bg-[#f8fafc] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-text-muted">
                    {avisLabel}
                  </div>
                ) : null}
                <div
                  className={`flex items-center gap-1 border-b border-[#f1f5f9] px-1.5 py-1 ${tone.row} ${
                    active ? 'ring-1 ring-inset ring-[#003170]/35' : ''
                  }`}
                >
                <button
                  type="button"
                  title={accepted ? 'Retirer l’acceptation' : 'Accepter (et imprimer)'}
                  disabled={busyId === item.id}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[14px] ${
                    accepted ? 'bg-emerald-700 text-[#ffcc00]' : 'border border-[#dbe1ea] bg-white text-[#94a3b8]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleAccept?.(item, !accepted)
                  }}
                >
                  ★
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-1 text-left text-[12px] font-semibold text-[#172033]"
                  onClick={() => {
                    setOpen(false)
                    if (!active) onSelect?.(item)
                  }}
                >
                  {item.nom_calcul || item.reference}
                </button>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tone.badge}`}>
                  {tone.label}
                </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default function CalculAlizePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = resolveReturnTo(searchParams, '')
  const calcId = Number(id)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [popup, setPopup] = useState(null)
  const [siblings, setSiblings] = useState([])
  const [acceptBusyId, setAcceptBusyId] = useState(null)

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
    a_retenir: false,
    nom_sortie: '',
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
  const [runningCalcul, setRunningCalcul] = useState(false)
  const engineRef = useRef({})
  const autoArmedRef = useRef(false)
  const skipAutoOnceRef = useRef(false)
  const lastEngineFpRef = useRef('')
  const autoRunSeqRef = useRef(0)

  function suggestedNomSortie(row, nomCalcul) {
    const parts = [
      row?.affaire_ref,
      row?.demande_ref,
      nomCalcul || row?.nom_calcul || row?.reference,
    ].filter(Boolean)
    return parts.join(' — ')
  }

  function engineFingerprintOf(payload) {
    return JSON.stringify({
      layers: payload.layers,
      traffic: payload.traffic,
      platform: payload.platform,
      params: payload.params,
    })
  }

  function currentEngineFingerprint() {
    return engineFingerprintOf(engineRef.current)
  }
  function hydrateFromDetail(row) {
    setDetail(row)
    const general = row.general || {}
    const nomCalcul = row.nom_calcul || ''
    setMeta({
      nom_calcul: nomCalcul,
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
      a_retenir: Boolean(general.a_retenir),
      nom_sortie: String(general.nom_sortie || '').trim() || suggestedNomSortie(row, nomCalcul),
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

  async function loadSiblings(demandeId) {
    if (!demandeId) {
      setSiblings([])
      return
    }
    try {
      const rows = await calculsApi.list({ demande_id: Number(demandeId) })
      setSiblings(Array.isArray(rows) ? rows : [])
    } catch {
      setSiblings([])
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const row = await calculsApi.get(calcId)
      hydrateFromDetail(row)
      await loadSiblings(row.demande_id)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chargement impossible'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!Number.isFinite(calcId)) return
    autoArmedRef.current = false
    skipAutoOnceRef.current = false
    lastEngineFpRef.current = ''
    autoRunSeqRef.current += 1
    load()
  }, [calcId])

  useEffect(() => {
    calculsApi.catalogs()
      .then((data) => setCatalogs(data || null))
      .catch(() => setCatalogs(null))
  }, [])

  engineRef.current = {
    meta,
    detail,
    traffic,
    platform,
    params,
    results,
    layers,
    criteria,
  }

  const engineFingerprint = useMemo(
    () => engineFingerprintOf({ layers, traffic, platform, params }),
    [layers, traffic, platform, params],
  )

  const trafficEstimate = useMemo(() => estimateTrafficStats(traffic), [traffic])
  const plateformes = catalogs?.plateformes || []
  const structureTemplates = catalogs?.structure_templates || []
  const camPresets = catalogs?.cam_presets || []
  const risquePresets = catalogs?.risque_presets || []
  const avis = useMemo(() => avisFromResults(results, criteria), [results, criteria])

  const structureLabel = useMemo(() => {
    const finite = layers.filter((l) => {
      const code = String(l.materiau || '').toUpperCase()
      return l.epaisseur != null && l.epaisseur !== '' && !code.startsWith('PF')
    })
    const parts = finite.map((l) => `${l.epaisseur} ${l.materiau || '?'}`.trim())
    const pf = platform.classe || layers.find((l) => String(l.materiau || '').toUpperCase().startsWith('PF'))?.materiau
    const ePf = platform.module_pf
    if (!parts.length) return meta.nom_calcul || 'Structure'
    return `${parts.join(' + ')}${pf ? ` sur ${pf}` : ''}${ePf ? ` — E = ${ePf} MPa` : ''}`
  }, [layers, platform, meta.nom_calcul])

  const backHref = useMemo(() => {
    if (returnTo) return returnTo
    if (meta.demande_id) {
      const params = new URLSearchParams({ demande_id: String(meta.demande_id) })
      if (meta.affaire_rst_id) params.set('affaire_rst_id', String(meta.affaire_rst_id))
      return `/calculs?${params}`
    }
    return '/calculs'
  }, [returnTo, meta.demande_id, meta.affaire_rst_id])

  const siblingOptions = useMemo(() => sortVariantsByAvis(siblings), [siblings])

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
    if (tpl.traffic_hint?.cam != null) setTraffic((prev) => ({ ...prev, cam: tpl.traffic_hint.cam }))
    if (tpl.traffic_hint?.risque != null) setTraffic((prev) => ({ ...prev, risque: tpl.traffic_hint.risque }))
    setInfo(`Structure type « ${label} » chargée`)
    setPopup(null)
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
      const row = await calculsApi.applyReference(calcId, { ref_etude_id: refId, replace_existing: true })
      skipAutoOnceRef.current = true
      hydrateFromDetail(row)
      setInfo('Référence Excel appliquée')
      setPopup(null)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Application référence impossible'))
    } finally {
      setApplyingRef(false)
    }
  }

  async function persistDraft() {
    const snap = engineRef.current
    const metaSnap = snap.meta || {}
    const detailSnap = snap.detail
    const trafficSnap = snap.traffic || {}
    const platformSnap = snap.platform || {}
    const paramsSnap = snap.params || {}
    const resultsSnap = snap.results || {}
    const layersSnap = snap.layers || []
    const criteriaSnap = snap.criteria || []
    await calculsApi.update(calcId, {
      nom_calcul: metaSnap.nom_calcul,
      statut: metaSnap.statut,
      ouvrage: metaSnap.ouvrage,
      zone_label: metaSnap.zone_label,
      auteur: metaSnap.auteur,
      calculateur: metaSnap.calculateur,
      verificateur: metaSnap.verificateur,
      validateur: metaSnap.validateur,
      affaire_rst_id: metaSnap.affaire_rst_id,
      demande_id: metaSnap.demande_id,
      mission_id: metaSnap.mission_id,
      general: {
        a_retenir: Boolean(metaSnap.a_retenir),
        // Accepté ⇒ imprimé (même flag dérivé)
        pour_impression: Boolean(metaSnap.a_retenir),
        nom_sortie: String(metaSnap.nom_sortie || '').trim() || suggestedNomSortie(detailSnap, metaSnap.nom_calcul),
      },
    })
    await calculsApi.updateAlize(calcId, {
      traffic: trafficSnap,
      platform: platformSnap,
      params: paramsSnap,
      results: resultsSnap,
      layers: layersSnap.map((layer, index) => ({
        ...layer,
        ordre: layer.ordre || index + 1,
        epaisseur: numOrNull(layer.epaisseur),
        module: numOrNull(layer.module),
        poisson: numOrNull(layer.poisson),
        temperature_calcul: numOrNull(layer.temperature_calcul),
        frequence: numOrNull(layer.frequence),
      })),
      criteria: criteriaSnap.map((c) => ({
        ...c,
        valeur_admissible: numOrNull(c.valeur_admissible),
        valeur_calculee: numOrNull(c.valeur_calculee),
        marge: numOrNull(c.marge),
        consommation: numOrNull(c.consommation),
      })),
    })
    if (metaSnap.demande_id) await loadSiblings(metaSnap.demande_id)
  }

  async function saveAll() {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await persistDraft()
      const row = await calculsApi.get(calcId)
      skipAutoOnceRef.current = true
      hydrateFromDetail(row)
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
      navigate(buildPathWithReturnTo(`/calculs/alize/${copy.id}`, backHref))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Duplication impossible'))
    }
  }

  async function openFiche() {
    try {
      await persistDraft()
      await calculsApi.openFiche(calcId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Fiche impossible'))
    }
  }

  async function downloadPdf() {
    try {
      await persistDraft()
      await calculsApi.downloadFichePdf(calcId)
      setInfo('PDF téléchargé')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Export PDF impossible'))
    }
  }

  async function runComplet({ auto = false } = {}) {
    const seq = autoRunSeqRef.current
    const fpStart = currentEngineFingerprint()
    setRunningCalcul(true)
    setError('')
    if (auto) setInfo('Recalcul automatique…')
    else setInfo('')
    try {
      await persistDraft()
      if (seq !== autoRunSeqRef.current) return
      const row = await calculsApi.runComplet(calcId)
      if (seq !== autoRunSeqRef.current) return
      if (currentEngineFingerprint() !== fpStart) {
        setInfo('Données modifiées pendant le calcul — nouveau calcul…')
        setRunningCalcul(false)
        await runComplet({ auto: true })
        return
      }
      skipAutoOnceRef.current = true
      lastEngineFpRef.current = fpStart
      hydrateFromDetail(row)
      const res = row?.alize?.results || {}
      setInfo(
        `${auto ? 'Auto' : 'Calcul'} — εt ${res.epsT_calc ?? '—'}/${res.epsT_adm ?? '—'} · εz ${res.epsZ_calc ?? '—'}/${res.epsZ_adm ?? '—'} µdéf`,
      )
      if (meta.demande_id || row.demande_id) await loadSiblings(meta.demande_id || row.demande_id)
    } catch (err) {
      if (seq === autoRunSeqRef.current) {
        setError(getApiErrorMessage(err, auto ? 'Recalcul automatique impossible' : 'Calcul complet impossible'))
      }
    } finally {
      if (seq === autoRunSeqRef.current) setRunningCalcul(false)
    }
  }

  useEffect(() => {
    if (loading) return undefined
    if (!Number.isFinite(calcId)) return undefined
    if (!autoArmedRef.current) {
      autoArmedRef.current = true
      skipAutoOnceRef.current = false
      lastEngineFpRef.current = engineFingerprint
      return undefined
    }
    if (skipAutoOnceRef.current) {
      skipAutoOnceRef.current = false
      lastEngineFpRef.current = engineFingerprint
      return undefined
    }
    if (engineFingerprint === lastEngineFpRef.current) return undefined

    const timer = setTimeout(() => {
      void runComplet({ auto: true })
    }, 800)
    return () => clearTimeout(timer)
  }, [engineFingerprint, loading, calcId])

  async function toggleAcceptVariant(item, accepted) {
    setAcceptBusyId(item.id)
    setError('')
    try {
      await calculsApi.update(item.id, {
        general: {
          a_retenir: accepted,
          pour_impression: accepted,
        },
      })
      setSiblings((rows) => rows.map((row) => (
        row.id === item.id
          ? { ...row, a_retenir: accepted, pour_impression: accepted }
          : row
      )))
      if (Number(item.id) === Number(calcId)) {
        setMeta((prev) => ({ ...prev, a_retenir: accepted }))
      }
      setInfo(accepted ? 'Variante acceptée (retenue pour impression)' : 'Acceptation retirée')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Mise à jour acceptation impossible'))
    } finally {
      setAcceptBusyId(null)
    }
  }

  const busy = saving || runningCalcul
  const title = useMemo(() => detail?.reference || `Calcul #${calcId}`, [detail, calcId])

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
        backLabel={meta.demande_id ? '← Calculs demande' : '← Calculs'}
        onBack={() => navigate(backHref)}
        eyebrow="Alizé"
        title={title}
        subtitle={`${meta.nom_calcul || 'Sans nom'} · ${meta.statut}${meta.a_retenir ? ' · ★ Accepté' : ''}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {siblingOptions.length > 0 ? (
            <VariantDropdown
              currentId={calcId}
              items={siblingOptions}
              busyId={acceptBusyId}
              onSelect={(item) => navigate(buildPathWithReturnTo(`/calculs/alize/${item.id}`, backHref))}
              onToggleAccept={toggleAcceptVariant}
            />
          ) : null}
          <Button size="sm" onClick={duplicate}>Dupliquer</Button>
          <Button size="sm" onClick={openFiche}>Fiche</Button>
          <Button size="sm" onClick={downloadPdf}>PDF</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => runComplet()} title="Recalcule aussi automatiquement après chaque modification">
            {runningCalcul ? 'Calcul…' : 'Calculer'}
          </Button>
          <Button size="sm" disabled={busy} onClick={saveAll}>
            {saving ? '…' : 'Enregistrer'}
          </Button>
        </div>
      </FicheTopbar>

      <FicheMain className="!gap-2.5 !px-4 !py-2.5">
        {error ? (
          <div className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700">{error}</div>
        ) : null}
        {info ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-800">{info}</div>
        ) : null}

        {/* Bandeau structure */}
        <div className="overflow-hidden rounded-lg border border-[#dbe1ea]">
          <div className="bg-[#003170] px-3 py-1.5 text-white">
            <div className="text-[13px] font-bold leading-snug">{structureLabel}</div>
            <div className="text-[10px] text-white/75">LCPC-Sétra · multicouche</div>
          </div>
          <div className="h-0.5 bg-[#ffcc00]" />
          <div className="flex flex-wrap items-center gap-1.5 bg-[#f8fafc] px-2 py-1.5">
            <Chip active={popup === 'general'} onClick={() => setPopup('general')}>Général</Chip>
            <Chip active={popup === 'trafic'} onClick={() => setPopup('trafic')}>
              Trafic · NE {traffic.ne_retenu || traffic.ne_calcule || trafficEstimate.ne || '—'}
            </Chip>
            <Chip active={popup === 'charge'} onClick={() => setPopup('charge')}>Charge</Chip>
            <Chip active={popup === 'plateforme'} onClick={() => setPopup('plateforme')}>
              PF {platform.classe || '—'}
            </Chip>
            <Chip active={popup === 'refs'} onClick={() => setPopup('refs')}>Réf. Excel</Chip>
            <div className="ml-auto">
              <AvisBadge avis={avis} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
          {/* Structure visuelle */}
          <SectionCard
            title="Structure"
            technical
            actions={(
              <Select
                className="max-w-xs text-[12px] py-1"
                value=""
                onChange={(e) => {
                  if (e.target.value) applyStructureTemplate(e.target.value)
                  e.target.value = ''
                }}
              >
                <option value="">Structure type…</option>
                {structureTemplates.map((tpl) => (
                  <option key={tpl.label} value={tpl.label}>
                    {tpl.label}{tpl.usage_count ? ` · ×${tpl.usage_count}` : ''}
                  </option>
                ))}
              </Select>
            )}
          >
            <p className="mb-2 text-[11px] text-text-muted">
              Clic = éditer · bord = épaisseur · interface = collé/semi/glissant/géotextile (granulaires : aucune/géotextile)
            </p>
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

          {/* Synthèse toujours visible */}
          <div className="space-y-2.5">
            <SectionCard title="Synthèse mécanique" technical>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] text-text-muted">Calc / admissible</div>
                <AvisBadge avis={avis} />
              </div>
              <div className="overflow-hidden rounded border border-[#dbe1ea]">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#f1f5f9] text-[10px] uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="px-2 py-1 font-semibold">Grandeur</th>
                      <th className="px-2 py-1 font-semibold">Calculé</th>
                      <th className="px-2 py-1 font-semibold">Admissible</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#e5e9f0]">
                      <td className="px-2 py-1 font-semibold text-[#003170]">εt</td>
                      <td className="px-2 py-1">{formatUdef(results.epsT_calc)}</td>
                      <td className="px-2 py-1">{formatUdef(results.epsT_adm)}</td>
                    </tr>
                    <tr className="border-t border-[#e5e9f0]">
                      <td className="px-2 py-1 font-semibold text-[#003170]">εz</td>
                      <td className="px-2 py-1">{formatUdef(results.epsZ_calc)}</td>
                      <td className="px-2 py-1">{formatUdef(results.epsZ_adm)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-2 rounded border border-[#dbe1ea] bg-[#f8fafc] px-2 py-1.5 text-[12px]">
                <div className="text-[11px] font-semibold text-[#003170]">Conclusion</div>
                <div className="mt-0.5 text-text-muted">{results.conclusion || 'Lancer le calcul pour obtenir l’avis.'}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => runComplet()}>
                  {runningCalcul ? 'Calcul…' : 'Calculer'}
                </Button>
                <Button size="sm" onClick={downloadPdf}>PDF</Button>
              </div>
            </SectionCard>

            <SectionCard title="Consommation des critères" technical>
              <AlizeCriteriaChart criteria={criteria} />
            </SectionCard>
            <SectionCard title="Comparaison dynamique" technical>
              <AlizeResultsCompareChart results={results} criteria={criteria} />
            </SectionCard>
          </div>
        </div>
      </FicheMain>

      {/* Popups */}
      <Modal open={popup === 'general'} onClose={() => setPopup(null)} title="Général / dossier" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Nom du calcul">
            <Input
              value={meta.nom_calcul}
              onChange={(e) => {
                const nom = e.target.value
                setMeta({
                  ...meta,
                  nom_calcul: nom,
                  nom_sortie: meta.nom_sortie || suggestedNomSortie(detail, nom),
                })
              }}
            />
          </Field>
          <Field label="Statut">
            <Select className="w-full" value={meta.statut} onChange={(e) => setMeta({ ...meta, statut: e.target.value })}>
              {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Nom de sortie (PDF / fiche)" hint="Utilisé pour le fichier exporté — pas un nom générique">
            <Input
              value={meta.nom_sortie}
              onChange={(e) => setMeta({ ...meta, nom_sortie: e.target.value })}
              placeholder={suggestedNomSortie(detail, meta.nom_calcul)}
            />
          </Field>
          <div className="flex items-end text-[12px] text-text-muted">
            {meta.a_retenir
              ? '★ Variante acceptée (retenue pour impression) — gérer dans la liste des variantes'
              : 'Non acceptée — marquer ★ dans la liste des variantes pour la retenir / imprimer'}
          </div>
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
          <Field label="Affaire RST id">
            <Input
              value={meta.affaire_rst_id ?? ''}
              onChange={(e) => setMeta({ ...meta, affaire_rst_id: numOrNull(e.target.value) })}
            />
          </Field>
          <Field label="Demande">
            <DemandeReferencePicker
              value={demandePicker}
              onChange={(ref, row) => {
                setDemandePicker(ref || '')
                setMeta({
                  ...meta,
                  demande_id: row?.id ?? null,
                  affaire_rst_id: row?.affaire_rst_id ?? meta.affaire_rst_id,
                })
              }}
            />
          </Field>
          <Field label="Mission G3 id">
            <Input
              value={meta.mission_id ?? ''}
              onChange={(e) => setMeta({ ...meta, mission_id: numOrNull(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setPopup(null)}>Fermer</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={async () => { await saveAll(); setPopup(null) }}>Enregistrer</Button>
        </div>
      </Modal>

      <Modal open={popup === 'trafic'} onClose={() => setPopup(null)} title="Trafic" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            ['mja_pl', 'MJA PL'],
            ['croissance_pct', 'Croissance %'],
            ['duree_ans', 'Durée (ans)'],
            ['cam', 'CAM'],
            ['risque', 'Risque %'],
            ['ne_retenu', 'NE retenu'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                value={traffic[key] ?? ''}
                onChange={(e) => {
                  const next = { ...traffic, [key]: e.target.value }
                  // Si MJA change et classe encore auto (ou vide) → recalculer
                  if (key === 'mja_pl' && traffic.classe_trafic_mode !== 'manuel') {
                    const estimated = classeTraficFromMja(e.target.value)
                    if (estimated) {
                      next.classe_trafic = estimated
                      next.classe_trafic_mode = 'calculee'
                    }
                  }
                  setTraffic(next)
                }}
              />
            </Field>
          ))}
          <Field
            label="Classe trafic"
            hint={
              trafficEstimate.classe
                ? `Estimée depuis MJA : ${trafficEstimate.classe} · ${traffic.classe_trafic_mode === 'manuel' ? 'saisie manuelle' : 'mode calculé'}`
                : 'Saisie manuelle ou estimée depuis MJA PL'
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="min-w-[7rem] flex-1"
                value={traffic.classe_trafic || ''}
                onChange={(e) => setTraffic({
                  ...traffic,
                  classe_trafic: e.target.value,
                  classe_trafic_mode: 'manuel',
                })}
              >
                <option value="">—</option>
                {['T5', 'T4', 'T3', 'T2', 'T1', 'T0', 'TS', 'Texp'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <Input
                className="min-w-[6rem] flex-1"
                placeholder="Libre…"
                value={traffic.classe_trafic ?? ''}
                onChange={(e) => setTraffic({
                  ...traffic,
                  classe_trafic: e.target.value,
                  classe_trafic_mode: 'manuel',
                })}
              />
            </div>
          </Field>
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
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {camPresets.map((v) => (
            <Button key={`cam-${v}`} size="sm" onClick={() => setTraffic({ ...traffic, cam: v })}>CAM {v}</Button>
          ))}
          {risquePresets.map((v) => (
            <Button key={`risque-${v}`} size="sm" onClick={() => setTraffic({ ...traffic, risque: v })}>Risque {v}%</Button>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2 text-[13px]">
          Estimation NPL ≈ {trafficEstimate.npl ?? '—'} · NE ≈ {trafficEstimate.ne ?? '—'}
          {trafficEstimate.classe ? ` · Classe ≈ ${trafficEstimate.classe}` : ''}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setTraffic({
                ...traffic,
                ne_calcule: trafficEstimate.ne ?? '',
                ne_retenu: traffic.ne_retenu || trafficEstimate.ne || '',
              })}
            >
              Appliquer NE estimé
            </Button>
            <Button
              size="sm"
              disabled={!trafficEstimate.classe}
              onClick={() => setTraffic({
                ...traffic,
                classe_trafic: trafficEstimate.classe,
                classe_trafic_mode: 'calculee',
              })}
            >
              Appliquer classe estimée
            </Button>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => setPopup(null)}>Fermer</Button>
        </div>
      </Modal>

      <Modal open={popup === 'charge'} onClose={() => setPopup(null)} title="Charge" size="md">
        <Field label="Type de charge">
          <Select
            className="w-full"
            value={params.charge_type || 'jumelage_fr'}
            onChange={(e) => setParams({ ...params, charge_type: e.target.value })}
          >
            {CHARGE_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            ['charge_rayon', 'Rayon (m)'],
            ['charge_pression', 'Pression (MPa)'],
            ['charge_poids_roue', 'Poids / roue (kN)'],
            ['charge_entraxe', 'Entraxe (m)'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                value={params[key] ?? ''}
                disabled={(params.charge_type || 'jumelage_fr') === 'jumelage_fr'}
                onChange={(e) => setParams({ ...params, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-text-muted">
          Jumelage FR par défaut : 0,662 MPa · entraxe 0,375 m (NF P98-086).
        </p>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => setPopup(null)}>Fermer</Button>
        </div>
      </Modal>

      <Modal open={popup === 'plateforme'} onClose={() => setPopup(null)} title="Plateforme" size="md">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Classe PF">
            <Select
              className="w-full"
              value={platform.classe || ''}
              onChange={(e) => {
                const pf = plateformes.find((p) => p.classe === e.target.value)
                setPlatform({
                  ...platform,
                  classe: e.target.value,
                  module_pf: pf?.module != null ? Math.round(Number(pf.module)) : platform.module_pf,
                  module_source: 'classe',
                  source: 'Catalogue PF',
                })
              }}
            >
              <option value="">Choisir…</option>
              {plateformes.map((pf) => (
                <option key={pf.classe} value={pf.classe}>
                  {pf.classe}{pf.module != null ? ` · E ${Math.round(Number(pf.module))} MPa` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Module E (MPa)" hint="Young — calcul (≠ EV2)">
            <Input
              value={platform.module_pf ?? ''}
              onChange={(e) => setPlatform({
                ...platform,
                module_pf: e.target.value,
                module_source: 'explicit',
              })}
            />
          </Field>
          <Field label="EV2 (MPa)" hint="Plaque / réception">
            <Input
              value={platform.ev2 ?? ''}
              onChange={(e) => {
                const ev2 = e.target.value
                const n = Number(ev2)
                const suggest = Number.isFinite(n) && n > 0 ? Math.round(n * 2) : platform.module_pf
                const auto = !platform.module_source || platform.module_source === 'from_ev2' || platform.module_source === 'auto'
                setPlatform({
                  ...platform,
                  ev2,
                  ...(auto ? { module_pf: suggest, module_source: 'from_ev2' } : {}),
                })
              }}
            />
          </Field>
          <Field label="Poisson">
            <Input
              value={platform.poisson ?? ''}
              onChange={(e) => setPlatform({ ...platform, poisson: e.target.value })}
            />
          </Field>
          <Field label="Source">
            <Input
              value={platform.source ?? ''}
              onChange={(e) => setPlatform({ ...platform, source: e.target.value })}
            />
          </Field>
          <Field label="Commentaire">
            <Textarea
              rows={2}
              value={platform.commentaire ?? ''}
              onChange={(e) => setPlatform({ ...platform, commentaire: e.target.value })}
            />
          </Field>
        </div>
        <p className="mt-2 text-[12px] text-text-muted">
          EV2 = réception chantier. Module E = Young du modèle multicouche (catalogue PF, ou ≈ 2×EV2 si seul l’EV2 est connu).
        </p>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => setPopup(null)}>Fermer</Button>
        </div>
      </Modal>

      <Modal open={popup === 'refs'} onClose={() => setPopup(null)} title="Références Excel (calibration)" size="lg">
        <div className="mb-3 flex gap-2">
          <Input
            className="flex-1"
            value={refSearch}
            placeholder="Rechercher une étude…"
            onChange={(e) => setRefSearch(e.target.value)}
          />
          <Button size="sm" onClick={searchRefs}>Rechercher</Button>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {(refs || []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#e5e9f0] px-3 py-2">
              <div className="min-w-0 text-[13px]">
                <div className="truncate font-semibold text-[#003170]">{r.projet || r.document || `Étude #${r.id}`}</div>
                <div className="truncate text-text-muted">{r.structure} · {r.plateforme} · NE {r.NE ?? '—'}</div>
              </div>
              <Button size="sm" disabled={applyingRef} onClick={() => applyRef(r.id)}>Appliquer</Button>
            </div>
          ))}
          {!refs.length ? <p className="text-[13px] text-text-muted">Aucune référence listée — lancez une recherche.</p> : null}
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => setPopup(null)}>Fermer</Button>
        </div>
      </Modal>
    </FichePageShell>
  )
}

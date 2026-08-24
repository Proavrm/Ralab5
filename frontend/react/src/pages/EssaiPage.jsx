/**
 * EssaiPage.jsx — Fiche de saisie des essais laboratoire
 * Route: /essai/:uid
 *
 * ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────────────────
 * Détecte type_essai et affiche le bon formulaire de saisie.
 * Les résultats sont calculés en temps réel et sauvegardés en JSON.
 *
 * Pour ajouter un nouveau type:
 *   1. Créer un composant function MonEssai({ res, onChange, readOnly })
 *   2. L'ajouter dans ESSAI_FORMS avec la clé = type_essai exact en BD
 *
 * Types prévus (à implémenter):
 *   'GR'   — Granulométrie (tamis + sédimentation)
 *   'LCP'  — Limites d'Atterberg (wL, wP, Ip, Ic)
 *   'BM'   — Bleu de méthylène (VBS)
 *   'ES'   — Équivalent de sable
 *   'PN'   — Proctor Normal (WOPN, ρdOPN)
 *   'IPI'  — Indice Portant Immédiat
 *   'ID'   — Identification GTR (agrège les autres)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react'
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, feuillesTerrainApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { createTerrainFeuilleForIntervention, isFeuilleTerrainEssaiCode } from '@/lib/terrainFeuilleFromIntervention'
import {
  buildDedicatedEssaiFeuillePath,
  isDedicatedEssaiFeuilleCode,
  resolveEssaiCodeFromRecord,
} from '@/lib/essaiFeuilleRoutes'
import { FicheMain, FichePageShell, FicheTopbar } from '@/components/layout/FicheLayout'
import TeneurEnEauForm from '@/components/essais/TeneurEnEauForm'
import GranulometrieForm from '@/components/essais/GranulometrieForm'
import BleuMethyleneForm from '@/components/essais/BleuMethyleneForm'
import LimitesAtterbergForm from '@/components/essais/LimitesAtterbergForm'
import IdentificationGtrForm from '@/components/essais/IdentificationGtrForm'
import ProctorForm from '@/components/essais/ProctorForm'
import IPIForm from '@/components/essais/IPIForm'
import { CBRIForm, CBRForm } from '@/components/essais/IPICBRForm'
import EquivalentSableForm from '@/components/essais/EquivalentSableForm'
import { weWMoyenFromResultats } from '@/lib/weEssai'
import SondageCarotteCoupe from './SondageCarotteCoupe'

// ── UI helpers ────────────────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
      {title && (
        <div className="px-4 py-2.5 border-b border-border bg-bg">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}
function FR({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 mb-2">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium ${!value && value !== 0 ? 'text-text-muted italic font-normal' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}
const STAT_CLS = {
  'Programmé': 'bg-[#e6f1fb] text-[#185fa5]',
  'En cours':  'bg-[#faeeda] text-[#854f0b]',
  'Terminé':   'bg-[#eaf3de] text-[#3b6d11]',
  'Annulé':    'bg-[#f1efe8] text-[#5f5e5a]',
}
const STAT_SELECT_CLS = {
  'Programmé': 'bg-[#eef6fd] border-[#b7d5f1] text-[#185fa5] focus:border-[#6ea9dd]',
  'En cours':  'bg-[#fff7ea] border-[#e6cf9b] text-[#854f0b] focus:border-[#d2a84c]',
  'Terminé':   'bg-[#eef6e8] border-[#b8d49a] text-[#3b6d11] focus:border-[#78a14a]',
  'Annulé':    'bg-[#f5f3ee] border-[#d5d0c2] text-[#5f5e5a] focus:border-[#a39d90]',
}
function Badge({ s }) {
  return s ? <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span> : null
}
function parseRes(r) {
  try { return typeof r === 'string' ? JSON.parse(r || '{}') : (r || {}) }
  catch { return {} }
}
function num(v) {
  const s = typeof v === 'string' ? v.trim().replace(',', '.') : v
  const x = parseFloat(s)
  return Number.isNaN(x) ? null : x
}
function rnd(v, d = 2) { return v === null ? null : parseFloat(v.toFixed(d)) }

function toDateInputValue(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) return isoMatch[1]
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function formatDateDisplay(value) {
  const normalized = toDateInputValue(value)
  if (!normalized) return null
  const [year, month, day] = normalized.split('-')
  if (!year || !month || !day) return normalized
  return `${day}-${month}-${year}`
}

function buildMetaFromEssai(essaiLike, fallback = {}) {
  return {
    type_essai: essaiLike?.type_essai || fallback.type_essai || '',
    norme: essaiLike?.norme || fallback.norme || '',
    statut: essaiLike?.statut || fallback.statut || 'Programmé',
    operateur: essaiLike?.operateur || '',
    date_debut: toDateInputValue(essaiLike?.date_debut),
    date_fin: toDateInputValue(essaiLike?.date_fin),
  }
}

function formatEssaiDateRange(startValue, endValue) {
  const start = formatDateDisplay(startValue)
  const end = formatDateDisplay(endValue)
  if (start && end) return `${start} → ${end}`
  return start || end || null
}

function getStatusFromMeta(metaLike) {
  if (toDateInputValue(metaLike?.date_fin)) return 'Terminé'
  return metaLike?.statut || 'Programmé'
}

function getStatusSelectClass(statut) {
  return STAT_SELECT_CLS[statut] || 'bg-surface border-border text-text'
}

function buildDisplayEssaiReference(essai, uid, isNew) {
  if (essai?.reference) return essai.reference
  if (isNew) return 'Brouillon non enregistré'

  return `ESSAI-${String(uid).padStart(4, '0')}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// WE — TENEUR EN EAU PONDÉRALE
// NF P 94-050 (étuvage 105°C ou 50°C)
// NF P 94-049-1 (micro-ondes) / NF P 94-049-2 (plaque chauffante)
//
// Protocole: peser récipient vide (M1), récipient+sol humide (M2),
//            récipient+sol sec après étuvage (M3)
// Formule: w = (M2-M3) / (M3-M1) × 100
//
// Contextes d'usage (selector — sans liaisons pour l'instant):
//   wn         → Teneur en eau naturelle (résultat principal → CRE, ID GTR)
//   vbs        → Prise d'essai pour VBS
//   coupure_20 → Fraction 0/20mm
//   coupure_5  → Fraction 0/5mm
//   proctor    → Point de compactage Proctor
//   traitement → Étude traitement de sols
//   wl         → Limite de liquidité (Atterberg)
//   wp         → Limite de plasticité (Atterberg)
//
// TODO: lier w_moyen automatiquement au CRE et à l'ID GTR
// TODO: adapter nb_det et structure selon le contexte (ex: Proctor = 5 points)
// ═══════════════════════════════════════════════════════════════════════════════

function TeneurEnEau({ res, onChange, readOnly }) {
  return (
    <TeneurEnEauForm
      res={res}
      readOnly={readOnly}
      onChange={(values) => onChange(JSON.stringify(values))}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// GR — ANALYSE GRANULOMÉTRIQUE PAR TAMISAGE
// NF P 94-056 (sols) / NF EN 933-1 (granulats)
//
// Version actuelle: directe + avec coupure(s)
// TODO: ajouter sédimentométrie NF P 94-057 pour fines < 0.08mm
// ═══════════════════════════════════════════════════════════════════════════════

const Granulometrie = GranulometrieForm

// VBS — Bleu de méthylène / Prise d'essai au bleu
// ═══════════════════════════════════════════════════════════════════════════════
// Recherche WE par usage exact — utilisé par MB et MBF pour trouver le bon WE

const BleuMethylene = BleuMethyleneForm

const Proctor = ProctorForm
const EquivalentSable = EquivalentSableForm

function CompatibilityPanel({ title, fields, readOnly, values, onFieldChange, summary = null }) {
    return (
        <div className="flex flex-col gap-4">
            {summary ? (
                <div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg">
                    <div className="text-[12px] font-medium text-[#185fa5]">{summary}</div>
                </div>
            ) : null}
            <Card title={title}>
                <div className="grid grid-cols-2 gap-3">
                    {fields.map(field => (
                        <FG key={field.key} label={field.label}>
                            {field.type === 'textarea' ? (
                                <textarea
                                    value={values[field.key] ?? ''}
                                    onChange={event => onFieldChange(field.key, event.target.value, field.type)}
                                    rows={field.rows || 3}
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge resize-y disabled:opacity-60"
                                />
                            ) : (
                                <Input
                                    type={field.type || 'text'}
                                    value={values[field.key] ?? ''}
                                    onChange={event => onFieldChange(field.key, event.target.value, field.type)}
                                    disabled={readOnly}
                                />
                            )}
                        </FG>
                    ))}
                </div>
            </Card>
        </div>
    )
}

function buildCompatibilityForm(defaults, fields, title, summary = null) {
    return function CompatibilityForm({ res, onChange, readOnly }) {
        const initial = (() => {
            if (res && typeof res === 'object' && !Array.isArray(res)) {
                return { ...defaults, ...res }
            }
            return { ...defaults }
        })()
        const [values, setValues] = useState(initial)

        useEffect(() => {
            if (res && typeof res === 'object' && !Array.isArray(res)) {
                setValues({ ...defaults, ...res })
            } else {
                setValues({ ...defaults })
            }
        }, [res])

        function handleFieldChange(key, rawValue, type) {
            const nextValue = type === 'number'
                ? (rawValue === '' ? '' : rawValue)
                : rawValue
            const next = { ...values, [key]: nextValue }
            setValues(next)
            const payload = {}
            Object.keys(next).forEach(currentKey => {
                const field = fields.find(item => item.key === currentKey)
                if (field?.type === 'number') {
                    payload[currentKey] = next[currentKey] === '' ? null : num(next[currentKey])
                } else {
                    payload[currentKey] = next[currentKey]
                }
            })
            onChange(JSON.stringify(payload))
        }

        return (
            <CompatibilityPanel
                title={title}
                fields={fields}
                readOnly={readOnly}
                values={values}
                onFieldChange={handleFieldChange}
                summary={summary}
            />
        )
    }
}

const LimitesAtterberg = LimitesAtterbergForm

const ExtractionLiant = buildCompatibilityForm(
    {
        heure: '',
        teneur_liant_percent: '',
        teneur_liant_ext_percent: '',
        module_richesse: '',
        module_richesse_ext: '',
        surface_specifique: '',
        commentaires: '',
    },
    [
        { key: 'heure', label: 'Heure', type: 'text' },
        { key: 'teneur_liant_percent', label: 'Liant (%)', type: 'number' },
        { key: 'teneur_liant_ext_percent', label: 'Liant extrait (%)', type: 'number' },
        { key: 'module_richesse', label: 'Module de richesse', type: 'number' },
        { key: 'module_richesse_ext', label: 'Module de richesse extrait', type: 'number' },
        { key: 'surface_specifique', label: 'Surface spécifique', type: 'number' },
        { key: 'commentaires', label: 'Commentaires', type: 'textarea', rows: 3 },
    ],
    'Extraction de liant',
    'Shim de compatibilité réintroduit pour éviter le crash du runtime.'
)

const ControleFabricationEnrobes = buildCompatibilityForm(
    {
        heure: '',
        temperature: '',
        teneur_liant_percent: '',
        module_richesse: '',
        remarques: '',
    },
    [
        { key: 'heure', label: 'Heure', type: 'text' },
        { key: 'temperature', label: 'Température (°C)', type: 'number' },
        { key: 'teneur_liant_percent', label: 'Liant (%)', type: 'number' },
        { key: 'module_richesse', label: 'Module de richesse', type: 'number' },
        { key: 'remarques', label: 'Remarques', type: 'textarea', rows: 3 },
    ],
    'Contrôle fabrication enrobés',
    'Shim de compatibilité réintroduit pour éviter le crash du runtime.'
)

const IdentificationGTR = IdentificationGtrForm

const MasseVolumiqueEnrobes = buildCompatibilityForm(
    {
        masse_air: '',
        masse_eau: '',
        masse_surface_saturee: '',
        masse_volumique: '',
        commentaire: '',
    },
    [
        { key: 'masse_air', label: 'Masse à l’air (g)', type: 'number' },
        { key: 'masse_eau', label: 'Masse dans l’eau (g)', type: 'number' },
        { key: 'masse_surface_saturee', label: 'Masse SSD (g)', type: 'number' },
        { key: 'masse_volumique', label: 'Masse volumique', type: 'number' },
        { key: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 3 },
    ],
    'Masse volumique des enrobés',
    'Shim de compatibilité réintroduit pour éviter le crash du runtime.'
)

const ESSAI_FORMS = {
  'WE': TeneurEnEau,
  'GR': Granulometrie,
  'EL': ExtractionLiant,
  'CFE': ControleFabricationEnrobes,
  'VBS': BleuMethylene,
  'BM': BleuMethylene,
  'MB':  BleuMethylene,
  'MBF': BleuMethylene,
  'LCP': LimitesAtterberg,
  'ES':  EquivalentSable,
  'PN':  Proctor,
  'IPI':  IPIForm,
  'IM':  CBRIForm,
  'CBRI': CBRIForm,
  'CBR':  CBRForm,
  'ID':  IdentificationGTR,
  'MVA': MasseVolumiqueEnrobes,
  'SC':  SondageCarotteCoupe,
}

// Essais labo rattachés uniquement à un échantillon ; les autres peuvent naître d'une intervention.
const LAB_ECHANTILLON_ONLY_CODES = new Set([
  'WE', 'GR', 'EL', 'VBS', 'BM', 'MB', 'MBF', 'LCP', 'ES', 'PN', 'IPI', 'IM', 'CBRI', 'CBR', 'ID', 'MVA',
])

function allowsInterventionParentForEssai(essaiCode, hasInterventionId) {
  if (!hasInterventionId) return false
  const normalizedCode = String(essaiCode || '').trim().toUpperCase()
  return !LAB_ECHANTILLON_ONLY_CODES.has(normalizedCode)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function EssaiPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const isNew = uid === 'new'
  const isModelo = isNew && searchParams.get('modelo') === '1'
  const echantillonIdParam = searchParams.get('echantillon_id') || ''
  const echantillonId = Number.parseInt(echantillonIdParam, 10)
  const linkedEchantillonId = Number.isInteger(echantillonId) && echantillonId > 0 ? echantillonId : null
  const interventionIdParam = searchParams.get('intervention_id') || ''
  const interventionId = Number.parseInt(interventionIdParam, 10)
  const linkedInterventionId = Number.isInteger(interventionId) && interventionId > 0 ? interventionId : null
  const initialEssaiCode = searchParams.get('essai_code') || ''
  const initialSourceLabel = searchParams.get('source_label') || ''
  const initialTypeEssai = searchParams.get('type_essai') || ''
  const normalizedInitialCode = String(initialEssaiCode || '').trim().toUpperCase()
  const allowsInterventionParent = allowsInterventionParentForEssai(normalizedInitialCode, !!linkedInterventionId)
  const effectiveInterventionId = allowsInterventionParent ? linkedInterventionId : null
  const shouldRedirectToFeuille = (
    isNew
    && !isModelo
    && !linkedEchantillonId
    && !!effectiveInterventionId
    && isFeuilleTerrainEssaiCode(normalizedInitialCode)
  )

  const initResultats = searchParams.get('init_resultats') || '{}'
  const initMeta = {
    type_essai: searchParams.get('type_essai') || '',
    norme:      searchParams.get('norme')      || '',
    statut:     'Programmé', operateur: '', date_debut: '', date_fin: '',
  }

  const [editing,  setEditing]  = useState(isNew)
  const [resJson,  setResJson]  = useState(isNew ? initResultats : null)
  const [metaForm, setMetaForm] = useState(isNew ? initMeta : {})
  const [modeloSearchQ,       setModeloSearchQ]       = useState('')
  const [modeloSearchLoading, setModeloSearchLoading] = useState(false)
  const [modeloSearchMsg,     setModeloSearchMsg]     = useState(null)
  const [redirectingToFeuille, setRedirectingToFeuille] = useState(false)
  const dedicatedNewCode = isDedicatedEssaiFeuilleCode(normalizedInitialCode) ? normalizedInitialCode : ''
  function setMeta(k, v) {
    setMetaForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'date_fin') next.statut = v ? 'Terminé' : (next.statut || 'Programmé')
      return next
    })
  }

  const { data: essai, isLoading, isError } = useQuery({
    queryKey: ['essai', String(uid)],
    queryFn:  () => api.get(`/essais/${uid}`),
    enabled:  !isNew,
  })
  const {
    data: linkedEchantillon,
    isLoading: isLinkedEchantillonLoading,
    isError: isLinkedEchantillonError,
  } = useQuery({
    queryKey: ['echantillon', String(linkedEchantillonId)],
    queryFn:  () => api.get(`/essais/echantillons/${linkedEchantillonId}`),
    enabled:  isNew && !!linkedEchantillonId,
  })
  const {
    data: linkedIntervention,
    isLoading: isLinkedInterventionLoading,
    isError: isLinkedInterventionError,
  } = useQuery({
    queryKey: ['intervention', String(effectiveInterventionId)],
    queryFn:  () => api.get(`/interventions/${effectiveInterventionId}`),
    enabled:  isNew && !linkedEchantillonId && !!effectiveInterventionId,
  })
  const { data: meta } = useQuery({
    queryKey: ['essais-meta'],
    queryFn:  () => api.get('/essais/meta'),
    staleTime: Infinity,
  })
  const dedicatedExistingCode = resolveEssaiCodeFromRecord(essai)
  const shouldRedirectToDedicatedFeuille = (
    !isModelo
    && (
      (isNew && Boolean(dedicatedNewCode))
      || (!isNew && isDedicatedEssaiFeuilleCode(dedicatedExistingCode))
    )
  )

  useEffect(() => {
    if (!shouldRedirectToFeuille || !linkedIntervention) return

    let cancelled = false
    setRedirectingToFeuille(true)

    async function redirectToTerrainFeuille() {
      try {
        const { openPath } = await createTerrainFeuilleForIntervention({
          interventionId: effectiveInterventionId,
          code: normalizedInitialCode,
          label: initialTypeEssai || initialEssaiCode,
          dateFeuille: linkedIntervention?.date_intervention || '',
          operateur: linkedIntervention?.technicien || '',
        })
        if (!cancelled) {
          navigateWithReturnTo(
            navigate,
            openPath,
            resolveReturnTo(searchParams, `/interventions/${effectiveInterventionId}`),
            { replace: true }
          )
        }
      } catch {
        if (!cancelled) setRedirectingToFeuille(false)
      }
    }

    redirectToTerrainFeuille()
    return () => { cancelled = true }
  }, [
    shouldRedirectToFeuille,
    linkedIntervention,
    effectiveInterventionId,
    normalizedInitialCode,
    initialTypeEssai,
    initialEssaiCode,
    navigate,
    searchParams,
  ])

  useEffect(() => {
    if (!shouldRedirectToDedicatedFeuille) return
    const code = isNew ? dedicatedNewCode : dedicatedExistingCode
    if (!code) return
    const query = {}
    searchParams.forEach((value, key) => {
      if (key === 'return_to') return
      query[key] = value
    })
    const target = buildDedicatedEssaiFeuillePath({
      code,
      uid: isNew ? '' : uid,
      isNew,
      query,
      returnTo: resolveReturnTo(
        searchParams,
        linkedEchantillonId
          ? `/echantillons/${linkedEchantillonId}`
          : effectiveInterventionId
            ? `/interventions/${effectiveInterventionId}`
            : '/labo/workbench?tab=essais',
      ),
    })
    if (target) navigate(target, { replace: true })
  }, [
    shouldRedirectToDedicatedFeuille,
    dedicatedNewCode,
    dedicatedExistingCode,
    isNew,
    uid,
    searchParams,
    linkedEchantillonId,
    effectiveInterventionId,
    navigate,
  ])

  const saveMut = useMutation({
    mutationFn: (d) => isNew
      ? api.post('/essais', {
          ...d,
          echantillon_id: linkedEchantillonId,
          intervention_id: linkedEchantillonId ? undefined : effectiveInterventionId,
          source_label: initialSourceLabel || undefined,
          essai_code: initialEssaiCode,
        })
      : api.put(`/essais/${uid}`, d),
    onSuccess: (saved) => {
      const echId = saved.echantillon_id || linkedEchantillonId
      if (echId) qc.invalidateQueries({ queryKey: ['essais-ech', String(echId)] })
      if (isNew) {
        qc.setQueryData(['essai', String(saved.uid)], saved)
        setEditing(false)
        setResJson(null)
        const savedInterventionId = saved.intervention_id || effectiveInterventionId
        const defaultReturnPath = saved.echantillon_id
          ? `/echantillons/${saved.echantillon_id}`
          : savedInterventionId
            ? `/interventions/${savedInterventionId}`
            : ''
        navigateWithReturnTo(navigate, `/essais/${saved.uid}`, resolveReturnTo(searchParams, defaultReturnPath), { replace: true })
      } else {
        qc.setQueryData(['essai', String(uid)], saved)
        setEditing(false); setResJson(null)
      }
    },
  })

  async function loadModeloData() {
    const q = String(modeloSearchQ).trim()
    if (!q) return
    setModeloSearchLoading(true)
    setModeloSearchMsg(null)
    try {
      const terrainCodes = ['CFE', 'PLD', 'DF', 'SC', 'SO']
      const isTerrainType = terrainCodes.includes(String(initialEssaiCode).toUpperCase())
      let rows
      if (isTerrainType) {
        rows = await feuillesTerrainApi.list({ q, limit: 8, code_feuille: String(initialEssaiCode || '').toUpperCase() })
      } else {
        rows = await api.get(`/essais?q=${encodeURIComponent(q)}&limit=8`)
      }
      const items = Array.isArray(rows) ? rows : []
      if (items.length === 0) {
        setModeloSearchMsg({ type: 'err', msg: `Nenhum ${isTerrainType ? 'feuille terrain' : 'essai'} encontrado para “${q}”.` })
        return
      }
      const normalizedQ = q.toUpperCase()
      const found = items.find((item) => String(item?.reference || '').toUpperCase() === normalizedQ) || items[0]

      let payloadSource = found
      if (isTerrainType && found?.uid != null) {
        // list() returns summary only; get(uid) returns payload with full detailed data.
        payloadSource = await feuillesTerrainApi.get(found.uid)
      }

      setMetaForm(buildMetaFromEssai(payloadSource, initMeta))
      const loadedResultats = payloadSource?.resultats ?? payloadSource?.payload ?? {}
      setResJson(typeof loadedResultats === 'string' ? loadedResultats : JSON.stringify(loadedResultats))

      const ref =
        payloadSource?.reference ||
        payloadSource?.essai_code ||
        payloadSource?.code_feuille ||
        payloadSource?.echantillon_reference ||
        payloadSource?.intervention_reference ||
        `#${payloadSource?.id || payloadSource?.uid}`
      setModeloSearchMsg({
        type: items.length > 1 ? 'info' : 'ok',
        msg: items.length > 1
          ? `${items.length} resultados — a carregar o mais recente: ${ref}`
          : `Dados carregados: ${ref}`,
      })
    } catch (e) {
      setModeloSearchMsg({ type: 'err', msg: `Erro: ${e.message}` })
    } finally {
      setModeloSearchLoading(false)
    }
  }

  function openEdit() {
    if (isNew) return
    setMetaForm(buildMetaFromEssai(currentEssai, initMeta))
    setResJson(essai.resultats || '{}')
    setEditing(true)
  }

  function handleSave() {
    if (isNew && !linkedEchantillonId && !effectiveInterventionId) return
    saveMut.mutate({
      ...metaForm,
      statut: getStatusFromMeta(metaForm),
      date_debut: toDateInputValue(metaForm.date_debut) || null,
      date_fin: toDateInputValue(metaForm.date_fin) || null,
      resultats: resJson ?? currentEssai?.resultats ?? initResultats,
    })
  }

  if (!isNew && isLoading) return (
    <FichePageShell>
      <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
    </FichePageShell>
  )
  if (!isNew && (isError || !essai)) return (
    <FichePageShell>
      <div className="text-center py-16">
        <p className="text-text-muted text-sm mb-3">Essai introuvable</p>
        <Button onClick={() => navigateBackWithFallback(navigate, searchParams, linkedEchantillonId ? `/echantillons/${linkedEchantillonId}` : '')} tabIndex={0}>← Retour</Button>
      </div>
    </FichePageShell>
  )

  if (shouldRedirectToDedicatedFeuille) return (
    <FichePageShell>
      <div className="text-xs text-text-muted text-center py-16">Ouverture de la feuille…</div>
    </FichePageShell>
  )

  if (isNew && !isModelo && !linkedEchantillonId && !effectiveInterventionId) return (
    <FichePageShell>
      <div className="text-center py-16">
        <p className="text-text-muted text-sm mb-3">
          {allowsInterventionParent
            ? 'Parent manquant (échantillon ou intervention)'
            : 'Échantillon manquant pour ce type d’essai'}
        </p>
        <Button onClick={() => navigateBackWithFallback(navigate, searchParams, linkedEchantillonId ? `/echantillons/${linkedEchantillonId}` : '')} tabIndex={0}>← Retour</Button>
      </div>
    </FichePageShell>
  )

  if (isNew && (isLinkedEchantillonLoading || isLinkedInterventionLoading || redirectingToFeuille || shouldRedirectToFeuille || shouldRedirectToDedicatedFeuille)) {
    return (
      <FichePageShell>
        <div className="text-xs text-text-muted text-center py-16">
          {shouldRedirectToFeuille || shouldRedirectToDedicatedFeuille ? 'Ouverture de la feuille…' : 'Chargement…'}
        </div>
      </FichePageShell>
    )
  }

  if (isNew && linkedEchantillonId && (isLinkedEchantillonError || !linkedEchantillon)) return (
    <FichePageShell>
      <div className="text-center py-16">
        <p className="text-text-muted text-sm mb-3">Échantillon introuvable</p>
        <Button onClick={() => navigateBackWithFallback(navigate, searchParams, linkedEchantillonId ? `/echantillons/${linkedEchantillonId}` : '')} tabIndex={0}>← Retour</Button>
      </div>
    </FichePageShell>
  )

  if (isNew && !linkedEchantillonId && effectiveInterventionId && (isLinkedInterventionError || !linkedIntervention)) return (
    <FichePageShell>
      <div className="text-center py-16">
        <p className="text-text-muted text-sm mb-3">Intervention introuvable</p>
        <Button onClick={() => navigateBackWithFallback(navigate, searchParams, effectiveInterventionId ? `/interventions/${effectiveInterventionId}` : '')} tabIndex={0}>← Retour</Button>
      </div>
    </FichePageShell>
  )

  const currentEssai = isNew
    ? {
        uid: 'new',
        reference: '',
        echantillon_id: linkedEchantillonId,
        intervention_id: effectiveInterventionId,
        essai_code: initialEssaiCode,
        code_essai: initialEssaiCode,
        type_essai: metaForm.type_essai || initMeta.type_essai,
        norme: metaForm.norme || initMeta.norme,
        statut: getStatusFromMeta(metaForm),
        operateur: metaForm.operateur || '',
        date_debut: metaForm.date_debut || '',
        date_fin: metaForm.date_fin || '',
        resultats: resJson ?? initResultats,
        source_label: initialSourceLabel || '',
        ech_ref: linkedEchantillon?.reference || '',
        echantillon_reference: linkedEchantillon?.reference || '',
        designation: linkedEchantillon?.designation || '',
        intervention_reference: linkedIntervention?.reference || '',
        intervention_subject: linkedIntervention?.sujet || '',
        demande_ref: linkedEchantillon?.demande_ref || '',
        demande_reference: linkedEchantillon?.demande_reference || '',
        affaire_ref: linkedEchantillon?.affaire_ref || '',
        affaire_reference: linkedEchantillon?.affaire_reference || '',
      }
    : essai

  const editingMeta = editing
    ? {
        statut: getStatusFromMeta({
          statut: metaForm.statut ?? currentEssai?.statut,
          date_fin: metaForm.date_fin ?? currentEssai?.date_fin,
        }),
        operateur: metaForm.operateur ?? currentEssai?.operateur ?? '',
        date_debut: metaForm.date_debut ?? toDateInputValue(currentEssai?.date_debut),
        date_fin: metaForm.date_fin ?? toDateInputValue(currentEssai?.date_fin),
      }
    : null
  const childReturnTo = buildLocationTarget(location)
  const parentEchantillonUid = Number.parseInt(String(currentEssai?.echantillon_id || linkedEchantillonId || ''), 10) || null
  const parentInterventionUid = Number.parseInt(String(currentEssai?.intervention_id || linkedInterventionId || ''), 10) || null
  const fallbackReturnTo = resolveReturnTo(
    searchParams,
    parentEchantillonUid
      ? `/echantillons/${parentEchantillonUid}`
      : parentInterventionUid
        ? `/interventions/${parentInterventionUid}`
        : ''
  )
  const readOnlyDates = formatEssaiDateRange(currentEssai?.date_debut, currentEssai?.date_fin)
  const displayStatus = editing ? editingMeta?.statut : getStatusFromMeta(currentEssai)

  const res       = parseRes(editing ? (resJson ?? currentEssai?.resultats) : currentEssai?.resultats)
  const EssaiForm = ESSAI_FORMS[currentEssai?.essai_code] || ESSAI_FORMS[currentEssai?.code_essai]

  // Résultat principal à afficher dans le header (par type)
  // TODO: chaque nouveau type exposera son résultat principal ici
  const heroResult = (() => {
    if ((currentEssai?.essai_code === 'WE' || currentEssai?.code_essai === 'WE') && weWMoyenFromResultats(res) != null)
      return { value: `${weWMoyenFromResultats(res)} %`, label: 'w moyen' }
    if ((currentEssai?.essai_code === 'PN' || currentEssai?.code_essai === 'PN') && res.rho_d_OPN != null)
      return { value: `${res.rho_d_OPN_corr ?? res.rho_d_OPN} Mg/m³`, label: res.rho_d_OPN_corr ? `ρdOPN corr. — wOPN=${res.wOPN_corr??'?'}%` : `ρdOPN — wOPN=${res.wOPN??'?'}%` }
    if ((currentEssai?.essai_code === 'IPI' || currentEssai?.code_essai === 'IPI') && res.ipi != null)
      return { value: `${res.ipi}`, label: 'IPI (%)' }
    if (['CBRI','CBR','IM'].includes(currentEssai?.essai_code || currentEssai?.code_essai || '') && res.cbr_95 != null)
      return { value: `${res.cbr_95}`, label: `${res.mode || 'CBR'} à 95% OPN (%)` }
    if ((currentEssai?.essai_code === 'EL' || currentEssai?.code_essai === 'EL')) {
      const liant = extractLiantMetrics(res)
      if (liant.binderExt !== null) return { value: `${formatCompactNumber(liant.binderExt)} %`, label: 'Liant extrait' }
      if (liant.binder !== null) return { value: `${formatCompactNumber(liant.binder)} %`, label: 'Liant' }
    }
    if ((currentEssai?.essai_code === 'CFE' || currentEssai?.code_essai === 'CFE')) {
      const moyenne = res?.moyenne && typeof res.moyenne === 'object' ? res.moyenne : {}
      const temp = num(res?.temperature_prelevement_c ?? moyenne.temperature_c)
      const binderExt = num(moyenne.teneur_liant_ext_percent ?? res?.teneur_liant_ext_percent)
      if (temp !== null) return { value: `${formatCompactNumber(temp, 1)} °C`, label: 'Température prélèvement' }
      if (binderExt !== null) return { value: `${formatCompactNumber(binderExt)} %`, label: 'Liant extrait' }
    }
    return null
  })()

  const essaiBreadcrumb = [
    currentEssai.demande_ref || currentEssai.demande_reference,
    currentEssai.ech_ref || (!currentEssai.ech_ref && currentEssai.intervention_reference ? currentEssai.intervention_reference : null),
  ].filter(Boolean).join(' › ')

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}
        eyebrow="Laboratoire"
        title={currentEssai.type_essai || (isNew ? 'Nouvel essai' : `Essai #${uid}`)}
        subtitle={essaiBreadcrumb || undefined}
      >
        <Badge s={displayStatus} />
        {parentEchantillonUid ? (
          <Button size="sm" variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/echantillons/${parentEchantillonUid}`, childReturnTo)} tabIndex={0}>
            🧪 Échantillon
          </Button>
        ) : null}
        {!parentEchantillonUid && parentInterventionUid ? (
          <Button size="sm" variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/interventions/${parentInterventionUid}`, childReturnTo)} tabIndex={0}>
            🔗 Intervention
          </Button>
        ) : null}
        {editing ? (
          <>
            <Button onClick={() => {
              if (isNew) { navigateBackWithFallback(navigate, searchParams, fallbackReturnTo) }
              else { setEditing(false); setResJson(null) }
            }} tabIndex={0}>Annuler</Button>
            <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending} tabIndex={0}>
              {saveMut.isPending ? '…' : '✓ Enregistrer'}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={openEdit} tabIndex={0}>✏️ Modifier</Button>
        )}
      </FicheTopbar>

      <FicheMain>
      <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-4">

        {/* MODELO — banner + procura */}
        {isNew && isModelo && (
          <div className="rounded-lg border-2 border-[#d5c9a8] bg-[#fdfaf2] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#f0e8c0] text-[#7a5f00] uppercase tracking-wide shrink-0">MODELO</span>
              <span className="text-[12px] font-semibold text-[#7a5f00]">
                Folha vazia de teste — {initMeta.type_essai || initialEssaiCode || 'tipo livre'}
              </span>
              <span className="text-[11px] text-text-muted">
                A referência de ensaio é editável neste modo. Para guardar, associa um echantillon ou intervenção.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={modeloSearchQ}
                onChange={(e) => setModeloSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadModeloData() } }}
                placeholder="Número, código ou referência de essai existente para carregar dados…"
                className="flex-1 px-2 py-1.5 border border-[#d5c9a8] rounded text-xs bg-white outline-none focus:border-nge"
              />
              <button
                type="button"
                onClick={loadModeloData}
                disabled={modeloSearchLoading}
                className="px-3 py-1.5 rounded border border-[#d5c9a8] bg-[#f0e8c0] text-[#7a5f00] text-xs font-medium hover:bg-[#e8d898] disabled:opacity-50 transition-colors shrink-0"
              >
                {modeloSearchLoading ? 'A carregar…' : 'Carregar dados'}
              </button>
              {modeloSearchMsg && (
                <button type="button" onClick={() => setModeloSearchMsg(null)} className="text-text-muted text-sm hover:text-text shrink-0">×</button>
              )}
            </div>
            {modeloSearchMsg && (
              <div className={`text-[11px] px-2 py-1.5 rounded border ${
                modeloSearchMsg.type === 'ok'   ? 'bg-[#eaf3de] text-[#3b6d11] border-[#b6d98b]' :
                modeloSearchMsg.type === 'err'  ? 'bg-[#fcebeb] text-[#a32d2d] border-[#f0a0a0]' :
                'bg-[#eef4ff] text-[#204575] border-[#cfddff]'
              }`}>
                {modeloSearchMsg.msg}
              </div>
            )}
            <div className="text-[10px] text-text-muted">
              Carregar dados de um essai existente preenche o formulário para comparação e homogeneização. Os dados originais não são alterados.
            </div>
          </div>
        )}

        {/* Card infos — référence + échantillon */}
        <Card>
          {editing ? (
            <div className="grid grid-cols-3 gap-3">
              <FG label="Échantillon lié">
                <Input value={currentEssai.ech_ref || currentEssai.echantillon_reference || currentEssai.intervention_reference || currentEssai.source_label || ''} readOnly className="text-text-muted" tabIndex={-1} />
              </FG>
              <FG label="Statut">
                <Select value={editingMeta.statut} onChange={e => setMeta('statut', e.target.value)} className={`w-full font-medium ${getStatusSelectClass(editingMeta.statut)}`} tabIndex={0}>
                  {['Programmé','En cours','Terminé','Annulé'].map(s => <option key={s}>{s}</option>)}
                </Select>
              </FG>
              <FG label="Opérateur">
                <Input value={editingMeta.operateur} onChange={e => setMeta('operateur', e.target.value)} tabIndex={0} />
              </FG>
              <FG label="Date début">
                <Input type="date" value={editingMeta.date_debut} onChange={e => setMeta('date_debut', e.target.value)} tabIndex={0} />
              </FG>
              <FG label="Date fin">
                <Input type="date" value={editingMeta.date_fin} onChange={e => setMeta('date_fin', e.target.value)} tabIndex={0} />
              </FG>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[18px] font-bold text-nge font-mono">
                  {buildDisplayEssaiReference(currentEssai, uid, isNew)}
                </div>
                <div className="flex flex-col gap-0.5 mt-1">
                  {(currentEssai.ech_ref || currentEssai.echantillon_reference) && (
                    <span className="text-[12px] text-text-muted">
                      Échantillon : <span className="font-medium text-text font-mono">{currentEssai.ech_ref || currentEssai.echantillon_reference}</span>
                      {currentEssai.designation ? ` — ${currentEssai.designation}` : ''}
                      {parentEchantillonUid ? (
                        <button
                          type="button"
                          onClick={() => navigateWithReturnTo(navigate, `/echantillons/${parentEchantillonUid}`, childReturnTo)}
                          className="ml-2 text-nge hover:underline"
                        >
                          Ouvrir
                        </button>
                      ) : null}
                    </span>
                  )}
                  {!(currentEssai.ech_ref || currentEssai.echantillon_reference) && currentEssai.intervention_reference && (
                    <span className="text-[12px] text-text-muted">
                      Intervention : <span className="font-medium text-text font-mono">{currentEssai.intervention_reference}</span>
                      {currentEssai.source_label ? ` — Coupe ${currentEssai.source_label}` : ''}
                      {parentInterventionUid ? (
                        <button
                          type="button"
                          onClick={() => navigateWithReturnTo(navigate, `/interventions/${parentInterventionUid}`, childReturnTo)}
                          className="ml-2 text-nge hover:underline"
                        >
                          Ouvrir
                        </button>
                      ) : null}
                    </span>
                  )}
                  {currentEssai.type_essai && (
                    <span className="text-[12px] text-text-muted">
                      {currentEssai.type_essai}{currentEssai.norme ? ` — ${currentEssai.norme}` : ''}
                    </span>
                  )}
                  {currentEssai.operateur && <span className="text-[12px] text-text-muted">Opérateur : {currentEssai.operateur}</span>}
                  {readOnlyDates && <span className="text-[12px] text-text-muted">Dates : {readOnlyDates}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge s={currentEssai.statut} />
                {heroResult && (
                  <div className="text-right">
                    <div className="text-[26px] font-bold text-nge leading-none">{heroResult.value}</div>
                    <div className="text-[11px] text-text-muted">{heroResult.label}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Formulaire de saisie */}
        {EssaiForm ? (
          <EssaiForm res={res} onChange={setResJson} readOnly={!editing} essai={currentEssai} />
        ) : (
          <Card>
            <div className="text-center py-6">
              <p className="text-text-muted text-sm">
                Formulaire non disponible pour <strong>{currentEssai.type_essai || 'ce type'}</strong>.
              </p>
              <p className="text-[12px] text-text-muted mt-1">
                Types disponibles : {Object.keys(ESSAI_FORMS).join(', ')}
              </p>
            </div>
          </Card>
        )}

      </div>
      </FicheMain>
    </FichePageShell>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { api, essaisApi } from '@/services/api'
import { resolveReturnTo } from '@/lib/detailNavigation'
import {
  buildDedicatedEssaiRapportPath,
  parseEssaiResultats,
  stringifyEssaiResultats,
} from '@/lib/essaiFeuilleRoutes'
import {
  EMPTY_ENROBE_PRODUCT_META,
  applyInheritedElContext,
  loadEnrobeContextFromSample,
  mergeEmptyProductMeta,
} from '@/lib/enrobeProductMeta'
import {
  TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS,
  TERRAIN_FABRICATION_SITE_SELECT_OPTIONS,
  TERRAIN_FORMULA_SELECT_OPTIONS,
  TERRAIN_OPERATOR_SELECT_OPTIONS,
  TERRAIN_PRODUCT_SELECT_OPTIONS,
  renderTerrainSelectOptionExtras,
} from '@/lib/terrainEssaiSelectOptions'
import { WorksheetMain, WorksheetPageShell, WorksheetTopbar } from '@/components/layout/FicheLayout'

const EL_STORAGE_KEY = 'ralab5:el:draft'
const DEFAULT_LABORATORY = 'Laboratoire Rhône-Alpes - 29-31 rue des Tâches - ZI Mi-Plaine - 69800 SAINT PRIEST'

const SOURCE_TONE_CLS = {
  manual: 'border-l-4 border-l-[#7fc998] bg-[#f7fcf9]',
  hierarchy: 'border-l-4 border-l-[#f0b35a] bg-[#fffaf2]',
  neutral: 'border-l-4 border-l-transparent bg-bg',
}

function Card({ title, description, children, right }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-border bg-bg px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</div>
            {description ? <p className="mt-1 text-[11px] text-text-muted">{description}</p> : null}
          </div>
          {right || null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </div>
  )
}

function Field({ label, children, full = false, tone = 'manual' }) {
  const toneClass = SOURCE_TONE_CLS[tone] || SOURCE_TONE_CLS.neutral
  return (
    <div className={`${full ? 'md:col-span-2 lg:col-span-3' : ''} rounded-lg px-3 py-2 ${toneClass}`}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge"
    >
      {children}
    </select>
  )
}

function emptyMeasure(index) {
  return {
    id: `el-m${index}`,
    numero: index,
    heure: '',
    temperature: '',
    massePrise: '',
    teneurLiant: '',
    teneurLiantExt: '',
    surfaceSpecifique: '',
    moduleRichesse: '',
  }
}

const EMPTY_DRAFT = {
  chronoNumber: '',
  affairNumber: '',
  reportDate: '',
  chantier: '',
  laboratory: DEFAULT_LABORATORY,
  operateur: '',
  datePrelevement: '',
  dateEssai: '',
  methodeEssai: 'Extracteur automatique - NEBA',
  product: { ...EMPTY_ENROBE_PRODUCT_META },
  criteria: {
    source: '',
    definition: '',
    liantMini: '',
    liantMaxi: '',
    moduleMini: '',
  },
  measures: [emptyMeasure(1), emptyMeasure(2), emptyMeasure(3), emptyMeasure(4)],
  conclusion: {
    controlLabel: 'Contrôle',
    comments: '',
    name: '',
    functionName: '',
  },
}

const DEFAULT_DRAFT = {
  ...EMPTY_DRAFT,
  chronoNumber: '18',
  affairNumber: 'RA L1EC',
  reportDate: '2025-10-10',
  chantier: 'VL3 - Albigny sur Saône',
  operateur: 'F. Montet',
  datePrelevement: '2025-10-09',
  dateEssai: '2025-10-10',
  product: {
    lieu_fabrication: 'CENTRALE_SP',
    numero_formule: 'FORMULE_FTP',
    produit_controle: 'PRODUIT_FTP',
    couche: 'Roulement',
    epaisseur_couche_cm: '4',
    date_mise_en_oeuvre: '2025-10-09',
    atelier_mise_en_oeuvre: '',
    section_controlee: 'Avenue de la gare',
  },
  criteria: {
    source: 'FTP',
    definition: '',
    liantMini: '4.9',
    liantMaxi: '5.9',
    moduleMini: '3.4',
  },
  measures: [
    { ...emptyMeasure(1), heure: '01:10', temperature: '177', teneurLiant: '5.13', teneurLiantExt: '5.10', moduleRichesse: '3.19' },
    emptyMeasure(2),
    emptyMeasure(3),
    emptyMeasure(4),
  ],
  conclusion: {
    controlLabel: 'Contrôle',
    comments: '',
    name: 'F. MONTET',
    functionName: 'Technicien de laboratoire',
  },
}

function toNumber(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function mean(values) {
  const nums = values.map(toNumber).filter((value) => value != null)
  if (!nums.length) return null
  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}

function roundValue(value, digits = 2) {
  if (value == null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function isInside(value, mini, maxi) {
  if (value == null) return null
  const min = toNumber(mini)
  const max = toNumber(maxi)
  if (min != null && value < min) return false
  if (max != null && value > max) return false
  if (min == null && max == null) return null
  return true
}

function computeElDraft(draft) {
  const measures = (draft.measures || []).map((measure) => ({
    ...measure,
    teneurLiantNum: toNumber(measure.teneurLiant),
    teneurLiantExtNum: toNumber(measure.teneurLiantExt),
    moduleRichesseNum: toNumber(measure.moduleRichesse),
  }))
  const meanBinder = roundValue(mean(measures.map((row) => row.teneurLiantNum)), 2)
  const meanBinderExt = roundValue(mean(measures.map((row) => row.teneurLiantExtNum)), 2)
  const meanModule = roundValue(mean(measures.map((row) => row.moduleRichesseNum)), 2)
  const binderStatus = isInside(meanBinderExt ?? meanBinder, draft.criteria.liantMini, draft.criteria.liantMaxi)
  const moduleStatus = isInside(meanModule, draft.criteria.moduleMini, null)
  let globalStatus = null
  if (binderStatus === false || moduleStatus === false) globalStatus = false
  else if (binderStatus === true || moduleStatus === true) globalStatus = true
  return { measures, meanBinder, meanBinderExt, meanModule, binderStatus, moduleStatus, globalStatus }
}

function readStoredDraft(uid) {
  try {
    const raw = window.localStorage.getItem(`${EL_STORAGE_KEY}:${uid || 'new'}`)
    if (!raw) return EMPTY_DRAFT
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? normalizeDraft(parsed) : EMPTY_DRAFT
  } catch {
    return EMPTY_DRAFT
  }
}

function writeStoredDraft(uid, draft) {
  window.localStorage.setItem(`${EL_STORAGE_KEY}:${uid || 'new'}`, JSON.stringify(draft))
}

function normalizeDraft(raw) {
  const product = mergeEmptyProductMeta(EMPTY_ENROBE_PRODUCT_META, raw.product || raw.meta || {})
  const measures = Array.isArray(raw.measures) && raw.measures.length
    ? raw.measures.map((row, index) => ({ ...emptyMeasure(index + 1), ...row, numero: index + 1 }))
    : EMPTY_DRAFT.measures
  return {
    ...EMPTY_DRAFT,
    ...raw,
    product,
    criteria: { ...EMPTY_DRAFT.criteria, ...(raw.criteria || {}) },
    measures,
    conclusion: { ...EMPTY_DRAFT.conclusion, ...(raw.conclusion || {}) },
  }
}

function draftFromResultats(raw) {
  const parsed = parseEssaiResultats(raw)
  if (!parsed || parsed.worksheet_kind !== 'el') {
    if (parsed?.teneur_liant_percent || parsed?.teneur_liant_ext_percent) {
      return normalizeDraft({
        ...parsed.draft,
        product: parsed.product || parsed.draft?.product,
        measures: parsed.draft?.measures || [{
          ...emptyMeasure(1),
          teneurLiant: parsed.teneur_liant_percent ?? '',
          teneurLiantExt: parsed.teneur_liant_ext_percent ?? '',
          moduleRichesse: parsed.module_richesse ?? '',
        }],
      })
    }
    return null
  }
  return normalizeDraft(parsed.draft || parsed)
}

function resultatsFromDraft(draft, computed) {
  return {
    worksheet_kind: 'el',
    draft,
    product: draft.product,
    teneur_liant_percent: computed.meanBinder,
    teneur_liant_ext_percent: computed.meanBinderExt,
    module_richesse: computed.meanModule,
    moyenne: {
      teneur_liant_percent: computed.meanBinder,
      teneur_liant_ext_percent: computed.meanBinderExt,
      module_richesse: computed.meanModule,
    },
  }
}

function formatStatus(status) {
  if (status === true) return 'Conforme'
  if (status === false) return 'Non conforme'
  return 'À compléter'
}

export default function FeuilleElPage() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const uidFromPath = String(params.uid || '').trim()
  const isNew = uidFromPath === 'new' || (!uidFromPath && Boolean(searchParams.get('echantillon_id') || searchParams.get('prelevement_id') || searchParams.get('intervention_id')))
  const persistedUid = isNew ? '' : uidFromPath
  const echantillonId = Number.parseInt(searchParams.get('echantillon_id') || '', 10)
  const prelevementId = Number.parseInt(searchParams.get('prelevement_id') || '', 10)
  const interventionId = Number.parseInt(searchParams.get('intervention_id') || '', 10)
  const returnTo = resolveReturnTo(searchParams, '/labo/workbench?tab=essais')

  const [draft, setDraft] = useState(() => readStoredDraft(persistedUid || 'new'))
  const [essaiUid, setEssaiUid] = useState(persistedUid)
  const [saveState, setSaveState] = useState('idle')
  const [loading, setLoading] = useState(
    Boolean(persistedUid)
    || (Number.isInteger(echantillonId) && echantillonId > 0)
    || (Number.isInteger(prelevementId) && prelevementId > 0),
  )
  const [error, setError] = useState('')
  const computed = useMemo(() => computeElDraft(draft), [draft])

  useEffect(() => {
    let cancelled = false
    const currentUid = String(params.uid || '').trim()
    const creating = currentUid === 'new' || (!currentUid && Boolean(searchParams.get('echantillon_id') || searchParams.get('prelevement_id') || searchParams.get('intervention_id')))

    async function load() {
      if (!currentUid || creating) {
        setEssaiUid('')
        const hasParent = (Number.isInteger(echantillonId) && echantillonId > 0)
          || (Number.isInteger(prelevementId) && prelevementId > 0)
          || (Number.isInteger(interventionId) && interventionId > 0)
        let next = hasParent ? normalizeDraft(EMPTY_DRAFT) : readStoredDraft('new')
        if (
          (Number.isInteger(echantillonId) && echantillonId > 0)
          || (Number.isInteger(prelevementId) && prelevementId > 0)
        ) {
          const inherited = await loadEnrobeContextFromSample({ echantillonId, prelevementId })
          next = applyInheritedElContext(next, inherited)
        }
        if (!cancelled) {
          setDraft(next)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      try {
        const essai = await essaisApi.get(currentUid)
        if (cancelled) return
        setEssaiUid(String(essai?.uid || currentUid))
        let next = draftFromResultats(essai?.resultats) || readStoredDraft(currentUid)
        const linkedEchantillonId = Number.parseInt(String(essai?.echantillon_id || echantillonId || ''), 10)
        const linkedPrelevementId = Number.parseInt(String(essai?.prelevement_id || prelevementId || ''), 10)
        if (
          (Number.isInteger(linkedEchantillonId) && linkedEchantillonId > 0)
          || (Number.isInteger(linkedPrelevementId) && linkedPrelevementId > 0)
        ) {
          const inherited = await loadEnrobeContextFromSample({
            echantillonId: linkedEchantillonId,
            prelevementId: linkedPrelevementId,
            excludeEssaiUid: essai?.uid || currentUid,
          })
          next = applyInheritedElContext(next, inherited)
        }
        setDraft(next)
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Impossible de charger la feuille EL.')
        setDraft(readStoredDraft(currentUid))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [params.uid, searchParams, echantillonId, prelevementId, interventionId])

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    setSaveState('saving')
  }

  function updateProduct(key, value) {
    setDraft((current) => ({
      ...current,
      product: { ...current.product, [key]: value },
    }))
    setSaveState('saving')
  }

  function updateCriteria(key, value) {
    setDraft((current) => ({
      ...current,
      criteria: { ...current.criteria, [key]: value },
    }))
    setSaveState('saving')
  }

  function updateMeasure(index, key, value) {
    setDraft((current) => ({
      ...current,
      measures: current.measures.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [key]: value } : row
      )),
    }))
    setSaveState('saving')
  }

  function updateConclusion(key, value) {
    setDraft((current) => ({
      ...current,
      conclusion: { ...current.conclusion, [key]: value },
    }))
    setSaveState('saving')
  }

  async function persistToApi() {
    const payload = {
      essai_code: 'EL',
      type_essai: searchParams.get('type_essai') || 'Extraction de liant',
      norme: searchParams.get('norme') || 'NF EN 12697-1',
      statut: draft.operateur ? 'En cours' : 'Programmé',
      date_debut: draft.dateEssai || null,
      operateur: draft.operateur || '',
      resultats: stringifyEssaiResultats(resultatsFromDraft(draft, computed)),
      source_label: searchParams.get('source_label') || '',
    }
    const hasParent = (Number.isInteger(echantillonId) && echantillonId > 0)
      || (Number.isInteger(interventionId) && interventionId > 0)

    if (essaiUid) return api.put(`/essais/${essaiUid}`, payload)
    if (!hasParent) {
      writeStoredDraft('new', draft)
      return { uid: '' }
    }
    return essaisApi.create({
      ...payload,
      echantillon_id: Number.isInteger(echantillonId) && echantillonId > 0 ? echantillonId : undefined,
      intervention_id: Number.isInteger(echantillonId) && echantillonId > 0
        ? undefined
        : (Number.isInteger(interventionId) && interventionId > 0 ? interventionId : undefined),
    })
  }

  async function saveDraftNow() {
    try {
      setSaveState('saving')
      writeStoredDraft(essaiUid || 'new', draft)
      const saved = await persistToApi()
      const savedUid = String(saved?.uid || essaiUid || '')
      if (savedUid && savedUid !== essaiUid) {
        setEssaiUid(savedUid)
        const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
        navigate(`/modeles/el/${encodeURIComponent(savedUid)}${query}`, { replace: true })
      }
      setSaveState('saved')
      setError('')
      return savedUid
    } catch (err) {
      setSaveState('error')
      setError(err?.message || 'Enregistrement impossible.')
      return essaiUid
    }
  }

  async function openReport() {
    const savedUid = await saveDraftNow()
    const target = buildDedicatedEssaiRapportPath({
      code: 'EL',
      uid: savedUid || essaiUid,
      returnTo: savedUid ? `/modeles/el/${encodeURIComponent(savedUid)}` : '/modeles/el',
    })
    if (target) navigate(target)
  }

  if (loading) {
    return (
      <WorksheetPageShell>
        <div className="py-10 text-center text-sm text-text-muted">Chargement feuille EL…</div>
      </WorksheetPageShell>
    )
  }

  return (
    <WorksheetPageShell>
      <WorksheetTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnTo)}
        eyebrow="Feuille d'essai"
        title="EL · Extraction de liant"
        subtitle="NF EN 12697-1"
      >
        <Button variant="secondary" size="sm" onClick={() => setDraft(DEFAULT_DRAFT)}>Recharger exemple</Button>
        <Button variant="primary" size="sm" onClick={saveDraftNow}>Enregistrer</Button>
        <Button variant="secondary" size="sm" onClick={openReport}>Imprimer / Rapport</Button>
      </WorksheetTopbar>

      <WorksheetMain>
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-[#f0a0a0] bg-[#fcebeb] px-4 py-3 text-sm text-[#a32d2d]">{error}</div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
            <span>{saveState === 'saved' ? 'Sauvegardé' : saveState === 'saving' ? 'Sauvegarde…' : (essaiUid ? `Essai #${essaiUid}` : 'Brouillon local')}</span>
            <span className={computed.globalStatus === true ? 'font-semibold text-[#3b6d11]' : computed.globalStatus === false ? 'font-semibold text-[#a32d2d]' : ''}>
              {formatStatus(computed.globalStatus)}
            </span>
            <span>Liant moy. {computed.meanBinderExt ?? computed.meanBinder ?? '—'} %</span>
            <span>Module moy. {computed.meanModule ?? '—'}</span>
          </div>

          <Card title="Identification" description="Données de réalisation de l’essai.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="N° chrono"><Input value={draft.chronoNumber} onChange={(event) => updateField('chronoNumber', event.target.value)} /></Field>
              <Field label="N° d'affaire"><Input value={draft.affairNumber} onChange={(event) => updateField('affairNumber', event.target.value)} /></Field>
              <Field label="Date de rédaction"><Input type="date" value={draft.reportDate} onChange={(event) => updateField('reportDate', event.target.value)} /></Field>
              <Field label="Opérateur">
                <Select value={draft.operateur} onChange={(value) => updateField('operateur', value)}>
                  <option value="">Sélectionner un opérateur</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_OPERATOR_SELECT_OPTIONS, draft.operateur)}
                </Select>
              </Field>
              <Field label="Date prélèvement"><Input type="date" value={draft.datePrelevement} onChange={(event) => updateField('datePrelevement', event.target.value)} /></Field>
              <Field label="Date essai"><Input type="date" value={draft.dateEssai} onChange={(event) => updateField('dateEssai', event.target.value)} /></Field>
              <Field label="Chantier" full><Input value={draft.chantier} onChange={(event) => updateField('chantier', event.target.value)} /></Field>
              <Field label="Méthode d'essai">
                <Select value={draft.methodeEssai} onChange={(value) => updateField('methodeEssai', value)}>
                  <option value="Extracteur automatique - NEBA">Extracteur automatique - NEBA</option>
                  <option value="Soxhlet">Soxhlet</option>
                  <option value="Autre">Autre</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card
            title="Produit / chantier"
            description="Centrale, formule, FTP et mise en œuvre. Prérempli depuis l’échantillon / prélèvement s’ils existent déjà en base."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Lieu de fabrication">
                <Select value={draft.product.lieu_fabrication} onChange={(value) => updateProduct('lieu_fabrication', value)}>
                  <option value="">Sélectionner une centrale</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_FABRICATION_SITE_SELECT_OPTIONS, draft.product.lieu_fabrication)}
                </Select>
              </Field>
              <Field label="Numéro formule">
                <Select value={draft.product.numero_formule} onChange={(value) => updateProduct('numero_formule', value)}>
                  <option value="">Sélectionner une formule</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_FORMULA_SELECT_OPTIONS, draft.product.numero_formule)}
                </Select>
              </Field>
              <Field label="Produit contrôlé">
                <Select value={draft.product.produit_controle} onChange={(value) => updateProduct('produit_controle', value)}>
                  <option value="">Sélectionner une FTP</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_PRODUCT_SELECT_OPTIONS, draft.product.produit_controle)}
                </Select>
              </Field>
              <Field label="Couche"><Input value={draft.product.couche} onChange={(event) => updateProduct('couche', event.target.value)} /></Field>
              <Field label="Épaisseur couche (cm)"><Input value={draft.product.epaisseur_couche_cm} onChange={(event) => updateProduct('epaisseur_couche_cm', event.target.value)} /></Field>
              <Field label="Date mise en œuvre"><Input type="date" value={draft.product.date_mise_en_oeuvre} onChange={(event) => updateProduct('date_mise_en_oeuvre', event.target.value)} /></Field>
              <Field label="Section contrôlée" full>
                <Input value={draft.product.section_controlee} onChange={(event) => updateProduct('section_controlee', event.target.value)} />
              </Field>
              <Field label="Atelier mise en œuvre" full>
                <Input value={draft.product.atelier_mise_en_oeuvre} onChange={(event) => updateProduct('atelier_mise_en_oeuvre', event.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Critères de conformité" description="Seuils issus de la formule / FTP.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Source des critères">
                <Select value={draft.criteria.source} onChange={(value) => updateCriteria('source', value)}>
                  <option value="">Sélectionner une source</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS, draft.criteria.source)}
                </Select>
              </Field>
              <Field label="Liant mini (%)"><Input value={draft.criteria.liantMini} onChange={(event) => updateCriteria('liantMini', event.target.value)} /></Field>
              <Field label="Liant maxi (%)"><Input value={draft.criteria.liantMaxi} onChange={(event) => updateCriteria('liantMaxi', event.target.value)} /></Field>
              <Field label="Module mini"><Input value={draft.criteria.moduleMini} onChange={(event) => updateCriteria('moduleMini', event.target.value)} /></Field>
            </div>
          </Card>

          <Card title="Mesures d'extraction" description="Jusqu'à quatre déterminations. Moyenne calculée automatiquement.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-text-muted">
                    <th className="px-2 py-2">N°</th>
                    <th className="px-2 py-2">Heure</th>
                    <th className="px-2 py-2">T (°C)</th>
                    <th className="px-2 py-2">Prise (g)</th>
                    <th className="px-2 py-2">Liant (%)</th>
                    <th className="px-2 py-2">Liant extrait (%)</th>
                    <th className="px-2 py-2">Surf. spéc.</th>
                    <th className="px-2 py-2">Module</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.measures.map((row, index) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-2 py-2 font-semibold">{row.numero}</td>
                      <td className="px-2 py-2"><Input value={row.heure} onChange={(event) => updateMeasure(index, 'heure', event.target.value)} /></td>
                      <td className="px-2 py-2"><Input value={row.temperature} onChange={(event) => updateMeasure(index, 'temperature', event.target.value)} /></td>
                      <td className="px-2 py-2"><Input value={row.massePrise} onChange={(event) => updateMeasure(index, 'massePrise', event.target.value)} /></td>
                      <td className="px-2 py-2"><Input value={row.teneurLiant} onChange={(event) => updateMeasure(index, 'teneurLiant', event.target.value)} /></td>
                      <td className="px-2 py-2"><Input value={row.teneurLiantExt} onChange={(event) => updateMeasure(index, 'teneurLiantExt', event.target.value)} /></td>
                      <td className="px-2 py-2"><Input value={row.surfaceSpecifique} onChange={(event) => updateMeasure(index, 'surfaceSpecifique', event.target.value)} /></td>
                      <td className="px-2 py-2"><Input value={row.moduleRichesse} onChange={(event) => updateMeasure(index, 'moduleRichesse', event.target.value)} /></td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-bg font-semibold">
                    <td className="px-2 py-2" colSpan={4}>Moyenne</td>
                    <td className="px-2 py-2">{computed.meanBinder ?? '—'}</td>
                    <td className="px-2 py-2">{computed.meanBinderExt ?? '—'}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2">{computed.meanModule ?? '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Conclusion">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Contrôle"><Input value={draft.conclusion.controlLabel} onChange={(event) => updateConclusion('controlLabel', event.target.value)} /></Field>
              <Field label="Nom"><Input value={draft.conclusion.name} onChange={(event) => updateConclusion('name', event.target.value)} /></Field>
              <Field label="Fonction"><Input value={draft.conclusion.functionName} onChange={(event) => updateConclusion('functionName', event.target.value)} /></Field>
              <Field label="Commentaires" full>
                <textarea
                  value={draft.conclusion.comments}
                  onChange={(event) => updateConclusion('comments', event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge"
                />
              </Field>
            </div>
          </Card>
        </div>
      </WorksheetMain>
    </WorksheetPageShell>
  )
}

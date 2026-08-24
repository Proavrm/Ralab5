import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar } from '@/components/layout/FicheLayout'
import { parseRes } from '@/components/essais/essaiFormUi'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import {
  buildDedicatedEssaiRapportPath,
  stringifyEssaiResultats,
} from '@/lib/essaiFeuilleRoutes'
import { api, essaisApi } from '@/services/api'

const STAT_CLS = {
  Programmé: 'bg-[#e6f1fb] text-[#185fa5]',
  'En cours': 'bg-[#faeeda] text-[#854f0b]',
  Terminé: 'bg-[#eaf3de] text-[#3b6d11]',
  Annulé: 'bg-[#f1efe8] text-[#5f5e5a]',
}
const STAT_SELECT_CLS = {
  Programmé: 'bg-[#eef6fd] border-[#b7d5f1] text-[#185fa5] focus:border-[#6ea9dd]',
  'En cours': 'bg-[#fff7ea] border-[#e6cf9b] text-[#854f0b] focus:border-[#d2a84c]',
  Terminé: 'bg-[#eef6e8] border-[#b8d49a] text-[#3b6d11] focus:border-[#78a14a]',
  Annulé: 'bg-[#f5f3ee] border-[#d5d0c2] text-[#5f5e5a] focus:border-[#a39d90]',
}

function Badge({ s }) {
  return s ? <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span> : null
}

function Card({ children }) {
  return <div className="overflow-hidden rounded-[10px] border border-border bg-surface p-4">{children}</div>
}

function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

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

function buildDisplayEssaiReference(essai, uid, isNew) {
  if (essai?.reference) return essai.reference
  if (isNew) return 'Brouillon non enregistré'
  return `ESSAI-${String(uid).padStart(4, '0')}`
}

export default function FeuilleLaboShell({
  code,
  defaultTypeEssai,
  defaultNorme = '',
  Form,
  initialResultats = {},
  heroFromResultats,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const uidFromPath = String(params.uid || '').trim()
  const isNew = uidFromPath === 'new' || (!uidFromPath && Boolean(
    searchParams.get('echantillon_id') || searchParams.get('prelevement_id') || searchParams.get('intervention_id'),
  ))
  const echantillonId = Number.parseInt(searchParams.get('echantillon_id') || '', 10)
  const interventionId = Number.parseInt(searchParams.get('intervention_id') || '', 10)
  const hasEchantillon = Number.isInteger(echantillonId) && echantillonId > 0
  const hasIntervention = Number.isInteger(interventionId) && interventionId > 0
  const fallbackReturnTo = resolveReturnTo(
    searchParams,
    hasEchantillon ? `/echantillons/${echantillonId}` : hasIntervention ? `/interventions/${interventionId}` : '/labo/workbench?tab=essais',
  )
  const typeEssai = searchParams.get('type_essai') || defaultTypeEssai
  const norme = searchParams.get('norme') || defaultNorme
  const emptyMeta = {
    type_essai: typeEssai,
    norme,
    statut: 'Programmé',
    operateur: '',
    date_debut: '',
    date_fin: '',
  }

  const [essai, setEssai] = useState(null)
  const [linkedEchantillon, setLinkedEchantillon] = useState(null)
  const [res, setRes] = useState(initialResultats)
  const [formKey, setFormKey] = useState('new')
  const [metaForm, setMetaForm] = useState(emptyMeta)
  const [editing, setEditing] = useState(isNew)
  const [loading, setLoading] = useState(!isNew || hasEchantillon)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const essaiUid = String(essai?.uid || (!isNew ? uidFromPath : '') || '')
  const parentEchantillonUid = Number.parseInt(String(essai?.echantillon_id || echantillonId || ''), 10) || null
  const parentInterventionUid = Number.parseInt(String(essai?.intervention_id || interventionId || ''), 10) || null
  const childReturnTo = buildLocationTarget(location)
  const displayStatus = editing ? getStatusFromMeta(metaForm) : getStatusFromMeta(essai || metaForm)
  const hero = heroFromResultats ? heroFromResultats(res) : null
  const readOnlyDates = formatEssaiDateRange(essai?.date_debut, essai?.date_fin)
  const currentEssai = essai || {
    type_essai: typeEssai,
    norme,
    ech_ref: linkedEchantillon?.reference || '',
    echantillon_reference: linkedEchantillon?.reference || '',
    designation: linkedEchantillon?.designation || '',
    source_label: searchParams.get('source_label') || '',
  }

  function applyResultats(raw) {
    const parsed = parseRes(raw)
    return parsed && typeof parsed === 'object' ? { ...initialResultats, ...parsed } : { ...initialResultats }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const currentUid = String(params.uid || '').trim()
      const creating = currentUid === 'new' || (!currentUid && Boolean(
        searchParams.get('echantillon_id') || searchParams.get('prelevement_id') || searchParams.get('intervention_id'),
      ))
      const linkedEchId = Number.parseInt(searchParams.get('echantillon_id') || '', 10)

      if (creating) {
        setEssai(null)
        setRes({ ...initialResultats })
        setMetaForm({ ...emptyMeta, type_essai: typeEssai, norme })
        setFormKey(`new-${code}-${linkedEchId || 'x'}`)
        setEditing(true)
        if (Number.isInteger(linkedEchId) && linkedEchId > 0) {
          try {
            const ech = await api.get(`/essais/echantillons/${linkedEchId}`)
            if (!cancelled) setLinkedEchantillon(ech)
          } catch {
            if (!cancelled) setLinkedEchantillon(null)
          }
        } else if (!cancelled) {
          setLinkedEchantillon(null)
        }
        if (!cancelled) setLoading(false)
        return
      }

      setLoading(true)
      try {
        const loaded = await essaisApi.get(currentUid)
        if (cancelled) return
        setEssai(loaded)
        setRes(applyResultats(loaded?.resultats))
        setMetaForm({
          type_essai: loaded?.type_essai || typeEssai,
          norme: loaded?.norme || norme,
          statut: loaded?.statut || 'Programmé',
          operateur: loaded?.operateur || '',
          date_debut: toDateInputValue(loaded?.date_debut),
          date_fin: toDateInputValue(loaded?.date_fin),
        })
        setFormKey(String(loaded?.uid || currentUid))
        setEditing(false)
        setError('')
      } catch (err) {
        if (cancelled) return
        setError(err?.message || `Impossible de charger la feuille ${code}.`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [params.uid, searchParams, code])

  const essaiBreadcrumb = useMemo(() => [
    currentEssai.demande_ref || currentEssai.demande_reference,
    currentEssai.ech_ref || (!currentEssai.ech_ref && currentEssai.intervention_reference ? currentEssai.intervention_reference : null),
  ].filter(Boolean).join(' › '), [currentEssai])

  function setMeta(key, value) {
    setMetaForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'date_fin') next.statut = value ? 'Terminé' : (next.statut || 'Programmé')
      return next
    })
  }

  function handleFormChange(payload) {
    setRes(typeof payload === 'string' ? applyResultats(payload) : { ...res, ...payload })
  }

  function openEdit() {
    setRes(applyResultats(essai?.resultats || res))
    setFormKey(`${essaiUid}-edit`)
    setEditing(true)
  }

  async function persist() {
    const payload = {
      ...metaForm,
      essai_code: essai?.essai_code || essai?.code_essai || code,
      type_essai: metaForm.type_essai || typeEssai,
      norme: metaForm.norme || norme,
      statut: getStatusFromMeta(metaForm),
      date_debut: toDateInputValue(metaForm.date_debut) || null,
      date_fin: toDateInputValue(metaForm.date_fin) || null,
      operateur: metaForm.operateur || '',
      resultats: stringifyEssaiResultats(res),
      source_label: searchParams.get('source_label') || essai?.source_label || '',
    }
    if (essaiUid) return api.put(`/essais/${essaiUid}`, payload)
    if (!hasEchantillon && !hasIntervention) {
      throw new Error('Associer un échantillon ou une intervention pour enregistrer.')
    }
    return essaisApi.create({
      ...payload,
      echantillon_id: hasEchantillon ? echantillonId : undefined,
      intervention_id: hasEchantillon ? undefined : (hasIntervention ? interventionId : undefined),
    })
  }

  async function handleSave() {
    try {
      setSaving(true)
      const saved = await persist()
      const savedUid = String(saved?.uid || essaiUid || '')
      setEssai(saved)
      setRes(applyResultats(saved?.resultats || res))
      setEditing(false)
      setError('')
      if (savedUid && savedUid !== uidFromPath) {
        const query = fallbackReturnTo ? `?return_to=${encodeURIComponent(fallbackReturnTo)}` : ''
        navigate(`/modeles/${code.toLowerCase()}/${encodeURIComponent(savedUid)}${query}`, { replace: true })
      }
      return savedUid
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.')
      return essaiUid
    } finally {
      setSaving(false)
    }
  }

  async function openReport() {
    const savedUid = editing ? await handleSave() : essaiUid
    const target = buildDedicatedEssaiRapportPath({
      code,
      uid: savedUid || essaiUid,
      returnTo: savedUid ? `/modeles/${code.toLowerCase()}/${encodeURIComponent(savedUid)}` : `/modeles/${code.toLowerCase()}`,
    })
    if (target) navigate(target)
  }

  if (loading) {
    return (
      <FichePageShell>
        <div className="py-16 text-center text-xs text-text-muted">Chargement…</div>
      </FichePageShell>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}
        eyebrow="Laboratoire"
        title={currentEssai.type_essai || defaultTypeEssai}
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
        <Button size="sm" variant="secondary" onClick={openReport} tabIndex={0}>Imprimer / Rapport</Button>
        {editing ? (
          <>
            <Button onClick={() => {
              if (isNew && !essaiUid) navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)
              else {
                setRes(applyResultats(essai?.resultats || res))
                setFormKey(`${essaiUid}-view`)
                setEditing(false)
              }
            }} tabIndex={0}>Annuler</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving} tabIndex={0}>
              {saving ? '…' : '✓ Enregistrer'}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={openEdit} tabIndex={0}>✏️ Modifier</Button>
        )}
      </FicheTopbar>

      <FicheMain>
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
          {error ? (
            <div className="rounded-lg border border-[#f0a0a0] bg-[#fcebeb] px-4 py-3 text-sm text-[#a32d2d]">{error}</div>
          ) : null}

          <Card>
            {editing ? (
              <div className="grid grid-cols-3 gap-3">
                <FG label="Échantillon lié">
                  <Input value={currentEssai.ech_ref || currentEssai.echantillon_reference || currentEssai.intervention_reference || currentEssai.source_label || ''} readOnly className="text-text-muted" tabIndex={-1} />
                </FG>
                <FG label="Statut">
                  <Select value={metaForm.statut} onChange={(event) => setMeta('statut', event.target.value)} className={`w-full font-medium ${STAT_SELECT_CLS[metaForm.statut] || 'border-border bg-surface text-text'}`} tabIndex={0}>
                    {['Programmé', 'En cours', 'Terminé', 'Annulé'].map((status) => <option key={status}>{status}</option>)}
                  </Select>
                </FG>
                <FG label="Opérateur">
                  <Input value={metaForm.operateur} onChange={(event) => setMeta('operateur', event.target.value)} tabIndex={0} />
                </FG>
                <FG label="Date début">
                  <Input type="date" value={metaForm.date_debut} onChange={(event) => setMeta('date_debut', event.target.value)} tabIndex={0} />
                </FG>
                <FG label="Date fin">
                  <Input type="date" value={metaForm.date_fin} onChange={(event) => setMeta('date_fin', event.target.value)} tabIndex={0} />
                </FG>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-[18px] font-bold text-nge">
                    {buildDisplayEssaiReference(currentEssai, essaiUid, isNew && !essaiUid)}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {(currentEssai.ech_ref || currentEssai.echantillon_reference) ? (
                      <span className="text-[12px] text-text-muted">
                        Échantillon : <span className="font-mono font-medium text-text">{currentEssai.ech_ref || currentEssai.echantillon_reference}</span>
                        {currentEssai.designation ? ` — ${currentEssai.designation}` : ''}
                      </span>
                    ) : null}
                    {currentEssai.type_essai ? (
                      <span className="text-[12px] text-text-muted">
                        {currentEssai.type_essai}{currentEssai.norme ? ` — ${currentEssai.norme}` : ''}
                      </span>
                    ) : null}
                    {currentEssai.operateur ? <span className="text-[12px] text-text-muted">Opérateur : {currentEssai.operateur}</span> : null}
                    {readOnlyDates ? <span className="text-[12px] text-text-muted">Dates : {readOnlyDates}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge s={currentEssai.statut} />
                  {hero ? (
                    <div className="text-right">
                      <div className="text-[26px] font-bold leading-none text-nge">{hero.value}</div>
                      <div className="text-[11px] text-text-muted">{hero.label}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </Card>

          <Form
            key={formKey}
            res={res}
            onChange={handleFormChange}
            readOnly={!editing}
            essai={essai || { echantillon_id: hasEchantillon ? echantillonId : null, uid: essaiUid, designation: linkedEchantillon?.designation || '' }}
          />
        </div>
      </FicheMain>
    </FichePageShell>
  )
}

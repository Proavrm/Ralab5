import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import TeneurEnEauForm from '@/components/essais/TeneurEnEauForm'
import { FicheMain, FichePageShell, FicheTopbar } from '@/components/layout/FicheLayout'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import {
  buildDedicatedEssaiRapportPath,
  stringifyEssaiResultats,
} from '@/lib/essaiFeuilleRoutes'
import {
  serializeWeResultats,
  unwrapWeResultats,
  weMethodeLabel,
  weWMoyenFromResultats,
} from '@/lib/weEssai'
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

function Card({ title, children }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      {title ? (
        <div className="border-b border-border bg-bg px-4 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
        </div>
      ) : null}
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

function emptyMeta() {
  return {
    type_essai: 'Teneur en eau',
    norme: 'NF P 94-050',
    statut: 'Programmé',
    operateur: '',
    date_debut: '',
    date_fin: '',
  }
}

function metaFromEssai(essai, fallback = emptyMeta()) {
  return {
    type_essai: essai?.type_essai || fallback.type_essai,
    norme: essai?.norme || fallback.norme,
    statut: essai?.statut || fallback.statut || 'Programmé',
    operateur: essai?.operateur || '',
    date_debut: toDateInputValue(essai?.date_debut),
    date_fin: toDateInputValue(essai?.date_fin),
  }
}

export default function FeuilleWePage() {
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

  const [essai, setEssai] = useState(null)
  const [linkedEchantillon, setLinkedEchantillon] = useState(null)
  const [weRes, setWeRes] = useState(() => serializeWeResultats(unwrapWeResultats({})))
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
  const wMoyen = weWMoyenFromResultats(weRes)
  const readOnlyDates = formatEssaiDateRange(essai?.date_debut, essai?.date_fin)
  const currentEssai = essai || {
    type_essai: searchParams.get('type_essai') || 'Teneur en eau',
    norme: searchParams.get('norme') || 'NF P 94-050',
    ech_ref: linkedEchantillon?.reference || '',
    echantillon_reference: linkedEchantillon?.reference || '',
    designation: linkedEchantillon?.designation || '',
    source_label: searchParams.get('source_label') || '',
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
        setWeRes(serializeWeResultats(unwrapWeResultats({})))
        setMetaForm({
          ...emptyMeta(),
          type_essai: searchParams.get('type_essai') || 'Teneur en eau',
          norme: searchParams.get('norme') || 'NF P 94-050',
        })
        setFormKey(`new-${linkedEchId || 'x'}`)
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
        setWeRes(serializeWeResultats(unwrapWeResultats(loaded?.resultats)))
        setMetaForm(metaFromEssai(loaded))
        setFormKey(String(loaded?.uid || currentUid))
        setEditing(false)
        setError('')
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Impossible de charger la feuille WE.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [params.uid, searchParams])

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

  function openEdit() {
    setMetaForm(metaFromEssai(essai, metaForm))
    setWeRes(serializeWeResultats(unwrapWeResultats(essai?.resultats || weRes)))
    setFormKey(`${essaiUid}-edit`)
    setEditing(true)
  }

  async function persist() {
    const payload = {
      ...metaForm,
      essai_code: 'WE',
      type_essai: metaForm.type_essai || searchParams.get('type_essai') || 'Teneur en eau',
      norme: metaForm.norme || weMethodeLabel(weRes.methode) || 'NF P 94-050',
      statut: getStatusFromMeta(metaForm),
      date_debut: toDateInputValue(metaForm.date_debut) || null,
      date_fin: toDateInputValue(metaForm.date_fin) || null,
      operateur: metaForm.operateur || '',
      resultats: stringifyEssaiResultats(serializeWeResultats(weRes)),
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
      setWeRes(serializeWeResultats(unwrapWeResultats(saved?.resultats || weRes)))
      setMetaForm(metaFromEssai(saved, metaForm))
      setEditing(false)
      setError('')
      if (savedUid && savedUid !== uidFromPath) {
        const query = fallbackReturnTo ? `?return_to=${encodeURIComponent(fallbackReturnTo)}` : ''
        navigate(`/modeles/we/${encodeURIComponent(savedUid)}${query}`, { replace: true })
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
      code: 'WE',
      uid: savedUid || essaiUid,
      returnTo: savedUid ? `/modeles/we/${encodeURIComponent(savedUid)}` : '/modeles/we',
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
        title={currentEssai.type_essai || 'Teneur en eau'}
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
                setWeRes(serializeWeResultats(unwrapWeResultats(essai?.resultats || weRes)))
                setMetaForm(metaFromEssai(essai, metaForm))
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
                  <Select value={metaForm.statut} onChange={(event) => setMeta('statut', event.target.value)} className={`w-full font-medium ${STAT_SELECT_CLS[metaForm.statut] || 'bg-surface border-border text-text'}`} tabIndex={0}>
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
                  {wMoyen != null ? (
                    <div className="text-right">
                      <div className="text-[26px] font-bold leading-none text-nge">{wMoyen} %</div>
                      <div className="text-[11px] text-text-muted">w moyen</div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </Card>

          <TeneurEnEauForm
            key={formKey}
            res={weRes}
            onChange={setWeRes}
            readOnly={!editing}
          />
        </div>
      </FicheMain>
    </FichePageShell>
  )
}

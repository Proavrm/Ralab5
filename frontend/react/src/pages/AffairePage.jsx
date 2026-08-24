/**
 * pages/AffairePage.jsx
 * Fiche détail d'une affaire RST — layout wide avec hero, métriques, grid 2 colonnes.
 */
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, affairesApi } from '@/services/api'
import { formatDate } from '@/lib/utils'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { buildDistanceToLabCaption } from '@/lib/labGeo'
import { useAuth } from '@/hooks/useAuth'
import { isRegionalRstUser, ORG_REGION_ARS, resolveLabCodesForScope } from '@/lib/userOrgScope'
import { useLaboratoireCatalog } from '@/hooks/useLaboratoireCatalog'
import { formatLabOrgLine } from '@/lib/laboratoireCatalog'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import CopyCopilotPromptButton from '@/components/copilot/CopyCopilotPromptButton'
import CopilotImportPanel from '@/components/copilot/CopilotImportPanel'
import { MetricCard, FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'

const STATUTS    = ['À qualifier', 'En cours', 'Terminée', 'Archivée']
const DEFAULT_TITULAIRES = ['NGE GC', 'NGE Energie', 'NGE Routes', 'EHTP', 'NGE E.S.', 'NGE Transitions', 'Lyaudet', 'Autre']

const STAT_AFF = {
  'À qualifier': 'bg-[#f1efe8] text-[#5f5e5a]',
  'En cours':    'bg-[#eaf3de] text-[#3b6d11]',
  'Terminée':    'bg-[#eeedfe] text-[#534ab7]',
  'Archivée':    'bg-[#f1efe8] text-[#5f5e5a]',
}
const STAT_DEM = {
  'À qualifier':    'bg-[#f1efe8] text-[#5f5e5a]',
  'Demande':        'bg-[#e6f1fb] text-[#185fa5]',
  'En Cours':       'bg-[#eaf3de] text-[#3b6d11]',
  'Répondu':        'bg-[#eeedfe] text-[#534ab7]',
  'Fini':           'bg-[#eaf3de] text-[#3b6d11]',
  'Envoyé - Perdu': 'bg-[#f1efe8] text-[#5f5e5a]',
}
const DOSSIER_STATUS_LABELS = {
  pending: 'En attente',
  ready: 'Disponible',
  missing: 'À créer',
  outdated: 'À resynchroniser',
  root_missing: 'Racine locale absente',
}
const DOSSIER_MODE_LABELS = {
  pending: 'Remote / dev',
  local: 'Local travail',
}

function Badge({ s, map }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${(map || {})[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
      {s || '—'}
    </span>
  )
}

function FieldCard({ label, value, highlight, className = '' }) {
  return (
    <div className={`min-w-0 rounded-[14px] px-3 py-2.5 ${highlight ? 'border border-[#efd36b] bg-gradient-to-b from-[#fffdf2] to-[#fbfcfe]' : 'border border-[#e4e9f1] bg-[#fbfcfe]'} ${className}`}>
      <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a]">{label}</div>
      <div className="mt-1.5 min-h-[22px] text-[13px] font-black text-[#172033] break-all">{value || '—'}</div>
    </div>
  )
}

const INLINE_INPUT_CLS = 'w-full px-2.5 py-1.5 border border-[#dbe1ea] rounded-lg text-[13px] font-semibold text-[#172033] bg-white outline-none focus:border-nge'

function EditableFieldCard({ label, editing, displayValue, highlight, className = '', children }) {
  return (
    <div className={`min-w-0 rounded-[14px] px-3 py-2.5 ${highlight ? 'border border-[#efd36b] bg-gradient-to-b from-[#fffdf2] to-[#fbfcfe]' : 'border border-[#e4e9f1] bg-[#fbfcfe]'} ${className}`}>
      <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a]">{label}</div>
      <div className="mt-1.5 min-h-[22px]">
        {editing ? children : (
          <div className="text-[13px] font-black text-[#172033] break-all">{displayValue ?? '—'}</div>
        )}
      </div>
    </div>
  )
}

function buildTerrainFamiliesSummary(demande) {
  const items = []
  if ((demande?.nb_feuilles_sc || 0) > 0) items.push(`SC: ${demande.nb_feuilles_sc}`)
  if ((demande?.nb_feuilles_so || 0) > 0) items.push(`SO: ${demande.nb_feuilles_so}`)
  if ((demande?.nb_feuilles_de || 0) > 0) items.push(`DE: ${demande.nb_feuilles_de}`)
  return items.join(' · ')
}

function normalizeAffaireKey(value) {
  return String(value || '')
    .replaceAll('*', '')
    .toUpperCase()
    .replace(/[\s\-_/\.]+/g, '')
    .trim()
}

function buildEditForm(affaire) {
  if (!affaire) return {}
  return {
    client: affaire.client ?? '',
    maitre_ouvrage: affaire.maitre_ouvrage ?? '',
    maitre_oeuvre: affaire.maitre_oeuvre ?? '',
    chantier: affaire.chantier ?? '',
    site: affaire.site ?? '',
    adresse_ouvrage: affaire.adresse_ouvrage ?? '',
    filiale: affaire.filiale ?? '',
    numero_etude: affaire.numero_etude ?? '',
    affaire_nge: affaire.affaire_nge ?? '',
    autre_reference: affaire.autre_reference ?? '',
    dossier_nom: affaire.dossier_nom ?? '',
    titulaire: affaire.titulaire ?? '',
    responsable: affaire.responsable ?? '',
    statut: affaire.statut ?? 'À qualifier',
    date_ouverture: affaire.date_ouverture ?? '',
    date_debut_travaux_prevue: affaire.date_debut_travaux_prevue ?? '',
  }
}

export default function AffairePage() {
  const { uid }  = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const qc       = useQueryClient()
  const { user } = useAuth()
  const viewerIsRegionalRst = isRegionalRstUser(user)
  const { orgRegions, catalog } = useLaboratoireCatalog()
  const arsLabCodes = useMemo(
    () => resolveLabCodesForScope(ORG_REGION_ARS, orgRegions),
    [orgRegions],
  )
  const detailReturnTo = `/affaires/${uid}`
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [refEditOpen, setRefEditOpen] = useState(false)
  const [refEditVal, setRefEditVal] = useState('')

  useEffect(() => {
    setEditForm({})
    setIsEditing(false)
  }, [uid])

  const { data: affaire, isLoading, isError } = useQuery({
    queryKey: ['affaire', uid],
    queryFn:  () => affairesApi.get(uid),
  })

  const { data: demandes = [] } = useQuery({
    queryKey: ['affaire-demandes', uid],
    queryFn:  () => affairesApi.demandes(uid),
    enabled:  !!uid,
  })

  const { data: allAffaires = [] } = useQuery({
    queryKey: ['affaires-titulaire-options'],
    queryFn: () => affairesApi.list(),
  })

  const { data: affairesNgeRows = [] } = useQuery({
    queryKey: ['affaires-nge-titulaire-options'],
    queryFn: () => api.get('/reference-affaires/rows?limit=2000'),
  })

  const { data: etudesRows = [] } = useQuery({
    queryKey: ['etudes-titulaire-options'],
    queryFn: () => api.get('/reference-etudes/rows?limit=2000'),
  })

  const { data: passations = [] } = useQuery({
    queryKey: ['affaire-passations', uid],
    queryFn:  () => api.get(`/passations?affaire_rst_id=${uid}`),
    enabled:  !!uid,
  })

  const mutation = useMutation({
    mutationFn: (data) => affairesApi.update(uid, {
      ...data,
      date_debut_travaux_prevue: data.date_debut_travaux_prevue || null,
    }),
    onSuccess: (saved) => {
      qc.setQueryData(['affaire', uid], saved)
      qc.invalidateQueries({ queryKey: ['affaires'] })
      setIsEditing(false)
    },
  })

  const refMutation = useMutation({
    mutationFn: (reference) => affairesApi.update(uid, { reference }),
    onSuccess: (saved) => {
      qc.setQueryData(['affaire', uid], saved)
      qc.invalidateQueries({ queryKey: ['affaires'] })
      setRefEditOpen(false)
    },
  })

  const syncDossierMutation = useMutation({
    mutationFn: () => affairesApi.syncDossier(uid),
    onSuccess: (saved) => {
      qc.setQueryData(['affaire', uid], saved)
      qc.invalidateQueries({ queryKey: ['affaires'] })
    },
  })

  const openDossierMutation = useMutation({
    mutationFn: () => affairesApi.openDossier(uid),
  })

  const [deleteError, setDeleteError] = useState(null)

  async function handleDelete() {
    if (!affaire) return
    const links = []
    if (demandes.length) links.push(`${demandes.length} demande${demandes.length > 1 ? 's' : ''}`)
    if (passations.length) links.push(`${passations.length} passation${passations.length > 1 ? 's' : ''}`)
    if (links.length) {
      setDeleteError(`Impossible de supprimer : cet affaire a ${links.join(' et ')} liée${(demandes.length + passations.length) > 1 ? 's' : ''}.`)
      return
    }
    if (!confirm(`Supprimer l'affaire ${affaire.reference} ? Cette action est irréversible.`)) return
    try {
      await affairesApi.delete(uid)
      qc.invalidateQueries({ queryKey: ['affaires'] })
      navigate('/affaires')
    } catch (e) {
      setDeleteError(e.message || 'Erreur lors de la suppression.')
    }
  }

  function startEditing() {
    if (!affaire) return
    setEditForm(buildEditForm(affaire))
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    mutation.reset()
  }

  function handleSaveEditing() {
    mutation.mutate({
      ...editForm,
      date_debut_travaux_prevue: editForm.date_debut_travaux_prevue || null,
    })
  }

  function patchEditField(key, value) {
    setEditForm((current) => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    if (!location.state?.startEditing || !affaire) return
    setEditForm(buildEditForm(affaire))
    setIsEditing(true)
    window.history.replaceState({}, '')
  }, [affaire, location.state?.startEditing])

  const metrics = useMemo(() => {
    const totalEch = demandes.reduce((s, d) => s + (d.nb_echantillons || 0), 0)
    const totalInt = demandes.reduce((s, d) => s + (d.nb_interventions || 0), 0)
    const sc = demandes.reduce((s, d) => s + (d.nb_feuilles_sc || 0), 0)
    const so = demandes.reduce((s, d) => s + (d.nb_feuilles_so || 0), 0)
    const de = demandes.reduce((s, d) => s + (d.nb_feuilles_de || 0), 0)
    const detail = [sc > 0 && `SC: ${sc}`, so > 0 && `SO: ${so}`, de > 0 && `DE: ${de}`].filter(Boolean).join(' · ')
    return { totalEch, totalInt, detail }
  }, [demandes])

  const operationalView = useMemo(() => {
    const latestActivity = demandes.reduce((best, d) => {
      if (!d.updated_at) return best
      return (!best || d.updated_at > best) ? d.updated_at : best
    }, null)
    const nextEcheance = demandes.reduce((best, d) => {
      if (!d.date_echeance) return best
      return (!best || d.date_echeance < best) ? d.date_echeance : best
    }, null)
    const allFamilies = new Set()
    demandes.forEach(d => {
      if ((d.nb_feuilles_sc || 0) > 0) allFamilies.add('SC')
      if ((d.nb_feuilles_so || 0) > 0) allFamilies.add('SO')
      if ((d.nb_feuilles_de || 0) > 0) allFamilies.add('DE')
    })
    return {
      latestActivity: latestActivity ? formatDate(latestActivity) : '—',
      nextEcheance: nextEcheance ? formatDate(nextEcheance) : '—',
      families: allFamilies.size > 0 ? [...allFamilies].join(' · ') : '—',
    }
  }, [demandes])

  const titulaireOptions = useMemo(() => {
    const values = new Set(DEFAULT_TITULAIRES)
    allAffaires.forEach((item) => {
      const value = String(item?.titulaire ?? '').trim()
      if (value) values.add(value)
    })
    affairesNgeRows.forEach((row) => {
      const value = String(row?.titulaire ?? '').trim()
      if (value) values.add(value)
    })
    etudesRows.forEach((row) => {
      const titulaire = String(row?.titulaire ?? '').trim()
      const filiale = String(row?.filiale ?? '').trim()
      if (titulaire) values.add(titulaire)
      if (filiale) values.add(filiale)
    })
    const currentAffaire = String(affaire?.titulaire ?? '').trim()
    if (currentAffaire) values.add(currentAffaire)
    const currentForm = String(editForm?.titulaire ?? '').trim()
    if (currentForm) values.add(currentForm)
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  }, [allAffaires, affairesNgeRows, etudesRows, affaire?.titulaire, editForm?.titulaire])

  const ngeTitulaireByKey = useMemo(() => {
    const byKey = new Map()
    affairesNgeRows.forEach((row) => {
      const key = normalizeAffaireKey(row?.numero_affaire_complet || row?.numero_affaire)
      const value = String(row?.titulaire ?? '').trim()
      if (!key || !value) return
      if (!byKey.has(key)) byKey.set(key, new Set())
      byKey.get(key).add(value)
    })
    const resolved = new Map()
    byKey.forEach((values, key) => {
      if (values.size === 1) resolved.set(key, [...values][0])
    })
    return resolved
  }, [affairesNgeRows])

  const etudeFilialeByKey = useMemo(() => {
    const byKey = new Map()
    etudesRows.forEach((row) => {
      const key = normalizeAffaireKey(row?.numero_etude)
      const value = String(row?.filiale ?? '').trim()
      if (!key || !value) return
      if (!byKey.has(key)) byKey.set(key, new Set())
      byKey.get(key).add(value)
    })
    const resolved = new Map()
    byKey.forEach((values, key) => {
      if (values.size === 1) resolved.set(key, [...values][0])
    })
    return resolved
  }, [etudesRows])

  const suggestedTitulaire = useMemo(() => {
    if (!isEditing) return ''
    if (String(editForm.titulaire || '').trim()) return ''

    const ngeKey = normalizeAffaireKey(editForm.affaire_nge)
    if (ngeKey) return ngeTitulaireByKey.get(ngeKey) || ''

    const etudeKey = normalizeAffaireKey(editForm.numero_etude)
    if (etudeKey) return etudeFilialeByKey.get(etudeKey) || ''

    return ''
  }, [isEditing, editForm, ngeTitulaireByKey, etudeFilialeByKey])

  const dossierNomHero = String(affaire?.dossier_nom || '').trim() || affaire?.reference || ''

  if (isLoading) return <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
  if (isError || !affaire) return (
    <div className="text-xs text-text-muted text-center py-12">
      Affaire introuvable.{' '}
      <button onClick={() => navigate('/affaires')} className="text-nge underline">← Retour</button>
    </div>
  )

  const a = affaire
  const dossierStatusLabel = DOSSIER_STATUS_LABELS[a.dossier_status] || a.dossier_status || '—'
  const dossierModeLabel   = DOSSIER_MODE_LABELS[a.dossier_mode] || a.dossier_mode || '—'
  const distanceCaption = buildDistanceToLabCaption(a.site_geo?.distance_to_lab)
  const hasHighPriority = demandes.some((d) => d.priorite === 'Haute')

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Affaires RST"
        onBack={() => navigate('/affaires')}
        eyebrow="Fiche affaire"
        title={a.reference}
      >
          {isEditing ? (
            <>
              <Button size="sm" onClick={cancelEditing}>Annuler</Button>
              <Button size="sm" variant="primary" onClick={handleSaveEditing} disabled={mutation.isPending}>
                {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={startEditing}>Modifier</Button>
              <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${uid}`)}>Demandes</Button>
              <Button size="sm" onClick={() => navigate(`/passations?affaire_id=${uid}`)}>Passations</Button>
              <Button size="sm" onClick={() => navigate(`/contacts?affaire_id=${uid}`)}>Contacts</Button>
              <button
                onClick={() => navigate(`/demandes?affaire_id=${uid}&create=1`)}
                className="rounded-[11px] border border-[#e7b800] bg-[#ffcc00] text-[#003170] px-3 py-2 text-[12px] font-black shadow-sm hover:brightness-105 transition"
              >
                + Demande
              </button>
              <Button size="sm" onClick={() => navigate(`/passations/new?affaire_id=${uid}`)}>+ Passation</Button>
              <CopyCopilotPromptButton affaireRef={a.reference} />
              <button
                onClick={handleDelete}
                className="rounded-[11px] border border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d] px-3 py-2 text-[12px] font-black shadow-sm hover:brightness-95 transition"
              >
                Supprimer
              </button>
            </>
          )}
      </FicheTopbar>

      <FicheMain>

        {/* ── Hero ── */}
        <section
          className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white"
          style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
        >
          <div
            className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
            style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
          >
            <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />

            <div className="min-w-0 flex-1 basis-[280px]">
              <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
                <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
                RaLab 5 · Affaire RST
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{a.reference}</h1>
                <button
                  onClick={() => { setRefEditVal(a.reference); setRefEditOpen(true) }}
                  className="rounded-full border border-white/25 bg-white/10 text-white px-2.5 py-1.5 text-[11px] font-black hover:bg-white/20 transition"
                >
                  Modifier réf.
                </button>
              </div>
              <div className="mt-3 text-[20px] font-black">{(isEditing ? editForm.chantier : a.chantier) || '—'}</div>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
                {(isEditing ? editForm.client : a.client) && <span>Client : <strong className="text-white">{isEditing ? editForm.client : a.client}</strong></span>}
                {(isEditing ? editForm.site : a.site) && <span>Site : <strong className="text-white">{isEditing ? editForm.site : a.site}</strong></span>}
                {(isEditing ? editForm.responsable : a.responsable) && <span>Responsable : <strong className="text-white">{isEditing ? editForm.responsable : a.responsable}</strong></span>}
                {!isEditing && hasHighPriority ? <span>Priorité : <strong className="text-white">Haute</strong></span> : null}
                {operationalView.nextEcheance !== '—' ? (
                  <span>Prochaine échéance : <strong className="text-white">{operationalView.nextEcheance}</strong></span>
                ) : null}
                {distanceCaption ? (
                  <span>{distanceCaption}</span>
                ) : null}
              </div>
            </div>

            <div className="w-full min-w-[320px] flex-[1.15] max-w-[820px] shrink-0 rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
              <div className="flex flex-wrap justify-end gap-2">
                <span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                  {(isEditing ? editForm.statut : a.statut) === 'En cours' ? 'Affaire active' : (isEditing ? editForm.statut : a.statut) || '—'}
                </span>
                {(isEditing ? editForm.titulaire : a.titulaire) && (
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                    {isEditing ? editForm.titulaire : a.titulaire}
                  </span>
                )}
                {(isEditing ? editForm.filiale : a.filiale) && (
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                    {isEditing ? editForm.filiale : a.filiale}
                  </span>
                )}
              </div>
              <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Nom dossier</div>
              <div
                className="mt-1.5 text-[13px] font-black whitespace-nowrap overflow-hidden text-ellipsis"
                title={dossierNomHero}
              >
                {dossierNomHero}
              </div>
            </div>
          </div>

          {/* Metrics bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
            <MetricCard label="Demandes"      value={demandes.length}    detail="Demandes rattachées à l'affaire" />
            <MetricCard label="Passations"    value={passations.length}  detail="Passations liées" />
            <MetricCard label="Échantillons"  value={metrics.totalEch}   detail="Total déclaré dans les demandes" />
            <MetricCard label="Interventions" value={metrics.totalInt}   detail={metrics.detail || 'Aucune intervention'} />
          </div>
        </section>

        {demandes.length > 0 ? (
          <CopilotImportPanel
            demandes={demandes}
            affaireId={uid}
            affaireRef={a.reference}
            allowCreateMissing
            returnTo={detailReturnTo}
          />
        ) : (
          <CopilotImportPanel
            affaireId={uid}
            affaireRef={a.reference}
            allowCreateMissing
            returnTo={detailReturnTo}
          />
        )}

        {/* ── Two-column grid (lecture + édition, même layout) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5">

          {/* Left column */}
          <div className="flex flex-col gap-5">
            <SectionCard
              title="Identité affaire"
              subtitle="Informations générales et rattachement opérationnel"
              chip={<span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">RST</span>}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FieldCard label="Référence RST" value={a.reference} highlight />
                <EditableFieldCard label="Statut" editing={isEditing} displayValue={<Badge s={a.statut} map={STAT_AFF} />}>
                  <Select value={editForm.statut || ''} onChange={e => patchEditField('statut', e.target.value)} className={`${INLINE_INPUT_CLS} w-full`}>
                    {STATUTS.map(s => <option key={s}>{s}</option>)}
                  </Select>
                </EditableFieldCard>
                <EditableFieldCard label="Titulaire" editing={isEditing} displayValue={a.titulaire || '— Non défini —'}>
                  <Select value={editForm.titulaire || ''} onChange={e => patchEditField('titulaire', e.target.value)} className={`${INLINE_INPUT_CLS} w-full`}>
                    {suggestedTitulaire ? <option value={suggestedTitulaire}>Suggestion source: {suggestedTitulaire}</option> : null}
                    <option value="">— Non défini —</option>
                    {titulaireOptions.filter(t => t !== suggestedTitulaire).map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </EditableFieldCard>
                <EditableFieldCard label="Client" editing={isEditing} displayValue={a.client}>
                  <Input value={editForm.client || ''} onChange={e => patchEditField('client', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Maître d'ouvrage" editing={isEditing} displayValue={a.maitre_ouvrage}>
                  <Input value={editForm.maitre_ouvrage || ''} onChange={e => patchEditField('maitre_ouvrage', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Maître d'œuvre" editing={isEditing} displayValue={a.maitre_oeuvre}>
                  <Input value={editForm.maitre_oeuvre || ''} onChange={e => patchEditField('maitre_oeuvre', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Chantier" editing={isEditing} displayValue={a.chantier} className="sm:col-span-2">
                  <Input value={editForm.chantier || ''} onChange={e => patchEditField('chantier', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Site" editing={isEditing} displayValue={a.site} className="sm:col-span-2">
                  <Input value={editForm.site || ''} onChange={e => patchEditField('site', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Adresse ouvrage" editing={isEditing} displayValue={a.adresse_ouvrage} className="sm:col-span-2">
                  <textarea
                    value={editForm.adresse_ouvrage || ''}
                    onChange={e => patchEditField('adresse_ouvrage', e.target.value)}
                    rows={2}
                    placeholder="Rue, numéro, commune — plan de situation"
                    className={`${INLINE_INPUT_CLS} font-normal`}
                  />
                </EditableFieldCard>
                <EditableFieldCard label="Filiale" editing={isEditing} displayValue={a.filiale}>
                  <Input value={editForm.filiale || ''} onChange={e => patchEditField('filiale', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Responsable affaire NGE" editing={isEditing} displayValue={a.responsable}>
                  <Input value={editForm.responsable || ''} onChange={e => patchEditField('responsable', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Date ouverture" editing={isEditing} displayValue={formatDate(a.date_ouverture)}>
                  <Input type="date" value={editForm.date_ouverture || ''} onChange={e => patchEditField('date_ouverture', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Date prévue début travaux" editing={isEditing} displayValue={a.date_debut_travaux_prevue ? formatDate(a.date_debut_travaux_prevue) : '—'}>
                  <Input type="date" value={editForm.date_debut_travaux_prevue || ''} onChange={e => patchEditField('date_debut_travaux_prevue', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <FieldCard label="Date clôture" value={a.date_cloture ? formatDate(a.date_cloture) : 'En cours'} />
              </div>
            </SectionCard>

            <SectionCard title="Références" subtitle="Numéros externes, étude, affaire NGE et référence manuelle">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <EditableFieldCard label="N° étude" editing={isEditing} displayValue={a.numero_etude}>
                  <Input value={editForm.numero_etude || ''} onChange={e => patchEditField('numero_etude', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="N° affaire NGE" editing={isEditing} displayValue={a.affaire_nge} highlight>
                  <Input value={editForm.affaire_nge || ''} onChange={e => patchEditField('affaire_nge', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Autre référence" editing={isEditing} displayValue={a.autre_reference}>
                  <Input value={editForm.autre_reference || ''} onChange={e => patchEditField('autre_reference', e.target.value)} placeholder="Si pas aff. NGE / étude" className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Nom dossier manuel" editing={isEditing} displayValue={a.dossier_nom} className="sm:col-span-3">
                  <Input value={editForm.dossier_nom || ''} onChange={e => patchEditField('dossier_nom', e.target.value)} placeholder="Laisser vide pour conserver le nom automatique" className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
              </div>
              {isEditing ? (
                <div className="mt-4 grid grid-cols-1 gap-2 text-xs leading-5 text-text-muted">
                  <p>Laisser « Nom dossier manuel » vide si le dossier doit continuer à suivre le nom prévu automatiquement.</p>
                  <p>Remplir « Autre référence » uniquement si l'affaire n'a ni n° affaire NGE ni n° étude.</p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-[#eed06a] bg-[#fff9de] px-4 py-3 text-[12px] leading-relaxed text-[#4d4213]">
                  Nom automatique : Référence — N° étude / NGE — Site — Client_Chantier
                  (Client prioritaire, sinon maître d&apos;ouvrage ; sans titulaire ni maître d&apos;œuvre).
                  Le champ manuel sert uniquement à forcer un nom spécifique.
                </div>
              )}
            </SectionCard>
          </div>

          <div className="flex flex-col gap-5">
            <SectionCard
              title="Vue opérationnelle"
              subtitle="Synthèse rapide"
              chip={<Badge s={isEditing ? editForm.statut : a.statut} map={STAT_AFF} />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldCard label="Priorité" value={hasHighPriority ? 'Haute' : 'Normale'} />
                <FieldCard label="Dernière activité" value={operationalView.latestActivity} />
                <FieldCard label="Prochaine échéance" value={operationalView.nextEcheance} />
                <FieldCard label="Familles actives" value={operationalView.families} className="sm:col-span-2" />
              </div>
            </SectionCard>

            <SectionCard
              title="Organisation ARS"
              subtitle="Référent RST régional vs responsables labo locaux"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-[#c7d2fe] bg-[#eeeffe] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-[#1e3a8a] font-semibold">RST · région ARS</div>
                  <div className="mt-1 font-medium text-[#1e3a8a]">Référent Scientifique et Technique</div>
                  <div className="mt-1 text-xs text-[#334155] leading-relaxed">
                    Périmètre régional — affaires, passations et arbitrages sur SP + PDC.
                    {viewerIsRegionalRst ? ' (votre rattachement)' : ''}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-bg px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted font-semibold">Labos locaux</div>
                  <ul className="mt-2 space-y-1.5 text-xs text-text-muted">
                    {arsLabCodes.map((code) => (
                      <li key={code} className="text-text">{formatLabOrgLine(code, catalog)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        {isEditing && mutation.error && (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
            {mutation.error.message}
          </p>
        )}

        {/* ── Delete error ── */}
        {deleteError && (
          <div className="flex items-start gap-2 px-4 py-3 bg-[#fcebeb] border border-[#f0a0a0] rounded-[18px] text-sm text-[#a32d2d]">
            <span>⛔</span>
            <div className="flex-1">{deleteError}</div>
            <button onClick={() => setDeleteError(null)} className="text-[#a32d2d] hover:opacity-70">×</button>
          </div>
        )}

        <SectionCard
          title="Demandes associées"
          subtitle="Liste des demandes rattachées à cette affaire"
          actions={<Button size="sm" variant="primary" onClick={() => navigate(`/demandes?affaire_id=${uid}`)}>Voir toutes</Button>}
        >
          {demandes.length === 0 ? (
            <div className="text-xs text-[#69758a] text-center py-8">Aucune demande associée à cette affaire</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#dbe1ea]">
              <table className="w-full min-w-[1080px] border-collapse">
                <thead>
                  <tr>
                    {['Référence','Nature / mission','Statut','Priorité','Éch.','Interv.','N° DST','Date demande','Échéance','Demandeur','MàJ'].map(h => (
                      <th key={h} className="border-b border-[#dbe1ea] bg-[#f1f5f9] text-[#69758a] px-3.5 py-2.5 text-left text-[11px] font-black uppercase tracking-[.08em] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demandes.map(d => (
                    <tr
                      key={d.uid}
                      onClick={() => navigate(buildPathWithReturnTo(`/demandes/${d.uid}`, detailReturnTo))}
                      className="border-b border-[#edf1f6] cursor-pointer hover:bg-[#f8f8fc] transition-colors"
                    >
                      <td className="px-3.5 py-3 bg-white"><strong className="text-[#003170] text-xs font-black">{d.reference}</strong></td>
                      <td className="px-3.5 py-3 bg-white text-xs">
                        <div className="font-medium">{d.nature || d.type_mission || '—'}</div>
                        {d.type_mission && d.nature && d.type_mission !== d.nature && (
                          <div className="text-[10px] text-[#69758a]">{d.type_mission}</div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 bg-white"><Badge s={d.statut} map={STAT_DEM} /></td>
                      <td className="px-3.5 py-3 bg-white text-xs">{d.priorite || '—'}</td>
                      <td className="px-3.5 py-3 bg-white text-xs text-center">{d.nb_echantillons || 0}</td>
                      <td className="px-3.5 py-3 bg-white text-xs text-center">
                        <div>{d.nb_interventions || 0}</div>
                        {(() => {
                          const summary = buildTerrainFamiliesSummary(d)
                          return summary ? <div className="text-[10px] text-[#69758a]">{summary}</div> : null
                        })()}
                      </td>
                      <td className="px-3.5 py-3 bg-white text-xs">{d.numero_dst || '—'}</td>
                      <td className="px-3.5 py-3 bg-white text-xs">{d.date_reception ? formatDate(d.date_reception) : '—'}</td>
                      <td className="px-3.5 py-3 bg-white text-xs">{d.date_echeance ? formatDate(d.date_echeance) : '—'}</td>
                      <td className="px-3.5 py-3 bg-white text-xs">{d.demandeur || '—'}</td>
                      <td className="px-3.5 py-3 bg-white text-xs">{d.updated_at ? formatDate(d.updated_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Passations ── */}
        {passations.length > 0 && (
          <SectionCard
            title="Passations associées"
            subtitle="Passations opérationnelles liées à cette affaire"
            actions={<Button size="sm" onClick={() => navigate(`/passations?affaire_id=${uid}`)}>Voir toutes</Button>}
          >
            <div className="divide-y divide-[#e5e9f0]">
              {passations.map(p => (
                <div
                  key={p.uid}
                  onClick={() => navigate(`/passations/${p.uid}`)}
                  className="flex items-center justify-between gap-4 px-2 py-2.5 cursor-pointer hover:bg-[#f8fafc] transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[12px] font-black text-[#003170] shrink-0">{p.reference}</span>
                    <span className="text-[12px] text-[#172033] truncate">{p.operation_type || '—'}</span>
                    <span className="text-[11px] text-[#69758a] shrink-0">{p.phase_operation || '—'}</span>
                  </div>
                  <span className="text-[11px] font-black text-[#003170] shrink-0">→</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Dossier technique ── */}
        <SectionCard
          title="Dossier affaire · zone technique provisoire"
          subtitle="Bloc discret pendant le codage : état local, chemin et synchronisation"
          chip={<Badge s={dossierStatusLabel} map={{ 'Disponible': 'bg-[#eaf3de] text-[#3b6d11]', 'En attente': 'bg-[#f1efe8] text-[#5f5e5a]' }} />}
          technical
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <FieldCard label="Mode" value={dossierModeLabel} />
            <FieldCard label="Statut" value={dossierStatusLabel} />
            <FieldCard label="Racine" value={a.dossier_root} />
            <FieldCard label="Nom dossier actuel" value={a.dossier_nom || '—'} />
            <FieldCard label="Chemin complet" value={a.dossier_path} className="sm:col-span-2 lg:col-span-4" />
            {a.dossier_message && <FieldCard label="Message" value={a.dossier_message} />}
          </div>
          {syncDossierMutation.error && (
            <p className="text-[#a32d2d] text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
              {syncDossierMutation.error.message}
            </p>
          )}
          {openDossierMutation.error && (
            <p className="text-[#a32d2d] text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-3">
              {openDossierMutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-3">
            {a.dossier_can_sync && (
              <Button size="sm" onClick={() => syncDossierMutation.mutate()} disabled={syncDossierMutation.isPending}>
                {syncDossierMutation.isPending ? 'Sync…' : 'Synchroniser'}
              </Button>
            )}
            {a.dossier_can_open && (
              <Button size="sm" variant="primary" onClick={() => openDossierMutation.mutate()} disabled={openDossierMutation.isPending}>
                {openDossierMutation.isPending ? 'Ouverture…' : 'Ouvrir dossier'}
              </Button>
            )}
          </div>
        </SectionCard>
      </FicheMain>

      {/* ═══ Modals ═══ */}
      {refEditOpen && a && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl w-[400px] p-6 shadow-2xl">
            <div className="text-[15px] font-semibold mb-1">Modifier la référence</div>
            <p className="text-[12px] text-text-muted mb-3">Identifiant unique — ne modifier que si nécessaire.</p>
            <input
              value={refEditVal}
              onChange={e => setRefEditVal(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge font-mono mb-4"
              placeholder="2026-RA-0042"
            />
            {refMutation.error ? (
              <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
                {refMutation.error.message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRefEditOpen(false)}>Annuler</Button>
              <Button
                variant="primary"
                disabled={!refEditVal.trim() || refEditVal.trim() === a.reference || refMutation.isPending}
                onClick={() => refMutation.mutate(refEditVal.trim())}
              >
                {refMutation.isPending ? 'Enregistrement…' : '✓ Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FichePageShell>
  )
}

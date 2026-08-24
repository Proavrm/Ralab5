/**
 * DemandePage.jsx — fiche complète d'une demande RST
 * Fidèle à demande.html legacy
 * API: GET /demandes_rst/{uid}  + GET /demandes_rst/{uid}/navigation
 * 2 modaux: configuration préparation/modules + référence (admin)
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, demandesApi, affairesApi, plansImplantationApi, nivellementsApi, calculsApi } from '@/services/api'
import PlanImagesConsultSection from '@/components/plans/PlanImagesConsultSection'
import Button from '@/components/ui/Button'
import InterventionTypeModal, { applyInterventionTypeToPath } from '@/components/interventions/InterventionTypeModal'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { buildLocationTarget, buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { buildEssaiOpenPath } from '@/lib/essaiFeuilleRoutes'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { hasRole } from '@/lib/permissions'
import { MetricCard, FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import CopyCopilotPromptButton from '@/components/copilot/CopyCopilotPromptButton'
import CopilotImportPanel from '@/components/copilot/CopilotImportPanel'
import LabName from '@/components/laboratoire/LabName'
import { useLaboratoireCatalog } from '@/hooks/useLaboratoireCatalog'
import { buildLaboSelectOptions, resolveLaboDisplayName } from '@/lib/laboratoireCatalog'
import DocumentTrackingTable from '@/components/demande/DocumentTrackingTable'
import { DEFAULT_DOCUMENT_DROP_TYPES } from '@/lib/documentDropCatalog'
import { validateDemandeSitePlan, ensureSiteCaptureDocumentRows } from '@/lib/sitePlanRequirements'
import { A4_ORIENTATION_LANDSCAPE, A4_ORIENTATION_PORTRAIT } from '@/lib/sitePlanImageCoords'
import PassationPrestationsSummary from '@/components/demande/PassationPrestationsSummary'
import DemandePrestationsEditor from '@/components/demande/DemandePrestationsEditor'
import PreparationEssaisTable from '@/components/demande/PreparationEssaisTable'
import { buildDistanceToLabCaption } from '@/lib/labGeo'
import { buildG3NotesTechniquesPath } from '@/lib/modeleNTContent'
import { isNoteTechniqueIntervention } from '@/lib/noteTechniqueIntervention'


const DEMANDE_UI_STORAGE_PREFIX = 'ralab5:demande-ui:'

function NoteTechniqueDemandeCard({ note, demandeUid, detailReturnTo, navigate }) {
  return (
    <div className="rounded-[10px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-[#003170]">{note.reference || 'Note technique'}</span>
          <span className="text-[11px] text-text-muted">{formatDate(note.date_intervention) || 'Date à préciser'}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg text-[11px] font-medium text-text-muted">
            {note.statut || '—'}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#dbe1ea] bg-white text-[10px] font-semibold uppercase tracking-[.04em] text-[#69758a]">
            Scope demande
          </span>
        </div>
        <div className="mt-1 text-[13px] text-text line-clamp-2">{note.sujet || note.type_intervention || '—'}</div>
        <div className="mt-1 text-[11px] text-text-muted">
          Rattachée à la demande — pas à une campagne terrain.
        </div>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate(buildPathWithReturnTo(
            buildG3NotesTechniquesPath({ demandeUid, interventionUid: note.uid, returnTo: detailReturnTo }),
            detailReturnTo,
          ))}
        >
          Ouvrir la note
        </Button>
      </div>
    </div>
  )
}

function getDemandeUiStorageKey(uid) {
  return `${DEMANDE_UI_STORAGE_PREFIX}${uid || 'unknown'}`
}

function loadDemandeUiState(uid) {
  if (typeof window === 'undefined') return { expanded: {}, scrollY: 0 }
  try {
    const raw = window.sessionStorage.getItem(getDemandeUiStorageKey(uid))
    if (!raw) return { expanded: {}, scrollY: 0 }
    const parsed = JSON.parse(raw)
    return {
      expanded: parsed?.expanded && typeof parsed.expanded === 'object' ? parsed.expanded : {},
      scrollY: Number.isFinite(Number(parsed?.scrollY)) ? Number(parsed.scrollY) : 0,
    }
  } catch {
    return { expanded: {}, scrollY: 0 }
  }
}

function isPersistedCampaignUid(value) {
  return /^\d+$/.test(String(value ?? '').trim())
}

function persistDemandeUiState(uid, nextState) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      getDemandeUiStorageKey(uid),
      JSON.stringify({
        expanded: nextState?.expanded && typeof nextState.expanded === 'object' ? nextState.expanded : {},
        scrollY: Number.isFinite(Number(nextState?.scrollY)) ? Number(nextState.scrollY) : 0,
      })
    )
  } catch {
    // Ignore storage errors.
  }
}

const RELATED_NODE_TONES = [
  {
    shell: 'border-[#d8e6f6] bg-gradient-to-r from-[#f8fbff] to-[#eef5fd]',
    title: 'text-[#185fa5]',
    meta: 'text-[#58718d]',
    action: 'hover:border-[#8db8e3] hover:text-[#185fa5]',
  },
  {
    shell: 'border-[#dbead8] bg-gradient-to-r from-[#fbfdf8] to-[#eef7ea]',
    title: 'text-[#3b6d11]',
    meta: 'text-[#617756]',
    action: 'hover:border-[#9fc78d] hover:text-[#3b6d11]',
  },
  {
    shell: 'border-[#efe3d5] bg-gradient-to-r from-[#fffaf5] to-[#f9efe4]',
    title: 'text-[#9a5b12]',
    meta: 'text-[#8a6b47]',
    action: 'hover:border-[#d8b183] hover:text-[#9a5b12]',
  },
  {
    shell: 'border-[#e7ddf2] bg-gradient-to-r from-[#fcf9ff] to-[#f3ecfb]',
    title: 'text-[#6d47a8]',
    meta: 'text-[#7a6993]',
    action: 'hover:border-[#b9a1dd] hover:text-[#6d47a8]',
  },
]

function getRelatedNodeTone(level = 0) {
  return RELATED_NODE_TONES[Math.min(level, RELATED_NODE_TONES.length - 1)]
}


const STATUTS   = ['À qualifier','Demande','En Cours','Répondu','Fini','Envoyé - Perdu']
const MISSIONS  = ['À définir','Études G1','Études G2','Exploitation G3','Essais Labo','Avis Technique','Externe','Autre']
const PRIORITES = ['Basse','Normale','Haute','Critique']

const CAMPAIGN_TYPE_OPTIONS = [
  {
    code: 'ENR',
    label: 'Suivi d’enrobés',
    defaults: { type_intervention: 'Suivi d’enrobés', finalite: 'Contrôle de matériaux', materiau: 'Enrobé' },
  },
  {
    code: 'PLT',
    label: 'Contrôle de plateforme',
    defaults: { type_intervention: 'Contrôle de plateforme', finalite: 'Contrôle de plateforme / portance', materiau: 'Plateforme' },
  },
  {
    code: 'CMP',
    label: 'Contrôle de compactage',
    defaults: { type_intervention: 'Contrôle de compactage', finalite: 'Contrôle de compactage', materiau: 'Matériau de terrassement' },
  },
  {
    code: 'ETA',
    label: 'Contrôle de réseaux / étanchéité',
    defaults: { type_intervention: 'Contrôle de réseaux / étanchéité', finalite: 'Étanchéité', materiau: 'Réseau / canalisation' },
  },
  {
    code: 'PER',
    label: 'Infiltration / perméabilité',
    defaults: { type_intervention: 'Infiltration / perméabilité', finalite: 'Infiltration / perméabilité', materiau: 'Ouvrage' },
  },
  {
    code: 'GEO',
    label: 'Reconnaissance géotechnique',
    defaults: { type_intervention: 'Reconnaissance géotechnique', finalite: 'Diagnostic d’anomalie', materiau: 'Sol' },
  },
  {
    code: 'AUT',
    label: 'Autre campagne',
    defaults: {},
  },
]

const CAMPAIGN_CODE_PREFILLS = {
  ...Object.fromEntries(CAMPAIGN_TYPE_OPTIONS.map((item) => [item.code, item.defaults])),
  DE: { type_intervention: 'Suivi d’enrobés', finalite: 'Contrôle de matériaux', materiau: 'Enrobé' },
  DF: { type_intervention: 'Suivi d’enrobés', finalite: 'Contrôle de matériaux', materiau: 'Enrobé' },
  SC: { type_intervention: 'Suivi d’enrobés', finalite: 'Contrôle de matériaux', materiau: 'Enrobé' },
  CFE: { type_intervention: 'Suivi d’enrobés', finalite: 'Contrôle de matériaux', materiau: 'Enrobé' },
  PL: { type_intervention: 'Contrôle de plateforme', finalite: 'Contrôle de plateforme / portance', materiau: 'Plateforme' },
  PDL: { type_intervention: 'Contrôle de plateforme', finalite: 'Contrôle de plateforme / portance', materiau: 'Plateforme' },
  PLD: { type_intervention: 'Contrôle de plateforme', finalite: 'Contrôle de plateforme / portance', materiau: 'Plateforme' },
  DS: { type_intervention: 'Contrôle de compactage', finalite: 'Contrôle de compactage', materiau: 'Matériau de terrassement' },
  'EA-EAU': { type_intervention: 'Contrôle de réseaux / étanchéité', finalite: 'Étanchéité', materiau: 'Réseau / canalisation' },
  'EA-AIR': { type_intervention: 'Contrôle de réseaux / étanchéité', finalite: 'Étanchéité', materiau: 'Réseau / canalisation' },
  ECA: { type_intervention: 'Contrôle de réseaux / étanchéité', finalite: 'Étanchéité', materiau: 'Réseau / canalisation' },
  PER: { type_intervention: 'Infiltration / perméabilité', finalite: 'Percolation', materiau: 'Ouvrage' },
  'PO-PER': { type_intervention: 'Infiltration / perméabilité', finalite: 'Percolation', materiau: 'Ouvrage' },
  PA: { type_intervention: 'Reconnaissance géotechnique', finalite: 'Diagnostic d’anomalie', materiau: 'Sol' },
  SO: { type_intervention: 'Reconnaissance géotechnique', finalite: 'Diagnostic d’anomalie', materiau: 'Sol' },
  'INF-FOR': { type_intervention: 'Reconnaissance géotechnique', finalite: 'Infiltration / perméabilité', materiau: 'Sol' },
  'INF-MAT': { type_intervention: 'Reconnaissance géotechnique', finalite: 'Infiltration / perméabilité', materiau: 'Sol' },
}

const CAMPAIGN_LABEL_PREFILLS = Object.fromEntries(
  CAMPAIGN_TYPE_OPTIONS
    .filter((item) => Object.keys(item.defaults || {}).length > 0)
    .map((item) => [item.label, item.defaults])
)

const STAT_CLS = {
  'À qualifier':'bg-[#f1efe8] text-[#5f5e5a]','Demande':'bg-[#e6f1fb] text-[#185fa5]',
  'En Cours':'bg-[#eaf3de] text-[#3b6d11]','Répondu':'bg-[#eeedfe] text-[#534ab7]',
  'Fini':'bg-[#e0f5ef] text-[#0f6e56]','Envoyé - Perdu':'bg-[#fcebeb] text-[#a32d2d]',
}
const PRIO_CLS = {
  'Basse':'bg-[#f1efe8] text-[#5f5e5a]','Normale':'bg-[#e6f1fb] text-[#185fa5]',
  'Haute':'bg-[#faeeda] text-[#854f0b]','Critique':'bg-[#fcebeb] text-[#a32d2d]',
}

function Badge({ s, map }) {
  if (!s) return null
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${(map||{})[s]||'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
}
function FieldRow({ label, value, warn }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border last:border-0">
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      <span className={`text-[13px] font-medium text-right ${!value ? 'text-text-muted italic font-normal' : ''} ${warn ? 'text-danger font-bold' : ''}`}>
        {value || '—'}
      </span>
    </div>
  )
}
function Card({ title, children, action }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function InlineMeta({ label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1 text-[11px]">
      <span className="font-medium text-text-muted">{label}</span>
      <span className={`font-semibold ${!value ? 'text-text-muted italic font-normal' : 'text-text'}`}>{value || '—'}</span>
    </div>
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
const INLINE_TEXTAREA_CLS = `${INLINE_INPUT_CLS} resize-y min-h-[72px]`

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

function normalizeNonEmpty(value) {
  const normalized = String(value || '').trim()
  return normalized || ''
}

function getUniqueNonEmptyValues(values) {
  return [...new Set((values || []).map((value) => normalizeNonEmpty(value)).filter(Boolean))]
}

function getSubjectParts(subject) {
  return normalizeNonEmpty(subject)
    .split('/')
    .map((part) => normalizeNonEmpty(part))
    .filter(Boolean)
}

function getCampaignLocationDefault(campaign, preparation, demande) {
  if (normalizeNonEmpty(campaign?.zone_scope)) return campaign.zone_scope
  const locations = getUniqueNonEmptyValues((campaign?.interventions || []).map((item) => getSubjectParts(item?.sujet)?.[0] || ''))

  if (locations.length === 1) return locations[0]
  if (normalizeNonEmpty(preparation?.zone_localisation)) return preparation.zone_localisation
  return normalizeNonEmpty(demande?.chantier)
}

function getCampaignSharedSubjectTail(campaign) {
  const tails = getUniqueNonEmptyValues(
    (campaign?.interventions || []).map((item) => getSubjectParts(item?.sujet).slice(1).join(' / '))
  )
  return tails.length === 1 ? tails[0] : ''
}

function getCampaignPrefillDefaults(campaign) {
  const code = normalizeNonEmpty(campaign?.code).toUpperCase()
  const label = normalizeNonEmpty(campaign?.label)
  return CAMPAIGN_CODE_PREFILLS[code] || CAMPAIGN_LABEL_PREFILLS[label] || {}
}

function buildCampaignCreateDefaults(campaign, preparation, demande) {
  const codeDefaults = getCampaignPrefillDefaults(campaign)
  const campaignTypes = getUniqueNonEmptyValues((campaign?.interventions || []).map((item) => item?.type_intervention))
  const validCampaignType = campaignTypes.find((value) => Object.values(CAMPAIGN_CODE_PREFILLS).some((item) => item.type_intervention === value)) || ''
  const sharedTail = getCampaignSharedSubjectTail(campaign)

  return {
    type_intervention: validCampaignType || codeDefaults.type_intervention || normalizeNonEmpty(preparation?.type_intervention_prevu),
    finalite: codeDefaults.finalite || normalizeNonEmpty(preparation?.finalite),
    zone: getCampaignLocationDefault(campaign, preparation, demande),
    materiau: codeDefaults.materiau || normalizeNonEmpty(preparation?.materiau_objet),
    objectif: [normalizeNonEmpty(campaign?.programme_specifique), normalizeNonEmpty(campaign?.designation), sharedTail || normalizeNonEmpty(campaign?.reference)]
      .filter(Boolean)
      .join(' · ') || normalizeNonEmpty(preparation?.objectif_mission) || normalizeNonEmpty(demande?.nature),
    responsable: normalizeNonEmpty(campaign?.responsable_technique) || normalizeNonEmpty(preparation?.responsable_referent),
    attribue_a: normalizeNonEmpty(campaign?.attribue_a) || normalizeNonEmpty(preparation?.attribue_a),
  }
}

function buildCreateInterventionHref(demandeUid, preparation, campaign, demande, detailReturnTo) {
  const defaults = buildCampaignCreateDefaults(campaign, preparation, demande)
  const params = new URLSearchParams()
  params.set('demande_id', String(demandeUid || ''))
  params.set('source', campaign?.uid ? 'campagne' : 'preparation')
  if (campaign?.uid) params.set('campaign_uid', String(campaign.uid))
  if (campaign?.reference) params.set('campaign_ref', campaign.reference)
  if (campaign?.code) params.set('campaign_code', campaign.code)
  if (campaign?.label) params.set('campaign_label', campaign.label)
  if (campaign?.designation) params.set('campaign_designation', campaign.designation)
  if (campaign?.programme_specifique) params.set('campaign_programme', campaign.programme_specifique)
  if (campaign?.zone_scope) params.set('campaign_zone', campaign.zone_scope)
  if (campaign?.temporalite) params.set('campaign_temporalite', campaign.temporalite)
  if (campaign?.nb_points_prevus != null && campaign?.nb_points_prevus !== '') params.set('campaign_nb_points', String(campaign.nb_points_prevus))
  if (campaign?.types_essais_prevus) params.set('campaign_essais', campaign.types_essais_prevus)
  if (campaign?.responsable_technique) params.set('campaign_responsable', campaign.responsable_technique)
  if (campaign?.attribue_a) params.set('campaign_attribue_a', campaign.attribue_a)

  if (defaults.type_intervention) params.set('type_intervention', defaults.type_intervention)
  if (defaults.finalite) params.set('finalite', defaults.finalite)
  if (defaults.zone) params.set('zone', defaults.zone)
  if (defaults.materiau) params.set('materiau', defaults.materiau)
  if (defaults.objectif) params.set('objectif', defaults.objectif)
  if (defaults.responsable) params.set('responsable', defaults.responsable)
  if (defaults.attribue_a) params.set('attribue_a', defaults.attribue_a)

  return buildPathWithReturnTo(`/interventions/new?${params.toString()}`, detailReturnTo)
}

function getInterventionObjectLabel(item) {
  if (item?.kind === 'plan_implantation') return "Plan d'implantation"
  if (item?.kind === 'nivellement') return 'Nivellement'
  if (item?.kind === 'feuille_terrain') return 'Feuille terrain'
  if (item?.kind === 'prelevement') return 'Prélèvement'
  if (item?.kind === 'echantillon') return 'Échantillon'
  if (item?.kind === 'essai') return 'Essai labo'
  return 'Objet lié'
}

function getRelatedNodeKey(item) {
  return `related:${item?.kind || 'item'}:${item?.uid || item?.reference || 'unknown'}`
}

function collectSupportObjectsByIntervention(interventions) {
  const groups = []
  const list = Array.isArray(interventions) ? interventions : []
  list.forEach((intervention) => {
    const relatedObjects = Array.isArray(intervention?.related_objects) ? intervention.related_objects : []
    const supportObjects = relatedObjects.filter((item) => item?.category === 'support')
    if (!supportObjects.length) return

    const deduped = new Map()
    supportObjects.forEach((item) => {
      const key = `${item?.kind || 'support'}:${item?.uid || item?.reference || item?.title || item?.subtitle || ''}`
      if (!deduped.has(key)) deduped.set(key, item)
    })

    groups.push({
      intervention_uid: intervention?.uid,
      intervention_reference: intervention?.reference || `Intervention #${intervention?.uid || '—'}`,
      objects: Array.from(deduped.values()),
    })
  })
  return groups
}

function openRelatedObject(navigate, item, detailReturnTo) {
  if (!item?.uid) return
  if (item.kind === 'plan_implantation') {
    navigate(buildPathWithReturnTo(`/plans-implantation/${item.uid}?mode=consultation`, detailReturnTo))
    return
  }
  if (item.kind === 'nivellement') {
    navigate(buildPathWithReturnTo(`/nivellements/${item.uid}`, detailReturnTo))
    return
  }
  if (item.kind === 'feuille_terrain') {
    navigate(buildPathWithReturnTo(`/feuilles-terrain/${item.uid}`, detailReturnTo))
    return
  }
  if (item.kind === 'prelevement') {
    navigate(buildPathWithReturnTo(`/prelevements/${item.uid}`, detailReturnTo))
    return
  }
  if (item.kind === 'echantillon') {
    navigate(buildPathWithReturnTo(`/echantillons/${item.uid}`, detailReturnTo))
    return
  }
  if (item.kind === 'essai') {
    if (item.pmt_essai_id) {
      navigate(buildPathWithReturnTo(`/modeles/pmt?essai_id=${item.pmt_essai_id}`, detailReturnTo))
      return
    }
    navigate(buildEssaiOpenPath(item, detailReturnTo) || buildPathWithReturnTo(`/essais/${item.uid}`, detailReturnTo))
  }
}

function isDeletableSupportObject(item) {
  return ['plan_implantation', 'nivellement'].includes(item?.kind) && item?.uid
}

function getSupportDeleteConfirmMessage(item) {
  const label = item?.reference || getInterventionObjectLabel(item)
  if (item?.kind === 'nivellement') {
    return `Supprimer le nivellement ${label} ?\n\nLa fiche NI sera supprimée. Les altitudes Z sur les points terrain restent inchangées.`
  }
  return `Supprimer le plan d'implantation ${label} ?\n\nLe canevas et les implantations planimétriques seront supprimés. Les points terrain restent inchangés.`
}

function RelatedObjectNode({
  item,
  navigate,
  detailReturnTo,
  level = 0,
  getExpandedState,
  setExpandedState,
  onDeleteSupportObject = null,
  deletingSupportKey = '',
}) {
  const children = Array.isArray(item?.children) ? item.children : []
  const hasChildren = children.length > 0
  const isNavigable = ['plan_implantation', 'nivellement', 'feuille_terrain', 'prelevement', 'echantillon', 'essai'].includes(item?.kind)
  const nodeKey = getRelatedNodeKey(item)
  const isOpen = getExpandedState(nodeKey, false)
  const tone = getRelatedNodeTone(level)
  const canDelete = isDeletableSupportObject(item) && typeof onDeleteSupportObject === 'function'
  const deleteKey = canDelete ? `${item.kind}:${item.uid}` : ''
  const isDeleting = Boolean(deletingSupportKey && deletingSupportKey === deleteKey)

  const deleteButton = canDelete ? (
    <Button
      size="sm"
      variant="danger"
      disabled={isDeleting}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onDeleteSupportObject(item)
      }}
    >
      {isDeleting ? '…' : 'Supprimer'}
    </Button>
  ) : null

  const mainContent = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-[12px] font-semibold ${isNavigable ? tone.title : 'text-text'}`}>
            {item.reference || getInterventionObjectLabel(item)}
          </div>
          <div className={`mt-1 text-[11px] ${tone.meta}`}>
            {[getInterventionObjectLabel(item), item.title, item.subtitle].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className={`text-[11px] ${tone.meta}`}>{formatDate(item.date) || item.statut || '—'}</div>
      </div>
      {(item.result_label || item.result_value || item.statut) ? (
        <div className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] ${tone.meta}`}>
          {item.statut ? (
            <span className="inline-flex items-center rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-text-muted">
              {item.statut}
            </span>
          ) : null}
          {item.result_label ? <span>{item.result_label}</span> : null}
          {item.result_value ? <span>{item.result_value}</span> : null}
        </div>
      ) : null}
    </>
  )

  if (!hasChildren) {
    return (
      <div className={`rounded-lg border ${tone.shell}`} style={{ marginLeft: level > 0 ? `${level * 14}px` : 0 }}>
        <div className="flex items-start gap-2 px-3 py-2">
          {isNavigable ? (
            <button
              type="button"
              onClick={() => openRelatedObject(navigate, item, detailReturnTo)}
              className="min-w-0 flex-1 text-left transition-colors hover:bg-white/40 rounded-lg"
            >
              {mainContent}
            </button>
          ) : (
            <div className="min-w-0 flex-1">{mainContent}</div>
          )}
          {deleteButton ? <div className="shrink-0 pt-0.5">{deleteButton}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border ${tone.shell}`} style={{ marginLeft: level > 0 ? `${level * 14}px` : 0 }}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (isNavigable) openRelatedObject(navigate, item, detailReturnTo)
            else setExpandedState(nodeKey, !isOpen)
          }}
          className="min-w-0 flex-1 text-left transition-colors hover:bg-white/30 rounded-lg px-1 py-0.5"
        >
          {mainContent}
        </button>
        <div className="flex items-center gap-2 pt-0.5 shrink-0">
          {deleteButton}
          {isNavigable ? (
            <button
              type="button"
              onClick={() => openRelatedObject(navigate, item, detailReturnTo)}
              className={`px-2.5 py-1 rounded border border-white/70 bg-white/70 text-[11px] font-medium text-text-muted transition-colors ${tone.action}`}
            >
              Ouvrir
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpandedState(nodeKey, !isOpen)}
            className={`h-7 w-7 rounded border border-white/70 bg-white/70 text-[13px] text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''} ${tone.action}`}
            aria-label={isOpen ? 'Replier' : 'Déplier'}
          >
            ▾
          </button>
        </div>
      </div>
      {isOpen ? (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {children.map((child) => (
            <RelatedObjectNode
              key={`${child.kind}-${child.uid}`}
              item={child}
              navigate={navigate}
              detailReturnTo={detailReturnTo}
              level={level + 1}
              getExpandedState={getExpandedState}
              setExpandedState={setExpandedState}
              onDeleteSupportObject={onDeleteSupportObject}
              deletingSupportKey={deletingSupportKey}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function InterventionRelatedObjectsList({
  intervention,
  detailReturnTo,
  navigate,
  enabled,
  onLoadedCount,
  getExpandedState,
  setExpandedState,
  onDeleteSupportObject = null,
  deletingSupportKey = '',
}) {
  const relatedObjects = Array.isArray(intervention?.related_objects) ? intervention.related_objects : []

  useEffect(() => {
    if (enabled) {
      onLoadedCount?.(relatedObjects.length)
    }
  }, [enabled, relatedObjects, onLoadedCount])

  const groupedObjects = useMemo(() => {
    const groups = {
      support: [],
      terrain: [],
      prelevement: [],
      echantillon: [],
      essai: [],
    }

    relatedObjects.forEach((item) => {
      const category = item?.category || 'support'
      if (!groups[category]) groups[category] = []
      groups[category].push(item)
    })

    return groups
  }, [relatedObjects])

  const sections = [
    { key: 'support', label: 'Fiches support de campagne' },
    { key: 'terrain', label: 'Feuilles terrain' },
    { key: 'prelevement', label: 'Chaîne prélèvement → échantillon → essai' },
    { key: 'echantillon', label: 'Échantillons orphelins / directs' },
    { key: 'essai', label: 'Essais labo directs' },
  ]

  if (!enabled) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">Objets liés</div>
        <div className="text-[11px] text-text-muted">
          {`${relatedObjects.length} objet${relatedObjects.length > 1 ? 's' : ''}`}
        </div>
      </div>

      {relatedObjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg px-3 py-2 text-[12px] text-text-muted">
          Aucun objet lié pour cette intervention.
        </div>
      ) : null}

      {sections.map((section) => {
        const items = groupedObjects[section.key] || []
        if (!items.length) return null

        return (
          <div key={section.key} className="flex flex-col gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">{section.label}</div>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <RelatedObjectNode
                  key={`${item.kind}-${item.uid}`}
                  item={item}
                  navigate={navigate}
                  detailReturnTo={detailReturnTo}
                  getExpandedState={getExpandedState}
                  setExpandedState={setExpandedState}
                  onDeleteSupportObject={onDeleteSupportObject}
                  deletingSupportKey={deletingSupportKey}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InterventionAccordion({
  intervention,
  detailReturnTo,
  navigate,
  getExpandedState,
  setExpandedState,
  onDeleteSupportObject = null,
  deletingSupportKey = '',
}) {
  const [loadedEssaiCount, setLoadedEssaiCount] = useState(null)
  const accordionKey = `intervention:${intervention?.uid || 'unknown'}`
  const isOpen = getExpandedState(accordionKey, false)
  const importedObjectCount = Math.max(Number(intervention?.related_object_count || 0), Number(intervention?.essai_count || 0))
  const objectCount = loadedEssaiCount ?? importedObjectCount
  const summaryParts = []
  if (intervention?.support_object_count) summaryParts.push(`${intervention.support_object_count} support`)
  if (intervention?.terrain_sheet_count) summaryParts.push(`${intervention.terrain_sheet_count} feuille${intervention.terrain_sheet_count > 1 ? 's' : ''} terrain`)
  if (intervention?.prelevement_count) summaryParts.push(`${intervention.prelevement_count} prélèvement${intervention.prelevement_count > 1 ? 's' : ''}`)
  if (intervention?.echantillon_count) summaryParts.push(`${intervention.echantillon_count} éch.`)
  if (intervention?.essai_count) summaryParts.push(`${intervention.essai_count} essai${intervention.essai_count > 1 ? 's' : ''}`)
  const essaiSummary = loadedEssaiCount != null
    ? (objectCount > 0 ? `${objectCount} objet${objectCount > 1 ? 's' : ''} lié${objectCount > 1 ? 's' : ''}` : 'Aucun objet lié')
    : (objectCount > 0 ? `${objectCount} objet${objectCount > 1 ? 's' : ''} lié${objectCount > 1 ? 's' : ''}` : 'Objets visibles dans le détail')

  return (
    <details
      open={isOpen}
      className="rounded-[10px] border border-border bg-surface group/intervention"
      onToggle={(event) => setExpandedState(accordionKey, event.currentTarget.open)}
    >
      <summary className="list-none cursor-pointer px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-nge">{intervention.reference || 'Intervention'}</span>
              <span className="text-[11px] text-text-muted">{formatDate(intervention.date_intervention) || 'Date à préciser'}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-bg text-[11px] font-medium text-text-muted">
                {intervention.statut || '—'}
              </span>
            </div>
            <div className="mt-1 text-[13px] text-text line-clamp-2">{intervention.sujet || intervention.type_intervention || '—'}</div>
            <div className="mt-1 text-[11px] text-text-muted">
              {[essaiSummary, ...summaryParts].filter(Boolean).join(' · ')}
            </div>
          </div>
          <span className="text-[14px] text-text-muted transition-transform group-open/intervention:rotate-180">▾</span>
        </div>
      </summary>

      <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate(buildPathWithReturnTo(`/interventions/${intervention.uid}`, detailReturnTo))}>
            Intervention
          </Button>
        </div>

        <InterventionRelatedObjectsList
          intervention={intervention}
          detailReturnTo={detailReturnTo}
          navigate={navigate}
          enabled={isOpen}
          onLoadedCount={setLoadedEssaiCount}
          getExpandedState={getExpandedState}
          setExpandedState={setExpandedState}
          onDeleteSupportObject={onDeleteSupportObject}
          deletingSupportKey={deletingSupportKey}
        />
      </div>
    </details>
  )
}

function CampaignAccordion({
  campaign,
  isVirtual,
  detailReturnTo,
  navigate,
  onCreateIntervention,
  onEditCampaign,
  getExpandedState,
  setExpandedState,
  onDeleteSupportObject = null,
  deletingSupportKey = '',
}) {
  const accordionKey = `campaign:${campaign?.uid || campaign?.reference || 'unknown'}`
  const isOpen = getExpandedState(accordionKey, false)
  const campaignSupportGroups = useMemo(
    () => collectSupportObjectsByIntervention(campaign?.interventions || []),
    [campaign?.interventions]
  )
  const campaignSupportCount = campaignSupportGroups.reduce((total, group) => total + group.objects.length, 0)

  return (
    <details
      open={isOpen}
      className="rounded-[10px] border border-border bg-bg group"
      onToggle={(event) => setExpandedState(accordionKey, event.currentTarget.open)}
    >
      <summary className="list-none cursor-pointer px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[14px] font-semibold text-nge">{campaign.reference || campaign.label}</div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border bg-surface text-[11px] font-medium text-text-muted">
                {campaign.label}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#d8ead1] bg-[#edf8e8] text-[11px] font-medium text-[#3b6d11]">
                {campaign.intervention_count || 0} intervention{campaign.intervention_count > 1 ? 's' : ''}
              </span>
              {campaign.report_ref ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#e0f5ef] text-[#0f6e56] text-[11px] font-semibold">
                  {campaign.report_ref}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-[12px] text-text-muted line-clamp-2">
              {campaign.programme_specifique || campaign.designation || campaign.zone_scope || campaign.temporalite || 'Campagne à cadrer'}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            <span>{campaign.preparation_status || campaign.statut || '—'}</span>
            <span className="text-[14px] transition-transform group-open:rotate-180">▾</span>
          </div>
        </div>
      </summary>

      <div className="border-t border-border px-4 py-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">Programme concret</div>
            <div className="mt-1 text-text">{campaign.programme_specifique || campaign.designation || 'Programme à préciser'}</div>
            <div className="mt-1 text-[11px] text-text-muted">
              {campaign.zone_scope || 'Zone à préciser'}{campaign.temporalite ? ` · ${campaign.temporalite}` : ''}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">Pilotage</div>
            <div className="mt-1 text-text">{campaign.statut || 'À cadrer'}</div>
            <div className="mt-1 text-[11px] text-text-muted">
              {[campaign.responsable_technique, campaign.attribue_a, campaign.priorite].filter(Boolean).join(' · ') || campaign.workflow_label || campaign.next_step || '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">Cadre technique</div>
            <div className="mt-1 text-text">{campaign.types_essais_prevus || 'Types d’essais à préciser'}</div>
            <div className="mt-1 text-[11px] text-text-muted">
              {campaign.nb_points_prevus ? `${campaign.nb_points_prevus} point(s) prévus` : 'Nombre de points non précisé'}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">Critères et livrables</div>
            <div className="mt-1 text-text">{campaign.criteres_controle || 'Critères de contrôle à préciser'}</div>
            <div className="mt-1 text-[11px] text-text-muted">{campaign.livrables_attendus || 'Livrables à préciser'}</div>
          </div>
        </div>

        {campaignSupportCount > 0 ? (
          <details className="rounded-lg border border-border/60 bg-surface/50 px-3 py-2">
            <summary className="cursor-pointer select-none text-[10px] font-medium uppercase tracking-[.06em] text-text-muted/70">
              PI / NI <span className="ml-1 font-normal normal-case text-text-muted/50">({campaignSupportCount})</span>
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {campaignSupportGroups.map((group) => (
                <div key={group.intervention_uid || group.intervention_reference} className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold text-nge">{group.intervention_reference}</div>
                  <div className="flex flex-col gap-2">
                    {group.objects.map((item) => (
                      <RelatedObjectNode
                        key={`${item.kind}-${item.uid}`}
                        item={item}
                        navigate={navigate}
                        detailReturnTo={detailReturnTo}
                        getExpandedState={getExpandedState}
                        setExpandedState={setExpandedState}
                        onDeleteSupportObject={onDeleteSupportObject}
                        deletingSupportKey={deletingSupportKey}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!isVirtual ? (
            <Button size="sm" variant="secondary" onClick={() => onEditCampaign?.(campaign)}>
              Configurer la campagne
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={() => onCreateIntervention?.(campaign)}>
            Créer une intervention
          </Button>
        </div>

        {(campaign.interventions || []).length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">Interventions</div>
            {(campaign.interventions || []).map((item) => (
              <InterventionAccordion
                key={item.uid}
                intervention={item}
                detailReturnTo={detailReturnTo}
                navigate={navigate}
                getExpandedState={getExpandedState}
                setExpandedState={setExpandedState}
                onDeleteSupportObject={onDeleteSupportObject}
                deletingSupportKey={deletingSupportKey}
              />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  )
}

function FG({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function buildEditForm(demande) {
  if (!demande) return {}
  return {
    labo_code: demande.labo_code || 'SP',
    statut: demande.statut || 'À qualifier',
    priorite: demande.priorite || 'Normale',
    type_mission: demande.type_mission || '',
    nature: demande.nature || '',
    numero_dst: demande.numero_dst || '',
    domaine_etude: demande.domaine_etude || '',
    type_prestation_attendue: demande.type_prestation_attendue || '',
    documents_fournis: demande.documents_fournis || '',
    lien_pieces_jointes: demande.lien_pieces_jointes || '',
    service_interne: demande.service_interne || '',
    societe_interne: demande.societe_interne || '',
    urgence_source: demande.urgence_source || '',
    demandeur: demande.demandeur || '',
    date_reception: demande.date_reception || '',
    date_echeance: demande.date_echeance || '',
    date_cloture: demande.date_cloture || '',
    description: demande.description || '',
    observations: demande.observations || '',
    a_revoir: !!demande.a_revoir,
    note_reconciliation: demande.note_reconciliation || '',
    suivi_notes: demande.suivi_notes || '',
    rapport_ref: demande.rapport_ref || '',
    rapport_envoye: !!demande.rapport_envoye,
    devis_ref: demande.devis_ref || '',
    facture_ref: demande.facture_ref || '',
    adresse_ouvrage: demande.adresse_ouvrage || '',
  }
}

function sanitizeDemandeUpdate(form) {
  const payload = { ...form }
  for (const key of ['date_reception', 'date_echeance', 'date_cloture']) {
    if (payload[key] === '') payload[key] = null
  }
  return payload
}

// ── Modal Configuration ───────────────────────────────────────────────────────
function ConfigModal({ open, onClose, uid, nav }) {
  const prep   = nav?.preparation || {}
  const modules = nav?.modules || []
  const qc = useQueryClient()

  const [form, setForm] = useState({})
  const [mods, setMods] = useState([])

  useEffect(() => {
    if (open) {
      setForm({
        phase_operation:          prep.phase_operation          || '',
        attentes_client:          prep.attentes_client          || '',
        contexte_operationnel:    prep.contexte_operationnel    || '',
        objectifs:                prep.objectifs                || '',
        points_vigilance:         prep.points_vigilance         || '',
        contraintes_acces:        prep.contraintes_acces        || '',
        contraintes_delais:       prep.contraintes_delais       || '',
        contraintes_hse:          prep.contraintes_hse          || '',
        programme_previsionnel:   prep.programme_previsionnel   || '',
        ressources_notes:         prep.ressources_notes         || '',
        commentaires:             prep.commentaires             || '',
      })
      setMods(modules.map(m => ({ ...m })))
    }
  }, [open, nav])

  const prepMutation = useMutation({
    mutationFn: (data) => api.put(`/demandes_rst/${uid}/preparation`, data),
  })
  const modsMutation = useMutation({
    mutationFn: (data) => api.put(`/demandes_rst/${uid}/enabled-modules`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demande-nav', uid] })
      qc.invalidateQueries({ queryKey: ['demande-nav-card', uid] })
      onClose()
    },
  })

  function handleSave() {
    prepMutation.mutate(form)
    modsMutation.mutate({ modules: mods.map(m => ({ module_code: m.module_code, is_enabled: m.is_enabled })) })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function toggleMod(code) {
    setMods(ms => ms.map(m => m.module_code === code ? { ...m, is_enabled: !m.is_enabled } : m))
  }

  const phases = ['','G1','G2 AVP','G2 PRO','G2 DCE','G3','G4','Autre']

  return (
    <Modal open={open} onClose={onClose} title="Configuration — Préparation & Modules" size="xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <FG label="Phase opération" full>
            <Select value={form.phase_operation || ''} onChange={e => set('phase_operation', e.target.value)} className="w-full">
              {phases.map(p => <option key={p}>{p}</option>)}
            </Select>
          </FG>
          {[
            ['attentes_client',          'Attentes client'],
            ['contexte_operationnel',    'Contexte opérationnel'],
            ['objectifs',                'Objectifs'],
            ['points_vigilance',         'Points de vigilance'],
            ['contraintes_acces',        'Accès site / contraintes accès'],
            ['contraintes_delais',       'Contraintes / délais'],
            ['contraintes_hse',          'HSE'],
            ['programme_previsionnel',   'Programme d\'investigations'],
            ['ressources_notes',         'Ressources'],
            ['commentaires',             'Commentaires'],
          ].map(([k, label]) => (
            <FG key={k} label={label} full>
              <textarea value={form[k] || ''} onChange={e => set(k, e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge resize-y" />
            </FG>
          ))}
        </div>

        {mods.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">Modules disponibles</div>
              <div className="text-[11px] text-text-muted">
                {mods.filter((item) => item.is_enabled).length} activé{mods.filter((item) => item.is_enabled).length > 1 ? 's' : ''} / {mods.length}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {mods.map(m => (
                <label key={m.module_code} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors ${
                  m.is_enabled ? 'border-nge bg-[#eeeffe] text-nge' : 'border-border text-text-muted'
                }`}>
                  <input type="checkbox" checked={!!m.is_enabled} onChange={() => toggleMod(m.module_code)} className="hidden" />
                  {m.is_enabled ? '✓' : '○'} {m.label || m.module_code}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="secondary">Annuler</Button>
          <Button onClick={handleSave} variant="primary" disabled={prepMutation.isPending || modsMutation.isPending}>
            {(prepMutation.isPending || modsMutation.isPending) ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function DemandePage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = hasRole(user, ['admin'])
  const { catalog } = useLaboratoireCatalog()
  const laboSelectOptions = useMemo(
    () => buildLaboSelectOptions(catalog, ['RST']),
    [catalog],
  )
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [interventionCreateDraft, setInterventionCreateDraft] = useState(null)
  const [refEditOpen, setRefEditOpen] = useState(false)
  const [refEditVal,  setRefEditVal]  = useState('')
  const [demande, setDemande] = useState(null)
  const [uiState, setUiState] = useState(() => loadDemandeUiState(uid))
  const uiStateRef = useRef(loadDemandeUiState(uid))
  const hasRestoredScrollRef = useRef(false)

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['demande', uid],
    queryFn: () => demandesApi.get(uid),
    enabled: !!uid,
  })

  const { data: nav } = useQuery({
    queryKey: ['demande-nav', uid],
    queryFn: () => api.get(`/demandes_rst/${uid}/navigation`),
    enabled: !!uid,
  })

  const { data: linkedCalculs = [] } = useQuery({
    queryKey: ['calculs', 'demande', uid],
    queryFn: () => calculsApi.list({ demande_id: Number(uid) }),
    enabled: Boolean(uid),
  })

  const { data: demandePlansImplantationFull = [] } = useQuery({
    queryKey: ['plans-implantation', 'demande', uid],
    queryFn: () => plansImplantationApi.list({ demande_id: Number(uid) }),
    enabled: Boolean(uid),
  })

  const affaireUid = raw?.affaire_rst_id
  const { data: demandePlanImagesData } = useQuery({
    queryKey: ['affaire-plan-images', affaireUid],
    queryFn: () => affairesApi.listPlanImages(affaireUid),
    enabled: Boolean(affaireUid),
  })

  useEffect(() => { if (raw) setDemande(raw) }, [raw])

  const saveMutation = useMutation({
    mutationFn: (data) => api.put(`/demandes_rst/${uid}`, data),
    onSuccess: (saved) => {
      setDemande(saved)
      qc.setQueryData(['demande', uid], saved)
      qc.invalidateQueries({ queryKey: ['demandes'] })
      setIsEditing(false)
    },
  })

  const [prestationsForm, setPrestationsForm] = useState([])

  useEffect(() => {
    setPrestationsForm(nav?.demande_prestations || [])
  }, [nav?.demande_prestations])

  const prestationsMutation = useMutation({
    mutationFn: (prestations) => api.put(`/demandes_rst/${uid}/prestations`, { prestations }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demande-nav', uid] })
    },
  })

  const [deletingSupportKey, setDeletingSupportKey] = useState('')

  const deleteSupportObjectMutation = useMutation({
    mutationFn: async (item) => {
      if (item.kind === 'plan_implantation') {
        await plansImplantationApi.delete(item.uid)
        return
      }
      if (item.kind === 'nivellement') {
        await nivellementsApi.delete(item.uid)
        return
      }
      throw new Error('Type non supporté')
    },
    onMutate: (item) => setDeletingSupportKey(`${item.kind}:${item.uid}`),
    onSettled: () => setDeletingSupportKey(''),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['demande-nav', uid] }),
        qc.invalidateQueries({ queryKey: ['plans-implantation', 'demande', uid] }),
        qc.invalidateQueries({ queryKey: ['plans-implantation'] }),
        qc.invalidateQueries({ queryKey: ['nivellements'] }),
      ])
    },
  })

  const handleDeleteSupportObject = useCallback((item) => {
    if (!isDeletableSupportObject(item)) return
    if (!window.confirm(getSupportDeleteConfirmMessage(item))) return
    deleteSupportObjectMutation.mutate(item)
  }, [deleteSupportObjectMutation])

  const [documentsForm, setDocumentsForm] = useState([])

  useEffect(() => {
    const mapped = (nav?.documents || []).map((doc) => ({
      uid: doc.uid,
      document_type: doc.document_type || '',
      is_received: !!doc.is_received,
      version: doc.version || '',
      document_date: doc.document_date || null,
      uploaded_at: doc.uploaded_at || null,
      comment: doc.comment || '',
      stored_path: doc.stored_path || '',
    }))
    setDocumentsForm(ensureSiteCaptureDocumentRows(mapped))
  }, [nav?.documents])

  async function handleSaveDocuments(nextDocs) {
    const docs = Array.isArray(nextDocs) ? nextDocs : documentsForm
    const sitePlanErr = validateDemandeSitePlan({
      adresseOuvrage: demande?.adresse_ouvrage || editForm.adresse_ouvrage || '',
      documents: docs,
      passationUid: nav?.passation_uid || null,
    })
    if (sitePlanErr) {
      window.alert(sitePlanErr)
      return
    }
    await documentsMutation.mutateAsync(docs)
  }

  const uploadAffaireDocument = useCallback(
    (file, options = {}) => {
      const affaireUid = demande?.affaire_rst_id
      if (!affaireUid) {
        return Promise.reject(new Error('Affaire liée introuvable'))
      }
      return affairesApi.uploadDocument(affaireUid, file, options)
    },
    [demande?.affaire_rst_id],
  )

  const deleteAffaireDocument = useCallback(
    (storedPath) => {
      const affaireUid = demande?.affaire_rst_id
      if (!affaireUid) {
        return Promise.reject(new Error('Affaire liée introuvable'))
      }
      return affairesApi.deleteDocument(affaireUid, storedPath)
    },
    [demande?.affaire_rst_id],
  )

  const sitePlanCapture = useMemo(() => {
    const affaireUid = demande?.affaire_rst_id
    const laboCode = (isEditing ? editForm.labo_code : demande?.labo_code) || 'SP'
    if (!affaireUid) return null
    return {
      laboCode,
      geocode: (address) => affairesApi.geocodeSitePlan(affaireUid, address, laboCode),
      preview: ({ lat, lon, address, zoom, width, height }) => affairesApi.previewSitePlan(affaireUid, {
        lat, lon, address, zoom, width, height,
      }),
      fetchItinerary: ({ lat, lon }) => affairesApi.getSitePlanItinerary(affaireUid, { lat, lon, laboCode }),
      save: ({ address, lat, lon, mapCenterLat, mapCenterLon, addressLabel, zoom, zones, pins, replaceStoredPath, orientation }) => affairesApi.captureSitePlan(affaireUid, {
        address,
        lat,
        lon,
        map_center_lat: mapCenterLat,
        map_center_lon: mapCenterLon,
        address_label: addressLabel,
        labo_code: laboCode,
        zoom: zoom ?? 16,
        zones: zones || [],
        pins: pins || [],
        replace_stored_path: replaceStoredPath || undefined,
        capture_kind: 'plan',
        orientation: orientation || A4_ORIENTATION_PORTRAIT,
      }),
      saveItinerary: ({ address, lat, lon, mapCenterLat, mapCenterLon, addressLabel, zoom, itineraryRoute, replaceStoredPath, orientation }) => affairesApi.captureSitePlan(affaireUid, {
        address,
        lat,
        lon,
        map_center_lat: mapCenterLat,
        map_center_lon: mapCenterLon,
        address_label: addressLabel,
        labo_code: laboCode,
        zoom: zoom ?? 13,
        itinerary_route: itineraryRoute || [],
        replace_stored_path: replaceStoredPath || undefined,
        capture_kind: 'itinerary',
        orientation: orientation || A4_ORIENTATION_LANDSCAPE,
      }),
      loadMeta: (storedPath) => affairesApi.getSitePlanMeta(affaireUid, storedPath),
    }
  }, [demande?.affaire_rst_id, demande?.labo_code, isEditing, editForm.labo_code])

  const demandeLaboCode = (isEditing ? editForm.labo_code : demande?.labo_code) || 'SP'
  const { data: linkedAffaire } = useQuery({
    queryKey: ['affaire', String(demande?.affaire_rst_id), demandeLaboCode],
    queryFn: () => affairesApi.get(demande.affaire_rst_id, { labo_code: demandeLaboCode }),
    enabled: Boolean(demande?.affaire_rst_id),
  })

  const documentsMutation = useMutation({
    mutationFn: (documents) => api.put(`/demandes_rst/${uid}/documents`, {
      documents: documents.map(({ document_type, is_received, version, document_date, uploaded_at, comment, stored_path }) => ({
        document_type,
        is_received,
        version,
        document_date,
        uploaded_at,
        comment,
        stored_path,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demande-nav', uid] })
      if (demande?.affaire_rst_id) {
        qc.invalidateQueries({ queryKey: ['affaire', String(demande.affaire_rst_id)] })
      }
    },
  })

  useEffect(() => {
    const nextState = loadDemandeUiState(uid)
    setUiState(nextState)
    uiStateRef.current = nextState
    hasRestoredScrollRef.current = false
  }, [uid])

  useEffect(() => {
    uiStateRef.current = uiState
    persistDemandeUiState(uid, uiState)
  }, [uid, uiState])

  useEffect(() => {
    if (!uid || typeof window === 'undefined') return undefined

    const handleScroll = () => {
      persistDemandeUiState(uid, {
        ...uiStateRef.current,
        scrollY: window.scrollY || window.pageYOffset || 0,
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      handleScroll()
      window.removeEventListener('scroll', handleScroll)
    }
  }, [uid])

  useEffect(() => {
    if (!uid || isLoading || hasRestoredScrollRef.current || typeof window === 'undefined') return
    const savedState = loadDemandeUiState(uid)
    const scrollY = Number(savedState?.scrollY || 0)
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: 'auto' })
    })
    hasRestoredScrollRef.current = true
  }, [uid, isLoading, nav?.campagnes?.length])

  if (isLoading) return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  if (isError || !demande) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Demande introuvable</p>
      <Button onClick={() => navigate('/demandes')}>← Demandes</Button>
    </div>
  )

  const d = demande
  const distanceCaption = buildDistanceToLabCaption(linkedAffaire?.site_geo?.distance_to_lab)
  const detailReturnTo = buildLocationTarget(location)
  const explicitReturnTo = resolveReturnTo(searchParams, '')
  const defaultBackTarget = d?.affaire_rst_id ? `/affaires/${d.affaire_rst_id}` : '/demandes'

  function handleBackNavigation() {
    if (explicitReturnTo) {
      navigate(explicitReturnTo)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate(defaultBackTarget)
  }

  const backButtonLabel = explicitReturnTo.startsWith('/affaires/') || (!explicitReturnTo && Boolean(d?.affaire_rst_id))
    ? '← Affaire'
    : '← Demandes'

  function getExpandedState(key, fallback = false) {
    const value = uiState?.expanded?.[key]
    return typeof value === 'boolean' ? value : fallback
  }

  function setExpandedState(key, isOpen) {
    setUiState((current) => ({
      ...current,
      expanded: {
        ...(current?.expanded || {}),
        [key]: isOpen,
      },
    }))
  }
  const visibility = nav?.visibility || {}
  const counts = nav?.counts || {}
  const navigationInterventions = nav?.interventions || []
  const interventionsByUid = new Map(navigationInterventions.map((item) => [Number(item.uid), item]))
  const demandeNotesTechniques = (Array.isArray(nav?.notes_techniques) && nav.notes_techniques.length
    ? nav.notes_techniques
    : navigationInterventions.filter((item) => isNoteTechniqueIntervention(item) && !item.campagne_id))
  const campaigns = (nav?.campagnes || []).map((campaign) => {
    const interventions = (campaign?.interventions || [])
      .filter((item) => !item?.is_demande_scope)
      .map((item) => ({
        ...item,
        ...(interventionsByUid.get(Number(item.uid)) || {}),
      }))
    return {
      ...campaign,
      interventions,
      intervention_count: interventions.length,
      intervention_uids: interventions.map((item) => item.uid),
    }
  })
  const campaignInterventionUids = new Set(
    campaigns.flatMap((campaign) => (campaign?.interventions || []).map((item) => Number(item?.uid))).filter((value) => Number.isFinite(value))
  )
  const standaloneInterventions = navigationInterventions.filter(
    (item) => !campaignInterventionUids.has(Number(item?.uid)) && !isNoteTechniqueIntervention(item),
  )
  const virtualCampaign = campaigns.length === 0 && standaloneInterventions.length > 0
    ? {
      uid: 'virtual-unassigned',
      code: 'AUT',
      reference: `${d.reference || 'DEM'}-HORS-CAMPAGNE`,
      label: 'Campagne fictive',
      designation: 'Interventions existantes sans campagne explicite.',
      workflow_label: 'Campagne auto-générée pour regrouper les interventions existantes.',
      source_mode: 'auto',
      source_label: 'Auto-générée',
      target_mode: 'manuel',
      target_label: 'À cadrer',
      intervention_count: standaloneInterventions.length,
      intervention_uids: standaloneInterventions.map((item) => item.uid),
      interventions: standaloneInterventions,
      report_ref: '',
      preparation_status: 'À cadrer',
      statut: 'À cadrer',
      is_virtual: true,
    }
    : null
  const campaignsForDisplay = virtualCampaign ? [virtualCampaign] : campaigns
  const demandePlansImplantation = demandePlansImplantationFull
  const demandePlanImageFiles = Array.isArray(demandePlanImagesData?.files) ? demandePlanImagesData.files : []
  const preparation = nav?.preparation || {}
  const familyCatalog = nav?.family_catalog || []
  const familyLabelMap = Object.fromEntries(familyCatalog.map((item) => [item.family_code, item.label]))
  const enabledModules = (nav?.modules || []).filter((item) => item.is_enabled)
  const selectedFamilyLabels = (preparation.familles_prevues || []).map((code) => familyLabelMap[code] || code)

  const phaseOperationMeaningful = Boolean(preparation.phase_operation && !['À qualifier', 'A qualifier'].includes(preparation.phase_operation))
  const demandDate = formatDate(d.date_reception)
  const createdDate = formatDate(d.created_at)
  const hasPreparationData = Boolean(
    phaseOperationMeaningful
    || preparation.attentes_client
    || preparation.contexte_operationnel
    || preparation.objectifs
    || preparation.points_vigilance
    || preparation.contraintes_acces
    || preparation.contraintes_delais
    || preparation.contraintes_hse
    || preparation.programme_previsionnel
    || preparation.programme_investigations
    || preparation.ressources_notes
    || preparation.ressources
    || preparation.commentaires
    || preparation.comments
    || preparation.type_intervention_prevu
    || preparation.finalite
    || preparation.zone_localisation
    || preparation.materiau_objet
    || preparation.objectif_mission
    || preparation.responsable_referent
    || preparation.attribue_a
    || preparation.remarques
    || selectedFamilyLabels.length > 0
    || enabledModules.length > 0
  )
  const discreetCounts = [
    counts.modules_enabled != null ? `${counts.modules_enabled} module${counts.modules_enabled > 1 ? 's' : ''}` : null,
    visibility.campagnes !== false && counts.campagnes != null ? `${counts.campagnes} campagne${counts.campagnes > 1 ? 's' : ''}` : null,
    visibility.interventions !== false && counts.interventions != null ? `${counts.interventions} intervention${counts.interventions > 1 ? 's' : ''}` : null,
  ].filter(Boolean)

  const preparationRefParam = d.reference ? `?ref=${encodeURIComponent(d.reference)}` : ''
  const preparationPreviewHref = buildPathWithReturnTo(`/preparations/${uid}${preparationRefParam}`, detailReturnTo)
  const preparationEditHref = buildPathWithReturnTo(`/preparations/${uid}${preparationRefParam}`, detailReturnTo)
  const passationUid = nav?.passation_uid || null
  const passationHref = passationUid
    ? buildPathWithReturnTo(`/passations/${passationUid}`, detailReturnTo)
    : ''
  const prestationFollowUpContext = {
    demandeId: d.uid ?? uid,
    affaireId: d.affaire_rst_id,
    preparationHref: preparationEditHref,
    returnTo: detailReturnTo,
    counts: {
      calculs: Array.isArray(linkedCalculs) ? linkedCalculs.length : 0,
      interventions: navigationInterventions.length,
    },
  }
  const urgDate = d.date_echeance && !['Fini','Envoyé - Perdu','Archivée'].includes(d.statut)
    ? (new Date(d.date_echeance) - new Date()) / 86400000
    : null
  const urgCls = urgDate !== null ? (urgDate < 0 ? 'text-danger font-bold' : urgDate <= 7 ? 'text-warn font-bold' : '') : ''

  function openCampaignFiche(campaign = {}) {
    if (!uid) return
    const campaignUid = campaign?.uid
    if (isPersistedCampaignUid(campaignUid)) {
      navigate(buildPathWithReturnTo(`/campagnes/${campaignUid}`, detailReturnTo))
    }
  }

  function openInterventionTypeModal(basePath, campaign = null) {
    setInterventionCreateDraft({
      basePath,
      campaignLabel: campaign?.reference || campaign?.label || '',
    })
  }

  function handleSelectInterventionType(typeIntervention) {
    if (!interventionCreateDraft?.basePath) return
    navigate(applyInterventionTypeToPath(interventionCreateDraft.basePath, typeIntervention))
    setInterventionCreateDraft(null)
  }

  function startEditing() {
    setEditForm(buildEditForm(d))
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    saveMutation.reset()
  }

  async function handleSaveEditing() {
    const affaireUid = d?.affaire_rst_id
    const previousAdresse = String(d?.adresse_ouvrage || '').trim()
    const nextAdresse = String(editForm.adresse_ouvrage || '').trim()
    if (affaireUid && nextAdresse !== previousAdresse) {
      try {
        await affairesApi.update(affaireUid, { adresse_ouvrage: nextAdresse })
        qc.invalidateQueries({ queryKey: ['demande', uid] })
        qc.invalidateQueries({ queryKey: ['demande-nav', uid] })
        qc.invalidateQueries({ queryKey: ['affaire', String(affaireUid)] })
      } catch (error) {
        window.alert(error?.message || 'Impossible d’enregistrer l’adresse de l’ouvrage.')
        return
      }
    }
    const { adresse_ouvrage: _ignored, ...demandePayload } = editForm
    saveMutation.mutate(sanitizeDemandeUpdate(demandePayload))
  }

  function patchEditField(key, value) {
    setEditForm((current) => ({ ...current, [key]: value }))
  }

  function openPreparationPage() {
    navigate(preparationEditHref)
  }

  function openCampaignPage() {
    navigate(buildPathWithReturnTo(`/campagnes?demande_id=${uid}`, detailReturnTo))
  }

  function openInterventionPage() {
    navigate(buildPathWithReturnTo(`/interventions?demande_id=${uid}`, detailReturnTo))
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel={backButtonLabel}
        onBack={handleBackNavigation}
        eyebrow="Fiche demande"
        title={d.reference}
      >
          {d.affaire_rst_id && (
            <Button size="sm" onClick={() => navigate(`/affaires/${d.affaire_rst_id}`)}>Affaire</Button>
          )}
          {isEditing ? (
            <>
              <Button size="sm" onClick={cancelEditing}>Annuler</Button>
              <Button size="sm" variant="primary" onClick={handleSaveEditing} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={startEditing}>Modifier</Button>
              <Button size="sm" onClick={openPreparationPage}>Préparation</Button>
              <Button size="sm" onClick={openCampaignPage}>Campagnes</Button>
              <Button size="sm" onClick={openInterventionPage}>Interventions</Button>
              <CopyCopilotPromptButton
                affaireRef={d.affaire_ref}
                demandeRef={d.reference}
              />
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

            <div>
              <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
                <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
                RaLab 5 · Demande RST
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{d.reference}</h1>
                {isAdmin && (
                  <button
                    onClick={() => { setRefEditVal(d.reference); setRefEditOpen(true) }}
                    className="rounded-full border border-white/25 bg-white/10 text-white px-2.5 py-1.5 text-[11px] font-black hover:bg-white/20 transition"
                  >
                    Modifier réf.
                  </button>
                )}
              </div>
              <div className="mt-3 text-[20px] font-black">{(isEditing ? editForm.nature : d.nature) || (isEditing ? editForm.type_mission : d.type_mission) || '—'}</div>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
                {d.affaire_ref && <span>Affaire : <strong className="text-white">{d.affaire_ref}</strong></span>}
                {d.chantier && <span>Chantier : <strong className="text-white">{d.chantier}</strong></span>}
                {d.client && <span>Client : <strong className="text-white">{d.client}</strong></span>}
                {d.site && <span>Site : <strong className="text-white">{d.site}</strong></span>}
                {distanceCaption ? <span>{distanceCaption}</span> : null}
              </div>
            </div>

            <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
              <div className="flex flex-wrap justify-end gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-black leading-none ${STAT_CLS[(isEditing ? editForm.statut : d.statut)] || 'bg-white/20 text-white'}`}>
                  {(isEditing ? editForm.statut : d.statut) || '—'}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-black leading-none ${PRIO_CLS[(isEditing ? editForm.priorite : d.priorite)] || 'bg-white/20 text-white'}`}>
                  {(isEditing ? editForm.priorite : d.priorite) || '—'}
                </span>
                {(isEditing ? editForm.a_revoir : d.a_revoir) && (
                  <span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">⚠ À revoir</span>
                )}
                {(isEditing ? editForm.numero_dst : d.numero_dst) && (
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">DST {isEditing ? editForm.numero_dst : d.numero_dst}</span>
                )}
              </div>
              <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Laboratoire</div>
              <div className="mt-1.5 text-[13px] font-black">
                <LabName code={isEditing ? editForm.labo_code : d.labo_code} />
              </div>
              {urgDate !== null && (
                <div className={`mt-2 text-[12px] font-black ${urgDate < 0 ? 'text-[#ff6b6b]' : urgDate <= 7 ? 'text-[#ffcc00]' : 'text-white/70'}`}>
                  {urgDate < 0 ? `Échéance dépassée (${Math.abs(Math.round(urgDate))}j)` : `Échéance dans ${Math.round(urgDate)}j`}
                </div>
              )}
            </div>
          </div>

          {/* Metrics bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
            <MetricCard label="Campagnes" value={campaignsForDisplay.length} detail={`${campaignsForDisplay.length} campagne${campaignsForDisplay.length > 1 ? 's' : ''} cadrée${campaignsForDisplay.length > 1 ? 's' : ''}`} />
            <MetricCard label="Interventions" value={counts.interventions || navigationInterventions.length} detail={discreetCounts.find(c => c.includes('intervention')) || 'Interventions rattachées'} />
            <MetricCard label="Échantillons" value={d.nb_echantillons || 0} detail="Déclarés dans la demande" />
            <MetricCard label="Modules" value={enabledModules.length} detail={enabledModules.length > 0 ? enabledModules.map(m => m.label || m.module_code).slice(0, 3).join(', ') : 'Aucun module activé'} />
          </div>
        </section>

        <CopilotImportPanel
          demandeId={d.uid ?? d.id ?? uid}
          returnTo={detailReturnTo}
        />

        {/* ── Two-column grid (lecture + édition inline, même layout) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-5">

          {/* Left column */}
          <div className="flex flex-col gap-5">
            <SectionCard
              title="Identité demande"
              subtitle="Affaire rattachée et contexte du projet"
              chip={<span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">{(isEditing ? editForm.labo_code : d.labo_code) || 'RST'}</span>}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FieldCard label="Référence" value={d.reference} highlight />
                <EditableFieldCard label="Statut" editing={isEditing} displayValue={<Badge s={d.statut} map={STAT_CLS} />}>
                  <Select value={editForm.statut || ''} onChange={e => patchEditField('statut', e.target.value)} className={`${INLINE_INPUT_CLS} w-full`}>
                    {STATUTS.map(s => <option key={s}>{s}</option>)}
                  </Select>
                </EditableFieldCard>
                <EditableFieldCard label="Priorité" editing={isEditing} displayValue={<Badge s={d.priorite} map={PRIO_CLS} />}>
                  <Select value={editForm.priorite || ''} onChange={e => patchEditField('priorite', e.target.value)} className={`${INLINE_INPUT_CLS} w-full`}>
                    {PRIORITES.map(p => <option key={p}>{p}</option>)}
                  </Select>
                </EditableFieldCard>
                <EditableFieldCard label="À revoir" editing={isEditing} displayValue={d.a_revoir ? 'Oui' : '—'}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!editForm.a_revoir} onChange={e => patchEditField('a_revoir', e.target.checked)} className="w-4 h-4 accent-[#ef9f27]" />
                    <span className="text-sm font-semibold text-[#172033]">Marquer à revoir</span>
                  </label>
                </EditableFieldCard>
                <FieldCard label="Affaire" value={d.affaire_ref} />
                <FieldCard label="Client" value={d.client} />
                <FieldCard label="Maître d'ouvrage" value={d.maitre_ouvrage} />
                <FieldCard label="Maître d'œuvre" value={d.maitre_oeuvre} />
                <FieldCard label="N° étude" value={d.numero_etude} />
                <FieldCard label="Chantier" value={d.chantier} className="sm:col-span-2" />
                <FieldCard label="Site" value={d.site} />
                <EditableFieldCard
                  label="Adresse ouvrage"
                  editing={isEditing}
                  displayValue={d.adresse_ouvrage}
                  className="sm:col-span-3"
                >
                  <textarea
                    value={editForm.adresse_ouvrage || ''}
                    onChange={(e) => patchEditField('adresse_ouvrage', e.target.value)}
                    rows={2}
                    placeholder="Rue et numéro — le site (commune / CP) complète la localisation carte"
                    className={`${INLINE_TEXTAREA_CLS} font-normal`}
                  />
                  <div className="mt-1 text-[11px] font-normal text-text-muted">
                    Enregistrée sur l’affaire. Avec le champ Site (commune / CP), sert au plan de situation.
                  </div>
                </EditableFieldCard>
                <FieldCard label="N° NGE" value={d.affaire_nge} />
              </div>
            </SectionCard>

            <SectionCard title="Mission & contexte" subtitle="Type de prestation, domaine et paramètres techniques">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <EditableFieldCard label="Type mission" editing={isEditing} displayValue={d.type_mission}>
                  <Input value={editForm.type_mission || ''} onChange={e => patchEditField('type_mission', e.target.value)} placeholder="Texte libre" className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Nature" editing={isEditing} displayValue={d.nature}>
                  <Input value={editForm.nature || ''} onChange={e => patchEditField('nature', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="N° DST" editing={isEditing} displayValue={d.numero_dst} highlight>
                  <Input value={editForm.numero_dst || ''} onChange={e => patchEditField('numero_dst', e.target.value)} placeholder="CET0001234" className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Domaine d'étude" editing={isEditing} displayValue={d.domaine_etude}>
                  <Input value={editForm.domaine_etude || ''} onChange={e => patchEditField('domaine_etude', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Type prestation attendue" editing={isEditing} displayValue={d.type_prestation_attendue} className="sm:col-span-2">
                  <Input value={editForm.type_prestation_attendue || ''} onChange={e => patchEditField('type_prestation_attendue', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Urgence source" editing={isEditing} displayValue={d.urgence_source}>
                  <Input value={editForm.urgence_source || ''} onChange={e => patchEditField('urgence_source', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Laboratoire" editing={isEditing} displayValue={resolveLaboDisplayName(d.labo_code, catalog) || d.labo_code}>
                  <Select value={editForm.labo_code || ''} onChange={e => patchEditField('labo_code', e.target.value)} className={`${INLINE_INPUT_CLS} w-full`}>
                    {laboSelectOptions.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
                  </Select>
                </EditableFieldCard>
              </div>
            </SectionCard>

            {passationUid ? (
              <SectionCard
                title="Prestations RST prévues"
                subtitle="Reprise de la passation (section E) — lecture seule"
              >
                <PassationPrestationsSummary
                  prestations={nav?.passation_prestations || []}
                  passationReference={nav?.passation_reference || ''}
                  passationHref={passationHref}
                  followUpContext={prestationFollowUpContext}
                />
              </SectionCard>
            ) : (
              <SectionCard
                title="Prestations RST demandées"
                subtitle="Cadrage de la demande — reprises en Préparation"
              >
                <DemandePrestationsEditor
                  prestations={prestationsForm}
                  onChange={setPrestationsForm}
                  onSave={(prestations) => prestationsMutation.mutate(prestations)}
                  isSaving={prestationsMutation.isPending}
                  followUpContext={prestationFollowUpContext}
                />
              </SectionCard>
            )}

            <SectionCard
              title="Essais retenus en préparation"
              subtitle="Tableau informatif — décisions prises en préparation"
            >
              <PreparationEssaisTable
                preparation={preparation}
                preparationHref={preparationEditHref}
              />
            </SectionCard>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            <SectionCard
              title="Acteurs & dates"
              subtitle="Demandeur, échéances et cycle de vie"
              chip={<Badge s={isEditing ? editForm.statut : d.statut} map={STAT_CLS} />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditableFieldCard label="Demandeur" editing={isEditing} displayValue={d.demandeur}>
                  <Input value={editForm.demandeur || ''} onChange={e => patchEditField('demandeur', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Urgence source" editing={isEditing} displayValue={d.urgence_source}>
                  <Input value={editForm.urgence_source || ''} onChange={e => patchEditField('urgence_source', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Service interne" editing={isEditing} displayValue={d.service_interne}>
                  <Input value={editForm.service_interne || ''} onChange={e => patchEditField('service_interne', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Société interne" editing={isEditing} displayValue={d.societe_interne}>
                  <Input value={editForm.societe_interne || ''} onChange={e => patchEditField('societe_interne', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Date réception" editing={isEditing} displayValue={formatDate(d.date_reception)}>
                  <Input type="date" value={editForm.date_reception || ''} onChange={e => patchEditField('date_reception', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Échéance" editing={isEditing} displayValue={d.date_echeance ? formatDate(d.date_echeance) : '—'} highlight={urgCls !== ''}>
                  <Input type="date" value={editForm.date_echeance || ''} onChange={e => patchEditField('date_echeance', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Clôture" editing={isEditing} displayValue={d.date_cloture ? formatDate(d.date_cloture) : 'En cours'}>
                  <Input type="date" value={editForm.date_cloture || ''} onChange={e => patchEditField('date_cloture', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <FieldCard label="Création" value={createdDate} />
              </div>
            </SectionCard>

            <SectionCard title="Rapport & Administration" subtitle="Références rapport, devis, facture">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditableFieldCard label="Réf. rapport" editing={isEditing} displayValue={d.rapport_ref}>
                  <Input value={editForm.rapport_ref || ''} onChange={e => patchEditField('rapport_ref', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Rapport envoyé" editing={isEditing} displayValue={d.rapport_envoye ? 'Oui' : '—'}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!editForm.rapport_envoye} onChange={e => patchEditField('rapport_envoye', e.target.checked)} className="w-4 h-4 accent-nge" />
                    <span className="text-sm font-semibold text-[#172033]">Rapport envoyé</span>
                  </label>
                </EditableFieldCard>
                <EditableFieldCard label="Réf. devis" editing={isEditing} displayValue={d.devis_ref}>
                  <Input value={editForm.devis_ref || ''} onChange={e => patchEditField('devis_ref', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
                <EditableFieldCard label="Réf. facture" editing={isEditing} displayValue={d.facture_ref}>
                  <Input value={editForm.facture_ref || ''} onChange={e => patchEditField('facture_ref', e.target.value)} className={INLINE_INPUT_CLS} />
                </EditableFieldCard>
              </div>
            </SectionCard>

            {(isEditing || d.note_reconciliation || d.suivi_notes) && (
              <SectionCard title="Suivi & notes" subtitle="Notes de réconciliation et suivi" technical={!isEditing}>
                <div className="grid grid-cols-1 gap-3">
                  <EditableFieldCard label="Note réconciliation" editing={isEditing} displayValue={d.note_reconciliation}>
                    <Input value={editForm.note_reconciliation || ''} onChange={e => patchEditField('note_reconciliation', e.target.value)} className={INLINE_INPUT_CLS} />
                  </EditableFieldCard>
                  <EditableFieldCard label="Notes suivi" editing={isEditing} displayValue={d.suivi_notes ? <span className="whitespace-pre-wrap font-normal">{d.suivi_notes}</span> : '—'}>
                    <textarea value={editForm.suivi_notes || ''} onChange={e => patchEditField('suivi_notes', e.target.value)} rows={3} className={INLINE_TEXTAREA_CLS} />
                  </EditableFieldCard>
                </div>
              </SectionCard>
            )}

            {(isEditing || d.description || d.observations) && (
              <SectionCard title="Description & observations" subtitle="Notes descriptives de la demande">
                {isEditing ? (
                  <div className="grid grid-cols-1 gap-3">
                    <EditableFieldCard label="Description" editing displayValue={d.description}>
                      <textarea value={editForm.description || ''} onChange={e => patchEditField('description', e.target.value)} rows={4} className={INLINE_TEXTAREA_CLS} />
                    </EditableFieldCard>
                    <EditableFieldCard label="Observations" editing displayValue={d.observations}>
                      <textarea value={editForm.observations || ''} onChange={e => patchEditField('observations', e.target.value)} rows={3} className={INLINE_TEXTAREA_CLS} />
                    </EditableFieldCard>
                  </div>
                ) : (
                  <>
                    {d.description && (
                      <div className="mb-3">
                        <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Description</div>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[#172033]">{d.description}</p>
                      </div>
                    )}
                    {d.observations && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Observations</div>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[#172033]">{d.observations}</p>
                      </div>
                    )}
                  </>
                )}
              </SectionCard>
            )}
          </div>
        </div>

        {isEditing && saveMutation.error && (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{saveMutation.error.message}</p>
        )}

        <SectionCard
          title="C - Documents reçus / attendus"
          subtitle="Pièces nécessaires pour le lancement — suivi propre à cette demande"
        >
          <DocumentTrackingTable
            documents={documentsForm}
            onChange={setDocumentsForm}
            onSave={handleSaveDocuments}
            isSaving={documentsMutation.isPending}
            uploadDocument={uploadAffaireDocument}
            deleteStoredFile={deleteAffaireDocument}
            captureSitePlan={sitePlanCapture}
            documentTypeOptions={DEFAULT_DOCUMENT_DROP_TYPES}
            siteGeocodeParts={{
              adresseOuvrage: d?.adresse_ouvrage || editForm.adresse_ouvrage || '',
              site: d?.site || '',
            }}
            distanceToLab={linkedAffaire?.site_geo?.distance_to_lab}
            subtitle="Le plan de situation est obligatoire. Glisser un fichier sur Version ou « Depuis adresse » (adresse ouvrage + site)."
          />
        </SectionCard>

        {(isEditing || d.documents_fournis || d.lien_pieces_jointes) && (
          <SectionCard title="Pièces source DST" subtitle="Texte brut importé depuis la DST — le suivi opérationnel se fait dans le quadro C ci-dessus" technical>
            <div className="grid grid-cols-1 gap-3">
              {d.documents_fournis ? <FieldCard label="Liste documents fournis (DST)" value={d.documents_fournis} /> : null}
              {(isEditing || d.lien_pieces_jointes) ? (
                <EditableFieldCard label="Lien pièces jointes volumineuses" editing={isEditing} displayValue={d.lien_pieces_jointes ? <span className="whitespace-pre-wrap font-normal">{d.lien_pieces_jointes}</span> : '—'}>
                  <textarea value={editForm.lien_pieces_jointes || ''} onChange={e => patchEditField('lien_pieces_jointes', e.target.value)} rows={2} className={INLINE_TEXTAREA_CLS} />
                </EditableFieldCard>
              ) : null}
            </div>
          </SectionCard>
        )}

        {/* ── Préparation ── */}
        <details className="rounded-[18px] border border-dashed border-[#dbe1ea] bg-white/60 px-5 py-3">
          <summary className="cursor-pointer select-none flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[.06em] text-[#69758a]/70">
              Préparation
              {preparation.reference ? (
                <span className="ml-1.5 font-black normal-case text-[#003170]">{preparation.reference}</span>
              ) : null}
              <span className="ml-1 font-normal normal-case text-[#69758a]/50">{hasPreparationData ? 'configurée' : 'non initialisée'}</span>
            </span>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <Button size="sm" variant="secondary" onClick={() => navigate(preparationPreviewHref)}>Voir</Button>
              <Button size="sm" variant="primary" onClick={() => navigate(preparationEditHref)}>
                {hasPreparationData ? 'Modifier' : 'Initialiser'}
              </Button>
            </div>
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <FieldRow label="Référence préparation" value={preparation.reference} />
              <FieldRow label="Phase opération" value={preparation.phase_operation} />
              <FieldRow label="Familles prévues" value={selectedFamilyLabels.join(', ')} />
              <FieldRow label="Attentes client" value={preparation.attentes_client} />
              <FieldRow label="Contexte opérationnel" value={preparation.contexte_operationnel} />
              <FieldRow label="Objectifs" value={preparation.objectifs} />
              <FieldRow label="Objectif mission" value={preparation.objectif_mission} />
              <FieldRow label="Points de vigilance" value={preparation.points_vigilance} />
            </div>
            <div className="space-y-1">
              <FieldRow label="Finalité" value={preparation.finalite} />
              <FieldRow label="Zone / localisation" value={preparation.zone_localisation} />
              <FieldRow label="Matériau / objet" value={preparation.materiau_objet} />
              <FieldRow label="Accès / contraintes" value={preparation.contraintes_acces || preparation.acces_site} />
              <FieldRow label="Délais" value={preparation.contraintes_delais} />
              <FieldRow label="HSE" value={preparation.contraintes_hse || preparation.hse} />
              <FieldRow label="Programme / ressources" value={[preparation.programme_previsionnel || preparation.programme_investigations, preparation.ressources_notes || preparation.ressources].filter(Boolean).join('\n\n')} />
              <FieldRow label="Pilotage" value={[preparation.responsable_referent, preparation.attribue_a, preparation.priorite].filter(Boolean).join(' · ')} />
              <FieldRow label="Commentaires" value={[preparation.commentaires || preparation.comments, preparation.remarques].filter(Boolean).join('\n\n')} />
            </div>
          </div>

          {selectedFamilyLabels.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Familles prévues</div>
              <div className="flex flex-wrap gap-1">
                {selectedFamilyLabels.map((label) => (
                  <span key={label} className="inline-flex items-center px-2 py-0.5 border border-[#e4e9f1] rounded-full bg-[#fbfcfe] text-[11px] font-medium">{label}</span>
                ))}
              </div>
            </div>
          )}

          {enabledModules.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Modules activés</div>
              <div className="flex flex-wrap gap-1">
                {enabledModules.map((item) => (
                  <span key={item.module_code} className="inline-flex items-center px-2 py-0.5 border border-[#e4e9f1] rounded-full bg-[#fbfcfe] text-[11px] font-medium">{item.label || item.module_code}</span>
                ))}
              </div>
            </div>
          )}
        </details>

        {/* ── Plans d'implantation (plans image) ── */}
        <PlanImagesConsultSection
          plans={demandePlansImplantation}
          imageFiles={demandePlanImageFiles}
          interventionsByUid={interventionsByUid}
          includeUnusedImages
          separateViewHref={buildPathWithReturnTo(`/demandes/${uid}/plans`, detailReturnTo)}
          emptyMessage="Les plans image du dossier affaire apparaîtront ici avec les implantations réalisées depuis les interventions."
        />

        {/* ── Notes techniques (scope demande) ── */}
        {demandeNotesTechniques.length > 0 && (
          <SectionCard
            title="Notes techniques"
            subtitle={`${demandeNotesTechniques.length} note${demandeNotesTechniques.length > 1 ? 's' : ''} rattachée${demandeNotesTechniques.length > 1 ? 's' : ''} à la demande`}
          >
            <div className="flex flex-col gap-3">
              {demandeNotesTechniques.map((note) => (
                <NoteTechniqueDemandeCard
                  key={note.uid}
                  note={note}
                  demandeUid={uid}
                  detailReturnTo={detailReturnTo}
                  navigate={navigate}
                />
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Campagnes ── */}
        {(visibility.campagnes !== false || campaignsForDisplay.length > 0) && (
          <SectionCard
            title="Campagnes d'intervention"
            subtitle={`${campaignsForDisplay.length} campagne${campaignsForDisplay.length > 1 ? 's' : ''} cadrée${campaignsForDisplay.length > 1 ? 's' : ''}`}
            actions={<Button size="sm" variant="primary" onClick={openPreparationPage}>Créer via la préparation</Button>}
          >
            {campaignsForDisplay.length > 0 ? (
              <div className="flex flex-col gap-4">
                {campaignsForDisplay.map((campaign) => (
                  <CampaignAccordion
                    key={campaign.uid}
                    campaign={campaign}
                    isVirtual={Boolean(campaign.is_virtual)}
                    detailReturnTo={detailReturnTo}
                    navigate={navigate}
                    onEditCampaign={openCampaignFiche}
                    onCreateIntervention={() => openInterventionTypeModal(buildCreateInterventionHref(uid, preparation, campaign.is_virtual ? null : campaign, d, detailReturnTo), campaign.is_virtual ? null : campaign)}
                    getExpandedState={getExpandedState}
                    setExpandedState={setExpandedState}
                    onDeleteSupportObject={handleDeleteSupportObject}
                    deletingSupportKey={deletingSupportKey}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-4 flex flex-col gap-3">
                <div className="text-[13px] text-[#172033]">Aucune campagne n'est encore cadrée pour cette demande.</div>
                <div className="text-[12px] text-[#69758a] leading-6">
                  Les campagnes se créent dans la préparation (DIAG-CH, Témoin, RARx, Suivi…), avec héritage du cadrage demande.
                </div>
                <div>
                  <Button size="sm" variant="primary" onClick={openPreparationPage}>Ouvrir la préparation</Button>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── DST context ── */}
        {d.dst_libelle_projet && (
          <SectionCard title="Contexte DST" subtitle="Informations issues de la demande DST" technical>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {d.dst_libelle_projet && <FieldCard label="Libellé projet" value={d.dst_libelle_projet} />}
              {d.dst_societe && <FieldCard label="Société" value={d.dst_societe} />}
              {d.dst_cadre_demande && <FieldCard label="Cadre demande" value={d.dst_cadre_demande} />}
              {d.dst_domaine_etude && <FieldCard label="Domaine étude" value={d.dst_domaine_etude} />}
              {d.dst_remise_souhaitee && <FieldCard label="Remise souhaitée" value={d.dst_remise_souhaitee} />}
            </div>
            {d.dst_objet_demande && (
              <div className="mt-3">
                <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Objet de la demande</div>
                <p className="text-[13px] whitespace-pre-wrap text-[#172033]">{d.dst_objet_demande}</p>
              </div>
            )}
          </SectionCard>
        )}
      </FicheMain>

      {/* ═══ Modals ═══ */}
      <InterventionTypeModal
        open={Boolean(interventionCreateDraft)}
        onClose={() => setInterventionCreateDraft(null)}
        onSelect={handleSelectInterventionType}
        subtitle={interventionCreateDraft?.campaignLabel ? `Campagne: ${interventionCreateDraft.campaignLabel}` : `Demande: ${d.reference}`}
      />
      {refEditOpen && d && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl w-[400px] p-6 shadow-2xl">
            <div className="text-[15px] font-semibold mb-1">Modifier la référence</div>
            <p className="text-[12px] text-text-muted mb-3">Identifiant unique — ne modifier que si nécessaire.</p>
            <input value={refEditVal} onChange={e => setRefEditVal(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge font-mono mb-4"
              placeholder="2026-SP-D0024" />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRefEditOpen(false)}>Annuler</Button>
              <Button variant="primary"
                disabled={!refEditVal.trim() || refEditVal === d.reference}
                onClick={() => demandesApi.update(d.uid, { reference: refEditVal.trim() })
                  .then((saved) => {
                    setDemande(saved)
                    qc.setQueryData(['demande', uid], saved)
                    qc.invalidateQueries({ queryKey: ['demandes'] })
                    setRefEditOpen(false)
                  })}>
                ✓ Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </FichePageShell>
  )
}

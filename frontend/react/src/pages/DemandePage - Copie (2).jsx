/**
 * DemandePage.jsx — fiche complète d'une demande RST
 * Fidèle à demande.html legacy
 * API: GET /demandes_rst/{uid}  + GET /demandes_rst/{uid}/navigation
 * 2 modaux: édition demande + configuration préparation/modules
 */
import { useState, useEffect, useMemo } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, demandesApi, interventionCampaignsApi } from '@/services/api'
import Button from '@/components/ui/Button'
import InterventionTypeModal, { applyInterventionTypeToPath } from '@/components/interventions/InterventionTypeModal'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { buildLocationTarget, buildPathWithReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'

const STATUTS   = ['À qualifier','Demande','En Cours','Répondu','Fini','Envoyé - Perdu']
const LABOS     = ['SP','AUV','CHB','CLM','RST']
const LABO_NOM  = { SP:'Saint-Priest', AUV:'Pont-du-Château', CHB:'Chambéry', CLM:'Clermont', RST:'RST / G3' }
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
    code: 'PMT',
    label: 'Macrotexture / PMT',
    defaults: { type_intervention: 'Suivi d’enrobés', finalite: 'Contrôle de matériaux', materiau: 'Enrobé' },
  },
  {
    code: 'AUT',
    label: 'Autre campagne',
    defaults: {},
  },
]

const CAMPAIGN_CODE_PREFILLS = {
  ...Object.fromEntries(CAMPAIGN_TYPE_OPTIONS.map((item) => [item.code, item.defaults])),
  PMT: { type_intervention: 'Suivi d’enrobés', finalite: 'Contrôle de matériaux', materiau: 'Enrobé' },
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

function buildCampaignFormState(campaign) {
  const currentCode = normalizeNonEmpty(campaign?.code).toUpperCase()
  const knownType = CAMPAIGN_TYPE_OPTIONS.find((item) => item.code === currentCode)

  return {
    code: knownType?.code || 'AUT',
    label: knownType?.label || normalizeNonEmpty(campaign?.label),
    designation: normalizeNonEmpty(campaign?.designation),
    zone_scope: normalizeNonEmpty(campaign?.zone_scope),
    temporalite: normalizeNonEmpty(campaign?.temporalite),
    programme_specifique:   normalizeNonEmpty(campaign?.programme_specifique),
    nb_points_prevus:       normalizeNonEmpty(campaign?.nb_points_prevus),
    types_essais_prevus:    normalizeNonEmpty(campaign?.types_essais_prevus),
    notes:                 normalizeNonEmpty(campaign?.notes),
    date_debut_prevue:     normalizeNonEmpty(campaign?.date_debut_prevue),
    date_fin_prevue:       normalizeNonEmpty(campaign?.date_fin_prevue),
    priorite:              campaign?.priorite              || 'Normale',
    responsable_technique: normalizeNonEmpty(campaign?.responsable_technique),
    attribue_a:            normalizeNonEmpty(campaign?.attribue_a),
    criteres_controle:     normalizeNonEmpty(campaign?.criteres_controle),
    livrables_attendus:    normalizeNonEmpty(campaign?.livrables_attendus),
  }
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

function openRelatedObject(navigate, item, detailReturnTo) {
  if (!item?.uid) return
  if (item.kind === 'plan_implantation') {
    navigate(buildPathWithReturnTo(`/plans-implantation/${item.uid}`, detailReturnTo))
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
    navigate(buildPathWithReturnTo(`/essais/${item.uid}`, detailReturnTo))
  }
}


function RelatedObjectNode({ item, navigate, detailReturnTo, level = 0 }) {
  const children = Array.isArray(item?.children) ? item.children : []
  const hasChildren = children.length > 0
  const isNavigable = ['plan_implantation', 'nivellement', 'feuille_terrain', 'prelevement', 'echantillon', 'essai'].includes(item?.kind)
  const [isOpen, setIsOpen] = useState(level === 0)

  const mainContent = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-[12px] font-semibold ${isNavigable ? 'text-accent' : 'text-text'}`}>
            {item.reference || getInterventionObjectLabel(item)}
          </div>
          <div className="mt-1 text-[11px] text-text-muted">
            {[getInterventionObjectLabel(item), item.title, item.subtitle].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="text-[11px] text-text-muted">{formatDate(item.date) || item.statut || '—'}</div>
      </div>
      {(item.result_label || item.result_value || item.statut) ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          {item.statut ? (
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-text-muted">
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
      <div className="rounded-lg border border-border bg-bg" style={{ marginLeft: level > 0 ? `${level * 14}px` : 0 }}>
        {isNavigable ? (
          <button
            type="button"
            onClick={() => openRelatedObject(navigate, item, detailReturnTo)}
            className="w-full px-3 py-2 text-left transition-colors hover:bg-surface rounded-lg"
          >
            {mainContent}
          </button>
        ) : (
          <div className="px-3 py-2">{mainContent}</div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-bg" style={{ marginLeft: level > 0 ? `${level * 14}px` : 0 }}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex-1 text-left transition-colors hover:text-accent"
        >
          {mainContent}
        </button>
        <div className="flex items-center gap-2 pt-0.5 shrink-0">
          {isNavigable ? (
            <button
              type="button"
              onClick={() => openRelatedObject(navigate, item, detailReturnTo)}
              className="px-2.5 py-1 rounded border border-border bg-surface text-[11px] font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              Ouvrir
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className={`h-7 w-7 rounded border border-border bg-surface text-[13px] text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function InterventionRelatedObjectsList({ intervention, detailReturnTo, navigate, enabled, onLoadedCount }) {
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
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InterventionAccordion({ intervention, detailReturnTo, navigate }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loadedEssaiCount, setLoadedEssaiCount] = useState(null)
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
    <details className="rounded-[10px] border border-border bg-surface group/intervention" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="list-none cursor-pointer px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-accent">{intervention.reference || 'Intervention'}</span>
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
        />
      </div>
    </details>
  )
}

function CampaignAccordion({
  campaign,
  detailReturnTo,
  navigate,
  onCreateIntervention,
  onEditCampaign,
}) {
  return (
    <details className="rounded-[10px] border border-border bg-bg group">
      <summary className="list-none cursor-pointer px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[14px] font-semibold text-accent">{campaign.reference || campaign.label}</div>
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

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onEditCampaign?.(campaign)}>
            Configurer la campagne
          </Button>
          {campaign.report_uid ? (
            <Button size="sm" variant="secondary" onClick={() => navigate(buildPathWithReturnTo(`/pmt/rapports/${campaign.report_uid}`, detailReturnTo))}>
              Ouvrir le rapport campagne
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

function CampaignModal({ open, onClose, demande, campaign, onSaved }) {
  const isEdit = Boolean(campaign?.uid)
  const [form, setForm] = useState(() => buildCampaignFormState(campaign))

  useEffect(() => {
    if (open) {
      setForm(buildCampaignFormState(campaign))
    }
  }, [open, campaign])

  const mutation = useMutation({
    mutationFn: async ({ mode, payload, campaignUid, demandeUid }) => {
      if (mode === 'edit') {
        return interventionCampaignsApi.update(campaignUid, payload)
      }
      return interventionCampaignsApi.create({ demande_id: demandeUid, ...payload })
    },
    onSuccess: (saved) => {
      onSaved?.(saved)
      onClose()
    },
  })

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleTypeChange(nextCode) {
    const typeOption = CAMPAIGN_TYPE_OPTIONS.find((item) => item.code === nextCode)
    setForm((current) => ({
      ...current,
      code: nextCode,
      label: nextCode === 'AUT' ? current.label : (typeOption?.label || current.label),
    }))
  }

  function handleSave() {
    const typeOption = CAMPAIGN_TYPE_OPTIONS.find((item) => item.code === form.code)
    const label = normalizeNonEmpty(form.code === 'AUT' ? form.label : (typeOption?.label || form.label)) || 'Campagne'
    const payload = {
      code: form.code,
      label,
      designation:           normalizeNonEmpty(form.designation),
      zone_scope:            normalizeNonEmpty(form.zone_scope),
      temporalite:           normalizeNonEmpty(form.temporalite),
      programme_specifique:  normalizeNonEmpty(form.programme_specifique),
      nb_points_prevus:      normalizeNonEmpty(form.nb_points_prevus),
      types_essais_prevus:   normalizeNonEmpty(form.types_essais_prevus),
      notes:                 normalizeNonEmpty(form.notes),
      date_debut_prevue:     normalizeNonEmpty(form.date_debut_prevue),
      date_fin_prevue:       normalizeNonEmpty(form.date_fin_prevue),
      priorite:              form.priorite || 'Normale',
      responsable_technique: normalizeNonEmpty(form.responsable_technique),
      attribue_a:            normalizeNonEmpty(form.attribue_a),
      criteres_controle:     normalizeNonEmpty(form.criteres_controle),
      livrables_attendus:    normalizeNonEmpty(form.livrables_attendus),
      statut:                campaign?.statut || '\u00c0 cadrer',
    }

    mutation.mutate({
      mode: isEdit ? 'edit' : 'create',
      payload,
      campaignUid: campaign?.uid,
      demandeUid: demande?.uid,
    })
  }

  const canSave = form.code !== 'AUT' || Boolean(normalizeNonEmpty(form.label))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Configurer la campagne' : 'Nouvelle campagne'}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-bg px-4 py-3 text-[12px] text-text-muted">
          La campagne cadre un programme concret: zone, cadence, contenu technique, responsable et livrables. Les interventions se rattachent ensuite à ce cadre.
        </div>

        <div className="grid grid-cols-2 gap-3">
          {isEdit && campaign?.reference ? (
            <FG label="Référence">
              <Input value={campaign.reference} readOnly className="text-text-muted" />
            </FG>
          ) : null}
          <FG label="Type de campagne" full={!isEdit || !campaign?.reference}>
            <Select value={form.code} onChange={(event) => handleTypeChange(event.target.value)} className="w-full">
              {CAMPAIGN_TYPE_OPTIONS.map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </Select>
          </FG>
          {form.code === 'AUT' ? (
            <FG label="Libellé libre" full>
              <Input value={form.label} onChange={(event) => set('label', event.target.value)} placeholder="Campagne de contrôles spécifiques" />
            </FG>
          ) : null}
          <FG label="Objectif / désignation" full>
            <Input
              value={form.designation}
              onChange={(event) => set('designation', event.target.value)}
              placeholder="Ce que la campagne doit couvrir ou sécuriser"
            />
          </FG>
          <FG label="Zone / secteur / phase / lot" full>
            <Input
              value={form.zone_scope}
              onChange={(event) => set('zone_scope', event.target.value)}
              placeholder={demande?.chantier || 'Zone concernée'}
            />
          </FG>
          <FG label="Temporalité / cadence" full>
            <Input
              value={form.temporalite}
              onChange={(event) => set('temporalite', event.target.value)}
              placeholder="Ex. phase 1, durant les enrobés, hebdomadaire..."
            />
          </FG>
          <FG label="Programme spécifique" full>
            <textarea
              value={form.programme_specifique}
              onChange={(event) => set('programme_specifique', event.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
              placeholder="Ce que cette campagne doit couvrir concrètement."
            />
          </FG>
          <FG label="Nb points prévus">
            <Input value={form.nb_points_prevus} onChange={(event) => set('nb_points_prevus', event.target.value)} placeholder="Ex. 6" />
          </FG>
          <FG label="Types d'essais prévus">
            <Input value={form.types_essais_prevus} onChange={(event) => set('types_essais_prevus', event.target.value)} placeholder="PANDA, PL, WE..." />
          </FG>
          <FG label="Date début prévue">
            <Input type="date" value={form.date_debut_prevue} onChange={(event) => set('date_debut_prevue', event.target.value)} />
          </FG>
          <FG label="Date fin / échéance">
            <Input type="date" value={form.date_fin_prevue} onChange={(event) => set('date_fin_prevue', event.target.value)} />
          </FG>
          <FG label="Priorité">
            <Select value={form.priorite} onChange={(event) => set('priorite', event.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
              {['Basse','Normale','Haute','Urgente'].map(p => <option key={p}>{p}</option>)}
            </Select>
          </FG>
          <FG label="Responsable technique" full>
            <Input value={form.responsable_technique} onChange={(event) => set('responsable_technique', event.target.value)} placeholder="Nom du responsable technique" />
          </FG>
          <FG label="Attribué à" full>
            <Input value={form.attribue_a} onChange={(event) => set('attribue_a', event.target.value)} placeholder="Equipe ou personne cible" />
          </FG>
          <FG label="Critères de contrôle" full>
            <textarea
              value={form.criteres_controle}
              onChange={(event) => set('criteres_controle', event.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
              placeholder="Critères d'acceptation ou de conformité."
            />
          </FG>
          <FG label="Livrables attendus" full>
            <textarea
              value={form.livrables_attendus}
              onChange={(event) => set('livrables_attendus', event.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
              placeholder="PV, note, rapport, synthèse..."
            />
          </FG>
          <FG label="Notes de cadrage" full>
            <textarea
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
              placeholder="Contraintes d'accès, coactivité, HSE, livrables attendus…"
            />
          </FG>
        </div>

        {mutation.error ? <p className="text-danger text-xs">{mutation.error.message}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="secondary">Annuler</Button>
          <Button onClick={handleSave} variant="primary" disabled={!canSave || mutation.isPending}>
            {mutation.isPending ? 'Enregistrement…' : (isEdit ? 'Enregistrer la campagne' : 'Créer la campagne')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Modal Édition ─────────────────────────────────────────────────────────────
function EditModal({ open, onClose, demande, onSaved }) {
  const [form, setForm] = useState({})

  useEffect(() => {
    if (open && demande) {
      setForm({
        labo_code:          demande.labo_code      || 'SP',
        statut:             demande.statut         || 'À qualifier',
        priorite:           demande.priorite       || 'Normale',
        type_mission:       demande.type_mission   || 'À définir',
        nature:             demande.nature         || '',
        numero_dst:         demande.numero_dst     || '',
        demandeur:          demande.demandeur      || '',
        date_reception:     demande.date_reception || '',
        date_echeance:      demande.date_echeance  || '',
        date_cloture:       demande.date_cloture   || '',
        description:        demande.description    || '',
        observations:       demande.observations   || '',
        a_revoir:           !!demande.a_revoir,
        note_reconciliation: demande.note_reconciliation || '',
        suivi_notes:        demande.suivi_notes    || '',
        rapport_ref:        demande.rapport_ref    || '',
        rapport_envoye:     !!demande.rapport_envoye,
        devis_ref:          demande.devis_ref      || '',
        facture_ref:        demande.facture_ref    || '',
      })
    }
  }, [open, demande])

  const mutation = useMutation({
    mutationFn: (data) => api.put(`/demandes_rst/${demande.uid}`, data),
    onSuccess: (saved) => { onSaved(saved); onClose() },
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <Modal open={open} onClose={onClose} title="Modifier la demande" size="xl">
      <div className="grid grid-cols-2 gap-3">
        <FG label="Référence">
          <Input value={demande?.reference || ''} readOnly className="text-text-muted" />
        </FG>
        <FG label="Statut">
          <Select value={form.statut || ''} onChange={e => set('statut', e.target.value)} className="w-full">
            {STATUTS.map(s => <option key={s}>{s}</option>)}
          </Select>
        </FG>
        <FG label="Laboratoire">
          <Select value={form.labo_code || ''} onChange={e => set('labo_code', e.target.value)} className="w-full">
            {LABOS.map(l => <option key={l}>{l}</option>)}
          </Select>
        </FG>
        <FG label="Priorité">
          <Select value={form.priorite || ''} onChange={e => set('priorite', e.target.value)} className="w-full">
            {PRIORITES.map(p => <option key={p}>{p}</option>)}
          </Select>
        </FG>
        <FG label="Type mission" full>
          <Select value={form.type_mission || ''} onChange={e => set('type_mission', e.target.value)} className="w-full">
            {MISSIONS.map(m => <option key={m}>{m}</option>)}
          </Select>
        </FG>
        <FG label="Nature">
          <Input value={form.nature} onChange={e => set('nature', e.target.value)} />
        </FG>
        <FG label="N° DST">
          <Input value={form.numero_dst} onChange={e => set('numero_dst', e.target.value)} placeholder="CET0001234" />
        </FG>
        <FG label="Demandeur">
          <Input value={form.demandeur} onChange={e => set('demandeur', e.target.value)} />
        </FG>
        <FG label="Date réception">
          <Input type="date" value={form.date_reception} onChange={e => set('date_reception', e.target.value)} />
        </FG>
        <FG label="Échéance">
          <Input type="date" value={form.date_echeance} onChange={e => set('date_echeance', e.target.value)} />
        </FG>
        <FG label="Date clôture">
          <Input type="date" value={form.date_cloture} onChange={e => set('date_cloture', e.target.value)} />
        </FG>
        <div />
        <FG label="Description" full>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
        </FG>
        <FG label="Observations" full>
          <textarea value={form.observations} onChange={e => set('observations', e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
        </FG>
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" checked={form.a_revoir} onChange={e => set('a_revoir', e.target.checked)} className="w-4 h-4 accent-[#ef9f27]" />
          <label className="text-sm cursor-pointer">⚠ À revoir</label>
        </div>
        <FG label="Note réconciliation" full>
          <Input value={form.note_reconciliation} onChange={e => set('note_reconciliation', e.target.value)} />
        </FG>
        <FG label="Notes suivi" full>
          <textarea value={form.suivi_notes} onChange={e => set('suivi_notes', e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
        </FG>
        <FG label="Réf. rapport">
          <Input value={form.rapport_ref} onChange={e => set('rapport_ref', e.target.value)} />
        </FG>
        <div className="flex items-center gap-2 mt-4">
          <input type="checkbox" checked={form.rapport_envoye} onChange={e => set('rapport_envoye', e.target.checked)} className="w-4 h-4 accent-accent" />
          <label className="text-sm cursor-pointer">Rapport envoyé</label>
        </div>
        <FG label="Réf. devis">
          <Input value={form.devis_ref} onChange={e => set('devis_ref', e.target.value)} />
        </FG>
        <FG label="Réf. facture">
          <Input value={form.facture_ref} onChange={e => set('facture_ref', e.target.value)} />
        </FG>
      </div>
      {mutation.error && <p className="text-danger text-xs mt-3">{mutation.error.message}</p>}
      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onClose} variant="secondary">Annuler</Button>
        <Button onClick={() => mutation.mutate(form)} variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Modal>
  )
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
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
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
                  m.is_enabled ? 'border-accent bg-[#eeeffe] text-accent' : 'border-border text-text-muted'
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
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [campaignDraft, setCampaignDraft] = useState(null)
  const [interventionCreateDraft, setInterventionCreateDraft] = useState(null)
  const [refEditOpen, setRefEditOpen] = useState(false)
  const [refEditVal,  setRefEditVal]  = useState('')
  const [demande, setDemande] = useState(null)

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

  useEffect(() => { if (raw) setDemande(raw) }, [raw])

  if (isLoading) return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  if (isError || !demande) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Demande introuvable</p>
      <Button onClick={() => navigate('/demandes')}>← Demandes</Button>
    </div>
  )

  const d = demande
  const detailReturnTo = buildLocationTarget(location)
  const visibility = nav?.visibility || {}
  const counts = nav?.counts || {}
  const navigationInterventions = nav?.interventions || []
  const interventionsByUid = new Map(navigationInterventions.map((item) => [Number(item.uid), item]))
  const campaigns = (nav?.campagnes || []).map((campaign) => ({
    ...campaign,
    interventions: (campaign?.interventions || []).map((item) => ({
      ...item,
      ...(interventionsByUid.get(Number(item.uid)) || {}),
    })),
  }))
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
  const urgDate = d.date_echeance && !['Fini','Envoyé - Perdu','Archivée'].includes(d.statut)
    ? (new Date(d.date_echeance) - new Date()) / 86400000
    : null
  const urgCls = urgDate !== null ? (urgDate < 0 ? 'text-danger font-bold' : urgDate <= 7 ? 'text-warn font-bold' : '') : ''

  function openNewCampaignModal() {
    setCampaignDraft(null)
    setCampaignModalOpen(true)
  }

  function openEditCampaignModal(campaign) {
    setCampaignDraft(campaign)
    setCampaignModalOpen(true)
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

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 bg-surface border-b border-border h-[58px] shrink-0 sticky top-0 z-10 flex-wrap">
        <button onClick={() => navigate('/demandes')}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors">
          ← Demandes
        </button>
        <span className="text-[15px] font-semibold flex-1">{d.reference}</span>
        <Button size="sm" onClick={() => navigate(`/affaires/${d.affaire_rst_id}`)}>📋 Affaire</Button>
        <Button size="sm" variant="primary" onClick={() => setEditOpen(true)}>✏️ Modifier</Button>
      </div>

      <div className="p-6 max-w-[960px] mx-auto w-full flex flex-col gap-4">

        {/* Hero */}
        <div className="bg-surface border border-border rounded-[10px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-[22px] font-bold text-accent">{d.reference}</div>
                <button onClick={() => { setRefEditVal(d.reference); setRefEditOpen(true) }}
                  title="Modifier la référence"
                  className="text-[11px] text-text-muted hover:text-accent border border-border rounded px-1.5 py-0.5 transition-colors">✏</button>
              </div>
              <div className="text-[14px] text-text mt-1">{d.nature || d.type_mission || '—'}</div>
              <div className="flex flex-wrap gap-2 mt-3">
                <InlineMeta label="Affaire liée" value={d.affaire_ref} />
                <InlineMeta label="Date demande" value={demandDate} />
                <InlineMeta label="Création" value={createdDate} />
                <InlineMeta label="Statut" value={d.statut} />
              </div>
              {(d.chantier || d.client) && (
                <div className="mt-3 text-[13px] text-text-muted space-y-0.5">
                  {d.chantier ? <div>{d.chantier}</div> : null}
                  {d.client ? <div>{d.client}</div> : null}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              <Badge s={d.statut}   map={STAT_CLS} />
              <Badge s={d.priorite} map={PRIO_CLS} />
              {d.a_revoir && <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#faeeda] text-[#854f0b]">⚠ À revoir</span>}
              {d.numero_dst && <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#e6f1fb] text-[#185fa5]">DST {d.numero_dst}</span>}
            </div>
          </div>

          {discreetCounts.length > 0 ? (
            <div className="mt-4 text-[11px] text-text-muted">
              {discreetCounts.join(' • ')}
            </div>
          ) : null}

          <details className="mt-4 rounded-[10px] border border-border bg-bg group">
            <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-text">Préparation liée</div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {preparation.phase_operation || (hasPreparationData ? 'Préparation renseignée' : 'Préparation à initialiser')}
                  {selectedFamilyLabels.length ? ` · ${selectedFamilyLabels.join(', ')}` : ''}
                </div>
              </div>
              <span className="text-[14px] text-text-muted transition-transform group-open:rotate-180">▾</span>
            </summary>
            <div className="border-t border-border px-4 py-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-text-muted">
                  Préparation directe de la demande. La passation éventuelle reste uniquement une aide facultative de saisie.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => navigate(preparationPreviewHref)}>
                    Voir toute la préparation
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => navigate(preparationEditHref)}>
                    {hasPreparationData ? 'Modifier la préparation' : 'Initialiser la préparation'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <FieldRow label="Phase opération" value={preparation.phase_operation} />
                  <FieldRow label="Familles prévues" value={selectedFamilyLabels.join(', ')} />
                  <FieldRow label="Attentes client" value={preparation.attentes_client} />
                  <FieldRow label="Contexte opérationnel" value={preparation.contexte_operationnel} />
                  <FieldRow label="Objectifs" value={preparation.objectifs} />
                  <FieldRow label="Objectif mission" value={preparation.objectif_mission} />
                  <FieldRow label="Points de vigilance" value={preparation.points_vigilance} />
                </div>
                <div className="space-y-1.5">
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

              {selectedFamilyLabels.length > 0 ? (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted mb-2">Familles prévues</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedFamilyLabels.map((label) => (
                      <span key={label} className="inline-flex items-center px-2.5 py-1 border border-border rounded-full bg-surface text-[12px] font-medium">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {enabledModules.length > 0 ? (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted mb-2">Modules activés</div>
                  <div className="flex flex-wrap gap-1.5">
                    {enabledModules.map((item) => (
                      <span key={item.module_code} className="inline-flex items-center px-2.5 py-1 border border-border rounded-full bg-surface text-[12px] font-medium">
                        {item.label || item.module_code}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </div>

        {/* Campagnes */}
        {(visibility.campagnes !== false || campaigns.length > 0) && (
          <Card
            title="Campagnes d'intervention"
            action={(
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted">{campaigns.length} campagne{campaigns.length > 1 ? 's' : ''}</span>
                <Button size="sm" variant="primary" onClick={openNewCampaignModal}>Nouvelle campagne</Button>
              </div>
            )}
          >
            {campaigns.length > 0 ? (
              <div className="flex flex-col gap-4">
                {campaigns.map((campaign) => (
                  <CampaignAccordion
                    key={campaign.uid}
                    campaign={campaign}
                    detailReturnTo={detailReturnTo}
                    navigate={navigate}
                    onEditCampaign={openEditCampaignModal}
                    onCreateIntervention={() => openInterventionTypeModal(buildCreateInterventionHref(uid, preparation, campaign, d, detailReturnTo), campaign)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[10px] border border-dashed border-border bg-bg px-4 py-4 flex flex-col gap-3">
                <div className="text-[13px] text-text">Aucune campagne n’est encore cadrée pour cette demande.</div>
                <div className="text-[12px] text-text-muted leading-6">
                  Commencer par créer une campagne explicite, puis rattacher les interventions à ce cadre au fur et à mesure de l’exécution.
                </div>
                <div>
                  <Button size="sm" variant="primary" onClick={openNewCampaignModal}>Nouvelle campagne</Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Cards identité */}
        <div className="grid grid-cols-2 gap-4">
          <Card title="Affaire RST">
            <FieldRow label="Référence"   value={d.affaire_ref} />
            <FieldRow label="Client"      value={d.client} />
            <FieldRow label="Chantier"    value={d.chantier} />
            <FieldRow label="Site"        value={d.site} />
            <FieldRow label="N° étude"    value={d.numero_etude} />
            <FieldRow label="N° NGE"      value={d.affaire_nge} />
          </Card>
          <Card title="Mission">
            <FieldRow label="Type mission" value={d.type_mission} />
            <FieldRow label="Nature"       value={d.nature} />
            <FieldRow label="N° DST"       value={d.numero_dst} />
            <FieldRow label="Laboratoire"  value={LABO_NOM[d.labo_code] || d.labo_code} />
          </Card>
          <Card title="Acteurs">
            <FieldRow label="Demandeur" value={d.demandeur} />
          </Card>
          <Card title="Dates">
            <FieldRow label="Réception" value={formatDate(d.date_reception)} />
            <FieldRow label="Échéance"  value={d.date_echeance ? formatDate(d.date_echeance) : '—'} warn={urgCls !== ''} />
            <FieldRow label="Clôture"   value={d.date_cloture ? formatDate(d.date_cloture) : 'En cours'} />
          </Card>
          <Card title="Rapport / Admin">
            <FieldRow label="Réf. rapport"  value={d.rapport_ref} />
            <FieldRow label="Rapport envoyé" value={d.rapport_envoye ? 'Oui' : null} />
            <FieldRow label="Réf. devis"    value={d.devis_ref} />
            <FieldRow label="Réf. facture"  value={d.facture_ref} />
          </Card>
        </div>
        {/* Description / Observations */}
        {(d.description || d.observations) && (
          <div className="grid grid-cols-2 gap-4">
            {d.description && (
              <Card title="Description">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-text">{d.description}</p>
              </Card>
            )}
            {d.observations && (
              <Card title="Observations">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-text">{d.observations}</p>
              </Card>
            )}
          </div>
        )}

        {/* Suivi & Notes */}
        {(d.suivi_notes || d.note_reconciliation) && (
          <Card title="Suivi & Notes">
            {d.note_reconciliation && <FieldRow label="Note réconciliation" value={d.note_reconciliation} />}
            {d.suivi_notes && <p className="text-sm mt-2 whitespace-pre-wrap">{d.suivi_notes}</p>}
          </Card>
        )}

        {/* DST context */}
        {d.dst_libelle_projet && (
          <Card title="Contexte DST">
            {d.dst_libelle_projet   && <FieldRow label="Libellé projet"      value={d.dst_libelle_projet} />}
            {d.dst_societe          && <FieldRow label="Société"             value={d.dst_societe} />}
            {d.dst_cadre_demande    && <FieldRow label="Cadre demande"       value={d.dst_cadre_demande} />}
            {d.dst_domaine_etude    && <FieldRow label="Domaine étude"       value={d.dst_domaine_etude} />}
            {d.dst_remise_souhaitee && <FieldRow label="Remise souhaitée"    value={d.dst_remise_souhaitee} />}
            {d.dst_objet_demande    && (
              <div className="mt-2">
                <div className="text-[11px] text-text-muted mb-1">Objet de la demande</div>
                <p className="text-sm whitespace-pre-wrap">{d.dst_objet_demande}</p>
              </div>
            )}
          </Card>
        )}

      </div>

      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        demande={demande}
        onSaved={(saved) => {
          setDemande(saved)
          qc.setQueryData(['demande', uid], saved)
          qc.invalidateQueries({ queryKey: ['demandes'] })
        }}
      />
      <CampaignModal
        open={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        demande={d}
        campaign={campaignDraft}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['demande-nav', uid] })
        }}
      />
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
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent font-mono mb-4"
              placeholder="2026-SP-D0024" />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setRefEditOpen(false)}>Annuler</Button>
              <Button variant="primary"
                disabled={!refEditVal.trim() || refEditVal === d.reference}
                onClick={() => demandesApi.update(d.uid, { reference: refEditVal.trim() })
                  .then(() => { qc.invalidateQueries({ queryKey: ['demande', String(uid)] }); setRefEditOpen(false) })}>
                ✓ Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

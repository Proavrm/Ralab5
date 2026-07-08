import { formatConsignesPreview } from '@/lib/consignesCatalog'
import { findNoteTechniqueIntervention } from '@/lib/noteTechniqueIntervention'
import { api } from '@/services/api'

function pick(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function linesFromMultiline(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
}

function splitCodes(raw) {
  return String(raw || '')
    .split(/[,;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function findCampaign(campaigns, matcher) {
  return (campaigns || []).find(matcher) || null
}

function campaignByZone(campaigns, zoneType) {
  return findCampaign(campaigns, (item) => (
    String(item.zone_type || '').toLowerCase() === String(zoneType).toLowerCase()
  ))
}

function campaignByCode(campaigns, code) {
  return findCampaign(campaigns, (item) => (
    String(item.code || '').toUpperCase() === String(code).toUpperCase()
  ))
}

function buildDiagnosticBullets(diagCampaign, preparation, passation) {
  const fromPlan = linesFromMultiline(diagCampaign?.intervention_plan)
  if (fromPlan.length) return fromPlan

  const essais = pick(
    diagCampaign?.types_essais_prevus,
    preparation?.types_essais_prevus,
    passation?.types_essais_prevus,
  )
  const codes = splitCodes(essais)
  if (codes.length) {
    return codes.map((code) => `Investigation prévue : ${code}`)
  }

  return [
    'Inspection visuelle détaillée de la chaussée',
    'Sondages carottés SC et diagnostic amiante / HAP',
    'Campagne de déflexions ou FWD',
    'Nivellement, PMT initiale, adhérence et acoustique si demandée',
  ]
}

function buildSuiviBullets(suiviCampaign, preparation) {
  const temporalite = pick(suiviCampaign?.temporalite, preparation?.programme_previsionnel)
  const lines = linesFromMultiline(temporalite)
  if (lines.length) return lines

  return [
    'Réception initiale : aspect visuel, compacité, carottages, épaisseur, collage, PMT',
    'J+1 / ouverture circulation : contrôle visuel et validation des points critiques',
    '1 mois, 6 mois, 1 an, 2 ans, 3 ans : relevés visuels, PMT, adhérence, acoustique',
    'Bilan final comparatif témoin / RARx',
  ]
}

function buildLivrablesBullets(passation, preparation, campaigns) {
  const merged = [
    passation?.livrables_attendus,
    preparation?.livrables_attendus,
    ...(campaigns || []).map((item) => item.livrables_attendus),
  ].filter(Boolean)

  const unique = [...new Set(merged.flatMap((raw) => splitCodes(raw)))]
  if (!unique.length) {
    return linesFromMultiline(
      'Note technique de présentation ; plan de localisation ; diagnostic préalable ; '
      + 'rapports SC / HAP / déflexions ; étude de formulation ; bilan comparatif',
    )
  }

  return unique.map((code) => (
    formatConsignesPreview('livrables_attendus', code, [], 240) || code
  ))
}

function buildValidationBullets(passation, preparation, campaigns) {
  const merged = [
    passation?.criteres_conformite,
    preparation?.criteres_conformite,
    ...(campaigns || []).map((item) => item.criteres_controle),
  ].filter(Boolean)

  const decoded = merged.map((raw) => formatConsignesPreview('criteres_conformite', raw, [], 240)).filter(Boolean)
  const lines = [...new Set(decoded.flatMap((text) => linesFromMultiline(text.replace(/ · /g, '\n'))))]

  if (lines.length) return lines

  return [
    'Validation MOE/MOA et caractère expérimental localisé',
    'Validation étude de formulation et dimensionnement comparatif',
    'Validation centrale, dosage RARx et protocole de contrôle / suivi',
    'Intégration PAQ et documents d\'exécution ; zones témoin et RARx définies',
  ]
}

export function buildModeleNTDocument({
  nav = {},
  passation = null,
  intervention = null,
  campaign = null,
} = {}) {
  const demande = nav?.demande || {}
  const preparation = nav?.preparation || {}
  const campaigns = nav?.campagnes || []
  const activeCampaign = campaign
    || campaignByCode(campaigns, intervention?.campagne_code)
    || (intervention?.campagne_id
      ? findCampaign(campaigns, (item) => Number(item.uid) === Number(intervention.campagne_id))
      : null)
    || campaigns[0]
    || null

  const diagCampaign = campaignByZone(campaigns, 'Diagnostic') || campaignByCode(campaigns, 'DIAG-CH')
  const temoinCampaign = campaignByZone(campaigns, 'Témoin') || campaignByCode(campaigns, 'TEMOIN')
  const rarxCampaign = campaignByZone(campaigns, 'RARx') || campaignByCode(campaigns, 'RARX')
  const suiviCampaign = campaignByZone(campaigns, 'Suivi') || campaignByCode(campaigns, 'SUIVI-CIRR')

  const chantier = pick(demande.chantier, demande.site, passation?.chantier, preparation.contexte_operationnel)
  const client = pick(demande.client, passation?.client)
  const comparisonGroup = pick(
    activeCampaign?.comparison_group,
    diagCampaign?.comparison_group,
    preparation.comparison_group,
  )

  const title = pick(
    preparation.objectifs,
    preparation.objectif_mission,
    passation?.synthese?.split(/[.\n]/)[0],
    demande.nature,
    'Planche expérimentale BB-Perf RARx',
  )

  const subtitle = pick(
    chantier,
    `${client} — ${chantier}`.replace(/^ — /, ''),
    'Note technique synthétique',
  )

  const zone = pick(
    activeCampaign?.zone_scope,
    diagCampaign?.zone_scope,
    preparation.zone_localisation,
  )

  const longueur = pick(temoinCampaign?.longueur_ml, rarxCampaign?.longueur_ml, '400-500')

  const sources = [
    { label: 'Affaire', value: pick(demande.affaire_reference, demande.affaire_ref) },
    { label: 'Demande', value: pick(demande.reference) },
    { label: 'Passation', value: pick(nav?.passation_reference, passation?.reference) },
    { label: 'Préparation', value: pick(preparation.reference) },
    { label: 'Campagne', value: pick(activeCampaign?.reference, activeCampaign?.code) },
    { label: 'Intervention', value: pick(intervention?.reference) },
    { label: 'Groupe comparaison', value: comparisonGroup },
  ].filter((item) => item.value)

  const sections = [
    {
      id: 'objet',
      title: 'Objet',
      paragraphs: [
        pick(
          passation?.synthese,
          preparation.objectif_mission,
          preparation.objectifs,
          demande.nature,
        ) || (
          'La présente note a pour objet de cadrer la mise en place d’une planche expérimentale '
          + 'd’enrobé innovant de type BB-Perf avec additif RARx.'
        ),
        pick(
          preparation.attentes_client,
          passation?.notes,
        ) || (
          'Cette planche s’inscrit dans une démarche expérimentale encadrée, avec comparaison '
          + 'à une section de référence. L’objectif n’est pas une variante marché, '
          + 'mais une adaptation technique localisée soumise à validation MOE/MOA.'
        ),
      ],
    },
    {
      id: 'contexte',
      title: 'Contexte chantier',
      paragraphs: [
        pick(
          preparation.contexte_operationnel,
          passation?.synthese,
          `${client ? `${client} — ` : ''}${chantier}`,
        ) || 'Contexte urbain, axe circulé, travaux de chaussée en conditions contraintes.',
        pick(
          preparation.contraintes_acces,
          preparation.contraintes_delais,
          preparation.contraintes_hse,
          passation?.points_sensibles,
        ) || 'Travaux de nuit, maintien circulation, coactivité et contraintes d’accès à préciser.',
        pick(preparation.points_vigilance, passation?.notes)
          || 'Le chantier doit permettre une planche d’essai et un suivi comparatif non biaisé.',
      ],
    },
    {
      id: 'principe',
      title: 'Principe technique envisagé',
      paragraphs: [
        pick(
          preparation.materiau_objet,
          temoinCampaign?.designation,
          rarxCampaign?.designation,
        ) || 'Section témoin de référence et section innovante BBM 0/10 RARx en couche de roulement.',
        pick(
          rarxCampaign?.programme_specifique,
          preparation.programme_previsionnel,
        ) || (
          'Le choix définitif de structure, épaisseurs, formulation, dosage RARx '
          + 'et section témoin sera confirmé par étude de formulation et dimensionnement comparatif.'
        ),
      ],
      bullets: [
        pick(temoinCampaign?.designation, 'Section témoin : solution de référence retenue avec la MOE/MOA'),
        pick(
          rarxCampaign?.programme_specifique,
          rarxCampaign?.designation,
          'Section innovante : BBM 0/10 classe 3 avec RARx, épaisseur cible 4 cm',
        ),
      ],
    },
    {
      id: 'localisation',
      title: 'Localisation pressentie',
      paragraphs: [
        zone
          ? `Localisation pressentie : ${zone}${comparisonGroup ? ` (${comparisonGroup})` : ''}.`
          : 'Localisation pressentie en section courante, zones PL2 / PL3, hors singularités.',
        pick(diagCampaign?.notes, preparation.notes)
          || (
            'Le positionnement définitif sera arrêté après analyse du phasage, de la circulation, '
            + 'du nivellement, des réseaux, des accès et du protocole CIRR.'
          ),
        `Longueur cible par section : ${longueur} ml (témoin et RARx comparables).`,
      ],
    },
    {
      id: 'diagnostic',
      title: 'Diagnostic préalable de chaussée',
      paragraphs: [
        pick(
          diagCampaign?.designation,
          diagCampaign?.programme_specifique,
          'Avant validation définitive des planches, un diagnostic préalable sera réalisé sur les sections pressenties.',
        ),
      ],
      bullets: buildDiagnosticBullets(diagCampaign, preparation, passation),
    },
    {
      id: 'temoin',
      title: 'Réalisation de la section témoin',
      paragraphs: [
        pick(
          temoinCampaign?.designation,
          temoinCampaign?.programme_specifique,
          'La section témoin sera réalisée suivant la solution de référence retenue, avec le même niveau de contrôle que la section RARx.',
        ),
      ],
      bullets: linesFromMultiline(temoinCampaign?.intervention_plan).length
        ? linesFromMultiline(temoinCampaign?.intervention_plan)
        : splitCodes(temoinCampaign?.types_essais_prevus).map((code) => `Contrôle témoin : ${code}`),
    },
    {
      id: 'rarx',
      title: 'Réalisation de la section RARx',
      paragraphs: [
        pick(
          rarxCampaign?.designation,
          rarxCampaign?.programme_specifique,
          'La section RARx sera réalisée avec un BBM 0/10 intégrant l’additif RARx, conformément à la formulation validée.',
        ),
        pick(rarxCampaign?.notes, preparation.responsable_innovation && `Innovation : ${preparation.responsable_innovation}`)
          || 'Mise en œuvre dans des conditions aussi proches que possible de la section témoin.',
      ],
      bullets: linesFromMultiline(rarxCampaign?.intervention_plan).length
        ? linesFromMultiline(rarxCampaign?.intervention_plan)
        : splitCodes(rarxCampaign?.types_essais_prevus).map((code) => `Suivi RARx : ${code}`),
    },
    {
      id: 'suivi',
      title: 'Programme de suivi comparatif',
      paragraphs: [
        pick(
          suiviCampaign?.designation,
          suiviCampaign?.programme_specifique,
          'Le suivi comparatif portera sur les deux sections, aux mêmes échéances et avec les mêmes méthodes.',
        ),
      ],
      bullets: buildSuiviBullets(suiviCampaign, preparation),
    },
    {
      id: 'validation',
      title: 'Conditions de validation',
      paragraphs: [
        'La mise en œuvre de la planche RARx reste conditionnée aux validations suivantes :',
      ],
      bullets: buildValidationBullets(passation, preparation, campaigns),
    },
    {
      id: 'livrables',
      title: 'Livrables attendus',
      paragraphs: ['Les livrables à prévoir sont :'],
      bullets: buildLivrablesBullets(passation, preparation, campaigns),
    },
  ]

  return {
    title,
    subtitle,
    meta: {
      affaire: pick(demande.affaire_reference, demande.affaire_ref),
      demande: pick(demande.reference),
      passation: pick(nav?.passation_reference, passation?.reference),
      campagne: pick(activeCampaign?.reference, activeCampaign?.code),
      intervention: pick(intervention?.reference),
      dateDebut: pick(intervention?.date_intervention),
      statut: pick(intervention?.statut),
      dateFin: pick(intervention?.date_fin),
      dateEnvoi: pick(intervention?.date_envoi),
      date: pick(intervention?.date_intervention) || new Date().toISOString().slice(0, 10),
      comparisonGroup,
      responsables: {
        referent: pick(preparation.responsable_referent, activeCampaign?.responsable_technique),
        innovation: pick(preparation.responsable_innovation, activeCampaign?.responsable_innovation),
        travaux: pick(preparation.responsable_travaux, activeCampaign?.responsable_travaux),
        controle: pick(preparation.responsable_controle, activeCampaign?.responsable_controle),
        suivi: pick(preparation.responsable_suivi, activeCampaign?.responsable_suivi),
      },
    },
    sources,
    sections,
    campaigns: campaigns.map((item) => ({
      uid: item.uid,
      reference: item.reference,
      code: item.code,
      label: item.label,
      zone_type: item.zone_type,
    })),
  }
}

export async function resolveG3NotesTechniquesPath({
  demandeUid = '',
  demandeRef = '',
  returnTo = '/g3/notes-techniques',
} = {}) {
  let demandeId = String(demandeUid || '').trim()
  if (!demandeId && demandeRef) {
    const rows = await api.get('/demandes_rst?' + new URLSearchParams({ search: demandeRef }))
    const normalizedRef = String(demandeRef).trim().toLowerCase()
    const match = (Array.isArray(rows) ? rows : []).find(
      (row) => String(row.reference || '').trim().toLowerCase() === normalizedRef,
    ) || (Array.isArray(rows) ? rows[0] : null)
    demandeId = String(match?.uid || match?.id || '').trim()
  }
  if (demandeId) {
    const nav = await api.get(`/demandes_rst/${demandeId}/navigation`)
    const existing = findNoteTechniqueIntervention({
      campaigns: nav?.campagnes || [],
      interventions: nav?.interventions || [],
      notesTechniques: nav?.notes_techniques || [],
    })
    if (existing?.uid) {
      return buildG3NotesTechniquesPath({ interventionUid: existing.uid, returnTo })
    }
    return buildG3NotesTechniquesPath({ demandeUid: demandeId, demandeRef, returnTo })
  }
  return buildG3NotesTechniquesPath({ demandeRef, returnTo })
}

export function buildG3NotesTechniquesPath({
  demandeUid,
  demandeRef = '',
  interventionUid = '',
  returnTo = '/g3/notes-techniques',
} = {}) {
  const params = new URLSearchParams()
  if (returnTo) params.set('return_to', returnTo)
  const query = params.toString()

  if (interventionUid) {
    return `/g3/notes-techniques/${encodeURIComponent(interventionUid)}${query ? `?${query}` : ''}`
  }

  const createParams = new URLSearchParams()
  if (demandeUid) createParams.set('demande_id', String(demandeUid))
  if (demandeRef) createParams.set('demande_ref', String(demandeRef))
  if (returnTo) createParams.set('return_to', returnTo)
  return `/g3/notes-techniques/nouveau?${createParams.toString()}`
}

/** @deprecated Utiliser buildG3NotesTechniquesPath */
export function buildModeleNTOpenPath(options = {}) {
  return buildG3NotesTechniquesPath(options)
}

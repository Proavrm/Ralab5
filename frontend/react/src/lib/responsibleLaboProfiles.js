function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const RAW_RESPONSIBLE_LAB_PROFILES = [
  {
    slug: 'christelle-chadeyras',
    displayName: 'Christelle CHADEYRAS',
    roleLabel: 'Responsable laboratoire',
    laboCode: 'AUV',
    title: 'Laboratoire Auvergne',
    location: 'Clermont-Ferrand (63)',
    summary: 'Ouverture et pilotage du laboratoire Auvergne avec une vue prete a accueillir les imports terrain et labo.',
    tone: 'amber',
    aliases: ['christelle', 'chadeyras', 'auvergne', 'clermont ferrand'],
    emails: ['cchadeyras@guintoli.fr'],
    mission: 'Mettre le laboratoire Auvergne sur rails et prendre la main sur la charge des demandes, interventions, echantillons et essais des que les imports sont en place.',
    focusAreas: ['Ouverture labo', 'Charge a venir', 'Coordination terrain / labo'],
    readinessChecklist: [
      'Importer les demandes Auvergne pour amorcer le planning labo.',
      'Charger les interventions et contextes chantier associes.',
      'Importer les echantillons et essais pour ouvrir la production labo.',
    ],
  },
  {
    slug: 'sylvain-lhopital',
    displayName: 'Sylvain LHOPITAL',
    roleLabel: 'Responsable laboratoire',
    laboCode: 'SP',
    title: 'Laboratoire Saint-Priest',
    location: 'Saint-Priest (69)',
    summary: 'Pilotage operationnel du laboratoire Saint-Priest, entre charge demandes, production labo et coordination terrain.',
    tone: 'teal',
    aliases: ['sylvain', 'lhopital', 'saint priest', 'saint-priest'],
    emails: ['cslhopital@guintoli.fr'],
    mission: 'Cadencer la charge du labo, arbitrer les urgences et garder une vue claire sur les flux demandes, terrain, echantillons et essais.',
    focusAreas: ['Charge du labo', 'Reception et production', 'Urgences terrain / labo'],
    readinessChecklist: [
      'Verifier la cadence des demandes et echeances a arbitrer.',
      'Suivre les receptions labo et les sequences de production ouvertes.',
      'Remonter les ecarts ou retards terrain qui impactent la chaine labo.',
    ],
  },
]

function buildMatchTerms(profile) {
  const emailPrefixes = (profile.emails || []).map((email) => String(email).split('@')[0])

  return [...new Set([
    normalizeText(profile.displayName),
    normalizeText(profile.title),
    normalizeText(profile.location),
    normalizeText(profile.laboCode),
    ...profile.aliases.map(normalizeText),
    ...emailPrefixes.map(normalizeText),
  ].filter(Boolean))]
}

export const RESPONSIBLE_LAB_PROFILES = RAW_RESPONSIBLE_LAB_PROFILES.map((profile) => ({
  ...profile,
  matchTerms: buildMatchTerms(profile),
}))

export function getResponsibleLaboProfileBySlug(slug) {
  return RESPONSIBLE_LAB_PROFILES.find((profile) => profile.slug === slug) || null
}

export function getResponsibleLaboProfileByCode(code) {
  const normalized = String(code || '').trim().toUpperCase()
  return RESPONSIBLE_LAB_PROFILES.find((profile) => profile.laboCode === normalized) || null
}

export function getResponsibleLaboHomeRoute(profileOrSlug) {
  const slug = typeof profileOrSlug === 'string' ? profileOrSlug : profileOrSlug?.slug
  return slug ? `/dashboard/labos/${slug}` : '/dashboard'
}

export function findResponsibleLaboProfileByUser(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  const emailPrefix = email.split('@')[0]
  const displayName = normalizeText(user?.display_name || '')

  return RESPONSIBLE_LAB_PROFILES.find((profile) =>
    (profile.emails || []).some((candidate) => candidate.toLowerCase() === email)
    || (emailPrefix && profile.matchTerms.some((term) => emailPrefix.includes(term)))
    || (displayName && profile.matchTerms.some((term) => displayName.includes(term)))
  ) || null
}
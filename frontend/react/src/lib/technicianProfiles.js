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

const RAW_TECHNICIAN_PROFILES = [
  {
    slug: 'jeremy-dechevre',
    displayName: 'Jeremy DECHEVRE',
    roleLabel: 'Technicien principal terrain',
    workstream: 'terrain',
    summary: 'Pilotage terrain, prelevements et restitution rapide des retours chantier.',
    tone: 'sky',
    aliases: ['jeremy', 'dechevre'],
    defaultLaboCodes: ['SP'],
    mission: 'Tenir le tempo terrain: sorties, controles, retours labo et arbitrages rapides.',
    focusAreas: ['Terrain du jour', 'Retards terrain', 'Retour d essai'],
    responsibilities: [
      'Preparer les sorties et verifier le materiel de prelevement.',
      'Securiser les releves, controles et informations chantier.',
      'Remonter rapidement les ecarts et les besoins de cloture labo.',
    ],
  },
  {
    slug: 'frederic-montet',
    displayName: 'Frederic MONTET',
    roleLabel: 'Technicien principal terrain',
    workstream: 'terrain',
    summary: 'Pilotage quotidien des interventions, prelevements et retours de chantier.',
    tone: 'teal',
    aliases: ['frederic', 'montet'],
    defaultLaboCodes: ['SP'],
    mission: 'Orchestrer la charge terrain, absorber les urgences et refermer la boucle avec le labo.',
    focusAreas: ['Planning terrain', 'Interventions sensibles', 'Essais a solder'],
    responsibilities: [
      'Cadencer les interventions du jour et les urgences chantier.',
      'Suivre les dossiers depasses ou a forte alerte.',
      'Faire atterrir les essais revenus terrain jusqu a la cloture.',
    ],
  },
  {
    slug: 'hugo-lepolard',
    displayName: 'Hugo LEPOLARD',
    roleLabel: 'Technicien laborantin / alternant',
    workstream: 'lab',
    summary: 'Vue paillasse pour les essais, la prise en charge des echantillons et la cloture des series.',
    tone: 'amber',
    aliases: ['hugo', 'lepolard'],
    defaultLaboCodes: ['SP'],
    mission: 'Absorber la charge labo du jour entre reception, preparation de series et cloture.',
    focusAreas: ['Paillasse du jour', 'Essais a cloturer', 'Echantillons a prendre'],
    responsibilities: [
      'Prendre en charge les echantillons recus et les distribuer en serie.',
      'Suivre les essais lances jusqu aux resultats exploitables.',
      'Signaler les blocages de paillasse et les manques de rattachement.',
    ],
  },
  {
    slug: 'baptiste-defay',
    displayName: 'Baptiste DEFAY',
    roleLabel: 'Technicien laborantin / alternant',
    workstream: 'lab',
    summary: 'Vue de montee en charge labo pour preparation des essais, reception et cloture de production.',
    tone: 'amber',
    aliases: ['baptiste', 'defay'],
    defaultLaboCodes: ['SP'],
    mission: 'Monter en charge sur la production labo avec une vision claire des series a lancer et a fermer.',
    focusAreas: ['Series a lancer', 'Cloture production', 'Reception labo'],
    responsibilities: [
      'Verifier les echantillons en attente de prise en charge.',
      'Lancer ou reprendre les series de laboratoire attribuees.',
      'Boucler proprement les essais et resultats de fin de chaine.',
    ],
  },
  {
    slug: 'clara-rigo',
    displayName: 'Clara RIGO',
    roleLabel: 'Adjointe technique / alternante',
    workstream: 'coordination',
    summary: 'Pilotage preparation G3, calculs, dimensionnement Alyze/Taleron et redaction de notes techniques.',
    tone: 'green',
    aliases: ['clara', 'rigo'],
    defaultLaboCodes: ['SP'],
    mission: 'Faire le lien entre preparation, terrain et labo pour produire calculs, notes et avis dans le bon tempo.',
    focusAreas: ['Preparation G3', 'Dimensionnement', 'Notes techniques et avis'],
    responsibilities: [
      'Arbitrer les dossiers a preparer pour G3 et dimensionnements.',
      'Assembler les resultats utiles pour Alyze, Taleron et les calculs.',
      'Cadencer la redaction des notes techniques, avis et retours de synthese.',
    ],
  },
]

function buildMatchTerms(profile) {
  return [...new Set([
    normalizeText(profile.displayName),
    ...profile.aliases.map(normalizeText),
  ].filter(Boolean))]
}

export const TECHNICIAN_PROFILES = RAW_TECHNICIAN_PROFILES.map((profile) => ({
  ...profile,
  matchTerms: buildMatchTerms(profile),
}))

export function getTechnicianProfileBySlug(slug) {
  return TECHNICIAN_PROFILES.find((profile) => profile.slug === slug) || null
}

export function getTechnicianHomeRoute(profileOrSlug) {
  const slug = typeof profileOrSlug === 'string' ? profileOrSlug : profileOrSlug?.slug
  return slug ? `/dashboard/techniciens/${slug}` : '/dashboard'
}

export function findTechnicianProfileByName(value) {
  const normalized = normalizeText(value)
  if (!normalized) return null

  return TECHNICIAN_PROFILES.find((profile) =>
    profile.matchTerms.some((term) => normalized.includes(term))
  ) || null
}

export function findTechnicianProfileByUser(user) {
  const emailPrefix = String(user?.email || '').split('@')[0]
  return findTechnicianProfileByName(user?.display_name || '') || findTechnicianProfileByName(emailPrefix)
}

export function matchesTechnicianProfile(profile, ...values) {
  const targetProfile = typeof profile === 'string' ? getTechnicianProfileBySlug(profile) : profile
  if (!targetProfile) return false

  const haystack = normalizeText(values.flat().filter(Boolean).join(' '))
  if (!haystack) return false

  return targetProfile.matchTerms.some((term) => haystack.includes(term))
}
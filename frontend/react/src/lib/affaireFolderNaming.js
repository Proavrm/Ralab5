/** Miroir frontend de affaire_folder_naming.py — aperçu avant création. */

const INVALID = new Set([
  'nan', 'none', 'null', 'non communiqué', 'non communique',
  'non comuniqué', 'non comunique', 'à qualifier', 'a qualifier', '-',
])

function cleanPiece(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  return INVALID.has(text.toLowerCase()) ? '' : text
}

function sanitizeFolderName(value) {
  let text = cleanPiece(value)
  for (const char of '<>:"/\\|?*') {
    text = text.split(char).join('-')
  }
  return text.replace(/\s+/g, ' ').replace(/[ .]+$/g, '').trim()
}

function normalizeForCompare(value) {
  return cleanPiece(value).toLowerCase().replace(/`/g, "'")
}

function buildAffaireLabel(affaireNge, numeroEtude, autreReference) {
  for (const value of [affaireNge, numeroEtude, autreReference]) {
    const piece = cleanPiece(value)
    if (piece) return piece
  }
  return ''
}

function resolveFolderActeur(client, maitreOuvrage) {
  return cleanPiece(client) || cleanPiece(maitreOuvrage)
}

function buildClientChantierPiece(acteur, chantier) {
  const acteurValue = cleanPiece(acteur)
  const chantierValue = cleanPiece(chantier)
  if (!acteurValue) return chantierValue
  if (!chantierValue) return acteurValue

  const acteurNorm = normalizeForCompare(acteurValue)
  const chantierNorm = normalizeForCompare(chantierValue)
  if (chantierNorm.startsWith(acteurNorm) || chantierNorm.includes(acteurNorm)) {
    return chantierValue
  }
  return `${acteurValue}_${chantierValue}`
}

export function buildAffaireFolderName({
  reference = '',
  affaire_nge = '',
  numero_etude = '',
  autre_reference = '',
  chantier = '',
  client = '',
  site = '',
  maitre_ouvrage = '',
}) {
  const parts = []
  const ref = cleanPiece(reference)
  if (ref) parts.push(ref)

  const affaireLabel = buildAffaireLabel(affaire_nge, numero_etude, autre_reference)
  if (affaireLabel) parts.push(affaireLabel)

  const sitePiece = cleanPiece(site)
  if (sitePiece) parts.push(sitePiece)

  const acteur = resolveFolderActeur(client, maitre_ouvrage)
  const acteurPiece = buildClientChantierPiece(acteur, chantier)
  if (acteurPiece) parts.push(acteurPiece)

  return sanitizeFolderName(parts.join(' - ')) || ref || ''
}

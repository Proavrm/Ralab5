/** Catalogues d'essais directs — partagé InterventionPage / EssaiPage. */

export const DIRECT_ESSAI_TEMPLATES = [
  { code: 'VC', label: 'Feuille de visite chantier', typeEssai: 'Visite chantier', norme: '' },
  { code: 'GEN', label: 'Essai générique', typeEssai: 'Essai générique', norme: '' },
  { code: 'SC', label: 'Sondage carotté / carottage chaussée', typeEssai: 'Coupe de sondage carotté', norme: '' },
  { code: 'SO', label: 'Coupe de sondage', typeEssai: 'Coupe de sondage', norme: '' },
  { code: 'PMT', label: 'Profondeur de macrotexture (PMT)', typeEssai: 'Profondeur de macrotexture', norme: '' },
  { code: 'ADH', label: 'Adhérence', typeEssai: 'Adhérence', norme: '' },
  { code: 'HAP', label: 'Analyse HAP', typeEssai: 'Analyse HAP sur enrobés', norme: '' },
  { code: 'AMI', label: 'Diagnostic amiante', typeEssai: 'Diagnostic amiante sur enrobés', norme: '' },
  { code: 'DF', label: 'Déflexions', typeEssai: 'Déflexions', norme: 'NF P 98-200-2' },
  { code: 'FWD', label: 'FWD / déflexions lourdes', typeEssai: 'Déflexions FWD', norme: '' },
  { code: 'DE', label: 'Densité enrobés', typeEssai: 'Densité enrobés in situ', norme: '' },
  { code: 'CFE', label: 'Contrôle fabrication enrobés', typeEssai: 'Contrôle fabrication enrobés', norme: '' },
  { code: 'EXT', label: 'Extraction / liant / granulo', typeEssai: 'Extraction, teneur en liant, granulométrie', norme: '' },
  { code: 'PCG', label: 'Presse à compactage giratoire', typeEssai: 'Presse à compactage giratoire', norme: '' },
  { code: 'ORN', label: 'Orniérage', typeEssai: 'Orniérage', norme: '' },
  { code: 'ITSR', label: 'Tenue à l\'eau', typeEssai: 'Sensibilité à l\'eau / tenue à l\'eau', norme: '' },
  { code: 'SCB', label: 'Semi-circular bending', typeEssai: 'Semi-circular bending / ténacité', norme: '' },
  { code: 'ARR', label: 'Arrachement', typeEssai: 'Arrachement', norme: '' },
  { code: 'ACO', label: 'Mesure acoustique', typeEssai: 'Mesure acoustique', norme: '' },
  { code: 'GPR', label: 'Radar chaussée', typeEssai: 'Radar chaussée / GPR', norme: '' },
  { code: 'PLD', label: 'Portances dynaplaque', typeEssai: 'Portances dynaplaque', norme: 'NF P 94-117-2' },
  { code: 'PL', label: 'Portances à la plaque', typeEssai: 'Portances à la plaque', norme: 'NF P 94-117-1' },
  { code: 'DS', label: 'Densité sols in situ', typeEssai: 'Densité sols in situ', norme: '' },
  { code: 'QS', label: 'Contrôle de compactage', typeEssai: 'Contrôle compactage GTR', norme: '' },
  { code: 'PA', label: 'Pénétromètre', typeEssai: 'Pénétromètre / PANDA', norme: '' },
  { code: 'EAU', label: 'Essai d\'eau ou d\'infiltration', typeEssai: 'Essai d\'eau / infiltration', norme: '' },
  { code: 'PER', label: 'Percolation', typeEssai: 'Percolation', norme: '' },
  { code: 'INF', label: 'Infiltration / perméabilité', typeEssai: 'Infiltration / perméabilité', norme: '' },
  { code: 'EE', label: 'Étanchéité à l\'eau', typeEssai: 'Étanchéité à l\'eau', norme: '' },
  { code: 'EA', label: 'Étanchéité à l\'air', typeEssai: 'Étanchéité à l\'air', norme: '' },
]

export const DIRECT_ESSAI_TEMPLATE_BY_CODE = DIRECT_ESSAI_TEMPLATES.reduce((accumulator, item) => {
  accumulator[item.code] = item
  return accumulator
}, {})

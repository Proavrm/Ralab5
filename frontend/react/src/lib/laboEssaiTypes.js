/** Types d'essais labo — partagé EchantillonPage / PrelevementPage / EssaiPage. */

export const LABO_ESSAI_TYPES = [
  { code: 'WE', label: 'Teneur en eau naturelle', norme: 'Détermination de la Teneur en Eau (NF P 94 049 et NF P 94 050)' },
  { code: 'GR', label: 'Granulométrie', norme: 'NF P 94-056 / NF EN 933-1' },
  { code: 'EL', label: 'Extraction de liant', norme: 'NF EN 12697-1' },
  { code: 'CFE', label: 'Contrôle de fabrication enrobés', norme: '' },
  { code: 'LCP', label: "Limites d'Atterberg", norme: 'NF P 94-051' },
  { code: 'VBS', label: "Prise d'essai au bleu (sols)", norme: 'NF P 94-068', init_resultats: '{"type_materiau":"sols"}' },
  { code: 'MB', label: 'Valeur au bleu 0/2mm', norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mb_0_2"}' },
  { code: 'MBF', label: 'MValeur au bleu 0/0.125mm', norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mbf_0_0125"}' },
  { code: 'ES', label: 'Équivalent de sable', norme: 'NF EN 933-8 / NF P 94-055' },
  { code: 'PN', label: 'Proctor Normal', norme: 'NF P 94-093' },
  { code: 'IPI', label: 'IPI — Indice Portant Immédiat', norme: 'NF P 94-078' },
  { code: 'CBRI', label: 'CBRi — CBR immédiat', norme: 'NF P 94-090-1' },
  { code: 'CBR', label: 'CBR — après immersion 4 jours', norme: 'NF P 94-090-1' },
  { code: 'ID', label: 'Identification GTR', norme: 'NF P 11-300' },
  { code: 'MVA', label: 'Masse volumique des enrobés', norme: 'NF EN 12697-6' },
  { code: 'TX', label: 'Texture / granulométrie pédologique', norme: '' },
  { code: 'PH', label: 'pH', norme: '' },
  { code: 'MO', label: 'Matière organique', norme: '' },
  { code: 'CA', label: 'Calcaire actif', norme: '' },
]

/** @deprecated alias */
export const TYPES_ESSAI = LABO_ESSAI_TYPES

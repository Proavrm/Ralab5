/**
 * Listas dos <Select> partilhadas entre modelo DE, modelo PMT e feuille DE runtime.
 * Único sítio para acrescentar ou alterar opções (operador, centrales, fontes de critérios, etc.).
 */

export const TERRAIN_OPERATOR_SELECT_OPTIONS = [
  { value: 'MARCO', label: 'MARCO' },
  { value: 'CLARA', label: 'CLARA' },
  { value: 'TECHNICIEN_1', label: 'Technicien 1' },
  { value: 'TECHNICIEN_2', label: 'Technicien 2' },
]

export const TERRAIN_FABRICATION_SITE_SELECT_OPTIONS = [
  { value: 'CENTRALE_SP', label: 'Centrale Saint-Priest' },
  { value: 'CENTRALE_PTC', label: 'Centrale Pont-du-Château' },
]

export const TERRAIN_FORMULA_SELECT_OPTIONS = [{ value: 'FORMULE_FTP', label: 'Formule issue FTP' }]

export const TERRAIN_PRODUCT_SELECT_OPTIONS = [
  { value: 'PRODUIT_FTP', label: 'Produit contrôlé issu FTP' },
]

export const TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS = [
  { value: 'CCTP', label: 'CCTP' },
  { value: 'FTP', label: 'FTP' },
  { value: 'NORME', label: 'Norme' },
  { value: 'CLIENT', label: 'Exigence client' },
  { value: 'INTERNE', label: 'Objectif interne' },
]

/**
 * Inclui o valor atual na lista se não existir (ex.: import com texto livre).
 */
export function renderTerrainSelectOptionExtras(items, currentValue) {
  const normalizedItems = items.map((item) => String(item.value || item.label || '').trim())
  const current = String(currentValue || '').trim()
  const shouldAddCurrent = current && !normalizedItems.includes(current)
  return (
    <>
      {shouldAddCurrent ? <option value={current}>{current}</option> : null}
      {items.map((item) => (
        <option key={item.value || item.label} value={item.value || item.label}>
          {item.label || item.value}
        </option>
      ))}
    </>
  )
}

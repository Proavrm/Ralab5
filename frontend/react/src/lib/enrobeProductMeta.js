import { echantillonsApi, essaisApi, prelevementsApi } from '@/services/api'
import { parseEssaiResultats } from '@/lib/essaiFeuilleRoutes'
import {
  TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS,
  TERRAIN_FABRICATION_SITE_SELECT_OPTIONS,
  TERRAIN_FORMULA_SELECT_OPTIONS,
  TERRAIN_PRODUCT_SELECT_OPTIONS,
} from '@/lib/terrainEssaiSelectOptions'

export const EMPTY_ENROBE_PRODUCT_META = {
  lieu_fabrication: '',
  numero_formule: '',
  produit_controle: '',
  couche: '',
  epaisseur_couche_cm: '',
  date_mise_en_oeuvre: '',
  atelier_mise_en_oeuvre: '',
  section_controlee: '',
}

const SAMPLE_SIBLING_CODES = ['CFE', 'EL', 'MVA', 'FTP']

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function toDateInput(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function labelFromOptions(options, value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const match = (options || []).find((item) => (
    String(item.value || '').trim() === raw || String(item.label || '').trim() === raw
  ))
  return match?.label || raw
}

export function mergeEmptyProductMeta(current = {}, incoming = {}) {
  const next = { ...EMPTY_ENROBE_PRODUCT_META, ...current }
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (!String(next[key] || '').trim() && String(value || '').trim()) {
      next[key] = value
    }
  })
  return next
}

export function formatEnrobeProductLabel(field, value) {
  if (field === 'lieu_fabrication') return labelFromOptions(TERRAIN_FABRICATION_SITE_SELECT_OPTIONS, value)
  if (field === 'numero_formule') return labelFromOptions(TERRAIN_FORMULA_SELECT_OPTIONS, value)
  if (field === 'produit_controle') return labelFromOptions(TERRAIN_PRODUCT_SELECT_OPTIONS, value)
  if (field === 'criteria_source') return labelFromOptions(TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS, value)
  return String(value || '').trim()
}

function extractProductFromPayload(parsed = {}) {
  const draft = parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : {}
  const essai = parsed.essai && typeof parsed.essai === 'object' ? parsed.essai : {}
  const header = (parsed.header && typeof parsed.header === 'object')
    ? parsed.header
    : (draft.header && typeof draft.header === 'object' ? draft.header : {})
  const product = (parsed.product && typeof parsed.product === 'object')
    ? parsed.product
    : (draft.product && typeof draft.product === 'object' ? draft.product : {})
  const thresholds = parsed.thresholds && typeof parsed.thresholds === 'object' ? parsed.thresholds : {}
  const criteres = draft.criteres && typeof draft.criteres === 'object' ? draft.criteres : {}
  const seuilMini = criteres.seuilMini && typeof criteres.seuilMini === 'object' ? criteres.seuilMini : {}
  const seuilMaxi = criteres.seuilMaxi && typeof criteres.seuilMaxi === 'object' ? criteres.seuilMaxi : {}

  return {
    product: {
      lieu_fabrication: firstText(
        product.lieu_fabrication,
        essai.lieu_fabrication,
        parsed.lieu_fabrication,
        draft.lieuFabrication,
        header.origin,
      ),
      numero_formule: firstText(
        product.numero_formule,
        essai.code_formule,
        parsed.formula_code,
        parsed.code_formule,
        draft.codeFormule,
      ),
      produit_controle: firstText(
        product.produit_controle,
        essai.appellation_europeenne,
        parsed.appellation_europeenne,
        parsed.nature_produit,
        parsed.nature_materiau,
        header.productNature,
        draft.appellationEuropeenne,
        essai.appellation_francaise,
        parsed.appellation_francaise,
      ),
      couche: firstText(product.couche, essai.couche, parsed.couche, header.layer, draft.couche),
      epaisseur_couche_cm: firstText(product.epaisseur_couche_cm, essai.epaisseur_couche_cm, parsed.epaisseur_couche_cm),
      date_mise_en_oeuvre: toDateInput(firstText(
        product.date_mise_en_oeuvre,
        essai.date_mise_en_oeuvre,
        parsed.date_mise_en_oeuvre,
        draft.dateMiseEnOeuvre,
      )),
      atelier_mise_en_oeuvre: firstText(product.atelier_mise_en_oeuvre, essai.atelier_mise_en_oeuvre, parsed.atelier_mise_en_oeuvre),
      section_controlee: firstText(
        product.section_controlee,
        essai.destination_produit,
        parsed.section_controlee,
        parsed.destination,
        draft.destinationProduit,
        essai.site,
        draft.site,
      ),
    },
    criteriaSource: firstText(essai.source_criteres, draft.sourceCriteres, parsed.criteria_source),
    liantMini: firstText(seuilMini.teneurLiant, thresholds.teneur_liant_min_percent),
    liantMaxi: firstText(seuilMaxi.teneurLiant, thresholds.teneur_liant_max_percent),
    moduleMini: firstText(seuilMini.moduleRichesse, thresholds.module_richesse_min),
    chantier: firstText(essai.chantier, draft.chantier, parsed.chantier),
    affairNumber: firstText(essai.numero_affaire, draft.numeroAffaire, parsed.affairNumber),
    operateur: firstText(essai.operateur, draft.operateur, parsed.operateur),
  }
}

function mergeInheritedContext(base, incoming) {
  if (!incoming) return base
  return {
    product: mergeEmptyProductMeta(base.product, incoming.product),
    criteriaSource: firstText(base.criteriaSource, incoming.criteriaSource),
    liantMini: firstText(base.liantMini, incoming.liantMini),
    liantMaxi: firstText(base.liantMaxi, incoming.liantMaxi),
    moduleMini: firstText(base.moduleMini, incoming.moduleMini),
    chantier: firstText(base.chantier, incoming.chantier),
    affairNumber: firstText(base.affairNumber, incoming.affairNumber),
    operateur: firstText(base.operateur, incoming.operateur),
    datePrelevement: firstText(base.datePrelevement, incoming.datePrelevement),
  }
}

export function applyInheritedElContext(draft, inherited) {
  if (!inherited) return draft
  return {
    ...draft,
    chantier: firstText(draft.chantier, inherited.chantier),
    affairNumber: firstText(draft.affairNumber, inherited.affairNumber),
    operateur: firstText(draft.operateur, inherited.operateur),
    datePrelevement: firstText(draft.datePrelevement, inherited.datePrelevement),
    product: mergeEmptyProductMeta(draft.product, inherited.product),
    criteria: {
      ...draft.criteria,
      source: firstText(draft.criteria?.source, inherited.criteriaSource),
      liantMini: firstText(draft.criteria?.liantMini, inherited.liantMini),
      liantMaxi: firstText(draft.criteria?.liantMaxi, inherited.liantMaxi),
      moduleMini: firstText(draft.criteria?.moduleMini, inherited.moduleMini),
    },
  }
}

export async function loadEnrobeContextFromSample({
  echantillonId = '',
  prelevementId = '',
  excludeEssaiUid = '',
} = {}) {
  let echId = Number.parseInt(String(echantillonId || ''), 10)
  let prelId = Number.parseInt(String(prelevementId || ''), 10)
  if ((!Number.isInteger(echId) || echId <= 0) && Number.isInteger(prelId) && prelId > 0) {
    const prelevementOnly = await prelevementsApi.get(prelId).catch(() => null)
    const linkedEchantillon = Array.isArray(prelevementOnly?.echantillons)
      ? prelevementOnly.echantillons.find((row) => Number.parseInt(String(row?.uid || row?.id || ''), 10) > 0)
      : null
    const linkedId = Number.parseInt(String(linkedEchantillon?.uid || linkedEchantillon?.id || ''), 10)
    if (Number.isInteger(linkedId) && linkedId > 0) echId = linkedId
    else {
      const inherited = {
        product: mergeEmptyProductMeta(EMPTY_ENROBE_PRODUCT_META, {
          produit_controle: firstText(prelevementOnly?.materiau),
          section_controlee: firstText(prelevementOnly?.zone, prelevementOnly?.description),
        }),
        criteriaSource: '',
        liantMini: '',
        liantMaxi: '',
        moduleMini: '',
        chantier: firstText(prelevementOnly?.chantier, prelevementOnly?.site),
        affairNumber: firstText(prelevementOnly?.affaire_reference, prelevementOnly?.affaire_ref),
        operateur: firstText(prelevementOnly?.technicien),
        datePrelevement: toDateInput(prelevementOnly?.date_prelevement),
      }
      const hasAny = Object.values(inherited.product).some((value) => String(value || '').trim())
        || firstText(inherited.chantier, inherited.affairNumber, inherited.operateur, inherited.datePrelevement)
      return hasAny ? inherited : null
    }
  }

  if (!Number.isInteger(echId) || echId <= 0) return null

  try {
    const echantillon = await echantillonsApi.get(echId)
    if (!Number.isInteger(prelId) || prelId <= 0) {
      prelId = Number.parseInt(String(echantillon?.prelevement_id || ''), 10)
    }
    const prelevement = (Number.isInteger(prelId) && prelId > 0)
      ? await prelevementsApi.get(prelId).catch(() => null)
      : null

    const siblings = await essaisApi.list({ echantillon_id: echId }).catch(() => [])
    const excludeUid = String(excludeEssaiUid || '').trim()
    const labSiblings = (Array.isArray(siblings) ? siblings : [])
      .filter((row) => {
        const code = String(row?.essai_code || row?.code_essai || '').trim().toUpperCase()
        if (!SAMPLE_SIBLING_CODES.includes(code)) return false
        if (excludeUid && String(row?.uid || '') === excludeUid) return false
        return true
      })
      .sort((left, right) => {
        const leftCode = String(left?.essai_code || '').trim().toUpperCase()
        const rightCode = String(right?.essai_code || '').trim().toUpperCase()
        return SAMPLE_SIBLING_CODES.indexOf(leftCode) - SAMPLE_SIBLING_CODES.indexOf(rightCode)
      })

    let inherited = {
      product: { ...EMPTY_ENROBE_PRODUCT_META },
      criteriaSource: '',
      liantMini: '',
      liantMaxi: '',
      moduleMini: '',
      chantier: '',
      affairNumber: '',
      operateur: '',
      datePrelevement: '',
    }

    labSiblings.forEach((row) => {
      inherited = mergeInheritedContext(inherited, extractProductFromPayload(parseEssaiResultats(row?.resultats)))
    })

    inherited = mergeInheritedContext(inherited, {
      product: {
        produit_controle: firstText(prelevement?.materiau, echantillon?.designation, echantillon?.nature),
        section_controlee: firstText(echantillon?.localisation, prelevement?.zone, prelevement?.description),
      },
      chantier: firstText(echantillon?.chantier, echantillon?.site, prelevement?.chantier, prelevement?.site),
      affairNumber: firstText(
        echantillon?.affaire_ref,
        echantillon?.affaire_reference,
        prelevement?.affaire_reference,
        prelevement?.affaire_ref,
      ),
      operateur: firstText(prelevement?.technicien),
      datePrelevement: toDateInput(firstText(echantillon?.date_prelevement, prelevement?.date_prelevement)),
    })

    const hasAny = Object.values(inherited.product).some((value) => String(value || '').trim())
      || firstText(inherited.chantier, inherited.affairNumber, inherited.operateur, inherited.datePrelevement)
    return hasAny ? inherited : null
  } catch {
    return null
  }
}

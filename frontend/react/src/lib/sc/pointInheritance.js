function parseInterventionObservations(raw) {
    if (!raw || typeof raw !== "string") return {}
    const trimmed = raw.trim()
    if (!trimmed.startsWith("{")) return {}
    try {
        const parsed = JSON.parse(trimmed)
        return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
        return {}
    }
}

function toIsoDateOnly(value) {
    const text = String(value || "").trim()
    if (!text) return ""
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
    const parsed = new Date(text)
    if (Number.isNaN(parsed.getTime())) return ""
    return parsed.toISOString().slice(0, 10)
}

function normalizeText(value) {
    return String(value ?? "").trim()
}

function defaultPointCodePrefix(codeFeuille) {
    const code = normalizeText(codeFeuille).toUpperCase()
    if (code === "SC") return "SC"
    if (code === "SO") return "SP"
    if (code) return code.slice(0, 2)
    return "PT"
}

/** Prochain code point (aligné sur allocate_next_point_code_for_scope côté API). */
export function suggestNextScPointCode(feuilleData = {}, existingPoints = []) {
    const prefix = defaultPointCodePrefix(feuilleData?.code_feuille)
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*0*(\\d+)$`, "i")
    const points = Array.isArray(existingPoints)
        ? existingPoints
        : (Array.isArray(feuilleData?.points) ? feuilleData.points : [])

    const usedNumbers = new Set()
    for (const point of points) {
        const code = normalizeText(point?.point_code).toUpperCase()
        const match = code.match(pattern)
        if (match) usedNumbers.add(Number.parseInt(match[1], 10))
    }

    const nextNumber = usedNumbers.size ? Math.max(...usedNumbers) + 1 : 1
    return `${prefix}${nextNumber}`
}

/** Document de référence rapport SC — demande + campagne (saisie éditable ensuite). */
export function buildInheritedScDocumentReference(feuilleData = {}, interventionData = null) {
    const parts = []

    const demandeReference = normalizeText(
        feuilleData?.demande_reference
        || interventionData?.demande_reference
        || interventionData?.demande_ref,
    )
    if (demandeReference) parts.push(demandeReference)

    const campagneReference = normalizeText(
        feuilleData?.campagne_reference
        || interventionData?.campaign_ref,
    )
    const campagneLabel = normalizeText(
        feuilleData?.campagne_label
        || interventionData?.campaign_label
        || interventionData?.campaign_designation,
    )
    const campagnePart = [campagneReference, campagneLabel]
        .filter(Boolean)
        .filter((item, index, list) => index === 0 || !list[0].includes(item))
        .join(" · ")
    if (campagnePart) parts.push(campagnePart)

    return parts.join(" · ")
}

function buildInheritedScTypeOuvrage(interventionData = null) {
    const chantier = normalizeText(interventionData?.chantier)
    if (chantier) return chantier
    return normalizeText(interventionData?.site)
}

/** Titre lisible de l'intervention (hero SC). */
export function buildScInterventionTitle(feuilleData = {}, interventionData = null) {
    const sujet = normalizeText(interventionData?.sujet || feuilleData?.intervention_subject)
    if (sujet) return sujet

    const type = normalizeText(interventionData?.type_intervention || feuilleData?.type_intervention)
    const ref = normalizeText(feuilleData?.intervention_reference || interventionData?.reference)
    if (type && ref) return `${type} · ${ref}`
    return type || ref || ""
}

/** Références affaire / demande — une seule ligne compacte (barre SC). */
export function buildScAffaireDemandeRefs(feuilleData = {}, interventionData = null) {
    const demande = normalizeText(
        feuilleData?.demande_reference
        || interventionData?.demande_reference
        || interventionData?.demande_ref,
    )
    const affaire = normalizeText(
        feuilleData?.affaire_reference
        || interventionData?.affaire_reference
        || interventionData?.affaire_ref,
    )
    return { affaire, demande }
}

export function buildScAffaireDemandeLine(feuilleData = {}, interventionData = null) {
    const { affaire, demande } = buildScAffaireDemandeRefs(feuilleData, interventionData)
    return [affaire, demande].filter(Boolean).join(" · ")
}

function buildInheritedScPartieOuvrage(interventionData = null) {
    const observations = parseInterventionObservations(interventionData?.observations)
    const zoneParts = [
        observations.campaign_zone_type,
        observations.campaign_planche,
    ].map(normalizeText).filter(Boolean)
    if (zoneParts.length) return zoneParts.join(" · ")

    const sujet = normalizeText(interventionData?.sujet)
    if (sujet) return sujet

    return normalizeText(
        interventionData?.campaign_label
        || interventionData?.campaign_designation,
    )
}

/**
 * Champs SC proposés depuis feuille / intervention (pas Profil/PK).
 * Le champ générique « ouvrage » est exclu — non utilisé sur le rapport SC.
 */
export function buildInheritedScPointFields(feuilleData = {}, interventionData = null) {
    const observations = parseInterventionObservations(interventionData?.observations)
    const fields = {}

    const datePoint = toIsoDateOnly(feuilleData?.date_feuille)
        || toIsoDateOnly(interventionData?.date_intervention)
    if (datePoint) fields.date_point = datePoint

    const operateur = String(feuilleData?.operateur || interventionData?.technicien || "").trim()
    if (operateur) fields.operateur = operateur

    const localisation = String(
        observations.zone_intervention
        || interventionData?.zone
        || "",
    ).trim()
    if (localisation) fields.localisation = localisation

    const documentReference = buildInheritedScDocumentReference(feuilleData, interventionData)
    if (documentReference) fields.document_reference = documentReference

    const typeOuvrage = buildInheritedScTypeOuvrage(interventionData)
    if (typeOuvrage) fields.type_ouvrage = typeOuvrage

    const partieOuvrage = buildInheritedScPartieOuvrage(interventionData)
    if (partieOuvrage) fields.partie_ouvrage = partieOuvrage

    const pointCode = suggestNextScPointCode(feuilleData)
    if (pointCode) fields.point_code = pointCode

    return fields
}

/** Si l'un est vide, recopie l'autre (Opérateur ↔ Sondeur). */
export function applyOperatorSondeurCrossFill(form = {}) {
    const next = { ...form }
    const operateur = String(next.operateur ?? "").trim()
    const sondeur = String(next.sondeur ?? "").trim()
    if (!operateur && sondeur) next.operateur = sondeur
    else if (!sondeur && operateur) next.sondeur = operateur
    return next
}

/** Applique l'héritage uniquement sur les champs encore vides (rascunho éditable). */
export function mergeInheritedScPointFields(existingForm = {}, feuilleData = {}, interventionData = null) {
    const inherited = buildInheritedScPointFields(feuilleData, interventionData)
    const merged = { ...existingForm }
    for (const [key, value] of Object.entries(inherited)) {
        const current = String(merged[key] ?? "").trim()
        const next = String(value ?? "").trim()
        if (!current && next) merged[key] = next
    }
    return applyOperatorSondeurCrossFill(merged)
}

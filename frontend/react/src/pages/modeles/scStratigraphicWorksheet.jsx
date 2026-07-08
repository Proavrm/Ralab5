// Feuille SC terrain — coupe carottée, photos et couches.
// Monté par ModeleSCPage.jsx (données API feuilles-terrain). Logique terrain alignée sur FeuilleTerrainPage.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Button from "@/components/ui/Button"
import PhotoCropModal from "@/components/ui/PhotoCropModal"
import Input from "@/components/ui/Input"
import { navigateWithReturnTo } from "@/lib/detailNavigation"
import { buildScAffaireDemandeLine, buildScInterventionTitle } from "@/lib/sc/pointInheritance"
import { renderTerrainSelectOptionExtras } from "@/lib/terrainEssaiSelectOptions"
import { formatDate } from "@/lib/utils"
import { getFeuilleTypeConfig } from "@/pages/terrain/feuilleTypeRegistry"
import { feuillesTerrainApi } from "@/services/api"

function Select({ value, onChange, readOnly = false, children, className = "", onClick = null }) {
    return (
        <select
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
            onClick={onClick}
            disabled={readOnly}
            className={`w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
        >
            {children}
        </select>
    )
}

// Constantes et helpers métier SC (sondage carotte) — référence terrain: FeuilleTerrainPage.jsx.
// -----------------------------------------------------------------------------
const TEXTURE_OPTIONS = ['', 'argileux', 'argilo-limoneux', 'argilo-sableux', 'limono-argilo-sableux', 'limoneux', 'limono-argileux', 'limono-sableux', 'sableux', 'sablo-limoneux']
const PROPORTION_OPTIONS = ['', '0-25 %', '25-50 %', '50-75 %', '75-90 %', '100 %']
const ELEMENTS_OPTIONS = ['', 'autres', 'blocs', 'sphérique', 'allongé', 'aplati', 'anguleux', 'sub anguleux', 'sub arrondi', 'arrondi']
const PETROGRAPHIE_OPTIONS = ['', 'polygénique', 'cristallin', 'détritique', 'volcanique', 'calcaire', 'granite', 'gneiss', 'schistes', 'grès', 'quartzite', 'craie', 'tuf']
const STRUCTURE_OPTIONS = ['', 'compacte', 'grumeleuse', 'poudreuse', 'pulvérulent']
const ORGANIQUE_OPTIONS = ['', 'beaucoup', 'moyen', 'peu', 'pas']
const COULEUR_OPTIONS = ['', 'blanc', 'gris', 'jaune', 'rose', 'brun', 'rouge', 'olive', 'noir', 'vif', 'pâle', 'clair', 'foncé', 'très sombre']
const ODEUR_OPTIONS = ['', 'pas', 'faible', 'humus', 'réductrice', 'hydrocarbures', 'fort']
const CONSISTANCE_OPTIONS = ['', 'très molle (déforme sous propre poids)', 'molle (écrasé entre doigts)', 'moyenne (enfonce le pouce)', 'ferme (enfonce pouce en forçant)', 'dure (pouce = faible marque)', 'très dure (pouce aucune marque)']
const COHESION_OPTIONS = ['', 'pas', 'peu', 'moyen', 'très']
const OXYDO_OPTIONS = ['', 'oxydé', 'réduit', 'zone temp.']
const EAU_OPTIONS = ['', 'humide', "venues d'eau: niveau stabilisé"]
const HORIZON_OPTIONS = ['', 'terre végétale', 'remblai', 'sous couche ou transition', 'colluvions', 'éboulis', 'alluvions', 'dépôts tourbe', 'moraine']
const CAROTTE_ANNOTATION_CATEGORIES = ['', 'interface', 'vide', 'fissure', 'doute']

function ScCard({ title, children, right }) {
    return (
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
            {title ? (
                <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
                    {right}
                </div>
            ) : null}
            <div className="p-4">{children}</div>
        </div>
    )
}

// Barre feuille de travail SC — position fixed sous la barre « Menu » (AppLayout).
// TODO: extraire FeuilleWorkToolbar partagée pour toutes les feuilles terrain/labo
//       (SC, SO, PMT, DE, NT, VC, essais génériques, etc.).
//       FicheTopbar (FicheLayout.jsx) reste le modèle visuel des fiches RST (demande, campagne…).
function ScSheetToolbar({ backLabel, onBack, title, subtitle, actions }) {
    const barRef = useRef(null)
    const [barHeight, setBarHeight] = useState(72)

    useLayoutEffect(() => {
        const node = barRef.current
        if (!node) return undefined
        const update = () => setBarHeight(node.offsetHeight)
        update()
        const observer = new ResizeObserver(update)
        observer.observe(node)
        return () => observer.disconnect()
    }, [backLabel, title, subtitle, actions])

    return (
        <>
            <div aria-hidden className="-mt-6 shrink-0" style={{ height: barHeight }} />
            <div
                ref={barRef}
                className="fixed z-40 border-b border-[#dbe1ea] bg-white"
                style={{
                    top: 'var(--app-chrome-top, 0px)',
                    left: 'var(--app-sidebar-width, 0px)',
                    right: 0,
                    boxShadow: '0 6px 24px rgba(0,49,112,0.08)',
                }}
            >
                <div style={{ height: '4px', background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)' }} />
                <div className="w-full max-w-full mx-auto px-7 flex flex-wrap items-center gap-2.5 py-3">
                    <button
                        onClick={onBack}
                        className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0"
                    >
                        {backLabel}
                    </button>
                    <div className="flex-1 min-w-[220px]">
                        <div className="text-[#8a95a8] text-[11px] font-bold tracking-[.14em] uppercase">{subtitle || 'Sondage SC'}</div>
                        <div className="text-[15px] font-black">{title}</div>
                    </div>
                    {actions}
                </div>
            </div>
        </>
    )
}

function ScRow({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={`text-[13px] font-medium ${value ? 'text-text' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>
        </div>
    )
}

function ScField({ label, children, full = false }) {
    return (
        <div className={full ? 'md:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
            <label className="text-[11px] font-medium text-text-muted">{label}</label>
            {children}
        </div>
    )
}

function ScTextarea({ value, onChange, rows = 3, placeholder = '' }) {
    return (
        <textarea
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
        />
    )
}

function ScSelect({ value, onChange, children, className = '', disabled = false, onClick = null }) {
    return (
        <Select
            value={value || ''}
            onChange={(nextValue) => {
                if (typeof onChange === 'function') {
                    onChange({ target: { value: nextValue } })
                }
            }}
            onClick={onClick}
            className={className}
            readOnly={disabled}
        >
            {children}
        </Select>
    )
}


function scParseNumber(value) {
    if (value == null || value === '') return null
    const parsed = Number(String(value).replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
}

function scMetersToCentimeters(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return null
    return Number((numeric * 100).toFixed(2))
}

function scCentimetersToMeters(value) {
    const numeric = scParseNumber(value)
    if (numeric == null) return null
    return Number((numeric / 100).toFixed(6))
}

function scFormatDepthCmValue(value) {
    const numeric = scParseNumber(value)
    if (numeric == null) return '—'
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} cm`
}

function scScCoucheDepthString(value) {
    if (value == null || value === '') return ''
    return String(value)
}

function scResolveProcedeFromEquipment(selected) {
    if (!selected || typeof selected !== 'object') return ''
    const domain = String(selected.domain || '').trim()
    if (domain) return domain
    const equipmentLabel = String(selected.equipment_label || '').trim()
    if (equipmentLabel) return equipmentLabel
    return String(selected.label || '').trim()
}

function scComputeThicknessCm(couche) {
    const zHaut = Number(couche?.z_haut)
    const zBas = Number(couche?.z_bas)
    if (!Number.isFinite(zHaut) || !Number.isFinite(zBas)) return null
    if (zBas < zHaut) return null
    return Number(((zBas - zHaut) * 100).toFixed(2))
}

function scComputeScCoucheThicknessCm(couche) {
    const zHaut = Number(couche?.z_haut)
    const zBas = Number(couche?.z_bas)
    if (!Number.isFinite(zHaut) || !Number.isFinite(zBas)) return null
    if (zBas < zHaut) return null
    return Number((zBas - zHaut).toFixed(2))
}

function scReadFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'))
        reader.readAsDataURL(file)
    })
}

function scBuildCarotteAnnotations(point = null) {
    if (!Array.isArray(point?.carotte_annotations)) return []
    return point.carotte_annotations
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
            id: String(item.id || `annotation-${index + 1}`),
            x: Number.isFinite(Number(item.x)) ? Number(item.x) : 50,
            y: Number.isFinite(Number(item.y)) ? Number(item.y) : 50,
            category: String(item.category || ''),
            text: String(item.text || ''),
        }))
}

function scAreAnnotationsEqual(left, right) {
    return JSON.stringify(Array.isArray(left) ? left : []) === JSON.stringify(Array.isArray(right) ? right : [])
}

function scCreateAnnotationId() {
    return `annot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function scCreateCoupeId() {
    return `coupe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function scCreateCoupeLayerId() {
    return `coupe-layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function scGetScCoupeBoundsCm(layers = [], fallbackTotalHeightCm = '') {
    const normalizedLayers = Array.isArray(layers) ? layers : []
    const zHauts = normalizedLayers.map((layer) => Number(layer?.z_haut)).filter((value) => Number.isFinite(value))
    const zBas = normalizedLayers.map((layer) => Number(layer?.z_bas)).filter((value) => Number.isFinite(value))
    const startCm = zHauts.length ? String(Math.min(...zHauts)) : '0'
    const fallbackEndCm = String(fallbackTotalHeightCm ?? '').trim()
    const endCm = zBas.length ? String(Math.max(...zBas)) : fallbackEndCm
    return {
        depth_start_cm: startCm,
        depth_end_cm: endCm,
    }
}

function scBuildDefaultScCoupe({ pointForm, selectedPhoto = null, couches, title = 'Coupe 1', assignPhoto = false }) {
    const normalizedLayers = scCloneCoupeLayers(couches).map((layer) => ({
        ...layer,
        uid: scCreateCoupeLayerId(),
    }))
    const bounds = scGetScCoupeBoundsCm(normalizedLayers, pointForm?.carotte_total_height_cm || '')
    const photo = assignPhoto ? selectedPhoto : null
    return {
        id: scCreateCoupeId(),
        title,
        photo_stored_name: photo?.stored_name || '',
        photo_url: photo?.url || '',
        depth_start_cm: bounds.depth_start_cm,
        depth_end_cm: bounds.depth_end_cm,
        total_height_cm: pointForm?.carotte_total_height_cm || '',
        couches: normalizedLayers,
        notes: '',
    }
}

function scCoupePhotoCode(coupe, index = 0) {
    const title = String(coupe?.title || `Coupe ${index + 1}`).trim()
    const compact = title.replace(/\s+/g, '')
    return compact || `Coupe${index + 1}`
}

function scPhotoItemUrl(photo, photoVersion = 0) {
    if (!photo?.url) return ''
    const base = String(photo.url).trim().split('?')[0]
    return `${base}?v=${photoVersion}`
}

function scStablePhotoKey({ storedName = '', url = '' } = {}) {
    const normalizedStored = String(storedName || '').trim()
    if (normalizedStored) return `stored:${normalizedStored}`
    const normalizedUrl = String(url || '').trim().split('?')[0]
    return normalizedUrl ? `url:${normalizedUrl}` : ''
}

function scFindGalleryPhoto(photoItems, storedName) {
    const key = String(storedName || '').trim()
    if (!key || !Array.isArray(photoItems)) return null
    return photoItems.find((item) => (
        item?.stored_name === key
        || item?.filename === key
        || item?.original_name === key
    )) || null
}

function scIsWbsNumberedPhotoName(name = '') {
    const normalized = String(name || '').trim()
    if (!normalized) return false
    return /(?:__|_)F\d{2}\.(?:jpe?g|png)$/i.test(normalized)
}

function scIsLegacyImportedPhotoUrl(url = '') {
    const normalized = String(url || '').trim()
    return normalized.includes('/photos/sc/') || normalized.includes('/photos/de/')
}

function scIsFeuilleUploadPhoto({ storedName = '', photoUrl = '', feuilleUid = null } = {}) {
    const name = String(storedName || '').trim()
    if (scIsWbsNumberedPhotoName(name)) return true
    const url = String(photoUrl || '').trim()
    if (url) {
        const fileName = url.split('/').pop()?.split('?')[0] || ''
        if (scIsWbsNumberedPhotoName(fileName)) return true
    }
    return false
}

function scResolveCoupePhotoUrl({
    storedName = '',
    photoUrl = '',
    photoItems = [],
    feuilleUid = null,
    sourceEssaiId = null,
    photoVersion = 0,
    fallbackPhoto = null,
    coupe = null,
    coupeIndex = 0,
} = {}) {
    const normalizedStored = String(storedName || '').trim()
    if (normalizedStored) {
        const matched = scFindGalleryPhoto(photoItems, normalizedStored)
        if (matched?.url) return scPhotoItemUrl(matched, photoVersion)
        if (feuilleUid && normalizedStored) {
            return `/api/photos/feuille/${feuilleUid}/files/${encodeURIComponent(normalizedStored)}?v=${photoVersion}`
        }
        if (sourceEssaiId && normalizedStored) {
            return `/api/photos/essai/${sourceEssaiId}/files/${encodeURIComponent(normalizedStored)}?v=${photoVersion}`
        }
    }

    const directUrl = String(photoUrl || '').trim()
    if (directUrl) {
        if (feuilleUid && normalizedStored && scIsLegacyImportedPhotoUrl(directUrl)) {
            return `/api/photos/feuille/${feuilleUid}/files/${encodeURIComponent(normalizedStored)}?v=${photoVersion}`
        }
        const fileName = directUrl.split('/').pop()?.split('?')[0] || ''
        const matchedByPath = fileName ? scFindGalleryPhoto(photoItems, fileName) : null
        if (matchedByPath?.url) return scPhotoItemUrl(matchedByPath, photoVersion)
        if (scIsLegacyImportedPhotoUrl(directUrl)) {
            return `${directUrl.split('?')[0]}?v=${photoVersion}`
        }
        return `${directUrl.split('?')[0]}?v=${photoVersion}`
    }

    if (fallbackPhoto?.url) return scPhotoItemUrl(fallbackPhoto, photoVersion)
    return ''
}

function scNormalizeGalleryPhoto(photo, { feuilleUid = null, sourceEssaiId = null, source = 'feuille' } = {}) {
    if (!photo || typeof photo !== 'object') return null
    const storedName = String(photo.stored_name || photo.filename || '').trim()
    if (!storedName) return null
    const existingUrl = String(photo.url || photo.photo_url || '').trim()
    let url = existingUrl
    if (!url) {
        if (source === 'essai' && sourceEssaiId) {
            url = `/api/photos/essai/${sourceEssaiId}/files/${encodeURIComponent(storedName)}`
        } else if (feuilleUid) {
            url = `/api/photos/feuille/${feuilleUid}/files/${encodeURIComponent(storedName)}`
        }
    }
    return {
        ...photo,
        source,
        stored_name: storedName,
        filename: String(photo.filename || storedName),
        original_name: String(photo.original_name || storedName),
        url,
    }
}

function scMergePhotoItems({ feuillePhotos = [], essaiPhotos = [], carotteCoupes = [], feuilleUid = null, sourceEssaiId = null }) {
    const map = new Map()

    const addPhoto = (photo, source = 'feuille') => {
        const normalized = scNormalizeGalleryPhoto(photo, { feuilleUid, sourceEssaiId, source })
        if (!normalized?.stored_name) return
        if (!map.has(normalized.stored_name)) {
            map.set(normalized.stored_name, normalized)
        }
    }

    feuillePhotos.forEach((photo) => addPhoto(photo, 'feuille'))

    if (!feuilleUid) {
        essaiPhotos.forEach((photo) => addPhoto(photo, 'essai'))
    }

    for (const coupe of carotteCoupes) {
        const storedName = String(coupe?.photo_stored_name || '').trim()
        const directUrl = String(coupe?.photo_url || '').trim()
        if (scIsLegacyImportedPhotoUrl(directUrl) && !scIsFeuilleUploadPhoto({ storedName, photoUrl: directUrl, feuilleUid })) {
            continue
        }
        if (feuilleUid && !storedName && directUrl && !scIsFeuilleUploadPhoto({ storedName, photoUrl: directUrl, feuilleUid })) {
            continue
        }
        const fileName = storedName || directUrl.split('/').pop()?.split('?')[0] || ''
        if (!fileName || map.has(fileName)) continue
        const source = directUrl.includes('/photos/essai/') ? 'essai' : 'feuille'
        addPhoto({
            stored_name: fileName,
            url: directUrl,
            original_name: fileName,
        }, source)
    }

    const items = Array.from(map.values())
    if (items.length && !items.some((item) => item.is_primary)) {
        items[0] = { ...items[0], is_primary: true }
    }
    return items
}

function scNormalizeCoupeLayer(layer = {}, index = 0) {
    return {
        ...layer,
        uid: String(layer?.uid || layer?.draft_uid || `coupe-layer-${index + 1}` || scCreateCoupeLayerId()),
        prelevements: Array.isArray(layer?.prelevements) ? layer.prelevements : [],
    }
}

function scCloneCoupeLayers(layers = []) {
    return (Array.isArray(layers) ? layers : []).map((layer, index) => scNormalizeCoupeLayer({ ...layer }, index))
}

function scBuildCarotteCoupes(point = null) {
    if (!Array.isArray(point?.carotte_coupes)) return []
    return point.carotte_coupes
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({
            id: String(item.id || `coupe-${index + 1}`),
            title: String(item.title || `Coupe ${index + 1}`),
            photo_stored_name: String(item.photo_stored_name || ''),
            photo_url: String(item.photo_url || ''),
            depth_start_cm: item?.depth_start_m == null || item?.depth_start_m === '' ? '' : String(scMetersToCentimeters(item.depth_start_m)),
            depth_end_cm: item?.depth_end_m == null || item?.depth_end_m === '' ? '' : String(scMetersToCentimeters(item.depth_end_m)),
            total_height_cm: item?.total_height_m == null || item?.total_height_m === '' ? '' : String(scMetersToCentimeters(item.total_height_m)),
            couches: scCloneCoupeLayers(item?.couches),
            notes: String(item.notes || ''),
        }))
}

function scAreCoupesEqual(left, right) {
    return JSON.stringify(Array.isArray(left) ? left : []) === JSON.stringify(Array.isArray(right) ? right : [])
}

function scFormatMetric(value, unit = 'm') {
    if (value == null || value === '') return ''
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
}

function scFormatResult(value, unit) {
    if (value == null || value === '') return ''
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
        return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
    }
    return `${value}${unit ? ` ${unit}` : ''}`
}

function scDisplayPointType(pointType, isSCFeuille = false) {
    const raw = String(pointType || '').trim()
    if (!raw) return ''
    if (isSCFeuille && raw.toUpperCase() === 'SONDAGE_PELLE') return 'Sondage carotte'
    if (raw.toUpperCase() === 'SONDAGE_CAROTTE') return 'Sondage carotte'
    if (raw.toUpperCase() === 'SONDAGE_PELLE') return 'Sondage pelle'
    return raw.replace(/_/g, ' ')
}

function scBuildPointSummary(point, { isSCFeuille = false } = {}) {
    if (isSCFeuille) {
        return [
            point?.profil,
            point?.profondeur_finale_m != null && point?.profondeur_finale_m !== ''
                ? scFormatDepthCm(point.profondeur_finale_m)
                : null,
        ].filter(Boolean).join(' · ')
    }
    return [
        point?.localisation,
        point?.position_label,
        point?.type_ouvrage,
        point?.point_type,
    ].filter(Boolean).join(' · ')
}

function scDefaultPointType(codeFeuille) {
    const code = String(codeFeuille || '').trim().toUpperCase()
    if (code === 'SC') return 'SONDAGE_CAROTTE'
    if (code === 'SO') return 'SONDAGE_PELLE'
    return 'SONDAGE_PELLE'
}

function scFormatDepth(value) {
    if (value == null || value === '') return ''
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m`
}

function scDepthStoredToDisplayCm(value) {
    const numeric = scParseNumber(value)
    if (numeric == null) return null
    // Legacy tolerance: some SC values were historically stored in cm in a meters field.
    if (Math.abs(numeric) > 10) return Number(numeric.toFixed(2))
    return scMetersToCentimeters(numeric)
}

function scFormatDepthCm(value) {
    const numeric = scDepthStoredToDisplayCm(value)
    if (numeric == null) return ''
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} cm`
}

function scBuildPointForm(point = null, codeFeuille = '') {
    const defaultType = scDefaultPointType(codeFeuille)
    const resolvedType = String(point?.point_type || '').trim() || defaultType
    return {
        point_code: point?.point_code || '',
        point_type: codeFeuille?.toUpperCase() === 'SC' && resolvedType === 'SONDAGE_PELLE'
            ? 'SONDAGE_CAROTTE'
            : resolvedType,
        localisation: point?.localisation || '',
        profil: point?.profil || '',
        date_point: point?.date_point || '',
        operateur: point?.operateur || '',
        sondeur: point?.sondeur || '',
        procede: point?.procede || '',
        diametre: point?.diametre || '',
        equipement: point?.equipement || '',
        equipment_id: point?.equipment_id ?? '',
        type_ouvrage: point?.type_ouvrage || '',
        partie_ouvrage: point?.partie_ouvrage || '',
        document_reference: point?.document_reference || '',
        profondeur_finale_m: codeFeuille?.toUpperCase() === 'SC'
            ? (point?.profondeur_finale_m == null || point?.profondeur_finale_m === ''
                ? (point?.profondeur_bas == null ? '' : scMetersToCentimeters(point.profondeur_bas) ?? '')
                : scMetersToCentimeters(point.profondeur_finale_m) ?? '')
            : (point?.profondeur_finale_m ?? point?.profondeur_bas ?? ''),
        carotte_total_height_cm: point?.carotte_total_height_m == null ? '' : scMetersToCentimeters(point?.carotte_total_height_m),
        tenue_fouilles: point?.tenue_fouilles || '',
        venue_eau: codeFeuille?.toUpperCase() === 'SC'
            ? ''
            : (point?.venue_eau == null ? '' : (point.venue_eau ? 'Oui' : 'Non')),
        niveau_nappe: codeFeuille?.toUpperCase() === 'SC' ? '' : (point?.niveau_nappe || ''),
        arret_sondage: point?.arret_sondage || '',
        ouvrage: point?.ouvrage || '',
        notes: point?.notes || '',
        carotte_annotations: scBuildCarotteAnnotations(point),
        carotte_coupes: scBuildCarotteCoupes(point),
    }
}

function scBuildCoucheForm(couche = null) {
    return {
        z_haut: couche?.z_haut ?? '',
        z_bas: couche?.z_bas ?? '',
        texture_matrice: couche?.texture_matrice || '',
        proportion_matrice: couche?.proportion_matrice || '',
        elements_grossiers: couche?.elements_grossiers || '',
        granulo_elements: couche?.granulo_elements || '',
        forme_elements: couche?.forme_elements || '',
        petrographie: couche?.petrographie || '',
        structure: couche?.structure || '',
        matiere_organique: couche?.matiere_organique || '',
        couleur: couche?.couleur || '',
        odeur: couche?.odeur || '',
        consistance: couche?.consistance || '',
        cohesion: couche?.cohesion || '',
        oxydo_reduction: couche?.oxydo_reduction || '',
        eau_porosite: couche?.eau_porosite || '',
        horizon: couche?.horizon || '',
        determination: couche?.determination || '',
        geologie: couche?.geologie || '',
        description_libre: couche?.description_libre || '',
        profondeur_eau: couche?.profondeur_eau ?? '',
    }
}

function scToPointPayload(form, codeFeuille = '') {
    const defaultType = scDefaultPointType(codeFeuille)
    const isSCFeuille = String(codeFeuille || '').toUpperCase() === 'SC'
    let pointType = String(form.point_type || '').trim() || defaultType
    if (isSCFeuille && pointType === 'SONDAGE_PELLE') {
        pointType = 'SONDAGE_CAROTTE'
    }
    return {
        point_code: form.point_code || '',
        point_type: pointType,
        localisation: form.localisation || '',
        profil: form.profil || '',
        date_point: form.date_point || '',
        operateur: form.operateur || '',
        sondeur: form.sondeur || '',
        procede: form.procede || '',
        diametre: form.diametre || '',
        equipement: form.equipement || '',
        equipment_id: scParseNumber(form.equipment_id),
        type_ouvrage: form.type_ouvrage || '',
        partie_ouvrage: form.partie_ouvrage || '',
        document_reference: form.document_reference || '',
        profondeur_finale_m: isSCFeuille ? scCentimetersToMeters(form.profondeur_finale_m) : scParseNumber(form.profondeur_finale_m),
        carotte_total_height_m: scCentimetersToMeters(form.carotte_total_height_cm),
        tenue_fouilles: isSCFeuille ? '' : (form.tenue_fouilles || ''),
        venue_eau: isSCFeuille ? null : (form.venue_eau === '' ? null : form.venue_eau === 'Oui'),
        niveau_nappe: isSCFeuille ? '' : (form.niveau_nappe || ''),
        arret_sondage: form.arret_sondage || '',
        ouvrage: form.ouvrage || '',
        notes: form.notes || '',
        carotte_annotations: Array.isArray(form.carotte_annotations)
            ? form.carotte_annotations.map((item) => ({
                id: String(item.id || scCreateAnnotationId()),
                x: Number.isFinite(Number(item.x)) ? Number(item.x) : 50,
                y: Number.isFinite(Number(item.y)) ? Number(item.y) : 50,
                category: String(item.category || ''),
                text: String(item.text || ''),
            }))
            : [],
        carotte_coupes: Array.isArray(form.carotte_coupes)
            ? form.carotte_coupes.map((item, index) => ({
                id: String(item.id || scCreateCoupeId()),
                title: String(item.title || `Coupe ${index + 1}`),
                photo_stored_name: String(item.photo_stored_name || ''),
                photo_url: String(item.photo_url || ''),
                depth_start_m: scCentimetersToMeters(item.depth_start_cm),
                depth_end_m: scCentimetersToMeters(item.depth_end_cm),
                total_height_m: scCentimetersToMeters(item.total_height_cm),
                couches: scCloneCoupeLayers(item.couches),
                notes: String(item.notes || ''),
            }))
            : [],
    }
}

function scToCouchePayload(form) {
    return {
        insert_after_uid: form?.insertAfterUid == null || form?.insertAfterUid === '' ? null : Number(form.insertAfterUid),
        z_haut: scParseNumber(form.z_haut),
        z_bas: scParseNumber(form.z_bas),
        texture_matrice: form.texture_matrice || '',
        proportion_matrice: form.proportion_matrice || '',
        elements_grossiers: form.elements_grossiers || '',
        granulo_elements: form.granulo_elements || '',
        forme_elements: form.forme_elements || '',
        petrographie: form.petrographie || '',
        structure: form.structure || '',
        matiere_organique: form.matiere_organique || '',
        couleur: form.couleur || '',
        odeur: form.odeur || '',
        consistance: form.consistance || '',
        cohesion: form.cohesion || '',
        oxydo_reduction: form.oxydo_reduction || '',
        eau_porosite: form.eau_porosite || '',
        horizon: form.horizon || '',
        determination: form.determination || '',
        geologie: form.geologie || '',
        description_libre: form.description_libre || '',
        profondeur_eau: scParseNumber(form.profondeur_eau),
    }
}

function ScCoucheEditor({ form, onChange, onSave, onCancel, saving, submitLabel, depthUnit = 'm' }) {
    return (
        <div className="rounded-lg border border-border bg-bg px-4 py-4">
            <div className="grid gap-3 md:grid-cols-2">
                <ScField label={`Profondeur haut (${depthUnit})`}>
                    <Input value={form.z_haut} onChange={(event) => onChange('z_haut', event.target.value)} placeholder={depthUnit === 'cm' ? '0' : '0.00'} />
                </ScField>
                <ScField label={`Profondeur bas (${depthUnit})`}>
                    <Input value={form.z_bas} onChange={(event) => onChange('z_bas', event.target.value)} placeholder={depthUnit === 'cm' ? '9.5' : '0.80'} />
                </ScField>
                <ScField label="Texture matrice">
                    <ScSelect value={form.texture_matrice} onChange={(event) => onChange('texture_matrice', event.target.value)}>
                        {TEXTURE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Proportion matrice">
                    <ScSelect value={form.proportion_matrice} onChange={(event) => onChange('proportion_matrice', event.target.value)}>
                        {PROPORTION_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Éléments grossiers">
                    <ScSelect value={form.elements_grossiers} onChange={(event) => onChange('elements_grossiers', event.target.value)}>
                        {ELEMENTS_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Granulo éléments (mm Ø)">
                    <Input value={form.granulo_elements} onChange={(event) => onChange('granulo_elements', event.target.value)} placeholder="ex: 10-30" />
                </ScField>
                <ScField label="Pétrographie">
                    <ScSelect value={form.petrographie} onChange={(event) => onChange('petrographie', event.target.value)}>
                        {PETROGRAPHIE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Structure">
                    <ScSelect value={form.structure} onChange={(event) => onChange('structure', event.target.value)}>
                        {STRUCTURE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Matière organique">
                    <ScSelect value={form.matiere_organique} onChange={(event) => onChange('matiere_organique', event.target.value)}>
                        {ORGANIQUE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Couleur">
                    <ScSelect value={form.couleur} onChange={(event) => onChange('couleur', event.target.value)}>
                        {COULEUR_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Odeur">
                    <ScSelect value={form.odeur} onChange={(event) => onChange('odeur', event.target.value)}>
                        {ODEUR_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Consistance">
                    <ScSelect value={form.consistance} onChange={(event) => onChange('consistance', event.target.value)}>
                        {CONSISTANCE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Cohésion">
                    <ScSelect value={form.cohesion} onChange={(event) => onChange('cohesion', event.target.value)}>
                        {COHESION_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Oxydo-réduction">
                    <ScSelect value={form.oxydo_reduction} onChange={(event) => onChange('oxydo_reduction', event.target.value)}>
                        {OXYDO_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Eau / porosité">
                    <ScSelect value={form.eau_porosite} onChange={(event) => onChange('eau_porosite', event.target.value)}>
                        {EAU_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="∇ Profondeur eau (m)">
                    <Input value={form.profondeur_eau ?? ''} onChange={(event) => onChange('profondeur_eau', event.target.value)} placeholder="ex: 1.20" />
                </ScField>
                <ScField label="Horizon / Détermination">
                    <ScSelect value={form.horizon} onChange={(event) => onChange('horizon', event.target.value)}>
                        {HORIZON_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </ScSelect>
                </ScField>
                <ScField label="Détermination libre">
                    <Input value={form.determination} onChange={(event) => onChange('determination', event.target.value)} />
                </ScField>
                <ScField label="Géologie">
                    <Input value={form.geologie} onChange={(event) => onChange('geologie', event.target.value)} />
                </ScField>
                <ScField label="Description libre" full>
                    <ScTextarea value={form.description_libre} onChange={(value) => onChange('description_libre', value)} rows={3} />
                </ScField>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={onSave} disabled={saving}>{saving ? '…' : submitLabel}</Button>
                <Button variant="secondary" onClick={onCancel}>Annuler</Button>
            </div>
        </div>
    )
}

function scRenderChainLabo(prelevements, detailReturnTo, navigate) {
    if (!Array.isArray(prelevements) || !prelevements.length) {
        return <div className="text-[13px] text-text-muted">Aucune suite laboratoire générée depuis ce sondage.</div>
    }

    return (
        <div className="flex flex-col gap-3">
            {prelevements.map((prelevement) => (
                <div key={prelevement.uid} className="rounded-lg border border-border bg-bg px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" onClick={() => navigateWithReturnTo(navigate, `/prelevements/${prelevement.uid}`, detailReturnTo)} className="text-[13px] font-semibold text-accent hover:underline">
                            {prelevement.reference}
                        </button>
                        <div className="text-[11px] text-text-muted">{formatDate(prelevement.date_prelevement) || '—'}</div>
                    </div>
                    <div className="mt-1 text-[12px] text-text-muted">{prelevement.description || prelevement.materiau || prelevement.zone || 'Prélèvement'}</div>
                    {Array.isArray(prelevement.echantillons) && prelevement.echantillons.length > 0 ? (
                        <div className="mt-3 ml-4 flex flex-col gap-2 border-l border-border pl-3">
                            {prelevement.echantillons.map((echantillon) => (
                                <div key={echantillon.uid} className="rounded-lg border border-border bg-surface px-3 py-2">
                                    <button type="button" onClick={() => navigateWithReturnTo(navigate, `/echantillons/${echantillon.uid}`, detailReturnTo)} className="text-[12px] font-semibold text-accent hover:underline">
                                        {echantillon.reference}
                                    </button>
                                    <div className="mt-1 text-[11px] text-text-muted">{echantillon.designation || echantillon.localisation || 'Échantillon'}</div>
                                    {Array.isArray(echantillon.essais) && echantillon.essais.length > 0 ? (
                                        <div className="mt-2 ml-4 flex flex-col gap-1 border-l border-border pl-3">
                                            {echantillon.essais.map((essai) => (
                                                <button key={essai.uid} type="button" onClick={() => navigateWithReturnTo(navigate, `/essais/${essai.uid}`, detailReturnTo)} className="text-left text-[11px] text-accent hover:underline">
                                                    {(essai.essai_code || essai.type_essai || 'Essai')} · {essai.type_essai || ''}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-3 ml-4 rounded-md border border-dashed border-border bg-surface px-3 py-2 text-[11px] text-text-muted">
                            Aucun échantillon lié.
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}


// ── Hachures par texture ───────────────────────────────────────────────────────
const TEXTURE_PATTERNS = {
    'argileux':              { fill: '#d4a8a8', hatch: 'argile' },
    'argilo-limoneux':       { fill: '#c8b8c0', hatch: 'argile' },
    'argilo-sableux':        { fill: '#c8b89a', hatch: 'argilo-sableux' },
    'limono-argilo-sableux': { fill: '#c8c0a0', hatch: 'limon' },
    'limoneux':              { fill: '#d4c88a', hatch: 'limon' },
    'limono-argileux':       { fill: '#ccbf90', hatch: 'limon' },
    'limono-sableux':        { fill: '#d4c878', hatch: 'sableux' },
    'sableux':               { fill: '#f0e0a0', hatch: 'sableux' },
    'sablo-limoneux':        { fill: '#e8d890', hatch: 'sableux' },
}

function ScCoupeSVG({ point, couches, prelevements, isSCFeuille = false, photoUrl = '', photoError = false, totalHeightValue = null, annotations = [], selectedAnnotationId = null, onSelectAnnotation = () => {}, onStartDragAnnotation = () => {}, onCanvasClick = () => {}, photoCanvasRef = null, onPhotoLoad = () => {}, onPhotoError = () => {} }) {
    if (isSCFeuille) {
        const [photoNaturalSize, setPhotoNaturalSize] = useState({ width: 0, height: 0 })
        const axisWidth = 34
        const topMargin = 18
        const bottomMargin = 28
        const visualDepthMax = Math.max(
            Number(totalHeightValue || 0),
            ...couches.map((couche) => Number(couche?.z_bas ?? 0)).filter((value) => Number.isFinite(value)),
            0.1,
        )
        // Keep SC visuals responsive for small heights (20-30 cm) entered by users.
        const bodyHeight = Math.max(260, Math.min(920, visualDepthMax * 1800))
        const totalHeightPx = topMargin + bodyHeight + bottomMargin
        const photoRatio = (photoNaturalSize.width > 0 && photoNaturalSize.height > 0)
            ? (photoNaturalSize.width / photoNaturalSize.height)
            : (112 / bodyHeight)
        const photoWidth = Math.max(88, Math.min(220, bodyHeight * photoRatio))
        const width = axisWidth + photoWidth + 12

        useEffect(() => {
            setPhotoNaturalSize({ width: 0, height: 0 })
        }, [String(photoUrl || '').split('?')[0]])

        let renderedPhotoTop = 0
        let renderedPhotoHeight = bodyHeight
        if (photoNaturalSize.width > 0 && photoNaturalSize.height > 0) {
            const scale = Math.min(photoWidth / photoNaturalSize.width, bodyHeight / photoNaturalSize.height)
            renderedPhotoHeight = Math.max(1, photoNaturalSize.height * scale)
            renderedPhotoTop = (bodyHeight - renderedPhotoHeight) / 2
        }

        const scaleTop = topMargin + renderedPhotoTop
        const scaleBottom = scaleTop + renderedPhotoHeight
        const toY = (depth) => scaleTop + (Math.max(0, Number(depth || 0)) / visualDepthMax) * renderedPhotoHeight

        return (
            <div className="relative shrink-0 border-r border-border bg-bg" style={{ width, height: totalHeightPx, marginRight: 4 }}>
                <div className="absolute inset-y-0 left-0 w-[34px]">
                    <div className="absolute left-[26px] w-px bg-slate-500" style={{ top: scaleTop, bottom: totalHeightPx - scaleBottom }} />
                    <div className="absolute left-0 text-[9px] text-text-muted" style={{ top: Math.max(0, scaleTop - 6) }}>0</div>
                    <div className="absolute left-0 text-[9px] text-text-muted" style={{ top: scaleBottom + 4 }}>{(visualDepthMax * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} cm</div>
                </div>

                <div
                    ref={photoCanvasRef}
                    className="absolute overflow-hidden rounded-md border border-border bg-transparent"
                    style={{ left: axisWidth, top: topMargin, width: photoWidth, height: bodyHeight }}
                    onClick={onCanvasClick}
                >
                    {photoUrl && !photoError ? (
                        <img
                            src={photoUrl}
                            alt="Carotte"
                            className="h-full w-full object-contain"
                            draggable={false}
                            onLoad={(event) => {
                                const image = event.currentTarget
                                setPhotoNaturalSize({
                                    width: Number(image.naturalWidth || 0),
                                    height: Number(image.naturalHeight || 0),
                                })
                                onPhotoLoad()
                            }}
                            onError={() => {
                                setPhotoNaturalSize({ width: 0, height: 0 })
                                onPhotoError()
                            }}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-slate-300">Photo carotte indisponible</div>
                    )}

                    {couches.map((couche, index) => {
                        const bottomY = toY(couche?.z_bas)
                        const bottomCm = (Number(couche?.z_bas ?? 0) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
                        return (
                            <div key={`sc-line-${couche.uid ?? index}`}>
                                <div className="absolute left-0 right-0 border-t border-dashed border-[#f97316]" style={{ top: bottomY }} />
                                <div className="absolute right-1 -translate-y-1/2 rounded bg-white/90 px-1 py-[1px] text-[8px] font-semibold text-slate-700" style={{ top: bottomY }}>
                                    {bottomCm} cm
                                </div>
                            </div>
                        )
                    })}

                    {Array.isArray(annotations) ? annotations.map((annotation, index) => {
                        const isSelected = annotation.id === selectedAnnotationId
                        return (
                            <button
                                key={annotation.id || index}
                                type="button"
                                onMouseDown={(event) => {
                                    event.stopPropagation()
                                    onStartDragAnnotation(annotation.id)
                                }}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onSelectAnnotation(annotation.id)
                                }}
                                className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-semibold shadow ${isSelected ? 'border-white bg-[#c2410c] text-white' : 'border-[#0f1720] bg-[#facc15] text-[#0f1720]'}`}
                                style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                                title={[annotation.category, annotation.text].filter(Boolean).join(' · ') || `Repère ${index + 1}`}
                            >
                                {index + 1}
                            </button>
                        )
                    }) : null}
                </div>
            </div>
        )
    }

    const W = 120
    const SCALE = 80
    const TOP_MARGIN = 30
    const BOTTOM_MARGIN = 20
    const LEFT_SCALE = 30
    const BAR_W = 60

    const profMax = Math.max(
        ...[
            Number(point?.profondeur_finale_m ?? point?.profondeur_bas ?? 0),
            ...couches.map(c => Number(c.z_bas ?? 0))
        ].filter(n => !isNaN(n) && n > 0),
        1
    )

    const toY = (depth) => TOP_MARGIN + (Number(depth) / profMax) * (SCALE * profMax)
    const totalH = TOP_MARGIN + SCALE * profMax + BOTTOM_MARGIN
    const niveauNappe = point?.niveau_nappe ? parseFloat(point.niveau_nappe) : null

    return (
        <svg
            width={W}
            height={totalH}
            style={{ flexShrink: 0, borderRight: '1px solid #e5e7eb', marginRight: 4 }}
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <pattern id="p-argile" patternUnits="userSpaceOnUse" width="6" height="6">
                    <line x1="0" y1="6" x2="6" y2="0" stroke="#9b7b7b" strokeWidth="0.7"/>
                    <line x1="-1" y1="1" x2="1" y2="-1" stroke="#9b7b7b" strokeWidth="0.7"/>
                    <line x1="5" y1="7" x2="7" y2="5" stroke="#9b7b7b" strokeWidth="0.7"/>
                </pattern>
                <pattern id="p-limon" patternUnits="userSpaceOnUse" width="6" height="6">
                    <circle cx="1.5" cy="1.5" r="0.8" fill="#8a7a50"/>
                    <circle cx="4.5" cy="4.5" r="0.8" fill="#8a7a50"/>
                </pattern>
                <pattern id="p-sableux" patternUnits="userSpaceOnUse" width="8" height="8">
                    <circle cx="2" cy="2" r="1.2" fill="#c8a830"/>
                    <circle cx="6" cy="6" r="1.2" fill="#c8a830"/>
                    <circle cx="6" cy="2" r="0.8" fill="#d4b840"/>
                </pattern>
                <pattern id="p-argilo-sableux" patternUnits="userSpaceOnUse" width="8" height="8">
                    <line x1="0" y1="8" x2="8" y2="0" stroke="#9b7b5b" strokeWidth="0.8"/>
                    <circle cx="4" cy="4" r="0.8" fill="#c8a830"/>
                </pattern>
            </defs>

            <line x1={LEFT_SCALE} y1={TOP_MARGIN} x2={LEFT_SCALE} y2={TOP_MARGIN + SCALE * profMax} stroke="#374151" strokeWidth="1.5"/>
            {couches.map((c, i) => {
                const y1 = toY(c.z_haut ?? 0)
                const y2 = toY(c.z_bas ?? 0)
                const h = Math.max(y2 - y1, 2)
                const tex = String(c.texture_matrice || '').toLowerCase()
                const cfg = TEXTURE_PATTERNS[tex] || { fill: '#e8e8e0', hatch: null }
                const patId = cfg.hatch ? `p-${cfg.hatch}` : null
                return (
                    <g key={c.uid ?? i}>
                        <rect x={LEFT_SCALE} y={y1} width={BAR_W} height={h} fill={cfg.fill} stroke="#374151" strokeWidth="0.5"/>
                        {patId && <rect x={LEFT_SCALE} y={y1} width={BAR_W} height={h} fill={`url(#${patId})`} opacity="0.6"/>}
                        {i === 0 && <text x={LEFT_SCALE - 3} y={y1 + 3} textAnchor="end" fontSize="8" fill="#374151">{c.z_haut ?? 0}</text>}
                        <text x={LEFT_SCALE - 3} y={y2 + 3} textAnchor="end" fontSize="8" fill="#374151">{c.z_bas ?? ''}</text>
                        <line x1={LEFT_SCALE} y1={y2} x2={LEFT_SCALE + BAR_W} y2={y2} stroke="#374151" strokeWidth="0.8" strokeDasharray="3,2"/>
                    </g>
                )
            })}
            {couches.filter(c => c.profondeur_eau != null && c.profondeur_eau !== '' && Number(c.profondeur_eau) > 0).map((c, i) => {
                const depth = Number(c.profondeur_eau)
                if (depth > profMax) return null
                const y = toY(depth)
                return (
                    <g key={`eau-${i}`}>
                        <line x1={LEFT_SCALE - 4} y1={y} x2={LEFT_SCALE + BAR_W + 4} y2={y} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2"/>
                        <text x={LEFT_SCALE + BAR_W + 6} y={y + 3} fontSize="8" fill="#3b82f6">∇ {depth}m</text>
                    </g>
                )
            })}
            {niveauNappe != null && niveauNappe > 0 && niveauNappe <= profMax && couches.every(c => !c.profondeur_eau) && (
                <g>
                    <line x1={LEFT_SCALE - 4} y1={toY(niveauNappe)} x2={LEFT_SCALE + BAR_W + 4} y2={toY(niveauNappe)} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2"/>
                    <text x={LEFT_SCALE + BAR_W + 6} y={toY(niveauNappe) + 3} fontSize="8" fill="#3b82f6">∇ {niveauNappe}m</text>
                </g>
            )}
            {prelevements.filter(p => p.description && parseFloat(p.description) > 0).map((p, i) => {
                const depth = parseFloat(p.description)
                if (isNaN(depth) || depth > profMax) return null
                const y = toY(depth)
                return (
                    <g key={p.uid ?? i}>
                        <line x1={LEFT_SCALE + BAR_W} y1={y} x2={LEFT_SCALE + BAR_W + 8} y2={y} stroke="#f59e0b" strokeWidth="1.5"/>
                        <circle cx={LEFT_SCALE + BAR_W + 10} cy={y} r="3" fill="#f59e0b" stroke="#fff" strokeWidth="0.5"/>
                        <text x={LEFT_SCALE + BAR_W + 15} y={y + 3} fontSize="7" fill="#f59e0b">P</text>
                    </g>
                )
            })}
            <text x={LEFT_SCALE - 3} y={TOP_MARGIN + SCALE * profMax + 10} textAnchor="end" fontSize="7" fill="#6b7280">({profMax}m)</text>
        </svg>
    )
}



// ── Nouvelle couche inline dans le tableau ─────────────────────────────────
function ScNewCoucheInlineRow({ newCoucheRow, setNewCoucheRow, getOptions, onSave, saving, isSCFeuille = false, showEmbeddedScPhoto = false }) {
    const rowRef = useRef(null)
    const hasSubmittedRef = useRef(false)
    const [form, setForm] = useState({
        insertAfterUid: newCoucheRow?.insertAfterUid ?? null,
        z_haut: newCoucheRow?.z_haut ?? '',
        z_bas: newCoucheRow?.z_bas ?? '',
        texture_matrice: '', proportion_matrice: '', elements_grossiers: '',
        granulo_elements: '', petrographie: '', structure: '',
        matiere_organique: '', couleur: '', odeur: '', consistance: '',
        cohesion: '', oxydo_reduction: '', eau_porosite: '',
        profondeur_eau: '', horizon: '', description_libre: '',
    })
    function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

    const iStyle = 'text-[10px] border border-accent rounded px-1 py-0 bg-white w-full'
    const tdC = 'px-1 py-1 border-r border-border bg-[#f0f8ff]'
    const depthInputClass = isSCFeuille
        ? 'w-full min-w-0 text-xs border border-accent rounded px-1.5 py-0.5 bg-white'
        : 'w-10 text-[10px] border border-accent rounded px-1 py-0 bg-white'
    const depthGroupClass = isSCFeuille
        ? 'flex min-w-[180px] items-center gap-1.5'
        : 'flex items-center gap-0.5'

    function hasMeaningfulValue(value) {
        return String(value ?? '').trim() !== ''
    }

    function submitOrClose() {
        if (hasSubmittedRef.current || saving) return
        hasSubmittedRef.current = true
        const shouldSave = hasMeaningfulValue(form.z_haut) || hasMeaningfulValue(form.z_bas) || hasMeaningfulValue(form.description_libre)
        if (shouldSave) {
            onSave(form)
            return
        }
        setNewCoucheRow(null)
    }

    useEffect(() => {
        hasSubmittedRef.current = false
    }, [newCoucheRow])

    useEffect(() => {
        function handlePointerDown(event) {
            const rowElement = rowRef.current
            if (!rowElement) return
            if (event.target instanceof Node && rowElement.contains(event.target)) return
            submitOrClose()
        }

        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    })

    function InlineSelect({ field, opts }) {
        const dlId = `new-dl-${field.replace(/_/g, '-')}`
        return (
            <>
                <input list={dlId} value={form[field]} onChange={e => set(field, e.target.value)} className={iStyle} />
                <datalist id={dlId}>{getOptions(field, opts).map(o => <option key={o} value={o} />)}</datalist>
            </>
        )
    }

    const liveThicknessCm = (() => {
        const zHaut = scParseNumber(form.z_haut)
        const zBas = scParseNumber(form.z_bas)
        if (zHaut == null || zBas == null) return ''
        const thickness = isSCFeuille ? (zBas - zHaut) : (zBas - zHaut) * 100
        return Number.isFinite(thickness) ? thickness.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : ''
    })()

    if (isSCFeuille) {
        return (
            <tr ref={rowRef} className="border-b-2 border-accent bg-[#f0f8ff]">
                {showEmbeddedScPhoto ? <td className={tdC}></td> : null}
                <td className={tdC}></td>
                <td className={tdC}>
                    <div className={depthGroupClass}>
                        <label className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-text-muted">
                            <span className="w-7 shrink-0">haut</span>
                            <input value={form.z_haut} onChange={e => set('z_haut', e.target.value)} className={depthInputClass} autoFocus />
                        </label>
                        <label className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-text-muted">
                            <span className="w-7 shrink-0">bas</span>
                            <input value={form.z_bas} onChange={e => set('z_bas', e.target.value)} className={depthInputClass} />
                        </label>
                    </div>
                </td>
                <td className={`${tdC} text-center text-[10px] text-text-muted whitespace-nowrap`}>
                    {liveThicknessCm || '—'}
                </td>
                <td className={tdC}>
                    <input value={form.description_libre} onChange={e => set('description_libre', e.target.value)} className="text-sm border-2 border-accent rounded px-2 py-1 bg-white w-full shadow-sm" placeholder="Description" />
                </td>
                <td className={`${tdC} text-center text-text-muted`}>—</td>
                <td className={`${tdC} text-center text-text-muted`}>—</td>
                <td className={`${tdC} text-center text-text-muted`}>—</td>
                <td className={`${tdC} text-center text-text-muted`}>—</td>
                <td className="px-1 py-1 text-center bg-[#f0f8ff]">
                    <div className="flex gap-1 justify-center">
                        <Button variant="primary" size="sm" onClick={submitOrClose} disabled={saving}>✓</Button>
                        <Button variant="secondary" size="sm" onClick={() => setNewCoucheRow(null)}>✕</Button>
                    </div>
                </td>
            </tr>
        )
    }

    return (
        <tr ref={rowRef} className="border-b-2 border-accent bg-[#f0f8ff]">
            <td className={tdC}></td>
            <td className={tdC}>
                <div className={depthGroupClass}>
                    {isSCFeuille ? (
                        <>
                            <label className="flex items-center gap-1 text-[10px] text-text-muted">
                                <span className="w-7 shrink-0">haut</span>
                                <input value={form.z_haut} onChange={e => set('z_haut', e.target.value)} className={depthInputClass} />
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-text-muted">
                                <span className="w-7 shrink-0">bas</span>
                                <input value={form.z_bas} onChange={e => set('z_bas', e.target.value)} className={depthInputClass} />
                            </label>
                        </>
                    ) : (
                        <>
                            <input value={form.z_haut} onChange={e => set('z_haut', e.target.value)} className={depthInputClass} placeholder="haut" />
                            <span className="text-[10px]">→</span>
                            <input value={form.z_bas} onChange={e => set('z_bas', e.target.value)} className={depthInputClass} placeholder="bas" />
                        </>
                    )}
                </div>
            </td>
            <td className={tdC}><InlineSelect field="texture_matrice" opts={TEXTURE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="proportion_matrice" opts={PROPORTION_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="elements_grossiers" opts={ELEMENTS_OPTIONS} /></td>
            <td className={tdC}><input value={form.granulo_elements} onChange={e => set('granulo_elements', e.target.value)} className={iStyle} placeholder="mm Ø" /></td>
            <td className={tdC}><InlineSelect field="petrographie" opts={PETROGRAPHIE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="structure" opts={STRUCTURE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="matiere_organique" opts={ORGANIQUE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="couleur" opts={COULEUR_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="odeur" opts={ODEUR_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="consistance" opts={CONSISTANCE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="cohesion" opts={COHESION_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="oxydo_reduction" opts={OXYDO_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="eau_porosite" opts={EAU_OPTIONS} /></td>
            <td className={tdC}>
                <input value={form.profondeur_eau} onChange={e => set('profondeur_eau', e.target.value)} className={iStyle} placeholder="∇ m" />
                {form.profondeur_eau && form.z_haut && form.z_bas && (
                    Number(form.profondeur_eau) < Number(form.z_haut) || Number(form.profondeur_eau) > Number(form.z_bas)
                ) ? <span className="text-[9px] text-orange-500 block">hors couche</span> : null}
            </td>
            <td className={tdC}><InlineSelect field="horizon" opts={HORIZON_OPTIONS} /></td>
            <td className={tdC}></td>
            <td className={tdC}><input value={form.description_libre} onChange={e => set('description_libre', e.target.value)} className={iStyle} /></td>
            <td className="px-1 py-1 text-center bg-[#f0f8ff]">
                <div className="flex gap-1 justify-center">
                    <Button variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving}>✓</Button>
                    <Button variant="secondary" size="sm" onClick={() => setNewCoucheRow(null)}>✕</Button>
                </div>
            </td>
        </tr>
    )
}

function scBuildCoucheOptionLabel(couche) {
    const interval = `${couche?.z_haut ?? '—'} → ${couche?.z_bas ?? '—'} m`
    const descriptor = couche?.texture_matrice || couche?.horizon || couche?.description_libre || ''
    return descriptor ? `${interval} · ${descriptor}` : interval
}

function ScPrelevementManagerItem({ prelevement, currentCoucheId, coucheOptions, detailReturnTo, navigate, disabled, onMove, onToggleIgnore, onDelete }) {
    const isIgnored = Boolean(prelevement?.ignore_sondage_couche_match)
    const depthLabel = scFormatDepth(scParseNumber(prelevement?.description)) || prelevement?.description || 'Profondeur non renseignée'
    const summary = [depthLabel, prelevement?.quantite, prelevement?.statut].filter(Boolean).join(' · ')

    return (
        <div className="rounded-md border border-border bg-bg px-2 py-2">
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => navigateWithReturnTo(navigate, `/prelevements/${prelevement.uid}`, detailReturnTo)}
                    className="text-[10px] font-semibold text-accent hover:underline"
                >
                    {prelevement.reference}
                </button>
                {isIgnored ? <span className="text-[9px] font-medium uppercase tracking-wide text-orange-600">Ignoré</span> : null}
            </div>
            <div className="mt-1 text-[10px] text-text-muted">{summary || 'Prélèvement'}</div>
            <div className="mt-2 flex flex-wrap gap-1">
                <ScSelect
                    value={currentCoucheId ? String(currentCoucheId) : ''}
                    onChange={(event) => {
                        const nextCoucheId = event.target.value
                        if (!nextCoucheId || Number(nextCoucheId) === Number(currentCoucheId)) return
                        onMove(prelevement.uid, Number(nextCoucheId))
                    }}
                    disabled={disabled}
                    className="min-w-[150px] px-2 py-1 text-[10px]"
                >
                    <option value="">{currentCoucheId ? 'Déplacer vers…' : 'Affecter à…'}</option>
                    {coucheOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </ScSelect>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onToggleIgnore(prelevement.uid, !isIgnored)}
                    disabled={disabled}
                >
                    {isIgnored ? 'Auto' : 'Ign.'}
                </Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(prelevement.uid)} disabled={disabled}>Suppr.</Button>
            </div>
        </div>
    )
}

function ScPointDetailView({ data, point, interventionData = null, isDraftPoint = false, topBanner = null, detailReturnTo, navigate, pointEditing, setPointEditing, pointForm, setPointField, patchPointForm = null, handleSavePoint, persistPointPhotos = null, updatePointPending, savePointErrorMessage = '', addingCouche, setAddingCouche, editingCoucheId, setEditingCoucheId, coucheForm, setCoucheField, handleCreateCouche, createCouchePending, handleUpdateCouche, updateCouchePending, handleDeleteCouche, deleteCouchePending, onBackToCoupe, prelevCoucheId, setPrelevCoucheId, prelevForm, setPrelevForm, createPrelevementPending, handleCreatePrelevement, updatePrelevementPending, handleUpdatePrelevement, handleDeletePrelevement, handleDeletePoint, deleteErrorMessage, editingCell, setEditingCell, editingCellValue, setEditingCellValue, startEditCell, saveCellEdit, selectedCoucheRow, setSelectedCoucheRow, newCoucheRow, setNewCoucheRow, handleAddCouche, handleInsertCouche, sheetToolbarActions = null, equipmentOptions = [], equipmentLoading = false, equipmentError = '' }) {
    const queryClient = useQueryClient()
    const feuilleType = useMemo(() => getFeuilleTypeConfig(data?.code_feuille), [data?.code_feuille])
    const isSCFeuille = feuilleType.flags.supportsPointDepthIntervalCm
    const tableColumns = useMemo(() => ([
        ...(isSCFeuille
            ? [
                { label: '', width: 28, minWidth: 24 },
                { label: 'Intervalle (cm)', width: 188, minWidth: 170 },
                { label: 'Ép. (cm)', width: 78, minWidth: 70 },
                { label: 'Description', width: 260, minWidth: 200 },
                { label: 'D (g/cm3)', width: 90, minWidth: 75 },
                { label: 'Vides (%)', width: 90, minWidth: 75 },
                { label: 'Compacité (%)', width: 110, minWidth: 95 },
                { label: 'Prélt.', width: 250, minWidth: 180 },
                { label: 'Actions', width: 88, minWidth: 70 },
            ]
            : [
                { label: '', width: 28, minWidth: 24 },
                { label: 'Profondeur', width: 95, minWidth: 80 },
                { label: 'Texture', width: 120, minWidth: 90 },
                { label: 'Prop.', width: 80, minWidth: 65 },
                { label: 'Éléments', width: 110, minWidth: 90 },
                { label: 'Granu.', width: 75, minWidth: 60 },
                { label: 'Pétro.', width: 100, minWidth: 80 },
                { label: 'Structure', width: 105, minWidth: 85 },
                { label: 'MO', width: 75, minWidth: 60 },
                { label: 'Couleur', width: 90, minWidth: 70 },
                { label: 'Odeur', width: 85, minWidth: 65 },
                { label: 'Consist.', width: 90, minWidth: 70 },
                { label: 'Cohés.', width: 85, minWidth: 65 },
                { label: 'Oxydo', width: 85, minWidth: 65 },
                { label: 'Eau', width: 90, minWidth: 65 },
                { label: '∇ m', width: 70, minWidth: 55 },
                { label: 'Horizon', width: 100, minWidth: 80 },
                { label: 'Prélt.', width: 250, minWidth: 180 },
                { label: 'Description', width: 130, minWidth: 90 },
                { label: 'Actions', width: 88, minWidth: 70 },
            ]),
    ]), [isSCFeuille])
    const [columnWidths, setColumnWidths] = useState(() => tableColumns.map((column) => column.width))
    const resizeStateRef = useRef(null)
    const intervalWidthRestoreRef = useRef(null)
    const headerMeasureContextRef = useRef(null)
    const resizeMinWidthPx = 24
    const getColumnResizeMinWidth = useCallback((index) => {
        const label = String(tableColumns[index]?.label ?? '')
        if (!label.trim()) return resizeMinWidthPx
        if (typeof document !== 'undefined') {
            if (!headerMeasureContextRef.current) {
                const canvas = document.createElement('canvas')
                headerMeasureContextRef.current = canvas.getContext('2d')
            }
            const ctx = headerMeasureContextRef.current
            if (ctx) {
                ctx.font = '500 11px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
                return Math.max(resizeMinWidthPx, Math.ceil(ctx.measureText(label).width + 20))
            }
        }
        // Fallback when text metrics are unavailable.
        return Math.max(resizeMinWidthPx, Math.ceil((label.length * 7) + 20))
    }, [tableColumns])
    const columnWidthsStorageKey = useMemo(() => `feuille-terrain:couches:col-widths:${data?.uid || data?.reference || 'default'}`, [data?.uid, data?.reference])

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(columnWidthsStorageKey)
            if (!raw) return
            const parsed = JSON.parse(raw)
            if (!Array.isArray(parsed) || parsed.length !== tableColumns.length) return
            const sanitized = parsed.map((value, index) => {
                const numeric = Number(value)
                const minWidth = getColumnResizeMinWidth(index)
                const fallback = tableColumns[index]?.width ?? minWidth
                return Number.isFinite(numeric) ? Math.max(minWidth, numeric) : fallback
            })
            setColumnWidths(sanitized)
        } catch {
            // Ignore invalid persisted widths
        }
    }, [columnWidthsStorageKey, tableColumns, getColumnResizeMinWidth])

    useEffect(() => {
        try {
            window.localStorage.setItem(columnWidthsStorageKey, JSON.stringify(columnWidths))
        } catch {
            // Ignore localStorage write failures
        }
    }, [columnWidths, columnWidthsStorageKey])

    function expandIntervalColumnForEdit() {
        if (!isSCFeuille) return
        const intervalColumnIndex = 1
        const expandedWidth = 210
        setColumnWidths((current) => {
            if (!Array.isArray(current) || current.length <= intervalColumnIndex) return current
            if (intervalWidthRestoreRef.current == null) {
                intervalWidthRestoreRef.current = Number(current[intervalColumnIndex] || 0)
            }
            if (Number(current[intervalColumnIndex] || 0) >= expandedWidth) return current
            const next = [...current]
            next[intervalColumnIndex] = expandedWidth
            return next
        })
    }

    function restoreIntervalColumnWidth() {
        if (intervalWidthRestoreRef.current == null) return
        const intervalColumnIndex = 1
        const previousWidth = Number(intervalWidthRestoreRef.current)
        intervalWidthRestoreRef.current = null
        setColumnWidths((current) => {
            if (!Array.isArray(current) || current.length <= intervalColumnIndex) return current
            if (Number(current[intervalColumnIndex] || 0) === previousWidth) return current
            const next = [...current]
            next[intervalColumnIndex] = previousWidth
            return next
        })
    }

    useEffect(() => {
        const isIntervalEditing = Boolean(isSCFeuille && editingCell && (editingCell.field === 'z_haut' || editingCell.field === 'z_bas'))
        if (!isIntervalEditing) {
            restoreIntervalColumnWidth()
        }
    }, [isSCFeuille, editingCell])

    function startColumnResize(index, event) {
        event.preventDefault()
        event.stopPropagation()
        resizeStateRef.current = {
            index,
            startX: event.clientX,
            startWidth: columnWidths[index],
        }

        function onMouseMove(moveEvent) {
            if (!resizeStateRef.current) return
            const { index: currentIndex, startX, startWidth } = resizeStateRef.current
            const minWidth = getColumnResizeMinWidth(currentIndex)
            const nextWidth = Math.max(minWidth, startWidth + (moveEvent.clientX - startX))
            setColumnWidths((current) => {
                if (current[currentIndex] === nextWidth) return current
                const next = [...current]
                next[currentIndex] = nextWidth
                return next
            })
        }

        function onMouseUp() {
            resizeStateRef.current = null
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    }

    const linkedPointPrelevements = Array.isArray(point?.prelevements) ? point.prelevements : []
    const couches = Array.isArray(point?.couches) ? point.couches : []
    const sourceEssaiId = data?.source_essai_id ? Number(data.source_essai_id) : null
    const feuilleUid = data?.uid ? Number(data.uid) : null
    const canManagePhotos = Boolean(feuilleUid || sourceEssaiId)
    const [photoVersion, setPhotoVersion] = useState(0)
    const [photoError, setPhotoError] = useState(false)
    const [photoRetryCount, setPhotoRetryCount] = useState(0)
    const [photoEditorOpen, setPhotoEditorOpen] = useState(false)
    const [photoEditorSrc, setPhotoEditorSrc] = useState('')
    const [photoEditorFilename, setPhotoEditorFilename] = useState('carotte-crop.jpg')
    const [photoSaving, setPhotoSaving] = useState(false)
    const [photoSortMode, setPhotoSortMode] = useState('primary')
    const [photoFilterText, setPhotoFilterText] = useState('')
    const [photoCropTargetCoupeId, setPhotoCropTargetCoupeId] = useState('')
    const [photoCropReplaceStoredName, setPhotoCropReplaceStoredName] = useState('')
    const [coupeDragActiveId, setCoupeDragActiveId] = useState('')
    const [selectedAnnotationId, setSelectedAnnotationId] = useState(null)
    const [draggingAnnotationId, setDraggingAnnotationId] = useState(null)
    const [selectedCoupeId, setSelectedCoupeId] = useState('')
    const [embeddedPhotoNaturalSize, setEmbeddedPhotoNaturalSize] = useState({ width: 0, height: 0 })
    const fileInputRef = useRef(null)
    const photoCanvasRef = useRef(null)

    const { data: feuillePhotoGalleryData } = useQuery({
        queryKey: ['feuille-photo-gallery', feuilleUid],
        queryFn: () => feuillesTerrainApi.listFeuillePhotos(feuilleUid),
        enabled: Boolean(feuilleUid),
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    })

    const { data: photoGalleryData } = useQuery({
        queryKey: ['essai-photo-gallery', sourceEssaiId],
        queryFn: () => feuillesTerrainApi.listEssaiPhotos(sourceEssaiId),
        enabled: Boolean(sourceEssaiId),
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    })

    const carotteAnnotations = Array.isArray(pointForm.carotte_annotations) ? pointForm.carotte_annotations : []
    const pointAnnotations = Array.isArray(point?.carotte_annotations) ? point.carotte_annotations : []
    const carotteCoupes = Array.isArray(pointForm.carotte_coupes) ? pointForm.carotte_coupes : []
    const pointCoupes = Array.isArray(point?.carotte_coupes) ? point.carotte_coupes : []

    const photoItems = useMemo(() => scMergePhotoItems({
        feuillePhotos: feuilleUid && Array.isArray(feuillePhotoGalleryData?.photos) ? feuillePhotoGalleryData.photos : [],
        essaiPhotos: sourceEssaiId && Array.isArray(photoGalleryData?.photos) ? photoGalleryData.photos : [],
        carotteCoupes,
        feuilleUid,
        sourceEssaiId,
    }), [feuilleUid, feuillePhotoGalleryData?.photos, sourceEssaiId, photoGalleryData?.photos, carotteCoupes])

    const selectedPhoto = useMemo(() => (
        photoItems.find((item) => item?.is_primary) || photoItems[0] || null
    ), [photoItems])

    const displayedPhotoItems = useMemo(() => {
        const search = photoFilterText.trim().toLowerCase()
        let items = [...photoItems]
        if (search) {
            items = items.filter((item) => `${item?.stored_name || ''} ${item?.original_name || ''} ${item?.filename || ''} ${item?.created_at || ''}`.toLowerCase().includes(search))
        }
        items.sort((left, right) => {
            if (photoSortMode === 'filename') {
                return String(left?.stored_name || left?.filename || '').localeCompare(String(right?.stored_name || right?.filename || ''), 'fr', { sensitivity: 'base' })
            }
            if (photoSortMode === 'recent') {
                return String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
            }
            return (left?.is_primary === right?.is_primary) ? String(right?.created_at || '').localeCompare(String(left?.created_at || '')) : (left?.is_primary ? -1 : 1)
        })
        return items
    }, [photoFilterText, photoItems, photoSortMode])

    const showEmbeddedScPhoto = isSCFeuille && !editingCoucheId
    const legacyPointTotalHeight = scCentimetersToMeters(pointForm.carotte_total_height_cm) ?? scParseNumber(point?.carotte_total_height_m) ?? Math.max(...couches.map((couche) => Number(couche?.z_bas ?? 0)).filter(Number.isFinite), 0)
    const hasCarotteEdits = (pointForm.notes || '') !== (point?.notes || '') || !scAreAnnotationsEqual(carotteAnnotations, pointAnnotations) || !scAreCoupesEqual(carotteCoupes, pointCoupes)
    const pointFinalDepthValue = point?.profondeur_finale_m || point?.profondeur_bas
    const pointFinalDepthBadge = isSCFeuille ? scFormatDepthCmValue(pointFinalDepthValue == null ? '' : scMetersToCentimeters(pointFinalDepthValue)) : scFormatDepth(pointFinalDepthValue)
    const pointFinalDepthInputValue = isSCFeuille
        ? (pointForm.profondeur_finale_m ?? '')
        : (pointForm.profondeur_finale_m ?? '')

    useEffect(() => {
        if (!pointEditing) setPointEditing(true)
    }, [pointEditing, setPointEditing])

    function handlePointFinalDepthInputChange(rawValue) {
        setPointField('profondeur_finale_m', rawValue)
    }

    function handleEquipementChange(rawValue) {
        const value = String(rawValue ?? '')
        const selected = equipmentOptions.find((item) => String(item?.value) === value)
        const procede = scResolveProcedeFromEquipment(selected)
        const patch = {
            equipement: value,
            equipment_id: selected?.equipment_id ? String(selected.equipment_id) : '',
            ...(procede ? { procede } : {}),
        }
        if (typeof patchPointForm === 'function') {
            patchPointForm(patch)
            return
        }
        setPointField('equipement', value)
        setPointField('equipment_id', patch.equipment_id)
        if (procede) setPointField('procede', procede)
    }

    const hasPointData = Boolean(point?.uid)

    useEffect(() => {
        if (!isSCFeuille || !carotteCoupes.length) return
        let changed = false
        const nextCoupes = carotteCoupes.map((coupe) => {
            const fallbackLayers = Array.isArray(coupe?.couches) && coupe.couches.length ? coupe.couches : couches
            const bounds = scGetScCoupeBoundsCm(fallbackLayers, coupe?.total_height_cm || pointForm?.carotte_total_height_cm || '')
            const nextStart = String(coupe?.depth_start_cm ?? '').trim() || bounds.depth_start_cm
            const nextEnd = String(coupe?.depth_end_cm ?? '').trim() || bounds.depth_end_cm
            if (nextStart === (coupe?.depth_start_cm ?? '') && nextEnd === (coupe?.depth_end_cm ?? '')) {
                return coupe
            }
            changed = true
            return {
                ...coupe,
                depth_start_cm: nextStart,
                depth_end_cm: nextEnd,
            }
        })
        if (changed) {
            setPointField('carotte_coupes', nextCoupes)
        }
    }, [isSCFeuille, carotteCoupes, couches, pointForm?.carotte_total_height_cm])

    const coupesForDisplay = useMemo(() => {
        if (!isSCFeuille) return []
        return carotteCoupes
    }, [isSCFeuille, carotteCoupes])

    useEffect(() => {
        if (!coupesForDisplay.length) {
            setSelectedCoupeId('')
            return
        }
        if (!coupesForDisplay.some((item) => item.id === selectedCoupeId)) {
            setSelectedCoupeId(coupesForDisplay[0].id)
        }
    }, [coupesForDisplay, selectedCoupeId])

    const activeCoupe = useMemo(() => (
        coupesForDisplay.find((item) => item.id === selectedCoupeId) || coupesForDisplay[0] || null
    ), [coupesForDisplay, selectedCoupeId])

    const coupeGalleryItems = displayedPhotoItems

    const activeCoupePhoto = useMemo(() => {
        if (!activeCoupe?.photo_stored_name) return null
        const matched = scFindGalleryPhoto(photoItems, activeCoupe.photo_stored_name)
        if (matched) return matched
        if (activeCoupe?.photo_url) {
            const fileName = String(activeCoupe.photo_url).split('/').pop()?.split('?')[0] || ''
            const matchedByPath = fileName ? scFindGalleryPhoto(photoItems, fileName) : null
            if (matchedByPath) return matchedByPath
        }
        return null
    }, [activeCoupe?.photo_stored_name, activeCoupe?.photo_url, photoItems])

    const activeCoupeCouches = useMemo(() => {
        if (!isSCFeuille) return couches
        if (Array.isArray(activeCoupe?.couches) && activeCoupe.couches.length) return scCloneCoupeLayers(activeCoupe.couches)
        return scCloneCoupeLayers(couches)
    }, [isSCFeuille, activeCoupe?.couches, couches])
    const activeCoupeBoundsCm = useMemo(
        () => scGetScCoupeBoundsCm(activeCoupeCouches, activeCoupe?.total_height_cm || pointForm.carotte_total_height_cm || ''),
        [activeCoupeCouches, activeCoupe?.total_height_cm, pointForm.carotte_total_height_cm]
    )
    const activeCoupeTotalHeightCm = scParseNumber(activeCoupe?.total_height_cm) ?? scParseNumber(pointForm.carotte_total_height_cm) ?? null
    const activeCoupeStartCm = Math.max(0, scParseNumber(activeCoupe?.depth_start_cm || activeCoupeBoundsCm.depth_start_cm) ?? 0)
    const baseScDepthMax = Math.max(
        ...activeCoupeCouches.map((couche) => Number(couche?.z_bas ?? 0)).filter((value) => Number.isFinite(value)),
        activeCoupeTotalHeightCm ?? 0,
        0.1,
    )
    const activeScDepthMax = Math.max(baseScDepthMax, 0.1)
    const scLayerDepthMax = isSCFeuille
        ? Math.max(
            ...activeCoupeCouches.map((couche) => Number(couche?.z_bas ?? 0)).filter((v) => Number.isFinite(v)),
            Number(activeCoupeTotalHeightCm || 0) || 0.1,
            0.1,
        )
        : activeScDepthMax
    const scBodyHeight = Math.max(400, Math.min(1400, scLayerDepthMax * 32))
    const scRowHeightsByUid = useMemo(() => {
        const entries = new Map()
        if (!isSCFeuille || !Array.isArray(activeCoupeCouches)) return entries
        for (const couche of activeCoupeCouches) {
            const zHaut = Number(couche?.z_haut)
            const zBas = Number(couche?.z_bas)
            const thickness = (Number.isFinite(zHaut) && Number.isFinite(zBas)) ? Math.max(0, zBas - zHaut) : 0
            const rawHeight = (thickness / scLayerDepthMax) * scBodyHeight
            const height = thickness > 0 ? Math.max(28, rawHeight) : 28
            entries.set(couche?.uid, height)
        }
        return entries
    }, [isSCFeuille, activeCoupeCouches, scLayerDepthMax, scBodyHeight])
    const scBorderPx = 1
    const scRowBoundaries = useMemo(() => {
        if (!isSCFeuille || !Array.isArray(activeCoupeCouches)) return []
        let cumulative = 0
        return activeCoupeCouches.map((couche, index) => {
            const rowHeight = Number(scRowHeightsByUid.get(couche?.uid) ?? 20)
            cumulative += rowHeight
            return {
                uid: couche?.uid,
                y: cumulative + (index + 1) * scBorderPx,
                depthCm: Number(couche?.z_bas ?? 0),
            }
        })
    }, [isSCFeuille, activeCoupeCouches, scRowHeightsByUid])
    const scActualTotalHeight = useMemo(() => {
        if (!isSCFeuille || !scRowHeightsByUid.size) return scBodyHeight
        let total = 0
        for (const h of scRowHeightsByUid.values()) total += h
        const borderTotal = scRowHeightsByUid.size * scBorderPx
        return Math.max(scBodyHeight, total + borderTotal)
    }, [isSCFeuille, scRowHeightsByUid, scBodyHeight])
    const scPhotoColumnWidth = useMemo(() => {
        if (!isSCFeuille) return 128
        const ratio = (embeddedPhotoNaturalSize.width > 0 && embeddedPhotoNaturalSize.height > 0)
            ? (embeddedPhotoNaturalSize.width / embeddedPhotoNaturalSize.height)
            : 0.28
        const refHeight = scActualTotalHeight || scBodyHeight
        return Math.max(100, Math.min(320, refHeight * ratio))
    }, [isSCFeuille, embeddedPhotoNaturalSize.width, embeddedPhotoNaturalSize.height, scActualTotalHeight, scBodyHeight])
    const activeCoupeEndCm = Math.max(
        activeCoupeStartCm,
        scParseNumber(activeCoupe?.depth_end_cm || activeCoupeBoundsCm.depth_end_cm) ?? activeCoupeTotalHeightCm ?? activeScDepthMax,
    )
    const displayedCouches = isSCFeuille ? activeCoupeCouches : couches
    const activeScRowHeightsByUid = scRowHeightsByUid
    const activeScRenderHeight = scActualTotalHeight
    const activeScRowBoundaries = useMemo(() => {
        if (!isSCFeuille) return []
        let previousDepth = activeCoupeStartCm
        return scRowBoundaries.filter((item) => {
            const depthCm = Number(item?.depthCm)
            if (!Number.isFinite(depthCm)) return false
            if (depthCm <= previousDepth) return false
            if (depthCm >= activeCoupeEndCm) return false
            previousDepth = depthCm
            return true
        })
    }, [isSCFeuille, scRowBoundaries, activeCoupeStartCm, activeCoupeEndCm])

    const photoUrl = selectedPhoto?.url
        ? scPhotoItemUrl(selectedPhoto, photoVersion)
        : ''
    const activeCoupePhotoUrl = useMemo(() => {
        if (!isSCFeuille) return photoUrl
        const activeCoupeIndex = coupesForDisplay.findIndex((item) => item.id === activeCoupe?.id)
        return scResolveCoupePhotoUrl({
            storedName: activeCoupe?.photo_stored_name,
            photoUrl: activeCoupe?.photo_url,
            photoItems,
            feuilleUid,
            sourceEssaiId,
            photoVersion,
            fallbackPhoto: null,
            coupe: activeCoupe,
            coupeIndex: activeCoupeIndex >= 0 ? activeCoupeIndex : 0,
        })
    }, [
        isSCFeuille,
        photoUrl,
        activeCoupe,
        activeCoupe?.photo_stored_name,
        activeCoupe?.photo_url,
        photoItems,
        feuilleUid,
        sourceEssaiId,
        photoVersion,
        coupesForDisplay,
    ])
    const displayedPhotoKey = useMemo(() => {
        if (isSCFeuille) {
            return scStablePhotoKey(
                activeCoupePhoto
                || { storedName: activeCoupe?.photo_stored_name, url: activeCoupe?.photo_url }
            )
        }
        return scStablePhotoKey(selectedPhoto)
    }, [
        isSCFeuille,
        activeCoupePhoto?.stored_name,
        activeCoupePhoto?.url,
        activeCoupe?.photo_stored_name,
        activeCoupe?.photo_url,
        selectedPhoto?.stored_name,
        selectedPhoto?.url,
    ])

    useEffect(() => {
        setPhotoError(false)
        setPhotoRetryCount(0)
    }, [displayedPhotoKey])

    function handlePhotoLoad() {
        if (photoError) {
            setPhotoError(false)
        }
    }

    function handlePhotoLoadError() {
        setPhotoRetryCount((count) => {
            if (count >= 1) {
                setPhotoError(true)
                return count
            }
            setPhotoVersion((value) => value + 1)
            return count + 1
        })
    }

    useEffect(() => {
        if (photoEditorOpen) return
        setPhotoEditorFilename(selectedPhoto?.original_name || selectedPhoto?.filename || 'carotte-crop.jpg')
    }, [selectedPhoto?.filename, selectedPhoto?.original_name, photoEditorOpen])

    useEffect(() => {
        if (!carotteAnnotations.length) {
            setSelectedAnnotationId(null)
            return
        }
        if (!carotteAnnotations.some((item) => item.id === selectedAnnotationId)) {
            setSelectedAnnotationId(carotteAnnotations[0].id)
        }
    }, [carotteAnnotations, selectedAnnotationId])

    useEffect(() => {
        if (!draggingAnnotationId) return

        function updateFromPointer(clientX, clientY) {
            const surface = photoCanvasRef.current
            if (!surface) return
            const rect = surface.getBoundingClientRect()
            const relativeX = ((clientX - rect.left) / rect.width) * 100
            const relativeY = ((clientY - rect.top) / rect.height) * 100
            updateAnnotation(draggingAnnotationId, {
                x: Math.max(0, Math.min(100, Number(relativeX.toFixed(2)))),
                y: Math.max(0, Math.min(100, Number(relativeY.toFixed(2)))),
            })
        }

        function handleMouseMove(event) {
            updateFromPointer(event.clientX, event.clientY)
        }

        function handleMouseUp() {
            setDraggingAnnotationId(null)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [draggingAnnotationId, carotteAnnotations])

    async function openCropFromFile(file, coupeId = '') {
        const src = await scReadFileAsDataUrl(file)
        setPhotoCropTargetCoupeId(String(coupeId || activeCoupe?.id || ''))
        setPhotoCropReplaceStoredName('')
        setPhotoEditorFilename(file?.name || 'carotte-crop.jpg')
        setPhotoEditorSrc(src)
        setPhotoEditorOpen(true)
    }

    function resolveAffairePhotoHint() {
        return String(
            interventionData?.affaire_reference
            || data?.payload?.affaire_reference
            || data?.payload?.meta?.affaire_nge_raw
            || '',
        ).trim()
    }

    function resolveCoupeUploadContext(coupeId) {
        const targetCoupe = coupesForDisplay.find((item) => item.id === coupeId)
            || coupesForDisplay.find((item) => item.id === activeCoupe?.id)
            || coupesForDisplay[0]
            || null
        const coupeIndex = targetCoupe
            ? coupesForDisplay.findIndex((item) => item.id === targetCoupe.id)
            : 0
        return {
            targetCoupe,
            coupeCode: scCoupePhotoCode(targetCoupe, coupeIndex >= 0 ? coupeIndex : 0),
            pointCode: String(pointForm.point_code || point?.point_code || '').trim(),
        }
    }

    function buildCoupePhotoPatch(coupes, coupeId, photo) {
        const baseCoupes = Array.isArray(coupes) ? coupes : []
        if (!coupeId) return baseCoupes
        if (!photo?.stored_name) {
            return baseCoupes.map((item) => (
                item.id === coupeId
                    ? { ...item, photo_stored_name: '', photo_url: '' }
                    : item
            ))
        }
        return baseCoupes.map((item) => (
            item.id === coupeId
                ? {
                    ...item,
                    photo_stored_name: String(photo.stored_name),
                    photo_url: String(photo.url || ''),
                }
                : item
        ))
    }

    async function persistCoupePhotoAssignment(coupeId, photo) {
        let nextCoupes = []
        setPointField('carotte_coupes', (currentCoupes) => {
            nextCoupes = buildCoupePhotoPatch(
                Array.isArray(currentCoupes) ? currentCoupes : [],
                coupeId,
                photo,
            )
            return nextCoupes
        })
        setPhotoError(false)
        setPhotoVersion((value) => value + 1)
        if (typeof persistPointPhotos === 'function') {
            try {
                await persistPointPhotos(nextCoupes)
            } catch {
                // Garder la sélection locale même si l'enregistrement échoue.
            }
        }
    }

    function assignPhotoToCoupe(coupeId, photo) {
        if (!coupeId || !photo?.stored_name) return
        updateCarotteCoupe(coupeId, {
            photo_stored_name: String(photo.stored_name),
            photo_url: String(photo.url || ''),
        })
    }

    function handleCoupePhotoPick(coupeId) {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            await openCropFromFile(file, coupeId)
        }
        input.click()
    }

    async function handleCoupePhotoDrop(coupeId, event) {
        event.preventDefault()
        event.stopPropagation()
        setCoupeDragActiveId('')
        const file = event.dataTransfer?.files?.[0]
        if (!file || !file.type.startsWith('image/')) return
        await openCropFromFile(file, coupeId)
    }

    function resolveGalleryPhotoSelection(storedName) {
        const key = String(storedName || '').trim()
        if (!key) return null
        const matched = scFindGalleryPhoto(photoItems, key)
        if (matched) return matched
        if (feuilleUid) {
            return {
                stored_name: key,
                url: `/api/photos/feuille/${feuilleUid}/files/${encodeURIComponent(key)}`,
            }
        }
        if (sourceEssaiId) {
            return {
                stored_name: key,
                url: `/api/photos/essai/${sourceEssaiId}/files/${encodeURIComponent(key)}`,
            }
        }
        return null
    }

    function handleCoupePhotoSelect(coupeId, storedName) {
        if (!storedName) {
            void persistCoupePhotoAssignment(coupeId, null)
            return
        }
        const matched = resolveGalleryPhotoSelection(storedName)
        if (!matched) return
        void persistCoupePhotoAssignment(coupeId, matched)
    }

    function resolveCoupeReplaceStoredName(coupe) {
        const urlFileName = String(coupe?.photo_url || '').split('/').pop()?.split('?')[0] || ''
        const candidates = [
            coupe?.photo_stored_name,
            urlFileName,
        ].map((value) => String(value || '').trim()).filter(Boolean)
        for (const candidate of candidates) {
            const matched = scFindGalleryPhoto(photoItems, candidate)
            if (matched?.stored_name) return String(matched.stored_name)
        }
        return candidates[0] || ''
    }

    function handleCoupePhotoRecrop(coupeId) {
        const coupe = coupesForDisplay.find((item) => item.id === coupeId)
        const coupeIndex = coupesForDisplay.findIndex((item) => item.id === coupeId)
        const replaceStoredName = resolveCoupeReplaceStoredName(coupe)
        const src = scResolveCoupePhotoUrl({
            storedName: replaceStoredName || coupe?.photo_stored_name,
            photoUrl: coupe?.photo_url,
            photoItems,
            feuilleUid,
            sourceEssaiId,
            photoVersion,
            fallbackPhoto: null,
            coupe,
            coupeIndex: coupeIndex >= 0 ? coupeIndex : 0,
        })
        if (!src) return
        const matched = replaceStoredName ? scFindGalleryPhoto(photoItems, replaceStoredName) : null
        setPhotoCropTargetCoupeId(String(coupeId))
        setPhotoCropReplaceStoredName(replaceStoredName)
        setPhotoEditorFilename(replaceStoredName || matched?.original_name || matched?.filename || 'carotte-crop.jpg')
        setPhotoEditorSrc(src)
        setPhotoEditorOpen(true)
    }

    function handlePickPhotoClick() {
        if (isSCFeuille) {
            handleCoupePhotoPick(activeCoupe?.id || coupesForDisplay[0]?.id || '')
            return
        }
        fileInputRef.current?.click()
    }

    async function handlePhotoFileSelected(event) {
        const file = event.target.files?.[0]
        if (!file) return
        await openCropFromFile(file, activeCoupe?.id || '')
        event.target.value = ''
    }

    async function handleCropConfirm(file) {
        if (!file || !canManagePhotos) return
        const targetCoupeId = photoCropTargetCoupeId || activeCoupe?.id || coupesForDisplay[0]?.id || ''
        const replaceStoredName = String(photoCropReplaceStoredName || '').trim()
        const { targetCoupe, coupeCode, pointCode } = resolveCoupeUploadContext(targetCoupeId)
        setPhotoSaving(true)
        try {
            const affaireHint = resolveAffairePhotoHint()
            const uploadOptions = replaceStoredName
                ? { replace_stored_name: replaceStoredName }
                : { coupe_code: coupeCode, point_code: pointCode }
            let uploaded = null
            if (feuilleUid) {
                uploaded = await feuillesTerrainApi.uploadFeuillePhoto(feuilleUid, file, affaireHint, uploadOptions)
            } else if (sourceEssaiId) {
                uploaded = await feuillesTerrainApi.uploadEssaiPhoto(sourceEssaiId, file, affaireHint, uploadOptions)
            }
            const storedName = uploaded?.photo?.stored_name || uploaded?.filename || replaceStoredName || ''
            const uploadedPhoto = uploaded?.photo || null
            const photoPayload = uploadedPhoto || (storedName ? {
                stored_name: storedName,
                url: feuilleUid
                    ? `/api/photos/feuille/${feuilleUid}/files/${encodeURIComponent(storedName)}`
                    : `/api/photos/essai/${sourceEssaiId}/files/${encodeURIComponent(storedName)}`,
            } : null)
            if (targetCoupe?.id && photoPayload?.stored_name && !replaceStoredName) {
                await persistCoupePhotoAssignment(targetCoupe.id, photoPayload)
            }
            if (feuilleUid && Array.isArray(uploaded?.photos)) {
                queryClient.setQueryData(['feuille-photo-gallery', feuilleUid], { photos: uploaded.photos })
            }
            if (sourceEssaiId && Array.isArray(uploaded?.photos)) {
                queryClient.setQueryData(['essai-photo-gallery', sourceEssaiId], { photos: uploaded.photos })
            }
            setPhotoEditorOpen(false)
            setPhotoEditorSrc('')
            setPhotoCropTargetCoupeId('')
            setPhotoCropReplaceStoredName('')
            setPhotoError(false)
            setPhotoVersion((v) => v + 1)
            if (feuilleUid) {
                queryClient.invalidateQueries({ queryKey: ['feuille-photo-gallery', feuilleUid] })
            }
            if (sourceEssaiId) {
                queryClient.invalidateQueries({ queryKey: ['essai-photo-gallery', sourceEssaiId] })
            }
            queryClient.invalidateQueries({ queryKey: ['feuille-terrain', data?.uid] })
        } catch (error) {
            window.alert(error?.message || 'Impossible d’enregistrer la photo recadrée.')
        } finally {
            setPhotoSaving(false)
        }
    }

    async function handleSelectPrimaryPhoto(storedName) {
        if (!storedName) return
        setPhotoSaving(true)
        try {
            if (feuilleUid) {
                if (photoItems.find((item) => item?.stored_name === storedName)?.is_primary) return
                await feuillesTerrainApi.setPrimaryFeuillePhoto(feuilleUid, storedName)
                queryClient.invalidateQueries({ queryKey: ['feuille-photo-gallery', feuilleUid] })
            } else if (sourceEssaiId) {
                if (selectedPhoto?.stored_name === storedName) return
                await feuillesTerrainApi.setPrimaryEssaiPhoto(sourceEssaiId, storedName)
                queryClient.invalidateQueries({ queryKey: ['essai-photo-gallery', sourceEssaiId] })
            } else {
                return
            }
            setPhotoError(false)
            setPhotoVersion((v) => v + 1)
        } finally {
            setPhotoSaving(false)
        }
    }

    async function handleDeletePhoto(storedName) {
        if (!storedName) return
        setPhotoSaving(true)
        try {
            if (feuilleUid) {
                await feuillesTerrainApi.deleteFeuillePhoto(feuilleUid, storedName)
                queryClient.invalidateQueries({ queryKey: ['feuille-photo-gallery', feuilleUid] })
            } else if (sourceEssaiId) {
                await feuillesTerrainApi.deleteEssaiPhoto(sourceEssaiId, storedName)
                queryClient.invalidateQueries({ queryKey: ['essai-photo-gallery', sourceEssaiId] })
            } else {
                return
            }
            setPointField('carotte_coupes', carotteCoupes.map((coupe) => (
                coupe.photo_stored_name === storedName
                    ? { ...coupe, photo_stored_name: '', photo_url: '' }
                    : coupe
            )))
            setPhotoError(false)
            setPhotoVersion((v) => v + 1)
        } finally {
            setPhotoSaving(false)
        }
    }

    function handlePhotoCanvasClick(event) {
        if (!isSCFeuille || !activeCoupePhoto || photoError) return
        const rect = event.currentTarget.getBoundingClientRect()
        const relativeX = ((event.clientX - rect.left) / rect.width) * 100
        const relativeY = ((event.clientY - rect.top) / rect.height) * 100
        const annotation = {
            id: scCreateAnnotationId(),
            x: Math.max(0, Math.min(100, Number(relativeX.toFixed(2)))),
            y: Math.max(0, Math.min(100, Number(relativeY.toFixed(2)))),
            category: 'interface',
            text: '',
        }
        setPointField('carotte_annotations', [...carotteAnnotations, annotation])
        setSelectedAnnotationId(annotation.id)
    }

    function updateAnnotation(annotationId, patch) {
        setPointField('carotte_annotations', carotteAnnotations.map((item) => item.id === annotationId ? { ...item, ...patch } : item))
    }

    function deleteAnnotation(annotationId) {
        setPointField('carotte_annotations', carotteAnnotations.filter((item) => item.id !== annotationId))
        if (selectedAnnotationId === annotationId) {
            setSelectedAnnotationId(null)
        }
    }

    function addCarotteCoupe() {
        const nextIndex = carotteCoupes.length + 1
        const nextCoupe = scBuildDefaultScCoupe({ pointForm, couches, title: `Coupe ${nextIndex}` })
        setPointField('carotte_coupes', [...carotteCoupes, nextCoupe])
        setSelectedCoupeId(nextCoupe.id)
    }

    function updateCarotteCoupe(coupeId, patch) {
        setPointField('carotte_coupes', carotteCoupes.map((item) => item.id === coupeId ? { ...item, ...patch } : item))
    }

    function deleteCarotteCoupe(coupeId) {
        const nextCoupes = carotteCoupes.filter((item) => item.id !== coupeId)
        setPointField('carotte_coupes', nextCoupes)
        if (selectedCoupeId === coupeId) {
            setSelectedCoupeId(nextCoupes[0]?.id || '')
        }
    }

    function updateActiveCoupeCouches(updater) {
        if (!isSCFeuille || !activeCoupe || !carotteCoupes.length) return
        const currentLayers = Array.isArray(activeCoupe?.couches) && activeCoupe.couches.length
            ? scCloneCoupeLayers(activeCoupe.couches)
            : scCloneCoupeLayers(couches).map((layer) => ({ ...layer, uid: scCreateCoupeLayerId() }))
        const nextLayers = typeof updater === 'function' ? updater(currentLayers) : currentLayers
        const sortedLayers = [...nextLayers].sort((a, b) => Number(a.z_haut ?? 0) - Number(b.z_haut ?? 0))
        updateCarotteCoupe(activeCoupe.id, { couches: scCloneCoupeLayers(sortedLayers) })
    }

    function handleCreateCoupeLayer(inlineForm) {
        const payload = scToCouchePayload(inlineForm || coucheForm)
        const rawInsertAfterUid = inlineForm?.insertAfterUid ?? null
        updateActiveCoupeCouches((currentLayers) => {
            const nextLayer = scNormalizeCoupeLayer({ ...payload, uid: scCreateCoupeLayerId(), prelevements: [] }, currentLayers.length)
            const insertAfterUid = rawInsertAfterUid == null || rawInsertAfterUid === '' ? null : String(rawInsertAfterUid)
            if (!insertAfterUid) return [...currentLayers, nextLayer]
            const insertIndex = currentLayers.findIndex((layer) => String(layer.uid) === insertAfterUid)
            if (insertIndex < 0) return [...currentLayers, nextLayer]
            const next = [...currentLayers]
            next.splice(insertIndex + 1, 0, nextLayer)
            return next
        })
        setNewCoucheRow(null)
    }

    function handleUpdateCoupeLayer(coucheUid) {
        updateActiveCoupeCouches((currentLayers) => currentLayers.map((layer) => (
            String(layer.uid) === String(coucheUid)
                ? scNormalizeCoupeLayer({ ...layer, ...scToCouchePayload(coucheForm) })
                : layer
        )))
        setEditingCoucheId(null)
        setCoucheField('__reset__', scBuildCoucheForm())
    }

    function handleDeleteCoupeLayer(coucheUid) {
        if (!window.confirm('Supprimer cette couche ?')) return
        updateActiveCoupeCouches((currentLayers) => currentLayers.filter((layer) => String(layer.uid) !== String(coucheUid)))
    }

    function saveCoupeCellEdit() {
        if (!editingCell) return
        const { coucheUid, field } = editingCell
        const couche = activeCoupeCouches.find((item) => String(item.uid) === String(coucheUid))
        if (!couche) {
            setEditingCell(null)
            setEditingCellValue('')
            return
        }
        let patch = { [field]: editingCellValue }
        if (field === 'z_haut' || field === 'z_bas') {
            const depthCm = scParseNumber(editingCellValue)
            if (depthCm == null) {
                setEditingCell(null)
                setEditingCellValue('')
                return
            }
            patch = { [field]: depthCm }
        }
        if (field === 'thickness_cm') {
            const zHaut = Number(couche?.z_haut)
            const thicknessCm = scParseNumber(editingCellValue)
            if (!Number.isFinite(zHaut) || thicknessCm == null) {
                setEditingCell(null)
                setEditingCellValue('')
                return
            }
            patch = { z_bas: Number((zHaut + thicknessCm).toFixed(2)) }
        }
        updateActiveCoupeCouches((currentLayers) => currentLayers.map((layer) => (
            String(layer.uid) === String(coucheUid)
                ? scNormalizeCoupeLayer({ ...layer, ...patch })
                : layer
        )))
        setEditingCell(null)
        setEditingCellValue('')
    }

    function handleAddCoupeLayer() {
        const lastCouche = activeCoupeCouches.length ? activeCoupeCouches[activeCoupeCouches.length - 1] : null
        const nextZHaut = scScCoucheDepthString(lastCouche?.z_bas)
        setNewCoucheRow({ z_haut: nextZHaut, z_bas: '', insertAfterUid: lastCouche?.uid ?? null })
        setAddingCouche(false)
        setEditingCoucheId(null)
    }

    function handleInsertCoupeLayer() {
        if (!selectedCoucheRow) return
        const idx = activeCoupeCouches.findIndex((c) => String(c.uid) === String(selectedCoucheRow))
        if (idx < 0) return
        const before = activeCoupeCouches[idx]
        const after = activeCoupeCouches[idx + 1] || null
        const newZHaut = scScCoucheDepthString(before.z_bas)
        const newZBas = after ? scScCoucheDepthString(after.z_haut) : ''
        setNewCoucheRow({ z_haut: newZHaut, z_bas: newZBas, insertAfterUid: before.uid })
        setAddingCouche(false)
        setEditingCoucheId(null)
        setSelectedCoucheRow(null)
    }

    const effectiveSaveCellEdit = isSCFeuille && carotteCoupes.length ? saveCoupeCellEdit : saveCellEdit
    const effectiveHandleCreateCouche = isSCFeuille && carotteCoupes.length ? handleCreateCoupeLayer : handleCreateCouche
    const effectiveHandleUpdateCouche = isSCFeuille && carotteCoupes.length ? handleUpdateCoupeLayer : handleUpdateCouche
    const effectiveHandleDeleteCouche = isSCFeuille && carotteCoupes.length ? handleDeleteCoupeLayer : handleDeleteCouche
    const effectiveHandleAddCouche = isSCFeuille && carotteCoupes.length ? handleAddCoupeLayer : handleAddCouche
    const effectiveHandleInsertCouche = isSCFeuille && carotteCoupes.length ? handleInsertCoupeLayer : handleInsertCouche

    const coucheOptions = displayedCouches.map((couche) => ({
        value: String(couche.uid),
        label: scBuildCoucheOptionLabel(couche),
    }))
    const horsCouchePrelevements = linkedPointPrelevements.filter((item) => item?.ignore_sondage_couche_match || !item?.sondage_couche_id)
    const newCoucheInsertAfterUid = newCoucheRow?.insertAfterUid == null || newCoucheRow?.insertAfterUid === ''
        ? null
        : String(newCoucheRow.insertAfterUid)
    const shouldRenderInlineAfterSelection = newCoucheRow != null && newCoucheInsertAfterUid != null
    const shouldRenderInlineAtBottom = newCoucheRow != null && !shouldRenderInlineAfterSelection
    const coucheRows = isSCFeuille ? displayedCouches : couches
    const showCoucheTable = coucheRows.length > 0 || newCoucheRow != null

    // Custom values — single query fetching all fields
    const { data: customValuesAll } = useQuery({
        queryKey: ['couche-custom-values-all'],
        queryFn: () => feuillesTerrainApi.getAllCustomValues(),
        staleTime: 30000,
    })
    function getOptions(field, baseOptions) {
        const custom = Array.isArray(customValuesAll?.[field]) ? customValuesAll[field].map(v => v.valeur) : []
        return [...new Set([...baseOptions, ...custom])].filter(Boolean)
    }
    const pointPrelevementIds = new Set(linkedPointPrelevements.map((item) => item.uid))
    const chainPrelevements = (Array.isArray(data?.prelevements) ? data.prelevements : []).filter((item) => {
        const hasEchantillons = (item?.echantillon_count ?? 0) > 0 || (Array.isArray(item?.echantillons) && item.echantillons.length > 0)
        if (!hasEchantillons) return false
        if (item?.point_terrain_id && Number(item.point_terrain_id) === Number(point.uid)) return true
        return pointPrelevementIds.has(item.uid)
    })

    const pointDisplayTitle = isDraftPoint
        ? (pointForm.point_code || 'Nouveau sondage')
        : (point.point_code || point.reference || `Point ${point.uid}`)

    const interventionTitle = useMemo(
        () => buildScInterventionTitle(data, interventionData),
        [data, interventionData],
    )

    const affaireDemandeLine = useMemo(
        () => buildScAffaireDemandeLine(data, interventionData),
        [data, interventionData],
    )

    const heroContextLine = useMemo(() => {
        if (!isSCFeuille) {
            return scBuildPointSummary(point) || data.label || 'Fiche de description géotechnique'
        }
        const title = interventionTitle
        const profil = String(pointForm.profil || point?.profil || '').trim()
        const depth = point?.profondeur_finale_m != null && point?.profondeur_finale_m !== ''
            ? scFormatDepthCm(point.profondeur_finale_m)
            : ''
        const partie = String(pointForm.partie_ouvrage || point?.partie_ouvrage || '').trim()
        const titleLower = title.toLowerCase()

        const details = [partie, profil, depth].filter((part) => {
            if (!part) return false
            if (titleLower.includes(part.toLowerCase())) return false
            return true
        })

        if (title && details.length) return `${title} · ${details.join(' · ')}`
        return title || details.join(' · ') || data.label || 'Sondage carotte'
    }, [isSCFeuille, interventionTitle, pointForm.partie_ouvrage, pointForm.profil, point, data?.label])

    const displayPointType = scDisplayPointType(pointForm.point_type || point?.point_type, isSCFeuille)

    return (
        <div
            className="flex flex-col h-full -mx-6 -mb-6"
            style={{ background: 'radial-gradient(circle at top right, rgba(255,204,0,0.18), transparent 32%), linear-gradient(180deg, #f8fafc 0%, #f3f6fb 42%, #eef3fa 100%)' }}
        >
            <ScSheetToolbar
                backLabel="← Coupe"
                onBack={onBackToCoupe}
                title={pointDisplayTitle}
                subtitle={[
                    affaireDemandeLine,
                    isDraftPoint ? 'Non enregistré' : null,
                ].filter(Boolean).join(' · ')}
                actions={(
                    <div className="flex flex-wrap items-center gap-2">
                        {sheetToolbarActions}
                        <Button variant="primary" size="sm" onClick={handleSavePoint} disabled={updatePointPending}>
                            {updatePointPending ? 'Enregistrement…' : 'Enregistrer'}
                        </Button>
                        <button
                            onClick={() => {
                                const message = isDraftPoint
                                    ? 'Abandonner ce sondage non enregistré ?'
                                    : 'Supprimer ce sondage et toutes ses couches / prélèvements ?'
                                if (window.confirm(message)) handleDeletePoint(point.uid)
                            }}
                            className="rounded-[11px] border border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d] px-3 py-2 text-[12px] font-black shadow-sm hover:brightness-95 transition"
                        >
                            {isDraftPoint ? 'Abandonner' : 'Supprimer'}
                        </button>
                    </div>
                )}
            />

            {topBanner ? (
                <div className="w-full max-w-[1900px] mx-auto px-7 pt-4">
                    {topBanner}
                </div>
            ) : null}

            <div className="w-full max-w-[1900px] mx-auto px-7 py-7 flex flex-col gap-5">
                {deleteErrorMessage ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteErrorMessage}</div>
                ) : null}
                {savePointErrorMessage ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{savePointErrorMessage}</div>
                ) : null}
                {isDraftPoint ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Sondage en cours de création — rien n’est enregistré tant que vous n’avez pas cliqué sur <strong>Enregistrer</strong>.
                        {' '}Le bouton <strong>Imprimer / Ouvrir rapport</strong> apparaît une fois le sondage enregistré.
                    </div>
                ) : null}

                {/* Hero */}
                <section
                    className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white"
                    style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
                >
                    <div
                        className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
                        style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
                    >
                        <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />

                        <div>
                            <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
                                <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
                                RaLab 5 · {isSCFeuille ? 'Sondage Carotte' : 'Sondage'}
                            </div>
                            <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{pointDisplayTitle}</h1>
                            <p className="mt-3 text-[14px] leading-relaxed text-white/70 max-w-2xl">
                                {heroContextLine}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-start gap-2">
                            {data.reference ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold">Coupe {data.reference}</span>
                            ) : null}
                            {displayPointType ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold">{displayPointType}</span>
                            ) : null}
                            {pointFinalDepthBadge ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold">Prof. {pointFinalDepthBadge}</span>
                            ) : null}
                            {!isSCFeuille && (point.venue_eau || point.niveau_nappe) ? (
                                <span className="rounded-full border border-[rgba(96,165,250,0.4)] bg-[rgba(96,165,250,0.15)] px-3 py-1.5 text-[11px] font-bold">∇ {point.niveau_nappe || 'nappe'}</span>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">Couches</div>
                            <div className="mt-1 text-[22px] font-black text-[#172033]">{couches.length}</div>
                        </div>
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">Prélèvements</div>
                            <div className="mt-1 text-[22px] font-black text-[#172033]">{linkedPointPrelevements.length}</div>
                        </div>
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">{isSCFeuille ? 'Épaisseur' : 'Profondeur'}</div>
                            <div className="mt-1 text-[22px] font-black text-[#172033]">{pointFinalDepthBadge || '—'}</div>
                        </div>
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">{isSCFeuille ? 'Coupes' : 'Photos'}</div>
                            <div className="mt-1 text-[22px] font-black text-[#172033]">{isSCFeuille ? carotteCoupes.length : photoItems.length}</div>
                        </div>
                    </div>
                </section>

                <ScCard title="Modifier le sondage">
                    <div className="grid gap-3 md:grid-cols-3">
                        <ScField label="Point">
                            <Input
                                value={pointForm.point_code}
                                onChange={(event) => setPointField('point_code', event.target.value)}
                                placeholder={isDraftPoint ? 'Code proposé — modifiable avant enregistrement' : undefined}
                            />
                        </ScField>
                        <ScField label="Type"><Input value={pointForm.point_type} onChange={(event) => setPointField('point_type', event.target.value)} /></ScField>
                        <ScField label="Localisation"><Input value={pointForm.localisation} onChange={(event) => setPointField('localisation', event.target.value)} /></ScField>
                        <ScField label="Profil / PK"><Input value={pointForm.profil} onChange={(event) => setPointField('profil', event.target.value)} /></ScField>
                        <ScField label="Date"><Input type="date" value={pointForm.date_point} onChange={(event) => setPointField('date_point', event.target.value)} /></ScField>
                        <ScField label="Opérateur"><Input value={pointForm.operateur} onChange={(event) => setPointField('operateur', event.target.value)} /></ScField>
                        {isSCFeuille && (
                            <>
                                <ScField label="Sondeur"><Input value={pointForm.sondeur} onChange={(event) => setPointField('sondeur', event.target.value)} /></ScField>
                                <ScField label="Procédé de sondage"><Input value={pointForm.procede} onChange={(event) => setPointField('procede', event.target.value)} /></ScField>
                                <ScField label="Équipement utilisé">
                                    <ScSelect
                                        value={pointForm.equipement}
                                        onChange={handleEquipementChange}
                                        disabled={equipmentLoading}
                                    >
                                        <option value="">{equipmentLoading ? 'Chargement des équipements...' : 'Sélectionner un équipement'}</option>
                                        {renderTerrainSelectOptionExtras(equipmentOptions, pointForm.equipement)}
                                    </ScSelect>
                                    {equipmentError ? <div className="mt-1 text-[11px] text-red-600">{equipmentError}</div> : null}
                                </ScField>
                                <ScField label="Diamètre de couronne (cm)"><Input value={pointForm.diametre} onChange={(event) => setPointField('diametre', event.target.value)} /></ScField>
                                <ScField label="Type et nom de l'ouvrage"><Input value={pointForm.type_ouvrage} onChange={(event) => setPointField('type_ouvrage', event.target.value)} placeholder="Hérité du chantier (modifiable)" /></ScField>
                                <ScField label="Partie de l'ouvrage"><Input value={pointForm.partie_ouvrage} onChange={(event) => setPointField('partie_ouvrage', event.target.value)} placeholder="Héritée de la campagne / zone (modifiable)" /></ScField>
                                <ScField label="Document de référence">
                                    <Input
                                        value={pointForm.document_reference}
                                        onChange={(event) => setPointField('document_reference', event.target.value)}
                                        placeholder="Réf. demande / campagne (héritée, modifiable)"
                                    />
                                </ScField>
                            </>
                        )}
                        <ScField label={isSCFeuille ? 'Profondeur finale (cm)' : 'Profondeur finale (m)'}><Input value={pointFinalDepthInputValue} onChange={(event) => handlePointFinalDepthInputChange(event.target.value)} /></ScField>
                        {isSCFeuille && (
                            <ScField label="Hauteur totale carotte (cm)"><Input value={pointForm.carotte_total_height_cm} onChange={(event) => setPointField('carotte_total_height_cm', event.target.value)} /></ScField>
                        )}
                        {!isSCFeuille && (
                            <>
                                <ScField label="Venue d'eau">
                                    <ScSelect value={pointForm.venue_eau} onChange={(event) => setPointField('venue_eau', event.target.value)}>
                                        <option value="">—</option>
                                        <option value="Oui">Oui</option>
                                        <option value="Non">Non</option>
                                    </ScSelect>
                                </ScField>
                                <ScField label="Tenue des fouilles"><Input value={pointForm.tenue_fouilles} onChange={(event) => setPointField('tenue_fouilles', event.target.value)} /></ScField>
                                <ScField label="Niveau nappe"><Input value={pointForm.niveau_nappe} onChange={(event) => setPointField('niveau_nappe', event.target.value)} /></ScField>
                            </>
                        )}
                        <ScField label={isSCFeuille ? 'Arrêt de sondage (cm)' : 'Arrêt de sondage'}><Input value={pointForm.arret_sondage} onChange={(event) => setPointField('arret_sondage', event.target.value)} /></ScField>
                        {!isSCFeuille ? (
                            <ScField label="Ouvrage"><Input value={pointForm.ouvrage} onChange={(event) => setPointField('ouvrage', event.target.value)} /></ScField>
                        ) : null}
                        <ScField label="Notes" full><ScTextarea value={pointForm.notes} onChange={(value) => setPointField('notes', value)} /></ScField>
                    </div>
                    </ScCard>
                <div className={isSCFeuille ? 'grid items-start gap-4 xl:grid-cols-[420px_minmax(0,1fr)]' : 'flex flex-col gap-4'}>
                    <ScCard title="Carotte" right={
                        <div className="flex items-center gap-2 text-[11px] text-text-muted">
                            {feuilleUid ? <span>Feuille #{feuilleUid}</span> : null}
                            {sourceEssaiId ? <span>Essai #{sourceEssaiId}</span> : null}
                            {photoItems.length ? <span>{photoItems.length} photo(s)</span> : null}
                        </div>
                    }>
                        {!isSCFeuille ? (
                        <div className="flex flex-wrap gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePhotoFileSelected}
                            />
                            <Button variant="secondary" size="sm" onClick={handlePickPhotoClick} disabled={!canManagePhotos || photoSaving}>
                                Ajouter une photo
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    if (!photoUrl || photoError) return
                                    setPhotoEditorFilename(selectedPhoto?.original_name || selectedPhoto?.filename || 'carotte-crop.jpg')
                                    setPhotoEditorSrc(photoUrl)
                                    setPhotoEditorOpen(true)
                                }}
                                disabled={!canManagePhotos || photoError || photoSaving}
                            >
                                Recadrer / ajuster
                            </Button>
                        </div>
                        ) : (
                        <div className="flex flex-wrap gap-2">
                            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-[12px] text-text-muted">
                                Photo par coupe : glisser-déposer ou choisir sur chaque carte <strong className="text-text">Coupe SC</strong>.
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleCoupePhotoRecrop(activeCoupe?.id || coupesForDisplay[0]?.id || '')}
                                disabled={!canManagePhotos || photoSaving || !activeCoupePhotoUrl || photoError}
                            >
                                Recadrer / tourner
                            </Button>
                        </div>
                        )}

                        <div className="mt-4 rounded-xl border border-border bg-bg p-2">
                            {(isSCFeuille ? activeCoupePhotoUrl : photoUrl) && !photoError ? (
                                <div className={`relative flex items-start justify-center overflow-hidden rounded-lg bg-transparent p-2 ${isSCFeuille ? 'min-h-[180px]' : 'min-h-[420px]'}`}>
                                    <img
                                        src={isSCFeuille ? activeCoupePhotoUrl : photoUrl}
                                        alt={`Photo carotte ${activeCoupe?.title || 'coupe'}`}
                                        loading="lazy"
                                        onLoad={handlePhotoLoad}
                                        onError={handlePhotoLoadError}
                                        className={`h-auto w-auto max-w-full rounded-md object-contain ${isSCFeuille ? 'max-h-[164px]' : 'max-h-[404px]'}`}
                                    />
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-[13px] text-text-muted">
                                    {isSCFeuille
                                        ? (canManagePhotos
                                            ? 'Aucune photo sur la coupe active. Déposez une image sur la carte Coupe SC.'
                                            : 'Feuille introuvable pour charger une photo.')
                                        : (canManagePhotos
                                            ? 'Photo indisponible pour cet essai.'
                                            : 'Aucune photo liée (source_essai_id absent sur la feuille).')}
                                </div>
                            )}
                        </div>

                        {isSCFeuille ? (
                            <>
                                <div className="mt-4 flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Galerie</p>
                                            <p className="text-[12px] text-text-muted">
                                                Toutes les photos du point SC. Cliquez pour affecter à la coupe active, ou choisissez sur chaque carte Coupe SC.
                                            </p>
                                        </div>
                                        {selectedPhoto?.original_name ? (
                                            <span className="max-w-[180px] truncate rounded-full border border-border bg-bg px-3 py-1 text-[11px] text-text-muted" title={selectedPhoto.original_name}>
                                                {selectedPhoto.original_name}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
                                        <Input value={photoFilterText} onChange={(event) => setPhotoFilterText(event.target.value)} placeholder="Filtrer par nom..." />
                                        <ScSelect value={photoSortMode} onChange={(event) => setPhotoSortMode(event.target.value)}>
                                            <option value="primary">Active d'abord</option>
                                            <option value="recent">Plus récentes</option>
                                            <option value="filename">Nom de fichier</option>
                                        </ScSelect>
                                    </div>
                                    {coupeGalleryItems.length ? (
                                        <div className="grid gap-2 max-h-[220px] overflow-y-auto pr-1">
                                            {coupeGalleryItems.map((photo) => {
                                                const optionValue = String(photo.stored_name || photo.filename || '').trim()
                                                const activePhotoKey = String(activeCoupe?.photo_stored_name || '').trim()
                                                const isActive = Boolean(activePhotoKey) && activePhotoKey === optionValue
                                                return (
                                                    <div
                                                        key={photo.stored_name}
                                                        className={`grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-2 py-2 transition ${isActive ? 'border-accent bg-[#eef7ff]' : 'border-border bg-surface hover:border-accent/40 hover:bg-bg'}`}
                                                    >
                                                        <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-lg border border-border bg-bg">
                                                            <img src={scPhotoItemUrl(photo, photoVersion)} alt={photo.original_name || photo.filename} className="h-full w-full object-cover" />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const optionValue = String(photo.stored_name || photo.filename || '').trim()
                                                                if (activeCoupe?.id && optionValue) {
                                                                    handleCoupePhotoSelect(activeCoupe.id, optionValue)
                                                                    return
                                                                }
                                                                handleSelectPrimaryPhoto(optionValue)
                                                            }}
                                                            disabled={photoSaving}
                                                            className="min-w-0 text-left"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate text-[12px] font-medium text-text" title={photo.stored_name || photo.filename}>
                                                                    {photo.stored_name || photo.filename}
                                                                </span>
                                                                {photo.is_primary ? <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">Active</span> : null}
                                                            </div>
                                                            <div className="mt-1 text-[11px] text-text-muted">
                                                                {photo.original_name && photo.original_name !== photo.stored_name
                                                                    ? photo.original_name
                                                                    : (photo.created_at || 'Upload terrain')}
                                                            </div>
                                                        </button>
                                                        <Button variant="danger" size="sm" onClick={() => handleDeletePhoto(photo.stored_name)} disabled={photoSaving}>✕</Button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-[12px] text-text-muted">
                                            {photoItems.length ? 'Aucune photo ne correspond au filtre actuel.' : 'Aucune photo chargée pour cette carotte.'}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Coupes SC</p>
                                            <p className="text-[12px] text-text-muted">Chaque coupe peut viser un intervalle différent et utiliser une photo différente.</p>
                                        </div>
                                        <Button variant="secondary" size="sm" onClick={addCarotteCoupe}>+ Coupe</Button>
                                    </div>
                                    {coupesForDisplay.length ? (
                                        <div className="grid gap-2">
                                            {coupesForDisplay.map((coupe, index) => {
                                                const isActive = coupe.id === activeCoupe?.id
                                                const coupeBounds = scGetScCoupeBoundsCm(coupe?.couches, coupe?.total_height_cm || pointForm.carotte_total_height_cm || '')
                                                const startCm = String(coupe.depth_start_cm ?? '').trim() || coupeBounds.depth_start_cm
                                                const endCm = String(coupe.depth_end_cm ?? '').trim() || coupeBounds.depth_end_cm
                                                const coupePreviewUrl = scResolveCoupePhotoUrl({
                                                    storedName: coupe.photo_stored_name,
                                                    photoUrl: coupe.photo_url,
                                                    photoItems,
                                                    feuilleUid,
                                                    sourceEssaiId,
                                                    photoVersion,
                                                    fallbackPhoto: null,
                                                    coupe,
                                                    coupeIndex: index,
                                                })
                                                const coupePhotoStoredName = coupe.photo_stored_name || ''
                                                const selectablePhotoOptions = displayedPhotoItems
                                                const isDropActive = coupeDragActiveId === coupe.id
                                                return (
                                                    <div
                                                        key={coupe.id}
                                                        className={`rounded-xl border p-3 transition ${isActive ? 'border-accent bg-[#eef7ff]' : 'border-border bg-bg'}`}
                                                    >
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => setSelectedCoupeId(coupe.id)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter' || event.key === ' ') {
                                                                    event.preventDefault()
                                                                    setSelectedCoupeId(coupe.id)
                                                                }
                                                            }}
                                                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-0.5 ${isActive ? '' : 'hover:bg-[#f8fbff]'}`}
                                                        >
                                                            <div className="text-left">
                                                                <div className="text-[12px] font-semibold text-text">{coupe.title || `Coupe ${index + 1}`}</div>
                                                                <div className="text-[11px] text-text-muted">{startCm || '—'} cm → {endCm || '—'} cm</div>
                                                            </div>
                                                            <Button variant="danger" size="sm" onClick={(event) => {
                                                                event.stopPropagation()
                                                                deleteCarotteCoupe(coupe.id)
                                                            }}>Suppr.</Button>
                                                        </div>

                                                        <div
                                                            className={`mt-3 rounded-xl border border-dashed px-3 py-3 transition ${isDropActive ? 'border-accent bg-[#eef7ff]' : 'border-border bg-surface'}`}
                                                            onClick={(event) => event.stopPropagation()}
                                                            onDragEnter={(event) => {
                                                                event.preventDefault()
                                                                event.stopPropagation()
                                                                setCoupeDragActiveId(coupe.id)
                                                            }}
                                                            onDragOver={(event) => {
                                                                event.preventDefault()
                                                                event.stopPropagation()
                                                                setCoupeDragActiveId(coupe.id)
                                                            }}
                                                            onDragLeave={(event) => {
                                                                event.preventDefault()
                                                                event.stopPropagation()
                                                                if (event.currentTarget.contains(event.relatedTarget)) return
                                                                setCoupeDragActiveId('')
                                                            }}
                                                            onDrop={(event) => handleCoupePhotoDrop(coupe.id, event)}
                                                        >
                                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                                                <div className="flex h-[96px] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg sm:w-[96px]">
                                                                    {coupePreviewUrl ? (
                                                                        <img src={coupePreviewUrl} alt={coupe.title || `Coupe ${index + 1}`} className="h-full w-full object-cover" />
                                                                    ) : (
                                                                        <span className="px-2 text-center text-[11px] text-text-muted">Glisser une photo ici</span>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Photo de la coupe</p>
                                                                    <p className="mt-1 text-[11px] text-text-muted">
                                                                        Déposez une image ou choisissez un fichier. Recadrage avant enregistrement. Nom WBS incluant {scCoupePhotoCode(coupe, index)}.
                                                                    </p>
                                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                                        <Button
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            disabled={!canManagePhotos || photoSaving}
                                                                            onClick={() => handleCoupePhotoPick(coupe.id)}
                                                                        >
                                                                            Choisir une photo
                                                                        </Button>
                                                                        <Button
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            disabled={!canManagePhotos || photoSaving || !coupePreviewUrl}
                                                                            onClick={() => handleCoupePhotoRecrop(coupe.id)}
                                                                        >
                                                                            Recadrer / tourner
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                                                            <ScField label="Titre">
                                                                <Input value={coupe.title || ''} onChange={(event) => updateCarotteCoupe(coupe.id, { title: event.target.value })} onClick={(event) => event.stopPropagation()} />
                                                            </ScField>
                                                            <ScField label="Photo (galerie)">
                                                                <ScSelect
                                                                    value={coupePhotoStoredName}
                                                                    onChange={(event) => handleCoupePhotoSelect(coupe.id, event.target.value)}
                                                                    onClick={(event) => event.stopPropagation()}
                                                                    className="w-full"
                                                                >
                                                                    <option value="">— Choisir une photo existante —</option>
                                                                    {selectablePhotoOptions.map((photo) => {
                                                                        const optionValue = String(photo.stored_name || photo.filename || '').trim()
                                                                        if (!optionValue) return null
                                                                        return (
                                                                            <option key={optionValue} value={optionValue}>
                                                                                {optionValue}
                                                                            </option>
                                                                        )
                                                                    })}
                                                                </ScSelect>
                                                            </ScField>
                                                            <ScField label="Début (cm)">
                                                                <Input
                                                                    value={startCm}
                                                                    inputMode="decimal"
                                                                    onChange={(event) => updateCarotteCoupe(coupe.id, { depth_start_cm: event.target.value })}
                                                                />
                                                            </ScField>
                                                            <ScField label="Fin (cm)">
                                                                <Input
                                                                    value={endCm}
                                                                    inputMode="decimal"
                                                                    onChange={(event) => updateCarotteCoupe(coupe.id, { depth_end_cm: event.target.value })}
                                                                />
                                                            </ScField>
                                                            <ScField label="Hauteur totale carotte (cm)">
                                                                <Input
                                                                    value={coupe.total_height_cm || ''}
                                                                    inputMode="decimal"
                                                                    placeholder="ex: 25 ou 4.2"
                                                                    onChange={(event) => updateCarotteCoupe(coupe.id, { total_height_cm: event.target.value })}
                                                                />
                                                            </ScField>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-[12px] text-text-muted">
                                            Aucune coupe configurée. La vue actuelle utilise la photo active sur toute la hauteur de carotte.
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Notes carotte</p>
                                        <p className="mt-1 text-[12px] text-text-muted">Clique directement sur la photo pour poser un repère, puis décris-le ci-dessous.</p>
                                    </div>
                                    <ScTextarea
                                        value={pointForm.notes}
                                        onChange={(value) => setPointField('notes', value)}
                                        rows={4}
                                        placeholder="Ex. couche de roulement bien marquée, interface floue vers 5,5 cm, vide latéral à confirmer..."
                                    />
                                    <div className="grid gap-2">
                                        {carotteAnnotations.length ? carotteAnnotations.map((annotation, index) => {
                                            const isSelected = annotation.id === selectedAnnotationId
                                            return (
                                                <div key={annotation.id} className={`rounded-lg border p-3 ${isSelected ? 'border-accent bg-[#eef7ff]' : 'border-border bg-bg'}`}>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <button type="button" className="text-left" onClick={() => setSelectedAnnotationId(annotation.id)}>
                                                            <div className="text-[12px] font-semibold text-text">Repère {index + 1}</div>
                                                            <div className="text-[11px] text-text-muted">x {annotation.x.toFixed(1)}% · y {annotation.y.toFixed(1)}%</div>
                                                        </button>
                                                        <Button variant="danger" size="sm" onClick={() => deleteAnnotation(annotation.id)}>Suppr.</Button>
                                                    </div>
                                                    <ScSelect value={annotation.category || ''} onChange={(event) => updateAnnotation(annotation.id, { category: event.target.value })} className="mt-2">
                                                        {CAROTTE_ANNOTATION_CATEGORIES.map((item) => <option key={item || 'empty'} value={item}>{item || 'Catégorie...'}</option>)}
                                                    </ScSelect>
                                                    <ScTextarea
                                                        value={annotation.text}
                                                        onChange={(value) => updateAnnotation(annotation.id, { text: value })}
                                                        rows={2}
                                                        placeholder="Décris ce que tu vois à cet endroit..."
                                                    />
                                                </div>
                                            )
                                        }) : (
                                            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-[12px] text-text-muted">
                                                Aucun repère posé. Clique sur la photo pour en ajouter un.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : null}

                        <PhotoCropModal
                            open={photoEditorOpen}
                            imageSrc={photoEditorSrc}
                            title="Préparer la photo pour la coupe"
                            initialAspectPreset="libre"
                            outputFilename={photoEditorFilename}
                            onCancel={() => {
                                if (photoSaving) return
                                setPhotoEditorOpen(false)
                                setPhotoEditorSrc('')
                                setPhotoCropTargetCoupeId('')
                                setPhotoCropReplaceStoredName('')
                            }}
                            onConfirm={handleCropConfirm}
                            saving={photoSaving}
                        />
                    </ScCard>

                    <ScCard title={isSCFeuille ? (activeCoupe?.title || 'Coupe de carotte enrobé') : 'Coupe de description géotechnique'} right={
                        <div className="flex gap-2 items-center">
                            <span className="text-[11px] text-text-muted">{coucheRows.length} couche(s)</span>
                            {isSCFeuille && activeCoupe ? (
                                <span className="text-[11px] text-text-muted">{activeCoupe?.depth_start_cm || activeCoupeBoundsCm.depth_start_cm || '0'}-{activeCoupe?.depth_end_cm || activeCoupeBoundsCm.depth_end_cm || '—'} cm</span>
                            ) : null}
                            {!addingCouche ? (
                                <div className="flex gap-2">
                                    {selectedCoucheRow && <Button variant="secondary" size="sm" onClick={effectiveHandleInsertCouche}>Insérer après</Button>}
                                    <Button variant="primary" size="sm" onClick={effectiveHandleAddCouche}>+ Couche</Button>
                                </div>
                            ) : null}
                        </div>
                    }>


                {showCoucheTable ? (
                    <div className="flex gap-0 overflow-x-auto">
                        {!isSCFeuille ? (
                            <ScCoupeSVG
                                point={point}
                                couches={couches}
                                prelevements={linkedPointPrelevements.filter((item) => !item?.ignore_sondage_couche_match)}
                                isSCFeuille={isSCFeuille}
                                photoUrl={photoUrl}
                                photoError={photoError}
                                totalHeightValue={legacyPointTotalHeight}
                                annotations={carotteAnnotations}
                                selectedAnnotationId={selectedAnnotationId}
                                onSelectAnnotation={setSelectedAnnotationId}
                                onStartDragAnnotation={setDraggingAnnotationId}
                                onCanvasClick={handlePhotoCanvasClick}
                                photoCanvasRef={photoCanvasRef}
                                onPhotoLoad={handlePhotoLoad}
                                onPhotoError={handlePhotoLoadError}
                            />
                        ) : null}

                        {/* Tableau descriptif */}
                        <div className="flex-1 min-w-0 overflow-x-auto">
                            <table className="w-full border-collapse text-[11px]" style={{ minWidth: columnWidths.reduce((sum, width) => sum + width, 0) + (showEmbeddedScPhoto ? scPhotoColumnWidth : 0), tableLayout: 'fixed' }}>
                                <colgroup>
                                    {showEmbeddedScPhoto ? (
                                        <col style={{ width: scPhotoColumnWidth }} />
                                    ) : null}
                                    {columnWidths.map((width, index) => (
                                        <col key={`couche-col-${index}`} style={{ width }} />
                                    ))}
                                </colgroup>
                                <thead>
                                    <tr className="bg-bg border-b border-border">
                                        {showEmbeddedScPhoto ? (
                                            <th className="px-1.5 py-1 border-r border-border text-left font-medium text-text-muted whitespace-nowrap">Carotte</th>
                                        ) : null}
                                        {tableColumns.map((column, index) => {
                                            const isLast = index === tableColumns.length - 1
                                            const alignClass = column.label === 'Actions' ? 'text-center' : 'text-left'
                                            return (
                                                <th key={`head-${column.label || index}`} className={`relative overflow-hidden px-1.5 py-1 ${alignClass} font-medium text-text-muted whitespace-nowrap ${isLast ? '' : 'border-r border-border'}`}>
                                                    <span className="block truncate pr-2">{column.label}</span>
                                                    <span
                                                        role="separator"
                                                        aria-label={`Redimensionner ${column.label || `colonne ${index + 1}`}`}
                                                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none hover:bg-accent/20"
                                                        onMouseDown={(event) => startColumnResize(index, event)}
                                                    />
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {coucheRows.map((couche, index) => {
                                        const linkedPrelevements = Array.isArray(couche.prelevements) ? couche.prelevements : []
                                        const isEditing = editingCoucheId === couche.uid
                                        return (
                                            <Fragment key={couche.uid || index}>
                                            <tr
                                                className={`border-b border-border ${isEditing ? 'bg-[#f0f4ff]' : 'hover:bg-bg'}`}
                                                style={isSCFeuille && !isEditing ? { height: `${activeScRowHeightsByUid.get(couche?.uid) ?? 20}px` } : undefined}
                                            >
                                                {isEditing ? (
                                                    <td colSpan={tableColumns.length + (showEmbeddedScPhoto && index === 0 ? 1 : 0)} className="p-2">
                                                        <ScCoucheEditor
                                                            form={coucheForm}
                                                            onChange={setCoucheField}
                                                            onSave={() => effectiveHandleUpdateCouche(couche.uid)}
                                                            onCancel={() => { setEditingCoucheId(null); setCoucheField('__reset__', scBuildCoucheForm()) }}
                                                            saving={isSCFeuille && carotteCoupes.length ? updatePointPending : updateCouchePending}
                                                            submitLabel="Enregistrer"
                                                            depthUnit={isSCFeuille && carotteCoupes.length ? 'cm' : 'm'}
                                                        />
                                                    </td>
                                                ) : (
                                                    isSCFeuille ? (
                                                        <>
                                                            {showEmbeddedScPhoto && index === 0 ? (
                                                                <td rowSpan={displayedCouches.length + (shouldRenderInlineAfterSelection ? 1 : 0)} className="align-top border-r border-border bg-bg p-0">
                                                                    <div
                                                                        ref={photoCanvasRef}
                                                                        className="relative overflow-hidden bg-transparent"
                                                                        style={{ width: scPhotoColumnWidth, height: activeScRenderHeight }}
                                                                        onClick={handlePhotoCanvasClick}
                                                                    >
                                                                        {activeCoupePhotoUrl && !photoError ? (
                                                                            <img
                                                                                src={activeCoupePhotoUrl}
                                                                                alt="Carotte"
                                                                                className="h-full w-full object-cover"
                                                                                draggable={false}
                                                                                onLoad={(event) => {
                                                                                    const image = event.currentTarget
                                                                                    setEmbeddedPhotoNaturalSize({
                                                                                        width: Number(image.naturalWidth || 0),
                                                                                        height: Number(image.naturalHeight || 0),
                                                                                    })
                                                                                    handlePhotoLoad()
                                                                                }}
                                                                                onError={handlePhotoLoadError}
                                                                            />
                                                                        ) : (
                                                                            <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-text-muted">Photo indisponible</div>
                                                                        )}

                                                                        <div className="absolute left-0 right-0 border-t border-dashed border-[#f97316]" style={{ top: 0 }} />
                                                                        <div className="absolute right-1 rounded bg-white/90 px-1 py-[1px] text-[8px] font-semibold text-slate-700" style={{ top: 2 }}>
                                                                            {scFormatDepthCmValue(activeCoupeStartCm)}
                                                                        </div>

                                                                        <div className="absolute left-0 right-0 border-t border-dashed border-[#f97316]" style={{ top: activeScRenderHeight - 1 }} />
                                                                        <div className="absolute right-1 rounded bg-white/90 px-1 py-[1px] text-[8px] font-semibold text-slate-700" style={{ bottom: 2 }}>
                                                                            {scFormatDepthCmValue(activeCoupeEndCm)}
                                                                        </div>

                                                                        {activeScRowBoundaries.map((item) => {
                                                                            const lineTop = Math.max(0, Math.min(activeScRenderHeight - 1, Number(item.y || 0)))
                                                                            const labelTop = Math.max(2, Math.min(activeScRenderHeight - 14, lineTop - 6))
                                                                            return (
                                                                            <div key={`sc-boundary-${item.uid}`}>
                                                                                <div className="absolute left-0 right-0 border-t border-dashed border-[#f97316]" style={{ top: lineTop }} />
                                                                                <div className="absolute right-1 rounded bg-white/90 px-1 py-[1px] text-[8px] font-semibold text-slate-700" style={{ top: labelTop }}>
                                                                                    {scFormatDepthCmValue(item.depthCm)}
                                                                                </div>
                                                                            </div>
                                                                            )
                                                                        })}

                                                                        {Array.isArray(carotteAnnotations) ? carotteAnnotations.map((annotation, annotationIndex) => {
                                                                            const isSelected = annotation.id === selectedAnnotationId
                                                                            return (
                                                                                <button
                                                                                    key={annotation.id || annotationIndex}
                                                                                    type="button"
                                                                                    onMouseDown={(event) => {
                                                                                        event.stopPropagation()
                                                                                        setDraggingAnnotationId(annotation.id)
                                                                                    }}
                                                                                    onClick={(event) => {
                                                                                        event.stopPropagation()
                                                                                        setSelectedAnnotationId(annotation.id)
                                                                                    }}
                                                                                    className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[10px] font-semibold shadow ${isSelected ? 'border-white bg-[#c2410c] text-white' : 'border-[#0f1720] bg-[#facc15] text-[#0f1720]'}`}
                                                                                    style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                                                                                    title={[annotation.category, annotation.text].filter(Boolean).join(' · ') || `Repère ${annotationIndex + 1}`}
                                                                                >
                                                                                    {annotationIndex + 1}
                                                                                </button>
                                                                            )
                                                                        }) : null}
                                                                    </div>
                                                                </td>
                                                            ) : null}
                                                            <td className="px-1 py-1 w-6 border-r border-border text-center">
                                                                <input type="radio" name="couche-select" checked={selectedCoucheRow === couche.uid} onChange={() => setSelectedCoucheRow(selectedCoucheRow === couche.uid ? null : couche.uid)} className="cursor-pointer accent-accent" />
                                                            </td>
                                                            <td
                                                                className="px-1.5 py-1 whitespace-nowrap border-r border-border text-text cursor-pointer overflow-hidden"
                                                                onClick={(event) => {
                                                                    if (event.target instanceof HTMLInputElement) return
                                                                    expandIntervalColumnForEdit()
                                                                    startEditCell(couche.uid, 'z_haut', scScCoucheDepthString(couche?.z_haut))
                                                                }}
                                                                onBlurCapture={(event) => {
                                                                    const nextTarget = event.relatedTarget
                                                                    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
                                                                    effectiveSaveCellEdit()
                                                                }}
                                                            >
                                                                <div className="flex min-w-0 items-center gap-1 font-mono text-[11px] font-medium">
                                                                    {editingCell?.coucheUid === couche.uid && (editingCell?.field === 'z_haut' || editingCell?.field === 'z_bas') ? (
                                                                        <input
                                                                            value={editingCell?.field === 'z_haut' ? editingCellValue : scScCoucheDepthString(couche?.z_haut)}
                                                                            onFocus={() => {
                                                                                if (editingCell?.field === 'z_haut') return
                                                                                setEditingCell({ coucheUid: couche.uid, field: 'z_haut' })
                                                                                setEditingCellValue(scScCoucheDepthString(couche?.z_haut))
                                                                            }}
                                                                            onChange={e => {
                                                                                if (editingCell?.field !== 'z_haut') {
                                                                                    setEditingCell({ coucheUid: couche.uid, field: 'z_haut' })
                                                                                }
                                                                                setEditingCellValue(e.target.value)
                                                                            }}
                                                                            onKeyDown={e => e.key === 'Enter' && effectiveSaveCellEdit()}
                                                                            autoFocus={editingCell?.field === 'z_haut'}
                                                                            className="w-[74px] max-w-full min-w-0 text-sm border-2 border-accent rounded px-2 py-1 bg-white shadow-sm"
                                                                        />
                                                                    ) : (
                                                                        <span className="truncate hover:text-accent">{couche?.z_haut == null || couche?.z_haut === '' ? '—' : couche.z_haut}</span>
                                                                    )}
                                                                    <span className="shrink-0">→</span>
                                                                    {editingCell?.coucheUid === couche.uid && (editingCell?.field === 'z_haut' || editingCell?.field === 'z_bas') ? (
                                                                        <input
                                                                            value={editingCell?.field === 'z_bas' ? editingCellValue : scScCoucheDepthString(couche?.z_bas)}
                                                                            onFocus={() => {
                                                                                if (editingCell?.field === 'z_bas') return
                                                                                setEditingCell({ coucheUid: couche.uid, field: 'z_bas' })
                                                                                setEditingCellValue(scScCoucheDepthString(couche?.z_bas))
                                                                            }}
                                                                            onChange={e => {
                                                                                if (editingCell?.field !== 'z_bas') {
                                                                                    setEditingCell({ coucheUid: couche.uid, field: 'z_bas' })
                                                                                }
                                                                                setEditingCellValue(e.target.value)
                                                                            }}
                                                                            onKeyDown={e => e.key === 'Enter' && effectiveSaveCellEdit()}
                                                                            autoFocus={editingCell?.field === 'z_bas'}
                                                                            className="w-[74px] max-w-full min-w-0 text-sm border-2 border-accent rounded px-2 py-1 bg-white shadow-sm"
                                                                        />
                                                                    ) : (
                                                                        <span className="truncate hover:text-accent">{couche?.z_bas == null || couche?.z_bas === '' ? '—' : couche.z_bas}</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-1.5 py-1 border-r border-border text-text text-center">
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'thickness_cm' ? (
                                                                    <input
                                                                        value={editingCellValue}
                                                                        onChange={e => setEditingCellValue(e.target.value)}
                                                                        onBlur={effectiveSaveCellEdit}
                                                                        onKeyDown={e => e.key === 'Enter' && effectiveSaveCellEdit()}
                                                                        autoFocus
                                                                        className="w-24 max-w-full text-sm border-2 border-accent rounded px-2 py-1 bg-white shadow-sm"
                                                                        placeholder="cm"
                                                                    />
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => startEditCell(couche.uid, 'thickness_cm', scComputeScCoucheThicknessCm(couche) ?? '')}
                                                                        className="hover:text-accent"
                                                                        title="Éditer l'épaisseur en cm"
                                                                    >
                                                                        {scComputeScCoucheThicknessCm(couche) == null ? '—' : scComputeScCoucheThicknessCm(couche).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                                                                    </button>
                                                                )}
                                                            </td>
                                                            <td
                                                                className="p-0 border-r border-border text-text-muted cursor-pointer overflow-hidden align-top"
                                                                style={{ height: `${activeScRowHeightsByUid.get(couche?.uid) ?? 20}px` }}
                                                                onClick={() => {
                                                                    if (editingCell?.coucheUid === couche.uid && editingCell?.field === 'description_libre') return
                                                                    startEditCell(couche.uid, 'description_libre', couche.description_libre)
                                                                    requestAnimationFrame(() => {
                                                                        const editor = document.querySelector(`[data-sc-desc-editor="${couche.uid}"]`)
                                                                        if (!(editor instanceof HTMLElement)) return
                                                                        editor.focus()
                                                                        const selection = window.getSelection()
                                                                        if (!selection) return
                                                                        const range = document.createRange()
                                                                        range.selectNodeContents(editor)
                                                                        range.collapse(false)
                                                                        selection.removeAllRanges()
                                                                        selection.addRange(range)
                                                                    })
                                                                }}
                                                            >
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'description_libre' ? (
                                                                    <div
                                                                        data-sc-desc-editor={couche.uid}
                                                                        contentEditable
                                                                        suppressContentEditableWarning
                                                                        onInput={e => setEditingCellValue(e.currentTarget.textContent || '')}
                                                                        onBlur={effectiveSaveCellEdit}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                                                                e.preventDefault()
                                                                                effectiveSaveCellEdit()
                                                                            }
                                                                        }}
                                                                        className="block h-full w-full max-w-full min-w-0 whitespace-pre-wrap break-words rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-sm leading-tight outline-none focus:border-accent/40 focus:bg-white"
                                                                    >
                                                                        {editingCellValue}
                                                                    </div>
                                                                ) : (
                                                                    <span className="block h-full whitespace-normal break-words px-1.5 py-1 leading-tight hover:text-accent" title={couche.description_libre || ''}>{couche.description_libre || '—'}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-1.5 py-1 border-r border-border text-text text-center cursor-pointer overflow-hidden" onClick={() => startEditCell(couche.uid, 'd', couche.d)}>
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'd' ? (
                                                                    <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={effectiveSaveCellEdit} onKeyDown={e => e.key === 'Enter' && effectiveSaveCellEdit()} autoFocus className="w-20 max-w-full text-sm border-2 border-accent rounded px-2 py-1 bg-white shadow-sm" />
                                                                ) : (
                                                                    <span className="block truncate hover:text-accent">{scFormatResult(couche.d, '') || '—'}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-1.5 py-1 border-r border-border text-text text-center cursor-pointer overflow-hidden" onClick={() => startEditCell(couche.uid, 'vide', couche.vide)}>
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'vide' ? (
                                                                    <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={effectiveSaveCellEdit} onKeyDown={e => e.key === 'Enter' && effectiveSaveCellEdit()} autoFocus className="w-20 max-w-full text-sm border-2 border-accent rounded px-2 py-1 bg-white shadow-sm" />
                                                                ) : (
                                                                    <span className="block truncate hover:text-accent">{scFormatResult(couche.vide, '') || '—'}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-1.5 py-1 border-r border-border text-text text-center cursor-pointer overflow-hidden" onClick={() => startEditCell(couche.uid, 'compacite', couche.compacite)}>
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'compacite' ? (
                                                                    <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={effectiveSaveCellEdit} onKeyDown={e => e.key === 'Enter' && effectiveSaveCellEdit()} autoFocus className="w-24 max-w-full text-sm border-2 border-accent rounded px-2 py-1 bg-white shadow-sm" />
                                                                ) : (
                                                                    <span className="block truncate hover:text-accent">{scFormatResult(couche.compacite, '') || '—'}</span>
                                                                )}
                                                            </td>
                                                            <td className="px-1.5 py-1 border-r border-border">
                                                                <div className="flex min-w-[220px] flex-col gap-1.5">
                                                                    {linkedPrelevements.map((prelevement) => (
                                                                        <ScPrelevementManagerItem
                                                                            key={prelevement.uid}
                                                                            prelevement={prelevement}
                                                                            currentCoucheId={couche.uid}
                                                                            coucheOptions={coucheOptions}
                                                                            detailReturnTo={detailReturnTo}
                                                                            navigate={navigate}
                                                                            disabled={updatePrelevementPending || deleteCouchePending}
                                                                            onMove={(prelevUid, targetCoucheUid) => handleUpdatePrelevement(prelevUid, { sondage_couche_id: targetCoucheUid, ignore_sondage_couche_match: false })}
                                                                            onToggleIgnore={(prelevUid, ignore) => handleUpdatePrelevement(prelevUid, { ignore_sondage_couche_match: ignore })}
                                                                            onDelete={handleDeletePrelevement}
                                                                        />
                                                                    ))}
                                                                    {prelevCoucheId === couche.uid ? (
                                                                        <div className="rounded-md border border-dashed border-accent/40 bg-[#f7fbff] p-2">
                                                                            <div className="flex flex-col gap-1">
                                                                                <Input value={prelevForm.profondeur} onChange={(e) => setPrelevForm(f => ({ ...f, profondeur: e.target.value }))} placeholder="prof. m" className="h-6 px-1 py-0.5 text-[10px]" />
                                                                                <Input value={prelevForm.quantite} onChange={(e) => setPrelevForm(f => ({ ...f, quantite: e.target.value }))} placeholder="qté" className="h-6 px-1 py-0.5 text-[10px]" />
                                                                                <div className="flex gap-1">
                                                                                    <Button variant="primary" size="sm" onClick={() => handleCreatePrelevement(couche.uid)} disabled={createPrelevementPending}>Créer</Button>
                                                                                    <Button variant="secondary" size="sm" onClick={() => { setPrelevCoucheId(null); setPrelevForm({ profondeur: '', quantite: '' }) }}>Annuler</Button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <button type="button" onClick={() => setPrelevCoucheId(couche.uid)} className="text-left text-[10px] text-accent hover:underline">+ prél.</button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-1.5 py-1 text-center whitespace-nowrap">
                                                                <div className="flex gap-1 justify-center">
                                                                    <Button variant="secondary" size="sm" onClick={() => { setEditingCoucheId(couche.uid); setCoucheField('__reset__', scBuildCoucheForm(couche)) }}>✎</Button>
                                                                    <Button variant="danger" size="sm" onClick={() => effectiveHandleDeleteCouche(couche.uid)}>✕</Button>
                                                                </div>
                                                            </td>
                                                        </>
                                                    ) : (
                                                    <>
                                                        <td className="px-1 py-1 w-6 border-r border-border text-center">
                                                            <input type="radio" name="couche-select" checked={selectedCoucheRow === couche.uid} onChange={() => setSelectedCoucheRow(selectedCoucheRow === couche.uid ? null : couche.uid)} className="cursor-pointer accent-accent" />
                                                        </td>
                                                        <td className="px-1.5 py-1 whitespace-nowrap border-r border-border text-text">
                                                            <div className="flex items-center gap-0.5 font-mono text-[10px]">
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'z_haut' ? (
                                                                    <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="w-10 text-[10px] border border-accent rounded px-1 py-0 bg-white" />
                                                                ) : (
                                                                    <span className="cursor-pointer hover:text-accent" onClick={() => startEditCell(couche.uid, 'z_haut', couche.z_haut)}>{couche.z_haut ?? '—'}</span>
                                                                )}
                                                                <span>→</span>
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'z_bas' ? (
                                                                    <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="w-10 text-[10px] border border-accent rounded px-1 py-0 bg-white" />
                                                                ) : (
                                                                    <span className="cursor-pointer hover:text-accent" onClick={() => startEditCell(couche.uid, 'z_bas', couche.z_bas)}>{couche.z_bas ?? '—'}</span>
                                                                )}
                                                                <span>m</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'texture_matrice', couche.texture_matrice)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'texture_matrice' ? (
                                                                <>
                                                                    <input list="dl-texture-matrice" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                                    <datalist id="dl-texture-matrice">{getOptions('texture_matrice', TEXTURE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.texture_matrice || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'proportion_matrice', couche.proportion_matrice)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'proportion_matrice' ? (
                                                                <>
                                                                    <input list="dl-proportion-matrice" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-proportion-matrice">{getOptions('proportion_matrice', PROPORTION_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.proportion_matrice || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'elements_grossiers', couche.elements_grossiers)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'elements_grossiers' ? (
                                                                <>
                                                                    <input list="dl-elements-grossiers" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                                    <datalist id="dl-elements-grossiers">{getOptions('elements_grossiers', ELEMENTS_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.elements_grossiers || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'granulo_elements', couche.granulo_elements)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'granulo_elements' ? (
                                                                <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.granulo_elements || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'petrographie', couche.petrographie)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'petrographie' ? (
                                                                <>
                                                                    <input list="dl-petrographie" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                                    <datalist id="dl-petrographie">{getOptions('petrographie', PETROGRAPHIE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.petrographie || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'structure', couche.structure)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'structure' ? (
                                                                <>
                                                                <input list="dl-structure" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-structure">{getOptions('structure', STRUCTURE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.structure || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'matiere_organique', couche.matiere_organique)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'matiere_organique' ? (
                                                                <>
                                                                <input list="dl-matiere-organique" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-matiere-organique">{getOptions('matiere_organique', ORGANIQUE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.matiere_organique || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'couleur', couche.couleur)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'couleur' ? (
                                                                <>
                                                                <input list="dl-couleur" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-couleur">{getOptions('couleur', COULEUR_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.couleur || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'odeur', couche.odeur)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'odeur' ? (
                                                                <>
                                                                <input list="dl-odeur" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-odeur">{getOptions('odeur', ODEUR_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.odeur || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'consistance', couche.consistance)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'consistance' ? (
                                                                <>
                                                                <input list="dl-consistance" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-consistance">{getOptions('consistance', CONSISTANCE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.consistance || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'cohesion', couche.cohesion)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'cohesion' ? (
                                                                <>
                                                                <input list="dl-cohesion" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-cohesion">{getOptions('cohesion', COHESION_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.cohesion || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'oxydo_reduction', couche.oxydo_reduction)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'oxydo_reduction' ? (
                                                                <>
                                                                <input list="dl-oxydo-reduction" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-oxydo-reduction">{getOptions('oxydo_reduction', OXYDO_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.oxydo_reduction || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'eau_porosite', couche.eau_porosite)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'eau_porosite' ? (
                                                                <>
                                                                <input list="dl-eau-porosite" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-eau-porosite">{getOptions('eau_porosite', EAU_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.eau_porosite || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted">
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'profondeur_eau' ? (
                                                                <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-16" placeholder="m" />
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startEditCell(couche.uid, 'profondeur_eau', couche.profondeur_eau)}
                                                                    className={`w-full text-left ${
                                                                        couche.profondeur_eau != null && couche.profondeur_eau !== '' && (
                                                                            Number(couche.profondeur_eau) < Number(couche.z_haut) ||
                                                                            Number(couche.profondeur_eau) > Number(couche.z_bas)
                                                                        ) ? 'text-orange-500 font-bold' : 'hover:text-blue-500 text-blue-400'
                                                                    }`}
                                                                >
                                                                    {couche.profondeur_eau != null && couche.profondeur_eau !== '' ? `∇ ${couche.profondeur_eau}m` : '—'}
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'horizon', couche.horizon)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'horizon' ? (
                                                                <>
                                                                <input list="dl-horizon" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-horizon">{getOptions('horizon', HORIZON_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.horizon || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border">
                                                            <div className="flex min-w-[220px] flex-col gap-1.5">
                                                                {linkedPrelevements.map((prelevement) => (
                                                                    <ScPrelevementManagerItem
                                                                        key={prelevement.uid}
                                                                        prelevement={prelevement}
                                                                        currentCoucheId={couche.uid}
                                                                        coucheOptions={coucheOptions}
                                                                        detailReturnTo={detailReturnTo}
                                                                        navigate={navigate}
                                                                        disabled={updatePrelevementPending || deleteCouchePending}
                                                                        onMove={(prelevUid, targetCoucheUid) => handleUpdatePrelevement(prelevUid, { sondage_couche_id: targetCoucheUid, ignore_sondage_couche_match: false })}
                                                                        onToggleIgnore={(prelevUid, ignore) => handleUpdatePrelevement(prelevUid, { ignore_sondage_couche_match: ignore })}
                                                                        onDelete={handleDeletePrelevement}
                                                                    />
                                                                ))}
                                                                {prelevCoucheId === couche.uid ? (
                                                                    <div className="rounded-md border border-dashed border-accent/40 bg-[#f7fbff] p-2">
                                                                        <div className="flex flex-col gap-1">
                                                                            <Input value={prelevForm.profondeur} onChange={(e) => setPrelevForm(f => ({ ...f, profondeur: e.target.value }))} placeholder="prof. m" className="h-6 px-1 py-0.5 text-[10px]" />
                                                                            <Input value={prelevForm.quantite} onChange={(e) => setPrelevForm(f => ({ ...f, quantite: e.target.value }))} placeholder="qté" className="h-6 px-1 py-0.5 text-[10px]" />
                                                                            <div className="flex gap-1">
                                                                                <Button variant="primary" size="sm" onClick={() => handleCreatePrelevement(couche.uid)} disabled={createPrelevementPending}>Créer</Button>
                                                                                <Button variant="secondary" size="sm" onClick={() => { setPrelevCoucheId(null); setPrelevForm({ profondeur: '', quantite: '' }) }}>Annuler</Button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button type="button" onClick={() => setPrelevCoucheId(couche.uid)} className="text-left text-[10px] text-accent hover:underline">+ prél.</button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted max-w-[120px] truncate" title={couche.description_libre}>{couche.description_libre || '—'}</td>
                                                        <td className="px-1.5 py-1 text-center whitespace-nowrap">
                                                            <div className="flex gap-1 justify-center">
                                                                <Button variant="secondary" size="sm" onClick={() => { setEditingCoucheId(couche.uid); setCoucheField('__reset__', scBuildCoucheForm(couche)) }}>✎</Button>
                                                                <Button variant="danger" size="sm" onClick={() => handleDeleteCouche(couche.uid)}>✕</Button>
                                                            </div>
                                                        </td>
                                                    </>
                                                    )
                                                )}
                                            </tr>
                                            {shouldRenderInlineAfterSelection && String(couche?.uid) === newCoucheInsertAfterUid ? (
                                                <ScNewCoucheInlineRow
                                                    newCoucheRow={newCoucheRow}
                                                    setNewCoucheRow={setNewCoucheRow}
                                                    getOptions={getOptions}
                                                    onSave={(form) => effectiveHandleCreateCouche(form)}
                                                    saving={isSCFeuille && carotteCoupes.length ? updatePointPending : createCouchePending}
                                                    isSCFeuille={isSCFeuille}
                                                    showEmbeddedScPhoto={false}
                                                />
                                            ) : null}
                                            </Fragment>
                                        )
                                    })}
                                {/* Nouvelle ligne inline */}
                                {shouldRenderInlineAtBottom ? (
                                    <ScNewCoucheInlineRow
                                        newCoucheRow={newCoucheRow}
                                        setNewCoucheRow={setNewCoucheRow}
                                        getOptions={getOptions}
                                        onSave={(form) => effectiveHandleCreateCouche(form)}
                                        saving={isSCFeuille && carotteCoupes.length ? updatePointPending : createCouchePending}
                                        isSCFeuille={isSCFeuille}
                                        showEmbeddedScPhoto={showEmbeddedScPhoto}
                                    />
                                ) : null}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted text-center">
                        Aucune couche décrite. Cliquez sur "+ Couche" pour commencer.
                    </div>
                )}
                    </ScCard>
                </div>

                <ScCard title="Prélèvements hors couche" right={<span className="text-[11px] text-text-muted">{horsCouchePrelevements.length} prél.</span>}>
                    {horsCouchePrelevements.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                            {horsCouchePrelevements.map((prelevement) => (
                                <ScPrelevementManagerItem
                                    key={prelevement.uid}
                                    prelevement={prelevement}
                                    currentCoucheId={prelevement.sondage_couche_id}
                                    coucheOptions={coucheOptions}
                                    detailReturnTo={detailReturnTo}
                                    navigate={navigate}
                                    disabled={updatePrelevementPending}
                                    onMove={(prelevUid, targetCoucheUid) => handleUpdatePrelevement(prelevUid, { sondage_couche_id: targetCoucheUid, ignore_sondage_couche_match: false })}
                                    onToggleIgnore={(prelevUid, ignore) => handleUpdatePrelevement(prelevUid, { ignore_sondage_couche_match: ignore })}
                                    onDelete={handleDeletePrelevement}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-[13px] text-text-muted">Tous les prélèvements du point sont actuellement affectés à une couche.</div>
                    )}
                </ScCard>

                <ScCard title="Chaîne labo générée">
                    {scRenderChainLabo(chainPrelevements, detailReturnTo, navigate)}
                </ScCard>

                <ScCard title="Rapports liés">
                    {Array.isArray(data.rapports) && data.rapports.length > 0 ? (
                        <div className="flex flex-col gap-2">
                            {data.rapports.map((rapport) => (
                                <div key={rapport.uid} className="rounded-lg border border-border bg-bg px-3 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-[12px] font-semibold text-text">{rapport.reference}</div>
                                        <div className="text-[11px] text-text-muted">{formatDate(rapport.date_rapport) || '—'}</div>
                                    </div>
                                    <div className="mt-1 text-[12px] text-text-muted">{rapport.titre || rapport.type_rapport || 'Rapport'}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-[13px] text-text-muted">Aucun rapport lié.</div>
                    )}
                </ScCard>
            </div>
        </div>
    )
}


export { ScPointDetailView, ScSheetToolbar, scBuildPointForm, scBuildCoucheForm, scToPointPayload, scToCouchePayload, scBuildDefaultScCoupe }

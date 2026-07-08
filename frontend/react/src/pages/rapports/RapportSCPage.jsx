/**
 * FILE: RapportSCPage.jsx
 * EXPECTED PROJECT PATH: frontend/react/src/pages/rapports/RapportSCPage.jsx
 *
 * A4 report rendering page for SC core sample borehole logs.
 * The layout is intentionally self-contained because the SC report must reproduce
 * the historical Excel/PDF frame with fixed printable dimensions.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { essaisApi, feuillesTerrainApi } from '@/services/api'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportHeader from '@/components/rapports/RapportHeader'
import { useReportAutoPrint } from '@/lib/reportAutoPrint'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-sc.css'

const LABORATOIRE_RA = 'Région Rhône Alpes - 29-31 rue des Tâches - ZI Mi-Plaine - 69800 SAINT PRIEST'
const LOGO_SRC = '/assets/logos/nge-logo.png'
const DEFAULT_DOCUMENT_CODE = 'DG-Q / FS SO du 06/04/2011'

const DEFAULT_SIGNATURE = {
    name: 'Sylvain LHOPITAL',
    function: 'Chef de Section Laboratoire',
    visa: '',
}

const SC_PRIMARY_SCALE_CM = 50

const DEMO_REPORT = {
    identification: {
        scNumber: '1',
        chrono: 'RA L1EC',
        affaire: '',
        dateRedaction: '2022-08-01',
        chantier: 'Lyon - Avenue de Grande Bretagne',
        site: 'Avenue de Grande Bretagne',
        typeOuvrage: 'Avenue de Grande Bretagne',
        partieOuvrage: 'Quai Bus',
        documentReference: '',
        sondeur: 'Sylvain LHOPITAL',
        procedeSondage: 'Carotteuse sur remorque',
        diametreCouronne: '102 mm',
        dateSondage: '2022-08-01',
        profil: '',
        photoReference: '',
        arretSondage: '25,5 cm',
        arretSondageCm: 25.5,
    },
    laboratoire: LABORATOIRE_RA,
    coupes: [],
    comments: '',
    signature: DEFAULT_SIGNATURE,
    documentCode: DEFAULT_DOCUMENT_CODE,
    rows: [
        {
            id: 'row-1',
            zTopCm: 0,
            zBottomCm: 6,
            graphicKind: 'drainant',
            description: 'Enrobés\nType drainant\nLimite de percolation',
            density: '',
            voids: '',
            compacity: '',
        },
        {
            id: 'row-2',
            zTopCm: 6,
            zBottomCm: 15,
            graphicKind: 'enrobe014',
            description: 'Enrobés\nType 0/14',
            density: '',
            voids: '',
            compacity: '',
        },
        {
            id: 'row-3',
            zTopCm: 15,
            zBottomCm: 25.5,
            graphicKind: 'enrobe014',
            description: 'Enrobés\nType 0/14',
            density: '',
            voids: '',
            compacity: '',
        },
    ],
}

function valueOrEmpty(value) {
    if (value === null || value === undefined) return ''
    return String(value)
}

function firstValue(...values) {
    for (const value of values) {
        if (value !== null && value !== undefined && String(value).trim() !== '') {
            return value
        }
    }
    return ''
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(String(value).replace(',', '.').replace(/cm/gi, '').trim())
    return Number.isFinite(parsed) ? parsed : null
}

function formatFrenchNumber(value, digits = 1) {
    const numeric = parseNumber(value)
    if (numeric === null) return valueOrEmpty(value)
    return numeric.toLocaleString('fr-FR', {
        minimumFractionDigits: Number.isInteger(numeric) ? 0 : digits,
        maximumFractionDigits: digits,
    })
}

function formatDate(value) {
    if (!value) return ''
    const text = String(value)
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
        const [year, month, day] = text.slice(0, 10).split('-')
        return `${day}/${month}/${year}`
    }
    return text
}

function metersToCentimeters(value) {
    const numeric = parseNumber(value)
    if (numeric === null) return null
    return Number((numeric * 100).toFixed(1))
}

/** Profondeurs SC: z_haut/z_bas en mètres; champs *_cm ou zTopCm déjà en cm. */
function normalizeDepthToCm(value) {
    const numeric = parseNumber(value)
    if (numeric === null) return null
    if (Math.abs(numeric) <= 3 && !Number.isInteger(numeric)) {
        return metersToCentimeters(numeric)
    }
    return Number(numeric.toFixed(1))
}

function formatDepthLabel(value) {
    const numeric = parseNumber(value)
    if (numeric === null) return ''
    return `${formatFrenchNumber(numeric, 1)} cm`
}

function formatRulerDepth(depth) {
    const numeric = parseNumber(depth)
    if (numeric === null) return ''
    return numeric.toLocaleString('fr-FR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    })
}

function formatScReportNumber(scNumber) {
    const text = valueOrEmpty(scNumber).trim()
    if (!text) return ''
    if (/^SC/i.test(text)) return text
    return `SC${text}`
}

function extractCmFromText(value) {
    const text = valueOrEmpty(value)
    const match = text.match(/(-?\d+(?:[,.]\d+)?)\s*cm/i)
    if (!match) return null
    return parseNumber(match[1])
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

function percentFromDepth(value, maxDepth) {
    const numeric = parseNumber(value)
    if (numeric === null) return 0
    return clamp((numeric / Math.max(maxDepth, 1)) * 100, 0, 100)
}

function splitSiteLines(identification) {
    const chantier = valueOrEmpty(identification?.chantier).trim()
    const site = valueOrEmpty(identification?.site).trim()
    const base = chantier || site

    if (!base) return []

    if (base.includes(' - ')) {
        const [city, ...rest] = base.split(' - ')
        const location = rest.join(' - ')
        if (location.toLowerCase().includes('grande bretagne')) {
            return [city, 'Avenue de Grande', 'Bretagne']
        }
        return [city, location].filter(Boolean)
    }

    if (base.toLowerCase().includes('avenue de grande bretagne')) {
        return ['Lyon', 'Avenue de Grande', 'Bretagne']
    }

    return base.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 3)
}

function readLocalModelBaseSC() {
    if (typeof window === 'undefined' || !window.localStorage) return null

    try {
        const raw = window.localStorage.getItem('ralab5_modele_base_SC')
        if (!raw) return null

        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null

        return parsed
    } catch {
        return null
    }
}

function unwrapReportSource(source) {
    if (!source || typeof source !== 'object') return null

    const values = source.values && typeof source.values === 'object'
        ? source.values
        : source.payload && typeof source.payload === 'object'
            ? source.payload
            : null

    if (!values) return source

    return {
        ...source,
        ...values,
        meta: {
            ...(source.meta && typeof source.meta === 'object' ? source.meta : {}),
            ...(values.meta && typeof values.meta === 'object' ? values.meta : {}),
        },
        sourceEnvelope: source,
    }
}

function resolvePoint(source, searchParams) {
    const pointUid = String(searchParams?.get?.('point_uid') || searchParams?.get?.('point') || '').trim()
    const directPoint = source?.point || source?.data?.point || source?.feuille?.point || source?.selectedPoint || null
    if (directPoint) return directPoint

    const points = Array.isArray(source?.points) ? source.points : []
    if (!points.length) return null

    if (pointUid) {
        const matchedPoint = points.find((point) => String(point?.uid || point?.id || point?.point_code || '') === pointUid)
        if (matchedPoint) return matchedPoint
    }

    return points[0]
}

function resolvePhotoGalleryItems(galleryPayload) {
    if (!galleryPayload) return []
    if (Array.isArray(galleryPayload)) return galleryPayload
    if (Array.isArray(galleryPayload.photos)) return galleryPayload.photos
    if (Array.isArray(galleryPayload.items)) return galleryPayload.items
    if (galleryPayload.data && typeof galleryPayload.data === 'object') {
        return resolvePhotoGalleryItems(galleryPayload.data)
    }
    return []
}

function resolveEssaiIdForPhotos(point, routeEssaiId, searchParams) {
    const fromPoint = parseNumber(point?.source_essai_id)
    if (fromPoint !== null) return fromPoint

    const sourceFamily = String(searchParams?.get?.('source_family') || '').trim().toLowerCase()
    const sourceUid = String(searchParams?.get?.('source_uid') || '').trim()
    if (sourceFamily === 'essai' && sourceUid) {
        const fromSource = parseNumber(sourceUid)
        if (fromSource !== null) return fromSource
    }

    const route = String(routeEssaiId || '').trim()
    if (route && !['modele', 'view', 'new', 'demo'].includes(route.toLowerCase())) {
        const fromRoute = parseNumber(route)
        if (fromRoute !== null) return fromRoute
    }

    return null
}

function normalizePhotoUrl(url) {
    const text = String(url || '').trim()
    if (!text) return ''
    if (/^https?:\/\//i.test(text)) return text
    if (text.startsWith('/api/')) return text
    if (text.startsWith('/')) return text.startsWith('/api') ? text : `/api${text}`
    return `/api/${text.replace(/^\/+/, '')}`
}

function getPrimaryGalleryPhoto(photoGallery) {
    if (!Array.isArray(photoGallery) || !photoGallery.length) return null
    return photoGallery.find((item) => item?.is_primary) || photoGallery[0]
}

function findGalleryPhoto(photoGallery, storedName) {
    const key = String(storedName || '').trim()
    if (!key || !Array.isArray(photoGallery)) return null
    return photoGallery.find((item) => (
        String(item?.stored_name || '') === key
        || String(item?.filename || '') === key
        || String(item?.original_name || '') === key
    )) || null
}

function buildLegacyScPhotoUrl(photoContext = {}) {
    const { meta = {}, identification = {}, point = {} } = photoContext
    const affaire = String(firstValue(
        meta.affaire_nge_raw,
        meta.affaire_nge,
        meta.affaire_rst,
        identification.affaire,
        point.affaire,
    ) || '').trim()
    const photoNumber = String(firstValue(
        point.photo_number,
        meta.photo_number,
        identification.photoReference,
        identification.scNumber,
    ) || '').trim().replace(/^SC/i, '')
    if (!affaire || !photoNumber) return ''
    return `/api/photos/sc/${encodeURIComponent(affaire)}/${encodeURIComponent(photoNumber)}`
}

function listCarotteCoupes(point) {
    if (!Array.isArray(point?.carotte_coupes)) return []
    return point.carotte_coupes.filter((item) => item && typeof item === 'object')
}

function normalizeLayer(layer = {}, index = 0) {
    const zHautM = parseNumber(layer.z_haut)
    const zBasM = parseNumber(layer.z_bas)
    let zTopCm = null
    let zBottomCm = null

    if (zHautM !== null && zBasM !== null && zBasM >= zHautM && zBasM <= 5) {
        zTopCm = metersToCentimeters(zHautM)
        zBottomCm = metersToCentimeters(zBasM)
    }

    if (zTopCm === null) {
        zTopCm = normalizeDepthToCm(firstValue(layer.zTopCm, layer.z_haut_cm, layer.depth_start_cm, layer.z_top_cm, layer.depth_start_m))
    }
    if (zBottomCm === null) {
        zBottomCm = normalizeDepthToCm(firstValue(layer.zBottomCm, layer.z_bas_cm, layer.depth_end_cm, layer.z_bottom_cm, layer.depth_end_m))
    }

    const description = firstValue(
        layer.description_libre,
        layer.description,
        layer.description_visuelle,
        layer.identification_visuelle,
        layer.nature,
        layer.material,
        layer.commentaire,
        layer.notes,
    )

    return {
        id: String(firstValue(layer.uid, layer.id, `row-${index + 1}`)),
        zTopCm: zTopCm ?? '',
        zBottomCm: zBottomCm ?? '',
        graphicKind: inferGraphicKind(description, layer),
        description,
        density: firstValue(layer.d, layer.density, layer.masse_volumique, layer.masseVolumique),
        voids: firstValue(layer.vide, layer.voids, layer.pourcentage_vide, layer.pourcentageVides),
        compacity: firstValue(layer.compacite, layer.compacity),
    }
}

function normalizeRowsFromLayers(rawRows, fallbackRows = []) {
    const layers = Array.isArray(rawRows) && rawRows.length ? rawRows : (Array.isArray(fallbackRows) ? fallbackRows : [])
    if (!layers.length) return []

    return layers
        .map((row, index) => normalizeLayer(row, index))
        .sort((left, right) => {
            const leftDepth = parseNumber(left.zTopCm) ?? 0
            const rightDepth = parseNumber(right.zTopCm) ?? 0
            return leftDepth - rightDepth
        })
}

function resolveCoupePhotoUrl(coupe, point, photoGallery, coupeIndex = 0, photoContext = {}) {
    const coupesCount = listCarotteCoupes(point).length
    const isPrimaryCoupe = coupeIndex === 0 || coupesCount <= 1

    const storedName = String(coupe?.photo_stored_name || '').trim()
    if (storedName) {
        const matched = findGalleryPhoto(photoGallery, storedName)
        if (matched?.url) return normalizePhotoUrl(matched.url)
    }

    const directPhoto = String(firstValue(coupe?.photo_url, coupe?.photoUrl) || '').trim()
    if (directPhoto) return normalizePhotoUrl(directPhoto)

    if (isPrimaryCoupe) {
        const pointStoredName = String(point?.photo_stored_name || '').trim()
        if (pointStoredName) {
            const matchedPointPhoto = findGalleryPhoto(photoGallery, pointStoredName)
            if (matchedPointPhoto?.url) return normalizePhotoUrl(matchedPointPhoto.url)
        }

        const pointPhoto = String(firstValue(point?.photo_url, point?.photoUrl) || '').trim()
        if (pointPhoto) return normalizePhotoUrl(pointPhoto)

        const primaryGalleryPhoto = getPrimaryGalleryPhoto(photoGallery)
        if (primaryGalleryPhoto?.url) return normalizePhotoUrl(primaryGalleryPhoto.url)

        const legacyPhoto = buildLegacyScPhotoUrl({ ...photoContext, point })
        if (legacyPhoto) return legacyPhoto
    }

    return ''
}

function normalizeCoupeReport(coupe, index, point, pointCouches, photoGallery, photoContext) {
    const coupeLayers = Array.isArray(coupe?.couches) && coupe.couches.length ? coupe.couches : []
    const fallbackLayers = index === 0 ? pointCouches : []
    const rows = normalizeRowsFromLayers(coupeLayers, fallbackLayers)
    const depthEndCm = parseNumber(normalizeDepthToCm(firstValue(coupe?.depth_end_cm, coupe?.depth_end_m)))
    const depthStartCm = parseNumber(normalizeDepthToCm(firstValue(coupe?.depth_start_cm, coupe?.depth_start_m)))
    const maxRowDepth = rows.reduce((maximum, row) => Math.max(maximum, parseNumber(row.zBottomCm) ?? 0), 0)

    return {
        id: String(firstValue(coupe?.id, coupe?.uid, `coupe-${index + 1}`)),
        title: String(firstValue(coupe?.title, `Coupe ${index + 1}`)),
        notes: String(coupe?.notes || ''),
        depthStartCm,
        depthEndCm: depthEndCm ?? (maxRowDepth || null),
        photoUrl: resolveCoupePhotoUrl(coupe, point, photoGallery, index, photoContext),
        rows,
    }
}

function buildCoupesFromPoint(point, photoGallery, photoContext = {}) {
    const pointCouches = Array.isArray(point?.couches) ? point.couches : []
    const rawCoupes = listCarotteCoupes(point)

    if (!rawCoupes.length) {
        const rows = normalizeRowsFromLayers(pointCouches, DEMO_REPORT.rows)
        return [{
            id: 'coupe-1',
            title: 'Coupe 1',
            notes: '',
            depthStartCm: null,
            depthEndCm: rows.reduce((maximum, row) => Math.max(maximum, parseNumber(row.zBottomCm) ?? 0), 0) || null,
            photoUrl: resolveCoupePhotoUrl(point, point, photoGallery, 0, photoContext),
            rows: rows.length ? rows : DEMO_REPORT.rows,
        }]
    }

    return rawCoupes.map((coupe, index) => normalizeCoupeReport(coupe, index, point, pointCouches, photoGallery, photoContext))
}

function buildReportFromSource(source, essaiId, searchParams, photoGallery = []) {
    const normalizedSource = unwrapReportSource(source) || {}
    const meta = normalizedSource?.meta || normalizedSource?.metadata || normalizedSource?.data?.meta || normalizedSource?.point?.meta || {}
    const point = resolvePoint(normalizedSource, searchParams) || {}
    const identificationDraft = {
        scNumber: firstValue(normalizedSource?.scNumber, normalizedSource?.sc_number, meta.photo_number, meta.sc_number, point.point_code, point.reference, point.numero, essaiId, DEMO_REPORT.identification.scNumber),
        affaire: firstValue(normalizedSource?.affaire, normalizedSource?.affaire_rst, normalizedSource?.affaire_nge, meta.affaire_rst, meta.affaire_nge_raw, meta.affaire_nge, DEMO_REPORT.identification.affaire),
        photoReference: firstValue(meta.photo_reference, normalizedSource?.photo_reference, point.photo_reference, point.photo_number, ''),
    }
    const photoContext = { meta, identification: identificationDraft, point }
    const coupes = buildCoupesFromPoint(point, photoGallery, photoContext)
    const primaryCoupe = coupes[0] || {
        id: 'coupe-1',
        title: 'Coupe 1',
        notes: '',
        depthStartCm: null,
        depthEndCm: null,
        photoUrl: '',
        rows: DEMO_REPORT.rows,
    }
    const supplementaryCoupes = coupes.slice(1)
    const primaryCoupeDepthEnd = parseNumber(primaryCoupe.depthEndCm)
        ?? primaryCoupe.rows.reduce((maximum, row) => Math.max(maximum, parseNumber(row.zBottomCm) ?? 0), 0)
    const chantier = firstValue(
        normalizedSource?.chantier,
        normalizedSource?.label,
        meta.chantier,
        point.chantier,
        DEMO_REPORT.identification.chantier,
    )
    const arretText = firstValue(
        meta.arret_sondage,
        normalizedSource?.arret_sondage,
        point.arret_sondage,
        point.profondeur_finale_cm ? `${point.profondeur_finale_cm} cm` : '',
        primaryCoupeDepthEnd ? `${primaryCoupeDepthEnd} cm` : '',
        DEMO_REPORT.identification.arretSondage,
    )
    const arretCm = firstValue(
        meta.arret_sondage_cm,
        normalizedSource?.arret_sondage_cm,
        point.profondeur_finale_cm,
        point.profondeur_finale_m != null ? normalizeDepthToCm(point.profondeur_finale_m) : '',
        primaryCoupeDepthEnd,
        extractCmFromText(arretText),
        DEMO_REPORT.identification.arretSondageCm,
    )

    return {
        identification: {
            scNumber: firstValue(normalizedSource?.scNumber, normalizedSource?.sc_number, meta.photo_number, meta.sc_number, point.point_code, point.reference, point.numero, essaiId, DEMO_REPORT.identification.scNumber),
            chrono: firstValue(normalizedSource?.chrono, normalizedSource?.reference, meta.chrono, meta.chrono_raw, point.chrono, DEMO_REPORT.identification.chrono),
            affaire: firstValue(normalizedSource?.affaire, normalizedSource?.affaire_rst, normalizedSource?.affaire_nge, meta.affaire_rst, meta.affaire_nge_raw, meta.affaire_nge, DEMO_REPORT.identification.affaire),
            dateRedaction: firstValue(normalizedSource?.dateRedaction, normalizedSource?.date_redaction, meta.date_redaction, DEMO_REPORT.identification.dateRedaction),
            chantier,
            site: firstValue(normalizedSource?.site, meta.site, point.site, DEMO_REPORT.identification.site),
            typeOuvrage: firstValue(meta.type_ouvrage, point.type_ouvrage, normalizedSource?.type_ouvrage, DEMO_REPORT.identification.typeOuvrage),
            partieOuvrage: firstValue(meta.partie_ouvrage, point.partie_ouvrage, normalizedSource?.partie_ouvrage, DEMO_REPORT.identification.partieOuvrage),
            documentReference: firstValue(meta.document_reference, meta.documentReference, normalizedSource?.documentReference, normalizedSource?.document_reference, ''),
            sondeur: firstValue(meta.sondeur, normalizedSource?.sondeur, point.sondeur, DEMO_REPORT.identification.sondeur),
            procedeSondage: firstValue(meta.procede, meta.procede_sondage, normalizedSource?.procede, point.procede, DEMO_REPORT.identification.procedeSondage),
            diametreCouronne: firstValue(meta.diametre, meta.diametre_couronne, normalizedSource?.diametre, point.diametre, DEMO_REPORT.identification.diametreCouronne),
            dateSondage: firstValue(point.date_sondage, meta.date_sondage, normalizedSource?.date_sondage, DEMO_REPORT.identification.dateSondage),
            profil: firstValue(point.profil, meta.profil, meta.profil_numero, normalizedSource?.profil, ''),
            photoReference: firstValue(meta.photo_reference, normalizedSource?.photo_reference, point.photo_reference, point.photo_number, ''),
            arretSondage: formatDepthLabel(arretCm) || arretText,
            arretSondageCm: parseNumber(arretCm) ?? DEMO_REPORT.identification.arretSondageCm,
        },
        laboratoire: firstValue(normalizedSource?.laboratoire, meta.laboratoire, LABORATOIRE_RA),
        coupes,
        primaryCoupe,
        supplementaryCoupes,
        rows: primaryCoupe.rows,
        comments: firstValue(normalizedSource?.comments, normalizedSource?.commentaires, meta.commentaires, point.commentaires, point.notes, ''),
        signature: {
            name: firstValue(normalizedSource?.signature?.name, normalizedSource?.signataire_nom, meta.signataire_nom, DEFAULT_SIGNATURE.name),
            function: firstValue(normalizedSource?.signature?.function, normalizedSource?.signataire_fonction, meta.signataire_fonction, DEFAULT_SIGNATURE.function),
            visa: firstValue(normalizedSource?.signature?.visa, normalizedSource?.visa, meta.visa, DEFAULT_SIGNATURE.visa),
        },
        documentCode: firstValue(normalizedSource?.documentCode, normalizedSource?.document_code, meta.document_code, DEFAULT_DOCUMENT_CODE),
    }
}

function resolveFeuilleIdForPhotos(searchParams) {
    const sourceFamily = String(searchParams?.get?.('source_family') || '').trim().toLowerCase()
    const sourceUid = String(searchParams?.get?.('source_uid') || searchParams?.get?.('feuille_uid') || '').trim()
    if (sourceFamily === 'terrain' && sourceUid) {
        const parsed = parseNumber(sourceUid)
        if (parsed !== null) return parsed
    }
    return null
}

function usePhotoGallery(point, routeEssaiId, searchParams) {
    const [items, setItems] = useState([])
    const resolvedEssaiId = useMemo(
        () => resolveEssaiIdForPhotos(point, routeEssaiId, searchParams),
        [point, routeEssaiId, searchParams],
    )
    const resolvedFeuilleId = useMemo(
        () => resolveFeuilleIdForPhotos(searchParams),
        [searchParams],
    )

    useEffect(() => {
        let isCancelled = false

        async function loadGallery() {
            if (resolvedFeuilleId !== null) {
                try {
                    const payload = await feuillesTerrainApi.listFeuillePhotos(resolvedFeuilleId)
                    if (!isCancelled) setItems(resolvePhotoGalleryItems(payload))
                } catch {
                    if (!isCancelled) setItems([])
                }
                return
            }

            if (resolvedEssaiId === null) {
                if (!isCancelled) setItems([])
                return
            }

            try {
                const payload = await feuillesTerrainApi.listEssaiPhotos(resolvedEssaiId)
                if (!isCancelled) setItems(resolvePhotoGalleryItems(payload))
            } catch {
                if (!isCancelled) setItems([])
            }
        }

        loadGallery()

        return () => {
            isCancelled = true
        }
    }, [resolvedEssaiId, resolvedFeuilleId])

    return items
}

function useReportSource(essaiId, searchParams) {
    const [state, setState] = useState({ loading: false, error: '', source: null })
    const mode = searchParams.get('mode') || ''
    const modeleBase = String(searchParams.get('modele_base') || '').trim().toUpperCase()
    const sourceFamily = String(searchParams.get('source_family') || '').trim().toLowerCase()
    const sourceUid = String(searchParams.get('source_uid') || '').trim()

    useEffect(() => {
        const localModelBase = readLocalModelBaseSC()
        const terrainPair = sourceFamily === 'terrain' && String(sourceUid || '').trim()
        const essaiPair = sourceFamily === 'essai' && String(sourceUid || '').trim()
        const pathEssaiId = String(essaiId || '').trim()
        const pathEssaiResolved = pathEssaiId && !['modele', 'view', 'new'].includes(pathEssaiId)

        if (mode === 'demo' || modeleBase === 'SC') {
            setState({ loading: false, error: '', source: localModelBase })
            return undefined
        }

        if (!terrainPair && !essaiPair && !pathEssaiResolved) {
            setState({ loading: false, error: '', source: localModelBase })
            return undefined
        }

        let isCancelled = false
        setState({ loading: true, error: '', source: localModelBase })

        const request = terrainPair
            ? feuillesTerrainApi.get(sourceUid)
            : essaiPair
                ? essaisApi.get(sourceUid)
                : essaisApi.get(essaiId)

        request
            .then((payload) => {
                if (isCancelled) return
                setState({ loading: false, error: '', source: payload })
            })
            .catch(() => {
                if (isCancelled) return
                setState({
                    loading: false,
                    error: localModelBase ? 'Données réelles non disponibles, affichage du modèle SC local.' : 'Données réelles non disponibles, affichage du modèle SC provisoire.',
                    source: localModelBase,
                })
            })

        return () => {
            isCancelled = true
        }
    }, [essaiId, mode, modeleBase, sourceFamily, sourceUid])

    return state
}


function resolveCoupeMaxLayerDepth(rows, depthEndCm) {
    const fromRows = (rows || []).reduce((maximum, row) => Math.max(maximum, parseNumber(row.zBottomCm) ?? 0), 0)
    const fromCoupe = parseNumber(depthEndCm) ?? 0
    return Math.max(fromRows, fromCoupe, 0)
}

/** Echelle fixe du rapport SC: toujours 0–50 cm (modele NGE), toutes coupes confondues. */
function computeReportMaxDepth() {
    return SC_PRIMARY_SCALE_CM
}

/** @deprecated Utiliser computeReportMaxDepth pour garder la meme echelle sur toutes les coupes. */
function computePrimaryMaxDepth(rows, depthEndCm) {
    return computeReportMaxDepth([{ rows, depthEndCm }], depthEndCm)
}

/** Hauteur utile du corps de tableau (hors en-tetes), en mm. */
const SC_RESULTS_BODY_MM = 136
const SC_TABLE_TOTAL_MM = 154
const SC_TABLE_HEAD_MM = 12.5
const SC_TABLE_HEAD_PCT = (SC_TABLE_HEAD_MM / SC_TABLE_TOTAL_MM) * 100

function tableBodyPercentFromDepth(depthCm, maxDepth) {
    const depth = parseNumber(depthCm)
    const scale = parseNumber(maxDepth) ?? 1
    if (depth === null || scale <= 0) return SC_TABLE_HEAD_PCT
    const bodyPct = percentFromDepth(depth, scale)
    return SC_TABLE_HEAD_PCT + (bodyPct * (100 - SC_TABLE_HEAD_PCT)) / 100
}

function collectInternalBoundaryDepths(rows, maxDepth, excludeDepthCm = null) {
    const exclude = parseNumber(excludeDepthCm)
    return (rows || [])
        .map((row) => parseNumber(row.zBottomCm))
        .filter((depth) => depth !== null && depth > 0 && depth < maxDepth)
        .filter((depth) => exclude === null || Math.abs(depth - exclude) > 0.05)
        .filter((depth, index, array) => array.indexOf(depth) === index)
        .sort((left, right) => left - right)
}

function inferGraphicKind(description, layer = {}) {
    const explicit = String(firstValue(layer.graphicKind, layer.type_enrobe, layer.coupe_graphique) || '')
        .replace(/[^a-z0-9_-]/gi, '')
        .toLowerCase()
    if (explicit && explicit !== 'standard') return explicit

    const text = String(description || '').toLowerCase()
    if (text.includes('drainant') || text.includes('percolation')) return 'drainant'
    if (text.includes('0/14') || text.includes('0-14') || text.includes('0 14')) return 'enrobe014'
    if (text.includes('0/10') || text.includes('0-10')) return 'enrobe010'
    if (text.includes('0/20') || text.includes('0-20')) return 'enrobe020'
    if (text.includes('béton') || text.includes('beton')) return 'beton'
    if (text.includes('grave')) return 'grave'
    return 'standard'
}

/** @deprecated Utiliser computeReportMaxDepth pour garder la meme echelle sur toutes les coupes. */
function computeCoupeMaxDepth(rows, depthEndCm) {
    return computeReportMaxDepth([{ rows, depthEndCm }], depthEndCm)
}

const SC_PRINT_STYLES = `
.rapport-sc-page .rapport-document-footer {
    display: none;
}

.rapport-sc-page-indicator {
    flex-shrink: 0;
    margin: 0;
    text-align: right;
    font-size: 7px;
    font-weight: 700;
}

.rapport-sc-comments-final {
    display: grid;
    grid-template-columns: 1fr 67mm;
    gap: 0;
    width: 100%;
    margin-top: 0;
    border: 0.25mm solid #000;
    box-sizing: border-box;
}

.rapport-sc-comments-box {
    border: 0;
    padding: 2mm 4mm;
    min-height: 28mm;
    box-sizing: border-box;
}

.rapport-sc-comments-box h2 {
    margin: 0 0 2mm;
    font-size: 8.5px;
    font-weight: 700;
}

.rapport-sc-comments-box h2 span {
    text-decoration: underline;
}

.rapport-sc-signature-grid {
    display: grid;
    grid-template-columns: 17mm 1fr;
    box-sizing: border-box;
    border: 0;
    font-size: 7.5px;
}

.rapport-sc-signature-grid > span,
.rapport-sc-signature-grid > strong {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 9mm;
    padding: 1mm;
    box-sizing: border-box;
    border-right: 0.25mm solid #000;
    border-bottom: 0.25mm solid #000;
    text-align: center;
}

.rapport-sc-signature-grid > span:nth-child(2n),
.rapport-sc-signature-grid > strong:nth-child(2n) {
    border-right: none;
}

.rapport-sc-signature-grid > span:nth-last-child(-n + 2),
.rapport-sc-signature-grid > strong:nth-last-child(-n + 2) {
    border-bottom: none;
}

.rapport-sc-signature-grid span {
    font-weight: 700;
    text-decoration: underline;
}

.rapport-sc-signature-visa {
    font-size: 6.2px;
    line-height: 1.1;
    word-break: break-word;
}

.rapport-sc-results-table-wrap {
    position: relative;
    min-width: 0;
    height: var(--sc-table-total-mm, 154mm);
}

.rapport-sc-stack-cell {
    position: relative;
    height: 136mm;
}

.rapport-sc-description-stack,
.rapport-sc-lab-stack {
    position: relative;
    width: 100%;
    height: 136mm;
}

.rapport-sc-description-layer {
    position: absolute;
    left: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5mm 1.8mm;
    text-align: center;
    font-weight: 700;
    white-space: pre-line;
    font-size: 7px;
    line-height: 1.15;
}

.rapport-sc-lab-value {
    position: absolute;
    left: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 6.8px;
}

.rapport-sc-arret-overlay {
    position: absolute;
    top: 12.5mm;
    right: 0;
    left: 0;
    height: 136mm;
    pointer-events: none;
    z-index: 4;
}

.rapport-sc-arret-line {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 0.3mm solid #000;
}

.rapport-sc-arret-line span {
    position: absolute;
    top: 0.8mm;
    right: 4mm;
    background: #fff;
    padding: 0 1mm;
    font-size: 7px;
    font-weight: 700;
    white-space: nowrap;
}

.rapport-sc-internal-borders-overlay {
    position: absolute;
    top: 12.5mm;
    right: 0;
    left: 0;
    height: 136mm;
    pointer-events: none;
    z-index: 5;
}

.rapport-sc-internal-border {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 0.25mm solid #000;
}

.rapport-sc-results-table thead tr:first-child th {
    height: 5mm;
}

.rapport-sc-results-table thead tr:last-child th {
    height: 7.5mm;
}

.rapport-sc-supplementary-notes {
    margin: 0 0 1mm;
    font-size: 7px;
    white-space: pre-line;
}

@media print {
    .rapport-sc-paper-stack .rapport-sc-page {
        margin: 0 !important;
        box-shadow: none !important;
    }

    .rapport-sc-paper-stack .rapport-sc-page:not(:last-child) {
        page-break-after: always;
    }

    .rapport-sc-page-continued {
        page-break-before: always;
    }
}
`

function buildDepthMarkers(maxDepth) {
    const markers = [0]
    const limit = Math.max(parseNumber(maxDepth) ?? 0, 5)

    for (let depth = 5; depth <= limit; depth += 5) {
        markers.push(depth)
    }

    return markers
}

function buildDepthScaleTicks(maxDepth, majorOnly = true) {
    const limit = Math.max(parseNumber(maxDepth) ?? 0, 5)
    const major = buildDepthMarkers(limit)

    if (majorOnly) {
        return { major, minor: [], half: [], limit }
    }

    const minor = []
    const half = []

    for (let depth = 1; depth < limit; depth += 1) {
        if (depth % 5 !== 0) minor.push(depth)
    }

    for (let depth = 2.5; depth < limit; depth += 5) {
        half.push(depth)
    }

    return { major, minor, half, limit }
}

function depthToSvgY(depthCm, maxDepth) {
    const depth = parseNumber(depthCm) ?? 0
    const scale = Math.max(parseNumber(maxDepth) ?? 1, 1)
    return clamp((depth / scale) * SC_RESULTS_BODY_MM, 0, SC_RESULTS_BODY_MM)
}

function ScInfoLine({ label, value }) {
    return (
        <div className="rapport-sc-info-line">
            <span>{label}</span>
            <strong>{valueOrEmpty(value)}</strong>
        </div>
    )
}

function ScSectionTitle({ number, title, inBlock = false }) {
    return (
        <div className={`rapport-sc-section-title${inBlock ? ' rapport-sc-section-title-in-block' : ''}`}>
            <span>{number} -</span>
            <strong>{title}</strong>
        </div>
    )
}

function ScGraphicLayers({ rows, maxDepth }) {
    return (
        <>
            {rows.map((row) => {
                const top = percentFromDepth(row.zTopCm, maxDepth)
                const bottom = percentFromDepth(row.zBottomCm, maxDepth)
                const height = Math.max(bottom - top, 0.4)
                const kind = String(row.graphicKind || 'standard').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'standard'

                return (
                    <div
                        key={row.id}
                        className={`rapport-sc-graphic-layer rapport-sc-graphic-${kind}`}
                        style={{ top: `${top}%`, height: `${height}%` }}
                    />
                )
            })}
        </>
    )
}

function ScDepthScale({ maxDepth }) {
    return (
        <div className="rapport-sc-depth-scale">
            <div className="rapport-sc-depth-title">
                Profondeur
                <br />
                (cm)
            </div>
            <ScDepthScaleBody maxDepth={maxDepth} />
        </div>
    )
}

function ScDepthScaleBody({ maxDepth }) {
    const { major, minor, half, limit } = buildDepthScaleTicks(maxDepth)
    const bodyMm = SC_RESULTS_BODY_MM
    const axisX = 20
    const svgWidth = 26

    return (
        <div className="rapport-sc-depth-body">
            <svg
                className="rapport-sc-depth-svg"
                viewBox={`0 0 ${svgWidth} ${bodyMm}`}
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <rect className="rapport-sc-depth-bg" x="0" y="0" width={svgWidth} height={bodyMm} />
                <line className="rapport-sc-depth-spine" x1={axisX} y1={0} x2={axisX} y2={bodyMm} />
                <line className="rapport-sc-depth-cap" x1={axisX - 2.2} y1={0} x2={axisX + 2.2} y2={0} />
                <line className="rapport-sc-depth-cap" x1={axisX - 2.2} y1={bodyMm} x2={axisX + 2.2} y2={bodyMm} />
                {minor.map((depth) => {
                    const y = depthToSvgY(depth, limit)
                    return (
                        <line
                            key={`minor-${depth}`}
                            className="rapport-sc-depth-svg-tick rapport-sc-depth-svg-tick-minor"
                            x1={17.2}
                            y1={y}
                            x2={axisX}
                            y2={y}
                        />
                    )
                })}
                {half.map((depth) => {
                    const y = depthToSvgY(depth, limit)
                    return (
                        <line
                            key={`half-${depth}`}
                            className="rapport-sc-depth-svg-tick rapport-sc-depth-svg-tick-half"
                            x1={14.2}
                            y1={y}
                            x2={axisX}
                            y2={y}
                        />
                    )
                })}
                {major.map((depth) => {
                    const y = depthToSvgY(depth, limit)
                    return (
                        <g key={`major-${depth}`}>
                            <line
                                className="rapport-sc-depth-svg-tick rapport-sc-depth-svg-tick-major"
                                x1={10.2}
                                y1={y}
                                x2={axisX}
                                y2={y}
                            />
                            <text
                                className="rapport-sc-depth-svg-label"
                                x={9.4}
                                y={y}
                                textAnchor="end"
                                dominantBaseline="middle"
                            >
                                {formatRulerDepth(depth)}
                            </text>
                        </g>
                    )
                })}
            </svg>
        </div>
    )
}

function ScInternalBordersOverlay({ rows, maxDepth, arretCm }) {
    const boundaries = collectInternalBoundaryDepths(rows, maxDepth, arretCm)

    return (
        <div className="rapport-sc-internal-borders-overlay" aria-hidden="true">
            {boundaries.map((depth) => (
                <div
                    key={`internal-border-${depth}`}
                    className="rapport-sc-internal-border"
                    style={{ top: `${percentFromDepth(depth, maxDepth)}%` }}
                />
            ))}
        </div>
    )
}

function computePhotoHeightMm(photoEndCm, maxDepth, fillColumn = false) {
    if (fillColumn) return SC_RESULTS_BODY_MM
    const end = parseNumber(photoEndCm)
    const scale = parseNumber(maxDepth) ?? SC_RESULTS_BODY_MM
    if (end === null || scale <= 0) return SC_RESULTS_BODY_MM
    const ratio = clamp(end / scale, 0.12, 1)
    return Number((ratio * SC_RESULTS_BODY_MM).toFixed(2))
}

function ScPhotoCell({ src, label, photoHeightMm }) {
    const [hasError, setHasError] = useState(false)
    const showImage = Boolean(src) && !hasError
    const heightMm = Math.max(photoHeightMm || SC_RESULTS_BODY_MM, 8)

    useEffect(() => {
        setHasError(false)
    }, [src])

    return (
        <div className="rapport-sc-photo-stack">
            {showImage ? (
                <div className="rapport-sc-photo-box" style={{ height: `${heightMm}mm` }}>
                    <img src={src} alt={label} onError={() => setHasError(true)} />
                </div>
            ) : (
                <div className="rapport-sc-photo-placeholder" style={{ height: `${heightMm}mm` }}>
                    {label}
                </div>
            )}
        </div>
    )
}

function ScResultsGrid({ primaryCoupe, maxDepth, arretSondageCm, fillPhotoColumn = false }) {
    const rows = primaryCoupe?.rows || []
    const primaryDepthEnd = parseNumber(primaryCoupe?.depthEndCm)
        ?? rows.reduce((maximum, row) => Math.max(maximum, parseNumber(row.zBottomCm) ?? 0), 0)
    const photoEndCm = parseNumber(arretSondageCm) ?? primaryDepthEnd ?? maxDepth
    const photoHeightMm = computePhotoHeightMm(photoEndCm, maxDepth, fillPhotoColumn)
    const photoLabel = valueOrEmpty(primaryCoupe?.title) || 'Photo'
    const arretCm = parseNumber(arretSondageCm)
    const arretTop = arretCm !== null && arretCm > 0 && arretCm <= maxDepth
        ? percentFromDepth(arretCm, maxDepth)
        : null

    const renderLabStack = (field) => (
        <div className="rapport-sc-lab-stack">
            {rows.map((row) => {
                const value = formatFrenchNumber(row[field], 1)
                if (!String(value || '').trim()) return null

                const top = percentFromDepth(row.zTopCm, maxDepth)
                const bottom = percentFromDepth(row.zBottomCm, maxDepth)
                const height = Math.max(bottom - top, 2.5)

                return (
                    <div
                        key={`${row.id}-${field}`}
                        className="rapport-sc-lab-value"
                        style={{ top: `${top}%`, height: `${height}%` }}
                    >
                        {value}
                    </div>
                )
            })}
        </div>
    )

    return (
        <div className="rapport-sc-results-quadro">
            <div className="rapport-sc-results-body">
                <ScDepthScale maxDepth={maxDepth} />

                <div className="rapport-sc-results-table-area">
                    <div className="rapport-sc-results-table-wrap">
                    <table className="rapport-sc-results-table rapport-sc-results-table--stack">
                        <colgroup>
                            <col className="rapport-sc-col-coupe" />
                            <col className="rapport-sc-col-description" />
                            <col className="rapport-sc-col-photo" />
                            <col className="rapport-sc-col-lab" />
                            <col className="rapport-sc-col-lab" />
                            <col className="rapport-sc-col-lab-wide" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th colSpan={2}>Identification visuelle</th>
                                <th rowSpan={2}>Photo</th>
                                <th colSpan={3}>Essais de laboratoire</th>
                            </tr>
                            <tr>
                                <th>
                                    Coupe
                                    <br />
                                    graphique
                                </th>
                                <th>
                                    Description
                                    <br />
                                    (nature, couleur, D, état...)
                                </th>
                                <th>d</th>
                                <th>
                                    %
                                    <br />
                                    vide
                                </th>
                                <th>
                                    Compacité
                                    <br />
                                    %
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="rapport-sc-graphic-td rapport-sc-stack-cell">
                                    <div className="rapport-sc-graphic-cell">
                                        <ScGraphicLayers rows={rows} maxDepth={maxDepth} />
                                    </div>
                                </td>
                                <td className="rapport-sc-description-td rapport-sc-stack-cell">
                                    <div className="rapport-sc-description-stack">
                                        {rows.map((row) => {
                                            const top = percentFromDepth(row.zTopCm, maxDepth)
                                            const bottom = percentFromDepth(row.zBottomCm, maxDepth)
                                            const height = Math.max(bottom - top, 2.5)

                                            return (
                                                <div
                                                    key={row.id}
                                                    className="rapport-sc-description-layer"
                                                    style={{ top: `${top}%`, height: `${height}%` }}
                                                >
                                                    {row.description}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </td>
                                <td className="rapport-sc-photo-td rapport-sc-stack-cell">
                                    <ScPhotoCell
                                        src={primaryCoupe?.photoUrl}
                                        label={photoLabel}
                                        photoHeightMm={photoHeightMm}
                                    />
                                </td>
                                <td className="rapport-sc-stack-cell">{renderLabStack('density')}</td>
                                <td className="rapport-sc-stack-cell">{renderLabStack('voids')}</td>
                                <td className="rapport-sc-stack-cell">{renderLabStack('compacity')}</td>
                            </tr>
                        </tbody>
                    </table>

                    <ScInternalBordersOverlay rows={rows} maxDepth={maxDepth} arretCm={arretCm} />

                    {arretTop !== null ? (
                        <div className="rapport-sc-arret-overlay">
                            <div className="rapport-sc-arret-line" style={{ top: `${arretTop}%` }}>
                                <span>Arrêt de sondage</span>
                            </div>
                        </div>
                    ) : null}
                    </div>
                </div>
            </div>
        </div>
    )
}

function ScResultsSection({
    title,
    primaryCoupe,
    maxDepth,
    arretSondageCm,
    notes = '',
    fillPhotoColumn = false,
}) {
    return (
        <section className="rapport-sc-results-block rapport-sc-characteristics-block rapport-sc-results-section">
            <ScSectionTitle number="2" title={title} inBlock />
            {notes ? <div className="rapport-sc-supplementary-notes">{notes}</div> : null}
            <ScResultsGrid
                primaryCoupe={primaryCoupe}
                maxDepth={maxDepth}
                arretSondageCm={arretSondageCm}
                fillPhotoColumn={fillPhotoColumn}
            />
        </section>
    )
}

function ScInfoLineSpacer() {
    return (
        <div className="rapport-sc-info-line rapport-sc-info-line-spacer" aria-hidden="true">
            <span>&nbsp;</span>
            <strong>&nbsp;</strong>
        </div>
    )
}

function ScCharacteristicsSection({ identification }) {
    return (
        <section className="rapport-sc-characteristics-block">
            <ScSectionTitle number="1" title="Caractéristiques" inBlock />
            <div className="rapport-sc-characteristics-grid">
                <div className="rapport-sc-characteristics-col">
                    <ScInfoLine label="Procédé de sondage :" value={identification.procedeSondage} />
                    <ScInfoLine label="Diamètre de couronne :" value={identification.diametreCouronne} />
                    <ScInfoLine label="Date de sondage :" value={formatDate(identification.dateSondage)} />
                    <ScInfoLineSpacer />
                    <ScInfoLine label="Arrêt de sondage :" value={identification.arretSondage} />
                </div>
                <div className="rapport-sc-characteristics-col">
                    <ScInfoLine label="Photo :" value={identification.photoReference} />
                    <ScInfoLineSpacer />
                    <ScInfoLine label="Profil n° :" value={identification.profil} />
                </div>
            </div>
        </section>
    )
}

function ScDocumentCode({ code }) {
    if (!code) return null
    return <aside className="rapport-sc-document-code">{code}</aside>
}

function ScCommentsFooter({ report }) {
    const signature = report.signature || DEFAULT_SIGNATURE

    return (
        <section className="rapport-sc-comments-final">
            <div className="rapport-sc-comments-box">
                <h2>
                    3/ <span>COMMENTAIRES</span>
                </h2>
                <div>{valueOrEmpty(report.comments)}</div>
            </div>
            <div className="rapport-sc-signature-grid">
                <span>Nom</span>
                <strong>{signature.name}</strong>
                <span>Fonction</span>
                <strong>{signature.function}</strong>
                <span>Visa</span>
                <strong className="rapport-sc-signature-visa">{signature.visa || report.documentCode || ''}</strong>
            </div>
        </section>
    )
}

function ScPrintPage({
    pageId,
    pageLabel,
    report,
    identification,
    documentCode,
    continued = false,
    children,
}) {
    const siteTitle = splitSiteLines(identification).join('\n') || identification.chantier || identification.site

    return (
        <main
            id={pageId}
            className={`rapport-page rapport-page-a4 rapport-sc-page${continued ? ' rapport-sc-page-continued' : ''}`}
        >
            <div className="rapport-sc-sheet">
                <div className="rapport-print-frame rapport-sc-frame">
                    <RapportHeader
                        logoSrc={LOGO_SRC}
                        reportTypeLabel="SC n°"
                        reportNumber={identification.scNumber}
                        affaireNumber={identification.affaire || identification.chrono}
                        editionDate={formatDate(identification.dateRedaction)}
                        siteTitle={siteTitle}
                        mainTitle="COMPTE RENDU D'ESSAIS"
                        subtitle="COUPE DE SONDAGE CAROTTE"
                        laboratory={report.laboratoire}
                    />

                    <section className="rapport-sc-content">
                        <div className="rapport-sc-project-row">
                            <div className="rapport-sc-project-main">
                                <ScInfoLine label="Type et nom de l'ouvrage :" value={identification.typeOuvrage} />
                                <ScInfoLine label="Partie de l'ouvrage :" value={identification.partieOuvrage} />
                            </div>
                            <div className="rapport-sc-project-side">
                                <ScInfoLine label="Document de référence :" value={identification.documentReference} />
                                <ScInfoLine label="Sondeur :" value={identification.sondeur} />
                            </div>
                        </div>

                        {pageLabel ? <div className="rapport-sc-page-indicator">{pageLabel}</div> : null}

                        <div className="rapport-sc-main-body">{children}</div>

                        <div className="rapport-sc-page-footer-zone">
                            <ScCommentsFooter report={report} />
                        </div>
                    </section>

                    <ScDocumentCode code={documentCode} />
                </div>
            </div>
        </main>
    )
}


function RapportSCPage() {
    const { essaiId = 'modele' } = useParams()
    const [searchParams] = useSearchParams()
    const isEmbed = String(searchParams.get('embed') || '').trim() === '1'
    const hideToolbar = String(searchParams.get('hide_toolbar') || '').trim() === '1'
    const { loading, error, source } = useReportSource(essaiId, searchParams)
    useReportAutoPrint(searchParams, !loading && !error)

    const point = useMemo(() => {
        const normalizedSource = unwrapReportSource(source) || {}
        return resolvePoint(normalizedSource, searchParams) || {}
    }, [source, searchParams])
    const photoGallery = usePhotoGallery(point, essaiId, searchParams)

    const report = useMemo(
        () => buildReportFromSource(source || DEMO_REPORT, essaiId, searchParams, photoGallery),
        [source, essaiId, searchParams, photoGallery],
    )
    const identification = report.identification
    const toolbarReference = identification?.chrono || identification?.scNumber || essaiId || ''
    const supplementaryCoupes = Array.isArray(report.supplementaryCoupes) ? report.supplementaryCoupes : []
    const totalPages = 1 + supplementaryCoupes.length
    const primaryCoupe = report.primaryCoupe
    const reportMaxDepth = SC_PRIMARY_SCALE_CM
    const primaryArretCm = parseNumber(identification?.arretSondageCm)
        ?? parseNumber(primaryCoupe?.depthEndCm)
        ?? reportMaxDepth

    return (
        <RapportPageShell
            embedded={isEmbed}
            hideToolbar={hideToolbar}
            toolbar={<RapportToolbar reportReference={toolbarReference} />}
        >
            <style>{SC_PRINT_STYLES}</style>
            <div className="rapport-sc-paper-stack">
                {loading ? <div className="rapport-sc-inline-alert">Chargement du rapport SC...</div> : null}
                {error ? <div className="rapport-sc-inline-alert rapport-sc-inline-alert-warning">{error}</div> : null}

                <ScPrintPage
                    pageId="rapport-sc-printable-1"
                    pageLabel={`Page 1/${totalPages}`}
                    report={report}
                    identification={identification}
                    documentCode={report.documentCode}
                >
                    <ScCharacteristicsSection identification={identification} />
                    <ScResultsSection
                        title="Résultats du sondage et des identifications"
                        primaryCoupe={primaryCoupe}
                        maxDepth={reportMaxDepth}
                        arretSondageCm={primaryArretCm}
                    />
                </ScPrintPage>

                {supplementaryCoupes.map((coupe, index) => {
                    const pageNumber = index + 2
                    const coupeArretCm = parseNumber(coupe.depthEndCm) ?? reportMaxDepth
                    const resultsTitle = `Résultats du sondage et des identifications — ${valueOrEmpty(coupe.title) || `Coupe ${pageNumber}`}`

                    return (
                        <ScPrintPage
                            key={coupe.id || `coupe-page-${pageNumber}`}
                            pageId={`rapport-sc-printable-${pageNumber}`}
                            pageLabel={`Page ${pageNumber}/${totalPages}`}
                            report={report}
                            identification={identification}
                            documentCode={report.documentCode}
                            continued
                        >
                            <ScCharacteristicsSection identification={identification} />
                            <ScResultsSection
                                title={resultsTitle}
                                primaryCoupe={coupe}
                                maxDepth={reportMaxDepth}
                                arretSondageCm={coupeArretCm}
                                notes={coupe.notes}
                            />
                        </ScPrintPage>
                    )
                })}
            </div>
        </RapportPageShell>
    )
}

export default RapportSCPage

/**
 * FILE: RapportSCPage.jsx
 * EXPECTED PROJECT PATH: frontend/react/src/pages/rapports/RapportSCPage.jsx
 * INTEGRATION NOTE: Path is based on the existing reports organisation used for DE.
 * If your real reports folder is different, replace the equivalent report page there.
 */

/**
 * RapportSCPage.jsx
 * A4 report rendering page for SC core sample borehole logs.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { essaisApi, feuillesTerrainApi } from '@/services/api'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportPageShell from "@/components/rapports/RapportPageShell";
import '@/styles/rapport-nge.css'
import '@/styles/rapport-sc.css'


const LABORATOIRE_RA = 'Région Rhône Auvergne - 29-31 rue des Tâches - ZI Mi-Plaine - 69800 SAINT PRIEST'
const DEFAULT_SIGNATURE = {
    name: 'Sylvain LHOPITAL',
    function: 'Chef de Section Laboratoire',
    visa: '',
}

const DEMO_REPORT = {
    identification: {
        scNumber: '1',
        chrono: 'RA L1EC',
        affaire: '2026-RA-0000',
        dateRedaction: '2026-04-29',
        chantier: 'Lyon - Avenue de Grande Bretagne',
        site: 'Avenue de Grande Bretagne',
        typeOuvrage: 'Avenue de Grande Bretagne',
        partieOuvrage: 'Quai Bus',
        documentReference: '',
        sondeur: 'Sylvain LHOPITAL',
        procedeSondage: 'Carotteuse sur remorque',
        diametreCouronne: '102 mm',
        dateSondage: '2026-04-29',
        profil: '',
        arretSondage: '25,5 cm',
    },
    laboratoire: LABORATOIRE_RA,
    photoUrl: '',
    materialLegend: ['Enrobé Type 0/4 mm', 'Enrobé Type 0/6 mm', 'Enrobé Type 0/10 mm', 'Enrobé Type 0/14 mm'],
    rows: [
        {
            id: 'row-1',
            zTopCm: 0,
            zBottomCm: 7.5,
            graphicKind: 'drainant',
            description: 'Enrobés\nType drainant\n\nLimite de percolation',
            density: '',
            voids: '',
            compacity: '',
        },
        {
            id: 'row-2',
            zTopCm: 7.5,
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
        {
            id: 'row-4',
            zTopCm: 25.5,
            zBottomCm: 50,
            graphicKind: 'arret',
            description: 'Arrêt de sondage',
            density: '',
            voids: '',
            compacity: '',
        },
    ],
    comments: '',
    signature: DEFAULT_SIGNATURE,
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
    const parsed = Number(String(value).replace(',', '.'))
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

function normalizeDepthToCm(value) {
    const numeric = parseNumber(value)
    if (numeric === null) return null
    if (Math.abs(numeric) <= 10) return Number((numeric * 100).toFixed(1))
    return Number(numeric.toFixed(1))
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

function resolveCoupe(source, point) {
    const directCoupe = source?.coupe || source?.data?.coupe || source?.activeCoupe || source?.carotte_coupe || null
    if (directCoupe) return directCoupe

    const sourceCoupes = Array.isArray(source?.carotte_coupes) ? source.carotte_coupes : []
    if (sourceCoupes.length) return sourceCoupes[0]

    const pointCoupes = Array.isArray(point?.carotte_coupes) ? point.carotte_coupes : []
    if (pointCoupes.length) return pointCoupes[0]

    return null
}

function normalizeLayer(layer = {}, index = 0) {
    const zTopCm = normalizeDepthToCm(firstValue(layer.z_haut_cm, layer.depth_start_cm, layer.z_top_cm, layer.z_haut, layer.depth_start_m))
    const zBottomCm = normalizeDepthToCm(firstValue(layer.z_bas_cm, layer.depth_end_cm, layer.z_bottom_cm, layer.z_bas, layer.depth_end_m))
    const description = firstValue(
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
        graphicKind: String(firstValue(layer.graphicKind, layer.type_enrobe, layer.coupe_graphique, 'standard')).toLowerCase(),
        description,
        density: firstValue(layer.d, layer.density, layer.masse_volumique, layer.masseVolumique),
        voids: firstValue(layer.vide, layer.voids, layer.pourcentage_vide, layer.pourcentageVides),
        compacity: firstValue(layer.compacite, layer.compacity),
    }
}

function normalizeRowsFromSource(source, searchParams) {
    const normalizedSource = unwrapReportSource(source) || {}
    const point = resolvePoint(normalizedSource, searchParams)
    const coupe = resolveCoupe(normalizedSource, point)
    const rawRows = firstValue(
        normalizedSource.rows,
        normalizedSource.couches,
        normalizedSource.layers,
        coupe?.couches,
        point?.couches,
        point?.carotte_couches,
    )

    if (!Array.isArray(rawRows) || rawRows.length === 0) return DEMO_REPORT.rows

    return rawRows
        .map((row, index) => normalizeLayer(row, index))
        .sort((left, right) => {
            const leftDepth = parseNumber(left.zTopCm) ?? 0
            const rightDepth = parseNumber(right.zTopCm) ?? 0
            return leftDepth - rightDepth
        })
}

function buildPhotoUrl(essaiId, source, point, coupe) {
    const directPhoto = firstValue(
        source?.photoUrl,
        source?.photo_url,
        source?.photo?.url,
        source?.selectedPhoto?.url,
        source?.activeCoupe?.photo_url,
        source?.activeCoupe?.photoUrl,
        coupe?.photo_url,
        coupe?.photoUrl,
        point?.photo_url,
        point?.photoUrl,
    )
    if (directPhoto) return directPhoto
    if (essaiId && essaiId !== 'modele' && essaiId !== 'new') return `/api/photos/essai/${encodeURIComponent(essaiId)}`
    return ''
}

function buildReportFromSource(source, essaiId, searchParams) {
    const normalizedSource = unwrapReportSource(source) || {}
    const meta = normalizedSource?.meta || normalizedSource?.metadata || normalizedSource?.data?.meta || normalizedSource?.point?.meta || {}
    const point = resolvePoint(normalizedSource, searchParams) || {}
    const coupe = resolveCoupe(normalizedSource, point) || {}
    const chantier = firstValue(
        normalizedSource?.chantier,
        normalizedSource?.label,
        normalizedSource?.site,
        meta.chantier,
        meta.site,
        point.chantier,
        point.site,
        DEMO_REPORT.identification.chantier,
    )

    return {
        identification: {
            scNumber: firstValue(normalizedSource?.scNumber, normalizedSource?.sc_number, meta.photo_number, meta.sc_number, point.point_code, point.reference, point.numero, essaiId, DEMO_REPORT.identification.scNumber),
            chrono: firstValue(normalizedSource?.chrono, normalizedSource?.reference, meta.chrono, meta.chrono_raw, point.chrono, DEMO_REPORT.identification.chrono),
            affaire: firstValue(normalizedSource?.affaire, normalizedSource?.affaire_rst, normalizedSource?.affaire_nge, meta.affaire_rst, meta.affaire_nge_raw, meta.affaire_nge, DEMO_REPORT.identification.affaire),
            dateRedaction: firstValue(normalizedSource?.dateRedaction, normalizedSource?.date_redaction, meta.date_redaction, new Date().toISOString().slice(0, 10)),
            chantier,
            site: firstValue(normalizedSource?.site, meta.site, point.site, chantier),
            typeOuvrage: firstValue(meta.type_ouvrage, point.type_ouvrage, normalizedSource?.type_ouvrage, DEMO_REPORT.identification.typeOuvrage),
            partieOuvrage: firstValue(meta.partie_ouvrage, point.partie_ouvrage, normalizedSource?.partie_ouvrage, DEMO_REPORT.identification.partieOuvrage),
            documentReference: firstValue(meta.document_reference, meta.documentReference, normalizedSource?.documentReference, normalizedSource?.document_reference, ''),
            sondeur: firstValue(meta.sondeur, normalizedSource?.sondeur, point.sondeur, DEMO_REPORT.identification.sondeur),
            procedeSondage: firstValue(meta.procede, meta.procede_sondage, normalizedSource?.procede, point.procede, DEMO_REPORT.identification.procedeSondage),
            diametreCouronne: firstValue(meta.diametre, meta.diametre_couronne, normalizedSource?.diametre, point.diametre, DEMO_REPORT.identification.diametreCouronne),
            dateSondage: firstValue(point.date_sondage, meta.date_sondage, normalizedSource?.date_sondage, DEMO_REPORT.identification.dateSondage),
            profil: firstValue(point.profil, meta.profil, meta.profil_numero, normalizedSource?.profil, ''),
            arretSondage: firstValue(meta.arret_sondage, normalizedSource?.arret_sondage, point.arret_sondage, point.profondeur_finale_cm ? `${point.profondeur_finale_cm} cm` : '', coupe.depth_end_cm ? `${coupe.depth_end_cm} cm` : DEMO_REPORT.identification.arretSondage),
        },
        laboratoire: firstValue(normalizedSource?.laboratoire, meta.laboratoire, LABORATOIRE_RA),
        photoUrl: buildPhotoUrl(essaiId, normalizedSource, point, coupe),
        materialLegend: Array.isArray(normalizedSource?.materialLegend) ? normalizedSource.materialLegend : DEMO_REPORT.materialLegend,
        rows: normalizeRowsFromSource(normalizedSource, searchParams),
        comments: firstValue(normalizedSource?.comments, normalizedSource?.commentaires, meta.commentaires, point.commentaires, point.notes, ''),
        signature: {
            name: firstValue(normalizedSource?.signature?.name, normalizedSource?.signataire_nom, meta.signataire_nom, DEFAULT_SIGNATURE.name),
            function: firstValue(normalizedSource?.signature?.function, normalizedSource?.signataire_fonction, meta.signataire_fonction, DEFAULT_SIGNATURE.function),
            visa: firstValue(normalizedSource?.signature?.visa, normalizedSource?.visa, meta.visa, DEFAULT_SIGNATURE.visa),
        },
    }
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

function InfoLine({ label, value }) {
    return (
        <div className="rapport-sc-info-line">
            <span>{label}</span>
            <strong>{valueOrEmpty(value)}</strong>
        </div>
    )
}

function SectionTitle({ number, title }) {
    return (
        <div className="rapport-section-title rapport-sc-section-title">
            <span>{number} -</span>
            <strong>{title}</strong>
        </div>
    )
}

function ScGraphicCell({ row, minDepth, maxDepth }) {
    const top = parseNumber(row.zTopCm)
    const bottom = parseNumber(row.zBottomCm)
    const range = Math.max(maxDepth - minDepth, 1)
    const topPct = top === null ? 0 : Math.max(0, Math.min(100, ((top - minDepth) / range) * 100))
    const heightPct = top === null || bottom === null ? 12 : Math.max(4, Math.min(100 - topPct, ((bottom - top) / range) * 100))
    const kind = row.graphicKind || 'standard'

    return (
        <div className="rapport-sc-graphic-cell">
            <div
                className={`rapport-sc-graphic-layer rapport-sc-graphic-${kind}`}
                style={{ top: `${topPct}%`, height: `${heightPct}%` }}
            />
        </div>
    )
}

function ScPhotoBlock({ report }) {
    const [photoError, setPhotoError] = useState(false)

    if (!report.photoUrl || photoError) {
        return (
            <div className="rapport-sc-photo-placeholder">
                <span>Photo</span>
            </div>
        )
    }

    return (
        <div className="rapport-sc-photo-box">
            <img src={report.photoUrl} alt="Carotte" onError={() => setPhotoError(true)} />
        </div>
    )
}

function ScResultsTable({ report }) {
    const rows = report.rows || []
    const depths = rows.flatMap((row) => [parseNumber(row.zTopCm), parseNumber(row.zBottomCm)]).filter((value) => value !== null)
    const minDepth = depths.length ? Math.min(...depths) : 0
    const maxDepth = depths.length ? Math.max(...depths) : 50
    const markerStep = maxDepth <= 30 ? 5 : 10
    const markers = []

    for (let marker = 0; marker <= Math.ceil(maxDepth / markerStep) * markerStep; marker += markerStep) {
        markers.push(marker)
    }

    return (
        <div className="rapport-sc-results-grid">
            <div className="rapport-sc-depth-scale">
                <div className="rapport-sc-depth-title">Profondeur<br />(cm)</div>
                <div className="rapport-sc-depth-body">
                    {markers.map((marker) => {
                        const top = ((marker - minDepth) / Math.max(maxDepth - minDepth, 1)) * 100
                        return (
                            <div key={marker} className="rapport-sc-depth-marker" style={{ top: `${Math.max(0, Math.min(100, top))}%` }}>
                                <span>{formatFrenchNumber(marker, 0)}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            <table className="rapport-sc-results-table">
                <colgroup>
                    <col className="rapport-sc-col-photo" />
                    <col className="rapport-sc-col-description" />
                    <col className="rapport-sc-col-lab" />
                    <col className="rapport-sc-col-lab" />
                    <col className="rapport-sc-col-lab-wide" />
                </colgroup>
                <thead>
                    <tr>
                        <th rowSpan="3">Photo carotte</th>
                        <th>Identification visuelle</th>
                        <th colSpan="3">Essais de laboratoire</th>
                    </tr>
                    <tr>
                        <th>Description</th>
                        <th>d</th>
                        <th>% vide</th>
                        <th>Compacité</th>
                    </tr>
                    <tr>
                        <th>(nature, couleur, D, état…)</th>
                        <th>%</th>
                        <th></th>
                        <th>%</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={row.id}>
                            {index === 0 ? (
                                <td className="rapport-sc-photo-td" rowSpan={Math.max(rows.length, 1)}><ScPhotoBlock report={report} /></td>
                            ) : null}
                            <td className="rapport-sc-description-td">{valueOrEmpty(row.description)}</td>
                            <td>{formatFrenchNumber(row.density, 1)}</td>
                            <td>{formatFrenchNumber(row.voids, 1)}</td>
                            <td>{formatFrenchNumber(row.compacity, 1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function MaterialLegend({ items }) {
    if (!Array.isArray(items) || items.length === 0) return null

    return (
        <div className="rapport-sc-material-legend">
            {items.map((item) => (
                <div key={item} className="rapport-sc-material-item">
                    <span className="rapport-sc-material-swatch" />
                    <span>{item}</span>
                </div>
            ))}
        </div>
    )
}

function RapportSCPage() {
    const { essaiId = 'modele' } = useParams()
    const [searchParams] = useSearchParams()
    const isEmbed = String(searchParams.get("embed") || "").trim() === "1"
    const { loading, error, source } = useReportSource(essaiId, searchParams)

    const report = useMemo(() => buildReportFromSource(source || DEMO_REPORT, essaiId, searchParams), [source, essaiId, searchParams])
    const identification = report.identification
    const toolbarReference = identification?.chrono || identification?.scNumber || essaiId || ""


    return (
        <RapportPageShell
            embedded={isEmbed}
            toolbar={<RapportToolbar reportReference={toolbarReference} />}
        >
            <div className="rapport-sc-paper-stack">
                {loading ? <div className="rapport-sc-inline-alert">Chargement du rapport SC…</div> : null}
                {error ? <div className="rapport-sc-inline-alert rapport-sc-inline-alert-warning">{error}</div> : null}

                <main className="rapport-page rapport-page-a4 rapport-sc-page" id="rapport-sc-printable">
                    <div className="rapport-print-frame rapport-sc-frame">
                    <RapportHeader
                        logoSrc="/assets/logos/nge-logo.png"
                        title="COMPTE RENDU D'ESSAIS"
                        subtitle="COUPE DE SONDAGE CAROTTE"
                        essaiCode="SC"
                        reportCode="SC"
                        reportNumber={identification.scNumber}
                        chrono={identification.chrono}
                        affaire={identification.affaire}
                        dateRedaction={formatDate(identification.dateRedaction)}
                        chantier={identification.chantier}
                        site={identification.site}
                        laboratoire={report.laboratoire}
                    />

                    <section className="rapport-sc-content">
                        <div className="rapport-sc-project-row">
                            <div className="rapport-sc-project-main">
                                <InfoLine label="Type et nom de l'ouvrage :" value={identification.typeOuvrage} />
                                <InfoLine label="Partie de l'ouvrage :" value={identification.partieOuvrage} />
                            </div>
                            <div className="rapport-sc-project-side">
                                <InfoLine label="Document de référence :" value={identification.documentReference} />
                                <InfoLine label="Sondeur :" value={identification.sondeur} />
                            </div>
                        </div>

                        <SectionTitle number="1" title="Caractéristiques" />

                        <div className="rapport-sc-characteristics-grid">
                            <InfoLine label="Procédé de sondage :" value={identification.procedeSondage} />
                            <InfoLine label="Photo :" value={identification.scNumber ? `SC n° ${identification.scNumber}` : ''} />
                            <InfoLine label="Diamètre de couronne :" value={identification.diametreCouronne} />
                            <InfoLine label="Profil n° :" value={identification.profil} />
                            <InfoLine label="Date de sondage :" value={formatDate(identification.dateSondage)} />
                            <InfoLine label="Arrêt de sondage :" value={identification.arretSondage} />
                        </div>

                        <SectionTitle number="2" title="Résultats du sondage et des identifications" />
                        <MaterialLegend items={report.materialLegend} />
                        <ScResultsTable report={report} />
                    </section>

                    <RapportConclusionBlock
                        conclusionTitle="3/ COMMENTAIRES"
                        showConformity={false}
                        comments={report.comments}
                        signature={report.signature}
                    />

                    <RapportFooter documentCode="CODE WBS / CODE DOCUMENT À DÉFINIR" />
                    </div>
                </main>
            </div>
        </RapportPageShell>
    )
}

export default RapportSCPage

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { feuillesTerrainApi, essaisApi } from '@/services/api'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-so.css'

const LABORATOIRE_RA = 'Région Rhône Auvergne - 29-31 rue des Tâches - ZI Mi-Plaine - 69800 SAINT PRIEST'
const DEFAULT_SIGNATURE = {
    name: 'Sylvain LHOPITAL',
    function: 'Chef de Section Laboratoire',
    visa: '',
}

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

function valueOrEmpty(value) {
    if (value === null || value === undefined) return ''
    return String(value)
}

function firstValue(...values) {
    for (const v of values) {
        if (v !== null && v !== undefined && String(v).trim() !== '') return v
    }
    return ''
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(String(value).replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
}

function formatFrenchNumber(value, digits = 1) {
    const n = parseNumber(value)
    if (n === null) return valueOrEmpty(value)
    return n.toLocaleString('fr-FR', {
        minimumFractionDigits: Number.isInteger(n) ? 0 : digits,
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

function resolvePoint(source, searchParams) {
    const pointUid = String(searchParams?.get?.('point_uid') || searchParams?.get?.('point') || '').trim()
    const directPoint = source?.point || source?.data?.point || source?.selectedPoint || null
    if (directPoint) return directPoint
    const points = Array.isArray(source?.points) ? source.points : []
    if (!points.length) return null
    if (pointUid) {
        const match = points.find((p) => String(p?.uid || p?.id || p?.point_code || '') === pointUid)
        if (match) return match
    }
    return points[0]
}

function normalizeCouches(source, point) {
    const raw = firstValue(
        point?.couches,
        source?.couches,
        source?.layers,
    )
    if (!Array.isArray(raw) || !raw.length) return []
    return raw
        .map((c, i) => ({
            id: String(c?.uid || c?.id || `couche-${i + 1}`),
            zHaut: parseNumber(c?.z_haut) ?? 0,
            zBas: parseNumber(c?.z_bas) ?? 0,
            texture: String(c?.texture_matrice || c?.texture || ''),
            proportion: String(c?.proportion_matrice || c?.proportion || ''),
            elements: String(c?.elements_grossiers || ''),
            structure: String(c?.structure || ''),
            matiereOrganique: String(c?.matiere_organique || ''),
            couleur: String(c?.couleur || ''),
            odeur: String(c?.odeur || ''),
            consistance: String(c?.consistance || ''),
            cohesion: String(c?.cohesion || ''),
            oxydoReduction: String(c?.oxydo_reduction || ''),
            eau: String(c?.eau_porosite || ''),
            profondeurEau: parseNumber(c?.profondeur_eau),
            horizon: String(c?.horizon || ''),
            description: String(c?.description || c?.commentaire || ''),
        }))
        .sort((a, b) => a.zHaut - b.zHaut)
}

function buildReportFromSource(source, searchParams) {
    const s = source && typeof source === 'object' ? source : {}
    const meta = s?.meta || s?.metadata || s?.payload?.meta || {}
    const point = resolvePoint(s, searchParams) || {}
    const couches = normalizeCouches(s, point)
    const chantier = firstValue(s?.chantier, s?.label, s?.site, meta?.chantier, meta?.site, point?.chantier, '')
    const profMax = couches.length
        ? Math.max(...couches.map((c) => c.zBas).filter((v) => v > 0))
        : parseNumber(point?.profondeur_finale_m) || 0

    return {
        identification: {
            soNumber: firstValue(point?.point_code, point?.reference, point?.numero, ''),
            chrono: firstValue(s?.chrono, s?.reference, meta?.chrono, ''),
            affaire: firstValue(s?.affaire, s?.affaire_rst, meta?.affaire_rst, meta?.affaire_nge, ''),
            dateRedaction: firstValue(meta?.date_redaction, new Date().toISOString().slice(0, 10)),
            chantier,
            site: firstValue(meta?.site, point?.site, chantier),
            typeOuvrage: firstValue(meta?.type_ouvrage, point?.type_ouvrage, ''),
            partieOuvrage: firstValue(meta?.partie_ouvrage, point?.partie_ouvrage, ''),
            sondeur: firstValue(meta?.sondeur, meta?.operateur, s?.operateur, point?.operateur, ''),
            procedeSondage: firstValue(point?.point_type, meta?.procede_sondage, meta?.procede, 'SONDAGE_PELLE'),
            dateSondage: firstValue(point?.date_point, meta?.date_sondage, meta?.date_essai, ''),
            profondeurFinale: profMax ? `${formatFrenchNumber(profMax, 1)} m` : '',
            arretSondage: firstValue(point?.arret_sondage, meta?.arret_sondage, ''),
            tenueF: firstValue(point?.tenue_fouilles, meta?.tenue_fouilles, ''),
            venueEau: point?.venue_eau ? 'Oui' : (point?.venue_eau === false ? 'Non' : ''),
            niveauNappe: firstValue(point?.niveau_nappe, meta?.niveau_nappe, ''),
        },
        laboratoire: firstValue(s?.laboratoire, meta?.laboratoire, LABORATOIRE_RA),
        couches,
        profMax,
        comments: firstValue(point?.notes, s?.commentaires, meta?.commentaires, ''),
        signature: {
            name: firstValue(meta?.signataire_nom, DEFAULT_SIGNATURE.name),
            function: firstValue(meta?.signataire_fonction, DEFAULT_SIGNATURE.function),
            visa: firstValue(meta?.visa, DEFAULT_SIGNATURE.visa),
        },
    }
}

function useReportSource(essaiId, searchParams) {
    const [state, setState] = useState({ loading: false, error: '', source: null })
    const sourceFamily = String(searchParams.get('source_family') || '').trim().toLowerCase()
    const sourceUid = String(searchParams.get('source_uid') || '').trim()

    useEffect(() => {
        const terrainPair = sourceFamily === 'terrain' && sourceUid
        const essaiPair = sourceFamily === 'essai' && sourceUid
        const pathId = String(essaiId || '').trim()
        const pathResolved = pathId && !['modele', 'view', 'new'].includes(pathId)

        if (!terrainPair && !essaiPair && !pathResolved) {
            setState({ loading: false, error: 'Aucune source sondage fournie.', source: null })
            return undefined
        }

        let cancelled = false
        setState({ loading: true, error: '', source: null })

        const request = terrainPair
            ? feuillesTerrainApi.get(sourceUid)
            : essaiPair
                ? essaisApi.get(sourceUid)
                : essaisApi.get(essaiId)

        request
            .then((payload) => {
                if (cancelled) return
                setState({ loading: false, error: '', source: payload })
            })
            .catch(() => {
                if (cancelled) return
                setState({ loading: false, error: 'Données sondage non disponibles.', source: null })
            })

        return () => { cancelled = true }
    }, [essaiId, sourceFamily, sourceUid])

    return state
}

function InfoLine({ label, value }) {
    return (
        <div className="rapport-so-info-line">
            <span>{label}</span>
            <strong>{valueOrEmpty(value)}</strong>
        </div>
    )
}

function SectionTitle({ number, title }) {
    return (
        <div className="rapport-section-title rapport-so-section-title">
            <span>{number} -</span>
            <strong>{title}</strong>
        </div>
    )
}

function CoupeGraphiqueSVG({ couches, profMax }) {
    const W = 100
    const SCALE = 80
    const TOP_MARGIN = 4
    const BOTTOM_MARGIN = 4
    const LEFT_SCALE = 26
    const BAR_W = 50
    const maxDepth = Math.max(profMax, 1)
    const totalH = TOP_MARGIN + SCALE * maxDepth + BOTTOM_MARGIN

    const toY = (depth) => TOP_MARGIN + (Number(depth) / maxDepth) * (SCALE * maxDepth)

    return (
        <svg width={W} height={totalH} xmlns="http://www.w3.org/2000/svg" className="rapport-so-coupe-svg">
            <defs>
                <pattern id="rso-argile" patternUnits="userSpaceOnUse" width="6" height="6">
                    <line x1="0" y1="6" x2="6" y2="0" stroke="#9b7b7b" strokeWidth="0.7"/>
                </pattern>
                <pattern id="rso-limon" patternUnits="userSpaceOnUse" width="6" height="6">
                    <circle cx="1.5" cy="1.5" r="0.8" fill="#8a7a50"/>
                    <circle cx="4.5" cy="4.5" r="0.8" fill="#8a7a50"/>
                </pattern>
                <pattern id="rso-sableux" patternUnits="userSpaceOnUse" width="8" height="8">
                    <circle cx="2" cy="2" r="1.2" fill="#c8a830"/>
                    <circle cx="6" cy="6" r="1.2" fill="#c8a830"/>
                </pattern>
                <pattern id="rso-argilo-sableux" patternUnits="userSpaceOnUse" width="8" height="8">
                    <line x1="0" y1="8" x2="8" y2="0" stroke="#9b7b5b" strokeWidth="0.8"/>
                    <circle cx="4" cy="4" r="0.8" fill="#c8a830"/>
                </pattern>
            </defs>

            <line x1={LEFT_SCALE} y1={TOP_MARGIN} x2={LEFT_SCALE} y2={TOP_MARGIN + SCALE * maxDepth} stroke="#374151" strokeWidth="1"/>

            {couches.map((c, i) => {
                const y1 = toY(c.zHaut)
                const y2 = toY(c.zBas)
                const h = Math.max(y2 - y1, 2)
                const tex = c.texture.toLowerCase()
                const cfg = TEXTURE_PATTERNS[tex] || { fill: '#e8e8e0', hatch: null }
                const patId = cfg.hatch ? `rso-${cfg.hatch}` : null
                return (
                    <g key={c.id}>
                        <rect x={LEFT_SCALE} y={y1} width={BAR_W} height={h} fill={cfg.fill} stroke="#374151" strokeWidth="0.5"/>
                        {patId && <rect x={LEFT_SCALE} y={y1} width={BAR_W} height={h} fill={`url(#${patId})`} opacity="0.6"/>}
                        {i === 0 && <text x={LEFT_SCALE - 2} y={y1 + 3} textAnchor="end" fontSize="7" fill="#374151">{c.zHaut}</text>}
                        <text x={LEFT_SCALE - 2} y={y2 + 3} textAnchor="end" fontSize="7" fill="#374151">{c.zBas}</text>
                        <line x1={LEFT_SCALE} y1={y2} x2={LEFT_SCALE + BAR_W} y2={y2} stroke="#374151" strokeWidth="0.6" strokeDasharray="3,2"/>
                    </g>
                )
            })}

            {couches.filter((c) => c.profondeurEau !== null && c.profondeurEau > 0).map((c) => {
                const y = toY(c.profondeurEau)
                return (
                    <g key={`eau-${c.id}`}>
                        <line x1={LEFT_SCALE} y1={y} x2={LEFT_SCALE + BAR_W} y2={y} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="5,3"/>
                        <text x={LEFT_SCALE + BAR_W + 2} y={y + 3} fontSize="7" fill="#3b82f6">∇</text>
                    </g>
                )
            })}
        </svg>
    )
}

function SoResultsTable({ report }) {
    const couches = report.couches || []

    if (!couches.length) {
        return <div className="rapport-so-no-data">Aucune couche enregistrée.</div>
    }

    return (
        <div className="rapport-so-results-grid">
            <div className="rapport-so-coupe-column">
                <div className="rapport-so-coupe-title">Coupe<br/>graphique</div>
                <CoupeGraphiqueSVG couches={couches} profMax={report.profMax} />
            </div>

            <table className="rapport-so-results-table">
                <thead>
                    <tr>
                        <th>Prof. (m)</th>
                        <th>Texture</th>
                        <th>Prop.</th>
                        <th>Éléments</th>
                        <th>Structure</th>
                        <th>Couleur</th>
                        <th>Consist.</th>
                        <th>Horizon</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    {couches.map((c) => (
                        <tr key={c.id}>
                            <td className="rapport-so-depth-td">
                                {formatFrenchNumber(c.zHaut, 1)} → {formatFrenchNumber(c.zBas, 1)}
                            </td>
                            <td>{c.texture || '—'}</td>
                            <td>{c.proportion || '—'}</td>
                            <td>{c.elements || '—'}</td>
                            <td>{c.structure || '—'}</td>
                            <td>{c.couleur || '—'}</td>
                            <td>{c.consistance || '—'}</td>
                            <td>{c.horizon || '—'}</td>
                            <td className="rapport-so-description-td">{c.description || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function RapportSOPage() {
    const { essaiId = 'view' } = useParams()
    const [searchParams] = useSearchParams()
    const isEmbed = String(searchParams.get('embed') || '').trim() === '1'
    const { loading, error, source } = useReportSource(essaiId, searchParams)

    const report = useMemo(() => buildReportFromSource(source, searchParams), [source, searchParams])
    const id = report.identification
    const toolbarReference = id?.chrono || id?.soNumber || essaiId || ''

    return (
        <RapportPageShell
            embedded={isEmbed}
            toolbar={<RapportToolbar reportReference={toolbarReference} />}
        >
            <div className="rapport-so-paper-stack">
                {loading ? <div className="rapport-so-inline-alert">Chargement du rapport SO…</div> : null}
                {error ? <div className="rapport-so-inline-alert rapport-so-inline-alert-warning">{error}</div> : null}

                <main className="rapport-page rapport-page-a4 rapport-so-page" id="rapport-so-printable">
                    <div className="rapport-print-frame rapport-so-frame">
                        <RapportHeader
                            logoSrc="/assets/logos/nge-logo.png"
                            title="COMPTE RENDU D'ESSAIS"
                            subtitle="COUPE DE SONDAGE"
                            essaiCode="SO"
                            reportCode="SO"
                            reportNumber={id.soNumber}
                            chrono={id.chrono}
                            affaire={id.affaire}
                            dateRedaction={formatDate(id.dateRedaction)}
                            chantier={id.chantier}
                            site={id.site}
                            laboratoire={report.laboratoire}
                        />

                        <section className="rapport-so-content">
                            <div className="rapport-so-project-row">
                                <div className="rapport-so-project-main">
                                    <InfoLine label="Type et nom de l'ouvrage :" value={id.typeOuvrage} />
                                    <InfoLine label="Partie de l'ouvrage :" value={id.partieOuvrage} />
                                </div>
                                <div className="rapport-so-project-side">
                                    <InfoLine label="Sondeur :" value={id.sondeur} />
                                    <InfoLine label="Procédé :" value={id.procedeSondage} />
                                </div>
                            </div>

                            <SectionTitle number="1" title="Caractéristiques du sondage" />

                            <div className="rapport-so-characteristics-grid">
                                <InfoLine label="Date du sondage :" value={formatDate(id.dateSondage)} />
                                <InfoLine label="Profondeur finale :" value={id.profondeurFinale} />
                                <InfoLine label="Arrêt de sondage :" value={id.arretSondage} />
                                <InfoLine label="Tenue des fouilles :" value={id.tenueF} />
                                <InfoLine label="Venue d'eau :" value={id.venueEau} />
                                <InfoLine label="Niveau nappe :" value={id.niveauNappe} />
                            </div>

                            <SectionTitle number="2" title="Description géotechnique" />
                            <SoResultsTable report={report} />
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

export default RapportSOPage

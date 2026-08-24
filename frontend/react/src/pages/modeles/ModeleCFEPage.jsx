// ModeleCFEPage.jsx
// Path not confirmed: replace the existing CFE model page at its real project location.

import React, { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { api, essaisApi } from "@/services/api"
import { resolveReturnTo } from "@/lib/detailNavigation"
import {
    buildDedicatedEssaiRapportPath,
    parseEssaiResultats,
    stringifyEssaiResultats,
} from "@/lib/essaiFeuilleRoutes"

const SIEVE_COLUMNS = [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 6.3, 8, 10, 12.5, 14, 16, 20]

const DEFAULT_MEASURES = [
    {
        id: "m1",
        numero: 1,
        heure: "01:10",
        temperatureMesuree: 177,
        teneurLiant: 5.13,
        passants: {
            0.063: 7.3,
            0.125: 9.3,
            0.25: 12.2,
            0.5: 15.9,
            1: 21,
            2: 29.7,
            4: 42.7,
            6.3: 61.5,
            8: 79.2,
            10: 95.5,
            12.5: 100,
            14: "",
            16: "",
            20: ""
        }
    },
    {
        id: "m2",
        numero: 2,
        heure: "",
        temperatureMesuree: "",
        teneurLiant: "",
        passants: {}
    },
    {
        id: "m3",
        numero: 3,
        heure: "",
        temperatureMesuree: "",
        teneurLiant: "",
        passants: {}
    },
    {
        id: "m4",
        numero: 4,
        heure: "",
        temperatureMesuree: "",
        teneurLiant: "",
        passants: {}
    }
]

const DEFAULT_DRAFT = {
    reference: "CFE",
    numeroChrono: "18",
    numeroAffaire: "RA L1EC",
    dateRedaction: "2025-10-10",
    chantier: "VL3 - Albigny sur Saône",
    site: "Avenue de la gare",
    laboratoire: "Région Rhône Alpes - 29-31 rue des Tâches - ZI Mi-Plaine - 69800 SAINT PRIEST",
    operateur: "F. Montet",
    dateEssai: "2025-10-10",
    dateMiseEnOeuvre: "Nuit 09-10/10/2025",
    lieuFabrication: "P2R",
    destinationProduit: "Avenue de la gare",
    codeFormule: "110",
    appellationEuropeenne: "EB 10 ROUL 35/50",
    appellationFrancaise: "BBSG 0/10 Cl3 15% AE",
    couche: "Roulement",
    methodeEssai: "Extracteur automatique - NEBA",
    sourceCriteres: "",
    definitionCriteres: "",
    mvrGranulats: 2.647,
    commentaire: "",
    controleNom: "F. MONTET",
    controleFonction: "Technicien de laboratoire",
    mesures: DEFAULT_MEASURES,
    criteres: {
        theorique: {
            passants: {
                0.063: 6.5,
                0.125: 8,
                0.25: 11,
                0.5: 16,
                1: 21,
                2: 30,
                4: 44,
                6.3: 60,
                8: 76,
                10: 95,
                12.5: 100,
                14: "",
                16: "",
                20: ""
            },
            teneurLiant: 5.4,
            moduleRichesse: 3.42
        },
        seuilMini: {
            passants: {
                0.063: 4.5,
                2: 24,
                6.3: 53
            },
            teneurLiant: 4.9,
            moduleRichesse: 3.4
        },
        seuilMaxi: {
            passants: {
                0.063: 8.5,
                2: 36,
                6.3: 67
            },
            teneurLiant: 5.9,
            moduleRichesse: ""
        }
    }
}

function emptyCfeMeasure(numero) {
    return {
        id: `m${numero}`,
        numero,
        heure: "",
        temperatureMesuree: "",
        teneurLiant: "",
        passants: {}
    }
}

const EMPTY_DRAFT = {
    reference: "CFE",
    numeroChrono: "",
    numeroAffaire: "",
    dateRedaction: "",
    chantier: "",
    site: "",
    laboratoire: "",
    operateur: "",
    dateEssai: "",
    dateMiseEnOeuvre: "",
    lieuFabrication: "",
    destinationProduit: "",
    codeFormule: "",
    appellationEuropeenne: "",
    appellationFrancaise: "",
    couche: "",
    methodeEssai: "",
    sourceCriteres: "",
    definitionCriteres: "",
    mvrGranulats: "",
    commentaire: "",
    controleNom: "",
    controleFonction: "",
    mesures: [1, 2, 3, 4].map(emptyCfeMeasure),
    criteres: {
        theorique: { passants: {}, teneurLiant: "", moduleRichesse: "" },
        seuilMini: { passants: {}, teneurLiant: "", moduleRichesse: "" },
        seuilMaxi: { passants: {}, teneurLiant: "", moduleRichesse: "" }
    }
}

function mergeCfeDraft(parsed, fallback = EMPTY_DRAFT) {
    const source = parsed && typeof parsed === "object" ? parsed : {}
    const nestedDraft = source.draft && typeof source.draft === "object" ? source.draft : source
    return {
        ...fallback,
        ...nestedDraft,
        mesures: Array.isArray(nestedDraft.mesures) && nestedDraft.mesures.length
            ? nestedDraft.mesures
            : fallback.mesures,
        criteres: {
            theorique: { ...fallback.criteres.theorique, ...(nestedDraft.criteres?.theorique || {}) },
            seuilMini: { ...fallback.criteres.seuilMini, ...(nestedDraft.criteres?.seuilMini || {}) },
            seuilMaxi: { ...fallback.criteres.seuilMaxi, ...(nestedDraft.criteres?.seuilMaxi || {}) }
        }
    }
}

function draftFromCfeResultats(raw) {
    const parsed = parseEssaiResultats(raw)
    if (!parsed || (!parsed.draft && !parsed.mesures && parsed.worksheet_kind !== "cfe" && !parsed.reference && !parsed.essai)) {
        return null
    }
    if (parsed.draft) return mergeCfeDraft(parsed)
    if (parsed.reference || parsed.mesures || parsed.criteres) return mergeCfeDraft(parsed)
    return null
}

function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null
    }

    const normalized = String(value).replace(",", ".").trim()
    if (normalized === "") {
        return null
    }

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

function roundValue(value, digits = 2) {
    const numeric = toNumber(value)
    if (numeric === null) {
        return ""
    }

    const factor = 10 ** digits
    return Math.round((numeric + Number.EPSILON) * factor) / factor
}

function formatNumber(value, digits = 1) {
    const numeric = toNumber(value)
    if (numeric === null) {
        return ""
    }

    return numeric.toLocaleString("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    })
}

function formatSieve(value) {
    return String(value).replace(".", ",")
}

function average(values) {
    const numericValues = values.map(toNumber).filter((value) => value !== null)
    if (!numericValues.length) {
        return null
    }

    return numericValues.reduce((total, value) => total + value, 0) / numericValues.length
}

function getPassant(row, sieve) {
    return row?.passants?.[sieve] ?? ""
}

function setPassant(row, sieve, value) {
    return {
        ...row,
        passants: {
            ...row.passants,
            [sieve]: value
        }
    }
}

function calculateMeanPassants(measures) {
    return SIEVE_COLUMNS.reduce((acc, sieve) => {
        acc[sieve] = average(measures.map((measure) => getPassant(measure, sieve)))
        return acc
    }, {})
}

function calculateBinderExternal(teneurLiant) {
    const value = toNumber(teneurLiant)
    if (value === null || value >= 100) {
        return null
    }

    return (100 * value) / (100 - value)
}

function calculateSpecificSurface(passants) {
    const p0063 = toNumber(passants?.[0.063])
    const p05 = toNumber(passants?.[0.5])
    const p125 = toNumber(passants?.[12.5])

    if (p0063 === null || p05 === null || p125 === null) {
        return null
    }

    return (0.25 * (100 - p125) + 2.3 * (p125 - p05) + 12 * (p05 - p0063) + 150 * p0063) / 100
}

function calculateRichnessModule(teneurLiant, passants, mvrGranulats) {
    const binderExternal = calculateBinderExternal(teneurLiant)
    const specificSurface = calculateSpecificSurface(passants)
    const mvr = toNumber(mvrGranulats)

    if (binderExternal === null || specificSurface === null || mvr === null || specificSurface <= 0) {
        return null
    }

    return (binderExternal * mvr) / (2.65 * specificSurface ** (1 / 5))
}

function isValueInside(value, minValue, maxValue) {
    const numeric = toNumber(value)
    const min = toNumber(minValue)
    const max = toNumber(maxValue)

    if (numeric === null) {
        return null
    }

    if (min !== null && numeric < min) {
        return false
    }

    if (max !== null && numeric > max) {
        return false
    }

    return true
}

function buildComputed(draft) {
    const meanPassants = calculateMeanPassants(draft.mesures)
    const meanTemperature = average(draft.mesures.map((measure) => measure.temperatureMesuree))
    const meanBinder = average(draft.mesures.map((measure) => measure.teneurLiant))
    const meanBinderExternal = calculateBinderExternal(meanBinder)
    const meanSpecificSurface = calculateSpecificSurface(meanPassants)
    const meanRichnessModule = calculateRichnessModule(meanBinder, meanPassants, draft.mvrGranulats)

    const measures = draft.mesures.map((measure) => {
        const binderExternal = calculateBinderExternal(measure.teneurLiant)
        const specificSurface = calculateSpecificSurface(measure.passants)
        const richnessModule = calculateRichnessModule(measure.teneurLiant, measure.passants, draft.mvrGranulats)

        return {
            ...measure,
            binderExternal,
            specificSurface,
            richnessModule
        }
    })

    const sieveStatuses = SIEVE_COLUMNS.map((sieve) => {
        return {
            sieve,
            value: meanPassants[sieve],
            status: isValueInside(meanPassants[sieve], draft.criteres.seuilMini.passants[sieve], draft.criteres.seuilMaxi.passants[sieve])
        }
    })

    const binderStatus = isValueInside(meanBinder, draft.criteres.seuilMini.teneurLiant, draft.criteres.seuilMaxi.teneurLiant)
    const moduleStatus = isValueInside(meanRichnessModule, draft.criteres.seuilMini.moduleRichesse, draft.criteres.seuilMaxi.moduleRichesse)
    const granularStatusesToCheck = sieveStatuses.filter((item) => item.status !== null)
    const granularStatus = granularStatusesToCheck.length ? granularStatusesToCheck.every((item) => item.status) : null
    const globalItems = [granularStatus, binderStatus, moduleStatus].filter((item) => item !== null)
    const globalStatus = globalItems.length ? globalItems.every(Boolean) : null

    return {
        measures,
        meanPassants,
        meanTemperature,
        meanBinder,
        meanBinderExternal,
        meanSpecificSurface,
        meanRichnessModule,
        sieveStatuses,
        granularStatus,
        binderStatus,
        moduleStatus,
        globalStatus
    }
}

function toInputValue(value) {
    return value === null || value === undefined ? "" : value
}

function StatusPill({ status, label }) {
    const stateClass = status === true ? "is-ok" : status === false ? "is-ko" : "is-neutral"
    const stateLabel = status === true ? "Conforme" : status === false ? "Non conforme" : "À vérifier"

    return (
        <span className={`cfe-status-pill ${stateClass}`}>
            <span>{label}</span>
            <strong>{stateLabel}</strong>
        </span>
    )
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
    return (
        <label className="cfe-field">
            <span>{label}</span>
            <input
                type={type}
                value={toInputValue(value)}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    )
}

function TextField({ label, value, onChange, placeholder = "" }) {
    return (
        <label className="cfe-field cfe-field-wide">
            <span>{label}</span>
            <textarea
                value={toInputValue(value)}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    )
}

function EditableNumber({ value, onChange, className = "" }) {
    return (
        <input
            className={`cfe-number-input ${className}`}
            type="text"
            inputMode="decimal"
            value={toInputValue(value)}
            onChange={(event) => onChange(event.target.value)}
        />
    )
}

function SectionCard({ title, subtitle, actions, children, className = "" }) {
    return (
        <section className={`cfe-card ${className}`}>
            <div className="cfe-card-header">
                <div>
                    <h2>{title}</h2>
                    {subtitle ? <p>{subtitle}</p> : null}
                </div>
                {actions ? <div className="cfe-card-actions">{actions}</div> : null}
            </div>
            {children}
        </section>
    )
}

function getCurvePoints(passants) {
    return SIEVE_COLUMNS.map((sieve) => {
        const value = toNumber(passants?.[sieve])
        return value === null ? null : { sieve, value }
    }).filter(Boolean)
}

function CfeCurveChart({ draft, computed }) {
    const width = 760
    const height = 330
    const padding = { top: 22, right: 28, bottom: 42, left: 56 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const xMin = 0.01
    const xMax = 100

    function xScale(sieve) {
        const minLog = Math.log10(xMin)
        const maxLog = Math.log10(xMax)
        const valueLog = Math.log10(Number(sieve))
        return padding.left + ((valueLog - minLog) / (maxLog - minLog)) * plotWidth
    }

    function yScale(value) {
        return padding.top + (1 - Number(value) / 100) * plotHeight
    }

    function makePolyline(points) {
        return points
            .map((point) => `${xScale(point.sieve)},${yScale(point.value)}`)
            .join(" ")
    }

    const averagePoints = getCurvePoints(computed.meanPassants)
    const theoreticalPoints = getCurvePoints(draft.criteres.theorique.passants)
    const miniPoints = getCurvePoints(draft.criteres.seuilMini.passants)
    const maxiPoints = getCurvePoints(draft.criteres.seuilMaxi.passants)
    const horizontalTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    const verticalTicks = [0.01, 0.1, 1, 10, 100]

    return (
        <div className="cfe-chart-shell">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe granulométrique CFE">
                <rect x="0" y="0" width={width} height={height} rx="18" className="cfe-chart-bg" />
                {horizontalTicks.map((tick) => (
                    <g key={`h-${tick}`}>
                        <line
                            x1={padding.left}
                            x2={padding.left + plotWidth}
                            y1={yScale(tick)}
                            y2={yScale(tick)}
                            className="cfe-chart-grid"
                        />
                        <text x={padding.left - 12} y={yScale(tick) + 4} textAnchor="end" className="cfe-chart-tick">
                            {tick}
                        </text>
                    </g>
                ))}
                {verticalTicks.map((tick) => (
                    <g key={`v-${tick}`}>
                        <line
                            x1={xScale(tick)}
                            x2={xScale(tick)}
                            y1={padding.top}
                            y2={padding.top + plotHeight}
                            className="cfe-chart-grid strong"
                        />
                        <text x={xScale(tick)} y={height - 16} textAnchor="middle" className="cfe-chart-tick">
                            {String(tick).replace(".", ",")}
                        </text>
                    </g>
                ))}
                <line x1={padding.left} x2={padding.left + plotWidth} y1={padding.top + plotHeight} y2={padding.top + plotHeight} className="cfe-chart-axis" />
                <line x1={padding.left} x2={padding.left} y1={padding.top} y2={padding.top + plotHeight} className="cfe-chart-axis" />
                {miniPoints.length > 1 ? <polyline points={makePolyline(miniPoints)} className="cfe-curve mini" /> : null}
                {maxiPoints.length > 1 ? <polyline points={makePolyline(maxiPoints)} className="cfe-curve maxi" /> : null}
                {theoreticalPoints.length > 1 ? <polyline points={makePolyline(theoreticalPoints)} className="cfe-curve theoretical" /> : null}
                {averagePoints.length > 1 ? <polyline points={makePolyline(averagePoints)} className="cfe-curve average" /> : null}
                {averagePoints.map((point) => (
                    <circle key={`avg-${point.sieve}`} cx={xScale(point.sieve)} cy={yScale(point.value)} r="3.5" className="cfe-point average" />
                ))}
                {theoreticalPoints.map((point) => (
                    <circle key={`th-${point.sieve}`} cx={xScale(point.sieve)} cy={yScale(point.value)} r="3" className="cfe-point theoretical" />
                ))}
                <text x={padding.left + plotWidth / 2} y={height - 4} textAnchor="middle" className="cfe-chart-label">
                    Tamis (mm)
                </text>
                <text x="16" y={padding.top + plotHeight / 2} textAnchor="middle" className="cfe-chart-label rotated">
                    Passants (%)
                </text>
            </svg>
            <div className="cfe-chart-legend">
                <span><i className="average" />Courbe moyenne</span>
                <span><i className="theoretical" />Courbe théorique</span>
                <span><i className="mini" />Seuil mini</span>
                <span><i className="maxi" />Seuil maxi</span>
            </div>
        </div>
    )
}

function CfeMeasuresTable({ draft, setDraft, computed }) {
    function updateMeasure(index, key, value) {
        setDraft((current) => {
            const nextMeasures = current.mesures.map((measure, measureIndex) => {
                if (measureIndex !== index) {
                    return measure
                }

                return {
                    ...measure,
                    [key]: value
                }
            })

            return {
                ...current,
                mesures: nextMeasures
            }
        })
    }

    return (
        <div className="cfe-table-scroll">
            <table className="cfe-table cfe-measures-table">
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>Heure</th>
                        <th>Température mesurée</th>
                        <th>Teneur en liant</th>
                        <th>Teneur en liant ext.</th>
                        <th>Surface spécifique</th>
                        <th>Module richesse</th>
                    </tr>
                </thead>
                <tbody>
                    {draft.mesures.map((measure, index) => (
                        <tr key={measure.id}>
                            <td>{measure.numero}</td>
                            <td>
                                <input
                                    className="cfe-cell-input"
                                    type="text"
                                    value={toInputValue(measure.heure)}
                                    onChange={(event) => updateMeasure(index, "heure", event.target.value)}
                                />
                            </td>
                            <td>
                                <EditableNumber
                                    value={measure.temperatureMesuree}
                                    onChange={(value) => updateMeasure(index, "temperatureMesuree", value)}
                                />
                            </td>
                            <td>
                                <EditableNumber
                                    value={measure.teneurLiant}
                                    onChange={(value) => updateMeasure(index, "teneurLiant", value)}
                                />
                            </td>
                            <td className="cfe-calculated-cell">{formatNumber(computed.measures[index]?.binderExternal, 2)}</td>
                            <td className="cfe-calculated-cell">{formatNumber(computed.measures[index]?.specificSurface, 2)}</td>
                            <td className="cfe-calculated-cell">{formatNumber(computed.measures[index]?.richnessModule, 2)}</td>
                        </tr>
                    ))}
                    <tr className="cfe-total-row">
                        <td colSpan="2">Moyenne</td>
                        <td>{formatNumber(computed.meanTemperature, 1)}</td>
                        <td>{formatNumber(computed.meanBinder, 2)}</td>
                        <td>{formatNumber(computed.meanBinderExternal, 2)}</td>
                        <td>{formatNumber(computed.meanSpecificSurface, 2)}</td>
                        <td>{formatNumber(computed.meanRichnessModule, 2)}</td>
                    </tr>
                    <tr className="cfe-criteria-row">
                        <td colSpan="3">Théorique / critères</td>
                        <td>{formatNumber(draft.criteres.theorique.teneurLiant, 2)}</td>
                        <td />
                        <td />
                        <td>{formatNumber(draft.criteres.theorique.moduleRichesse, 2)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    )
}

function CfeGranulometryTable({ draft, setDraft, computed }) {
    function updateMeasurePassant(index, sieve, value) {
        setDraft((current) => {
            const nextMeasures = current.mesures.map((measure, measureIndex) => {
                if (measureIndex !== index) {
                    return measure
                }

                return setPassant(measure, sieve, value)
            })

            return {
                ...current,
                mesures: nextMeasures
            }
        })
    }

    function updateCriteria(group, sieve, value) {
        setDraft((current) => ({
            ...current,
            criteres: {
                ...current.criteres,
                [group]: {
                    ...current.criteres[group],
                    passants: {
                        ...current.criteres[group].passants,
                        [sieve]: value
                    }
                }
            }
        }))
    }

    return (
        <div className="cfe-table-scroll wide">
            <table className="cfe-table cfe-granulo-table">
                <thead>
                    <tr>
                        <th className="sticky-first">Ligne</th>
                        {SIEVE_COLUMNS.map((sieve) => (
                            <th key={sieve}>{formatSieve(sieve)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {draft.mesures.map((measure, measureIndex) => (
                        <tr key={measure.id}>
                            <td className="sticky-first">Mesure {measure.numero}</td>
                            {SIEVE_COLUMNS.map((sieve) => (
                                <td key={`${measure.id}-${sieve}`}>
                                    <EditableNumber
                                        value={getPassant(measure, sieve)}
                                        onChange={(value) => updateMeasurePassant(measureIndex, sieve, value)}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                    <tr className="cfe-total-row">
                        <td className="sticky-first">Moyenne</td>
                        {SIEVE_COLUMNS.map((sieve) => (
                            <td key={`mean-${sieve}`}>{formatNumber(computed.meanPassants[sieve], 1)}</td>
                        ))}
                    </tr>
                    <tr className="cfe-criteria-row">
                        <td className="sticky-first">Théorique</td>
                        {SIEVE_COLUMNS.map((sieve) => (
                            <td key={`theoretical-${sieve}`}>
                                <EditableNumber
                                    value={draft.criteres.theorique.passants[sieve]}
                                    onChange={(value) => updateCriteria("theorique", sieve, value)}
                                />
                            </td>
                        ))}
                    </tr>
                    <tr>
                        <td className="sticky-first">Seuil maxi</td>
                        {SIEVE_COLUMNS.map((sieve) => (
                            <td key={`max-${sieve}`}>
                                <EditableNumber
                                    value={draft.criteres.seuilMaxi.passants[sieve]}
                                    onChange={(value) => updateCriteria("seuilMaxi", sieve, value)}
                                />
                            </td>
                        ))}
                    </tr>
                    <tr>
                        <td className="sticky-first">Seuil mini</td>
                        {SIEVE_COLUMNS.map((sieve) => (
                            <td key={`min-${sieve}`}>
                                <EditableNumber
                                    value={draft.criteres.seuilMini.passants[sieve]}
                                    onChange={(value) => updateCriteria("seuilMini", sieve, value)}
                                />
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    )
}

function buildPayload(draft, computed) {
    return {
        essai: {
            type_essai: "CFE",
            reference: draft.reference,
            numero_chrono: draft.numeroChrono,
            numero_affaire: draft.numeroAffaire,
            date_redaction: draft.dateRedaction,
            chantier: draft.chantier,
            site: draft.site,
            laboratoire: draft.laboratoire,
            operateur: draft.operateur,
            date_essai: draft.dateEssai,
            date_mise_en_oeuvre: draft.dateMiseEnOeuvre,
            lieu_fabrication: draft.lieuFabrication,
            destination_produit: draft.destinationProduit,
            code_formule: draft.codeFormule,
            appellation_europeenne: draft.appellationEuropeenne,
            appellation_francaise: draft.appellationFrancaise,
            couche: draft.couche,
            methode_essai: draft.methodeEssai,
            source_criteres: draft.sourceCriteres,
            definition_criteres: draft.definitionCriteres,
            mvr_granulats: toNumber(draft.mvrGranulats),
            conformite_globale: computed.globalStatus,
            commentaire: draft.commentaire,
            controle_nom: draft.controleNom,
            controle_fonction: draft.controleFonction
        },
        mesures: computed.measures.map((measure) => ({
            numero_mesure: measure.numero,
            heure: measure.heure,
            temperature_mesuree: toNumber(measure.temperatureMesuree),
            teneur_liant: toNumber(measure.teneurLiant),
            teneur_liant_exterieure: roundValue(measure.binderExternal, 4),
            surface_specifique: roundValue(measure.specificSurface, 4),
            module_richesse: roundValue(measure.richnessModule, 4),
            passants: SIEVE_COLUMNS.map((sieve) => ({
                tamis_mm: sieve,
                passant_pourcent: toNumber(getPassant(measure, sieve))
            }))
        })),
        resultats: {
            moyenne_temperature: roundValue(computed.meanTemperature, 3),
            moyenne_teneur_liant: roundValue(computed.meanBinder, 4),
            moyenne_teneur_liant_exterieure: roundValue(computed.meanBinderExternal, 4),
            moyenne_surface_specifique: roundValue(computed.meanSpecificSurface, 4),
            moyenne_module_richesse: roundValue(computed.meanRichnessModule, 4),
            moyenne_passants: SIEVE_COLUMNS.map((sieve) => ({
                tamis_mm: sieve,
                passant_pourcent: roundValue(computed.meanPassants[sieve], 3)
            }))
        },
        criteres: {
            theorique: draft.criteres.theorique,
            seuil_mini: draft.criteres.seuilMini,
            seuil_maxi: draft.criteres.seuilMaxi
        }
    }
}

export default function ModeleCFEPage({ initialDraft, onSave, onOpenReport }) {
    const navigate = useNavigate()
    const params = useParams()
    const [searchParams] = useSearchParams()
    const uidFromPath = String(params.uid || "").trim()
    const isNew = uidFromPath === "new" || (!uidFromPath && Boolean(searchParams.get("echantillon_id") || searchParams.get("intervention_id")))
    const echantillonId = Number.parseInt(searchParams.get("echantillon_id") || "", 10)
    const interventionId = Number.parseInt(searchParams.get("intervention_id") || "", 10)
    const returnTo = resolveReturnTo(searchParams, "/labo/workbench?tab=essais")

    const [draft, setDraft] = useState(initialDraft || EMPTY_DRAFT)
    const [saveMessage, setSaveMessage] = useState("")
    const [essaiUid, setEssaiUid] = useState(isNew ? "" : uidFromPath)
    const computed = useMemo(() => buildComputed(draft), [draft])

    useEffect(() => {
        let cancelled = false
        const currentUid = String(params.uid || "").trim()
        const creating = currentUid === "new" || (!currentUid && Boolean(searchParams.get("echantillon_id") || searchParams.get("intervention_id")))

        async function loadEssai() {
            if (!currentUid || creating) {
                setEssaiUid("")
                setDraft(initialDraft || EMPTY_DRAFT)
                return
            }
            try {
                const essai = await essaisApi.get(currentUid)
                if (cancelled) return
                setEssaiUid(String(essai?.uid || currentUid))
                setDraft(draftFromCfeResultats(essai?.resultats) || initialDraft || EMPTY_DRAFT)
            } catch (err) {
                if (cancelled) return
                setSaveMessage(err?.message || "Impossible de charger la feuille CFE.")
            }
        }

        loadEssai()
        return () => { cancelled = true }
    }, [params.uid, searchParams, initialDraft])

    function updateField(key, value) {
        setDraft((current) => ({
            ...current,
            [key]: value
        }))
    }

    function updateCriteriaValue(group, key, value) {
        setDraft((current) => ({
            ...current,
            criteres: {
                ...current.criteres,
                [group]: {
                    ...current.criteres[group],
                    [key]: value
                }
            }
        }))
    }

    function buildStoredResultats() {
        const payload = buildPayload(draft, computed)
        return {
            worksheet_kind: "cfe",
            draft,
            ...payload,
            moyenne: {
                teneur_liant_percent: payload.resultats?.moyenne_teneur_liant,
                teneur_liant_ext_percent: payload.resultats?.moyenne_teneur_liant_exterieure,
                temperature_c: payload.resultats?.moyenne_temperature,
            },
            teneur_liant_percent: payload.resultats?.moyenne_teneur_liant,
            teneur_liant_ext_percent: payload.resultats?.moyenne_teneur_liant_exterieure,
            temperature_prelevement_c: payload.resultats?.moyenne_temperature,
        }
    }

    async function persistToApi() {
        const resultats = stringifyEssaiResultats(buildStoredResultats())
        const payload = {
            essai_code: "CFE",
            type_essai: searchParams.get("type_essai") || "Contrôle de fabrication enrobés",
            norme: searchParams.get("norme") || "",
            statut: draft.operateur ? "En cours" : "Programmé",
            date_debut: draft.dateEssai || null,
            operateur: draft.operateur || "",
            resultats,
            source_label: searchParams.get("source_label") || "",
        }
        const hasParent = (Number.isInteger(echantillonId) && echantillonId > 0)
            || (Number.isInteger(interventionId) && interventionId > 0)

        if (essaiUid) {
            return api.put(`/essais/${essaiUid}`, payload)
        }
        if (!hasParent) {
            window.localStorage.setItem("ralab_cfe_draft", resultats)
            return { uid: "" }
        }
        return essaisApi.create({
            ...payload,
            echantillon_id: Number.isInteger(echantillonId) && echantillonId > 0 ? echantillonId : undefined,
            intervention_id: Number.isInteger(echantillonId) && echantillonId > 0
                ? undefined
                : (Number.isInteger(interventionId) && interventionId > 0 ? interventionId : undefined),
        })
    }

    async function handleSave() {
        const payload = buildPayload(draft, computed)

        if (typeof onSave === "function") {
            onSave(payload)
            setSaveMessage("Feuille CFE enregistrée.")
            return ""
        }

        try {
            const saved = await persistToApi()
            const savedUid = String(saved?.uid || essaiUid || "")
            window.localStorage.setItem("ralab_cfe_draft", stringifyEssaiResultats(buildStoredResultats()))
            window.localStorage.setItem("ralab_cfe_report_preview", JSON.stringify(payload))
            if (savedUid && savedUid !== essaiUid) {
                setEssaiUid(savedUid)
                const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""
                navigate(`/modeles/cfe/${encodeURIComponent(savedUid)}${query}`, { replace: true })
            }
            setSaveMessage(savedUid ? "Feuille CFE enregistrée." : "Brouillon CFE enregistré localement.")
            window.setTimeout(() => setSaveMessage(""), 2500)
            return savedUid
        } catch (err) {
            setSaveMessage(err?.message || "Enregistrement CFE impossible.")
            return essaiUid
        }
    }

    async function handleOpenReport() {
        const payload = buildPayload(draft, computed)

        if (typeof onOpenReport === "function") {
            onOpenReport(payload)
            return
        }

        const savedUid = await handleSave()
        window.localStorage.setItem("ralab_cfe_report_preview", JSON.stringify(payload))
        const target = buildDedicatedEssaiRapportPath({
            code: "CFE",
            uid: savedUid || essaiUid,
            returnTo: savedUid ? `/modeles/cfe/${encodeURIComponent(savedUid)}` : "/modeles/cfe",
        })
        if (target) navigate(target)
    }

    return (
        <div className="cfe-page">
            <style>{CFE_STYLES}</style>

            <header className="cfe-hero">
                <div>
                    <p className="cfe-kicker">Feuille d'essai</p>
                    <h1>CFE - Contrôle de fabrication des enrobés</h1>
                    <p className="cfe-hero-subtitle">
                        Saisie granulométrie, teneur en liant, module de richesse et conformité.
                    </p>
                    <div className="cfe-hero-actions">
                        <button type="button" className="cfe-secondary-button" onClick={() => navigate(returnTo)}>← Retour</button>
                        <button type="button" className="cfe-secondary-button" onClick={() => setDraft(DEFAULT_DRAFT)}>Recharger exemple</button>
                    </div>
                </div>
                <div className="cfe-hero-panel">
                    <span>Contrôle global</span>
                    <strong className={computed.globalStatus === true ? "ok" : computed.globalStatus === false ? "ko" : "neutral"}>
                        {computed.globalStatus === true ? "Conforme" : computed.globalStatus === false ? "Non conforme" : "À vérifier"}
                    </strong>
                    <small>{draft.reference} n° {draft.numeroChrono || "-"}</small>
                </div>
            </header>

            <div className="cfe-layout">
                <main className="cfe-main-column">
                    <SectionCard
                        title="Identification du contrôle"
                        subtitle="Informations administratives reprises dans le rapport."
                    >
                        <div className="cfe-grid three">
                            <Field label="Référence" value={draft.reference} onChange={(value) => updateField("reference", value)} />
                            <Field label="N° chrono" value={draft.numeroChrono} onChange={(value) => updateField("numeroChrono", value)} />
                            <Field label="N° d'affaire" value={draft.numeroAffaire} onChange={(value) => updateField("numeroAffaire", value)} />
                            <Field label="Date de rédaction" type="date" value={draft.dateRedaction} onChange={(value) => updateField("dateRedaction", value)} />
                            <Field label="Date de l'essai" type="date" value={draft.dateEssai} onChange={(value) => updateField("dateEssai", value)} />
                            <Field label="Date de mise en œuvre" value={draft.dateMiseEnOeuvre} onChange={(value) => updateField("dateMiseEnOeuvre", value)} />
                        </div>
                        <div className="cfe-grid two">
                            <Field label="Chantier" value={draft.chantier} onChange={(value) => updateField("chantier", value)} />
                            <Field label="Site / destination" value={draft.site} onChange={(value) => updateField("site", value)} />
                            <Field label="Laboratoire" value={draft.laboratoire} onChange={(value) => updateField("laboratoire", value)} />
                            <Field label="Opérateur" value={draft.operateur} onChange={(value) => updateField("operateur", value)} />
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Produit et formule"
                        subtitle="Identification de l'enrobé et de la méthode d'extraction."
                    >
                        <div className="cfe-grid three">
                            <Field label="Lieu de fabrication" value={draft.lieuFabrication} onChange={(value) => updateField("lieuFabrication", value)} />
                            <Field label="Code formule" value={draft.codeFormule} onChange={(value) => updateField("codeFormule", value)} />
                            <Field label="Couche" value={draft.couche} onChange={(value) => updateField("couche", value)} />
                            <Field label="Appellation européenne" value={draft.appellationEuropeenne} onChange={(value) => updateField("appellationEuropeenne", value)} />
                            <Field label="Appellation française" value={draft.appellationFrancaise} onChange={(value) => updateField("appellationFrancaise", value)} />
                            <Field label="Méthode d'essai" value={draft.methodeEssai} onChange={(value) => updateField("methodeEssai", value)} />
                        </div>
                        <div className="cfe-grid three compact">
                            <Field label="MVR granulats" value={draft.mvrGranulats} onChange={(value) => updateField("mvrGranulats", value)} />
                            <Field label="Destination du produit" value={draft.destinationProduit} onChange={(value) => updateField("destinationProduit", value)} />
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Critères de conformité"
                        subtitle="Source, définition et seuils utilisés pour juger le contrôle."
                    >
                        <div className="cfe-grid two">
                            <TextField label="Source des critères" value={draft.sourceCriteres} onChange={(value) => updateField("sourceCriteres", value)} />
                            <TextField label="Définition des critères / objectifs" value={draft.definitionCriteres} onChange={(value) => updateField("definitionCriteres", value)} />
                        </div>
                        <div className="cfe-mini-criteria">
                            <Field label="Liant théorique" value={draft.criteres.theorique.teneurLiant} onChange={(value) => updateCriteriaValue("theorique", "teneurLiant", value)} />
                            <Field label="Liant mini" value={draft.criteres.seuilMini.teneurLiant} onChange={(value) => updateCriteriaValue("seuilMini", "teneurLiant", value)} />
                            <Field label="Liant maxi" value={draft.criteres.seuilMaxi.teneurLiant} onChange={(value) => updateCriteriaValue("seuilMaxi", "teneurLiant", value)} />
                            <Field label="Module théorique" value={draft.criteres.theorique.moduleRichesse} onChange={(value) => updateCriteriaValue("theorique", "moduleRichesse", value)} />
                            <Field label="Module mini" value={draft.criteres.seuilMini.moduleRichesse} onChange={(value) => updateCriteriaValue("seuilMini", "moduleRichesse", value)} />
                        </div>
                    </SectionCard>

                    <SectionCard title="Mesures d'extraction" subtitle="Jusqu'à quatre mesures par contrôle CFE.">
                        <CfeMeasuresTable draft={draft} setDraft={setDraft} computed={computed} />
                    </SectionCard>

                    <SectionCard title="Analyse granulométrique" subtitle="Passants par tamis, moyenne calculée et enveloppe de conformité.">
                        <CfeGranulometryTable draft={draft} setDraft={setDraft} computed={computed} />
                    </SectionCard>

                    <SectionCard title="Courbe granulométrique" subtitle="Aperçu graphique avec échelle logarithmique des tamis.">
                        <CfeCurveChart draft={draft} computed={computed} />
                    </SectionCard>

                    <SectionCard title="Conclusion et commentaires" subtitle="Zone reprise en bas du rapport imprimable.">
                        <div className="cfe-conclusion-grid">
                            <div className="cfe-control-box">
                                <span>Contrôle</span>
                                <strong>{computed.globalStatus === true ? "Conforme" : computed.globalStatus === false ? "Non conforme" : "À vérifier"}</strong>
                            </div>
                            <Field label="Nom" value={draft.controleNom} onChange={(value) => updateField("controleNom", value)} />
                            <Field label="Fonction" value={draft.controleFonction} onChange={(value) => updateField("controleFonction", value)} />
                        </div>
                        <TextField label="Commentaires" value={draft.commentaire} onChange={(value) => updateField("commentaire", value)} />
                    </SectionCard>
                </main>

                <aside className="cfe-side-column">
                    <SectionCard title="Actions" className="sticky-card">
                        <button type="button" className="cfe-primary-button" onClick={handleSave}>Enregistrer la feuille</button>
                        <button type="button" className="cfe-secondary-button" onClick={handleOpenReport}>Imprimer / Rapport</button>
                        {saveMessage ? <p className="cfe-save-message">{saveMessage}</p> : null}
                    </SectionCard>

                    <SectionCard title="Conformité">
                        <div className="cfe-status-list">
                            <StatusPill status={computed.granularStatus} label="Granulométrie" />
                            <StatusPill status={computed.binderStatus} label="Teneur en liant" />
                            <StatusPill status={computed.moduleStatus} label="Module richesse" />
                        </div>
                    </SectionCard>

                    <SectionCard title="Synthèse calculée">
                        <dl className="cfe-summary-list">
                            <div>
                                <dt>Moyenne température</dt>
                                <dd>{formatNumber(computed.meanTemperature, 1)} °C</dd>
                            </div>
                            <div>
                                <dt>Moyenne liant</dt>
                                <dd>{formatNumber(computed.meanBinder, 2)} %</dd>
                            </div>
                            <div>
                                <dt>Liant extérieur</dt>
                                <dd>{formatNumber(computed.meanBinderExternal, 2)} %</dd>
                            </div>
                            <div>
                                <dt>Surface spécifique</dt>
                                <dd>{formatNumber(computed.meanSpecificSurface, 2)}</dd>
                            </div>
                            <div>
                                <dt>Module richesse</dt>
                                <dd>{formatNumber(computed.meanRichnessModule, 2)}</dd>
                            </div>
                        </dl>
                    </SectionCard>

                    <SectionCard title="À prévoir pour l'import">
                        <ul className="cfe-notes">
                            <li>1 feuille Excel = 1 contrôle CFE.</li>
                            <li>Les 4 lignes de mesures deviennent des sous-mesures.</li>
                            <li>Les valeurs calculées restent recalculables côté RaLab.</li>
                            <li>Les critères peuvent venir de la formule enrobé.</li>
                        </ul>
                    </SectionCard>
                </aside>
            </div>
        </div>
    )
}

const CFE_STYLES = `
.cfe-page {
    min-height: 100vh;
    padding: 24px;
    background: #f3f6fb;
    color: #10223f;
    font-family: Inter, "Segoe UI", Arial, sans-serif;
}

.cfe-hero {
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 20px;
    padding: 24px;
    border-radius: 26px;
    background: linear-gradient(135deg, #001f5f 0%, #0b3d91 55%, #d5a600 130%);
    color: white;
    box-shadow: 0 18px 45px rgba(0, 31, 95, 0.18);
}

.cfe-hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
}

.cfe-hero-actions .cfe-secondary-button {
    width: auto;
    background: rgba(255, 255, 255, 0.14);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.35);
}

.cfe-kicker {
    margin: 0 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 12px;
    font-weight: 800;
    opacity: 0.8;
}

.cfe-hero h1 {
    margin: 0;
    font-size: clamp(26px, 4vw, 42px);
    line-height: 1.05;
}

.cfe-hero-subtitle {
    max-width: 820px;
    margin: 10px 0 0;
    color: rgba(255, 255, 255, 0.82);
}

.cfe-hero-panel {
    min-width: 220px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 18px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(10px);
}

.cfe-hero-panel span,
.cfe-hero-panel small {
    color: rgba(255, 255, 255, 0.76);
}

.cfe-hero-panel strong {
    font-size: 26px;
}

.cfe-hero-panel strong.ok {
    color: #d8ffea;
}

.cfe-hero-panel strong.ko {
    color: #ffd6d6;
}

.cfe-hero-panel strong.neutral {
    color: #fff2b4;
}

.cfe-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 20px;
    margin-top: 20px;
}

.cfe-main-column,
.cfe-side-column {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.cfe-card {
    border: 1px solid #dbe4f2;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 14px 36px rgba(16, 34, 63, 0.08);
    padding: 18px;
}

.sticky-card {
    position: sticky;
    top: 18px;
    z-index: 2;
}

.cfe-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
}

.cfe-card h2 {
    margin: 0;
    font-size: 18px;
    color: #001f5f;
}

.cfe-card p {
    margin: 5px 0 0;
    color: #64748b;
    font-size: 13px;
}

.cfe-card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.cfe-grid {
    display: grid;
    gap: 12px;
}

.cfe-grid.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cfe-grid.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cfe-grid.compact {
    margin-top: 12px;
}

.cfe-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.cfe-field span {
    font-size: 12px;
    font-weight: 800;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.cfe-field input,
.cfe-field textarea,
.cfe-cell-input,
.cfe-number-input {
    width: 100%;
    border: 1px solid #ccd7e6;
    border-radius: 12px;
    padding: 10px 11px;
    background: #f8fbff;
    color: #10223f;
    font: inherit;
    outline: none;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.cfe-field textarea {
    min-height: 82px;
    resize: vertical;
}

.cfe-field input:focus,
.cfe-field textarea:focus,
.cfe-cell-input:focus,
.cfe-number-input:focus {
    border-color: #0b3d91;
    background: white;
    box-shadow: 0 0 0 4px rgba(11, 61, 145, 0.12);
}

.cfe-mini-criteria {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
}

.cfe-table-scroll {
    overflow: auto;
    border: 1px solid #dce5f3;
    border-radius: 16px;
}

.cfe-table-scroll.wide {
    max-width: 100%;
}

.cfe-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    background: white;
}

.cfe-table th {
    position: relative;
    background: #001f5f;
    color: white;
    font-weight: 800;
    text-align: center;
    padding: 10px 8px;
    border: 1px solid #173f82;
    white-space: nowrap;
}

.cfe-table td {
    border: 1px solid #e1e8f3;
    padding: 7px;
    text-align: center;
    vertical-align: middle;
}

.cfe-table tbody tr:nth-child(even):not(.cfe-total-row):not(.cfe-criteria-row) {
    background: #fbfdff;
}

.cfe-granulo-table {
    min-width: 1120px;
}

.cfe-granulo-table .sticky-first {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 112px;
    text-align: left;
    background: #f8fbff;
    font-weight: 800;
    color: #10223f;
}

.cfe-granulo-table thead .sticky-first {
    z-index: 2;
    background: #001f5f;
    color: white;
}

.cfe-number-input,
.cfe-cell-input {
    min-width: 64px;
    padding: 8px;
    text-align: center;
    border-radius: 9px;
}

.cfe-calculated-cell {
    background: #f0f6ff;
    font-weight: 800;
    color: #001f5f;
}

.cfe-total-row td {
    background: #eaf2ff;
    font-weight: 900;
    color: #001f5f;
}

.cfe-criteria-row td {
    background: #fff8de;
    font-weight: 800;
    color: #6f5300;
}

.cfe-chart-shell {
    overflow: hidden;
    border-radius: 18px;
    border: 1px solid #d9e4f2;
    background: white;
}

.cfe-chart-shell svg {
    display: block;
    width: 100%;
    height: auto;
}

.cfe-chart-bg {
    fill: #ffffff;
}

.cfe-chart-grid {
    stroke: #d3dceb;
    stroke-width: 1;
}

.cfe-chart-grid.strong {
    stroke: #aebbd0;
}

.cfe-chart-axis {
    stroke: #1f2f46;
    stroke-width: 1.6;
}

.cfe-chart-tick,
.cfe-chart-label {
    fill: #41516b;
    font-size: 12px;
    font-weight: 700;
}

.cfe-chart-label.rotated {
    transform: rotate(-90deg);
    transform-origin: 16px 165px;
}

.cfe-curve {
    fill: none;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.cfe-curve.average {
    stroke: #0b3d91;
}

.cfe-curve.theoretical {
    stroke: #d71920;
    stroke-dasharray: 5 4;
}

.cfe-curve.mini,
.cfe-curve.maxi {
    stroke: #111827;
    stroke-dasharray: 8 7;
}

.cfe-point.average {
    fill: #0b3d91;
}

.cfe-point.theoretical {
    fill: #d71920;
}

.cfe-chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 10px 14px 14px;
    color: #475569;
    font-size: 13px;
    font-weight: 700;
}

.cfe-chart-legend span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
}

.cfe-chart-legend i {
    width: 24px;
    height: 3px;
    border-radius: 999px;
    display: inline-block;
    background: #0b3d91;
}

.cfe-chart-legend i.theoretical {
    background: repeating-linear-gradient(90deg, #d71920 0, #d71920 6px, transparent 6px, transparent 10px);
}

.cfe-chart-legend i.mini,
.cfe-chart-legend i.maxi {
    background: repeating-linear-gradient(90deg, #111827 0, #111827 7px, transparent 7px, transparent 11px);
}

.cfe-conclusion-grid {
    display: grid;
    grid-template-columns: 220px 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
}

.cfe-control-box {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    padding: 14px;
    border-radius: 16px;
    background: #eef5ff;
    border: 1px solid #d5e3f7;
}

.cfe-control-box span {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
}

.cfe-control-box strong {
    color: #001f5f;
    font-size: 20px;
}

.cfe-primary-button,
.cfe-secondary-button {
    width: 100%;
    border: 0;
    border-radius: 14px;
    padding: 12px 14px;
    font-weight: 900;
    cursor: pointer;
    transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.cfe-primary-button {
    background: #001f5f;
    color: white;
    box-shadow: 0 12px 24px rgba(0, 31, 95, 0.2);
}

.cfe-secondary-button {
    margin-top: 10px;
    background: #ffdf5a;
    color: #10223f;
}

.cfe-primary-button:hover,
.cfe-secondary-button:hover {
    transform: translateY(-1px);
}

.cfe-save-message {
    margin-top: 10px !important;
    color: #0f766e !important;
    font-weight: 800;
}

.cfe-status-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.cfe-status-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
}

.cfe-status-pill span {
    font-weight: 800;
    color: #475569;
}

.cfe-status-pill strong {
    padding: 5px 9px;
    border-radius: 999px;
    font-size: 12px;
}

.cfe-status-pill.is-ok strong {
    background: #dcfce7;
    color: #166534;
}

.cfe-status-pill.is-ko strong {
    background: #fee2e2;
    color: #991b1b;
}

.cfe-status-pill.is-neutral strong {
    background: #fef3c7;
    color: #92400e;
}

.cfe-summary-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
}

.cfe-summary-list div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e2e8f0;
}

.cfe-summary-list div:last-child {
    border-bottom: 0;
    padding-bottom: 0;
}

.cfe-summary-list dt {
    color: #64748b;
    font-weight: 700;
}

.cfe-summary-list dd {
    margin: 0;
    color: #001f5f;
    font-weight: 900;
}

.cfe-notes {
    margin: 0;
    padding-left: 18px;
    color: #475569;
    line-height: 1.55;
}

@media (max-width: 1180px) {
    .cfe-layout {
        grid-template-columns: 1fr;
    }

    .sticky-card {
        position: static;
    }

    .cfe-side-column {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 780px) {
    .cfe-page {
        padding: 14px;
    }

    .cfe-hero,
    .cfe-grid.two,
    .cfe-grid.three,
    .cfe-mini-criteria,
    .cfe-conclusion-grid,
    .cfe-side-column {
        grid-template-columns: 1fr;
        flex-direction: column;
    }
}
`

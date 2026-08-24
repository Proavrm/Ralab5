// RapportCFEPage.jsx
// Path not confirmed: replace the existing CFE report page at its real project location.
// This component rebuilds the CFE report as a fixed A4 portrait SVG, matching the provided Excel/PDF layout.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { essaisApi } from "@/services/api";
import { resolveReturnTo } from "@/lib/detailNavigation";
import { parseEssaiResultats } from "@/lib/essaiFeuilleRoutes";

const CFE_LOGO_DATA_URL = "data:image/png;base64,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";

const SIEVE_COLUMNS = [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 6.3, 8, 10, 12.5, 14, 16, 20];
const BLANK_GRANULO_COLUMNS = ["blank_a", "blank_b"];

const FALLBACK_REPORT = {
    essai: {
        type_essai: "CFE",
        reference: "CFE",
        numero_chrono: "18",
        numero_affaire: "RA L1EC",
        date_redaction: "2025-10-10",
        chantier: "VL3 - Albigny sur Saône",
        site: "Avenue de la gare",
        laboratoire: "Région Rhône Alpes - 29-31 rue des Tâches - ZI Mi-Plaine - 69800 SAINT PRIEST",
        operateur: "F. Montet",
        date_essai: "2025-10-10",
        date_mise_en_oeuvre: "Nuit 09-10/10/2025",
        lieu_fabrication: "P2R",
        destination_produit: "Avenue de la gare",
        code_formule: "110",
        appellation_europeenne: "EB 10 ROUL 35/50",
        appellation_francaise: "BBSG 0/10 Cl3 15% AE",
        couche: "Roulement",
        methode_essai: "Extracteur automatique - NEBA",
        source_criteres: "",
        definition_criteres: "",
        conformite_globale: true,
        commentaire: "",
        controle_nom: "F. MONTET",
        controle_fonction: "Technicien de laboratoire"
    },
    mesures: [
        {
            numero_mesure: 1,
            heure: "01:10",
            temperature_mesuree: 177,
            teneur_liant: 5.13,
            module_richesse: 3.19,
            passants: [
                { tamis_mm: 0.063, passant_pourcent: 7.3 },
                { tamis_mm: 0.125, passant_pourcent: 9.3 },
                { tamis_mm: 0.25, passant_pourcent: 12.2 },
                { tamis_mm: 0.5, passant_pourcent: 15.9 },
                { tamis_mm: 1, passant_pourcent: 21.0 },
                { tamis_mm: 2, passant_pourcent: 29.7 },
                { tamis_mm: 4, passant_pourcent: 42.7 },
                { tamis_mm: 6.3, passant_pourcent: 61.5 },
                { tamis_mm: 8, passant_pourcent: 79.2 },
                { tamis_mm: 10, passant_pourcent: 95.5 },
                { tamis_mm: 12.5, passant_pourcent: 100 },
                { tamis_mm: 14, passant_pourcent: null },
                { tamis_mm: 16, passant_pourcent: null },
                { tamis_mm: 20, passant_pourcent: null }
            ]
        },
        { numero_mesure: 2, heure: "", temperature_mesuree: null, teneur_liant: null, module_richesse: null, passants: [] },
        { numero_mesure: 3, heure: "", temperature_mesuree: null, teneur_liant: null, module_richesse: null, passants: [] },
        { numero_mesure: 4, heure: "", temperature_mesuree: null, teneur_liant: null, module_richesse: null, passants: [] }
    ],
    resultats: {
        moyenne_temperature: 177,
        moyenne_teneur_liant: 5.13,
        moyenne_module_richesse: 3.2,
        moyenne_passants: [
            { tamis_mm: 0.063, passant_pourcent: 7.3 },
            { tamis_mm: 0.125, passant_pourcent: 9.3 },
            { tamis_mm: 0.25, passant_pourcent: 12.2 },
            { tamis_mm: 0.5, passant_pourcent: 15.9 },
            { tamis_mm: 1, passant_pourcent: 21.0 },
            { tamis_mm: 2, passant_pourcent: 29.7 },
            { tamis_mm: 4, passant_pourcent: 42.7 },
            { tamis_mm: 6.3, passant_pourcent: 61.5 },
            { tamis_mm: 8, passant_pourcent: 79.2 },
            { tamis_mm: 10, passant_pourcent: 95.5 },
            { tamis_mm: 12.5, passant_pourcent: 100 },
            { tamis_mm: 14, passant_pourcent: null },
            { tamis_mm: 16, passant_pourcent: null },
            { tamis_mm: 20, passant_pourcent: null }
        ]
    },
    criteres: {
        theorique: {
            passants: {
                "0.063": 6.5,
                "0.125": 8.0,
                "0.25": 11.0,
                "0.5": 16.0,
                "1": 21.0,
                "2": 30.0,
                "4": 44.0,
                "6.3": 60.0,
                "8": 76.0,
                "10": 95.0,
                "12.5": 100
            },
            teneurLiant: 5.4,
            moduleRichesse: 3.42
        },
        seuil_mini: {
            passants: {
                "0.063": 4.5,
                "2": 24.0,
                "6.3": 53.0
            },
            teneurLiant: 4.9,
            moduleRichesse: null
        },
        seuil_maxi: {
            passants: {
                "0.063": 8.5,
                "2": 36.0,
                "6.3": 67.0
            },
            teneurLiant: 5.9,
            moduleRichesse: null
        }
    }
};

function cn(...items) {
    return items.filter(Boolean).join(" ");
}

function toNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const parsed = Number(String(value).replace(",", ".").trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value, digits = 1) {
    const numeric = toNumber(value);

    if (numeric === null) {
        return "";
    }

    return numeric.toLocaleString("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatNumberAuto(value) {
    const numeric = toNumber(value);

    if (numeric === null) {
        return "";
    }

    if (Number.isInteger(numeric)) {
        return String(numeric);
    }

    return formatNumber(numeric, 1);
}

function formatDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString("fr-FR");
}

function formatSieve(value) {
    return String(value).replace(".", ",");
}

function normalizePassants(passants) {
    if (Array.isArray(passants)) {
        return passants.reduce((acc, item) => {
            if (item?.tamis_mm !== undefined) {
                acc[String(item.tamis_mm)] = item.passant_pourcent;
            }
            return acc;
        }, {});
    }

    if (!passants || typeof passants !== "object") {
        return {};
    }

    return Object.keys(passants).reduce((acc, key) => {
        acc[String(key)] = passants[key];
        return acc;
    }, {});
}

function getPassant(mapOrArray, sieve) {
    const map = normalizePassants(mapOrArray);
    return map[String(sieve)] ?? null;
}

function getCriteria(report, key) {
    if (key === "seuil_mini") {
        return report?.criteres?.seuil_mini || report?.criteres?.seuilMini || {};
    }

    if (key === "seuil_maxi") {
        return report?.criteres?.seuil_maxi || report?.criteres?.seuilMaxi || {};
    }

    return report?.criteres?.[key] || {};
}

function getCriteriaValue(report, key, field) {
    const criteria = getCriteria(report, key);
    return criteria?.[field] ?? criteria?.[field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null;
}

function getStoredReport() {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = window.localStorage.getItem("ralab_cfe_report_preview")
        || window.localStorage.getItem("ralab_cfe_draft");

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn("Invalid local CFE report preview", error);
        return null;
    }
}

function reportFromResultats(raw) {
    const parsed = parseEssaiResultats(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.essai || parsed.mesures) return parsed;
    if (parsed.worksheet_kind === "cfe") return parsed;
    return null;
}

function makeEmptyMeasure(index) {
    return {
        numero_mesure: index + 1,
        heure: "",
        temperature_mesuree: null,
        teneur_liant: null,
        module_richesse: null,
        passants: []
    };
}

function getReportMeasures(report) {
    const measures = Array.isArray(report?.mesures) ? [...report.mesures] : [];

    while (measures.length < 4) {
        measures.push(makeEmptyMeasure(measures.length));
    }

    return measures.slice(0, 4);
}

function splitSiteTitle(value) {
    const text = String(value || "").trim();

    if (!text) {
        return [""];
    }

    if (text.includes(" - ")) {
        const parts = text.split(" - ");
        return [parts[0] + " -", parts.slice(1).join(" - ")];
    }

    return [text];
}

function PdfText({ x, y, children, className = "", anchor = "start", dominantBaseline = "alphabetic" }) {
    return (
        <text x={x} y={y} textAnchor={anchor} dominantBaseline={dominantBaseline} className={className}>
            {children}
        </text>
    );
}

function MultilineText({ x, y, lines, className = "", anchor = "start", lineHeight = 20 }) {
    return (
        <text x={x} y={y} textAnchor={anchor} className={className}>
            {lines.map((line, index) => (
                <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : lineHeight}>
                    {line}
                </tspan>
            ))}
        </text>
    );
}

function ReportSectionLabel({ number, title, x, y }) {
    return (
        <g className="cfe-svg-section-label">
            <text x={x} y={y}>{number}/</text>
            <text x={x + 34} y={y} className="cfe-svg-underlined">{title}</text>
        </g>
    );
}

function InfoRow({ x, y, leftLabel, leftValue, rightLabel, rightValue }) {
    return (
        <g className="cfe-svg-info-row">
            <text x={x} y={y}>{leftLabel}</text>
            <text x={x + 210} y={y}>{leftValue || ""}</text>
            <text x={x + 460} y={y}>{rightLabel}</text>
            <text x={x + 710} y={y}>{rightValue || ""}</text>
        </g>
    );
}

function HeaderMeta({ essai }) {
    const date = formatDate(essai.date_redaction);

    return (
        <g className="cfe-svg-header-meta">
            <text x="343" y="172" textAnchor="middle">{essai.reference || "CFE"}</text>
            <text x="424" y="172" textAnchor="middle">n°</text>
            <text x="480" y="172" textAnchor="middle">{essai.numero_chrono || ""}</text>
            <line x1="515" y1="156" x2="515" y2="181" className="cfe-svg-stroke" />
            <text x="600" y="172" textAnchor="middle">{essai.numero_affaire || ""}</text>
            <line x1="685" y1="156" x2="685" y2="181" className="cfe-svg-stroke" />
            <text x="795" y="172" textAnchor="middle">{date}</text>
            <text x="480" y="188" textAnchor="middle" className="cfe-svg-meta-label">Chrono</text>
            <text x="600" y="188" textAnchor="middle" className="cfe-svg-meta-label">N° d'affaire</text>
            <text x="795" y="188" textAnchor="middle" className="cfe-svg-meta-label">Date de rédaction</text>
        </g>
    );
}

function ChartSvg({ report }) {
    const plot = { x: 169, y: 596, width: 880, height: 309 };
    const xMin = Math.log10(0.01);
    const xMax = Math.log10(100);
    const yMin = 0;
    const yMax = 100;

    function xScale(sieve) {
        return plot.x + ((Math.log10(Number(sieve)) - xMin) / (xMax - xMin)) * plot.width;
    }

    function yScale(value) {
        return plot.y + (1 - (Number(value) - yMin) / (yMax - yMin)) * plot.height;
    }

    function pointsFrom(passants) {
        return SIEVE_COLUMNS
            .map((sieve) => {
                const value = toNumber(getPassant(passants, sieve));
                return value === null ? null : { sieve, value };
            })
            .filter(Boolean);
    }

    function pathFrom(points) {
        return points.map((point, index) => `${index === 0 ? "M" : "L"}${xScale(point.sieve).toFixed(2)} ${yScale(point.value).toFixed(2)}`).join(" ");
    }

    const measured = pointsFrom(report?.resultats?.moyenne_passants);
    const theoretical = pointsFrom(getCriteria(report, "theorique")?.passants);
    const mini = pointsFrom(getCriteria(report, "seuil_mini")?.passants);
    const maxi = pointsFrom(getCriteria(report, "seuil_maxi")?.passants);
    const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const xTicks = [0.01, 0.1, 1, 10, 100];
    const minorXTicks = [0.02, 0.03, 0.04, 0.05, 0.06, 0.063, 0.08, 0.125, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 2, 3, 4, 5, 6.3, 8, 12.5, 14, 16, 20, 30, 40, 50, 60, 80];

    return (
        <g>
            {yTicks.map((tick) => (
                <g key={`chart-y-${tick}`}>
                    <line x1={plot.x} x2={plot.x + plot.width} y1={yScale(tick)} y2={yScale(tick)} className="cfe-svg-chart-grid" />
                    <text x="156" y={yScale(tick) + 5} textAnchor="end" className="cfe-svg-chart-tick">{formatNumber(tick, 1)}</text>
                </g>
            ))}
            {minorXTicks.map((tick) => (
                <line key={`chart-minor-x-${tick}`} x1={xScale(tick)} x2={xScale(tick)} y1={plot.y} y2={plot.y + plot.height} className="cfe-svg-chart-minor" />
            ))}
            {xTicks.map((tick) => (
                <g key={`chart-x-${tick}`}>
                    <line x1={xScale(tick)} x2={xScale(tick)} y1={plot.y} y2={plot.y + plot.height} className="cfe-svg-chart-major" />
                    <text x={xScale(tick)} y="937" textAnchor="middle" className="cfe-svg-chart-tick">{formatNumber(tick, 3)}</text>
                </g>
            ))}
            <rect x={plot.x} y={plot.y} width={plot.width} height={plot.height} className="cfe-svg-chart-border" />
            {mini.length > 1 ? <path d={pathFrom(mini)} className="cfe-svg-chart-limit" /> : null}
            {maxi.length > 1 ? <path d={pathFrom(maxi)} className="cfe-svg-chart-limit" /> : null}
            {theoretical.length > 1 ? <path d={pathFrom(theoretical)} className="cfe-svg-chart-theoretical" /> : null}
            {measured.length > 1 ? <path d={pathFrom(measured)} className="cfe-svg-chart-measured" /> : null}
            {measured.map((point) => (
                <circle key={`m-${point.sieve}`} cx={xScale(point.sieve)} cy={yScale(point.value)} r="3.2" className="cfe-svg-chart-measured-dot" />
            ))}
            {theoretical.map((point) => (
                <rect key={`t-${point.sieve}`} x={xScale(point.sieve) - 3.4} y={yScale(point.value) - 3.4} width="6.8" height="6.8" className="cfe-svg-chart-theoretical-dot" />
            ))}
            {mini.map((point) => (
                <line key={`min-${point.sieve}`} x1={xScale(point.sieve) - 5} x2={xScale(point.sieve) + 5} y1={yScale(point.value)} y2={yScale(point.value)} className="cfe-svg-chart-black-marker" />
            ))}
            {maxi.map((point) => (
                <line key={`max-${point.sieve}`} x1={xScale(point.sieve) - 5} x2={xScale(point.sieve) + 5} y1={yScale(point.value)} y2={yScale(point.value)} className="cfe-svg-chart-black-marker" />
            ))}
            <text x="609" y="958" textAnchor="middle" className="cfe-svg-chart-axis-label">Tamis (mm)</text>
            <text x="101" y="760" textAnchor="middle" transform="rotate(-90 101 760)" className="cfe-svg-chart-axis-label">Passants (%)</text>
            <rect x="204" y="604" width="188" height="108" fill="#ffffff" stroke="#777777" strokeWidth="1" />
            <line x1="219" x2="249" y1="622" y2="622" className="cfe-svg-chart-measured" />
            <circle cx="234" cy="622" r="3" className="cfe-svg-chart-measured-dot" />
            <text x="258" y="628" className="cfe-svg-chart-legend">courbe moyenne</text>
            <line x1="219" x2="249" y1="650" y2="650" className="cfe-svg-chart-theoretical" />
            <rect x="231" y="647" width="6" height="6" className="cfe-svg-chart-theoretical-dot" />
            <text x="258" y="656" className="cfe-svg-chart-legend">courbe théorique</text>
            <line x1="219" x2="249" y1="678" y2="678" className="cfe-svg-chart-limit" />
            <text x="258" y="684" className="cfe-svg-chart-legend">Seuil mini</text>
            <line x1="219" x2="249" y1="696" y2="696" className="cfe-svg-chart-limit" />
            <text x="258" y="702" className="cfe-svg-chart-legend">Seuil maxi</text>
        </g>
    );
}

function GranuloHeaderCell({ x, y, width, children, className = "" }) {
    return (
        <text x={x + width / 2} y={y} textAnchor="middle" dominantBaseline="middle" className={cn("cfe-svg-table-header-text", className)}>
            {children}
        </text>
    );
}

function GranuloValueCell({ x, y, width, children, className = "" }) {
    return (
        <text x={x + width / 2} y={y} textAnchor="middle" dominantBaseline="middle" className={cn("cfe-svg-table-text", className)}>
            {children}
        </text>
    );
}

function GranuloTableSvg({ report, measures }) {
    const mainX = 98;
    const mainTop = 1029;
    const spannerTop = 1002;
    const mainBottom = 1213;
    const summaryTop = 1228;
    const summaryBottom = 1326;
    const colXs = [98, 140, 224, 266, 307, 349, 391, 433, 474, 516, 558, 600, 642, 683, 725, 767, 809, 850, 892, 976, 1059, 1143];
    const mainRowYs = [1029, 1066, 1103, 1140, 1176, 1213];
    const summaryRowYs = [1228, 1256, 1286, 1307, 1326];
    const allGranuloKeys = [...SIEVE_COLUMNS, ...BLANK_GRANULO_COLUMNS];
    const measuredAverage = report?.resultats?.moyenne_passants || [];
    const theoreticalPassants = getCriteria(report, "theorique")?.passants || {};
    const miniPassants = getCriteria(report, "seuil_mini")?.passants || {};
    const maxiPassants = getCriteria(report, "seuil_maxi")?.passants || {};

    function granuloColumnLeft(index) {
        return colXs[2 + index];
    }

    function granuloColumnWidth(index) {
        return colXs[3 + index] - colXs[2 + index];
    }

    function getColumnValue(data, key) {
        if (typeof key === "string") {
            return "";
        }

        return getPassant(data, key);
    }

    const summaryRows = [
        { label: "Moyenne", data: measuredAverage, temp: report?.resultats?.moyenne_temperature, liant: report?.resultats?.moyenne_teneur_liant, module: report?.resultats?.moyenne_module_richesse, bold: true },
        { label: "Théorique", data: theoreticalPassants, temp: null, liant: getCriteriaValue(report, "theorique", "teneurLiant"), module: getCriteriaValue(report, "theorique", "moduleRichesse"), red: true, bold: true },
        { label: "Seuil maxi", data: maxiPassants, temp: null, liant: getCriteriaValue(report, "seuil_maxi", "teneurLiant"), module: null },
        { label: "Seuil mini", data: miniPassants, temp: null, liant: getCriteriaValue(report, "seuil_mini", "teneurLiant"), module: null }
    ];

    return (
        <g>
            <rect x="224" y={spannerTop} width="668" height="27" fill="#ffffff" className="cfe-svg-table-thick" />
            <text x="558" y="1021" textAnchor="middle" className="cfe-svg-table-spanner">Analyse granulométrique</text>
            <rect x={mainX} y={mainTop} width="1045" height={mainBottom - mainTop} fill="#ffffff" className="cfe-svg-table-thick" />
            {mainRowYs.slice(1, -1).map((y) => (
                <line key={`main-row-${y}`} x1={mainX} x2="1143" y1={y} y2={y} className="cfe-svg-table-stroke" />
            ))}
            {colXs.slice(1, -1).map((x) => (
                <line key={`main-col-${x}`} x1={x} x2={x} y1={mainTop} y2={mainBottom} className={x === 892 ? "cfe-svg-table-thick-line" : "cfe-svg-table-stroke"} />
            ))}
            <GranuloHeaderCell x="98" y="1047" width="42">N°</GranuloHeaderCell>
            <GranuloHeaderCell x="140" y="1047" width="84">Heure</GranuloHeaderCell>
            {SIEVE_COLUMNS.map((sieve, index) => (
                <GranuloHeaderCell key={`head-${sieve}`} x={granuloColumnLeft(index)} y="1047" width={granuloColumnWidth(index)}>
                    {formatSieve(sieve)}
                </GranuloHeaderCell>
            ))}
            <text x="934" y="1042" textAnchor="middle" className="cfe-svg-table-small-header">
                <tspan x="934" dy="0">température</tspan>
                <tspan x="934" dy="14">mesurée</tspan>
            </text>
            <text x="1018" y="1042" textAnchor="middle" className="cfe-svg-table-small-header">
                <tspan x="1018" dy="0">teneur en</tspan>
                <tspan x="1018" dy="14">liant</tspan>
            </text>
            <text x="1101" y="1042" textAnchor="middle" className="cfe-svg-table-small-header">
                <tspan x="1101" dy="0">Module</tspan>
                <tspan x="1101" dy="14">richesse</tspan>
            </text>
            {measures.map((measure, rowIndex) => {
                const y = (mainRowYs[rowIndex + 1] + mainRowYs[rowIndex + 2]) / 2;
                return (
                    <g key={`measure-row-${rowIndex}`}>
                        <GranuloValueCell x="98" y={y} width="42" className="cfe-svg-table-bold">{measure.numero_mesure || rowIndex + 1}</GranuloValueCell>
                        <GranuloValueCell x="140" y={y} width="84">{measure.heure || ""}</GranuloValueCell>
                        {SIEVE_COLUMNS.map((sieve, index) => (
                            <GranuloValueCell key={`measure-${rowIndex}-${sieve}`} x={granuloColumnLeft(index)} y={y} width={granuloColumnWidth(index)}>
                                {formatNumber(getPassant(measure.passants, sieve), 1)}
                            </GranuloValueCell>
                        ))}
                        <GranuloValueCell x="892" y={y} width="84">{formatNumber(measure.temperature_mesuree, 1)}</GranuloValueCell>
                        <GranuloValueCell x="976" y={y} width="83">{formatNumber(measure.teneur_liant, 2)}</GranuloValueCell>
                        <GranuloValueCell x="1059" y={y} width="84">{formatNumber(measure.module_richesse, 2)}</GranuloValueCell>
                    </g>
                );
            })}
            <rect x={mainX} y={summaryTop} width="1045" height={summaryBottom - summaryTop} fill="#ffffff" className="cfe-svg-table-thick" />
            {summaryRowYs.slice(1, -1).map((y) => (
                <line key={`sum-row-${y}`} x1={mainX} x2="1143" y1={y} y2={y} className="cfe-svg-table-stroke" />
            ))}
            {colXs.slice(1, -1).map((x) => (
                <line key={`sum-col-${x}`} x1={x} x2={x} y1={summaryTop} y2={summaryBottom} className={x === 892 ? "cfe-svg-table-thick-line" : "cfe-svg-table-stroke"} />
            ))}
            {summaryRows.map((row, rowIndex) => {
                const y = (summaryRowYs[rowIndex] + summaryRowYs[rowIndex + 1]) / 2;
                return (
                    <g key={`summary-${row.label}`}>
                        <text x="128" y={y + 4} className={cn("cfe-svg-table-text", row.bold ? "cfe-svg-table-bold" : "")}>{row.label}</text>
                        {allGranuloKeys.map((key, index) => (
                            <GranuloValueCell key={`summary-${row.label}-${key}`} x={granuloColumnLeft(index)} y={y} width={granuloColumnWidth(index)} className={cn(row.bold ? "cfe-svg-table-bold" : "", row.red && getColumnValue(row.data, key) !== null ? "cfe-svg-red" : "")}>
                                {formatNumber(getColumnValue(row.data, key), 1)}
                            </GranuloValueCell>
                        ))}
                        <GranuloValueCell x="892" y={y} width="84">{formatNumber(row.temp, 1)}</GranuloValueCell>
                        <GranuloValueCell x="976" y={y} width="83" className={row.red ? "cfe-svg-red cfe-svg-table-bold" : ""}>{formatNumber(row.liant, row.red ? 2 : 1)}</GranuloValueCell>
                        <GranuloValueCell x="1059" y={y} width="84">{formatNumber(row.module, row.red ? 2 : 1)}</GranuloValueCell>
                    </g>
                );
            })}
        </g>
    );
}

function RapportCFEPage({ report: reportFromProps }) {
    const navigate = useNavigate();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const essaiId = String(params.essaiId || searchParams.get("essai_id") || searchParams.get("source_uid") || "").trim();
    const returnTo = resolveReturnTo(searchParams, essaiId ? `/modeles/cfe/${encodeURIComponent(essaiId)}` : "/modeles/cfe");
    const [loadedReport, setLoadedReport] = useState(null);
    const [loading, setLoading] = useState(Boolean(essaiId && /^\d+$/.test(essaiId)));

    useEffect(() => {
        let cancelled = false;
        async function loadEssai() {
            if (reportFromProps) {
                setLoadedReport(reportFromProps);
                setLoading(false);
                return;
            }
            if (!essaiId || !/^\d+$/.test(essaiId)) {
                setLoadedReport(getStoredReport());
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const essai = await essaisApi.get(essaiId);
                if (cancelled) return;
                setLoadedReport(reportFromResultats(essai?.resultats) || getStoredReport());
            } catch {
                if (cancelled) return;
                setLoadedReport(getStoredReport());
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        loadEssai();
        return () => { cancelled = true; };
    }, [essaiId, reportFromProps]);

    const report = useMemo(
        () => reportFromProps || loadedReport || (essaiId ? { essai: { reference: "CFE" }, mesures: [] } : FALLBACK_REPORT),
        [reportFromProps, loadedReport, essaiId],
    );
    const essai = report.essai || FALLBACK_REPORT.essai;
    const measures = getReportMeasures(report);
    const siteLines = splitSiteTitle(essai.chantier);
    const isConforme = essai.conformite_globale !== false;

    return (
        <div className="rapport-cfe-shell">
            <style>{REPORT_CFE_STYLES}</style>
            <div className="rapport-cfe-toolbar no-print">
                <button type="button" onClick={() => navigate(returnTo)}>Retour</button>
                <button type="button" onClick={() => window.print()}>Imprimer / PDF</button>
                {loading ? <span>Chargement…</span> : null}
                {essaiId ? <span>Essai {essaiId}</span> : null}
            </div>
            <article className="rapport-cfe-page" aria-label="Rapport CFE">
                <svg className="rapport-cfe-svg" viewBox="0 0 1191 1684" role="img" aria-label="Compte rendu CFE">
                    <rect x="0" y="0" width="1191" height="1684" fill="#ffffff" />

                    <rect x="57" y="82" width="1086" height="112" className="cfe-svg-border" />
                    <line x1="307" y1="82" x2="307" y2="194" className="cfe-svg-stroke" />
                    <line x1="892" y1="82" x2="892" y2="194" className="cfe-svg-stroke" />
                    <image href={CFE_LOGO_DATA_URL} x="100" y="116" width="170" height="41" preserveAspectRatio="xMidYMid meet" />

                    <text x="600" y="99" textAnchor="middle" className="cfe-svg-title-small">COMPTE RENDU D'ESSAIS</text>
                    <text x="600" y="125" textAnchor="middle" className="cfe-svg-title-main">CONTRÔLE DE FABRICATION DES ENROBÉS</text>
                    <text x="600" y="150" textAnchor="middle" className="cfe-svg-title-main">(NF EN 12697-1 / NF EN 12697-2)</text>
                    <HeaderMeta essai={essai} />
                    <MultilineText x="1018" y="132" lines={siteLines} anchor="middle" className="cfe-svg-site-title" lineHeight="28" />

                    <text x="130" y="227" className="cfe-svg-lab-label">Laboratoire :</text>
                    <text x="402" y="227" className="cfe-svg-lab-text">{essai.laboratoire || ""}</text>

                    <rect x="57" y="249" width="1086" height="170" className="cfe-svg-border" />
                    <ReportSectionLabel number="1" title="RENSEIGNEMENTS GENERAUX" x="72" y="270" />
                    <InfoRow x="104" y="309" leftLabel="Opérateur :" leftValue={essai.operateur} rightLabel="Lieu de fabrication :" rightValue={essai.lieu_fabrication} />
                    <InfoRow x="104" y="334" leftLabel="Date de l'essai :" leftValue={formatDate(essai.date_essai)} rightLabel="Destination du produit" rightValue={essai.destination_produit || essai.site} />
                    <InfoRow x="104" y="359" leftLabel="Date de mise en œuvre :" leftValue={essai.date_mise_en_oeuvre} rightLabel="Code formule :" rightValue={essai.code_formule} />
                    <InfoRow x="104" y="384" leftLabel="Appellation européenne :" leftValue={essai.appellation_europeenne} rightLabel="Couche de :" rightValue={essai.couche} />
                    <InfoRow x="104" y="409" leftLabel="Appellation française :" leftValue={essai.appellation_francaise} rightLabel="Méthode d'essai :" rightValue={essai.methode_essai} />

                    <rect x="57" y="427" width="1086" height="93" className="cfe-svg-border" />
                    <ReportSectionLabel number="2" title="CRITERES DE CONFORMITE" x="72" y="453" />
                    <text x="104" y="488" className="cfe-svg-info-row">Source des critères :</text>
                    <text x="270" y="488" className="cfe-svg-info-row">{essai.source_criteres || ""}</text>
                    <text x="104" y="512" className="cfe-svg-info-row">Définition des critères / objectifs :</text>
                    <text x="392" y="512" className="cfe-svg-info-row">{essai.definition_criteres || ""}</text>

                    <rect x="57" y="527" width="1086" height="808" className="cfe-svg-border" />
                    <ReportSectionLabel number="2" title="RESULTATS DES ESSAIS" x="72" y="552" />
                    <ChartSvg report={report} />
                    <GranuloTableSvg report={report} measures={measures} />

                    <rect x="57" y="1347" width="1086" height="264" className="cfe-svg-border" />
                    <line x1="767" y1="1347" x2="767" y2="1611" className="cfe-svg-stroke" />
                    <line x1="892" y1="1347" x2="892" y2="1611" className="cfe-svg-stroke" />
                    <line x1="57" y1="1496" x2="767" y2="1496" className="cfe-svg-stroke" />
                    <line x1="57" y1="1397" x2="767" y2="1397" className="cfe-svg-dashed" />
                    <line x1="892" y1="1397" x2="1143" y2="1397" className="cfe-svg-stroke" />
                    <line x1="892" y1="1455" x2="1143" y2="1455" className="cfe-svg-stroke" />
                    <line x1="892" y1="1535" x2="1143" y2="1535" className="cfe-svg-stroke" />
                    <ReportSectionLabel number="4" title="CONCLUSIONS" x="72" y="1378" />
                    <text x="370" y="1422" className="cfe-svg-control-text">Contrôle :</text>
                    <text x="370" y="1474" className="cfe-svg-control-text">{isConforme ? "Conforme" : "Non conforme"}</text>
                    <ReportSectionLabel number="5" title="COMMENTAIRES" x="72" y="1525" />
                    <text x="785" y="1422" className="cfe-svg-visa-label">Nom</text>
                    <text x="1018" y="1422" textAnchor="middle" className="cfe-svg-visa-text">{essai.controle_nom || ""}</text>
                    <text x="785" y="1483" className="cfe-svg-visa-label">Fonction</text>
                    <text x="1018" y="1483" textAnchor="middle" className="cfe-svg-visa-text">{essai.controle_fonction || ""}</text>
                    <text x="785" y="1575" className="cfe-svg-visa-label">Visa</text>
                    <text x="1120" y="1654" textAnchor="end" className="cfe-svg-document-code">DG-Q / RE CFE du 28/06/06</text>
                </svg>
            </article>
        </div>
    );
}

export default RapportCFEPage;

const REPORT_CFE_STYLES = `
.rapport-cfe-shell {
    min-height: 100vh;
    padding: 24px;
    background: #e2e8f0;
    font-family: "Century Gothic", Arial, Helvetica, sans-serif;
    color: #111111;
}

.rapport-cfe-toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    width: 210mm;
    margin: 0 auto 12px;
}

.rapport-cfe-toolbar button {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    color: #0f172a;
    padding: 8px 14px;
    font-weight: 700;
    cursor: pointer;
}

.rapport-cfe-page {
    width: 210mm;
    height: 297mm;
    margin: 0 auto;
    background: #ffffff;
    box-shadow: 0 24px 52px rgba(15, 23, 42, 0.22);
}

.rapport-cfe-svg {
    display: block;
    width: 210mm;
    height: 297mm;
    background: #ffffff;
}

.cfe-svg-border,
.cfe-svg-stroke,
.cfe-svg-table-stroke {
    fill: none;
    stroke: #111111;
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-table-thick {
    fill: none;
    stroke: #111111;
    stroke-width: 2.4;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-table-thick-line {
    fill: none;
    stroke: #111111;
    stroke-width: 2.4;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-dashed {
    fill: none;
    stroke: #111111;
    stroke-width: 1.2;
    stroke-dasharray: 4 3;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-title-small {
    font-size: 16px;
    font-weight: 800;
}

.cfe-svg-title-main {
    font-size: 18px;
    font-weight: 900;
}

.cfe-svg-header-meta {
    font-size: 17px;
    font-weight: 800;
}

.cfe-svg-meta-label {
    font-size: 10px;
    font-weight: 500;
}

.cfe-svg-site-title {
    font-size: 23px;
    font-weight: 900;
}

.cfe-svg-lab-label {
    font-size: 18px;
    font-weight: 900;
}

.cfe-svg-lab-text {
    font-size: 18px;
    font-weight: 400;
}

.cfe-svg-section-label {
    font-size: 17px;
    font-weight: 900;
}

.cfe-svg-underlined,
.cfe-svg-visa-label {
    text-decoration: underline;
}

.cfe-svg-info-row {
    font-size: 17px;
    font-weight: 400;
}

.cfe-svg-chart-grid {
    stroke: #111111;
    stroke-width: 0.65;
    opacity: 0.58;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-chart-minor {
    stroke: #111111;
    stroke-width: 0.52;
    opacity: 0.44;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-chart-major {
    stroke: #111111;
    stroke-width: 0.9;
    opacity: 0.70;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-chart-border {
    fill: none;
    stroke: #111111;
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-chart-tick,
.cfe-svg-chart-axis-label,
.cfe-svg-chart-legend {
    font-size: 16px;
    fill: #111111;
}

.cfe-svg-chart-axis-label {
    font-weight: 500;
}

.cfe-svg-chart-measured {
    fill: none;
    stroke: #0000a8;
    stroke-width: 2.0;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-chart-theoretical {
    fill: none;
    stroke: #ff0000;
    stroke-width: 2.0;
    stroke-dasharray: 4 4;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-chart-limit {
    fill: none;
    stroke: #111111;
    stroke-width: 2.0;
    stroke-dasharray: 9 7;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-chart-measured-dot {
    fill: #0000a8;
}

.cfe-svg-chart-theoretical-dot {
    fill: #ff0000;
}

.cfe-svg-chart-black-marker {
    stroke: #111111;
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
}

.cfe-svg-table-spanner {
    font-size: 14px;
    font-weight: 900;
}

.cfe-svg-table-header-text {
    font-size: 10px;
    font-weight: 900;
}

.cfe-svg-table-small-header {
    font-size: 12px;
    font-weight: 500;
}

.cfe-svg-table-text {
    font-size: 16px;
    font-weight: 400;
}

.cfe-svg-table-bold {
    font-weight: 900;
}

.cfe-svg-red {
    fill: #ff0000;
    font-weight: 900;
}

.cfe-svg-control-text {
    font-size: 20px;
    font-weight: 900;
}

.cfe-svg-visa-label {
    font-size: 18px;
    font-weight: 900;
}

.cfe-svg-visa-text {
    font-size: 17px;
    font-weight: 400;
}

.cfe-svg-document-code {
    font-size: 15px;
    font-weight: 400;
}

@media print {
    @page {
        size: A4 portrait;
        margin: 0;
    }

    .rapport-cfe-shell {
        padding: 0;
        background: #ffffff;
    }

    .no-print {
        display: none !important;
    }

    .rapport-cfe-page {
        width: 210mm;
        height: 297mm;
        margin: 0;
        box-shadow: none;
    }

    .rapport-cfe-svg {
        width: 210mm;
        height: 297mm;
    }
}
`;

// RapportMvaPage.jsx
// Path not confirmed: replace or create this file at the real RaLab5 frontend page location.
// Purpose: printable MVA report page, copied from the original NGE MVA Excel/PDF layout.

import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const MVA_STORAGE_KEY = "ralab5:mva:draft";

const defaultMvaDraft = {
    id: "draft",
    header: {
        chronoNumber: "04",
        affairNumber: "RAL1EC",
        reportDate: "2022-07-18",
        reportTitle: "PPI - Réseau vélo express",
        laboratory: "Laboratoire Rhône-Alpes - 29-31 rue des tâches - ZI mi-plaine - 69800 SAINT PRIEST",
        operator: "F. Montet",
        sampleDate: "2022-07-13",
        testDate: "2022-07-18",
        productNature: "BBSG 0/10 Classe 3",
        origin: "P2R F110",
        layer: "Roulement"
    },
    criteria: {
        source: "",
        definition: "4 ≤ %vides ≤ 8%",
        voidsMinPct: "4",
        voidsMaxPct: "8"
    },
    parameters: {
        waterTemperatureC: "21",
        waterDensityKgM3: "998.1",
        paraffinDensityKgM3: "890",
        mvrKgM3: "2447"
    },
    specimens: [
        {
            id: "mva-specimen-1",
            reference: "SC3",
            dryMassG: "1338.6",
            paraffinedDryMassG: "1359.4",
            underwaterMassG: "752.6",
            heightCm: "5",
            comment: ""
        },
        {
            id: "mva-specimen-2",
            reference: "SC5",
            dryMassG: "1584.3",
            paraffinedDryMassG: "1607.7",
            underwaterMassG: "879.1",
            heightCm: "6.5",
            comment: ""
        }
    ],
    conclusion: {
        controlType: "Contrôle",
        manualStatus: "auto",
        comment: ""
    },
    signature: {
        name: "F. MONTET",
        function: "Technicien de laboratoire",
        visa: ""
    }
};

function normalizeDecimalText(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).replace(",", ".").trim();
}

function toNumber(value) {
    const normalized = normalizeDecimalText(value);

    if (normalized === "") {
        return null;
    }

    const parsed = Number(normalized);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return parsed;
}

function roundTo(value, digits = 1) {
    if (!Number.isFinite(value)) {
        return null;
    }

    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function formatDecimal(value, digits = 1) {
    if (!Number.isFinite(value)) {
        return "";
    }

    return value.toLocaleString("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatRawValue(value, maximumFractionDigits = 3) {
    if (value === null || value === undefined || value === "") {
        return "";
    }

    const parsed = toNumber(value);

    if (parsed === null) {
        return String(value);
    }

    return parsed.toLocaleString("fr-FR", {
        maximumFractionDigits
    });
}

function formatDateFr(value) {
    if (!value) {
        return "";
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString("fr-FR");
}

function calculateMvaSpecimen(specimen, parameters, criteria) {
    const dryMassG = toNumber(specimen.dryMassG);
    const paraffinedDryMassG = toNumber(specimen.paraffinedDryMassG);
    const underwaterMassG = toNumber(specimen.underwaterMassG);
    const waterDensityKgM3 = toNumber(parameters.waterDensityKgM3);
    const paraffinDensityKgM3 = toNumber(parameters.paraffinDensityKgM3);
    const mvrKgM3 = toNumber(parameters.mvrKgM3);
    const voidsMinPct = toNumber(criteria.voidsMinPct);
    const voidsMaxPct = toNumber(criteria.voidsMaxPct);

    const canCalculateDensity = dryMassG !== null
        && paraffinedDryMassG !== null
        && underwaterMassG !== null
        && waterDensityKgM3 !== null
        && paraffinDensityKgM3 !== null
        && waterDensityKgM3 > 0
        && paraffinDensityKgM3 > 0
        && paraffinedDryMassG > underwaterMassG
        && paraffinedDryMassG >= dryMassG;

    if (!canCalculateDensity) {
        return {
            densityKgM3: null,
            compacityPct: null,
            voidsPct: null,
            isConform: null
        };
    }

    const apparentVolume = ((paraffinedDryMassG - underwaterMassG) / waterDensityKgM3)
        - ((paraffinedDryMassG - dryMassG) / paraffinDensityKgM3);

    if (!Number.isFinite(apparentVolume) || apparentVolume <= 0) {
        return {
            densityKgM3: null,
            compacityPct: null,
            voidsPct: null,
            isConform: null
        };
    }

    const densityKgM3 = dryMassG / apparentVolume;
    const compacityPct = mvrKgM3 && mvrKgM3 > 0 ? (densityKgM3 / mvrKgM3) * 100 : null;
    const voidsPct = compacityPct !== null ? 100 - compacityPct : null;

    let isConform = null;

    if (voidsPct !== null && voidsMinPct !== null && voidsMaxPct !== null) {
        isConform = voidsPct >= voidsMinPct && voidsPct <= voidsMaxPct;
    }

    return {
        densityKgM3: roundTo(densityKgM3, 1),
        compacityPct: compacityPct !== null ? roundTo(compacityPct, 1) : null,
        voidsPct: voidsPct !== null ? roundTo(voidsPct, 1) : null,
        isConform
    };
}

function calculateMvaDraft(draft) {
    const rows = draft.specimens.map((specimen) => ({
        ...specimen,
        calculated: calculateMvaSpecimen(specimen, draft.parameters, draft.criteria)
    }));

    const completedRows = rows.filter((row) => row.calculated.densityKgM3 !== null);
    const nonConformRows = completedRows.filter((row) => row.calculated.isConform === false);
    const allRowsHaveConformity = completedRows.length > 0
        && completedRows.every((row) => row.calculated.isConform !== null);

    let automaticStatus = "À compléter";

    if (allRowsHaveConformity && nonConformRows.length === 0) {
        automaticStatus = "Conforme";
    }

    if (allRowsHaveConformity && nonConformRows.length > 0) {
        automaticStatus = "Non conforme";
    }

    const status = draft.conclusion.manualStatus && draft.conclusion.manualStatus !== "auto"
        ? draft.conclusion.manualStatus
        : automaticStatus;

    return {
        rows,
        completedRows,
        status
    };
}

function mergeDraft(parsed) {
    return {
        ...defaultMvaDraft,
        ...parsed,
        header: {
            ...defaultMvaDraft.header,
            ...(parsed.header || {})
        },
        criteria: {
            ...defaultMvaDraft.criteria,
            ...(parsed.criteria || {})
        },
        parameters: {
            ...defaultMvaDraft.parameters,
            ...(parsed.parameters || {})
        },
        conclusion: {
            ...defaultMvaDraft.conclusion,
            ...(parsed.conclusion || {})
        },
        signature: {
            ...defaultMvaDraft.signature,
            ...(parsed.signature || {})
        },
        specimens: Array.isArray(parsed.specimens) && parsed.specimens.length > 0
            ? parsed.specimens
            : defaultMvaDraft.specimens
    };
}

function readStoredDraft() {
    if (typeof window === "undefined") {
        return defaultMvaDraft;
    }

    try {
        const raw = window.localStorage.getItem(MVA_STORAGE_KEY);

        if (!raw) {
            return defaultMvaDraft;
        }

        return mergeDraft(JSON.parse(raw));
    } catch (error) {
        console.warn("Unable to read the stored MVA draft.", error);
        return defaultMvaDraft;
    }
}

function valueOrDash(value) {
    return value || "";
}

function buildPrintableRows(rows, expectedLength = 5) {
    const printableRows = rows.slice(0, expectedLength);

    while (printableRows.length < expectedLength) {
        printableRows.push({
            id: `empty-${printableRows.length}`,
            reference: "",
            dryMassG: "",
            paraffinedDryMassG: "",
            underwaterMassG: "",
            heightCm: "",
            calculated: {
                densityKgM3: null,
                compacityPct: null,
                voidsPct: null
            }
        });
    }

    return printableRows;
}

function NgeLogo() {
    return (
        <svg className="mva-exact-logo" viewBox="0 0 170 54" role="img" aria-label="NGE">
            <rect x="0" y="0" width="170" height="54" fill="white" />
            <path d="M18 35 L133 35 L141 29 L151 29 L143 41 L18 41 Z" fill="#d62828" />
            <path d="M21 12 L45 12 L69 31 L69 12 L91 12 L91 39 L66 39 L43 21 L43 39 L21 39 Z" fill="#063f8f" />
            <path d="M96 12 L150 12 L150 21 L119 21 L119 24 L146 24 L146 31 L119 31 L119 39 L96 39 Z" fill="#063f8f" />
        </svg>
    );
}

function SectionTitle({ number, children }) {
    return (
        <div className="mva-exact-section-title">
            <span className="mva-exact-section-number">{number}/</span>
            <span className="mva-exact-section-text">{children}</span>
        </div>
    );
}

function FieldRow({ label, value }) {
    return (
        <div className="mva-exact-field-row">
            <span>{label}</span>
            <strong>{valueOrDash(value)}</strong>
        </div>
    );
}

function ParameterBox({ rows }) {
    return (
        <div className="mva-exact-parameter-box">
            {rows.map((row, index) => (
                <div className="mva-exact-parameter-row" key={`${row.label}-${index}`}>
                    <div className="mva-exact-parameter-label">{row.label}</div>
                    <div className="mva-exact-parameter-value">{row.value}</div>
                    <div className="mva-exact-parameter-unit">{row.unit}</div>
                </div>
            ))}
        </div>
    );
}

export default function RapportMvaPage() {
    const navigate = useNavigate();
    const { essaiId } = useParams();
    const [draft] = useState(() => readStoredDraft());

    const computed = useMemo(() => calculateMvaDraft(draft), [draft]);
    const printableRows = useMemo(() => buildPrintableRows(computed.rows, 5), [computed.rows]);

    const header = draft.header;
    const criteria = draft.criteria;
    const parameters = draft.parameters;
    const conclusion = draft.conclusion;
    const signature = draft.signature;

    return (
        <main className="mva-exact-report-screen">
            <style>{mvaExactReportStyles}</style>

            <div className="mva-exact-toolbar">
                <div>
                    <strong>Rapport MVA</strong>
                    <span>{essaiId ? `Essai ${essaiId}` : "Brouillon local"}</span>
                </div>
                <div className="mva-exact-toolbar-actions">
                    <button type="button" onClick={() => navigate(-1)}>Retour</button>
                    <button type="button" onClick={() => window.print()}>Imprimer / PDF</button>
                </div>
            </div>

            <section className="mva-exact-page" aria-label="Rapport MVA imprimable">
                <div className="mva-exact-header">
                    <div className="mva-exact-header-logo-cell">
                        <NgeLogo />
                    </div>

                    <div className="mva-exact-header-title-cell">
                        <div className="mva-exact-report-label">COMPTE RENDU D'ESSAIS</div>
                        <div className="mva-exact-main-title">MASSE VOLUMIQUE DES ENROBES</div>
                        <div className="mva-exact-standard-title">(NF EN 12697-6-A1)</div>
                        <div className="mva-exact-header-meta">
                            <div>
                                <small>n°</small>
                                <strong>{valueOrDash(header.chronoNumber)}</strong>
                                <span>Chrono</span>
                            </div>
                            <div>
                                <strong>{valueOrDash(header.affairNumber)}</strong>
                                <span>N° d'affaire</span>
                            </div>
                            <div>
                                <strong>{formatDateFr(header.reportDate)}</strong>
                                <span>Date de rédaction</span>
                            </div>
                        </div>
                    </div>

                    <div className="mva-exact-header-project-cell">
                        {valueOrDash(header.reportTitle)}
                    </div>
                </div>

                <div className="mva-exact-lab-line">
                    <strong>Laboratoire :</strong>
                    <span>{valueOrDash(header.laboratory)}</span>
                </div>

                <div className="mva-exact-section mva-exact-section-general">
                    <SectionTitle number="1">RENSEIGNEMENTS GENERAUX</SectionTitle>
                    <div className="mva-exact-general-grid">
                        <div>
                            <FieldRow label="Opérateur :" value={header.operator} />
                            <FieldRow label="Date de(s) prélèvement(s) :" value={formatDateFr(header.sampleDate)} />
                            <FieldRow label="Date de(s) essai(s) :" value={formatDateFr(header.testDate)} />
                        </div>
                        <div>
                            <FieldRow label="Nature du produit :" value={header.productNature} />
                            <FieldRow label="Provenance :" value={header.origin} />
                            <FieldRow label="Couche :" value={header.layer} />
                        </div>
                    </div>
                </div>

                <div className="mva-exact-section mva-exact-section-criteria">
                    <SectionTitle number="2">CRITERES DE CONFORMITE</SectionTitle>
                    <div className="mva-exact-criteria-lines">
                        <FieldRow label="Source des critères :" value={criteria.source} />
                        <FieldRow label="Définition des critères / objectifs :" value={criteria.definition} />
                    </div>
                </div>

                <div className="mva-exact-section mva-exact-section-results">
                    <SectionTitle number="3">RESULTATS DES ESSAIS</SectionTitle>

                    <div className="mva-exact-parameters-left">
                        <ParameterBox
                            rows={[
                                {
                                    label: "Température mesurée\nde l'eau :\n(±1 - °C)",
                                    value: formatRawValue(parameters.waterTemperatureC, 1),
                                    unit: "°C"
                                },
                                {
                                    label: "Masse volumique de\nl'eau :",
                                    value: formatRawValue(parameters.waterDensityKgM3, 1),
                                    unit: "kg/m3"
                                }
                            ]}
                        />
                    </div>

                    <div className="mva-exact-parameters-right">
                        <ParameterBox
                            rows={[
                                {
                                    label: "Masse volumique de\nla paraffine:",
                                    value: formatRawValue(parameters.paraffinDensityKgM3, 1),
                                    unit: "kg/m3"
                                },
                                {
                                    label: "MVR :",
                                    value: formatRawValue(parameters.mvrKgM3, 1),
                                    unit: "kg/m3"
                                }
                            ]}
                        />
                    </div>

                    <table className="mva-exact-results-table">
                        <thead>
                            <tr>
                                <th>Référence de<br />l'éprouvette</th>
                                <th>Masse séche<br />(g)</th>
                                <th>Masse sèche<br />paraffinée<br />(g)</th>
                                <th>Masse dans<br />l'eau<br />(g)</th>
                                <th>Masse<br />volumique de<br />l'éprouvette<br />(kg/m3)</th>
                                <th>Compacité %</th>
                                <th>% vides</th>
                                <th>Hauteur de<br />l'éprouvette<br />(cm)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {printableRows.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.reference}</td>
                                    <td>{formatRawValue(row.dryMassG, 1)}</td>
                                    <td>{formatRawValue(row.paraffinedDryMassG, 1)}</td>
                                    <td>{formatRawValue(row.underwaterMassG, 1)}</td>
                                    <td>{formatDecimal(row.calculated.densityKgM3, 1)}</td>
                                    <td>{formatDecimal(row.calculated.compacityPct, 1)}</td>
                                    <td>{formatDecimal(row.calculated.voidsPct, 1)}</td>
                                    <td>{formatRawValue(row.heightCm, 1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mva-exact-bottom-box">
                    <SectionTitle number="4">CONCLUSIONS</SectionTitle>
                    <div className="mva-exact-conclusion-dashed" />
                    <div className="mva-exact-conclusion-value">
                        <strong>{valueOrDash(conclusion.controlType)}</strong>
                        <strong>{computed.status}</strong>
                    </div>

                    <div className="mva-exact-comments-title">
                        <SectionTitle number="7">COMMENTAIRES</SectionTitle>
                    </div>
                    <div className="mva-exact-comments-text">{valueOrDash(conclusion.comment)}</div>

                    <div className="mva-exact-signature-labels">
                        <div>Nom</div>
                        <div>Fonction</div>
                        <div>Visa</div>
                    </div>
                    <div className="mva-exact-signature-values">
                        <div>{valueOrDash(signature.name)}</div>
                        <div>{valueOrDash(signature.function)}</div>
                        <div>{valueOrDash(signature.visa)}</div>
                    </div>
                </div>

                <div className="mva-exact-footer-code">DG-Q / RE ID du 28/06/06</div>
            </section>
        </main>
    );
}

const mvaExactReportStyles = `
.mva-exact-report-screen {
    min-height: 100vh;
    padding: 24px;
    background: #e5e7eb;
    color: #111111;
    box-sizing: border-box;
}

.mva-exact-toolbar {
    width: min(210mm, calc(100vw - 48px));
    margin: 0 auto 16px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid #d6dce8;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 14px 35px rgba(15, 23, 42, 0.12);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.mva-exact-toolbar strong,
.mva-exact-toolbar span {
    display: block;
}

.mva-exact-toolbar strong {
    font-size: 14px;
    color: #0f172a;
}

.mva-exact-toolbar span {
    margin-top: 2px;
    font-size: 12px;
    color: #64748b;
}

.mva-exact-toolbar-actions {
    display: flex;
    gap: 8px;
}

.mva-exact-toolbar button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    color: #0f172a;
    font-weight: 700;
    cursor: pointer;
}

.mva-exact-toolbar button:last-child {
    border-color: #002c77;
    background: #002c77;
    color: #ffffff;
}

.mva-exact-page {
    position: relative;
    width: 210mm;
    height: 297mm;
    margin: 0 auto;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 20px 55px rgba(15, 23, 42, 0.24);
    font-family: "Century Gothic", Arial, Helvetica, sans-serif;
    font-size: 7.2pt;
    line-height: 1.12;
}

.mva-exact-header {
    position: absolute;
    left: 3.8mm;
    top: 3.8mm;
    width: 202.4mm;
    height: 21mm;
    display: grid;
    grid-template-columns: 46.8mm 108.8mm 46.8mm;
    border: 0.28mm solid #000000;
    box-sizing: border-box;
}

.mva-exact-header-logo-cell,
.mva-exact-header-title-cell,
.mva-exact-header-project-cell {
    min-width: 0;
    height: 100%;
    box-sizing: border-box;
}

.mva-exact-header-logo-cell {
    display: flex;
    align-items: center;
    justify-content: center;
}

.mva-exact-logo {
    width: 31mm;
    height: auto;
    display: block;
}

.mva-exact-header-title-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    border-left: 0.28mm solid #000000;
    border-right: 0.28mm solid #000000;
    text-align: center;
    padding-top: 1.1mm;
}

.mva-exact-report-label {
    font-size: 6.6pt;
    font-weight: 700;
}

.mva-exact-main-title {
    margin-top: 0.8mm;
    font-size: 8.2pt;
    font-weight: 800;
}

.mva-exact-standard-title {
    margin-top: 0.4mm;
    font-size: 8.2pt;
    font-weight: 800;
}

.mva-exact-header-meta {
    width: 61mm;
    margin-top: 1mm;
    display: grid;
    grid-template-columns: 1fr 1.25fr 1.35fr;
    align-items: start;
    font-size: 5pt;
}

.mva-exact-header-meta div {
    min-height: 5.8mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
}

.mva-exact-header-meta div + div {
    border-left: 0.28mm solid #000000;
}

.mva-exact-header-meta small {
    min-height: 1.8mm;
    font-size: 5pt;
    line-height: 1;
}

.mva-exact-header-meta strong {
    font-size: 7pt;
    line-height: 1;
}

.mva-exact-header-meta span {
    margin-top: 0.4mm;
    font-size: 4.6pt;
    line-height: 1;
}

.mva-exact-header-project-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 5mm;
    text-align: center;
    white-space: pre-line;
    font-size: 11pt;
    font-weight: 800;
    line-height: 1.18;
}

.mva-exact-lab-line {
    position: absolute;
    left: 17.5mm;
    top: 28.4mm;
    width: 178mm;
    display: grid;
    grid-template-columns: 46mm 1fr;
    align-items: baseline;
    font-size: 7.2pt;
}

.mva-exact-lab-line strong {
    font-weight: 800;
}

.mva-exact-lab-line span {
    text-align: left;
}

.mva-exact-section {
    position: absolute;
    left: 3.8mm;
    width: 202.4mm;
    border: 0.28mm solid #000000;
    box-sizing: border-box;
}

.mva-exact-section-general {
    top: 35.1mm;
    height: 22.2mm;
}

.mva-exact-section-criteria {
    top: 61.2mm;
    height: 19.8mm;
}

.mva-exact-section-results {
    top: 85.1mm;
    height: 96.8mm;
}

.mva-exact-section-title {
    position: absolute;
    left: 2.2mm;
    top: 2mm;
    display: inline-flex;
    align-items: baseline;
    gap: 3mm;
    white-space: nowrap;
    font-size: 7pt;
}

.mva-exact-section-number {
    font-weight: 700;
}

.mva-exact-section-text {
    font-weight: 800;
    text-decoration: underline;
}

.mva-exact-general-grid {
    position: absolute;
    left: 8.3mm;
    top: 7.7mm;
    width: 180mm;
    display: grid;
    grid-template-columns: 78mm 78mm;
    column-gap: 15mm;
}

.mva-exact-field-row {
    display: grid;
    grid-template-columns: 46mm 1fr;
    min-height: 3.6mm;
    align-items: baseline;
}

.mva-exact-field-row span {
    font-weight: 400;
}

.mva-exact-field-row strong {
    font-weight: 400;
}

.mva-exact-criteria-lines {
    position: absolute;
    left: 8.3mm;
    top: 8.3mm;
    width: 180mm;
}

.mva-exact-parameters-left,
.mva-exact-parameters-right {
    position: absolute;
    top: 21.2mm;
    width: 85.9mm;
    height: 21.4mm;
}

.mva-exact-parameters-left {
    left: 7.7mm;
}

.mva-exact-parameters-right {
    right: 7.7mm;
}

.mva-exact-parameter-box {
    width: 100%;
    height: 100%;
    border: 0.28mm solid #000000;
    box-sizing: border-box;
}

.mva-exact-parameter-row {
    height: 50%;
    display: grid;
    grid-template-columns: 37mm 21mm 1fr;
    align-items: center;
    box-sizing: border-box;
}

.mva-exact-parameter-row + .mva-exact-parameter-row {
    border-top: 0.28mm solid #000000;
}

.mva-exact-parameter-label {
    padding: 0 2.2mm;
    text-align: center;
    white-space: pre-line;
    font-size: 6.4pt;
    font-weight: 800;
    line-height: 1.05;
}

.mva-exact-parameter-value {
    text-align: center;
    font-size: 6.8pt;
    font-weight: 800;
}

.mva-exact-parameter-unit {
    padding-right: 2mm;
    text-align: left;
    font-size: 6.8pt;
    font-weight: 800;
}

.mva-exact-results-table {
    position: absolute;
    left: 7.7mm;
    top: 51.1mm;
    width: 187mm;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 6.6pt;
}

.mva-exact-results-table th,
.mva-exact-results-table td {
    border: 0.28mm solid #000000;
    text-align: center;
    vertical-align: middle;
    padding: 0.7mm 0.8mm;
    box-sizing: border-box;
}

.mva-exact-results-table th {
    height: 15.6mm;
    font-weight: 800;
    line-height: 1.05;
}

.mva-exact-results-table td {
    height: 7mm;
    font-weight: 400;
}

.mva-exact-bottom-box {
    position: absolute;
    left: 3.8mm;
    top: 185.5mm;
    width: 202.4mm;
    height: 48.6mm;
    border: 0.28mm solid #000000;
    box-sizing: border-box;
}

.mva-exact-conclusion-dashed {
    position: absolute;
    left: 0;
    top: 8.3mm;
    width: 132.2mm;
    border-top: 0.28mm dashed #000000;
}

.mva-exact-conclusion-value {
    position: absolute;
    left: 0;
    top: 8.6mm;
    width: 132.2mm;
    height: 17.1mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4mm;
    border-bottom: 0.28mm solid #000000;
    box-sizing: border-box;
    font-size: 6.8pt;
}

.mva-exact-comments-title {
    position: absolute;
    left: 0;
    top: 25.7mm;
    width: 132.2mm;
    height: 7mm;
}

.mva-exact-comments-title .mva-exact-section-title {
    left: 2.2mm;
    top: 1.3mm;
}

.mva-exact-comments-text {
    position: absolute;
    left: 3mm;
    top: 33mm;
    width: 126mm;
    height: 12mm;
    overflow: hidden;
    white-space: pre-wrap;
    font-size: 6.7pt;
    line-height: 1.2;
}

.mva-exact-signature-labels {
    position: absolute;
    left: 132.2mm;
    top: 8.6mm;
    width: 22.8mm;
    height: 40mm;
    display: grid;
    grid-template-rows: 13.3mm 13.3mm 13.4mm;
    border-left: 0.28mm solid #000000;
    box-sizing: border-box;
    font-size: 6.8pt;
    font-weight: 800;
}

.mva-exact-signature-labels div {
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: underline;
}

.mva-exact-signature-values {
    position: absolute;
    left: 155mm;
    top: 8.6mm;
    width: 47.4mm;
    height: 40mm;
    display: grid;
    grid-template-rows: 13.3mm 13.3mm 13.4mm;
    box-sizing: border-box;
    font-size: 6.8pt;
}

.mva-exact-signature-values div {
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 0.28mm solid #000000;
    border-left: 0.28mm solid #000000;
    box-sizing: border-box;
    text-align: center;
}

.mva-exact-signature-values div:first-child {
    border-top: 0.28mm solid #000000;
}

.mva-exact-signature-values div + div {
    border-top: 0.28mm solid #000000;
}

.mva-exact-footer-code {
    position: absolute;
    right: 14.5mm;
    bottom: 15.5mm;
    font-size: 6pt;
}

@media print {
    @page {
        size: A4 portrait;
        margin: 0;
    }

    html,
    body,
    #root {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        padding: 0;
        background: #ffffff;
    }

    .mva-exact-report-screen {
        min-height: 297mm;
        padding: 0;
        background: #ffffff;
    }

    .mva-exact-toolbar {
        display: none;
    }

    .mva-exact-page {
        width: 210mm;
        height: 297mm;
        margin: 0;
        box-shadow: none;
        page-break-after: always;
    }
}
`;

export {
    MVA_STORAGE_KEY,
    defaultMvaDraft,
    calculateMvaDraft,
    calculateMvaSpecimen,
    formatDecimal,
    formatRawValue,
    toNumber
};

// RapportHeader.jsx
import React from "react";

const DEFAULT_LABORATORY = "Laboratoire Rhône Auvergne - 29-31 rue des tâches - ZI mi-plaine - 69800 SAINT PRIEST";

function valueOrDash(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    return value;
}

function renderMultiline(value) {
    const safeValue = valueOrDash(value);

    return String(safeValue).split("\n").map((line, index) => (
        <div key={`${line}-${index}`}>{line}</div>
    ));
}

function extractReportTypeCode(reportTypeLabel = "") {
    const text = String(reportTypeLabel || "").trim();
    if (!text) return "-";
    return text.replace(/\s*n°.*$/i, "").trim() || text;
}

function formatReportNumberValue(reportNumber, reportTypeLabel = "") {
    const raw = valueOrDash(reportNumber);
    if (raw === "-") return raw;

    const typeCode = extractReportTypeCode(reportTypeLabel);
    let normalized = String(raw).trim();

    if (typeCode && normalized.toUpperCase().startsWith(`${typeCode.toUpperCase()} `)) {
        normalized = normalized.slice(typeCode.length).trim();
    } else if (typeCode && normalized.toUpperCase().startsWith(typeCode.toUpperCase())) {
        normalized = normalized.slice(typeCode.length).trim();
    }

    return normalized.replace(/^n°\s*/i, "").trim() || raw;
}

export default function RapportHeader({
    logoSrc = "/assets/logos/nge-logo.png",
    logoAlt = "NGE",
    reportTypeLabel = "Rapport n°",
    reportNumber = "",
    chronoNumber = "",
    affaireNumber = "",
    editionDate = "",
    siteTitle = "",
    mainTitle,
    title,
    subtitle = "",
    standardLabel = "",
    laboratory,
    laboratoire,
    // Legacy aliases used by some report pages
    chrono,
    affaire,
    dateRedaction,
    reportCode,
    essaiCode,
    chantier,
    site,
}) {
    const resolvedMainTitle = mainTitle || title || "COMPTE RENDU D'ESSAIS";
    const resolvedLaboratory = laboratory || laboratoire || DEFAULT_LABORATORY;
    const resolvedSiteTitle = siteTitle || chantier || site || "";
    const resolvedAffaireNumber = affaireNumber || affaire || "";
    const resolvedEditionDate = editionDate || dateRedaction || "";
    const resolvedReportTypeLabel = reportTypeLabel || `${reportCode || essaiCode || "Rapport"} n°`;
    const reportNumberValue = formatReportNumberValue(reportNumber, resolvedReportTypeLabel);

    return (
        <header className="rapport-header">
            <div className="rapport-header-main-grid">
                <div className="rapport-logo-cell">
                    <img
                        className="rapport-logo"
                        src={logoSrc}
                        alt={logoAlt}
                        onError={(event) => {
                            event.currentTarget.style.display = "none";
                            const fallback = event.currentTarget.nextElementSibling;

                            if (fallback) {
                                fallback.style.display = "inline-flex";
                            }
                        }}
                    />
                    <span className="rapport-logo-fallback">NGE</span>
                </div>

                <div className="rapport-title-cell">
                    <div className="rapport-title-block">
                        <div className="rapport-main-title">{resolvedMainTitle}</div>
                        {subtitle ? <div className="rapport-subtitle">{subtitle}</div> : null}
                        {standardLabel ? <div className="rapport-standard">{standardLabel}</div> : null}
                    </div>

                    <div className="rapport-reference-grid">
                        <div className="rapport-reference-item rapport-reference-item-sc">
                            <div className="rapport-reference-sc-row">
                                <span className="rapport-reference-type-label">{resolvedReportTypeLabel}</span>
                                <span className="rapport-reference-number-stack">
                                    <strong>{valueOrDash(reportNumberValue)}</strong>
                                    <span className="rapport-reference-field-label">Chrono</span>
                                </span>
                            </div>
                        </div>
                        <div className="rapport-reference-item">
                            <strong>{valueOrDash(resolvedAffaireNumber)}</strong>
                            <span className="rapport-reference-field-label">N° d'affaire</span>
                        </div>
                        <div className="rapport-reference-item">
                            <strong>{valueOrDash(resolvedEditionDate)}</strong>
                            <span className="rapport-reference-field-label">Date de rédaction</span>
                        </div>
                    </div>
                </div>

                <div className="rapport-site-cell">
                    {renderMultiline(resolvedSiteTitle)}
                </div>
            </div>

            <div className="rapport-laboratory-line">
                <span>Laboratoire :</span>
                <strong>{valueOrDash(resolvedLaboratory)}</strong>
            </div>
        </header>
    );
}

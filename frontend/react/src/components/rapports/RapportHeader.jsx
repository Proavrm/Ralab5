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

export default function RapportHeader({
    logoSrc = "/assets/logos/nge-logo.png",
    logoAlt = "NGE",
    reportTypeLabel = "Rapport n°",
    reportNumber = "",
    chronoNumber = "",
    affaireNumber = "",
    editionDate = "",
    siteTitle = "",
    mainTitle = "COMPTE RENDU D'ESSAIS",
    subtitle = "",
    standardLabel = "",
    laboratory = DEFAULT_LABORATORY,
}) {
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
                    <div className="rapport-main-title">{mainTitle}</div>
                    {subtitle ? <div className="rapport-subtitle">{subtitle}</div> : null}
                    {standardLabel ? <div className="rapport-standard">{standardLabel}</div> : null}

                    <div className="rapport-reference-grid">
                        <div className="rapport-reference-item">
                            <span>{reportTypeLabel}</span>
                            <strong>{valueOrDash(reportNumber)}</strong>
                        </div>
                        <div className="rapport-reference-item">
                            <span>N°Chrono</span>
                            <strong>{valueOrDash(chronoNumber)}</strong>
                        </div>
                        <div className="rapport-reference-item">
                            <span>N° d'affaire</span>
                            <strong>{valueOrDash(affaireNumber)}</strong>
                        </div>
                        <div className="rapport-reference-item">
                            <span>Date de rédaction</span>
                            <strong>{valueOrDash(editionDate)}</strong>
                        </div>
                    </div>
                </div>

                <div className="rapport-site-cell">
                    {renderMultiline(siteTitle)}
                </div>
            </div>

            <div className="rapport-laboratory-line">
                <span>Laboratoire :</span>
                <strong>{valueOrDash(laboratory)}</strong>
            </div>
        </header>
    );
}

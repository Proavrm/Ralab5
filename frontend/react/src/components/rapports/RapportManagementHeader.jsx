// FILE: RapportManagementHeader.jsx
// Common administrative header and management panel for report pages.

function getStatusLabel(status) {
    return status === "approved" ? "Approuvé" : "Brouillon";
}

function getStatusClass(status) {
    return status === "approved"
        ? "border-[#b7d69a] bg-[#f0f8e9] text-[#3b6d11]"
        : "border-[#f0c36d] bg-[#fff8e8] text-[#8a5c11]";
}

function RapportManagementHeader({
    reportCode,
    description,
    reports = [],
    selectedReportId,
    selectedReport,
    reference,
    status = "draft",
    onSelectReport,
    onCreateReport,
    onReferenceChange,
    onStatusChange,
}) {
    return (
        <>
            <section className="rapport-management-page-header">
                <div className="rapport-management-page-header-main">
                    <div>
                        <div className="rapport-management-eyebrow">
                            Gestion du rapport
                        </div>

                        <h1 className="rapport-management-title">
                            Rapport — {reportCode}
                        </h1>

                        <p className="rapport-management-description">
                            {description || "Référence, statut et préparation du rapport avant édition, impression ou diffusion."}
                        </p>
                    </div>

                    <div className="rapport-management-badges">
                        <span className="rapport-management-badge">
                            Rapport : {reportCode}
                        </span>

                        <span className={`rapport-management-badge ${getStatusClass(status)}`}>
                            {getStatusLabel(status)}
                        </span>
                    </div>
                </div>
            </section>

            <section className="rapport-management-panel">
                <div className="rapport-management-list-card">
                    <div className="rapport-management-card-title">
                        Rapports {reportCode}
                    </div>

                    <div className="rapport-management-report-list">
                        {reports.length ? (
                            reports.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onSelectReport?.(item.id)}
                                    className={`rapport-management-report-button ${
                                        String(selectedReportId) === String(item.id)
                                            ? "rapport-management-report-button-active"
                                            : ""
                                    }`}
                                >
                                    <div className="rapport-management-report-reference">
                                        {item.reference || item.id}
                                    </div>

                                    <div className="rapport-management-report-status">
                                        {getStatusLabel(item.status)}
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="rapport-management-empty">
                                Aucun rapport {reportCode}.
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onCreateReport}
                        className="rapport-management-new-button"
                    >
                        + Nouveau rapport
                    </button>
                </div>

                <div className="rapport-management-edit-card">
                    {selectedReport ? (
                        <div className="rapport-management-edit-grid">
                            <label className="rapport-management-reference-field">
                                <span>Référence rapport</span>

                                <input
                                    value={reference || ""}
                                    onChange={(event) => onReferenceChange?.(event.target.value)}
                                />
                            </label>

                            <div className="rapport-management-status-block">
                                <span>
                                    Statut rapport :{" "}
                                    <strong className={status === "approved" ? "text-[#3b6d11]" : "text-[#8a5c11]"}>
                                        {getStatusLabel(status)}
                                    </strong>
                                </span>

                                <div className="rapport-management-status-actions">
                                    <button
                                        type="button"
                                        onClick={() => onStatusChange?.("approved")}
                                        disabled={status === "approved"}
                                        className="rapport-management-primary-button"
                                    >
                                        Approuver rapport
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => onStatusChange?.("draft")}
                                        disabled={status === "draft"}
                                        className="rapport-management-secondary-button"
                                    >
                                        Rapport brouillon
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="rapport-management-empty">
                            Crée un rapport {reportCode} pour gérer sa référence et son statut.
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}

export default RapportManagementHeader;
// ValiderRapportsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { rapportsValidationApi } from "@/services/api";

const STATUS = {
    all: "Tous",
    draft: "Brouillon",
    toValidate: "À valider",
    correctionRequested: "Correction demandée",
    technicallyValidated: "Validé technique",
    issued: "Émis",
    rejected: "Refusé"
};


function classNames(...items) {
    return items.filter(Boolean).join(" ");
}

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizeHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) {
        return [];
    }

    return rawHistory.map((item, index) => ({
        id: item.id || `${item.time || "event"}-${index}`,
        user: item.user || item.utilisateur || item.created_by || "RaLab",
        action: item.action || item.event_type || item.label || "Action",
        time: item.time || item.created_at || item.date || ""
    }));
}

function normalizeReport(rawReport) {
    const id = rawReport.id || rawReport.uid || rawReport.rapport_ref || rawReport.reference || "rapport-sans-reference";

    return {
        id: String(id),
        uid: String(rawReport.uid || rawReport.id || id),
        type: rawReport.type || rawReport.essai_type || rawReport.essai_code || "RPT",
        title: rawReport.title || rawReport.titre || rawReport.designation || rawReport.essai_title || "Rapport d’essai",
        affair: rawReport.affair || rawReport.affaire || rawReport.affaire_ref || rawReport.affaire_rst || "non communiqué",
        client: rawReport.client || rawReport.client_name || "Client non renseigné",
        site: rawReport.site || rawReport.chantier || rawReport.location || "Site non renseigné",
        status: rawReport.status || rawReport.statut || STATUS.draft,
        author: rawReport.author || rawReport.redacteur || rawReport.created_by || "",
        date: rawReport.date || rawReport.report_date || rawReport.date_rapport || rawReport.created_at || "",
        pages: Math.max(1, normalizeNumber(rawReport.pages || rawReport.page_count, 1)),
        warnings: Math.max(0, normalizeNumber(rawReport.warnings || rawReport.warning_count || rawReport.alertes, 0)),
        blockers: Math.max(0, normalizeNumber(rawReport.blockers || rawReport.blocking_count || rawReport.bloquants, 0)),
        source: rawReport.source || rawReport.criteria_source || rawReport.source_criteres || "Source non renseignée",
        model: rawReport.model || rawReport.model_version || rawReport.template_version || "Modèle non renseigné",
        previewUrl: rawReport.previewUrl || rawReport.preview_url || rawReport.pdf_url || rawReport.current_pdf_url || "",
        history: normalizeHistory(rawReport.history || rawReport.events || rawReport.validation_events),
        sourceUid: String(rawReport.source_uid || rawReport.feuille_uid || rawReport.feuille_terrain_uid || ""),
        sourceId: String(rawReport.source_id || rawReport.essai_id || rawReport.essai_uid || ""),
        pointUid: String(rawReport.point_uid || rawReport.point_id || ""),
        pmtEssaiId: String(rawReport.pmt_essai_id || rawReport.pmt_id || ""),
        essaiReference: String(rawReport.essai_reference || rawReport.reference_essai || rawReport.reference || "")
    };
}

function filterReports(sourceReports, query, statusFilter, typeFilter) {
    const cleanQuery = normalizeText(query);

    return sourceReports.filter((report) => {
        const haystack = normalizeText([
            report.id,
            report.type,
            report.title,
            report.affair,
            report.client,
            report.site,
            report.author,
            report.source,
            report.model,
            report.status
        ].join(" "));

        const matchesQuery = !cleanQuery || haystack.includes(cleanQuery);
        const matchesStatus = statusFilter === STATUS.all || report.status === statusFilter;
        const matchesType = typeFilter === STATUS.all || report.type === typeFilter;

        return matchesQuery && matchesStatus && matchesType;
    });
}

function getValidationLevel(report) {
    if (!report) {
        return "draft";
    }

    if (report.blockers > 0) {
        return "blocked";
    }

    if (report.warnings > 0) {
        return "warning";
    }

    return "ready";
}

function canValidateReport(report) {
    return Boolean(report) && report.blockers === 0;
}

function getNextReportId(sourceReports, selectedId) {
    if (!sourceReports.length) {
        return null;
    }

    const selectedIndex = sourceReports.findIndex((report) => report.id === selectedId);

    if (selectedIndex < 0) {
        return sourceReports[0].id;
    }

    return sourceReports[(selectedIndex + 1) % sourceReports.length].id;
}

function getAvailableTypes(reports) {
    return [STATUS.all, ...Array.from(new Set(reports.map((report) => report.type).filter(Boolean))).sort()];
}

function getAvailableStatuses(reports) {
    const preferredStatuses = [
        STATUS.all,
        STATUS.toValidate,
        STATUS.correctionRequested,
        STATUS.draft,
        STATUS.technicallyValidated,
        STATUS.issued,
        STATUS.rejected
    ];
    const realStatuses = Array.from(new Set(reports.map((report) => report.status).filter(Boolean)));
    const missingStatuses = realStatuses.filter((status) => !preferredStatuses.includes(status)).sort();

    return [...preferredStatuses.filter((status) => status === STATUS.all || realStatuses.includes(status)), ...missingStatuses];
}

function buildReportTarget(report) {
    const type = String(report?.type || "").trim().toUpperCase();
    const uid = String(report?.uid || "").trim();
    const id = String(report?.id || "").trim();
    const sourceUid = String(report?.sourceUid || "").trim();
    const sourceId = String(report?.sourceId || "").trim();
    const pmtEssaiId = String(report?.pmtEssaiId || "").trim();
    const essaiReference = String(report?.essaiReference || "").trim();
    const pointUid = String(report?.pointUid || "").trim();

    if (type === "DE") {
        if (sourceUid) {
            const params = new URLSearchParams();
            params.set("mode", "work");
            params.set("source_kind", "feuille_terrain");
            params.set("source_id", sourceUid);
            params.set("source_uid", sourceUid);
            params.set("feuille_uid", sourceUid);
            params.set("embed", "1");
            return `/rapports/de/view?${params.toString()}`;
        }
        const deRef = sourceId || essaiReference || uid || id;
        if (!deRef) return "";
        const params = new URLSearchParams();
        params.set("mode", "work");
        params.set("source_id", deRef);
        params.set("embed", "1");
        return `/rapports/de/view?${params.toString()}`;
    }
    if (type === "PMT") {
        const resolved = pmtEssaiId || sourceId || uid || id;
        if (!resolved) return "";
        const params = new URLSearchParams();
        params.set("pmt_essai_id", String(resolved));
        params.set("embed", "1");
        return `/rapports/pmt/view?${params.toString()}`;
    }
    if (type === "SC") {
        const scRef = sourceId || essaiReference || uid || id;
        if (sourceUid) {
            const params = new URLSearchParams();
            params.set("embed", "1");
            params.set("source_family", "terrain");
            params.set("source_uid", sourceUid);
            if (pointUid) params.set("point", pointUid);
            if (scRef) params.set("reference", scRef);
            return `/rapports/sc/view?${params.toString()}`;
        }
        if (!scRef) return "";
        const params = new URLSearchParams();
        params.set("embed", "1");
        if (pointUid) params.set("point", pointUid);
        return `/rapports/sc/${encodeURIComponent(scRef)}?${params.toString()}`;
    }
    if (type === "SO") {
        const soRef = sourceId || essaiReference || uid || id;
        if (sourceUid) {
            const params = new URLSearchParams();
            params.set("embed", "1");
            params.set("source_family", "terrain");
            params.set("source_uid", sourceUid);
            if (pointUid) params.set("point", pointUid);
            if (soRef) params.set("reference", soRef);
            return `/rapports/so/view?${params.toString()}`;
        }
        if (!soRef) return "";
        const params = new URLSearchParams();
        params.set("embed", "1");
        if (pointUid) params.set("point", pointUid);
        return `/rapports/so/${encodeURIComponent(soRef)}?${params.toString()}`;
    }
    const fallback = sourceId || uid || id;
    return fallback ? `/rapports/${encodeURIComponent(type.toLowerCase())}/${encodeURIComponent(fallback)}` : "";
}

function Icon({ name, size = 18, className = "" }) {
    const icons = {
        alert: "!",
        check: "✓",
        close: "×",
        edit: "✎",
        file: "▤",
        history: "↻",
        list: "☰",
        lock: "◆",
        next: "→",
        pdf: "▣",
        refresh: "↺",
        search: "⌕",
        send: "➤",
        shield: "◈"
    };

    return (
        <span
            aria-hidden="true"
            className={classNames("vrp-icon", className)}
            style={{ width: size, height: size, fontSize: size }}
        >
            {icons[name] || "•"}
        </span>
    );
}

function StatusPill({ status }) {
    const levelClass = {
        [STATUS.toValidate]: "vrp-status-warning",
        [STATUS.correctionRequested]: "vrp-status-danger",
        [STATUS.draft]: "vrp-status-neutral",
        [STATUS.technicallyValidated]: "vrp-status-success",
        [STATUS.issued]: "vrp-status-info",
        [STATUS.rejected]: "vrp-status-danger"
    }[status] || "vrp-status-neutral";

    return <span className={classNames("vrp-status-pill", levelClass)}>{status}</span>;
}

function ReportRailCard({ report, selected, onClick }) {
    const validationLevel = getValidationLevel(report);

    return (
        <button
            type="button"
            onClick={onClick}
            className={classNames("vrp-rail-card", selected && "vrp-rail-card-selected")}
        >
            <div className="vrp-rail-card-head">
                <div className="vrp-rail-card-main">
                    <div className={classNames("vrp-type-box", selected && "vrp-type-box-selected")}>{report.type}</div>
                    <div className="vrp-rail-text">
                        <div className="vrp-rail-title">{report.id}</div>
                        <div className="vrp-rail-subtitle">{report.affair} · {report.site}</div>
                    </div>
                </div>

                <span className={classNames("vrp-health-dot", `vrp-health-${validationLevel}`)} />
            </div>

            <div className="vrp-rail-card-foot">
                <StatusPill status={report.status} />
                <span className="vrp-rail-pages">{report.pages} p.</span>
            </div>
        </button>
    );
}

function SidebarButton({ label, icon, active, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={classNames("vrp-sidebar-button", active && "vrp-sidebar-button-active")}
            title={label}
        >
            <Icon name={icon} size={18} />
        </button>
    );
}

function ReaderToolbar({ onNextReport }) {
    return (
        <div className="vrp-reader-toolbar">
            <div className="vrp-toolbar-group">
                <div className="vrp-toolbar-counter">Rapport réel intégré</div>
            </div>

            <div className="vrp-toolbar-mode">Mode lecture contrôlée</div>

            <div className="vrp-toolbar-group">
                <button type="button" onClick={onNextReport} className="vrp-next-button">
                    Suivant
                    <Icon name="next" size={16} />
                </button>
            </div>
        </div>
    );
}

function ReportReader({ report }) {
    const target = buildReportTarget(report);
    if (!target) {
        return <EmptyState />;
    }
    return (
        <div className="vrp-reader-pdf-wrap">
            <iframe
                title={`Rapport ${report.id}`}
                src={target}
                className="vrp-reader-pdf"
            />
        </div>
    );
}

function ValidationGauge({ report }) {
    const level = getValidationLevel(report);
    const data = {
        ready: {
            title: "Prêt à valider",
            detail: "Aucun blocage détecté",
            className: "vrp-gauge-ready",
            icon: "check"
        },
        warning: {
            title: "Validation possible avec vigilance",
            detail: `${report.warnings} alerte(s) à lire`,
            className: "vrp-gauge-warning",
            icon: "alert"
        },
        blocked: {
            title: "Validation bloquée",
            detail: `${report.blockers} point(s) bloquant(s)`,
            className: "vrp-gauge-blocked",
            icon: "lock"
        },
        draft: {
            title: "Brouillon",
            detail: "Rapport en préparation",
            className: "vrp-gauge-neutral",
            icon: "file"
        }
    }[level];

    return (
        <div className={classNames("vrp-validation-gauge", data.className)}>
            <div className="vrp-gauge-icon">
                <Icon name={data.icon} size={22} />
            </div>
            <div>
                <div className="vrp-gauge-title">{data.title}</div>
                <div className="vrp-gauge-detail">{data.detail}</div>
            </div>
        </div>
    );
}

function QuickControls({ report }) {
    const checks = [
        { label: "Rapport lisible", state: "ok" },
        { label: "Version du modèle", state: "ok" },
        { label: "Résultats visibles", state: "ok" },
        { label: "Conclusion présente", state: "ok" },
        { label: "Critère source", state: report.source && report.source !== "Source non renseignée" ? "ok" : "warning" },
        { label: "Aucun blocage", state: report.blockers === 0 ? "ok" : "blocked" }
    ];

    return (
        <section className="vrp-panel-card">
            <h3 className="vrp-panel-title">
                <Icon name="check" size={18} />
                Contrôles rapides
            </h3>
            <div className="vrp-check-list">
                {checks.map((check) => (
                    <div key={check.label} className="vrp-check-line">
                        <span>{check.label}</span>
                        <span className={classNames("vrp-check-mark", check.state === "ok" ? "vrp-check-ok" : check.state === "blocked" ? "vrp-check-blocked" : "vrp-check-warning")}>{check.state === "ok" ? "✓" : "!"}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ValidationTrail({ report }) {
    const history = report.history.length ? report.history : [{ user: "RaLab", action: "Aucun historique disponible", time: "" }];

    return (
        <section className="vrp-panel-card">
            <h3 className="vrp-panel-title">
                <Icon name="history" size={18} />
                Trace courte
            </h3>
            <div className="vrp-history-list">
                {history.slice(0, 4).map((item, index) => (
                    <div key={item.id || `${item.time}-${index}`} className="vrp-history-item">
                        <div>{item.action}</div>
                        <span>{item.user}{item.time ? ` · ${item.time}` : ""}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ValidationPanel({ report, comment, setComment, onAction, actionLoading }) {
    const canRunValidation = canValidateReport(report);

    return (
        <div className="vrp-validation-panel">
            <div className="vrp-validation-head">
                <div>
                    <div className="vrp-kicker">Décision</div>
                    <h2>Validation rapport</h2>
                </div>
                <Icon name="shield" size={22} />
            </div>

            <div className="vrp-validation-scroll">
                <ValidationGauge report={report} />

                <section className="vrp-panel-card">
                    <div className="vrp-selected-report-head">
                        <div>
                            <div className="vrp-kicker">Rapport sélectionné</div>
                            <div className="vrp-selected-report-id">{report.id}</div>
                        </div>
                        <StatusPill status={report.status} />
                    </div>
                    <div className="vrp-small-info-grid">
                        <InfoBox label="Type" value={report.type} />
                        <InfoBox label="Pages" value={report.pages} />
                        <InfoBox label="Source" value={report.source} />
                        <InfoBox label="Modèle" value={report.model} />
                    </div>
                </section>

                <QuickControls report={report} />

                <section className="vrp-panel-card">
                    <h3 className="vrp-panel-title">
                        <Icon name="edit" size={18} />
                        Note de validation
                    </h3>
                    <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="Commentaire court du validateur..."
                        className="vrp-comment-area"
                    />
                </section>

                <ValidationTrail report={report} />
            </div>

            <div className="vrp-action-bar">
                <div className="vrp-action-grid">
                    <button
                        type="button"
                        className="vrp-secondary-action"
                        disabled={actionLoading}
                        onClick={() => onAction("correction_requested")}
                    >
                        Correction
                    </button>
                    <button
                        type="button"
                        className="vrp-secondary-action"
                        disabled={actionLoading}
                        onClick={() => onAction("revision_requested")}
                    >
                        Révision
                    </button>
                </div>
                <button
                    type="button"
                    disabled={!canRunValidation || actionLoading}
                    className={classNames("vrp-primary-action", (!canRunValidation || actionLoading) && "vrp-action-disabled")}
                    onClick={() => onAction("technical_validation")}
                >
                    <Icon name="shield" size={18} />
                    Valider techniquement
                </button>
                <button
                    type="button"
                    disabled={actionLoading}
                    className={classNames("vrp-issue-action", actionLoading && "vrp-action-disabled")}
                    onClick={() => onAction("issue")}
                >
                    <Icon name="send" size={18} />
                    Émettre le rapport
                </button>
            </div>
        </div>
    );
}

function InfoBox({ label, value }) {
    return (
        <div className="vrp-info-box">
            <div>{label}</div>
            <strong>{value || "-"}</strong>
        </div>
    );
}

function LoadingState() {
    return (
        <div className="vrp-state-card">
            <div className="vrp-spinner" />
            <strong>Chargement des rapports...</strong>
            <span>RaLab prépare la file de validation.</span>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="vrp-state-card">
            <Icon name="file" size={32} />
            <strong>Aucun rapport dans cette file.</strong>
            <span>Ajuste les filtres ou génère un rapport à valider.</span>
        </div>
    );
}

function ErrorBanner({ message, usingFallback, onRetry }) {
    if (!message) {
        return null;
    }

    return (
        <div className={classNames("vrp-error-banner", usingFallback && "vrp-demo-banner")}>
            <div>
                <strong>{usingFallback ? "Mode démonstration" : "Erreur"}</strong>
                <span>{message}</span>
            </div>
            <button type="button" onClick={onRetry}>Réessayer</button>
        </div>
    );
}

export default function ValiderRapportsPage() {
    const navigate = useNavigate();
    const [urlParams] = useSearchParams();
    const [reports, setReports] = useState([]);
    const [selectedReportId, setSelectedReportId] = useState("");
    const [query, setQuery] = useState(() => String(urlParams.get("report") || urlParams.get("q") || "").trim());
    const [statusFilter, setStatusFilter] = useState(STATUS.all);
    const [typeFilter, setTypeFilter] = useState(STATUS.all);
    const [leftExpanded, setLeftExpanded] = useState(true);
    const [rightExpanded, setRightExpanded] = useState(true);
    const [comment, setComment] = useState("");
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [usingFallback, setUsingFallback] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    async function loadReports(params = {}) {
        setLoading(true);
        setErrorMessage("");

        try {
            const payload = await rapportsValidationApi.list(params);
            const rawReports = Array.isArray(payload) ? payload : payload?.items || payload?.reports || [];
            const normalizedReports = rawReports.map(normalizeReport);

            setReports(normalizedReports);
            setSelectedReportId((currentId) => {
                if (normalizedReports.some((report) => report.id === currentId)) {
                    return currentId;
                }

                return normalizedReports[0]?.id || "";
            });
            setUsingFallback(false);
        } catch (error) {
            setReports([]);
            setSelectedReportId("");
            setErrorMessage(error?.message || "Endpoint /api/rapports/validation indisponible.");
            setUsingFallback(false);
        } finally {
            setLoading(false);
        }
    }

    async function searchByReference() {
        const q = String(query || "").trim();
        if (!q) {
            loadReports();
            return;
        }
        setSearchLoading(true);
        setErrorMessage("");
        try {
            const payload = await rapportsValidationApi.list({ q, reference: q, limit: 100 });
            const rawReports = Array.isArray(payload) ? payload : payload?.items || payload?.reports || [];
            const normalizedReports = rawReports.map(normalizeReport);
            setReports(normalizedReports);
            const exact = normalizedReports.find((report) => String(report.id || "").trim().toUpperCase() === q.toUpperCase());
            setSelectedReportId(String((exact || normalizedReports[0] || {}).id || ""));
            if (!normalizedReports.length) {
                setErrorMessage(`Aucun rapport trouvé pour la référence "${q}".`);
            }
        } catch (error) {
            setErrorMessage(error?.message || "Recherche impossible.");
            setReports([]);
            setSelectedReportId("");
        } finally {
            setSearchLoading(false);
        }
    }

    useEffect(() => {
        const initialReport = String(urlParams.get("report") || urlParams.get("q") || "").trim();
        if (initialReport) {
            searchByReference();
        } else {
            loadReports();
        }
    }, []);

    const availableTypes = useMemo(() => getAvailableTypes(reports), [reports]);
    const availableStatuses = useMemo(() => getAvailableStatuses(reports), [reports]);
    const visibleReports = useMemo(() => filterReports(reports, query, statusFilter, typeFilter), [reports, query, statusFilter, typeFilter]);
    const selectedReport = useMemo(() => {
        return reports.find((report) => report.id === selectedReportId) || reports[0] || null;
    }, [reports, selectedReportId]);

    useEffect(() => {
        setComment("");
    }, [selectedReportId]);

    function selectReport(reportId) {
        setSelectedReportId(reportId);
    }

    function selectNextReport() {
        const nextId = getNextReportId(visibleReports.length ? visibleReports : reports, selectedReportId);

        if (nextId) {
            selectReport(nextId);
        }
    }

    async function handleAction(action) {
        if (!selectedReport) {
            return;
        }

        const nextStatusByAction = {
            correction_requested: STATUS.correctionRequested,
            revision_requested: STATUS.draft,
            technical_validation: STATUS.technicallyValidated,
            issue: STATUS.issued
        };
        const nextStatus = nextStatusByAction[action] || selectedReport.status;
        const payload = {
            action,
            status: nextStatus,
            comment,
            report_id: selectedReport.uid || selectedReport.id
        };

        setActionLoading(true);
        setErrorMessage("");

        try {
            await rapportsValidationApi.updateStatus(selectedReport.uid || selectedReport.id, payload);

            setReports((currentReports) => currentReports.map((report) => {
                if (report.id !== selectedReport.id) {
                    return report;
                }

                return {
                    ...report,
                    status: nextStatus,
                    history: [
                        {
                            id: `${Date.now()}-${action}`,
                            user: "Utilisateur",
                            action: action === "technical_validation"
                                ? "Validation technique"
                                : action === "issue"
                                    ? "Émission du rapport"
                                    : action === "correction_requested"
                                        ? "Correction demandée"
                                        : "Révision demandée",
                            time: new Date().toLocaleString("fr-FR")
                        },
                        ...report.history
                    ]
                };
            }));
            setComment("");
        } catch (error) {
            setErrorMessage(error.message || "Action impossible sur ce rapport.");
        } finally {
            setActionLoading(false);
        }
    }

    return (
        <div className="vrp-page -m-6">
            <style>{styles}</style>

            <div className="vrp-shell" style={{ gridTemplateColumns: `72px ${leftExpanded ? "310px" : "0px"} minmax(0, 1fr) ${rightExpanded ? "390px" : "0px"}` }}>
                <nav className="vrp-left-rail">
                    <div className="vrp-logo">
                        <Icon name="shield" size={22} />
                    </div>
                    <SidebarButton label="Liste" icon="list" active={leftExpanded} onClick={() => setLeftExpanded((value) => !value)} />
                    <SidebarButton label="Rapport" icon="pdf" active />
                    <SidebarButton label="Validation" icon="check" active={rightExpanded} onClick={() => setRightExpanded((value) => !value)} />
                    <SidebarButton label="Historique" icon="history" />
                    <button
                        type="button"
                        className="vrp-sidebar-button vrp-sidebar-button-bottom"
                        onClick={() => {
                            setLeftExpanded(false);
                            setRightExpanded(false);
                        }}
                        title="Plein rapport"
                    >
                        <Icon name="file" size={18} />
                    </button>
                </nav>

                <aside className="vrp-reports-column">
                    <div className="vrp-column-head">
                        <div>
                            <h1>File rapports</h1>
                            <p>Sélection rapide sans voler la scène au rapport.</p>
                        </div>
                    </div>

                    <div className="vrp-filter-block">
                        <div className="vrp-search-box">
                            <Icon name="search" size={16} />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        searchByReference();
                                    }
                                }}
                                placeholder="Chercher rapport..."
                            />
                            <button type="button" className="vrp-search-action" onClick={searchByReference} disabled={searchLoading}>
                                {searchLoading ? "..." : "OK"}
                            </button>
                        </div>

                        <div className="vrp-filter-grid">
                            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                                {availableStatuses.map((status) => <option key={status}>{status}</option>)}
                            </select>
                            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                                {availableTypes.map((type) => <option key={type}>{type}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="vrp-rail-list">
                        {loading && <LoadingState />}
                        {!loading && visibleReports.map((report) => (
                            <ReportRailCard
                                key={report.id}
                                report={report}
                                selected={report.id === selectedReportId}
                                onClick={() => selectReport(report.id)}
                            />
                        ))}
                        {!loading && visibleReports.length === 0 && <EmptyState />}
                    </div>
                </aside>

                <main className="vrp-main">
                    <header className="vrp-main-head">
                        <div className="vrp-main-title-block">
                            {selectedReport && (
                                <>
                                    <div className="vrp-title-row">
                                        <span className="vrp-main-type-chip">{selectedReport.type}</span>
                                        <h2>{selectedReport.id}</h2>
                                        <StatusPill status={selectedReport.status} />
                                    </div>
                                    <p>{selectedReport.title} · {selectedReport.affair} · {selectedReport.client}</p>
                                </>
                            )}
                        </div>
                        <button
                            type="button"
                            className="vrp-full-report-button"
                            onClick={() => {
                                const target = buildReportTarget(selectedReport);
                                if (!target) return;
                                navigate(target);
                            }}
                        >
                            Ouvrir rapport
                        </button>
                    </header>

                    <ErrorBanner message={errorMessage} usingFallback={usingFallback} onRetry={loadReports} />

                    {selectedReport && (
                        <ReaderToolbar
                            onNextReport={selectNextReport}
                        />
                    )}

                    <div className="vrp-reader-area">
                        {!selectedReport && !loading && <EmptyState />}
                        {selectedReport && <ReportReader report={selectedReport} />}
                    </div>
                </main>

                <aside className="vrp-validation-column">
                    {selectedReport && (
                        <ValidationPanel
                            report={selectedReport}
                            comment={comment}
                            setComment={setComment}
                            onAction={handleAction}
                            actionLoading={actionLoading}
                        />
                    )}
                </aside>
            </div>
        </div>
    );
}

const styles = `
.vrp-page {
    min-height: 100vh;
    background: #020617;
    color: #0f172a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.vrp-shell {
    display: grid;
    height: 100vh;
    min-width: 0;
    overflow: hidden;
    transition: grid-template-columns 0.22s ease;
}

.vrp-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    line-height: 1;
}

.vrp-left-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    min-height: 0;
    padding: 12px;
    background: #020617;
    color: #fff;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.vrp-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    margin-bottom: 8px;
    border-radius: 18px;
    color: white;
    background: #2563eb;
    box-shadow: 0 16px 30px rgba(30, 64, 175, 0.35);
}

.vrp-sidebar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.05);
    color: #cbd5e1;
    cursor: pointer;
    transition: 0.18s ease;
}

.vrp-sidebar-button:hover,
.vrp-sidebar-button-active {
    border-color: #60a5fa;
    background: #2563eb;
    color: white;
}

.vrp-sidebar-button-bottom {
    margin-top: auto;
}

.vrp-reports-column,
.vrp-validation-column {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #f8fafc;
}

.vrp-reports-column {
    border-right: 1px solid #e2e8f0;
}

.vrp-validation-column {
    border-left: 1px solid #e2e8f0;
}

.vrp-column-head {
    padding: 18px;
    border-bottom: 1px solid #e2e8f0;
}

.vrp-column-head h1 {
    margin: 0;
    font-size: 19px;
    font-weight: 900;
    color: #020617;
}

.vrp-column-head p {
    margin: 4px 0 0;
    font-size: 12px;
    color: #64748b;
}

.vrp-filter-block {
    padding: 0 18px 16px;
    border-bottom: 1px solid #e2e8f0;
}

.vrp-search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    background: white;
    color: #94a3b8;
}

.vrp-search-box input {
    min-width: 0;
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: #0f172a;
}

.vrp-search-action {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 4px 8px;
    background: #f8fafc;
    color: #334155;
    font-size: 11px;
    font-weight: 800;
}

.vrp-filter-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
}

.vrp-filter-grid select {
    min-width: 0;
    padding: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: white;
    color: #334155;
    font-weight: 700;
    outline: none;
}

.vrp-rail-list {
    min-height: 0;
    height: calc(100vh - 191px);
    padding: 16px;
    overflow: auto;
}

.vrp-rail-card {
    width: 100%;
    padding: 14px;
    margin-bottom: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 22px;
    background: white;
    text-align: left;
    cursor: pointer;
    transition: 0.18s ease;
}

.vrp-rail-card:hover,
.vrp-rail-card-selected {
    border-color: #3b82f6;
    background: #eff6ff;
    box-shadow: 0 10px 24px rgba(30, 64, 175, 0.08);
}

.vrp-rail-card-head,
.vrp-rail-card-foot,
.vrp-rail-card-main {
    display: flex;
    align-items: center;
}

.vrp-rail-card-head,
.vrp-rail-card-foot {
    justify-content: space-between;
    gap: 10px;
}

.vrp-rail-card-main {
    min-width: 0;
    gap: 10px;
}

.vrp-type-box {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 16px;
    background: #f1f5f9;
    color: #475569;
    font-size: 13px;
    font-weight: 900;
}

.vrp-type-box-selected {
    background: #1d4ed8;
    color: white;
}

.vrp-rail-text {
    min-width: 0;
}

.vrp-rail-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #020617;
    font-weight: 900;
}

.vrp-rail-subtitle {
    overflow: hidden;
    margin-top: 2px;
    color: #64748b;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vrp-rail-card-foot {
    margin-top: 12px;
}

.vrp-rail-pages {
    color: #94a3b8;
    font-size: 12px;
    font-weight: 800;
}

.vrp-health-dot {
    display: block;
    flex-shrink: 0;
    width: 10px;
    height: 10px;
    border-radius: 999px;
}

.vrp-health-ready {
    background: #10b981;
}

.vrp-health-warning {
    background: #f59e0b;
}

.vrp-health-blocked {
    background: #ef4444;
}

.vrp-health-draft {
    background: #94a3b8;
}

.vrp-status-pill {
    display: inline-flex;
    align-items: center;
    padding: 5px 10px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;
    white-space: nowrap;
}

.vrp-status-warning {
    border-color: #fde68a;
    background: #fef3c7;
    color: #92400e;
}

.vrp-status-danger {
    border-color: #fecaca;
    background: #fee2e2;
    color: #991b1b;
}

.vrp-status-neutral {
    border-color: #e2e8f0;
    background: #f1f5f9;
    color: #475569;
}

.vrp-status-success {
    border-color: #bbf7d0;
    background: #dcfce7;
    color: #166534;
}

.vrp-status-info {
    border-color: #bfdbfe;
    background: #dbeafe;
    color: #1e40af;
}

.vrp-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: #111827;
}

.vrp-main-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 20px;
    border-bottom: 1px solid #1f2937;
    background: #020617;
    color: white;
}

.vrp-main-title-block {
    min-width: 0;
}

.vrp-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.vrp-title-row h2 {
    overflow: hidden;
    margin: 0;
    color: white;
    font-size: 19px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vrp-main-title-block p {
    overflow: hidden;
    margin: 4px 0 0;
    color: #94a3b8;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vrp-main-type-chip {
    padding: 6px 10px;
    border-radius: 14px;
    background: #2563eb;
    color: white;
    font-size: 13px;
    font-weight: 900;
}

.vrp-full-report-button,
.vrp-next-button {
    border: none;
    border-radius: 14px;
    cursor: pointer;
    font-weight: 900;
}

.vrp-full-report-button {
    padding: 10px 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: white;
}

.vrp-full-report-button:hover {
    background: rgba(255, 255, 255, 0.12);
}

.vrp-error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 16px;
    border-bottom: 1px solid #fecaca;
    background: #fee2e2;
    color: #991b1b;
    font-size: 13px;
}

.vrp-demo-banner {
    border-bottom-color: #fde68a;
    background: #fef3c7;
    color: #92400e;
}

.vrp-error-banner div {
    display: flex;
    min-width: 0;
    gap: 8px;
}

.vrp-error-banner span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vrp-error-banner button {
    flex-shrink: 0;
    border: 1px solid currentColor;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    font-weight: 900;
    padding: 5px 10px;
}

.vrp-reader-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #1f2937;
    background: #020617;
    color: white;
}

.vrp-toolbar-group {
    display: flex;
    align-items: center;
    gap: 8px;
}

.vrp-toolbar-counter {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.05);
    color: white;
    font-size: 14px;
    font-weight: 900;
}

.vrp-toolbar-mode {
    padding: 7px 12px;
    border: 1px solid rgba(96, 165, 250, 0.3);
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.1);
    color: #bfdbfe;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.vrp-next-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #2563eb;
    color: white;
}

.vrp-next-button:hover {
    background: #1d4ed8;
}

.vrp-reader-area {
    min-height: 0;
    flex: 1;
    overflow: hidden;
    background: radial-gradient(circle at top, #334155 0, #111827 45%, #020617 100%);
}

.vrp-reader-pdf-wrap {
    width: 100%;
    height: 100%;
    margin: 0;
    background: white;
    box-shadow: none;
}

.vrp-reader-pdf {
    width: 100%;
    height: 100%;
    border: none;
    background: white;
}

.vrp-report-sheet {
    width: min(900px, calc(100% - 36px));
    min-height: 1040px;
    margin: 28px auto;
    padding: 48px;
    background: white;
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.36);
}

.vrp-report-header {
    display: grid;
    grid-template-columns: 1fr 220px;
    gap: 32px;
    padding-bottom: 24px;
    border-bottom: 4px solid #172554;
}

.vrp-report-brand {
    color: #172554;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.24em;
    text-transform: uppercase;
}

.vrp-report-title {
    margin: 22px 0 0;
    color: #020617;
    font-size: 32px;
    font-weight: 950;
    letter-spacing: -0.04em;
    line-height: 1.05;
    text-transform: uppercase;
}

.vrp-report-subtitle {
    margin: 8px 0 0;
    color: #475569;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.45;
    text-transform: uppercase;
}

.vrp-report-ref-card,
.vrp-report-meta-grid,
.vrp-report-note-card {
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    background: #f8fafc;
}

.vrp-report-ref-card {
    padding: 16px;
    font-size: 12px;
}

.vrp-field-label {
    color: #94a3b8;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
}

.vrp-field-value {
    margin-top: 4px;
    color: #0f172a;
    font-size: 14px;
    font-weight: 800;
}

.vrp-report-ref {
    margin-top: 4px;
    color: #020617;
    font-size: 18px;
    font-weight: 950;
}

.vrp-ref-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;
    color: #64748b;
}

.vrp-ref-grid strong {
    color: #1e293b;
    text-align: right;
}

.vrp-report-meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-top: 32px;
    padding: 18px;
}

.vrp-report-section {
    margin-top: 40px;
}

.vrp-report-section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
}

.vrp-report-section-head h2 {
    margin: 0;
    color: #020617;
    font-size: 20px;
    font-weight: 950;
    text-transform: uppercase;
}

.vrp-report-section-head p {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 14px;
}

.vrp-report-type-chip {
    flex-shrink: 0;
    padding: 7px 12px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #475569;
    font-size: 12px;
    font-weight: 950;
}

.vrp-report-table-wrap {
    overflow: hidden;
    margin-top: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 18px;
}

.vrp-report-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 14px;
}

.vrp-report-table th {
    padding: 12px 16px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
    text-align: left;
    text-transform: uppercase;
}

.vrp-report-table td {
    padding: 13px 16px;
    border-top: 1px solid #f1f5f9;
    color: #475569;
}

.vrp-report-table td:first-child {
    color: #020617;
    font-weight: 900;
}

.vrp-table-number {
    text-align: right;
}

.vrp-table-status {
    text-align: center;
}

.vrp-mini-pill {
    display: inline-flex;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;
}

.vrp-mini-ok {
    background: #dcfce7;
    color: #166534;
}

.vrp-mini-warning {
    background: #fef3c7;
    color: #92400e;
}

.vrp-report-conclusion-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 40px;
}

.vrp-report-note-card {
    padding: 20px;
    background: white;
}

.vrp-report-note-card h3 {
    margin: 0;
    color: #020617;
    font-size: 15px;
    font-weight: 950;
    text-transform: uppercase;
}

.vrp-report-note-card p {
    margin: 12px 0 0;
    color: #475569;
    font-size: 14px;
    line-height: 1.6;
}

.vrp-report-footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-top: 64px;
    padding-top: 20px;
    border-top: 1px solid #e2e8f0;
    color: #94a3b8;
    font-size: 12px;
}

.vrp-validation-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: white;
}

.vrp-validation-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 20px;
    border-bottom: 1px solid #e2e8f0;
}

.vrp-validation-head h2 {
    margin: 3px 0 0;
    color: #020617;
    font-size: 21px;
    font-weight: 950;
}

.vrp-kicker {
    color: #94a3b8;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.vrp-validation-scroll {
    min-height: 0;
    flex: 1;
    padding: 20px;
    overflow: auto;
}

.vrp-validation-gauge {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 18px;
    border: 1px solid;
    border-radius: 26px;
    margin-bottom: 16px;
}

.vrp-gauge-ready {
    border-color: #bbf7d0;
    background: #ecfdf5;
    color: #166534;
}

.vrp-gauge-warning {
    border-color: #fde68a;
    background: #fffbeb;
    color: #92400e;
}

.vrp-gauge-blocked {
    border-color: #fecaca;
    background: #fef2f2;
    color: #991b1b;
}

.vrp-gauge-neutral {
    border-color: #e2e8f0;
    background: #f8fafc;
    color: #475569;
}

.vrp-gauge-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.65);
}

.vrp-gauge-title {
    font-size: 14px;
    font-weight: 950;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.vrp-gauge-detail {
    margin-top: 4px;
    font-size: 14px;
    opacity: 0.85;
}

.vrp-panel-card {
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid #e2e8f0;
    border-radius: 26px;
    background: white;
}

.vrp-panel-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: #020617;
    font-size: 15px;
    font-weight: 950;
}

.vrp-selected-report-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.vrp-selected-report-id {
    margin-top: 4px;
    color: #020617;
    font-size: 16px;
    font-weight: 950;
}

.vrp-small-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 16px;
}

.vrp-info-box {
    min-width: 0;
    padding: 12px;
    border-radius: 16px;
    background: #f8fafc;
}

.vrp-info-box div {
    color: #94a3b8;
    font-size: 11px;
    font-weight: 900;
    text-transform: uppercase;
}

.vrp-info-box strong {
    display: block;
    overflow: hidden;
    margin-top: 4px;
    color: #0f172a;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vrp-check-list,
.vrp-history-list {
    margin-top: 14px;
}

.vrp-check-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    color: #475569;
    font-size: 14px;
}

.vrp-check-line + .vrp-check-line {
    border-top: 1px solid #f1f5f9;
}

.vrp-check-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 950;
}

.vrp-check-ok {
    background: #dcfce7;
    color: #166534;
}

.vrp-check-warning {
    background: #fef3c7;
    color: #92400e;
}

.vrp-check-blocked {
    background: #fee2e2;
    color: #991b1b;
}

.vrp-comment-area {
    width: 100%;
    min-height: 128px;
    margin-top: 14px;
    padding: 13px;
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    outline: none;
    resize: vertical;
    background: #f8fafc;
    color: #0f172a;
    font: inherit;
    font-size: 14px;
}

.vrp-comment-area:focus {
    border-color: #60a5fa;
    background: white;
}

.vrp-history-item {
    padding: 12px;
    border-radius: 16px;
    background: #f8fafc;
    font-size: 12px;
}

.vrp-history-item + .vrp-history-item {
    margin-top: 10px;
}

.vrp-history-item div {
    color: #0f172a;
    font-weight: 900;
}

.vrp-history-item span {
    display: block;
    margin-top: 3px;
    color: #64748b;
}

.vrp-action-bar {
    padding: 18px;
    border-top: 1px solid #e2e8f0;
    background: white;
}

.vrp-action-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.vrp-secondary-action,
.vrp-primary-action,
.vrp-issue-action {
    border: none;
    border-radius: 18px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 950;
    transition: 0.18s ease;
}

.vrp-secondary-action {
    padding: 13px;
    border: 1px solid #e2e8f0;
    background: white;
    color: #334155;
}

.vrp-secondary-action:hover {
    background: #f8fafc;
}

.vrp-primary-action,
.vrp-issue-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    margin-top: 8px;
    padding: 14px;
    color: white;
}

.vrp-primary-action {
    background: #1d4ed8;
}

.vrp-primary-action:hover {
    background: #1e40af;
}

.vrp-issue-action {
    background: #047857;
}

.vrp-issue-action:hover {
    background: #065f46;
}

.vrp-action-disabled,
.vrp-action-disabled:hover,
button:disabled {
    cursor: not-allowed;
    background: #e2e8f0 !important;
    color: #94a3b8 !important;
}

.vrp-state-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 160px;
    padding: 24px;
    border: 1px dashed #cbd5e1;
    border-radius: 24px;
    background: white;
    color: #64748b;
    text-align: center;
}

.vrp-state-card strong {
    color: #0f172a;
}

.vrp-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid #dbeafe;
    border-top-color: #2563eb;
    border-radius: 999px;
    animation: vrp-spin 0.8s linear infinite;
}

@keyframes vrp-spin {
    to {
        transform: rotate(360deg);
    }
}

@media (max-width: 1200px) {
    .vrp-shell {
        grid-template-columns: 64px 0 minmax(0, 1fr) 340px !important;
    }

    .vrp-toolbar-mode {
        display: none;
    }
}

@media (max-width: 900px) {
    .vrp-shell {
        grid-template-columns: 56px 0 minmax(0, 1fr) 0 !important;
    }

    .vrp-full-report-button,
    .vrp-next-button {
        display: none;
    }

    .vrp-report-sheet {
        width: calc(100% - 24px);
        padding: 28px;
    }

    .vrp-report-header,
    .vrp-report-meta-grid,
    .vrp-report-conclusion-grid {
        grid-template-columns: 1fr;
    }
}
`;

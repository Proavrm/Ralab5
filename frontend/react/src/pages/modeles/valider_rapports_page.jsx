// ValiderRapportsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { buildEssaiTarget, isCorrectionRequested } from "@/lib/essaiValidation";
import { rapportsValidationApi } from "@/services/api";

const VALIDATION_PREVIEW_IFRAME_ID = "vrp-report-preview-frame";

const CORRECTION_REASONS = [
    { id: "wrong_calculations", label: "Valeurs / calculs erronés" },
    { id: "data_entry_error", label: "Erreur de saisie" },
    { id: "missing_data", label: "Données manquantes ou incomplètes" },
    { id: "model_mismatch", label: "Incohérence avec le modèle / la procédure" },
    { id: "photo_document", label: "Photo, coupe ou document à corriger" },
    { id: "layout_format", label: "Mise en forme du rapport" },
    { id: "identification_layers", label: "Identification des couches / matériaux" },
    { id: "lab_results", label: "Résultats de laboratoire à revoir" },
    { id: "other", label: "Autre motif" },
];

const ISSUE_DISPATCH_OPTIONS = [
    {
        id: "print",
        title: "Émettre et imprimer",
        description: "Enregistre l'émission et ouvre le dialogue d'impression du système.",
        icon: "pdf",
    },
    {
        id: "email",
        title: "Émettre et envoyer par mail",
        description: "Enregistre l'émission et ouvre Gmail dans le navigateur avec les contacts du dossier.",
        icon: "mail",
    },
    {
        id: "emit_only",
        title: "Émettre sans diffusion",
        description: "Marque le rapport comme émis, sans impression ni envoi immédiat.",
        icon: "check",
    },
    {
        id: "export_pdf",
        title: "Exporter PDF",
        description: "Génération PDF directe — bientôt disponible.",
        icon: "file",
        disabled: true,
    },
];

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

function formatSessionUserLabel(user) {
    if (!user) {
        return "Utilisateur non connecté";
    }

    const name = String(user.display_name || user.email || "").trim();
    const role = String(user.employment_level_label || user.role_code || user.role || "").trim();
    if (name && role) {
        return `${name} · ${role}`;
    }
    return name || role || "Utilisateur";
}

function sessionUserInitials(user) {
    const label = String(user?.display_name || user?.email || "").trim();
    if (!label) {
        return "?";
    }
    return label
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

function SessionUserChip({ user, compact = false }) {
    const label = formatSessionUserLabel(user);

    return (
        <div className={classNames("vrp-session-user", compact && "vrp-session-user-compact")} title={label}>
            <span className="vrp-session-user-avatar" aria-hidden="true">{sessionUserInitials(user)}</span>
            <div className="vrp-session-user-text">
                <div className="vrp-session-user-kicker">Validateur</div>
                <div className="vrp-session-user-name">{label}</div>
            </div>
        </div>
    );
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
        time: item.time || item.created_at || item.date || "",
        comment: String(item.comment || "").trim(),
    }));
}

function resolveValidationComment(rawReport, history = []) {
    const direct = String(rawReport?.validation_comment || rawReport?.validationComment || "").trim();
    if (direct) {
        return direct;
    }

    for (const item of history) {
        const comment = String(item?.comment || "").trim();
        if (comment) {
            return comment;
        }
    }

    return "";
}

function normalizeReport(rawReport) {
    const id = rawReport.id || rawReport.uid || rawReport.rapport_ref || rawReport.reference || "rapport-sans-reference";
    const history = normalizeHistory(rawReport.history || rawReport.events || rawReport.validation_events);

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
        history,
        validationComment: resolveValidationComment(rawReport, history),
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

function normalizeReportStatus(status) {
    return String(status || "").trim();
}

function getValidationLevel(report) {
    if (!report) {
        return "draft";
    }

    const status = normalizeReportStatus(report.status);

    if (status === STATUS.issued) {
        return "issued";
    }

    if (status === STATUS.technicallyValidated) {
        return "validated";
    }

    if (status === STATUS.rejected) {
        return "rejected";
    }

    if (status === STATUS.correctionRequested) {
        return "correction";
    }

    if (report.blockers > 0) {
        return "blocked";
    }

    if (report.warnings > 0) {
        return "warning";
    }

    if (status === STATUS.draft) {
        return "draft";
    }

    return "ready";
}

function canValidateReport(report) {
    if (!report || report.blockers > 0) {
        return false;
    }

    const status = normalizeReportStatus(report.status);
    return status !== STATUS.issued && status !== STATUS.technicallyValidated;
}

function canIssueReport(report) {
    if (!report || report.blockers > 0) {
        return false;
    }

    const status = normalizeReportStatus(report.status);
    return status === STATUS.technicallyValidated || status === STATUS.issued;
}

function isReportIssued(report) {
    return normalizeReportStatus(report?.status) === STATUS.issued;
}

function getIssueBlockedReason(report) {
    if (!report) {
        return "Aucun rapport sélectionné.";
    }
    if (report.blockers > 0) {
        return "Des blocages empêchent l'émission.";
    }
    const status = normalizeReportStatus(report.status);
    if (status !== STATUS.technicallyValidated && status !== STATUS.issued) {
        return "Validez d'abord techniquement le rapport avant l'émission.";
    }
    return "";
}

function getIssueActionLabel(report) {
    return isReportIssued(report) ? "Réémettre le rapport" : "Émettre le rapport";
}

function appendValidationIframeParams(params) {
    params.set("embed", "1");
    params.set("hide_toolbar", "1");
    return params;
}

function buildAutoprintReportTarget(report) {
    const raw = buildReportTarget(report);
    if (!raw) {
        return "";
    }

    const [path, query = ""] = raw.split("?");
    const params = new URLSearchParams(query);
    params.set("autoprint", "1");
    return `${path}?${params.toString()}`;
}

function printValidationPreview() {
    const iframe = document.getElementById(VALIDATION_PREVIEW_IFRAME_ID);
    if (!(iframe instanceof HTMLIFrameElement)) {
        return false;
    }

    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
        return false;
    }

    try {
        frameWindow.focus();
        frameWindow.print();
        return true;
    } catch {
        return false;
    }
}

function openReportPrintFallback(report) {
    const printTarget = buildAutoprintReportTarget(report);
    if (!printTarget) {
        return false;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none";
    iframe.src = printTarget;
    document.body.appendChild(iframe);

    window.setTimeout(() => {
        if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
        }
    }, 120000);

    return true;
}

function openReportPrintDialog(report) {
    if (printValidationPreview()) {
        return true;
    }

    return openReportPrintFallback(report);
}

function buildReportMailPayload(report, dossierEmails = []) {
    const uniqueEmails = Array.from(new Set(
        (Array.isArray(dossierEmails) ? dossierEmails : [])
            .map((item) => String(item?.email || item || "").trim().toLowerCase())
            .filter((email) => email.includes("@"))
    ));

    if (!uniqueEmails.length) {
        return null;
    }

    const reportRef = String(report?.id || report?.uid || "rapport").trim();
    const affair = String(report?.affair || "").trim();
    const subject = affair ? `Rapport ${reportRef} — ${affair}` : `Rapport ${reportRef}`;
    const body = [
        "Bonjour,",
        "",
        `Veuillez trouver ci-joint le rapport ${reportRef}.`,
        "",
        "Cordialement,",
    ].join("\n");

    return {
        uniqueEmails,
        bcc: uniqueEmails.join(","),
        subject,
        body,
    };
}

function buildGmailComposeUrl({ bcc, subject, body }) {
    const params = new URLSearchParams({
        view: "cm",
        fs: "1",
        su: subject,
        body,
    });

    if (bcc) {
        params.set("bcc", bcc);
    }

    return `https://mail.google.com/mail/?${params.toString()}`;
}

function buildReportMailto(payload) {
    if (!payload) {
        return null;
    }

    const queryParts = [
        payload.bcc ? `bcc=${encodeURIComponent(payload.bcc)}` : "",
        `subject=${encodeURIComponent(payload.subject)}`,
        `body=${encodeURIComponent(payload.body)}`,
    ].filter(Boolean);

    return `mailto:?${queryParts.join("&")}`;
}

function openReportMailCompose(report, dossierEmails = []) {
    const payload = buildReportMailPayload(report, dossierEmails);
    if (!payload) {
        return false;
    }

    const gmailUrl = buildGmailComposeUrl(payload);
    const popup = window.open(gmailUrl, "_blank", "noopener,noreferrer");
    if (popup) {
        return true;
    }

    const mailto = buildReportMailto(payload);
    if (!mailto) {
        return false;
    }

    const link = document.createElement("a");
    link.href = mailto;
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
}

function getReportMailSuccessMessage(report, dossierEmails = [], { isReissue = false } = {}) {
    const payload = buildReportMailPayload(report, dossierEmails);
    const prefix = isReissue ? "Rapport réémis." : "Rapport émis.";
    const count = payload?.uniqueEmails?.length || 0;

    if (count > 1) {
        return `${prefix} Gmail ouvert avec ${count} adresses du dossier en BCC.`;
    }

    return `${prefix} Gmail ouvert avec l'adresse du dossier en BCC.`;
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
            appendValidationIframeParams(params);
            return `/rapports/de/view?${params.toString()}`;
        }
        const deRef = sourceId || essaiReference || uid || id;
        if (!deRef) return "";
        const params = new URLSearchParams();
        params.set("mode", "work");
        params.set("source_id", deRef);
        appendValidationIframeParams(params);
        return `/rapports/de/view?${params.toString()}`;
    }
    if (type === "PMT") {
        const resolved = pmtEssaiId || sourceId || uid || id;
        if (!resolved) return "";
        const params = new URLSearchParams();
        params.set("pmt_essai_id", String(resolved));
        appendValidationIframeParams(params);
        return `/rapports/pmt/view?${params.toString()}`;
    }
    if (type === "SC") {
        const scRef = sourceId || essaiReference || uid || id;
        if (sourceUid) {
            const params = new URLSearchParams();
            params.set("source_family", "terrain");
            params.set("source_uid", sourceUid);
            if (pointUid) params.set("point", pointUid);
            if (scRef) params.set("reference", scRef);
            appendValidationIframeParams(params);
            return `/rapports/sc/view?${params.toString()}`;
        }
        if (!scRef) return "";
        const params = new URLSearchParams();
        if (pointUid) params.set("point", pointUid);
        appendValidationIframeParams(params);
        return `/rapports/sc/${encodeURIComponent(scRef)}?${params.toString()}`;
    }
    if (type === "SO") {
        const soRef = sourceId || essaiReference || uid || id;
        if (sourceUid) {
            const params = new URLSearchParams();
            params.set("source_family", "terrain");
            params.set("source_uid", sourceUid);
            if (pointUid) params.set("point", pointUid);
            if (soRef) params.set("reference", soRef);
            appendValidationIframeParams(params);
            return `/rapports/so/view?${params.toString()}`;
        }
        if (!soRef) return "";
        const params = new URLSearchParams();
        if (pointUid) params.set("point", pointUid);
        appendValidationIframeParams(params);
        return `/rapports/so/${encodeURIComponent(soRef)}?${params.toString()}`;
    }
    if (type === "VC") {
        const feuilleUid = sourceUid || sourceId || uid.split(":").pop() || id;
        if (!feuilleUid) return "";
        const params = new URLSearchParams();
        appendValidationIframeParams(params);
        return `/rapports/vc/${encodeURIComponent(feuilleUid)}?${params.toString()}`;
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
        mail: "✉",
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
        return (
            <div className="vrp-state-card">
                <Icon name="file" size={32} />
                <strong>Prévisualisation indisponible</strong>
                <span>Impossible de construire l’URL du rapport pour {report?.id || "ce dossier"}.</span>
            </div>
        );
    }
    return (
        <div className="vrp-reader-pdf-wrap">
            <iframe
                id={VALIDATION_PREVIEW_IFRAME_ID}
                key={`${report.uid || report.id}-${report.status}`}
                title={`Rapport ${report.id}`}
                src={target}
                className="vrp-reader-pdf"
            />
        </div>
    );
}

function ValidationGauge({ report }) {
    const level = getValidationLevel(report);
    const gaugeByLevel = {
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
        },
        issued: {
            title: "Rapport émis",
            detail: "Réémission possible (impression, mail, etc.)",
            className: "vrp-gauge-issued",
            icon: "send"
        },
        validated: {
            title: "Validé techniquement",
            detail: "En attente d'émission ou de diffusion",
            className: "vrp-gauge-validated",
            icon: "shield"
        },
        rejected: {
            title: "Rapport refusé",
            detail: "Décision de refus enregistrée",
            className: "vrp-gauge-blocked",
            icon: "lock"
        },
        correction: {
            title: "Correction demandée",
            detail: "Le rapport doit être corrigé",
            className: "vrp-gauge-warning",
            icon: "alert"
        }
    };
    const data = gaugeByLevel[level] || gaugeByLevel.draft;

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

function buildCorrectionComment(selectedReasonIds, detail) {
    const labels = CORRECTION_REASONS
        .filter((reason) => selectedReasonIds.includes(reason.id))
        .map((reason) => reason.label);

    const lines = ["Demande de correction :"];
    if (labels.length) {
        lines.push(...labels.map((label) => `• ${label}`));
    }
    const cleanDetail = String(detail || "").trim();
    if (cleanDetail) {
        lines.push("", "Précisions :", cleanDetail);
    }
    return lines.join("\n");
}

function CorrectionRequestModal({ open, onClose, onSubmit, loading, reportId }) {
    const [selectedReasons, setSelectedReasons] = useState([]);
    const [detail, setDetail] = useState("");

    useEffect(() => {
        if (!open) {
            return;
        }
        setSelectedReasons([]);
        setDetail("");
    }, [open]);

    function toggleReason(reasonId) {
        setSelectedReasons((current) => (
            current.includes(reasonId)
                ? current.filter((id) => id !== reasonId)
                : [...current, reasonId]
        ));
    }

    function handleSubmit(event) {
        event.preventDefault();
        const cleanDetail = String(detail || "").trim();
        if (!selectedReasons.length && !cleanDetail) {
            return;
        }
        onSubmit({
            reasonIds: selectedReasons,
            detail: cleanDetail,
            comment: buildCorrectionComment(selectedReasons, cleanDetail),
        });
    }

    const canSubmit = selectedReasons.length > 0 || String(detail || "").trim().length > 0;

    return (
        <Modal open={open} onClose={onClose} title="Demande de correction" size="lg">
            <form className="vrp-correction-modal" onSubmit={handleSubmit}>
                <p className="vrp-correction-modal-intro">
                    Indiquez ce qui doit être corrigé sur le rapport
                    {reportId ? <strong> {reportId}</strong> : null}
                    . Sélectionnez un ou plusieurs motifs et précisez si nécessaire.
                </p>

                <div className="vrp-correction-reasons">
                    {CORRECTION_REASONS.map((reason) => {
                        const checked = selectedReasons.includes(reason.id);
                        return (
                            <label
                                key={reason.id}
                                className={classNames("vrp-correction-reason", checked && "vrp-correction-reason-selected")}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleReason(reason.id)}
                                />
                                <span>{reason.label}</span>
                            </label>
                        );
                    })}
                </div>

                <label className="vrp-correction-detail-label">
                    Précisions complémentaires
                    <textarea
                        value={detail}
                        onChange={(event) => setDetail(event.target.value)}
                        placeholder="Ex. : recalculer la compacité, corriger la profondeur d'arrêt, remplacer la photo de la carotte..."
                        className="vrp-correction-detail-area"
                        rows={5}
                    />
                </label>

                <div className="vrp-correction-modal-actions">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                        Annuler
                    </Button>
                    <Button type="submit" variant="danger" disabled={!canSubmit || loading}>
                        {loading ? "Envoi…" : "Envoyer la demande de correction"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function IssueReportModal({ open, onClose, onSubmit, loading, reportId, reportUid = "", isReissue = false }) {
    const [pendingMode, setPendingMode] = useState(null);
    const [optionsReady, setOptionsReady] = useState(false);
    const [dossierEmails, setDossierEmails] = useState([]);
    const [emailsLoading, setEmailsLoading] = useState(false);
    const [emailsError, setEmailsError] = useState("");

    useEffect(() => {
        if (!open) {
            setPendingMode(null);
            setOptionsReady(false);
            setDossierEmails([]);
            setEmailsLoading(false);
            setEmailsError("");
            return undefined;
        }

        const timer = window.setTimeout(() => setOptionsReady(true), 350);
        return () => window.clearTimeout(timer);
    }, [open]);

    useEffect(() => {
        if (!open || pendingMode !== "email") {
            setDossierEmails([]);
            setEmailsLoading(false);
            setEmailsError("");
            return undefined;
        }

        const reportKey = String(reportUid || reportId || "").trim();
        if (!reportKey) {
            setEmailsError("Impossible d'identifier le rapport pour préparer le mail.");
            return undefined;
        }

        let cancelled = false;
        setEmailsLoading(true);
        setEmailsError("");

        rapportsValidationApi.getDossierEmails(reportKey)
            .then((response) => {
                if (cancelled) {
                    return;
                }

                const emails = Array.isArray(response?.emails) ? response.emails : [];
                setDossierEmails(emails);
                if (!emails.length) {
                    setEmailsError(response?.message || "Aucune adresse mail trouvée dans le dossier complet.");
                }
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }
                setDossierEmails([]);
                setEmailsError(error?.message || "Impossible de charger les adresses mail du dossier.");
            })
            .finally(() => {
                if (!cancelled) {
                    setEmailsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [open, pendingMode, reportUid, reportId]);

    const pendingOption = ISSUE_DISPATCH_OPTIONS.find((option) => option.id === pendingMode) || null;
    const canConfirmEmail = pendingMode !== "email" || (!emailsLoading && dossierEmails.length > 0);

    function handleClose() {
        if (loading) {
            return;
        }
        setPendingMode(null);
        onClose();
    }

    function handlePick(mode) {
        if (loading || !optionsReady) {
            return;
        }
        setPendingMode(mode);
    }

    function handleConfirm() {
        if (loading || !pendingMode || !canConfirmEmail) {
            return;
        }

        onSubmit(pendingMode, {
            dossierEmails,
            emailsError,
            emailsLoading,
        });
    }

    return (
        <Modal
            open={open}
            onClose={handleClose}
            title={isReissue ? "Réémettre le rapport" : "Émettre le rapport"}
            size="lg"
        >
            <div className="vrp-issue-modal">
                {!pendingMode ? (
                    <>
                        <p className="vrp-issue-modal-intro">
                            {isReissue ? "Choisissez comment rediffuser le rapport" : "Choisissez comment diffuser le rapport"}
                            {reportId ? <strong> {reportId}</strong> : null}
                            . {isReissue ? "La réémission" : "L'émission"} ne sera enregistrée qu'après confirmation.
                        </p>

                        <div className={classNames("vrp-issue-options", !optionsReady && "vrp-issue-options-pending")}>
                            {ISSUE_DISPATCH_OPTIONS.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    className={classNames("vrp-issue-option", option.disabled && "vrp-issue-option-disabled")}
                                    disabled={loading || option.disabled || !optionsReady}
                                    onClick={() => handlePick(option.id)}
                                >
                                    <span className="vrp-issue-option-icon">
                                        <Icon name={option.icon} size={20} />
                                    </span>
                                    <span className="vrp-issue-option-text">
                                        <span className="vrp-issue-option-title">{option.title}</span>
                                        <span className="vrp-issue-option-description">{option.description}</span>
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="vrp-issue-modal-actions">
                            <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
                                Annuler
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="vrp-issue-modal-intro">
                            Confirmer {isReissue ? "la réémission" : "l'émission"} du rapport
                            {reportId ? <strong> {reportId}</strong> : null}
                            {" "}via <strong>{pendingOption?.title || pendingMode}</strong> ?
                        </p>
                        {pendingOption?.description ? (
                            <p className="vrp-issue-modal-confirm-copy">{pendingOption.description}</p>
                        ) : null}
                        {pendingMode === "email" ? (
                            <p className={classNames("vrp-issue-modal-confirm-copy", emailsError && "vrp-issue-modal-confirm-error")}>
                                {emailsLoading
                                    ? "Chargement des adresses mail du dossier…"
                                    : emailsError
                                        ? emailsError
                                        : `${dossierEmails.length} adresse(s) seront ajoutées en copie cachée (BCC) dans Gmail.`}
                            </p>
                        ) : null}

                        <div className="vrp-issue-modal-actions vrp-issue-modal-actions-confirm">
                            <Button type="button" variant="secondary" onClick={() => setPendingMode(null)} disabled={loading}>
                                Retour
                            </Button>
                            <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
                                Annuler
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={handleConfirm}
                                disabled={loading || !canConfirmEmail}
                            >
                                {loading ? (isReissue ? "Réémission…" : "Émission…") : (isReissue ? "Confirmer la réémission" : "Confirmer l'émission")}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
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

function ValidationPanel({ report, sessionUser, comment, setComment, onAction, onOpenCorrectionModal, onOpenIssueModal, onOpenEssaiFeuille, actionLoading }) {
    const canRunValidation = canValidateReport(report);
    const canRunIssue = canIssueReport(report);
    const issueBlockedReason = getIssueBlockedReason(report);
    const issueActionLabel = getIssueActionLabel(report);
    const needsEssaiCorrection = isCorrectionRequested(report?.status);

    return (
        <div className="vrp-validation-panel">
            <div className="vrp-validation-head">
                <div>
                    <div className="vrp-kicker">Décision</div>
                    <h2>Validation rapport</h2>
                    <SessionUserChip user={sessionUser} compact />
                </div>
                <Icon name="shield" size={22} />
            </div>

            <div className="vrp-validation-scroll">
                <ValidationGauge report={report} />

                {needsEssaiCorrection ? (
                    <section className="vrp-panel-card vrp-correction-target-card">
                        <h3 className="vrp-panel-title">
                            <Icon name="edit" size={18} />
                            Correction sur la feuille essai
                        </h3>
                        <p className="vrp-correction-target-copy">
                            Les modifications se font dans la feuille de saisie (données terrain / calculs), pas dans le PDF du rapport.
                        </p>
                        <button
                            type="button"
                            className="vrp-primary-action vrp-correction-target-action"
                            onClick={onOpenEssaiFeuille}
                        >
                            Ouvrir feuille essai
                        </button>
                    </section>
                ) : null}

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
                        <InfoBox label="Auteur" value={report.author || "—"} />
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
                        onClick={onOpenCorrectionModal}
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
                    onClick={() => {
                        const reportRef = String(report?.id || "").trim();
                        const prompt = reportRef
                            ? `Confirmer la validation technique du rapport ${reportRef} ?`
                            : "Confirmer la validation technique de ce rapport ?";
                        if (window.confirm(prompt)) {
                            onAction("technical_validation");
                        }
                    }}
                >
                    <Icon name="shield" size={18} />
                    Valider techniquement
                </button>
                <button
                    type="button"
                    disabled={!canRunIssue || actionLoading}
                    title={canRunIssue ? issueActionLabel : issueBlockedReason}
                    className={classNames("vrp-issue-action", (!canRunIssue || actionLoading) && "vrp-action-disabled")}
                    onClick={onOpenIssueModal}
                >
                    <Icon name="send" size={18} />
                    {issueActionLabel}
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

function SuccessBanner({ message, onDismiss }) {
    if (!message) {
        return null;
    }

    return (
        <div className="vrp-success-banner">
            <div>
                <strong>Enregistré</strong>
                <span>{message}</span>
            </div>
            <button type="button" onClick={onDismiss}>OK</button>
        </div>
    );
}

export default function ValiderRapportsPage() {
    const navigate = useNavigate();
    const { user: sessionUser } = useAuth();
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
    const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
    const [issueModalOpen, setIssueModalOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [usingFallback, setUsingFallback] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const listBusy = loading || searchLoading;

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
        setLoading(true);
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
            setLoading(false);
        }
    }

    async function refreshCurrentReportList() {
        const q = String(query || selectedReportId || "").trim();
        if (q) {
            await searchByReference();
            return;
        }
        await loadReports();
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
        const report = reports.find((item) => item.id === selectedReportId);
        setComment(String(report?.validationComment || ""));
    }, [selectedReportId, reports]);

    function selectReport(reportId) {
        setSelectedReportId(reportId);
    }

    function selectNextReport() {
        const nextId = getNextReportId(visibleReports.length ? visibleReports : reports, selectedReportId);

        if (nextId) {
            selectReport(nextId);
        }
    }

    async function handleAction(action, options = {}) {
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
        const isReissue = action === "issue" && isReportIssued(selectedReport);
        const actorLabel = formatSessionUserLabel(sessionUser);
        const actionComment = String(options.comment ?? comment ?? "").trim();

        const payload = {
            action,
            status: nextStatus,
            comment: actionComment,
            report_id: selectedReport.uid || selectedReport.id,
            user: actorLabel,
            ...(Array.isArray(options.correctionReasons) && options.correctionReasons.length
                ? { correction_reasons: options.correctionReasons }
                : {}),
        };

        setActionLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        try {
            const response = await rapportsValidationApi.updateStatus(selectedReport.uid || selectedReport.id, payload);

            if (response?.persisted === false) {
                setErrorMessage("La décision n’a pas pu être enregistrée en base. Vérifiez que l’API backend est démarrée.");
                await refreshCurrentReportList();
                return;
            }

            const firstCorrectionReason = actionComment
                .split("\n")
                .find((line) => line.startsWith("•"))
                ?.replace(/^•\s*/, "");
            const historyAction = action === "correction_requested"
                ? (firstCorrectionReason
                    ? `Correction demandée — ${firstCorrectionReason}`
                    : "Correction demandée")
                : action === "technical_validation"
                    ? "Validation technique"
                    : action === "issue"
                        ? (isReissue ? "Réémission du rapport" : "Émission du rapport")
                        : "Révision demandée";

            setReports((currentReports) => currentReports.map((report) => {
                if (report.id !== selectedReport.id) {
                    return report;
                }

                return {
                    ...report,
                    status: nextStatus,
                    validationComment: actionComment || report.validationComment,
                    history: [
                        {
                            id: `${Date.now()}-${action}`,
                            user: actorLabel,
                            action: historyAction,
                            time: new Date().toLocaleString("fr-FR"),
                            comment: actionComment,
                        },
                        ...report.history
                    ]
                };
            }));
            if (action === "correction_requested") {
                setCorrectionModalOpen(false);
                setStatusFilter(STATUS.all);
                const essaiTarget = buildEssaiTarget(selectedReport);
                const essaiHint = essaiTarget
                    ? ` Le technicien doit corriger l’essai (${essaiTarget}), pas le PDF du rapport.`
                    : " Le technicien doit corriger les données de l’essai, pas le PDF du rapport.";
                setSuccessMessage(
                    (response?.message || "Demande de correction enregistrée. Le statut est passé à « Correction demandée ».")
                    + essaiHint
                );
            } else if (action === "technical_validation") {
                setSuccessMessage(response?.message || "Validation technique enregistrée.");
            } else if (action === "issue") {
                setIssueModalOpen(false);
                const issueSuccessPrefix = isReissue ? "Rapport réémis." : "Rapport émis.";
                if (options.issueMode === "print") {
                    const printOpened = options.printOk !== false;
                    setSuccessMessage(
                        printOpened
                            ? `${issueSuccessPrefix} Dialogue d'impression ouvert.`
                            : `${issueSuccessPrefix} Impossible d'ouvrir l'impression automatique.`
                    );
                } else if (options.issueMode === "email") {
                    if (options.mailOpened) {
                        setSuccessMessage(getReportMailSuccessMessage(selectedReport, options.dossierEmails, { isReissue }));
                    } else {
                        setSuccessMessage(`${issueSuccessPrefix}`);
                        setErrorMessage(options.emailsError || "Impossible d'ouvrir Gmail.");
                    }
                } else {
                    setSuccessMessage(response?.message || `${issueSuccessPrefix} Diffusion enregistrée.`);
                }
            } else {
                setSuccessMessage(response?.message || "Décision enregistrée.");
            }

            await refreshCurrentReportList();
        } catch (error) {
            setErrorMessage(error.message || "Action impossible sur ce rapport.");
            setSuccessMessage("");
        } finally {
            setActionLoading(false);
        }
    }

    async function handleCorrectionSubmit({ reasonIds, detail, comment: correctionComment }) {
        await handleAction("correction_requested", {
            comment: correctionComment,
            correctionReasons: reasonIds,
            correctionDetail: detail,
        });
    }

    async function handleIssueSubmit(issueMode, extras = {}) {
        if (!selectedReport || actionLoading) {
            return;
        }

        const isReissue = isReportIssued(selectedReport);
        let printOk = null;
        let mailOpened = false;

        if (issueMode === "print") {
            printOk = openReportPrintDialog(selectedReport);
        } else if (issueMode === "email") {
            if (extras.emailsLoading) {
                return;
            }

            mailOpened = openReportMailCompose(selectedReport, extras.dossierEmails || []);
            if (!mailOpened) {
                setErrorMessage(extras.emailsError || "Aucune adresse mail trouvée dans le dossier complet.");
                setSuccessMessage("");
                return;
            }
        }

        await handleAction("issue", {
            issueMode,
            printOk,
            mailOpened,
            dossierEmails: extras.dossierEmails || [],
            emailsError: extras.emailsError || "",
        });
    }

    function openEssaiFeuille(report = selectedReport) {
        let target = buildEssaiTarget(report);
        if (!target) {
            setErrorMessage("Impossible de construire l’URL de la feuille essai pour ce dossier.");
            return;
        }
        const returnTo = buildReportTarget(report) || "/rapports/validation";
        const separator = target.includes("?") ? "&" : "?";
        navigate(`${target}${separator}return_to=${encodeURIComponent(returnTo)}`);
    }

    const selectedNeedsEssaiCorrection = isCorrectionRequested(selectedReport?.status);
    const selectedFeuilleTarget = selectedReport ? buildEssaiTarget(selectedReport) : "";

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
                        <SessionUserChip user={sessionUser} compact />
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
                        {listBusy && <LoadingState />}
                        {!listBusy && visibleReports.map((report) => (
                            <ReportRailCard
                                key={report.id}
                                report={report}
                                selected={report.id === selectedReportId}
                                onClick={() => selectReport(report.id)}
                            />
                        ))}
                        {!listBusy && visibleReports.length === 0 && <EmptyState />}
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
                        <div className="vrp-main-head-actions">
                            <SessionUserChip user={sessionUser} />
                            {selectedFeuilleTarget ? (
                                <button
                                    type="button"
                                    className="vrp-full-report-button vrp-full-report-button-essai"
                                    onClick={() => openEssaiFeuille(selectedReport)}
                                >
                                    Ouvrir feuille essai
                                </button>
                            ) : null}
                            {!selectedNeedsEssaiCorrection ? (
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
                            ) : null}
                        </div>
                    </header>

                    <ErrorBanner message={errorMessage} usingFallback={usingFallback} onRetry={loadReports} />
                    <SuccessBanner message={successMessage} onDismiss={() => setSuccessMessage("")} />

                    {selectedReport && (
                        <ReaderToolbar
                            onNextReport={selectNextReport}
                        />
                    )}

                    <div className="vrp-reader-area">
                        {listBusy && !selectedReport ? <LoadingState /> : null}
                        {!listBusy && !selectedReport ? <EmptyState /> : null}
                        {selectedReport ? <ReportReader report={selectedReport} /> : null}
                    </div>
                </main>

                <aside className="vrp-validation-column">
                    {selectedReport && (
                        <ValidationPanel
                            report={selectedReport}
                            sessionUser={sessionUser}
                            comment={comment}
                            setComment={setComment}
                            onAction={handleAction}
                            onOpenCorrectionModal={() => setCorrectionModalOpen(true)}
                            onOpenIssueModal={() => setIssueModalOpen(true)}
                            onOpenEssaiFeuille={() => openEssaiFeuille(selectedReport)}
                            actionLoading={actionLoading}
                        />
                    )}
                </aside>
            </div>

            <CorrectionRequestModal
                open={correctionModalOpen}
                onClose={() => {
                    if (!actionLoading) {
                        setCorrectionModalOpen(false);
                    }
                }}
                onSubmit={handleCorrectionSubmit}
                loading={actionLoading}
                reportId={selectedReport?.id || ""}
            />

            <IssueReportModal
                open={issueModalOpen}
                onClose={() => {
                    if (!actionLoading) {
                        setIssueModalOpen(false);
                    }
                }}
                onSubmit={handleIssueSubmit}
                loading={actionLoading}
                reportId={selectedReport?.id || ""}
                reportUid={selectedReport?.uid || selectedReport?.id || ""}
                isReissue={isReportIssued(selectedReport)}
            />
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
    display: flex;
    flex-direction: column;
    gap: 12px;
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

.vrp-full-report-button-essai {
    border-color: rgba(255, 204, 0, 0.45);
    background: rgba(255, 204, 0, 0.16);
    color: #fff8df;
}

.vrp-full-report-button-essai:hover {
    background: rgba(255, 204, 0, 0.24);
}

.vrp-correction-target-card {
    border-color: #f5d08a;
    background: linear-gradient(180deg, #fff9eb 0%, #fffdf7 100%);
}

.vrp-correction-target-copy {
    margin: 0 0 14px;
    color: #7a5b12;
    font-size: 13px;
    line-height: 1.5;
}

.vrp-correction-target-action {
    width: 100%;
    justify-content: center;
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

.vrp-success-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 16px 10px;
    padding: 10px 14px;
    border: 1px solid #86efac;
    border-radius: 14px;
    background: #ecfdf5;
    color: #166534;
    font-size: 13px;
}

.vrp-success-banner button {
    flex-shrink: 0;
    border: 1px solid #166534;
    border-radius: 999px;
    background: #fff;
    color: #166534;
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

.vrp-main-head-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
    flex-shrink: 0;
}

.vrp-session-user {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 280px;
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: #f8fafc;
}

.vrp-session-user-compact {
    margin-top: 10px;
    max-width: 100%;
    padding: 7px 9px;
}

.vrp-session-user-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: linear-gradient(135deg, #003170 0%, #1d4ed8 100%);
    color: #fff;
    font-size: 12px;
    font-weight: 950;
    flex-shrink: 0;
}

.vrp-session-user-compact .vrp-session-user-avatar {
    width: 30px;
    height: 30px;
    font-size: 11px;
}

.vrp-session-user-text {
    min-width: 0;
}

.vrp-session-user-kicker {
    color: #94a3b8;
    font-size: 10px;
    font-weight: 950;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.vrp-session-user-name {
    color: #0f172a;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.25;
    word-break: break-word;
}

.vrp-correction-modal {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.vrp-correction-modal-intro {
    margin: 0;
    color: #475569;
    font-size: 13px;
    line-height: 1.5;
}

.vrp-correction-reasons {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
}

.vrp-correction-reason {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #f8fafc;
    color: #0f172a;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}

.vrp-correction-reason-selected {
    border-color: #fca5a5;
    background: #fef2f2;
}

.vrp-correction-reason input {
    margin-top: 2px;
    flex-shrink: 0;
}

.vrp-correction-detail-label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: #334155;
    font-size: 12px;
    font-weight: 800;
}

.vrp-correction-detail-area {
    width: 100%;
    min-height: 110px;
    padding: 10px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    resize: vertical;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.45;
}

.vrp-correction-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 4px;
}

.vrp-issue-modal {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.vrp-issue-modal-intro {
    margin: 0;
    color: #475569;
    font-size: 13px;
    line-height: 1.5;
}

.vrp-issue-options {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
}

.vrp-issue-option {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    border: 1px solid #dbeafe;
    border-radius: 14px;
    background: linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%);
    color: #0f172a;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.vrp-issue-option:hover:not(:disabled) {
    border-color: #93c5fd;
    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.12);
    transform: translateY(-1px);
}

.vrp-issue-option-disabled,
.vrp-issue-option:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.vrp-issue-option-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: rgba(0, 49, 112, 0.08);
    color: #003170;
    flex-shrink: 0;
}

.vrp-issue-option-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.vrp-issue-option-title {
    font-size: 14px;
    font-weight: 900;
    color: #0f172a;
}

.vrp-issue-option-description {
    font-size: 12px;
    line-height: 1.45;
    color: #64748b;
    font-weight: 500;
}

.vrp-issue-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.vrp-issue-modal-actions-confirm {
    flex-wrap: wrap;
}

.vrp-issue-modal-confirm-copy {
    margin: 0 0 18px;
    font-size: 13px;
    line-height: 1.5;
    color: #475569;
}

.vrp-issue-modal-confirm-error {
    color: #b91c1c;
}

.vrp-issue-options-pending {
    opacity: 0.72;
    pointer-events: none;
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

.vrp-gauge-issued {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
}

.vrp-gauge-validated {
    border-color: #a7f3d0;
    background: #f0fdf4;
    color: #047857;
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

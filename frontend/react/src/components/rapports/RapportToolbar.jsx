// RapportToolbar.jsx
import React from "react";

function noop() {}

export default function RapportToolbar({
    onPrint = noop,
    onExportPdf = noop,
    onReview = noop,
    onValidate = noop,
    onPrepareMail = noop,
    showPrint = true,
    showExportPdf = true,
    showReview = true,
    showValidate = true,
    showPrepareMail = true,
    disablePrint = false,
    disableExportPdf = false,
    disableReview = false,
    disableValidate = false,
    disablePrepareMail = false,
    loadingPrint = false,
    loadingExportPdf = false,
    loadingReview = false,
    loadingValidate = false,
    loadingPrepareMail = false,
    labels = {},
}) {
    const printLabel = labels.print || "Imprimer";
    const exportLabel = labels.exportPdf || "Exporter PDF";
    const reviewLabel = labels.review || "Envoyer en relecture";
    const validateLabel = labels.validate || "Valider";
    const mailLabel = labels.prepareMail || "Préparer mail";

    return (
        <div className="rapport-toolbar no-print">
            {showPrint ? (
                <button type="button" onClick={onPrint} disabled={disablePrint || loadingPrint}>
                    {loadingPrint ? "Impression..." : printLabel}
                </button>
            ) : null}
            {showExportPdf ? (
                <button type="button" onClick={onExportPdf} disabled={disableExportPdf || loadingExportPdf}>
                    {loadingExportPdf ? "Export..." : exportLabel}
                </button>
            ) : null}
            {showReview ? (
                <button type="button" onClick={onReview} disabled={disableReview || loadingReview}>
                    {loadingReview ? "Relecture..." : reviewLabel}
                </button>
            ) : null}
            {showValidate ? (
                <button type="button" onClick={onValidate} disabled={disableValidate || loadingValidate}>
                    {loadingValidate ? "Validation..." : validateLabel}
                </button>
            ) : null}
            {showPrepareMail ? (
                <button type="button" onClick={onPrepareMail} disabled={disablePrepareMail || loadingPrepareMail}>
                    {loadingPrepareMail ? "Préparation..." : mailLabel}
                </button>
            ) : null}
        </div>
    );
}

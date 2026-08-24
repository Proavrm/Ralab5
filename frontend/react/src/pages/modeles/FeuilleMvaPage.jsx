// FeuilleMvaPage.jsx
// Path not confirmed: replace or create this file at the real RaLab5 frontend page location.
// Purpose: MVA worksheet page for asphalt specimen bulk density, compacity and voids calculations.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, essaisApi } from "@/services/api";
import { resolveReturnTo } from "@/lib/detailNavigation";
import {
    buildDedicatedEssaiRapportPath,
    parseEssaiResultats,
    stringifyEssaiResultats,
} from "@/lib/essaiFeuilleRoutes";

const MVA_STORAGE_KEY = "ralab5:mva:draft";

const emptySpecimen = {
    id: "",
    reference: "",
    dryMassG: "",
    paraffinedDryMassG: "",
    underwaterMassG: "",
    heightCm: "",
    comment: ""
};

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

const emptyMvaDraft = {
    id: "draft",
    header: {
        chronoNumber: "",
        affairNumber: "",
        reportDate: "",
        reportTitle: "",
        laboratory: "",
        operator: "",
        sampleDate: "",
        testDate: "",
        productNature: "",
        origin: "",
        layer: ""
    },
    criteria: {
        source: "",
        definition: "",
        voidsMinPct: "",
        voidsMaxPct: ""
    },
    parameters: {
        waterTemperatureC: "20",
        waterDensityKgM3: "998.2",
        paraffinDensityKgM3: "890",
        mvrKgM3: ""
    },
    specimens: [
        {
            ...emptySpecimen,
            id: "mva-specimen-1"
        }
    ],
    conclusion: {
        controlType: "Contrôle",
        manualStatus: "auto",
        comment: ""
    },
    signature: {
        name: "",
        function: "",
        visa: ""
    }
};

function mvaStorageKey(uid) {
    const clean = String(uid || "").trim();
    return clean ? `${MVA_STORAGE_KEY}:${clean}` : MVA_STORAGE_KEY;
}

function createSpecimenId() {
    return `mva-specimen-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

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

function formatNumber(value, digits = 1) {
    if (!Number.isFinite(value)) {
        return "";
    }

    return value.toLocaleString("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatInputNumber(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value);
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
            volume: null,
            densityKgM3: null,
            compacityPct: null,
            voidsPct: null,
            isConform: null,
            error: "Données incomplètes"
        };
    }

    const apparentVolume = ((paraffinedDryMassG - underwaterMassG) / waterDensityKgM3)
        - ((paraffinedDryMassG - dryMassG) / paraffinDensityKgM3);

    if (!Number.isFinite(apparentVolume) || apparentVolume <= 0) {
        return {
            volume: null,
            densityKgM3: null,
            compacityPct: null,
            voidsPct: null,
            isConform: null,
            error: "Volume invalide"
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
        volume: apparentVolume,
        densityKgM3: roundTo(densityKgM3, 1),
        compacityPct: compacityPct !== null ? roundTo(compacityPct, 1) : null,
        voidsPct: voidsPct !== null ? roundTo(voidsPct, 1) : null,
        isConform,
        error: ""
    };
}

function calculateMvaDraft(draft) {
    const rows = draft.specimens.map((specimen) => ({
        ...specimen,
        calculated: calculateMvaSpecimen(specimen, draft.parameters, draft.criteria)
    }));

    const completedRows = rows.filter((row) => row.calculated.densityKgM3 !== null);
    const conformRows = completedRows.filter((row) => row.calculated.isConform === true);
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

    const averageDensity = completedRows.length > 0
        ? roundTo(completedRows.reduce((sum, row) => sum + row.calculated.densityKgM3, 0) / completedRows.length, 1)
        : null;

    const averageVoids = completedRows.length > 0
        ? roundTo(completedRows.reduce((sum, row) => sum + (row.calculated.voidsPct || 0), 0) / completedRows.length, 1)
        : null;

    const averageCompacity = completedRows.length > 0
        ? roundTo(completedRows.reduce((sum, row) => sum + (row.calculated.compacityPct || 0), 0) / completedRows.length, 1)
        : null;

    return {
        rows,
        completedRows,
        conformRows,
        nonConformRows,
        status,
        averageDensity,
        averageVoids,
        averageCompacity
    };
}

function mergeMvaDraft(parsed, fallback = emptyMvaDraft) {
    const source = parsed && typeof parsed === "object" ? parsed : {};
    const specimens = Array.isArray(source.specimens) && source.specimens.length > 0
        ? source.specimens
        : fallback.specimens;
    return {
        ...fallback,
        ...source,
        id: source.id || fallback.id,
        header: {
            ...fallback.header,
            ...(source.header || {})
        },
        criteria: {
            ...fallback.criteria,
            ...(source.criteria || {})
        },
        parameters: {
            ...fallback.parameters,
            ...(source.parameters || {})
        },
        conclusion: {
            ...fallback.conclusion,
            ...(source.conclusion || {})
        },
        signature: {
            ...fallback.signature,
            ...(source.signature || {})
        },
        specimens
    };
}

function draftFromResultats(raw) {
    const parsed = parseEssaiResultats(raw);
    if (!parsed || (!parsed.header && !parsed.specimens && parsed.worksheet_kind !== "mva")) {
        return null;
    }
    return mergeMvaDraft(parsed);
}

function resultatsFromDraft(draft, calculation) {
    return {
        worksheet_kind: "mva",
        id: draft.id,
        header: draft.header,
        criteria: draft.criteria,
        parameters: draft.parameters,
        specimens: draft.specimens,
        conclusion: draft.conclusion,
        signature: draft.signature,
        masse_volumique_eprouvette_kg_m3: calculation?.averageDensity ?? null,
        compacite_percent: calculation?.averageCompacity ?? null,
        vides_percent: calculation?.averageVoids ?? null
    };
}

function readStoredDraft(uid) {
    try {
        const raw = window.localStorage.getItem(mvaStorageKey(uid));
        if (!raw) {
            return emptyMvaDraft;
        }
        return mergeMvaDraft(JSON.parse(raw));
    } catch (error) {
        console.warn("Unable to read stored MVA draft", error);
        return emptyMvaDraft;
    }
}

function writeStoredDraft(uid, draft) {
    window.localStorage.setItem(mvaStorageKey(uid), JSON.stringify(draft));
}

function Field({ label, value, onChange, type = "text", placeholder = "", className = "" }) {
    return (
        <label className={`mva-field ${className}`}>
            <span>{label}</span>
            <input
                type={type}
                value={formatInputNumber(value)}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    );
}

function TextAreaField({ label, value, onChange, placeholder = "", className = "" }) {
    return (
        <label className={`mva-field ${className}`}>
            <span>{label}</span>
            <textarea
                value={value || ""}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    );
}

function SelectField({ label, value, onChange, children, className = "" }) {
    return (
        <label className={`mva-field ${className}`}>
            <span>{label}</span>
            <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
                {children}
            </select>
        </label>
    );
}

function SummaryCard({ label, value, unit, tone = "neutral" }) {
    return (
        <div className={`mva-summary-card mva-summary-card--${tone}`}>
            <span>{label}</span>
            <strong>{value || "—"}</strong>
            {unit ? <small>{unit}</small> : null}
        </div>
    );
}

export default function FeuilleMvaPage() {
    const navigate = useNavigate();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const uidFromPath = String(params.uid || "").trim();
    const isNew = uidFromPath === "new" || (!uidFromPath && Boolean(searchParams.get("echantillon_id") || searchParams.get("intervention_id")));
    const persistedUid = isNew ? "" : uidFromPath;
    const echantillonId = Number.parseInt(searchParams.get("echantillon_id") || "", 10);
    const interventionId = Number.parseInt(searchParams.get("intervention_id") || "", 10);
    const returnTo = resolveReturnTo(searchParams, "/labo/workbench?tab=essais");

    const [draft, setDraft] = useState(() => readStoredDraft(persistedUid || "new"));
    const [saveState, setSaveState] = useState("idle");
    const [loading, setLoading] = useState(Boolean(persistedUid));
    const [error, setError] = useState("");
    const [essaiUid, setEssaiUid] = useState(persistedUid);

    const calculation = useMemo(() => calculateMvaDraft(draft), [draft]);

    useEffect(() => {
        let cancelled = false;
        const currentUid = String(params.uid || "").trim();
        const creating = currentUid === "new" || (!currentUid && Boolean(searchParams.get("echantillon_id") || searchParams.get("intervention_id")));

        async function loadEssai() {
            if (!currentUid || creating) {
                setEssaiUid("");
                setDraft(readStoredDraft("new"));
                setLoading(false);
                return;
            }
            setLoading(true);
            setError("");
            try {
                const essai = await essaisApi.get(currentUid);
                if (cancelled) return;
                const fromApi = draftFromResultats(essai?.resultats);
                setEssaiUid(String(essai?.uid || currentUid));
                setDraft(fromApi || readStoredDraft(currentUid));
            } catch (err) {
                if (cancelled) return;
                setError(err?.message || "Impossible de charger la feuille MVA.");
                setDraft(readStoredDraft(currentUid));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadEssai();
        return () => { cancelled = true; };
    }, [params.uid, searchParams]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            try {
                writeStoredDraft(essaiUid || "new", draft);
                if (saveState === "saving") setSaveState("idle");
            } catch (autosaveError) {
                console.warn("Unable to autosave MVA draft", autosaveError);
            }
        }, 350);

        return () => window.clearTimeout(timeout);
    }, [draft, essaiUid, saveState]);

    function updateGroup(groupName, fieldName, value) {
        setDraft((current) => ({
            ...current,
            [groupName]: {
                ...current[groupName],
                [fieldName]: value
            }
        }));
        setSaveState("saving");
    }

    function updateSpecimen(specimenId, fieldName, value) {
        setDraft((current) => ({
            ...current,
            specimens: current.specimens.map((specimen) => (
                specimen.id === specimenId
                    ? { ...specimen, [fieldName]: value }
                    : specimen
            ))
        }));
        setSaveState("saving");
    }

    function addSpecimen() {
        setDraft((current) => ({
            ...current,
            specimens: [
                ...current.specimens,
                {
                    ...emptySpecimen,
                    id: createSpecimenId(),
                    reference: `SC${current.specimens.length + 1}`
                }
            ]
        }));
        setSaveState("saving");
    }

    function removeSpecimen(specimenId) {
        setDraft((current) => ({
            ...current,
            specimens: current.specimens.length <= 1
                ? current.specimens
                : current.specimens.filter((specimen) => specimen.id !== specimenId)
        }));
        setSaveState("saving");
    }

    async function persistToApi() {
        const payload = {
            essai_code: "MVA",
            type_essai: searchParams.get("type_essai") || "Masse volumique des enrobés",
            norme: searchParams.get("norme") || "NF EN 12697-6",
            statut: draft.header.operator ? "En cours" : "Programmé",
            date_debut: draft.header.testDate || null,
            operateur: draft.header.operator || "",
            resultats: stringifyEssaiResultats(resultatsFromDraft(draft, calculation)),
            source_label: searchParams.get("source_label") || "",
        };
        const hasParent = (Number.isInteger(echantillonId) && echantillonId > 0)
            || (Number.isInteger(interventionId) && interventionId > 0);

        if (essaiUid) {
            return api.put(`/essais/${essaiUid}`, payload);
        }
        if (!hasParent) {
            writeStoredDraft("new", draft);
            return { uid: "" };
        }
        return essaisApi.create({
            ...payload,
            echantillon_id: Number.isInteger(echantillonId) && echantillonId > 0 ? echantillonId : undefined,
            intervention_id: Number.isInteger(echantillonId) && echantillonId > 0
                ? undefined
                : (Number.isInteger(interventionId) && interventionId > 0 ? interventionId : undefined),
        });
    }

    async function saveDraftNow() {
        try {
            setSaveState("saving");
            writeStoredDraft(essaiUid || "new", draft);
            const saved = await persistToApi();
            const savedUid = String(saved?.uid || essaiUid || "");
            if (savedUid && savedUid !== essaiUid) {
                setEssaiUid(savedUid);
                const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";
                navigate(`/modeles/mva/${encodeURIComponent(savedUid)}${query}`, { replace: true });
            }
            setSaveState("saved");
            setError("");
            return savedUid;
        } catch (err) {
            console.warn("Unable to save MVA draft", err);
            setSaveState("error");
            setError(err?.message || "Enregistrement impossible.");
            return essaiUid;
        }
    }

    function resetToExample() {
        setDraft(defaultMvaDraft);
        setSaveState("saving");
    }

    async function openReport() {
        const savedUid = await saveDraftNow();
        const target = buildDedicatedEssaiRapportPath({
            code: "MVA",
            uid: savedUid || essaiUid,
            returnTo: savedUid ? `/modeles/mva/${encodeURIComponent(savedUid)}` : "/modeles/mva",
        });
        if (target) navigate(target);
    }

    const statusTone = calculation.status === "Conforme"
        ? "ok"
        : calculation.status === "Non conforme"
            ? "danger"
            : "neutral";

    if (loading) {
        return (
            <main className="mva-page">
                <style>{mvaPageStyles}</style>
                <p className="mva-page__eyebrow">Chargement de la feuille MVA…</p>
            </main>
        );
    }

    return (
        <main className="mva-page">
            <style>{mvaPageStyles}</style>

            <header className="mva-page__header">
                <div>
                    <p className="mva-page__eyebrow">Feuille d'essai</p>
                    <h1>MVA · Masse volumique des enrobés</h1>
                    <p>
                        NF EN 12697-6-A1 · Calcul par éprouvette avec masse sèche,
                        masse sèche paraffinée et masse dans l'eau.
                    </p>
                    {error ? <p className="mva-save-state mva-save-state--error">{error}</p> : null}
                </div>

                <div className="mva-page__actions">
                    <button type="button" className="mva-button mva-button--ghost" onClick={() => navigate(returnTo)}>
                        ← Retour
                    </button>
                    <span className={`mva-save-state mva-save-state--${saveState}`}>
                        {saveState === "saving" && "Sauvegarde…"}
                        {saveState === "saved" && "Sauvegardé"}
                        {saveState === "error" && "Erreur sauvegarde"}
                        {saveState === "idle" && (essaiUid ? `Essai #${essaiUid}` : "Brouillon local")}
                    </span>
                    <button type="button" className="mva-button mva-button--ghost" onClick={resetToExample}>
                        Recharger exemple
                    </button>
                    <button type="button" className="mva-button mva-button--secondary" onClick={saveDraftNow}>
                        Enregistrer
                    </button>
                    <button type="button" className="mva-button mva-button--primary" onClick={openReport}>
                        Imprimer / Rapport
                    </button>
                </div>
            </header>

            <section className="mva-summary-grid" aria-label="Synthèse MVA">
                <SummaryCard
                    label="Conclusion"
                    value={calculation.status}
                    tone={statusTone}
                />
                <SummaryCard
                    label="Masse volumique moyenne"
                    value={formatNumber(calculation.averageDensity, 1)}
                    unit="kg/m³"
                />
                <SummaryCard
                    label="Compacité moyenne"
                    value={formatNumber(calculation.averageCompacity, 1)}
                    unit="%"
                />
                <SummaryCard
                    label="Vides moyens"
                    value={formatNumber(calculation.averageVoids, 1)}
                    unit="%"
                    tone={statusTone}
                />
            </section>

            <section className="mva-layout">
                <div className="mva-main-column">
                    <section className="mva-card">
                        <div className="mva-card__title-row">
                            <div>
                                <h2>1/ Renseignements généraux</h2>
                                <p>Informations qui alimentent la feuille et le rapport.</p>
                            </div>
                        </div>

                        <div className="mva-form-grid mva-form-grid--three">
                            <Field label="Chrono" value={draft.header.chronoNumber} onChange={(value) => updateGroup("header", "chronoNumber", value)} />
                            <Field label="N° d'affaire" value={draft.header.affairNumber} onChange={(value) => updateGroup("header", "affairNumber", value)} />
                            <Field label="Date de rédaction" type="date" value={draft.header.reportDate} onChange={(value) => updateGroup("header", "reportDate", value)} />
                            <Field label="Opérateur" value={draft.header.operator} onChange={(value) => updateGroup("header", "operator", value)} />
                            <Field label="Date prélèvement" type="date" value={draft.header.sampleDate} onChange={(value) => updateGroup("header", "sampleDate", value)} />
                            <Field label="Date essai" type="date" value={draft.header.testDate} onChange={(value) => updateGroup("header", "testDate", value)} />
                            <Field label="Nature du produit" value={draft.header.productNature} onChange={(value) => updateGroup("header", "productNature", value)} />
                            <Field label="Provenance" value={draft.header.origin} onChange={(value) => updateGroup("header", "origin", value)} />
                            <Field label="Couche" value={draft.header.layer} onChange={(value) => updateGroup("header", "layer", value)} />
                        </div>

                        <div className="mva-form-grid mva-form-grid--one">
                            <Field label="Titre / chantier affiché" value={draft.header.reportTitle} onChange={(value) => updateGroup("header", "reportTitle", value)} />
                            <Field label="Laboratoire" value={draft.header.laboratory} onChange={(value) => updateGroup("header", "laboratory", value)} />
                        </div>
                    </section>

                    <section className="mva-card">
                        <div className="mva-card__title-row">
                            <div>
                                <h2>2/ Critères de conformité</h2>
                                <p>Contrôle automatique sur le pourcentage de vides.</p>
                            </div>
                        </div>

                        <div className="mva-form-grid mva-form-grid--two mva-form-grid--criteria">
                            <Field label="Source des critères" value={draft.criteria.source} onChange={(value) => updateGroup("criteria", "source", value)} />
                            <Field label="Définition critères / objectifs" value={draft.criteria.definition} onChange={(value) => updateGroup("criteria", "definition", value)} />
                            <Field label="% vides min." value={draft.criteria.voidsMinPct} onChange={(value) => updateGroup("criteria", "voidsMinPct", value)} />
                            <Field label="% vides max." value={draft.criteria.voidsMaxPct} onChange={(value) => updateGroup("criteria", "voidsMaxPct", value)} />
                        </div>
                    </section>

                    <section className="mva-card">
                        <div className="mva-card__title-row">
                            <div>
                                <h2>3/ Paramètres de calcul</h2>
                                <p>Valeurs communes utilisées pour le calcul des éprouvettes.</p>
                            </div>
                        </div>

                        <div className="mva-form-grid mva-form-grid--four">
                            <Field label="Température eau (°C)" value={draft.parameters.waterTemperatureC} onChange={(value) => updateGroup("parameters", "waterTemperatureC", value)} />
                            <Field label="Masse volumique eau (kg/m³)" value={draft.parameters.waterDensityKgM3} onChange={(value) => updateGroup("parameters", "waterDensityKgM3", value)} />
                            <Field label="Masse volumique paraffine (kg/m³)" value={draft.parameters.paraffinDensityKgM3} onChange={(value) => updateGroup("parameters", "paraffinDensityKgM3", value)} />
                            <Field label="MVR (kg/m³)" value={draft.parameters.mvrKgM3} onChange={(value) => updateGroup("parameters", "mvrKgM3", value)} />
                        </div>
                    </section>

                    <section className="mva-card mva-card--wide">
                        <div className="mva-card__title-row">
                            <div>
                                <h2>Éprouvettes</h2>
                                <p>Une ligne par carotte ou éprouvette.</p>
                            </div>
                            <button type="button" className="mva-button mva-button--secondary" onClick={addSpecimen}>
                                Ajouter éprouvette
                            </button>
                        </div>

                        <div className="mva-table-wrap">
                            <table className="mva-edit-table">
                                <thead>
                                    <tr>
                                        <th>Réf.</th>
                                        <th>Masse sèche (g)</th>
                                        <th>Masse sèche paraffinée (g)</th>
                                        <th>Masse dans l'eau (g)</th>
                                        <th>MVA (kg/m³)</th>
                                        <th>Compacité %</th>
                                        <th>% vides</th>
                                        <th>Hauteur (cm)</th>
                                        <th>Conformité</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {calculation.rows.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                <input value={row.reference || ""} onChange={(event) => updateSpecimen(row.id, "reference", event.target.value)} />
                                            </td>
                                            <td>
                                                <input value={row.dryMassG || ""} onChange={(event) => updateSpecimen(row.id, "dryMassG", event.target.value)} />
                                            </td>
                                            <td>
                                                <input value={row.paraffinedDryMassG || ""} onChange={(event) => updateSpecimen(row.id, "paraffinedDryMassG", event.target.value)} />
                                            </td>
                                            <td>
                                                <input value={row.underwaterMassG || ""} onChange={(event) => updateSpecimen(row.id, "underwaterMassG", event.target.value)} />
                                            </td>
                                            <td className="mva-table-result">{formatNumber(row.calculated.densityKgM3, 1)}</td>
                                            <td className="mva-table-result">{formatNumber(row.calculated.compacityPct, 1)}</td>
                                            <td className="mva-table-result">{formatNumber(row.calculated.voidsPct, 1)}</td>
                                            <td>
                                                <input value={row.heightCm || ""} onChange={(event) => updateSpecimen(row.id, "heightCm", event.target.value)} />
                                            </td>
                                            <td>
                                                <span className={`mva-chip ${row.calculated.isConform === true ? "mva-chip--ok" : ""} ${row.calculated.isConform === false ? "mva-chip--danger" : ""}`}>
                                                    {row.calculated.isConform === true && "Conforme"}
                                                    {row.calculated.isConform === false && "Non conforme"}
                                                    {row.calculated.isConform === null && "À compléter"}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="mva-icon-button"
                                                    title="Supprimer l'éprouvette"
                                                    onClick={() => removeSpecimen(row.id)}
                                                    disabled={draft.specimens.length <= 1}
                                                >
                                                    ×
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                <aside className="mva-side-column">
                    <section className="mva-card mva-card--sticky">
                        <h2>4/ Conclusions</h2>

                        <div className="mva-form-grid mva-form-grid--one">
                            <Field label="Contrôle" value={draft.conclusion.controlType} onChange={(value) => updateGroup("conclusion", "controlType", value)} />
                            <SelectField label="Conclusion" value={draft.conclusion.manualStatus} onChange={(value) => updateGroup("conclusion", "manualStatus", value)}>
                                <option value="auto">Automatique</option>
                                <option value="Conforme">Conforme</option>
                                <option value="Non conforme">Non conforme</option>
                                <option value="À compléter">À compléter</option>
                            </SelectField>
                            <TextAreaField label="Commentaires" value={draft.conclusion.comment} onChange={(value) => updateGroup("conclusion", "comment", value)} />
                        </div>

                        <div className="mva-side-status">
                            <span>Résultat actuel</span>
                            <strong className={`mva-status-text mva-status-text--${statusTone}`}>
                                {calculation.status}
                            </strong>
                            <small>
                                {calculation.completedRows.length} éprouvette(s) calculée(s), {calculation.nonConformRows.length} non conforme(s).
                            </small>
                        </div>
                    </section>

                    <section className="mva-card">
                        <h2>Visa</h2>
                        <div className="mva-form-grid mva-form-grid--one">
                            <Field label="Nom" value={draft.signature.name} onChange={(value) => updateGroup("signature", "name", value)} />
                            <Field label="Fonction" value={draft.signature.function} onChange={(value) => updateGroup("signature", "function", value)} />
                            <TextAreaField label="Visa" value={draft.signature.visa} onChange={(value) => updateGroup("signature", "visa", value)} />
                        </div>
                    </section>

                    <section className="mva-card mva-card--formula">
                        <h2>Calcul appliqué</h2>
                        <p>
                            Volume apparent = (masse sèche paraffinée - masse dans l'eau) / ρ eau
                            - (masse sèche paraffinée - masse sèche) / ρ paraffine.
                        </p>
                        <p>
                            MVA = masse sèche / volume apparent. Compacité = MVA / MVR × 100.
                            % vides = 100 - compacité.
                        </p>
                    </section>
                </aside>
            </section>
        </main>
    );
}

const mvaPageStyles = `
.mva-page {
    min-height: 100vh;
    padding: 24px;
    background: #f3f6fb;
    color: #172033;
    font-family: "Century Gothic", Arial, sans-serif;
}

.mva-page * {
    box-sizing: border-box;
}

.mva-page__header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    margin-bottom: 18px;
}

.mva-page__eyebrow {
    margin: 0 0 4px;
    color: #0a5baa;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.mva-page__header h1 {
    margin: 0;
    color: #002c77;
    font-size: 28px;
    line-height: 1.15;
}

.mva-page__header p {
    max-width: 780px;
    margin: 8px 0 0;
    color: #5f6c80;
    font-size: 14px;
}

.mva-page__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    min-width: 360px;
}

.mva-button,
.mva-icon-button {
    border: 0;
    border-radius: 10px;
    font-family: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
}

.mva-button:hover,
.mva-icon-button:hover {
    transform: translateY(-1px);
}

.mva-button {
    padding: 10px 14px;
    font-size: 13px;
}

.mva-button--primary {
    background: #002c77;
    color: #ffffff;
    box-shadow: 0 8px 18px rgba(0, 44, 119, 0.18);
}

.mva-button--secondary {
    background: #e7eef9;
    color: #002c77;
}

.mva-button--ghost {
    background: #ffffff;
    color: #475569;
    border: 1px solid #dbe4f0;
}

.mva-icon-button {
    width: 30px;
    height: 30px;
    background: #fee2e2;
    color: #991b1b;
    font-size: 18px;
    line-height: 1;
}

.mva-icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.35;
    transform: none;
}

.mva-save-state {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 10px;
    border-radius: 999px;
    background: #ffffff;
    color: #64748b;
    font-size: 12px;
    border: 1px solid #dbe4f0;
}

.mva-save-state--saved {
    color: #166534;
    background: #ecfdf3;
    border-color: #bbf7d0;
}

.mva-save-state--error {
    color: #991b1b;
    background: #fff1f2;
    border-color: #fecdd3;
}

.mva-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
}

.mva-summary-card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px 10px;
    align-items: end;
    padding: 14px;
    border-radius: 16px;
    background: #ffffff;
    border: 1px solid #dbe4f0;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.mva-summary-card span {
    grid-column: 1 / -1;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.mva-summary-card strong {
    color: #0f172a;
    font-size: 24px;
    line-height: 1;
}

.mva-summary-card small {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
}

.mva-summary-card--ok strong {
    color: #166534;
}

.mva-summary-card--danger strong {
    color: #b91c1c;
}

.mva-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 16px;
    align-items: start;
}

.mva-main-column,
.mva-side-column {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.mva-card {
    padding: 16px;
    border-radius: 18px;
    background: #ffffff;
    border: 1px solid #dbe4f0;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.mva-card--sticky {
    position: sticky;
    top: 16px;
}

.mva-card--formula {
    color: #334155;
    font-size: 13px;
    line-height: 1.55;
}

.mva-card__title-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 14px;
}

.mva-card h2 {
    margin: 0;
    color: #002c77;
    font-size: 17px;
}

.mva-card p {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 13px;
}

.mva-form-grid {
    display: grid;
    gap: 12px;
}

.mva-form-grid--one {
    grid-template-columns: 1fr;
}

.mva-form-grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mva-form-grid--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.mva-form-grid--four {
    grid-template-columns: repeat(4, minmax(0, 1fr));
}

.mva-form-grid--criteria {
    grid-template-columns: minmax(160px, 0.7fr) minmax(240px, 1.5fr) 130px 130px;
}

.mva-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.mva-field span {
    color: #475569;
    font-size: 12px;
    font-weight: 700;
}

.mva-field input,
.mva-field textarea,
.mva-field select,
.mva-edit-table input {
    width: 100%;
    min-height: 36px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    padding: 8px 10px;
    background: #ffffff;
    color: #0f172a;
    font-family: inherit;
    font-size: 13px;
    outline: none;
}

.mva-field textarea {
    min-height: 92px;
    resize: vertical;
}

.mva-field input:focus,
.mva-field textarea:focus,
.mva-field select:focus,
.mva-edit-table input:focus {
    border-color: #0a5baa;
    box-shadow: 0 0 0 3px rgba(10, 91, 170, 0.12);
}

.mva-table-wrap {
    overflow-x: auto;
    border: 1px solid #dbe4f0;
    border-radius: 14px;
}

.mva-edit-table {
    width: 100%;
    min-width: 1120px;
    border-collapse: collapse;
    font-size: 12px;
}

.mva-edit-table th {
    padding: 10px 8px;
    background: #f1f5f9;
    color: #334155;
    font-weight: 800;
    text-align: left;
    border-bottom: 1px solid #dbe4f0;
}

.mva-edit-table td {
    padding: 8px;
    border-bottom: 1px solid #eef2f7;
    vertical-align: middle;
}

.mva-edit-table tbody tr:last-child td {
    border-bottom: 0;
}

.mva-table-result {
    color: #0f172a;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
}

.mva-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 92px;
    min-height: 26px;
    padding: 4px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
}

.mva-chip--ok {
    background: #dcfce7;
    color: #166534;
}

.mva-chip--danger {
    background: #fee2e2;
    color: #991b1b;
}

.mva-side-status {
    margin-top: 14px;
    padding: 14px;
    border-radius: 14px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
}

.mva-side-status span,
.mva-side-status small {
    display: block;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
}

.mva-side-status strong {
    display: block;
    margin: 4px 0;
    font-size: 24px;
}

.mva-status-text--ok {
    color: #166534;
}

.mva-status-text--danger {
    color: #b91c1c;
}

.mva-status-text--neutral {
    color: #334155;
}

@media (max-width: 1280px) {
    .mva-page__header,
    .mva-layout {
        grid-template-columns: 1fr;
    }

    .mva-page__header {
        display: grid;
    }

    .mva-page__actions {
        justify-content: flex-start;
        min-width: 0;
    }

    .mva-layout {
        display: flex;
        flex-direction: column;
    }

    .mva-side-column {
        width: 100%;
    }

    .mva-card--sticky {
        position: static;
    }
}

@media (max-width: 920px) {
    .mva-summary-grid,
    .mva-form-grid--two,
    .mva-form-grid--three,
    .mva-form-grid--four,
    .mva-form-grid--criteria {
        grid-template-columns: 1fr;
    }
}
`;

export {
    MVA_STORAGE_KEY,
    defaultMvaDraft,
    calculateMvaDraft,
    calculateMvaSpecimen,
    formatNumber,
    toNumber
};

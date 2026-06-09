// RapportDEPage.jsx
import RapportConclusionBlock from "../../components/rapports/RapportConclusionBlock";
import RapportFooter from "../../components/rapports/RapportFooter";
import RapportHeader from "../../components/rapports/RapportHeader";
import RapportToolbar from "../../components/rapports/RapportToolbar";
import RapportManagementHeader from "@/components/rapports/RapportManagementHeader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { feuillesTerrainApi } from "@/services/api";
import RapportPageShell from "@/components/rapports/RapportPageShell";
import {
    getWorkDocumentDE,
    listRapportModelDefinitionsDE,
    upsertRapportModelDefinitionDE,
} from "@/services/modelWorkLocalStore";
import { hasPositionCode, normalizePositionCodes } from "@/lib/positionCodes";
import { useReportAutoPrint } from "@/lib/reportAutoPrint";
import "@/styles/rapport-nge.css";
import "@/styles/rapport-de.css";

/** Structure vide : le rapport ne remplit que depuis la source (modèle / work / feuille). */
const EMPTY_RUNTIME_FALLBACK = {
    header: {
        reportNumber: "",
        chronoNumber: "",
        affaireNumber: "",
        editionDate: "",
        siteTitle: "",
        laboratory: "",
    },
    general: {
        operator: "",
        testDate: "",
        layer: "",
        implementationDate: "",
        gammadensimeter: "",
        lastCalibrationDate: "",
        implementationWorkshop: "",
        controlledProduct: "",
        formulaNumber: "",
        layerThickness: "",
        manufacturingLocation: "",
        controlledSection: "",
        weatherConditions: "",
        measurementDepth: "",
    },
    criteria: {
        source: "",
        minVoid: "",
        maxVoid: "",
    },
    results: {
        mvre: "",
        points: [],
        averageDensity: "",
        averageCompacity: "",
        averageVoids: "",
        conformityRate: "",
    },
    conclusion: {
        controlLabel: "",
        conformityLabel: "",
        name: "",
        functionName: "",
        comments: "",
    },
    footer: {
        documentCode: "",
    },
};

function valueOrEmpty(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return value;
}

function firstValue(...values) {
    for (const value of values) {
        if (value !== null && value !== undefined && String(value).trim() !== "") return value;
    }
    return "";
}

function parseDeNumericValue(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function isDeVoidNonConforme(voidsValue, minVoid, maxVoid) {
    const vides = parseDeNumericValue(voidsValue);
    const min = parseDeNumericValue(minVoid);
    const max = parseDeNumericValue(maxVoid);
    if (vides == null || min == null || max == null) return false;
    return vides < min || vides > max;
}

function normalizeDeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row, index) => {
        const source = row && typeof row === "object" ? row : {};
        return {
            ...source,
            essayNumber: firstValue(source.essayNumber, source.essai, source.point, String(index + 1)),
            profileNumber: firstValue(source.profileNumber, source.profil, source.profile, ""),
            position_codes: normalizePositionCodes(source.position_codes),
            density: firstValue(source.density, source.masse_volumique, source.mv, ""),
            compacity: firstValue(source.compacity, source.compacite_pct, ""),
            voids: firstValue(source.voids, source.vides_pct, ""),
            observations: firstValue(source.observations, source.observation, ""),
        };
    });
}

function dedupeRapportModels(models = []) {
    const byKey = new Map();
    for (const item of Array.isArray(models) ? models : []) {
        if (!item || typeof item !== "object") continue;
        const ref = String(item.reference || "").trim().toUpperCase();
        const key = ref || String(item.id || "").trim();
        if (!key) continue;
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, item);
            continue;
        }
        const prevApproved = String(prev.status || "").toLowerCase() === "approved";
        const currApproved = String(item.status || "").toLowerCase() === "approved";
        if (currApproved && !prevApproved) {
            byKey.set(key, item);
            continue;
        }
        if (currApproved === prevApproved) {
            const prevUpdated = String(prev.updated_at || "");
            const currUpdated = String(item.updated_at || "");
            if (currUpdated.localeCompare(prevUpdated) > 0) {
                byKey.set(key, item);
            }
        }
    }
    return Array.from(byKey.values());
}

function readLocalModelBaseDE() {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
        const raw = window.localStorage.getItem("ralab5_modele_base_DE");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
    } catch {
        return null;
    }
}

function unwrapSource(source) {
    if (!source || typeof source !== "object") return null;
    const values = source.values && typeof source.values === "object"
        ? source.values
        : source.payload && typeof source.payload === "object"
            ? source.payload
            : null;
    if (!values) return source;
    return {
        ...source,
        ...values,
        meta: {
            ...(source.meta && typeof source.meta === "object" ? source.meta : {}),
            ...(values.meta && typeof values.meta === "object" ? values.meta : {}),
        },
        sourceEnvelope: source,
    };
}

function isNumericId(value) {
    return /^\d+$/.test(String(value || "").trim());
}

function isDeReference(value) {
    return /^\d{4}-[A-Z]+-DE\d+$/i.test(String(value || "").trim());
}

function isWorkDeId(value) {
    return /^work-de-/i.test(String(value || "").trim());
}

function useReportSourceDE(essaiId, searchParams) {
    const [state, setState] = useState({ loading: false, error: "", source: null });
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
    const modeleBase = String(searchParams.get("modele_base") || "").trim().toUpperCase();
    const sourceKind = String(searchParams.get("source_kind") || "").trim().toLowerCase();
    const sourceId = String(searchParams.get("source_id") || "").trim();
    const sourceFamily = String(searchParams.get("source_family") || "").trim().toLowerCase();
    const sourceUid = String(searchParams.get("source_uid") || "").trim();
    const resolvedId = String(sourceId || essaiId || "").trim();

    useEffect(() => {
        const localModelBase = readLocalModelBaseDE();
        const isWorkMode = mode === "work";
        const isModelMode = !isWorkMode;

        if (isModelMode) {
            setState({ loading: false, error: "", source: localModelBase });
            return undefined;
        }

        let isCancelled = false;
        setState({ loading: true, error: "", source: isWorkMode ? null : localModelBase });

        const resolveRequest = async () => {
            if (sourceKind === "work_doc" || isWorkDeId(resolvedId)) {
                const workDoc = getWorkDocumentDE(resolvedId);
                if (!workDoc?.runtime_values) {
                    throw new Error("Document work DE introuvable");
                }
                return {
                    ...workDoc,
                    reference: workDoc.id,
                    values: workDoc.runtime_values,
                };
            }

            if ((sourceKind === "feuille_terrain" || sourceFamily === "terrain") && sourceUid) {
                return feuillesTerrainApi.get(sourceUid);
            }

            if (sourceKind === "feuille_terrain" && isNumericId(resolvedId)) {
                return feuillesTerrainApi.get(resolvedId);
            }

            if (!sourceKind && isNumericId(resolvedId)) {
                return feuillesTerrainApi.get(resolvedId);
            }

            if (!sourceKind && isDeReference(resolvedId)) {
                const matches = await feuillesTerrainApi.list({
                    q: resolvedId,
                    code_feuille: "DE",
                    limit: 10,
                });
                const normalizedRef = String(resolvedId).trim().toUpperCase();
                const exact = Array.isArray(matches)
                    ? matches.find((row) => String(row?.reference || "").trim().toUpperCase() === normalizedRef)
                    : null;
                if (!exact?.uid) {
                    throw new Error("Feuille terrain DE introuvable");
                }
                return feuillesTerrainApi.get(exact.uid);
            }

            throw new Error("Identifiant rapport DE non supporté");
        };

        resolveRequest()
            .then((payload) => {
                if (isCancelled) return;
                setState({ loading: false, error: "", source: payload });
            })
            .catch(() => {
                if (isCancelled) return;
                setState({
                    loading: false,
                    error: "Données réelles non disponibles pour ce rapport DE.",
                    source: null,
                });
            });

        return () => {
            isCancelled = true;
        };
    }, [essaiId, mode, modeleBase, sourceKind, sourceId, sourceFamily, sourceUid, resolvedId]);

    return state;
}

function buildDeReportFromSource(source, fallback) {
    const normalized = unwrapSource(source) || {};
    const meta = normalized?.meta || {};
    const rawRows = Array.isArray(normalized?.points_rows)
        ? normalized.points_rows
        : Array.isArray(normalized?.results?.points)
            ? normalized.results.points
            : Array.isArray(normalized?.results?.rows)
                ? normalized.results.rows
                : Array.isArray(normalized?.points)
                    ? normalized.points
                    : [];
    const pointsRows = normalizeDeRows(rawRows);
    return {
        ...fallback,
        header: {
            ...fallback.header,
            reportNumber: firstValue(normalized?.reference, meta?.reference_rapport, fallback.header.reportNumber),
            chronoNumber: firstValue(meta?.chrono, meta?.numero_chrono, normalized?.chrono, fallback.header.chronoNumber),
            affaireNumber: firstValue(meta?.affaire_nge_raw, meta?.affaire_nge, normalized?.affaire, fallback.header.affaireNumber),
            editionDate: firstValue(normalized?.date_redaction, meta?.date_redaction, fallback.header.editionDate),
            siteTitle: firstValue(normalized?.chantier, normalized?.label, meta?.chantier, fallback.header.siteTitle),
            laboratory: firstValue(meta?.laboratoire, fallback.header.laboratory),
        },
        general: {
            ...fallback.general,
            operator: firstValue(normalized?.operateur, meta?.operateur, fallback.general.operator),
            testDate: firstValue(meta?.date_essai, normalized?.date_debut, fallback.general.testDate),
            layer: firstValue(meta?.couche, normalized?.couche, fallback.general.layer),
            implementationDate: firstValue(meta?.date_mise_en_oeuvre, fallback.general.implementationDate),
            gammadensimeter: firstValue(meta?.gammadensimetre, fallback.general.gammadensimeter),
            lastCalibrationDate: firstValue(meta?.date_dernier_calibrage, fallback.general.lastCalibrationDate),
            implementationWorkshop: firstValue(meta?.atelier_mise_en_oeuvre, fallback.general.implementationWorkshop),
            controlledProduct: firstValue(meta?.produit_controle, fallback.general.controlledProduct),
            formulaNumber: firstValue(meta?.numero_formule, fallback.general.formulaNumber),
            layerThickness: firstValue(meta?.epaisseur_couche_cm, fallback.general.layerThickness),
            manufacturingLocation: firstValue(meta?.lieu_fabrication, fallback.general.manufacturingLocation),
            weatherConditions: firstValue(meta?.conditions_meteo, fallback.general.weatherConditions),
            measurementDepth: firstValue(meta?.profondeur_mesure, fallback.general.measurementDepth),
            controlledSection: firstValue(meta?.section_controlee, normalized?.section_controlee, fallback.general.controlledSection),
        },
        criteria: {
            ...fallback.criteria,
            source: firstValue(meta?.criteria_source, fallback.criteria?.source),
            minVoid: firstValue(meta?.criteria_void_min, fallback.criteria?.minVoid),
            maxVoid: firstValue(meta?.criteria_void_max, fallback.criteria?.maxVoid),
        },
        results: {
            ...fallback.results,
            points: pointsRows,
            rows: pointsRows,
            mvre: firstValue(meta?.mvre, normalized?.results?.mvre, normalized?.resume?.mvre, fallback.results.mvre),
            averageDensity: firstValue(normalized?.resume?.average_density, fallback.results.averageDensity),
            averageCompacity: firstValue(normalized?.resume?.average_compacity, fallback.results.averageCompacity),
            averageVoids: firstValue(normalized?.resume?.average_voids, fallback.results.averageVoids),
            conformityRate: firstValue(normalized?.resume?.conformity_rate, fallback.results.conformityRate),
        },
        conclusion: {
            ...fallback.conclusion,
            conformityLabel: firstValue(
                meta?.conformite === "conforme"
                    ? "Conforme"
                    : meta?.conformite === "non_conforme"
                        ? "Non conforme"
                        : meta?.conformite === "pour_info"
                            ? "Pour info"
                        : "",
                fallback.conclusion?.conformityLabel
            ),
            comments: firstValue(meta?.commentaires, meta?.conclusion_courte, fallback.conclusion?.comments),
            name: firstValue(meta?.nom, fallback.conclusion?.name),
            functionName: firstValue(meta?.fonction, fallback.conclusion?.functionName),
        },
        footer: {
            ...fallback.footer,
            documentCode: firstValue(
                normalized?.wbs_short,
                normalized?.wbs_full,
                meta?.wbs_short,
                meta?.wbs_full,
                fallback.footer?.documentCode
            ),
        },
    };
}

function buildRows(points, minRows = 18) {
    const filledRows = Array.isArray(points) ? points : [];
    const emptyCount = Math.max(0, minRows - filledRows.length);

    return [
        ...filledRows,
        ...Array.from({ length: emptyCount }, () => ({
            essayNumber: "",
            profileNumber: "",
            position_codes: [],
            density: "",
            compacity: "",
            voids: "",
            observations: "",
        })),
    ];
}

export default function RapportDEPage() {
    const { essaiId = "modele" } = useParams();
    const [searchParams] = useSearchParams();
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
    const isEmbed = String(searchParams.get("embed") || "").trim() === "1";
    const hideToolbar = String(searchParams.get("hide_toolbar") || "").trim() === "1";
    const isWorkMode = mode === "work";
    const { loading, error, source } = useReportSourceDE(essaiId, searchParams);
    useReportAutoPrint(searchParams, !loading && !error);
    const resolvedReport = useMemo(() => {
        const fallback = EMPTY_RUNTIME_FALLBACK;
        const seed = source && typeof source === "object" ? source : {};
        return buildDeReportFromSource(seed, fallback);
    }, [source]);

    const RESULT_ROWS_COUNT = 22

    const sourceRows = Array.isArray(resolvedReport.results?.rows)
    ? resolvedReport.results.rows
    : Array.isArray(resolvedReport.results?.points)
        ? resolvedReport.results.points
        : Array.isArray(resolvedReport.points)
            ? resolvedReport.points
            : []

    const rows = Array.from({ length: RESULT_ROWS_COUNT }, (_, index) => {
        if (sourceRows[index]) {
            return {
                ...sourceRows[index],
                isEmpty: false,
            }
        }

        return {
            essayNumber: "",
            profileNumber: "",
            position: "",
            density: "",
            compacity: "",
            voids: "",
            observations: "",
            isEmpty: true,
        }
    })

    const overflowRows = sourceRows.slice(RESULT_ROWS_COUNT)
    const defaultReportReference = `DE-RAPPORT-${new Date().toISOString().slice(0, 10)}`;

    const [rapportModels, setRapportModels] = useState(() => {
        const existing = dedupeRapportModels(listRapportModelDefinitionsDE());
        if (existing.length > 0) return existing;
        const seeded = upsertRapportModelDefinitionDE({
            id: "de-report-default",
            reference: defaultReportReference,
            status: "draft",
        });
        return [seeded];
    });

    const [selectedRapportModelId, setSelectedRapportModelId] = useState(
        () => String(dedupeRapportModels(listRapportModelDefinitionsDE())[0]?.id || "de-report-default")
    );

    const selectedRapportModel = useMemo(() => (
        rapportModels.find((item) => String(item.id) === String(selectedRapportModelId)) || rapportModels[0] || null
    ), [rapportModels, selectedRapportModelId]);

    const rapportStatus = selectedRapportModel?.status || "draft";

    function refreshRapportModels(preferredId = "") {
        const list = dedupeRapportModels(listRapportModelDefinitionsDE());
        if (!list.length) return;
        setRapportModels(list);
        const targetId = String(preferredId || selectedRapportModelId || list[0]?.id || "");
        const exists = list.some((item) => String(item.id) === targetId);
        setSelectedRapportModelId(exists ? targetId : String(list[0].id));
    }

    function updateSelectedRapportReference(value) {
        if (!selectedRapportModel) return;
        const persisted = upsertRapportModelDefinitionDE({
            ...selectedRapportModel,
            reference: value,
        });
        refreshRapportModels(persisted.id);
    }

    function applyRapportStatus(nextStatus) {
        if (!selectedRapportModel) return;
        const persisted = upsertRapportModelDefinitionDE({
            ...selectedRapportModel,
            status: nextStatus,
        });
        refreshRapportModels(persisted.id);
    }

    function createRapportModel() {
        const nextIndex = rapportModels.length + 1;
        const nextId = `de-report-${Date.now()}`;
        const nextReport = upsertRapportModelDefinitionDE({
            id: nextId,
            reference: `DE-RAPPORT-${new Date().toISOString().slice(0, 10)}-${nextIndex}`,
            status: "draft",
        });

        refreshRapportModels(nextReport.id);
    }

    const toolbarReference = resolvedReport.header?.chronoNumber || resolvedReport.header?.reportNumber || essaiId || "";
    const workflowActionsEnabled = false;
    const managementHeader = isWorkMode ? null : (
        <RapportManagementHeader
            reportCode="DE"
            description="Référence et statut du rapport DE, indépendants du modèle formulaire."
            reports={rapportModels}
            selectedReportId={selectedRapportModelId}
            selectedReport={selectedRapportModel}
            reference={selectedRapportModel?.reference || ""}
            status={rapportStatus}
            onSelectReport={setSelectedRapportModelId}
            onCreateReport={createRapportModel}
            onReferenceChange={updateSelectedRapportReference}
            onStatusChange={applyRapportStatus}
        />
    );
    
    return (
        <RapportPageShell
            embedded={isEmbed}
            hideToolbar={hideToolbar}
            managementHeader={managementHeader}
            toolbar={<RapportToolbar reportReference={toolbarReference} />}
        >
            <div className="rapport-de-paper-stack">
                {loading ? <div className="rapport-de-inline-alert">Chargement du rapport DE…</div> : null}
                {error ? <div className="rapport-de-inline-alert rapport-de-inline-alert-warning">{error}</div> : null}
                <main className="rapport-page rapport-page-a4 rapport-de-page" id="rapport-de-printable">
                    <div className="rapport-print-frame rapport-de-frame">
                    <RapportHeader
                    reportTypeLabel="DE n°"
                    reportNumber={resolvedReport.header?.reportNumber}
                    chronoNumber={resolvedReport.header?.chronoNumber}
                    affaireNumber={resolvedReport.header?.affaireNumber}
                    editionDate={resolvedReport.header?.editionDate}
                    siteTitle={resolvedReport.header?.siteTitle}
                    laboratory={resolvedReport.header?.laboratory}
                    subtitle="MESURE DE LA MASSE VOLUMIQUE DES MATERIAUX EN PLACE PAR GAMMADENSIMETRE APPLIQUÉE AUX PRODUITS HYDROCARBONÉS"
                    standardLabel="(NF P 98-241-1)"
                />

                <section className="rapport-section rapport-section-general">
                    <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
                    <div className="rapport-general-grid">
                        <div className="rapport-field-list">
                            <div><span>Opérateur :</span><strong>{valueOrEmpty(resolvedReport.general?.operator)}</strong></div>
                            <div><span>Date de l'essai :</span><strong>{valueOrEmpty(resolvedReport.general?.testDate)}</strong></div>
                            <div><span>Couche :</span><strong>{valueOrEmpty(resolvedReport.general?.layer)}</strong></div>
                            <div><span>Date de mise en œuvre :</span><strong>{valueOrEmpty(resolvedReport.general?.implementationDate)}</strong></div>
                            <div><span>Gammadensimètre :</span><strong>{valueOrEmpty(resolvedReport.general?.gammadensimeter)}</strong></div>
                            <div><span>Date du dernier calibrage :</span><strong>{valueOrEmpty(resolvedReport.general?.lastCalibrationDate)}</strong></div>
                        </div>

                        <div className="rapport-field-list">
                            <div><span>Produit contrôlé :</span><strong>{valueOrEmpty(resolvedReport.general?.controlledProduct)}</strong></div>
                            <div><span>N° formule :</span><strong>{valueOrEmpty(resolvedReport.general?.formulaNumber)}</strong></div>
                            <div><span>Epaisseur de la couche :</span><strong>{valueOrEmpty(resolvedReport.general?.layerThickness)}</strong></div>
                            <div><span>Lieu de fabrication :</span><strong>{valueOrEmpty(resolvedReport.general?.manufacturingLocation)}</strong></div>
                            <div><span>Section contrôlée :</span><strong>{valueOrEmpty(resolvedReport.general?.controlledSection)}</strong></div>
                            <div><span>Conditions météorologiques :</span><strong>{valueOrEmpty(resolvedReport.general?.weatherConditions)}</strong></div>
                            <div><span>Profondeur de mesure :</span><strong>{valueOrEmpty(resolvedReport.general?.measurementDepth)}</strong></div>
                        </div>

                        <div className="rapport-field-full">
                            <span>Atelier de mise en œuvre :</span>
                            <strong>{valueOrEmpty(resolvedReport.general?.implementationWorkshop)}</strong>
                        </div>
                    </div>
                </section>

                <section className="rapport-section rapport-section-criteria">
                    <h2>2/ <span>CRITERES DE CONFORMITE</span></h2>
                    <div className="rapport-criteria-grid">
                        <div>
                            <span>Source des critères :</span>
                            <strong>{valueOrEmpty(resolvedReport.criteria?.source)}</strong>
                        </div>
                        <div>
                            <span>Définition des critères / objectifs :</span>
                            <strong>
                                {valueOrEmpty(resolvedReport.criteria?.minVoid)} <span className="rapport-inline-symbol">≤ % de vide ≤</span> {valueOrEmpty(resolvedReport.criteria?.maxVoid)}
                            </strong>
                        </div>
                    </div>
                </section>

                <section className="rapport-section rapport-section-results">
                    <div className="rapport-section-title-row">
                        <h2>3/ <span>RESULTATS DES ESSAIS</span></h2>
                        <div>
                            <span>Masse volumique réelle de l'enrobé (MVRE) :</span>
                            <strong>{valueOrEmpty(resolvedReport.results?.mvre)}</strong>
                            <span>g/cm³</span>
                        </div>
                    </div>

                    <table className="rapport-results-table">
                        <colgroup>
                            <col className="rapport-col-essai" />
                            <col className="rapport-col-profils" />
                            <col className="rapport-col-position" />
                            <col className="rapport-col-position" />
                            <col className="rapport-col-position" />
                            <col className="rapport-col-masse" />
                            <col className="rapport-col-compacite" />
                            <col className="rapport-col-vides" />
                            <col className="rapport-col-observations" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th rowSpan="2">N°<br />Essai</th>
                                <th rowSpan="2">N°<br />Profils</th>
                                <th colSpan="3">Position</th>
                                <th rowSpan="2">Masse<br />volumique<br />(g/cm³)</th>
                                <th rowSpan="2">Compacités<br />%</th>
                                <th rowSpan="2">Vides<br />%</th>
                                <th rowSpan="2">Observations</th>
                            </tr>
                            <tr>
                                <th>G</th>
                                <th>A</th>
                                <th>D</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => {
                                const videsNonConforme = !row.isEmpty && isDeVoidNonConforme(
                                    row.voids,
                                    resolvedReport.criteria?.minVoid,
                                    resolvedReport.criteria?.maxVoid
                                );
                                return (
                                    <tr
                                        key={`de-result-row-${index}`}
                                        className={row.isEmpty ? "rapport-empty-row" : ""}
                                    >
                                        <td>{row.isEmpty ? "" : valueOrEmpty(row.essayNumber)}</td>
                                        <td>{row.isEmpty ? "" : valueOrEmpty(row.profileNumber)}</td>
                                        <td>{row.isEmpty ? "" : hasPositionCode(row.position_codes, "G") ? "X" : ""}</td>
                                        <td>{row.isEmpty ? "" : hasPositionCode(row.position_codes, "A") ? "X" : ""}</td>
                                        <td>{row.isEmpty ? "" : hasPositionCode(row.position_codes, "D") ? "X" : ""}</td>
                                        <td>{row.isEmpty ? "" : valueOrEmpty(row.density)}</td>
                                        <td>{row.isEmpty ? "" : valueOrEmpty(row.compacity)}</td>
                                        <td className={videsNonConforme ? "rapport-cell-nonconforme" : ""}>{row.isEmpty ? "" : valueOrEmpty(row.voids)}</td>
                                        <td>{row.isEmpty ? "" : valueOrEmpty(row.observations)}</td>
                                    </tr>
                                );
                            })}
                            <tr className="rapport-average-row">
                                <td colSpan="5">Moyenne</td>
                                <td>{valueOrEmpty(resolvedReport.results?.averageDensity)}</td>
                                <td>{valueOrEmpty(resolvedReport.results?.averageCompacity)}</td>
                                <td>{valueOrEmpty(resolvedReport.results?.averageVoids)}</td>
                                <td></td>
                            </tr>
                            <tr className="rapport-conformity-row">
                                <td className="rapport-conformity-cell" colSpan="9">
                                    <div className="rapport-conformity-content">
                                        <span>Pourcentage de valeurs conformes :</span>
                                        <strong>{valueOrEmpty(resolvedReport.results?.conformityRate)}</strong>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {overflowRows.length > 0 ? (
                        <div className="rapport-overflow-note">
                            {overflowRows.length} point(s) complémentaire(s) en annexe.
                        </div>
                    ) : null}
                </section>

                <RapportConclusionBlock
                    controlLabel={resolvedReport.conclusion?.controlLabel}
                    conformityLabel={resolvedReport.conclusion?.conformityLabel}
                    name={resolvedReport.conclusion?.name}
                    functionName={resolvedReport.conclusion?.functionName}
                    comments={resolvedReport.conclusion?.comments}
                />

                    </div>

                    <RapportFooter documentCode={resolvedReport.footer?.documentCode} />
                </main>
            </div>
            </RapportPageShell>
        )
}

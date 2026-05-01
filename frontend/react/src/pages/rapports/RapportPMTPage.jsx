// FILE: RapportPMTPage.jsx
// Chemin non confirme: remplacer le fichier a son emplacement reel dans frontend/react/src/pages/rapports/RapportPMTPage.jsx.
import RapportConclusionBlock from "../../components/rapports/RapportConclusionBlock";
import RapportFooter from "../../components/rapports/RapportFooter";
import RapportHeader from "../../components/rapports/RapportHeader";
import RapportToolbar from "../../components/rapports/RapportToolbar";
import RapportManagementHeader from "@/components/rapports/RapportManagementHeader";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Button from "@/components/ui/Button";
import { feuillesTerrainApi } from "@/services/api";
import RapportPageShell from "@/components/rapports/RapportPageShell";
import "@/styles/rapport-nge.css";
import "@/styles/rapport-de.css";

const PMT_REPORT_MODELS_KEY = "ralab5_rapport_models_PMT";

const DEFAULT_REPORT = {
    header: {
        reportNumber: "9",
        chronoNumber: "",
        affaireNumber: "RA L1EC",
        editionDate: "10/10/2025",
        siteTitle: "VL3 -\nAlbigny sur Saône",
        laboratory: "Laboratoire Rhône Auvergne - 29-31 rue des tâches - ZI mi-plaine - 69800 SAINT PRIEST",
    },
    general: {
        operator: "F. Montet",
        testDate: "Nuit 09-10/10/2025",
        layer: "Roulement",
        implementationDate: "Nuit 09-10/10/2025",
        implementationWorkshop: "Finisseur Volvo titan P7820C, Bomag bw161ad, bomag bw120ad",
        controlledProduct: "BBSG 0/10 Classe 3",
        formulaNumber: "110",
        layerThickness: "5 cm",
        manufacturingLocation: "P2R",
        controlledSection: "Avenue de la gare",
        weatherConditions: "Nuit",
    },
    criteria: {
        source: "DG-Q / RE PMT du 28/06/06",
        definition: "PMT ≥ 0.4",
        minPmt: "0.4",
    },
    results: {
        materialVolume: "25 000",
        materialVolumeUnit: "mm³",
        points: [
            { essayNumber: "1", profileNumber: "", position: "", diameter: "220", textureDepth: "0,66", observations: "" },
            { essayNumber: "2", profileNumber: "", position: "", diameter: "205", textureDepth: "0,76", observations: "" },
            { essayNumber: "3", profileNumber: "", position: "", diameter: "200", textureDepth: "0,80", observations: "" },
            { essayNumber: "4", profileNumber: "", position: "", diameter: "220", textureDepth: "0,66", observations: "" },
            { essayNumber: "5", profileNumber: "", position: "", diameter: "230", textureDepth: "0,60", observations: "" },
            { essayNumber: "6", profileNumber: "", position: "", diameter: "225", textureDepth: "0,63", observations: "" },
            { essayNumber: "7", profileNumber: "", position: "", diameter: "210", textureDepth: "0,72", observations: "" },
            { essayNumber: "8", profileNumber: "", position: "", diameter: "220", textureDepth: "0,66", observations: "" },
        ],
        testCount: "8",
        averageTextureDepth: "0,69",
        conformityRate: "100,00",
    },
    conclusion: {
        controlLabel: "Contrôle",
        conformityLabel: "Conforme",
        name: "F. MONTET",
        functionName: "Technicien de laboratoire",
        comments: "",
    },
    footer: {
        documentCode: "DG-Q / RE PMT du 28/06/06",
    },
};

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
        implementationWorkshop: "",
        controlledProduct: "",
        formulaNumber: "",
        layerThickness: "",
        manufacturingLocation: "",
        controlledSection: "",
        weatherConditions: "",
    },
    criteria: {
        source: "",
        definition: "",
        minPmt: "",
    },
    results: {
        materialVolume: "",
        materialVolumeUnit: "mm³",
        points: [],
        testCount: "",
        averageTextureDepth: "",
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

function parsePmtNumericValue(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().replace("%", "").replace(",", ".");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatFrenchNumber(value, maximumFractionDigits = 2) {
    const numeric = parsePmtNumericValue(value);
    if (numeric == null) return valueOrEmpty(value);
    return numeric.toLocaleString("fr-FR", {
        minimumFractionDigits: maximumFractionDigits,
        maximumFractionDigits,
    });
}

function computePmtFromDiameter(diameterMm, volumeMm3) {
    const diameter = parsePmtNumericValue(diameterMm);
    const volume = parsePmtNumericValue(volumeMm3);
    if (diameter == null || diameter <= 0 || volume == null || volume <= 0) return "";
    return Number(((4 * volume) / (Math.PI * diameter * diameter)).toFixed(2));
}

function normalizePmtRows(rows, meta = {}) {
    if (!Array.isArray(rows)) return [];
    const volumeMm3 = firstValue(meta?.volume_materiau_mm3, meta?.volume_material_mm3, "");
    return rows.map((row, index) => {
        const source = row && typeof row === "object" ? row : {};
        const diameter = firstValue(
            source.diameter,
            source.diametre_moyen_tache_mm,
            source.diametre_moyen_mm,
            source.diameter_mm,
            ""
        );
        const computedTexture = computePmtFromDiameter(diameter, firstValue(source.volume_materiau_mm3, volumeMm3));
        return {
            ...source,
            essayNumber: firstValue(source.essayNumber, source.essai, source.point, String(index + 1)),
            profileNumber: firstValue(source.profileNumber, source.profil, source.profile, ""),
            position: firstValue(source.position, ""),
            diameter,
            textureDepth: firstValue(
                source.textureDepth,
                source.profondeur_macrotexture_mm,
                source.pmt_mm,
                source.texture_depth_mm,
                computedTexture,
                ""
            ),
            observations: firstValue(source.observations, source.observation, ""),
        };
    });
}

function summarizePmtRows(rows, minPmt) {
    const values = (Array.isArray(rows) ? rows : [])
        .map((row) => parsePmtNumericValue(row?.textureDepth))
        .filter((value) => value != null);
    const min = parsePmtNumericValue(minPmt);
    const conformCount = min == null ? values.length : values.filter((value) => value >= min).length;
    const average = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;

    return {
        count: values.length,
        averageTextureDepth: average == null ? "" : formatFrenchNumber(average, 2),
        conformityRate: values.length ? formatFrenchNumber((conformCount / values.length) * 100, 2) : "",
    };
}

function isPmtNonConforme(textureDepth, minPmt) {
    const value = parsePmtNumericValue(textureDepth);
    const min = parsePmtNumericValue(minPmt);
    if (value == null || min == null) return false;
    return value < min;
}

function listRapportModelDefinitionsPMT() {
    if (typeof window === "undefined" || !window.localStorage) return [];
    try {
        const raw = window.localStorage.getItem(PMT_REPORT_MODELS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function upsertRapportModelDefinitionPMT(model) {
    const now = new Date().toISOString();
    const next = {
        id: String(model?.id || `pmt-report-${Date.now()}`),
        reference: String(model?.reference || "PMT-RAPPORT"),
        status: model?.status === "approved" ? "approved" : "draft",
        template: model?.template && typeof model.template === "object" ? model.template : {},
        updated_at: now,
    };
    const rows = listRapportModelDefinitionsPMT();
    const index = rows.findIndex((item) => String(item.id) === String(next.id));
    const nextRows = index >= 0
        ? rows.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item)
        : [...rows, next];

    if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(PMT_REPORT_MODELS_KEY, JSON.stringify(nextRows));
    }

    return next;
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

function readLocalModelBasePMT() {
    if (typeof window === "undefined" || !window.localStorage) return null;
    try {
        const raw = window.localStorage.getItem("ralab5_modele_base_PMT");
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

function isPmtReference(value) {
    return /^\d{4}-[A-Z]+-PMT\d+$/i.test(String(value || "").trim());
}

function useReportSourcePMT(essaiId, searchParams) {
    const [state, setState] = useState({ loading: false, error: "", source: null });
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
    const sourceKind = String(searchParams.get("source_kind") || "").trim().toLowerCase();
    const sourceId = String(searchParams.get("source_id") || "").trim();
    const sourceFamily = String(searchParams.get("source_family") || "").trim().toLowerCase();
    const sourceUid = String(searchParams.get("source_uid") || "").trim();
    const resolvedId = String(sourceId || essaiId || "").trim();

    useEffect(() => {
        const localModelBase = readLocalModelBasePMT();
        const isWorkMode = mode === "work";
        const isModelMode = !isWorkMode;

        if (isModelMode) {
            setState({ loading: false, error: "", source: localModelBase });
            return undefined;
        }

        let isCancelled = false;
        setState({ loading: true, error: "", source: null });

        const resolveRequest = async () => {
            if (sourceFamily === "terrain" && sourceUid) {
                return feuillesTerrainApi.get(sourceUid);
            }

            if ((sourceKind === "terrain" || sourceKind === "feuille_terrain") && resolvedId) {
                return feuillesTerrainApi.get(resolvedId);
            }

            if (!sourceKind && isNumericId(resolvedId)) {
                return feuillesTerrainApi.get(resolvedId);
            }

            if (!sourceKind && isPmtReference(resolvedId)) {
                const matches = await feuillesTerrainApi.list({
                    q: resolvedId,
                    code_feuille: "PMT",
                    limit: 10,
                });
                const normalizedRef = String(resolvedId).trim().toUpperCase();
                const exact = Array.isArray(matches)
                    ? matches.find((row) => String(row?.reference || "").trim().toUpperCase() === normalizedRef)
                    : null;
                if (!exact?.uid) {
                    throw new Error("Feuille terrain PMT introuvable");
                }
                return feuillesTerrainApi.get(exact.uid);
            }

            throw new Error("Identifiant rapport PMT non supporté");
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
                    error: "Données réelles non disponibles pour ce rapport PMT.",
                    source: null,
                });
            });

        return () => {
            isCancelled = true;
        };
    }, [essaiId, mode, sourceKind, sourceId, sourceFamily, sourceUid, resolvedId]);

    return state;
}

function buildPmtReportFromSource(source, fallback) {
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
    const pointsRows = normalizePmtRows(rawRows, meta);
    const computedSummary = summarizePmtRows(pointsRows, meta?.criteria_pmt_min ?? fallback.criteria?.minPmt);
    const summary = normalized?.resume && typeof normalized.resume === "object" ? normalized.resume : {};
    const conformityLabel = firstValue(
        meta?.conformite === "conforme"
            ? "Conforme"
            : meta?.conformite === "non_conforme"
                ? "Non conforme"
                : meta?.conformite === "pour_info"
                    ? "Pour info"
                    : "",
        fallback.conclusion?.conformityLabel
    );

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
            implementationWorkshop: firstValue(meta?.atelier_mise_en_oeuvre, fallback.general.implementationWorkshop),
            controlledProduct: firstValue(meta?.produit_controle, fallback.general.controlledProduct),
            formulaNumber: firstValue(meta?.numero_formule, fallback.general.formulaNumber),
            layerThickness: firstValue(meta?.epaisseur_couche_cm, fallback.general.layerThickness),
            manufacturingLocation: firstValue(meta?.lieu_fabrication, fallback.general.manufacturingLocation),
            weatherConditions: firstValue(meta?.conditions_meteo, fallback.general.weatherConditions),
            controlledSection: firstValue(meta?.section_controlee, normalized?.section_controlee, fallback.general.controlledSection),
        },
        criteria: {
            ...fallback.criteria,
            source: firstValue(meta?.criteria_source, fallback.criteria?.source),
            definition: firstValue(meta?.criteria_definition, meta?.criteria_pmt_min ? `PMT ≥ ${meta.criteria_pmt_min}` : "", fallback.criteria?.definition),
            minPmt: firstValue(meta?.criteria_pmt_min, fallback.criteria?.minPmt),
        },
        results: {
            ...fallback.results,
            points: pointsRows,
            rows: pointsRows,
            materialVolume: firstValue(meta?.volume_materiau_mm3, normalized?.results?.materialVolume, fallback.results.materialVolume),
            materialVolumeUnit: firstValue(meta?.volume_materiau_unit, normalized?.results?.materialVolumeUnit, fallback.results.materialVolumeUnit),
            testCount: firstValue(summary?.nombre_points_valides, summary?.nombre_points, computedSummary.count, fallback.results.testCount),
            averageTextureDepth: formatFrenchNumber(firstValue(summary?.profondeur_macrotexture_generale_mm, computedSummary.averageTextureDepth, fallback.results.averageTextureDepth), 2),
            conformityRate: formatFrenchNumber(firstValue(summary?.pourcentage_valeurs_conformes, computedSummary.conformityRate, fallback.results.conformityRate), 2),
        },
        conclusion: {
            ...fallback.conclusion,
            conformityLabel,
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

export default function RapportPMTPage({ report = DEFAULT_REPORT }) {
    const { essaiId = "modele" } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
    const isWorkMode = mode === "work";
    const returnTo = String(searchParams.get("return_to") || "").trim();
    const feuilleUidFromQuery = String(searchParams.get("feuille_uid") || "").trim();
    const { loading, error, source } = useReportSourcePMT(essaiId, searchParams);
    const [navLinks, setNavLinks] = useState({
        demandeId: "",
        interventionId: "",
        campagneId: "",
    });
    const resolvedReport = useMemo(() => {
        const fallback = isWorkMode ? EMPTY_RUNTIME_FALLBACK : (report || DEFAULT_REPORT);
        const seed = isWorkMode ? (source || {}) : (source || report);
        return buildPmtReportFromSource(seed, fallback);
    }, [source, report, isWorkMode]);

    const RESULT_ROWS_COUNT = 22;
    const sourceRows = Array.isArray(resolvedReport.results?.rows)
        ? resolvedReport.results.rows
        : Array.isArray(resolvedReport.results?.points)
            ? resolvedReport.results.points
            : [];

    const rows = Array.from({ length: RESULT_ROWS_COUNT }, (_, index) => {
        if (sourceRows[index]) {
            return {
                ...sourceRows[index],
                isEmpty: false,
            };
        }

        return {
            essayNumber: "",
            profileNumber: "",
            position: "",
            diameter: "",
            textureDepth: "",
            observations: "",
            isEmpty: true,
        };
    });

    const overflowRows = sourceRows.slice(RESULT_ROWS_COUNT);
    const defaultReportReference = `PMT-RAPPORT-${new Date().toISOString().slice(0, 10)}`;

    const [rapportModels, setRapportModels] = useState(() => {
        const existing = dedupeRapportModels(listRapportModelDefinitionsPMT());
        if (existing.length > 0) return existing;
        const seeded = upsertRapportModelDefinitionPMT({
            id: "pmt-report-default",
            reference: defaultReportReference,
            status: "draft",
        });
        return [seeded];
    });

    const [selectedRapportModelId, setSelectedRapportModelId] = useState(
        () => String(dedupeRapportModels(listRapportModelDefinitionsPMT())[0]?.id || "pmt-report-default")
    );

    const selectedRapportModel = useMemo(() => (
        rapportModels.find((item) => String(item.id) === String(selectedRapportModelId)) || rapportModels[0] || null
    ), [rapportModels, selectedRapportModelId]);

    const rapportStatus = selectedRapportModel?.status || "draft";

    function refreshRapportModels(preferredId = "") {
        const list = dedupeRapportModels(listRapportModelDefinitionsPMT());
        if (!list.length) return;
        setRapportModels(list);
        const targetId = String(preferredId || selectedRapportModelId || list[0]?.id || "");
        const exists = list.some((item) => String(item.id) === targetId);
        setSelectedRapportModelId(exists ? targetId : String(list[0].id));
    }

    function updateSelectedRapportReference(value) {
        if (!selectedRapportModel) return;
        const persisted = upsertRapportModelDefinitionPMT({
            ...selectedRapportModel,
            reference: value,
        });
        refreshRapportModels(persisted.id);
    }

    function applyRapportStatus(nextStatus) {
        if (!selectedRapportModel) return;
        const persisted = upsertRapportModelDefinitionPMT({
            ...selectedRapportModel,
            status: nextStatus,
        });
        refreshRapportModels(persisted.id);
    }

    function createRapportModel() {
        const nextIndex = rapportModels.length + 1;
        const nextId = `pmt-report-${Date.now()}`;
        const nextReport = upsertRapportModelDefinitionPMT({
            id: nextId,
            reference: `PMT-RAPPORT-${new Date().toISOString().slice(0, 10)}-${nextIndex}`,
            status: "draft",
        });

        refreshRapportModels(nextReport.id);
    }

    useEffect(() => {
        let cancelled = false;
        const normalized = source && typeof source === "object" ? source : {};
        const meta = normalized?.meta && typeof normalized.meta === "object" ? normalized.meta : {};
        const payload = normalized?.payload && typeof normalized.payload === "object" ? normalized.payload : {};

        const directDemande = String(
            searchParams.get("demande_id") || normalized?.demande_id || meta?.demande_id || payload?.demande_id || ""
        ).trim();
        const directIntervention = String(
            searchParams.get("intervention_id") || normalized?.intervention_id || meta?.intervention_id || payload?.intervention_id || ""
        ).trim();
        const directCampagne = String(
            searchParams.get("campagne_id") || searchParams.get("campaign_id") || normalized?.campagne_id || normalized?.campaign_id || meta?.campagne_id || meta?.campaign_id || payload?.campagne_id || payload?.campaign_id || ""
        ).trim();

        if (directDemande || directIntervention || directCampagne) {
            setNavLinks({
                demandeId: directDemande,
                interventionId: directIntervention,
                campagneId: directCampagne,
            });
            return undefined;
        }

        const terrainUid = String(
            normalized?.source_terrain_uid || searchParams.get("source_uid") || ""
        ).trim();
        const sourceFamily = String(searchParams.get("source_family") || "").trim().toLowerCase();
        if (!terrainUid || (sourceFamily && sourceFamily !== "terrain")) {
            setNavLinks({ demandeId: "", interventionId: "", campagneId: "" });
            return undefined;
        }

        feuillesTerrainApi.get(terrainUid)
            .then((row) => {
                if (cancelled) return;
                const p = row?.payload && typeof row.payload === "object" ? row.payload : {};
                setNavLinks({
                    demandeId: String(row?.demande_id || p?.demande_id || "").trim(),
                    interventionId: String(row?.intervention_id || p?.intervention_id || "").trim(),
                    campagneId: String(row?.campagne_id || row?.campaign_id || p?.campagne_id || p?.campaign_id || "").trim(),
                });
            })
            .catch(() => {
                if (cancelled) return;
                setNavLinks({ demandeId: "", interventionId: "", campagneId: "" });
            });

        return () => {
            cancelled = true;
        };
    }, [source, searchParams]);

    const printReport = () => {
        window.print();
    };

    const pendingAction = () => {
        // Future action hook: PDF export, review workflow, validation workflow or mail preparation.
    };
    const workflowActionsEnabled = false;

    const navButton = (label, path, id) => {
        const hasId = Boolean(String(id || "").trim());
        return (
            <Button
                key={label}
                variant="secondary"
                size="sm"
                disabled={!hasId}
                onClick={() => hasId ? navigate(`${path}/${encodeURIComponent(String(id).trim())}`) : null}
                className={!hasId ? "border-amber-300 bg-amber-50 text-amber-800" : ""}
                title={hasId ? `${label} ${id}` : `${label} indisponible (debug: ID manquant)`}
            >
                {label}
            </Button>
        );
    };

    const campaignButton = () => {
        const hasId = Boolean(String(navLinks.campagneId || "").trim());
        const target = hasId ? `/campagnes/${encodeURIComponent(String(navLinks.campagneId).trim())}${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}` : "";
        return (
            <Button
                variant="secondary"
                size="sm"
                disabled={!hasId}
                onClick={() => hasId ? navigate(target) : null}
                className={!hasId ? "border-amber-300 bg-amber-50 text-amber-800" : ""}
                title={hasId ? `Campagne ${navLinks.campagneId}` : "Campagne indisponible (debug: ID manquant)"}
            >
                Campagne
            </Button>
        );
    };

    const feuilleButton = () => {
        const feuilleUid = feuilleUidFromQuery || String(searchParams.get("source_uid") || "").trim();
        const hasId = Boolean(feuilleUid);
        const target = hasId ? `/feuilles-terrain/pmt/${encodeURIComponent(feuilleUid)}/runtime${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}` : "";
        return (
            <Button
                variant="secondary"
                size="sm"
                disabled={!hasId}
                onClick={() => hasId ? navigate(target) : null}
                className={!hasId ? "border-amber-300 bg-amber-50 text-amber-800" : ""}
                title={hasId ? `Feuille PMT ${feuilleUid}` : "Feuille indisponible (debug: feuille_uid manquant)"}
            >
                Feuille
            </Button>
        );
    };

    const workNavigationBar = (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2">
            <Button variant="secondary" size="sm" onClick={() => navigate(returnTo || "/tools")}>
                ← Retour
            </Button>
            {feuilleButton()}
            {navButton("Demande", "/demandes", navLinks.demandeId)}
            {navButton("Intervention", "/interventions", navLinks.interventionId)}
            {campaignButton()}
        </div>
    );

    const managementHeader = isWorkMode ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            {workNavigationBar}
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">Work PMT</div>
            <h1 className="mt-1 text-2xl font-semibold text-text">Rapport runtime — PMT</h1>
            <p className="mt-2 text-sm text-text-muted">
                Document de travail: {String(essaiId || "")}
            </p>
        </div>
    ) : (
        <RapportManagementHeader
            reportCode="PMT"
            description="Référence et statut du rapport PMT, indépendants du modèle formulaire."
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
            managementHeader={managementHeader}
            toolbar={(
                <RapportToolbar
                    onPrint={printReport}
                    onExportPdf={pendingAction}
                    onReview={pendingAction}
                    onValidate={pendingAction}
                    onPrepareMail={pendingAction}
                    disableReview={!workflowActionsEnabled}
                    disableValidate={!workflowActionsEnabled}
                    disablePrepareMail={!workflowActionsEnabled}
                    labels={{
                        review: workflowActionsEnabled ? "Envoyer en relecture" : "Envoyer en relecture (bientôt)",
                        validate: workflowActionsEnabled ? "Valider" : "Valider (bientôt)",
                        prepareMail: workflowActionsEnabled ? "Préparer mail" : "Préparer mail (bientôt)",
                    }}
                />
            )}
        >
            <div className="rapport-de-paper-stack">
                {loading ? <div className="rapport-de-inline-alert">Chargement du rapport PMT…</div> : null}
                {error ? <div className="rapport-de-inline-alert rapport-de-inline-alert-warning">{error}</div> : null}
                <main className="rapport-page rapport-page-a4 rapport-de-page rapport-pmt-page" id="rapport-pmt-printable">
                    <div className="rapport-print-frame rapport-de-frame">
                        <RapportHeader
                            reportTypeLabel="PMT n°"
                            reportNumber={resolvedReport.header?.reportNumber}
                            chronoNumber={resolvedReport.header?.chronoNumber}
                            affaireNumber={resolvedReport.header?.affaireNumber}
                            editionDate={resolvedReport.header?.editionDate}
                            siteTitle={resolvedReport.header?.siteTitle}
                            laboratory={resolvedReport.header?.laboratory}
                            subtitle="MESURE DE LA PROFONDEUR DE MACROTEXTURE DE LA SURFACE D'UN REVETEMENT"
                            standardLabel="(NF EN 13036-1)"
                        />

                        <section className="rapport-section rapport-section-general">
                            <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
                            <div className="rapport-general-grid">
                                <div className="rapport-field-list">
                                    <div><span>Opérateur :</span><strong>{valueOrEmpty(resolvedReport.general?.operator)}</strong></div>
                                    <div><span>Date de l'essai :</span><strong>{valueOrEmpty(resolvedReport.general?.testDate)}</strong></div>
                                    <div><span>Couche :</span><strong>{valueOrEmpty(resolvedReport.general?.layer)}</strong></div>
                                    <div><span>Date de mise en œuvre :</span><strong>{valueOrEmpty(resolvedReport.general?.implementationDate)}</strong></div>
                                </div>

                                <div className="rapport-field-list">
                                    <div><span>Produit contrôlé :</span><strong>{valueOrEmpty(resolvedReport.general?.controlledProduct)}</strong></div>
                                    <div><span>N° formule :</span><strong>{valueOrEmpty(resolvedReport.general?.formulaNumber)}</strong></div>
                                    <div><span>Epaisseur de la couche :</span><strong>{valueOrEmpty(resolvedReport.general?.layerThickness)}</strong></div>
                                    <div><span>Lieu de fabrication :</span><strong>{valueOrEmpty(resolvedReport.general?.manufacturingLocation)}</strong></div>
                                    <div><span>Section contrôlée :</span><strong>{valueOrEmpty(resolvedReport.general?.controlledSection)}</strong></div>
                                    <div><span>Conditions météorologiques :</span><strong>{valueOrEmpty(resolvedReport.general?.weatherConditions)}</strong></div>
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
                                    <strong>{valueOrEmpty(resolvedReport.criteria?.definition)}</strong>
                                </div>
                            </div>
                        </section>

                        <section className="rapport-section rapport-section-results">
                            <div className="rapport-section-title-row">
                                <h2>3/ <span>RESULTATS DES ESSAIS</span></h2>
                                <div>
                                    <span>Volume de matériau utilisé :</span>
                                    <strong>{valueOrEmpty(resolvedReport.results?.materialVolume)}</strong>
                                    <span>{valueOrEmpty(resolvedReport.results?.materialVolumeUnit)}</span>
                                </div>
                            </div>

                            <table className="rapport-results-table">
                                <colgroup>
                                    <col className="rapport-col-essai" />
                                    <col className="rapport-col-profils" />
                                    <col className="rapport-col-position" />
                                    <col className="rapport-col-masse" />
                                    <col className="rapport-col-compacite" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>N°<br />Essai</th>
                                        <th>Profil</th>
                                        <th>Position</th>
                                        <th>Diamètre moyen de la tache<br />(mm)</th>
                                        <th>Profondeurs de macrotexture<br />(mm)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, index) => {
                                        const pmtNonConforme = !row.isEmpty && isPmtNonConforme(
                                            row.textureDepth,
                                            resolvedReport.criteria?.minPmt
                                        );
                                        return (
                                            <tr
                                                key={`pmt-result-row-${index}`}
                                                className={row.isEmpty ? "rapport-empty-row" : ""}
                                            >
                                                <td>{row.isEmpty ? "" : valueOrEmpty(row.essayNumber)}</td>
                                                <td>{row.isEmpty ? "" : valueOrEmpty(row.profileNumber)}</td>
                                                <td>{row.isEmpty ? "" : valueOrEmpty(row.position)}</td>
                                                <td>{row.isEmpty ? "" : valueOrEmpty(row.diameter)}</td>
                                                <td className={pmtNonConforme ? "rapport-cell-nonconforme" : ""}>{row.isEmpty ? "" : valueOrEmpty(row.textureDepth)}</td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="rapport-average-row">
                                        <td>Nb d'essais :</td>
                                        <td>{valueOrEmpty(resolvedReport.results?.testCount)}</td>
                                        <td colSpan="2">Profondeur de macrotexture générale :</td>
                                        <td>{valueOrEmpty(resolvedReport.results?.averageTextureDepth)}</td>
                                    </tr>
                                    <tr className="rapport-conformity-row">
                                        <td className="rapport-conformity-cell" colSpan="5">
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
    );
}

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import Button from "@/components/ui/Button"
import EssaiCorrectionBanner from "@/components/essais/EssaiCorrectionBanner"
import { getFeuilleValidationInfo } from "@/lib/essaiValidation"
import { feuillesTerrainApi, interventionsApi, qualiteApi } from "@/services/api"
import { formatDate } from "@/lib/utils"
import { applyOperatorSondeurCrossFill, mergeInheritedScPointFields } from "@/lib/sc/pointInheritance"
import {
    ScPointDetailView,
    ScSheetToolbar,
    scBuildPointForm,
    scBuildCoucheForm,
    scToPointPayload,
    scToCouchePayload,
    scBuildDefaultScCoupe,
} from "@/pages/modeles/scStratigraphicWorksheet"

function formatMetric(value) {
    if (value == null || value === "") return "—"
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return `${numeric.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m`
    return String(value)
}

function buildListSearchParams(searchParams, sourceUid) {
    const p = new URLSearchParams()
    p.set("source_family", "terrain")
    p.set("source_uid", sourceUid)
    const rt = String(searchParams.get("return_to") || "").trim()
    if (rt) p.set("return_to", rt)
    return p
}

const NEW_POINT_PARAM = "new"

function normalizeSearchText(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
}

function buildDraftPoint() {
    return {
        uid: null,
        point_type: "SONDAGE_CAROTTE",
        point_code: "",
        couches: [],
        prelevements: [],
    }
}

export default function ModeleSCPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const queryClient = useQueryClient()
    const sourceUid = String(searchParams.get("source_uid") || "").trim()
    const pointParam = String(searchParams.get("point") || "").trim()
    const returnTo = String(searchParams.get("return_to") || "").trim()

    const listHref = `/modeles/sc?${buildListSearchParams(searchParams, sourceUid).toString()}`
    const detailReturnTo = listHref
    const isDraftPoint = pointParam === NEW_POINT_PARAM

    const { data, isLoading, error } = useQuery({
        queryKey: ["feuille-terrain", sourceUid],
        queryFn: () => feuillesTerrainApi.get(sourceUid),
        enabled: Boolean(sourceUid),
        staleTime: 0,
        refetchOnMount: "always",
    })

    const interventionId = data?.intervention_id
    const { data: interventionData } = useQuery({
        queryKey: ["intervention", interventionId],
        queryFn: () => interventionsApi.get(interventionId),
        enabled: Boolean(interventionId),
        staleTime: 60_000,
    })

    const points = useMemo(() => (Array.isArray(data?.points) ? data.points : []), [data?.points])
    const validationInfo = useMemo(() => getFeuilleValidationInfo(data), [data])
    const selectedPoint = useMemo(
        () => (isDraftPoint ? null : points.find((item) => String(item.uid) === String(pointParam)) || null),
        [points, pointParam, isDraftPoint],
    )
    const draftPoint = useMemo(() => buildDraftPoint(), [])
    const activePoint = isDraftPoint ? draftPoint : selectedPoint

    const [pointEditing, setPointEditing] = useState(true)
    const [pointForm, setPointForm] = useState(() => scBuildPointForm(null, 'SC'))
    const pointFormRef = useRef(pointForm)
    const loadedPointUidRef = useRef(null)

    useEffect(() => {
        pointFormRef.current = pointForm
    }, [pointForm])
    const [editingCoucheId, setEditingCoucheId] = useState(null)
    const [coucheForm, setCoucheFormState] = useState(scBuildCoucheForm())
    const [addingCouche, setAddingCouche] = useState(false)
    const [prelevCoucheId, setPrelevCoucheId] = useState(null)
    const [editingCell, setEditingCell] = useState(null)
    const [selectedCoucheRow, setSelectedCoucheRow] = useState(null)
    const [newCoucheRow, setNewCoucheRow] = useState(null)
    const [editingCellValue, setEditingCellValue] = useState("")
    const [prelevForm, setPrelevForm] = useState({ profondeur: "", quantite: "" })
    const [equipmentOptions, setEquipmentOptions] = useState([])
    const [equipmentLoading, setEquipmentLoading] = useState(false)
    const [equipmentError, setEquipmentError] = useState("")

    useEffect(() => {
        if (!activePoint) {
            loadedPointUidRef.current = null
            setPointForm(scBuildPointForm(null, data?.code_feuille))
            setEditingCoucheId(null)
            setCoucheFormState(scBuildCoucheForm())
            setAddingCouche(false)
            setPrelevCoucheId(null)
            setPrelevForm({ profondeur: "", quantite: "" })
            setEditingCell(null)
            setEditingCellValue("")
            setSelectedCoucheRow(null)
            setNewCoucheRow(null)
            return
        }
        if (isDraftPoint) {
            setPointForm((current) => {
                const merged = mergeInheritedScPointFields(
                    scBuildPointForm({ point_type: "SONDAGE_CAROTTE", ...current }, data?.code_feuille),
                    data,
                    interventionData,
                )
                if (!Array.isArray(merged.carotte_coupes) || !merged.carotte_coupes.length) {
                    merged.carotte_coupes = [
                        scBuildDefaultScCoupe({
                            pointForm: merged,
                            selectedPhoto: null,
                            couches: [],
                            title: "Coupe 1",
                        }),
                    ]
                }
                return merged
            })
        } else {
            const newForm = scBuildPointForm(activePoint, data?.code_feuille)
            if (!Array.isArray(newForm.carotte_coupes) || !newForm.carotte_coupes.length) {
                const pointCouches = Array.isArray(activePoint?.couches) ? activePoint.couches : []
                newForm.carotte_coupes = [
                    scBuildDefaultScCoupe({
                        pointForm: newForm,
                        selectedPhoto: null,
                        couches: pointCouches,
                        title: "Coupe 1",
                    }),
                ]
            }
            const pointUid = String(activePoint.uid || '')
            if (loadedPointUidRef.current !== pointUid) {
                loadedPointUidRef.current = pointUid
                setPointForm(newForm)
            }
        }
        setPointEditing(true)
        setEditingCoucheId(null)
        setCoucheFormState(scBuildCoucheForm())
        setAddingCouche(false)
        setPrelevCoucheId(null)
        setPrelevForm({ profondeur: "", quantite: "" })
        setEditingCell(null)
        setEditingCellValue("")
        setSelectedCoucheRow(null)
        setNewCoucheRow(null)
    }, [activePoint, isDraftPoint, data, interventionData])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setEquipmentLoading(true)
            setEquipmentError("")
            try {
                const rows = await qualiteApi.equipmentOptions.list({ usage: "sondage_carotte_sc" })
                const usageRows = Array.isArray(rows) ? rows : []
                const carotteTerms = ["carotte", "carotier", "carottage", "foreuse", "couronne", "sondage", "sondeuse", "perceuse"]
                const equipmentRows = await qualiteApi.equipment.list().catch(() => [])
                const terrainRows = (Array.isArray(equipmentRows) ? equipmentRows : [])
                    .filter((item) => String(item?.category || "").trim() === "Terrain")
                    .filter((item) => String(item?.status || "").trim() === "En service")
                    .filter((item) => {
                        const searchable = normalizeSearchText([
                            item?.code,
                            item?.label,
                            item?.domain,
                            item?.serial_number,
                            item?.notes,
                        ].filter(Boolean).join(" "))
                        return carotteTerms.some((term) => searchable.includes(term))
                    })
                    .map((item) => {
                        const code = String(item?.code || "").trim()
                        const label = String(item?.label || "").trim()
                        const serial = String(item?.serial_number || "").trim()
                        return {
                            value: code || label || String(item?.uid || ""),
                            label: code && label ? `${code} - ${label}${serial ? ` (${serial})` : ""}` : label || code || String(item?.uid || ""),
                            equipment_id: item?.uid || null,
                            domain: String(item?.domain || "").trim(),
                            equipment_label: label,
                        }
                    })
                const mergedByValue = new Map()
                for (const item of [...usageRows, ...terrainRows]) {
                    const key = String(item?.value || "").trim().toUpperCase()
                    if (!key) continue
                    if (!mergedByValue.has(key)) mergedByValue.set(key, item)
                }
                if (!cancelled) setEquipmentOptions(Array.from(mergedByValue.values()))
            } catch (error) {
                if (!cancelled) {
                    setEquipmentOptions([])
                    setEquipmentError(error?.message || "Chargement des équipements impossible.")
                }
            } finally {
                if (!cancelled) setEquipmentLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [])

    function setCoucheField(key, value) {
        if (key === "__reset__") {
            setCoucheFormState(value)
            return
        }
        setCoucheFormState((current) => ({ ...current, [key]: value }))
    }

    function setPointField(key, value) {
        setPointForm((current) => {
            const resolved = typeof value === 'function' ? value(current[key]) : value
            const next = { ...current, [key]: resolved }
            if (key === "operateur" || key === "sondeur") {
                return applyOperatorSondeurCrossFill(next)
            }
            return next
        })
    }

    function patchPointForm(patch) {
        setPointForm((current) => applyOperatorSondeurCrossFill({ ...current, ...patch }))
    }

    const updatePointMutation = useMutation({
        mutationFn: (payload) => {
            const pointUid = selectedPoint?.uid
            if (!pointUid) throw new Error("Point introuvable")
            return feuillesTerrainApi.updatePoint(sourceUid, pointUid, payload)
        },
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
        },
    })

    const createPointMutation = useMutation({
        mutationFn: (payload) => feuillesTerrainApi.createPoint(sourceUid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
            const previousIds = new Set(points.map((item) => item.uid))
            const createdPoint = (Array.isArray(saved?.points) ? saved.points : []).find((item) => !previousIds.has(item.uid))
                || (Array.isArray(saved?.points) ? saved.points[saved.points.length - 1] : null)
            if (createdPoint?.uid) {
                const params = buildListSearchParams(searchParams, sourceUid)
                params.set("point", String(createdPoint.uid))
                params.set("edit", "1")
                navigate(`/modeles/sc?${params.toString()}`)
            }
        },
    })

    const createCoucheMutation = useMutation({
        mutationFn: (payload) => feuillesTerrainApi.createCouche(sourceUid, selectedPoint.uid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
            setAddingCouche(false)
            setNewCoucheRow(null)
            setCoucheFormState(scBuildCoucheForm())
        },
    })

    const updateCoucheMutation = useMutation({
        mutationFn: ({ coucheUid, payload }) =>
            feuillesTerrainApi.updateCouche(sourceUid, selectedPoint.uid, coucheUid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
            setEditingCoucheId(null)
            setCoucheFormState(scBuildCoucheForm())
        },
    })

    const deleteCoucheMutation = useMutation({
        mutationFn: (coucheUid) => feuillesTerrainApi.deleteCouche(sourceUid, selectedPoint.uid, coucheUid),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
        },
    })

    const createPrelevementMutation = useMutation({
        mutationFn: ({ coucheUid, payload }) =>
            feuillesTerrainApi.createPrelevementForCouche(sourceUid, selectedPoint.uid, coucheUid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
            setPrelevCoucheId(null)
            setPrelevForm({ profondeur: "", quantite: "" })
        },
    })

    const updatePrelevementMutation = useMutation({
        mutationFn: ({ prelevUid, payload }) => feuillesTerrainApi.updatePrelevement(sourceUid, prelevUid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
        },
    })

    const deletePointMutation = useMutation({
        mutationFn: (pointUid) => feuillesTerrainApi.deletePoint(sourceUid, pointUid),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
            navigate(listHref)
        },
    })

    const deletePrelevementMutation = useMutation({
        mutationFn: (prelevUid) => feuillesTerrainApi.deletePrelevement(sourceUid, prelevUid),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
        },
    })

    const savePointPending = updatePointMutation.isPending || createPointMutation.isPending

    const deleteErrorMessage =
        deletePointMutation.error?.message ||
        deleteCoucheMutation.error?.message ||
        deletePrelevementMutation.error?.message ||
        ""

    const savePointErrorMessage =
        createPointMutation.error?.message ||
        updatePointMutation.error?.message ||
        ""

    function startEditCell(coucheUid, field, currentValue) {
        setEditingCell({ coucheUid, field })
        setEditingCellValue(currentValue == null ? "" : String(currentValue))
    }

    function saveCellEdit() {
        if (!editingCell || !selectedPoint) return
        const { coucheUid, field } = editingCell
        const pointCouches = Array.isArray(selectedPoint?.couches) ? selectedPoint.couches : []
        const couche = pointCouches.find((c) => String(c.uid) === String(coucheUid))
        if (!couche) {
            setEditingCell(null)
            return
        }
        const merged = { ...scBuildCoucheForm(couche), [field]: editingCellValue }
        const payload = scToCouchePayload(merged)
        updateCoucheMutation.mutate({ coucheUid, payload })
        const numFields = ["z_haut", "z_bas", "profondeur_eau"]
        if (!numFields.includes(field) && editingCellValue && editingCellValue.trim()) {
            feuillesTerrainApi.saveCustomValue(field, editingCellValue.trim()).catch(() => {})
        }
        setEditingCell(null)
        setEditingCellValue("")
    }

    function handleInsertCouche() {
        if (!selectedCoucheRow || !selectedPoint) return
        const pointCouches = Array.isArray(selectedPoint?.couches) ? selectedPoint.couches : []
        const idx = pointCouches.findIndex((c) => String(c.uid) === String(selectedCoucheRow))
        if (idx < 0) return
        const before = pointCouches[idx]
        const after = pointCouches[idx + 1] || null
        const newZHaut = String(before.z_bas ?? "")
        const newZBas = after ? String(after.z_haut ?? "") : ""
        setNewCoucheRow({ z_haut: newZHaut, z_bas: newZBas, insertAfterUid: before.uid })
        setAddingCouche(false)
        setEditingCoucheId(null)
        setSelectedCoucheRow(null)
    }

    function handleSavePoint() {
        if (!activePoint) return
        const payload = scToPointPayload(pointForm, data?.code_feuille)
        if (isDraftPoint) {
            createPointMutation.mutate(payload)
            return
        }
        updatePointMutation.mutate(payload)
    }

    async function persistPointPhotos(nextCoupes) {
        if (isDraftPoint || !activePoint?.uid) return
        const payload = scToPointPayload(
            {
                ...pointFormRef.current,
                carotte_coupes: Array.isArray(nextCoupes) ? nextCoupes : pointFormRef.current.carotte_coupes,
            },
            data?.code_feuille,
        )
        await updatePointMutation.mutateAsync(payload)
    }

    function handleCreateCouche(inlineForm) {
        if (!selectedPoint) return
        const payload = inlineForm ? scToCouchePayload(inlineForm) : scToCouchePayload(coucheForm)
        createCoucheMutation.mutate(payload)
    }

    function handleAddCouche() {
        const pointCouches = Array.isArray(selectedPoint?.couches) ? selectedPoint.couches : []
        const lastCouche = pointCouches.length ? pointCouches[pointCouches.length - 1] : null
        const nextZHaut = lastCouche?.z_bas ?? ""
        setNewCoucheRow({ z_haut: String(nextZHaut), z_bas: "", insertAfterUid: lastCouche?.uid ?? null })
        setAddingCouche(false)
        setEditingCoucheId(null)
    }

    function handleUpdateCouche(coucheUid) {
        updateCoucheMutation.mutate({ coucheUid, payload: scToCouchePayload(coucheForm) })
    }

    function handleDeleteCouche(coucheUid) {
        if (!window.confirm("Supprimer cette couche ?")) return
        deleteCoucheMutation.mutate(coucheUid)
    }

    function startCreatePoint() {
        const params = buildListSearchParams(searchParams, sourceUid)
        params.set("point", NEW_POINT_PARAM)
        params.set("edit", "1")
        navigate(`/modeles/sc?${params.toString()}`)
    }

    function handleDiscardDraftPoint(skipConfirm = false) {
        if (!skipConfirm && !window.confirm("Abandonner ce sondage non enregistré ?")) return
        navigate(listHref)
    }

    function handleBackToCoupeList() {
        if (isDraftPoint) {
            handleDiscardDraftPoint()
            return
        }
        navigate(listHref)
    }

    if (pointParam && sourceUid) {
        if (isLoading) {
            return <div className="py-12 text-center text-sm text-text-muted">Chargement du sondage…</div>
        }
        if (error || !data) {
            return (
                <div className="mx-auto max-w-[980px] p-6">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        Impossible de charger la feuille SC.
                    </div>
                </div>
            )
        }
        if (!activePoint) {
            return (
                <div className="mx-auto max-w-[980px] p-6 flex flex-col gap-4">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Point introuvable sur cette feuille (uid&nbsp;: {pointParam}).
                    </div>
                    <Button variant="secondary" onClick={() => navigate(listHref)}>
                        ← Retour à la liste des sondages
                    </Button>
                </div>
            )
        }

        const sheetToolbarActions = (
            <>
                {data?.demande_id ? (
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/demandes/${data.demande_id}`)}>
                        Demande
                    </Button>
                ) : null}
                {data?.intervention_id ? (
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/interventions/${data.intervention_id}`)}>
                        Intervention
                    </Button>
                ) : null}
                {!isDraftPoint ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            const ref = encodeURIComponent(String(data?.reference || activePoint?.point_code || activePoint?.uid || "view"))
                            const params = new URLSearchParams()
                            params.set("embed", "1")
                            params.set("source_family", "terrain")
                            if (data?.uid || sourceUid) params.set("source_uid", String(data?.uid || sourceUid))
                            if (activePoint?.uid || activePoint?.point_code) params.set("point", String(activePoint.uid || activePoint.point_code))
                            navigate(`/rapports/sc/${ref}?${params.toString()}`)
                        }}
                    >
                        Imprimer / Ouvrir rapport
                    </Button>
                ) : null}
            </>
        )

        return (
            <ScPointDetailView
                data={data}
                point={activePoint}
                interventionData={interventionData}
                isDraftPoint={isDraftPoint}
                topBanner={<EssaiCorrectionBanner validation={validationInfo} essaiLabel="sondage SC" />}
                detailReturnTo={detailReturnTo}
                navigate={navigate}
                pointEditing={pointEditing}
                setPointEditing={setPointEditing}
                pointForm={pointForm}
                setPointField={setPointField}
                patchPointForm={patchPointForm}
                handleSavePoint={handleSavePoint}
                persistPointPhotos={persistPointPhotos}
                updatePointPending={savePointPending}
                savePointErrorMessage={savePointErrorMessage}
                addingCouche={addingCouche}
                setAddingCouche={setAddingCouche}
                editingCoucheId={editingCoucheId}
                setEditingCoucheId={setEditingCoucheId}
                coucheForm={coucheForm}
                setCoucheField={setCoucheField}
                handleCreateCouche={handleCreateCouche}
                createCouchePending={createCoucheMutation.isPending}
                handleUpdateCouche={handleUpdateCouche}
                updateCouchePending={updateCoucheMutation.isPending}
                handleDeleteCouche={handleDeleteCouche}
                deleteCouchePending={deleteCoucheMutation.isPending}
                onBackToCoupe={handleBackToCoupeList}
                prelevCoucheId={prelevCoucheId}
                setPrelevCoucheId={setPrelevCoucheId}
                prelevForm={prelevForm}
                setPrelevForm={setPrelevForm}
                createPrelevementPending={createPrelevementMutation.isPending}
                handleCreatePrelevement={(coucheUid) => createPrelevementMutation.mutate({ coucheUid, payload: prelevForm })}
                updatePrelevementPending={updatePrelevementMutation.isPending}
                handleUpdatePrelevement={(prelevUid, payload) => updatePrelevementMutation.mutate({ prelevUid, payload })}
                handleDeletePrelevement={(prelevUid) => {
                    if (!window.confirm("Supprimer ce prélèvement ?")) return
                    deletePrelevementMutation.mutate(prelevUid)
                }}
                handleDeletePoint={(pointUid) => {
                    if (isDraftPoint) {
                        handleDiscardDraftPoint(true)
                        return
                    }
                    deletePointMutation.mutate(pointUid)
                }}
                deleteErrorMessage={deleteErrorMessage}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                editingCellValue={editingCellValue}
                setEditingCellValue={setEditingCellValue}
                startEditCell={startEditCell}
                saveCellEdit={saveCellEdit}
                selectedCoucheRow={selectedCoucheRow}
                setSelectedCoucheRow={setSelectedCoucheRow}
                newCoucheRow={newCoucheRow}
                setNewCoucheRow={setNewCoucheRow}
                handleAddCouche={handleAddCouche}
                handleInsertCouche={handleInsertCouche}
                sheetToolbarActions={sheetToolbarActions}
                equipmentOptions={equipmentOptions}
                equipmentLoading={equipmentLoading}
                equipmentError={equipmentError}
            />
        )
    }

    if (!sourceUid) {
        return (
            <div className="mx-auto max-w-[980px] p-6">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Source SC manquante (`source_uid`).
                </div>
            </div>
        )
    }

    if (isLoading) {
        return <div className="py-12 text-center text-sm text-text-muted">Chargement de la feuille SC…</div>
    }

    if (error || !data) {
        return (
            <div className="mx-auto max-w-[980px] p-6">
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Impossible de charger la feuille SC.
                </div>
            </div>
        )
    }

    const totalCouches = points.reduce((sum, p) => sum + (p.couches?.length || 0), 0)
    const totalPrelev = points.reduce((sum, p) => sum + (p.prelevements?.length || 0), 0)

    return (
        <div
            className="flex flex-col h-full -mx-6 -mb-6"
            style={{ background: 'radial-gradient(circle at top right, rgba(255,204,0,0.18), transparent 32%), linear-gradient(180deg, #f8fafc 0%, #f3f6fb 42%, #eef3fa 100%)' }}
        >
            {/* ═══ Topbar ═══ */}
            <ScSheetToolbar
                backLabel="← Retour"
                onBack={() => navigate(returnTo || "/tools")}
                title={data?.reference || sourceUid}
                subtitle="Feuille SC · Coupe de sondages"
                actions={(
                    <>
                        {data?.demande_id ? (
                            <Button size="sm" onClick={() => navigate(`/demandes/${data.demande_id}`)}>Demande</Button>
                        ) : null}
                        {data?.intervention_id ? (
                            <Button size="sm" onClick={() => navigate(`/interventions/${data.intervention_id}`)}>Intervention</Button>
                        ) : null}
                    </>
                )}
            />

            {/* ═══ Main ═══ */}
            <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
                <EssaiCorrectionBanner validation={validationInfo} essaiLabel="feuille SC" />

                {/* ── Hero ── */}
                <section
                    className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white"
                    style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
                >
                    <div
                        className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
                        style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
                    >
                        <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />

                        <div>
                            <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
                                <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
                                RaLab 5 · Sondage Carotte
                            </div>
                            <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{data.reference}</h1>
                            <p className="mt-3 text-[14px] leading-relaxed text-white/70 max-w-2xl">
                                {[data.label, data.observations].filter(Boolean).join(" · ") || "Coupe de sondages carotte — sélectionne un sondage pour ouvrir la fiche."}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-start gap-2">
                            {data.code_feuille ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold">
                                    {data.code_feuille}
                                </span>
                            ) : null}
                            {data.statut ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold">
                                    {data.statut}
                                </span>
                            ) : null}
                            {data.date_feuille ? (
                                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold">
                                    {formatDate(data.date_feuille)}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* ── Metrics ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">Sondages</div>
                            <div className="mt-1 text-[22px] font-black text-[#172033]">{points.length}</div>
                        </div>
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">Couches</div>
                            <div className="mt-1 text-[22px] font-black text-[#172033]">{totalCouches}</div>
                        </div>
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">Prélèvements</div>
                            <div className="mt-1 text-[22px] font-black text-[#172033]">{totalPrelev}</div>
                        </div>
                        <div className="rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-[#69758a]">Demande</div>
                            <div className="mt-1 text-[14px] font-black text-[#172033] truncate">{data.demande_reference || '—'}</div>
                        </div>
                    </div>
                </section>

                {/* ── Sondages list ── */}
                <section
                    className="rounded-[22px] border border-[#dbe1ea] bg-white overflow-hidden"
                    style={{ boxShadow: '0 4px 18px rgba(0,49,112,0.06)' }}
                >
                    <div className="px-5 py-4 border-b border-[#e4e9f1] bg-[#fbfcfe] flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a]">Sondages de la coupe</div>
                            <div className="mt-0.5 text-[12px] text-[#69758a]">
                                {points.length} point(s) enregistrés · clique sur une ligne ou « Feuille essai » pour saisir les coupes
                            </div>
                        </div>
                        <Button variant="primary" size="sm" onClick={startCreatePoint}>
                            Créer un sondage
                        </Button>
                    </div>
                    <div className="p-4">
                        {points.length ? (
                            <div className="flex flex-col gap-2">
                                {points.map((point) => {
                                    const pointId = String(point?.uid || "").trim()
                                    const params = buildListSearchParams(searchParams, sourceUid)
                                    if (pointId) params.set("point", pointId)
                                    return (
                                        <div key={pointId || point.point_code} className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/modeles/sc?${params.toString()}`)}
                                                className="flex-1 min-w-0 rounded-[14px] border border-[#e4e9f1] bg-white px-4 py-3 text-left hover:border-[#003170]/30 hover:shadow-sm transition-all"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-[14px] font-black text-[#003170]">
                                                            {point.point_code || pointId || "Point"}
                                                        </div>
                                                        <div className="mt-1 text-[12px] text-[#69758a]">
                                                            {[point.localisation, point.profil].filter(Boolean).join(" · ") || "—"}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-[13px] font-bold text-[#172033]">{formatMetric(point.profondeur_finale_m)}</div>
                                                        <div className="text-[11px] text-[#69758a]">
                                                            {point.couches?.length || 0} couche(s) · {point.prelevements?.length || 0} prél.
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                title="Ouvrir la fiche essai SC"
                                                onClick={() => {
                                                    const openParams = buildListSearchParams(searchParams, sourceUid)
                                                    if (pointId) openParams.set('point', pointId)
                                                    openParams.set('edit', '1')
                                                    navigate(`/modeles/sc?${openParams.toString()}`)
                                                }}
                                            >
                                                Feuille essai
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-[14px] border border-dashed border-[#dbe1ea] px-4 py-8 text-[13px] text-[#69758a] text-center">
                                Aucun sondage SC sur cette feuille.
                                <br />
                                Cliquez sur <strong className="text-[#003170]">Créer un sondage</strong> pour ouvrir la fiche essai (coupe, photo, couches).
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}

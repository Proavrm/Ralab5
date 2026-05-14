import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import Button from "@/components/ui/Button"
import { feuillesTerrainApi } from "@/services/api"
import {
    ScPointDetailView,
    scBuildPointForm,
    scBuildCoucheForm,
    scToPointPayload,
    scToCouchePayload,
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

export default function ModeleSCPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const queryClient = useQueryClient()
    const sourceUid = String(searchParams.get("source_uid") || "").trim()
    const pointParam = String(searchParams.get("point") || "").trim()
    const returnTo = String(searchParams.get("return_to") || "").trim()

    const listHref = `/modeles/sc?${buildListSearchParams(searchParams, sourceUid).toString()}`
    const detailReturnTo = listHref

    const { data, isLoading, error } = useQuery({
        queryKey: ["feuille-terrain", sourceUid],
        queryFn: () => feuillesTerrainApi.get(sourceUid),
        enabled: Boolean(sourceUid),
    })

    const points = useMemo(() => (Array.isArray(data?.points) ? data.points : []), [data?.points])
    const selectedPoint = useMemo(
        () => points.find((item) => String(item.uid) === String(pointParam)) || null,
        [points, pointParam],
    )

    const [pointEditing, setPointEditing] = useState(true)
    const [pointForm, setPointForm] = useState(scBuildPointForm())
    const [editingCoucheId, setEditingCoucheId] = useState(null)
    const [coucheForm, setCoucheFormState] = useState(scBuildCoucheForm())
    const [addingCouche, setAddingCouche] = useState(false)
    const [prelevCoucheId, setPrelevCoucheId] = useState(null)
    const [editingCell, setEditingCell] = useState(null)
    const [selectedCoucheRow, setSelectedCoucheRow] = useState(null)
    const [newCoucheRow, setNewCoucheRow] = useState(null)
    const [editingCellValue, setEditingCellValue] = useState("")
    const [prelevForm, setPrelevForm] = useState({ profondeur: "", quantite: "" })

    useEffect(() => {
        if (!selectedPoint) {
            setPointForm(scBuildPointForm())
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
        setPointForm(scBuildPointForm(selectedPoint))
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
    }, [selectedPoint])

    function setCoucheField(key, value) {
        if (key === "__reset__") {
            setCoucheFormState(value)
            return
        }
        setCoucheFormState((current) => ({ ...current, [key]: value }))
    }

    function setPointField(key, value) {
        setPointForm((current) => ({ ...current, [key]: value }))
    }

    const updatePointMutation = useMutation({
        mutationFn: (payload) => feuillesTerrainApi.updatePoint(sourceUid, selectedPoint.uid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(["feuille-terrain", sourceUid], saved)
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

    const deleteErrorMessage =
        deletePointMutation.error?.message ||
        deleteCoucheMutation.error?.message ||
        deletePrelevementMutation.error?.message ||
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
        if (!selectedPoint) return
        updatePointMutation.mutate(scToPointPayload(pointForm))
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
        if (!selectedPoint) {
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
            </>
        )

        return (
            <ScPointDetailView
                data={data}
                point={selectedPoint}
                detailReturnTo={detailReturnTo}
                navigate={navigate}
                pointEditing={pointEditing}
                setPointEditing={setPointEditing}
                pointForm={pointForm}
                setPointField={setPointField}
                handleSavePoint={handleSavePoint}
                updatePointPending={updatePointMutation.isPending}
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
                onBackToCoupe={() => navigate(listHref)}
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
                handleDeletePoint={(pointUid) => deletePointMutation.mutate(pointUid)}
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

    return (
        <div className="flex flex-col h-full -m-6 overflow-y-auto">
            <div className="sticky top-0 z-10 flex min-h-[58px] flex-wrap items-center gap-2 border-b border-border bg-surface px-6">
                <Button variant="secondary" size="sm" onClick={() => navigate(returnTo || "/tools")}>
                    ← Retour
                </Button>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-text">Feuille SC de travail</div>
                    <div className="truncate text-[11px] text-text-muted">{data?.reference || sourceUid}</div>
                </div>
                <div className="flex flex-wrap gap-2">
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
                </div>
            </div>

            <div className="p-6 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
                <div className="rounded-lg border border-[#d8e6e1] bg-[#f6fbf9] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Coupe de sondages</p>
                    <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-text">{data.reference}</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
                        {[data.label, data.observations].filter(Boolean).join(" · ") ||
                            "Sélectionne un sondage SC pour ouvrir la fiche complète."}
                    </p>
                </div>

                <div className="rounded-xl border border-border bg-surface shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-bg px-4 py-3">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Sondages de la coupe</div>
                        <span className="text-[11px] text-text-muted">{points.length} point(s)</span>
                    </div>
                    <div className="p-4">
                        {points.length ? (
                            <div className="flex flex-col gap-3">
                                {points.map((point) => {
                                    const pointId = String(point?.uid || "").trim()
                                    const params = buildListSearchParams(searchParams, sourceUid)
                                    if (pointId) params.set("point", pointId)
                                    return (
                                        <button
                                            key={pointId || point.point_code}
                                            type="button"
                                            onClick={() => navigate(`/modeles/sc?${params.toString()}`)}
                                            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-left hover:border-accent transition-colors"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-[14px] font-semibold text-text">
                                                        {point.point_code || pointId || "Point"}
                                                    </div>
                                                    <div className="mt-1 text-[12px] text-text-muted">
                                                        {[point.localisation, point.profil].filter(Boolean).join(" · ")}
                                                    </div>
                                                </div>
                                                <div className="text-right text-[11px] text-text-muted">
                                                    <div>{formatMetric(point.profondeur_finale_m)}</div>
                                                    <div>
                                                        {point.couches?.length || 0} couche(s) · {point.prelevements?.length || 0}{" "}
                                                        prél.
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">
                                Aucun sondage SC disponible sur cette feuille.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

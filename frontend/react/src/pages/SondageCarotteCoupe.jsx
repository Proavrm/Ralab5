/**
 * SondageCarotteCoupe.jsx
 * 
 * Coupe de Sondage Carotté (SC) - Core Sample Cut form component
 * Displays and edits SC data: header, photo, couches (layers), lab data
 * 
 * Used within EssaiPage for code='SC' essais.
 */

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'


function SondageCarotteCoupe({ res, onChange, readOnly, essai }) {
    if (!res) return null

    // Parse payload
    const meta = res.meta || {}
    const couches = res.couches || []
    
    // Photo state
    const [photoError, setPhotoError] = useState(false)
    
    // Get essai ID from props (passed from EssaiPage)
    const essaiId = essai?.uid || essai?.id
    
    // Build photo URL - prefer essai_id for direct lookup
    const photoUrl = essaiId && essaiId !== 'new'
        ? `/api/photos/essai/${essaiId}`
        : null
    const photoNumber = meta.photo_number || meta.sc_number || '—'

    // ── State for editing ──
    const [editingCoucheId, setEditingCoucheId] = useState(null)
    const [coucheForm, setCoucheForm] = useState({})

    function handleStartEditCouche(idx) {
        setEditingCoucheId(idx)
        setCoucheForm(couches[idx] || {})
    }

    function handleSaveCouche() {
        if (editingCoucheId === null) return
        const updated = [...couches]
        updated[editingCoucheId] = coucheForm
        const newRes = { ...res, couches: updated }
        onChange && onChange(newRes)
        setEditingCoucheId(null)
    }

    function handleCancelEditCouche() {
        setEditingCoucheId(null)
    }

    function handleAddCouche() {
        const newCouche = {
            description: "",
            d: null,
            vide: null,
            compacite: null,
        }
        const updated = [...couches, newCouche]
        const newRes = { ...res, couches: updated }
        onChange && onChange(newRes)
    }

    function handleDeleteCouche(idx) {
        if (!window.confirm("Supprimer cette couche ?")) return
        const updated = couches.filter((_, i) => i !== idx)
        const newRes = { ...res, couches: updated }
        onChange && onChange(newRes)
    }

    // ── Render ──
    return (
        <div className="flex flex-col gap-4">
            {/* Header Card */}
            <Card title="Informations générales">
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-text-muted">Affaire NGÉ</label>
                        <div className="text-sm font-medium">{meta.affaire_nge_raw || "—"}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-text-muted">Type d'ouvrage</label>
                        <div className="text-sm">{meta.type_ouvrage || "—"}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-text-muted">Partie de l'ouvrage</label>
                        <div className="text-sm">{meta.partie_ouvrage || "—"}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-text-muted">Date de sondage</label>
                        <div className="text-sm">{meta.date_sondage || "—"}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-text-muted">Procédé</label>
                        <div className="text-sm">{meta.procede || "—"}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-text-muted">Diamètre couronne</label>
                        <div className="text-sm">{meta.diametre || "—"}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-text-muted">Arrêt de sondage</label>
                        <div className="text-sm">{meta.arret_sondage || "—"}</div>
                    </div>
                </div>
            </Card>

            {/* Photo Card */}
            <Card title="Photo de la carotte">
                {photoUrl ? (
                    <div className="flex flex-col gap-2">
                        <div className="bg-bg border border-border rounded-lg overflow-hidden">
                            <img 
                                src={photoUrl}
                                alt={`SC ${photoNumber}`}
                                className="max-h-96 w-full object-contain"
                                onError={() => setPhotoError(true)}
                            />
                        </div>
                        <div className="text-xs text-text-muted">
                            Photo n° {photoNumber}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-6 text-center text-sm text-text-muted">
                        {photoError ? "Impossible de charger la photo" : "Aucune photo disponible"}
                    </div>
                )}
            </Card>

            {/* Couches Table Card */}
            <Card 
                title="Couches" 
                right={<span className="text-[11px] text-text-muted">{couches.length} couche(s)</span>}
            >
                {couches.length ? (
                    <div className="flex flex-col gap-2">
                        {couches.map((couche, idx) => (
                            <div key={idx} className="rounded-lg border border-border bg-surface">
                                {editingCoucheId === idx ? (
                                    <EditCoucheForm
                                        couche={coucheForm}
                                        onChange={setCoucheForm}
                                        onSave={handleSaveCouche}
                                        onCancel={handleCancelEditCouche}
                                        readOnly={readOnly}
                                    />
                                ) : (
                                    <CoucheRow
                                        couche={couche}
                                        index={idx}
                                        onEdit={() => handleStartEditCouche(idx)}
                                        onDelete={() => handleDeleteCouche(idx)}
                                        readOnly={readOnly}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-6 text-center text-sm text-text-muted">
                        Aucune couche enregistrée
                    </div>
                )}
                {!readOnly && (
                    <Button 
                        variant="secondary" 
                        className="mt-3 w-full"
                        onClick={handleAddCouche}
                    >
                        + Ajouter une couche
                    </Button>
                )}
            </Card>

            {/* Resume Stats */}
            <Card title="Résumé">
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-bg px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">
                            Couches
                        </div>
                        <div className="mt-1 text-lg font-semibold text-text">
                            {couches.length}
                        </div>
                    </div>
                    <div className="rounded-lg border border-border bg-bg px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">
                            Avec données labo
                        </div>
                        <div className="mt-1 text-lg font-semibold text-text">
                            {couches.filter(c => c.d || c.vide || c.compacite).length}
                        </div>
                    </div>
                    <div className="rounded-lg border border-border bg-bg px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">
                            % Lab
                        </div>
                        <div className="mt-1 text-lg font-semibold text-text">
                            {couches.length ? Math.round(100 * couches.filter(c => c.d || c.vide || c.compacite).length / couches.length) : 0}%
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    )
}


function CoucheRow({ couche, index, onEdit, onDelete, readOnly }) {
    return (
        <div className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text mb-1">
                        Couche {index + 1}
                    </div>
                    <div className="text-sm text-text-muted mb-2">
                        {couche.description || "—"}
                    </div>
                    {(couche.d || couche.vide || couche.compacite) && (
                        <div className="flex flex-wrap gap-2 text-xs">
                            {couche.d !== null && couche.d !== undefined && (
                                <span className="rounded-full border border-border bg-bg px-2 py-1">
                                    d: {couche.d}%
                                </span>
                            )}
                            {couche.vide !== null && couche.vide !== undefined && (
                                <span className="rounded-full border border-border bg-bg px-2 py-1">
                                    vide: {couche.vide}%
                                </span>
                            )}
                            {couche.compacite !== null && couche.compacite !== undefined && (
                                <span className="rounded-full border border-border bg-bg px-2 py-1">
                                    compacité: {couche.compacite}%
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {!readOnly && (
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={onEdit}
                            className="px-2 py-1 rounded border border-border hover:border-accent text-xs font-medium text-text-muted hover:text-text transition"
                        >
                            ✏️
                        </button>
                        <button
                            onClick={onDelete}
                            className="px-2 py-1 rounded border border-border hover:border-red-400 text-xs font-medium text-text-muted hover:text-red-600 transition"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}


function EditCoucheForm({ couche, onChange, onSave, onCancel, readOnly }) {
    return (
        <div className="px-4 py-3 flex flex-col gap-3">
            <div>
                <label className="text-[11px] font-medium text-text-muted mb-1 block">
                    Description (nature, type, état)
                </label>
                <textarea
                    value={couche.description || ""}
                    onChange={(e) => onChange({ ...couche, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
                    disabled={readOnly}
                />
            </div>

            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="text-[11px] font-medium text-text-muted mb-1 block">
                        d (%)
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        value={couche.d ?? ""}
                        onChange={(e) => onChange({ ...couche, d: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent"
                        disabled={readOnly}
                    />
                </div>
                <div>
                    <label className="text-[11px] font-medium text-text-muted mb-1 block">
                        % vide
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        value={couche.vide ?? ""}
                        onChange={(e) => onChange({ ...couche, vide: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent"
                        disabled={readOnly}
                    />
                </div>
                <div>
                    <label className="text-[11px] font-medium text-text-muted mb-1 block">
                        Compacité (%)
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        value={couche.compacite ?? ""}
                        onChange={(e) => onChange({ ...couche, compacite: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent"
                        disabled={readOnly}
                    />
                </div>
            </div>

            <div className="flex gap-2 justify-end">
                <Button variant="secondary" size="sm" onClick={onCancel}>
                    Annuler
                </Button>
                <Button variant="primary" size="sm" onClick={onSave} disabled={readOnly}>
                    Enregistrer
                </Button>
            </div>
        </div>
    )
}


export default SondageCarotteCoupe

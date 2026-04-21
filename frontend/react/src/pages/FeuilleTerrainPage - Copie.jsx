import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { navigateBackWithFallback, navigateWithReturnTo, buildLocationTarget } from '@/lib/detailNavigation'
import { feuillesTerrainApi } from '@/services/api'
import { formatDate } from '@/lib/utils'

const TEXTURE_OPTIONS = ['', 'argileux', 'argilo-limoneux', 'argilo-sableux', 'limono-argilo-sableux', 'limoneux', 'limono-argileux', 'limono-sableux', 'sableux', 'sablo-limoneux']
const PROPORTION_OPTIONS = ['', '0 - 25 %', '25 - 50 %', '50 - 75 %', '75 - 90 %', '100 %']
const FORME_OPTIONS = ['', 'sphérique', 'allongé', 'aplati', 'anguleux', 'sub-anguleux', 'sub-arrondi', 'arrondi']
const STRUCTURE_OPTIONS = ['', 'compacte', 'grumeleuse', 'poudreuse', 'pulvérulente']
const ORGANIQUE_OPTIONS = ['', 'beaucoup', 'moyen', 'peu', 'pas']
const COULEUR_OPTIONS = ['', 'blanc', 'gris', 'jaune', 'rose', 'brun', 'rouge', 'olive', 'noir', 'vif', 'pâle', 'clair', 'foncé', 'sombre']
const ODEUR_OPTIONS = ['', 'humus', 'réductrice', 'hydrocarbures', 'pas']
const CONSISTANCE_OPTIONS = ['', 'très molle', 'molle', 'moyenne', 'ferme', 'dure', 'très dure']

function Card({ title, children, right }) {
    return (
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
            {title ? (
                <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
                    {right}
                </div>
            ) : null}
            <div className="p-4">{children}</div>
        </div>
    )
}

function Row({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={`text-[13px] font-medium ${value ? 'text-text' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>
        </div>
    )
}

function Field({ label, children, full = false }) {
    return (
        <div className={full ? 'md:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
            <label className="text-[11px] font-medium text-text-muted">{label}</label>
            {children}
        </div>
    )
}

function Textarea({ value, onChange, rows = 3, placeholder = '' }) {
    return (
        <textarea
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
        />
    )
}

function parseNumber(value) {
    if (value == null || value === '') return null
    const parsed = Number(String(value).replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
}

function formatMetric(value, unit = 'm') {
    if (value == null || value === '') return ''
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
}

function formatResult(value, unit) {
    if (value == null || value === '') return ''
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
        return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
    }
    return `${value}${unit ? ` ${unit}` : ''}`
}

function buildPointSummary(point) {
    return [
        point.localisation,
        point.position_label,
        point.type_ouvrage,
        point.point_type,
    ].filter(Boolean).join(' · ')
}

function formatDepth(value) {
    if (value == null || value === '') return ''
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m`
}

function buildPointForm(point = null) {
    return {
        point_code: point?.point_code || '',
        point_type: point?.point_type || 'SONDAGE_PELLE',
        localisation: point?.localisation || '',
        profil: point?.profil || '',
        date_point: point?.date_point || '',
        operateur: point?.operateur || '',
        profondeur_finale_m: point?.profondeur_finale_m ?? point?.profondeur_bas ?? '',
        tenue_fouilles: point?.tenue_fouilles || '',
        venue_eau: point?.venue_eau == null ? '' : (point.venue_eau ? 'Oui' : 'Non'),
        niveau_nappe: point?.niveau_nappe || '',
        arret_sondage: point?.arret_sondage || '',
        ouvrage: point?.ouvrage || '',
        notes: point?.notes || '',
    }
}

function buildCoucheForm(couche = null) {
    return {
        z_haut: couche?.z_haut ?? '',
        z_bas: couche?.z_bas ?? '',
        texture_matrice: couche?.texture_matrice || '',
        proportion_matrice: couche?.proportion_matrice || '',
        elements_grossiers: couche?.elements_grossiers || '',
        granulo_elements: couche?.granulo_elements || '',
        forme_elements: couche?.forme_elements || '',
        petrographie: couche?.petrographie || '',
        structure: couche?.structure || '',
        matiere_organique: couche?.matiere_organique || '',
        couleur: couche?.couleur || '',
        odeur: couche?.odeur || '',
        consistance: couche?.consistance || '',
        cohesion: couche?.cohesion || '',
        oxydo_reduction: couche?.oxydo_reduction || '',
        eau_porosite: couche?.eau_porosite || '',
        horizon: couche?.horizon || '',
        determination: couche?.determination || '',
        geologie: couche?.geologie || '',
        description_libre: couche?.description_libre || '',
    }
}

function toPointPayload(form) {
    return {
        point_code: form.point_code || '',
        point_type: form.point_type || 'SONDAGE_PELLE',
        localisation: form.localisation || '',
        profil: form.profil || '',
        date_point: form.date_point || '',
        operateur: form.operateur || '',
        profondeur_finale_m: parseNumber(form.profondeur_finale_m),
        tenue_fouilles: form.tenue_fouilles || '',
        venue_eau: form.venue_eau === '' ? null : form.venue_eau === 'Oui',
        niveau_nappe: form.niveau_nappe || '',
        arret_sondage: form.arret_sondage || '',
        ouvrage: form.ouvrage || '',
        notes: form.notes || '',
    }
}

function toCouchePayload(form) {
    return {
        z_haut: parseNumber(form.z_haut),
        z_bas: parseNumber(form.z_bas),
        texture_matrice: form.texture_matrice || '',
        proportion_matrice: form.proportion_matrice || '',
        elements_grossiers: form.elements_grossiers || '',
        granulo_elements: form.granulo_elements || '',
        forme_elements: form.forme_elements || '',
        petrographie: form.petrographie || '',
        structure: form.structure || '',
        matiere_organique: form.matiere_organique || '',
        couleur: form.couleur || '',
        odeur: form.odeur || '',
        consistance: form.consistance || '',
        cohesion: form.cohesion || '',
        oxydo_reduction: form.oxydo_reduction || '',
        eau_porosite: form.eau_porosite || '',
        horizon: form.horizon || '',
        determination: form.determination || '',
        geologie: form.geologie || '',
        description_libre: form.description_libre || '',
    }
}

function CoucheEditor({ form, onChange, onSave, onCancel, saving, submitLabel }) {
    return (
        <div className="rounded-lg border border-border bg-bg px-4 py-4">
            <div className="grid gap-3 md:grid-cols-2">
                <Field label="Profondeur haut (m)">
                    <Input value={form.z_haut} onChange={(event) => onChange('z_haut', event.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Profondeur bas (m)">
                    <Input value={form.z_bas} onChange={(event) => onChange('z_bas', event.target.value)} placeholder="0.80" />
                </Field>
                <Field label="Texture matrice">
                    <Select value={form.texture_matrice} onChange={(event) => onChange('texture_matrice', event.target.value)}>
                        {TEXTURE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Proportion matrice">
                    <Select value={form.proportion_matrice} onChange={(event) => onChange('proportion_matrice', event.target.value)}>
                        {PROPORTION_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Éléments grossiers">
                    <Input value={form.elements_grossiers} onChange={(event) => onChange('elements_grossiers', event.target.value)} placeholder="graviers, blocs..." />
                </Field>
                <Field label="Granulo éléments">
                    <Input value={form.granulo_elements} onChange={(event) => onChange('granulo_elements', event.target.value)} placeholder="mm Ø" />
                </Field>
                <Field label="Forme éléments">
                    <Select value={form.forme_elements} onChange={(event) => onChange('forme_elements', event.target.value)}>
                        {FORME_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Pétrographie">
                    <Input value={form.petrographie} onChange={(event) => onChange('petrographie', event.target.value)} placeholder="calcaire, granite..." />
                </Field>
                <Field label="Structure">
                    <Select value={form.structure} onChange={(event) => onChange('structure', event.target.value)}>
                        {STRUCTURE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Matière organique">
                    <Select value={form.matiere_organique} onChange={(event) => onChange('matiere_organique', event.target.value)}>
                        {ORGANIQUE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Couleur">
                    <Select value={form.couleur} onChange={(event) => onChange('couleur', event.target.value)}>
                        {COULEUR_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Odeur">
                    <Select value={form.odeur} onChange={(event) => onChange('odeur', event.target.value)}>
                        {ODEUR_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Consistance">
                    <Select value={form.consistance} onChange={(event) => onChange('consistance', event.target.value)}>
                        {CONSISTANCE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Cohésion">
                    <Input value={form.cohesion} onChange={(event) => onChange('cohesion', event.target.value)} />
                </Field>
                <Field label="Oxydo-réduction">
                    <Input value={form.oxydo_reduction} onChange={(event) => onChange('oxydo_reduction', event.target.value)} />
                </Field>
                <Field label="Eau / porosité">
                    <Input value={form.eau_porosite} onChange={(event) => onChange('eau_porosite', event.target.value)} />
                </Field>
                <Field label="Horizon">
                    <Input value={form.horizon} onChange={(event) => onChange('horizon', event.target.value)} />
                </Field>
                <Field label="Détermination">
                    <Input value={form.determination} onChange={(event) => onChange('determination', event.target.value)} />
                </Field>
                <Field label="Géologie">
                    <Input value={form.geologie} onChange={(event) => onChange('geologie', event.target.value)} />
                </Field>
                <Field label="Description libre" full>
                    <Textarea value={form.description_libre} onChange={(value) => onChange('description_libre', value)} rows={3} />
                </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={onSave} disabled={saving}>{saving ? '…' : submitLabel}</Button>
                <Button variant="secondary" onClick={onCancel}>Annuler</Button>
            </div>
        </div>
    )
}

function renderChainLabo(prelevements, detailReturnTo, navigate) {
    if (!Array.isArray(prelevements) || !prelevements.length) {
        return <div className="text-[13px] text-text-muted">Aucune suite laboratoire générée depuis ce sondage.</div>
    }

    return (
        <div className="flex flex-col gap-3">
            {prelevements.map((prelevement) => (
                <div key={prelevement.uid} className="rounded-lg border border-border bg-bg px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" onClick={() => navigateWithReturnTo(navigate, `/prelevements/${prelevement.uid}`, detailReturnTo)} className="text-[13px] font-semibold text-accent hover:underline">
                            {prelevement.reference}
                        </button>
                        <div className="text-[11px] text-text-muted">{formatDate(prelevement.date_prelevement) || '—'}</div>
                    </div>
                    <div className="mt-1 text-[12px] text-text-muted">{prelevement.description || prelevement.materiau || prelevement.zone || 'Prélèvement'}</div>
                    {Array.isArray(prelevement.echantillons) && prelevement.echantillons.length > 0 ? (
                        <div className="mt-3 ml-4 flex flex-col gap-2 border-l border-border pl-3">
                            {prelevement.echantillons.map((echantillon) => (
                                <div key={echantillon.uid} className="rounded-lg border border-border bg-surface px-3 py-2">
                                    <button type="button" onClick={() => navigateWithReturnTo(navigate, `/echantillons/${echantillon.uid}`, detailReturnTo)} className="text-[12px] font-semibold text-accent hover:underline">
                                        {echantillon.reference}
                                    </button>
                                    <div className="mt-1 text-[11px] text-text-muted">{echantillon.designation || echantillon.localisation || 'Échantillon'}</div>
                                    {Array.isArray(echantillon.essais) && echantillon.essais.length > 0 ? (
                                        <div className="mt-2 ml-4 flex flex-col gap-1 border-l border-border pl-3">
                                            {echantillon.essais.map((essai) => (
                                                <button key={essai.uid} type="button" onClick={() => navigateWithReturnTo(navigate, `/essais/${essai.uid}`, detailReturnTo)} className="text-left text-[11px] text-accent hover:underline">
                                                    {(essai.essai_code || essai.type_essai || 'Essai')} · {essai.type_essai || ''}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ))}
        </div>
    )
}

function PointDetailView({ data, point, detailReturnTo, navigate, pointEditing, setPointEditing, pointForm, setPointField, handleSavePoint, updatePointPending, addingCouche, setAddingCouche, editingCoucheId, setEditingCoucheId, coucheForm, setCoucheField, handleCreateCouche, createCouchePending, handleUpdateCouche, updateCouchePending, handleDeleteCouche, deleteCouchePending, onBackToCoupe }) {
    const linkedPointPrelevements = Array.isArray(point?.prelevements) ? point.prelevements : []
    const couches = Array.isArray(point?.couches) ? point.couches : []
    const pointPrelevementIds = new Set(linkedPointPrelevements.map((item) => item.uid))
    const chainPrelevements = (Array.isArray(data?.prelevements) ? data.prelevements : []).filter((item) => {
        if (item?.point_terrain_id && Number(item.point_terrain_id) === Number(point.uid)) return true
        return pointPrelevementIds.has(item.uid)
    })

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#d8e6e1] bg-[#f6fbf9] px-4 py-3">
                <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Sondage</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">{point.point_code || `Point ${point.uid}`}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                        {buildPointSummary(point) || data.label || 'Fiche de description géotechnique'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                        {data.reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Coupe {data.reference}</span> : null}
                        {point.point_type ? <span className="rounded-full border border-border bg-bg px-3 py-1">{point.point_type}</span> : null}
                        {point.profondeur_finale_m || point.profondeur_bas ? <span className="rounded-full border border-border bg-bg px-3 py-1">Prof. finale {formatDepth(point.profondeur_finale_m || point.profondeur_bas)}</span> : null}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={onBackToCoupe}>Retour à la coupe</Button>
                    {!pointEditing ? (
                        <Button variant="primary" onClick={() => setPointEditing(true)}>Modifier</Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={() => setPointEditing(false)}>Annuler</Button>
                            <Button variant="primary" onClick={handleSavePoint} disabled={updatePointPending}>{updatePointPending ? '…' : 'Enregistrer'}</Button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Identification du point">
                    {pointEditing ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Point"><Input value={pointForm.point_code} onChange={(event) => setPointField('point_code', event.target.value)} /></Field>
                            <Field label="Type"><Input value={pointForm.point_type} onChange={(event) => setPointField('point_type', event.target.value)} /></Field>
                            <Field label="Localisation"><Input value={pointForm.localisation} onChange={(event) => setPointField('localisation', event.target.value)} /></Field>
                            <Field label="Profil / PK"><Input value={pointForm.profil} onChange={(event) => setPointField('profil', event.target.value)} /></Field>
                            <Field label="Date"><Input type="date" value={pointForm.date_point} onChange={(event) => setPointField('date_point', event.target.value)} /></Field>
                            <Field label="Opérateur"><Input value={pointForm.operateur} onChange={(event) => setPointField('operateur', event.target.value)} /></Field>
                            <Field label="Profondeur finale (m)"><Input value={pointForm.profondeur_finale_m} onChange={(event) => setPointField('profondeur_finale_m', event.target.value)} /></Field>
                            <Field label="Venue d’eau">
                                <Select value={pointForm.venue_eau} onChange={(event) => setPointField('venue_eau', event.target.value)}>
                                    <option value="">—</option>
                                    <option value="Oui">Oui</option>
                                    <option value="Non">Non</option>
                                </Select>
                            </Field>
                            <Field label="Tenue des fouilles"><Input value={pointForm.tenue_fouilles} onChange={(event) => setPointField('tenue_fouilles', event.target.value)} /></Field>
                            <Field label="Niveau nappe"><Input value={pointForm.niveau_nappe} onChange={(event) => setPointField('niveau_nappe', event.target.value)} /></Field>
                            <Field label="Arrêt de sondage"><Input value={pointForm.arret_sondage} onChange={(event) => setPointField('arret_sondage', event.target.value)} /></Field>
                            <Field label="Ouvrage"><Input value={pointForm.ouvrage} onChange={(event) => setPointField('ouvrage', event.target.value)} /></Field>
                            <Field label="Notes" full><Textarea value={pointForm.notes} onChange={(value) => setPointField('notes', value)} rows={3} /></Field>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Row label="Point" value={point.point_code || point.reference} />
                            <Row label="Type" value={point.point_type} />
                            <Row label="Localisation" value={point.localisation || point.position_label} />
                            <Row label="Profil" value={point.profil} />
                            <Row label="Date" value={formatDate(point.date_point || point.payload?.date_point || point.payload?.date_sondage || data.date_feuille)} />
                            <Row label="Opérateur" value={point.operateur || point.payload?.operateur || data.operateur} />
                            <Row label="Profondeur finale" value={formatDepth(point.profondeur_finale_m || point.profondeur_bas)} />
                            <Row label="Tenue des fouilles" value={point.tenue_fouilles || point.payload?.tenue_fouilles} />
                            <Row label="Venue d’eau" value={point.venue_eau == null ? '' : (point.venue_eau ? 'Oui' : 'Non')} />
                            <Row label="Niveau nappe" value={point.niveau_nappe || point.payload?.niveau_nappe} />
                            <Row label="Arrêt de sondage" value={point.arret_sondage || point.payload?.arret_sondage} />
                            <Row label="Ouvrage" value={point.ouvrage || point.type_ouvrage || point.payload?.ouvrage} />
                        </div>
                    )}
                </Card>

                <Card title="Prélèvements du point" right={<span className="text-[11px] text-text-muted">{linkedPointPrelevements.length} prél.</span>}>
                    {linkedPointPrelevements.length ? (
                        <div className="flex flex-col gap-2">
                            {linkedPointPrelevements.map((prelevement) => (
                                <button
                                    key={prelevement.uid}
                                    type="button"
                                    onClick={() => navigateWithReturnTo(navigate, `/prelevements/${prelevement.uid}`, detailReturnTo)}
                                    className="rounded-lg border border-border bg-bg px-3 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-[12px] font-semibold text-accent">{prelevement.reference}</div>
                                        <div className="text-[11px] text-text-muted">{prelevement.echantillon_count || 0} éch. · {prelevement.essai_count || 0} essais</div>
                                    </div>
                                    <div className="mt-1 text-[11px] text-text-muted">{prelevement.description || prelevement.materiau || prelevement.zone || 'Prélèvement lié au point'}</div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-[13px] text-text-muted">Aucun prélèvement n’est encore rattaché à ce point de sondage.</div>
                    )}
                </Card>
            </div>

            <Card title="Description géotechnique par couches" right={<span className="text-[11px] text-text-muted">{couches.length} couche(s)</span>}>
                <div className="flex flex-wrap gap-2 mb-4">
                    {!addingCouche ? (
                        <Button variant="primary" onClick={() => { setAddingCouche(true); setEditingCoucheId(null); setCoucheField('__reset__', buildCoucheForm()) }}>Ajouter une couche</Button>
                    ) : null}
                </div>

                {addingCouche ? (
                    <div className="mb-4">
                        <CoucheEditor
                            form={coucheForm}
                            onChange={setCoucheField}
                            onSave={handleCreateCouche}
                            onCancel={() => { setAddingCouche(false); setCoucheField('__reset__', buildCoucheForm()) }}
                            saving={createCouchePending}
                            submitLabel="Créer la couche"
                        />
                    </div>
                ) : null}

                {couches.length ? (
                    <div className="flex flex-col gap-3">
                        {couches.map((couche, index) => {
                            const linkedPrelevements = Array.isArray(couche.prelevements) ? couche.prelevements : []
                            const isEditing = editingCoucheId === couche.uid
                            return (
                                <div key={couche.uid || `${couche.z_haut}-${couche.z_bas}-${index}`} className="rounded-2xl border border-border bg-white px-4 py-4">
                                    {isEditing ? (
                                        <CoucheEditor
                                            form={coucheForm}
                                            onChange={setCoucheField}
                                            onSave={() => handleUpdateCouche(couche.uid)}
                                            onCancel={() => { setEditingCoucheId(null); setCoucheField('__reset__', buildCoucheForm()) }}
                                            saving={updateCouchePending}
                                            submitLabel="Enregistrer la couche"
                                        />
                                    ) : (
                                        <>
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-text">{[couche.horizon, couche.determination].filter(Boolean).join(' · ') || `Couche ${index + 1}`}</div>
                                                    <div className="mt-1 text-[11px] text-text-muted">{[formatDepth(couche.z_haut), formatDepth(couche.z_bas)].filter(Boolean).join(' → ') || 'Profondeur à préciser'}</div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button variant="secondary" size="sm" onClick={() => { setEditingCoucheId(couche.uid); setAddingCouche(false); setCoucheField('__reset__', buildCoucheForm(couche)) }}>Modifier</Button>
                                                    <Button variant="danger" size="sm" onClick={() => handleDeleteCouche(couche.uid)} disabled={deleteCouchePending}>Supprimer</Button>
                                                </div>
                                            </div>
                                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                                <Row label="Texture matrice" value={couche.texture_matrice} />
                                                <Row label="Proportion matrice" value={couche.proportion_matrice} />
                                                <Row label="Éléments grossiers" value={couche.elements_grossiers} />
                                                <Row label="Granulo éléments" value={couche.granulo_elements} />
                                                <Row label="Forme éléments" value={couche.forme_elements} />
                                                <Row label="Pétrographie" value={couche.petrographie} />
                                                <Row label="Structure" value={couche.structure} />
                                                <Row label="Matière organique" value={couche.matiere_organique} />
                                                <Row label="Couleur" value={couche.couleur} />
                                                <Row label="Odeur" value={couche.odeur} />
                                                <Row label="Consistance" value={couche.consistance} />
                                                <Row label="Cohésion" value={couche.cohesion} />
                                                <Row label="Oxydo-réduction" value={couche.oxydo_reduction} />
                                                <Row label="Eau / porosité" value={couche.eau_porosite} />
                                                <Row label="Horizon" value={couche.horizon} />
                                                <Row label="Détermination" value={couche.determination} />
                                                <Row label="Géologie" value={couche.geologie} />
                                                <div className="md:col-span-2 xl:col-span-3"><Row label="Description libre" value={couche.description_libre} /></div>
                                            </div>
                                            <div className="mt-4 rounded-xl border border-border bg-bg px-3 py-3">
                                                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Prélèvements liés à la couche</div>
                                                {linkedPrelevements.length ? (
                                                    <div className="mt-3 flex flex-col gap-2">
                                                        {linkedPrelevements.map((prelevement) => (
                                                            <button
                                                                key={prelevement.uid}
                                                                type="button"
                                                                onClick={() => navigateWithReturnTo(navigate, `/prelevements/${prelevement.uid}`, detailReturnTo)}
                                                                className="rounded-lg border border-border bg-white px-3 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
                                                            >
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <div className="text-[12px] font-semibold text-accent">{prelevement.reference}</div>
                                                                    <div className="text-[11px] text-text-muted">{prelevement.statut || '—'}</div>
                                                                </div>
                                                                <div className="mt-1 text-[11px] text-text-muted">{[prelevement.description || prelevement.materiau || '', formatDate(prelevement.date_prelevement) || ''].filter(Boolean).join(' · ') || 'Prélèvement lié à cette couche'}</div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 text-[12px] text-text-muted">Aucun prélèvement n’est encore rattaché à cette couche.</div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">Aucune couche n’est encore décrite pour ce sondage.</div>
                )}
            </Card>

            <Card title="Chaîne labo générée">
                {renderChainLabo(chainPrelevements, detailReturnTo, navigate)}
            </Card>

            <Card title="Rapports liés">
                {Array.isArray(data.rapports) && data.rapports.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {data.rapports.map((rapport) => (
                            <div key={rapport.uid} className="rounded-lg border border-border bg-bg px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-[12px] font-semibold text-text">{rapport.reference}</div>
                                    <div className="text-[11px] text-text-muted">{formatDate(rapport.date_rapport) || '—'}</div>
                                </div>
                                <div className="mt-1 text-[12px] text-text-muted">{rapport.titre || rapport.type_rapport || 'Rapport'}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-[13px] text-text-muted">Aucun rapport lié.</div>
                )}
            </Card>
        </div>
    )
}

function renderGenericView({ data, navigate, detailReturnTo }) {
    const prelevements = Array.isArray(data?.prelevements) ? data.prelevements : []
    const echantillons = prelevements.flatMap((item) => item.echantillons || [])
    const essais = echantillons.flatMap((item) => item.essais || [])
    const chaineLaboSummary = {
        prelevements: prelevements.length,
        echantillons: echantillons.length,
        essais: essais.length,
    }
    const points = Array.isArray(data?.points) ? data.points : []

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Cadre">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Code feuille" value={data.code_feuille} />
                        <Row label="Libellé" value={data.label} />
                        <Row label="Norme" value={data.norme} />
                        <Row label="Date feuille" value={formatDate(data.date_feuille)} />
                        <Row label="Opérateur" value={data.operateur} />
                        <Row label="Statut" value={data.statut} />
                    </div>
                </Card>
                <Card title="Synthèse">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Résultat principal" value={formatResult(data.resultat_principal, data.resultat_unite)} />
                        <Row label="Libellé résultat" value={data.resultat_label} />
                        <Row label="Série" value={data.payload?.serie_reference || data.serie_id} />
                        <Row label="Chaîne labo" value={`${chaineLaboSummary.prelevements} prél. · ${chaineLaboSummary.echantillons} éch. · ${chaineLaboSummary.essais} essais`} />
                    </div>
                    <div className="mt-4 text-sm whitespace-pre-wrap text-text-muted">{data.observations || '—'}</div>
                </Card>
            </div>

            <Card title="Points / observations terrain">
                {points.length ? (
                    <div className="text-[13px] text-text-muted">{`${points.length} point(s) disponibles.`}</div>
                ) : (
                    <div className="text-[13px] text-text-muted">Aucun point détaillé dans cette feuille terrain.</div>
                )}
            </Card>
        </>
    )
}

export default function FeuilleTerrainPage() {
    const { uid } = useParams()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const queryClient = useQueryClient()
    const detailReturnTo = buildLocationTarget({ pathname: `/feuilles-terrain/${uid}`, search: searchParams.toString() ? `?${searchParams.toString()}` : '' })
    const pointParam = searchParams.get('point')

    const [pointEditing, setPointEditing] = useState(false)
    const [pointForm, setPointForm] = useState(buildPointForm())
    const [editingCoucheId, setEditingCoucheId] = useState(null)
    const [coucheForm, setCoucheFormState] = useState(buildCoucheForm())
    const [addingCouche, setAddingCouche] = useState(false)

    const { data, isLoading, error } = useQuery({
        queryKey: ['feuille-terrain', uid],
        queryFn: () => feuillesTerrainApi.get(uid),
        enabled: Boolean(uid),
    })

    const isSondageSheet = ['SO', 'SC'].includes(String(data?.code_feuille || '').toUpperCase())
    const points = useMemo(() => Array.isArray(data?.points) ? data.points : [], [data?.points])
    const selectedPoint = useMemo(
        () => points.find((item) => String(item.uid) === String(pointParam)) || null,
        [points, pointParam]
    )

    useEffect(() => {
        if (!selectedPoint) {
            setPointForm(buildPointForm())
            setPointEditing(false)
            setEditingCoucheId(null)
            setCoucheFormState(buildCoucheForm())
            setAddingCouche(false)
            return
        }
        setPointForm(buildPointForm(selectedPoint))
        setPointEditing(searchParams.get('edit') === '1')
        setEditingCoucheId(null)
        setCoucheFormState(buildCoucheForm())
        setAddingCouche(false)
    }, [selectedPoint, searchParams])

    function setCoucheField(key, value) {
        if (key === '__reset__') {
            setCoucheFormState(value)
            return
        }
        setCoucheFormState((current) => ({ ...current, [key]: value }))
    }

    function setPointField(key, value) {
        setPointForm((current) => ({ ...current, [key]: value }))
    }

    const createPointMutation = useMutation({
        mutationFn: (payload) => feuillesTerrainApi.createPoint(uid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
            const nextPoint = Array.isArray(saved?.points) ? saved.points[saved.points.length - 1] : null
            if (nextPoint?.uid) {
                navigate(`/feuilles-terrain/${uid}?point=${nextPoint.uid}&edit=1`)
            }
        },
    })

    const updatePointMutation = useMutation({
        mutationFn: (payload) => feuillesTerrainApi.updatePoint(uid, selectedPoint.uid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
            setPointEditing(false)
            navigate(`/feuilles-terrain/${uid}?point=${selectedPoint.uid}`)
        },
    })

    const createCoucheMutation = useMutation({
        mutationFn: (payload) => feuillesTerrainApi.createCouche(uid, selectedPoint.uid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
            setAddingCouche(false)
            setCoucheFormState(buildCoucheForm())
        },
    })

    const updateCoucheMutation = useMutation({
        mutationFn: ({ coucheUid, payload }) => feuillesTerrainApi.updateCouche(uid, selectedPoint.uid, coucheUid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
            setEditingCoucheId(null)
            setCoucheFormState(buildCoucheForm())
        },
    })

    const deleteCoucheMutation = useMutation({
        mutationFn: (coucheUid) => feuillesTerrainApi.deleteCouche(uid, selectedPoint.uid, coucheUid),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feuille-terrain', uid] })
        },
    })

    function startCreatePoint() {
        createPointMutation.mutate(toPointPayload(buildPointForm({ point_type: 'SONDAGE_PELLE' })))
    }

    function handleSavePoint() {
        if (!selectedPoint) return
        updatePointMutation.mutate(toPointPayload(pointForm))
    }

    function handleCreateCouche() {
        if (!selectedPoint) return
        createCoucheMutation.mutate(toCouchePayload(coucheForm))
    }

    function handleUpdateCouche(coucheUid) {
        updateCoucheMutation.mutate({ coucheUid, payload: toCouchePayload(coucheForm) })
    }

    function handleDeleteCouche(coucheUid) {
        if (!window.confirm('Supprimer cette couche ?')) return
        deleteCoucheMutation.mutate(coucheUid)
    }

    function openPoint(pointUid, edit = false) {
        navigate(`/feuilles-terrain/${uid}?point=${pointUid}${edit ? '&edit=1' : ''}`)
    }

    function closePoint() {
        navigate(`/feuilles-terrain/${uid}`)
    }

    if (isLoading) {
        return <div className="py-12 text-center text-sm text-text-muted">Chargement de la feuille terrain…</div>
    }

    if (error || !data) {
        return (
            <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
                    Impossible de charger cette feuille terrain.
                </div>
                <div>
                    <Button variant="secondary" onClick={() => navigateBackWithFallback(navigate, searchParams, '/demandes')}>Retour</Button>
                </div>
            </div>
        )
    }

    if (isSondageSheet && selectedPoint) {
        return (
            <PointDetailView
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
                onBackToCoupe={closePoint}
            />
        )
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{isSondageSheet ? 'Coupe de sondage' : 'Feuille terrain'}</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">{data.reference}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                        {data.label || data.code_feuille || 'Feuille terrain'} · {data.intervention_subject || data.type_intervention || 'Intervention terrain'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                        {data.demande_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Demande {data.demande_reference}</span> : null}
                        {data.campagne_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Campagne {data.campagne_reference}</span> : null}
                        {data.intervention_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Intervention {data.intervention_reference}</span> : null}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => navigateBackWithFallback(navigate, searchParams, '/demandes')}>Retour</Button>
                    {data.demande_id ? <Button variant="secondary" onClick={() => navigate(`/demandes/${data.demande_id}`)}>Ouvrir la demande</Button> : null}
                    {data.intervention_id ? <Button variant="secondary" onClick={() => navigate(`/interventions/${data.intervention_id}`)}>Ouvrir l’intervention</Button> : null}
                </div>
            </div>

            {isSondageSheet ? (
                <Card title="Sondages de la coupe" right={<span className="text-[11px] text-text-muted">{points.length} point(s)</span>}>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="text-[13px] text-text-muted">La coupe liste les sondages du puits / de la tranchée. Clique sur une ligne pour ouvrir la fiche du sondage.</div>
                        <Button variant="primary" onClick={startCreatePoint} disabled={createPointMutation.isPending}>{createPointMutation.isPending ? 'Création…' : 'Créer un sondage'}</Button>
                    </div>
                    {points.length ? (
                        <div className="flex flex-col gap-3">
                            {points.map((point) => (
                                <button key={point.uid || point.point_code} type="button" onClick={() => openPoint(point.uid)} className="rounded-lg border border-border bg-bg px-4 py-4 text-left hover:border-[#d8e6e1] hover:bg-[#f8fbfa] transition">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="text-[14px] font-semibold text-text">{point.point_code}</div>
                                            <div className="mt-1 text-[12px] text-text-muted">{[point.localisation, point.point_type].filter(Boolean).join(' · ') || 'Sondage'}</div>
                                        </div>
                                        <div className="text-right text-[11px] text-text-muted">
                                            <div>{formatMetric(point.profondeur_finale_m)}</div>
                                            <div>{point.couches?.length || 0} couche(s) · {point.prelevements?.length || 0} prél.</div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">Aucun sondage n’est encore enregistré dans cette coupe.</div>
                    )}
                </Card>
            ) : renderGenericView({ data, navigate, detailReturnTo })}
        </div>
    )
}

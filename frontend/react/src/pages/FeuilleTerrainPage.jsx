import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { navigateBackWithFallback, navigateWithReturnTo, buildLocationTarget } from '@/lib/detailNavigation'
import { feuillesTerrainApi } from '@/services/api'
import { formatDate } from '@/lib/utils'

const TEXTURE_OPTIONS = ['', 'argileux', 'argilo-limoneux', 'argilo-sableux', 'limono-argilo-sableux', 'limoneux', 'limono-argileux', 'limono-sableux', 'sableux', 'sablo-limoneux']
const PROPORTION_OPTIONS = ['', '0-25 %', '25-50 %', '50-75 %', '75-90 %', '100 %']
const ELEMENTS_OPTIONS = ['', 'autres', 'blocs', 'sphérique', 'allongé', 'aplati', 'anguleux', 'sub anguleux', 'sub arrondi', 'arrondi']
const PETROGRAPHIE_OPTIONS = ['', 'polygénique', 'cristallin', 'détritique', 'volcanique', 'calcaire', 'granite', 'gneiss', 'schistes', 'grès', 'quartzite', 'craie', 'tuf']
const STRUCTURE_OPTIONS = ['', 'compacte', 'grumeleuse', 'poudreuse', 'pulvérulent']
const ORGANIQUE_OPTIONS = ['', 'beaucoup', 'moyen', 'peu', 'pas']
const COULEUR_OPTIONS = ['', 'blanc', 'gris', 'jaune', 'rose', 'brun', 'rouge', 'olive', 'noir', 'vif', 'pâle', 'clair', 'foncé', 'très sombre']
const ODEUR_OPTIONS = ['', 'pas', 'faible', 'humus', 'réductrice', 'hydrocarbures', 'fort']
const CONSISTANCE_OPTIONS = ['', 'très molle (déforme sous propre poids)', 'molle (écrasé entre doigts)', 'moyenne (enfonce le pouce)', 'ferme (enfonce pouce en forçant)', 'dure (pouce = faible marque)', 'très dure (pouce aucune marque)']
const COHESION_OPTIONS = ['', 'pas', 'peu', 'moyen', 'très']
const OXYDO_OPTIONS = ['', 'oxydé', 'réduit', 'zone temp.']
const EAU_OPTIONS = ['', 'humide', "venues d'eau: niveau stabilisé"]
const HORIZON_OPTIONS = ['', 'terre végétale', 'remblai', 'sous couche ou transition', 'colluvions', 'éboulis', 'alluvions', 'dépôts tourbe', 'moraine']

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

function PageHeaderBar({ backLabel, onBack, title, subtitle, actions }) {
    return (
        <div className="flex items-center gap-2 px-6 bg-surface border-b border-border min-h-[58px] shrink-0 sticky top-0 z-10 flex-wrap">
            <button
                type="button"
                onClick={onBack}
                className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
            >
                {backLabel}
            </button>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-text">{title}</div>
                {subtitle ? <div className="truncate text-[11px] text-text-muted">{subtitle}</div> : null}
            </div>
            {actions}
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
        profondeur_eau: couche?.profondeur_eau ?? '',
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
        profondeur_eau: parseNumber(form.profondeur_eau),
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
                    <Select value={form.elements_grossiers} onChange={(event) => onChange('elements_grossiers', event.target.value)}>
                        {ELEMENTS_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Granulo éléments (mm Ø)">
                    <Input value={form.granulo_elements} onChange={(event) => onChange('granulo_elements', event.target.value)} placeholder="ex: 10-30" />
                </Field>
                <Field label="Pétrographie">
                    <Select value={form.petrographie} onChange={(event) => onChange('petrographie', event.target.value)}>
                        {PETROGRAPHIE_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
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
                    <Select value={form.cohesion} onChange={(event) => onChange('cohesion', event.target.value)}>
                        {COHESION_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Oxydo-réduction">
                    <Select value={form.oxydo_reduction} onChange={(event) => onChange('oxydo_reduction', event.target.value)}>
                        {OXYDO_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Eau / porosité">
                    <Select value={form.eau_porosite} onChange={(event) => onChange('eau_porosite', event.target.value)}>
                        {EAU_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="∇ Profondeur eau (m)">
                    <Input value={form.profondeur_eau ?? ''} onChange={(event) => onChange('profondeur_eau', event.target.value)} placeholder="ex: 1.20" />
                </Field>
                <Field label="Horizon / Détermination">
                    <Select value={form.horizon} onChange={(event) => onChange('horizon', event.target.value)}>
                        {HORIZON_OPTIONS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}
                    </Select>
                </Field>
                <Field label="Détermination libre">
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


// ── Hachures par texture ───────────────────────────────────────────────────────
const TEXTURE_PATTERNS = {
    'argileux':              { fill: '#d4a8a8', hatch: 'argile' },
    'argilo-limoneux':       { fill: '#c8b8c0', hatch: 'argile' },
    'argilo-sableux':        { fill: '#c8b89a', hatch: 'argilo-sableux' },
    'limono-argilo-sableux': { fill: '#c8c0a0', hatch: 'limon' },
    'limoneux':              { fill: '#d4c88a', hatch: 'limon' },
    'limono-argileux':       { fill: '#ccbf90', hatch: 'limon' },
    'limono-sableux':        { fill: '#d4c878', hatch: 'sableux' },
    'sableux':               { fill: '#f0e0a0', hatch: 'sableux' },
    'sablo-limoneux':        { fill: '#e8d890', hatch: 'sableux' },
}

function CoupeSVG({ point, couches, prelevements }) {
    const W = 120
    const SCALE = 80   // px per metre
    const TOP_MARGIN = 30
    const BOTTOM_MARGIN = 20
    const LEFT_SCALE = 30
    const BAR_W = 60
    const LABEL_X = LEFT_SCALE + BAR_W + 4

    const profMax = Math.max(
        ...[
            Number(point?.profondeur_finale_m ?? point?.profondeur_bas ?? 0),
            ...couches.map(c => Number(c.z_bas ?? 0))
        ].filter(n => !isNaN(n) && n > 0),
        1
    )

    const toY = (depth) => TOP_MARGIN + (Number(depth) / profMax) * (SCALE * profMax)
    const totalH = TOP_MARGIN + SCALE * profMax + BOTTOM_MARGIN

    // Niveau nappe
    const niveauNappe = point?.niveau_nappe ? parseFloat(point.niveau_nappe) : null

    return (
        <svg
            width={W}
            height={totalH}
            style={{ flexShrink: 0, borderRight: '1px solid #e5e7eb', marginRight: 4 }}
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                {/* argile: hachures croisées serrées */}
                <pattern id="p-argile" patternUnits="userSpaceOnUse" width="6" height="6">
                    <line x1="0" y1="6" x2="6" y2="0" stroke="#9b7b7b" strokeWidth="0.7"/>
                    <line x1="-1" y1="1" x2="1" y2="-1" stroke="#9b7b7b" strokeWidth="0.7"/>
                    <line x1="5" y1="7" x2="7" y2="5" stroke="#9b7b7b" strokeWidth="0.7"/>
                </pattern>
                {/* limon: pointillés */}
                <pattern id="p-limon" patternUnits="userSpaceOnUse" width="6" height="6">
                    <circle cx="1.5" cy="1.5" r="0.8" fill="#8a7a50"/>
                    <circle cx="4.5" cy="4.5" r="0.8" fill="#8a7a50"/>
                </pattern>
                {/* sableux: petits grains */}
                <pattern id="p-sableux" patternUnits="userSpaceOnUse" width="8" height="8">
                    <circle cx="2" cy="2" r="1.2" fill="#c8a830"/>
                    <circle cx="6" cy="6" r="1.2" fill="#c8a830"/>
                    <circle cx="6" cy="2" r="0.8" fill="#d4b840"/>
                </pattern>
                {/* argilo-sableux: hachures + grains */}
                <pattern id="p-argilo-sableux" patternUnits="userSpaceOnUse" width="8" height="8">
                    <line x1="0" y1="8" x2="8" y2="0" stroke="#9b7b5b" strokeWidth="0.8"/>
                    <circle cx="4" cy="4" r="0.8" fill="#c8a830"/>
                </pattern>
            </defs>

            {/* Axe de profondeur */}
            <line x1={LEFT_SCALE} y1={TOP_MARGIN} x2={LEFT_SCALE} y2={TOP_MARGIN + SCALE * profMax} stroke="#374151" strokeWidth="1.5"/>

            {/* Couches */}
            {couches.map((c, i) => {
                const y1 = toY(c.z_haut ?? 0)
                const y2 = toY(c.z_bas ?? 0)
                const h = Math.max(y2 - y1, 2)
                const tex = String(c.texture_matrice || '').toLowerCase()
                const cfg = TEXTURE_PATTERNS[tex] || { fill: '#e8e8e0', hatch: null }
                const patId = cfg.hatch ? `p-${cfg.hatch}` : null
                return (
                    <g key={c.uid ?? i}>
                        <rect x={LEFT_SCALE} y={y1} width={BAR_W} height={h} fill={cfg.fill} stroke="#374151" strokeWidth="0.5"/>
                        {patId && <rect x={LEFT_SCALE} y={y1} width={BAR_W} height={h} fill={`url(#${patId})`} opacity="0.6"/>}
                        {/* profondeur haut si première couche */}
                        {i === 0 && <text x={LEFT_SCALE - 3} y={y1 + 3} textAnchor="end" fontSize="8" fill="#374151">{c.z_haut ?? 0}</text>}
                        <text x={LEFT_SCALE - 3} y={y2 + 3} textAnchor="end" fontSize="8" fill="#374151">{c.z_bas ?? ''}</text>
                        {/* trait de séparation */}
                        <line x1={LEFT_SCALE} y1={y2} x2={LEFT_SCALE + BAR_W} y2={y2} stroke="#374151" strokeWidth="0.8" strokeDasharray="3,2"/>
                    </g>
                )
            })}

            {/* Niveaux d'eau par couche */}
            {couches.filter(c => c.profondeur_eau != null && c.profondeur_eau !== '' && Number(c.profondeur_eau) > 0).map((c, i) => {
                const depth = Number(c.profondeur_eau)
                if (depth > profMax) return null
                const y = toY(depth)
                return (
                    <g key={`eau-${i}`}>
                        <line x1={LEFT_SCALE - 4} y1={y} x2={LEFT_SCALE + BAR_W + 4} y2={y} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2"/>
                        <text x={LEFT_SCALE + BAR_W + 6} y={y + 3} fontSize="8" fill="#3b82f6">∇ {depth}m</text>
                    </g>
                )
            })}
            {/* Niveau nappe du point (fallback) */}
            {niveauNappe != null && niveauNappe > 0 && niveauNappe <= profMax && couches.every(c => !c.profondeur_eau) && (
                <g>
                    <line x1={LEFT_SCALE - 4} y1={toY(niveauNappe)} x2={LEFT_SCALE + BAR_W + 4} y2={toY(niveauNappe)} stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2"/>
                    <text x={LEFT_SCALE + BAR_W + 6} y={toY(niveauNappe) + 3} fontSize="8" fill="#3b82f6">∇ {niveauNappe}m</text>
                </g>
            )}

            {/* Prélèvements */}
            {prelevements.filter(p => p.description && parseFloat(p.description) > 0).map((p, i) => {
                const depth = parseFloat(p.description)
                if (isNaN(depth) || depth > profMax) return null
                const y = toY(depth)
                return (
                    <g key={p.uid ?? i}>
                        <line x1={LEFT_SCALE + BAR_W} y1={y} x2={LEFT_SCALE + BAR_W + 8} y2={y} stroke="#f59e0b" strokeWidth="1.5"/>
                        <circle cx={LEFT_SCALE + BAR_W + 10} cy={y} r="3" fill="#f59e0b" stroke="#fff" strokeWidth="0.5"/>
                        <text x={LEFT_SCALE + BAR_W + 15} y={y + 3} fontSize="7" fill="#f59e0b">P</text>
                    </g>
                )
            })}

            {/* Label profondeur finale */}
            <text x={LEFT_SCALE - 3} y={TOP_MARGIN + SCALE * profMax + 10} textAnchor="end" fontSize="7" fill="#6b7280">({profMax}m)</text>
        </svg>
    )
}



// ── Nouvelle couche inline dans le tableau ─────────────────────────────────
function NewCoucheInlineRow({ newCoucheRow, setNewCoucheRow, getOptions, onSave, saving }) {
    const [form, setForm] = useState({
        z_haut: newCoucheRow?.z_haut ?? '',
        z_bas: newCoucheRow?.z_bas ?? '',
        texture_matrice: '', proportion_matrice: '', elements_grossiers: '',
        granulo_elements: '', petrographie: '', structure: '',
        matiere_organique: '', couleur: '', odeur: '', consistance: '',
        cohesion: '', oxydo_reduction: '', eau_porosite: '',
        profondeur_eau: '', horizon: '', description_libre: '',
    })

    function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

    const iStyle = 'text-[10px] border border-accent rounded px-1 py-0 bg-white w-full'
    const tdC = 'px-1 py-1 border-r border-border bg-[#f0f8ff]'

    function InlineSelect({ field, opts }) {
        const dlId = `new-dl-${field.replace(/_/g, '-')}`
        return (
            <>
                <input list={dlId} value={form[field]} onChange={e => set(field, e.target.value)} className={iStyle} />
                <datalist id={dlId}>{getOptions(field, opts).map(o => <option key={o} value={o} />)}</datalist>
            </>
        )
    }

    return (
        <tr className="border-b-2 border-accent bg-[#f0f8ff]">
            <td className={tdC}></td>
            <td className={tdC}>
                <div className="flex items-center gap-0.5">
                    <input value={form.z_haut} onChange={e => set('z_haut', e.target.value)} className="w-10 text-[10px] border border-accent rounded px-1 py-0 bg-white" placeholder="haut" />
                    <span className="text-[10px]">→</span>
                    <input value={form.z_bas} onChange={e => set('z_bas', e.target.value)} className="w-10 text-[10px] border border-accent rounded px-1 py-0 bg-white" placeholder="bas" />
                </div>
            </td>
            <td className={tdC}><InlineSelect field="texture_matrice" opts={TEXTURE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="proportion_matrice" opts={PROPORTION_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="elements_grossiers" opts={ELEMENTS_OPTIONS} /></td>
            <td className={tdC}><input value={form.granulo_elements} onChange={e => set('granulo_elements', e.target.value)} className={iStyle} placeholder="mm Ø" /></td>
            <td className={tdC}><InlineSelect field="petrographie" opts={PETROGRAPHIE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="structure" opts={STRUCTURE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="matiere_organique" opts={ORGANIQUE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="couleur" opts={COULEUR_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="odeur" opts={ODEUR_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="consistance" opts={CONSISTANCE_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="cohesion" opts={COHESION_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="oxydo_reduction" opts={OXYDO_OPTIONS} /></td>
            <td className={tdC}><InlineSelect field="eau_porosite" opts={EAU_OPTIONS} /></td>
            <td className={tdC}>
                <input value={form.profondeur_eau} onChange={e => set('profondeur_eau', e.target.value)} className={iStyle} placeholder="∇ m" />
                {form.profondeur_eau && form.z_haut && form.z_bas && (
                    Number(form.profondeur_eau) < Number(form.z_haut) || Number(form.profondeur_eau) > Number(form.z_bas)
                ) ? <span className="text-[9px] text-orange-500 block">hors couche</span> : null}
            </td>
            <td className={tdC}><InlineSelect field="horizon" opts={HORIZON_OPTIONS} /></td>
            <td className={tdC}></td>
            <td className={tdC}><input value={form.description_libre} onChange={e => set('description_libre', e.target.value)} className={iStyle} /></td>
            <td className="px-1 py-1 text-center bg-[#f0f8ff]">
                <div className="flex gap-1 justify-center">
                    <Button variant="primary" size="sm" onClick={() => onSave(form)} disabled={saving}>✓</Button>
                    <Button variant="secondary" size="sm" onClick={() => setNewCoucheRow(null)}>✕</Button>
                </div>
            </td>
        </tr>
    )
}

function buildCoucheOptionLabel(couche) {
    const interval = `${couche?.z_haut ?? '—'} → ${couche?.z_bas ?? '—'} m`
    const descriptor = couche?.texture_matrice || couche?.horizon || couche?.description_libre || ''
    return descriptor ? `${interval} · ${descriptor}` : interval
}

function PrelevementManagerItem({ prelevement, currentCoucheId, coucheOptions, detailReturnTo, navigate, disabled, onMove, onToggleIgnore, onDelete }) {
    const isIgnored = Boolean(prelevement?.ignore_sondage_couche_match)
    const depthLabel = formatDepth(parseNumber(prelevement?.description)) || prelevement?.description || 'Profondeur non renseignée'
    const summary = [depthLabel, prelevement?.quantite, prelevement?.statut].filter(Boolean).join(' · ')

    return (
        <div className="rounded-md border border-border bg-bg px-2 py-2">
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => navigateWithReturnTo(navigate, `/prelevements/${prelevement.uid}`, detailReturnTo)}
                    className="text-[10px] font-semibold text-accent hover:underline"
                >
                    {prelevement.reference}
                </button>
                {isIgnored ? <span className="text-[9px] font-medium uppercase tracking-wide text-orange-600">Ignoré</span> : null}
            </div>
            <div className="mt-1 text-[10px] text-text-muted">{summary || 'Prélèvement'}</div>
            <div className="mt-2 flex flex-wrap gap-1">
                <Select
                    value={currentCoucheId ? String(currentCoucheId) : ''}
                    onChange={(event) => {
                        const nextCoucheId = event.target.value
                        if (!nextCoucheId || Number(nextCoucheId) === Number(currentCoucheId)) return
                        onMove(prelevement.uid, Number(nextCoucheId))
                    }}
                    disabled={disabled}
                    className="min-w-[150px] px-2 py-1 text-[10px]"
                >
                    <option value="">{currentCoucheId ? 'Déplacer vers…' : 'Affecter à…'}</option>
                    {coucheOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </Select>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onToggleIgnore(prelevement.uid, !isIgnored)}
                    disabled={disabled}
                >
                    {isIgnored ? 'Auto' : 'Ign.'}
                </Button>
                <Button variant="danger" size="sm" onClick={() => onDelete(prelevement.uid)} disabled={disabled}>Suppr.</Button>
            </div>
        </div>
    )
}

function PointDetailView({ data, point, detailReturnTo, navigate, pointEditing, setPointEditing, pointForm, setPointField, handleSavePoint, updatePointPending, addingCouche, setAddingCouche, editingCoucheId, setEditingCoucheId, coucheForm, setCoucheField, handleCreateCouche, createCouchePending, handleUpdateCouche, updateCouchePending, handleDeleteCouche, deleteCouchePending, onBackToCoupe, prelevCoucheId, setPrelevCoucheId, prelevForm, setPrelevForm, createPrelevementPending, handleCreatePrelevement, updatePrelevementPending, handleUpdatePrelevement, handleDeletePrelevement, handleDeletePoint, deleteErrorMessage, editingCell, editingCellValue, setEditingCellValue, startEditCell, saveCellEdit, selectedCoucheRow, setSelectedCoucheRow, newCoucheRow, setNewCoucheRow, handleAddCouche, handleInsertCouche }) {
    const linkedPointPrelevements = Array.isArray(point?.prelevements) ? point.prelevements : []
    const couches = Array.isArray(point?.couches) ? point.couches : []
    const coucheOptions = couches.map((couche) => ({
        value: String(couche.uid),
        label: buildCoucheOptionLabel(couche),
    }))
    const horsCouchePrelevements = linkedPointPrelevements.filter((item) => item?.ignore_sondage_couche_match || !item?.sondage_couche_id)

    // Custom values — single query fetching all fields
    const { data: customValuesAll } = useQuery({
        queryKey: ['couche-custom-values-all'],
        queryFn: () => feuillesTerrainApi.getAllCustomValues(),
        staleTime: 30000,
    })
    function getOptions(field, baseOptions) {
        const custom = Array.isArray(customValuesAll?.[field]) ? customValuesAll[field].map(v => v.valeur) : []
        return [...new Set([...baseOptions, ...custom])].filter(Boolean)
    }
    const pointPrelevementIds = new Set(linkedPointPrelevements.map((item) => item.uid))
    const chainPrelevements = (Array.isArray(data?.prelevements) ? data.prelevements : []).filter((item) => {
        const hasEchantillons = (item?.echantillon_count ?? 0) > 0 || (Array.isArray(item?.echantillons) && item.echantillons.length > 0)
        if (!hasEchantillons) return false
        if (item?.point_terrain_id && Number(item.point_terrain_id) === Number(point.uid)) return true
        return pointPrelevementIds.has(item.uid)
    })

    return (
        <div className="flex flex-col h-full -m-6 overflow-y-auto">
            <PageHeaderBar
                backLabel="← Coupe"
                onBack={onBackToCoupe}
                title={point.point_code || point.reference || `Point ${point.uid}`}
                subtitle={[data.reference, buildPointSummary(point)].filter(Boolean).join(' · ')}
                actions={(
                    <div className="flex flex-wrap gap-2">
                        {data.demande_id ? <Button variant="secondary" size="sm" onClick={() => navigate(`/demandes/${data.demande_id}`)}>Demande</Button> : null}
                        {data.intervention_id ? <Button variant="secondary" size="sm" onClick={() => navigate(`/interventions/${data.intervention_id}`)}>Intervention</Button> : null}
                        {!pointEditing ? (
                            <Button variant="primary" size="sm" onClick={() => setPointEditing(true)}>Modifier</Button>
                        ) : (
                            <>
                                <Button variant="secondary" size="sm" onClick={() => setPointEditing(false)}>Annuler</Button>
                                <Button variant="primary" size="sm" onClick={handleSavePoint} disabled={updatePointPending}>Enregistrer</Button>
                            </>
                        )}
                    </div>
                )}
            />

            <div className="p-6 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
                {deleteErrorMessage ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {deleteErrorMessage}
                    </div>
                ) : null}

                <div className="rounded-lg border border-[#d8e6e1] bg-[#f6fbf9] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Sondage</p>
                    <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-text">{point.point_code || point.reference || `Point ${point.uid}`}</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
                        {buildPointSummary(point) || data.label || 'Fiche de description geotechnique'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                        {data.reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Coupe {data.reference}</span> : null}
                        {point.point_type ? <span className="rounded-full border border-border bg-bg px-3 py-1">{point.point_type}</span> : null}
                        {(point.profondeur_finale_m || point.profondeur_bas) ? <span className="rounded-full border border-border bg-bg px-3 py-1">Prof. finale {formatDepth(point.profondeur_finale_m || point.profondeur_bas)}</span> : null}
                        {point.tenue_fouilles ? <span className="rounded-full border border-border bg-bg px-3 py-1">{point.tenue_fouilles}</span> : null}
                        {(point.venue_eau || point.niveau_nappe) ? <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">∇ {point.niveau_nappe || 'nappe'}</span> : null}
                    </div>
                </div>

                {pointEditing ? (
                    <Card title="Modifier le sondage">
                    <div className="grid gap-3 md:grid-cols-3">
                        <Field label="Point"><Input value={pointForm.point_code} onChange={(event) => setPointField('point_code', event.target.value)} /></Field>
                        <Field label="Type"><Input value={pointForm.point_type} onChange={(event) => setPointField('point_type', event.target.value)} /></Field>
                        <Field label="Localisation"><Input value={pointForm.localisation} onChange={(event) => setPointField('localisation', event.target.value)} /></Field>
                        <Field label="Profil / PK"><Input value={pointForm.profil} onChange={(event) => setPointField('profil', event.target.value)} /></Field>
                        <Field label="Date"><Input type="date" value={pointForm.date_point} onChange={(event) => setPointField('date_point', event.target.value)} /></Field>
                        <Field label="Opérateur"><Input value={pointForm.operateur} onChange={(event) => setPointField('operateur', event.target.value)} /></Field>
                        <Field label="Profondeur finale (m)"><Input value={pointForm.profondeur_finale_m} onChange={(event) => setPointField('profondeur_finale_m', event.target.value)} /></Field>
                        <Field label="Venue d'eau">
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
                        <Field label="Notes" full><Textarea value={pointForm.notes} onChange={(value) => setPointField('notes', value)} /></Field>
                    </div>
                    </Card>
                ) : null}


                <Card title="Coupe de description géotechnique" right={
                    <div className="flex gap-2 items-center">
                        <span className="text-[11px] text-text-muted">{couches.length} couche(s)</span>
                        {!addingCouche ? (
                            <div className="flex gap-2">
                                {selectedCoucheRow && <Button variant="secondary" size="sm" onClick={handleInsertCouche}>Insérer après</Button>}
                                <Button variant="primary" size="sm" onClick={handleAddCouche}>+ Couche</Button>
                            </div>
                        ) : null}
                    </div>
                }>


                {couches.length ? (
                    <div className="flex gap-0 overflow-x-auto">
                        {/* SVG coupe graphique */}
                        <CoupeSVG point={point} couches={couches} prelevements={linkedPointPrelevements.filter((item) => !item?.ignore_sondage_couche_match)} />

                        {/* Tableau descriptif */}
                        <div className="flex-1 min-w-0 overflow-x-auto">
                            <table className="w-full border-collapse text-[11px]" style={{ minWidth: 700 }}>
                                <thead>
                                    <tr className="bg-bg border-b border-border">
                                        <th className="px-1 py-1 w-6 border-r border-border"></th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Profondeur</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Texture</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Prop.</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Éléments</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Granu.</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Pétro.</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Structure</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">MO</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Couleur</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Odeur</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Consist.</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Cohés.</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Oxydo</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Eau</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">∇ m</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Horizon</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap border-r border-border">Prélt.</th>
                                        <th className="px-1.5 py-1 text-left font-medium text-text-muted whitespace-nowrap">Description</th>
                                        <th className="px-1.5 py-1 text-center font-medium text-text-muted whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {couches.map((couche, index) => {
                                        const linkedPrelevements = Array.isArray(couche.prelevements) ? couche.prelevements : []
                                        const isEditing = editingCoucheId === couche.uid
                                        return (
                                            <tr key={couche.uid || index} className={`border-b border-border ${isEditing ? 'bg-[#f0f4ff]' : 'hover:bg-bg'}`}>
                                                {isEditing ? (
                                                    <td colSpan={20} className="p-2">
                                                        <CoucheEditor
                                                            form={coucheForm}
                                                            onChange={setCoucheField}
                                                            onSave={() => handleUpdateCouche(couche.uid)}
                                                            onCancel={() => { setEditingCoucheId(null); setCoucheField('__reset__', buildCoucheForm()) }}
                                                            saving={updateCouchePending}
                                                            submitLabel="Enregistrer"
                                                        />
                                                    </td>
                                                ) : (
                                                    <>
                                                        <td className="px-1 py-1 w-6 border-r border-border text-center">
                                                            <input type="radio" name="couche-select" checked={selectedCoucheRow === couche.uid} onChange={() => setSelectedCoucheRow(selectedCoucheRow === couche.uid ? null : couche.uid)} className="cursor-pointer accent-accent" />
                                                        </td>
                                                        <td className="px-1.5 py-1 whitespace-nowrap border-r border-border text-text">
                                                            <div className="flex items-center gap-0.5 font-mono text-[10px]">
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'z_haut' ? (
                                                                    <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="w-10 text-[10px] border border-accent rounded px-1 py-0 bg-white" />
                                                                ) : (
                                                                    <span className="cursor-pointer hover:text-accent" onClick={() => startEditCell(couche.uid, 'z_haut', couche.z_haut)}>{couche.z_haut ?? '—'}</span>
                                                                )}
                                                                <span>→</span>
                                                                {editingCell?.coucheUid === couche.uid && editingCell?.field === 'z_bas' ? (
                                                                    <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="w-10 text-[10px] border border-accent rounded px-1 py-0 bg-white" />
                                                                ) : (
                                                                    <span className="cursor-pointer hover:text-accent" onClick={() => startEditCell(couche.uid, 'z_bas', couche.z_bas)}>{couche.z_bas ?? '—'}</span>
                                                                )}
                                                                <span>m</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'texture_matrice', couche.texture_matrice)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'texture_matrice' ? (
                                                                <>
                                                                    <input list="dl-texture-matrice" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                                    <datalist id="dl-texture-matrice">{getOptions('texture_matrice', TEXTURE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.texture_matrice || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'proportion_matrice', couche.proportion_matrice)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'proportion_matrice' ? (
                                                                <>
                                                                    <input list="dl-proportion-matrice" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-proportion-matrice">{getOptions('proportion_matrice', PROPORTION_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.proportion_matrice || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'elements_grossiers', couche.elements_grossiers)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'elements_grossiers' ? (
                                                                <>
                                                                    <input list="dl-elements-grossiers" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                                    <datalist id="dl-elements-grossiers">{getOptions('elements_grossiers', ELEMENTS_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.elements_grossiers || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'granulo_elements', couche.granulo_elements)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'granulo_elements' ? (
                                                                <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.granulo_elements || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'petrographie', couche.petrographie)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'petrographie' ? (
                                                                <>
                                                                    <input list="dl-petrographie" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" />
                                                                    <datalist id="dl-petrographie">{getOptions('petrographie', PETROGRAPHIE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.petrographie || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'structure', couche.structure)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'structure' ? (
                                                                <>
                                                                <input list="dl-structure" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-structure">{getOptions('structure', STRUCTURE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.structure || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'matiere_organique', couche.matiere_organique)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'matiere_organique' ? (
                                                                <>
                                                                <input list="dl-matiere-organique" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-matiere-organique">{getOptions('matiere_organique', ORGANIQUE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.matiere_organique || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'couleur', couche.couleur)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'couleur' ? (
                                                                <>
                                                                <input list="dl-couleur" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-couleur">{getOptions('couleur', COULEUR_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.couleur || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'odeur', couche.odeur)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'odeur' ? (
                                                                <>
                                                                <input list="dl-odeur" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-odeur">{getOptions('odeur', ODEUR_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.odeur || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'consistance', couche.consistance)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'consistance' ? (
                                                                <>
                                                                <input list="dl-consistance" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-consistance">{getOptions('consistance', CONSISTANCE_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.consistance || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'cohesion', couche.cohesion)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'cohesion' ? (
                                                                <>
                                                                <input list="dl-cohesion" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-cohesion">{getOptions('cohesion', COHESION_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.cohesion || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'oxydo_reduction', couche.oxydo_reduction)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'oxydo_reduction' ? (
                                                                <>
                                                                <input list="dl-oxydo-reduction" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-oxydo-reduction">{getOptions('oxydo_reduction', OXYDO_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.oxydo_reduction || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'eau_porosite', couche.eau_porosite)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'eau_porosite' ? (
                                                                <>
                                                                <input list="dl-eau-porosite" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-eau-porosite">{getOptions('eau_porosite', EAU_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.eau_porosite || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted">
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'profondeur_eau' ? (
                                                                <input value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-16" placeholder="m" />
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startEditCell(couche.uid, 'profondeur_eau', couche.profondeur_eau)}
                                                                    className={`w-full text-left ${
                                                                        couche.profondeur_eau != null && couche.profondeur_eau !== '' && (
                                                                            Number(couche.profondeur_eau) < Number(couche.z_haut) ||
                                                                            Number(couche.profondeur_eau) > Number(couche.z_bas)
                                                                        ) ? 'text-orange-500 font-bold' : 'hover:text-blue-500 text-blue-400'
                                                                    }`}
                                                                >
                                                                    {couche.profondeur_eau != null && couche.profondeur_eau !== '' ? `∇ ${couche.profondeur_eau}m` : '—'}
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted cursor-pointer" onClick={() => startEditCell(couche.uid, 'horizon', couche.horizon)}>
                                                            {editingCell?.coucheUid === couche.uid && editingCell?.field === 'horizon' ? (
                                                                <>
                                                                <input list="dl-horizon" value={editingCellValue} onChange={e => setEditingCellValue(e.target.value)} onBlur={saveCellEdit} onKeyDown={e => e.key === 'Enter' && saveCellEdit()} autoFocus className="text-[10px] border border-accent rounded px-1 py-0 bg-white w-full" /><datalist id="dl-horizon">{getOptions('horizon', HORIZON_OPTIONS).map(o => <option key={o} value={o} />)}</datalist>
                                                                </>
                                                            ) : (
                                                                <span className="hover:text-accent">{couche.horizon || '—'}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border">
                                                            <div className="flex min-w-[220px] flex-col gap-1.5">
                                                                {linkedPrelevements.map((prelevement) => (
                                                                    <PrelevementManagerItem
                                                                        key={prelevement.uid}
                                                                        prelevement={prelevement}
                                                                        currentCoucheId={couche.uid}
                                                                        coucheOptions={coucheOptions}
                                                                        detailReturnTo={detailReturnTo}
                                                                        navigate={navigate}
                                                                        disabled={updatePrelevementPending || deleteCouchePending}
                                                                        onMove={(prelevUid, targetCoucheUid) => handleUpdatePrelevement(prelevUid, { sondage_couche_id: targetCoucheUid, ignore_sondage_couche_match: false })}
                                                                        onToggleIgnore={(prelevUid, ignore) => handleUpdatePrelevement(prelevUid, { ignore_sondage_couche_match: ignore })}
                                                                        onDelete={handleDeletePrelevement}
                                                                    />
                                                                ))}
                                                                {prelevCoucheId === couche.uid ? (
                                                                    <div className="rounded-md border border-dashed border-accent/40 bg-[#f7fbff] p-2">
                                                                        <div className="flex flex-col gap-1">
                                                                            <Input value={prelevForm.profondeur} onChange={(e) => setPrelevForm(f => ({ ...f, profondeur: e.target.value }))} placeholder="prof. m" className="h-6 px-1 py-0.5 text-[10px]" />
                                                                            <Input value={prelevForm.quantite} onChange={(e) => setPrelevForm(f => ({ ...f, quantite: e.target.value }))} placeholder="qté" className="h-6 px-1 py-0.5 text-[10px]" />
                                                                            <div className="flex gap-1">
                                                                                <Button variant="primary" size="sm" onClick={() => handleCreatePrelevement(couche.uid)} disabled={createPrelevementPending}>Créer</Button>
                                                                                <Button variant="secondary" size="sm" onClick={() => { setPrelevCoucheId(null); setPrelevForm({ profondeur: '', quantite: '' }) }}>Annuler</Button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <button type="button" onClick={() => setPrelevCoucheId(couche.uid)} className="text-left text-[10px] text-accent hover:underline">+ prél.</button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-1.5 py-1 border-r border-border text-text-muted max-w-[120px] truncate" title={couche.description_libre}>{couche.description_libre || '—'}</td>
                                                        <td className="px-1.5 py-1 text-center whitespace-nowrap">
                                                            <div className="flex gap-1 justify-center">
                                                                <Button variant="secondary" size="sm" onClick={() => { setEditingCoucheId(couche.uid); setCoucheField('__reset__', buildCoucheForm(couche)) }}>✎</Button>
                                                                <Button variant="danger" size="sm" onClick={() => handleDeleteCouche(couche.uid)}>✕</Button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        )
                                    })}
                                {/* Nouvelle ligne inline */}
                                {newCoucheRow != null ? (
                                    <NewCoucheInlineRow
                                        newCoucheRow={newCoucheRow}
                                        setNewCoucheRow={setNewCoucheRow}
                                        getOptions={getOptions}
                                        onSave={(form) => handleCreateCouche(form)}
                                        saving={createCouchePending}
                                    />
                                ) : null}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted text-center">
                        Aucune couche décrite. Cliquez sur "+ Couche" pour commencer.
                    </div>
                )}
            </Card>

                <Card title="Prélèvements hors couche" right={<span className="text-[11px] text-text-muted">{horsCouchePrelevements.length} prél.</span>}>
                    {horsCouchePrelevements.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                            {horsCouchePrelevements.map((prelevement) => (
                                <PrelevementManagerItem
                                    key={prelevement.uid}
                                    prelevement={prelevement}
                                    currentCoucheId={prelevement.sondage_couche_id}
                                    coucheOptions={coucheOptions}
                                    detailReturnTo={detailReturnTo}
                                    navigate={navigate}
                                    disabled={updatePrelevementPending}
                                    onMove={(prelevUid, targetCoucheUid) => handleUpdatePrelevement(prelevUid, { sondage_couche_id: targetCoucheUid, ignore_sondage_couche_match: false })}
                                    onToggleIgnore={(prelevUid, ignore) => handleUpdatePrelevement(prelevUid, { ignore_sondage_couche_match: ignore })}
                                    onDelete={handleDeletePrelevement}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-[13px] text-text-muted">Tous les prélèvements du point sont actuellement affectés à une couche.</div>
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
    const [prelevCoucheId, setPrelevCoucheId] = useState(null)
    const [editingCell, setEditingCell] = useState(null) // { coucheUid, field }
    const [selectedCoucheRow, setSelectedCoucheRow] = useState(null) // uid for insert position
    const [newCoucheRow, setNewCoucheRow] = useState(null) // { z_haut, z_bas, insertAfterUid } or null
    const [editingCellValue, setEditingCellValue] = useState('')
    const [prelevForm, setPrelevForm] = useState({ profondeur: '', quantite: '' })

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
            setPrelevCoucheId(null)
            setPrelevForm({ profondeur: '', quantite: '' })
            return
        }
        setPointForm(buildPointForm(selectedPoint))
        setPointEditing(searchParams.get('edit') === '1')
        setEditingCoucheId(null)
        setCoucheFormState(buildCoucheForm())
        setAddingCouche(false)
        setPrelevCoucheId(null)
        setPrelevForm({ profondeur: '', quantite: '' })
        setEditingCell(null)
        setEditingCellValue('')
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
            setNewCoucheRow(null)
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
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
        },
    })

    const createPrelevementMutation = useMutation({
        mutationFn: ({ coucheUid, payload }) => feuillesTerrainApi.createPrelevementForCouche(uid, selectedPoint.uid, coucheUid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
            setPrelevCoucheId(null)
            setPrelevForm({ profondeur: '', quantite: '' })
        },
    })

    const updatePrelevementMutation = useMutation({
        mutationFn: ({ prelevUid, payload }) => feuillesTerrainApi.updatePrelevement(uid, prelevUid, payload),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
        },
    })

    const deletePointMutation = useMutation({
        mutationFn: (pointUid) => feuillesTerrainApi.deletePoint(uid, pointUid),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
            navigate(`/feuilles-terrain/${uid}`)
        },
    })

    const deletePrelevementMutation = useMutation({
        mutationFn: (prelevUid) => feuillesTerrainApi.deletePrelevement(uid, prelevUid),
        onSuccess: (saved) => {
            queryClient.setQueryData(['feuille-terrain', uid], saved)
        },
    })

    const deleteErrorMessage = deletePointMutation.error?.message || deleteCoucheMutation.error?.message || deletePrelevementMutation.error?.message || ''

    function startEditCell(coucheUid, field, currentValue) {
        setEditingCell({ coucheUid, field })
        setEditingCellValue(currentValue == null ? '' : String(currentValue))
    }

    function saveCellEdit() {
        if (!editingCell) return
        const { coucheUid, field } = editingCell
        const pointCouches = Array.isArray(selectedPoint?.couches) ? selectedPoint.couches : []
        const couche = pointCouches.find(c => c.uid === coucheUid)
        if (!couche) { setEditingCell(null); return }
        const payload = toCouchePayload({ ...buildCoucheForm(couche), [field]: editingCellValue })
        updateCoucheMutation.mutate({ coucheUid, payload })
        // Save custom value if it's a text field and not a number field
        const numFields = ['z_haut', 'z_bas', 'profondeur_eau']
        if (!numFields.includes(field) && editingCellValue && editingCellValue.trim()) {
            feuillesTerrainApi.saveCustomValue(field, editingCellValue.trim()).catch(() => {})
        }
        setEditingCell(null)
        setEditingCellValue('')
    }

    function handleInsertCouche() {
        if (!selectedCoucheRow || !selectedPoint) return
        const pointCouches = Array.isArray(selectedPoint?.couches) ? selectedPoint.couches : []
        const idx = pointCouches.findIndex(c => c.uid === selectedCoucheRow)
        if (idx < 0) return
        const before = pointCouches[idx]
        const after = pointCouches[idx + 1] || null
        const newZHaut = String(before.z_bas ?? '')
        const newZBas = after ? String(after.z_haut ?? '') : ''
        setNewCoucheRow({ z_haut: newZHaut, z_bas: newZBas, insertAfterUid: before.uid })
        setAddingCouche(false)
        setEditingCoucheId(null)
        setSelectedCoucheRow(null)
    }

    function startCreatePoint() {
        createPointMutation.mutate(toPointPayload(buildPointForm({ point_type: 'SONDAGE_PELLE' })))
    }

    function handleSavePoint() {
        if (!selectedPoint) return
        updatePointMutation.mutate(toPointPayload(pointForm))
    }

    function handleCreateCouche(inlineForm) {
        if (!selectedPoint) return
        const payload = inlineForm ? toCouchePayload(inlineForm) : toCouchePayload(coucheForm)
        createCoucheMutation.mutate(payload)
    }

    function handleAddCouche() {
        const pointCouches = Array.isArray(selectedPoint?.couches) ? selectedPoint.couches : []
        const lastCouche = pointCouches.length ? pointCouches[pointCouches.length - 1] : null
        const nextZHaut = lastCouche?.z_bas ?? ''
        setNewCoucheRow({ z_haut: String(nextZHaut), z_bas: '', insertAfterUid: lastCouche?.uid ?? null })
        setAddingCouche(false)
        setEditingCoucheId(null)
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
                prelevCoucheId={prelevCoucheId}
                setPrelevCoucheId={setPrelevCoucheId}
                prelevForm={prelevForm}
                setPrelevForm={setPrelevForm}
                createPrelevementPending={createPrelevementMutation.isPending}
                handleCreatePrelevement={(coucheUid) => createPrelevementMutation.mutate({ coucheUid, payload: prelevForm })}
                updatePrelevementPending={updatePrelevementMutation.isPending}
                handleUpdatePrelevement={(prelevUid, payload) => updatePrelevementMutation.mutate({ prelevUid, payload })}
                handleDeletePrelevement={(prelevUid) => {
                    if (!window.confirm('Supprimer ce prélèvement ?')) return
                    deletePrelevementMutation.mutate(prelevUid)
                }}
                handleDeletePoint={(pointUid) => deletePointMutation.mutate(pointUid)}
                deleteErrorMessage={deleteErrorMessage}
                editingCell={editingCell}
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
            />
        )
    }

    return (
        <div className="flex flex-col h-full -m-6 overflow-y-auto">
            <PageHeaderBar
                backLabel="← Retour"
                onBack={() => navigateBackWithFallback(navigate, searchParams, '/demandes')}
                title={data.reference}
                subtitle={[data.label, data.intervention_reference, data.demande_reference].filter(Boolean).join(' · ')}
                actions={(
                    <div className="flex flex-wrap gap-2">
                        {data.demande_id ? <Button variant="secondary" size="sm" onClick={() => navigate(`/demandes/${data.demande_id}`)}>Demande</Button> : null}
                        {data.intervention_id ? <Button variant="secondary" size="sm" onClick={() => navigate(`/interventions/${data.intervention_id}`)}>Intervention</Button> : null}
                    </div>
                )}
            />

            <div className="p-6 max-w-[1400px] mx-auto w-full flex flex-col gap-5">
                {deleteErrorMessage ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {deleteErrorMessage}
                    </div>
                ) : null}

                <div className="rounded-lg border border-[#d8e6e1] bg-[#f6fbf9] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{isSondageSheet ? 'Coupe de sondages' : 'Feuille terrain'}</p>
                    <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-text">{data.reference}</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
                        {[data.label, data.observations].filter(Boolean).join(' · ') || 'Suivi terrain et chaîne labo associée.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                        {data.code_feuille ? <span className="rounded-full border border-border bg-bg px-3 py-1">Code {data.code_feuille}</span> : null}
                        {data.intervention_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Intervention {data.intervention_reference}</span> : null}
                        {data.demande_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Demande {data.demande_reference}</span> : null}
                        {data.date_feuille ? <span className="rounded-full border border-border bg-bg px-3 py-1">{formatDate(data.date_feuille)}</span> : null}
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
                                <div key={point.uid || point.point_code} className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => openPoint(point.uid)} className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-4 py-3 text-left hover:border-accent transition-colors">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="text-[14px] font-semibold text-text">{point.point_code || point.uid}</div>
                                                <div className="mt-1 text-[12px] text-text-muted">{[point.localisation, point.profil].filter(Boolean).join(' · ')}</div>
                                            </div>
                                            <div className="text-right text-[11px] text-text-muted">
                                                <div>{formatMetric(point.profondeur_finale_m)}</div>
                                                <div>{point.couches?.length || 0} couche(s) · {point.prelevements?.length || 0} prél.</div>
                                            </div>
                                        </div>
                                    </button>
                                    <Button variant="danger" size="sm" onClick={() => { if (window.confirm('Supprimer ce sondage et ses couches ?')) handleDeletePoint(point.uid) }}>✕</Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">Aucun sondage n’est encore enregistré dans cette coupe.</div>
                    )}
                    </Card>
                ) : renderGenericView({ data, navigate, detailReturnTo })}
            </div>
        </div>
    )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'

const LAYER_COLORS = ['#003170', '#1d4f91', '#4a7db5', '#7aa0c8', '#ffcc00', '#e6b900', '#64748b']
const INTERFACE_COLORS = {
  collé: '#22c55e',
  'semi-collé': '#f59e0b',
  glissant: '#ef4444',
}
const INTERFACE_CYCLE = ['collé', 'semi-collé', 'glissant']

function toNum(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isPfLayer(layer) {
  return String(layer?.materiau || '').toUpperCase().startsWith('PF')
    || String(layer?.fonction || '').toLowerCase() === 'plateforme'
    || String(layer?.famille || '').toLowerCase().includes('plateforme')
}

/** Origine matériau : FTP / bibliothèque / saisie manuelle. */
function materialOrigin(layer) {
  if (!layer) return 'manuel'
  const source = String(layer.source || layer.materiau_source || '').toLowerCase()
  if (layer.ftp_url || source.includes('ftp')) return 'ftp'
  if (layer.from_library && !layer.modified_manually) return 'biblio'
  return 'manuel'
}

function OriginBadge({ origin, onLight = false }) {
  if (origin === 'ftp') {
    return (
      <span className={`rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wide ${
        onLight ? 'bg-cyan-100 text-cyan-900' : 'bg-[#0e7490] text-white'
      }`}
      >
        FTP
      </span>
    )
  }
  if (origin === 'biblio') {
    return (
      <span className={`rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wide ${
        onLight ? 'bg-[#e8eef6] text-[#003170]' : 'bg-white/25 text-white'
      }`}
      >
        Biblio
      </span>
    )
  }
  return (
    <span className="rounded bg-amber-400 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-950">
      Manuel
    </span>
  )
}

function Field({ label, children, hint, warn }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-[10px] text-text-muted">{hint}</span> : null}
      {warn ? <span className="mt-0.5 block text-[10px] font-medium text-amber-700">{warn}</span> : null}
    </label>
  )
}

/**
 * Éditeur de structure style Alizé2 (doc utilisateur §3.2.1) :
 * schéma cliquable, drag d'épaisseur, interfaces, bibliothèque, assise, T°/Hz.
 */
export default function AlizeStructureEditor({
  layers = [],
  platform = {},
  params = {},
  catalogs = null,
  onChangeLayers,
  onChangePlatform,
  onChangeParams,
  readOnly = false,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [dragIndex, setDragIndex] = useState(null)
  const dragStartY = useRef(0)
  const dragStartEp = useRef(0)
  const stackRef = useRef(null)

  const materials = catalogs?.materials || []
  const families = catalogs?.material_families || []
  const bibliotheques = catalogs?.bibliotheques || []
  const plateformes = catalogs?.plateformes || []
  const defaults = catalogs?.defaults || {}

  const finiteLayers = useMemo(
    () => layers.map((l, i) => ({ ...l, _index: i })).filter((l) => !isPfLayer(l)),
    [layers],
  )
  const totalEp = finiteLayers.reduce((acc, l) => acc + (toNum(l.epaisseur) || 0), 0) || 1
  const selected = layers[selectedIndex] || null
  const selectedIsPf = selected ? isPfLayer(selected) : false

  const layersRef = useRef(layers)
  layersRef.current = layers

  useEffect(() => {
    if (selectedIndex >= layers.length) setSelectedIndex(Math.max(0, layers.length - 1))
  }, [layers.length, selectedIndex])

  useEffect(() => {
    if (dragIndex == null) return undefined
    function onMove(e) {
      const dy = e.clientY - dragStartY.current
      const deltaCm = Math.round((dy / 3) * 10) / 10
      const nextEp = Math.max(0.1, Math.round((dragStartEp.current + deltaCm) * 10) / 10)
      const current = layersRef.current
      const next = current.map((layer, i) => (
        i === dragIndex ? { ...layer, epaisseur: nextEp, modified_manually: true } : layer
      ))
      onChangeLayers?.(next.map((layer, index) => ({ ...layer, ordre: index + 1 })))
    }
    function onUp() {
      setDragIndex(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragIndex, onChangeLayers])

  function emitLayers(next) {
    onChangeLayers?.(next.map((layer, index) => ({ ...layer, ordre: index + 1 })))
  }

  function patchLayer(index, patch) {
    const next = layers.map((layer, i) => (i === index ? { ...layer, ...patch } : layer))
    emitLayers(next)
  }

  function startDrag(index, e) {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    const ep = toNum(layers[index]?.epaisseur)
    if (ep == null) return
    dragStartY.current = e.clientY
    dragStartEp.current = ep
    setDragIndex(index)
    setSelectedIndex(index)
  }

  function cycleInterface(index, e) {
    e?.stopPropagation()
    if (readOnly) return
    const current = layers[index]?.interface_inf || 'collé'
    const pos = INTERFACE_CYCLE.indexOf(current)
    const next = INTERFACE_CYCLE[(pos + 1) % INTERFACE_CYCLE.length]
    patchLayer(index, { interface_inf: next })
  }

  function addLayerBelow(index) {
    if (readOnly) return
    const insertAt = index + 1
    const blank = {
      ordre: insertAt + 1,
      fonction: 'Assise',
      materiau: '',
      famille: 'bitumineux',
      classe: '',
      formulation: '',
      epaisseur: 8,
      unite: 'cm',
      module: null,
      poisson: defaults.poisson ?? 0.35,
      temperature_calcul: defaults.temperature ?? 15,
      frequence: defaults.frequence ?? 10,
      bibliotheque: defaults.bibliotheque || 'NF P98-086 2019',
      assise: true,
      interface_sup: '',
      interface_inf: 'collé',
      lie: false,
      from_library: false,
      modified_manually: false,
      justification: '',
      commentaire: '',
    }
    const next = [...layers]
    next.splice(insertAt, 0, blank)
    emitLayers(next)
    setSelectedIndex(insertAt)
  }

  function addSurfaceLayer() {
    if (readOnly) return
    const blank = {
      ordre: 1,
      fonction: 'Roulement',
      materiau: '',
      famille: 'bitumineux',
      classe: '',
      formulation: '',
      epaisseur: 4,
      unite: 'cm',
      module: null,
      poisson: defaults.poisson ?? 0.35,
      temperature_calcul: defaults.temperature ?? 15,
      frequence: defaults.frequence ?? 10,
      bibliotheque: defaults.bibliotheque || 'NF P98-086 2019',
      assise: false,
      interface_sup: '',
      interface_inf: 'collé',
      lie: false,
      from_library: false,
      modified_manually: false,
      justification: '',
      commentaire: '',
    }
    emitLayers([blank, ...layers])
    setSelectedIndex(0)
  }

  function removeLayer(index) {
    if (readOnly) return
    // Alizé : minimum 2 couches (dont plateforme éventuelle)
    if (layers.length <= 2) {
      window.alert('Alizé impose au minimum deux couches (la couche inférieure reste d’épaisseur infinie).')
      return
    }
    const next = layers.filter((_, i) => i !== index)
    emitLayers(next)
    setSelectedIndex(Math.min(index, next.length - 1))
  }

  function moveLayer(index, dir) {
    if (readOnly) return
    const j = index + dir
    if (j < 0 || j >= layers.length) return
    const next = [...layers]
    const tmp = next[index]
    next[index] = next[j]
    next[j] = tmp
    emitLayers(next)
    setSelectedIndex(j)
  }

  function applyMaterial(index, code) {
    const mat = materials.find((m) => m.code === code)
    const layer = layers[index] || {}
    const source = String(mat?.source || 'biblio')
    const fromFtp = source.toLowerCase().includes('ftp')
    const patch = {
      materiau: code,
      from_library: true,
      modified_manually: false,
      source: fromFtp ? 'ftp' : (source || 'biblio'),
      ftp_url: fromFtp ? (mat.ftp_url || layer.ftp_url || '') : '',
    }
    if (mat) {
      patch.famille = mat.famille || layer.famille
      if (mat.module != null) patch.module = Math.round(Number(mat.module))
      if (mat.poisson != null) patch.poisson = mat.poisson
      if (mat.epaisseur_typique != null && (layer.epaisseur == null || layer.epaisseur === '')) {
        patch.epaisseur = Math.round(Number(mat.epaisseur_typique) * 10) / 10
      }
      if (String(mat.famille || '').includes('plateforme') || String(code || '').toUpperCase().startsWith('PF')) {
        patch.fonction = 'Plateforme'
        patch.classe = code
        patch.epaisseur = null
        patch.assise = false
        onChangePlatform?.({
          ...platform,
          classe: code,
          module_pf: mat.module != null ? Math.round(Number(mat.module)) : platform.module_pf,
          source: mat.source || 'Bibliothèque',
        })
      } else if (!layer.fonction) {
        patch.fonction = index === 0 ? 'Roulement' : 'Assise'
      }
      patch.justification = fromFtp
        ? `FTP${mat.label ? ` · ${mat.label}` : ''}`
        : `Bibliothèque ${layer.bibliotheque || defaults.bibliotheque || 'Alizé'}`
    }
    patchLayer(index, patch)
  }

  function switchBibliotheque(index, biblioId) {
    const layer = layers[index] || {}
    if (biblioId === 'autre' && layer.materiau && !String(layer.materiau).endsWith(' mod')) {
      patchLayer(index, {
        bibliotheque: biblioId,
        materiau: `${layer.materiau} mod`,
        from_library: false,
        modified_manually: true,
      })
      return
    }
    patchLayer(index, { bibliotheque: biblioId, from_library: biblioId !== 'autre' })
  }

  function toggleAssise(index) {
    if (readOnly || isPfLayer(layers[index])) return
    patchLayer(index, { assise: !layers[index].assise })
  }

  const materialsForSelected = useMemo(() => {
    if (!selected) return materials
    const fam = selected.famille
    if (!fam || fam === 'autre') return materials
    const filtered = materials.filter((m) => {
      const mf = String(m.famille || '')
      if (fam === 'bitumineux') return mf.includes('bitum')
      if (fam === 'GNT/Sols') return mf.includes('GNT') || mf.includes('Sol')
      if (fam === 'plateforme') return mf.includes('plateforme') || String(m.code || '').startsWith('PF')
      return mf === fam || mf.includes(fam)
    })
    return filtered.length ? filtered : materials
  }, [materials, selected])

  const temp = toNum(selected?.temperature_calcul)
  const freq = toNum(selected?.frequence)
  const tempWarn = temp != null && temp !== 15 ? 'Valeur hors standard Alizé (15 °C)' : ''
  const freqWarn = freq != null && freq !== 10 ? 'Valeur hors standard Alizé (10 Hz)' : ''

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="Titre de la structure">
          <Input
            value={params.structure_titre ?? ''}
            disabled={readOnly}
            placeholder="Ex. Voirie PL — structure bitumineuse épaisse"
            onChange={(e) => onChangeParams?.({ ...params, structure_titre: e.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-1 pb-0.5">
          {!readOnly && selectedIndex >= 0 ? (
            <>
              <Button size="sm" onClick={() => moveLayer(selectedIndex, -1)} disabled={selectedIndex <= 0}>↑</Button>
              <Button size="sm" onClick={() => moveLayer(selectedIndex, 1)} disabled={selectedIndex >= layers.length - 1}>↓</Button>
              <Button size="sm" variant="ghost" onClick={() => removeLayer(selectedIndex)}>Retirer</Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        {/* Schéma interactif */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-black uppercase tracking-wide text-[#003170]">Schéma</div>
          {!readOnly ? (
            <Button size="sm" onClick={addSurfaceLayer}>+ Surface</Button>
          ) : null}
        </div>
        <div ref={stackRef} className="overflow-hidden rounded-xl border border-[#dbe1ea] bg-[#f8fafc] select-none">
          {layers.map((layer, index) => {
            const ep = toNum(layer.epaisseur)
            const pf = isPfLayer(layer)
            const origin = materialOrigin(layer)
            const h = pf || ep == null
              ? 36
              : Math.max(28, Math.round((ep / totalEp) * 160))
            const color = LAYER_COLORS[index % LAYER_COLORS.length]
            const selectedStyle = selectedIndex === index ? 'ring-2 ring-[#ffcc00] ring-inset' : ''
            const originRing = origin === 'manuel'
              ? 'ring-2 ring-inset ring-amber-400'
              : origin === 'ftp'
                ? 'ring-2 ring-inset ring-cyan-300'
                : ''
            const iface = layer.interface_inf || 'collé'
            const ifaceColor = INTERFACE_COLORS[iface] || '#94a3b8'
            return (
              <div key={layer.id || `stack-${index}`}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedIndex(index) }}
                  style={{
                    height: h,
                    background: origin === 'manuel'
                      ? `linear-gradient(90deg, #f59e0b 0 4px, ${color} 4px)`
                      : color,
                  }}
                  className={`relative flex cursor-pointer flex-col justify-center px-2 text-[10px] font-semibold text-white ${selectedStyle} ${originRing}`}
                  title={
                    origin === 'manuel'
                      ? 'Matériau saisi manuellement (hors FTP / bibliothèque)'
                      : origin === 'ftp'
                        ? 'Matériau issu d’une FTP'
                        : 'Matériau issu de la bibliothèque'
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{layer.materiau || layer.fonction || `Couche ${index + 1}`}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <OriginBadge origin={origin} />
                      <span className="opacity-90">{pf || ep == null ? '∞' : `${ep} cm`}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] font-normal opacity-90">
                    <span>E={layer.module ?? '—'} · ν={layer.poisson ?? '—'}</span>
                    {layer.assise ? <span className="rounded bg-white/20 px-1">Assise</span> : null}
                  </div>
                  {!readOnly && !pf && ep != null ? (
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize ${dragIndex === index ? 'bg-white/50' : 'bg-white/0 hover:bg-white/30'}`}
                      onPointerDown={(e) => startDrag(index, e)}
                      title="Glisser pour modifier l’épaisseur"
                    />
                  ) : null}
                </div>
                {/* Interface sous la couche (sauf dernière) */}
                {index < layers.length - 1 ? (
                  <div className="flex items-center gap-1 bg-[#eef2f7] px-1 py-0.5">
                    {!readOnly ? (
                      <button
                        type="button"
                        className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-[12px] font-bold text-white"
                        title="Ajouter une couche sous cette interface"
                        onClick={() => addLayerBelow(index)}
                      >
                        +
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={(e) => cycleInterface(index, e)}
                      className="flex flex-1 items-center justify-center gap-2 rounded px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: ifaceColor }}
                      title="Cliquer pour changer l’interface (collé → semi-collé → glissant)"
                    >
                      Interface : {iface}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
          {platform.classe && !layers.some(isPfLayer) ? (
            <div
              className="flex h-9 cursor-pointer items-center justify-between bg-[#64748b] px-2 text-[10px] font-semibold text-white"
              onClick={() => {
                // sélection « virtuelle » PF via plateforme
                setSelectedIndex(-1)
              }}
            >
              <span>{platform.classe}</span>
              <span>{platform.module_pf ? `${platform.module_pf} MPa` : '∞'}</span>
            </div>
          ) : null}
        </div>
        <div className="text-[11px] text-text-muted">
          Σ épaisseurs finies : <strong className="text-text">{Math.round(totalEp * 10) / 10} cm</strong>
          {' · '}
          Assise : {layers.filter((l) => l.assise && !isPfLayer(l)).map((l) => l.materiau || '?').join(' + ') || '—'}
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-text-muted">
          {Object.entries(INTERFACE_COLORS).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded" style={{ background: c }} /> {k}
            </span>
          ))}
          <span className="inline-flex items-center gap-1"><OriginBadge origin="biblio" onLight /> biblio</span>
          <span className="inline-flex items-center gap-1"><OriginBadge origin="ftp" onLight /> FTP</span>
          <span className="inline-flex items-center gap-1"><OriginBadge origin="manuel" onLight /> manuel</span>
        </div>
      </div>

      {/* Panneau propriétés */}
      <div className="min-w-0 rounded-lg border border-[#dbe1ea] bg-white p-2.5">
        {selectedIndex < 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] font-black uppercase tracking-wide text-[#003170]">Plateforme</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Classe PF">
                <Select
                  className="w-full"
                  value={platform.classe || ''}
                  disabled={readOnly}
                  onChange={(e) => {
                    const pf = plateformes.find((p) => p.classe === e.target.value)
                    onChangePlatform?.({
                      ...platform,
                      classe: e.target.value,
                      module_pf: pf?.module != null ? Math.round(Number(pf.module)) : platform.module_pf,
                    })
                  }}
                >
                  <option value="">Choisir…</option>
                  {plateformes.map((pf) => (
                    <option key={pf.classe} value={pf.classe}>
                      {pf.classe}{pf.module != null ? ` · ${Math.round(Number(pf.module))} MPa` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Module PF (MPa)">
                <Input
                  value={platform.module_pf ?? ''}
                  disabled={readOnly}
                  onChange={(e) => onChangePlatform?.({ ...platform, module_pf: e.target.value })}
                />
              </Field>
              <Field label="Poisson">
                <Input
                  value={platform.poisson ?? ''}
                  disabled={readOnly}
                  onChange={(e) => onChangePlatform?.({ ...platform, poisson: e.target.value })}
                />
              </Field>
            </div>
            <p className="text-[12px] text-text-muted">La plateforme ne fait pas partie de l’assise (Alizé2 §3.2.1).</p>
          </div>
        ) : selected ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wide text-[#003170]">
                <span>
                  Couche {selected.ordre || selectedIndex + 1}
                  {selectedIsPf ? ' · Plateforme' : ''}
                  {selected.materiau ? ` · ${selected.materiau}` : ''}
                </span>
                <OriginBadge origin={materialOrigin(selected)} onLight />
              </div>
              {!readOnly && !selectedIsPf ? (
                <label className="inline-flex items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={!!selected.assise}
                    onChange={() => toggleAssise(selectedIndex)}
                  />
                  Appartient à l’assise
                </label>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Bibliothèque" hint="Catalogue 1998 / NF 2011 / NF 2019 / Autre">
                <Select
                  className="w-full"
                  value={selected.bibliotheque || 'NF P98-086 2019'}
                  disabled={readOnly}
                  onChange={(e) => switchBibliotheque(selectedIndex, e.target.value)}
                >
                  {bibliotheques.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Famille">
                <Select
                  className="w-full"
                  value={selected.famille || ''}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, { famille: e.target.value })}
                >
                  <option value="">Toutes…</option>
                  {families.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Matériau (bibliothèque / FTP)" hint="Origine indiquée dans la liste · Manuel = saisie libre">
                <div className="flex items-center gap-2">
                  <Select
                    className="w-full"
                    value={selected.materiau || ''}
                    disabled={readOnly}
                    onChange={(e) => applyMaterial(selectedIndex, e.target.value)}
                  >
                    <option value="">Choisir…</option>
                    {materialsForSelected.map((mat) => {
                      const src = String(mat.source || '').toLowerCase()
                      const tag = src.includes('ftp') ? 'FTP' : 'Biblio'
                      return (
                        <option key={`${mat.source}-${mat.code}`} value={mat.code}>
                          [{tag}] {mat.code}{mat.module != null ? ` · E=${Math.round(Number(mat.module))}` : ''}
                          {mat.centrale ? ` · ${mat.centrale}` : ''}
                        </option>
                      )
                    })}
                  </Select>
                  <OriginBadge origin={materialOrigin(selected)} onLight />
                </div>
              </Field>
              <Field label="Matériau (libre)" hint="Hors FTP / bibliothèque → marque Manuel">
                <Input
                  value={selected.materiau ?? ''}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, {
                    materiau: e.target.value,
                    modified_manually: true,
                    from_library: false,
                    source: 'manuel',
                    ftp_url: '',
                  })}
                />
              </Field>
              <Field label="Fonction">
                <Select
                  className="w-full"
                  value={selected.fonction || ''}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, { fonction: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="Roulement">Roulement</option>
                  <option value="Liaison">Liaison</option>
                  <option value="Assise">Assise</option>
                  <option value="Fondation">Fondation</option>
                  <option value="Plateforme">Plateforme</option>
                </Select>
              </Field>
              <Field label="Épaisseur" hint="Pas ±1 cm · précision mm au clavier">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-[6rem] flex-1"
                    value={selected.epaisseur ?? ''}
                    disabled={readOnly || selectedIsPf}
                    placeholder={selectedIsPf ? '∞' : 'ex. 5'}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === '' || raw === '.') {
                        patchLayer(selectedIndex, { epaisseur: raw, modified_manually: true })
                        return
                      }
                      const n = Number(raw)
                      if (!Number.isFinite(n)) return
                      patchLayer(selectedIndex, {
                        epaisseur: Math.max(0, n),
                        modified_manually: true,
                      })
                    }}
                  />
                  <span className="shrink-0 text-[12px] font-semibold text-text-muted">cm</span>
                  <Button
                    size="sm"
                    disabled={readOnly || selectedIsPf}
                    onClick={() => patchLayer(selectedIndex, {
                      epaisseur: Math.max(0.1, Math.round(((toNum(selected.epaisseur) || 0) - 1) * 10) / 10),
                      modified_manually: true,
                    })}
                  >
                    −1 cm
                  </Button>
                  <Button
                    size="sm"
                    disabled={readOnly || selectedIsPf}
                    onClick={() => patchLayer(selectedIndex, {
                      epaisseur: Math.round(((toNum(selected.epaisseur) || 0) + 1) * 10) / 10,
                      modified_manually: true,
                    })}
                  >
                    +1 cm
                  </Button>
                </div>
              </Field>
              <Field label="Module E (MPa)">
                <Input
                  value={selected.module ?? ''}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, {
                    module: e.target.value,
                    modified_manually: true,
                  })}
                />
              </Field>
              <Field label="Poisson ν">
                <Input
                  value={selected.poisson ?? ''}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, { poisson: e.target.value })}
                />
              </Field>
              <Field label="Température (°C)" hint="Plage Alizé −15 à 60" warn={tempWarn}>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-[5rem] flex-1"
                    value={selected.temperature_calcul ?? ''}
                    disabled={readOnly}
                    onChange={(e) => patchLayer(selectedIndex, { temperature_calcul: e.target.value })}
                  />
                  <Button
                    size="sm"
                    disabled={readOnly}
                    onClick={() => patchLayer(selectedIndex, {
                      temperature_calcul: Math.max(-15, (toNum(selected.temperature_calcul) ?? 15) - 1),
                    })}
                  >
                    −1 °C
                  </Button>
                  <Button
                    size="sm"
                    disabled={readOnly}
                    onClick={() => patchLayer(selectedIndex, {
                      temperature_calcul: Math.min(60, (toNum(selected.temperature_calcul) ?? 15) + 1),
                    })}
                  >
                    +1 °C
                  </Button>
                </div>
              </Field>
              <Field label="Fréquence (Hz)" hint="Plage Alizé 2 à 30" warn={freqWarn}>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-[5rem] flex-1"
                    value={selected.frequence ?? ''}
                    disabled={readOnly}
                    onChange={(e) => patchLayer(selectedIndex, { frequence: e.target.value })}
                  />
                  <Button
                    size="sm"
                    disabled={readOnly}
                    onClick={() => patchLayer(selectedIndex, {
                      frequence: Math.max(2, (toNum(selected.frequence) ?? 10) - 1),
                    })}
                  >
                    −1 Hz
                  </Button>
                  <Button
                    size="sm"
                    disabled={readOnly}
                    onClick={() => patchLayer(selectedIndex, {
                      frequence: Math.min(30, (toNum(selected.frequence) ?? 10) + 1),
                    })}
                  >
                    +1 Hz
                  </Button>
                </div>
              </Field>
              <Field label="Interface inférieure">
                <Select
                  className="w-full"
                  value={selected.interface_inf || 'collé'}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, { interface_inf: e.target.value })}
                >
                  <option value="collé">Collé</option>
                  <option value="semi-collé">Semi-collé</option>
                  <option value="glissant">Glissant</option>
                </Select>
              </Field>
              <Field label="Classe / formulation">
                <Input
                  value={selected.classe ?? ''}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, { classe: e.target.value })}
                />
              </Field>
              <Field label="Formulation">
                <Input
                  value={selected.formulation ?? ''}
                  disabled={readOnly}
                  onChange={(e) => patchLayer(selectedIndex, { formulation: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Commentaire / justification">
              <Textarea
                rows={2}
                value={selected.commentaire || selected.justification || ''}
                disabled={readOnly}
                onChange={(e) => patchLayer(selectedIndex, {
                  commentaire: e.target.value,
                  justification: e.target.value,
                })}
              />
            </Field>
          </div>
        ) : (
          <p className="text-[12px] text-text-muted">Sélectionnez une couche sur le schéma.</p>
        )}
      </div>
      </div>
    </div>
  )
}

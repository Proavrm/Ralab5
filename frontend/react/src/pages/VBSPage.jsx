/**
 * VBSPage.jsx — Test au bleu de méthylène (VBS)
 * Route: /vbs/:uid
 *
 * Test VBS (Bleu de méthylène) pour déterminer la surface spécifique
 * des matériaux granulaires ou la plasticité des sols.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'

// ── UI helpers ────────────────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
      {title && (
        <div className="px-4 py-2.5 border-b border-border bg-bg">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function FR({ label, value }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-muted">{label}</span>
      <span className="text-sm">{value || '—'}</span>
    </div>
  )
}

// ── Constantes ────────────────────────────────────────────────────────────────
const VBS_TYPES = [
  { value: 'granulats', label: 'Granulats' },
  { value: 'sols', label: 'Sols' }
]

const VBS_METHODES = [
  { value: 'nf_en_933_9', label: 'NF EN 933-9 — Granulats' },
  { value: 'nf_p_94_068', label: 'NF P 94-068 — Sols' }
]

// ── Fonctions de calcul ────────────────────────────────────────────────────────
function rnd(v, d = 2) { return v === null || v === undefined ? null : Number(v.toFixed(d)) }

function calcVBS(determinations, type) {
  if (type === 'granulats') {
    // Calcul pour granulats (surface spécifique)
    return determinations.map(det => {
      const m_echantillon = det.m_echantillon ? parseFloat(det.m_echantillon) : null
      const v_bleu = det.v_bleu ? parseFloat(det.v_bleu) : null
      const c_bleu = det.c_bleu ? parseFloat(det.c_bleu) : null

      if (m_echantillon && v_bleu && c_bleu) {
        // VBS = (V_bleu × C_bleu) / M_échantillon
        const vbs = (v_bleu * c_bleu) / m_echantillon
        return { ...det, vbs: rnd(vbs, 1) }
      }
      return { ...det, vbs: null }
    })
  } else {
    // Calcul pour sols (valeur de bleu)
    return determinations.map(det => {
      const m_seche = det.m_seche ? parseFloat(det.m_seche) : null
      const v_bleu = det.v_bleu ? parseFloat(det.v_bleu) : null
      const c_bleu = det.c_bleu ? parseFloat(det.c_bleu) : null

      if (m_seche && v_bleu && c_bleu) {
        // VB = (V_bleu × C_bleu) / M_sèche
        const vb = (v_bleu * c_bleu) / m_seche
        return { ...det, vb: rnd(vb, 1) }
      }
      return { ...det, vb: null }
    })
  }
}

function calcWaterMoisture({ m1, m2, m3 }) {
  const parseValue = value => {
    if (value === '' || value === null || value === undefined) return null
    const normalized = String(value).trim().replace(',', '.')
    const n = parseFloat(normalized)
    return Number.isNaN(n) ? null : n
  }

  const n1 = parseValue(m1)
  const n2 = parseValue(m2)
  const n3 = parseValue(m3)
  if (n1 === null || n2 === null || n3 === null) return { w: null, ms: null, meau: null }

  const meau = n2 - n3
  const ms = n3 - n1
  const w = ms > 0 ? rnd((meau / ms) * 100, 1) : null
  return {
    meau: meau >= 0 ? rnd(meau, 2) : null,
    ms: ms >= 0 ? rnd(ms, 2) : null,
    w: w !== null && w >= 0 ? w : null
  }
}

function getFirstWeMoisture(weResults) {
  const determinations = weResults?.determinations || []
  for (const det of determinations) {
    if (det?.m1 !== undefined && det?.m2 !== undefined && det?.m3 !== undefined) {
      const m1 = det.m1 ?? ''
      const m2 = det.m2 ?? ''
      const m3 = det.m3 ?? ''
      if (m1 !== '' && m2 !== '' && m3 !== '') {
        return { m1, m2, m3 }
      }
    }
  }

  if (weResults?.m1 !== undefined && weResults?.m2 !== undefined && weResults?.m3 !== undefined) {
    const m1 = weResults.m1 ?? ''
    const m2 = weResults.m2 ?? ''
    const m3 = weResults.m3 ?? ''
    if (m1 !== '' && m2 !== '' && m3 !== '') {
      return { m1, m2, m3 }
    }
  }

  return null
}

function parseResults(raw) {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

function findPreferredWeAssay(assays) {
  const candidates = assays.filter(e =>
    e.essai_code === 'WE' || e.code_essai === 'WE' ||
    e.type_essai === 'Teneur en eau' || e.type_essai === 'Teneur en eau naturelle' ||
    e.type_essai === 'Prise d\'essai au bleu' || e.type_essai === 'Prise d\'essai au bleu (sols)'
  )

  const parsed = candidates.map(e => ({ assay: e, results: parseResults(e.resultats) }))
  return parsed.find(p => p.results.usage === 'vbs')?.assay ||
         parsed.find(p => p.results.usage === 'wn')?.assay ||
         candidates[0]
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function VBSPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const isNew = uid === 'new'

  const [editing, setEditing] = useState(isNew)
  const [form, setForm] = useState({
    type_materiau: 'granulats', // Will be updated based on essai_code
    methode: 'nf_en_933_9',
    determinations: [],
    m1: '',
    m2: '',
    m3: ''
  })

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const echantillonIdFromQuery = searchParams.get('echantillon_id') || ''

  // ── Données ────────────────────────────────────────────────────────────────
  const { data: essai, isLoading, isError } = useQuery({
    queryKey: ['essai', uid],
    queryFn: () => api.get(`/essais/${uid}`),
    enabled: !isNew,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (data) => isNew
      ? api.post('/essais', data)
      : api.put(`/essais/${uid}`, data),
    onSuccess: (saved) => {
      if (isNew) navigate(`/vbs/${saved.uid}`, { replace: true })
      else { qc.invalidateQueries({ queryKey: ['essai', uid] }); setEditing(false) }
    },
  })

  const echantillonId = Number(essai?.echantillon_id || echantillonIdFromQuery) || null
  const { data: echantillonAssays = [] } = useQuery({
    queryKey: ['essais-by-echantillon', echantillonId],
    queryFn: () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled: !!echantillonId,
  })

  const relatedWeAssay = findPreferredWeAssay(echantillonAssays)

  let relatedWeResults = {}
  if (relatedWeAssay) {
    try { relatedWeResults = parseResults(relatedWeAssay.resultats) } catch (e) { relatedWeResults = {} }
  }

  const existingWeMoisture = getFirstWeMoisture(relatedWeResults)

  function handleSave() {
    const determinations = form.determinations || []
    const calcs = calcVBS(determinations, form.type_materiau)
    const valides = calcs.filter(d => d.actif && (d.vbs !== null || d.vb !== null))

    const moisture = calcWaterMoisture(form)
    const resultats = {
      type_materiau: form.type_materiau,
      methode: form.methode,
      determinations: calcs,
      nb_determinations: valides.length,
      m1: form.m1,
      m2: form.m2,
      m3: form.m3,
      ms: moisture.ms,
      w: moisture.w,
      meau: moisture.meau
    }

    // Calcul de la moyenne si applicable
    if (form.type_materiau === 'granulats') {
      const vbs_values = valides.map(d => d.vbs).filter(v => v !== null)
      if (vbs_values.length > 0) {
        resultats.vbs_moyen = rnd(vbs_values.reduce((a, b) => a + b, 0) / vbs_values.length, 1)
      }
    } else {
      const vb_values = valides.map(d => d.vb).filter(v => v !== null)
      if (vb_values.length > 0) {
        resultats.vb_moyen = rnd(vb_values.reduce((a, b) => a + b, 0) / vb_values.length, 1)
      }
    }

    saveMut.mutate({
      ...essai,
      essai_code: form.type_materiau === 'granulats' ? 'BM' : 'VBS',
      type_essai: form.type_materiau === 'granulats' ? 'Bleu de méthylène (granulats)' : 'Bleu de méthylène (sols)',
      norme: form.type_materiau === 'granulats' ? 'NF EN 933-9' : 'NF P 94-068',
      resultats: JSON.stringify(resultats)
    })
  }

  // Sync form with parsed results when data loads or editing starts
  useEffect(() => {
    if (!isNew && essai) {
      try {
        const res = JSON.parse(essai.resultats || '{}')
        // Set material type based on essai_code
        const defaultType = (essai.essai_code === 'BM') ? 'granulats' : 'sols'
        setForm({
          type_materiau: res.type_materiau || defaultType,
          methode: res.methode || (defaultType === 'granulats' ? 'nf_en_933_9' : 'nf_p_94_068'),
          determinations: res.determinations || [],
          m1: res.m1 ?? '',
          m2: res.m2 ?? '',
          m3: res.m3 ?? ''
        })
      } catch (e) {
        console.warn('Erreur parsing resultats VBS:', e)
      }
    }
  }, [essai, isNew])

  if (!isNew && isLoading) return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  if (!isNew && (isError || !essai)) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Essai introuvable</p>
      <Button onClick={() => navigate(-1)}>← Retour</Button>
    </div>
  )

  const d = isNew ? null : essai
  const parsedResults = d ? JSON.parse(d.resultats || '{}') : {}
  const res = editing ? form : parsedResults
  const determinations = res.determinations || []
  const calcs = calcVBS(determinations, res.type_materiau)

  const displayResults = { ...parsedResults }
  if (existingWeMoisture) {
    for (const key of ['m1', 'm2', 'm3']) {
      if (displayResults[key] === '' || displayResults[key] === null || displayResults[key] === undefined) {
        displayResults[key] = existingWeMoisture[key]
      }
    }
  }

  const moisture = editing ? calcWaterMoisture({ m1: form.m1, m2: form.m2, m3: form.m3 }) : calcWaterMoisture(displayResults)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Topbar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-surface border-b border-border shrink-0 flex-wrap">
        <button onClick={() => navigate(-1)}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors">
          ← Retour
        </button>
        <span className="text-[14px] font-semibold flex-1">
          {isNew ? 'Nouvel essai VBS' : `VBS — ${d?.reference || `ESSAI #${uid}`}`}
        </span>
        {editing && !isNew ? (
          <>
            <Button onClick={() => setEditing(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? '…' : '✓ Enregistrer'}
            </Button>
          </>
        ) : isNew ? (
          <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending}>
            {saveMut.isPending ? '…' : "✓ Créer l'essai"}
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setEditing(true)}>✏️ Modifier</Button>
        )}
      </div>

      <div className="p-5 max-w-[860px] mx-auto w-full flex flex-col gap-4">
        {/* Contexte */}
        <Card title={editing || isNew ? "Contexte du test" : "Test VBS"}>
          {editing || isNew ? (
            <div className="grid grid-cols-2 gap-3">
              <FG label="Type de matériau">
                <Select value={form.type_materiau} onChange={e => setF('type_materiau', e.target.value)} className="w-full">
                  {VBS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </FG>
              <FG label="Méthode / Norme">
                <Select value={form.methode} onChange={e => setF('methode', e.target.value)} className="w-full">
                  {VBS_METHODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </FG>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8">
              <FR label="Type de matériau" value={VBS_TYPES.find(t => t.value === res.type_materiau)?.label} />
              <FR label="Méthode / Norme" value={VBS_METHODES.find(m => m.value === res.methode)?.label} />
            </div>
          )}
        </Card>

        <Card title="Humidité" >
          {editing || isNew ? (
            <div className="grid grid-cols-4 gap-3">
              <FG label="M1 — Récipient vide (g)">
                <Input type="number" step="0.01" value={form.m1} onChange={e => setF('m1', e.target.value)} />
              </FG>
              <FG label="M2 — +échantillon humide (g)">
                <Input type="number" step="0.01" value={form.m2} onChange={e => setF('m2', e.target.value)} />
              </FG>
              <FG label="M3 — +échantillon sec (g)">
                <Input type="number" step="0.01" value={form.m3} onChange={e => setF('m3', e.target.value)} />
              </FG>
              <div className="grid grid-cols-2 gap-3 col-span-4 p-3 bg-yellow-50 border border-yellow-300 rounded">
                <FR label="Ms calculée (g)">{moisture.ms !== null ? `${moisture.ms} g` : '—'}</FR>
                <FR label="Humidité w (%)">{moisture.w !== null ? `${moisture.w} %` : '—'}</FR>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              <FR label="M1 — Récipient vide (g)" value={displayResults.m1} />
              <FR label="M2 — +échantillon humide (g)" value={displayResults.m2} />
              <FR label="M3 — +échantillon sec (g)" value={displayResults.m3} />
              <FR label="Ms calculée (g)" value={moisture.ms != null ? `${moisture.ms} g` : null} />
              <FR label="Humidité w (%)" value={moisture.w != null ? `${moisture.w} %` : null} />
            </div>
          )}
        </Card>

        {/* Déterminations */}
        <Card title={`Déterminations VBS (${determinations.filter(d => d.actif).length})`}>
          {!editing && !isNew && (
            <div className="mb-4 p-3 bg-[#eaf3de] border border-[#b5d88a] rounded">
              <div className="text-center">
                {res.type_materiau === 'granulats' ? (
                  <>
                    <div className="text-[20px] font-bold text-[#3b6d11]">{res.vbs_moyen || '—'}</div>
                    <div className="text-[10px] text-[#5a8f30]">VBS moyen (g/kg)</div>
                  </>
                ) : (
                  <>
                    <div className="text-[20px] font-bold text-[#3b6d11]">{res.vb_moyen || '—'}</div>
                    <div className="text-[10px] text-[#5a8f30]">VB moyen (g/kg)</div>
                  </>
                )}
              </div>
            </div>
          )}

          {editing || isNew ? (
            <VBSForm
              type={form.type_materiau}
              determinations={form.determinations}
              onChange={dets => setF('determinations', dets)}
            />
          ) : (
            <VBSDisplay
              type={res.type_materiau}
              determinations={calcs}
            />
          )}
        </Card>

        {saveMut.error && (
          <p className="text-danger text-xs px-3 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded">
            {saveMut.error.message}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Composant de saisie ────────────────────────────────────────────────────────
function VBSForm({ type, determinations, onChange }) {
  const [dets, setDets] = useState(determinations.length ? determinations : [
    { actif: true, numero: 1, m_echantillon: '', m_humide: '', v_bleu: '', c_bleu: '', m_seche: '' }
  ])

  useEffect(() => {
    setDets(determinations.length ? determinations : [
      { actif: true, numero: 1, m_echantillon: '', m_humide: '', v_bleu: '', c_bleu: '', m_seche: '' }
    ])
  }, [determinations])

  function updateDet(index, field, value) {
    const updated = dets.map((det, i) =>
      i === index ? { ...det, [field]: value } : det
    )
    setDets(updated)
    onChange(updated)
  }

  function addDetermination() {
    const newDet = {
      actif: true,
      numero: dets.length + 1,
      m_echantillon: '',
      m_humide: '',
      v_bleu: '',
      c_bleu: '',
      m_seche: ''
    }
    const updated = [...dets, newDet]
    setDets(updated)
    onChange(updated)
  }

  function removeDetermination(index) {
    const updated = dets.filter((_, i) => i !== index)
    setDets(updated)
    onChange(updated)
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">#</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'Masse échantillon (g)' : 'Masse humide (g)'}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Volume bleu (mL)</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Conc. bleu (g/L)</th>
              {type === 'sols' && (
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Masse sèche (g)</th>
              )}
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'VBS (g/kg)' : 'VB (g/kg)'}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted"></th>
            </tr>
          </thead>
          <tbody>
            {dets.map((det, index) => {
              const calcs = calcVBS([det], type)[0]
              const result = type === 'granulats' ? calcs.vbs : calcs.vb

              return (
                <tr key={index} className="border-b border-border">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={det.actif}
                      onChange={e => updateDet(index, 'actif', e.target.checked)}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={type === 'granulats' ? det.m_echantillon : det.m_humide}
                      onChange={e => updateDet(index, type === 'granulats' ? 'm_echantillon' : 'm_humide', e.target.value)}
                      className="w-24 px-2 py-1 border border-border rounded text-sm"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.1"
                      value={det.v_bleu}
                      onChange={e => updateDet(index, 'v_bleu', e.target.value)}
                      className="w-20 px-2 py-1 border border-border rounded text-sm"
                      placeholder="0.0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.1"
                      value={det.c_bleu}
                      onChange={e => updateDet(index, 'c_bleu', e.target.value)}
                      className="w-20 px-2 py-1 border border-border rounded text-sm"
                      placeholder="0.0"
                    />
                  </td>
                  {type === 'sols' && (
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={det.m_seche}
                        onChange={e => updateDet(index, 'm_seche', e.target.value)}
                        className="w-24 px-2 py-1 border border-border rounded text-sm"
                        placeholder="0.00"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span className={`text-sm font-bold ${result ? 'text-accent' : 'text-text-muted'}`}>
                      {result || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => removeDetermination(index)}
                      className="text-danger hover:text-danger-dark text-sm px-2"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Button onClick={addDetermination} size="sm" variant="secondary">
        + Ajouter une détermination
      </Button>
    </div>
  )
}

// ── Composant d'affichage ──────────────────────────────────────────────────────
function VBSDisplay({ type, determinations }) {
  const valides = determinations.filter(d => d.actif && (d.vbs !== null || d.vb !== null))

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">#</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'Masse échantillon (g)' : 'Masse humide (g)'}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Volume bleu (mL)</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Conc. bleu (g/L)</th>
              {type === 'sols' && (
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Masse sèche (g)</th>
              )}
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'VBS (g/kg)' : 'VB (g/kg)'}
              </th>
            </tr>
          </thead>
          <tbody>
            {valides.map((det, index) => {
              const result = type === 'granulats' ? det.vbs : det.vb

              return (
                <tr key={index} className="border-b border-border">
                  <td className="px-3 py-2 text-sm">{det.numero || index + 1}</td>
                  <td className="px-3 py-2 text-sm">
                    {type === 'granulats' ? det.m_echantillon : det.m_humide || det.m_seche}
                  </td>
                  <td className="px-3 py-2 text-sm">{det.v_bleu}</td>
                  <td className="px-3 py-2 text-sm">{det.c_bleu}</td>
                  {type === 'sols' && (
                    <td className="px-3 py-2 text-sm">{det.m_seche}</td>
                  )}
                  <td className="px-3 py-2">
                    <span className="text-sm font-bold text-accent">{result}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {valides.length === 0 && (
        <p className="text-[13px] text-text-muted italic text-center py-4">
          Aucune détermination valide
        </p>
      )}
    </div>
  )
}
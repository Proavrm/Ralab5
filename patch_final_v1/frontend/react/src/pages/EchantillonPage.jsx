/**
 * EchantillonPage.jsx — Fiche échantillon laboratoire
 * Route: /echantillons/:uid
 *       /echantillons/new?demande_id=123
 *
 * Fonctions:
 *  - Créer un échantillon lié à une demande
 *  - Voir / modifier les informations de l'échantillon
 *  - Lister les essais associés et naviguer vers chacun
 *  - Créer un nouvel essai → navigate vers EssaiPage (/essais/:uid)
 */
import { useState } from 'react'
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
    <div className="flex flex-col gap-0.5 mb-2">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}>{value || '—'}</span>
    </div>
  )
}
const STAT_CLS = {
  'Reçu':      'bg-[#e6f1fb] text-[#185fa5]',
  'En attente':'bg-[#faeeda] text-[#854f0b]',
  'En cours':  'bg-[#faeeda] text-[#854f0b]',
  'Terminé':   'bg-[#eaf3de] text-[#3b6d11]',
  'Rejeté':    'bg-[#fcebeb] text-[#a32d2d]',
}
const ESSAI_STAT_CLS = {
  'Programmé': 'bg-[#e6f1fb] text-[#185fa5]',
  'En cours':  'bg-[#faeeda] text-[#854f0b]',
  'Terminé':   'bg-[#eaf3de] text-[#3b6d11]',
  'Annulé':    'bg-[#f1efe8] text-[#5f5e5a]',
}
function Badge({ s, map }) {
  return s ? (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${(map||{})[s]||'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
  ) : null
}

function getEssaiDisplayStatus(e) {
  return e?.date_fin ? 'Terminé' : (e?.statut || '')
}

function getEssaiTone(status) {
  if (status === 'Terminé') {
    return {
      row: 'border-[#cfe0ba] bg-[#f6fbf2] hover:border-[#9fbe78] hover:bg-[#eef6e8]',
      label: 'text-[#3b6d11] bg-[#eef6e8] border border-[#c6dca8] px-2 py-0.5 rounded-full',
      result: 'text-[#3b6d11]',
    }
  }

  return {
    row: 'border-border hover:border-accent hover:bg-bg',
    label: 'text-accent',
    result: 'text-accent',
  }
}

// Types d'essais disponibles dans EssaiPage
// ÉVOLUTION: ajouter ici quand un nouveau type est implémenté dans EssaiPage
const TYPES_ESSAI = [
  { code: 'WE',  label: 'Teneur en eau naturelle',       norme: 'Détermination de la Teneur en Eau (NF P 94 049 et NF P 94 050)' },
  { code: 'GR',  label: 'Granulométrie',                norme: 'NF P 94-056' },
  { code: 'LA',  label: "Limites d'Atterberg",        norme: 'NF P 94-051' },
  { code: 'VBS', label: 'Prise d\'essai au bleu (sols)',    norme: 'NF P 94-068', init_resultats: '{"type_materiau":"sols"}' },
  { code: 'MB',  label: 'Valeur au bleu 0/2mm',           norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mb_0_2"}' },
  { code: 'MBF', label: 'MValeur au bleu 0/0.125mm',      norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mbf_0_0125"}' },
  { code: 'ES',  label: 'Équivalent de sable',          norme: 'NF P 94-055' },
  { code: 'PN',  label: 'Proctor Normal',              norme: 'NF P 94-093' },
  { code: 'IPI', label: 'IPI',                        norme: 'NF P 94-078' },
  { code: 'ID',  label: 'Identification GTR',         norme: 'NF P 11-300' },
]

function parseResults(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw

  let value = raw
  for (let i = 0; i < 3; i++) {
    if (typeof value !== 'string') break
    const s = value.trim()
    if (!s) return {}
    try {
      value = JSON.parse(s)
    } catch {
      break
    }
  }
  return typeof value === 'object' && value !== null ? value : {}
}

function parseResultNumber(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isNaN(v) ? null : v
  const s = String(v).trim().replace(',', '.')
  const direct = Number(s)
  if (!Number.isNaN(direct)) return direct
  const m = s.match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isNaN(n) ? null : n
}

function computeBlueDeterminationValue(det, material, root, coeffFromGR = null) {
  const stored = parseResultNumber(material === 'granulats' ? det?.vbs : (det?.vbs ?? det?.vb))
  if (stored != null && stored > 0) return stored

  const v = parseResultNumber(det?.v_bleu)
  if (v == null) return stored

  if (material === 'granulats') {
    const m = parseResultNumber(det?.m_echantillon)
    const c = parseResultNumber(det?.c_bleu)
    if (m != null && m > 0 && c != null) return (v * c) / m
    return stored
  }

  const mh = parseResultNumber(det?.m_humide)
  const w = parseResultNumber(root?.w)
  const m0FromW = (mh != null && w != null && (100 + w) > 0) ? (100 * mh) / (100 + w) : null
  const m0 = parseResultNumber(det?.m_seche) ?? m0FromW
  const c = parseResultNumber(root?.coeff_vbs) ?? parseResultNumber(coeffFromGR) ?? 1
  if (m0 != null && m0 > 0) return (c * v) / m0
  return stored
}

function meanFromDeterminations(r, material, coeffFromGR = null) {
  const dets = Array.isArray(r?.determinations) ? r.determinations : []
  const vals = dets
    .filter(d => d?.actif !== false)
    .map(d => computeBlueDeterminationValue(d, material, r, coeffFromGR))
    .filter(v => v !== null)
  if (!vals.length) return null
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return mean
}

function getCoeffFromSiblingGR(currentEssai, allEssais) {
  const list = Array.isArray(allEssais) ? allEssais : []
  const currentUid = String(currentEssai?.uid || '')
  const gr = list.find(x => String(x?.uid || '') !== currentUid && String(x?.essai_code || x?.code_essai || '').toUpperCase() === 'GR')
  if (!gr) return null
  const rr = parseResults(gr.resultats)
  return parseResultNumber(rr?.coeff_vbs)
}

function formatFixed2(n) {
  return Number(n).toFixed(2)
}

function formatEssaiDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleDateString('fr-FR')
}

function getEssaiDateLabel(e) {
  return formatEssaiDate(e?.date_debut || e?.date_fin || e?.created_at)
}

function computeMBValue(r, codeUpper) {
  const material = String(r?.type_materiau || '').toLowerCase()
  const isMBF = codeUpper === 'MBF' || material === 'mbf_0_0125'
  let value = parseResultNumber(isMBF ? r?.mbf : r?.mb)

  if (value == null) {
    const ms = parseResultNumber(r?.ms)
    const v1 = parseResultNumber(r?.v1)
    const useKaolinite = Boolean(r?.use_kaolinite)
    const vPrime = useKaolinite ? (parseResultNumber(r?.v_prime) ?? 0) : 0
    if (ms != null && ms > 0 && v1 != null) {
      value = ((v1 - vPrime) * 10) / ms
    }
  }

  if (value == null) return null
  return {
    label: isMBF ? 'MBF' : 'MB',
    value,
  }
}

function getAssayLabel(e) {
  const code = e.essai_code || e.code_essai || ''
  const type = TYPES_ESSAI.find(t => t.code === code || t.label === e.type_essai)
  const rawLabel = type?.label || e.type_essai || ''

  if (['MB','MBF'].includes(code)) {
    const r = parseResults(e.resultats)
    if (r.type_materiau === 'mb_0_2')     return 'MB — Valeur au bleu 0/2mm'
    if (r.type_materiau === 'mbf_0_0125') return 'MBF — Valeur au bleu 0/0.125mm'
    return code === 'MB' ? 'MB — Valeur au bleu 0/2mm' : 'MBF — Valeur au bleu 0/0.125mm'
  }
  if (code === 'WE' || e.type_essai?.includes('Teneur en eau') || e.type_essai?.includes('eau naturelle')) {
    const r = parseResults(e.resultats)
    const usageLabels = {
      'wn':           'Wn — Teneur en eau naturelle',
      'vbs':          'VBS — Prise d\'essai au bleu (< 5mm)',
      'coupure_20':   'Coupure 0/20mm',
      'coupure_5':    'Coupure 0/5mm',
      'coupure_0250': 'MB — Fraction 0/0.250mm',
      'coupure_0125': 'MBF — Fraction 0/0.125mm',
      'proctor':      'Proctor — teneur en eau',
      'traitement':   'Traitement — teneur en eau',
      'wl':           'wL — Limite de liquidité',
      'wp':           'wP — Limite de plasticité',
    }
    if (r.usage && usageLabels[r.usage]) return usageLabels[r.usage]
  }

  if (code) return `${code} — ${rawLabel || code}`
  return rawLabel || '—'
}

// Résultat principal de chaque type d'essai — affiché dans la liste
// ÉVOLUTION: ajouter ici quand un nouveau type est implémenté
function getResultat(e, allEssais = []) {
  try {
    if (e?.resultat_label) return String(e.resultat_label)
    const r = parseResults(e.resultats)
    const code = e.essai_code || e.code_essai || ''
    const codeUpper = String(code).toUpperCase()
    const type = e.type_essai || ''
    const label = e.essai_label || ''
    const normType = `${type} ${label}`.toLowerCase()
    const mbResult = computeMBValue(r, codeUpper)
    const isBlue = ['VBS', 'BM', 'VB'].includes(codeUpper)
      || normType.includes('bleu')
      || normType.includes('vbs')
      || normType.includes('prise d\'essai au bleu')
    if (code === 'WE' || type === 'Teneur en eau' || type === 'Teneur en eau naturelle')
      return r.w_moyen != null ? `w = ${r.w_moyen} %` : null
    if (code === 'GR' || type === 'Granulométrie')
      return r.passant_80 != null ? `P80µm = ${r.passant_80} %` : null
    if (mbResult)
      return `${mbResult.label} = ${formatFixed2(mbResult.value)} g/kg`
    if (isBlue) {
      const coeffFromGR = getCoeffFromSiblingGR(e, allEssais)
      const material = r.type_materiau
        || (normType.includes('granulat') ? 'granulats' : null)
        || (normType.includes('sol') ? 'sols' : null)
        || (codeUpper === 'BM' ? 'granulats' : codeUpper === 'VBS' ? 'sols' : null)
      const vbsMean = parseResultNumber(r.vbs_moyen)
      const vbMean = parseResultNumber(r.vb_moyen)
      const directValue = parseResultNumber(r.vbs ?? r.vb ?? r.valeur ?? r.value ?? r.resultat)
      const detMean = meanFromDeterminations(r, material, coeffFromGR)

      if (material === 'granulats') {
        const value = vbsMean != null ? vbsMean : detMean
        return value != null ? `VBS = ${formatFixed2(value)} g/kg` : null
      }

      if (material === 'sols') {
        const preferred = (vbsMean != null && vbsMean > 0) ? vbsMean
          : (vbMean != null && vbMean > 0) ? vbMean
          : (detMean != null && detMean > 0) ? detMean
          : (vbsMean != null) ? vbsMean
          : (vbMean != null) ? vbMean
          : detMean
        if (preferred != null) return `VBS = ${formatFixed2(preferred)} g/100g`
      }

      const fallback = (vbsMean != null) ? vbsMean : (vbMean != null) ? vbMean : (directValue != null) ? directValue : detMean
      if (fallback != null) {
        const unit = codeUpper === 'BM' ? 'g/kg' : 'g/100g'
        return `VBS = ${formatFixed2(fallback)} ${unit}`
      }

      return null
    }
    if (code === 'PN' || type === 'Proctor Normal' || type === 'Proctor Modifié') {
      if (r.rho_d_OPN_corr != null)
        return `ρdOPN = ${r.rho_d_OPN_corr} Mg/m³ (corr. — wOPN=${r.wOPN_corr??'?'}%)`
      if (r.rho_d_OPN != null)
        return `ρdOPN = ${r.rho_d_OPN} Mg/m³${r.wOPN!=null?` (wOPN=${r.wOPN}%)`:''}` 
      return null
    }
    // AJOUTER ICI: résultat principal des autres types
  } catch {}
  return null
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function EchantillonPage() {
  const { uid }          = useParams()
  const navigate         = useNavigate()
  const [searchParams]   = useSearchParams()
  const qc               = useQueryClient()
  const isNew            = uid === 'new'
  const demandeIdFromUrl = searchParams.get('demande_id')

  const [editing, setEditing] = useState(isNew)
  const [deleteMode, setDeleteMode] = useState(false)
  const [form, setForm] = useState({
    demande_id:          demandeIdFromUrl || '',
    designation:         '',
    profondeur_haut:     '',
    profondeur_bas:      '',
    date_prelevement:    '',
    localisation:        '',
    statut:              'Reçu',
    date_reception_labo: '',
    observations:        '',
  })
  const [newEssaiCode, setNewEssaiCode] = useState('WE')

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // ── Données ────────────────────────────────────────────────────────────────
  const { data: ech, isLoading, isError } = useQuery({
    queryKey: ['echantillon', uid],
    queryFn:  () => api.get(`/essais/echantillons/${uid}`),
    enabled:  !isNew,
  })

  const { data: essais = [] } = useQuery({
    queryKey: ['essais-ech', uid],
    queryFn:  () => api.get(`/essais?echantillon_id=${uid}`),
    enabled:  !isNew,
  })

  const demandeId = ech?.demande_id || form.demande_id
  const { data: demande } = useQuery({
    queryKey: ['demande-light', String(demandeId)],
    queryFn:  () => api.get(`/demandes_rst/${demandeId}`),
    enabled:  !!demandeId,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (data) => isNew
      ? api.post('/essais/echantillons', data)
      : api.put(`/essais/echantillons/${uid}`, data),
    onSuccess: (saved) => {
      if (isNew) navigate(`/echantillons/${saved.uid}`, { replace: true })
      else { qc.invalidateQueries({ queryKey: ['echantillon', uid] }); setEditing(false) }
    },
  })

  const deleteEssaiMut = useMutation({
    mutationFn: (essaiId) => api.delete(`/essais/${essaiId}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['essais-ech', uid] }),
  })

  function handleSave() {
    saveMut.mutate({
      demande_id:          parseInt(form.demande_id) || ech?.demande_id,
      designation:         form.designation,
      profondeur_haut:     form.profondeur_haut !== '' ? parseFloat(form.profondeur_haut) : null,
      profondeur_bas:      form.profondeur_bas  !== '' ? parseFloat(form.profondeur_bas)  : null,
      date_prelevement:    form.date_prelevement    || null,
      localisation:        form.localisation,
      statut:              form.statut,
      date_reception_labo: form.date_reception_labo || null,
      observations:        form.observations,
    })
  }

  function handleCreateEssai() {
    const type = TYPES_ESSAI.find(t => t.code === newEssaiCode)
    // Ne pas créer dans la BD tout de suite — l'essai est créé au Enregistrer
    const params = new URLSearchParams({
      echantillon_id: uid,
      essai_code:     newEssaiCode,
      type_essai:     type?.label || newEssaiCode,
      norme:          type?.norme || '',
      init_resultats: type?.init_resultats || '{}',
    })
    navigate(`/essais/new?${params.toString()}`)
  }

  // Init form quand ech chargé
  if (!isNew && ech && editing && !form.designation && ech.designation) {
    setForm({
      demande_id:          ech.demande_id || '',
      designation:         ech.designation || '',
      profondeur_haut:     ech.profondeur_haut ?? '',
      profondeur_bas:      ech.profondeur_bas  ?? '',
      date_prelevement:    ech.date_prelevement || '',
      localisation:        ech.localisation || '',
      statut:              ech.statut || 'Reçu',
      date_reception_labo: ech.date_reception_labo || '',
      observations:        ech.observations || '',
    })
  }

  if (!isNew && isLoading) return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  if (!isNew && (isError || !ech)) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Échantillon introuvable</p>
      <Button onClick={() => navigate(-1)}>← Retour</Button>
    </div>
  )

  const d = isNew ? null : ech

  return (
    <div className={`flex flex-col h-full overflow-y-auto ${deleteMode ? 'bg-red-50' : ''}`}>

      {/* Topbar */}
      <div className={`flex items-center gap-3 px-6 py-3 border-b border-border shrink-0 flex-wrap ${deleteMode ? 'bg-red-100' : 'bg-surface'}`}>
        <button onClick={() => navigate(-1)}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors">
          ← Retour
        </button>
        {demande && <span className="text-[13px] text-text-muted">{demande.reference} › </span>}
        <span className="text-[14px] font-semibold flex-1 font-mono">
          {isNew ? 'Nouvel échantillon' : (d?.reference || `ECH #${uid}`)}
        </span>
        {!isNew && <Badge s={d?.statut} map={STAT_CLS} />}
        {editing && !isNew ? (
          <>
            <Button onClick={() => setEditing(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? '…' : '✓ Enregistrer'}
            </Button>
          </>
        ) : isNew ? (
          <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending || !form.demande_id}>
            {saveMut.isPending ? '…' : "✓ Créer l'échantillon"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant={deleteMode ? "danger" : "secondary"} onClick={() => {
              setDeleteMode(!deleteMode)
              if (editing) setEditing(false)
            }}>
              {deleteMode ? '✗ Annuler suppression' : '🗑️ Supprimer essais'}
            </Button>
            <Button size="sm" variant="primary" onClick={() => {
              setForm({
                demande_id: d.demande_id||'', designation: d.designation||'',
                profondeur_haut: d.profondeur_haut??'', profondeur_bas: d.profondeur_bas??'',
                date_prelevement: d.date_prelevement||'', localisation: d.localisation||'',
                statut: d.statut||'Reçu', date_reception_labo: d.date_reception_labo||'',
                observations: d.observations||'',
              })
              setEditing(true)
              if (deleteMode) setDeleteMode(false)
            }}>✏️ Modifier</Button>
          </div>
        )}
      </div>

      <div className={`p-5 max-w-[860px] mx-auto w-full flex flex-col gap-4 ${deleteMode ? 'bg-red-50' : ''}`}>

        {deleteMode && (
          <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-red-800">
              <span className="text-lg">⚠️</span>
              <span className="font-semibold">Mode suppression activé</span>
            </div>
            <p className="text-red-700 text-sm mt-1">
              Cliquez sur "Supprimer" pour supprimer un essai. Cette action est irréversible.
            </p>
          </div>
        )}

        {/* Infos */}
        <Card title={editing || isNew ? "Informations échantillon" : "Échantillon"}>
          {editing || isNew ? (
            <div className="grid grid-cols-2 gap-3">
              {isNew && (
                <FG label="ID Demande *">
                  <Input type="number" value={form.demande_id}
                    onChange={e => setF('demande_id', e.target.value)}
                    placeholder="ID de la demande parente" />
                </FG>
              )}
              <FG label="Désignation">
                <Input value={form.designation} onChange={e => setF('designation', e.target.value)}
                  placeholder="ex: Argile beige, Sable gris…" />
              </FG>
              <FG label="Profondeur haut (m)">
                <Input type="number" step="0.01" value={form.profondeur_haut}
                  onChange={e => setF('profondeur_haut', e.target.value)} placeholder="ex: 1.50" />
              </FG>
              <FG label="Profondeur bas (m)">
                <Input type="number" step="0.01" value={form.profondeur_bas}
                  onChange={e => setF('profondeur_bas', e.target.value)} placeholder="ex: 2.00" />
              </FG>
              <FG label="Date prélèvement">
                <Input type="date" value={form.date_prelevement}
                  onChange={e => setF('date_prelevement', e.target.value)} />
              </FG>
              <FG label="Localisation">
                <Input value={form.localisation} onChange={e => setF('localisation', e.target.value)}
                  placeholder="ex: SP1 à 1.50m" />
              </FG>
              <FG label="Statut">
                <Select value={form.statut} onChange={e => setF('statut', e.target.value)} className="w-full">
                  {['Reçu','En attente','En cours','Terminé','Rejeté'].map(s => <option key={s}>{s}</option>)}
                </Select>
              </FG>
              <FG label="Date réception labo">
                <Input type="date" value={form.date_reception_labo}
                  onChange={e => setF('date_reception_labo', e.target.value)} />
              </FG>
              <div className="col-span-2">
                <FG label="Observations">
                  <textarea value={form.observations} onChange={e => setF('observations', e.target.value)}
                    rows={2} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
                </FG>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <FR label="Référence"        value={d?.reference} />
                <FR label="Désignation"      value={d?.designation} />
                <FR label="Profondeur"       value={d?.profondeur_haut != null ? `${d.profondeur_haut} — ${d?.profondeur_bas ?? '?'} m` : null} />
                <FR label="Localisation"     value={d?.localisation} />
              </div>
              <div>
                <FR label="Demande"          value={demande?.reference} />
                <FR label="Date prélèvement" value={d?.date_prelevement} />
                <FR label="Réception labo"   value={d?.date_reception_labo} />
                {d?.observations && <FR label="Observations" value={d.observations} />}
              </div>
            </div>
          )}
        </Card>

        {/* Essais */}
        {!isNew && (
          <Card title={`Essais (${essais.length})`}>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border flex-wrap">
              <Select value={newEssaiCode} onChange={e => setNewEssaiCode(e.target.value)} className="text-sm">
                {TYPES_ESSAI.map(t => (
                  <option key={t.code} value={t.code}>{t.code} — {t.label}</option>
                ))}
              </Select>
              <Button variant="primary" size="sm" onClick={handleCreateEssai}>
                + Créer cet essai
              </Button>
            </div>
            {essais.length === 0 ? (
              <p className="text-[13px] text-text-muted italic text-center py-4">Aucun essai</p>
            ) : (
              <div className="flex flex-col gap-2">
                {essais.map(e => {
                  const resultat = getResultat(e, essais)
                  const essaiDate = getEssaiDateLabel(e)
                  const displayStatus = getEssaiDisplayStatus(e)
                  const tone = getEssaiTone(displayStatus)
                  return (
                    <div key={e.uid} className={`flex items-center justify-between gap-3 px-4 py-3 border rounded-lg transition-colors ${
                      deleteMode 
                        ? 'border-red-300 bg-red-50 cursor-default' 
                        : `${tone.row} cursor-pointer`
                    }`}>
                      <div onClick={deleteMode ? undefined : () => {
                        navigate(`/essais/${e.uid}`)
                      }} className={deleteMode ? '' : 'flex-1'}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[12px] font-bold font-mono ${tone.label}`}>{getAssayLabel(e)}</span>
                          {essaiDate && <span className="text-[11px] font-medium text-text-muted">· {essaiDate}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {e.reference && <span className="text-[11px] text-text-muted font-mono">{e.reference}</span>}
                          {e.norme     && <span className="text-[11px] text-text-muted">{e.norme}</span>}
                          {e.operateur && <span className="text-[11px] text-text-muted">· {e.operateur}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {resultat && <span className={`text-[12px] font-bold ${tone.result}`}>{resultat}</span>}
                        <Badge s={displayStatus} map={ESSAI_STAT_CLS} />
                        {deleteMode ? (
                          <Button size="sm" variant="danger" 
                            onClick={() => {
                              if (confirm(`Supprimer l'essai "${e.type_essai}" (${e.reference || e.uid}) ?`)) {
                                deleteEssaiMut.mutate(e.uid)
                              }
                            }}
                            disabled={deleteEssaiMut.isPending}>
                            🗑️ Supprimer
                          </Button>
                        ) : (
                          <span className="text-text-muted text-[12px]">→</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {saveMut.error && (
          <p className="text-danger text-xs px-3 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded">
            {saveMut.error.message}
          </p>
        )}

      </div>
    </div>
  )
}

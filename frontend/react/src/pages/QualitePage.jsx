/**
 * QualitePage.jsx — 5 tabs fidèles à qualite.html
 * Équipements · Métrologie · Procédures · Normes · QSSE / FNC
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import TabQSSE from './components/TabQSSE'

// ── Helpers ────────────────────────────────────────────────────────────────
const STAT_CLS = {
  'En service':    'bg-[#eaf3de] text-[#3b6d11]',
  'En maintenance':'bg-[#faeeda] text-[#854f0b]',
  'Hors service':  'bg-[#fcebeb] text-[#a32d2d]',
  'Non utilisé':   'bg-[#f1efe8] text-[#5f5e5a]',
  'Réformé':       'bg-[#f1efe8] text-[#5f5e5a]',
}
const DOC_CLS = {
  'En vigueur':'bg-[#eaf3de] text-[#3b6d11]',
  'En révision':'bg-[#faeeda] text-[#854f0b]',
  'Obsolète':'bg-[#f1efe8] text-[#5f5e5a]',
  'Projet':'bg-[#e6f1fb] text-[#185fa5]',
}
const NC_SEV_CLS = {
  'Mineure':'bg-[#e6f1fb] text-[#185fa5]',
  'Majeure':'bg-[#fcebeb] text-[#a32d2d]',
  'Observation':'bg-[#f1efe8] text-[#5f5e5a]',
}
const NC_STAT_CLS = {
  'Ouverte':'bg-[#fcebeb] text-[#a32d2d]',
  'En cours':'bg-[#faeeda] text-[#854f0b]',
  'Clôturée':'bg-[#eaf3de] text-[#3b6d11]',
  'Vérifiée':'bg-[#e6f1fb] text-[#185fa5]',
}
const NC_OPEN_FILTER_VALUE = '__open__'
const NC_OPEN_STATUSES = ['Ouverte', 'En cours']
const CAT_CLS = {
  'Labo':'bg-[#e6f1fb] text-[#185fa5]',
  'Terrain':'bg-[#eaf3de] text-[#3b6d11]',
  'Métrologie':'bg-[#eeedfe] text-[#534ab7]',
  'Tamis':'bg-[#faeeda] text-[#854f0b]',
  'Vérification':'bg-[#e0f5ef] text-[#0f6e56]',
  'Informatique':'bg-[#f1efe8] text-[#5f5e5a]',
  'Autre':'bg-[#f1efe8] text-[#5f5e5a]',
}
function Badge({ s, map }) {
  if (!s) return null
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${(map||{})[s]||'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
}
function useSearch(delay = 250) {
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const timer = useRef(null)
  function onChange(v) {
    setValue(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(v), delay)
  }
  return { value, debounced, onChange }
}
function FG({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}
function TA({ value, onChange, rows = 2 }) {
  return <textarea value={value||''} onChange={e=>onChange(e.target.value)} rows={rows}
    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"/>
}
function DF({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 mb-2 last:mb-0">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}>{value||'—'}</span>
    </div>
  )
}
function DetailPanel({ visible, onClose, children }) {
  if (!visible) return null
  return (
    <div className="w-[340px] min-w-[300px] border-l border-border bg-surface flex flex-col overflow-y-auto shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Détail</span>
        <button onClick={onClose} className="text-text-muted hover:text-text text-lg leading-none">×</button>
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        {children}
      </div>
    </div>
  )
}

function getEquipmentProfile(item) {
  const text = [
      item?.code,
      item?.label,
      item?.domain,
      item?.category,
      item?.notes,
  ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  if (
      text.includes('pqi') ||
      text.includes('gamma') ||
      text.includes('gammadens') ||
      text.includes('electrodens') ||
      text.includes('densimetre')
  ) {
      return 'gammadensimetre'
  }

  if (text.includes('comparateur') && !text.includes('support')) {
      return 'comparateur'
  }

  if (text.includes('anneau') || text.includes('dynamom') || text.includes('capteur')) {
      return 'anneau'
  }

  if (
      text.includes('moule') ||
      text.includes('corps de') ||
      text.includes('cbr') ||
      text.includes('proctor') ||
      text.includes(' pn')
  ) {
      return 'moule'
  }

  return 'generic'
}

function parseOptionalFloat(value) {
  return value === '' || value == null ? null : parseFloat(value)
}

function parseOptionalInt(value) {
  if (value === '' || value == null) return null
  const parsed = parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalText(value) {
  if (value == null) return null

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized || null
  }

  // UI event safety (when handlers accidentally forward events)
  if (value && typeof value === 'object' && 'target' in value) {
    return parseOptionalText(value.target?.value)
  }

  // Avoid persisting "[object Object]" in text fields.
  return null
}

function normalizeEquipmentStatus(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'En service'
  if (raw === 'hs' || raw === 'hors service' || raw === 'hors-service') return 'Hors service'
  if (raw === 'en service' || raw === 'active' || raw === 'actif') return 'En service'
  if (raw === 'maintenance' || raw === 'en maintenance') return 'En maintenance'
  if (raw === 'reforme' || raw === 'réformé' || raw === 'reformé') return 'Réformé'
  if (raw === 'non utilise' || raw === 'non utilisé') return 'Non utilisé'
  return String(value || '').trim()
}

function normalizeEquipmentCategory(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'Labo'
  if (raw === 'terrain') return 'Terrain'
  if (raw === 'labo' || raw === 'laboratoire') return 'Labo'
  if (raw === 'metrologie' || raw === 'métrologie') return 'Métrologie'
  if (raw === 'informatique') return 'Informatique'
  if (raw === 'tamis') return 'Tamis'
  if (raw === 'verification' || raw === 'vérification') return 'Vérification'
  if (raw === 'autre') return 'Autre'
  return String(value || '').trim()
}

function readSelectValue(input) {
  if (input && typeof input === 'object' && 'target' in input) {
    return input.target?.value
  }
  return input
}

function buildEquipmentPayload(form) {
  const profile = getEquipmentProfile(form)
  const payload = {
    code: String(form.code || '').trim(),
    label: String(form.label || '').trim(),
    category: normalizeEquipmentCategory(form.category),
    status: normalizeEquipmentStatus(form.status),
    domain: parseOptionalText(form.domain),
    serial_number: parseOptionalText(form.serial_number),
    supplier: parseOptionalText(form.supplier),
    purchase_date: parseOptionalText(form.purchase_date),
    lieu: parseOptionalText(form.lieu),
    labo_code: parseOptionalText(form.labo_code),
    notes: parseOptionalText(form.notes),
    etalonnage_interval: parseOptionalInt(form.etalonnage_interval),
    verification_interval: parseOptionalInt(form.verification_interval),
    // Keep metrology dates in the save payload so mutation can sync qualite_metrology.
    last_metrology: parseOptionalText(form.last_metrology),
    next_metrology: parseOptionalText(form.next_metrology),
    division: parseOptionalText(form.division),
    precision: parseOptionalText(form.precision),
    m_tare: parseOptionalFloat(form.m_tare),
    volume_cm3: parseOptionalFloat(form.volume_cm3),
    capacite: parseOptionalFloat(form.capacite),
    sensibilite: parseOptionalFloat(form.sensibilite),
    facteur_k: parseOptionalFloat(form.facteur_k),
  }

  if (profile === 'comparateur') {
    payload.m_tare = null
    payload.volume_cm3 = null
    payload.capacite = null
    payload.sensibilite = null
    payload.facteur_k = null
  } else if (profile === 'moule') {
    payload.division = null
    payload.precision = null
    payload.capacite = null
    payload.sensibilite = null
    payload.facteur_k = null
  } else if (profile === 'anneau') {
    payload.division = null
    payload.precision = null
    payload.m_tare = null
    payload.volume_cm3 = null
  }

  return payload
}

async function syncEquipmentMetrologyFromForm(apiClient, equipmentUid, form) {
  const performedOn = parseOptionalText(form?.last_metrology)
  const validUntil = parseOptionalText(form?.next_metrology)
  if (!performedOn && !validUntil) return

  const existingRows = await apiClient.get(`/qualite/equipment/${equipmentUid}/metrology`).catch(() => [])
  const metrologyRows = Array.isArray(existingRows) ? existingRows : []
  const current = metrologyRows.find((row) => String(row?.control_type || '') === 'Étalonnage') || metrologyRows[0] || null

  const payload = {
    equipment_id: equipmentUid,
    control_type: current?.control_type || 'Étalonnage',
    status: current?.status || 'Valide',
    reference: current?.reference || null,
    provider: current?.provider || null,
    notes: current?.notes || 'Saisi depuis fiche équipement',
    performed_on: performedOn,
    valid_until: validUntil,
  }

  if (current?.uid) {
    await apiClient.put(`/qualite/metrology/${current.uid}`, payload)
    return
  }

  await apiClient.post(`/qualite/equipment/${equipmentUid}/metrology`, payload)
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS BAR
// ═══════════════════════════════════════════════════════════════════════════
function StatsBar({ stats }) {
  if (!stats) return null
  const items = [
    { n: stats.equipment_active,     label: 'Équip. actifs',   cls: 'text-[#3b6d11]' },
    { n: stats.equipment_hs,         label: 'Hors service',    cls: 'text-[#a32d2d]' },
    { n: stats.metrology_due,        label: 'Étalonn. à faire',cls: stats.metrology_due > 0 ? 'text-[#854f0b]' : '' },
    { n: stats.procedures_total,     label: 'Procédures',      cls: '' },
    { n: stats.standards_total,      label: 'Normes',          cls: '' },
    { n: stats.nc_open,              label: 'NC ouvertes',     cls: stats.nc_open > 0 ? 'text-[#a32d2d]' : '' },
  ]
  return (
    <div className="flex items-center gap-5 px-6 py-2.5 bg-surface border-b border-border shrink-0 flex-wrap">
      {items.map(({ n, label, cls }) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <span className={`text-[18px] font-bold ${cls}`}>{n ?? 0}</span>
          <span className="text-[11px] text-text-muted">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB ÉQUIPEMENTS
// ═══════════════════════════════════════════════════════════════════════════
function TabEquipements({ meta, laboCode = '' }) {
  const qc = useQueryClient()
  const search = useSearch()
  const [cat, setCat] = useState('')
  const [statut, setStatut] = useState('')
  const [selected, setSelected] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [metroOpen, setMetroOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [editMetro, setEditMetro] = useState(null)

  const { data: rows = [], refetch } = useQuery({
    queryKey: ['qualite-equipment', search.debounced, cat, statut, laboCode],
    queryFn: () => {
      const p = new URLSearchParams()
      if (search.debounced) p.set('search', search.debounced)
      if (cat) p.set('category', cat)
      if (statut) p.set('status', statut)
      if (laboCode) p.set('labo_code', laboCode)
      return api.get('/qualite/equipment?' + p)
    },
  })

  const { data: metros = [] } = useQuery({
    queryKey: ['qualite-metro-eq', selected?.uid],
    queryFn: () => api.get(`/qualite/equipment/${selected.uid}/metrology`),
    enabled: !!selected,
  })

  const saveMut = useMutation({
    mutationFn: async (data) => {
      const saved = editItem?.uid
        ? await api.put(`/qualite/equipment/${editItem.uid}`, data)
        : await api.post('/qualite/equipment', data)

      const equipmentUid = saved?.uid || editItem?.uid
      if (equipmentUid) {
        await syncEquipmentMetrologyFromForm(api, equipmentUid, form)
      }

      return saved
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['qualite-equipment'] })
      qc.invalidateQueries({ queryKey: ['qualite-stats'] })
      qc.invalidateQueries({ queryKey: ['qualite-metro-eq', saved?.uid || editItem?.uid] })
      setModalOpen(false)
      setSelected(saved)
    },
  })

  const delMut = useMutation({
    mutationFn: (uid) => api.delete(`/qualite/equipment/${uid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qualite-equipment'] })
      qc.invalidateQueries({ queryKey: ['qualite-stats'] })
      setSelected(null)
    },
  })

  const saveMetroMut = useMutation({
    mutationFn: (data) => editMetro?.uid
      ? api.put(`/qualite/metrology/${editMetro.uid}`, data)
      : api.post(`/qualite/equipment/${selected.uid}/metrology`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qualite-metro-eq', selected?.uid] })
      setMetroOpen(false)
    },
  })

  const delMetroMut = useMutation({
    mutationFn: (uid) => api.delete(`/qualite/metrology/${uid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['qualite-metro-eq', selected?.uid] }),
  })

  const [form, setForm] = useState({})
  const [mform, setMform] = useState({})
  function set(k,v) { setForm(f=>({...f,[k]:v})) }
  function mset(k,v) { setMform(f=>({...f,[k]:v})) }

  function openCreate() {
    setEditItem(null)
    setForm({ code:'', label:'', category:'Labo', status:'En service', domain:'', serial_number:'', supplier:'', purchase_date:'', lieu:'', labo_code: laboCode || '', etalonnage_interval:'', verification_interval:'', notes:'', m_tare:'', volume_cm3:'', division:'', precision:'', capacite:'', sensibilite:'', facteur_k:'', last_metrology:'', next_metrology:'' })
    setModalOpen(true)
  }
  function openEdit() {
    setEditItem(selected)
    setForm({
      ...selected,
      category: normalizeEquipmentCategory(selected?.category ?? selected?.categorie),
      status: normalizeEquipmentStatus(selected?.status ?? selected?.statut),
      notes: parseOptionalText(selected?.notes) || '',
      division: selected?.division ?? '',
      precision: selected?.precision ?? '',
      etalonnage_interval: selected.etalonnage_interval??'',
      verification_interval: selected.verification_interval??'',
    })
    setModalOpen(true)
  }
  function openMetro(m=null) {
    setEditMetro(m)
    setMform(m ? { ...m } : { control_type:'Étalonnage', status:'Valide', reference:'', provider:'', performed_on:'', valid_until:'', notes:'' })
    setMetroOpen(true)
  }

  const selectedProfile = getEquipmentProfile(selected)
  const selectedComparator = {
    division: selected?.division ?? null,
    precision: selected?.precision ?? null,
  }

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-border shrink-0 flex-wrap">
          {laboCode ? (
            <span className="text-[11px] font-medium text-accent bg-[#eeeffe] border border-[#c7d2fe] rounded-full px-2.5 py-1">
              Labo {laboCode}
            </span>
          ) : null}
          <Input value={search.value} onChange={e=>search.onChange(e.target.value)}
            placeholder="Code, désignation…" className="w-[220px]" />
          <Select value={cat} onChange={e=>setCat(e.target.value)} className="text-sm">
            <option value="">— Catégorie —</option>
            {(meta?.categories_eq||[]).map(c=><option key={c}>{c}</option>)}
          </Select>
          <Select value={statut} onChange={e=>setStatut(e.target.value)} className="text-sm">
            <option value="">— Statut —</option>
            {(meta?.statuts_eq||[]).map(s=><option key={s}>{s}</option>)}
          </Select>
          <span className="text-xs text-text-muted ml-auto">{rows.length} équipement{rows.length!==1?'s':''}</span>
          <Button size="sm" variant="primary" onClick={openCreate}>+ Ajouter</Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>{['Code','Désignation','Catégorie','Domaine','Lieu','Statut','Étalonnage','Vérif.'].map(h=>(
                <th key={h} className="bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.length===0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-text-muted text-xs">Aucun équipement</td></tr>
              ) : rows.map(r=>(
                <tr key={r.uid} onClick={()=>setSelected(r)}
                  className={`border-b border-border cursor-pointer transition-colors ${selected?.uid===r.uid?'bg-[#eeeffe]':'hover:bg-bg'}`}>
                  <td className="px-3 py-2 font-mono text-[12px] text-accent font-bold">{r.code}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.label}</td>
                  <td className="px-3 py-2"><Badge s={normalizeEquipmentCategory(r.category ?? r.categorie)} map={CAT_CLS}/></td>
                  <td className="px-3 py-2 text-xs text-text-muted">{r.domain||'—'}</td>
                  <td className="px-3 py-2 text-xs">{r.lieu||'—'}</td>
                  <td className="px-3 py-2"><Badge s={normalizeEquipmentStatus(r.status ?? r.statut)} map={STAT_CLS}/></td>
                  <td className="px-3 py-2 text-xs">{r.next_metrology ? formatDate(r.next_metrology) : '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.etalonnage_interval ? `${r.etalonnage_interval} mois` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail */}
      <DetailPanel visible={!!selected} onClose={()=>setSelected(null)}>
        {selected && <>
          <div>
            <div className="text-accent font-bold font-mono">{selected.code}</div>
            <div className="text-[14px] font-semibold mt-0.5">{selected.label}</div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <Badge s={normalizeEquipmentStatus(selected.status ?? selected.statut)} map={STAT_CLS}/>
              <Badge s={normalizeEquipmentCategory(selected.category ?? selected.categorie)} map={CAT_CLS}/>
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <DF label="Domaine" value={selected.domain}/>
            <DF label="N° série" value={selected.serial_number}/>
            <DF label="Fournisseur" value={selected.supplier}/>
            <DF label="Date achat" value={formatDate(selected.purchase_date)}/>
            <DF label="Lieu" value={selected.lieu}/>
            <DF label="Code labo" value={selected.labo_code}/>
            <DF label="Intervalle étalonnage" value={selected.etalonnage_interval ? `${selected.etalonnage_interval} mois` : null}/>
            <DF label="Intervalle vérification" value={selected.verification_interval ? `${selected.verification_interval} mois` : null}/>
            {selectedProfile !== 'comparateur' && (selectedProfile === 'moule' || selected.m_tare != null || selected.volume_cm3 != null) && <>
              <DF label="Masse à vide M_tare (g)" value={selected.m_tare != null ? `${selected.m_tare} g` : null}/>
              <DF label="Volume (cm³)" value={selected.volume_cm3 != null ? `${selected.volume_cm3} cm³` : null}/>
            </>}
            {selectedProfile === 'comparateur' && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Comparateur</span>
                <DF label="Division" value={selectedComparator.division}/>
                <DF label="Précision" value={selectedComparator.precision}/>
              </div>
            )}
            {selectedProfile !== 'comparateur' && (selectedProfile === 'anneau' || selected.capacite != null || selected.sensibilite != null || selected.facteur_k != null) && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Anneau / Capteur</span>
                <DF label="Capacité (kN)" value={selected.capacite != null ? `${selected.capacite} kN` : null}/>
                <DF label="Sensibilité (kN/div)" value={selected.sensibilite != null ? String(selected.sensibilite) : null}/>
                <DF label="Facteur k (kN/div)" value={selected.facteur_k != null ? String(selected.facteur_k) : null}/>
              </div>
            )}
            {selected.notes && <DF label="Notes" value={selected.notes}/>}
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Étalonnages</span>
              <Button size="sm" onClick={()=>openMetro()}>+ Ajouter</Button>
            </div>
            {metros.length===0 ? <p className="text-xs text-text-muted italic">Aucun étalonnage enregistré</p>
            : metros.map(m=>(
              <div key={m.uid} className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
                <div>
                  <div className="text-xs font-medium">{m.control_type}</div>
                  <div className="text-[11px] text-text-muted">{formatDate(m.performed_on)} → {formatDate(m.valid_until)||'—'}</div>
                  {m.provider && <div className="text-[11px] text-text-muted">{m.provider}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Badge s={m.status} map={{Valide:'bg-[#eaf3de] text-[#3b6d11]','Non conforme':'bg-[#fcebeb] text-[#a32d2d]','En cours':'bg-[#faeeda] text-[#854f0b]'}}/>
                  <button onClick={()=>openMetro(m)} className="text-[11px] text-accent hover:underline">✏</button>
                  <button onClick={()=>{ if(confirm('Supprimer?')) delMetroMut.mutate(m.uid) }} className="text-[11px] text-danger hover:underline">✕</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-auto pt-3 border-t border-border">
            <Button size="sm" onClick={openEdit}>✏️ Modifier</Button>
            <Button size="sm" variant="danger" onClick={()=>{ if(confirm(`Supprimer ${selected.code}?`)) delMut.mutate(selected.uid) }}>🗑</Button>
          </div>
        </>}
      </DetailPanel>

      {/* Modal équipement */}
      <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title={editItem?'Modifier l\'équipement':'Nouvel équipement'} size="xl">
        <div className="grid grid-cols-2 gap-3">
          <FG label="Code *"><Input value={form.code||''} onChange={e=>set('code',e.target.value)} placeholder="RA AB 001"/></FG>
          <FG label="Désignation *"><Input value={form.label||''} onChange={e=>set('label',e.target.value)}/></FG>
          <FG label="Catégorie">
            <Select value={form.category||'Labo'} onChange={value=>set('category', readSelectValue(value))} className="w-full">
              {(meta?.categories_eq||[]).map(c=><option key={c}>{c}</option>)}
            </Select>
          </FG>
          <FG label="Statut">
            <Select value={form.status||'En service'} onChange={value=>set('status', readSelectValue(value))} className="w-full">
              {(meta?.statuts_eq||[]).map(s=><option key={s}>{s}</option>)}
            </Select>
          </FG>
          <FG label="Domaine"><Input value={form.domain||''} onChange={e=>set('domain',e.target.value)}/></FG>
          <FG label="N° série"><Input value={form.serial_number||''} onChange={e=>set('serial_number',e.target.value)}/></FG>
          <FG label="Fournisseur"><Input value={form.supplier||''} onChange={e=>set('supplier',e.target.value)}/></FG>
          {/* Champs techniques selon le profil équipement */}
        {(() => {
            const profile = getEquipmentProfile(form)
            const showM = profile === 'moule'
            const showA = profile === 'anneau'
            const showC = profile === 'comparateur'
            const showG = profile === 'gammadensimetre'
            const showGeneric = profile === 'generic'

            return (
                <>
                    {showC && (
                        <>
                            <div className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-text-muted pt-1 border-t border-border">
                                Comparateur
                            </div>
                            <FG label="Division">
                                <Input
                                    value={form.division || ''}
                                    onChange={e => set('division', e.target.value)}
                                    placeholder="ex: 25 mm"
                                />
                            </FG>
                            <FG label="Précision">
                                <Input
                                    value={form.precision || ''}
                                    onChange={e => set('precision', e.target.value)}
                                    placeholder="ex: ±0,01"
                                />
                            </FG>
                        </>
                    )}

                    {showM && (
                        <>
                            <div className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-text-muted pt-1 border-t border-border">
                                Moule — Proctor / CBR
                            </div>
                            <FG label="Masse à vide M_tare (g)">
                                <Input
                                    type="number"
                                    step="0.1"
                                    value={form.m_tare || ''}
                                    onChange={e => set('m_tare', e.target.value === '' ? null : parseFloat(e.target.value))}
                                    placeholder="ex: 4285.3"
                                />
                            </FG>
                            <FG label="Volume V (cm³)">
                                <Input
                                    type="number"
                                    step="1"
                                    value={form.volume_cm3 || ''}
                                    onChange={e => set('volume_cm3', e.target.value === '' ? null : parseFloat(e.target.value))}
                                    placeholder="ex: 944 (PN), 2131 (CBR)"
                                />
                            </FG>
                        </>
                    )}

                    {showA && (
                        <>
                            <div className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-text-muted pt-1 border-t border-border">
                                Anneau Dynamométrique / Capteur
                            </div>
                            <FG label="Capacité (kN)">
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={form.capacite || ''}
                                    onChange={e => set('capacite', e.target.value === '' ? null : parseFloat(e.target.value))}
                                    placeholder="ex: 10, 25, 50"
                                />
                            </FG>
                            <FG label="Sensibilité nominale (kN/div)">
                                <Input
                                    type="number"
                                    step="0.0001"
                                    value={form.sensibilite || ''}
                                    onChange={e => set('sensibilite', e.target.value === '' ? null : parseFloat(e.target.value))}
                                    placeholder="ex: 0.0245"
                                />
                            </FG>
                            <FG label="Facteur k retenu (kN/div)">
                                <Input
                                    type="number"
                                    step="0.0001"
                                    value={form.facteur_k || ''}
                                    onChange={e => set('facteur_k', e.target.value === '' ? null : parseFloat(e.target.value))}
                                    placeholder="tables multi-points"
                                />
                            </FG>
                        </>
                    )}

                    {showG && (
                        <>
                            <div className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-text-muted pt-1 border-t border-border">
                                Gammadensimètre / électrodensimètre
                            </div>
                            <FG label="Date dernier calibrage">
                                <Input
                                    type="date"
                                    value={form.last_metrology || ''}
                                    onChange={e => set('last_metrology', e.target.value || null)}
                                />
                            </FG>
                            <FG label="Prochaine échéance">
                                <Input
                                    type="date"
                                    value={form.next_metrology || ''}
                                    onChange={e => set('next_metrology', e.target.value || null)}
                                />
                            </FG>
                        </>
                    )}

                    {showGeneric && (
                        <div className="col-span-2 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-muted">
                            Équipement standard : renseigner les informations générales et les informations de suivi disponibles.
                        </div>
                    )}
                </>
            )
        })()}
          <FG label="Date d'achat"><Input type="date" value={form.purchase_date||''} onChange={e=>set('purchase_date',e.target.value)}/></FG>
          <FG label="Lieu"><Input value={form.lieu||''} onChange={e=>set('lieu',e.target.value)}/></FG>
          <FG label="Code labo" hint="Code du référentiel Administration → Laboratoires"><Input value={form.labo_code||''} onChange={e=>set('labo_code',e.target.value)}/></FG>
          <FG label="Intervalle étalonnage (mois)"><Input type="number" value={form.etalonnage_interval||''} onChange={e=>set('etalonnage_interval',e.target.value?parseInt(e.target.value):null)}/></FG>
          <FG label="Intervalle vérification (mois)"><Input type="number" value={form.verification_interval||''} onChange={e=>set('verification_interval',e.target.value?parseInt(e.target.value):null)}/></FG>
          <div/>
          <FG label="Notes" full><TA value={form.notes} onChange={v=>set('notes',v)}/></FG>
        </div>
        {saveMut.error && <p className="text-danger text-xs mt-2">{
              typeof saveMut.error.message === 'string'
                ? saveMut.error.message
                : Array.isArray(saveMut.error.message)
                  ? saveMut.error.message.map(e=>e?.msg||JSON.stringify(e)).join(' | ')
                  : JSON.stringify(saveMut.error)
            }</p>}
        <div className="flex justify-end gap-2 pt-3">
          <Button onClick={()=>setModalOpen(false)}>Annuler</Button>
          <Button variant="primary" onClick={()=>saveMut.mutate(buildEquipmentPayload(form))} disabled={!form.code||!form.label||saveMut.isPending}>
            {saveMut.isPending?'…':'Enregistrer'}
          </Button>
        </div>
      </Modal>

      {/* Modal métrologie */}
      <Modal open={metroOpen} onClose={()=>setMetroOpen(false)} title={editMetro?'Modifier le contrôle':'Nouvel étalonnage / contrôle'} size="lg">
        <div className="grid grid-cols-2 gap-3">
          <FG label="Type">
            <Select value={mform.control_type||'Étalonnage'} onChange={e=>mset('control_type',e.target.value)} className="w-full">
              {(meta?.control_types||[]).map(t=><option key={t}>{t}</option>)}
            </Select>
          </FG>
          <FG label="Statut">
            <Select value={mform.status||'Valide'} onChange={e=>mset('status',e.target.value)} className="w-full">
              {(meta?.control_statuts||[]).map(s=><option key={s}>{s}</option>)}
            </Select>
          </FG>
          <FG label="Référence"><Input value={mform.reference||''} onChange={e=>mset('reference',e.target.value)}/></FG>
          <FG label="Organisme / prestataire"><Input value={mform.provider||''} onChange={e=>mset('provider',e.target.value)}/></FG>
          <FG label="Date réalisé"><Input type="date" value={mform.performed_on||''} onChange={e=>mset('performed_on',e.target.value)}/></FG>
          <FG label="Valide jusqu'au"><Input type="date" value={mform.valid_until||''} onChange={e=>mset('valid_until',e.target.value)}/></FG>
          <FG label="Notes" full><TA value={mform.notes} onChange={v=>mset('notes',v)}/></FG>
        </div>
        {saveMetroMut.error && <p className="text-danger text-xs mt-2">{saveMetroMut.error.message}</p>}
        <div className="flex justify-end gap-2 pt-3">
          <Button onClick={()=>setMetroOpen(false)}>Annuler</Button>
          <Button variant="primary" onClick={()=>saveMetroMut.mutate(mform)} disabled={saveMetroMut.isPending}>
            {saveMetroMut.isPending?'…':'Enregistrer'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB MÉTROLOGIE (alertes)
// ═══════════════════════════════════════════════════════════════════════════
function TabMetrologie({ initialDays = 60 }) {
  const [days, setDays] = useState(initialDays)
  const { data: alerts = [], refetch, isLoading } = useQuery({
    queryKey: ['qualite-alerts', days],
    queryFn: () => api.get(`/qualite/metrology/alerts?days=${days}`),
  })
  const today = new Date().toISOString().split('T')[0]
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-border">
        <span className="text-sm text-text-muted">Horizon :</span>
        {[30,60,90,180].map(d=>(
          <button key={d} onClick={()=>setDays(d)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${days===d?'bg-accent text-white':'bg-bg border border-border hover:border-accent'}`}>
            {d} jours
          </button>
        ))}
        <button onClick={()=>refetch()} className="ml-2 text-xs text-text-muted hover:text-text">↻ Actualiser</button>
        <span className="ml-auto text-xs text-text-muted">{alerts.length} alerte{alerts.length!==1?'s':''}</span>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>{['Code équipement','Désignation','Catégorie','Type contrôle','Statut','Dernier','Valide jusqu\'au','Urgence'].map(h=>(
            <th key={h} className="bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {isLoading ? <tr><td colSpan={8} className="text-center py-8 text-text-muted text-xs">Chargement…</td></tr>
          : alerts.length===0 ? <tr><td colSpan={8} className="text-center py-12 text-text-muted text-xs">Aucune alerte pour cet horizon</td></tr>
          : alerts.map(m=>{
            const isLate = m.valid_until && m.valid_until < today
            const diff = m.valid_until ? Math.round((new Date(m.valid_until)-new Date())/86400000) : null
            return (
              <tr key={m.uid} className={`border-b border-border ${isLate?'bg-[#fff5f5]':''}`}>
                <td className="px-3 py-2 font-mono text-[12px] text-accent font-bold">{m.eq_code}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{m.eq_label}</td>
                <td className="px-3 py-2"><Badge s={m.eq_category} map={CAT_CLS}/></td>
                <td className="px-3 py-2 text-xs">{m.control_type}</td>
                <td className="px-3 py-2"><Badge s={m.status} map={{Valide:'bg-[#eaf3de] text-[#3b6d11]','Non conforme':'bg-[#fcebeb] text-[#a32d2d]'}}/></td>
                <td className="px-3 py-2 text-xs">{formatDate(m.performed_on)}</td>
                <td className={`px-3 py-2 text-xs font-medium ${isLate?'text-danger':diff!==null&&diff<=30?'text-warn':''}`}>{formatDate(m.valid_until)}</td>
                <td className="px-3 py-2">
                  {isLate ? <span className="text-[11px] font-bold text-danger">⚠ Dépassé</span>
                  : diff!==null ? <span className={`text-[11px] font-medium ${diff<=14?'text-danger':diff<=30?'text-warn':'text-text-muted'}`}>J-{diff}</span>
                  : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB PROCÉDURES
// ═══════════════════════════════════════════════════════════════════════════
function TabProcedures({ meta }) {
  const qc = useQueryClient()
  const search = useSearch()
  const [family, setFamily] = useState('')
  const [statut, setStatut] = useState('')
  const [selected, setSelected] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({})
  function set(k,v) { setForm(f=>({...f,[k]:v})) }

  const { data: rows = [] } = useQuery({
    queryKey: ['qualite-procedures', search.debounced, family, statut],
    queryFn: () => {
      const p = new URLSearchParams()
      if (search.debounced) p.set('search', search.debounced)
      if (family) p.set('family', family)
      if (statut) p.set('status', statut)
      return api.get('/qualite/procedures?' + p)
    },
  })

  const saveMut = useMutation({
    mutationFn: (data) => editItem ? api.put(`/qualite/procedures/${editItem.uid}`, data) : api.post('/qualite/procedures', data),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['qualite-procedures'] })
      qc.invalidateQueries({ queryKey: ['qualite-stats'] })
      setModalOpen(false); setSelected(saved)
    },
  })
  const delMut = useMutation({
    mutationFn: (uid) => api.delete(`/qualite/procedures/${uid}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['qualite-procedures'] }); qc.invalidateQueries({ queryKey: ['qualite-stats'] }); setSelected(null) },
  })

  function openCreate() {
    setEditItem(null)
    setForm({ code:'', title:'', technical_family:'', version:'1.0', status:'En vigueur', owner:'', issue_date:'', review_date:'', file_path:'', notes:'' })
    setModalOpen(true)
  }
  function openEdit() { setEditItem(selected); setForm({...selected}); setModalOpen(true) }

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-border shrink-0 flex-wrap">
          <Input value={search.value} onChange={e=>search.onChange(e.target.value)} placeholder="Code, titre, responsable…" className="w-[220px]"/>
          <Select value={family} onChange={e=>setFamily(e.target.value)} className="text-sm">
            <option value="">— Famille —</option>
            {(meta?.proc_families||[]).map(f=><option key={f}>{f}</option>)}
          </Select>
          <Select value={statut} onChange={e=>setStatut(e.target.value)} className="text-sm">
            <option value="">— Statut —</option>
            {(meta?.doc_statuts||[]).map(s=><option key={s}>{s}</option>)}
          </Select>
          <span className="text-xs text-text-muted ml-auto">{rows.length} procédure{rows.length!==1?'s':''}</span>
          <Button size="sm" variant="primary" onClick={openCreate}>+ Ajouter</Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>{['Code','Titre','Famille','Version','Statut','Date émission','Révision','Responsable'].map(h=>(
                <th key={h} className="bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.length===0 ? <tr><td colSpan={8} className="text-center py-12 text-text-muted text-xs">Aucune procédure</td></tr>
              : rows.map(r=>(
                <tr key={r.uid} onClick={()=>setSelected(r)}
                  className={`border-b border-border cursor-pointer transition-colors ${selected?.uid===r.uid?'bg-[#eeeffe]':'hover:bg-bg'} ${r.review_due?'border-l-2 border-l-warn':''}`}>
                  <td className="px-3 py-2 font-bold text-accent text-[12px]">{r.code}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{r.title}</td>
                  <td className="px-3 py-2 text-xs">{r.technical_family||'—'}</td>
                  <td className="px-3 py-2 text-xs">{r.version}</td>
                  <td className="px-3 py-2"><Badge s={r.status} map={DOC_CLS}/></td>
                  <td className="px-3 py-2 text-xs">{formatDate(r.issue_date)}</td>
                  <td className={`px-3 py-2 text-xs ${r.review_due?'text-warn font-bold':''}`}>{formatDate(r.review_date)}</td>
                  <td className="px-3 py-2 text-xs">{r.owner||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DetailPanel visible={!!selected} onClose={()=>setSelected(null)}>
        {selected && <>
          <div>
            <div className="text-accent font-bold">{selected.code}</div>
            <div className="text-[14px] font-semibold mt-0.5">{selected.title}</div>
            <div className="flex gap-1.5 mt-2"><Badge s={selected.status} map={DOC_CLS}/></div>
          </div>
          <div className="border-t border-border pt-3">
            <DF label="Famille" value={selected.technical_family}/>
            <DF label="Version" value={selected.version}/>
            <DF label="Responsable" value={selected.owner}/>
            <DF label="Date émission" value={formatDate(selected.issue_date)}/>
            <DF label="Date révision" value={formatDate(selected.review_date)}/>
            <DF label="Fichier" value={selected.file_path}/>
            <DF label="Masse à vide M_tare (g)" value={selected.m_tare != null ? `${selected.m_tare} g` : null}/>
            <DF label="Volume (cm³)" value={selected.volume_cm3 != null ? `${selected.volume_cm3} cm³` : null}/>
            {(selected.capacite != null || selected.facteur_k != null) && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Anneau / Capteur</span>
                <DF label="Capacité (kN)" value={selected.capacite != null ? `${selected.capacite} kN` : null}/>
                <DF label="Sensibilité (kN/div)" value={selected.sensibilite != null ? String(selected.sensibilite) : null}/>
                <DF label="Facteur k (kN/div)" value={selected.facteur_k != null ? String(selected.facteur_k) : null}/>
              </div>
            )}
            {selected.notes && <DF label="Notes" value={selected.notes}/>}
          </div>
          <div className="flex gap-2 mt-auto pt-3 border-t border-border">
            <Button size="sm" onClick={openEdit}>✏️ Modifier</Button>
            <Button size="sm" variant="danger" onClick={()=>{ if(confirm(`Supprimer ${selected.code}?`)) delMut.mutate(selected.uid) }}>🗑</Button>
          </div>
        </>}
      </DetailPanel>

      <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title={editItem?'Modifier la procédure':'Nouvelle procédure'} size="xl">
        <div className="grid grid-cols-2 gap-3">
          <FG label="Code *"><Input value={form.code||''} onChange={e=>set('code',e.target.value)}/></FG>
          <FG label="Titre *"><Input value={form.title||''} onChange={e=>set('title',e.target.value)}/></FG>
          <FG label="Famille">
            <Select value={form.technical_family||''} onChange={e=>set('technical_family',e.target.value)} className="w-full">
              <option value="">—</option>
              {(meta?.proc_families||[]).map(f=><option key={f}>{f}</option>)}
            </Select>
          </FG>
          <FG label="Version"><Input value={form.version||'1.0'} onChange={e=>set('version',e.target.value)}/></FG>
          <FG label="Statut">
            <Select value={form.status||'En vigueur'} onChange={e=>set('status',e.target.value)} className="w-full">
              {(meta?.doc_statuts||[]).map(s=><option key={s}>{s}</option>)}
            </Select>
          </FG>
          <FG label="Responsable"><Input value={form.owner||''} onChange={e=>set('owner',e.target.value)}/></FG>
          <FG label="Date émission"><Input type="date" value={form.issue_date||''} onChange={e=>set('issue_date',e.target.value)}/></FG>
          <FG label="Date révision"><Input type="date" value={form.review_date||''} onChange={e=>set('review_date',e.target.value)}/></FG>
          <FG label="Chemin fichier" full><Input value={form.file_path||''} onChange={e=>set('file_path',e.target.value)} placeholder="\\serveur\doc\proc\..."/></FG>
          <FG label="Notes" full><TA value={form.notes} onChange={v=>set('notes',v)}/></FG>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button onClick={()=>setModalOpen(false)}>Annuler</Button>
          <Button variant="primary" onClick={()=>saveMut.mutate(form)} disabled={!form.code||!form.title||saveMut.isPending}>
            {saveMut.isPending?'…':'Enregistrer'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB NORMES
// ═══════════════════════════════════════════════════════════════════════════
function TabNormes({ meta }) {
  const qc = useQueryClient()
  const search = useSearch()
  const [family, setFamily] = useState('')
  const [selected, setSelected] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({})
  function set(k,v) { setForm(f=>({...f,[k]:v})) }

  const { data: rows = [] } = useQuery({
    queryKey: ['qualite-standards', search.debounced, family],
    queryFn: () => {
      const p = new URLSearchParams()
      if (search.debounced) p.set('search', search.debounced)
      if (family) p.set('family', family)
      return api.get('/qualite/standards?' + p)
    },
  })

  const saveMut = useMutation({
    mutationFn: (data) => editItem ? api.put(`/qualite/standards/${editItem.uid}`, data) : api.post('/qualite/standards', data),
    onSuccess: (saved) => { qc.invalidateQueries({ queryKey: ['qualite-standards'] }); qc.invalidateQueries({ queryKey: ['qualite-stats'] }); setModalOpen(false); setSelected(saved) },
  })
  const delMut = useMutation({
    mutationFn: (uid) => api.delete(`/qualite/standards/${uid}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['qualite-standards'] }); qc.invalidateQueries({ queryKey: ['qualite-stats'] }); setSelected(null) },
  })

  function openCreate() { setEditItem(null); setForm({ code:'', title:'', technical_family:'', issuer:'', version:'', status:'En vigueur', issue_date:'', notes:'' }); setModalOpen(true) }
  function openEdit() { setEditItem(selected); setForm({...selected}); setModalOpen(true) }

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-border shrink-0 flex-wrap">
          <Input value={search.value} onChange={e=>search.onChange(e.target.value)} placeholder="Code norme, titre, organisme…" className="w-[220px]"/>
          <Select value={family} onChange={e=>setFamily(e.target.value)} className="text-sm">
            <option value="">— Famille —</option>
            {(meta?.std_families||[]).map(f=><option key={f}>{f}</option>)}
          </Select>
          <span className="text-xs text-text-muted ml-auto">{rows.length} norme{rows.length!==1?'s':''}</span>
          <Button size="sm" variant="primary" onClick={openCreate}>+ Ajouter</Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>{['Code','Titre','Famille','Organisme','Version','Date','Statut'].map(h=>(
                <th key={h} className="bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.length===0 ? <tr><td colSpan={7} className="text-center py-12 text-text-muted text-xs">Aucune norme</td></tr>
              : rows.map(r=>(
                <tr key={r.uid} onClick={()=>setSelected(r)}
                  className={`border-b border-border cursor-pointer transition-colors ${selected?.uid===r.uid?'bg-[#eeeffe]':'hover:bg-bg'}`}>
                  <td className="px-3 py-2 font-bold text-accent text-[12px]">{r.code}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate">{r.title}</td>
                  <td className="px-3 py-2 text-xs">{r.technical_family||'—'}</td>
                  <td className="px-3 py-2 text-xs">{r.issuer||'—'}</td>
                  <td className="px-3 py-2 text-xs">{r.version||'—'}</td>
                  <td className="px-3 py-2 text-xs">{formatDate(r.issue_date)}</td>
                  <td className="px-3 py-2"><Badge s={r.status} map={DOC_CLS}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <DetailPanel visible={!!selected} onClose={()=>setSelected(null)}>
        {selected && <>
          <div>
            <div className="text-accent font-bold">{selected.code}</div>
            <div className="text-[14px] font-semibold mt-0.5">{selected.title}</div>
            <div className="flex gap-1.5 mt-2"><Badge s={selected.status} map={DOC_CLS}/></div>
          </div>
          <div className="border-t border-border pt-3">
            <DF label="Famille" value={selected.technical_family}/>
            <DF label="Organisme" value={selected.issuer}/>
            <DF label="Version" value={selected.version}/>
            <DF label="Date" value={formatDate(selected.issue_date)}/>
            <DF label="Masse à vide M_tare (g)" value={selected.m_tare != null ? `${selected.m_tare} g` : null}/>
            <DF label="Volume (cm³)" value={selected.volume_cm3 != null ? `${selected.volume_cm3} cm³` : null}/>
            {(selected.capacite != null || selected.facteur_k != null) && (
              <div className="mt-2 pt-2 border-t border-border">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Anneau / Capteur</span>
                <DF label="Capacité (kN)" value={selected.capacite != null ? `${selected.capacite} kN` : null}/>
                <DF label="Sensibilité (kN/div)" value={selected.sensibilite != null ? String(selected.sensibilite) : null}/>
                <DF label="Facteur k (kN/div)" value={selected.facteur_k != null ? String(selected.facteur_k) : null}/>
              </div>
            )}
            {selected.notes && <DF label="Notes" value={selected.notes}/>}
          </div>
          <div className="flex gap-2 mt-auto pt-3 border-t border-border">
            <Button size="sm" onClick={openEdit}>✏️ Modifier</Button>
            <Button size="sm" variant="danger" onClick={()=>{ if(confirm(`Supprimer ${selected.code}?`)) delMut.mutate(selected.uid) }}>🗑</Button>
          </div>
        </>}
      </DetailPanel>
      <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title={editItem?'Modifier la norme':'Nouvelle norme'} size="xl">
        <div className="grid grid-cols-2 gap-3">
          <FG label="Code *"><Input value={form.code||''} onChange={e=>set('code',e.target.value)} placeholder="NF EN 933-1"/></FG>
          <FG label="Titre *"><Input value={form.title||''} onChange={e=>set('title',e.target.value)}/></FG>
          <FG label="Famille">
            <Select value={form.technical_family||''} onChange={e=>set('technical_family',e.target.value)} className="w-full">
              <option value="">—</option>
              {(meta?.std_families||[]).map(f=><option key={f}>{f}</option>)}
            </Select>
          </FG>
          <FG label="Organisme"><Input value={form.issuer||''} onChange={e=>set('issuer',e.target.value)} placeholder="AFNOR, ISO, CEN…"/></FG>
          <FG label="Version"><Input value={form.version||''} onChange={e=>set('version',e.target.value)}/></FG>
          <FG label="Statut">
            <Select value={form.status||'En vigueur'} onChange={e=>set('status',e.target.value)} className="w-full">
              {(meta?.doc_statuts||[]).map(s=><option key={s}>{s}</option>)}
            </Select>
          </FG>
          <FG label="Date publication"><Input type="date" value={form.issue_date||''} onChange={e=>set('issue_date',e.target.value)}/></FG>
          <div/>
          <FG label="Notes" full><TA value={form.notes} onChange={v=>set('notes',v)}/></FG>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button onClick={()=>setModalOpen(false)}>Annuler</Button>
          <Button variant="primary" onClick={()=>saveMut.mutate(form)} disabled={!form.code||!form.title||saveMut.isPending}>
            {saveMut.isPending?'…':'Enregistrer'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'equipment',  label: '🔧 Équipements' },
  { id: 'metrology',  label: '📊 Métrologie' },
  { id: 'procedures', label: '📄 Procédures' },
  { id: 'standards',  label: '📐 Normes' },
  { id: 'qsse',       label: '🧭 QSSE / FNC' },
]

export default function QualitePage() {
  const [searchParams] = useSearchParams()
  const queryTab = TABS.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'equipment'
  const initialMetrologyDays = [30, 60, 90, 180].includes(Number(searchParams.get('days')))
    ? Number(searchParams.get('days'))
    : 60
  const queryLabo = String(searchParams.get('labo') || '').trim().toUpperCase()
  const [tab, setTab] = useState(queryTab)

  const { data: stats } = useQuery({
    queryKey: ['qualite-stats'],
    queryFn: () => api.get('/qualite/stats'),
    refetchInterval: 30000,
  })

  const { data: meta } = useQuery({
    queryKey: ['qualite-meta'],
    queryFn: () => api.get('/qualite/meta'),
    staleTime: Infinity,
  })

  return (
    <div className="flex flex-col h-full -m-6 overflow-hidden">
      {/* Header tabs */}
      <div className="flex items-center justify-between gap-4 px-6 bg-surface border-b border-border shrink-0 min-h-[48px]">
        <div className="flex items-center gap-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 h-full text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text'
            }`}>
            {t.label}
          </button>
        ))}
        </div>
      </div>

      <StatsBar stats={stats} />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {tab === 'equipment'  && <TabEquipements  meta={meta} laboCode={queryLabo} />}
        {tab === 'metrology'  && <TabMetrologie initialDays={initialMetrologyDays} />}
        {tab === 'procedures' && <TabProcedures   meta={meta} />}
        {tab === 'standards'  && <TabNormes       meta={meta} />}
        {tab === 'qsse'       && <TabQSSE forcedWorkspaceMode="register" analysisHref="/qualite/qsse/analyse" />}
      </div>
    </div>
  )
}

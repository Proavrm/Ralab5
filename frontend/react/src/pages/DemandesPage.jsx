/**
 * DemandesPage.jsx — split table + panel + modal créer/modifier
 * Fidèle à demandes.html legacy avec préfill depuis pages source (DST, Études, Affaires NGE)
 * Le préfill arrive via location.state: { openCreate, prefill, source_type, source_id }
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, affairesApi, demandesApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'

const STATUTS   = ['À qualifier','Demande','En Cours','Répondu','Fini','Envoyé - Perdu']
const LABOS     = ['SP','PDC','CHB','CLM']
const MISSIONS  = ['À définir','Études G1','Études G2','Exploitation G3','Essais Labo','Avis Technique','Externe','Autre']
const PRIORITES = ['Basse','Normale','Haute','Critique']
const LABO_NOM  = { SP:'Saint-Priest', PDC:'Pont-du-Château', CHB:'Chambéry', CLM:'Clermont' }

const STAT_CLS = {
  'À qualifier':'bg-[#f1efe8] text-[#5f5e5a]','Demande':'bg-[#e6f1fb] text-[#185fa5]',
  'En Cours':'bg-[#eaf3de] text-[#3b6d11]','Répondu':'bg-[#eeedfe] text-[#534ab7]',
  'Fini':'bg-[#e0f5ef] text-[#0f6e56]','Envoyé - Perdu':'bg-[#fcebeb] text-[#a32d2d]',
}
const PRIO_CLS = {
  'Basse':'bg-[#f1efe8] text-[#5f5e5a]','Normale':'bg-[#e6f1fb] text-[#185fa5]',
  'Haute':'bg-[#faeeda] text-[#854f0b]','Critique':'bg-[#fcebeb] text-[#a32d2d]',
}

function Badge({ s, map }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${(map||{})[s]||'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s||'—'}</span>
}
function df(value) {
  return value
    ? <span className="text-[13px] font-medium">{value}</span>
    : <span className="text-[13px] text-text-muted italic font-normal">—</span>
}
function DetField({ label, value }) {
  return <div className="flex flex-col gap-0.5"><label className="text-[10px] text-text-muted">{label}</label>{df(value)}</div>
}
function DetSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1">{title}</div>
      {children}
    </div>
  )
}
function FG({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}
function FS({ title }) {
  return <div className="col-span-2 text-[11px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1 mt-1">{title}</div>
}

function urgence(ech, statut) {
  if (!ech || ['Fini','Envoyé - Perdu','Archivée'].includes(statut)) return ''
  const diff = (new Date(ech) - new Date()) / 86400000
  if (diff < 0) return 'text-danger font-bold'
  if (diff <= 7) return 'text-warn font-bold'
  return ''
}

const EMPTY_FORM = {
  affaire_rst_id: '', labo_code: 'SP', statut: 'À qualifier', priorite: 'Normale',
  type_mission: 'À définir', nature: '', numero_dst: '',
  numero_etude: '', affaire_nge_ref: '',  // lecture seule, pour référence
  demandeur: '', date_reception: new Date().toISOString().split('T')[0],
  date_echeance: '', description: '', observations: '',
  a_revoir: false, note_reconciliation: '',
  source_type: '', source_id: '',
}

// ── Modal créer / modifier ────────────────────────────────────────────────────
function DemandeModal({ open, onClose, prefill, sourceMeta, affaires = [], editDemande = null, nextRef }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)

  // Init form
  useEffect(() => {
    if (!open) return
    if (editDemande) {
      setForm({
        affaire_rst_id: String(editDemande.affaire_rst_id || ''),
        labo_code: editDemande.labo_code || 'SP',
        statut: editDemande.statut || 'À qualifier',
        priorite: editDemande.priorite || 'Normale',
        type_mission: editDemande.type_mission || 'À définir',
        nature: editDemande.nature || '',
        numero_dst: editDemande.numero_dst || '',
        numero_etude: editDemande.numero_etude || '',
        affaire_nge_ref: editDemande.affaire_nge || '',
        demandeur: editDemande.demandeur || '',
        date_reception: editDemande.date_reception || new Date().toISOString().split('T')[0],
        date_echeance: editDemande.date_echeance || '',
        description: editDemande.description || '',
        observations: editDemande.observations || '',
        a_revoir: !!editDemande.a_revoir,
        note_reconciliation: editDemande.note_reconciliation || '',
        source_type: '', source_id: '',
      })
      return
    }
    // Nouveau avec éventuel préfill
    const today = new Date().toISOString().split('T')[0]
    const d = prefill?.demande || {}
    const src = prefill?.source || {}

    // Rattachement affaire RST
    let affaire_rst_id = ''
    if (d.affaire_rst_id) {
      affaire_rst_id = String(d.affaire_rst_id)
    } else {
      // Matching par numero_etude (exact) ou affaire_nge (normalisé)
      const neKey  = (d.numero_etude  || '').trim()
      const ngeKey = (d.numero_affaire_nge || '').trim()
      const normNge = (v) => String(v || '').toUpperCase().replace(/[*\s\-_/.]+/g, '')
      const match = affaires.find(a =>
        (neKey  && (a.numero_etude || '').trim() === neKey) ||
        (ngeKey && normNge(a.affaire_nge) === normNge(ngeKey))
      )
      if (match) affaire_rst_id = String(match.uid)
    }

    setForm({
      affaire_rst_id,
      labo_code: d.labo_code || 'SP',
      statut: d.statut || 'À qualifier',
      priorite: d.priorite || 'Normale',
      type_mission: d.type_mission || 'À définir',
      nature: d.nature || src.type_demande || '',
      numero_dst: d.numero_dst || src.numero_dst || '',
      numero_etude: d.numero_etude || src.numero_etude || '',
      affaire_nge_ref: d.numero_affaire_nge || src.affaire_nge || '',
      demandeur: d.demandeur || src.demandeur || '',
      date_reception: (d.date_reception || today).slice(0, 10),
      date_echeance: (d.date_echeance || src.remise_souhaitee || '').slice(0, 10),
      description: d.description || [
        src.libelle_projet && `Projet: ${src.libelle_projet}`,
        src.objet && `Objet: ${src.objet}`,
        src.societe && `Société: ${src.societe}`,
      ].filter(Boolean).join('\n') || '',
      observations: d.observations || '',
      a_revoir: false,
      note_reconciliation: '',
      source_type: sourceMeta?.source_type || prefill?.source_type || '',
      source_id: String(sourceMeta?.source_id || prefill?.source_id || ''),
    })
  }, [open, editDemande, prefill, sourceMeta, affaires])

  const mutation = useMutation({
    mutationFn: (data) => editDemande
      ? api.put(`/demandes_rst/${editDemande.uid}`, data)
      : demandesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes'] })
      onClose()
    },
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleSave() {
    if (!form.affaire_rst_id) return
    const payload = {
      affaire_rst_id: parseInt(form.affaire_rst_id),
      labo_code: form.labo_code,
      statut: form.statut,
      priorite: form.priorite,
      type_mission: form.type_mission,
      nature: form.nature,
      numero_dst: form.numero_dst,
      demandeur: form.demandeur,
      date_reception: form.date_reception,
      date_echeance: form.date_echeance || null,
      description: form.description,
      observations: form.observations,
      a_revoir: form.a_revoir,
      note_reconciliation: form.note_reconciliation,
    }
    if (!editDemande) {
      payload.source_type = form.source_type || undefined
      payload.source_id   = form.source_id   ? parseInt(form.source_id) || form.source_id : undefined
    }
    mutation.mutate(payload)
  }

  const isNew = !editDemande

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'Nouvelle demande' : 'Modifier la demande'} size="xl">
      <div className="grid grid-cols-2 gap-3">

        <FS title="Identification" />
        <FG label="Référence">
          <Input value={isNew ? (nextRef?.reference || '…') : (editDemande?.reference || '')} readOnly className="text-text-muted" />
        </FG>
        <FG label="Statut">
          <Select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full">
            {STATUTS.map(s => <option key={s}>{s}</option>)}
          </Select>
        </FG>
        <FG label="Affaire RST *">
          <Select value={form.affaire_rst_id} onChange={e => set('affaire_rst_id', e.target.value)} className="w-full">
            <option value="">— Sélectionner —</option>
            {affaires.map(a => <option key={a.uid} value={a.uid}>{a.reference} — {a.chantier || a.client}</option>)}
          </Select>
        </FG>
        <FG label="Laboratoire">
          <Select value={form.labo_code} onChange={e => set('labo_code', e.target.value)} className="w-full">
            {LABOS.map(l => <option key={l}>{l}</option>)}
          </Select>
        </FG>
        {form.numero_etude && (
          <FG label="N° étude (source)">
            <Input value={form.numero_etude} readOnly className="text-text-muted" />
          </FG>
        )}
        {form.affaire_nge_ref && (
          <FG label="N° affaire NGE (source)">
            <Input value={form.affaire_nge_ref} readOnly className="text-text-muted" />
          </FG>
        )}

        <FS title="Mission" />
        <FG label="Type mission">
          <Select value={form.type_mission} onChange={e => set('type_mission', e.target.value)} className="w-full">
            {MISSIONS.map(m => <option key={m}>{m}</option>)}
          </Select>
        </FG>
        <FG label="Nature">
          <Input value={form.nature} onChange={e => set('nature', e.target.value)} placeholder="Demande DST, Demande G3…" />
        </FG>
        <FG label="N° DST">
          <Input value={form.numero_dst} onChange={e => set('numero_dst', e.target.value)} placeholder="CET0001234" />
        </FG>
        <FG label="Priorité">
          <Select value={form.priorite} onChange={e => set('priorite', e.target.value)} className="w-full">
            {PRIORITES.map(p => <option key={p}>{p}</option>)}
          </Select>
        </FG>

        <FS title="Acteurs & Dates" />
        <FG label="Demandeur">
          <Input value={form.demandeur} onChange={e => set('demandeur', e.target.value)} />
        </FG>
        <FG label="Date réception">
          <Input type="date" value={form.date_reception} onChange={e => set('date_reception', e.target.value)} />
        </FG>
        <FG label="Échéance" full>
          <Input type="date" value={form.date_echeance} onChange={e => set('date_echeance', e.target.value)} />
        </FG>

        <FS title="Description" />
        <FG label="Description" full>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
        </FG>
        <FG label="Observations" full>
          <textarea value={form.observations} onChange={e => set('observations', e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
        </FG>

        <FS title="Suivi" />
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" checked={form.a_revoir} onChange={e => set('a_revoir', e.target.checked)} className="w-4 h-4 accent-[#ef9f27]" />
          <label className="text-sm cursor-pointer">⚠ À revoir</label>
        </div>
        <FG label="Note réconciliation" full>
          <Input value={form.note_reconciliation} onChange={e => set('note_reconciliation', e.target.value)} />
        </FG>

        {/* Source context banner */}
        {form.source_type && (
          <div className="col-span-2 flex items-center gap-2 px-3 py-2 rounded text-xs text-[#185fa5] bg-[#e6f1fb] border border-[#c0d9f0]">
            <span>📎 Prérempli depuis <strong>{form.source_type === 'dst' ? 'DST' : form.source_type === 'etude' ? 'Études' : 'Affaires NGE'}</strong></span>
          </div>
        )}
      </div>

      {mutation.error && (
        <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">{mutation.error.message}</p>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onClose} variant="secondary">Annuler</Button>
        <Button onClick={handleSave} variant="primary" disabled={mutation.isPending || !form.affaire_rst_id}>
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Modal>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function DemandesPage() {
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const qc        = useQueryClient()

  const filterAffaireId = searchParams.get('affaire_id') || null
  const autoCreate      = searchParams.get('create') === '1'
  const passationUid    = searchParams.get('passation_uid') || null

  const [search,    setSearch]    = useState('')
  const [statut,    setStatut]    = useState('')
  const [labo,      setLabo]      = useState('')
  const [mission,   setMission]   = useState('')
  const [aRevoir,   setARevoir]   = useState(false)
  const [sortCol,   setSortCol]   = useState('date_reception')
  const [sortAsc,   setSortAsc]   = useState(false)
  const [selected,  setSelected]  = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editDemande, setEditDemande] = useState(null)
  const [prefill,   setPrefill]   = useState(null)
  const [sourceMeta,setSourceMeta]= useState(null)
  const timer = useRef(null)

  // Ouvrir modal — lit sessionStorage['ralab4_source_prefill'] comme le legacy
  useEffect(() => {
    if (autoCreate) {
      setEditDemande(null)
      // Lire le préfill depuis sessionStorage (stocké par DST / Études / Affaires NGE)
      const raw = sessionStorage.getItem('ralab4_source_prefill')
      if (raw) {
        try {
          const stored = JSON.parse(raw)
          if (stored?.target === 'demande_rst' || stored?.prefill) {
            sessionStorage.removeItem('ralab4_source_prefill')
            setPrefill({ demande: stored.prefill || {}, source_type: stored.source_type, source_id: stored.source_id })
            setSourceMeta({ source_type: stored.source_type, source_id: stored.source_id })
          }
        } catch {}
      }
      setModalOpen(true)
    }
  }, [])

  const { data: demandes = [], isLoading, refetch } = useQuery({
    queryKey: ['demandes', filterAffaireId, statut, labo, mission, aRevoir, search],
    queryFn: () => {
      const p = {}
      if (filterAffaireId) p.affaire_rst_id = filterAffaireId
      if (statut)   p.statut       = statut
      if (labo)     p.labo_code    = labo
      if (mission)  p.type_mission = mission
      if (aRevoir)  p.a_revoir     = 'true'
      if (search)   p.search       = search
      return api.get('/demandes_rst?' + new URLSearchParams(p))
    },
  })

  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => affairesApi.list(),
  })

  const { data: nextRef } = useQuery({
    queryKey: ['demandes-next-ref'],
    queryFn: () => demandesApi.nextRef(),
    enabled: modalOpen && !editDemande,
  })

  const deleteMutation = useMutation({
    mutationFn: (uid) => demandesApi.delete(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes'] })
      setSelected(null)
    },
  })

  function onSearchChange(v) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSearch(v), 300)
  }

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  function openCreate() {
    setPrefill(filterAffaireId ? { demande: { affaire_rst_id: parseInt(filterAffaireId) } } : null)
    setSourceMeta(null)
    setEditDemande(null)
    setModalOpen(true)
  }
  function openEdit() {
    setEditDemande(selected)
    setPrefill(null)
    setSourceMeta(null)
    setModalOpen(true)
  }
  function handleDelete() {
    if (!selected || !confirm(`Supprimer la demande ${selected.reference} ?`)) return
    deleteMutation.mutate(selected.uid)
  }

  const sorted = [...demandes].sort((a, b) => {
    const va = String(a[sortCol] ?? '').toLowerCase()
    const vb = String(b[sortCol] ?? '').toLowerCase()
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  function Th({ col, label }) {
    return (
      <th onClick={() => toggleSort(col)}
        className="bg-bg px-3 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text">
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">↕</span>}
      </th>
    )
  }

  const filterAffaireRef = filterAffaireId
    ? affaires.find(a => String(a.uid) === String(filterAffaireId))?.reference
    : null

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">
          {filterAffaireRef ? `Demandes — Affaire ${filterAffaireRef}` : 'Demandes'}
        </span>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Plus size={13} /> Nouvelle demande
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-surface border-b border-border shrink-0 flex-wrap">
        <input
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Référence, chantier, client, N°DST…"
          className="flex-1 min-w-[200px] max-w-[280px] px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-accent"
        />
        <Select value={statut} onChange={e => setStatut(e.target.value)} className="text-xs py-1.5">
          <option value="">Tous statuts</option>
          {STATUTS.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select value={labo} onChange={e => setLabo(e.target.value)} className="text-xs py-1.5">
          <option value="">Tous labos</option>
          {LABOS.map(l => <option key={l} value={l}>{LABO_NOM[l]}</option>)}
        </Select>
        <Select value={mission} onChange={e => setMission(e.target.value)} className="text-xs py-1.5">
          <option value="">Toutes missions</option>
          {MISSIONS.map(m => <option key={m}>{m}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
          <input type="checkbox" checked={aRevoir} onChange={e => setARevoir(e.target.checked)} className="accent-[#ef9f27]" />
          À revoir
        </label>
        <span className="text-xs text-text-muted ml-auto">{demandes.length} demande{demandes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : sorted.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">📂 Aucune demande</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th col="reference"     label="Référence" />
                  <Th col="affaire_ref"   label="Affaire" />
                  <Th col="client"        label="Client" />
                  <Th col="chantier"      label="Chantier" />
                  <Th col="numero_dst"    label="N° DST" />
                  <Th col="numero_etude"  label="N° étude" />
                  <Th col="affaire_nge"   label="N° NGE" />
                  <Th col="nature"        label="Nature" />
                  <Th col="statut"        label="Statut" />
                  <Th col="priorite"      label="Priorité" />
                  <Th col="date_echeance" label="Échéance" />
                  <Th col="demandeur"     label="Demandeur" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(d => {
                  const urg = urgence(d.date_echeance, d.statut)
                  return (
                    <tr key={d.uid}
                      onClick={() => setSelected(d.uid === selected?.uid ? null : d)}
                      className={`border-b border-border cursor-pointer transition-colors ${
                        selected?.uid === d.uid ? 'bg-[#eeeffe]' : d.a_revoir ? 'bg-[#fffbf2]' : 'hover:bg-[#f8f8fc]'
                      }`}>
                      <td className="px-3 py-2.5"><strong className="text-accent text-xs">{d.reference}</strong></td>
                      <td className="px-3 py-2.5 text-xs text-text-muted">{d.affaire_ref || '—'}</td>
                      <td className="px-3 py-2.5 text-xs">{d.client || '—'}</td>
                      <td className="px-3 py-2.5 text-xs max-w-[140px] truncate">{d.chantier || '—'}</td>
                      <td className="px-3 py-2.5 text-xs">{d.numero_dst || '—'}</td>
                      <td className="px-3 py-2.5 text-xs">{d.numero_etude || '—'}</td>
                      <td className="px-3 py-2.5 text-xs">{d.affaire_nge || '—'}</td>
                      <td className="px-3 py-2.5 text-xs max-w-[130px] truncate">{d.nature || '—'}</td>
                      <td className="px-3 py-2.5"><Badge s={d.statut} map={STAT_CLS} /></td>
                      <td className="px-3 py-2.5"><Badge s={d.priorite} map={PRIO_CLS} /></td>
                      <td className={`px-3 py-2.5 text-xs ${urg}`}>{d.date_echeance ? formatDate(d.date_echeance) : '—'}</td>
                      <td className="px-3 py-2.5 text-xs">{(d.demandeur || '—').split(',')[0]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[360px] min-w-[320px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
              <div>
                <div className="text-[13px] font-bold text-accent">{selected.reference}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected.affaire_ref || '—'}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <Badge s={selected.statut} map={STAT_CLS} />
                  <Badge s={selected.priorite} map={PRIO_CLS} />
                  {selected.a_revoir && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#faeeda] text-[#854f0b]">⚠ À revoir</span>}
                  {selected.numero_dst && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#e6f1fb] text-[#185fa5]">DST</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg shrink-0"><X size={14} /></button>
            </div>

            <div className="flex flex-col gap-4 px-[18px] py-4 flex-1">
              <DetSection title="Affaire RST">
                <DetField label="Client"    value={selected.client} />
                <DetField label="Chantier"  value={selected.chantier} />
                <DetField label="Site"      value={selected.site} />
                <DetField label="N° étude"  value={selected.numero_etude} />
                <DetField label="N° NGE"    value={selected.affaire_nge} />
              </DetSection>
              <DetSection title="Mission">
                <DetField label="Type mission" value={selected.type_mission} />
                <DetField label="Nature"       value={selected.nature} />
                <DetField label="N° DST"       value={selected.numero_dst} />
                <DetField label="Laboratoire"  value={LABO_NOM[selected.labo_code] || selected.labo_code} />
              </DetSection>
              <DetSection title="Acteurs">
                <DetField label="Demandeur" value={selected.demandeur} />
              </DetSection>
              <DetSection title="Dates">
                <DetField label="Réception" value={formatDate(selected.date_reception)} />
                <DetField label="Échéance"  value={selected.date_echeance ? formatDate(selected.date_echeance) : '—'} />
              </DetSection>
              {(selected.description || selected.observations) && (
                <DetSection title="Description">
                  <DetField label="" value={selected.description || selected.observations} />
                </DetSection>
              )}
            </div>

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={() => navigate(`/demandes/${selected.uid}`)}>📋 Fiche</Button>
              <Button size="sm" variant="primary" onClick={openEdit}>✏️ Modifier</Button>
              <Button size="sm" onClick={() => navigate(`/affaires/${selected.affaire_rst_id}`)}>📁 Affaire</Button>
              <Button size="sm" variant="danger" onClick={handleDelete}>🗑</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <DemandeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        prefill={prefill}
        sourceMeta={sourceMeta}
        affaires={affaires}
        editDemande={editDemande}
        nextRef={nextRef}
      />
    </div>
  )
}

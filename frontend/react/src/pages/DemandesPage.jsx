import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { demandesApi, affairesApi } from '@/services/api'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'

const STATUTS  = ['À qualifier','Demande','En Cours','Répondu','Fini','Envoyé - Perdu']
const LABOS    = ['SP','PDC','CHB','CLM']
const MISSIONS = ['À définir','Études G1','Études G2','Exploitation G3','Essais Labo','Avis Technique','Externe','Autre']
const PRIORITES = ['Basse','Normale','Haute','Critique']

const LABO_NOM = { SP:'Saint-Priest', PDC:'Pont-du-Château', CHB:'Chambéry', CLM:'Clermont' }

// Badges — mêmes couleurs que legacy
const STAT_CLS = {
  'À qualifier':'bg-[#f1efe8] text-[#5f5e5a]',
  'Demande':'bg-[#e6f1fb] text-[#185fa5]',
  'En Cours':'bg-[#eaf3de] text-[#3b6d11]',
  'Répondu':'bg-[#eeedfe] text-[#534ab7]',
  'Fini':'bg-[#e0f5ef] text-[#0f6e56]',
  'Envoyé - Perdu':'bg-[#fcebeb] text-[#a32d2d]',
}
const PRIO_CLS = {
  'Basse':'bg-[#f1efe8] text-[#5f5e5a]',
  'Normale':'bg-[#e6f1fb] text-[#185fa5]',
  'Haute':'bg-[#faeeda] text-[#854f0b]',
  'Critique':'bg-[#fcebeb] text-[#a32d2d]',
}
function BStat({ s }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STAT_CLS[s]||STAT_CLS['À qualifier']}`}>{s}</span>
}
function BPrio({ p }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${PRIO_CLS[p]||PRIO_CLS['Normale']}`}>{p||'?'}</span>
}

function urgence(ech, statut) {
  if (!ech || ['Fini','Envoyé - Perdu','Archivée'].includes(statut)) return ''
  const diff = (new Date(ech) - new Date()) / 86400000
  if (diff < 0) return 'late'
  if (diff <= 7) return 'soon'
  return ''
}

function DetField({ label, value, color }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}
        style={color ? { color } : {}}>
        {value || '—'}
      </span>
    </div>
  )
}
function DetSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted border-b border-border pb-1 mb-0.5">{title}</div>
      {children}
    </div>
  )
}
function FormSection({ title }) {
  return <div className="col-span-2 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted border-b border-border pb-1.5 mt-1">{title}</div>
}
function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function DemandeModal({ open, onClose, editData, affaires, nextRef, onSaved }) {
  const isEdit = !!editData
  const today = new Date().toISOString().split('T')[0]
  const empty = {
    affaire_rst_id: '', labo_code: 'SP', type_mission: 'À définir',
    statut: 'À qualifier', priorite: 'Normale', nature: '',
    numero_dst: '', demandeur: '', date_reception: today,
    date_echeance: '', description: '', observations: '',
    a_revoir: false, note_reconciliation: '',
  }
  const [form, setForm] = useState(isEdit ? {
    affaire_rst_id: editData.affaire_rst_id || '',
    labo_code: editData.labo_code || 'SP',
    type_mission: editData.type_mission || 'À définir',
    statut: editData.statut || 'À qualifier',
    priorite: editData.priorite || 'Normale',
    nature: editData.nature || '',
    numero_dst: editData.numero_dst || '',
    demandeur: editData.demandeur || '',
    date_reception: editData.date_reception || today,
    date_echeance: editData.date_echeance || '',
    description: editData.description || '',
    observations: editData.observations || '',
    a_revoir: !!editData.a_revoir,
    note_reconciliation: editData.note_reconciliation || '',
  } : empty)

  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/demandes_rst/${editData.uid}`, data)
      : api.post('/demandes_rst', data),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['demandes'] })
      onClose()
      onSaved?.(saved)
    },
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleSave() {
    if (!form.affaire_rst_id) { alert('Sélectionner une affaire RST'); return }
    mutation.mutate({
      ...form,
      affaire_rst_id: parseInt(form.affaire_rst_id),
      date_echeance: form.date_echeance || null,
    })
  }

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? 'Modifier la demande' : 'Nouvelle demande'}
      size="xl">
      <div className="grid grid-cols-2 gap-3">
        {/* Identification */}
        <FormSection title="Identification" />
        <FG label="Référence">
          <Input value={isEdit ? editData.reference : (nextRef?.reference || '…')} readOnly className="text-text-muted" />
        </FG>
        <FG label="Statut">
          <Select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full">
            {STATUTS.map(s => <option key={s}>{s}</option>)}
          </Select>
        </FG>
        <FG label="Affaire RST *">
          <Select value={form.affaire_rst_id} onChange={e => set('affaire_rst_id', e.target.value)} className="w-full">
            <option value="">— Sélectionner —</option>
            {affaires.map(a => (
              <option key={a.uid} value={a.uid}>{a.reference} — {a.chantier || a.client}</option>
            ))}
          </Select>
        </FG>
        <FG label="Laboratoire">
          <Select value={form.labo_code} onChange={e => set('labo_code', e.target.value)} className="w-full">
            {LABOS.map(l => <option key={l}>{l}</option>)}
          </Select>
        </FG>

        {/* Mission */}
        <FormSection title="Mission" />
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

        {/* Acteurs & Dates */}
        <FormSection title="Acteurs & Dates" />
        <FG label="Demandeur">
          <Input value={form.demandeur} onChange={e => set('demandeur', e.target.value)} />
        </FG>
        <FG label="Date réception">
          <Input type="date" value={form.date_reception} onChange={e => set('date_reception', e.target.value)} />
        </FG>
        <div className="col-span-2">
          <FG label="Échéance">
            <Input type="date" value={form.date_echeance} onChange={e => set('date_echeance', e.target.value)} />
          </FG>
        </div>

        {/* Description */}
        <FormSection title="Description" />
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium text-text-muted">Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={3} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium text-text-muted">Observations</label>
          <textarea value={form.observations} onChange={e => set('observations', e.target.value)}
            rows={3} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
        </div>

        {/* Suivi */}
        <FormSection title="Suivi" />
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="m-revoir" checked={form.a_revoir}
            onChange={e => set('a_revoir', e.target.checked)}
            className="w-4 h-4 accent-[#ef9f27]" />
          <label htmlFor="m-revoir" className="text-sm cursor-pointer">⚠ À revoir</label>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium text-text-muted">Note réconciliation</label>
          <Input value={form.note_reconciliation} onChange={e => set('note_reconciliation', e.target.value)} />
        </div>
      </div>

      {mutation.error && (
        <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
          {mutation.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onClose} variant="secondary">Annuler</Button>
        <Button onClick={handleSave} variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </Modal>
  )
}

export default function DemandesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const filterAffaireId = searchParams.get('affaire_id')

  const [search, setSearch]   = useState('')
  const [statut, setStatut]   = useState('')
  const [labo, setLabo]       = useState('')
  const [mission, setMission] = useState('')
  const [revoir, setRevoir]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [sortCol, setSortCol] = useState('date_reception')
  const [sortAsc, setSortAsc] = useState(false)
  const [modal, setModal]     = useState(null)

  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => affairesApi.list(),
  })

  const { data: demandes = [], isLoading, refetch } = useQuery({
    queryKey: ['demandes', filterAffaireId],
    queryFn: () => {
      const params = {}
      if (filterAffaireId) params.affaire_rst_id = filterAffaireId
      return api.get('/demandes_rst?' + new URLSearchParams(params))
    },
  })

  const { data: nextRef } = useQuery({
    queryKey: ['demandes-next-ref'],
    queryFn: () => api.get('/demandes_rst/next-ref?labo_code=SP'),
    enabled: modal === 'create',
  })

  const deleteMutation = useMutation({
    mutationFn: (uid) => api.delete(`/demandes_rst/${uid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes'] })
      setSelected(null)
    },
  })

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  function handleDelete() {
    if (!selected) return
    if (!confirm(`Supprimer la demande ${selected.reference} ?`)) return
    deleteMutation.mutate(selected.uid)
  }

  function clearFilters() {
    setStatut(''); setLabo(''); setMission(''); setRevoir(false); setSearch('')
  }

  const filtered = [...demandes]
    .filter(d => {
      const matchStatut  = !statut  || d.statut === statut
      const matchLabo    = !labo    || d.labo_code === labo
      const matchMission = !mission || d.type_mission === mission
      const matchRevoir  = !revoir  || d.a_revoir
      const q = search.toLowerCase()
      const matchSearch  = !q || [d.reference, d.numero_dst, d.client, d.nature, d.chantier, d.affaire_ref, d.demandeur]
        .some(v => v?.toLowerCase().includes(q))
      return matchStatut && matchLabo && matchMission && matchRevoir && matchSearch
    })
    .sort((a, b) => {
      const va = String(a[sortCol] || '').toLowerCase()
      const vb = String(b[sortCol] || '').toLowerCase()
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const filterAffaireRef = affaires.find(a => a.uid == filterAffaireId)?.reference
  const title = filterAffaireId ? `Demandes — Affaire ${filterAffaireRef || filterAffaireId}` : 'Demandes'

  function ThSort({ col, label }) {
    return (
      <th onClick={() => toggleSort(col)}
        className="bg-bg px-3.5 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer hover:text-text select-none">
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : '↕'}
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full gap-0 -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">{title}</span>
        <div className="flex-1 max-w-[280px]">
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Référence, DST, client, nature…" className="text-xs py-1.5" />
        </div>
        <Button variant="primary" size="sm" onClick={() => setModal('create')}>
          <Plus size={13} /> Nouvelle demande
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()} title="Actualiser">
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2 bg-surface border-b border-border shrink-0 flex-wrap">
        <span className="text-xs text-text-muted">Statut :</span>
        <Select value={statut} onChange={e => setStatut(e.target.value)} className="text-xs py-1">
          <option value="">Tous</option>
          {STATUTS.map(s => <option key={s}>{s}</option>)}
        </Select>
        <span className="text-xs text-text-muted">Labo :</span>
        <Select value={labo} onChange={e => setLabo(e.target.value)} className="text-xs py-1">
          <option value="">Tous</option>
          {LABOS.map(l => <option key={l}>{l}</option>)}
        </Select>
        <span className="text-xs text-text-muted">Mission :</span>
        <Select value={mission} onChange={e => setMission(e.target.value)} className="text-xs py-1">
          <option value="">Tous</option>
          {MISSIONS.map(m => <option key={m}>{m}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
          <input type="checkbox" checked={revoir} onChange={e => setRevoir(e.target.checked)}
            className="accent-[#ef9f27]" />
          À revoir
        </label>
        {(statut || labo || mission || revoir || search) && (
          <button onClick={clearFilters} className="text-xs text-text-muted hover:text-danger flex items-center gap-1">
            <X size={11} /> Effacer
          </button>
        )}
        <span className="text-xs text-text-muted ml-auto">
          {filtered.length} demande{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-y-auto min-w-0 bg-surface">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">📂 Aucune demande</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <ThSort col="reference"     label="Référence" />
                  <ThSort col="affaire_ref"   label="Affaire RST" />
                  <ThSort col="client"        label="Client" />
                  <ThSort col="chantier"      label="Chantier" />
                  <ThSort col="numero_dst"    label="N° DST" />
                  <ThSort col="nature"        label="Nature" />
                  <ThSort col="statut"        label="Statut" />
                  <ThSort col="priorite"      label="Priorité" />
                  <ThSort col="date_echeance" label="Échéance" />
                  <ThSort col="demandeur"     label="Demandeur" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const urg = urgence(d.date_echeance, d.statut)
                  return (
                    <tr key={d.uid}
                      onClick={() => setSelected(d.uid === selected?.uid ? null : d)}
                      className={[
                        'border-b border-border cursor-pointer transition-colors',
                        selected?.uid === d.uid ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]',
                        d.a_revoir ? 'border-l-[3px] border-l-[#ef9f27]' : '',
                      ].join(' ')}>
                      <td className="px-3.5 py-2.5">
                        <strong className="text-accent text-xs">{d.reference}</strong>
                      </td>
                      <td className="px-3.5 py-2.5 text-xs text-text-muted">{d.affaire_ref || '—'}</td>
                      <td className="px-3.5 py-2.5 max-w-[120px] truncate text-xs">{d.client || '—'}</td>
                      <td className="px-3.5 py-2.5 max-w-[140px] truncate text-xs">{d.chantier || '—'}</td>
                      <td className="px-3.5 py-2.5 text-xs">{d.numero_dst || '—'}</td>
                      <td className="px-3.5 py-2.5 max-w-[130px] truncate text-xs">{d.nature || '—'}</td>
                      <td className="px-3.5 py-2.5"><BStat s={d.statut} /></td>
                      <td className="px-3.5 py-2.5"><BPrio p={d.priorite} /></td>
                      <td className="px-3.5 py-2.5 text-xs"
                        style={{ color: urg === 'late' ? '#e24b4a' : urg === 'soon' ? '#ef9f27' : '' }}>
                        {d.date_echeance ? formatDate(d.date_echeance) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-[11px] text-text-muted">
                        {(d.demandeur || '—').split(',')[0]}
                      </td>
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
                <div className="text-[11px] text-text-muted mt-0.5">{selected.affaire_ref || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)}
                className="px-2 py-1 text-xs border border-border rounded hover:bg-bg text-text-muted">×</button>
            </div>

            <div className="flex flex-col gap-4 p-[18px] flex-1">
              <div className="flex flex-wrap gap-1.5">
                <BStat s={selected.statut} />
                <BPrio p={selected.priorite} />
                {selected.a_revoir && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#faeeda] text-[#854f0b]">⚠ À revoir</span>
                )}
                {selected.numero_dst && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#e6f1fb] text-[#185fa5]">DST</span>
                )}
              </div>

              <DetSection title="Affaire">
                <DetField label="Client"        value={selected.client} />
                <DetField label="Chantier"      value={selected.chantier} />
                <DetField label="N° Affaire NGE" value={selected.affaire_nge} />
              </DetSection>

              <DetSection title="Mission">
                <DetField label="Type mission" value={selected.type_mission} />
                <DetField label="Nature"       value={selected.nature} />
                <DetField label="N° DST"       value={selected.numero_dst} />
                <DetField label="Laboratoire"  value={LABO_NOM[selected.labo_code] || selected.labo_code} />
              </DetSection>

              <DetSection title="Acteurs & Dates">
                <DetField label="Demandeur"     value={selected.demandeur} />
                <DetField label="Date réception" value={formatDate(selected.date_reception)} />
                <DetField label="Échéance"      value={selected.date_echeance ? formatDate(selected.date_echeance) : '—'}
                  color={urgence(selected.date_echeance, selected.statut) === 'late' ? '#e24b4a'
                    : urgence(selected.date_echeance, selected.statut) === 'soon' ? '#ef9f27' : undefined} />
              </DetSection>

              <DetSection title="Description">
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-text">
                  {selected.description || selected.observations || '—'}
                </p>
              </DetSection>

              <DetSection title="Dossier">
                <DetField label="Nom dossier" value={selected.dossier_nom} />
              </DetSection>
            </div>

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={() => setModal('edit')}>✏️ Modifier</Button>
              <Button size="sm" onClick={() => navigate(`/demandes/${selected.uid}`)}>📄 Fiche</Button>
              <Button size="sm" onClick={() => {
                const aff = affaires.find(a => a.uid === selected.affaire_rst_id)
                if (aff) navigate(`/affaires/${aff.uid}`)
              }}>📋 Affaire</Button>
              <Button size="sm"
                style={{ background:'#e0f5ef', borderColor:'#0f6e56', color:'#0f6e56' }}
                onClick={() => navigate(`/interventions/${selected.uid}`)}>
                📍 G3
              </Button>
              <Button size="sm"
                style={{ background:'#e6f1fb', borderColor:'#185fa5', color:'#185fa5' }}
                onClick={() => navigate(`/essais/${selected.uid}`)}>
                🔬 Labo
              </Button>
              <Button size="sm" variant="danger" onClick={handleDelete}>🗑</Button>
            </div>
          </div>
        )}
      </div>

      <DemandeModal
        open={modal === 'create'}
        onClose={() => setModal(null)}
        editData={null}
        affaires={affaires}
        nextRef={nextRef}
        onSaved={(saved) => saved?.uid && setSelected(demandes.find(d => d.uid === saved.uid) || null)}
      />
      <DemandeModal
        open={modal === 'edit'}
        onClose={() => setModal(null)}
        editData={selected}
        affaires={affaires}
        nextRef={null}
        onSaved={(saved) => saved && setSelected(s => ({ ...s, ...saved }))}
      />
    </div>
  )
}
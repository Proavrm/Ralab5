import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { affairesApi } from '@/services/api'
import Badge from '@/components/shared/Badge'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'

const STATUTS    = ['À qualifier', 'En cours', 'Terminée', 'Archivée']
const TITULAIRES = ['NGE GC', 'NGE Energie', 'NGE Routes', 'EHTP', 'NGE E.S.', 'NGE Transitions', 'Lyaudet', 'Autre']

// Badge statut — même couleurs que le HTML legacy
function bStat(s) {
  const map = { 'À qualifier': 'bg-[#f1efe8] text-[#5f5e5a]', 'En cours': 'bg-[#eaf3de] text-[#3b6d11]', 'Terminée': 'bg-[#eeedfe] text-[#534ab7]', 'Archivée': 'bg-[#f1efe8] text-[#5f5e5a]' }
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${map[s] || map['À qualifier']}`}>{s}</span>
}

function df(value) {
  return value
    ? <span className="text-[13px] font-medium">{value}</span>
    : <span className="text-[13px] text-text-muted italic font-normal">—</span>
}

function DetField({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      {df(value)}
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

function AffaireModal({ open, onClose, editData, nextRef, onSaved }) {
  const isEdit = !!editData
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    client: editData?.client || '',
    chantier: editData?.chantier || '',
    site: editData?.site || '',
    filiale: editData?.filiale || '',
    numero_etude: editData?.numero_etude || '',
    affaire_nge: editData?.affaire_nge || '',
    titulaire: editData?.titulaire || '',
    responsable: editData?.responsable || '',
    statut: editData?.statut || 'À qualifier',
    date_ouverture: editData?.date_ouverture || today,
  })

  // Reset form when modal opens
  const prevOpen = useRef(false)
  if (open !== prevOpen.current) {
    prevOpen.current = open
    if (open) setForm({
      client: editData?.client || '',
      chantier: editData?.chantier || '',
      site: editData?.site || '',
      filiale: editData?.filiale || '',
      numero_etude: editData?.numero_etude || '',
      affaire_nge: editData?.affaire_nge || '',
      titulaire: editData?.titulaire || '',
      responsable: editData?.responsable || '',
      statut: editData?.statut || 'À qualifier',
      date_ouverture: editData?.date_ouverture || today,
    })
  }

  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? affairesApi.update(editData.uid, data)
      : affairesApi.create({ ...data, reference: nextRef?.reference }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['affaires'] })
      onClose()
      onSaved?.(saved)
    },
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  const F = ({ label, id, placeholder, readOnly }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      <Input value={form[id] || ''} onChange={e => set(id, e.target.value)}
        placeholder={placeholder} readOnly={readOnly}
        className={readOnly ? 'text-text-muted' : ''} />
    </div>
  )

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? "Modifier l'affaire RST" : "Nouvelle affaire RST"}
      size="lg">
      <div className="flex flex-col gap-3">
        {/* Référence + Statut */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Référence</label>
            <Input value={isEdit ? editData.reference : (nextRef?.reference || '…')}
              readOnly className="text-text-muted" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Statut</label>
            <Select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full">
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </Select>
          </div>
        </div>
        {/* Client + Chantier */}
        <div className="grid grid-cols-2 gap-3">
          <F label="Client *" id="client" placeholder="SNCF, IMERYS…" />
          <F label="Chantier *" id="chantier" placeholder="Libellé projet / chantier" />
        </div>
        {/* Site + Filiale */}
        <div className="grid grid-cols-2 gap-3">
          <F label="Site" id="site" placeholder="VILLE (63)" />
          <F label="Filiale" id="filiale" placeholder="NGE / GUINTOLI / ..." />
        </div>
        {/* N° étude + N° affaire NGE */}
        <div className="grid grid-cols-2 gap-3">
          <F label="N° étude" id="numero_etude" placeholder="Source Études" />
          <F label="N° affaire NGE" id="affaire_nge" placeholder="Source Affaires NGE" />
        </div>
        {/* Titulaire + Responsable */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Titulaire</label>
            <Select value={form.titulaire} onChange={e => set('titulaire', e.target.value)} className="w-full">
              <option value="">— Non défini —</option>
              {TITULAIRES.map(t => <option key={t}>{t}</option>)}
            </Select>
          </div>
          <F label="Responsable affaire NGE" id="responsable" />
        </div>
        {/* Date ouverture */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Date ouverture</label>
            <Input type="date" value={form.date_ouverture}
              onChange={e => set('date_ouverture', e.target.value)} />
          </div>
        </div>

        {mutation.error && (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
            {mutation.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} variant="secondary">Annuler</Button>
          <Button
            onClick={() => mutation.mutate(form)}
            variant="primary"
            disabled={mutation.isPending || !form.client || !form.chantier}
          >
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function AffairesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  const [search, setSearch]       = useState('')
  const [statut, setStatut]       = useState('')
  const [titulaire, setTitulaire] = useState('')
  const [selected, setSelected]   = useState(null)
  const [sortCol, setSortCol]     = useState('date_ouverture')
  const [sortAsc, setSortAsc]     = useState(false)
  const [modal, setModal]         = useState(null) // null | 'create' | 'edit'

  const { data: affaires = [], isLoading, refetch } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => affairesApi.list(),
    onSuccess: (data) => {
      // Auto-select si ?uid= dans l'URL
      const uid = parseInt(searchParams.get('uid') || '0')
      if (uid) {
        const found = data.find(a => a.uid === uid)
        if (found) setSelected(found)
      }
    }
  })

  const { data: nextRef } = useQuery({
    queryKey: ['affaires-next-ref'],
    queryFn: () => affairesApi.nextRef(),
    enabled: modal === 'create',
  })

  const { data: demandes = [] } = useQuery({
    queryKey: ['affaire-demandes', selected?.uid],
    queryFn: () => affairesApi.demandes(selected.uid),
    enabled: !!selected?.uid,
  })

  const deleteMutation = useMutation({
    mutationFn: (uid) => affairesApi.delete(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affaires'] })
      setSelected(null)
    },
  })

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  function handleDelete() {
    if (!selected) return
    if (!confirm(`Supprimer l'affaire ${selected.reference} ?`)) return
    deleteMutation.mutate(selected.uid)
  }

  const demandesActives = demandes.filter(d =>
    ['Demande', 'En Cours', 'Répondu'].includes(d.statut)
  ).length

  // Filter + sort
  const filtered = [...affaires]
    .filter(a => {
      const matchStatut    = !statut    || a.statut === statut
      const matchTitulaire = !titulaire || a.titulaire === titulaire
      const q = search.toLowerCase()
      const matchSearch = !q || [a.reference, a.chantier, a.site, a.client, a.numero_etude, a.affaire_nge, a.responsable, a.filiale]
        .some(v => v?.toLowerCase().includes(q))
      return matchStatut && matchTitulaire && matchSearch
    })
    .sort((a, b) => {
      const va = String(a[sortCol] || '').toLowerCase()
      const vb = String(b[sortCol] || '').toLowerCase()
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

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
      <div className="flex items-center gap-3 px-6 py-0 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">Affaires RST</span>
        <div className="flex-1 max-w-[280px]">
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Référence, chantier, site, client…" className="text-xs py-1.5" />
        </div>
        <Button variant="primary" size="sm" onClick={() => setModal('create')}>
          <Plus size={13} /> Nouvelle affaire
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
        <span className="text-xs text-text-muted">Titulaire :</span>
        <Select value={titulaire} onChange={e => setTitulaire(e.target.value)} className="text-xs py-1">
          <option value="">Tous</option>
          {TITULAIRES.map(t => <option key={t}>{t}</option>)}
        </Select>
        {(statut || titulaire || search) && (
          <button onClick={() => { setStatut(''); setTitulaire(''); setSearch('') }}
            className="text-xs text-text-muted hover:text-danger flex items-center gap-1">
            <X size={11} /> Effacer
          </button>
        )}
        <span className="text-xs text-text-muted ml-auto">
          {filtered.length} affaire{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-y-auto min-w-0 bg-surface">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">📋 Aucune affaire</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <ThSort col="reference"     label="Référence" />
                  <ThSort col="numero_etude"  label="N° étude" />
                  <ThSort col="affaire_nge"   label="N° affaire NGE" />
                  <ThSort col="chantier"      label="Chantier" />
                  <ThSort col="site"          label="Site" />
                  <ThSort col="client"        label="Client" />
                  <ThSort col="responsable"   label="Resp. affaire NGE" />
                  <ThSort col="filiale"       label="Filiale" />
                  <ThSort col="titulaire"     label="Titulaire" />
                  <ThSort col="statut"        label="Statut" />
                  <ThSort col="date_ouverture" label="Ouverture" />
                  <th className="bg-bg px-3.5 py-2.5 text-center text-[11px] font-medium text-text-muted border-b border-border sticky top-0 z-10">
                    Dem.
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.uid}
                    onClick={() => setSelected(a.uid === selected?.uid ? null : a)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.uid === a.uid ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3.5 py-2.5">
                      <strong className="text-accent text-xs">{a.reference}</strong>
                    </td>
                    <td className="px-3.5 py-2.5 max-w-[120px] truncate text-xs" title={a.numero_etude}>{a.numero_etude || '—'}</td>
                    <td className="px-3.5 py-2.5 max-w-[120px] truncate text-xs" title={a.affaire_nge}>{a.affaire_nge || '—'}</td>
                    <td className="px-3.5 py-2.5 max-w-[260px] truncate text-xs" title={a.chantier}>{a.chantier || '—'}</td>
                    <td className="px-3.5 py-2.5 max-w-[170px] truncate text-xs" title={a.site}>{a.site || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs">{a.client || '—'}</td>
                    <td className="px-3.5 py-2.5 max-w-[200px] truncate text-xs" title={a.responsable}>{a.responsable || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs">{a.filiale || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      {a.titulaire
                        ? <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-[#002C77] text-white">{a.titulaire}</span>
                        : <span className="text-text-muted text-xs">—</span>}
                    </td>
                    <td className="px-3.5 py-2.5">{bStat(a.statut)}</td>
                    <td className="px-3.5 py-2.5 text-xs" style={{fontSize:'12px'}}>{formatDate(a.date_ouverture)}</td>
                    <td className="px-3.5 py-2.5 text-center">
                      {a.nb_demandes > 0
                        ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#e6f1fb] text-[#185fa5]">{a.nb_demandes_actives}/{a.nb_demandes}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[340px] min-w-[300px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
              <div>
                <div className="text-[13px] font-bold text-accent">{selected.reference}</div>
                <div className="text-[11px] text-text font-semibold mt-0.5">{selected.chantier || '—'}</div>
                <div className="text-[11px] text-text-muted mt-0.5">{selected.site || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)}
                className="px-2 py-1 text-xs border border-border rounded hover:bg-bg text-text-muted">×</button>
            </div>

            <div className="flex flex-col gap-4 p-[18px] flex-1">
              <div className="flex flex-wrap gap-1.5">
                {bStat(selected.statut)}
                {selected.titulaire && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#002C77] text-white">
                    {selected.titulaire}
                  </span>
                )}
                {selected.filiale && (
                  <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#e6f1fb] text-[#185fa5]">
                    {selected.filiale}
                  </span>
                )}
              </div>

              <DetSection title="Projet">
                <DetField label="Client"   value={selected.client} />
                <DetField label="Chantier" value={selected.chantier} />
                <DetField label="Site"     value={selected.site} />
              </DetSection>

              <DetSection title="Parties">
                <DetField label="Titulaire"              value={selected.titulaire || '— Non défini —'} />
                <DetField label="Responsable affaire NGE" value={selected.responsable} />
                <DetField label="Filiale"                value={selected.filiale} />
              </DetSection>

              <DetSection title="Références">
                <DetField label="N° étude"      value={selected.numero_etude} />
                <DetField label="N° affaire NGE" value={selected.affaire_nge} />
              </DetSection>

              <DetSection title="Dates">
                <DetField label="Ouverture" value={formatDate(selected.date_ouverture)} />
                <DetField label="Clôture"   value={selected.date_cloture ? formatDate(selected.date_cloture) : 'En cours'} />
              </DetSection>

              <DetSection title="Demandes">
                <DetField label="Total"   value={String(demandes.length)} />
                <DetField label="Actives" value={String(demandesActives)} />
              </DetSection>
            </div>

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={() => setModal('edit')}>✏️ Modifier</Button>
              <Button size="sm" onClick={() => navigate(`/affaires/${selected.uid}`)}>📋 Fiche</Button>
              <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${selected.uid}`)}>📂 Demandes</Button>
              <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${selected.uid}&create=1`)}>+ Demande</Button>
              <Button size="sm" variant="danger" onClick={handleDelete}>🗑</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AffaireModal
        open={modal === 'create'}
        onClose={() => setModal(null)}
        editData={null}
        nextRef={nextRef}
        onSaved={(saved) => {
          if (saved?.uid) setSelected(affaires.find(a => a.uid === saved.uid) || null)
        }}
      />
      <AffaireModal
        open={modal === 'edit'}
        onClose={() => setModal(null)}
        editData={selected}
        nextRef={null}
        onSaved={(saved) => {
          setSelected(s => saved ? { ...s, ...saved } : s)
        }}
      />
    </div>
  )
}
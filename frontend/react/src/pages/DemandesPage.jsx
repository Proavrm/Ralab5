/**
 * pages/DemandesPage.jsx
 * Liste des demandes RST avec filtres complets.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { demandesApi, dstApi } from '@/services/api'
import Card, { CardBody } from '@/components/ui/Card'
import Table from '@/components/ui/Table'
import Badge from '@/components/shared/Badge'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { Plus, Search, RefreshCw, Flag } from 'lucide-react'

const STATUTS = ['À qualifier', 'Demande', 'En Cours', 'Répondu', 'Fini', 'Envoyé - Perdu']
const PRIORITES = ['Normale', 'Urgente', 'Très urgente']
const LABOS = ['SP', 'PDC', 'CHB', 'CLM']

const COLUMNS = [
  { key: 'reference',    label: 'Référence',  render: v => <span className="font-mono text-xs font-medium">{v}</span> },
  { key: 'affaire',      label: 'Affaire',    render: v => <span className="text-xs text-text-muted">{v || '—'}</span> },
  { key: 'chantier',     label: 'Chantier',   render: v => <span className="truncate max-w-[160px] block text-xs">{v || '—'}</span> },
  { key: 'laboratoire',  label: 'Labo',       render: v => <span className="font-medium text-xs">{v || '—'}</span> },
  { key: 'statut',       label: 'Statut',     render: v => <Badge statut={v} />, sortable: false },
  { key: 'priorite',     label: 'Priorité',   render: v => (
      <span className={`text-xs font-medium ${v === 'Très urgente' ? 'text-danger' : v === 'Urgente' ? 'text-warn' : 'text-text-muted'}`}>
        {v === 'Très urgente' ? '🔴' : v === 'Urgente' ? '🟠' : ''} {v}
      </span>
    ), sortable: false },
  { key: 'echeance',     label: 'Échéance',   render: v => <span className="text-xs text-text-muted">{formatDate(v)}</span> },
]

function CreateDemandeModal({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    affaire: '', titre: '', client: '', chantier: '',
    laboratoire: 'SP', priorite: 'Normale', nature: '',
    demandeur: '', service: '', description: '',
  })

  const { data: nextRef } = useQuery({
    queryKey: ['demandes-next-ref'],
    queryFn: () => demandesApi.nextRef(),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (data) => demandesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes'] })
      onClose()
    },
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle demande RST" size="lg">
      <div className="flex flex-col gap-4">
        <div className="bg-bg rounded px-3 py-2 text-xs text-text-muted">
          Référence : <span className="font-mono font-medium text-text">{nextRef?.reference || '…'}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'affaire',    label: 'N° Affaire',    placeholder: '2026-RA-0001' },
            { key: 'titre',      label: 'Titre',         placeholder: 'Titre de la demande' },
            { key: 'client',     label: 'Client',        placeholder: 'Nom du client' },
            { key: 'chantier',   label: 'Chantier',      placeholder: 'Nom du chantier' },
            { key: 'demandeur',  label: 'Demandeur',     placeholder: 'Nom du demandeur' },
            { key: 'service',    label: 'Service',       placeholder: 'Service demandeur' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-text-muted block mb-1">{f.label}</label>
              <Input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1">Laboratoire</label>
            <Select value={form.laboratoire} onChange={e => set('laboratoire', e.target.value)} className="w-full">
              {LABOS.map(l => <option key={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1">Priorité</label>
            <Select value={form.priorite} onChange={e => set('priorite', e.target.value)} className="w-full">
              {PRIORITES.map(p => <option key={p}>{p}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1">Nature</label>
            <Input value={form.nature} onChange={e => set('nature', e.target.value)} placeholder="Nature" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={3}
            placeholder="Description de la demande…"
            className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-none"
          />
        </div>

        {mutation.error && (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
            {mutation.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="secondary">Annuler</Button>
          <Button
            onClick={() => mutation.mutate({ ...form, reference_base: nextRef?.reference })}
            variant="primary"
            disabled={mutation.isPending || !form.chantier}
          >
            {mutation.isPending ? 'Création…' : 'Créer la demande'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function DemandesPage() {
  const navigate = useNavigate()
  const [search, setSearch]     = useState('')
  const [statut, setStatut]     = useState('')
  const [labo, setLabo]         = useState('')
  const [priorite, setPriorite] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: demandes = [], isLoading, refetch } = useQuery({
    queryKey: ['demandes'],
    queryFn: () => demandesApi.list(),
  })

  const filtered = demandes.filter(d => {
    const matchStatut   = !statut   || d.statut === statut
    const matchLabo     = !labo     || d.laboratoire === labo
    const matchPriorite = !priorite || d.priorite === priorite
    const q = search.toLowerCase()
    const matchSearch   = !q || [d.reference, d.chantier, d.client, d.affaire, d.titre]
      .some(v => v?.toLowerCase().includes(q))
    return matchStatut && matchLabo && matchPriorite && matchSearch
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text">Demandes RST</h1>
          <p className="text-xs text-text-muted mt-0.5">{demandes.length} demandes au total</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nouvelle demande
        </Button>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Référence, chantier, affaire…"
              className="pl-8"
            />
          </div>
          <Select value={statut} onChange={e => setStatut(e.target.value)}>
            <option value="">Tous statuts</option>
            {STATUTS.map(s => <option key={s}>{s}</option>)}
          </Select>
          <Select value={labo} onChange={e => setLabo(e.target.value)}>
            <option value="">Tous labos</option>
            {LABOS.map(l => <option key={l}>{l}</option>)}
          </Select>
          <Select value={priorite} onChange={e => setPriorite(e.target.value)}>
            <option value="">Toutes priorités</option>
            {PRIORITES.map(p => <option key={p}>{p}</option>)}
          </Select>
          <Button onClick={() => refetch()} variant="ghost" size="sm">
            <RefreshCw size={13} />
          </Button>
          <span className="text-xs text-text-muted ml-auto">
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        </CardBody>
      </Card>

      <Card>
        {isLoading ? (
          <CardBody><p className="text-xs text-text-muted text-center py-8">Chargement…</p></CardBody>
        ) : (
          <Table
            columns={COLUMNS}
            rows={filtered}
            onRowClick={row => navigate(`/demandes/${row.uid}`)}
            emptyText="Aucune demande trouvée"
          />
        )}
      </Card>

      <CreateDemandeModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

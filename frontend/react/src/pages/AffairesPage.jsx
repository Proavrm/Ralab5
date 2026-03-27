/**
 * pages/AffairesPage.jsx
 * Liste des affaires RST avec filtres et création.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { affairesApi } from '@/services/api'
import Card, { CardHeader, CardTitle, CardBody } from '@/components/ui/Card'
import Table from '@/components/ui/Table'
import Badge from '@/components/shared/Badge'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { Plus, Search, RefreshCw } from 'lucide-react'

const STATUTS = ['', 'À qualifier', 'En cours', 'Terminée', 'Archivée']

const COLUMNS = [
  { key: 'reference',  label: 'Référence',  render: v => <span className="font-mono text-xs font-medium">{v}</span> },
  { key: 'titulaire',  label: 'Titulaire' },
  { key: 'chantier',   label: 'Chantier',   render: v => <span className="truncate max-w-[180px] block">{v || '—'}</span> },
  { key: 'client',     label: 'Client',     render: v => <span className="truncate max-w-[140px] block">{v || '—'}</span> },
  { key: 'statut',     label: 'Statut',     render: v => <Badge statut={v} />, sortable: false },
  { key: 'updated_at', label: 'Modifiée',   render: v => <span className="text-text-muted text-xs">{formatDate(v)}</span> },
]

function CreateAffaireModal({ open, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    titulaire: '', chantier: '', client: '',
    responsable: '', agence: '', description: '',
  })

  const { data: nextRef } = useQuery({
    queryKey: ['affaires-next-ref'],
    queryFn: () => affairesApi.nextRef(),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (data) => affairesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affaires'] })
      onClose()
      setForm({ titulaire: '', chantier: '', client: '', responsable: '', agence: '', description: '' })
    },
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle affaire RST" size="md">
      <div className="flex flex-col gap-4">
        <div className="bg-bg rounded px-3 py-2 text-xs text-text-muted">
          Référence : <span className="font-mono font-medium text-text">{nextRef?.reference || '…'}</span>
        </div>

        {[
          { key: 'titulaire',  label: 'Titulaire NGE',    placeholder: 'Ex: NGE Routes' },
          { key: 'chantier',   label: 'Chantier',         placeholder: 'Nom du chantier' },
          { key: 'client',     label: 'Client',           placeholder: 'Nom du client' },
          { key: 'responsable',label: 'Responsable',      placeholder: 'Nom du responsable' },
          { key: 'agence',     label: 'Agence',           placeholder: 'Agence concernée' },
        ].map(f => (
          <div key={f.key}>
            <label className="text-xs font-medium text-text-muted block mb-1">{f.label}</label>
            <Input
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          </div>
        ))}

        <div>
          <label className="text-xs font-medium text-text-muted block mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={3}
            placeholder="Description de l'affaire…"
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
            {mutation.isPending ? 'Création…' : 'Créer l\'affaire'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function AffairesPage() {
  const navigate = useNavigate()
  const [search, setSearch]   = useState('')
  const [statut, setStatut]   = useState('')
  const [creating, setCreating] = useState(false)

  const { data: affaires = [], isLoading, refetch } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => affairesApi.list(),
  })

  const filtered = affaires.filter(a => {
    const matchStatut = !statut || a.statut === statut
    const q = search.toLowerCase()
    const matchSearch = !q || [a.reference, a.chantier, a.client, a.titulaire]
      .some(v => v?.toLowerCase().includes(q))
    return matchStatut && matchSearch
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-text">Affaires RST</h1>
          <p className="text-xs text-text-muted mt-0.5">{affaires.length} affaires au total</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> Nouvelle affaire
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Référence, chantier, client…"
              className="pl-8"
            />
          </div>
          <Select value={statut} onChange={e => setStatut(e.target.value)} className="min-w-[160px]">
            <option value="">Tous les statuts</option>
            {STATUTS.filter(Boolean).map(s => <option key={s}>{s}</option>)}
          </Select>
          <Button onClick={() => refetch()} variant="ghost" size="sm">
            <RefreshCw size={13} />
          </Button>
          <span className="text-xs text-text-muted ml-auto">
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        </CardBody>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <CardBody>
            <p className="text-xs text-text-muted text-center py-8">Chargement…</p>
          </CardBody>
        ) : (
          <Table
            columns={COLUMNS}
            rows={filtered}
            onRowClick={row => navigate(`/affaires/${row.uid}`)}
            emptyText="Aucune affaire trouvée"
          />
        )}
      </Card>

      <CreateAffaireModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

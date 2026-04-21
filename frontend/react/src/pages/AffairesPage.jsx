/**
 * pages/AffairesPage.jsx
 * Split table + detail panel — fidèle à affaires.html legacy.
 * Colonnes: Référence, N°étude, N°affaire NGE, Chantier, Site, Client,
 *           Resp. NGE, Filiale, Titulaire, Statut, Ouverture, Dem.
 * Filtres: recherche, statut, titulaire
 * Modal unique : créer ET modifier
 */
import { useState, useEffect } from 'react'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { affairesApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'

const STATUTS = ['À qualifier', 'En cours', 'Terminée', 'Archivée']
const TITULAIRES = ['NGE GC', 'NGE Energie', 'NGE Routes', 'EHTP', 'NGE E.S.', 'NGE Transitions', 'Lyaudet', 'Autre']

const STAT_CLS = {
  'À qualifier': 'bg-[#f1efe8] text-[#5f5e5a]',
  'En cours':    'bg-[#eaf3de] text-[#3b6d11]',
  'Terminée':    'bg-[#eeedfe] text-[#534ab7]',
  'Archivée':    'bg-[#f1efe8] text-[#5f5e5a]',
}

function StatBadge({ s }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STAT_CLS[s] || STAT_CLS['À qualifier']}`}>{s}</span>
}

function DetField({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium text-text' : 'text-text-muted italic font-normal'}`}>
        {value || '—'}
      </span>
    </div>
  )
}

function DetSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1">
        {title}
      </div>
      {children}
    </div>
  )
}

function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

const EMPTY_FORM = {
  uid: 0,
  reference: '',
  client: '', chantier: '', site: '', filiale: '',
  numero_etude: '', affaire_nge: '', autre_reference: '',
  titulaire: '', responsable: '',
  statut: 'À qualifier', date_ouverture: '',
  source_type: '', source_id: '',
}

export default function AffairesPage() {
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const qc        = useQueryClient()
  const initialStatutFilter = searchParams.get('create') === '1' ? '' : (searchParams.get('statut') || '')

  // ── Filtres ──────────────────────────────────────────────────────────────
  const [search,   setSearch]   = useState('')
  const [statut,   setStatut]   = useState(initialStatutFilter)
  const [titulaire, setTitulaire] = useState('')
  const [sortCol,  setSortCol]  = useState('date_ouverture')
  const [sortAsc,  setSortAsc]  = useState(false)

  // ── Sélection + modal ────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null)   // affaire object from rows
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [isCreating, setIsCreating] = useState(false)

  // Ouvrir modal avec préfill depuis pages source (URL params: create=1&chantier=...&source_type=...)
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const today = new Date().toISOString().split('T')[0]
      setForm({
        ...EMPTY_FORM,
        date_ouverture: today,
        chantier:       searchParams.get('chantier')    || '',
        site:           searchParams.get('site')        || '',
        numero_etude:   searchParams.get('numero_etude')|| '',
        affaire_nge:    searchParams.get('affaire_nge') || '',
        autre_reference: searchParams.get('autre_reference') || '',
        filiale:        searchParams.get('filiale')     || '',
        titulaire:      searchParams.get('titulaire')   || '',
        responsable:    searchParams.get('responsable') || '',
        client:         searchParams.get('client')      || '',
        source_type:    searchParams.get('source_type') || '',
        source_id:      searchParams.get('source_id')   || '',
        statut:         searchParams.get('statut')      || 'À qualifier',
      })
      setIsCreating(true)
      setModalOpen(true)
    }
  }, [])

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: affaires = [], isLoading, refetch } = useQuery({
    queryKey: ['affaires'],
    queryFn:  () => affairesApi.list(),
  })

  const { data: nextRef } = useQuery({
    queryKey: ['affaires-next-ref'],
    queryFn:  () => affairesApi.nextRef(),
    enabled:  modalOpen && isCreating,
  })

  // ── Mutations ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (data) => data.uid
      ? affairesApi.update(data.uid, data)
      : affairesApi.create(data),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['affaires'] })
      setModalOpen(false)
      // Reselect the saved affaire
      setSelected(saved)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (uid) => affairesApi.delete(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affaires'] })
      setSelected(null)
    },
    onError: (e) => alert(e.message || 'Suppression impossible — cet affaire a des éléments liés.'),
  })

  // ── Helpers ──────────────────────────────────────────────────────────────
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  function openCreate() {
    const today = new Date().toISOString().split('T')[0]
    setForm({ ...EMPTY_FORM, date_ouverture: today, reference: nextRef?.reference || '' })
    setIsCreating(true)
    setModalOpen(true)
  }

  function openEdit() {
    if (!selected) return
    setForm({
      uid:           selected.uid,
      reference:     selected.reference     ?? '',
      client:        selected.client        ?? '',
      chantier:      selected.chantier      ?? '',
      site:          selected.site          ?? '',
      filiale:       selected.filiale       ?? '',
      numero_etude:  selected.numero_etude  ?? '',
      affaire_nge:   selected.affaire_nge   ?? '',
      autre_reference: selected.autre_reference ?? '',
      titulaire:     selected.titulaire     ?? '',
      responsable:   selected.responsable   ?? '',
      statut:        selected.statut        ?? 'À qualifier',
      date_ouverture: selected.date_ouverture ?? '',
    })
    setIsCreating(false)
    setModalOpen(true)
  }

  function handleDelete() {
    if (!selected) return
    if (!confirm(`Supprimer l'affaire ${selected.reference} ?`)) return
    deleteMutation.mutate(selected.uid)
  }

  function handleSave() {
    const payload = { ...form }
    if (isCreating) {
      payload.uid = 0
      if (nextRef?.reference) payload.reference = nextRef.reference
      // source context for backend enrichment
      if (!payload.source_type) delete payload.source_type
      if (!payload.source_id)   delete payload.source_id
    } else {
      delete payload.source_type
      delete payload.source_id
    }
    saveMutation.mutate(payload)
  }

  // ── Filtered + sorted rows ───────────────────────────────────────────────
  const filtered = [...affaires]
    .filter(a => {
      const matchStatut    = !statut    || a.statut    === statut
      const matchTitulaire = !titulaire || a.titulaire === titulaire
      const q = search.toLowerCase()
      const matchSearch = !q || [a.reference, a.chantier, a.client, a.site, a.numero_etude, a.affaire_nge, a.autre_reference, a.titulaire, a.responsable]
        .some(v => v?.toLowerCase().includes(q))
      return matchStatut && matchTitulaire && matchSearch
    })
    .sort((a, b) => {
      if (sortCol === 'reference') {
        const parse = (v) => {
          const m = String(v ?? '').match(/^(\d{4})-[^-]+-(\d+)$/)
          return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0]
        }
        const [ay, an] = parse(a.reference)
        const [by, bn] = parse(b.reference)
        const cmp = ay !== by ? ay - by : an - bn
        return sortAsc ? cmp : -cmp
      }
      const va = String(a[sortCol] ?? '').toLowerCase()
      const vb = String(b[sortCol] ?? '').toLowerCase()
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const { getColProps } = useResizableColumns([90, 90, 100, 180, 120, 100, 80, 120, 100, 90, 90, 60])

  function Th({ col, label, colIdx }) {
    const { style, resizerProps } = getColProps(colIdx ?? 0)
    return (
      <th onClick={() => toggleSort(col)}
        style={style}
        className="relative bg-bg px-3 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text overflow-hidden">
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">↕</span>}
        <span {...resizerProps} onClick={e => e.stopPropagation()} />
      </th>
    )
  }
  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full -m-6">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">Affaires RST</span>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Plus size={13} /> Nouvelle affaire
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-surface border-b border-border shrink-0 flex-wrap">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Référence, chantier, client, N°étude…"
          className="flex-1 min-w-[220px] max-w-[320px] px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-accent"
        />
        <Select value={statut} onChange={e => setStatut(e.target.value)} className="text-xs py-1.5">
          <option value="">Tous statuts</option>
          {STATUTS.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select value={titulaire} onChange={e => setTitulaire(e.target.value)} className="text-xs py-1.5">
          <option value="">Tous titulaires</option>
          {TITULAIRES.map(t => <option key={t}>{t}</option>)}
        </Select>
        {(search || statut || titulaire) && (
          <button onClick={() => { setSearch(''); setStatut(''); setTitulaire('') }}
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
        <div className="flex-1 overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">📋 Aucune affaire</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th col="reference" colIdx={0}    label="Référence" />
                  <Th col="numero_etude" colIdx={6} label="N° étude" />
                  <Th col="affaire_nge" colIdx={7}  label="N° aff. NGE" />
                  <Th col="chantier" colIdx={3}     label="Chantier" />
                  <Th col="site" colIdx={4}         label="Site" />
                  <Th col="client" colIdx={5}       label="Client" />
                  <Th col="responsable" colIdx={9}  label="Resp. NGE" />
                  <Th col="filiale" colIdx={10}      label="Filiale" />
                  <Th col="titulaire" colIdx={8}    label="Titulaire" />
                  <Th col="statut" colIdx={2}       label="Statut" />
                  <Th col="date_ouverture" colIdx={1} label="Ouverture" />
                  <th className="bg-bg px-3 py-2.5 text-center text-[11px] font-medium text-text-muted border-b border-border sticky top-0 z-10">
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
                    <td className="px-3 py-2.5">
                      <strong className="text-accent text-xs font-mono">{a.reference}</strong>
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[110px] truncate" title={a.numero_etude || ''}>
                      {a.numero_etude || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[110px] truncate" title={a.affaire_nge || ''}>
                      {a.affaire_nge || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[220px] truncate" title={a.chantier || ''}>
                      {a.chantier || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[140px] truncate" title={a.site || ''}>
                      {a.site || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{a.client || '—'}</td>
                    <td className="px-3 py-2.5 text-xs max-w-[160px] truncate" title={a.responsable || ''}>
                      {a.responsable || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{a.filiale || '—'}</td>
                    <td className="px-3 py-2.5">
                      {a.titulaire
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#002C77] text-white">{a.titulaire}</span>
                        : <span className="text-text-muted text-xs">—</span>
                      }
                    </td>
                    <td className="px-3 py-2.5"><StatBadge s={a.statut} /></td>
                    <td className="px-3 py-2.5 text-xs">{formatDate(a.date_ouverture)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {(a.nb_demandes > 0)
                        ? <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#e6f1fb] text-[#185fa5]">
                            {a.nb_demandes_actives}/{a.nb_demandes}
                          </span>
                        : <span className="text-text-muted text-xs">—</span>
                      }
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
            {/* Panel header */}
            <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
              <div>
                <div className="text-[13px] font-bold text-accent">{selected.reference}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected.chantier || '—'}</div>
                <div className="text-[11px] text-text-muted mt-0.5">{selected.site || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-1 rounded text-text-muted hover:bg-bg hover:text-text transition-colors shrink-0">
                <X size={14} />
              </button>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 px-[18px] pt-3">
              <StatBadge s={selected.statut} />
              {selected.titulaire && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#002C77] text-white">
                  {selected.titulaire}
                </span>
              )}
              {selected.filiale && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#e6f1fb] text-[#185fa5]">
                  {selected.filiale}
                </span>
              )}
            </div>

            {/* Sections */}
            <div className="flex flex-col gap-4 px-[18px] py-4 flex-1">
              <DetSection title="Projet">
                <DetField label="Client"  value={selected.client} />
                <DetField label="Chantier" value={selected.chantier} />
                <DetField label="Site"    value={selected.site} />
              </DetSection>

              <DetSection title="Parties">
                <DetField label="Titulaire"             value={selected.titulaire || '— Non défini —'} />
                <DetField label="Responsable affaire NGE" value={selected.responsable} />
                <DetField label="Filiale"               value={selected.filiale} />
              </DetSection>

              <DetSection title="Références">
                <DetField label="N° étude"       value={selected.numero_etude} />
                <DetField label="N° affaire NGE" value={selected.affaire_nge} />
                <DetField label="Autre"          value={selected.autre_reference} />
              </DetSection>

              <DetSection title="Dates">
                <DetField label="Ouverture" value={formatDate(selected.date_ouverture)} />
                <DetField label="Clôture"   value={selected.date_cloture ? formatDate(selected.date_cloture) : 'En cours'} />
              </DetSection>

              <DetSection title="Demandes">
                <DetField label="Total"   value={String(selected.nb_demandes ?? 0)} />
                <DetField label="Actives" value={String(selected.nb_demandes_actives ?? 0)} />
              </DetSection>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={openEdit}>✏️ Modifier</Button>
              <Button size="sm" onClick={() => navigate(`/affaires/${selected.uid}`)}>📋 Fiche</Button>
              <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${selected.uid}`)}>📂 Demandes</Button>
              <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${selected.uid}&create=1`)}>+ Demande</Button>
              <Button size="sm" variant="danger" onClick={handleDelete}>🗑</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal créer / modifier */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isCreating ? 'Nouvelle affaire RST' : "Modifier l'affaire RST"}
        size="md"
      >
        <div className="grid grid-cols-2 gap-3">
          {/* Référence (readonly) */}
          <FG label="Référence">
            <Input
              value={isCreating ? (nextRef?.reference || '…') : form.reference}
              readOnly
              className="text-text-muted cursor-not-allowed"
            />
          </FG>
          {/* Statut */}
          <FG label="Statut">
            <Select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full">
              {STATUTS.map(s => <option key={s}>{s}</option>)}
            </Select>
          </FG>

          {/* Client / Chantier */}
          <FG label="Client *">
            <Input value={form.client} onChange={e => set('client', e.target.value)} placeholder="SNCF, IMERYS…" />
          </FG>
          <FG label="Chantier *">
            <Input value={form.chantier} onChange={e => set('chantier', e.target.value)} placeholder="Libellé projet / chantier" />
          </FG>

          {/* Site / Filiale */}
          <FG label="Site">
            <Input value={form.site} onChange={e => set('site', e.target.value)} placeholder="VILLE (63)" />
          </FG>
          <FG label="Filiale">
            <Input value={form.filiale} onChange={e => set('filiale', e.target.value)} placeholder="NGE / GUINTOLI…" />
          </FG>

          {/* N° étude / N° affaire NGE */}
          <FG label="N° étude">
            <Input value={form.numero_etude} onChange={e => set('numero_etude', e.target.value)} placeholder="Source Études" />
          </FG>
          <FG label="N° affaire NGE">
            <Input value={form.affaire_nge} onChange={e => set('affaire_nge', e.target.value)} placeholder="Source Affaires NGE" />
          </FG>
          <div className="col-span-2">
            <FG label="Autre (si pas aff. NGE / étude)">
              <Input
                value={form.autre_reference}
                onChange={e => set('autre_reference', e.target.value)}
                placeholder="Valeur manuelle à utiliser seulement s'il n'y a ni aff. NGE ni étude"
              />
              <p className="text-xs leading-5 text-text-muted">
                Remplir uniquement si l'affaire n'a ni n° affaire NGE ni n° étude. Laisser vide dès qu'un de ces deux champs est renseigné.
              </p>
            </FG>
          </div>

          {/* Titulaire / Responsable */}
          <FG label="Titulaire">
            <Select value={form.titulaire} onChange={e => set('titulaire', e.target.value)} className="w-full">
              <option value="">— Non défini —</option>
              {TITULAIRES.map(t => <option key={t}>{t}</option>)}
            </Select>
          </FG>
          <FG label="Responsable affaire NGE">
            <Input value={form.responsable} onChange={e => set('responsable', e.target.value)} />
          </FG>

          {/* Date ouverture */}
          <FG label="Date ouverture">
            <Input type="date" value={form.date_ouverture} onChange={e => set('date_ouverture', e.target.value)} />
          </FG>
        </div>

        {saveMutation.error && (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
            {saveMutation.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button onClick={() => setModalOpen(false)} variant="secondary">Annuler</Button>
          <Button
            onClick={handleSave}
            variant="primary"
            disabled={saveMutation.isPending || !form.chantier}
          >
            {saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

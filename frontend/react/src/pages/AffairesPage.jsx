/**
 * pages/AffairesPage.jsx
 * Split table + detail panel — fidèle à affaires.html legacy.
 * Colonnes: Référence, N°étude, N°affaire NGE, Chantier, Site, Client,
 *           Resp. NGE, Filiale, Titulaire, Statut, Ouverture, Dem.
 * Filtres: recherche, statut, titulaire
 * Modal unique : créer ET modifier
 */
import { useMemo, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { affairesApi, api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { buildAffaireFolderName } from '@/lib/affaireFolderNaming'
import { Plus, RefreshCw, X } from 'lucide-react'
import {
  EmptyStateBox,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  MetricCard,
  SectionCard,
} from '@/components/layout/FicheLayout'

const STATUTS = ['À qualifier', 'Offre en cours', 'En cours', 'Terminée', 'Archivée']
const DEFAULT_TITULAIRES = ['NGE GC', 'NGE Energie', 'NGE Routes', 'EHTP', 'NGE E.S.', 'NGE Transitions', 'Lyaudet', 'Autre']

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

function DetItem({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>
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

function normalizeAffaireKey(value) {
  return String(value || '')
    .replaceAll('*', '')
    .toUpperCase()
    .replace(/[\s\-_/\.]+/g, '')
    .trim()
}

function normalizeEtudeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function getNgeFullCode(row) {
  return String(row?.numero_affaire_complet || row?.numero_affaire || '').trim()
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
  client: '', maitre_ouvrage: '', maitre_oeuvre: '', chantier: '', site: '', adresse_ouvrage: '', filiale: '',
  numero_etude: '', affaire_nge: '',
  titulaire: '', responsable: '',
  statut: 'À qualifier', date_ouverture: '',
  statut_offre: '',
  source_type: '', source_id: '',
}

export default function AffairesPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const qc        = useQueryClient()

  // ── Filtres ──────────────────────────────────────────────────────────────
  const [search,   setSearch]   = useState('')
  const [statut,   setStatut]   = useState('')
  const [titulaire, setTitulaire] = useState('')
  const [sortCol,  setSortCol]  = useState('date_ouverture')
  const [sortAsc,  setSortAsc]  = useState(false)

  // ── Sélection + modal ────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null)   // affaire object from rows
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (location.state?.openCreate) {
      const pf = location.state.prefill || {}
      const today = new Date().toISOString().split('T')[0]
      setForm({
        ...EMPTY_FORM,
        date_ouverture:  today,
        chantier:        pf.chantier        ?? '',
        site:            pf.site            ?? '',
        numero_etude:    pf.numero_etude    ?? '',
        affaire_nge:     pf.affaire_nge     ?? '',
        filiale:         pf.filiale         ?? '',
        titulaire:       pf.titulaire       ?? '',
        responsable:     pf.responsable     ?? '',
        client:          pf.client          ?? '',
        maitre_ouvrage:  pf.maitre_ouvrage  ?? '',
        maitre_oeuvre:   pf.maitre_oeuvre   ?? '',
        statut_offre:    pf.statut_offre    ?? '',
        source_type:     location.state.source_type || '',
        source_id:       location.state.source_id   || '',
      })
      setIsCreating(true)
      setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [])

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: affaires = [], isLoading, refetch } = useQuery({
    queryKey: ['affaires'],
    queryFn:  () => affairesApi.list(),
  })

  const { data: affairesNgeRows = [] } = useQuery({
    queryKey: ['affaires-nge-titulaire-options'],
    queryFn: () => api.get('/reference-affaires/rows?limit=2000'),
  })

  const { data: etudesRows = [] } = useQuery({
    queryKey: ['etudes-titulaire-options'],
    queryFn: () => api.get('/reference-etudes/rows?limit=2000'),
  })

  const { data: nextRef } = useQuery({
    queryKey: ['affaires-next-ref'],
    queryFn:  () => affairesApi.nextRef(),
    enabled:  modalOpen && isCreating,
  })

  const dossierNomPrevu = useMemo(() => {
    if (!isCreating) return ''
    return buildAffaireFolderName({
      reference: nextRef?.reference || form.reference || '',
      affaire_nge: form.affaire_nge,
      numero_etude: form.numero_etude,
      chantier: form.chantier,
      client: form.client,
      site: form.site,
      maitre_ouvrage: form.maitre_ouvrage,
    })
  }, [isCreating, nextRef?.reference, form])

  const { data: affaireFilters } = useQuery({
    queryKey: ['affaires-filters'],
    queryFn: () => api.get('/affaires/filters'),
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
    navigate(`/affaires/${selected.uid}`, { state: { startEditing: true } })
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

  const etudeStatutOffreByKey = useMemo(() => {
    const byKey = new Map()
    etudesRows.forEach((row) => {
      const key = normalizeEtudeKey(row?.numero_etude)
      const value = String(row?.statut_affaire ?? '').trim()
      if (!key || !value) return
      if (!byKey.has(key)) byKey.set(key, new Set())
      byKey.get(key).add(value)
    })
    const resolved = new Map()
    byKey.forEach((values, key) => {
      if (values.size === 1) resolved.set(key, [...values][0])
    })
    return resolved
  }, [etudesRows])

  function applySourceEtude(row, currentAffaireNge = form.affaire_nge) {
    const etude = String(row?.numero_etude || '').trim()
    const site = [String(row?.ville || '').trim(), String(row?.departement || '').trim()].filter(Boolean).join(' ').trim()
    const statutOffre = String(row?.statut_affaire || '').trim() || etudeStatutOffreByKey.get(normalizeEtudeKey(etude)) || ''
    const hasNge = !!normalizeAffaireKey(currentAffaireNge)

    if (hasNge) {
      setForm((f) => ({
        ...f,
        numero_etude: etude || f.numero_etude,
        statut_offre: statutOffre,
      }))
      return
    }

    setForm((f) => ({
      ...f,
      chantier: String(row?.nom_affaire || '').trim(),
      site,
      numero_etude: etude,
      affaire_nge: '',
      filiale: String(row?.filiale || '').trim(),
      titulaire: String(row?.filiale || '').trim(),
      responsable: String(row?.responsable_etude || '').trim(),
      maitre_ouvrage: String(row?.maitre_ouvrage || '').trim(),
      maitre_oeuvre: String(row?.maitre_oeuvre || '').trim(),
      client: String(row?.maitre_ouvrage || '').trim(),
      statut_offre: statutOffre,
      source_type: 'etude',
      source_id: String(row?.id || ''),
    }))
  }

  function applySourceNge(row) {
    const fullCode = getNgeFullCode(row)
    const filiales = row.filiales_toutes || row.filiale_principale || row.filiales_resume || ''
    const numeroEtude = String(row?.numero_etude || '').trim()
    const statutOffre = etudeStatutOffreByKey.get(normalizeEtudeKey(numeroEtude)) || ''
    setForm((f) => ({
      ...f,
      chantier: String(row?.libelle || '').trim(),
      site: '',
      numero_etude: numeroEtude,
      affaire_nge: fullCode,
      filiale: String(filiales || '').trim(),
      titulaire: String(row?.titulaire || '').trim(),
      responsable: String(row?.responsable || '').trim(),
      client: '',
      statut_offre: statutOffre,
      source_type: 'affaire_nge',
      source_id: String(row?.id || ''),
    }))
  }

  const etudeRowsByNumero = useMemo(() => {
    const map = new Map()
    etudesRows.forEach((row) => {
      const key = normalizeEtudeKey(row?.numero_etude)
      if (!key || map.has(key)) return
      map.set(key, row)
    })
    return map
  }, [etudesRows])

  const ngeRowsByCode = useMemo(() => {
    const map = new Map()
    affairesNgeRows.forEach((row) => {
      const key = normalizeAffaireKey(getNgeFullCode(row))
      if (!key || map.has(key)) return
      map.set(key, row)
    })
    return map
  }, [affairesNgeRows])

  const etudeNumberOptions = useMemo(() => {
    const values = new Set()
    etudesRows.forEach((row) => {
      const v = String(row?.numero_etude || '').trim()
      if (v) values.add(v)
    })
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  }, [etudesRows])

  const ngeCodeOptions = useMemo(() => {
    const values = new Set()
    affairesNgeRows.forEach((row) => {
      const v = getNgeFullCode(row)
      if (v) values.add(v)
    })
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  }, [affairesNgeRows])

  function handleNumeroEtudeInput(nextValue) {
    set('numero_etude', nextValue)
    const match = etudeRowsByNumero.get(normalizeEtudeKey(nextValue))
    if (match) applySourceEtude(match, form.affaire_nge)
  }

  function handleAffaireNgeInput(nextValue) {
    set('affaire_nge', nextValue)
    const match = ngeRowsByCode.get(normalizeAffaireKey(nextValue))
    if (match) applySourceNge(match)
  }

  // ── Filtered + sorted rows ───────────────────────────────────────────────
  const filtered = [...affaires]
    .filter(a => {
      const matchStatut    = !statut    || a.statut    === statut
      const matchTitulaire = !titulaire || a.titulaire === titulaire
      const q = search.toLowerCase()
      const matchSearch = !q || [a.reference, a.chantier, a.client, a.site, a.numero_etude, a.affaire_nge, a.titulaire, a.responsable]
        .some(v => v?.toLowerCase().includes(q))
      return matchStatut && matchTitulaire && matchSearch
    })
    .sort((a, b) => {
      const va = String(a[sortCol] ?? '').toLowerCase()
      const vb = String(b[sortCol] ?? '').toLowerCase()
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const metrics = useMemo(() => {
    const total = filtered.length
    const active = filtered.filter((a) => a.statut === 'En cours').length
    const withDemands = filtered.filter((a) => (a.nb_demandes || 0) > 0).length
    const toQualify = filtered.filter((a) => a.statut === 'À qualifier').length
    return { total, active, withDemands, toQualify }
  }, [filtered])

  const titulaireOptions = useMemo(() => {
    const values = new Set(DEFAULT_TITULAIRES)
    affaires.forEach((a) => {
      const value = String(a?.titulaire ?? '').trim()
      if (value) values.add(value)
    })
    affairesNgeRows.forEach((row) => {
      const value = String(row?.titulaire ?? '').trim()
      if (value) values.add(value)
    })
    etudesRows.forEach((row) => {
      const titulaire = String(row?.titulaire ?? '').trim()
      const filiale = String(row?.filiale ?? '').trim()
      if (titulaire) values.add(titulaire)
      if (filiale) values.add(filiale)
    })
    const currentFilter = String(titulaire ?? '').trim()
    if (currentFilter) values.add(currentFilter)
    const currentForm = String(form?.titulaire ?? '').trim()
    if (currentForm) values.add(currentForm)
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  }, [affaires, affairesNgeRows, etudesRows, titulaire, form?.titulaire])

  const ngeTitulaireByKey = useMemo(() => {
    const byKey = new Map()
    affairesNgeRows.forEach((row) => {
      const key = normalizeAffaireKey(row?.numero_affaire_complet || row?.numero_affaire)
      const value = String(row?.titulaire ?? '').trim()
      if (!key || !value) return
      if (!byKey.has(key)) byKey.set(key, new Set())
      byKey.get(key).add(value)
    })
    const resolved = new Map()
    byKey.forEach((values, key) => {
      if (values.size === 1) resolved.set(key, [...values][0])
    })
    return resolved
  }, [affairesNgeRows])

  const etudeFilialeByKey = useMemo(() => {
    const byKey = new Map()
    etudesRows.forEach((row) => {
      const key = normalizeAffaireKey(row?.numero_etude)
      const value = String(row?.filiale ?? '').trim()
      if (!key || !value) return
      if (!byKey.has(key)) byKey.set(key, new Set())
      byKey.get(key).add(value)
    })
    const resolved = new Map()
    byKey.forEach((values, key) => {
      if (values.size === 1) resolved.set(key, [...values][0])
    })
    return resolved
  }, [etudesRows])

  const suggestedTitulaire = useMemo(() => {
    if (!form) return ''
    if (String(form.titulaire || '').trim()) return ''

    const ngeKey = normalizeAffaireKey(form.affaire_nge)
    if (ngeKey) return ngeTitulaireByKey.get(ngeKey) || ''

    const etudeKey = normalizeAffaireKey(form.numero_etude)
    if (etudeKey) return etudeFilialeByKey.get(etudeKey) || ''

    return ''
  }, [form, ngeTitulaireByKey, etudeFilialeByKey])

  const statutOptions = useMemo(() => {
    const values = new Set(STATUTS)
    ;(affaireFilters?.statuts || []).forEach((s) => {
      const value = String(s || '').trim()
      if (value) values.add(value)
    })
    const selectedValue = String(form?.statut || '').trim()
    if (selectedValue) values.add(selectedValue)
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  }, [affaireFilters?.statuts, form?.statut])

  const { widths, getColProps } = useResizableColumns([130, 110, 120, 240, 160, 170, 150, 240, 260, 110, 105, 80])

  function Th({ col, label, colIdx, className = '' }) {
    const { style, resizerProps } = getColProps(colIdx ?? 0)
    return (
      <th onClick={() => toggleSort(col)}
        style={style}
        className={`relative overflow-hidden bg-bg px-3 py-1.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text ${className}`}>
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">↕</span>}
        <span {...resizerProps} onClick={e => e.stopPropagation()} />
      </th>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigate('/')}
        eyebrow="Affaires RST"
        title="Portefeuille et suivi"
      >
        <Button type="button" variant="primary" size="sm" onClick={openCreate} className="rounded-xl font-bold">
          <Plus size={14} /> Nouvelle affaire
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()} className="rounded-xl px-3 text-text-muted">
          <RefreshCw size={14} />
        </Button>
      </FicheTopbar>

      <FicheMain>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <MetricCard label="Affaires" value={metrics.total} detail="Selon filtres actifs" />
          <MetricCard label="En cours" value={metrics.active} detail="Statut opérationnel" />
          <MetricCard label="Avec demandes" value={metrics.withDemands} detail="Affaires liées" />
          <MetricCard label="À qualifier" value={metrics.toQualify} detail="À traiter rapidement" />
        </div>

        <SectionCard
          title="Affaires"
          subtitle="Tableau principal et panneau de détail"
          actions={(
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Référence, chantier, client, N°étude…"
                className="flex-1 min-w-[220px] max-w-[320px] px-3 py-1.5 border border-border rounded text-sm bg-white outline-none focus:border-nge"
              />
              <Select value={statut} onChange={e => setStatut(e.target.value)} className="text-xs py-1.5">
                <option value="">Tous statuts</option>
                {statutOptions.map(s => <option key={s}>{s}</option>)}
              </Select>
              <Select value={titulaire} onChange={e => setTitulaire(e.target.value)} className="text-xs py-1.5">
                <option value="">Tous titulaires</option>
                {titulaireOptions.map(t => <option key={t} value={t}>{t}</option>)}
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
          )}
        >
      <div className="flex overflow-hidden max-h-[66vh]">

        {/* Table */}
        <div className="flex-1 overflow-x-scroll overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : filtered.length === 0 ? (
            <EmptyStateBox icon="📋" title="Aucune affaire" description="Aucun résultat pour les filtres en cours." />
          ) : (
            <table
              className="border-collapse text-sm min-w-full [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis"
              style={{ width: Math.max(widths.reduce((sum, w) => sum + w, 0), 0), minWidth: '100%', tableLayout: 'fixed' }}
            >
              <colgroup>
                {widths.map((w, i) => (
                  <col key={i} style={{ width: w, minWidth: w, maxWidth: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <Th col="reference" colIdx={0} label="Référence" />
                  <Th col="numero_etude" colIdx={1} label="N° étude" />
                  <Th col="affaire_nge" colIdx={2} label="N° aff. NGE" />
                  <Th col="chantier" colIdx={3} label="Chantier" />
                  <Th col="site" colIdx={4} label="Site" />
                  <Th col="client" colIdx={5} label="Client" />
                  <Th col="responsable" colIdx={6} label="Resp. NGE" />
                  <Th col="filiale" colIdx={7} label="Filiale" />
                  <Th col="titulaire" colIdx={8} label="Titulaire" />
                  <Th col="statut" colIdx={9} label="Statut" />
                  <Th col="date_ouverture" colIdx={10} label="Ouverture" />
                  <th style={getColProps(11).style} className="relative overflow-hidden bg-bg px-3 py-1.5 text-center text-[11px] font-medium text-text-muted border-b border-border sticky top-0 z-10">
                    Dem.
                    <span {...getColProps(11).resizerProps} />
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
                    <td className="px-3 py-1.5">
                      <strong className="text-nge text-xs font-mono">{a.reference}</strong>
                    </td>
                    <td className="px-3 py-1.5 text-xs max-w-[110px] truncate" title={a.numero_etude || ''}>
                      {a.numero_etude || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs max-w-[110px] truncate" title={a.affaire_nge || ''}>
                      {a.affaire_nge || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs max-w-[220px] truncate" title={a.chantier || ''}>
                      {a.chantier || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs max-w-[140px] truncate" title={a.site || ''}>
                      {a.site || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs">{a.client || '—'}</td>
                    <td className="px-3 py-1.5 text-xs max-w-[160px] truncate" title={a.responsable || ''}>
                      {a.responsable || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      <span className="inline-block max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={a.filiale || ''}>
                        {a.filiale || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      {a.titulaire
                        ? <span className="inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#002C77] text-white" title={a.titulaire}>{a.titulaire}</span>
                        : <span className="text-text-muted text-xs">—</span>
                      }
                    </td>
                    <td className="px-3 py-1.5"><StatBadge s={a.statut} /></td>
                    <td className="px-3 py-1.5 text-xs">{formatDate(a.date_ouverture)}</td>
                    <td className="px-3 py-1.5 text-center">
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
          <div className="w-[360px] min-w-[320px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
              <div>
                <div className="text-[13px] font-bold text-nge">{selected.reference}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected.chantier || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg hover:text-text transition-colors shrink-0">
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 px-[18px] py-4 border-b border-border">
              <DetItem label="Client" value={selected.client} />
              <DetItem label="Maître d'ouvrage" value={selected.maitre_ouvrage} />
              <DetItem label="Maître d'œuvre" value={selected.maitre_oeuvre} />
              <DetItem label="Site" value={selected.site} />
              <DetItem label="Statut" value={selected.statut} />
              <DetItem label="Statut offre" value={selected.statut_offre} />
              <DetItem label="Titulaire" value={selected.titulaire} />
              <DetItem label="Filiale" value={selected.filiale} />
              <DetItem label="Resp. NGE" value={selected.responsable} />
              <DetItem label="N° étude" value={selected.numero_etude} />
              <DetItem label="N° aff. NGE" value={selected.affaire_nge} />
              <DetItem label="Ouverture" value={formatDate(selected.date_ouverture)} />
              <DetItem label="Clôture" value={selected.date_cloture ? formatDate(selected.date_cloture) : 'En cours'} />
              <DetItem label="Demandes actives" value={String(selected.nb_demandes_actives ?? 0)} />
              <DetItem label="Demandes" value={String(selected.nb_demandes ?? 0)} />
            </div>

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" onClick={() => navigate(`/affaires/${selected.uid}`)}>📋 Fiche</Button>
              <Button size="sm" variant="primary" onClick={openEdit}>✏️ Modifier</Button>
              <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${selected.uid}`)}>📂 Demandes</Button>
              <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${selected.uid}&create=1`)}>+ Demande</Button>
              <Button size="sm" variant="danger" onClick={handleDelete}>🗑</Button>
            </div>
          </div>
        )}
      </div>
        </SectionCard>
      </FicheMain>

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
              {statutOptions.map(s => <option key={s}>{s}</option>)}
            </Select>
          </FG>

          <FG label="Statut offre (Études)">
            <Input value={form.statut_offre || ''} readOnly className="text-text-muted cursor-not-allowed" />
          </FG>

          {/* Client / acteurs */}
          <FG label="Client *">
            <Input value={form.client} onChange={e => set('client', e.target.value)} placeholder="Facturation / contact (peut différer du MOA)" />
          </FG>
          <FG label="Maître d'ouvrage">
            <Input value={form.maitre_ouvrage || ''} onChange={e => set('maitre_ouvrage', e.target.value)} placeholder="Donneur d'ordre" />
          </FG>
          <FG label="Maître d'œuvre">
            <Input value={form.maitre_oeuvre || ''} onChange={e => set('maitre_oeuvre', e.target.value)} placeholder="Projectiste / coordonnateur" />
          </FG>
          <FG label="Chantier *">
            <Input value={form.chantier} onChange={e => set('chantier', e.target.value)} placeholder="Libellé projet / chantier" />
          </FG>

          {/* Site / Filiale */}
          <FG label="Site">
            <Input value={form.site} onChange={e => set('site', e.target.value)} placeholder="VILLE (63)" />
          </FG>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-medium text-text-muted">Adresse ouvrage</label>
            <textarea
              value={form.adresse_ouvrage || ''}
              onChange={e => set('adresse_ouvrage', e.target.value)}
              placeholder="Rue, numéro, commune — plan de situation"
              rows={2}
              className="w-full px-2.5 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge"
            />
          </div>
          <FG label="Filiale">
            <Input value={form.filiale} onChange={e => set('filiale', e.target.value)} placeholder="NGE / GUINTOLI…" />
          </FG>

          {/* N° étude / N° affaire NGE */}
          <FG label="N° étude">
            <Input
              value={form.numero_etude}
              onChange={e => handleNumeroEtudeInput(e.target.value)}
              placeholder="Source Études"
              list="affaires-etudes-options"
            />
          </FG>
          <FG label="N° affaire NGE">
            <Input
              value={form.affaire_nge}
              onChange={e => handleAffaireNgeInput(e.target.value)}
              placeholder="Source Affaires NGE"
              list="affaires-nge-options"
            />
          </FG>

          {/* Titulaire / Responsable */}
          <FG label="Titulaire">
            <Select value={form.titulaire} onChange={e => set('titulaire', e.target.value)} className="w-full">
              {suggestedTitulaire ? <option value={suggestedTitulaire}>Suggestion source: {suggestedTitulaire}</option> : null}
              <option value="">— Non défini —</option>
              {titulaireOptions.filter(t => t !== suggestedTitulaire).map(t => <option key={t} value={t}>{t}</option>)}
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

        <datalist id="affaires-etudes-options">
          {etudeNumberOptions.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="affaires-nge-options">
          {ngeCodeOptions.map((value) => <option key={value} value={value} />)}
        </datalist>

        {isCreating && dossierNomPrevu ? (
          <div className="mt-4 rounded-xl border border-border bg-[#f8fafc] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Nom dossier prévu</div>
            <div className="mt-1 text-[13px] font-semibold text-[#172033] leading-snug">{dossierNomPrevu}</div>
            <div className="mt-1.5 text-[11px] text-text-muted leading-relaxed">
              Appliqué à la création si aucun nom manuel n&apos;est saisi ensuite sur la fiche.
            </div>
          </div>
        ) : null}

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
    </FichePageShell>
  )
}

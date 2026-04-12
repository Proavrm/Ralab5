/**
 * DstPage.jsx — fidèle à dst.html legacy
 * API: GET /dst?search=&limit=2000, GET /dst/status
 *      POST /dst/import?sheet_name=...  (multipart)
 * Colonnes: N°chrono, Projet, Demandeur, Localisation, Ouverture, Statut, Service DST, DR
 * Panel: détail complet + Objet de la demande
 * Modal: import Excel
 */
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { RefreshCw, X, Upload } from 'lucide-react'

const STATUT_CLS = {
  'En cours':    'bg-[#eaf3de] text-[#3b6d11]',
  'Terminé':     'bg-[#eeedfe] text-[#534ab7]',
  'Transmis':    'bg-[#e6f1fb] text-[#185fa5]',
  'Annulé':      'bg-[#f1efe8] text-[#5f5e5a]',
}

function StatBadge({ s }) {
  if (!s) return <span className="text-text-muted text-xs">—</span>
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
}
function DetItem({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>

    </div>
  )
}

function shortName(v) {
  if (!v) return '—'
  return v.replace(/,.*/, '').trim().split(' ').slice(0, 2).join(' ')
}
function shortDR(v) {
  if (!v) return '—'
  return v.replace(/Direction\s+/i, '').slice(0, 20)
}

export default function DstPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch]     = useState('')
  const [debouncedSearch, setDS] = useState('')
  const [selected, setSelected]  = useState(null)
  const [sortCol, setSortCol]    = useState('N° chrono')
  const [sortAsc, setSortAsc]    = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile]  = useState(null)
  const [sheetName, setSheetName]   = useState('ExcelMergeQuery')
  const [importResult, setImportResult] = useState(null)
  const [pickAffaire, setPickAffaire] = useState(false)
  const [pickedAffaire, setPickedAffaire] = useState('')
  const fileInputRef = useRef(null)
  const timer = useRef(null)

  function onSearch(v) {
    setSearch(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDS(v), 300)
  }

  const { data: status } = useQuery({
    queryKey: ['dst-status'],
    queryFn: () => api.get('/dst/status'),
  })

  const { data: rawRows = [], isLoading, refetch } = useQuery({
    queryKey: ['dst-rows', debouncedSearch],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '2000' })
      if (debouncedSearch) p.set('search', debouncedSearch)
      return api.get(`/dst?${p}`)
    },
  })

  const { data: affairesRst = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => api.get('/affaires'),
  })

  // Aplatit row_id + data
  const rows = rawRows.map(r => ({ id: r.row_id, ...r.data }))

  const importMutation = useMutation({
    mutationFn: async ({ file, sheet }) => {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('ralab_token')
      const res = await fetch(`/api/dst/import?sheet_name=${encodeURIComponent(sheet)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Erreur import')
      return res.json()
    },
    onSuccess: (data) => {
      setImportResult({ ok: true, data })
      qc.invalidateQueries({ queryKey: ['dst-rows'] })
      qc.invalidateQueries({ queryKey: ['dst-status'] })
    },
    onError: (e) => setImportResult({ ok: false, msg: e.message }),
  })

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  const sorted = [...rows].sort((a, b) => {
    const va = String(a[sortCol] ?? '').toLowerCase()
    const vb = String(b[sortCol] ?? '').toLowerCase()
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  function findMatchingRst(row) {
    const nge = String(row['N° affaire demandeur'] || '').trim().toLowerCase()
    if (!nge) return null
    return affairesRst.find(a => String(a.affaire_nge || '').trim().toLowerCase() === nge) || null
  }

  function buildAffaireUrl(d) {
    const p = new URLSearchParams({
      create: '1',
      chantier:    d['Libellé du projet'] || '',
      site:        d['Situation Géographique'] || d['Situation géographique projet'] || '',
      affaire_nge: d['N° affaire demandeur'] || '',
      client:      d['Société'] || '',
      responsable: shortName(d['Demandeur']),
      statut:      'À qualifier',
    })
    return `/affaires?${p}`
  }

  function createAffaire() {
    if (!selected) return
    navigate(buildAffaireUrl(selected))
  }

  function buildDemandePrefill(affaire) {
    const chrono = selected['N° chrono'] || ''
    const objet = String(selected['Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)'] || '')
      .replace(/_x000D_/gi, '').trim()
    return {
      target: 'demande_rst',
      source_type: 'dst',
      source_id: selected.id,
      prefill: {
        affaire_rst_id: affaire.uid,
        numero_dst:     chrono,
        type_mission:   'À définir',
        nature:         selected['Cadre de la demande'] || 'Demande DST',
        demandeur:      shortName(selected['Demandeur']),
        description:    [chrono ? `DST: ${chrono}` : '', selected['Libellé du projet'] || '', objet].filter(Boolean).join('\n'),
        observations:   `Préremplie depuis DST ${chrono}`.trim(),
      },
    }
  }

  function createDemande() {
    if (!selected) return
    const affaire = findMatchingRst(selected)
    if (affaire) {
      // Match direct — on y va
      sessionStorage.setItem('ralab4_source_prefill', JSON.stringify(buildDemandePrefill(affaire)))
      navigate('/demandes?create=1')
    } else {
      // Pas de match — on demande quelle affaire RST utiliser
      setPickedAffaire('')
      setPickAffaire(true)
    }
  }

  function confirmPickAffaire() {
    if (!pickedAffaire) return
    const affaire = affairesRst.find(a => String(a.uid) === pickedAffaire)
    if (!affaire) return
    sessionStorage.setItem('ralab4_source_prefill', JSON.stringify(buildDemandePrefill(affaire)))
    setPickAffaire(false)
    navigate('/demandes?create=1')
  }

  function handleFileDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.match(/\.(xlsx|xls)$/i)) setImportFile(f)
  }

  const { getColProps } = useResizableColumns([80, 200, 110, 130, 85, 90, 100, 80])

  function Th({ col, label, colIdx }) {
    const { style, resizerProps } = getColProps(colIdx ?? 0)
    return (
      <th onClick={() => toggleSort(col)}
        style={style}
        className="relative bg-bg px-3 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text overflow-hidden">
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">\u2195</span>}
        <span {...resizerProps} onClick={e => e.stopPropagation()} />
      </th>
    )
  }

  const objet = selected
    ? (selected['Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)'] || '')
        .replace(/_x000D_\n/g, '\n').replace(/_x000d_\n/g, '\n').trim()
    : ''

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">DST</span>
        {/* Status */}
        {status && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className={`w-2 h-2 rounded-full ${status.available ? 'bg-success' : 'bg-warn'}`} />
            {status.available
              ? `${status.row_count} dossiers · ${status.columns?.length || 0} colonnes`
              : 'Base vide'}
          </div>
        )}
        <Button size="sm" onClick={() => { setImportFile(null); setImportResult(null); setImportOpen(true) }}>
          <Upload size={13} /> Importer Excel
        </Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-surface border-b border-border shrink-0">
        <input value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher N° chrono, projet, demandeur…"
          className="flex-1 max-w-[400px] px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-accent" />
        <span className="text-xs text-text-muted ml-auto">{rows.length} dossier{rows.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Split */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
              <div className="text-4xl">📁</div>
              <p className="text-sm">Aucun dossier DST.</p>
              <Button size="sm" onClick={() => setImportOpen(true)}><Upload size={13} /> Importer Excel</Button>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th col="N° chrono" colIdx={0}          label="N° chrono" />
                  <Th col="Libellé du projet" colIdx={1}   label="Projet" />
                  <Th col="Demandeur" colIdx={2}           label="Demandeur" />
                  <Th col="Situation Géographique" colIdx={3} label="Localisation" />
                  <Th col="Ouverture" colIdx={4}           label="Ouverture" />
                  <Th col="Statut" colIdx={5}              label="Statut" />
                  <Th col="Service DST" colIdx={6}         label="Service DST" />
                  <Th col="Direction régionale" colIdx={7} label="DR" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(row => (
                  <tr key={row.id}
                    onClick={() => setSelected(selected?.id === row.id ? null : row)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.id === row.id ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3 py-2.5"><strong className="text-accent text-xs">{row['N° chrono'] || '—'}</strong></td>
                    <td className="px-3 py-2.5 text-xs max-w-[260px] truncate" title={row['Libellé du projet'] || ''}>{row['Libellé du projet'] || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{shortName(row['Demandeur'])}</td>
                    <td className="px-3 py-2.5 text-xs">{row['Situation Géographique'] || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{formatDate(row['Ouverture'])}</td>
                    <td className="px-3 py-2.5"><StatBadge s={row['Statut']} /></td>
                    <td className="px-3 py-2.5 text-xs">{row['Service DST'] || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{shortDR(row['Direction régionale'])}</td>
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
                <div className="text-[16px] font-bold text-accent">{selected['N° chrono'] || '—'}</div>
                <div className="text-[12px] font-semibold text-text mt-0.5">{selected['Libellé du projet'] || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg shrink-0"><X size={14} /></button>
            </div>

            <div className="grid grid-cols-3 gap-3 px-[18px] py-4 border-b border-border">
              <DetItem label="Demandeur"    value={selected['Demandeur']} />
              <DetItem label="Société"      value={selected['Société']} />
              <DetItem label="Localisation" value={selected['Situation Géographique'] || selected['Situation géographique projet']} />
              <DetItem label="Statut"       value={selected['Statut']} />
              <DetItem label="Ouverture"    value={formatDate(selected['Ouverture'])} />
              <DetItem label="Échéance"     value={formatDate(selected['Remise souhaitée'] || selected['Echéance estimée'] || selected['Echéance'])} />
              <DetItem label="Service DST"  value={selected['Service DST']} />
              <DetItem label="Intervenant"  value={selected['Intervenant']} />
              <DetItem label="Direction rég." value={selected['Direction régionale']} />
              <DetItem label="Cadre demande" value={selected['Cadre de la demande']} />
              <DetItem label="Domaine étude" value={selected["Domaine d'étude"]} />
              <DetItem label="N° aff. dem." value={selected['N° affaire demandeur']} />
            </div>

            {objet && (
              <div className="px-[18px] py-4 border-b border-border flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted mb-2">Objet de la demande</div>
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-text">{objet}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={createAffaire}>📋 Créer affaire RST</Button>
              <Button size="sm" onClick={createDemande}>📂 Créer demande</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal import */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importer DST — Excel" size="sm">
        <div className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-accent hover:bg-bg transition-colors">
            <Upload size={24} className="mx-auto mb-2 text-text-muted" />
            {importFile
              ? <p className="text-sm font-medium">{importFile.name}</p>
              : <p className="text-sm text-text-muted">Glisse un fichier .xlsx ici ou clique pour choisir</p>
            }
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => setImportFile(e.target.files[0] || null)} />
          </div>

          {/* Sheet name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Nom de la feuille</label>
            <input value={sheetName} onChange={e => setSheetName(e.target.value)}
              className="px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" />
          </div>

          {/* Result */}
          {importResult && (
            <div className={`px-3 py-2 rounded text-xs ${importResult.ok ? 'bg-[#eaf3de] text-[#3b6d11]' : 'bg-[#fcebeb] text-[#a32d2d]'}`}>
              {importResult.ok
                ? `✓ Import terminé · ${importResult.data.inserted} insérés · ${importResult.data.updated} mis à jour · ${importResult.data.skipped} ignorés (${importResult.data.total_rows} lignes)`
                : `✗ ${importResult.msg}`}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button onClick={() => setImportOpen(false)} variant="secondary">Fermer</Button>
            <Button
              onClick={() => { setImportResult(null); importMutation.mutate({ file: importFile, sheet: sheetName }) }}
              variant="primary"
              disabled={!importFile || importMutation.isPending}>
              {importMutation.isPending ? 'Import en cours…' : '📥 Importer'}
            </Button>
          </div>
        </div>
      </Modal>
      {/* Modal choix affaire RST quand pas de match automatique */}
      {pickAffaire && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl w-[480px] max-w-[95vw] p-6 shadow-2xl">
            <div className="text-[15px] font-semibold mb-1">Aucune affaire RST trouvée automatiquement</div>
            <p className="text-[13px] text-text-muted mb-4">
              Le N° affaire demandeur <strong>{selected?.['N° affaire demandeur'] || '—'}</strong> ne correspond à aucune affaire RST existante.
              Sélectionnez une affaire existante ou créez-en une nouvelle.
            </p>
            <div className="flex flex-col gap-3">
              <select
                value={pickedAffaire}
                onChange={e => setPickedAffaire(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                <option value="">— Sélectionner une affaire RST existante —</option>
                {affairesRst.map(a => (
                  <option key={a.uid} value={a.uid}>{a.reference} — {a.chantier || a.client}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-[12px] text-text-muted">
                <div className="flex-1 h-px bg-border"></div>
                <span>ou</span>
                <div className="flex-1 h-px bg-border"></div>
              </div>
              <Button onClick={() => { setPickAffaire(false); navigate(buildAffaireUrl(selected)) }}>
                📋 Créer une nouvelle affaire RST
              </Button>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              <Button onClick={() => setPickAffaire(false)}>Annuler</Button>
              <Button variant="primary" onClick={confirmPickAffaire} disabled={!pickedAffaire}>
                ✓ Créer la demande
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

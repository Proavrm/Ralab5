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
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'

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
  const text = String(v || '').replace(/\s+/g, ' ').trim()
  if (!text) return '—'
  const parts = text.split(',').map(part => part.trim()).filter(Boolean)
  if (!parts.length) return '—'
  const tail = parts[parts.length - 1]
  const nameParts = parts.length >= 3 && /^[A-Z]?\d[A-Z0-9]*$/i.test(tail)
    ? parts.slice(0, -1)
    : parts
  return nameParts.join(' ')
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
  const [editDstOpen, setEditDstOpen] = useState(false)
  const [editNumeroAffaireDemandeur, setEditNumeroAffaireDemandeur] = useState('')
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

  // Aplatit row_id + data
  const rows = rawRows.map(r => ({ id: r.row_id, ...r.data }))

  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => api.get('/affaires'),
  })

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

  const updateDstMutation = useMutation({
    mutationFn: async ({ rowId, data }) => api.patch(`/dst/${rowId}`, { data }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['dst-rows'] })
      qc.invalidateQueries({ queryKey: ['dst-status'] })
      if (updated?.data) {
        setSelected({ id: updated.row_id, ...updated.data })
      }
      setEditDstOpen(false)
    },
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

  function buildAffaireUrl(d) {
    const fromAffaireDemandeur = classifyAffaireDemandeur(d['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(d)
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const affaireNge = fromAffaireDemandeur.numeroAffaireNge
    const autreReference = !numeroEtude && !affaireNge ? String(d['N° affaire demandeur'] || '').trim() : ''

    const p = new URLSearchParams({
      create: '1',
      chantier:    d['Libellé du projet'] || '',
      site:        d['Situation Géographique'] || d['Situation géographique projet'] || '',
      numero_etude: numeroEtude,
      affaire_nge: affaireNge,
      autre_reference: autreReference,
      client:      d['Société'] || '',
      responsable: shortName(d['Demandeur']),
      statut:      'À qualifier',
    })
    return `/affaires?${p}`
  }

  function buildAffairePrefill(d) {
    const fromAffaireDemandeur = classifyAffaireDemandeur(d['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(d)
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const affaireNge = fromAffaireDemandeur.numeroAffaireNge

    return {
      chantier: d['Libellé du projet'] || '',
      site: d['Situation Géographique'] || d['Situation géographique projet'] || '',
      numero_etude: numeroEtude,
      affaire_nge: affaireNge,
      filiale: d['Société'] || '',
      titulaire: d['Société'] || '',
      responsable: shortName(d['Demandeur']),
      client: d['Société'] || '',
      statut: 'À qualifier',
    }
  }

  function createAffaire() {
    if (!selected) return
    const match = findMatchingAffaire(selected)
    if (match?.uid) {
      const createDemandeOnExisting = window.confirm(
        `Affaire existante detectee (${match.reference || `#${match.uid}`}).\n\nCreer une nouvelle demande sur cette affaire ?`
      )
      if (createDemandeOnExisting) {
        navigate('/demandes?create=1', {
          state: {
            openCreate: true,
            source_type: 'dst',
            source_id: selected.id,
            prefill: buildDemandePrefill(match),
          },
        })
      } else {
        const openExisting = window.confirm("Voulez-vous ouvrir l'affaire existante ?\n\nAnnuler = rester sur la page actuelle.")
        if (!openExisting) return
        navigate(`/affaires/${match.uid}`)
      }
      return
    }
    navigate('/affaires', {
      state: {
        openCreate: true,
        source_type: 'dst',
        source_id: selected.id,
        prefill: buildAffairePrefill(selected),
      },
    })
  }

  function dstNumeroEtude(row) {
    return String(
      row['N° étude'] ||
      row['N° etude'] ||
      row["N° affaire étude"] ||
      row['N° affaire etude'] ||
      row['N° affaire'] ||
      row['nAffaire'] ||
      '',
    ).trim()
  }

  function classifyAffaireDemandeur(raw) {
    const value = String(raw || '').trim()
    if (!value) return { numeroAffaireNge: '', numeroEtude: '' }
    const first = value[0]
    if (/^[A-Za-z]$/.test(first)) {
      return { numeroAffaireNge: value, numeroEtude: '' }
    }
    if (/^[0-9]$/.test(first)) {
      return { numeroAffaireNge: '', numeroEtude: value }
    }
    return { numeroAffaireNge: value, numeroEtude: '' }
  }

  function normCode(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '')
  }

  function etudeCandidates(v) {
    const base = normCode(v)
    if (!base) return []
    const out = [base]
    const y4 = base.match(/^20(\d{2})(.+)$/)
    if (y4) out.push(`${y4[1]}${y4[2]}`)
    const y2 = base.match(/^(\d{2})(.+)$/)
    if (y2 && !base.startsWith('20')) out.push(`20${y2[1]}${y2[2]}`)
    return Array.from(new Set(out))
  }

  function findMatchingAffaire(row) {
    const fromAffaireDemandeur = classifyAffaireDemandeur(row['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(row)
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const numeroAffaireNge = fromAffaireDemandeur.numeroAffaireNge

    const etudeKeys = etudeCandidates(numeroEtude)
    const ngeKey = normCode(numeroAffaireNge)

    return affaires.find((a) => {
      const affaireEtudeKeys = etudeCandidates(a.numero_etude)
      const etudeMatch = etudeKeys.length > 0 && affaireEtudeKeys.some((key) => etudeKeys.includes(key))
      const ngeMatch = !!ngeKey && normCode(a.affaire_nge) === ngeKey
      return etudeMatch || ngeMatch
    }) || null
  }

  function buildDemandePrefill(matchedAffaire = null) {
    const chrono = selected['N° chrono'] || ''
    const fromAffaireDemandeur = classifyAffaireDemandeur(selected['N° affaire demandeur'])
    const explicitNumeroEtude = dstNumeroEtude(selected)
    const numeroAffaireNge = fromAffaireDemandeur.numeroAffaireNge
    const numeroEtude = explicitNumeroEtude || fromAffaireDemandeur.numeroEtude
    const dstField = (...keys) => keys.map((key) => String(selected?.[key] || '').trim()).find(Boolean) || ''
    const objet = String(selected['Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)'] || '')
      .replace(/_x000D_/gi, '').trim()
    const typePrestation = dstField('Type de prestation attendue', 'Autre type de prestation')
    return {
      source: {
        source_type: 'dst',
        source_id: selected.id,
        numero_dst: chrono,
        libelle_projet: selected['Libellé du projet'] || '',
        demandeur: shortName(selected['Demandeur']),
      },
      demande: {
        affaire_rst_id: matchedAffaire?.uid || undefined,
        numero_dst:     chrono,
        numero_affaire_nge: numeroAffaireNge,
        numero_etude:   numeroEtude,
        type_mission:   typePrestation,
        nature:         selected['Cadre de la demande'] || 'Demande DST',
        domaine_etude:  dstField("Domaine d'étude", "Autre domaine d'étude"),
        type_prestation_attendue: typePrestation,
        documents_fournis: dstField('Liste des documents fournis'),
        lien_pieces_jointes: dstField("Lien d'accès pièces jointes volumineuses"),
        service_interne: dstField('Service'),
        societe_interne: dstField('Société'),
        urgence_source: dstField('Urgence'),
        demandeur:      shortName(selected['Demandeur']),
        description:    [chrono ? `DST: ${chrono}` : '', selected['Libellé du projet'] || '', objet].filter(Boolean).join('\n'),
        observations:   `Préremplie depuis DST ${chrono}`.trim(),
      },
    }
  }

  function createDemande() {
    if (!selected) return
    navigate('/demandes?create=1', {
      state: {
        openCreate: true,
        source_type: 'dst',
        source_id: selected.id,
        prefill: buildDemandePrefill(),
      },
    })
  }

  function openEditDst() {
    if (!selected) return
    setEditNumeroAffaireDemandeur(String(selected['N° affaire demandeur'] || '').trim())
    setEditDstOpen(true)
  }

  function saveEditDst() {
    if (!selected?.id) return
    const payload = {
      'N° affaire demandeur': editNumeroAffaireDemandeur.trim(),
    }
    updateDstMutation.mutate({ rowId: selected.id, data: payload })
  }

  function handleFileDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.match(/\.(xlsx|xls)$/i)) setImportFile(f)
  }

  const { widths, getColProps } = useResizableColumns([140, 330, 170, 220, 140, 150, 170, 140])

  function Th({ col, label, colIdx }) {
    const { style, resizerProps } = getColProps(colIdx ?? 0)
    return (
      <th onClick={() => toggleSort(col)}
        style={style}
        className="relative bg-bg px-3 py-1.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text overflow-hidden">
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
    <FichePageShell>
      <FicheTopbar backLabel="← Retour" onBack={() => navigate('/')} eyebrow="Référentiel" title="DST">
        <button type="button" onClick={() => { setImportFile(null); setImportResult(null); setImportOpen(true) }} className="px-3.5 py-2 rounded-xl bg-[#003170] text-white text-[13px] font-bold hover:bg-[#00224f] inline-flex items-center gap-1.5">
          <Upload size={13} /> Importer Excel
        </button>
        <button type="button" onClick={() => refetch()} className="px-3 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[#69758a] hover:bg-[#f3f6fb]">
          <RefreshCw size={14} />
        </button>
      </FicheTopbar>

      <FicheMain>
        <SectionCard
          title="DST"
          subtitle="Tableau principal et panneau de détail"
          actions={(
            <div className="flex items-center gap-3 flex-wrap">
              <input value={search} onChange={e => onSearch(e.target.value)}
                placeholder="Rechercher N° chrono, projet, demandeur…"
                className="flex-1 min-w-[220px] max-w-[360px] px-3 py-1.5 border border-[#dbe1ea] rounded text-sm bg-white outline-none focus:border-[#003170]" />
              {status && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className={`w-2 h-2 rounded-full ${status.available ? 'bg-success' : 'bg-warn'}`} />
                  {status.available ? `${status.row_count} dossiers · ${status.columns?.length || 0} colonnes` : 'Base vide'}
                </div>
              )}
              <span className="text-xs text-text-muted ml-auto">{rows.length} dossier{rows.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        >
      <div className="flex overflow-hidden h-[73.5vh] min-h-[485px] max-h-[845px]">
        <div className="flex-1 overflow-x-scroll overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
              <div className="text-4xl">📁</div>
              <p className="text-sm">Aucun dossier DST.</p>
              <Button size="sm" onClick={() => setImportOpen(true)}><Upload size={13} /> Importer Excel</Button>
            </div>
          ) : (
            <table
              className="border-collapse text-sm min-w-full [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis"
              style={{ width: 'max-content', tableLayout: 'fixed' }}
            >
              <colgroup>
                {widths.map((w, i) => (
                  <col key={i} style={{ width: w, minWidth: w, maxWidth: w }} />
                ))}
              </colgroup>
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
                    onDoubleClick={() => navigate(`/dst/${row.id}`)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.id === row.id ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3 py-1.5"><strong className="text-accent text-xs font-mono">{row['N° chrono'] || '—'}</strong></td>
                    <td className="px-3 py-1.5 text-xs max-w-[260px] truncate" title={row['Libellé du projet'] || ''}>{row['Libellé du projet'] || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{shortName(row['Demandeur'])}</td>
                    <td className="px-3 py-1.5 text-xs">{row['Situation Géographique'] || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{formatDate(row['Ouverture'])}</td>
                    <td className="px-3 py-1.5"><StatBadge s={row['Statut']} /></td>
                    <td className="px-3 py-1.5 text-xs">{row['Service DST'] || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{shortDR(row['Direction régionale'])}</td>
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
                <div className="text-[13px] font-bold text-accent">{selected['N° chrono'] || '—'}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected['Libellé du projet'] || '—'}</div>
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
              <Button size="sm" variant="secondary" onClick={() => navigate(`/dst/${selected.id}`)}>📋 Fiche DST</Button>
              <Button size="sm" variant="primary" onClick={createAffaire}>📋 Créer affaire RST</Button>
              <Button size="sm" onClick={createDemande}>📂 Créer demande</Button>
              <Button size="sm" variant="secondary" onClick={openEditDst}>✏️ Éditer DST</Button>
            </div>
          </div>
        )}
      </div>
        </SectionCard>
      </FicheMain>

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

      <Modal open={editDstOpen} onClose={() => setEditDstOpen(false)} title="Corriger le dossier DST" size="sm">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-text-muted">
            Corriger les identifiants source quand la ligne DST contient une erreur.
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">N° affaire demandeur</label>
            <input
              value={editNumeroAffaireDemandeur}
              onChange={e => setEditNumeroAffaireDemandeur(e.target.value)}
              className="px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent"
            />
          </div>
          {updateDstMutation.error ? (
            <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
              {updateDstMutation.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setEditDstOpen(false)} variant="secondary">Annuler</Button>
            <Button onClick={saveEditDst} variant="primary" disabled={updateDstMutation.isPending}>
              {updateDstMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </FichePageShell>
  )
}

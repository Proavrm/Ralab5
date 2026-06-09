/**
 * AffairesNgePage.jsx — fidèle à affaires_nge.html
 * API: GET /reference-affaires/rows → numero_affaire_complet, libelle, code_agence, titulaire, responsable
 * Prefill: sessionStorage['ralab4_source_prefill'] + navigate('/affaires?create=1&...')
 */
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import { RefreshCw, X } from 'lucide-react'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'

function DetField({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>
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
      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1">{title}</div>
      {children}
    </div>
  )
}

function getFullCode(row) {
  return String(row?.numero_affaire_complet || row?.numero_affaire || '').trim()
}

function normCode(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]+/g, '')
}

export default function AffairesNgePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [sortCol, setSortCol] = useState('numero_affaire_complet')
  const [sortAsc, setSortAsc] = useState(true)
  const timer = useRef(null)

  function onSearch(v) {
    setSearch(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(v), 250)
  }

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['affaires-nge-rows', debounced],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '2000' })
      if (debounced) p.set('search', debounced)
      return api.get(`/reference-affaires/rows?${p}`)
    },
  })

  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => api.get('/affaires'),
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

  function findMatchingAffaire(row) {
    const ngeKey = normCode(getFullCode(row))
    if (!ngeKey) return null
    return affaires.find((a) => normCode(a.affaire_nge) === ngeKey) || null
  }

  function buildAffaireUrl(row) {
    const fullCode = getFullCode(row)
    const filiales = row.filiales_toutes || row.filiale_principale || row.filiales_resume || ''
    const p = new URLSearchParams({
      create: '1',
      source_type: 'affaire_nge',
      source_id: String(row.id || ''),
      chantier: row.libelle || '',
      affaire_nge: fullCode,
      titulaire: row.titulaire || '',
      responsable: row.responsable || '',
      filiale: filiales,
      statut: '',
    })
    return `/affaires?${p}`
  }

  function createAffaire() {
    if (!selected) return
    const match = findMatchingAffaire(selected)
    if (match?.uid) {
      const createDemandeOnExisting = window.confirm(
        `Affaire existante detectee (${match.reference || `#${match.uid}`}).\n\nCreer une nouvelle demande sur cette affaire ?`
      )
      if (createDemandeOnExisting) {
        createDemande()
      } else {
        const openExisting = window.confirm("Voulez-vous ouvrir l'affaire existante ?\n\nAnnuler = rester sur la page actuelle.")
        if (!openExisting) return
        navigate(`/affaires/${match.uid}`)
      }
      return
    }
    const fullCode = getFullCode(selected)
    const filiales = selected.filiales_toutes || selected.filiale_principale || selected.filiales_resume || ''
    navigate('/affaires', {
      state: {
        openCreate: true,
        source_type: 'affaire_nge',
        source_id: selected.id,
        prefill: {
          chantier: selected.libelle || '',
          affaire_nge: fullCode,
          numero_etude: selected.numero_etude || '',
          titulaire: selected.titulaire || '',
          responsable: selected.responsable || '',
          filiale: filiales,
          statut: '',
          statut_offre: '',
        },
      },
    })
  }

  function createDemande() {
    if (!selected) return
    const match = findMatchingAffaire(selected)
    const fullCode = getFullCode(selected)
    const filiales = selected.filiales_toutes || selected.filiale_principale || selected.filiales_resume || ''
    navigate('/demandes?create=1', {
      state: {
        openCreate: true,
        source_type: 'affaire_nge',
        source_id: selected.id,
        prefill: {
          source: {
            source_type: 'affaire_nge',
            source_id: selected.id,
            affaire_nge: fullCode,
            libelle_projet: selected.libelle || '',
            filiale: filiales,
          },
          demande: {
            affaire_rst_id: match?.uid || undefined,
            numero_dst: '',
            numero_affaire_nge: fullCode,
            numero_etude: selected.numero_etude || '',
            type_mission: '',
            nature: 'Demande liée à une affaire NGE',
            demandeur: selected.responsable || '',
            filiale: filiales,
            description: [fullCode, selected.libelle || '', selected.observations || ''].filter(Boolean).join('\n'),
            observations: [
              `Préremplie depuis Affaires NGE ${fullCode}`,
              filiales ? `Filiales: ${filiales}` : '',
            ].filter(Boolean).join(' | '),
          },
        },
      },
    })
  }

  async function uploadAffaires(mode) {
    if (!uploadFile) {
      setUploadMessage('Choisir un fichier .xlsx/.xls avant de lancer la mise à jour.')
      return
    }

    setUploadBusy(true)
    setUploadMessage('')
    try {
      const form = new FormData()
      form.append('file', uploadFile)
      const endpoint = mode === 'preview' ? '/reference-affaires/preview-upload' : '/reference-affaires/update-upload'
      const result = await api.postForm(endpoint, form)
      const rowCount = result?.preview_row_count ?? result?.after_count ?? 0
      const fileName = result?.uploaded_file_name || uploadFile.name
      setUploadMessage(`${mode === 'preview' ? 'Preview' : 'Mise à jour'} OK (${rowCount} lignes) depuis ${fileName}.`)
      if (mode === 'update') {
        await refetch()
      }
    } catch (error) {
      setUploadMessage(`Erreur: ${error.message}`)
    } finally {
      setUploadBusy(false)
    }
  }

  const { widths, getColProps } = useResizableColumns([220, 420, 180, 170, 200, 180])

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

  return (
    <FichePageShell>
      <FicheTopbar backLabel="← Retour" onBack={() => navigate('/')} eyebrow="Référentiel" title="Affaires NGE">
        <button type="button" onClick={() => navigate('/tools')} className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
          🛠 Maintenance DB
        </button>
        <button type="button" onClick={() => refetch()} className="px-3 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[#69758a] hover:bg-[#f3f6fb]">
          <RefreshCw size={14} />
        </button>
      </FicheTopbar>

      <FicheMain>
        <SectionCard
          title="Affaires NGE"
          subtitle="Tableau principal et panneau de détail"
          actions={(
            <div className="flex items-center gap-3 flex-wrap">
              <input value={search} onChange={e => onSearch(e.target.value)}
                placeholder="Rechercher N° affaire, libellé, responsable…"
                className="flex-1 min-w-[220px] max-w-[360px] px-3 py-1.5 border border-[#dbe1ea] rounded text-sm bg-white outline-none focus:border-[#003170]" />
              <label className="px-2 py-1.5 border border-border rounded text-xs bg-bg cursor-pointer hover:border-accent">
                📎 Choisir Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </label>
              <Button size="sm" variant="secondary" onClick={() => uploadAffaires('preview')} disabled={uploadBusy || !uploadFile}>👀 Preview Excel</Button>
              <Button size="sm" variant="warn" onClick={() => uploadAffaires('update')} disabled={uploadBusy || !uploadFile}>⬆️ Mettre à jour DB</Button>
              <span className="text-xs text-text-muted ml-auto">{rows.length} ligne{rows.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        >
      {uploadMessage && (
        <div className="pb-3 text-xs text-text-muted">
          {uploadMessage}
        </div>
      )}

      <div className="flex overflow-hidden h-[73.5vh] min-h-[485px] max-h-[845px]">
        <div className="flex-1 overflow-x-scroll overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : sorted.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">🏗️ Aucune affaire NGE — mets à jour la DB dans Outils</div>
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
                  <Th col="numero_affaire_complet" colIdx={0} label="N° affaire" />
                  <Th col="libelle" colIdx={1}     label="Libellé" />
                  <Th col="code_agence" colIdx={2} label="Agence" />
                  <Th col="titulaire" colIdx={3}   label="Titulaire" />
                  <Th col="responsable" colIdx={4} label="Responsable" />
                  <Th col="source_sheet" colIdx={5} label="Feuille" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.id ?? i}
                    onClick={() => setSelected(selected?.id === row.id ? null : row)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.id === row.id ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3 py-1.5"><strong className="text-accent text-xs font-mono">{getFullCode(row) || '—'}</strong></td>
                    <td className="px-3 py-1.5 text-xs max-w-[300px] truncate">{row.libelle || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{row.code_agence || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {row.titulaire
                        ? <span className="inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#002C77] text-white">{row.titulaire}</span>
                        : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-xs">{row.responsable || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-text-muted">{row.source_sheet || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div className="w-[360px] min-w-[320px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
              <div>
                <div className="text-[13px] font-bold text-accent">{getFullCode(selected) || '—'}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected.libelle || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg shrink-0"><X size={14} /></button>
            </div>

            <div className="grid grid-cols-3 gap-3 px-[18px] py-4 border-b border-border">
              <DetItem label="N° affaire" value={getFullCode(selected)} />
              <DetItem label="N° affaire brut" value={selected.numero_affaire_raw || selected.numero_affaire} />
              <DetItem label="Agence" value={selected.code_agence} />
              <DetItem label="Titulaire" value={selected.titulaire} />
              <DetItem label="Responsable" value={selected.responsable} />
              <DetItem label="Feuille source" value={selected.source_sheet} />
              <DetItem label="Filiales" value={selected.filiales_toutes || selected.filiales_resume} />
              <DetItem label="Marché n°" value={selected.marche_numero} />
              <DetItem label="Compte bancaire" value={selected.compte_bancaire} />
            </div>

            {selected.observations ? (
              <div className="px-[18px] py-4 border-b border-border flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted mb-2">Observations</div>
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-text">{selected.observations}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={createAffaire}>📋 Créer une affaire RST</Button>
              <Button size="sm" onClick={createDemande}>📂 Créer une demande</Button>
            </div>
          </div>
        )}
      </div>
        </SectionCard>
      </FicheMain>
    </FichePageShell>
  )
}

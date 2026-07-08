/**
 * EtudesPage.jsx — fidèle à etudes.html
 * API: GET /reference-etudes/rows → champs snake_case: numero_etude, nom_affaire, responsable_etude…
 * Prefill: sessionStorage['ralab4_source_prefill'] + navigate('/affaires?create=1&...')
 */
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
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

function normalizeEtudeNumber(v) {
  return String(v || '').trim().toLowerCase()
}

function formatSite(row) {
  const ville = String(row?.ville || '').trim()
  const dept  = String(row?.departement || '').trim()
  if (ville && dept) return `${ville} (${dept})`
  return ville || dept || ''
}

export default function EtudesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState(null)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [sortCol, setSortCol] = useState('numero_etude')
  const [sortAsc, setSortAsc] = useState(true)
  const timer = useRef(null)

  function onSearch(v) {
    setSearch(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(v), 250)
  }

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['etudes-rows', debounced],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '2000' })
      if (debounced) p.set('search', debounced)
      return api.get(`/reference-etudes/rows?${p}`)
    },
  })

  const { data: affairesRst = [] } = useQuery({
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

  function findMatchingRst(row) {
    const num = normalizeEtudeNumber(row.numero_etude)
    if (!num) return null
    return affairesRst.find(a => normalizeEtudeNumber(a.numero_etude) === num) || null
  }

  function buildAffaireUrl(row) {
    const p = new URLSearchParams({
      create: '1',
      source_type: 'etude',
      source_id: String(row.id || ''),
      chantier: row.nom_affaire || '',
      site: formatSite(row),
      numero_etude: row.numero_etude || '',
      filiale: row.filiale || '',
      responsable: row.responsable_etude || '',
      client: '',
      affaire_nge: '',
      titulaire: row.filiale || '',
      statut: 'À qualifier',
    })
    return `/affaires?${p}`
  }

  function createAffaire() {
    if (!selected) return
    const affaire = findMatchingRst(selected)
    if (affaire?.uid) {
      const createDemandeOnExisting = window.confirm(
        `Affaire existante detectee (${affaire.reference || `#${affaire.uid}`}).\n\nCreer une nouvelle demande sur cette affaire ?`
      )
      if (createDemandeOnExisting) {
        createDemande()
      } else {
        const openExisting = window.confirm("Voulez-vous ouvrir l'affaire existante ?\n\nAnnuler = rester sur la page actuelle.")
        if (!openExisting) return
        navigate(`/affaires/${affaire.uid}`)
      }
      return
    }
    navigate('/affaires', {
      state: {
        openCreate: true,
        source_type: 'etude',
        source_id: selected.id,
        prefill: {
          chantier: selected.nom_affaire || '',
          site: formatSite(selected),
          numero_etude: selected.numero_etude || '',
          filiale: selected.filiale || '',
          titulaire: selected.filiale || '',
          responsable: selected.responsable_etude || '',
          affaire_nge: '',
          client: selected.maitre_ouvrage || '',
          maitre_ouvrage: selected.maitre_ouvrage || '',
          maitre_oeuvre: selected.maitre_oeuvre || '',
          statut: 'Offre en cours',
          statut_offre: selected.statut_affaire || '',
        },
      },
    })
  }

  function createDemande() {
    if (!selected) return
    const affaire = findMatchingRst(selected)
    if (!affaire) {
      navigate('/affaires', {
        state: {
          openCreate: true,
          source_type: 'etude',
          source_id: selected.id,
          prefill: {
            chantier: selected.nom_affaire || '',
            site: formatSite(selected),
            numero_etude: selected.numero_etude || '',
            filiale: selected.filiale || '',
            titulaire: selected.filiale || '',
            responsable: selected.responsable_etude || '',
            affaire_nge: '',
            client: '',
            statut: 'Offre en cours',
            statut_offre: selected.statut_affaire || '',
          },
        },
      })
      return
    }
    const site = formatSite(selected)
    navigate('/demandes?create=1', {
      state: {
        openCreate: true,
        source_type: 'etude',
        source_id: selected.id,
        prefill: {
          source: {
            source_type: 'etude',
            source_id: selected.id,
            numero_etude: selected.numero_etude || '',
            nom_affaire: selected.nom_affaire || '',
            filiale: selected.filiale || '',
            site,
          },
          demande: {
            affaire_rst_id: affaire.uid,
            numero_dst: '',
            numero_etude: selected.numero_etude || '',
            numero_affaire_nge: '',
            type_mission: 'À définir',
            nature: 'Demande liée à une étude',
            demandeur: selected.responsable_etude || '',
            chantier: selected.nom_affaire || '',
            site,
            filiale: selected.filiale || '',
            client: '',
            description: [selected.numero_etude, selected.nom_affaire, site].filter(Boolean).join('\n'),
            observations: `Préremplie depuis Étude ${selected.numero_etude || ''}`.trim(),
          },
        },
      },
    })
  }

  async function uploadEtudes(mode) {
    if (!uploadFile) {
      setUploadMessage('Choisir un fichier .xlsx avant de lancer la mise à jour.')
      return
    }

    setUploadBusy(true)
    setUploadMessage('')
    try {
      const form = new FormData()
      form.append('file', uploadFile)
      const endpoint = mode === 'preview' ? '/reference-etudes/preview-upload' : '/reference-etudes/update-upload'
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

  const { widths, getColProps } = useResizableColumns([150, 330, 180, 180, 130, 230, 180])

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
      <FicheTopbar backLabel="← Retour" onBack={() => navigate('/')} eyebrow="Référentiel" title="Études">
        <button type="button" onClick={() => navigate('/tools')} className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
          🛠 Maintenance DB
        </button>
        <button type="button" onClick={() => refetch()} className="px-3 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[#69758a] hover:bg-[#f3f6fb]">
          <RefreshCw size={14} />
        </button>
      </FicheTopbar>

      <FicheMain>
        <SectionCard
          title="Études"
          subtitle="Tableau principal et panneau de détail"
          actions={(
            <div className="flex items-center gap-3 flex-wrap">
              <input value={search} onChange={e => onSearch(e.target.value)}
                placeholder="Rechercher N° étude, nom affaire, ville, filiale…"
                className="flex-1 min-w-[220px] max-w-[360px] px-3 py-1.5 border border-[#dbe1ea] rounded text-sm bg-white outline-none focus:border-[#003170]" />
              <label className="px-2 py-1.5 border border-border rounded text-xs bg-bg cursor-pointer hover:border-accent">
                📎 Choisir Excel
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </label>
              <Button size="sm" variant="secondary" onClick={() => uploadEtudes('preview')} disabled={uploadBusy || !uploadFile}>👀 Preview Excel</Button>
              <Button size="sm" variant="warn" onClick={() => uploadEtudes('update')} disabled={uploadBusy || !uploadFile}>⬆️ Mettre à jour DB</Button>
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
            <div className="text-xs text-text-muted text-center py-12">📚 Aucune étude — mets à jour la DB dans Outils</div>
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
                  <Th col="numero_etude" colIdx={0}    label="N° étude" />
                  <Th col="nom_affaire" colIdx={1}     label="Chantier" />
                  <Th col="filiale" colIdx={2}         label="Filiale" />
                  <Th col="ville" colIdx={3}           label="Ville" />
                  <Th col="departement" colIdx={4}     label="Dépt." />
                  <Th col="responsable_etude" colIdx={5} label="Resp. étude" />
                  <Th col="statut_affaire" colIdx={6}  label="Statut" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.id ?? i}
                    onClick={() => setSelected(selected?.id === row.id ? null : row)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.id === row.id ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3 py-1.5"><strong className="text-accent text-xs font-mono">{row.numero_etude || '—'}</strong></td>
                    <td className="px-3 py-1.5 text-xs max-w-[260px] truncate">{row.nom_affaire || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{row.filiale || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{row.ville || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{row.departement || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{row.responsable_etude || '—'}</td>
                    <td className="px-3 py-1.5 text-xs">{row.statut_affaire || '—'}</td>
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
                <div className="text-[13px] font-bold text-accent">{selected.numero_etude || '—'}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected.nom_affaire || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg shrink-0"><X size={14} /></button>
            </div>

            <div className="grid grid-cols-3 gap-3 px-[18px] py-4 border-b border-border">
              <DetItem label="Site" value={formatSite(selected)} />
              <DetItem label="Filiale" value={selected.filiale} />
              <DetItem label="Direction" value={selected.direction} />
              <DetItem label="Statut" value={selected.statut_affaire} />
              <DetItem label="Resp. étude" value={selected.responsable_etude} />
              <DetItem label="Maître d'ouvrage" value={selected.maitre_ouvrage} />
              <DetItem label="Maître d'œuvre" value={selected.maitre_oeuvre} />
              <DetItem label="Mandataire" value={selected.mandataire} />
              <DetItem label="Réception dossier" value={formatDate(selected.date_reception_dossier)} />
              <DetItem label="Information attribution" value={formatDate(selected.date_information_attribution)} />
            </div>

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

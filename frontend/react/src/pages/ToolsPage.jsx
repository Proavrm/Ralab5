/**
 * ToolsPage.jsx — fidèle à tools.html legacy
 * Sections: Références, Import DST, État DB, Export, Admin (role-based)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, essaisApi, feuillesTerrainApi } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import PreviewAccessZone from '@/components/tools/PreviewAccessZone'
import { RefreshCw } from 'lucide-react'
import { RESPONSIBLE_LAB_PROFILES, getResponsibleLaboHomeRoute } from '@/lib/responsibleLaboProfiles'
import { TECHNICIAN_PROFILES, getTechnicianHomeRoute } from '@/lib/technicianProfiles'

function Card({ icon, title, desc, children, headerRight }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 px-5 py-4 border-b border-border">
        <span className="text-xl shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[11px] text-text-muted mt-0.5">{desc}</div>
        </div>
        {headerRight ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 md:ml-auto">
            {headerRight}
          </div>
        ) : null}
      </div>
      <div className="p-5 flex flex-col gap-3">
        {children}
      </div>
    </div>
  )
}

function ResultBox({ result }) {
  if (!result) return null
  return (
    <div className={`px-3 py-2 rounded text-xs leading-relaxed whitespace-pre-wrap ${
      result.type === 'ok'  ? 'bg-[#eaf3de] text-[#3b6d11] border border-[#b6d98b]' :
      result.type === 'err' ? 'bg-[#fcebeb] text-[#a32d2d] border border-[#f0a0a0]' :
      'bg-[#eef4ff] text-[#204575] border border-[#cfddff]'
    }`}>
      {result.msg}
    </div>
  )
}

function FileInput({ label, accept, onFile }) {
  const ref = useRef(null)
  const [name, setName] = useState(null)
  return (
    <div>
      <div
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded cursor-pointer hover:border-accent hover:bg-bg transition-colors text-xs text-text-muted">
        <span>📎</span>
        <span>{name || label}</span>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => {
          const f = e.target.files[0]
          if (f) { setName(f.name); onFile(f) }
        }} />
    </div>
  )
}

function DbStatRow({ label, value, warn }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`text-xs font-semibold ${warn ? 'text-warn' : 'text-success'}`}>{value}</span>
    </div>
  )
}

const ESSAI_MODEL_TYPES = [
  { essai_code: 'DE',  type_essai: 'Densité gammadensimètre',                  label: 'DE — Densité gammadensimètre',         family: 'terrain' },
  { essai_code: 'CFE', type_essai: 'Contrôle de fabrication enrobés',          label: 'CFE — Contrôle fabrication enrobés',   family: 'terrain' },
  { essai_code: 'PMT', type_essai: 'Macrotexture PMT',                         label: 'PMT — Macrotexture',                   family: 'terrain' },
  { essai_code: 'PLD', type_essai: 'Portances des plates-formes Dynaplaque',   label: 'PLD — Portance Dynaplaque',            family: 'terrain' },
  { essai_code: 'DF',  type_essai: 'Déflexion',                                label: 'DF — Déflexion',                       family: 'terrain' },
  { essai_code: 'SC',  type_essai: 'Sondage carotté',                          label: 'SC — Sondage carotté',                 family: 'terrain' },
  { essai_code: 'SO',  type_essai: 'Coupe de sondage',                         label: 'SO — Coupe de sondage (SP)',           family: 'terrain' },
  { essai_code: 'WE',  type_essai: 'Teneur en eau',                            label: 'WE — Teneur en eau',                   family: 'labo' },
  { essai_code: 'GR',  type_essai: 'Granulométrie',                            label: 'GR — Granulométrie',                   family: 'labo' },
  { essai_code: 'LCP', type_essai: "Limites d'Atterberg",                      label: 'LCP — Limites Atterberg',              family: 'labo' },
  { essai_code: 'PN',  type_essai: 'Proctor',                                  label: 'PN — Proctor Normal',                  family: 'labo' },
  { essai_code: 'CBR', type_essai: 'CBR',                                      label: 'CBR — California Bearing Ratio',       family: 'labo' },
  { essai_code: 'BM',  type_essai: 'Bleu de méthylène',                        label: 'BM — Bleu de méthylène VBS',           family: 'labo' },
  { essai_code: 'CS',  type_essai: 'Compression simple',                       label: 'CS — Compression simple',              family: 'labo' },
  { essai_code: 'TX',  type_essai: 'Triaxial',                                 label: 'TX — Triaxial',                        family: 'labo' },
  { essai_code: 'ID',  type_essai: 'Identification GTR',                       label: 'ID — Identification GTR',              family: 'labo' },
]

export default function ToolsPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const qc        = useQueryClient()
  const { user }  = useAuth()
  const isAdmin   = (user?.permissions || []).includes('manage_users') || user?.role_code === 'admin'

  // DST import
  const [dstFile,   setDstFile]   = useState(null)
  const [dstSheet,  setDstSheet]  = useState('ExcelMergeQuery')
  const [dstResult, setDstResult] = useState(null)
  const [dstLoading, setDstLoading] = useState(false)

  // Import DE preview only
  const [deFilePath, setDeFilePath] = useState('')
  const [deAffaireRef, setDeAffaireRef] = useState('')
  const [deAffaireNge, setDeAffaireNge] = useState('')
  const [deDemandeGap, setDeDemandeGap] = useState('')
  const [deCampagneGap, setDeCampagneGap] = useState('')
  const [deLoading, setDeLoading] = useState(false)
  const [deResult, setDeResult] = useState(null)
  const [dePreview, setDePreview] = useState(null)
  const [deUploadFile, setDeUploadFile] = useState(null)
  const [deDragActive, setDeDragActive] = useState(false)
  const [deImportingSheet, setDeImportingSheet] = useState('')
  const [deLastImport, setDeLastImport] = useState(null)
  const [deHideImported, setDeHideImported] = useState(true)
  const [deRefOverrides, setDeRefOverrides] = useState({})
  const [deInterventionOverrides, setDeInterventionOverrides] = useState({})
  const [importEssaiType, setImportEssaiType] = useState('DE')

  // SC (Sondage Carotté) import
  const [scUploadFile, setScUploadFile] = useState(null)
  const [scLoading, setScLoading] = useState(false)
  const [scResult, setScResult] = useState(null)
  const [scPreview, setScPreview] = useState(null)
  const [scImportingSheet, setScImportingSheet] = useState('')
  const [scHideImported, setScHideImported] = useState(true)
  const [scLastImport, setScLastImport] = useState(null)

  // PMT (Macrotexture - terrain) import
  const [pmtUploadFile, setPmtUploadFile] = useState(null)
  const [pmtLoading, setPmtLoading] = useState(false)
  const [pmtResult, setPmtResult] = useState(null)
  const [pmtPreview, setPmtPreview] = useState(null)
  const [pmtImportingSheet, setPmtImportingSheet] = useState('')
  const [pmtHideImported, setPmtHideImported] = useState(true)
  const [pmtLastImport, setPmtLastImport] = useState(null)

  // Export
  const [exportResult, setExportResult] = useState(null)

  // Terrain + Essai quick access
  const [modeleLookup, setModeleLookup] = useState('')
  const [modeleLookupResult, setModeleLookupResult] = useState(null)
  const [modeleLookupLoading, setModeleLookupLoading] = useState(false)
  const [modeleLookupMatches, setModeleLookupMatches] = useState([])
  // Admin results
  const [secResult,  setSecResult]  = useState(null)
  const [migResult,  setMigResult]  = useState(null)
  const [syncResult, setSyncResult] = useState(null)

  // DB Stats
  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => api.get('/affaires'),
  })
  const { data: demandes = [] } = useQuery({
    queryKey: ['demandes'],
    queryFn: () => api.get('/demandes_rst'),
  })
  const { data: dstStatus } = useQuery({
    queryKey: ['dst-status'],
    queryFn: () => api.get('/dst/status'),
  })
  const {
    data: feuillesTerrainPreparation = [],
    refetch: refetchFeuillesTerrainPreparation,
  } = useQuery({
    queryKey: ['tools-modele-feuilles-terrain'],
    queryFn: () => feuillesTerrainApi.list({ limit: 200 }),
  })
  const {
    data: essaisPreparation = [],
    refetch: refetchEssaisPreparation,
  } = useQuery({
    queryKey: ['tools-modele-essais'],
    queryFn: () => essaisApi.list({ limit: 200 }),
  })

  const modelTypeOrder = ESSAI_MODEL_TYPES.map((item) => String(item.essai_code || '').toUpperCase())
  const modelTypeMetaByCode = new Map(
    ESSAI_MODEL_TYPES.map((item) => [String(item.essai_code || '').toUpperCase(), item])
  )
  function mapSearchResult(item, family) {
    if (family === 'terrain') {
      const code = String(item.code_feuille || '').trim().toUpperCase() || 'TERRAIN'
      return {
        key: `terrain-${item.uid}`,
        family: 'terrain',
        uid: item.uid,
        label: `Terrain ${code}`,
        reference: item.reference || `#${item.uid}`,
        secondary: code,
        date: item.date_feuille || '',
        intervention_reference: item.intervention_reference || '',
        openPath: `/feuilles-terrain/${item.uid}`,
      }
    }
    return {
      key: `essai-${item.uid}`,
      family: 'essai',
      uid: item.uid,
      label: String(item.type_essai || item.essai_code || 'Essai').toUpperCase(),
      reference: item.essai_code || `#${item.uid}`,
      secondary: item.statut || '',
      date: item.date_debut || item.date_fin || '',
      intervention_reference: item.intervention_reference || '',
      openPath: `/essais/${item.uid}`,
    }
  }

  async function openModeleByLookup() {
    const raw = String(modeleLookup || '').trim()
    if (!raw) {
      setModeleLookupResult({ type: 'err', msg: 'Indique um numero (UID) ou referencia de feuille terrain / essai.' })
      setModeleLookupMatches([])
      return
    }

    setModeleLookupLoading(true)
    setModeleLookupResult(null)
    try {
      const [terrainRows, essaisRows] = await Promise.all([
        feuillesTerrainApi.list({ q: raw, limit: 8 }),
        essaisApi.list({ q: raw, limit: 8 }),
      ])

      const terrainMatches = (Array.isArray(terrainRows) ? terrainRows : []).map((r) => mapSearchResult(r, 'terrain'))
      const essaisMatches = (Array.isArray(essaisRows) ? essaisRows : []).map((r) => mapSearchResult(r, 'essai'))
      const matches = [...terrainMatches, ...essaisMatches]
      setModeleLookupMatches(matches)

      if (matches.length === 0) {
        setModeleLookupResult({ type: 'err', msg: `Nenhuma feuille terrain ou essai encontrado para "${raw}".` })
        return
      }

      if (matches.length === 1) {
        navigate(matches[0].openPath)
        return
      }

      setModeleLookupResult({
        type: 'info',
        msg: `${matches.length} modelos encontrados (terrain + essai). Seleciona um na lista abaixo.`,
      })
    } catch (e) {
      setModeleLookupMatches([])
      setModeleLookupResult({ type: 'err', msg: `Erro na pesquisa do modelo: ${e.message}` })
    } finally {
      setModeleLookupLoading(false)
    }
  }

  async function importDst() {
    if (!dstFile) return
    setDstLoading(true)
    setDstResult(null)
    try {
      const formData = new FormData()
      formData.append('file', dstFile)
      const token = localStorage.getItem('ralab_token')
      const res = await fetch(`/api/dst/import?sheet_name=${encodeURIComponent(dstSheet)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Erreur import')
      const d = await res.json()
      setDstResult({ type: 'ok', msg: `✓ Import terminé\nInsérés : ${d.inserted}\nMis à jour : ${d.updated}\nIgnorés : ${d.skipped}\nTotal lignes : ${d.total_rows}` })
      qc.invalidateQueries({ queryKey: ['dst-status'] })
      qc.invalidateQueries({ queryKey: ['dst-rows'] })
    } catch (e) {
      setDstResult({ type: 'err', msg: `Erreur : ${e.message}` })
    } finally {
      setDstLoading(false)
    }
  }

  function exportData(type, fmt) {
    const data = type === 'affaires' ? affaires : demandes
    if (!data.length) { setExportResult({ type: 'err', msg: 'Aucune donnée à exporter' }); return }
    let content, mime, ext
    if (fmt === 'json') {
      content = JSON.stringify(data, null, 2)
      mime = 'application/json'; ext = 'json'
    } else {
      const keys = Object.keys(data[0])
      content = keys.join(';') + '\n' + data.map(row =>
        keys.map(k => {
          const v = row[k] ?? ''
          return typeof v === 'string' && v.includes(';') ? `"${v}"` : v
        }).join(';')
      ).join('\n')
      mime = 'text/csv;charset=utf-8'; ext = 'csv'
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ralab5_${type}_${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
    setExportResult({ type: 'ok', msg: `✓ ${data.length} entrées exportées en ${fmt.toUpperCase()}` })
  }

  async function adminAction(endpoint, setResult) {
    setResult(null)
    try {
      const res = await api.post(endpoint, {})
      setResult({ type: 'ok', msg: res.message || '✓ Terminé' })
    } catch (e) {
      if (e.message?.includes('404')) {
        setResult({ type: 'info', msg: 'Fonctionnalité non encore disponible côté serveur.' })
      } else {
        setResult({ type: 'err', msg: `Erreur : ${e.message}` })
      }
    }
  }

  async function previewDEImport() {
    if (!deFilePath.trim()) {
      setDeResult({ type: 'err', msg: 'Indique le chemin du fichier Excel DE.' })
      return
    }

    setDeLoading(true)
    setDeResult(null)
    setDePreview(null)
    setDeLastImport(null)
    try {
      const payload = {
        file_path: deFilePath.trim(),
        affaire_reference: deAffaireRef.trim(),
        affaire_nge: deAffaireNge.trim(),
        demande_gap_days: Number(deDemandeGap) || 120,
        campagne_gap_days: Number(deCampagneGap) || 7,
      }
      const result = await api.post('/import-essais-de/preview', payload)
      setDePreview(result)
      setDeRefOverrides({})
      setDeInterventionOverrides({})
      if (!deAffaireNge.trim() && result?.auto_defaults?.affaire_nge_suggested) {
        setDeAffaireNge(result.auto_defaults.affaire_nge_suggested)
      }
      if (!deAffaireRef.trim() && result?.auto_defaults?.affaire_reference_suggested) {
        setDeAffaireRef(result.auto_defaults.affaire_reference_suggested)
      }
      if (!deDemandeGap.trim() && result?.auto_defaults?.demande_gap_days_suggested) {
        setDeDemandeGap(String(result.auto_defaults.demande_gap_days_suggested))
      }
      if (!deCampagneGap.trim() && result?.auto_defaults?.campagne_gap_days_suggested) {
        setDeCampagneGap(String(result.auto_defaults.campagne_gap_days_suggested))
      }
      const selectedAffaire = result?.affaire_context?.selected
      setDeResult({
        type: 'ok',
        msg: [
          `✓ Preview DE terminé`,
          `Feuilles lues: ${result?.sheet_count ?? 0}`,
          `Déjà importées: ${result?.already_imported_count ?? 0}`,
          `Demandes proposées: ${result?.proposals?.demandes_count ?? 0}`,
          `Affaire matchée: ${selectedAffaire?.reference || 'Aucune'}`,
        ].join('\n'),
      })
    } catch (e) {
      setDeResult({ type: 'err', msg: `Erreur preview DE: ${e.message}` })
    } finally {
      setDeLoading(false)
    }
  }

  async function previewDEImportUpload() {
    if (!deUploadFile) {
      setDeResult({ type: 'err', msg: 'Glisse ou choisis un fichier Excel DE avant le preview.' })
      return
    }

    setDeLoading(true)
    setDeResult(null)
    setDePreview(null)
    setDeLastImport(null)
    try {
      const formData = new FormData()
      formData.append('file', deUploadFile)
      formData.append('affaire_reference', deAffaireRef.trim())
      formData.append('affaire_nge', deAffaireNge.trim())
      formData.append('demande_gap_days', String(Number(deDemandeGap) || 120))
      formData.append('campagne_gap_days', String(Number(deCampagneGap) || 7))

      const token = localStorage.getItem('ralab_token')
      const res = await fetch('/api/import-essais-de/preview-upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || 'Erreur preview upload')
      }
      const result = await res.json()
      setDePreview(result)
      setDeRefOverrides({})
      setDeInterventionOverrides({})
      if (!deAffaireNge.trim() && result?.auto_defaults?.affaire_nge_suggested) {
        setDeAffaireNge(result.auto_defaults.affaire_nge_suggested)
      }
      if (!deAffaireRef.trim() && result?.auto_defaults?.affaire_reference_suggested) {
        setDeAffaireRef(result.auto_defaults.affaire_reference_suggested)
      }
      if (!deDemandeGap.trim() && result?.auto_defaults?.demande_gap_days_suggested) {
        setDeDemandeGap(String(result.auto_defaults.demande_gap_days_suggested))
      }
      if (!deCampagneGap.trim() && result?.auto_defaults?.campagne_gap_days_suggested) {
        setDeCampagneGap(String(result.auto_defaults.campagne_gap_days_suggested))
      }
      const selectedAffaire = result?.affaire_context?.selected
      setDeResult({
        type: 'ok',
        msg: [
          `✓ Preview DE (upload) terminé`,
          `Fichier: ${result?.file_name || deUploadFile.name}`,
          `Feuilles lues: ${result?.sheet_count ?? 0}`,
          `Déjà importées: ${result?.already_imported_count ?? 0}`,
          `Demandes proposées: ${result?.proposals?.demandes_count ?? 0}`,
          `Affaire matchée: ${selectedAffaire?.reference || 'Aucune'}`,
        ].join('\n'),
      })
    } catch (e) {
      setDeResult({ type: 'err', msg: `Erreur preview upload DE: ${e.message}` })
    } finally {
      setDeLoading(false)
    }
  }

  function guessEssaiTypeFromFile(fileName) {
    const name = String(fileName || '').toLowerCase()
    if (name.includes('carotte') || name.includes('carott') || name.includes('sondage')) return 'SC'
    if (name.includes('pmt') || name.includes('macrotexture')) return 'PMT'
    if (name.includes('densit') || name.includes('gamma')) return 'DE'
    return importEssaiType
  }

  function setUploadFileForType(file, forcedType = '') {
    if (!file) return
    const nextType = forcedType || guessEssaiTypeFromFile(file.name)
    setImportEssaiType(nextType)
    if (nextType === 'SC') {
      setScUploadFile(file)
      setDeUploadFile(null)
      setPmtUploadFile(null)
    } else if (nextType === 'PMT') {
      setPmtUploadFile(file)
      setDeUploadFile(null)
      setScUploadFile(null)
    } else {
      setDeUploadFile(file)
      setScUploadFile(null)
      setPmtUploadFile(null)
    }
  }

  function handleDropDEFile(event) {
    event.preventDefault()
    event.stopPropagation()
    setDeDragActive(false)
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    setUploadFileForType(file)
  }

  async function importOneDESheet(sheetName) {
    if (!sheetName) return
    setDeImportingSheet(sheetName)
    setDeResult(null)
    try {
      let demandeReferenceOverride = ''
      let campagneReferenceOverride = ''
      const interventionReferenceOverride = (deInterventionOverrides[sheetName] || '').trim()

      const demandes = dePreview?.proposals?.demandes || []
      for (const demande of demandes) {
        const campagnes = demande?.campagnes || []
        for (const campagne of campagnes) {
          const sheets = campagne?.sheets || []
          if (!sheets.includes(sheetName)) continue
          const dKey = `d_${demande.proposal_index}`
          const cKey = `c_${demande.proposal_index}_${campagne.proposal_index}`
          const dFallback = demande.predicted_demande_reference || ''
          const cFallback = campagne.predicted_campagne_reference || ''
          demandeReferenceOverride = (deRefOverrides[dKey] ?? dFallback ?? '').trim()
          campagneReferenceOverride = (deRefOverrides[cKey] ?? cFallback ?? '').trim()
          break
        }
        if (demandeReferenceOverride || campagneReferenceOverride) break
      }

      let result
      if (deUploadFile) {
        const formData = new FormData()
        formData.append('file', deUploadFile)
        formData.append('sheet_name', sheetName)
        formData.append('affaire_reference', deAffaireRef.trim())
        formData.append('affaire_nge', deAffaireNge.trim())
        formData.append('demande_gap_days', String(Number(deDemandeGap) || 120))
        formData.append('campagne_gap_days', String(Number(deCampagneGap) || 7))
        if (demandeReferenceOverride) formData.append('demande_reference_override', demandeReferenceOverride)
        if (campagneReferenceOverride) formData.append('campagne_reference_override', campagneReferenceOverride)
        if (interventionReferenceOverride) formData.append('intervention_reference_override', interventionReferenceOverride)

        const token = localStorage.getItem('ralab_token')
        const res = await fetch('/api/import-essais-de/import-sheet-upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        })
        if (!res.ok) {
          const data = await res.json().catch(async () => ({ detail: await res.text().catch(() => '') }))
          const details = data?.detail ? `: ${data.detail}` : ''
          throw new Error(`Erreur import feuille (upload) [HTTP ${res.status}]${details}`)
        }
        result = await res.json()
      } else {
        if (!deFilePath.trim()) {
          throw new Error('Indique le chemin du fichier ou utilise le drag and drop.')
        }
        result = await api.post('/import-essais-de/import-sheet', {
          file_path: deFilePath.trim(),
          sheet_name: sheetName,
          affaire_reference: deAffaireRef.trim(),
          affaire_nge: deAffaireNge.trim(),
          demande_gap_days: Number(deDemandeGap) || 120,
          campagne_gap_days: Number(deCampagneGap) || 7,
          demande_reference_override: demandeReferenceOverride,
          campagne_reference_override: campagneReferenceOverride,
          intervention_reference_override: interventionReferenceOverride,
        })
      }

      setDeLastImport(result)
      setDePreview((prev) => {
        if (!prev?.sheets) return prev
        const updatedSheets = prev.sheets.map((sheet) => {
          if (sheet.sheet !== sheetName) return sheet
          return {
            ...sheet,
            already_imported: true,
            existing_essai_id: result?.ids?.essai_id || sheet.existing_essai_id,
            existing_intervention_id: result?.ids?.intervention_id || sheet.existing_intervention_id,
          }
        })
        return {
          ...prev,
          sheets: updatedSheets,
          already_imported_count: updatedSheets.filter((sheet) => sheet.already_imported).length,
        }
      })
      setDeResult({
        type: 'ok',
        msg: [
          `✓ Feuille importee: ${sheetName}`,
          `Demande ${result?.references?.demande_reference || '#'+(result?.ids?.demande_id ?? '')} (${result?.created?.demande ? 'cree' : 'reutilisee'})`,
          `Campagne ${result?.references?.campagne_reference || '#'+(result?.ids?.campagne_id ?? '')} (${result?.created?.campagne ? 'cree' : 'reutilisee'})`,
          `Intervention ${result?.references?.intervention_reference || '#'+(result?.ids?.intervention_id ?? '')} (${result?.created?.intervention ? 'cree' : 'reutilisee'})`,
          `Essai #${result?.ids?.essai_id} (${result?.created?.essai ? 'cree' : 'reutilise'})`,
          result?.references?.wbs_short ? `WBS: ${result.references.wbs_short}` : '',
        ].filter(Boolean).join('\n'),
      })
      qc.invalidateQueries({ queryKey: ['demandes'] })
    } catch (e) {
      setDeResult({ type: 'err', msg: `Erreur import feuille DE: ${e.message}` })
    } finally {
      setDeImportingSheet('')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SC (Sondage Carotté) Import Functions
  // ═══════════════════════════════════════════════════════════════════════════════

  async function previewSCImportUpload() {
    if (!scUploadFile) {
      setScResult({ type: 'err', msg: 'Glisse ou choisis un fichier Excel SC avant le preview.' })
      return
    }

    setScLoading(true)
    setScResult(null)
    setScPreview(null)
    setScLastImport(null)
    try {
      const formData = new FormData()
      formData.append('file', scUploadFile)
      formData.append('affaire_reference', deAffaireRef.trim())
      formData.append('affaire_nge', deAffaireNge.trim())

      const token = localStorage.getItem('ralab_token')
      const res = await fetch('/api/import-sc/preview', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || `HTTP ${res.status}`)
      }
      const result = await res.json()
      setScPreview(result)
      if (!deAffaireNge.trim() && result?.auto_defaults?.affaire_nge_suggested) {
        setDeAffaireNge(result.auto_defaults.affaire_nge_suggested)
      }
      if (!deAffaireRef.trim() && result?.auto_defaults?.affaire_reference_suggested) {
        setDeAffaireRef(result.auto_defaults.affaire_reference_suggested)
      }
      const selectedAffaire = result?.affaire_context?.selected
      setScResult({
        type: 'ok',
        msg: [
          `✓ Preview SC terminé`,
          `Fichier: ${result?.file_name || scUploadFile.name}`,
          `Feuilles lues: ${result?.sheets_count ?? 0}`,
          `Déjà importées: ${result?.already_imported_count ?? 0}`,
          `Demandes proposées: ${result?.proposals?.demandes_count ?? 0}`,
          `Existantes trouvées: D ${result?.existing_matches?.demandes ?? 0} · C ${result?.existing_matches?.campagnes ?? 0} · I ${result?.existing_matches?.interventions ?? 0}`,
          `Affaire matchée: ${selectedAffaire?.reference || 'Aucune'}`,
        ].join('\n'),
      })
    } catch (e) {
      setScResult({ type: 'err', msg: `Erreur preview SC: ${e.message}` })
    } finally {
      setScLoading(false)
    }
  }

  async function materializeSCSheet(sheetName, options = {}) {
    const forceReimport = Boolean(options?.forceReimport)
    const bindExistingHierarchy = Boolean(options?.bindExistingHierarchy)
    if (!sheetName || !scUploadFile) return
    setScImportingSheet(sheetName)
    setScResult(null)
    try {
      let resolvedDemandeId = null
      let resolvedCampagneId = null
      let resolvedInterventionId = null

      // Reimport mode: reuse single unambiguous existing hierarchy (D/C/I).
      if (bindExistingHierarchy) {
        const hierarchyMap = scPreview?.existing_hierarchy || {}
        const hierarchyEntries = Object.values(hierarchyMap)
        if (hierarchyEntries.length === 1) {
          const entry = hierarchyEntries[0] || {}
          const demandes = Array.isArray(entry?.demandes) ? entry.demandes : []
          const campagnesByDemande = entry?.campagnes_by_demande || {}
          const interventionsByCampagne = entry?.interventions_by_campagne || {}

          if (demandes.length === 1 && Number(demandes[0]?.id) > 0) {
            resolvedDemandeId = Number(demandes[0].id)
            const campagnes = Array.isArray(campagnesByDemande[String(resolvedDemandeId)])
              ? campagnesByDemande[String(resolvedDemandeId)]
              : (Array.isArray(campagnesByDemande[resolvedDemandeId]) ? campagnesByDemande[resolvedDemandeId] : [])
            if (campagnes.length === 1 && Number(campagnes[0]?.id) > 0) {
              resolvedCampagneId = Number(campagnes[0].id)
              const interventions = Array.isArray(interventionsByCampagne[String(resolvedCampagneId)])
                ? interventionsByCampagne[String(resolvedCampagneId)]
                : (Array.isArray(interventionsByCampagne[resolvedCampagneId]) ? interventionsByCampagne[resolvedCampagneId] : [])
              if (interventions.length === 1 && Number(interventions[0]?.id) > 0) {
                resolvedInterventionId = Number(interventions[0].id)
              }
            }
          }
        }
      }

      const formData = new FormData()
      formData.append('file', scUploadFile)
      formData.append('sheet_name', sheetName)
      formData.append('affaire_reference', deAffaireRef.trim())
      formData.append('affaire_nge', deAffaireNge.trim())
      formData.append('demande_gap_days', String(Number(deDemandeGap) || 120))
      formData.append('campagne_gap_days', String(Number(deCampagneGap) || 7))
      if (Number(resolvedDemandeId) > 0) formData.append('demande_id', String(resolvedDemandeId))
      if (Number(resolvedCampagneId) > 0) formData.append('campagne_id', String(resolvedCampagneId))
      if (Number(resolvedInterventionId) > 0) formData.append('intervention_id', String(resolvedInterventionId))
      const scAffairePkMat = Number(scPreview?.affaire_context?.selected?.id)
      if (scAffairePkMat > 0) {
        formData.append('affaire_rst_id', String(scAffairePkMat))
      }

      const token = localStorage.getItem('ralab_token')
      const res = await fetch('/api/import-sc/materialize', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(async () => ({ detail: await res.text().catch(() => '') }))
        const details = data?.detail ? `: ${data.detail}` : ''
        throw new Error(`Erreur materialize SC [HTTP ${res.status}]${details}`)
      }
      const result = await res.json()
      setScLastImport(result)
      setScPreview((prev) => {
        if (!prev?.sheets) return prev
        const updatedSheets = prev.sheets.map((sheet) => {
          if (sheet.sheet_name !== sheetName) return sheet
          return {
            ...sheet,
            already_imported: true,
            existing_essai_id: result?.essai_id || sheet.existing_essai_id,
          }
        })
        return {
          ...prev,
          sheets: updatedSheets,
          already_imported_count: updatedSheets.filter((sheet) => sheet.already_imported).length,
        }
      })
      setScResult({
        type: 'ok',
        msg: [
          forceReimport ? `✓ SC réimportée: ${sheetName}` : `✓ SC importée: ${sheetName}`,
          bindExistingHierarchy ? `Mode: reimport (reuse D/C/I existants)` : `Mode: import (nouvelle hiérarchie si nécessaire)`,
          result?.reference ? `Feuille SC: ${result.reference}` : '',
          result?.point_code ? `Code point: ${result.point_code}` : '',
          `Essai #${result?.essai_id}`,
          `Demande #${result?.demande_id}`,
          `Campagne #${result?.campagne_id}`,
          `Intervention #${result?.intervention_id}`,
          `Couches créées: ${result?.couches_created ?? 0}`,
          `Feuille terrain #${result?.feuille_id}`,
        ].filter(Boolean).join('\n'),
      })
      qc.invalidateQueries({ queryKey: ['demandes'] })
    } catch (e) {
      setScResult({ type: 'err', msg: `Erreur materialize SC: ${e.message}` })
    } finally {
      setScImportingSheet('')
    }
  }

  async function previewPMTImportUpload() {
    if (!pmtUploadFile) {
      setPmtResult({ type: 'err', msg: 'Glisse ou choisis un fichier Excel PMT avant le preview.' })
      return
    }
    setPmtLoading(true)
    setPmtResult(null)
    setPmtPreview(null)
    setPmtLastImport(null)
    try {
      const formData = new FormData()
      formData.append('file', pmtUploadFile)
      const token = localStorage.getItem('ralab_token')
      const res = await fetch('/api/import-essais-pmt/preview-upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.detail || `HTTP ${res.status}`)
      }
      const result = await res.json()
      setPmtPreview(result)
      setPmtResult({
        type: 'ok',
        msg: [
          '✓ Preview PMT terminé',
          `Fichier: ${result?.file_name || pmtUploadFile.name}`,
          `Feuilles lues: ${result?.sheet_count ?? 0}`,
        ].join('\n'),
      })
    } catch (e) {
      setPmtResult({ type: 'err', msg: `Erreur preview PMT: ${e.message}` })
    } finally {
      setPmtLoading(false)
    }
  }

  async function importOnePMTSheet(sheetName) {
    if (!sheetName || !pmtUploadFile) return
    setPmtImportingSheet(sheetName)
    setPmtResult(null)
    try {
      const formData = new FormData()
      formData.append('file', pmtUploadFile)
      formData.append('sheet_name', sheetName)
      const token = localStorage.getItem('ralab_token')
      const res = await fetch('/api/import-essais-pmt/import-upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(async () => ({ detail: await res.text().catch(() => '') }))
        const details = data?.detail ? `: ${data.detail}` : ''
        throw new Error(`Erreur import PMT [HTTP ${res.status}]${details}`)
      }
      const result = await res.json()
      const importedRow = Array.isArray(result?.imported) ? result.imported[0] : null
      setPmtLastImport(result)
      setPmtPreview((prev) => {
        if (!prev?.sheets) return prev
        const updatedSheets = prev.sheets.map((sheet) => {
          if (sheet.import_source_sheet !== sheetName) return sheet
          return {
            ...sheet,
            already_imported: true,
            existing_pmt_id: importedRow?.pmt_id ?? sheet.existing_pmt_id,
            existing_demande_id: importedRow?.demande_id ?? sheet.existing_demande_id,
            existing_campagne_id: importedRow?.campagne_id ?? sheet.existing_campagne_id,
            existing_intervention_id: importedRow?.intervention_id ?? sheet.existing_intervention_id,
          }
        })
        return {
          ...prev,
          sheets: updatedSheets,
          already_imported_count: updatedSheets.filter((sheet) => sheet.already_imported).length,
        }
      })
      setPmtResult({
        type: 'ok',
        msg: [
          `✓ PMT importée: ${sheetName}`,
          importedRow ? `Affaire #${importedRow.affaire_id} · Demande #${importedRow.demande_id}` : '',
          importedRow ? `Campagne #${importedRow.campagne_id} · Intervention #${importedRow.intervention_id}` : '',
          importedRow ? `PMT #${importedRow.pmt_id} · Points ${importedRow.points_imported}` : '',
          importedRow?.pmt_id ? `Feuille PMT (runtime): /pmt-essais/${importedRow.pmt_id}/runtime` : '',
          result?.hierarchy_summary
            ? `Hiérarchie (créé/existant) A ${result.hierarchy_summary.affaires_rst?.created ?? 0}/${result.hierarchy_summary.affaires_rst?.existing ?? 0} · D ${result.hierarchy_summary.demandes?.created ?? 0}/${result.hierarchy_summary.demandes?.existing ?? 0} · C ${result.hierarchy_summary.campagnes?.created ?? 0}/${result.hierarchy_summary.campagnes?.existing ?? 0} · I ${result.hierarchy_summary.interventions?.created ?? 0}/${result.hierarchy_summary.interventions?.existing ?? 0}`
            : '',
        ].filter(Boolean).join('\n'),
      })
      qc.invalidateQueries({ queryKey: ['demandes'] })
    } catch (e) {
      setPmtResult({ type: 'err', msg: `Erreur import PMT: ${e.message}` })
    } finally {
      setPmtImportingSheet('')
    }
  }

  const demandes_actives   = demandes.filter(d => !['Terminée','Archivée','Envoyé - Perdu','Fini'].includes(d.statut)).length
  const affaires_qualifier = affaires.filter(a => a.statut === 'À qualifier').length
  const isScImport = importEssaiType === 'SC'
  const isPmtImport = importEssaiType === 'PMT'

  // SC preview must reflect only this file's inferred proposals, not full affaire hierarchy.
  const scDemandesForTable = Array.isArray(scPreview?.proposals?.demandes)
    ? scPreview.proposals.demandes
    : []

  // Build intervention reference map from proposals
  const buildScInterventionRefMap = () => {
    const refMap = {}
    scPreview?.proposals?.demandes?.forEach((demande) => {
      demande.campagnes?.forEach((campagne) => {
        Object.entries(campagne.predicted_intervention_references || {}).forEach(([sheetName, ref]) => {
          refMap[sheetName] = ref
        })
      })
    })
    return refMap
  }
  const scInterventionRefMap = buildScInterventionRefMap()

  const resolveScExistingHierarchyRefs = () => {
    const hierarchyMap = scPreview?.existing_hierarchy || {}
    const hierarchyEntries = Object.values(hierarchyMap)
    if (hierarchyEntries.length !== 1) return { demandeRef: '', campagneRef: '' }
    const entry = hierarchyEntries[0] || {}
    const demandes = Array.isArray(entry?.demandes) ? entry.demandes : []
    if (demandes.length !== 1) return { demandeRef: '', campagneRef: '' }
    const demande = demandes[0] || {}
    const demandeId = Number(demande?.id)
    if (!(demandeId > 0)) return { demandeRef: '', campagneRef: '' }
    const campagnesByDemande = entry?.campagnes_by_demande || {}
    const campagnes = Array.isArray(campagnesByDemande[String(demandeId)])
      ? campagnesByDemande[String(demandeId)]
      : (Array.isArray(campagnesByDemande[demandeId]) ? campagnesByDemande[demandeId] : [])
    if (campagnes.length !== 1) {
      return {
        demandeRef: String(demande?.reference || '').trim(),
        campagneRef: '',
      }
    }
    return {
      demandeRef: String(demande?.reference || '').trim(),
      campagneRef: String(campagnes[0]?.reference || '').trim(),
    }
  }
  const scExistingHierarchyRefs = resolveScExistingHierarchyRefs()
  const scPreviewSheetMap = new Map((scPreview?.sheets || []).map((sheet) => [sheet.sheet_name, sheet]))
  const scHasProposalRows = scDemandesForTable.some((demande) => {
    const importedCount = Number(demande?.imported_count || 0)
    const interventionsCount = Number(demande?.interventions_count || 0)
    return interventionsCount <= 0 || importedCount < interventionsCount
  })
  const scExistingRows = (() => {
    const rows = []
    ;(scPreview?.sheets || []).forEach((sheet) => {
      if (!sheet?.already_imported) return
      const binding = sheet?.existing_binding || {}
      rows.push({
        demandeRef: String(binding?.demande_reference || '').trim(),
        campagneRef: String(binding?.campagne_reference || '').trim(),
        interventionRef: String(binding?.intervention_reference || '').trim(),
        scRef: String(binding?.sc_reference || '').trim(),
        scCode: String(binding?.sc_code || '').trim(),
      })
    })
    return rows
  })()

  const scPreviewAsDe = scPreview ? {
    file_name: scPreview.file_name,
    sheet_count: scPreview.sheets_count ?? (scPreview.sheets || []).length,
    already_imported_count: scPreview.already_imported_count ?? 0,
    affaire_nge_detected: scPreview.affaire_nge_detected || scPreview.affaires_detected || [],
    affaire_context: scPreview.affaire_context || { selected: null, match_mode: 'none' },
    proposals: {
      demandes_count: scPreview.proposals?.demandes_count ?? scDemandesForTable.length,
      demandes: scDemandesForTable,
    },
    sheets: (scPreview.sheets || []).map((sheet) => ({
      sheet: sheet.sheet_name,
      anchor_date: sheet.date_sondage,
      predicted_intervention_reference: sheet.predicted_point_code || '',
      predicted_essai_reference: sheet.predicted_sc_reference || '',
      existing_intervention_reference: String(sheet?.existing_binding?.intervention_reference || '').trim(),
      existing_sc_reference: String(sheet?.existing_binding?.sc_reference || '').trim(),
      couche: 'SC',
      points: sheet.couches_count || 0,
      already_imported: Boolean(sheet.already_imported),
      existing_essai_id: sheet.existing_essai_id,
      existing_intervention_id: null,
    })),
  } : null
  const pmtPreviewAsDe = pmtPreview ? {
    file_name: pmtPreview.file_name,
    sheet_count: pmtPreview.sheet_count ?? (pmtPreview.sheets || []).length,
    already_imported_count: pmtPreview.already_imported_count ?? 0,
    affaire_nge_detected: pmtPreview.affaire_nge_detected || [],
    affaire_context: pmtPreview.affaire_context || { selected: null, match_mode: 'none' },
    proposals: {
      demandes_count: pmtPreview.proposals?.demandes_count ?? 0,
      demandes: Array.isArray(pmtPreview.proposals?.demandes) ? pmtPreview.proposals.demandes : [],
    },
    sheets: (pmtPreview.sheets || []).map((sheet) => ({
      sheet: sheet.import_source_sheet,
      anchor_date: sheet.date_essai_debut || sheet.date_essai_texte || '',
      predicted_intervention_reference: String(sheet.predicted_intervention_reference || '').trim(),
      predicted_essai_reference: String(
        sheet.predicted_essai_reference || sheet.reference || sheet.import_source_sheet || sheet.import_uid || ''
      ).trim(),
      existing_intervention_reference: String(sheet.existing_intervention_reference || '').trim(),
      existing_sc_reference: String(sheet.existing_essai_reference || '').trim(),
      couche: sheet.couche || 'PMT',
      points: Array.isArray(sheet.points_rows) ? sheet.points_rows.length : Number(sheet.nombre_essais || 0),
      already_imported: Boolean(sheet.already_imported),
      existing_essai_id: sheet.existing_pmt_id ?? null,
      existing_intervention_id: sheet.existing_intervention_id ?? null,
    })),
  } : null

  const activePreview = isScImport ? scPreviewAsDe : (isPmtImport ? pmtPreviewAsDe : dePreview)
  const activeResult = isScImport ? scResult : (isPmtImport ? pmtResult : deResult)
  const activeLoading = isScImport ? scLoading : (isPmtImport ? pmtLoading : deLoading)
  const activeImportingSheet = isScImport ? scImportingSheet : (isPmtImport ? pmtImportingSheet : deImportingSheet)
  const activeHideImported = isScImport ? scHideImported : (isPmtImport ? pmtHideImported : deHideImported)
  const activeLastImport = isScImport ? scLastImport : (isPmtImport ? pmtLastImport : deLastImport)

  function buildModeleBasePath(code, sourceFamily, sourceUid) {
    const params = new URLSearchParams()
    if (sourceFamily) params.set('source_family', String(sourceFamily))
    if (sourceUid != null) params.set('source_uid', String(sourceUid))
    const qs = params.toString()
    return `/modelos-base/${encodeURIComponent(String(code || '').toUpperCase())}${qs ? `?${qs}` : ''}`
  }

  const modeleBaseCopies = useMemo(() => {
    const byCode = new Map()

    const rankCandidate = (current, candidate) => {
      if (!current) return candidate
      const currentDate = Date.parse(String(current.sourceDate || '')) || 0
      const candidateDate = Date.parse(String(candidate.sourceDate || '')) || 0
      if (candidateDate > currentDate) return candidate
      if (candidateDate < currentDate) return current
      if ((Number(candidate.uid) || 0) > (Number(current.uid) || 0)) return candidate
      return current
    }

    for (const row of Array.isArray(feuillesTerrainPreparation) ? feuillesTerrainPreparation : []) {
      const code = String(row?.code_feuille || '').trim().toUpperCase()
      if (!code) continue
      const meta = modelTypeMetaByCode.get(code)
      const candidate = {
        key: `modele-terrain-${code}`,
        uid: row?.uid,
        code,
        family: 'terrain',
        title: meta?.label?.replace(/^[A-Z]+ — /, '') || `Terrain ${code}`,
        sourceReference: row?.reference || `#${row?.uid}`,
        sourceDate: row?.date_feuille || '',
        sourceStatus: code,
        openPath: buildModeleBasePath(code, 'terrain', row?.uid),
      }
      byCode.set(code, rankCandidate(byCode.get(code), candidate))
    }

    for (const row of Array.isArray(essaisPreparation) ? essaisPreparation : []) {
      const code = String(row?.essai_code || '').trim().toUpperCase()
      if (!code) continue
      const meta = modelTypeMetaByCode.get(code)
      const candidate = {
        key: `modele-labo-${code}`,
        uid: row?.uid,
        code,
        family: meta?.family || 'labo',
        title: meta?.label?.replace(/^[A-Z]+ — /, '') || String(row?.type_essai || code),
        sourceReference: row?.reference || row?.essai_code || `#${row?.uid}`,
        sourceDate: row?.date_debut || row?.date_fin || '',
        sourceStatus: row?.statut || row?.type_essai || '',
        openPath: buildModeleBasePath(code, 'essai', row?.uid),
      }
      byCode.set(code, rankCandidate(byCode.get(code), candidate))
    }

    // Ensure PMT appears in the main models grid even before a real base exists.
    if (!byCode.has('PMT')) {
      byCode.set('PMT', {
        key: 'modele-terrain-PMT-fallback',
        uid: null,
        code: 'PMT',
        family: 'terrain',
        title: 'Macrotexture',
        sourceReference: 'Base à créer',
        sourceDate: '',
        sourceStatus: 'PMT',
        openPath: '/modeles/pmt',
      })
    }

    return Array.from(byCode.values()).sort((a, b) => {
      const ai = modelTypeOrder.indexOf(a.code)
      const bi = modelTypeOrder.indexOf(b.code)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return String(a.code).localeCompare(String(b.code))
    })
  }, [feuillesTerrainPreparation, essaisPreparation, modelTypeMetaByCode, modelTypeOrder])

  useEffect(() => {
    if (!location.hash) return
    const element = document.getElementById(location.hash.slice(1))
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash])

  return (
    <div className="flex flex-col gap-6 max-w-[1100px] mx-auto py-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">🔧 Outils</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {isAdmin ? 'Mode administrateur activé' : 'Certaines actions sont réservées à l\'administration'}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries()}>
          <RefreshCw size={13} /> Actualiser tout
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">

        {/* Références */}
        <div className="col-span-2">
          <Card icon="🧭" title="Références" desc="Accès aux sources Affaires NGE et Études — prévisualisation et mise à jour contrôlée.">
            <div className="flex gap-3">
              <Button onClick={() => navigate('/affaires-nge')}>📘 Références Affaires NGE</Button>
              <Button onClick={() => navigate('/etudes')}>📗 Références Études</Button>
            </div>
            <p className="text-xs text-text-muted">
              Les mises à jour de références se font dans les pages dédiées, pas directement ici.
            </p>
          </Card>
        </div>

        {isAdmin && (
          <div id="dashboards-metier" className="col-span-2 scroll-mt-6">
            <Card icon="🗂️" title="Dashboards par profil" desc="Catalogue des vues métier conservées pour retrouver rapidement les dashboards historiques par responsable ou technicien.">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Responsables laboratoire</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {RESPONSIBLE_LAB_PROFILES.map((profile) => (
                      <Button key={profile.slug} variant="ghost" onClick={() => navigate(getResponsibleLaboHomeRoute(profile))}>
                        🧪 {profile.laboCode} · {profile.displayName}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">Techniciens</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {TECHNICIAN_PROFILES.map((profile) => (
                      <Button key={profile.slug} variant="ghost" onClick={() => navigate(getTechnicianHomeRoute(profile))}>
                        {profile.workstream === 'terrain' ? '🚚' : profile.workstream === 'coordination' ? '📝' : '🧫'} {profile.displayName}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                Le dashboard unifié reste l'entrée principale. Ces vues servent d'accès direct par profil quand on veut retrouver l'ancienne lecture métier.
              </p>
            </Card>
          </div>
        )}

        <div id="feuilles-preparation" className="col-span-2 scroll-mt-6">
          <Card
            icon="📄"
            title="Modelos terrain + essai (testes)"
            desc="Atalho técnico interno para abrir rápido qualquer feuille terrain ou essai por número/referência e testar vazio ou preenchido."
            headerRight={(
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/work/de')}>
                  Work DE
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/work/pmt')}>
                  Work PMT
                </Button>
              </>
            )}
          >
            <form
              className="flex flex-col gap-2 md:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                openModeleByLookup()
              }}
            >
              <input
                value={modeleLookup}
                onChange={(event) => setModeleLookup(event.target.value)}
                placeholder="Ex.: 245, 2026-SP-DE0012, DE25001..."
                className="flex-1 px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
              />
              <Button type="submit" variant="primary" disabled={modeleLookupLoading}>
                {modeleLookupLoading ? 'Abrindo…' : 'Abrir modelo'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setModeleLookup('')
                  setModeleLookupMatches([])
                  setModeleLookupResult(null)
                }}
              >
                Limpar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  refetchFeuillesTerrainPreparation()
                  refetchEssaisPreparation()
                }}
              >
                Atualizar lista
              </Button>
            </form>

            <ResultBox result={modeleLookupResult} />

            {/* Modelos base — cópia de folhas existentes (1 por tipo) */}
            {modeleLookupMatches.length === 0 ? (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold text-text-muted mb-1">Modelos base — cópia da folha existente por tipo</div>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {modeleBaseCopies.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => navigate(t.openPath)}
                      className={`flex items-center gap-2 px-3 py-2 rounded border text-left text-[11px] hover:border-accent hover:bg-bg transition-colors ${
                        t.family === 'terrain'
                          ? 'border-[#d5c9a8] bg-[#fdfaf2]'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <span className={`inline-block w-8 text-center rounded text-[10px] font-bold py-0.5 shrink-0 ${
                        t.family === 'terrain'
                          ? 'bg-[#f0e8c0] text-[#7a5f00]'
                          : 'bg-[#e6f1fb] text-[#185fa5]'
                      }`}>{t.code}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-text">{t.title}</span>
                        <span className="block truncate text-[10px] text-text-muted">Base: {t.sourceReference}{t.sourceStatus ? ` · ${t.sourceStatus}` : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {modeleBaseCopies.length === 0 ? (
                  <div className="text-[10px] text-text-muted mt-1">Nenhuma folha existente encontrada para montar cópia de modelo. Usa o campo de pesquisa acima para abrir uma folha manualmente.</div>
                ) : (
                  <div className="text-[10px] text-text-muted mt-1">Cada botão abre a folha existente que serve de base para a cópia de modelo daquele tipo.</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold text-text-muted mb-1">
                  Resultados da pesquisa — {modeleLookupMatches.length} encontrado{modeleLookupMatches.length !== 1 ? 's' : ''}
                </div>
                <div className="max-h-64 overflow-auto border border-border rounded bg-surface">
                  <table className="w-full text-xs">
                    <thead className="bg-bg sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1">Tipo</th>
                        <th className="text-left px-2 py-1">Ref.</th>
                        <th className="text-left px-2 py-1">Estado</th>
                        <th className="text-left px-2 py-1">Data</th>
                        <th className="text-left px-2 py-1">Intervenção</th>
                        <th className="text-left px-2 py-1">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modeleLookupMatches.map((item) => (
                        <tr key={item.key} className="border-t border-border hover:bg-bg">
                          <td className="px-2 py-1 font-semibold">{item.label || item.secondary || '—'}</td>
                          <td className="px-2 py-1 font-mono">{item.reference}</td>
                          <td className="px-2 py-1">{item.secondary || '—'}</td>
                          <td className="px-2 py-1">{item.date || '—'}</td>
                          <td className="px-2 py-1">{item.intervention_reference || '—'}</td>
                          <td className="px-2 py-1">
                            <Button size="sm" variant="secondary" onClick={() => navigate(item.openPath)}>
                              Abrir
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Préviews / workbench */}
        <div className="col-span-2">
          <PreviewAccessZone />
        </div>

        {/* Import DST */}
        <Card icon="📥" title="Import DST — Excel" desc="Importer ou mettre à jour la base DST depuis un fichier .xlsx">
          <FileInput label="Choisir un fichier .xlsx" accept=".xlsx,.xls" onFile={setDstFile} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted shrink-0">Feuille :</span>
            <input value={dstSheet} onChange={e => setDstSheet(e.target.value)}
              className="px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent w-44" />
          </div>
          <Button variant="primary" onClick={importDst} disabled={!dstFile || dstLoading}>
            {dstLoading ? 'Import en cours…' : '⬆️ Importer'}
          </Button>
          <ResultBox result={dstResult} />
        </Card>

        <Card icon="🧪" title="Import terrain (DE/SC/PMT)" desc="Choisir le type terrain, glisser le fichier, puis preview/import.">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-muted">Type d'essai à importer</label>
            <select
              value={importEssaiType}
              onChange={(event) => setImportEssaiType(event.target.value)}
              className="px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
            >
              <option value="DE">DE - Densités (gammadensimètre)</option>
              <option value="SC">SC - Sondage carotté</option>
              <option value="PMT">PMT - Macrotexture (terrain)</option>
            </select>
          </div>

          <div
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setDeDragActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setDeDragActive(false)
            }}
            onDrop={handleDropDEFile}
            className={`rounded border border-dashed px-3 py-3 text-xs transition-colors ${deDragActive ? 'border-accent bg-bg' : 'border-border bg-surface'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-text-muted">
                Glisser-déposer le fichier Excel ici. Le type (DE/SC/PMT) sera proposé automatiquement.
              </div>
              <label className="inline-flex items-center gap-2 px-2 py-1 border border-border rounded cursor-pointer hover:border-accent hover:bg-bg">
                <span>📎 Choisir</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) setUploadFileForType(file, importEssaiType)
                  }}
                />
              </label>
            </div>
            {(importEssaiType === 'DE' ? deUploadFile : importEssaiType === 'SC' ? scUploadFile : pmtUploadFile) ? (
              <div className="mt-2 text-[11px] text-text-muted">
                Fichier prêt ({importEssaiType}): <strong>{(importEssaiType === 'DE' ? deUploadFile : importEssaiType === 'SC' ? scUploadFile : pmtUploadFile)?.name}</strong>
              </div>
            ) : null}
          </div>

          <>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-muted">Fichier Excel (.xlsx/.xlsm)</label>
            <input
              value={deFilePath}
              onChange={(e) => setDeFilePath(e.target.value)}
              placeholder="C:\\...\\Densités - PPI Réseaux vélo express.xlsx"
              className="px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Affaire RST (référence, auto si vide)</label>
              <input
                value={deAffaireRef}
                onChange={(e) => setDeAffaireRef(e.target.value)}
                placeholder="Auto"
                className="px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Affaire NGE (normalisé, auto si vide)</label>
              <input
                value={deAffaireNge}
                onChange={(e) => setDeAffaireNge(e.target.value)}
                placeholder="Auto"
                className="px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Gap max Demande (jours, auto=120)</label>
              <input
                value={deDemandeGap}
                onChange={(e) => setDeDemandeGap(e.target.value)}
                placeholder="120"
                className="px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-muted">Gap max Campagne (jours, auto=7)</label>
              <input
                value={deCampagneGap}
                onChange={(e) => setDeCampagneGap(e.target.value)}
                placeholder="7"
                className="px-2 py-1.5 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
              />
            </div>
          </div>

          <Button variant="primary" onClick={isScImport ? previewSCImportUpload : isPmtImport ? previewPMTImportUpload : previewDEImport} disabled={activeLoading}>
            {activeLoading ? 'Preview en cours…' : `👀 Preview ${importEssaiType}`}
          </Button>
          <Button variant="secondary" onClick={isScImport ? previewSCImportUpload : isPmtImport ? previewPMTImportUpload : previewDEImportUpload} disabled={activeLoading || !(isScImport ? scUploadFile : isPmtImport ? pmtUploadFile : deUploadFile)}>
            {activeLoading ? 'Preview en cours…' : `🧲 Preview ${importEssaiType} via drag & drop`}
          </Button>

          <ResultBox result={activeResult} />

          {activePreview ? (
            <div className="rounded border border-border bg-bg p-3 text-xs flex flex-col gap-2">
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded border border-border bg-surface px-2 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Demandes</div>
                  <div className="text-[16px] font-semibold text-accent">{activePreview.proposals?.demandes_count ?? 0}</div>
                </div>
                <div className="rounded border border-border bg-surface px-2 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Campagnes</div>
                  <div className="text-[16px] font-semibold text-accent">
                    {(activePreview.proposals?.demandes || []).reduce((sum, demande) => sum + Number(demande?.campagnes_count || 0), 0)}
                  </div>
                </div>
                <div className="rounded border border-border bg-surface px-2 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Interventions</div>
                  <div className="text-[16px] font-semibold text-accent">
                    {(activePreview.proposals?.demandes || []).reduce((sum, demande) => sum + Number(demande?.interventions_count || 0), 0)}
                  </div>
                </div>
                <div className="rounded border border-border bg-surface px-2 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Déjà importées</div>
                  <div className="text-[16px] font-semibold text-success">{activePreview.already_imported_count ?? 0}</div>
                </div>
              </div>

              <div>
                <strong>Fichier:</strong> {activePreview.file_name}
              </div>
              <div>
                <strong>Feuilles:</strong> {activePreview.sheet_count} · <strong>Affaire détectée:</strong> {(activePreview.affaire_nge_detected || []).join(', ') || '—'}
              </div>
              <div>
                <strong>Match affaire:</strong> {activePreview.affaire_context?.selected?.reference || 'Aucun'} ({activePreview.affaire_context?.match_mode || 'none'})
              </div>

              <div className="mt-1">
                <div className="font-semibold mb-1">
                  {isScImport && !scHasProposalRows ? 'Existantes' : 'Proposition demandes / campagnes'}
                </div>
                <div className="max-h-64 overflow-auto border border-border rounded bg-surface">
                  <table className="w-full text-xs">
                    <thead className="bg-bg sticky top-0">
                      {isScImport && !scHasProposalRows ? (
                        <tr>
                          <th className="text-left px-2 py-1 w-44">Demande</th>
                          <th className="text-left px-2 py-1 w-44">Campagne</th>
                          <th className="text-left px-2 py-1 w-44">Intervention</th>
                          <th className="text-left px-2 py-1 w-40">SC ref</th>
                          <th className="text-left px-2 py-1 w-24">SC code</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="text-left px-2 py-1 w-44">Demande</th>
                          <th className="text-left px-2 py-1 w-44">Campagne</th>
                          <th className="text-left px-2 py-1">Période campagne</th>
                          <th className="text-right px-2 py-1">Int.</th>
                          {isScImport ? <th className="text-left px-2 py-1 w-40">Intervention ref</th> : null}
                          {isScImport ? <th className="text-left px-2 py-1 w-40">SC ref</th> : null}
                          {isScImport ? <th className="text-left px-2 py-1 w-24">SC code</th> : null}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {isScImport && !scHasProposalRows ? (
                        scExistingRows.length ? scExistingRows.map((row, index) => (
                          <tr key={`sc-existing-${index}`} className="border-t border-border">
                            <td className="px-2 py-1 font-mono">{row.demandeRef || '—'}</td>
                            <td className="px-2 py-1 font-mono">{row.campagneRef || '—'}</td>
                            <td className="px-2 py-1 font-mono">{row.interventionRef || '—'}</td>
                            <td className="px-2 py-1 font-mono">{row.scRef || '—'}</td>
                            <td className="px-2 py-1 font-mono">{row.scCode || '—'}</td>
                          </tr>
                        )) : (
                          <tr className="border-t border-border">
                            <td colSpan={5} className="px-2 py-2 text-text-muted">Aucune hiérarchie existante trouvée.</td>
                          </tr>
                        )
                      ) : (activePreview.proposals?.demandes || []).flatMap((demande) => {
                        const dKey = `d_${demande.proposal_index}`
                        const dFallback =
                          isScImport && scExistingHierarchyRefs.demandeRef
                            ? scExistingHierarchyRefs.demandeRef
                            : (demande.predicted_demande_reference || `Demande ${demande.proposal_index}`)
                        const dVal = deRefOverrides[dKey] !== undefined ? deRefOverrides[dKey] : dFallback
                        const allImported = demande.imported_count === demande.interventions_count && demande.interventions_count > 0
                        const campagnes = demande.campagnes || []
                        return campagnes.map((campagne, ci) => {
                          const cKey = `c_${demande.proposal_index}_${campagne.proposal_index}`
                          const firstSheetName = (campagne?.sheets || [])[0] || ''
                          const scSheet = scPreviewSheetMap.get(firstSheetName) || {}
                          const scInterventionRef = String((campagne?.predicted_intervention_references || {})[firstSheetName] || '').trim()
                          const scRef = String(scSheet?.predicted_sc_reference || '').trim()
                          const scCode = String(scSheet?.predicted_point_code || '').trim()
                          const cFallback =
                            isScImport && scExistingHierarchyRefs.campagneRef
                              ? scExistingHierarchyRefs.campagneRef
                              : (campagne.predicted_campagne_reference || `C${ci + 1}`)
                          const cVal = deRefOverrides[cKey] !== undefined ? deRefOverrides[cKey] : cFallback
                          return (
                            <tr key={`${demande.proposal_index}_${campagne.proposal_index}`} className="border-t border-border">
                              {ci === 0 && (
                                <td className="px-2 py-1 align-top" rowSpan={campagnes.length}>
                                  <input
                                    className="w-full border border-border rounded px-1 py-0.5 font-mono bg-bg outline-none focus:border-accent"
                                    value={dVal}
                                    onChange={(e) => setDeRefOverrides(prev => ({ ...prev, [dKey]: e.target.value }))}
                                    title="Référence demande prédite (éditable)"
                                  />
                                  {allImported && <div className="text-[10px] text-success mt-0.5">✓ déjà importée</div>}
                                  {!allImported && demande.imported_count > 0 && (
                                    <div className="text-[10px] text-warning mt-0.5">{demande.imported_count}/{demande.interventions_count} importées</div>
                                  )}
                                </td>
                              )}
                              <td className="px-2 py-1 align-top">
                                <input
                                  className="w-full border border-border rounded px-1 py-0.5 font-mono bg-bg outline-none focus:border-accent"
                                  value={cVal}
                                  onChange={(e) => setDeRefOverrides(prev => ({ ...prev, [cKey]: e.target.value }))}
                                  title="Référence campagne prédite (éditable)"
                                />
                              </td>
                              <td className="px-2 py-1 text-text-muted">{campagne.start_date} → {campagne.end_date}</td>
                              <td className="px-2 py-1 text-right">{campagne.interventions_count}</td>
                              {isScImport ? <td className="px-2 py-1 font-mono">{scInterventionRef || '—'}</td> : null}
                              {isScImport ? <td className="px-2 py-1 font-mono">{scRef || '—'}</td> : null}
                              {isScImport ? <td className="px-2 py-1 font-mono">{scCode || '—'}</td> : null}
                            </tr>
                          )
                        })
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-1">
                <div className="font-semibold mb-1">Feuilles (import unitaire)</div>
                <label className="inline-flex items-center gap-2 text-xs text-text-muted mb-2">
                  <input
                    type="checkbox"
                    checked={activeHideImported}
                    onChange={(event) => isScImport ? setScHideImported(event.target.checked) : isPmtImport ? setPmtHideImported(event.target.checked) : setDeHideImported(event.target.checked)}
                  />
                  Masquer les feuilles déjà importées
                </label>
                <div className="max-h-72 overflow-auto border border-border rounded bg-surface">
                  <table className="w-full text-xs">
                    <thead className="bg-bg sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1">Feuille</th>
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">Intervention</th>
                        <th className="text-left px-2 py-1">Essai</th>
                        <th className="text-left px-2 py-1">Couche</th>
                        <th className="text-left px-2 py-1">Points</th>
                        <th className="text-left px-2 py-1">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activePreview.sheets || [])
                        .filter((sheet) => !activeHideImported || !sheet.already_imported)
                        .map((sheet) => {
                        const loading = activeImportingSheet === sheet.sheet
                        return (
                          <tr key={sheet.sheet} className={`border-t ${sheet.already_imported ? 'bg-[#eaf3de] border-[#b6d98b]' : 'border-border'}`}>
                            <td className="px-2 py-1">{sheet.sheet}</td>
                            <td className="px-2 py-1">{sheet.anchor_date || '—'}</td>
                            <td className="px-2 py-1 font-mono text-[10px] text-text-muted">
                              {sheet.already_imported
                                ? (sheet.existing_intervention_reference || (sheet.existing_intervention_id ? `#${sheet.existing_intervention_id}` : '—'))
                                : (
                                  <input
                                    className="w-36 border border-border rounded px-1 py-0.5 font-mono text-[10px] bg-bg outline-none focus:border-accent"
                                    value={deInterventionOverrides[sheet.sheet] ?? (sheet.predicted_intervention_reference || '')}
                                    onChange={(e) => setDeInterventionOverrides(prev => ({ ...prev, [sheet.sheet]: e.target.value }))}
                                    title="Référence intervention prédite (éditable)"
                                    disabled={isScImport || isPmtImport}
                                  />
                                )}
                            </td>
                            <td className="px-2 py-1 font-mono text-[10px] text-text-muted">
                              {sheet.already_imported
                                ? (sheet.existing_sc_reference || sheet.predicted_essai_reference || (sheet.existing_essai_id ? `#${sheet.existing_essai_id}` : '—'))
                                : (sheet.predicted_essai_reference || (sheet.existing_essai_id ? `#${sheet.existing_essai_id}` : '—'))}
                            </td>
                            <td className="px-2 py-1">{sheet.couche || '—'}</td>
                            <td className="px-2 py-1">{sheet.points ?? 0}</td>
                            <td className="px-2 py-1">
                              {sheet.already_imported ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-semibold text-[#3b6d11]">Déjà importée</span>
                                  {sheet.existing_essai_id ? (
                                    <Button size="sm" variant="secondary" onClick={() => navigate(`/essais/${sheet.existing_essai_id}`)}>
                                      Ouvrir
                                    </Button>
                                  ) : null}
                                  {isScImport ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        disabled={Boolean(activeImportingSheet) || activeLoading}
                                        onClick={() => materializeSCSheet(sheet.sheet, { forceReimport: true, bindExistingHierarchy: true })}
                                        title="Réimporte en réutilisant la hiérarchie existante (D/C/I)."
                                      >
                                        {loading ? 'Réimport...' : 'Réimporter'}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={Boolean(activeImportingSheet) || activeLoading}
                                        onClick={() => materializeSCSheet(sheet.sheet, { bindExistingHierarchy: false })}
                                        title="Importe comme nouveau flux (peut créer nouvelle hiérarchie)."
                                      >
                                        {loading ? 'Import...' : 'Importer nouveau'}
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={Boolean(activeImportingSheet) || activeLoading}
                                  onClick={() => isScImport ? materializeSCSheet(sheet.sheet, { bindExistingHierarchy: false }) : isPmtImport ? importOnePMTSheet(sheet.sheet) : importOneDESheet(sheet.sheet)}
                                >
                                  {loading ? 'Import...' : 'Importer cette feuille'}
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {(isScImport ? activeLastImport?.essai_id : isPmtImport ? false : activeLastImport?.ids?.essai_id) ? (
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/essais/${isScImport ? activeLastImport.essai_id : activeLastImport.ids.essai_id}`)}>
                    Ouvrir la feuille d'essai importée
                  </Button>
                  <span className="text-[11px] text-text-muted">
                    {isScImport
                      ? `Essai #${activeLastImport.essai_id} · Couches ${activeLastImport.couches_created ?? 0}`
                      : `Essai #${activeLastImport.ids.essai_id} · Intervention #${activeLastImport.ids.intervention_id}`}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          </>
        </Card>

        {/* État des bases */}
        <Card icon="🗄️" title="État des bases de données" desc="Compteurs et disponibilité">
          <DbStatRow label="Affaires RST"       value={`${affaires.length} entrées`} />
          <DbStatRow label="Demandes RST"        value={`${demandes.length} entrées`} />
          <DbStatRow label="Base DST"            value={dstStatus?.available ? `${dstStatus.row_count} entrées` : 'Non disponible'} warn={!dstStatus?.available} />
          <DbStatRow label="Demandes actives"    value={String(demandes_actives)} />
          <DbStatRow label="Affaires À qualifier" value={String(affaires_qualifier)} warn={affaires_qualifier > 0} />
          <Button size="sm" onClick={() => qc.invalidateQueries()}>↻ Actualiser</Button>
        </Card>

        {/* Export */}
        <Card icon="📤" title="Export données" desc="Télécharger les données en CSV ou JSON">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportData('affaires', 'csv')}>📋 Affaires CSV</Button>
            <Button onClick={() => exportData('demandes_rst', 'csv')}>📂 Demandes CSV</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportData('affaires', 'json')}>{'{ }'} Affaires JSON</Button>
            <Button onClick={() => exportData('demandes_rst', 'json')}>{'{ }'} Demandes JSON</Button>
          </div>
          <ResultBox result={exportResult} />
        </Card>

        {/* Admin — security.db */}
        {isAdmin && (
          <Card icon="🔐" title="Sécurité — Base utilisateurs" desc="Initialiser ou resynchroniser security.db">
            <p className="text-xs text-text-muted">
              Resynchronise les rôles et permissions par défaut dans <code>security.db</code>.
              Les utilisateurs existants ne sont <strong>pas supprimés</strong>.
            </p>
            <Button variant="warn" onClick={() => {
              if (confirm('Resynchroniser security.db ?')) adminAction('/admin/init-security', setSecResult)
            }}>⚙️ Resync security.db</Button>
            <ResultBox result={secResult} />
          </Card>
        )}

        {/* Admin — migration */}
        {isAdmin && (
          <Card icon="🔄" title="Migration — ralab3.db" desc="Migrer les données legacy vers la nouvelle structure">
            <p className="text-xs text-text-muted">
              Crée les nouvelles tables (affaires_rst, demandes, échantillons, interventions)
              et copie les données existantes.
            </p>
            <Button variant="danger" onClick={() => {
              if (confirm('Lancer la migration ?\nLes données existantes ne seront pas supprimées.'))
                adminAction('/admin/migrate', setMigResult)
            }}>⚠️ Lancer la migration</Button>
            <ResultBox result={migResult} />
          </Card>
        )}

        {/* Admin — DST → Affaires */}
        {isAdmin && (
          <Card icon="🔗" title="DST → Affaires RST" desc="Créer des affaires depuis les entrées DST non liées">
            <p className="text-xs text-text-muted">
              Parcourt la base DST et crée une affaire RST pour chaque entrée
              qui n'est pas encore liée à une affaire existante.
            </p>
            <Button variant="primary" onClick={() => adminAction('/admin/dst-to-affaires', setSyncResult)}>
              🔗 Synchroniser
            </Button>
            <ResultBox result={syncResult} />
          </Card>
        )}

      </div>
    </div>
  )
}

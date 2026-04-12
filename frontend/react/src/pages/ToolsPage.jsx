/**
 * ToolsPage.jsx — fidèle à tools.html legacy
 * Sections: Références, Import DST, État DB, Export, Admin (role-based)
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import PreviewAccessZone from '@/components/tools/PreviewAccessZone'
import { RefreshCw } from 'lucide-react'
import { RESPONSIBLE_LAB_PROFILES, getResponsibleLaboHomeRoute } from '@/lib/responsibleLaboProfiles'
import { TECHNICIAN_PROFILES, getTechnicianHomeRoute } from '@/lib/technicianProfiles'

function Card({ icon, title, desc, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[11px] text-text-muted mt-0.5">{desc}</div>
        </div>
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

  // Export
  const [exportResult, setExportResult] = useState(null)

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

  const demandes_actives   = demandes.filter(d => !['Terminée','Archivée','Envoyé - Perdu','Fini'].includes(d.statut)).length
  const affaires_qualifier = affaires.filter(a => a.statut === 'À qualifier').length

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

/**
 * PassationPage.jsx — fidèle à passation.html
 * 7 sections A–G + tables documents/actions éditables inline
 */
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, affairesApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { hasRole } from '@/lib/permissions'
import {
  FieldCard,
  FichePageShell,
  MetricCard,
  SectionCard,
} from '@/components/layout/FicheLayout'

const today = () => new Date().toISOString().split('T')[0]

function normalizeEtudeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAffaireKey(value) {
  return String(value || '')
    .replaceAll('*', '')
    .toUpperCase()
    .replace(/[\s\-_/\.]+/g, '')
    .trim()
}

function getNgeFullCode(row) {
  return String(row?.numero_affaire_complet || row?.numero_affaire || '').trim()
}

function optionToValue(option) {
  if (option == null) return ''
  if (typeof option === 'string' || typeof option === 'number') return String(option).trim()
  if (typeof option === 'object') {
    return String(option.value ?? option.label ?? '').trim()
  }
  return ''
}

function buildSelectOptions(baseOptions, selectedValue) {
  const values = new Set((baseOptions || []).map(optionToValue).filter(Boolean))
  const selected = String(selectedValue || '').trim()
  if (selected) values.add(selected)
  return [...values]
}

function FG({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      {label && <label className="text-[10px] font-medium text-text-muted">{label}</label>}
      {children}
    </div>
  )
}
function TA({ value, onChange, rows = 3, placeholder }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
  )
}

function ReadText({ value, empty = '—' }) {
  const text = String(value || '').trim()
  return <div className="text-[13px] leading-relaxed text-[#172033] whitespace-pre-wrap">{text || empty}</div>
}

function cleanText(value) {
  const text = String(value || '').trim()
  return text || ''
}

function normalizeWorkflowText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace('é', 'e')
    .replace('è', 'e')
    .replace('ê', 'e')
}

function buildAffaireSyncPatch(form, affaire) {
  if (!affaire) return null
  const patch = {}

  const candidates = [
    ['affaire_nge', cleanText(form.numero_affaire_nge)],
    ['numero_etude', cleanText(form.numero_etude)],
    ['chantier', cleanText(form.chantier)],
    ['client', cleanText(form.client)],
    ['titulaire', cleanText(form.entreprise_responsable)],
    ['responsable', cleanText(form.responsable)],
  ]

  candidates.forEach(([key, next]) => {
    if (!next) return
    const current = cleanText(affaire?.[key])
    if (next !== current) patch[key] = next
  })

  return Object.keys(patch).length > 0 ? patch : null
}

const EMPTY = {
  affaire_rst_id: '',
  date_passation: today(),
  source: '',
  operation_type: '',
  phase_operation: '',
  numero_etude: '',
  numero_affaire_nge: '',
  chantier: '',
  client: '',
  entreprise_responsable: '',
  agence: '',
  responsable: '',
  description_generale: '',
  contexte_marche: '',
  interlocuteurs_principaux: '',
  points_sensibles: '',
  besoins_laboratoire: '',
  besoins_terrain: '',
  besoins_etude: '',
  besoins_g3: '',
  besoins_essais_externes: '',
  besoins_equipements_specifiques: '',
  besoins_ressources_humaines: '',
  synthese: '',
  notes: '',
}

const PHASE_EXAMPLES = [
  'Études / Conception',
  'Préparation de chantier',
  'Installation / Mobilisation',
  'Exécution',
  'Contrôles / Essais',
  'Réception',
  'Clôture',
]

const ROLE_LABELS = {
  INTERVENTION_PLANNER: 'Planificateur des interventions',
  TECHNICIAN_ASSIGNER: 'Affectateur technicien',
  FIELD_COORDINATOR: 'Coordinateur terrain',
  LAB_COORDINATOR: 'Coordinateur laboratoire',
  EXTERNAL_TESTS_OWNER: 'Responsable essais externes',
}

function formatRoleLabel(roleCode) {
  const code = String(roleCode || '').trim()
  if (!code) return '—'
  const label = ROLE_LABELS[code]
  return label ? `${label} (${code})` : code
}

function DocRow({ doc, onChange, onRemove }) {
  function set(k, v) { onChange({ ...doc, [k]: v }) }
  return (
    <tr className="border-b border-border">
      <td className="px-2 py-1.5">
        <input value={doc.document_type ?? ''} onChange={e => set('document_type', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input type="checkbox" checked={!!doc.is_received} onChange={e => set('is_received', e.target.checked)}
          className="w-4 h-4 accent-accent" />
      </td>
      <td className="px-2 py-1.5">
        <input value={doc.version ?? ''} onChange={e => set('version', e.target.value)}
          className="w-20 px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5">
        <input type="date" value={doc.document_date ?? ''} onChange={e => set('document_date', e.target.value || null)}
          className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5">
        <input value={doc.comment ?? ''} onChange={e => set('comment', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5">
        <button onClick={onRemove} className="text-danger text-xs hover:opacity-70">✕</button>
      </td>
    </tr>
  )
}

function ActionRow({ action, onChange, onRemove, priorites, statuts }) {
  function set(k, v) { onChange({ ...action, [k]: v }) }
  return (
    <tr className="border-b border-border">
      <td className="px-2 py-1.5">
        <input value={action.action_label ?? ''} onChange={e => set('action_label', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5">
        <input value={action.responsable ?? ''} onChange={e => set('responsable', e.target.value)}
          className="w-28 px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5">
        <input type="date" value={action.echeance ?? ''} onChange={e => set('echeance', e.target.value || null)}
          className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5">
        <select value={action.priorite ?? 'Normale'} onChange={e => set('priorite', e.target.value)}
          className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent">
          {(priorites || ['Basse','Normale','Haute','Critique']).map(p => <option key={p}>{p}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select value={action.statut ?? 'À lancer'} onChange={e => set('statut', e.target.value)}
          className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent">
          {(statuts || ['À lancer','En cours','Fait','Annulé']).map(s => <option key={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input value={action.commentaire ?? ''} onChange={e => set('commentaire', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent" />
      </td>
      <td className="px-2 py-1.5">
        <button onClick={onRemove} className="text-danger text-xs hover:opacity-70">✕</button>
      </td>
    </tr>
  )
}

function RoleAssignmentRow({ item, onChange, onRemove, roleCodes, statusOptions }) {
  function set(k, v) { onChange({ ...item, [k]: v }) }
  return (
    <tr className="border-b border-border">
      <td className="px-2 py-1.5">
        <select
          value={item.role_code ?? ''}
          onChange={e => set('role_code', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
        >
          <option value="">— Rôle —</option>
          {(roleCodes || []).map((roleCode) => <option key={roleCode} value={roleCode}>{formatRoleLabel(roleCode)}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={item.assignee ?? ''}
          onChange={e => set('assignee', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
        />
      </td>
      <td className="px-2 py-1.5">
        <select
          value={item.assignment_status ?? 'À confirmer'}
          onChange={e => set('assignment_status', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
        >
          {(statusOptions || ['À confirmer', 'Confirmé', 'Refusé', 'Non applicable']).map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={item.comment ?? ''}
          onChange={e => set('comment', e.target.value)}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
        />
      </td>
      <td className="px-2 py-1.5">
        <button onClick={onRemove} className="text-danger text-xs hover:opacity-70">✕</button>
      </td>
    </tr>
  )
}

export default function PassationPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = hasRole(user, ['admin'])
  const isNew = !uid || uid === 'new'

  const [form, setForm] = useState(EMPTY)
  const [documents, setDocuments] = useState([])
  const [actions, setActions] = useState([])
  const [roleAssignments, setRoleAssignments] = useState([])
  const [isEditing, setIsEditing] = useState(isNew)
  const [saveInfo, setSaveInfo] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Load existing passation
  const { data: passation, isLoading } = useQuery({
    queryKey: ['passation', uid],
    queryFn: () => api.get(`/passations/${uid}`),
    enabled: !isNew,
  })

  // Load affaires for select
  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => affairesApi.list(),
  })

  // Load filters (sources, types, phases)
  const { data: filters = {} } = useQuery({
    queryKey: ['passations-filters'],
    queryFn: () => api.get('/passations/filters'),
  })

  const { data: etudesRows = [] } = useQuery({
    queryKey: ['reference-etudes-passation'],
    queryFn: () => api.get('/reference-etudes/rows?limit=2000'),
  })

  const { data: affairesNgeRows = [] } = useQuery({
    queryKey: ['reference-affaires-passation'],
    queryFn: () => api.get('/reference-affaires/rows?limit=2000'),
  })

  const { data: passationRows = [] } = useQuery({
    queryKey: ['passation-phase-options'],
    queryFn: () => api.get('/passations'),
  })

  const passationSourceValues = useMemo(
    () => buildSelectOptions(passationRows.map((row) => row?.source), form.source),
    [passationRows, form.source]
  )

  const passationOperationTypeValues = useMemo(
    () => buildSelectOptions(passationRows.map((row) => row?.operation_type), form.operation_type),
    [passationRows, form.operation_type]
  )

  // Bootstrap from affaire if ?affaire_id=X
  const bootstrapAffaireId = searchParams.get('affaire_id')
  const { data: bootstrap } = useQuery({
    queryKey: ['passation-bootstrap', bootstrapAffaireId],
    queryFn: () => api.get(`/passations/bootstrap/${bootstrapAffaireId}`),
    enabled: isNew && !!bootstrapAffaireId,
  })

  // Init form
  useEffect(() => {
    if (!isNew && passation) {
      const { documents: docs, actions: acts, role_assignments: roles, ...rest } = passation
      setForm({ ...EMPTY, ...rest, affaire_rst_id: String(rest.affaire_rst_id || '') })
      setDocuments(docs || [])
      setActions(acts || [])
      setRoleAssignments(roles || [])
    }
  }, [passation, isNew])

  useEffect(() => {
    if (isNew && bootstrap) {
      setForm(f => ({ ...f, ...bootstrap, affaire_rst_id: String(bootstrapAffaireId) }))
      if (bootstrap.documents?.length) setDocuments(bootstrap.documents)
    }
  }, [bootstrap])

  useEffect(() => {
    if (isNew && bootstrapAffaireId) {
      setForm(f => ({ ...f, affaire_rst_id: String(bootstrapAffaireId) }))
    }
  }, [bootstrapAffaireId, isNew])

  // Seed default docs from filters
  useEffect(() => {
    if (isNew && documents.length === 0 && filters.document_type_options?.length) {
      setDocuments(filters.document_type_options.map(t => ({
        document_type: t, is_received: false, version: '', document_date: null, comment: ''
      })))
    }
  }, [filters, isNew])

  const mutation = useMutation({
    mutationFn: (payload) => isNew
      ? api.post('/passations', payload)
      : api.put(`/passations/${uid}`, payload),
    onSuccess: async (saved, variables) => {
      const affaireUid = Number(saved?.affaire_rst_id || variables?.affaire_rst_id || 0)
      const affaire = affaires.find((a) => Number(a?.uid) === affaireUid)
      const patch = buildAffaireSyncPatch(variables || form, affaire)
      let affaireSynced = false

      if (affaireUid && patch) {
        try {
          await affairesApi.update(affaireUid, patch)
          qc.invalidateQueries({ queryKey: ['affaire', affaireUid] })
          qc.invalidateQueries({ queryKey: ['affaires'] })
          affaireSynced = true
        } catch {
          // Keep passation save successful even if affaire sync fails.
        }
      }

      setSaveInfo(affaireSynced ? 'Affaire RST mise à jour' : 'Passation enregistrée')
      qc.invalidateQueries({ queryKey: ['passations'] })
      if (isNew) navigate(`/passations/${saved.uid}`, { replace: true })
      else {
        qc.setQueryData(['passation', uid], saved)
        setIsEditing(false)
      }
    },
  })

  useEffect(() => {
    setIsEditing(isNew)
  }, [isNew, uid])

  function handleSave() {
    if (!form.affaire_rst_id) return
    mutation.mutate({
      ...form,
      affaire_rst_id: parseInt(form.affaire_rst_id),
      documents: documents.filter(d => d.document_type || d.comment || d.is_received),
      actions: actions.filter(a => a.action_label || a.responsable),
      role_assignments: roleAssignments.filter((r) => r.role_code || r.assignee),
    })
  }

  function handleStartEdit() {
    if (isNew) return
    setSaveInfo('')
    setIsEditing(true)
  }

  function handleCancelEdit() {
    if (isNew) return
    if (passation) {
      const { documents: docs, actions: acts, role_assignments: roles, ...rest } = passation
      setForm({ ...EMPTY, ...rest, affaire_rst_id: String(rest.affaire_rst_id || '') })
      setDocuments(docs || [])
      setActions(acts || [])
      setRoleAssignments(roles || [])
    }
    setSaveInfo('')
    setIsEditing(false)
  }

  function addDoc() {
    setDocuments(d => [...d, { document_type: '', is_received: false, version: '', document_date: null, comment: '' }])
  }
  function updateDoc(i, doc) { setDocuments(d => d.map((x, j) => j === i ? doc : x)) }
  function removeDoc(i) { setDocuments(d => d.filter((_, j) => j !== i)) }

  function addAction() {
    setActions(a => [...a, { action_label: '', responsable: '', echeance: '', priorite: 'Normale', statut: 'À lancer', commentaire: '' }])
  }
  function updateAction(i, act) { setActions(a => a.map((x, j) => j === i ? act : x)) }
  function removeAction(i) { setActions(a => a.filter((_, j) => j !== i)) }

  function addRoleAssignment() {
    setRoleAssignments((items) => [...items, { role_code: '', assignee: '', assignment_status: 'À confirmer', comment: '' }])
  }
  function updateRoleAssignment(i, item) { setRoleAssignments((items) => items.map((x, j) => (j === i ? item : x))) }
  function removeRoleAssignment(i) { setRoleAssignments((items) => items.filter((_, j) => j !== i)) }

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
      const value = String(row?.numero_etude || '').trim()
      if (value) values.add(value)
    })
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  }, [etudesRows])

  const ngeCodeOptions = useMemo(() => {
    const values = new Set()
    affairesNgeRows.forEach((row) => {
      const value = getNgeFullCode(row)
      if (value) values.add(value)
    })
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  }, [affairesNgeRows])

  function handleNumeroEtudeInput(nextValue) {
    set('numero_etude', nextValue)
    const match = etudeRowsByNumero.get(normalizeEtudeKey(nextValue))
    if (!match) return
    const chantier = String(match?.nom_affaire || '').trim()
    const client = String(match?.maitre_ouvrage || '').trim()
    const entreprise = String(match?.filiale || '').trim()
    const responsable = String(match?.responsable_etude || '').trim()
    setForm((f) => ({
      ...f,
      numero_etude: String(match?.numero_etude || nextValue || '').trim(),
      chantier: chantier || f.chantier,
      client: client || f.client,
      entreprise_responsable: entreprise || f.entreprise_responsable,
      responsable: responsable || f.responsable,
    }))
  }

  function handleNumeroAffaireNgeInput(nextValue) {
    set('numero_affaire_nge', nextValue)
    const match = ngeRowsByCode.get(normalizeAffaireKey(nextValue))
    if (!match) return
    const fullCode = getNgeFullCode(match)
    const chantier = String(match?.libelle || '').trim()
    const entreprise = String(match?.filiales_toutes || match?.filiale_principale || match?.filiales_resume || '').trim()
    const responsable = String(match?.responsable || '').trim()
    const numeroEtude = String(match?.numero_etude || '').trim()
    setForm((f) => ({
      ...f,
      numero_affaire_nge: fullCode || nextValue,
      numero_etude: numeroEtude || f.numero_etude,
      chantier: chantier || f.chantier,
      entreprise_responsable: entreprise || f.entreprise_responsable,
      responsable: responsable || f.responsable,
    }))
  }

  const title = isNew ? 'Nouvelle passation' : (passation?.reference || `Passation #${uid}`)
  const sources = useMemo(
    () => buildSelectOptions([...(filters.source_options || filters.sources || []), ...passationSourceValues], form.source),
    [filters.source_options, filters.sources, passationSourceValues, form.source]
  )
  const opTypes = useMemo(
    () => buildSelectOptions([...(filters.operation_type_options || filters.operation_types || []), ...passationOperationTypeValues], form.operation_type),
    [filters.operation_type_options, filters.operation_types, passationOperationTypeValues, form.operation_type]
  )
  const phases = useMemo(
    () => buildSelectOptions([
      ...(filters.phase_operation_options || filters.phase_operations || []),
      ...passationRows.map((row) => row?.phase_operation),
      ...PHASE_EXAMPLES,
    ], form.phase_operation),
    [filters.phase_operation_options, filters.phase_operations, passationRows, form.phase_operation]
  )
  const priorites = filters.action_priorite_options || ['Basse','Normale','Haute','Critique']
  const actStatuts = filters.action_statut_options || ['À lancer','En cours','Fait','Annulé']
  const linkedAffaire = form.affaire_rst_id
    ? affaires.find(a => String(a.uid) === String(form.affaire_rst_id))
    : null
  const canEditAffaireLink = isNew && !linkedAffaire
  const backTarget = linkedAffaire ? `/affaires/${linkedAffaire.uid}` : '/passations'
  const canEdit = isNew || isEditing

  const metrics = {
    docs: documents.filter(d => d.document_type).length,
    actions: actions.filter(a => a.action_label).length,
    roles: roleAssignments.filter((r) => r.role_code).length,
    source: form.source || '—',
    phase: form.phase_operation || '—',
  }

  const roleCodes = filters.role_code_options || []
  const roleAssignmentStatusOptions = filters.role_assignment_status_options || ['À confirmer', 'Confirmé', 'Refusé', 'Non applicable']
  const roleRows = useMemo(
    () => roleAssignments.filter((item) => String(item?.role_code || '').trim()),
    [roleAssignments]
  )
  const requiredRoleCodes = useMemo(() => {
    const required = []
    if (cleanText(form.besoins_terrain)) {
      required.push('INTERVENTION_PLANNER', 'TECHNICIAN_ASSIGNER', 'FIELD_COORDINATOR')
    }
    if (cleanText(form.besoins_laboratoire)) {
      required.push('LAB_COORDINATOR')
    }
    if (cleanText(form.besoins_essais_externes)) {
      required.push('EXTERNAL_TESTS_OWNER')
    }
    return [...new Set(required)]
  }, [form.besoins_terrain, form.besoins_laboratoire, form.besoins_essais_externes])
  const confirmedRoleCodes = useMemo(
    () => new Set(roleRows.filter((item) => normalizeWorkflowText(item.assignment_status) === 'confirme').map((item) => item.role_code)),
    [roleRows]
  )

  const actionRows = useMemo(
    () => actions.filter((a) => String(a?.action_label || '').trim()),
    [actions]
  )

  const openActionRows = useMemo(
    () => actionRows.filter((a) => {
      const status = normalizeWorkflowText(a?.statut)
      return status !== 'fait' && status !== 'annule'
    }),
    [actionRows]
  )

  const overdueActions = useMemo(() => {
    const todayIso = today()
    return openActionRows.filter((a) => {
      const due = String(a?.echeance || '').trim()
      return due && due < todayIso
    })
  }, [openActionRows])

  const documentsRows = useMemo(
    () => documents.filter((d) => String(d?.document_type || '').trim()),
    [documents]
  )

  const documentsReceived = useMemo(
    () => documentsRows.filter((d) => Boolean(d?.is_received)),
    [documentsRows]
  )

  const readinessBlocks = useMemo(() => {
    const blocks = []
    if (!form.affaire_rst_id) blocks.push('Affaire liée non sélectionnée')
    if (!cleanText(form.responsable)) blocks.push('Responsable / pilote non renseigné')
    if (!cleanText(form.synthese)) blocks.push('Synthèse de cadrage non renseignée')

    const actionWithoutOwner = openActionRows.find((a) => !cleanText(a?.responsable))
    if (actionWithoutOwner) {
      blocks.push(`Action ouverte sans responsable: ${cleanText(actionWithoutOwner.action_label) || 'Action sans titre'}`)
    }

    const needsTerrain = Boolean(cleanText(form.besoins_terrain))
    const needsLab = Boolean(cleanText(form.besoins_laboratoire))
    if ((needsTerrain || needsLab) && openActionRows.length === 0) {
      blocks.push('Besoins RST identifiés sans actions ouvertes de préparation')
    }

    requiredRoleCodes.forEach((roleCode) => {
      if (!confirmedRoleCodes.has(roleCode)) {
        blocks.push(`Rôle requis non confirmé: ${formatRoleLabel(roleCode)}`)
      }
    })

    if (documentsRows.length > 0 && documentsReceived.length === 0) {
      blocks.push('Aucun document marqué comme reçu')
    }

    return blocks
  }, [
    form.affaire_rst_id,
    form.responsable,
    form.synthese,
    form.besoins_terrain,
    form.besoins_laboratoire,
    openActionRows,
    documentsRows.length,
    documentsReceived.length,
    requiredRoleCodes,
    confirmedRoleCodes,
  ])

  const readyToProcess = readinessBlocks.length === 0

  function openDemandesPreparation() {
    const params = new URLSearchParams()
    if (uid) params.set('passation_uid', String(uid))
    params.set('create', '1')
    if (linkedAffaire?.uid) params.set('affaire_id', String(linkedAffaire.uid))
    navigate(`/demandes?${params.toString()}`)
  }

  if (!isNew && isLoading) {
    return (
      <FichePageShell>
        <div
          className="sticky top-0 z-10 border-b border-[#dbe1ea]"
          style={{ background: 'rgba(255,255,255,0.96)', boxShadow: '0 6px 24px rgba(0,49,112,0.08)', backdropFilter: 'blur(12px)' }}
        >
          <div style={{ height: '4px', background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)' }} />
          <div className="w-full max-w-full mx-auto px-7 flex flex-wrap items-center gap-2.5 py-3">
            <button
              type="button"
              onClick={() => navigate('/passations')}
              className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0"
            >
              ← Affaires RST
            </button>
            <div className="flex-1 min-w-[220px]">
              <div className="text-[#8a95a8] text-[11px] font-bold tracking-[.14em] uppercase">Fiche passation</div>
              <div className="text-[15px] font-black">{title}</div>
            </div>
          </div>
        </div>
        <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
          <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
        </div>
      </FichePageShell>
    )
  }

  return (
    <FichePageShell>
      <div
        className="sticky top-0 z-10 border-b border-[#dbe1ea]"
        style={{ background: 'rgba(255,255,255,0.96)', boxShadow: '0 6px 24px rgba(0,49,112,0.08)', backdropFilter: 'blur(12px)' }}
      >
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)' }} />
        <div className="w-full max-w-full mx-auto px-7 flex flex-wrap items-center gap-2.5 py-3">
          <button
            type="button"
            onClick={() => navigate(backTarget)}
            className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0"
          >
            ← Affaires RST
          </button>
          <div className="flex-1 min-w-[220px]">
            <div className="text-[#8a95a8] text-[11px] font-bold tracking-[.14em] uppercase">Fiche passation</div>
            <div className="text-[15px] font-black">{title}</div>
          </div>

          {linkedAffaire ? (
            <Button size="sm" onClick={() => navigate(`/affaires/${linkedAffaire.uid}`)}>Affaire</Button>
          ) : null}
          {linkedAffaire ? (
            <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${linkedAffaire.uid}`)}>Demandes</Button>
          ) : null}
          {!isNew && !isEditing ? (
            <Button size="sm" variant="primary" onClick={handleStartEdit}>Modifier</Button>
          ) : (
            <>
              <Button size="sm" onClick={isNew ? () => navigate('/passations') : handleCancelEdit}>Annuler</Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleSave}
                disabled={!form.affaire_rst_id || mutation.isPending}
              >
                {mutation.isPending ? 'Enregistrement…' : (isNew ? '✓ Créer' : '✓ Enregistrer')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
        {saveInfo && (
          <div className="px-4 py-2 rounded border border-[#b8e3c7] bg-[#eaf8ef] text-[#1b6f43] text-xs font-medium">
            {saveInfo}
          </div>
        )}
        {linkedAffaire ? (
          <section
            className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white"
            style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
          >
            <div
              className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
              style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
            >
              <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />

              <div>
                <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
                  <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
                  RaLab 5 · Passation RST
                </div>
                <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{title}</h1>
                <div className="mt-3 text-[20px] font-black">{linkedAffaire.chantier || '—'}</div>
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
                  {linkedAffaire.client ? <span>Client : <strong className="text-white">{linkedAffaire.client}</strong></span> : null}
                  {linkedAffaire.site ? <span>Site : <strong className="text-white">{linkedAffaire.site}</strong></span> : null}
                  {linkedAffaire.responsable ? <span>Responsable : <strong className="text-white">{linkedAffaire.responsable}</strong></span> : null}
                </div>
              </div>

              <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
                <div className="flex flex-wrap justify-end gap-2">
                  <span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                    {linkedAffaire.statut === 'En cours' ? 'Affaire active' : (linkedAffaire.statut || '—')}
                  </span>
                  {linkedAffaire.titulaire ? (
                    <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                      {linkedAffaire.titulaire}
                    </span>
                  ) : null}
                  {linkedAffaire.filiale ? (
                    <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                      {linkedAffaire.filiale}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Demandes</div>
                <div className="mt-1.5 text-[13px] font-black">
                  {linkedAffaire.nb_demandes_actives ?? 0} active{(linkedAffaire.nb_demandes_actives ?? 0) !== 1 ? 's' : ''} / {linkedAffaire.nb_demandes ?? 0}
                </div>
                {linkedAffaire.date_ouverture ? (
                  <div className="mt-2 text-[12px] font-black text-white/70">Ouverture {formatDate(linkedAffaire.date_ouverture)}</div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
              <MetricCard label="Documents" value={metrics.docs} detail="Pièces renseignées" />
              <MetricCard label="Actions" value={metrics.actions} detail="Actions renseignées" />
              <MetricCard label="Rôles" value={metrics.roles} detail="Organisation" />
              <MetricCard label="Contexte" value={metrics.source} detail="Origine" />
              <MetricCard label="Phase" value={metrics.phase} detail="Chantier" />
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <MetricCard label="Documents" value={metrics.docs} detail="Pièces renseignées" />
            <MetricCard label="Actions" value={metrics.actions} detail="Actions renseignées" />
            <MetricCard label="Rôles" value={metrics.roles} detail="Organisation" />
            <MetricCard label="Contexte" value={metrics.source} detail="Origine" />
            <MetricCard label="Phase" value={metrics.phase} detail="Chantier" />
          </div>
        )}

        <SectionCard
          title="Pilotage opérationnel"
          subtitle="Lecture rapide des blocages et raccourcis pour préparer l'exécution"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={openDemandesPreparation}>Préparer les demandes</Button>
              {linkedAffaire ? <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${linkedAffaire.uid}`)}>Voir les demandes</Button> : null}
              {linkedAffaire ? <Button size="sm" onClick={() => navigate('/interventions')}>Voir les interventions</Button> : null}
            </div>
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <MetricCard label="Readiness" value={readyToProcess ? 'OK' : 'Bloquée'} detail={readyToProcess ? 'Passation exploitable' : `${readinessBlocks.length} blocage(s)`} />
            <MetricCard label="Actions ouvertes" value={openActionRows.length} detail={`${overdueActions.length} en retard`} />
            <MetricCard label="Rôles confirmés" value={`${requiredRoleCodes.filter((code) => confirmedRoleCodes.has(code)).length}/${requiredRoleCodes.length || 0}`} detail="Rôles requis" />
            <MetricCard label="Documents reçus" value={`${documentsReceived.length}/${documentsRows.length}`} detail="Suivi documentaire" />
            <MetricCard label="Synthèse" value={cleanText(form.synthese) ? 'Renseignée' : 'À faire'} detail="Décision métier" />
          </div>

          {readinessBlocks.length > 0 ? (
            <div className="mt-4 rounded-xl border border-[#f0a0a0] bg-[#fcebeb] p-3">
              <div className="text-[12px] font-black uppercase tracking-[.08em] text-[#8c2626]">Blocages opérationnels</div>
              <ul className="mt-2 text-[13px] text-[#8c2626] list-disc pl-5 space-y-1">
                {readinessBlocks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[#b8e3c7] bg-[#eaf8ef] p-3 text-[13px] text-[#1b6f43]">
              Aucun blocage détecté pour le cadrage actuel.
            </div>
          )}
        </SectionCard>

      {mutation.error && (
        <div className="px-4 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded text-xs text-danger">
          {mutation.error.message}
        </div>
      )}

        {canEdit ? (
          <>
            <SectionCard title="A - Identité" subtitle="Rattachement affaire et informations de cadrage" >
              <div className="grid grid-cols-2 gap-3.5">
                <FG label="Affaire liée *" full>
                  {canEditAffaireLink ? (
                    <Select value={form.affaire_rst_id} onChange={e => set('affaire_rst_id', e.target.value)} className="w-full">
                      <option value="">— Sélectionner —</option>
                      {affaires.map(a => (
                        <option key={a.uid} value={a.uid}>{a.reference} — {a.chantier || a.client}</option>
                      ))}
                    </Select>
                  ) : (
                    <FieldCard
                      label="Affaire liée"
                      value={linkedAffaire?.reference || '—'}
                      highlight
                    />
                  )}
                </FG>
                <FG label="Date de passation">
                  <Input type="date" value={form.date_passation ?? ''} onChange={e => set('date_passation', e.target.value)} />
                </FG>
                <FG label="N° étude">
                  <Input
                    value={form.numero_etude}
                    onChange={e => handleNumeroEtudeInput(e.target.value)}
                    list="passation-etudes-options"
                  />
                </FG>
                <FG label="N° affaire NGE">
                  <Input
                    value={form.numero_affaire_nge}
                    onChange={e => handleNumeroAffaireNgeInput(e.target.value)}
                    list="passation-nge-options"
                  />
                </FG>
                <FG label="Chantier">
                  <Input value={form.chantier} onChange={e => set('chantier', e.target.value)} />
                </FG>
                <FG label="Client">
                  <Input value={form.client} onChange={e => set('client', e.target.value)} />
                </FG>
                <FG label="Entreprise responsable">
                  <Input value={form.entreprise_responsable} onChange={e => set('entreprise_responsable', e.target.value)} />
                </FG>
                <FG label="Agence">
                  <Input value={form.agence} onChange={e => set('agence', e.target.value)} />
                </FG>
                <FG label="Responsable / pilote" full>
                  <Input value={form.responsable} onChange={e => set('responsable', e.target.value)} />
                </FG>
              </div>
            </SectionCard>

            <SectionCard title="B - Contexte & origine" subtitle="Source, type d'opération et contexte marché" >
              <div className="grid grid-cols-2 gap-3.5">
                <FG label="Origine de la passation">
                  <Input value={form.source ?? ''} onChange={e => set('source', e.target.value)} list="passation-source-options" placeholder="Écris ou choisis une origine" />
                </FG>
                <FG label="Type d'opération">
                  <Input value={form.operation_type ?? ''} onChange={e => set('operation_type', e.target.value)} list="passation-operation-type-options" placeholder="Écris ou choisis un type" />
                </FG>
                <FG label="Phase chantier">
                  <Input value={form.phase_operation ?? ''} onChange={e => set('phase_operation', e.target.value)} list="passation-phase-options" placeholder="Écris ou choisis une phase" />
                </FG>
                <div />
                <FG label="Interlocuteurs principaux" full>
                  <TA value={form.interlocuteurs_principaux} onChange={v => set('interlocuteurs_principaux', v)} rows={3} />
                </FG>
                <FG label="Description générale" full>
                  <TA value={form.description_generale} onChange={v => set('description_generale', v)} rows={4} />
                </FG>
                <FG label="Contexte marché" full>
                  <TA value={form.contexte_marche} onChange={v => set('contexte_marche', v)} rows={3} />
                </FG>
              </div>
            </SectionCard>
          </>
        ) : (
          <>
            <SectionCard title="A - Identité" subtitle="Rattachement affaire et informations de cadrage" >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FieldCard label="Affaire liée" value={linkedAffaire?.reference || ''} highlight />
                <FieldCard label="Date de passation" value={formatDate(form.date_passation)} />
                <FieldCard label="N° étude" value={form.numero_etude} />
                <FieldCard label="N° affaire NGE" value={form.numero_affaire_nge} />
                <FieldCard label="Client" value={form.client} />
                <FieldCard label="Chantier" value={form.chantier} className="sm:col-span-2" />
                <FieldCard label="Entreprise responsable" value={form.entreprise_responsable} />
                <FieldCard label="Agence" value={form.agence} />
                <FieldCard label="Responsable / pilote" value={form.responsable} />
              </div>
            </SectionCard>

            <SectionCard title="B - Contexte & origine" subtitle="Source, type d'opération et contexte marché" >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FieldCard label="Origine" value={form.source} />
                <FieldCard label="Type d'opération" value={form.operation_type} />
                <FieldCard label="Phase chantier" value={form.phase_operation} />
              </div>
              <div className="grid grid-cols-1 gap-4 mt-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Interlocuteurs principaux</div>
                  <ReadText value={form.interlocuteurs_principaux} />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Description générale</div>
                  <ReadText value={form.description_generale} />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Contexte marché</div>
                  <ReadText value={form.contexte_marche} />
                </div>
              </div>
            </SectionCard>
          </>
        )}

        <datalist id="passation-etudes-options">
          {etudeNumberOptions.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="passation-nge-options">
          {ngeCodeOptions.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="passation-source-options">
          {sources.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="passation-operation-type-options">
          {opTypes.map((value) => <option key={value} value={value} />)}
        </datalist>
        <datalist id="passation-phase-options">
          {phases.map((value) => <option key={value} value={value} />)}
        </datalist>

        <SectionCard title="C - Documents reçus / attendus" subtitle="Pièces nécessaires pour le lancement" >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mb-3">
              <thead>
                <tr className="border-b border-border">
                  {['Document','Reçu','Version','Date','Commentaire',''].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {canEdit ? (
                  documents.map((doc, i) => (
                    <DocRow key={i} doc={doc} onChange={d => updateDoc(i, d)} onRemove={() => removeDoc(i)} />
                  ))
                ) : (
                  documents.map((doc, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1.5">{doc.document_type || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{doc.is_received ? 'Oui' : 'Non'}</td>
                      <td className="px-2 py-1.5">{doc.version || '—'}</td>
                      <td className="px-2 py-1.5">{doc.document_date ? formatDate(doc.document_date) : '—'}</td>
                      <td className="px-2 py-1.5">{doc.comment || '—'}</td>
                      <td className="px-2 py-1.5">—</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {canEdit ? <Button size="sm" onClick={addDoc}>+ Ajouter document</Button> : null}
        </SectionCard>

        <SectionCard title="D - Points de vigilance / contraintes" subtitle="Risques et points de suivi" >
          {canEdit
            ? <TA value={form.points_sensibles} onChange={v => set('points_sensibles', v)} rows={5} />
            : <ReadText value={form.points_sensibles} />}
        </SectionCard>

        <SectionCard title="E - Besoins RST" subtitle="Ressources et besoins techniques" >
          {canEdit ? (
            <div className="grid grid-cols-2 gap-3.5">
              <FG label="Besoins laboratoire">
                <TA value={form.besoins_laboratoire} onChange={v => set('besoins_laboratoire', v)} rows={3} />
              </FG>
              <FG label="Besoins terrain">
                <TA value={form.besoins_terrain} onChange={v => set('besoins_terrain', v)} rows={3} />
              </FG>
              <FG label="Besoins étude">
                <TA value={form.besoins_etude} onChange={v => set('besoins_etude', v)} rows={3} />
              </FG>
              <FG label="Besoins G3">
                <TA value={form.besoins_g3} onChange={v => set('besoins_g3', v)} rows={3} />
              </FG>
              <FG label="Besoins essais externes">
                <TA value={form.besoins_essais_externes} onChange={v => set('besoins_essais_externes', v)} rows={3} />
              </FG>
              <FG label="Besoins équipements spécifiques">
                <TA value={form.besoins_equipements_specifiques} onChange={v => set('besoins_equipements_specifiques', v)} rows={3} />
              </FG>
              <FG label="Besoins ressources humaines" full>
                <TA value={form.besoins_ressources_humaines} onChange={v => set('besoins_ressources_humaines', v)} rows={3} />
              </FG>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldCard label="Besoins laboratoire" value={form.besoins_laboratoire} />
              <FieldCard label="Besoins terrain" value={form.besoins_terrain} />
              <FieldCard label="Besoins étude" value={form.besoins_etude} />
              <FieldCard label="Besoins G3" value={form.besoins_g3} />
              <FieldCard label="Besoins essais externes" value={form.besoins_essais_externes} />
              <FieldCard label="Besoins équipements spécifiques" value={form.besoins_equipements_specifiques} />
              <FieldCard label="Besoins ressources humaines" value={form.besoins_ressources_humaines} className="sm:col-span-2" />
            </div>
          )}
        </SectionCard>

        <SectionCard title="E bis - Organisation & rôles" subtitle="Responsabilités à confirmer pour démarrage" >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mb-3">
              <thead>
                <tr className="border-b border-border">
                  {['Rôle', 'Personne / contact', 'Statut', 'Commentaire', ''].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {canEdit ? (
                  roleAssignments.map((item, i) => (
                    <RoleAssignmentRow
                      key={i}
                      item={item}
                      onChange={(nextItem) => updateRoleAssignment(i, nextItem)}
                      onRemove={() => removeRoleAssignment(i)}
                      roleCodes={roleCodes}
                      statusOptions={roleAssignmentStatusOptions}
                    />
                  ))
                ) : (
                  roleRows.map((item, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1.5">{formatRoleLabel(item.role_code)}</td>
                      <td className="px-2 py-1.5">{item.assignee || '—'}</td>
                      <td className="px-2 py-1.5">{item.assignment_status || '—'}</td>
                      <td className="px-2 py-1.5">{item.comment || '—'}</td>
                      <td className="px-2 py-1.5">—</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {canEdit ? <Button size="sm" onClick={addRoleAssignment}>+ Ajouter rôle</Button> : null}
        </SectionCard>

        <SectionCard title="F - Actions à lancer" subtitle="Plan d'actions opérationnel" >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mb-3">
              <thead>
                <tr className="border-b border-border">
                  {['Action','Responsable','Échéance','Priorité','Statut','Commentaire',''].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {canEdit ? (
                  actions.map((act, i) => (
                    <ActionRow key={i} action={act}
                      onChange={a => updateAction(i, a)}
                      onRemove={() => removeAction(i)}
                      priorites={priorites} statuts={actStatuts} />
                  ))
                ) : (
                  actions.map((act, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1.5">{act.action_label || '—'}</td>
                      <td className="px-2 py-1.5">{act.responsable || '—'}</td>
                      <td className="px-2 py-1.5">{act.echeance ? formatDate(act.echeance) : '—'}</td>
                      <td className="px-2 py-1.5">{act.priorite || '—'}</td>
                      <td className="px-2 py-1.5">{act.statut || '—'}</td>
                      <td className="px-2 py-1.5">{act.commentaire || '—'}</td>
                      <td className="px-2 py-1.5">—</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {canEdit ? <Button size="sm" onClick={addAction}>+ Ajouter action</Button> : null}
        </SectionCard>

        <SectionCard title="G - Synthèse & notes" subtitle="Conclusion et éléments complémentaires" >
          {canEdit ? (
            <div className="flex flex-col gap-4">
              <FG label="Synthèse">
                <TA value={form.synthese} onChange={v => set('synthese', v)} rows={4} />
              </FG>
              <FG label="Notes complémentaires">
                <TA value={form.notes} onChange={v => set('notes', v)} rows={4} />
              </FG>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Synthèse</div>
                <ReadText value={form.synthese} />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.09em] text-[#69758a] mb-1.5">Notes complémentaires</div>
                <ReadText value={form.notes} />
              </div>
            </div>
          )}
        </SectionCard>

      </div>
    </FichePageShell>
  )
}

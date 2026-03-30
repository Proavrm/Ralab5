/**
 * PassationPage.jsx — fidèle à passation.html
 * 7 sections A–G + tables documents/actions éditables inline
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, affairesApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'

const today = () => new Date().toISOString().split('T')[0]

function FG({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      {label && <label className="text-[11px] font-medium text-text-muted">{label}</label>}
      {children}
    </div>
  )
}
function TA({ value, onChange, rows = 3, placeholder }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
  )
}
function SectionCard({ letter, title, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-bg">
        <span className="w-6 h-6 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center shrink-0">{letter}</span>
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  )
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

export default function PassationPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const isNew = !uid || uid === 'new'

  const [form, setForm] = useState(EMPTY)
  const [documents, setDocuments] = useState([])
  const [actions, setActions] = useState([])

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
      const { documents: docs, actions: acts, ...rest } = passation
      setForm({ ...EMPTY, ...rest, affaire_rst_id: String(rest.affaire_rst_id || '') })
      setDocuments(docs || [])
      setActions(acts || [])
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
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['passations'] })
      if (isNew) navigate(`/passations/${saved.uid}`, { replace: true })
      else qc.setQueryData(['passation', uid], saved)
    },
  })

  function handleSave() {
    if (!form.affaire_rst_id) return
    mutation.mutate({
      ...form,
      affaire_rst_id: parseInt(form.affaire_rst_id),
      documents: documents.filter(d => d.document_type || d.comment || d.is_received),
      actions: actions.filter(a => a.action_label || a.responsable),
    })
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

  const title = isNew ? 'Nouvelle passation' : (passation?.reference || `Passation #${uid}`)
  const sources = filters.source_options || filters.sources || []
  const opTypes = filters.operation_type_options || filters.operation_types || []
  const phases  = filters.phase_operation_options || filters.phase_operations || []
  const priorites = filters.action_priorite_options || ['Basse','Normale','Haute','Critique']
  const actStatuts = filters.action_statut_options || ['À lancer','En cours','Fait','Annulé']

  if (!isNew && isLoading) {
    return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  }

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0 sticky top-0 z-10">
        <button onClick={() => navigate('/passations')}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1.5 rounded transition-colors">
          ← Passations
        </button>
        <span className="text-[15px] font-semibold flex-1">{title}</span>
        {/* Summary pills */}
        <span className="text-xs text-text-muted hidden sm:block">
          {form.affaire_rst_id
            ? affaires.find(a => String(a.uid) === String(form.affaire_rst_id))?.reference || '—'
            : '—'}
        </span>
        <span className="text-xs bg-[#e6f1fb] text-[#185fa5] px-2 py-0.5 rounded-full">{documents.filter(d => d.document_type).length} docs</span>
        <span className="text-xs bg-[#eaf3de] text-[#3b6d11] px-2 py-0.5 rounded-full">{actions.filter(a => a.action_label).length} actions</span>
        <Button variant="primary" onClick={handleSave} disabled={!form.affaire_rst_id || mutation.isPending}>
          {mutation.isPending ? 'Enregistrement…' : (isNew ? '✓ Créer' : '✓ Enregistrer')}
        </Button>
      </div>

      {mutation.error && (
        <div className="mx-6 mt-4 px-4 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded text-xs text-danger">
          {mutation.error.message}
        </div>
      )}

      <div className="p-6 flex flex-col gap-5 max-w-[960px] mx-auto w-full">

        {/* A — Identité */}
        <SectionCard letter="A" title="Identité">
          <div className="grid grid-cols-2 gap-4">
            <FG label="Affaire liée *" full>
              <select value={form.affaire_rst_id} onChange={e => set('affaire_rst_id', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                <option value="">— Sélectionner —</option>
                {affaires.map(a => (
                  <option key={a.uid} value={a.uid}>{a.reference} — {a.chantier || a.client}</option>
                ))}
              </select>
            </FG>
            <FG label="Date de passation">
              <Input type="date" value={form.date_passation ?? ''} onChange={e => set('date_passation', e.target.value)} />
            </FG>
            <FG label="N° étude">
              <Input value={form.numero_etude} onChange={e => set('numero_etude', e.target.value)} />
            </FG>
            <FG label="N° affaire NGE">
              <Input value={form.numero_affaire_nge} onChange={e => set('numero_affaire_nge', e.target.value)} />
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

        {/* B — Contexte */}
        <SectionCard letter="B" title="Contexte & origine">
          <div className="grid grid-cols-2 gap-4">
            <FG label="Origine de la passation">
              <select value={form.source ?? ''} onChange={e => set('source', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                <option value="">—</option>
                {sources.map(s => <option key={s}>{s}</option>)}
              </select>
            </FG>
            <FG label="Type d'opération">
              <select value={form.operation_type ?? ''} onChange={e => set('operation_type', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                <option value="">—</option>
                {opTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </FG>
            <FG label="Phase chantier">
              <select value={form.phase_operation ?? ''} onChange={e => set('phase_operation', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                <option value="">—</option>
                {phases.map(p => <option key={p}>{p}</option>)}
              </select>
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

        {/* C — Documents */}
        <SectionCard letter="C" title="Documents reçus / attendus">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mb-3">
              <thead>
                <tr className="border-b border-border">
                  {['Document','Reçu','Version','Date','Commentaire',''].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc, i) => (
                  <DocRow key={i} doc={doc} onChange={d => updateDoc(i, d)} onRemove={() => removeDoc(i)} />
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" onClick={addDoc}>+ Ajouter document</Button>
        </SectionCard>

        {/* D — Points de vigilance */}
        <SectionCard letter="D" title="Points de vigilance / contraintes">
          <TA value={form.points_sensibles} onChange={v => set('points_sensibles', v)} rows={5} />
        </SectionCard>

        {/* E — Besoins */}
        <SectionCard letter="E" title="Besoins RST">
          <div className="grid grid-cols-2 gap-4">
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
        </SectionCard>

        {/* F — Actions */}
        <SectionCard letter="F" title="Actions à lancer">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs mb-3">
              <thead>
                <tr className="border-b border-border">
                  {['Action','Responsable','Échéance','Priorité','Statut','Commentaire',''].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actions.map((act, i) => (
                  <ActionRow key={i} action={act}
                    onChange={a => updateAction(i, a)}
                    onRemove={() => removeAction(i)}
                    priorites={priorites} statuts={actStatuts} />
                ))}
              </tbody>
            </table>
          </div>
          <Button size="sm" onClick={addAction}>+ Ajouter action</Button>
        </SectionCard>

        {/* G — Synthèse */}
        <SectionCard letter="G" title="Synthèse & notes">
          <div className="flex flex-col gap-4">
            <FG label="Synthèse">
              <TA value={form.synthese} onChange={v => set('synthese', v)} rows={4} />
            </FG>
            <FG label="Notes complémentaires">
              <TA value={form.notes} onChange={v => set('notes', v)} rows={4} />
            </FG>
          </div>
        </SectionCard>

        {/* Save bottom */}
        <div className="flex justify-end gap-3 pb-4">
          <Button onClick={() => navigate('/passations')}>Annuler</Button>
          <Button variant="primary" onClick={handleSave} disabled={!form.affaire_rst_id || mutation.isPending}>
            {mutation.isPending ? 'Enregistrement…' : (isNew ? '✓ Créer la passation' : '✓ Enregistrer')}
          </Button>
        </div>

      </div>
    </div>
  )
}

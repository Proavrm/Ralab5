/**
 * PreparationModal.jsx — modale préparation + modules autonome
 * Peut être appelé depuis n'importe quelle page avec un uid de demande.
 *
 * Usage:
 *   <PreparationModal uid={demande.uid} ref_={demande.reference} open={open} onClose={() => setOpen(false)} />
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'

function FR({ label, value, pre }) {
  const empty = !value
  return (
    <div className="flex flex-col gap-0.5 mb-3 last:mb-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      {pre ? (
        <p className={`text-[13px] leading-[1.6] whitespace-pre-wrap ${empty ? 'text-text-muted italic' : ''}`}>{value || '—'}</p>
      ) : (
        <div className={`text-[13px] font-medium ${empty ? 'text-text-muted italic font-normal' : ''}`}>{value || '—'}</div>
      )}
    </div>
  )
}
function CardTitle({ children }) {
  return <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1.5 mb-3">{children}</div>
}
function Card({ children }) {
  return <div className="bg-surface border border-border rounded-[10px] p-5">{children}</div>
}
function FG({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}
function TA({ value, onChange, rows = 2 }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y" />
  )
}

export default function PreparationModal({ uid, ref_, open, onClose, embedded = false, initialEditing = false }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [mods, setMods] = useState({})

  const { data: nav, isLoading } = useQuery({
    queryKey: ['demande-nav', String(uid)],
    queryFn: () => api.get(`/demandes_rst/${uid}/navigation`),
    enabled: !!uid && open,
  })

  const { data: catalog } = useQuery({
    queryKey: ['demande-catalog'],
    queryFn: () => api.get('/demandes_rst/configuration/catalog'),
    enabled: open,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ prep, modules }) => {
      await api.put(`/demandes_rst/${uid}/preparation`, prep)
      await api.put(`/demandes_rst/${uid}/enabled-modules`, { modules })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demande-nav', String(uid)] })
      setEditing(false)
    },
  })

  const prep = nav?.preparation || {}
  const modules = nav?.modules || []
  const enabledModules = modules.filter(m => m.is_enabled)

  function openEdit() {
    setForm({
      phase_operation:          prep.phase_operation          || '',
      attentes_client:          prep.attentes_client          || '',
      contexte_operationnel:    prep.contexte_operationnel    || '',
      objectifs:                prep.objectifs                || '',
      points_vigilance:         prep.points_vigilance         || '',
      contraintes_acces:        prep.contraintes_acces        || '',
      contraintes_delais:       prep.contraintes_delais       || '',
      contraintes_hse:          prep.contraintes_hse          || '',
      programme_previsionnel:   prep.programme_previsionnel   || '',
      ressources_notes:         prep.ressources_notes         || '',
      commentaires:             prep.commentaires             || '',
    })
    setMods(Object.fromEntries(modules.map(m => [m.module_code, !!m.is_enabled])))
    setEditing(true)
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    if (!open || !initialEditing || editing || !nav) return
    openEdit()
  }, [open, initialEditing, editing, nav])

  function handleSave() {
    const modulesList = (catalog?.modules || modules).map(m => ({
      module_code: m.module_code,
      is_enabled: mods[m.module_code] || false,
    }))
    saveMutation.mutate({ prep: form, modules: modulesList })
  }

  const phases = catalog?.phase_options || ['À qualifier', 'G1', 'G2 AVP', 'G2 PRO', 'G2 DCE', 'G3', 'G4', 'Autre']

  // READ VIEW
  const readContent = (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-text-muted italic">
        Préparation directe de la demande. La passation éventuelle reste uniquement une aide facultative de saisie.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Gauche : champs préparation */}
        <Card>
          <CardTitle>Préparation associée à la demande</CardTitle>
          <FR label="Phase opération"      value={prep.phase_operation} />
          <FR label="Attentes client"      value={prep.attentes_client} />
          <FR label="Contexte opérationnel" value={prep.contexte_operationnel} pre />
          <FR label="Objectifs"            value={prep.objectifs} pre />
          <FR label="Points de vigilance"  value={prep.points_vigilance} pre />
        </Card>

        {/* Droite : modules + contraintes */}
        <Card>
          <CardTitle>Modules activés</CardTitle>
          {enabledModules.length ? (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {enabledModules.map(m => (
                <span key={m.module_code}
                  className="inline-flex items-center px-2.5 py-1 border border-border rounded-full bg-bg text-[12px] font-medium">
                  {m.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-text-muted italic text-[13px] mb-4">Aucun module activé</p>
          )}
          <FR label="Contraintes accès"     value={prep.contraintes_acces} pre />
          <FR label="Contraintes délais"    value={prep.contraintes_delais} pre />
          <FR label="Contraintes HSE"       value={prep.contraintes_hse} pre />
          <FR label="Programme / ressources"
            value={[prep.programme_previsionnel, prep.ressources_notes].filter(Boolean).join('\n\n') || ''} pre />
          <FR label="Commentaires"          value={prep.commentaires} pre />
        </Card>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>Fermer</Button>
        <Button variant="primary" onClick={openEdit}>✏️ Modifier</Button>
      </div>
    </div>
  )

  // EDIT VIEW
  const editContent = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <FG label="Phase opération">
          <Select value={form.phase_operation || ''} onChange={e => set('phase_operation', e.target.value)} className="w-full">
            <option value="">—</option>
            {phases.map(p => <option key={p}>{p}</option>)}
          </Select>
        </FG>
        <FG label="Attentes client">
          <Input value={form.attentes_client} onChange={e => set('attentes_client', e.target.value)} />
        </FG>
        <FG label="Contexte opérationnel" full>
          <TA value={form.contexte_operationnel} onChange={v => set('contexte_operationnel', v)} rows={3} />
        </FG>
        <FG label="Objectifs" full>
          <TA value={form.objectifs} onChange={v => set('objectifs', v)} rows={3} />
        </FG>
        <FG label="Points de vigilance" full>
          <TA value={form.points_vigilance} onChange={v => set('points_vigilance', v)} rows={2} />
        </FG>
        <FG label="Contraintes accès">
          <TA value={form.contraintes_acces} onChange={v => set('contraintes_acces', v)} />
        </FG>
        <FG label="Contraintes délais">
          <TA value={form.contraintes_delais} onChange={v => set('contraintes_delais', v)} />
        </FG>
        <FG label="Contraintes HSE">
          <TA value={form.contraintes_hse} onChange={v => set('contraintes_hse', v)} />
        </FG>
        <FG label="Programme prévisionnel">
          <TA value={form.programme_previsionnel} onChange={v => set('programme_previsionnel', v)} />
        </FG>
        <FG label="Ressources / moyens">
          <TA value={form.ressources_notes} onChange={v => set('ressources_notes', v)} />
        </FG>
        <FG label="Commentaires" full>
          <TA value={form.commentaires} onChange={v => set('commentaires', v)} rows={2} />
        </FG>
      </div>

      {/* Modules */}
      <div className="border-t border-border pt-3">
        <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted mb-2">
          Modules activés sur la demande
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(catalog?.modules || modules).map(m => (
            <label key={m.module_code}
              className="flex items-start gap-2.5 p-2.5 border border-border rounded bg-bg cursor-pointer hover:border-accent transition-colors">
              <input type="checkbox"
                checked={mods[m.module_code] || false}
                onChange={e => setMods(ms => ({ ...ms, [m.module_code]: e.target.checked }))}
                className="mt-0.5 accent-accent" />
              <div>
                <div className="text-[13px] font-semibold">{m.label}</div>
                {m.group && <div className="text-[11px] text-text-muted mt-0.5">{m.group}</div>}
              </div>
            </label>
          ))}
        </div>
      </div>

      {saveMutation.error && (
        <p className="text-danger text-xs px-3 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded">
          {saveMutation.error.message}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={() => setEditing(false)}>← Retour</Button>
        <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Enregistrement…' : '✓ Enregistrer'}
        </Button>
      </div>
    </div>
  )

  const body = isLoading ? (
    <div className="text-xs text-text-muted text-center py-8">Chargement…</div>
  ) : editing ? editContent : readContent

  if (embedded) {
    return (
      <div className="h-full overflow-auto p-6">
        {body}
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Modifier la préparation' : `Préparation — ${ref_ || uid}`}
      size="xl"
    >
      {body}
    </Modal>
  )
}

/**
 * pages/AffairePage.jsx
 * Fiche détail d'une affaire RST — fidèle à affaire.html legacy.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, affairesApi } from '@/services/api'
import { formatDate } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input, { Select } from '@/components/ui/Input'

const STATUTS    = ['À qualifier', 'En cours', 'Terminée', 'Archivée']
const TITULAIRES = ['', 'NGE GC', 'NGE Energie', 'NGE Routes', 'EHTP', 'NGE E.S.', 'NGE Transitions', 'Lyaudet', 'Autre']

const STAT_AFF = {
  'À qualifier': 'bg-[#f1efe8] text-[#5f5e5a]',
  'En cours':    'bg-[#eaf3de] text-[#3b6d11]',
  'Terminée':    'bg-[#eeedfe] text-[#534ab7]',
  'Archivée':    'bg-[#f1efe8] text-[#5f5e5a]',
}
const STAT_DEM = {
  'À qualifier':    'bg-[#f1efe8] text-[#5f5e5a]',
  'Demande':        'bg-[#e6f1fb] text-[#185fa5]',
  'En Cours':       'bg-[#eaf3de] text-[#3b6d11]',
  'Répondu':        'bg-[#eeedfe] text-[#534ab7]',
  'Fini':           'bg-[#eaf3de] text-[#3b6d11]',
  'Envoyé - Perdu': 'bg-[#f1efe8] text-[#5f5e5a]',
}

function Badge({ s, map }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${(map || {})[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
      {s || '—'}
    </span>
  )
}
function FieldRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 mb-3 last:mb-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}>
        {value || '—'}
      </div>
    </div>
  )
}
function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

export default function AffairePage() {
  const { uid }  = useParams()
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm]         = useState(null)

  // Reset quando muda de affaire — evita dados da affaire anterior no modal
  useEffect(() => {
    setForm(null)
    setEditOpen(false)
  }, [uid])

  const { data: affaire, isLoading, isError } = useQuery({
    queryKey: ['affaire', uid],
    queryFn:  () => affairesApi.get(uid),
  })

  const { data: demandes = [] } = useQuery({
    queryKey: ['affaire-demandes', uid],
    queryFn:  () => affairesApi.demandes(uid),
    enabled:  !!uid,
  })

  const { data: passations = [] } = useQuery({
    queryKey: ['affaire-passations', uid],
    queryFn:  () => api.get(`/passations?affaire_rst_id=${uid}`),
    enabled:  !!uid,
  })

  const mutation = useMutation({
    mutationFn: (data) => affairesApi.update(uid, data),
    onSuccess: (saved) => {
      qc.setQueryData(['affaire', uid], saved)
      qc.invalidateQueries({ queryKey: ['affaires'] })
      setEditOpen(false)
    },
  })

  const [deleteError, setDeleteError] = useState(null)

  async function handleDelete() {
    if (!affaire) return
    const links = []
    if (demandes.length) links.push(`${demandes.length} demande${demandes.length > 1 ? 's' : ''}`)
    if (passations.length) links.push(`${passations.length} passation${passations.length > 1 ? 's' : ''}`)
    if (links.length) {
      setDeleteError(`Impossible de supprimer : cet affaire a ${links.join(' et ')} liée${(demandes.length + passations.length) > 1 ? 's' : ''}.`)
      return
    }
    if (!confirm(`Supprimer l'affaire ${affaire.reference} ? Cette action est irréversible.`)) return
    try {
      await affairesApi.delete(uid)
      qc.invalidateQueries({ queryKey: ['affaires'] })
      navigate('/affaires')
    } catch (e) {
      setDeleteError(e.message || 'Erreur lors de la suppression.')
    }
  }

  function openEdit() {
    if (!affaire) return
    setForm({
      client:         affaire.client         ?? '',
      chantier:       affaire.chantier       ?? '',
      site:           affaire.site           ?? '',
      filiale:        affaire.filiale        ?? '',
      numero_etude:   affaire.numero_etude   ?? '',
      affaire_nge:    affaire.affaire_nge    ?? '',
      titulaire:      affaire.titulaire      ?? '',
      responsable:    affaire.responsable    ?? '',
      statut:         affaire.statut         ?? 'À qualifier',
      date_ouverture: affaire.date_ouverture ?? '',
    })
    setEditOpen(true)
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  if (isLoading) return <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
  if (isError || !affaire) return (
    <div className="text-xs text-text-muted text-center py-12">
      Affaire introuvable.{' '}
      <button onClick={() => navigate('/affaires')} className="text-accent underline">← Retour</button>
    </div>
  )

  const a = affaire

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-2 px-7 bg-surface border-b border-border h-[58px] shrink-0 sticky top-0 z-10 flex-wrap">
        <button onClick={() => navigate('/affaires')}
          className="flex items-center gap-1.5 text-text-muted text-[13px] hover:bg-bg hover:text-text px-2.5 py-1.5 rounded transition-colors shrink-0">
          ← Affaires RST
        </button>
        <span className="text-[15px] font-semibold flex-1">Affaire {a.reference}</span>
        <Button size="sm" variant="primary" onClick={openEdit}>✏️ Modifier</Button>
        <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${uid}`)}>📂 Demandes</Button>
        <Button size="sm" onClick={() => navigate(`/passations?affaire_id=${uid}`)}>🤝 Passations</Button>
        <Button size="sm" onClick={() => navigate(`/passations/new?affaire_id=${uid}`)}>+ Passation</Button>
        <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${uid}&create=1`)}>+ Demande</Button>
        <Button size="sm" variant="danger" onClick={handleDelete}>🗑 Supprimer</Button>
      </div>

      <div className="p-7 max-w-[900px] mx-auto w-full flex flex-col gap-5">

        {/* Hero */}
        <div className="bg-surface border border-border rounded-[10px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[22px] font-bold text-accent">{a.reference}</div>
              <div className="text-[15px] text-text mt-1">{a.chantier || '—'}</div>
              {a.site   && <div className="text-[13px] text-text-muted mt-0.5">{a.site}</div>}
              {a.client && <div className="text-[13px] text-text-muted">{a.client}</div>}
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              <Badge s={a.statut} map={STAT_AFF} />
              {a.titulaire && (
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#002C77] text-white">{a.titulaire}</span>
              )}
              {a.filiale && (
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#e6f1fb] text-[#185fa5]">{a.filiale}</span>
              )}
            </div>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-[10px] p-5">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1.5 mb-3">Projet</div>
            <FieldRow label="Client"  value={a.client} />
            <FieldRow label="Chantier" value={a.chantier} />
            <FieldRow label="Site"    value={a.site} />
            <FieldRow label="Filiale" value={a.filiale} />
          </div>
          <div className="bg-surface border border-border rounded-[10px] p-5">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1.5 mb-3">Références</div>
            <FieldRow label="N° étude"               value={a.numero_etude} />
            <FieldRow label="N° Affaire NGE"         value={a.affaire_nge} />
            <FieldRow label="Titulaire"              value={a.titulaire || '— Non défini —'} />
            <FieldRow label="Responsable affaire NGE" value={a.responsable} />
            <FieldRow label="Date ouverture"         value={formatDate(a.date_ouverture)} />
            <FieldRow label="Date clôture"           value={a.date_cloture ? formatDate(a.date_cloture) : 'En cours'} />
            <div className="flex flex-col gap-0.5 mb-3">
              <div className="text-[10px] text-text-muted">Statut</div>
              <Badge s={a.statut} map={STAT_AFF} />
            </div>
          </div>
        </div>

        {/* Delete error */}
        {deleteError && (
          <div className="flex items-start gap-2 px-4 py-3 bg-[#fcebeb] border border-[#f0a0a0] rounded-[10px] text-sm text-[#a32d2d]">
            <span>⛔</span>
            <div className="flex-1">{deleteError}</div>
            <button onClick={() => setDeleteError(null)} className="text-[#a32d2d] hover:opacity-70">×</button>
          </div>
        )}

        {/* Passations */}
        {passations.length > 0 && (
          <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h3 className="text-[13px] font-semibold">🤝 Passations liées ({passations.length})</h3>
              <Button size="sm" onClick={() => navigate(`/passations?affaire_id=${uid}`)}>Voir toutes</Button>
            </div>
            <div className="divide-y divide-border">
              {passations.map(p => (
                <div key={p.uid} className="flex items-center justify-between px-5 py-3 hover:bg-bg transition-colors">
                  <div>
                    <span className="text-xs font-semibold text-accent">{p.reference}</span>
                    <span className="text-xs text-text-muted ml-3">{p.operation_type || '—'} · {p.phase_operation || '—'}</span>
                  </div>
                  <Button size="sm" onClick={() => navigate(`/passations/${p.uid}`)}>Fiche →</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Demandes */}
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="text-[13px] font-semibold">Demandes associées ({demandes.length})</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => navigate(`/demandes?affaire_id=${uid}`)}>Voir toutes</Button>
            </div>
          </div>
          {demandes.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-8">Aucune demande associée à cette affaire</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {['Référence','Type mission','Statut','Échantillons','Interventions','N° DST','Échéance','Demandeur'].map(h => (
                      <th key={h} className="bg-bg px-3.5 py-2 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demandes.map(d => (
                    <tr key={d.uid} onClick={() => navigate(`/demandes/${d.uid}`)}
                      className="border-b border-border cursor-pointer hover:bg-[#f8f8fc] transition-colors">
                      <td className="px-3.5 py-2"><strong className="text-accent text-xs">{d.reference}</strong></td>
                      <td className="px-3.5 py-2 text-xs">{d.type_mission || '—'}</td>
                      <td className="px-3.5 py-2"><Badge s={d.statut} map={STAT_DEM} /></td>
                      <td className="px-3.5 py-2 text-xs text-center">{d.nb_echantillons || 0}</td>
                      <td className="px-3.5 py-2 text-xs text-center">{d.nb_interventions || 0}</td>
                      <td className="px-3.5 py-2 text-xs">{d.numero_dst || '—'}</td>
                      <td className="px-3.5 py-2 text-xs">{d.date_echeance ? formatDate(d.date_echeance) : '—'}</td>
                      <td className="px-3.5 py-2 text-xs">{d.demandeur || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal modifier */}
      {form && (
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Modifier l'affaire RST" size="md">
          <div className="grid grid-cols-2 gap-3">
            <FG label="Référence">
              <Input value={a.reference} readOnly className="text-text-muted cursor-not-allowed" />
            </FG>
            <FG label="Statut">
              <Select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full">
                {STATUTS.map(s => <option key={s}>{s}</option>)}
              </Select>
            </FG>
            <FG label="Client">
              <Input value={form.client} onChange={e => set('client', e.target.value)} />
            </FG>
            <FG label="Chantier">
              <Input value={form.chantier} onChange={e => set('chantier', e.target.value)} />
            </FG>
            <FG label="Site">
              <Input value={form.site} onChange={e => set('site', e.target.value)} />
            </FG>
            <FG label="Filiale">
              <Input value={form.filiale} onChange={e => set('filiale', e.target.value)} />
            </FG>
            <FG label="N° étude">
              <Input value={form.numero_etude} onChange={e => set('numero_etude', e.target.value)} />
            </FG>
            <FG label="N° Affaire NGE">
              <Input value={form.affaire_nge} onChange={e => set('affaire_nge', e.target.value)} />
            </FG>
            <FG label="Titulaire">
              <Select value={form.titulaire} onChange={e => set('titulaire', e.target.value)} className="w-full">
                {TITULAIRES.map(t => <option key={t} value={t}>{t || '— Non défini —'}</option>)}
              </Select>
            </FG>
            <FG label="Responsable affaire NGE">
              <Input value={form.responsable} onChange={e => set('responsable', e.target.value)} />
            </FG>
            <FG label="Date ouverture">
              <Input type="date" value={form.date_ouverture} onChange={e => set('date_ouverture', e.target.value)} />
            </FG>
          </div>

          {mutation.error && (
            <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
              {mutation.error.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={() => setEditOpen(false)} variant="secondary">Annuler</Button>
            <Button onClick={() => mutation.mutate(form)} variant="primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

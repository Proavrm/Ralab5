import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { affairesApi, api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'

const STATUTS    = ['À qualifier', 'En cours', 'Terminée', 'Archivée']
const TITULAIRES = ['NGE GC', 'NGE Energie', 'NGE Routes', 'EHTP', 'NGE E.S.', 'NGE Transitions', 'Lyaudet', 'Autre']

const STAT_AFF = { 'À qualifier':'bg-[#f1efe8] text-[#5f5e5a]', 'En cours':'bg-[#eaf3de] text-[#3b6d11]', 'Terminée':'bg-[#eeedfe] text-[#534ab7]', 'Archivée':'bg-[#f1efe8] text-[#5f5e5a]' }
const STAT_DEM = { 'À qualifier':'bg-[#f1efe8] text-[#5f5e5a]', 'Demande':'bg-[#e6f1fb] text-[#185fa5]', 'En Cours':'bg-[#eaf3de] text-[#3b6d11]', 'Répondu':'bg-[#eeedfe] text-[#534ab7]', 'Fini':'bg-[#eaf3de] text-[#3b6d11]', 'Envoyé - Perdu':'bg-[#f1efe8] text-[#5f5e5a]' }

function Badge({ s, map }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[s] || map['À qualifier']}`}>{s}</span>
}

function FieldRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 mb-3 last:mb-0">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}>{value || '—'}</div>
    </div>
  )
}

export default function AffairePage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  const { data: affaire, isLoading, isError } = useQuery({
    queryKey: ['affaire', uid],
    queryFn: () => affairesApi.get(uid),
    onError: () => navigate('/affaires'),
  })

  const { data: demandes = [] } = useQuery({
    queryKey: ['affaire-demandes', uid],
    queryFn: () => affairesApi.demandes(uid),
    enabled: !!uid,
  })

  const mutation = useMutation({
    mutationFn: (data) => affairesApi.update(uid, data),
    onSuccess: (saved) => {
      qc.setQueryData(['affaire', uid], saved)
      setEditing(false)
    },
  })

  function openEdit() {
    setForm({
      client: affaire.client || '',
      chantier: affaire.chantier || '',
      site: affaire.site || '',
      filiale: affaire.filiale || '',
      numero_etude: affaire.numero_etude || '',
      affaire_nge: affaire.affaire_nge || '',
      titulaire: affaire.titulaire || '',
      responsable: affaire.responsable || '',
      statut: affaire.statut || 'À qualifier',
      date_ouverture: affaire.date_ouverture || '',
    })
    setEditing(true)
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  if (isLoading) return <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
  if (isError || !affaire) return null

  const a = affaire

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-7 bg-surface border-b border-border h-[58px] shrink-0 sticky top-0 z-10">
        <button onClick={() => navigate('/affaires')}
          className="flex items-center gap-1.5 text-text-muted text-[13px] hover:bg-bg hover:text-text px-2.5 py-1.5 rounded transition-colors">
          ← Affaires RST
        </button>
        <span className="text-[15px] font-semibold flex-1">Affaire {a.reference}</span>
        <Button size="sm" variant="primary" onClick={openEdit}>✏️ Modifier</Button>
        <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${uid}`)}>📂 Demandes</Button>
        <Button size="sm" onClick={() => navigate(`/passations?affaire_id=${uid}`)}>🤝 Passations</Button>
        <Button size="sm" onClick={() => navigate(`/passations/new?affaire_id=${uid}`)}>+ Nouvelle passation</Button>
        <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${uid}&create=1`)}>+ Nouvelle demande</Button>
      </div>

      <div className="p-7 max-w-[900px] mx-auto w-full flex flex-col gap-5">
        {/* Hero */}
        <div className="bg-surface border border-border rounded-[10px] p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-[22px] font-bold text-accent">{a.reference}</div>
              <div className="text-[15px] text-text mt-0.5">{a.chantier || '—'}</div>
              <div className="text-[13px] text-text-muted">{a.site || ''}</div>
              <div className="text-[13px] text-text-muted">{a.client || ''}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge s={a.statut} map={STAT_AFF} />
              {a.titulaire && <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#002C77] text-white">{a.titulaire}</span>}
              {a.filiale  && <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#e6f1fb] text-[#185fa5]">{a.filiale}</span>}
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
            <FieldRow label="N° étude"              value={a.numero_etude} />
            <FieldRow label="N° Affaire NGE"        value={a.affaire_nge} />
            <FieldRow label="Titulaire"             value={a.titulaire || '— Non défini —'} />
            <FieldRow label="Responsable affaire NGE" value={a.responsable} />
            <FieldRow label="Date ouverture"        value={formatDate(a.date_ouverture)} />
            <FieldRow label="Date clôture"          value={a.date_cloture ? formatDate(a.date_cloture) : 'En cours'} />
            <FieldRow label="Statut"                value={null} />
            <Badge s={a.statut} map={STAT_AFF} />
          </div>
        </div>

        {/* Demandes table */}
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="text-[13px] font-semibold">Demandes associées ({demandes.length})</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => navigate(`/demandes?affaire_id=${uid}`)}>Voir toutes</Button>
              <Button size="sm" onClick={() => navigate(`/passations?affaire_id=${uid}`)}>Voir passations</Button>
            </div>
          </div>
          {demandes.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-8">Aucune demande associée à cette affaire</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Référence', 'Type mission', 'Statut', 'Échantillons', 'Interventions', 'N° DST', 'Échéance', 'Demandeur'].map(h => (
                    <th key={h} className="bg-bg px-3.5 py-2 text-left text-[11px] font-medium text-text-muted border-b border-border">{h}</th>
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
          )}
        </div>
      </div>

      {/* Modal edit */}
      {form && (
        <Modal open={editing} onClose={() => setEditing(false)} title="Modifier l'affaire RST" size="md">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-muted">Référence</label>
                <Input value={a.reference} readOnly className="text-text-muted" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-muted">Statut</label>
                <Select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full">
                  {STATUTS.map(s => <option key={s}>{s}</option>)}
                </Select>
              </div>
            </div>
            {[
              ['client', 'Client'], ['chantier', 'Chantier'],
              ['site', 'Site'], ['filiale', 'Filiale'],
              ['numero_etude', 'N° étude'], ['affaire_nge', 'N° Affaire NGE'],
              ['responsable', 'Responsable affaire NGE'],
            ].map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-muted">{label}</label>
                <Input value={form[key]} onChange={e => set(key, e.target.value)} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-muted">Titulaire</label>
                <Select value={form.titulaire} onChange={e => set('titulaire', e.target.value)} className="w-full">
                  <option value="">— Non défini —</option>
                  {TITULAIRES.map(t => <option key={t}>{t}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-text-muted">Date ouverture</label>
                <Input type="date" value={form.date_ouverture} onChange={e => set('date_ouverture', e.target.value)} />
              </div>
            </div>
            {mutation.error && (
              <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{mutation.error.message}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setEditing(false)} variant="secondary">Annuler</Button>
              <Button onClick={() => mutation.mutate(form)} variant="primary" disabled={mutation.isPending}>
                {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
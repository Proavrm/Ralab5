/**
 * EssaiDetailPage.jsx — Fiche complète d'un essai laboratoire
 * Route: /essais/:uid
 *
 * Architecture: détecte type_essai et affiche le bon composant de saisie.
 * Pour ajouter un nouveau type: ajouter un case dans ESSAI_COMPONENTS.
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'

// ── Helpers UI ────────────────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-5">
      {title && <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-2 mb-4">{title}</div>}
      {children}
    </div>
  )
}
function FR({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 mb-2.5">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}>{value || '—'}</span>
    </div>
  )
}
function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}
const STAT_CLS = {
  'Programmé': 'bg-[#e6f1fb] text-[#185fa5]',
  'En cours':  'bg-[#faeeda] text-[#854f0b]',
  'Terminé':   'bg-[#eaf3de] text-[#3b6d11]',
  'Annulé':    'bg-[#f1efe8] text-[#5f5e5a]',
}
function Badge({ s }) {
  if (!s) return null
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
}

// ── Calcul helpers ────────────────────────────────────────────────────────────
function n(v) { const x = parseFloat(v); return isNaN(x) ? null : x }
function pct(v, digits = 1) { return v === null ? '—' : v.toFixed(digits) + ' %' }
function g(v, digits = 2) { return v === null ? '—' : v.toFixed(digits) + ' g' }

// ═══════════════════════════════════════════════════════════════════════════════
// TENEUR EN EAU — NF P 94-050 / NF EN ISO 17892-1
// w (%) = (M_humide - M_sec) / (M_sec - M_recipient) × 100
// ═══════════════════════════════════════════════════════════════════════════════
const NB_DET = 3

function calcTeneurEnEau(det) {
  const m1 = n(det.m_recipient)         // masse récipient
  const m2 = n(det.m_recip_sol_humide)  // masse récipient + sol humide
  const m3 = n(det.m_recip_sol_sec)     // masse récipient + sol sec
  if (m1 === null || m2 === null || m3 === null) return { m_eau: null, m_sol_sec: null, w: null }
  const m_eau    = m2 - m3
  const m_sol_sec = m3 - m1
  const w = m_sol_sec > 0 ? (m_eau / m_sol_sec) * 100 : null
  return { m_eau, m_sol_sec, w }
}

function TeneurEnEau({ resultats, onChange, readOnly }) {
  // Parse stored JSON or init with empty determinations
  const initDets = () => {
    try {
      const r = typeof resultats === 'string' ? JSON.parse(resultats || '{}') : (resultats || {})
      if (r.determinations?.length) return r.determinations
    } catch {}
    return Array.from({ length: NB_DET }, (_, i) => ({
      num: i + 1, m_recipient: '', m_recip_sol_humide: '', m_recip_sol_sec: '', actif: i < 2,
    }))
  }

  const [dets, setDets] = useState(initDets)

  function setDet(i, key, val) {
    const updated = dets.map((d, idx) => idx === i ? { ...d, [key]: val } : d)
    setDets(updated)
    // Build resultats JSON
    const calcs = updated.map(d => ({ ...d, ...calcTeneurEnEau(d) }))
    const ws = calcs.filter(d => d.actif && d.w !== null).map(d => d.w)
    const w_moyen = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null
    onChange(JSON.stringify({ determinations: updated, w_moyen }))
  }

  const calcs = dets.map(d => calcTeneurEnEau(d))
  const ws = calcs.filter((c, i) => dets[i].actif && c.w !== null).map(c => c.w)
  const w_moyen = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-text-muted italic">NF P 94-050 / NF EN ISO 17892-1 — w = (M<sub>humide</sub> − M<sub>sec</sub>) / (M<sub>sec</sub> − M<sub>récipient</sub>) × 100</p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              {['N°', 'Actif', 'M récipient (g)', 'M récip. + sol humide (g)', 'M récip. + sol sec (g)', 'M eau (g)', 'M sol sec (g)', 'w (%)'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-medium text-text-muted whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dets.map((d, i) => {
              const c = calcs[i]
              return (
                <tr key={i} className={`border-b border-border ${!d.actif ? 'opacity-40' : ''}`}>
                  <td className="px-3 py-2 text-[12px] font-medium text-text-muted">{d.num}</td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={d.actif}
                      onChange={e => setDet(i, 'actif', e.target.checked)}
                      disabled={readOnly} className="accent-accent" />
                  </td>
                  {['m_recipient', 'm_recip_sol_humide', 'm_recip_sol_sec'].map(key => (
                    <td key={key} className="px-2 py-1.5">
                      <input
                        type="number" step="0.01" value={d[key]}
                        onChange={e => setDet(i, key, e.target.value)}
                        disabled={readOnly || !d.actif}
                        className="w-[100px] px-2 py-1 border border-border rounded text-sm bg-bg outline-none focus:border-accent text-right disabled:bg-bg/50" />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-[12px] text-text-muted">{g(c.m_eau)}</td>
                  <td className="px-3 py-2 text-right text-[12px] text-text-muted">{g(c.m_sol_sec)}</td>
                  <td className={`px-3 py-2 text-right text-[13px] font-bold ${c.w !== null ? 'text-accent' : 'text-text-muted'}`}>{pct(c.w)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-bg border-t-2 border-border">
              <td colSpan={7} className="px-3 py-2.5 text-[12px] font-bold text-right">w moyen :</td>
              <td className={`px-3 py-2.5 text-right text-[15px] font-bold ${w_moyen !== null ? 'text-accent' : 'text-text-muted'}`}>
                {pct(w_moyen)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {w_moyen !== null && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg">
          <span className="text-[28px] font-bold text-[#3b6d11]">{w_moyen.toFixed(1)} %</span>
          <div>
            <div className="text-[11px] font-bold text-[#3b6d11]">Teneur en eau moyenne</div>
            <div className="text-[11px] text-[#5a8f30]">{ws.length} détermination{ws.length > 1 ? 's' : ''}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRE DES COMPOSANTS PAR TYPE D'ESSAI
// Pour ajouter un type: ajouter une entrée ici
// ═══════════════════════════════════════════════════════════════════════════════
const ESSAI_COMPONENTS = {
  'Teneur en eau': TeneurEnEau,
  // 'Granulométrie': Granulometrie,
  // 'Limites d\'Atterberg': LimitesAtterberg,
  // ...
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════
export default function EssaiDetailPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [resultatsJson, setResultatsJson] = useState(null)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const { data: essai, isLoading, isError } = useQuery({
    queryKey: ['essai', String(uid)],
    queryFn: () => api.get(`/essais/${uid}`),
  })

  const { data: meta } = useQuery({
    queryKey: ['essais-meta'],
    queryFn: () => api.get('/essais/meta'),
    staleTime: Infinity,
  })

  const saveMut = useMutation({
    mutationFn: (data) => api.put(`/essais/${uid}`, data),
    onSuccess: (saved) => {
      qc.setQueryData(['essai', String(uid)], saved)
      setEditing(false)
      setResultatsJson(null)
    },
  })

  function openEdit() {
    setForm({
      type_essai: essai.type_essai || '',
      norme:      essai.norme || '',
      statut:     essai.statut || 'Programmé',
      operateur:  essai.operateur || '',
      date_debut: essai.date_debut || '',
      date_fin:   essai.date_fin || '',
      observations: essai.observations || '',
    })
    setResultatsJson(essai.resultats || '{}')
    setEditing(true)
  }

  function handleSave() {
    const payload = { ...form }
    if (resultatsJson !== null) payload.resultats = resultatsJson
    saveMut.mutate(payload)
  }

  if (isLoading) return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  if (isError || !essai) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Essai introuvable</p>
      <Button onClick={() => navigate(-1)}>← Retour</Button>
    </div>
  )

  const EssaiForm = ESSAI_COMPONENTS[essai.type_essai]
  let resultsParsed = {}
  try { resultsParsed = JSON.parse(essai.resultats || '{}') } catch {}
  const wMoyen = resultsParsed.w_moyen

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Topbar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-surface border-b border-border shrink-0">
        <button onClick={() => navigate(-1)} className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors">
          ← Retour
        </button>
        <span className="text-[13px] text-text-muted">
          {essai.demande_ref && <span className="hover:text-text cursor-pointer" onClick={() => navigate(`/demandes/${essai.demande_ref}`)}>{essai.demande_ref}</span>}
          {essai.ech_ref && <> › <span className="text-text-muted">{essai.ech_ref}</span></>}
          {' › '}
        </span>
        <span className="text-[14px] font-semibold">{essai.type_essai || `Essai #${uid}`}</span>
        <div className="ml-auto flex items-center gap-2">
          <Badge s={essai.statut} />
          {!editing && <Button size="sm" variant="primary" onClick={openEdit}>✏️ Modifier</Button>}
        </div>
      </div>

      <div className="p-6 max-w-[900px] mx-auto w-full flex flex-col gap-4">

        {/* Hero */}
        <div className="bg-surface border border-border rounded-[10px] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[20px] font-bold text-accent">{essai.type_essai || '—'}</div>
              {essai.ech_ref && <div className="text-[13px] text-text-muted mt-0.5">Échantillon : {essai.ech_ref} {essai.designation ? `— ${essai.designation}` : ''}</div>}
              {essai.demande_ref && <div className="text-[12px] text-text-muted">Demande : {essai.demande_ref}</div>}
              {essai.chantier && <div className="text-[12px] text-text-muted">{essai.chantier}{essai.client ? ` — ${essai.client}` : ''}</div>}
            </div>
            {wMoyen !== null && wMoyen !== undefined && (
              <div className="text-right shrink-0">
                <div className="text-[28px] font-bold text-accent">{Number(wMoyen).toFixed(1)} %</div>
                <div className="text-[11px] text-text-muted">w moyen</div>
              </div>
            )}
          </div>
        </div>

        {/* Infos essai */}
        {!editing && (
          <div className="grid grid-cols-2 gap-4">
            <Card title="Essai">
              <FR label="Type" value={essai.type_essai} />
              <FR label="Norme" value={essai.norme} />
              <FR label="Statut" value={essai.statut} />
              <FR label="Opérateur" value={essai.operateur} />
              <FR label="Date début" value={formatDate(essai.date_debut)} />
              <FR label="Date fin" value={formatDate(essai.date_fin)} />
            </Card>
            <Card title="Échantillon">
              <FR label="Référence" value={essai.ech_ref} />
              <FR label="Désignation" value={essai.designation} />
              <FR label="Chantier" value={essai.chantier} />
              <FR label="Client" value={essai.client} />
              <FR label="Site" value={essai.site} />
            </Card>
          </div>
        )}

        {/* Mode édition — infos */}
        {editing && (
          <Card title="Modifier l'essai">
            <div className="grid grid-cols-2 gap-3">
              <FG label="Type d'essai">
                <Select value={form.type_essai} onChange={e => set('type_essai', e.target.value)} className="w-full">
                  {(meta?.types_essai || []).map(t => <option key={t}>{t}</option>)}
                </Select>
              </FG>
              <FG label="Norme"><Input value={form.norme} onChange={e => set('norme', e.target.value)} placeholder="NF P 94-050"/></FG>
              <FG label="Statut">
                <Select value={form.statut} onChange={e => set('statut', e.target.value)} className="w-full">
                  {(meta?.statuts_essai || ['Programmé','En cours','Terminé','Annulé']).map(s => <option key={s}>{s}</option>)}
                </Select>
              </FG>
              <FG label="Opérateur"><Input value={form.operateur} onChange={e => set('operateur', e.target.value)}/></FG>
              <FG label="Date début"><Input type="date" value={form.date_debut} onChange={e => set('date_debut', e.target.value)}/></FG>
              <FG label="Date fin"><Input type="date" value={form.date_fin} onChange={e => set('date_fin', e.target.value)}/></FG>
              <FG label="Observations" full>
                <textarea value={form.observations} onChange={e => set('observations', e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"/>
              </FG>
            </div>
          </Card>
        )}

        {/* Fiche de calcul */}
        <Card title={`Saisie des résultats — ${essai.type_essai}`}>
          {EssaiForm ? (
            <EssaiForm
              resultats={editing ? (resultatsJson ?? essai.resultats) : essai.resultats}
              onChange={setResultatsJson}
              readOnly={!editing}
            />
          ) : (
            <p className="text-text-muted text-sm italic">
              Formulaire de saisie non disponible pour ce type d'essai ({essai.type_essai}).
            </p>
          )}
        </Card>

        {/* Observations (lecture) */}
        {!editing && essai.observations && (
          <Card title="Observations">
            <p className="text-[13px] whitespace-pre-wrap">{essai.observations}</p>
          </Card>
        )}

        {/* Actions */}
        {editing && (
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setEditing(false); setResultatsJson(null) }}>Annuler</Button>
            <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? '…' : '✓ Enregistrer'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * PreparationPage.jsx
 * Preparation = cadrage global de la demande.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import InterventionTypeModal, { applyInterventionTypeToPath, buildInterventionTypeOptions } from '@/components/interventions/InterventionTypeModal'
import Input, { Select } from '@/components/ui/Input'
import { ArrowLeft, ClipboardList, RefreshCw, Save, Wrench } from 'lucide-react'

const FINALITY_OPTIONS = [
  'Identification / classification',
  'Etude GTR',
  'Etude de traitement',
  'Aptitude au remblai',
  'Aptitude a la couche de forme',
  'Controle de compactage',
  'Controle de plateforme / portance',
  'Controle de materiaux',
  'Suivi d execution',
  'Diagnostic d anomalie',
  'Etancheite',
  'Percolation',
  'Infiltration / permeabilite',
  'Prelevement pour laboratoire',
  'Reception technique',
  'Autre',
]

const PRIORITY_OPTIONS = ['Basse', 'Normale', 'Haute', 'Urgente']

const MATERIAL_OPTIONS = [
  'Sol',
  'Materiau de terrassement',
  'GNT / materiau granulaire',
  'Enrobe',
  'Beton / GC',
  'Reseau / canalisation',
  'Plateforme',
  'Tranchee',
  'Talus',
  'Ouvrage',
  'Autre',
]

const DEFAULT_FORM = {
  phase_operation: '\u00c0 qualifier',
  familles_prevues: [],
  type_intervention_prevu: '',
  finalite: '',
  zone_localisation: '',
  materiau_objet: '',
  objectif_mission: '',
  attentes_client: '',
  contexte_operationnel: '',
  objectifs: '',
  programme_previsionnel: '',
  points_vigilance: '',
  contraintes_acces: '',
  contraintes_delais: '',
  contraintes_hse: '',
  responsable_referent: '',
  attribue_a: '',
  priorite: 'Normale',
  ressources_notes: '',
  commentaires: '',
  remarques: '',
}

function Section({ title, children, right }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-bold uppercase tracking-[.06em] text-text-muted">{title}</div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children, full = false }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function Textarea({ value, onChange, rows = 3, placeholder = '' }) {
  return (
    <textarea
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
    />
  )
}

function InfoLine({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] text-text-muted uppercase tracking-[.04em]">{label}</div>
      <div className={`text-[13px] ${value ? '' : 'text-text-muted italic'}`}>{value || '—'}</div>
    </div>
  )
}

function Badge({ children, active = false }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${active ? 'border-accent bg-[#eef5ff] text-accent' : 'border-border bg-bg'}`}>
      {children}
    </span>
  )
}

function FamilyCard({ family, checked, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`text-left rounded-xl border p-3 transition-colors ${checked ? 'border-accent bg-[#eef5ff]' : 'border-border bg-bg hover:border-accent'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-text">{family.label}</div>
          <div className="mt-1 text-[11px] text-text-muted leading-5">{family.description || family.group || ''}</div>
        </div>
        <input type="checkbox" checked={checked} readOnly className="mt-0.5 accent-accent pointer-events-none" />
      </div>
      {family.group ? <div className="mt-2 text-[10px] uppercase tracking-[.06em] text-text-muted">{family.group}</div> : null}
    </button>
  )
}

function buildInterventionUrl(demandeUid, form) {
  const params = new URLSearchParams()
  params.set('demande_id', String(demandeUid || ''))
  params.set('source', 'preparation')

  if (form.type_intervention_prevu) params.set('type_intervention', form.type_intervention_prevu)
  if (form.finalite) params.set('finalite', form.finalite)
  if (form.zone_localisation) params.set('zone', form.zone_localisation)
  if (form.materiau_objet) params.set('materiau', form.materiau_objet)
  if (form.objectif_mission) params.set('objectif', form.objectif_mission)
  if (form.responsable_referent) params.set('responsable', form.responsable_referent)
  if (form.attribue_a) params.set('attribue_a', form.attribue_a)

  return `/interventions/new?${params.toString()}`
}

function uniqueNonEmpty(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))]
}

export default function PreparationPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { uid } = useParams()
  const [searchParams] = useSearchParams()

  const demandeUid = useMemo(() => String(uid || searchParams.get('uid') || ''), [uid, searchParams])
  const demandeReferenceFromQuery = useMemo(() => searchParams.get('ref') || searchParams.get('reference') || '', [searchParams])
  const [form, setForm] = useState(DEFAULT_FORM)
  const typeOptions = useMemo(() => buildInterventionTypeOptions(form.type_intervention_prevu), [form.type_intervention_prevu])
  const [interventionModalOpen, setInterventionModalOpen] = useState(false)

  const { data: nav, isLoading: navLoading } = useQuery({
    queryKey: ['demande-nav', demandeUid],
    queryFn: () => api.get(`/demandes_rst/${demandeUid}/navigation`),
    enabled: !!demandeUid,
  })

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ['demande-catalog'],
    queryFn: () => api.get('/demandes_rst/configuration/catalog'),
    enabled: !!demandeUid,
  })

  const originalPrep = nav?.preparation || {}
  const modules = nav?.modules || []
  const familyCatalog = catalog?.families || nav?.family_catalog || []
  const moduleCatalog = catalog?.modules || modules
  const phaseOptions = catalog?.phase_options || ['\u00c0 qualifier', 'Preparation', 'Demarrage chantier', 'Execution', 'Complement']

  const demandeReference = nav?.demande?.reference || nav?.reference || demandeReferenceFromQuery || ''
  const demandeAffaire = nav?.demande?.affaire_reference || nav?.demande?.affaire_ref || nav?.affaire_reference || nav?.affaire_ref || ''
  const demandeChantier = nav?.demande?.chantier || nav?.chantier || nav?.demande?.site || nav?.site || ''

  useEffect(() => {
    setForm({
      phase_operation: originalPrep.phase_operation || '\u00c0 qualifier',
      familles_prevues: Array.isArray(originalPrep.familles_prevues) ? originalPrep.familles_prevues : [],
      type_intervention_prevu: originalPrep.type_intervention_prevu || '',
      finalite: originalPrep.finalite || '',
      zone_localisation: originalPrep.zone_localisation || '',
      materiau_objet: originalPrep.materiau_objet || '',
      objectif_mission: originalPrep.objectif_mission || '',
      attentes_client: originalPrep.attentes_client || '',
      contexte_operationnel: originalPrep.contexte_operationnel || '',
      objectifs: originalPrep.objectifs || '',
      programme_previsionnel: originalPrep.programme_previsionnel || '',
      points_vigilance: originalPrep.points_vigilance || '',
      contraintes_acces: originalPrep.contraintes_acces || '',
      contraintes_delais: originalPrep.contraintes_delais || '',
      contraintes_hse: originalPrep.contraintes_hse || '',
      responsable_referent: originalPrep.responsable_referent || '',
      attribue_a: originalPrep.attribue_a || '',
      priorite: originalPrep.priorite || 'Normale',
      ressources_notes: originalPrep.ressources_notes || '',
      commentaires: originalPrep.commentaires || '',
      remarques: originalPrep.remarques || '',
    })
  }, [
    originalPrep.phase_operation,
    originalPrep.familles_prevues,
    originalPrep.type_intervention_prevu,
    originalPrep.finalite,
    originalPrep.zone_localisation,
    originalPrep.materiau_objet,
    originalPrep.objectif_mission,
    originalPrep.attentes_client,
    originalPrep.contexte_operationnel,
    originalPrep.objectifs,
    originalPrep.programme_previsionnel,
    originalPrep.points_vigilance,
    originalPrep.contraintes_acces,
    originalPrep.contraintes_delais,
    originalPrep.contraintes_hse,
    originalPrep.responsable_referent,
    originalPrep.attribue_a,
    originalPrep.priorite,
    originalPrep.ressources_notes,
    originalPrep.commentaires,
    originalPrep.remarques,
  ])

  const familyMap = useMemo(() => Object.fromEntries(familyCatalog.map((item) => [item.family_code, item])), [familyCatalog])
  const selectedFamilies = useMemo(
    () => uniqueNonEmpty(form.familles_prevues).filter((code) => familyMap[code]),
    [familyMap, form.familles_prevues]
  )

  const derivedTechnicalModuleCodes = useMemo(() => {
    const codes = []
    selectedFamilies.forEach((familyCode) => {
      ;(familyMap[familyCode]?.module_codes || []).forEach((moduleCode) => {
        if (!codes.includes(moduleCode)) codes.push(moduleCode)
      })
    })
    return codes
  }, [familyMap, selectedFamilies])

  const derivedTechnicalModuleLabels = useMemo(
    () => derivedTechnicalModuleCodes.map((code) => moduleCatalog.find((item) => item.module_code === code)?.label || code),
    [derivedTechnicalModuleCodes, moduleCatalog]
  )

  const saveMutation = useMutation({
    mutationFn: async ({ preparation, enabledModulesPayload }) => {
      await api.put(`/demandes_rst/${demandeUid}/preparation`, preparation)
      await api.put(`/demandes_rst/${demandeUid}/enabled-modules`, { modules: enabledModulesPayload })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })
    },
  })

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleFamily(familyCode) {
    setForm((current) => {
      const currentFamilies = Array.isArray(current.familles_prevues) ? current.familles_prevues : []
      return {
        ...current,
        familles_prevues: currentFamilies.includes(familyCode)
          ? currentFamilies.filter((item) => item !== familyCode)
          : [...currentFamilies, familyCode],
      }
    })
  }

  function handleSave() {
    const familyControlledModuleCodes = new Set((familyCatalog || []).flatMap((item) => item.module_codes || []))
    const currentlyEnabled = Object.fromEntries((modules || []).map((item) => [item.module_code, !!item.is_enabled]))
    const enabledModulesPayload = moduleCatalog.map((item) => ({
      module_code: item.module_code,
      is_enabled: familyControlledModuleCodes.has(item.module_code)
        ? derivedTechnicalModuleCodes.includes(item.module_code)
        : !!currentlyEnabled[item.module_code],
    }))

    saveMutation.mutate({
      preparation: {
        ...originalPrep,
        ...form,
        familles_prevues: selectedFamilies,
      },
      enabledModulesPayload,
    })
  }

  function handleCreateIntervention() {
    setInterventionModalOpen(true)
  }

  function handleSelectInterventionType(typeIntervention) {
    navigate(applyInterventionTypeToPath(buildInterventionUrl(demandeUid, form), typeIntervention))
    setInterventionModalOpen(false)
  }

  if (!demandeUid) {
    return (
      <div className="p-6">
        <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">
          Demande introuvable.
        </div>
      </div>
    )
  }

  const isLoading = navLoading || catalogLoading

  return (
    <div className="flex flex-col h-full -m-6 overflow-y-auto">
      <div className="flex items-center gap-2 px-6 bg-surface border-b border-border h-[58px] shrink-0 sticky top-0 z-10 flex-wrap">
        <button
          onClick={() => navigate(-1)}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
        >
          <ArrowLeft size={14} className="inline mr-1" />
          Retour
        </button>
        <span className="text-[15px] font-semibold flex-1">Preparation de la demande {demandeReference || demandeUid}</span>
        <Button size="sm" variant="secondary" onClick={() => qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })} disabled={isLoading}>
          <RefreshCw size={13} />
          <span className="ml-1">Rafraichir</span>
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
          <Save size={13} />
          <span className="ml-1">{saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}</span>
        </Button>
        <Button size="sm" onClick={handleCreateIntervention} disabled={isLoading}>
          <Wrench size={13} />
          <span className="ml-1">Creer une intervention</span>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-bg">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted text-center">Chargement...</div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1.55fr)_360px] gap-4">
            <div className="flex flex-col gap-4 min-w-0">
              <Section title="Contexte">
                <div className="grid grid-cols-2 gap-3">
                  <InfoLine label="Demande liee" value={demandeReference || demandeUid} />
                  <InfoLine label="Affaire" value={demandeAffaire} />
                  <div className="col-span-2">
                    <InfoLine label="Chantier / Site" value={demandeChantier} />
                  </div>
                </div>
              </Section>

              <Section title="Cadrage global" right={<ClipboardList size={14} className="text-text-muted" />}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phase operation">
                    <Select value={form.phase_operation} onChange={(event) => setField('phase_operation', event.target.value)}>
                      {phaseOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Type dominant (optionnel)">
                    <Select value={form.type_intervention_prevu} onChange={(event) => setField('type_intervention_prevu', event.target.value)}>
                      <option value="">—</option>
                      {typeOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="col-span-2 flex flex-col gap-2">
                    <div className="text-[11px] font-medium text-text-muted">Familles prevues</div>
                    <div className="grid grid-cols-2 gap-2">
                      {familyCatalog.map((family) => (
                        <FamilyCard
                          key={family.family_code}
                          family={family}
                          checked={selectedFamilies.includes(family.family_code)}
                          onToggle={() => toggleFamily(family.family_code)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Besoin et objectifs">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Attentes client" full>
                    <Textarea value={form.attentes_client} onChange={(value) => setField('attentes_client', value)} rows={2} />
                  </Field>
                  <Field label="Objectifs globaux" full>
                    <Textarea value={form.objectifs} onChange={(value) => setField('objectifs', value)} rows={2} />
                  </Field>
                  <Field label="Objectif mission" full>
                    <Textarea value={form.objectif_mission} onChange={(value) => setField('objectif_mission', value)} rows={3} placeholder="Ce que cette demande doit produire techniquement." />
                  </Field>
                  <Field label="Finalite">
                    <Select value={form.finalite} onChange={(event) => setField('finalite', event.target.value)}>
                      <option value="">—</option>
                      {FINALITY_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Materiau / objet concerne">
                    <Select value={form.materiau_objet} onChange={(event) => setField('materiau_objet', event.target.value)}>
                      <option value="">—</option>
                      {MATERIAL_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Zone / localisation">
                    <Input value={form.zone_localisation} onChange={(event) => setField('zone_localisation', event.target.value)} />
                  </Field>
                  <Field label="Programme global prevu" full>
                    <Textarea value={form.programme_previsionnel} onChange={(value) => setField('programme_previsionnel', value)} rows={3} placeholder="Campagnes envisagees, ordre, dependances, cadence..." />
                  </Field>
                </div>
              </Section>

              <Section title="Contraintes et vigilance">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contexte operationnel" full>
                    <Textarea value={form.contexte_operationnel} onChange={(value) => setField('contexte_operationnel', value)} rows={2} />
                  </Field>
                  <Field label="Points de vigilance" full>
                    <Textarea value={form.points_vigilance} onChange={(value) => setField('points_vigilance', value)} rows={2} />
                  </Field>
                  <Field label="Contraintes acces" full>
                    <Textarea value={form.contraintes_acces} onChange={(value) => setField('contraintes_acces', value)} rows={2} />
                  </Field>
                  <Field label="Contraintes delais">
                    <Textarea value={form.contraintes_delais} onChange={(value) => setField('contraintes_delais', value)} rows={2} />
                  </Field>
                  <Field label="Contraintes HSE">
                    <Textarea value={form.contraintes_hse} onChange={(value) => setField('contraintes_hse', value)} rows={2} />
                  </Field>
                </div>
              </Section>

              <Section title="Organisation">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Responsable / referent">
                    <Input value={form.responsable_referent} onChange={(event) => setField('responsable_referent', event.target.value)} />
                  </Field>
                  <Field label="Attribue a">
                    <Input value={form.attribue_a} onChange={(event) => setField('attribue_a', event.target.value)} />
                  </Field>
                  <Field label="Priorite">
                    <Select value={form.priorite} onChange={(event) => setField('priorite', event.target.value)}>
                      {PRIORITY_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Ressources / notes" full>
                    <Textarea value={form.ressources_notes} onChange={(value) => setField('ressources_notes', value)} rows={2} />
                  </Field>
                  <Field label="Commentaires" full>
                    <Textarea value={form.commentaires} onChange={(value) => setField('commentaires', value)} rows={2} />
                  </Field>
                  <Field label="Remarques preparation" full>
                    <Textarea value={form.remarques} onChange={(value) => setField('remarques', value)} rows={3} placeholder="Elements de synthese utiles avant de cadrer les campagnes." />
                  </Field>
                </div>
              </Section>

              {saveMutation.error ? (
                <div className="text-sm text-danger bg-[#fcebeb] border border-[#f0a0a0] rounded-lg px-3 py-2">
                  {saveMutation.error.message}
                </div>
              ) : null}

              {saveMutation.isSuccess ? (
                <div className="text-sm text-[#0f6e56] bg-[#e0f5ef] border border-[#bfe5db] rounded-lg px-3 py-2">
                  Preparation enregistree.
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              <Section title="Resume">
                <InfoLine label="Phase" value={form.phase_operation} />
                <InfoLine label="Familles prevues" value={selectedFamilies.map((code) => familyMap[code]?.label || code).join(', ')} />
                <InfoLine label="Finalite" value={form.finalite} />
                <InfoLine label="Zone" value={form.zone_localisation} />
                <InfoLine label="Responsable" value={form.responsable_referent} />
                <InfoLine label="Attribue a" value={form.attribue_a} />
                <InfoLine label="Priorite" value={form.priorite} />
              </Section>

              <Section title="Modules derives">
                <div className="flex flex-wrap gap-2">
                  {derivedTechnicalModuleLabels.length > 0 ? derivedTechnicalModuleLabels.map((label) => (
                    <Badge key={label} active>{label}</Badge>
                  )) : (
                    <div className="text-[13px] text-text-muted leading-6">
                      Aucun module technique derive pour l instant.
                    </div>
                  )}
                </div>
                <div className="text-[12px] text-text-muted leading-6">
                  Les modules techniques restent alimentes automatiquement a partir des familles prevues pour ne pas casser le reste du workflow.
                </div>
              </Section>

              <Section title="Suite logique">
                <div className="text-[13px] leading-6 text-text-muted">
                  La preparation decide ce que la demande va produire. Les campagnes servent ensuite a cadrer chaque branche concrete, puis les interventions decrivent l execution reelle.
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedFamilies.map((code) => (
                    <Badge key={code}>{familyMap[code]?.label || code}</Badge>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        )}
      </div>

      <InterventionTypeModal
        open={interventionModalOpen}
        onClose={() => setInterventionModalOpen(false)}
        onSelect={handleSelectInterventionType}
        subtitle={demandeReference ? `Demande: ${demandeReference}` : ''}
      />
    </div>
  )
}

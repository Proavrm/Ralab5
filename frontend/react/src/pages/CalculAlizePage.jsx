import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { calculsApi, getApiErrorMessage } from '@/services/api'

const TABS = [
  { id: 'general', label: 'Général' },
  { id: 'trafic', label: 'Trafic' },
  { id: 'plateforme', label: 'Plateforme' },
  { id: 'structure', label: 'Structure' },
  { id: 'resultats', label: 'Résultats' },
  { id: 'criteres', label: 'Critères' },
  { id: 'synthese', label: 'Synthèse' },
]

const STATUTS = [
  'Brouillon',
  'Données incomplètes',
  'Prêt pour calcul',
  'Calcul en cours',
  'Résultats importés',
  'À vérifier',
  'Vérifié',
  'Validé',
  'Archivé',
  'Annulé',
  'À recalculer',
]

function emptyLayer(ordre = 1) {
  return {
    ordre,
    fonction: '',
    materiau: '',
    famille: '',
    classe: '',
    formulation: '',
    epaisseur: null,
    unite: 'cm',
    module: null,
    poisson: null,
    temperature_calcul: null,
    interface_sup: '',
    interface_inf: '',
    lie: false,
    from_library: false,
    modified_manually: false,
    justification: '',
    commentaire: '',
  }
}

function emptyCriterion() {
  return {
    critere: '',
    materiau: '',
    couche: '',
    profondeur: '',
    valeur_admissible: null,
    valeur_calculee: null,
    unite: 'µdéf',
    marge: null,
    consommation: null,
    sens_verification: 'inferieur_ou_egal',
    statut: 'Non renseigné',
    commentaire: '',
  }
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </label>
  )
}

function numOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function CalculAlizePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const calcId = Number(id)
  const [tab, setTab] = useState('general')
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [meta, setMeta] = useState({
    nom_calcul: '',
    statut: 'Brouillon',
    ouvrage: '',
    zone_label: '',
    auteur: '',
    calculateur: '',
    verificateur: '',
    validateur: '',
  })
  const [traffic, setTraffic] = useState({})
  const [platform, setPlatform] = useState({})
  const [params, setParams] = useState({})
  const [results, setResults] = useState({})
  const [layers, setLayers] = useState([])
  const [criteria, setCriteria] = useState([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const row = await calculsApi.get(calcId)
      setDetail(row)
      setMeta({
        nom_calcul: row.nom_calcul || '',
        statut: row.statut || 'Brouillon',
        ouvrage: row.ouvrage || '',
        zone_label: row.zone_label || '',
        auteur: row.auteur || '',
        calculateur: row.calculateur || '',
        verificateur: row.verificateur || '',
        validateur: row.validateur || '',
      })
      const alize = row.alize || {}
      setTraffic(alize.traffic || {})
      setPlatform(alize.platform || {})
      setParams(alize.params || {})
      setResults(alize.results || {})
      setLayers(Array.isArray(alize.layers) && alize.layers.length ? alize.layers : [emptyLayer(1)])
      setCriteria(Array.isArray(alize.criteria) ? alize.criteria : [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chargement impossible'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!Number.isFinite(calcId)) return
    load()
  }, [calcId])

  const readiness = detail?.readiness || {}

  async function saveAll() {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await calculsApi.update(calcId, meta)
      const row = await calculsApi.updateAlize(calcId, {
        traffic,
        platform,
        params,
        results,
        layers: layers.map((layer, index) => ({
          ...layer,
          ordre: layer.ordre || index + 1,
          epaisseur: numOrNull(layer.epaisseur),
          module: numOrNull(layer.module),
          poisson: numOrNull(layer.poisson),
          temperature_calcul: numOrNull(layer.temperature_calcul),
        })),
        criteria: criteria.map((c) => ({
          ...c,
          valeur_admissible: numOrNull(c.valeur_admissible),
          valeur_calculee: numOrNull(c.valeur_calculee),
          marge: numOrNull(c.marge),
          consommation: numOrNull(c.consommation),
        })),
      })
      setDetail(row)
      const alize = row.alize || {}
      setLayers(alize.layers?.length ? alize.layers : [emptyLayer(1)])
      setCriteria(alize.criteria || [])
      setInfo('Enregistré')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Enregistrement impossible'))
    } finally {
      setSaving(false)
    }
  }

  async function duplicate() {
    try {
      const copy = await calculsApi.duplicate(calcId)
      navigate(`/calculs/alize/${copy.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Duplication impossible'))
    }
  }

  async function openFiche() {
    try {
      await calculsApi.openFiche(calcId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Fiche impossible'))
    }
  }

  const title = useMemo(
    () => detail?.reference || `Calcul #${calcId}`,
    [detail, calcId],
  )

  if (loading) {
    return (
      <FichePageShell>
        <FicheMain>
          <p className="text-[13px] text-text-muted">Chargement…</p>
        </FicheMain>
      </FichePageShell>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Calculs"
        onBack={() => navigate('/calculs')}
        eyebrow="Alizé"
        title={title}
        subtitle={`${meta.nom_calcul || 'Sans nom'} · ${meta.statut}`}
      >
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={duplicate}>Dupliquer</Button>
          <Button size="sm" onClick={openFiche}>Fiche HTML</Button>
          <Button size="sm" variant="primary" disabled={saving} onClick={saveAll}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </FicheTopbar>

      <FicheMain>
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>
        ) : null}
        {info ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{info}</div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                tab === t.id
                  ? 'border-[#003170] bg-[#003170] text-white'
                  : 'border-[#dbe1ea] bg-white text-[#475569] hover:border-[#003170]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' ? (
          <SectionCard title="Identification">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Nom du calcul">
                <Input value={meta.nom_calcul} onChange={(e) => setMeta({ ...meta, nom_calcul: e.target.value })} />
              </Field>
              <Field label="Statut">
                <Select value={meta.statut} onChange={(e) => setMeta({ ...meta, statut: e.target.value })} className="w-full">
                  {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Ouvrage">
                <Input value={meta.ouvrage} onChange={(e) => setMeta({ ...meta, ouvrage: e.target.value })} />
              </Field>
              <Field label="Zone">
                <Input value={meta.zone_label} onChange={(e) => setMeta({ ...meta, zone_label: e.target.value })} />
              </Field>
              <Field label="Auteur">
                <Input value={meta.auteur} onChange={(e) => setMeta({ ...meta, auteur: e.target.value })} />
              </Field>
              <Field label="Calculateur">
                <Input value={meta.calculateur} onChange={(e) => setMeta({ ...meta, calculateur: e.target.value })} />
              </Field>
              <Field label="Vérificateur">
                <Input value={meta.verificateur} onChange={(e) => setMeta({ ...meta, verificateur: e.target.value })} />
              </Field>
              <Field label="Validateur">
                <Input value={meta.validateur} onChange={(e) => setMeta({ ...meta, validateur: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 text-[13px] text-text-muted md:grid-cols-2">
              <div>Affaire : <strong className="text-text">{detail?.affaire_ref || '—'}</strong> · {detail?.chantier || '—'}</div>
              <div>Demande : <strong className="text-text">{detail?.demande_ref || '—'}</strong></div>
              <div>Client : {detail?.client || '—'}</div>
              <div>Indice {detail?.indice} · v{detail?.version}</div>
            </div>
          </SectionCard>
        ) : null}

        {tab === 'trafic' ? (
          <SectionCard title="Hypothèses de trafic">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[
                ['mja_pl', 'MJA PL'],
                ['croissance_pct', 'Croissance %'],
                ['duree_ans', 'Durée (ans)'],
                ['cam', 'CAM'],
                ['ne_calcule', 'NE calculé'],
                ['ne_retenu', 'NE retenu'],
                ['risque', 'Risque %'],
                ['classe_trafic', 'Classe trafic'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    value={traffic[key] ?? ''}
                    onChange={(e) => setTraffic({ ...traffic, [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Commentaire">
                <Textarea
                  rows={2}
                  value={traffic.commentaire ?? ''}
                  onChange={(e) => setTraffic({ ...traffic, commentaire: e.target.value })}
                />
              </Field>
            </div>
          </SectionCard>
        ) : null}

        {tab === 'plateforme' ? (
          <SectionCard title="Plateforme">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[
                ['classe', 'Classe PF'],
                ['module_pf', 'Module PF (MPa)'],
                ['ev2', 'EV2'],
                ['poisson', 'Poisson'],
                ['source', 'Source'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    value={platform[key] ?? ''}
                    onChange={(e) => setPlatform({ ...platform, [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Commentaire">
                <Textarea
                  rows={2}
                  value={platform.commentaire ?? ''}
                  onChange={(e) => setPlatform({ ...platform, commentaire: e.target.value })}
                />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Température calcul (°C)">
                <Input
                  value={params.temperature ?? ''}
                  onChange={(e) => setParams({ ...params, temperature: e.target.value })}
                />
              </Field>
              <Field label="Logiciel / version">
                <Input
                  value={params.logiciel ?? ''}
                  onChange={(e) => setParams({ ...params, logiciel: e.target.value })}
                />
              </Field>
              <Field label="Norme / guide">
                <Input
                  value={params.norme ?? ''}
                  onChange={(e) => setParams({ ...params, norme: e.target.value })}
                />
              </Field>
            </div>
          </SectionCard>
        ) : null}

        {tab === 'structure' ? (
          <SectionCard
            title="Structure (couches)"
            actions={(
              <Button
                size="sm"
                onClick={() => setLayers([...layers, emptyLayer(layers.length + 1)])}
              >
                + Couche
              </Button>
            )}
          >
            <div className="space-y-3">
              {layers.map((layer, index) => (
                <div key={layer.id || `l-${index}`} className="rounded-xl border border-[#e5e9f0] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[12px] font-black uppercase tracking-wide text-[#003170]">
                      Couche {layer.ordre || index + 1}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLayers(layers.filter((_, i) => i !== index))}
                      disabled={layers.length <= 1}
                    >
                      Retirer
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
                    {[
                      ['fonction', 'Fonction'],
                      ['materiau', 'Matériau'],
                      ['famille', 'Famille'],
                      ['classe', 'Classe'],
                      ['epaisseur', 'Épaisseur'],
                      ['module', 'Module (MPa)'],
                      ['poisson', 'Poisson'],
                      ['formulation', 'Formulation'],
                    ].map(([key, label]) => (
                      <Field key={key} label={label}>
                        <Input
                          value={layer[key] ?? ''}
                          onChange={(e) => {
                            const next = [...layers]
                            next[index] = { ...layer, [key]: e.target.value }
                            setLayers(next)
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {tab === 'resultats' ? (
          <SectionCard title="Résultats manuels Alizé">
            <p className="mb-3 text-[13px] text-text-muted">
              Saisie manuelle des sorties (pas d&apos;exécution Alizé dans RaLab en Phase 1).
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[
                ['epsT_adm', 'εt adm (µdéf)'],
                ['epsT_calc', 'εt calc (µdéf)'],
                ['epsZ_adm', 'εz adm (µdéf)'],
                ['epsZ_calc', 'εz calc (µdéf)'],
                ['sigmaT', 'σt (MPa)'],
                ['sigmaZ', 'σz (MPa)'],
                ['conclusion', 'Conclusion'],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    value={results[key] ?? ''}
                    onChange={(e) => setResults({ ...results, [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="Observations">
                <Textarea
                  rows={3}
                  value={results.observations ?? ''}
                  onChange={(e) => setResults({ ...results, observations: e.target.value })}
                />
              </Field>
            </div>
          </SectionCard>
        ) : null}

        {tab === 'criteres' ? (
          <SectionCard
            title="Critères de vérification"
            actions={(
              <Button size="sm" onClick={() => setCriteria([...criteria, emptyCriterion()])}>
                + Critère
              </Button>
            )}
          >
            {criteria.length === 0 ? (
              <p className="text-[13px] text-text-muted">Aucun critère. Ajoutez εt, εz, σt…</p>
            ) : (
              <div className="space-y-3">
                {criteria.map((crit, index) => (
                  <div key={crit.id || `c-${index}`} className="rounded-xl border border-[#e5e9f0] p-3">
                    <div className="mb-2 flex justify-between">
                      <div className="text-[12px] font-black uppercase tracking-wide text-[#003170]">
                        {crit.critere || `Critère ${index + 1}`}
                        {crit.statut ? ` · ${crit.statut}` : ''}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setCriteria(criteria.filter((_, i) => i !== index))}>
                        Retirer
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
                      {[
                        ['critere', 'Critère'],
                        ['materiau', 'Matériau'],
                        ['couche', 'Couche'],
                        ['valeur_admissible', 'Admissible'],
                        ['valeur_calculee', 'Calculé'],
                        ['unite', 'Unité'],
                      ].map(([key, label]) => (
                        <Field key={key} label={label}>
                          <Input
                            value={crit[key] ?? ''}
                            onChange={(e) => {
                              const next = [...criteria]
                              next[index] = { ...crit, [key]: e.target.value }
                              setCriteria(next)
                            }}
                          />
                        </Field>
                      ))}
                      <Field label="Sens">
                        <Select
                          className="w-full"
                          value={crit.sens_verification || 'inferieur_ou_egal'}
                          onChange={(e) => {
                            const next = [...criteria]
                            next[index] = { ...crit, sens_verification: e.target.value }
                            setCriteria(next)
                          }}
                        >
                          <option value="inferieur_ou_egal">≤ admissible</option>
                          <option value="superieur_ou_egal">≥ admissible</option>
                        </Select>
                      </Field>
                    </div>
                    {(crit.marge != null || crit.consommation != null) ? (
                      <div className="mt-2 text-[12px] text-text-muted">
                        Marge : {crit.marge ?? '—'} · Consommation : {crit.consommation != null ? `${(Number(crit.consommation) * 100).toFixed(1)} %` : '—'}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        ) : null}

        {tab === 'synthese' ? (
          <div className="space-y-4">
            <SectionCard title="Préparation au calcul">
              {readiness.ready ? (
                <p className="text-[13px] text-emerald-700">Données minimales présentes — prêt pour calcul externe.</p>
              ) : (
                <div>
                  <p className="mb-2 text-[13px] text-amber-800">Éléments manquants :</p>
                  <ul className="list-disc pl-5 text-[13px] text-text-muted">
                    {(readiness.missing || []).map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}
            </SectionCard>
            <SectionCard title="Rappel">
              <div className="grid grid-cols-1 gap-2 text-[13px] md:grid-cols-2">
                <div>Trafic NE : {traffic.ne_retenu || traffic.ne_calcule || '—'}</div>
                <div>CAM / risque : {traffic.cam || '—'} / {traffic.risque || '—'}</div>
                <div>Plateforme : {platform.classe || '—'} · {platform.module_pf || '—'} MPa</div>
                <div>Couches : {layers.filter((l) => l.materiau).length}</div>
                <div>Critères : {criteria.length}</div>
                <div>Conclusion : {results.conclusion || '—'}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" disabled={saving} onClick={saveAll}>Enregistrer</Button>
                <Button size="sm" onClick={openFiche}>Ouvrir fiche HTML</Button>
              </div>
            </SectionCard>
          </div>
        ) : null}
      </FicheMain>
    </FichePageShell>
  )
}

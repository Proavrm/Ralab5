import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Card, { CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import Input, { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import { echantillonsApi, prelevementsApi } from '@/services/api'

const DEFAULT_STATUSES = ['À trier', 'Reçu', 'En attente', 'En cours', 'Prêt labo', 'Clôturé']
const DEFAULT_ECHANTILLON_STATUS = 'Reçu'

function FieldGroup({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function FieldRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">{label}</span>
      <span className="text-sm text-text">{value || '—'}</span>
    </div>
  )
}

function buildForm(prelevement) {
  return {
    date_prelevement: prelevement?.date_prelevement || '',
    date_reception_labo: prelevement?.date_reception_labo || '',
    description: prelevement?.description || '',
    quantite: prelevement?.quantite || '',
    receptionnaire: prelevement?.receptionnaire || '',
    zone: prelevement?.zone || '',
    materiau: prelevement?.materiau || '',
    technicien: prelevement?.technicien || '',
    finalite: prelevement?.finalite || '',
    notes: prelevement?.notes || '',
    statut: prelevement?.statut || 'À trier',
  }
}

function buildQuickEchantillonForm(prelevement) {
  return {
    designation_lines: '',
    localisation: prelevement?.zone || '',
    statut: DEFAULT_ECHANTILLON_STATUS,
  }
}

function parseDesignationLines(rawValue) {
  return String(rawValue || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function extractIsoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function openCardOnKeyboard(event, callback) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  callback()
}

export default function PrelevementPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const childReturnTo = buildLocationTarget(location)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(buildForm(null))
  const [quickEchantillonForm, setQuickEchantillonForm] = useState(buildQuickEchantillonForm(null))
  const [existingEchantillonUid, setExistingEchantillonUid] = useState('')

  const prelevementQuery = useQuery({
    queryKey: ['prelevement', uid],
    queryFn: () => prelevementsApi.get(uid),
  })

  useEffect(() => {
    if (prelevementQuery.data) {
      setForm(buildForm(prelevementQuery.data))
      setQuickEchantillonForm(buildQuickEchantillonForm(prelevementQuery.data))
      setExistingEchantillonUid('')
    }
  }, [prelevementQuery.data])

  const prelevement = prelevementQuery.data

  const availableEchantillonsQuery = useQuery({
    queryKey: ['echantillons-demande', String(prelevement?.demande_id || '')],
    queryFn: () => echantillonsApi.list({ demande_id: prelevement.demande_id }),
    enabled: !!prelevement?.demande_id,
  })

  const saveMutation = useMutation({
    mutationFn: () => prelevementsApi.update(uid, form),
    onSuccess: (saved) => {
      queryClient.setQueryData(['prelevement', uid], saved)
      queryClient.invalidateQueries({ queryKey: ['prelevements'] })
      queryClient.invalidateQueries({ queryKey: ['labo-home'] })
      setForm(buildForm(saved))
      setEditing(false)
    },
  })

  const statusOptions = useMemo(
    () => [...new Set([...DEFAULT_STATUSES, prelevement?.statut].filter(Boolean))],
    [prelevement?.statut]
  )
  const quickEchantillonLines = useMemo(
    () => parseDesignationLines(quickEchantillonForm.designation_lines),
    [quickEchantillonForm.designation_lines]
  )
  const linkedEchantillonIds = useMemo(
    () => new Set((prelevement?.echantillons || []).map((item) => String(item.uid))),
    [prelevement?.echantillons]
  )
  const availableDetachedEchantillons = useMemo(
    () => (Array.isArray(availableEchantillonsQuery.data) ? availableEchantillonsQuery.data : [])
      .filter((item) => !item.prelevement_id)
      .filter((item) => !linkedEchantillonIds.has(String(item.uid))),
    [availableEchantillonsQuery.data, linkedEchantillonIds]
  )
  const createButtonLabel = quickEchantillonLines.length
    ? `Créer ${quickEchantillonLines.length} groupe(s)`
    : 'Créer groupe(s)'

  async function refreshPrelevementWorkflow() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['prelevement', uid] }),
      queryClient.invalidateQueries({ queryKey: ['prelevements'] }),
      queryClient.invalidateQueries({ queryKey: ['labo-home'] }),
      queryClient.invalidateQueries({ queryKey: ['echantillons-demande', String(prelevement?.demande_id || '')] }),
    ])
  }

  const createEchantillonsMutation = useMutation({
    mutationFn: async ({ designations, openAfterCreate }) => {
      const created = []
      for (const designation of designations) {
        const saved = await echantillonsApi.create({
          demande_id: prelevement.demande_id,
          prelevement_id: prelevement.uid,
          designation,
          date_prelevement: extractIsoDate(prelevement.date_prelevement),
          localisation: quickEchantillonForm.localisation || prelevement.zone || '',
          statut: quickEchantillonForm.statut || DEFAULT_ECHANTILLON_STATUS,
        })
        created.push(saved)
      }
      return { created, openAfterCreate }
    },
    onSuccess: async ({ created, openAfterCreate }) => {
      setQuickEchantillonForm(buildQuickEchantillonForm(prelevement))
      await refreshPrelevementWorkflow()
      if (openAfterCreate && created.length === 1) {
        navigateWithReturnTo(navigate, `/echantillons/${created[0].uid}`, childReturnTo)
      }
    },
  })

  const linkExistingEchantillonMutation = useMutation({
    mutationFn: (targetUid) => echantillonsApi.update(targetUid, { prelevement_id: prelevement.uid }),
    onSuccess: async () => {
      setExistingEchantillonUid('')
      await refreshPrelevementWorkflow()
    },
  })

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setQuickEchantillonField(key, value) {
    setQuickEchantillonForm((current) => ({ ...current, [key]: value }))
  }

  function openDetailedEchantillonBuilder() {
    if (!prelevement?.demande_id) return
    const params = new URLSearchParams({
      demande_id: String(prelevement.demande_id),
      prelevement_id: String(prelevement.uid),
    })
    navigateWithReturnTo(navigate, `/echantillons/new?${params.toString()}`, childReturnTo)
  }

  function handleCreateEchantillons(openAfterCreate = false) {
    if (!prelevement?.demande_id || !quickEchantillonLines.length) return
    createEchantillonsMutation.mutate({
      designations: quickEchantillonLines,
      openAfterCreate,
    })
  }

  function handleLinkExistingEchantillon() {
    if (!existingEchantillonUid) return
    linkExistingEchantillonMutation.mutate(Number(existingEchantillonUid))
  }

  if (prelevementQuery.isLoading) {
    return <div className="py-12 text-center text-sm text-text-muted">Chargement du prélèvement…</div>
  }

  if (prelevementQuery.error || !prelevement) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
          Impossible de charger cette fiche prélèvement.
        </div>
        <div>
          <Button variant="secondary" onClick={() => navigate('/prelevements')}>Retour à la liste</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Fiche métier</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">{prelevement.reference}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
            Le prélèvement centralise la réception laboratoire et ouvre ensuite vers les groupes d’essais.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
            {prelevement.labo_code ? <span className="rounded-full border border-border bg-bg px-3 py-1">Labo {prelevement.labo_code}</span> : null}
            {prelevement.demande_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Demande {prelevement.demande_reference}</span> : null}
            {prelevement.intervention_reelle_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Intervention {prelevement.intervention_reelle_reference}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigateBackWithFallback(navigate, searchParams, '/prelevements')}>Retour</Button>
          {prelevement.demande_id ? (
            <Button variant="secondary" onClick={() => navigate(`/demandes/${prelevement.demande_id}`)}>Ouvrir la demande</Button>
          ) : null}
          <Button variant="secondary" onClick={() => navigate(`/prelevements/etiquettes?uids=${prelevement.uid}`)}>Étiquettes</Button>
          {editing ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(buildForm(prelevement))
                  setEditing(false)
                }}
              >
                Annuler
              </Button>
              <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '…' : 'Enregistrer'}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setEditing(true)}>Modifier</Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="bg-bg/60">
          <CardTitle>Réception et contexte</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {editing ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FieldGroup label="Date prélèvement">
                <Input type="date" value={form.date_prelevement} onChange={(event) => setField('date_prelevement', event.target.value)} />
              </FieldGroup>
              <FieldGroup label="Date réception labo">
                <Input type="date" value={form.date_reception_labo} onChange={(event) => setField('date_reception_labo', event.target.value)} />
              </FieldGroup>
              <FieldGroup label="Description d’arrivée">
                <Input value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="Ex: grave 0/31,5 humide" />
              </FieldGroup>
              <FieldGroup label="Quantité">
                <Input value={form.quantite} onChange={(event) => setField('quantite', event.target.value)} placeholder="Ex: 2 sacs, 15 kg, 3 carottes" />
              </FieldGroup>
              <FieldGroup label="Réceptionnaire">
                <Input value={form.receptionnaire} onChange={(event) => setField('receptionnaire', event.target.value)} placeholder="Nom du réceptionnaire labo" />
              </FieldGroup>
              <FieldGroup label="Statut">
                <Select value={form.statut} onChange={(event) => setField('statut', event.target.value)}>
                  {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </FieldGroup>
              <FieldGroup label="Zone">
                <Input value={form.zone} onChange={(event) => setField('zone', event.target.value)} />
              </FieldGroup>
              <FieldGroup label="Matériau">
                <Input value={form.materiau} onChange={(event) => setField('materiau', event.target.value)} />
              </FieldGroup>
              <FieldGroup label="Technicien terrain">
                <Input value={form.technicien} onChange={(event) => setField('technicien', event.target.value)} />
              </FieldGroup>
              <FieldGroup label="Finalité">
                <Input value={form.finalite} onChange={(event) => setField('finalite', event.target.value)} />
              </FieldGroup>
              <div className="lg:col-span-2">
                <FieldGroup label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={(event) => setField('notes', event.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
                  />
                </FieldGroup>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <FieldRow label="Date prélèvement" value={prelevement.date_prelevement ? formatDate(prelevement.date_prelevement) : ''} />
              <FieldRow label="Date réception labo" value={prelevement.date_reception_labo ? formatDate(prelevement.date_reception_labo) : (prelevement.last_reception_labo ? `${formatDate(prelevement.last_reception_labo)} (hérité)` : '')} />
              <FieldRow label="Statut" value={prelevement.statut} />
              <FieldRow label="Description" value={prelevement.description || prelevement.materiau} />
              <FieldRow label="Quantité" value={prelevement.quantite} />
              <FieldRow label="Réceptionnaire" value={prelevement.receptionnaire || prelevement.technicien} />
              <FieldRow label="Zone" value={prelevement.zone} />
              <FieldRow label="Matériau" value={prelevement.materiau} />
              <FieldRow label="Technicien terrain" value={prelevement.technicien} />
              <FieldRow label="Finalité" value={prelevement.finalite} />
              <FieldRow label="Affaire" value={prelevement.affaire_reference} />
              <FieldRow label="Chantier / site" value={[prelevement.chantier, prelevement.site].filter(Boolean).join(' · ')} />
              <FieldRow label="Notes" value={prelevement.notes} />
            </div>
          )}

          {saveMutation.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {saveMutation.error.message || 'Impossible d’enregistrer les modifications.'}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="bg-bg/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Groupes d’essais</CardTitle>
              <p className="mt-1 text-xs text-text-muted">
                Crée directement un ou plusieurs groupes d’essais, ou rattache un groupe déjà préparé sur la même demande.
              </p>
            </div>
            <Button variant="secondary" onClick={openDetailedEchantillonBuilder} disabled={!prelevement.demande_id}>
              Créer avec détails
            </Button>
          </div>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white px-4 py-4">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text">Créer des groupes d’essais</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Un groupe par ligne. Le lien vers ce prélèvement est renseigné automatiquement.
                </p>
              </div>

              <FieldGroup label="Groupes à créer">
                <textarea
                  value={quickEchantillonForm.designation_lines}
                  onChange={(event) => setQuickEchantillonField('designation_lines', event.target.value)}
                  rows={5}
                  placeholder={"Ex: Carotte couche de roulement\nSac grave 0/31,5\nLot enrobé poste 2"}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
                />
              </FieldGroup>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <FieldGroup label="Localisation initiale">
                  <Input
                    value={quickEchantillonForm.localisation}
                    onChange={(event) => setQuickEchantillonField('localisation', event.target.value)}
                    placeholder="Zone ou localisation du groupe"
                  />
                </FieldGroup>
                <FieldGroup label="Statut initial">
                  <Select value={quickEchantillonForm.statut} onChange={(event) => setQuickEchantillonField('statut', event.target.value)}>
                    {['Reçu', 'En attente', 'En cours', 'Terminé', 'Rejeté'].map((status) => <option key={status} value={status}>{status}</option>)}
                  </Select>
                </FieldGroup>
              </div>

              <div className="rounded-xl border border-[#e6ece8] bg-[#f8fbfa] px-3 py-3 text-xs text-text-muted">
                {quickEchantillonLines.length
                  ? `${quickEchantillonLines.length} groupe(s) prêt(s) à créer depuis ${prelevement.reference}.`
                  : 'Ajoute au moins une ligne pour créer un groupe d’essais lié à ce prélèvement.'}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleCreateEchantillons(false)}
                  disabled={!quickEchantillonLines.length || createEchantillonsMutation.isPending}
                >
                  {createEchantillonsMutation.isPending ? '…' : createButtonLabel}
                </Button>
                {quickEchantillonLines.length === 1 ? (
                  <Button
                    variant="primary"
                    onClick={() => handleCreateEchantillons(true)}
                    disabled={createEchantillonsMutation.isPending}
                  >
                    Créer et ouvrir
                  </Button>
                ) : null}
              </div>

              {createEchantillonsMutation.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {createEchantillonsMutation.error.message || 'Impossible de créer les groupes d’essais.'}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white px-4 py-4">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text">Rattacher un groupe existant</h3>
                <p className="mt-1 text-xs text-text-muted">
                  Sélectionne un groupe déjà créé sur la même demande et encore sans prélèvement rattaché.
                </p>
              </div>

              <FieldGroup label="Groupes disponibles">
                <Select
                  value={existingEchantillonUid}
                  onChange={(event) => setExistingEchantillonUid(event.target.value)}
                  disabled={availableEchantillonsQuery.isLoading || !availableDetachedEchantillons.length}
                >
                  <option value="">Choisir un groupe…</option>
                  {availableDetachedEchantillons.map((item) => (
                    <option key={item.uid} value={item.uid}>
                      {item.reference} — {item.designation || 'Sans désignation'}
                    </option>
                  ))}
                </Select>
              </FieldGroup>

              <div className="rounded-xl border border-[#e6ece8] bg-[#f8fbfa] px-3 py-3 text-xs text-text-muted">
                {availableEchantillonsQuery.isLoading
                  ? 'Chargement des groupes d’essais de la demande…'
                  : `${availableDetachedEchantillons.length} groupe(s) détaché(s) disponible(s) sur cette demande.`}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={handleLinkExistingEchantillon}
                  disabled={!existingEchantillonUid || linkExistingEchantillonMutation.isPending}
                >
                  {linkExistingEchantillonMutation.isPending ? '…' : 'Rattacher au prélèvement'}
                </Button>
                {existingEchantillonUid ? (
                  <Button variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/echantillons/${existingEchantillonUid}`, childReturnTo)}>
                    Ouvrir le groupe
                  </Button>
                ) : null}
              </div>

              {availableEchantillonsQuery.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  Impossible de charger les groupes d’essais de la demande.
                </div>
              ) : null}

              {linkExistingEchantillonMutation.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {linkExistingEchantillonMutation.error.message || 'Impossible de rattacher ce groupe d’essais.'}
                </div>
              ) : null}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="bg-bg/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Interventions liées</CardTitle>
              <p className="mt-1 text-xs text-text-muted">
                Ouvre l’intervention parent pour revenir au terrain ou poursuivre la descente dossier par dossier.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {prelevement.raw_interventions?.length ? prelevement.raw_interventions.map((item) => (
            <div
              key={item.uid}
              role="button"
              tabIndex={0}
              onClick={() => navigateWithReturnTo(navigate, `/interventions/${item.uid}`, childReturnTo)}
              onKeyDown={(event) => openCardOnKeyboard(event, () => navigateWithReturnTo(navigate, `/interventions/${item.uid}`, childReturnTo))}
              className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-4 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa] cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text">{item.reference}</p>
                <p className="mt-1 text-xs text-text-muted">{item.type_intervention || item.finalite || 'Intervention terrain'}</p>
                <p className="mt-2 text-[11px] text-text-muted">
                  {item.date_intervention ? `Intervention ${formatDate(item.date_intervention)}` : 'Sans date'}
                  {' · '}
                  {item.nature_reelle || 'Intervention'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="text-xs text-text-muted">{item.statut || '—'}</div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    navigateWithReturnTo(navigate, `/interventions/${item.uid}`, childReturnTo)
                  }}
                >
                  Ouvrir intervention
                </Button>
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">
              Aucune intervention brute n’est encore rattachée explicitement à ce prélèvement.
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="bg-bg/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Échantillons liés</CardTitle>
              <p className="mt-1 text-xs text-text-muted">
                {prelevement.echantillon_count} groupe(s) d’essais · {prelevement.essai_count} essai(s) rattaché(s). Ouvre un groupe pour poursuivre la suite labo.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {prelevement.echantillons?.length ? prelevement.echantillons.map((item) => (
            <div
              key={item.uid}
              role="button"
              tabIndex={0}
              onClick={() => navigateWithReturnTo(navigate, `/echantillons/${item.uid}`, childReturnTo)}
              onKeyDown={(event) => openCardOnKeyboard(event, () => navigateWithReturnTo(navigate, `/echantillons/${item.uid}`, childReturnTo))}
              className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-4 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa] cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text">{item.reference}</p>
                <p className="mt-1 text-xs text-text-muted">{item.designation || 'Groupe d’essais sans désignation'}</p>
                <p className="mt-2 text-[11px] text-text-muted">
                  {item.date_reception_labo ? `Réception ${formatDate(item.date_reception_labo)}` : item.date_prelevement ? `Prélèvement ${formatDate(item.date_prelevement)}` : 'Sans date'}
                  {' · '}
                  {item.essai_count} essai(s)
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="text-xs text-text-muted">{item.statut || '—'}</div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    navigateWithReturnTo(navigate, `/echantillons/${item.uid}`, childReturnTo)
                  }}
                >
                  Ouvrir groupe
                </Button>
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">
              Aucun échantillon n’est encore rattaché à ce prélèvement. La réception peut être préparée ici avant la création opérationnelle des groupes d’essais.
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
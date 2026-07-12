import { useEffect, useMemo, useState } from 'react'

import { Link } from 'react-router-dom'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import Modal from '@/components/ui/Modal'

import Button from '@/components/ui/Button'

import Input from '@/components/ui/Input'

import { adminApi } from '@/services/api'



function FG({ label, children, hint }) {

  return (

    <div className="flex flex-col gap-1">

      <label className="text-xs font-medium text-text-muted">{label}</label>

      {children}

      {hint ? <span className="text-[10px] text-text-muted leading-relaxed">{hint}</span> : null}

    </div>

  )

}



function buildForm(detail, codeOverride = '') {

  return {

    code: codeOverride || detail?.code || '',

    nom: detail?.name || '',

    region: detail?.region || '',

    agence_code: detail?.agence_code || '',

    address: detail?.address || '',

    report_header: detail?.report_header || '',

    lat: detail?.lat != null ? String(detail.lat) : '',

    lon: detail?.lon != null ? String(detail.lon) : '',

    is_active: detail?.is_active !== false,

    responsable_email: detail?.responsable_email || '',

    notes: detail?.notes || '',

  }

}



export default function LaboratoireGeoModal({ open, onClose, lab, onOpenUser }) {

  const qc = useQueryClient()

  const isCreate = Boolean(lab?.isNew)

  const originalCode = isCreate ? '' : String(lab?.code || '').trim().toUpperCase()

  const [form, setForm] = useState(() => buildForm(null))



  const { data: labsPayload } = useQuery({

    queryKey: ['admin-labs'],

    queryFn: () => adminApi.labs.list(),

    enabled: open,

  })

  const orgRegions = labsPayload?.org_regions ?? labsPayload?.rst_regions ?? []

  const agences = orgRegions.flatMap((region) => region.agences || [])



  const { data: detail, isLoading, error: loadError } = useQuery({

    queryKey: ['admin-lab-detail', originalCode],

    queryFn: () => adminApi.labs.get(originalCode),

    enabled: open && Boolean(originalCode) && !isCreate,

  })



  useEffect(() => {

    if (!open) return

    if (isCreate) {

      setForm(buildForm(null, ''))

      return

    }

    if (detail) setForm(buildForm(detail))

  }, [detail, open, isCreate])



  const saveMutation = useMutation({

    mutationFn: async (payload) => {

      if (isCreate) {

        return adminApi.labs.create(payload.createBody)

      }

      const body = { ...payload.updateBody }

      const nextCode = String(form.code || '').trim().toUpperCase()

      if (nextCode && nextCode !== originalCode) {

        body.new_code = nextCode

      }

      return adminApi.labs.update(originalCode, body)

    },

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ['admin-labs'] })

      qc.invalidateQueries({ queryKey: ['laboratoires-catalog'] })

      if (originalCode) qc.invalidateQueries({ queryKey: ['admin-lab-detail', originalCode] })

      onClose()

    },

  })



  const deleteMutation = useMutation({

    mutationFn: () => adminApi.labs.delete(originalCode),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ['admin-labs'] })

      qc.invalidateQueries({ queryKey: ['laboratoires-catalog'] })

      onClose()

    },

  })



  function set(key, value) {

    setForm((current) => ({ ...current, [key]: value }))

  }



  const codeChanged = useMemo(() => {

    const next = String(form.code || '').trim().toUpperCase()

    return Boolean(!isCreate && next && next !== originalCode)

  }, [form.code, isCreate, originalCode])



  function handleSave() {

    const code = String(form.code || '').trim().toUpperCase()

    const latText = String(form.lat || '').trim()

    const lonText = String(form.lon || '').trim()



    if (isCreate) {

      if (!code || !form.nom.trim() || !form.region || !form.agence_code) return

      const createBody = {

        code,

        nom: String(form.nom || '').trim(),

        region: String(form.region || '').trim(),

        agence_code: String(form.agence_code || '').trim(),

        address: String(form.address || '').trim(),

        report_header: String(form.report_header || '').trim(),

        is_active: Boolean(form.is_active),

      }

      saveMutation.mutate({ createBody })

      return

    }



    const updateBody = {

      nom: String(form.nom || '').trim(),

      region: String(form.region || '').trim(),

      agence_code: String(form.agence_code || '').trim(),

      address: String(form.address || '').trim(),

      report_header: String(form.report_header || '').trim(),

      is_active: Boolean(form.is_active),

      responsable_email: String(form.responsable_email || '').trim() || null,

      notes: String(form.notes || '').trim(),

    }

    if (latText) updateBody.lat = Number(latText.replace(',', '.'))

    else updateBody.lat = null

    if (lonText) updateBody.lon = Number(lonText.replace(',', '.'))

    else updateBody.lon = null

    saveMutation.mutate({ updateBody })

  }



  if (!lab) return null



  const staff = detail?.staff || []

  const equipment = detail?.equipment || {}

  const responsableOptions = staff.filter((person) => person.is_active)

  const canSave = isCreate

    ? Boolean(form.code.trim() && form.nom.trim() && form.region && form.agence_code)

    : Boolean(form.nom.trim())



  return (

    <Modal

      open={open}

      onClose={onClose}

      title={isCreate ? 'Nouveau laboratoire' : `Laboratoire ${originalCode}`}

      size="xl"

    >

      <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">

        <div className="rounded-xl border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[12px] leading-relaxed text-[#334155]">

          Référentiel central : code, nom, rattachement orga, localisation et en-têtes de rapports.

          Le reste de l&apos;application lit ces données — rien n&apos;est codé en dur côté pages métier.

        </div>



        {isLoading && !isCreate ? (

          <p className="text-xs text-text-muted py-6 text-center">Chargement de la fiche…</p>

        ) : null}



        {loadError && !isCreate ? (

          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">

            {loadError.message}

          </p>

        ) : null}



        {(isCreate || detail) ? (

          <>

            {!isCreate ? (

              <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                <div className="rounded-lg border border-border bg-bg px-3 py-2">

                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Équipe active</div>

                  <div className="text-lg font-semibold">{detail?.staff_active_count ?? 0}</div>

                </div>

                <div className="rounded-lg border border-border bg-bg px-3 py-2">

                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Équipements</div>

                  <div className="text-lg font-semibold">

                    {equipment.linked ? equipment.total ?? 0 : '—'}

                  </div>

                  {equipment.linked ? (

                    <div className="text-[10px] text-text-muted">

                      {equipment.active ?? 0} en service · {equipment.hs ?? 0} HS

                    </div>

                  ) : (

                    <div className="text-[10px] text-text-muted">Colonne labo_code prête</div>

                  )}

                </div>

                <div className="rounded-lg border border-border bg-bg px-3 py-2">

                  <div className="text-[10px] uppercase tracking-wide text-text-muted">Périmètre dashboard</div>

                  <div className="text-[11px] leading-relaxed text-[#334155] mt-1">

                    Données du labo + demandes partagées (ex. essais)

                  </div>

                </div>

              </section>

            ) : null}



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <FG label="Code" hint={isCreate ? 'Ex. SP, PDC, SVV — 2 à 12 caractères.' : 'Modifier le code met à jour les références liées (demandes, utilisateurs, équipements…).'}>

                <Input

                  value={form.code}

                  onChange={(e) => set('code', e.target.value.toUpperCase())}

                  placeholder="SVV"

                  readOnly={false}

                />

              </FG>

              <FG label="Région">

                <select

                  value={form.region}

                  onChange={(e) => set('region', e.target.value)}

                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge"

                >

                  <option value="">— Non définie —</option>

                  {orgRegions.map((region) => (

                    <option key={region.code} value={region.code}>{region.code} — {region.label}</option>

                  ))}

                </select>

              </FG>

              <FG label="Agence" hint="Agence rattachée (référentiel orga).">

                <select

                  value={form.agence_code}

                  onChange={(e) => set('agence_code', e.target.value)}

                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge"

                >

                  <option value="">— Non définie —</option>

                  {agences.map((agence) => (

                    <option key={agence.code} value={agence.code}>{agence.code} — {agence.label}</option>

                  ))}

                </select>

              </FG>

              <FG label="Nom affiché" hint="Nom du laboratoire tel qu’affiché dans l’application.">

                <Input value={form.nom} onChange={(e) => set('nom', e.target.value)} />

              </FG>

              <FG label="Statut">

                <select

                  value={String(form.is_active)}

                  onChange={(e) => set('is_active', e.target.value === 'true')}

                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge"

                >

                  <option value="true">Actif</option>

                  <option value="false">Inactif</option>

                </select>

              </FG>

            </div>



            {codeChanged ? (

              <p className="text-[11px] text-[#854f0b] bg-[#fbf1e2] border border-[#ecd1a2] rounded-lg px-3 py-2">

                Le code passera de <strong>{originalCode}</strong> à <strong>{String(form.code || '').trim().toUpperCase()}</strong> dans le référentiel et les tables liées.

              </p>

            ) : null}



            <FG label="Adresse postale complète">

              <textarea

                value={form.address}

                onChange={(e) => set('address', e.target.value)}

                rows={2}

                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge font-normal"

              />

            </FG>



            <FG label="En-tête rapports" hint="Texte utilisé dans SC, CFE, MVA, etc.">

              <textarea

                value={form.report_header}

                onChange={(e) => set('report_header', e.target.value)}

                rows={2}

                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge font-normal"

              />

            </FG>



            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <FG label="Latitude" hint="Décimal, ex. 45.6969">

                <Input value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="45.6969" />

              </FG>

              <FG label="Longitude" hint="Décimal, ex. 4.9422">

                <Input value={form.lon} onChange={(e) => set('lon', e.target.value)} placeholder="4.9422" />

              </FG>

            </div>



            {!isCreate && detail?.coords_updated_at ? (

              <div className="text-[11px] text-text-muted">

                Dernière mise à jour coords : {detail.coords_updated_at}

              </div>

            ) : null}



            {!isCreate ? (

              <>

                <FG

                  label="Responsable du laboratoire"

                  hint="Choisi parmi le personnel rattaché (service_code = code labo). Gérer les affectations dans l'onglet Utilisateurs."

                >

                  <select

                    value={form.responsable_email}

                    onChange={(e) => set('responsable_email', e.target.value)}

                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge"

                  >

                    <option value="">— Non défini —</option>

                    {responsableOptions.map((person) => (

                      <option key={person.email} value={person.email}>

                        {person.display_name || person.email} ({person.role_code})

                      </option>

                    ))}

                  </select>

                </FG>



                <FG label="Notes internes">

                  <textarea

                    value={form.notes}

                    onChange={(e) => set('notes', e.target.value)}

                    rows={2}

                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge font-normal"

                    placeholder="Horaires, particularités, contacts locaux…"

                  />

                </FG>



                <section>

                  <div className="flex items-center justify-between gap-2 mb-2">

                    <h3 className="text-sm font-semibold">Personnel rattaché</h3>

                    <Link

                      to="/admin"

                      className="text-[11px] text-nge hover:underline"

                      onClick={() => onClose()}

                    >

                      Gérer dans Utilisateurs →

                    </Link>

                  </div>

                  {staff.length === 0 ? (

                    <p className="text-xs text-text-muted border border-dashed border-border rounded-lg px-3 py-4 text-center">

                      Aucun utilisateur avec <code>service_code = {originalCode}</code>.

                      Affectez le labo dans le profil utilisateur.

                    </p>

                  ) : (

                    <div className="border border-border rounded-lg overflow-hidden">

                      <table className="w-full text-xs">

                        <thead>

                          <tr className="bg-bg text-text-muted">

                            <th className="text-left px-3 py-2 font-medium">Nom</th>

                            <th className="text-left px-3 py-2 font-medium">Rôle</th>

                            <th className="text-left px-3 py-2 font-medium">Niveau</th>

                            <th className="text-left px-3 py-2 font-medium">Statut</th>

                            <th className="px-3 py-2" />

                          </tr>

                        </thead>

                        <tbody>

                          {staff.map((person) => (

                            <tr key={person.email} className="border-t border-border">

                              <td className="px-3 py-2">{person.display_name || person.email}</td>

                              <td className="px-3 py-2">{person.role_code}</td>

                              <td className="px-3 py-2">{person.employment_level_label || '—'}</td>

                              <td className="px-3 py-2">

                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${

                                  person.is_active ? 'bg-[#eaf3de] text-[#3b6d11]' : 'bg-[#f1efe8] text-[#5f5e5a]'

                                }`}>

                                  {person.is_active ? 'Actif' : 'Inactif'}

                                </span>

                              </td>

                              <td className="px-3 py-2 text-right">

                                {onOpenUser ? (

                                  <Button

                                    size="sm"

                                    variant="secondary"

                                    onClick={() => {

                                      onOpenUser(person.email)

                                      onClose()

                                    }}

                                  >

                                    Profil

                                  </Button>

                                ) : null}

                              </td>

                            </tr>

                          ))}

                        </tbody>

                      </table>

                    </div>

                  )}

                </section>



                <section className="rounded-lg border border-border bg-bg px-3 py-3">

                  <h3 className="text-sm font-semibold mb-1">Équipements</h3>

                  <p className="text-[11px] text-text-muted leading-relaxed">

                    {equipment.linked

                      ? `${equipment.total ?? 0} équipement(s) avec labo_code = ${originalCode}.`

                      : 'La colonne labo_code est disponible ; assignez les équipements depuis Qualité.'}

                    {equipment.unassigned_total > 0 ? (

                      <span> {equipment.unassigned_total} équipement(s) sans labo assigné au total.</span>

                    ) : null}

                  </p>

                  <Link

                    to={`/qualite?tab=equipment&labo=${encodeURIComponent(originalCode)}`}

                    className="inline-block mt-2 text-[11px] text-nge hover:underline"

                    onClick={() => onClose()}

                  >

                    Ouvrir Qualité → Équipements

                  </Link>

                </section>

              </>

            ) : null}

          </>

        ) : null}



        {saveMutation.error ? (

          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">

            {saveMutation.error.message}

          </p>

        ) : null}

        {deleteMutation.error ? (

          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">

            {deleteMutation.error.message}

          </p>

        ) : null}



        <div className="flex justify-between gap-2 pt-2 sticky bottom-0 bg-surface">

          {!isCreate ? (

            <Button

              onClick={() => {

                if (!window.confirm(`Supprimer définitivement le laboratoire ${originalCode} ?`)) return

                deleteMutation.mutate()

              }}

              variant="danger"

              disabled={deleteMutation.isPending || saveMutation.isPending}

            >

              {deleteMutation.isPending ? 'Suppression…' : 'Supprimer'}

            </Button>

          ) : <span />}

          <div className="flex justify-end gap-2">

          <Button onClick={onClose} variant="secondary">Annuler</Button>

          <Button onClick={handleSave} variant="primary" disabled={saveMutation.isPending || !canSave || (isLoading && !isCreate)}>

            {saveMutation.isPending ? 'Enregistrement…' : isCreate ? 'Créer' : 'Enregistrer'}

          </Button>

          </div>

        </div>

      </div>

    </Modal>

  )

}



/**
 * Annuaire contacts — page globale accessible depuis le menu principal.
 * Filtre optionnel ?affaire_id= pour limiter à un dossier.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { affairesApi, contactsApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import {
  AffaireHero,
  EmptyStateBox,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  MetricCard,
  SectionCard,
} from '@/components/layout/FicheLayout'
import {
  AFFAIRE_CONTACT_ROLE_OPTIONS,
  buildAffaireContactDisplayLabel,
} from '@/lib/affaireContacts'

const EMPTY_FORM = {
  affaire_id: '',
  full_name: '',
  role_label: 'Contact chantier / accès',
  organisation: '',
  phone: '',
  email: '',
  notes: '',
}

const SYNC_SOURCE_LABELS = {
  affaires: 'affaires',
  demandes: 'demandes',
  demande_preparations: 'préparations',
  campagnes: 'campagnes',
  passations: 'passations',
  passation_participants: 'participants passation',
  passation_roles: 'rôles passation',
  passation_actions: 'actions passation',
  passation_startup: 'démarrage passation',
  interventions: 'interventions',
}

function buildSyncRefreshMessage(result) {
  const scanned = result?.scanned ?? 0
  const synced = result?.synced ?? 0
  const parts = Object.entries(result?.sources || {})
    .filter(([, stats]) => (stats?.synced ?? 0) > 0)
    .map(([key, stats]) => `${stats.synced} ${SYNC_SOURCE_LABELS[key] || key}`)
  if (synced > 0) {
    const detail = parts.length ? ` (${parts.join(', ')})` : ''
    return `${scanned} entrée(s) analysée(s) · ${synced} contact(s) synchronisé(s)${detail}`
  }
  return `${scanned} entrée(s) analysée(s) · aucun contact importé`
}

function ContactFormFields({ draft, onChange, showAffaireSelect = false, affaires = [] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {showAffaireSelect ? (
        <Select
          value={draft.affaire_id}
          onChange={(event) => onChange({ ...draft, affaire_id: event.target.value })}
        >
          <option value="">Affaire RST *</option>
          {affaires.map((item) => (
            <option key={item.uid} value={String(item.uid)}>
              {item.reference} — {item.chantier || item.client || 'Sans chantier'}
            </option>
          ))}
        </Select>
      ) : null}
      <Input
        value={draft.full_name}
        onChange={(event) => onChange({ ...draft, full_name: event.target.value })}
        placeholder="Nom *"
      />
      <Select
        value={draft.role_label}
        onChange={(event) => onChange({ ...draft, role_label: event.target.value })}
      >
        {AFFAIRE_CONTACT_ROLE_OPTIONS.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </Select>
      <Input
        value={draft.organisation}
        onChange={(event) => onChange({ ...draft, organisation: event.target.value })}
        placeholder="Entreprise / organisation"
      />
      <Input
        value={draft.phone}
        onChange={(event) => onChange({ ...draft, phone: event.target.value })}
        placeholder="Téléphone"
      />
      <Input
        value={draft.email}
        onChange={(event) => onChange({ ...draft, email: event.target.value })}
        placeholder="Email"
      />
      <Input
        value={draft.notes}
        onChange={(event) => onChange({ ...draft, notes: event.target.value })}
        placeholder="Horaires, consignes…"
      />
    </div>
  )
}

export default function ContactsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()

  const affaireFilterId = searchParams.get('affaire_id') || ''

  const [query, setQuery] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState({ ...EMPTY_FORM, affaire_id: affaireFilterId })
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(EMPTY_FORM)
  const [editingAffaireUid, setEditingAffaireUid] = useState('')
  const [refreshMessage, setRefreshMessage] = useState('')

  const { data: affaires = [] } = useQuery({
    queryKey: ['affaires-list-contacts'],
    queryFn: () => affairesApi.list(),
  })

  const { data: filteredAffaire } = useQuery({
    queryKey: ['affaire', affaireFilterId],
    queryFn: () => affairesApi.get(affaireFilterId),
    enabled: Boolean(affaireFilterId),
  })

  const listParams = useMemo(() => {
    const params = {}
    if (query.trim()) params.q = query.trim()
    if (organisation) params.organisation = organisation
    if (roleLabel) params.role_label = roleLabel
    if (affaireFilterId) params.affaire_id = affaireFilterId
    return params
  }, [query, organisation, roleLabel, affaireFilterId])

  const orgParams = useMemo(() => {
    const params = {}
    if (affaireFilterId) params.affaire_id = affaireFilterId
    return params
  }, [affaireFilterId])

  const { data: contacts = [], isLoading: contactsLoading, isFetching: contactsFetching, refetch } = useQuery({
    queryKey: ['contacts-page', listParams],
    queryFn: () => contactsApi.list(listParams),
  })

  const { data: organisations = [] } = useQuery({
    queryKey: ['contacts-organisations', orgParams],
    queryFn: () => contactsApi.listOrganisations(orgParams),
  })

  const roleOptions = useMemo(() => {
    const fromData = contacts.map((item) => item.role_label).filter(Boolean)
    return [...new Set([...AFFAIRE_CONTACT_ROLE_OPTIONS, ...fromData])]
  }, [contacts])

  const stats = useMemo(() => {
    const orgSet = new Set(contacts.map((item) => item.organisation).filter(Boolean))
    const totalUses = contacts.reduce((sum, item) => sum + (item.use_count || 0), 0)
    return {
      total: contacts.length,
      organisations: orgSet.size,
      totalUses,
    }
  }, [contacts])

  function setAffaireFilter(nextId) {
    const next = new URLSearchParams(searchParams)
    if (nextId) next.set('affaire_id', nextId)
    else next.delete('affaire_id')
    setSearchParams(next, { replace: true })
    setCreateDraft((current) => ({ ...current, affaire_id: nextId || '' }))
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts-page'] })
    qc.invalidateQueries({ queryKey: ['contacts-organisations'] })
    qc.invalidateQueries({ queryKey: ['affaire-contacts'] })
    qc.invalidateQueries({ queryKey: ['affaire-contact-organisations'] })
  }

  const syncMutation = useMutation({
    mutationFn: () => {
      const params = {}
      if (affaireFilterId) params.affaire_id = affaireFilterId
      return contactsApi.sync(params)
    },
  })

  const isRefreshing = syncMutation.isPending || contactsFetching

  async function handleRefresh() {
    setRefreshMessage('')
    try {
      const result = await syncMutation.mutateAsync()
      await Promise.all([
        refetch(),
        qc.invalidateQueries({ queryKey: ['contacts-organisations'] }),
      ])
      setRefreshMessage(buildSyncRefreshMessage(result))
    } catch (error) {
      setRefreshMessage(error?.message || 'Erreur lors de l\'actualisation.')
    }
  }

  const createMutation = useMutation({
    mutationFn: ({ affaireUid, payload }) => affairesApi.createContact(affaireUid, payload),
    onSuccess: () => {
      invalidate()
      setCreateDraft({ ...EMPTY_FORM, affaire_id: affaireFilterId })
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ affaireUid, contactId, payload }) => affairesApi.updateContact(affaireUid, contactId, payload),
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      setEditingAffaireUid('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: ({ affaireUid, contactId }) => affairesApi.deleteContact(affaireUid, contactId),
    onSuccess: invalidate,
  })

  function startEdit(contact) {
    setEditingId(contact.id)
    setEditingAffaireUid(String(contact.affaire_uid || ''))
    setEditDraft({
      affaire_id: String(contact.affaire_uid || ''),
      full_name: contact.full_name || '',
      role_label: contact.role_label || 'Contact chantier / accès',
      organisation: contact.organisation || '',
      phone: contact.phone || '',
      email: contact.email || '',
      notes: contact.notes || '',
    })
  }

  function handleCreate() {
    const affaireUid = createDraft.affaire_id || affaireFilterId
    if (!affaireUid) {
      window.alert('Sélectionnez une affaire RST.')
      return
    }
    if (!createDraft.full_name.trim()) {
      window.alert('Le nom est obligatoire.')
      return
    }
    const { affaire_id: _ignored, ...payload } = createDraft
    createMutation.mutate({
      affaireUid,
      payload: {
        ...payload,
        display_label: buildAffaireContactDisplayLabel(payload),
        source_type: 'manual',
      },
    })
  }

  function handleUpdate() {
    if (!editDraft.full_name.trim()) {
      window.alert('Le nom est obligatoire.')
      return
    }
    const { affaire_id: _ignored, ...payload } = editDraft
    updateMutation.mutate({
      affaireUid: editingAffaireUid,
      contactId: editingId,
      payload: {
        ...payload,
        display_label: buildAffaireContactDisplayLabel(payload),
      },
    })
  }

  function handleDelete(contact) {
    const label = contact.full_name || contact.display_label || `Contact #${contact.id}`
    if (!window.confirm(`Supprimer « ${label} » de l'annuaire ?`)) return
    deleteMutation.mutate({
      affaireUid: contact.affaire_uid,
      contactId: contact.id,
    })
  }

  const pageTitle = filteredAffaire?.reference || 'Annuaire contacts'
  const pageSubtitle = filteredAffaire
    ? (filteredAffaire.chantier || 'Contacts du dossier')
    : 'Tous les dossiers RST'

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel={affaireFilterId ? '← Fiche affaire' : '← Affaires RST'}
        onBack={() => navigate(affaireFilterId ? `/affaires/${affaireFilterId}` : '/affaires')}
        eyebrow="RaLab 5 · Annuaire contacts"
        title={pageTitle}
        subtitle={pageSubtitle}
      >
        <Button size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Actualisation…' : 'Actualiser'}
          </span>
        </Button>
        {refreshMessage ? (
          <span className="text-[11px] font-bold text-text-muted max-w-[280px] leading-snug">
            {refreshMessage}
          </span>
        ) : null}
        <Button size="sm" variant="primary" onClick={() => setCreateOpen((current) => !current)}>
          {createOpen ? 'Masquer formulaire' : '+ Nouveau contact'}
        </Button>
      </FicheTopbar>

      <FicheMain>
        {filteredAffaire ? (
          <AffaireHero affaire={filteredAffaire} badgeLabel="RaLab 5 · Contacts dossier" />
        ) : (
          <section
            className="overflow-hidden rounded-[26px] border border-border bg-white px-[30px] py-7"
            style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
          >
            <div className="text-[11px] font-black tracking-[.12em] uppercase text-text-muted">
              RaLab 5 · Annuaire contacts
            </div>
            <h1 className="mt-2 text-[28px] font-black text-nge m-0">Contacts chantier et dossier</h1>
            <p className="mt-2 text-[14px] text-text-muted max-w-[720px] leading-6">
              Recherche globale par nom, fonction, entreprise ou affaire. Actualiser importe uniquement les nouveaux contacts depuis les affaires, demandes, préparations, campagnes, passations et interventions — sans modifier ceux déjà présents.
            </p>
          </section>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricCard label="Contacts" value={stats.total} detail="annuaire unique" />
          <MetricCard label="Entreprises" value={stats.organisations} detail="dans la sélection" />
          <MetricCard label="Utilisations" value={stats.totalUses} detail="cumul terrain" />
        </div>

        {createOpen ? (
          <SectionCard title="Nouveau contact" subtitle="Ajout manuel à l'annuaire">
            <ContactFormFields
              draft={createDraft}
              onChange={setCreateDraft}
              showAffaireSelect={!affaireFilterId}
              affaires={affaires}
            />
            <div className="mt-3 rounded-[10px] border border-dashed border-[#cbd5e1] px-3 py-2 text-[11px] text-[#475569]">
              Aperçu FMT : {buildAffaireContactDisplayLabel(createDraft) || '—'}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="primary" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setCreateOpen(false)
                  setCreateDraft({ ...EMPTY_FORM, affaire_id: affaireFilterId })
                }}
              >
                Annuler
              </Button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Contacts"
          subtitle="Annuaire unique — nom, fonction, entreprise, téléphone, email"
          actions={(
            <span className={`text-[11px] font-bold ${isRefreshing ? 'text-nge' : 'text-text-muted'}`}>
              {isRefreshing
                ? 'Actualisation en cours…'
                : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`}
            </span>
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher…"
            />
            <Select value={affaireFilterId} onChange={(event) => setAffaireFilter(event.target.value)}>
              <option value="">Toutes les affaires</option>
              {affaires.map((item) => (
                <option key={item.uid} value={String(item.uid)}>
                  {item.reference} — {item.chantier || item.client || 'Sans chantier'}
                </option>
              ))}
            </Select>
            <Select value={organisation} onChange={(event) => setOrganisation(event.target.value)}>
              <option value="">Toutes les entreprises</option>
              {organisations.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <Select value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)}>
              <option value="">Toutes les fonctions</option>
              {roleOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </div>

          {contactsLoading && !contacts.length ? (
            <div className="text-[13px] text-text-muted py-8 text-center">Chargement des contacts…</div>
          ) : contacts.length ? (
            <div className={`overflow-x-auto rounded-[14px] border border-[#e4e9f1] ${isRefreshing ? 'opacity-60 pointer-events-none' : ''}`}>
              <table className="w-full min-w-[760px] text-left border-collapse">
                <thead className="bg-[#f1f5f9] text-[10px] font-black uppercase tracking-[.06em] text-text-muted">
                  <tr>
                    <th className="px-3 py-2">Nom</th>
                    <th className="px-3 py-2">Fonction</th>
                    <th className="px-3 py-2">Entreprise</th>
                    <th className="px-3 py-2">Agence</th>
                    <th className="px-3 py-2">Tél.</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Notes</th>
                    <th className="px-3 py-2 w-[140px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    editingId === contact.id ? (
                      <tr key={contact.id} className="border-t border-[#e4e9f1] bg-[#fffdf2]">
                        <td colSpan={8} className="px-3 py-3">
                          <ContactFormFields draft={editDraft} onChange={setEditDraft} />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="primary" onClick={handleUpdate} disabled={updateMutation.isPending}>
                              {updateMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
                            </Button>
                            <Button size="sm" onClick={() => setEditingId(null)}>Annuler</Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={contact.id} className="border-t border-[#e4e9f1] bg-white hover:bg-[#f8fafc]">
                        <td className="px-3 py-2 text-[13px] font-bold text-[#172033]">{contact.full_name || '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-[#475569]">{contact.role_label || '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-[#475569]">{contact.organisation || '—'}</td>
                        <td
                          className="px-3 py-2 text-[12px] font-semibold text-nge whitespace-nowrap"
                          title={[contact.region_label, contact.agence_label].filter(Boolean).join(' · ')}
                        >
                          {contact.region_code || 'ARS'} · {contact.agence_code || 'RA'}
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[#475569] whitespace-nowrap">{contact.phone || '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-[#475569]">{contact.email || '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-[#475569] max-w-[220px] truncate" title={contact.notes || ''}>
                          {contact.notes || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-nge hover:bg-bg"
                              onClick={() => startEdit(contact)}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-[#f0a0a0] px-2 py-1 text-[11px] font-bold text-[#a32d2d] hover:bg-[#fcebeb]"
                              onClick={() => handleDelete(contact)}
                              disabled={deleteMutation.isPending}
                            >
                              Suppr.
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyStateBox
              icon="📇"
              title="Aucun contact pour cette sélection"
              description="Les contacts saisis sur les interventions ou ajoutés manuellement apparaîtront ici."
              action={(
                <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                  + Nouveau contact
                </Button>
              )}
            />
          )}
        </SectionCard>
      </FicheMain>
    </FichePageShell>
  )
}

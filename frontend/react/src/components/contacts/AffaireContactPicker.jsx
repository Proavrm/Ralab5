import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Input, { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { affairesApi } from '@/services/api'
import {
  AFFAIRE_CONTACT_ROLE_OPTIONS,
  buildAffaireContactDisplayLabel,
  contactPickerPayloadFromContact,
  contactPickerPayloadFromDraft,
} from '@/lib/affaireContacts'

const EMPTY_DRAFT = {
  full_name: '',
  role_label: 'Contact chantier / accès',
  organisation: '',
  phone: '',
  email: '',
  notes: '',
}

export default function AffaireContactPicker({
  affaireUid,
  value = '',
  onChange,
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [showDraft, setShowDraft] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  const enabled = Boolean(affaireUid) && !disabled

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['affaire-contacts', affaireUid, query, organisation],
    queryFn: () => affairesApi.listContacts(affaireUid, { q: query, organisation }),
    enabled,
    staleTime: 30_000,
  })

  const { data: organisations = [] } = useQuery({
    queryKey: ['affaire-contact-organisations', affaireUid],
    queryFn: () => affairesApi.listContactOrganisations(affaireUid),
    enabled,
    staleTime: 60_000,
  })

  const previewLabel = useMemo(
    () => buildAffaireContactDisplayLabel({ ...draft, fallbackText: value }),
    [draft, value],
  )

  function applyContact(contact) {
    onChange?.(contactPickerPayloadFromContact(contact))
    setShowDraft(false)
  }

  function applyDraft() {
    onChange?.(contactPickerPayloadFromDraft(draft))
    setShowDraft(false)
  }

  function applyFreeText(nextValue) {
    onChange?.({
      prep_contact_id: '',
      prep_contact_chantier: nextValue,
      prep_contact_name: '',
      prep_contact_role: '',
      prep_contact_organisation: '',
      prep_contact_phone: '',
      prep_contact_email: '',
      prep_contact_notes: '',
    })
  }

  if (!enabled) {
    return (
      <Input
        value={value}
        onChange={(event) => applyFreeText(event.target.value)}
        placeholder="Nom, téléphone, horaires — repris sur la feuille mission terrain"
        disabled={disabled}
      />
    )
  }

  return (
    <div className="space-y-2">
      <Input
        value={value}
        onChange={(event) => applyFreeText(event.target.value)}
        placeholder="Nom, téléphone, horaires — repris sur la feuille mission terrain"
        disabled={disabled}
      />

      <div className="rounded-[12px] border border-[#dbe1ea] bg-[#fbfcfe] p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-black uppercase tracking-[.08em] text-[#69758a]">
            Annuaire contacts dossier
          </div>
          <Link
            to={`/contacts?affaire_id=${encodeURIComponent(affaireUid)}`}
            className="text-[11px] font-bold text-[#003170] hover:underline"
          >
            Gérer l'annuaire →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher nom, fonction, entreprise, tel…"
          />
          <Select value={organisation} onChange={(event) => setOrganisation(event.target.value)}>
            <option value="">Toutes les entreprises</option>
            {organisations.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <div className="text-[12px] text-[#69758a]">Chargement des contacts…</div>
        ) : contacts.length ? (
          <div className="max-h-52 overflow-auto rounded-[10px] border border-[#e4e9f1]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#f1f5f9] text-[10px] font-black uppercase tracking-[.06em] text-[#69758a]">
                <tr>
                  <th className="px-2 py-1.5 font-black">Nom</th>
                  <th className="px-2 py-1.5 font-black">Fonction</th>
                  <th className="px-2 py-1.5 font-black">Entreprise</th>
                  <th className="px-2 py-1.5 font-black">Tél.</th>
                  <th className="px-2 py-1.5 font-black">Email</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="border-t border-[#e4e9f1] bg-white hover:bg-[#f8fafc] cursor-pointer"
                    onClick={() => applyContact(contact)}
                  >
                    <td className="px-2 py-1.5 text-[12px] font-bold text-[#172033]">
                      {contact.full_name || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-[#475569]">
                      {contact.role_label || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-[#475569]">
                      {contact.organisation || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-[#475569] whitespace-nowrap">
                      {contact.phone || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-[#475569] truncate max-w-[140px]">
                      {contact.email || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[12px] text-[#69758a] italic">
            Aucun contact enregistré pour cette affaire — saisie libre ou nouveau contact ci-dessous.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" type="button" onClick={() => setShowDraft((current) => !current)}>
            {showDraft ? 'Masquer formulaire' : 'Nouveau contact structuré'}
          </Button>
        </div>

        {showDraft ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <Input
              value={draft.full_name}
              onChange={(event) => setDraft((current) => ({ ...current, full_name: event.target.value }))}
              placeholder="Nom"
            />
            <Select
              value={draft.role_label}
              onChange={(event) => setDraft((current) => ({ ...current, role_label: event.target.value }))}
            >
              {AFFAIRE_CONTACT_ROLE_OPTIONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
            <Input
              value={draft.organisation}
              onChange={(event) => setDraft((current) => ({ ...current, organisation: event.target.value }))}
              placeholder="Entreprise / organisation"
            />
            <Input
              value={draft.phone}
              onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Téléphone"
            />
            <Input
              value={draft.email}
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
            />
            <Input
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Horaires, consignes…"
            />
            <div className="sm:col-span-2 rounded-[10px] border border-dashed border-[#cbd5e1] px-3 py-2 text-[11px] text-[#475569]">
              Aperçu FMT : {previewLabel || '—'}
            </div>
            <div className="sm:col-span-2">
              <Button size="sm" type="button" onClick={applyDraft}>
                Utiliser ce contact
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

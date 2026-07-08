export const AFFAIRE_CONTACT_ROLE_OPTIONS = [
  'Contact chantier / accès',
  'MOE',
  'MOA',
  'Entreprise',
  'Exploitation',
  'Conducteur de travaux',
  'Demandeur',
  'MO / MOE',
  'Autre',
]

export function buildAffaireContactDisplayLabel({
  full_name: fullName = '',
  role_label: roleLabel = '',
  organisation = '',
  phone = '',
  email = '',
  notes = '',
  fallbackText = '',
} = {}) {
  const clean = (value) => String(value || '').trim()
  const identity = [clean(fullName), clean(roleLabel), clean(organisation)].filter(Boolean).join(' — ')
  const details = [clean(phone), clean(email), clean(notes)].filter(Boolean).join(', ')
  if (identity && details) return `${identity} (${details})`
  if (identity) return identity
  if (details) return details
  return clean(fallbackText)
}

export function contactPickerPayloadFromContact(contact) {
  if (!contact) {
    return {
      prep_contact_id: '',
      prep_contact_chantier: '',
      prep_contact_name: '',
      prep_contact_role: '',
      prep_contact_organisation: '',
      prep_contact_phone: '',
      prep_contact_email: '',
      prep_contact_notes: '',
    }
  }
  const displayLabel = contact.display_label || buildAffaireContactDisplayLabel(contact)
  return {
    prep_contact_id: contact.id ? String(contact.id) : '',
    prep_contact_chantier: displayLabel,
    prep_contact_name: contact.full_name || '',
    prep_contact_role: contact.role_label || '',
    prep_contact_organisation: contact.organisation || '',
    prep_contact_phone: contact.phone || '',
    prep_contact_email: contact.email || '',
    prep_contact_notes: contact.notes || '',
  }
}

export function contactPickerPayloadFromDraft(draft) {
  const displayLabel = buildAffaireContactDisplayLabel(draft)
  return {
    prep_contact_id: '',
    prep_contact_chantier: displayLabel,
    prep_contact_name: draft.full_name || '',
    prep_contact_role: draft.role_label || '',
    prep_contact_organisation: draft.organisation || '',
    prep_contact_phone: draft.phone || '',
    prep_contact_email: draft.email || '',
    prep_contact_notes: draft.notes || '',
  }
}

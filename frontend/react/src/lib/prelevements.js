function text(value) {
  return String(value || '').trim()
}

export function normalizePrelevement(row, index = 0) {
  const storedReceptionDate = text(row.date_reception_labo)
  const linkedReceptionDate = text(row.last_reception_labo)
  const samplingDate = text(row.date_prelevement)
  const description = text(row.description || row.materiau)
  const receptionOwner = text(row.receptionnaire || row.technicien)

  return {
    uid: row.uid ?? row.id ?? `prelevement-${index}`,
    reference: row.reference || `Prelevement #${row.uid ?? row.id ?? index}`,
    status: row.statut || row.status || 'A trier',
    laboCode: row.labo_code || row.labo || '',
    demandeId: row.demande_id ?? null,
    demandeReference: row.demande_reference || row.demande_ref || '',
    affaireReference: row.affaire_reference || row.affaire_ref || '',
    chantier: row.chantier || row.site || '',
    site: row.site || '',
    interventionId: row.intervention_reelle_id ?? null,
    interventionReference: row.intervention_reelle_reference || row.intervention_reference || '',
    samplingDate,
    storedReceptionDate,
    linkedReceptionDate,
    receptionDate: storedReceptionDate || linkedReceptionDate || samplingDate,
    description,
    quantite: text(row.quantite),
    receptionOwner,
    receptionnaire: text(row.receptionnaire),
    zone: text(row.zone),
    materiau: text(row.materiau),
    technicien: text(row.technicien),
    finalite: text(row.finalite),
    notes: text(row.notes),
    rawCount: Number(row.raw_count || 0),
    echantillonCount: Number(row.echantillon_count || 0),
    essaiCount: Number(row.essai_count || 0),
  }
}

export function prelevementHasArrival(row) {
  return !!(row.receptionDate || row.samplingDate)
}

export function prelevementNeedsReceptionCompletion(row) {
  if (!prelevementHasArrival(row)) return false
  return !text(row.description) || !text(row.receptionOwner) || !text(row.demandeReference)
}

export function prelevementIsReadyForLab(row) {
  return prelevementHasArrival(row) && !prelevementNeedsReceptionCompletion(row)
}

export function prelevementIsUnexpectedArrival(row) {
  if (!prelevementHasArrival(row)) return false
  return !text(row.interventionReference)
}

export function getPrelevementReferenceDate(row) {
  return row.receptionDate || row.samplingDate || ''
}
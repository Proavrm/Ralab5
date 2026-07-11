export function g3DocumentToTrackingRow(doc = {}) {
  const observations = String(doc.observations || doc.name || '').trim()
  return {
    uid: doc.id,
    document_type: String(doc.type || '').trim(),
    is_received: !!doc.received,
    is_analyzed: !!doc.analyzed,
    used_in_report: !!doc.used_in_report,
    version: String(doc.version || '').trim(),
    document_date: doc.document_date || null,
    uploaded_at: doc.uploaded_at || null,
    comment: observations,
    stored_path: String(doc.stored_path || doc.file_url || '').trim(),
    zone_id: doc.zone_id ?? null,
    reference: String(doc.reference || '').trim(),
    author: String(doc.author || '').trim(),
  }
}

export function trackingRowToG3Document(row = {}) {
  const comment = String(row.comment || '').trim()
  const docType = String(row.document_type || '').trim()
  return {
    type: docType,
    name: comment || docType,
    reference: String(row.reference || '').trim(),
    version: String(row.version || '').trim(),
    document_date: row.document_date || null,
    author: String(row.author || '').trim(),
    received: !!row.is_received,
    analyzed: !!row.is_analyzed,
    used_in_report: !!row.used_in_report,
    observations: comment,
    stored_path: String(row.stored_path || '').trim(),
    uploaded_at: row.uploaded_at || null,
    zone_id: row.zone_id ?? null,
    file_url: '',
  }
}

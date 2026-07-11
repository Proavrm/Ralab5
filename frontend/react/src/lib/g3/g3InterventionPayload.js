export function getInterventionPayloadFields(type, catalogs = {}) {
  const map = catalogs?.intervention_payload_fields || {}
  return map[type] || []
}

export function emptyInterventionDraft() {
  return {
    type: '',
    zone_id: '',
    date: '',
    start_time: '',
    end_time: '',
    responsible: '',
    participants: '',
    objective: '',
    description: '',
    findings: '',
    decision: '',
    next_actions: '',
    weather: '',
    hydric_condition: '',
    status: 'Brouillon',
    plan_object_id: '',
    comments: '',
    payload: {},
  }
}

export function interventionToDraft(row = {}) {
  return {
    type: row.type || '',
    zone_id: row.zone_id ?? '',
    date: row.date || '',
    start_time: row.start_time || '',
    end_time: row.end_time || '',
    responsible: row.responsible || '',
    participants: row.participants || '',
    objective: row.objective || '',
    description: row.description || '',
    findings: row.findings || '',
    decision: row.decision || '',
    next_actions: row.next_actions || '',
    weather: row.weather || '',
    hydric_condition: row.hydric_condition || '',
    status: row.status || 'Brouillon',
    plan_object_id: row.plan_object_id || '',
    comments: row.comments || '',
    payload: { ...(row.payload || {}) },
  }
}

export function draftToInterventionPayload(draft = {}) {
  return {
    type: draft.type,
    zone_id: draft.zone_id ? Number(draft.zone_id) : null,
    date: draft.date || null,
    start_time: draft.start_time,
    end_time: draft.end_time,
    responsible: draft.responsible,
    participants: draft.participants,
    objective: draft.objective,
    description: draft.description,
    findings: draft.findings,
    decision: draft.decision,
    next_actions: draft.next_actions,
    weather: draft.weather,
    hydric_condition: draft.hydric_condition,
    status: draft.status,
    plan_object_id: draft.plan_object_id,
    comments: draft.comments,
    payload: draft.payload || {},
  }
}

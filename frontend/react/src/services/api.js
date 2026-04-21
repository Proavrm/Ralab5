/**
 * services/api.js
 * Camada base para todas as chamadas à API FastAPI.
 * Todas as páginas usam este ficheiro — nunca fazer fetch directo nos componentes.
 */

const BASE_URL = '/api' // proxy Vite → http://127.0.0.1:8000
const CLOUDFLARE_ACCESS_TITLE = 'Cloudflare Access'

function getToken() {
  return localStorage.getItem('ralab_token')
}

function redirectToCloudflareAccess() {
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}` || '/'
  window.location.assign(target)
}

async function parseResponse(res) {
  const contentType = res.headers.get('content-type') || ''

  if (contentType.includes('text/html')) {
    const html = await res.text()

    if (html.includes(CLOUDFLARE_ACCESS_TITLE)) {
      redirectToCloudflareAccess()
      throw new Error('Session Cloudflare Access requise. Rechargez la page.')
    }

    throw new Error('Le serveur a renvoyé une page HTML inattendue.')
  }

  if (res.status === 204) return null
  return res.json()
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('ralab_token')
    localStorage.removeItem('ralab_user')
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    const error = await parseResponse(res).catch((parseError) => ({ detail: parseError.message || res.statusText }))
    throw new Error(error.detail || `Erreur ${res.status}`)
  }

  return parseResponse(res)
}

export const api = {
  get:    (path)         => request('GET',    path),
  post:   (path, body)   => request('POST',   path, body),
  patch:  (path, body)   => request('PATCH',  path, body),
  put:    (path, body)   => request('PUT',    path, body),
  delete: (path)         => request('DELETE', path),
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login:    (credentials) => api.post('/auth/login', credentials),
  hint:     ()            => api.get('/auth/hint'),
  users:    ()            => api.get('/auth/users'),
}

// ── Affaires ──────────────────────────────────────────────────────────────────
export const affairesApi = {
  list:     (params = {}) => api.get('/affaires?' + new URLSearchParams(params)),
  get:      (uid)         => api.get(`/affaires/${uid}`),
  create:   (data)        => api.post('/affaires', data),
  update:   (uid, data)   => api.put(`/affaires/${uid}`, data),
  delete:   (uid)         => api.delete(`/affaires/${uid}`),
  nextRef:  ()            => api.get('/affaires/next-ref'),
  demandes: (uid)         => api.get(`/affaires/${uid}/demandes`),
  dossierRoot: ()         => api.get('/affaires/dossiers-root'),
  dossierStatus: (uid)    => api.get(`/affaires/${uid}/dossier-status`),
  syncDossier: (uid)      => api.post(`/affaires/${uid}/sync-dossier`, {}),
  openDossier: (uid)      => api.get(`/affaires/${uid}/open-dossier`),
}

// ── Demandes ──────────────────────────────────────────────────────────────────
export const demandesApi = {
  list:     (params = {}) => api.get('/demandes_rst?' + new URLSearchParams(params)),
  get:      (uid)         => api.get(`/demandes_rst/${uid}`),
  create:   (data)        => api.post('/demandes_rst', data),
  update:   (uid, data)   => api.put(`/demandes_rst/${uid}`, data),
  delete:   (uid)         => api.delete(`/demandes_rst/${uid}`),
  nextRef:  (labo_code = 'SP') => api.get(`/demandes_rst/next-ref?labo_code=${labo_code}`),
  filters:  ()            => api.get('/demandes_rst/filters'),
}

// ── Passations ────────────────────────────────────────────────────────────────
export const passationsApi = {
  list:   (params = {}) => api.get('/passations?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/passations/${uid}`),
  create: (data)        => api.post('/passations', data),
  update: (uid, data)   => api.patch(`/passations/${uid}`, data),
  delete: (uid)         => api.delete(`/passations/${uid}`),
}

// ── DST ───────────────────────────────────────────────────────────────────────
export const dstApi = {
  list:   (params = {}) => api.get('/dst?' + new URLSearchParams(params)),
  search: (q)           => api.get(`/dst/search?q=${encodeURIComponent(q)}`),
  import: (formData)    => fetch(`${BASE_URL}/dst/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  }).then(r => r.json()),
}

// ── Planning ──────────────────────────────────────────────────────────────────
export const planningApi = {
  list:   ()            => api.get('/planning/demandes'),
  update: (uid, data)   => api.patch(`/planning/demandes/${uid}`, data),
  listItems: ()         => api.get('/planning/items'),
  updateItem: (kind, uid, data) => api.patch(`/planning/items/${encodeURIComponent(kind)}/${uid}`, data),
}

// ── Interventions ─────────────────────────────────────────────────────────────
export const interventionsApi = {
  list:   (params = {}) => api.get('/interventions?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/interventions/${uid}`),
  create: (data)        => api.post('/interventions', data),
  update: (uid, data)   => api.put(`/interventions/${uid}`, data),
  delete: (uid)         => api.delete(`/interventions/${uid}`),
}

export const interventionCampaignsApi = {
  create: (data)        => api.post('/intervention-campaigns', data),
  update: (uid, data)   => api.patch(`/intervention-campaigns/${uid}`, data),
}

// ── Échantillons ──────────────────────────────────────────────────────────────
export const echantillonsApi = {
  list:   (params = {}) => api.get('/essais/echantillons?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/essais/echantillons/${uid}`),
  create: (data)        => api.post('/essais/echantillons', data),
  update: (uid, data)   => api.put(`/essais/echantillons/${uid}`, data),
  delete: (uid)         => api.delete(`/essais/echantillons/${uid}`),
}

// ── Prélèvements ──────────────────────────────────────────────────────────────
export const prelevementsApi = {
  list:   (params = {}) => api.get('/intervention-requalification/prelevements?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/intervention-requalification/prelevements/${uid}`),
  update: (uid, data)   => api.patch(`/intervention-requalification/prelevements/${uid}`, data),
}

// ── Essais ────────────────────────────────────────────────────────────────────
export const essaisApi = {
  list:   (params = {}) => api.get('/essais?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/essais/${uid}`),
  create: (data)        => api.post('/essais', data),
  update: (uid, data)   => api.patch(`/essais/${uid}`, data),
  delete: (uid)         => api.delete(`/essais/${uid}`),
  syncInterventionEssais: (interventionId) => api.post(`/essais/interventions/${interventionId}/sync`, {}),
}

// ── PMT ───────────────────────────────────────────────────────────────────────
export const pmtApi = {
  listCampaignsByDemande:   (demandeId, preparationPhase = '') => api.get(`/pmt/demandes/${demandeId}/campagnes?preparation_phase=${encodeURIComponent(preparationPhase)}`),
  getInterventionWorkflow:  (interventionId, preparationPhase = '') => api.get(`/pmt/interventions/${interventionId}/workflow?preparation_phase=${encodeURIComponent(preparationPhase)}`),
  ensureEssaiForIntervention: (interventionId) => api.post(`/pmt/interventions/${interventionId}/essai`, {}),
  getEssai:                 (uid) => api.get(`/pmt/essais/${uid}`),
  updateEssai:              (uid, data) => api.put(`/pmt/essais/${uid}`, data),
  getRapport:               (uid) => api.get(`/pmt/rapports/${uid}`),
}


// ── Intervention requalification ─────────────────────────────────────────────
export const interventionRequalificationApi = {
  listRaw:                (params = {}) => api.get('/intervention-requalification/raw?' + new URLSearchParams(params)),
  updateRaw:              (uid, data)   => api.patch(`/intervention-requalification/raw/${uid}`, data),
  bulkNature:             (raw_ids, nature_reelle) => api.post('/intervention-requalification/raw/bulk-nature', { raw_ids, nature_reelle }),
  listPrelevements:       (params = {}) => api.get('/intervention-requalification/prelevements?' + new URLSearchParams(params)),
  createPrelevement:      (data)        => api.post('/intervention-requalification/prelevements', data),
  assignPrelevement:      (raw_ids, prelevement_id) => api.post('/intervention-requalification/prelevements/assign', { raw_ids, prelevement_id }),
  clearPrelevement:       (raw_ids)     => api.post('/intervention-requalification/prelevements/clear', { raw_ids }),
  listInterventionsReelles: (params = {}) => api.get('/intervention-requalification/interventions-reelles?' + new URLSearchParams(params)),
  createInterventionReelle: (data)      => api.post('/intervention-requalification/interventions-reelles', data),
  assignInterventionReelle: (raw_ids, intervention_reelle_id) => api.post('/intervention-requalification/interventions-reelles/assign', { raw_ids, intervention_reelle_id }),
  clearInterventionReelle:  (raw_ids)   => api.post('/intervention-requalification/interventions-reelles/clear', { raw_ids }),
  candidates:               (params = {}) => api.get('/intervention-requalification/candidates?' + new URLSearchParams(params)),
}

// ── Qualité ───────────────────────────────────────────────────────────────────
export const qualiteApi = {
  stats:      ()            => api.get('/qualite/stats'),
  equipment:  {
    list:   () => api.get('/qualite/equipment'),
    create: (d) => api.post('/qualite/equipment', d),
    update: (id, d) => api.patch(`/qualite/equipment/${id}`, d),
  },
  metrology:  {
    list:   () => api.get('/qualite/metrology'),
    create: (d) => api.post('/qualite/metrology', d),
  },
  procedures: {
    list:   () => api.get('/qualite/procedures'),
    create: (d) => api.post('/qualite/procedures', d),
  },
  standards:  {
    list:   () => api.get('/qualite/standards'),
    create: (d) => api.post('/qualite/standards', d),
  },
  nc:         {
    list:   () => api.get('/qualite/nc'),
    create: (d) => api.post('/qualite/nc', d),
    update: (id, d) => api.patch(`/qualite/nc/${id}`, d),
  },
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  users: {
    list:   () => api.get('/admin/users'),
    get:    (email) => api.get(`/admin/users/${encodeURIComponent(email)}`),
    create: (d) => api.post('/admin/users', d),
    update: (email, d) => api.put(`/admin/users/${encodeURIComponent(email)}`, d),
    profile: (email) => api.get(`/admin/users/${encodeURIComponent(email)}/profile`),
    updateProfile: (email, d) => api.put(`/admin/users/${encodeURIComponent(email)}/profile`, d),
    currentCompetencies: (email) => api.get(`/admin/users/${encodeURIComponent(email)}/competency-assessments/current`),
    competencyHistory: (email) => api.get(`/admin/users/${encodeURIComponent(email)}/competency-assessments`),
    createCompetencyAssessment: (email, d) => api.post(`/admin/users/${encodeURIComponent(email)}/competency-assessments`, d),
    deleteCompetencyAssessment: (email, assessmentId) => api.delete(`/admin/users/${encodeURIComponent(email)}/competency-assessments/${assessmentId}`),
    toggleActive: (email, active) => api.patch(`/admin/users/${encodeURIComponent(email)}/active`, { is_active: active }),
  },
  roles: {
    list:   () => api.get('/admin/roles'),
  },
  employmentLevels: {
    list: () => api.get('/admin/employment-levels'),
  },
  competencyLevels: {
    list: () => api.get('/admin/competency-levels'),
  },
  competencies: {
    list: () => api.get('/admin/competencies'),
  },
}


export const feuillesTerrainApi = {
  get:          (uid) => api.get(`/feuilles-terrain/${uid}`),
  createPoint:  (uid, data) => api.post(`/feuilles-terrain/${uid}/points`, data),
  updatePoint:  (uid, pointUid, data) => api.put(`/feuilles-terrain/${uid}/points/${pointUid}`, data),
  deletePoint:  (uid, pointUid) => api.delete(`/feuilles-terrain/${uid}/points/${pointUid}`),
  createCouche: (uid, pointUid, data) => api.post(`/feuilles-terrain/${uid}/points/${pointUid}/couches`, data),
  updateCouche: (uid, pointUid, coucheUid, data) => api.put(`/feuilles-terrain/${uid}/points/${pointUid}/couches/${coucheUid}`, data),
  deleteCouche: (uid, pointUid, coucheUid) => api.delete(`/feuilles-terrain/${uid}/points/${pointUid}/couches/${coucheUid}`),
  createPrelevementForCouche: (uid, pointUid, coucheUid, data) => api.post(`/feuilles-terrain/${uid}/points/${pointUid}/couches/${coucheUid}/prelevements`, data),
  updatePrelevement: (uid, prelevUid, data) => api.patch(`/feuilles-terrain/${uid}/prelevements/${prelevUid}`, data),
  deletePrelevement: (uid, prelevUid) => api.delete(`/feuilles-terrain/${uid}/prelevements/${prelevUid}`),
  getCustomValues: (champ) => api.get(`/feuilles-terrain/custom-values/${champ}`),
  getAllCustomValues: () => api.get('/feuilles-terrain/custom-values'),
  saveCustomValue: (champ, valeur) => api.post('/feuilles-terrain/custom-values', { champ, valeur }),
  deleteCustomValue: (champ, valeur) => api.delete(`/feuilles-terrain/custom-values/${encodeURIComponent(champ)}/${encodeURIComponent(valeur)}`),
}

// ── Nivellements ──────────────────────────────────────────────────────────────
export const nivellementsApi = {
  get: (uid) => api.get(`/nivellements/${uid}`),
}

// ── Plans d'implantation ──────────────────────────────────────────────────────
export const plansImplantationApi = {
  get: (uid) => api.get(`/plans-implantation/${uid}`),
}

/**
 * services/api.js
 * Camada base para todas as chamadas à API FastAPI.
 * Todas as páginas usam este ficheiro — nunca fazer fetch directo nos componentes.
 */

const BASE_URL = '/api' // proxy Vite → http://127.0.0.1:8000
const CLOUDFLARE_ACCESS_TITLE = 'Cloudflare Access'
const TOKEN_COOKIE = 'ralab_token'
const TOKEN_MAX_AGE = 12 * 60 * 60

export function setAuthTokenCookie(token) {
  if (!token) return
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_MAX_AGE}; SameSite=Lax`
}

export function clearAuthTokenCookie() {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

function clearAuthSession() {
  localStorage.removeItem('ralab_token')
  localStorage.removeItem('ralab_user')
  clearAuthTokenCookie()
}

export function clearAuthSessionLocal() {
  clearAuthSession()
}

function formatApiErrorDetail(detail) {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join(' · ')
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail)
  }
  return String(detail)
}

export function getApiErrorMessage(error, fallback = 'Erreur inconnue') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error?.message) return error.message
  return fallback
}

function buildImportFormData(file, fields = {}) {
  const formData = new FormData()
  if (file) formData.append('file', file)
  Object.entries(fields).forEach(([key, value]) => {
    if (value == null || value === '') return
    formData.append(key, String(value))
  })
  return formData
}

function handleUnauthorized() {
  clearAuthSession()
  const onLoginPage = window.location.pathname === '/login' || window.location.pathname.endsWith('/login')
  if (!onLoginPage) {
    window.location.href = '/login'
  }
  throw new Error('Session expirée.')
}

function getToken() {
  const token = localStorage.getItem('ralab_token')
  if (token) setAuthTokenCookie(token)
  return token
}

function redirectToCloudflareAccess() {
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}` || '/'
  window.location.assign(target)
}

function isCloudflareAccessRedirect(res) {
  return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
}

function buildQueryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return
    search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
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
    redirect: 'manual',
    body: body ? JSON.stringify(body) : undefined,
  })

  if (isCloudflareAccessRedirect(res)) {
    redirectToCloudflareAccess()
    throw new Error('Session Cloudflare Access requise. Rechargez la page.')
  }

  if (res.status === 401) {
    handleUnauthorized()
  }

  if (!res.ok) {
    const error = await parseResponse(res).catch((parseError) => ({ detail: parseError.message || res.statusText }))
    throw new Error(formatApiErrorDetail(error.detail) || `Erreur ${res.status}`)
  }

  return parseResponse(res)
}

/** GET public (login bootstrap) — sans JWT RaLab, mais avec cookies Cloudflare Access. */
async function publicGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    redirect: 'manual',
  })

  if (isCloudflareAccessRedirect(res)) {
    redirectToCloudflareAccess()
    throw new Error('Session Cloudflare Access requise. Rechargez la page.')
  }

  if (res.status === 401) {
    handleUnauthorized()
  }

  if (!res.ok) {
    const error = await parseResponse(res).catch((parseError) => ({ detail: parseError.message || res.statusText }))
    throw new Error(formatApiErrorDetail(error.detail) || `Erreur ${res.status}`)
  }

  return parseResponse(res)
}

export const api = {
  list: (params = {}) => api.get('/feuilles-terrain?' + new URLSearchParams(params)),
  get:    (path)         => request('GET',    path),
  post:   (path, body)   => request('POST',   path, body),
  patch:  (path, body)   => request('PATCH',  path, body),
  put:    (path, body)   => request('PUT',    path, body),
  delete: (path)         => request('DELETE', path),
  postForm: async (path, formData) => {
    const headers = {}
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: formData,
    })

    if (res.status === 401) {
      handleUnauthorized()
    }

    if (!res.ok) {
      const error = await parseResponse(res).catch((parseError) => ({ detail: parseError.message || res.statusText }))
      throw new Error(formatApiErrorDetail(error.detail) || `Erreur ${res.status}`)
    }

    return parseResponse(res)
  },
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login:    (credentials) => api.post('/auth/login', credentials),
  hint:     ()            => publicGet('/auth/hint'),
  users:    ()            => publicGet('/auth/users'),
}

// ── Affaires ──────────────────────────────────────────────────────────────────
export const affairesApi = {
  list:     (params = {}) => api.get('/affaires?' + new URLSearchParams(params)),
  get:      (uid, params = {}) => api.get(`/affaires/${uid}?` + new URLSearchParams(params)),
  create:   (data)        => api.post('/affaires', data),
  update:   (uid, data)   => api.put(`/affaires/${uid}`, data),
  delete:   (uid)         => api.delete(`/affaires/${uid}`),
  nextRef:  ()            => api.get('/affaires/next-ref'),
  demandes: (uid)         => api.get(`/affaires/${uid}/demandes`),
  dossierRoot: ()         => api.get('/affaires/dossiers-root'),
  dossierStatus: (uid)    => api.get(`/affaires/${uid}/dossier-status`),
  syncDossier: (uid)      => api.post(`/affaires/${uid}/sync-dossier`, {}),
  openDossier: (uid)      => api.get(`/affaires/${uid}/open-dossier`),
  listContacts: (uid, params = {}) => api.get(`/affaires/${uid}/contacts?${new URLSearchParams(params)}`),
  listContactOrganisations: (uid) => api.get(`/affaires/${uid}/contacts/organisations`),
  createContact: (uid, data) => api.post(`/affaires/${uid}/contacts`, data),
  updateContact: (uid, contactId, data) => api.put(`/affaires/${uid}/contacts/${contactId}`, data),
  deleteContact: (uid, contactId) => api.delete(`/affaires/${uid}/contacts/${contactId}`),
  touchContact: (uid, contactId) => api.post(`/affaires/${uid}/contacts/${contactId}/touch`, {}),
  listPlanImages: (uid)   => api.get(`/affaires/${uid}/plan-images`),
  uploadDocument: (uid, file, options = {}) => {
    const form = new FormData()
    form.append('file', file)
    const documentType = String(options.documentType || '').trim()
    if (documentType) form.append('document_type', documentType)
    return api.postForm(`/affaires/${uid}/documents/upload`, form)
  },
  deleteDocument: (uid, storedPath) => api.delete(
    `/affaires/${uid}/documents/file?stored_path=${encodeURIComponent(String(storedPath || ''))}`,
  ),
  geocodeSitePlan: (uid, address, laboCode = 'SP') => {
    const query = new URLSearchParams({
      address: String(address || ''),
      labo_code: String(laboCode || 'SP'),
    })
    return api.get(`/affaires/${uid}/documents/site-plan/geocode?${query}`)
  },
  previewSitePlan: async (uid, { address, lat, lon, zoom = 16, width, height } = {}) => {
    const headers = {}
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const query = new URLSearchParams({ zoom: String(zoom) })
    if (width != null) query.set('width', String(width))
    if (height != null) query.set('height', String(height))
    if (lat != null && lon != null) {
      query.set('lat', String(lat))
      query.set('lon', String(lon))
    } else if (address) {
      query.set('address', String(address))
    }
    const res = await fetch(`${BASE_URL}/affaires/${uid}/documents/site-plan/preview?${query}`, {
      headers,
      credentials: 'same-origin',
    })
    if (res.status === 401) {
      localStorage.removeItem('ralab_token')
      localStorage.removeItem('ralab_user')
      window.location.href = '/login'
      throw new Error('Session expirée')
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(error.detail || `Erreur ${res.status}`)
    }
    const blob = await res.blob()
    return { blobUrl: URL.createObjectURL(blob) }
  },
  captureSitePlan: (uid, payload) => api.post(`/affaires/${uid}/documents/site-plan/capture`, payload),
  getSitePlanMeta: (uid, storedPath, { kind = 'plan' } = {}) => {
    const query = new URLSearchParams({
      stored_path: String(storedPath || ''),
      kind: String(kind || 'plan'),
    })
    return api.get(`/affaires/${uid}/documents/site-plan/meta?${query}`)
  },
  getSitePlanItinerary: (uid, { lat, lon, laboCode = 'SP' } = {}) => {
    const query = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      labo_code: String(laboCode || 'SP'),
    })
    return api.get(`/affaires/${uid}/documents/site-plan/itinerary?${query}`)
  },
}

// ── Contacts (annuaire global) ────────────────────────────────────────────────
export const contactsApi = {
  list: (params = {}) => api.get(`/contacts?${new URLSearchParams(params)}`),
  listOrganisations: (params = {}) => api.get(`/contacts/organisations?${new URLSearchParams(params)}`),
  sync: (params = {}) => api.post(`/contacts/sync?${new URLSearchParams(params)}`, {}),
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
  organizationProposal: (uid) => api.get(`/passations/${uid}/organization-proposal`),
  applyOrganizationProposal: (uid) => api.post(`/passations/${uid}/organization-proposal/apply`, {}),
  readiness: (uid) => api.get(`/passations/${uid}/readiness`),
  openDemandeAffaireFolder: (uid) => api.get(`/passations/${uid}/open-demande-affaire-folder`),
  demandesPreview: (uid) => api.get(`/passations/${uid}/demandes-preview`),
  demandes: (uid) => api.get(`/passations/${uid}/demandes`),
  linkableDemandes: (uid) => api.get(`/passations/${uid}/demandes-linkable`),
  generateDemandes: (uid) => api.post(`/passations/${uid}/demandes-generate`, {}),
  linkDemande: (uid, data) => api.post(`/passations/${uid}/link-demande`, data),
}

// ── DST ───────────────────────────────────────────────────────────────────────
export const dstApi = {
  status: () => api.get('/dst/status'),
  list: (params = {}) => api.get('/dst?' + new URLSearchParams(params)),
  search: (q) => api.get(`/dst/search?q=${encodeURIComponent(q)}`),
  get: (rowId) => api.get(`/dst/${rowId}`),
  update: (rowId, data) => api.patch(`/dst/${rowId}`, { data }),
  importFile: (file, sheetName = 'ExcelMergeQuery') => {
    const query = sheetName ? `?sheet_name=${encodeURIComponent(sheetName)}` : ''
    return api.postForm(`/dst/import${query}`, buildImportFormData(file))
  },
}

// ── Import essais terrain (Tools) ─────────────────────────────────────────────
export const importEssaisApi = {
  dePreview: (payload) => api.post('/import-essais-de/preview', payload),
  dePreviewUpload: (file, fields = {}) =>
    api.postForm('/import-essais-de/preview-upload', buildImportFormData(file, fields)),
  deImportSheet: (payload) => api.post('/import-essais-de/import-sheet', payload),
  deImportSheetUpload: (file, fields = {}) =>
    api.postForm('/import-essais-de/import-sheet-upload', buildImportFormData(file, fields)),
  scPreviewUpload: (file, fields = {}) =>
    api.postForm('/import-sc/preview', buildImportFormData(file, fields)),
  scMaterialize: (file, fields = {}) =>
    api.postForm('/import-sc/materialize', buildImportFormData(file, fields)),
  pmtPreviewUpload: (file) =>
    api.postForm('/import-essais-pmt/preview-upload', buildImportFormData(file)),
  pmtImportUpload: (file, fields = {}) =>
    api.postForm('/import-essais-pmt/import-upload', buildImportFormData(file, fields)),
}

// ── Outils admin (ToolsPage) ──────────────────────────────────────────────────
export const toolsApi = {
  initSecurityDb: () => api.post('/admin/init-security', {}),
  runMigration: () => api.post('/admin/migrate', {}),
  syncDstToAffaires: () => api.post('/admin/dst-to-affaires', {}),
}

// ── Planning ──────────────────────────────────────────────────────────────────
export const planningApi = {
  list:   ()            => api.get('/planning/demandes'),
  update: (uid, data)   => api.patch(`/planning/demandes/${uid}`, data),
  listItems: ()         => api.get('/planning/items'),
  updateItem: (kind, uid, data) => api.patch(`/planning/items/${encodeURIComponent(kind)}/${uid}`, data),
}

export const feuilleMissionApi = {
  touchJournee: (data) => api.post('/feuille-mission/journee/touch', data),
  getJourneeSnapshotHash: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    ).toString()
    return api.get(`/feuille-mission/journee/snapshot-hash${qs ? `?${qs}` : ''}`)
  },
}

// ── Calculs de dimensionnement ──────────────────────────────────────────────
export const calculsApi = {
  summary: (params = {}) => api.get('/calculs/summary' + buildQueryString(params)),
  list: (params = {}) => api.get('/calculs/calculations' + buildQueryString(params)),
  get: (id) => api.get(`/calculs/calculations/${id}`),
  create: (data) => api.post('/calculs/calculations', data),
  update: (id, data) => api.patch(`/calculs/calculations/${id}`, data),
  duplicate: (id) => api.post(`/calculs/calculations/${id}/duplicate`, {}),
  updateAlize: (id, data) => api.patch(`/calculs/calculations/${id}/alize`, data),
  runReglementaire: (id) => api.post(`/calculs/calculations/${id}/alize/run-reglementaire`, {}),
  runMecanique: (id) => api.post(`/calculs/calculations/${id}/alize/run-mecanique`, {}),
  runComplet: (id) => api.post(`/calculs/calculations/${id}/alize/run-complet`, {}),
  searchReferences: (params = {}) => api.get('/calculs/references/alize' + buildQueryString(params)),
  getReference: (refId) => api.get(`/calculs/references/alize/${refId}`),
  catalogs: () => api.get('/calculs/catalogs/alize'),
  createFromReference: (refId, params = {}) =>
    api.post(`/calculs/references/alize/${refId}/create-calculation` + buildQueryString(params), {}),
  applyReference: (id, data) => api.post(`/calculs/calculations/${id}/apply-reference`, data),
  async openFiche(id) {
    const headers = {}
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${BASE_URL}/calculs/calculations/${id}/fiche`, {
      method: 'GET',
      headers,
      credentials: 'same-origin',
      redirect: 'manual',
    })
    if (isCloudflareAccessRedirect(res)) {
      redirectToCloudflareAccess()
      throw new Error('Session Cloudflare Access requise. Rechargez la page.')
    }
    if (res.status === 401) handleUnauthorized()
    if (!res.ok) throw new Error(`Erreur fiche ${res.status}`)
    const html = await res.text()
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}

// ── G3 missions ─────────────────────────────────────────────────────────────
export const g3Api = {
  catalogs: () => api.get('/g3/catalogs'),
  listMissions: (params = {}) => api.get('/g3/missions' + buildQueryString(params)),
  getMission: (uid) => api.get(`/g3/missions/${uid}`),
  createMission: (data) => api.post('/g3/missions', data),
  updateMission: (uid, data) => api.patch(`/g3/missions/${uid}`, data),
  getDemandePrefill: (demandeId) => api.get(`/g3/demandes/${demandeId}/prefill`),
  listByDemande: (demandeId) => api.get(`/g3/missions/by-demande/${demandeId}`),
  createDefaultProgramme: (uid) => api.post(`/g3/missions/${uid}/programme/default`, {}),
  addProgrammeItem: (uid, data) => api.post(`/g3/missions/${uid}/programme`, data),
  updateIntervention: (uid, data) => api.patch(`/g3/interventions/${uid}`, data),
  deleteIntervention: (uid) => api.delete(`/g3/interventions/${uid}`),
  promoteIntervention: (uid) => api.post(`/g3/interventions/${uid}/promote`, {}),
  createRealizedIntervention: (uid, data) => api.post(`/g3/missions/${uid}/interventions/realized`, data),
  generateG3002: (uid) => api.get(`/g3/missions/${uid}/documents/g3002`),
  generateDocumentsTable: (uid) => api.get(`/g3/missions/${uid}/documents/report-table`),
  createZone: (uid, data) => api.post(`/g3/missions/${uid}/zones`, data),
  updateZone: (uid, data) => api.patch(`/g3/zones/${uid}`, data),
  deleteZone: (uid) => api.delete(`/g3/zones/${uid}`),
  createDocument: (uid, data) => api.post(`/g3/missions/${uid}/documents`, data),
  replaceDocuments: (uid, documents) => api.put(`/g3/missions/${uid}/documents`, { documents }),
  updateDocument: (uid, data) => api.patch(`/g3/documents/${uid}`, data),
  deleteDocument: (uid) => api.delete(`/g3/documents/${uid}`),
  createDefaultObjectives: (uid) => api.post(`/g3/missions/${uid}/objectives/default`, {}),
  createObjective: (uid, data) => api.post(`/g3/missions/${uid}/objectives`, data),
  updateObjective: (uid, data) => api.patch(`/g3/objectives/${uid}`, data),
  deleteObjective: (uid) => api.delete(`/g3/objectives/${uid}`),
  createTest: (uid, data) => api.post(`/g3/missions/${uid}/tests`, data),
  updateTest: (uid, data) => api.patch(`/g3/tests/${uid}`, data),
  deleteTest: (uid) => api.delete(`/g3/tests/${uid}`),
  createPhoto: (uid, data) => api.post(`/g3/missions/${uid}/photos`, data),
  updatePhoto: (uid, data) => api.patch(`/g3/photos/${uid}`, data),
  deletePhoto: (uid) => api.delete(`/g3/photos/${uid}`),
  generateNoticeDraft: (uid, data) => api.post(`/g3/missions/${uid}/notices/draft`, {
    type: data.type,
    zone_id: data.zone_id ?? null,
    intervention_id: data.intervention_id ?? null,
  }),
  createNotice: (uid, data) => api.post(`/g3/missions/${uid}/notices`, data),
  updateNotice: (uid, data) => api.patch(`/g3/notices/${uid}`, data),
  deleteNotice: (uid) => api.delete(`/g3/notices/${uid}`),
  createDefaultHoldPoints: (uid) => api.post(`/g3/missions/${uid}/hold-points/default`, {}),
  createHoldPoint: (uid, data) => api.post(`/g3/missions/${uid}/hold-points`, data),
  updateHoldPoint: (uid, data) => api.patch(`/g3/hold-points/${uid}`, data),
  deleteHoldPoint: (uid) => api.delete(`/g3/hold-points/${uid}`),
  getMissionPlanning: (uid) => api.get(`/g3/missions/${uid}/planning`),
  createDefaultDeliverables: (uid) => api.post(`/g3/missions/${uid}/deliverables/default`, {}),
  createDeliverable: (uid, data) => api.post(`/g3/missions/${uid}/deliverables`, data),
  updateDeliverable: (uid, data) => api.patch(`/g3/deliverables/${uid}`, data),
  deleteDeliverable: (uid) => api.delete(`/g3/deliverables/${uid}`),
  previewDeliverable: (uid) => api.get(`/g3/deliverables/${uid}/preview`),
  generateG3008: (uid) => api.get(`/g3/missions/${uid}/report/g3008`),
}

// ── Work inbox ───────────────────────────────────────────────────────────────
export const workInboxApi = {
  mine:     (params = {}) => api.get('/work/inbox/me?' + new URLSearchParams(params)),
  summary:  ()            => api.get('/work/inbox/me/summary'),
  markRead: (uid)         => api.post(`/work/inbox/notifications/${uid}/read`, {}),
}

// ── Interventions ─────────────────────────────────────────────────────────────
export const interventionsApi = {
  list:   (params = {}) => api.get('/interventions?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/interventions/${uid}`),
  create: (data)        => api.post('/interventions', data),
  update: (uid, data)   => api.put(`/interventions/${uid}`, data),
  delete: (uid)         => api.delete(`/interventions/${uid}`),
  listTypeCatalog: () => api.get('/interventions/catalog/types'),
  createTypeCatalog: (data) => api.post('/interventions/catalog/types', data),
}

export const interventionCampaignsApi = {
  list:   (params = {}) => api.get('/intervention-campaigns?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/intervention-campaigns/${uid}`),
  create: (data)        => api.post('/intervention-campaigns', data),
  update: (uid, data)   => api.patch(`/intervention-campaigns/${uid}`, data),
  delete: (uid)         => api.delete(`/intervention-campaigns/${uid}`),
  archive:(uid)         => api.post(`/intervention-campaigns/${uid}/archive`, {}),
  listTypeCatalog: () => api.get('/intervention-campaigns/catalog/types'),
  createTypeCatalog: (data) => api.post('/intervention-campaigns/catalog/types', data),
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
  qsse: {
      overview: (params = {}) => api.get('/qualite/qsse/overview?' + new URLSearchParams(params)),
      records: (params = {}) => api.get('/qualite/qsse/records?' + new URLSearchParams(params)),
    updateCell: (recordId, data) => api.patch(`/qualite/qsse/records/${Number(recordId)}`, data),
    documents: (recordId) => api.get(`/qualite/qsse/records/${Number(recordId)}/documents`),
    fncAnalysisPresentations: (params = {}) => api.get('/qualite/qsse/fnc-analysis/presentations?' + new URLSearchParams(params)),
    generateFncAnalysisPresentation: (params = {}) => api.post('/qualite/qsse/fnc-analysis/presentations/generate?' + new URLSearchParams(params), {}),
    uploadFncAnalysisPresentation: (file, params = {}) => {
      const form = new FormData()
      form.append('file', file)
      return api.postForm('/qualite/qsse/fnc-analysis/presentations?' + new URLSearchParams(params), form)
    },
    deleteFncAnalysisPresentation: (documentId) => api.delete(`/qualite/qsse/fnc-analysis/presentations/${Number(documentId)}`),
      analysisStats: (params = {}) => api.get('/qualite/qsse/analysis-stats?' + new URLSearchParams(params)),
    rexDraft: (recordId) => api.get(`/qualite/qsse/records/${Number(recordId)}/rex-draft`),
    generateRexDraft: (recordId) => api.post(`/qualite/qsse/records/${Number(recordId)}/rex-draft/generate`, {}),
    uploadDocument: (recordId, file) => {
      const form = new FormData()
      form.append('file', file)
      return api.postForm(`/qualite/qsse/records/${Number(recordId)}/documents`, form)
    },
    deleteDocument: (documentId) => api.delete(`/qualite/qsse/documents/${Number(documentId)}`),
      refreshLive: (replaceExisting = true) =>
          api.post(`/qualite/qsse/refresh-live?replace_existing=${replaceExisting ? 'true' : 'false'}`, {}),
  },
  equipment:  {
      list:   () => api.get('/qualite/equipment'),
      create: (d) => api.post('/qualite/equipment', d),
      update: (id, d) => api.put(`/qualite/equipment/${id}`, d),
  },
  equipmentOptions: {
      list: (params = {}) => {
          const query = new URLSearchParams(
              Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
          ).toString()

          return api.get(`/qualite/equipment-options${query ? `?${query}` : ''}`)
      },
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
    rstCodeOptions: () => api.get('/admin/competencies/rst-code-options'),
    updateRstCode: (competencyId, body) => api.patch(`/admin/competencies/${competencyId}/rst-code`, body),
  },
  labs: {
    list: async () => {
      const payload = await api.get('/admin/labs')
      if (Array.isArray(payload)) {
        return { laboratoires: payload, rst_regions: [] }
      }
      return {
        laboratoires: payload?.laboratoires || [],
        org_regions: payload?.org_regions || payload?.rst_regions || [],
        rst_regions: payload?.org_regions || payload?.rst_regions || [],
      }
    },
    listOrgRegions: () => api.get('/admin/labs/org-regions'),
    listRstRegions: () => api.get('/admin/labs/rst-regions'),
    get: (code) => api.get(`/admin/labs/${encodeURIComponent(code)}`),
    update: (code, body) => api.put(`/admin/labs/${encodeURIComponent(code)}`, body),
    create: (body) => api.post('/admin/labs', body),
    delete: (code) => api.delete(`/admin/labs/${encodeURIComponent(code)}`),
  },
  org: {
    listRegions: () => api.get('/admin/org/regions'),
    upsertRegion: (code, body) => api.put(`/admin/org/regions/${encodeURIComponent(code)}`, body),
    listAgences: () => api.get('/admin/org/agences'),
    upsertAgence: (code, body) => api.put(`/admin/org/agences/${encodeURIComponent(code)}`, body),
  },
}

/** Essais PMT (source unique en base : pmt_essais / pmt_essais_points). */
export const pmtEssaisApi = {
  list: (params = {}) => api.get('/pmt-essais?' + new URLSearchParams(params)),
  get: (pmtId) => api.get(`/pmt-essais/${Number(pmtId)}`),
  getByReference: (reference) =>
    api.get(`/pmt-essais/by-reference?${new URLSearchParams({ reference: String(reference || '').trim() })}`),
  putRuntimeValues: (pmtId, body) => api.put(`/pmt-essais/${Number(pmtId)}/runtime-values`, body),
}

export const rapportsValidationApi = {
  list: (params = {}) => api.get('/rapports/validation?' + new URLSearchParams(params)),
  updateStatus: (reportId, body) =>
    api.post(`/rapports/validation/${encodeURIComponent(String(reportId || ''))}/status`, body),
  refreshPreview: (reportId) =>
    api.post(`/rapports/validation/${encodeURIComponent(String(reportId || ''))}/preview`, {}),
  getDossierEmails: (reportId) =>
    api.get(`/rapports/validation/${encodeURIComponent(String(reportId || ''))}/dossier-emails`),
}

export const feuillesTerrainApi = {
  list:         (params = {}) => api.get('/feuilles-terrain?' + new URLSearchParams(params)),
  get:          (uid) => api.get(`/feuilles-terrain/${uid}`),
  create:       (data) => api.post('/feuilles-terrain', data),
  update:       (uid, data) => api.put(`/feuilles-terrain/${uid}`, data),
  delete:       (uid) => api.delete(`/feuilles-terrain/${uid}`),
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
  listEssaiPhotos: (essaiId) => api.get(`/photos/essai/${essaiId}/gallery`),
  uploadEssaiPhoto: (essaiId, file, affaire = '', options = {}) => {
    const form = new FormData()
    form.append('file', file)
    if (affaire) form.append('affaire', affaire)
    if (options?.coupe_code) form.append('coupe_code', String(options.coupe_code))
    if (options?.replace_stored_name) form.append('replace_stored_name', String(options.replace_stored_name))
    return api.postForm(`/photos/essai/${essaiId}`, form)
  },
  setPrimaryEssaiPhoto: (essaiId, storedName) => api.patch(`/photos/essai/${essaiId}/primary`, { stored_name: storedName }),
  deleteEssaiPhoto: (essaiId, storedName) => api.delete(`/photos/essai/${essaiId}/files/${encodeURIComponent(storedName)}`),
  listFeuillePhotos: (feuilleId) => api.get(`/photos/feuille/${feuilleId}/gallery`),
  uploadFeuillePhoto: (feuilleId, file, affaire = '', options = {}) => {
    const form = new FormData()
    form.append('file', file)
    if (affaire) form.append('affaire', affaire)
    if (options?.coupe_code) form.append('coupe_code', String(options.coupe_code))
    if (options?.point_code) form.append('point_code', String(options.point_code))
    if (options?.replace_stored_name) form.append('replace_stored_name', String(options.replace_stored_name))
    if (options?.make_primary != null) form.append('make_primary', String(Boolean(options.make_primary)))
    return api.postForm(`/photos/feuille/${feuilleId}`, form)
  },
  setPrimaryFeuillePhoto: (feuilleId, storedName) => api.patch(`/photos/feuille/${feuilleId}/primary`, { stored_name: storedName }),
  deleteFeuillePhoto: (feuilleId, storedName) => api.delete(`/photos/feuille/${feuilleId}/files/${encodeURIComponent(storedName)}`),
}

// ── Nivellements ──────────────────────────────────────────────────────────────
export const nivellementsApi = {
  get: (uid) => api.get(`/nivellements/${uid}`),
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString()
    return api.get(`/nivellements${qs ? '?' + qs : ''}`)
  },
  create: (data) => api.post('/nivellements', data),
  update: (uid, data) => api.put(`/nivellements/${uid}`, data),
  ensureForIntervention: (interventionId) => api.post(`/nivellements/ensure-for-intervention/${interventionId}`),
  updateTerrainPoint: (uid, pointUid, data) => api.patch(`/nivellements/${uid}/terrain-points/${pointUid}`, data),
  delete: (uid) => api.delete(`/nivellements/${uid}`),
}

// ── Plans d'implantation ──────────────────────────────────────────────────────
export const plansImplantationApi = {
  get: (uid) => api.get(`/plans-implantation/${uid}`),
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString()
    return api.get(`/plans-implantation${qs ? '?' + qs : ''}`)
  },
  create: (data) => api.post('/plans-implantation', data),
  update: (uid, data) => api.put(`/plans-implantation/${uid}`, data),
  updateCanvas: (uid, data) => api.put(`/plans-implantation/${uid}/canvas`, data),
  listImageFiles: (uid) => api.get(`/plans-implantation/${uid}/image-files`),
  listInterventionPoints: (uid, params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString()
    return api.get(`/plans-implantation/${uid}/intervention-points${qs ? '?' + qs : ''}`)
  },
  createInterventionPoint: (uid, data) => api.post(`/plans-implantation/${uid}/intervention-points`, data),
  searchPoints: (interventionId, code = '') =>
    api.get(`/plans-implantation/search-points?intervention_id=${interventionId}&code=${encodeURIComponent(code)}`),
  delete: (uid) => api.delete(`/plans-implantation/${uid}`),
}

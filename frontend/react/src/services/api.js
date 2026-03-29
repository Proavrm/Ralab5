/**
 * services/api.js
 * Camada base para todas as chamadas à API FastAPI.
 * Todas as páginas usam este ficheiro — nunca fazer fetch directo nos componentes.
 */

const BASE_URL = '/api' // proxy Vite → http://127.0.0.1:8000

function getToken() {
  return localStorage.getItem('ralab_token')
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('ralab_token')
    localStorage.removeItem('ralab_user')
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail || `Erreur ${res.status}`)
  }

  if (res.status === 204) return null
  return res.json()
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
}

// ── Affaires ──────────────────────────────────────────────────────────────────
export const affairesApi = {
  list:     (params = {}) => api.get('/affaires?' + new URLSearchParams(params)),
  get:      (uid)         => api.get(`/affaires/${uid}`),
  create:   (data)        => api.post('/affaires', data),
  update:   (uid, data)   => api.put(`/affaires/${uid}`, data),   // backend uses PUT
  delete:   (uid)         => api.delete(`/affaires/${uid}`),
  nextRef:  ()            => api.get('/affaires/next-ref'),
  demandes: (uid)         => api.get(`/affaires/${uid}/demandes`),
}

// ── Demandes ──────────────────────────────────────────────────────────────────
export const demandesApi = {
  list:     (params = {}) => api.get('/demandes?' + new URLSearchParams(params)),
  get:      (uid)         => api.get(`/demandes/${uid}`),
  create:   (data)        => api.post('/demandes', data),
  update:   (uid, data)   => api.patch(`/demandes/${uid}`, data),
  delete:   (uid)         => api.delete(`/demandes/${uid}`),
  nextRef:  ()            => api.get('/demandes/next-ref'),
  filters:  ()            => api.get('/demandes/filters'),
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
}

// ── Interventions ─────────────────────────────────────────────────────────────
export const interventionsApi = {
  list:   (params = {}) => api.get('/interventions?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/interventions/${uid}`),
  create: (data)        => api.post('/interventions', data),
  update: (uid, data)   => api.patch(`/interventions/${uid}`, data),
  delete: (uid)         => api.delete(`/interventions/${uid}`),
}

// ── Essais ────────────────────────────────────────────────────────────────────
export const essaisApi = {
  list:   (params = {}) => api.get('/essais?' + new URLSearchParams(params)),
  get:    (uid)         => api.get(`/essais/${uid}`),
  create: (data)        => api.post('/essais', data),
  update: (uid, data)   => api.patch(`/essais/${uid}`, data),
  delete: (uid)         => api.delete(`/essais/${uid}`),
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
    create: (d) => api.post('/admin/users', d),
    update: (id, d) => api.patch(`/admin/users/${id}`, d),
  },
  roles: {
    list:   () => api.get('/admin/roles'),
  },
}

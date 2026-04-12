/**
 * AdminPage.jsx — fidèle à admin.html legacy
 * 2 tabs: Utilisateurs + Rôles & Permissions
 */
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import UserProfileModal from '@/components/admin/UserProfileModal'

const ROLES = ['admin', 'labo', 'etudes', 'consult']
const ROLE_LABEL = { admin: 'Administrateur', labo: 'Laboratoire', etudes: 'Études', consult: 'Consultation' }

function Badge({ text }) {
  return <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[#f1efe8] text-[#5f5e5a]">{text}</span>
}

function FG({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
      {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
    </div>
  )
}

function buildUserForm(editUser) {
  if (editUser) {
    return {
      email: editUser.email,
      display_name: editUser.display_name,
      role_code: editUser.role_code,
      service_code: editUser.service_code || '',
      employment_level_code: editUser.employment_level_code || '',
      is_active: editUser.is_active,
    }
  }

  return {
    email: '',
    display_name: '',
    role_code: 'labo',
    service_code: '',
    employment_level_code: '',
    is_active: true,
  }
}

// ── User Modal ─────────────────────────────────────────────────────────────────
function UserModal({ open, onClose, editUser, employmentLevels }) {
  const qc = useQueryClient()
  const isEdit = !!editUser
  const [form, setForm] = useState(() => buildUserForm(editUser))

  useEffect(() => {
    if (open) setForm(buildUserForm(editUser))
  }, [editUser, open])

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/admin/users/${encodeURIComponent(editUser.email)}`, data)
      : api.post('/admin/users', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose() },
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'} size="sm">
      <div className="flex flex-col gap-3">
        <FG label="Email *" hint="Utilisé pour l'identification Windows">
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            readOnly={isEdit} className={isEdit ? 'text-text-muted' : ''}
            placeholder="prenom.nom@nge.fr" />
        </FG>
        <FG label="Nom affiché *">
          <Input value={form.display_name} onChange={e => set('display_name', e.target.value)}
            placeholder="Prénom Nom" />
        </FG>
        <FG label="Rôle">
          <Select value={form.role_code} onChange={e => set('role_code', e.target.value)} className="w-full">
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
          </Select>
        </FG>
        <FG label="Service / Code labo">
          <Input value={form.service_code} onChange={e => set('service_code', e.target.value)}
            placeholder="SP, PDC, CHB…" />
        </FG>
        <FG label="Emploi / niveau" hint="Patamar professionnel utilisé para tri e futura ficha de compétences">
          <Select value={form.employment_level_code} onChange={e => set('employment_level_code', e.target.value)} className="w-full">
            <option value="">Non renseigné</option>
            {employmentLevels.map(level => (
              <option key={level.employment_level_code} value={level.employment_level_code}>{level.label}</option>
            ))}
          </Select>
        </FG>
        {isEdit && (
          <FG label="Statut">
            <Select value={String(form.is_active)} onChange={e => set('is_active', e.target.value === 'true')} className="w-full">
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </Select>
          </FG>
        )}
        {mutation.error && (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{mutation.error.message}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="secondary">Annuler</Button>
          <Button onClick={() => mutation.mutate(form)} variant="primary"
            disabled={mutation.isPending || !form.email || !form.display_name}>
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('users')
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [profileUserEmail, setProfileUserEmail] = useState('')
  const [matrixDirty, setMatrixDirty] = useState({}) // { role_code: Set<perm> }

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.users.list(),
  })

  const { data: employmentLevels = [] } = useQuery({
    queryKey: ['admin-employment-levels'],
    queryFn: () => adminApi.employmentLevels.list(),
  })

  const { data: roles = [] } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => api.get('/admin/roles'),
    enabled: tab === 'roles',
  })

  const { data: perms = [] } = useQuery({
    queryKey: ['admin-perms'],
    queryFn: () => api.get('/admin/permissions'),
    enabled: tab === 'roles',
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ email, active }) => adminApi.users.toggleActive(email, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const savePermsMutation = useMutation({
    mutationFn: (data) => api.put('/admin/roles/permissions', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-roles'] }); setMatrixDirty({}) },
  })

  const selectedUser = users.find((candidate) => candidate.email === profileUserEmail) || null

  function openCreate() { setUserModalOpen(true) }
  function openEdit(u) { setProfileUserEmail(u.email) }

  // Matrix state — starts from loaded roles, modified locally
  const matrixState = {}
  roles.forEach(r => {
    matrixState[r.role_code] = new Set(
      (matrixDirty[r.role_code] !== undefined ? [...matrixDirty[r.role_code]] : r.permissions) || []
    )
  })

  function togglePerm(role_code, perm_code) {
    const current = matrixState[role_code] ? new Set(matrixState[role_code]) : new Set()
    if (current.has(perm_code)) current.delete(perm_code)
    else current.add(perm_code)
    setMatrixDirty(d => ({ ...d, [role_code]: current }))
  }

  function resetMatrix() {
    setMatrixDirty({})
  }

  function saveMatrix() {
    const payload = roles.map(r => ({
      role_code: r.role_code,
      permissions: [...(matrixState[r.role_code] || new Set())],
    }))
    savePermsMutation.mutate(payload)
  }

  const permLabel = (code) => {
    const p = perms.find(p => p.permission_code === code)
    return p?.label || code
  }

  return (
    <div className="flex flex-col gap-5 max-w-[1000px] mx-auto py-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">⚙️ Utilisateurs & Droits</h1>
        {tab === 'users' && (
          <Button variant="primary" onClick={openCreate}>+ Nouvel utilisateur</Button>
        )}
        {tab === 'roles' && (
          <div className="flex gap-2">
            <Button onClick={resetMatrix}>↺ Annuler</Button>
            <Button variant="primary" onClick={saveMatrix} disabled={savePermsMutation.isPending}>
              💾 Enregistrer
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {[['users','👤 Utilisateurs'],['roles','🔑 Rôles & Permissions']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Utilisateurs */}
      {tab === 'users' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['Nom','Email','Rôle','Emploi / niveau','Service','Statut','Permissions','Actions'].map(h => (
                  <th key={h} className="bg-bg px-4 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-text-muted">Chargement…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-text-muted">Aucun utilisateur</td></tr>
              ) : users.map(u => (
                <tr key={u.email} className="border-b border-border hover:bg-bg transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {(u.display_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <span className="text-[13px] font-medium">{u.display_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{u.email}</td>
                  <td className="px-4 py-3 text-xs">{ROLE_LABEL[u.role_code] || u.role_code}</td>
                  <td className="px-4 py-3 text-xs">{u.employment_level_label || '—'}</td>
                  <td className="px-4 py-3 text-xs">{u.service_code || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      u.is_active ? 'bg-[#eaf3de] text-[#3b6d11]' : 'bg-[#f1efe8] text-[#5f5e5a]'
                    }`}>
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(u.permissions || []).slice(0, 3).map(p => <Badge key={p} text={permLabel(p)} />)}
                      {(u.permissions || []).length > 3 && <Badge text={`+${u.permissions.length - 3}`} />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => openEdit(u)}>✏️</Button>
                      <Button size="sm"
                        onClick={() => toggleActiveMutation.mutate({ email: u.email, active: !u.is_active })}>
                        {u.is_active ? '🚫' : '✅'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Rôles & Permissions */}
      {tab === 'roles' && (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="bg-bg px-4 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border sticky left-0">
                  Permission
                </th>
                {roles.map(r => (
                  <th key={r.role_code} className="bg-bg px-4 py-2.5 text-center text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap">
                    {ROLE_LABEL[r.role_code] || r.role_code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perms.map(p => (
                <tr key={p.permission_code} className="border-b border-border hover:bg-bg">
                  <td className="px-4 py-2 sticky left-0 bg-surface">
                    <div className="text-xs font-medium">{p.label}</div>
                    <div className="text-[10px] text-text-muted">{p.permission_code}</div>
                  </td>
                  {roles.map(r => (
                    <td key={r.role_code} className="px-4 py-2 text-center">
                      <input type="checkbox"
                        checked={matrixState[r.role_code]?.has(p.permission_code) || false}
                        onChange={() => togglePerm(r.role_code, p.permission_code)}
                        className="w-4 h-4 accent-accent cursor-pointer" />
                    </td>
                  ))}
                </tr>
              ))}
              {perms.length === 0 && (
                <tr><td colSpan={roles.length + 1} className="px-4 py-8 text-center text-xs text-text-muted">Chargement…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <UserModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        editUser={null}
        employmentLevels={employmentLevels}
      />

      <UserProfileModal
        open={Boolean(profileUserEmail)}
        onClose={() => setProfileUserEmail('')}
        user={selectedUser}
        employmentLevels={employmentLevels}
      />
    </div>
  )
}

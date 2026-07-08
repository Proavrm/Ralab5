import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { adminApi } from '@/services/api'

function FG({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      {children}
      {hint ? <span className="text-[10px] text-text-muted leading-relaxed">{hint}</span> : null}
    </div>
  )
}

function StatusBadge({ active }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
      active ? 'bg-[#eaf3de] text-[#3b6d11]' : 'bg-[#f1efe8] text-[#5f5e5a]'
    }`}>
      {active ? 'Actif' : 'Inactif'}
    </span>
  )
}

function OrgRegionModal({ open, onClose, region, onSaved }) {
  const isCreate = !region?.code
  const [form, setForm] = useState({ code: '', label: '', is_active: true })

  useEffect(() => {
    if (!open) return
    setForm({
      code: region?.code || '',
      label: region?.label || '',
      is_active: region?.is_active !== false,
    })
  }, [open, region])

  const mutation = useMutation({
    mutationFn: () => adminApi.org.upsertRegion(form.code, {
      code: form.code,
      label: form.label,
      is_active: form.is_active,
    }),
    onSuccess: () => onSaved(),
  })

  return (
    <Modal open={open} onClose={onClose} title={isCreate ? 'Nouvelle région' : `Région ${region.code}`} size="sm">
      <div className="flex flex-col gap-3">
        <FG label="Code" hint="Ex. ARS — 2 à 12 caractères.">
          <Input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            readOnly={!isCreate}
            className={!isCreate ? 'text-text-muted' : ''}
            placeholder="ARS"
          />
        </FG>
        <FG label="Libellé">
          <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Auvergne-Rhône-Saône" />
        </FG>
        <FG label="Statut">
          <Select
            value={String(form.is_active)}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))}
            className="w-full"
          >
            <option value="true">Actif</option>
            <option value="false">Inactif</option>
          </Select>
        </FG>
        {mutation.error ? (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{mutation.error.message}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="secondary">Annuler</Button>
          <Button
            variant="primary"
            disabled={mutation.isPending || !form.code.trim() || !form.label.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function OrgAgenceModal({ open, onClose, agence, regions, onSaved }) {
  const isCreate = !agence?.code
  const [form, setForm] = useState({ code: '', label: '', region_code: '', is_active: true })

  useEffect(() => {
    if (!open) return
    setForm({
      code: agence?.code || '',
      label: agence?.label || '',
      region_code: agence?.region_code || regions[0]?.code || '',
      is_active: agence?.is_active !== false,
    })
  }, [open, agence, regions])

  const mutation = useMutation({
    mutationFn: () => adminApi.org.upsertAgence(form.code, {
      code: form.code,
      label: form.label,
      region_code: form.region_code,
      is_active: form.is_active,
    }),
    onSuccess: () => onSaved(),
  })

  return (
    <Modal open={open} onClose={onClose} title={isCreate ? 'Nouvelle agence' : `Agence ${agence.code}`} size="sm">
      <div className="flex flex-col gap-3">
        <FG label="Code" hint="Ex. RA, AUV — rattachée à une région.">
          <Input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            readOnly={!isCreate}
            className={!isCreate ? 'text-text-muted' : ''}
            placeholder="RA"
          />
        </FG>
        <FG label="Libellé">
          <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Rhône-Ain" />
        </FG>
        <FG label="Région">
          <Select
            value={form.region_code}
            onChange={(e) => setForm((f) => ({ ...f, region_code: e.target.value }))}
            className="w-full"
          >
            <option value="">— Sélectionner —</option>
            {regions.map((region) => (
              <option key={region.code} value={region.code}>{region.code} — {region.label}</option>
            ))}
          </Select>
        </FG>
        <FG label="Statut">
          <Select
            value={String(form.is_active)}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))}
            className="w-full"
          >
            <option value="true">Actif</option>
            <option value="false">Inactif</option>
          </Select>
        </FG>
        {mutation.error ? (
          <p className="text-danger text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{mutation.error.message}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} variant="secondary">Annuler</Button>
          <Button
            variant="primary"
            disabled={mutation.isPending || !form.code.trim() || !form.label.trim() || !form.region_code}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function OrgAdminPanel() {
  const qc = useQueryClient()
  const [regionModal, setRegionModal] = useState(null)
  const [agenceModal, setAgenceModal] = useState(null)

  const { data: regions = [], isLoading: regionsLoading } = useQuery({
    queryKey: ['admin-org-regions'],
    queryFn: () => adminApi.org.listRegions(),
  })

  const { data: agences = [], isLoading: agencesLoading } = useQuery({
    queryKey: ['admin-org-agences'],
    queryFn: () => adminApi.org.listAgences(),
  })

  function refreshOrg() {
    qc.invalidateQueries({ queryKey: ['admin-org-regions'] })
    qc.invalidateQueries({ queryKey: ['admin-org-agences'] })
    qc.invalidateQueries({ queryKey: ['admin-labs'] })
    qc.invalidateQueries({ queryKey: ['laboratoires-catalog'] })
  }

  const regionLabelByCode = Object.fromEntries(regions.map((r) => [r.code, r.label]))

  return (
    <section className="border-b border-border bg-[#f8fafc]">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div>
          <div className="text-sm font-semibold text-[#003170]">Organisation — régions & agences</div>
          <div className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
            Référentiel lu par les laboratoires, utilisateurs et filtres RST. Modifiable ici — rien n&apos;est codé en dur dans l&apos;interface.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-border">
        <div className="p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Régions</h3>
            <Button size="sm" variant="secondary" onClick={() => setRegionModal({ isNew: true })}>+ Région</Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg text-text-muted">
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-left px-3 py-2 font-medium">Libellé</th>
                  <th className="text-left px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {regionsLoading ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-text-muted">Chargement…</td></tr>
                ) : regions.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-text-muted">Aucune région</td></tr>
                ) : regions.map((region) => (
                  <tr key={region.code} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{region.code}</td>
                    <td className="px-3 py-2">{region.label}</td>
                    <td className="px-3 py-2"><StatusBadge active={region.is_active !== false} /></td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" onClick={() => setRegionModal(region)}>✏️</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Agences</h3>
            <Button size="sm" variant="secondary" onClick={() => setAgenceModal({ isNew: true })}>+ Agence</Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg text-text-muted">
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-left px-3 py-2 font-medium">Libellé</th>
                  <th className="text-left px-3 py-2 font-medium">Région</th>
                  <th className="text-left px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {agencesLoading ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-text-muted">Chargement…</td></tr>
                ) : agences.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-text-muted">Aucune agence</td></tr>
                ) : agences.map((agence) => (
                  <tr key={agence.code} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">{agence.code}</td>
                    <td className="px-3 py-2">{agence.label}</td>
                    <td className="px-3 py-2">
                      {agence.region_code}
                      {regionLabelByCode[agence.region_code] ? (
                        <span className="text-text-muted"> · {regionLabelByCode[agence.region_code]}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2"><StatusBadge active={agence.is_active !== false} /></td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" onClick={() => setAgenceModal(agence)}>✏️</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <OrgRegionModal
        open={Boolean(regionModal)}
        onClose={() => setRegionModal(null)}
        region={regionModal?.isNew ? null : regionModal}
        onSaved={() => { refreshOrg(); setRegionModal(null) }}
      />

      <OrgAgenceModal
        open={Boolean(agenceModal)}
        onClose={() => setAgenceModal(null)}
        agence={agenceModal?.isNew ? null : agenceModal}
        regions={regions.filter((r) => r.is_active !== false)}
        onSaved={() => { refreshOrg(); setAgenceModal(null) }}
      />
    </section>
  )
}

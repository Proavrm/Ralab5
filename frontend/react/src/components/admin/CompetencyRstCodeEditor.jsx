import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'

function FieldGroup({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-text">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-text-muted">{hint}</span> : null}
    </label>
  )
}

export default function CompetencyRstCodeEditor({ competencies = [] }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('')
  const [mappingFilter, setMappingFilter] = useState('all')
  const [pendingId, setPendingId] = useState(null)

  const rstOptionsQuery = useQuery({
    queryKey: ['admin-rst-code-options'],
    queryFn: () => adminApi.competencies.rstCodeOptions(),
  })

  const updateMutation = useMutation({
    mutationFn: ({ competencyId, rstCode }) => adminApi.competencies.updateRstCode(competencyId, {
      rst_code: rstCode || null,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-competencies'] }),
        queryClient.invalidateQueries({ queryKey: ['consignes-essais-catalog'] }),
      ])
    },
    onSettled: () => setPendingId(null),
  })

  const rstOptions = rstOptionsQuery.data?.options || []
  const mappedCount = competencies.filter((item) => item.rst_code).length

  const domains = useMemo(
    () => [...new Set(competencies.map((item) => item.domain).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [competencies],
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return competencies.filter((item) => {
      const matchesSearch = !normalizedSearch || [
        item.label,
        item.reference,
        item.domain,
        item.context_type,
        item.rst_code,
        item.rst_label,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch))
      const matchesDomain = !domainFilter || item.domain === domainFilter
      const matchesMapping = mappingFilter === 'all'
        || (mappingFilter === 'mapped' && item.rst_code)
        || (mappingFilter === 'unmapped' && !item.rst_code)
      return matchesSearch && matchesDomain && matchesMapping
    })
  }, [competencies, domainFilter, mappingFilter, search])

  const visibleRows = filteredRows.slice(0, 120)

  function handleRstChange(competencyId, nextValue) {
    setPendingId(competencyId)
    updateMutation.mutate({
      competencyId,
      rstCode: nextValue || null,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
        <FieldGroup label="Recherche catalogue" hint={`${filteredRows.length} essai(s) · ${mappedCount}/${competencies.length} mappé(s) RST`}>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Essai, norme NF, code RST…"
          />
        </FieldGroup>
        <FieldGroup label="Domaine">
          <Select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
            <option value="">Tous</option>
            {domains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </Select>
        </FieldGroup>
        <FieldGroup label="Mapping RST">
          <Select value={mappingFilter} onChange={(event) => setMappingFilter(event.target.value)}>
            <option value="all">Tous</option>
            <option value="mapped">Avec code RST</option>
            <option value="unmapped">Sans code RST</option>
          </Select>
        </FieldGroup>
      </div>

      <p className="text-[11px] text-text-muted leading-relaxed">
        Association utilisée dans les consignes passation / demande / préparation.
        Les codes vides restent visibles dans le catalogue mais sans sigle RST.
      </p>

      {updateMutation.error ? (
        <p className="text-xs text-danger">{updateMutation.error.message}</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {['Essai', 'Référence', 'Domaine', 'Contexte', 'Code RST'].map((header) => (
                <th key={header} className="border-b border-border bg-bg px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((item) => {
              const saving = pendingId === item.competency_id && updateMutation.isPending
              return (
                <tr key={item.competency_id} className="border-b border-border align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-text">{item.label}</div>
                    {item.rst_label ? (
                      <div className="mt-1 text-[11px] text-text-muted">{item.rst_label}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-muted">{item.reference || '—'}</td>
                  <td className="px-3 py-2 text-xs">{item.domain}</td>
                  <td className="px-3 py-2 text-xs">{item.context_type}</td>
                  <td className="px-3 py-2 min-w-[180px]">
                    <Select
                      value={item.rst_code || ''}
                      disabled={saving}
                      onChange={(event) => handleRstChange(item.competency_id, event.target.value)}
                      className="text-xs"
                    >
                      <option value="">— sans code RST —</option>
                      {rstOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.code} — {option.label}
                        </option>
                      ))}
                    </Select>
                    {saving ? <div className="mt-1 text-[10px] text-text-muted">Enregistrement…</div> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filteredRows.length > visibleRows.length ? (
        <p className="text-[11px] text-text-muted">
          Affichage limité aux {visibleRows.length} premiers résultats. Affinez la recherche pour cibler un essai.
        </p>
      ) : null}

      {filteredRows.length === 0 ? (
        <p className="text-xs text-text-muted">Aucun essai ne correspond aux filtres.</p>
      ) : null}

      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-competencies'] })}
        >
          Actualiser le catalogue
        </Button>
      </div>
    </div>
  )
}

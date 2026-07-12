import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar } from '@/components/layout/FicheLayout'
import { qualiteApi } from '@/services/api'
import { formatDate } from '@/lib/utils'

const REGISTER_BADGE_CLASS = {
  FNC: 'bg-red-100 text-red-800',
  FAE: 'bg-emerald-100 text-emerald-800',
  BP: 'bg-blue-100 text-blue-800',
  INFO: 'bg-slate-200 text-slate-700',
  QSSE: 'bg-amber-100 text-amber-800',
  RV: 'bg-orange-100 text-orange-800',
  EPI: 'bg-violet-100 text-violet-800',
}

function buildQuery(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

function formatCurrency(value) {
  if (value == null || value === '') return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function registerTone(registerCode) {
  return REGISTER_BADGE_CLASS[registerCode] || 'bg-slate-100 text-slate-700'
}

function extractYearCount(yearRows, targetYear) {
  return yearRows.find((row) => Number(row.source_year) === targetYear)?.row_count || 0
}

export default function QsseFncWorkspacePage({ context = 'qualite' }) {
  const qc = useQueryClient()
  const [year, setYear] = useState('ALL')
  const [register, setRegister] = useState('ALL')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState(null)

  const overviewQuery = useQuery({
    queryKey: ['qualite-qsse-overview', year],
    queryFn: () => qualiteApi.qsse.overview(buildQuery({ year: year === 'ALL' ? '' : year })),
    refetchInterval: 30000,
  })

  const recordsQuery = useQuery({
    queryKey: ['qualite-qsse-records', year, register, search],
    queryFn: () =>
      qualiteApi.qsse.records(
        buildQuery({
          year: year === 'ALL' ? '' : year,
          register_code: register === 'ALL' ? '' : register,
          search,
          limit: 250,
        }),
      ),
  })

  const refreshLiveMutation = useMutation({
    mutationFn: () => qualiteApi.qsse.refreshLive(true),
    onSuccess: (payload) => {
      const inserted = payload?.result?.inserted_count || 0
      setNotice({
        type: 'success',
        text: `Atualização 2026 concluída: ${inserted} linhas reimportadas da fonte live.`,
      })
      qc.invalidateQueries({ queryKey: ['qualite-qsse-overview'] })
      qc.invalidateQueries({ queryKey: ['qualite-qsse-records'] })
    },
    onError: (error) => {
      setNotice({
        type: 'error',
        text: error?.message || 'Falha ao atualizar a fonte live 2026.',
      })
    },
  })

  const totals = overviewQuery.data?.totals || {}
  const yearRows = overviewQuery.data?.years || []
  const registerRows = overviewQuery.data?.registers || []
  const records = recordsQuery.data?.items || []
  const totalRows = recordsQuery.data?.total || 0
  const records2025 = totals.records_2025 ?? extractYearCount(yearRows, 2025)
  const records2026 = totals.records_2026 ?? extractYearCount(yearRows, 2026)
  const latestLiveRun = overviewQuery.data?.latest_live_run

  const pageMeta = useMemo(() => {
    if (context === 'dashboard') {
      return {
        title: 'Dashboard QSSE / FNC',
        subtitle: 'Pilotage cross-year (2025 + 2026) com foco operacional para decisões rápidas.',
        switchTo: '/qualite/qsse-fnc',
        switchLabel: 'Abrir versão Qualité',
      }
    }

    return {
      title: 'Qualité · QSSE / FNC',
      subtitle: 'Registos QSSE integrados com leitura unificada dos snapshots 2025 e da fonte live 2026.',
      switchTo: '/dashboard/qsse-fnc',
      switchLabel: 'Abrir versão Dashboard',
    }
  }, [context])

  return (
    <FichePageShell>
      <FicheTopbar
        eyebrow="Qualité · QSSE"
        title={pageMeta.title}
        subtitle={pageMeta.subtitle}
      >
        <Link
          to={pageMeta.switchTo}
          className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-text-muted transition-colors hover:bg-bg hover:text-text"
        >
          {pageMeta.switchLabel}
        </Link>
        <Button
          variant="primary"
          size="sm"
          onClick={() => refreshLiveMutation.mutate()}
          disabled={refreshLiveMutation.isPending}
        >
          {refreshLiveMutation.isPending ? 'Atualizando…' : 'Atualizar fonte 2026'}
        </Button>
      </FicheTopbar>

      <FicheMain className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        {notice ? (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-border bg-bg p-3">
            <div className="text-xs text-text-muted">Total linhas</div>
            <div className="mt-1 text-2xl font-bold text-text">{totals.total_records ?? 0}</div>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <div className="text-xs text-text-muted">Eventos</div>
            <div className="mt-1 text-2xl font-bold text-text">{totals.event_records ?? 0}</div>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <div className="text-xs text-text-muted">Indicadores</div>
            <div className="mt-1 text-2xl font-bold text-text">{totals.indicator_records ?? 0}</div>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <div className="text-xs text-text-muted">Snapshot 2025</div>
            <div className="mt-1 text-2xl font-bold text-text">{records2025}</div>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <div className="text-xs text-text-muted">Fonte live 2026</div>
            <div className="mt-1 text-2xl font-bold text-text">{records2026}</div>
          </div>
        </div>

        <div className="mt-3 text-xs text-text-muted">
          {latestLiveRun
            ? `Última atualização live: ${formatDate(latestLiveRun.updated_at)} · ${latestLiveRun.inserted_count || 0} inseridas`
            : 'Ainda sem atualização live registada.'}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Ano</label>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="h-9 rounded-md border border-border bg-bg px-3 text-sm"
            >
              <option value="ALL">2025 + 2026</option>
              <option value="2026">2026 (live)</option>
              <option value="2025">2025 (archive)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Registre</label>
            <select
              value={register}
              onChange={(event) => setRegister(event.target.value)}
              className="h-9 rounded-md border border-border bg-bg px-3 text-sm"
            >
              <option value="ALL">Todos</option>
              {registerRows.map((row) => (
                <option key={row.register_code} value={row.register_code}>
                  {row.register_code} ({row.row_count})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label className="text-xs font-medium text-text-muted">Pesquisa</label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Título, agência, chantier, descrição..."
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Registos QSSE / FNC</h2>
          <span className="text-xs text-text-muted">{totalRows} linhas filtradas</span>
        </div>

        <div className="h-full overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-bg text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2">Ano</th>
                <th className="px-4 py-2">Registre</th>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Titre</th>
                <th className="px-4 py-2">Chantier / Site</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Coût</th>
                <th className="px-4 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {recordsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-text-muted">Chargement QSSE...</td>
                </tr>
              ) : null}

              {!recordsQuery.isLoading && records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-text-muted">Nenhum registo para os filtros atuais.</td>
                </tr>
              ) : null}

              {!recordsQuery.isLoading
                ? records.map((row) => (
                    <tr key={row.id} className="border-t border-border/70 align-top hover:bg-bg/60">
                      <td className="px-4 py-2 font-medium text-text">{row.source_year}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${registerTone(row.register_code)}`}>
                          {row.register_code}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-text-muted">{row.date_event ? formatDate(row.date_event) : '—'}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-text">{row.title || '—'}</div>
                        <div className="text-xs text-text-muted">{row.sheet_name}</div>
                      </td>
                      <td className="px-4 py-2 text-text-muted">{row.site || row.agency || '—'}</td>
                      <td className="px-4 py-2 text-text-muted">{row.status || '—'}</td>
                      <td className="px-4 py-2 text-text-muted">{formatCurrency(row.amount_value)}</td>
                      <td className="px-4 py-2 text-text-muted">{row.source_mode}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </div>
      </FicheMain>
    </FichePageShell>
  )
}

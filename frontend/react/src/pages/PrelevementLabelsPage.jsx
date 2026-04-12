import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Card, { CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import Input, { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { cn, formatDate } from '@/lib/utils'
import { getPrelevementReferenceDate, normalizePrelevement, prelevementHasArrival, prelevementIsReadyForLab, prelevementNeedsReceptionCompletion } from '@/lib/prelevements'
import { prelevementsApi } from '@/services/api'
import { Printer, Search } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

const KNOWN_LABOS = ['AUV', 'SP', 'PT', 'CLM', 'CHB']

const VIEW_OPTIONS = [
  { key: 'all', label: 'Tous' },
  { key: 'arrivals', label: 'Arrivages' },
  { key: 'to-complete', label: 'À compléter' },
  { key: 'ready', label: 'Prêts labo' },
]

const FORMAT_OPTIONS = {
  compact: { key: 'compact', label: 'Compacte 62 × 30 mm', widthMm: 62, heightMm: 30 },
  standard: { key: 'standard', label: 'Standard 90 × 50 mm', widthMm: 90, heightMm: 50 },
}

const USAGE_OPTIONS = [
  { key: 'labo', label: 'Réception labo', footer: 'À coller à la réception laboratoire' },
  { key: 'terrain', label: 'Terrain / chantier', footer: 'À poser dès le prélèvement sur chantier' },
  { key: 'neutral', label: 'Neutre', footer: 'Étiquette logistique prélèvement' },
]

const CODE_OPTIONS = [
  { key: 'barcode', label: 'Code-barres Code 128' },
  { key: 'qr', label: 'QR code' },
]

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function hasCodeMarker(value, code) {
  const upper = String(value || '').trim().toUpperCase()
  if (!upper || !code) return false
  return upper === code
    || upper.includes(`-${code}-`)
    || upper.startsWith(`${code}-`)
    || upper.endsWith(`-${code}`)
}

function matchesLaboCode(code, ...values) {
  const normalizedCode = normalizeCode(code)
  if (!normalizedCode) return true

  return values.some((value) => {
    if (!value) return false
    if (hasCodeMarker(value, normalizedCode)) return true
    return normalizeText(value).includes(normalizeText(normalizedCode))
  })
}

function matchesSearch(row, search) {
  const normalizedSearch = normalizeText(search)
  if (!normalizedSearch) return true
  return [
    row.reference,
    row.description,
    row.demandeReference,
    row.affaireReference,
    row.chantier,
    row.site,
    row.zone,
    row.materiau,
    row.receptionOwner,
    row.interventionReference,
  ]
    .filter(Boolean)
    .some((value) => normalizeText(value).includes(normalizedSearch))
}

function filterByView(row, view) {
  if (view === 'arrivals') return prelevementHasArrival(row)
  if (view === 'to-complete') return prelevementNeedsReceptionCompletion(row)
  if (view === 'ready') return prelevementIsReadyForLab(row)
  return true
}

function parseUidList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function clampCopies(value) {
  const parsed = Number.parseInt(String(value || '1'), 10)
  if (Number.isNaN(parsed)) return 1
  return Math.min(8, Math.max(1, parsed))
}

function getDisplayContext(row) {
  return [row.chantier, row.site, row.demandeReference].filter(Boolean).join(' · ') || 'Contexte à préciser'
}

function getDisplayOwner(row) {
  return row.receptionOwner || row.technicien || row.receptionnaire || 'Réceptionnaire à préciser'
}

function buildLabelRows(rows, copies) {
  return rows.flatMap((row) => Array.from({ length: copies }, (_, index) => ({ row, copyIndex: index + 1 })))
}

function buildPrelevementBarcodeValue(row) {
  return String(row.reference || row.uid || '').trim()
}

function buildPrelevementQrValue(row) {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/prelevements/${row.uid}`
  }
  return String(row.reference || row.uid || '').trim()
}

function BarcodeSvg({ value, compact }) {
  const markup = useMemo(() => {
    if (!value || typeof document === 'undefined') return ''
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try {
      JsBarcode(svgNode, value, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: compact ? 1.1 : 1.4,
        height: compact ? 18 : 26,
        background: 'transparent',
        lineColor: '#183332',
      })
      return svgNode.outerHTML
    } catch {
      return ''
    }
  }, [compact, value])

  if (!markup) return null

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1">
      <div className="w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: markup }} />
      <div className="truncate text-center font-mono text-[8px] font-semibold tracking-[0.12em] text-[#345250]">
        {value}
      </div>
    </div>
  )
}

function QrSvg({ value, size }) {
  const [markup, setMarkup] = useState('')

  useEffect(() => {
    let active = true
    if (!value) {
      setMarkup('')
      return () => {
        active = false
      }
    }

    QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: size,
      color: {
        dark: '#183332',
        light: '#0000',
      },
    })
      .then((nextMarkup) => {
        if (active) setMarkup(nextMarkup)
      })
      .catch(() => {
        if (active) setMarkup('')
      })

    return () => {
      active = false
    }
  }, [size, value])

  if (!markup) return null

  return <div className="shrink-0 overflow-hidden rounded-[6px] border border-[#d7e4e2] bg-white p-1" dangerouslySetInnerHTML={{ __html: markup }} />
}

function LabelMachineCode({ row, codeType, compact }) {
  const barcodeValue = buildPrelevementBarcodeValue(row)
  const qrValue = buildPrelevementQrValue(row)

  if (codeType === 'qr') {
    return <QrSvg value={qrValue} size={compact ? 62 : 96} />
  }

  return <BarcodeSvg value={barcodeValue} compact={compact} />
}

export default function PrelevementLabelsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryLabo = normalizeCode(searchParams.get('labo') || '')
  const querySearch = searchParams.get('q') || ''
  const queryView = VIEW_OPTIONS.some((item) => item.key === searchParams.get('view')) ? searchParams.get('view') : 'ready'
  const queryFormat = FORMAT_OPTIONS[searchParams.get('format')] ? searchParams.get('format') : 'compact'
  const queryUsage = USAGE_OPTIONS.some((item) => item.key === searchParams.get('usage')) ? searchParams.get('usage') : 'labo'
  const queryCode = CODE_OPTIONS.some((item) => item.key === searchParams.get('code')) ? searchParams.get('code') : 'barcode'
  const queryCopies = clampCopies(searchParams.get('copies'))
  const requestedUids = searchParams.get('uids') || ''
  const [selectedIds, setSelectedIds] = useState(() => new Set(parseUidList(requestedUids)))

  useEffect(() => {
    if (!requestedUids) return
    setSelectedIds(new Set(parseUidList(requestedUids)))
  }, [requestedUids])

  const prelevementsQuery = useQuery({
    queryKey: ['prelevements'],
    queryFn: () => prelevementsApi.list(),
  })

  const allRows = useMemo(
    () => (Array.isArray(prelevementsQuery.data) ? prelevementsQuery.data : []).map(normalizePrelevement),
    [prelevementsQuery.data]
  )

  const availableLabos = useMemo(() => {
    const discovered = allRows.map((row) => normalizeCode(row.laboCode)).filter(Boolean)
    return [...new Set([...KNOWN_LABOS, ...discovered, queryLabo].filter(Boolean))]
  }, [allRows, queryLabo])

  const filteredRows = useMemo(
    () => allRows
      .filter((row) => !queryLabo || matchesLaboCode(queryLabo, row.laboCode, row.reference, row.demandeReference, row.chantier, row.interventionReference))
      .filter((row) => filterByView(row, queryView))
      .filter((row) => matchesSearch(row, querySearch))
      .sort((left, right) => String(getPrelevementReferenceDate(right)).localeCompare(String(getPrelevementReferenceDate(left)))),
    [allRows, queryLabo, queryView, querySearch]
  )

  const selectedRows = useMemo(
    () => allRows.filter((row) => selectedIds.has(String(row.uid))),
    [allRows, selectedIds]
  )

  const labelFormat = FORMAT_OPTIONS[queryFormat]
  const usage = USAGE_OPTIONS.find((item) => item.key === queryUsage) || USAGE_OPTIONS[0]
  const codeType = CODE_OPTIONS.find((item) => item.key === queryCode) || CODE_OPTIONS[0]
  const labelRows = useMemo(
    () => buildLabelRows(selectedRows, queryCopies),
    [selectedRows, queryCopies]
  )

  function updateParams(nextValues) {
    const next = new URLSearchParams(searchParams)
    Object.entries(nextValues).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setSearchParams(next, { replace: true })
  }

  function toggleSelection(uid) {
    const key = String(uid)
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectVisibleRows() {
    setSelectedIds(new Set(filteredRows.map((row) => String(row.uid))))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function printLabels() {
    window.print()
  }

  return (
    <div className="labels-print-page flex flex-col gap-5">
      <div className="screen-only flex flex-col gap-4 rounded-[24px] border border-[#234e51]/15 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Étiquetage métier</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">Étiquettes prélèvements</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
              Prépare des étiquettes physiques pour l’arrivée laboratoire ou le marquage terrain des prélèvements. La vue permet de filtrer, sélectionner puis imprimer plusieurs exemplaires par prélèvement.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/prelevements')}>Retour prélèvements</Button>
            <Button variant="secondary" onClick={() => prelevementsQuery.refetch()} disabled={prelevementsQuery.isFetching}>
              Actualiser
            </Button>
            <Button variant="primary" onClick={printLabels} disabled={!labelRows.length}>
              <Printer size={14} />
              Imprimer
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-7">
          <div className="relative xl:col-span-2">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              value={querySearch}
              onChange={(event) => updateParams({ q: event.target.value })}
              placeholder="Référence, demande, chantier, matériau..."
              className="pl-9"
            />
          </div>

          <Select value={queryView} onChange={(event) => updateParams({ view: event.target.value !== 'all' ? event.target.value : '' })}>
            {VIEW_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </Select>

          <Select value={queryLabo} onChange={(event) => updateParams({ labo: event.target.value })}>
            <option value="">Tous les labos</option>
            {availableLabos.map((code) => <option key={code} value={code}>{code}</option>)}
          </Select>

          <Select value={queryFormat} onChange={(event) => updateParams({ format: event.target.value })}>
            {Object.values(FORMAT_OPTIONS).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </Select>

          <Select value={queryCode} onChange={(event) => updateParams({ code: event.target.value })}>
            {CODE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </Select>

          <div className="grid grid-cols-2 gap-3 xl:col-span-1">
            <Select value={queryUsage} onChange={(event) => updateParams({ usage: event.target.value })}>
              {USAGE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </Select>
            <Input
              type="number"
              min="1"
              max="8"
              value={queryCopies}
              onChange={(event) => updateParams({ copies: String(clampCopies(event.target.value)) })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="rounded-full border border-border bg-bg px-3 py-1">{filteredRows.length} prélèvement(s) dans le scope</span>
          <span className="rounded-full border border-border bg-bg px-3 py-1">{selectedRows.length} sélectionné(s)</span>
          <span className="rounded-full border border-border bg-bg px-3 py-1">{labelRows.length} étiquette(s) à imprimer</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_1fr]">
        <Card className="screen-only overflow-hidden">
          <CardHeader className="bg-bg/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Sélection</CardTitle>
                <p className="mt-1 text-xs text-text-muted">
                  Clique pour choisir les prélèvements à imprimer, puis ajuste le nombre d’exemplaires.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={selectVisibleRows} disabled={!filteredRows.length}>Tout visible</Button>
                <Button size="sm" variant="secondary" onClick={clearSelection} disabled={!selectedRows.length}>Effacer</Button>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
            {prelevementsQuery.isLoading ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">Chargement des prélèvements…</div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">
                Aucun prélèvement ne correspond aux filtres courants.
              </div>
            ) : filteredRows.map((row) => {
              const isSelected = selectedIds.has(String(row.uid))
              return (
                <div
                  key={row.uid}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelection(row.uid)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      toggleSelection(row.uid)
                    }
                  }}
                  className={cn(
                    'rounded-2xl border px-4 py-3 transition cursor-pointer',
                    isSelected ? 'border-accent bg-[#eef5ff]' : 'border-border bg-white hover:border-[#d8e6e1] hover:bg-[#f8fbfa]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(row.uid)}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text">{row.reference}</p>
                        {row.laboCode ? <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-text-muted">{row.laboCode}</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-text-muted">{row.description || row.materiau || 'Description à préciser'}</p>
                      <p className="mt-2 text-[11px] text-text-muted">{getDisplayContext(row)}</p>
                      <p className="mt-1 text-[11px] text-text-muted">{getDisplayOwner(row)} · {row.zone || row.quantite || 'Sans zone / quantité'}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardBody>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="screen-only flex items-center justify-between rounded-2xl border border-[#d9e5e4] bg-[#f8fbfa] px-4 py-3 text-sm text-text-muted">
            <span>Aperçu {labelFormat.label} · {usage.label} · {codeType.label}</span>
            <span>{selectedRows.length ? `${labelRows.length} étiquette(s) prêtes` : 'Sélectionne au moins un prélèvement'}</span>
          </div>

          {labelRows.length ? (
            <div className="prelevement-label-grid flex flex-wrap content-start gap-3">
              {labelRows.map(({ row, copyIndex }) => {
                const referenceDate = getPrelevementReferenceDate(row)
                const isCompact = labelFormat.key === 'compact'
                return (
                  <div
                    key={`${row.uid}-${copyIndex}`}
                    className="prelevement-label-card flex flex-col justify-between overflow-hidden rounded-[14px] border border-[#234e51]/20 bg-white px-3 py-2 shadow-sm"
                    style={{ width: `${labelFormat.widthMm}mm`, minHeight: `${labelFormat.heightMm}mm`, height: `${labelFormat.heightMm}mm` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#5e7170]">{usage.label}</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="rounded-full border border-[#d7e4e2] bg-[#f5faf9] px-2 py-0.5 text-[8px] font-semibold text-[#185fa5]">
                            {row.laboCode || 'LABO'}
                          </span>
                          <span className="text-[8px] uppercase tracking-[0.1em] text-[#647776]">{codeType.key === 'qr' ? 'QR' : 'BAR'}</span>
                        </div>
                      </div>
                      {codeType.key === 'qr' ? <LabelMachineCode row={row} codeType={codeType.key} compact={isCompact} /> : null}
                    </div>

                    <div className="mt-2 min-h-0 flex-1">
                      <div className={cn('font-mono font-black leading-none tracking-tight text-[#1a2a2a]', isCompact ? 'text-[18px]' : 'text-[24px]')}>
                        {row.reference}
                      </div>
                      <div className={cn('mt-1 overflow-hidden font-medium text-[#213536]', isCompact ? 'max-h-[24px] text-[10px] leading-[1.15]' : 'max-h-[42px] text-[12px] leading-[1.2]')}>
                        {row.description || row.materiau || 'Description à compléter'}
                      </div>
                      <div className={cn('mt-1 overflow-hidden text-[#4d6160]', isCompact ? 'max-h-[20px] text-[9px] leading-[1.15]' : 'max-h-[30px] text-[10px] leading-[1.2]')}>
                        {getDisplayContext(row)}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-col gap-0.5 border-t border-[#dbe8e5] pt-1 text-[8px] uppercase tracking-[0.06em] text-[#647776]">
                      {codeType.key === 'barcode' ? (
                        <div className="pb-1">
                          <LabelMachineCode row={row} codeType={codeType.key} compact={isCompact} />
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <span>{referenceDate ? formatDate(referenceDate) : 'Sans date'}</span>
                        <span>{row.zone || row.quantite || 'Réception'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{getDisplayOwner(row)}</span>
                        {queryCopies > 1 ? <span>Copie {copyIndex}/{queryCopies}</span> : <span>{row.demandeReference || 'Sans demande'}</span>}
                      </div>
                      {!isCompact ? <div className="truncate">{usage.footer}</div> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Card className="overflow-hidden">
              <CardBody className="flex min-h-[280px] items-center justify-center p-8 text-center text-sm text-text-muted">
                Sélectionne un ou plusieurs prélèvements pour générer l’aperçu des étiquettes physiques.
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
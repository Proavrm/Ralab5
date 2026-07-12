import { Fragment, useEffect, useMemo, useState } from 'react'
import { buildDistanceToLabCaption } from '@/lib/labGeo'
import Button from '@/components/ui/Button'
import DocumentDropModal from '@/components/demande/DocumentDropModal'
import {
  buildDocumentPathHoverText,
  buildDocumentStorageUrl,
  copyDocumentPathText,
  isDocumentImagePreviewable,
  openStoredDocument,
  todayIsoDate,
} from '@/lib/documentVersionDrop'
import { normalizeDocumentDropTypes, ITINERARY_TYPE, PLAN_SITUATION_TYPE, isItineraryType, isPlanSituationType } from '@/lib/documentDropCatalog'
import { buildSiteGeocodeAddress, findItineraryDocumentIndex, validateSiteGeocodeQuery } from '@/lib/sitePlanRequirements'

function formatDisplayDate(value) {
  const text = String(value || '').trim()
  if (!text) return '—'
  if (text.length >= 10 && text[4] === '-') {
    const [year, month, day] = text.slice(0, 10).split('-')
    return `${day}/${month}/${year}`
  }
  return text
}

function DocumentStoredPreview({ storedPath, onOpen }) {
  const path = String(storedPath || '').trim()
  if (!path) return null
  const url = buildDocumentStorageUrl(path)
  const isImage = isDocumentImagePreviewable(path)

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Ouvrir le fichier"
      className="shrink-0 overflow-hidden rounded border border-[#dbe1ea] bg-white hover:border-nge"
    >
      {isImage ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          width={56}
          height={36}
          className="block h-9 w-14 object-cover"
        />
      ) : (
        <span className="flex h-9 w-14 items-center justify-center text-[9px] font-bold uppercase tracking-wide text-[#69758a]">
          PDF
        </span>
      )}
    </button>
  )
}

function isSiteCaptureDocument(doc) {
  return isPlanSituationType(doc?.document_type) || isItineraryType(doc?.document_type)
}

function buildDocumentSections(documents = []) {
  const sections = []
  let current = null
  documents.forEach((doc, index) => {
    const kind = isSiteCaptureDocument(doc) ? 'site' : 'other'
    if (!current || current.kind !== kind) {
      current = { kind, items: [] }
      sections.push(current)
    }
    current.items.push({ doc, index })
  })
  return sections
}

function SiteCaptureSectionHeader({ colSpan = 7 }) {
  return (
    <tr className="bg-[#eef4ff]">
      <td colSpan={colSpan} className="border-y border-[#c7d7fe] px-2 py-2">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 text-[11px]">
          <span className="font-semibold text-[#1e3a8a]">Cartes chantier (OpenStreetMap)</span>
          <span className="text-[#475569] leading-relaxed">
            Plan de situation + itinéraire routier — une seule capture sur la ligne plan (bouton ci-dessous).
          </span>
        </div>
      </td>
    </tr>
  )
}

function OtherDocumentsSectionHeader({ colSpan = 7 }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-t-2 border-[#dbe1ea] bg-[#f8fafc] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#69758a]">
        Autres documents
      </td>
    </tr>
  )
}

function DocumentRow({
  doc,
  onChange,
  onRemove,
  onFileDrop,
  onCaptureFromAddress,
  onEditSitePlan,
  readOnly = false,
  enableFileDrop = true,
  fileDropDisabledMessage = '',
  isRequired = false,
  inSiteCaptureGroup = false,
  showG3TrackingColumns = false,
}) {
  const [isUploading, setIsUploading] = useState(false)

  function set(key, value) {
    if (readOnly) return
    onChange({ ...doc, [key]: value })
  }

  async function onVersionDrop(event) {
    event.preventDefault()
    if (readOnly || !enableFileDrop) {
      const hasFile = Boolean(event.dataTransfer?.files?.length)
      if (hasFile) {
        window.alert(
          fileDropDisabledMessage
            || 'Enregistrez d’abord la passation pour accéder au quadro C.',
        )
      }
      return
    }
    const firstFile = event.dataTransfer?.files?.[0]
    if (!firstFile || typeof onFileDrop !== 'function') return
    if (isUploading) return
    setIsUploading(true)
    try {
      await onFileDrop(firstFile)
    } finally {
      setIsUploading(false)
    }
  }

  function onVersionDragOver(event) {
    if (readOnly || !enableFileDrop) return
    event.preventDefault()
  }

  const storedPath = String(doc.stored_path || '').trim()
  const isItineraryRow = isItineraryType(doc.document_type)
  const isOsmCapture = /capture carte osm/i.test(String(doc.comment || ''))
  const pathHoverText = readOnly || !enableFileDrop
    ? fileDropDisabledMessage || 'Enregistrez la passation pour accéder au quadro C.'
    : buildDocumentPathHoverText(doc)
  const uploadedAt = String(doc.uploaded_at || '').trim()
  const missingRequired = isRequired && !storedPath

  return (
    <tr
      className={`border-b border-border ${
        missingRequired ? 'bg-amber-50/80' : inSiteCaptureGroup ? 'bg-[#f8faff]' : ''
      }`}
    >
      <td className="px-2 py-1.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <input
              value={doc.document_type ?? ''}
              onChange={(event) => set('document_type', event.target.value)}
              disabled={readOnly || isRequired || (inSiteCaptureGroup && isItineraryRow)}
              className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-nge disabled:opacity-60"
            />
            {isRequired ? (
              <span
                className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  missingRequired ? 'bg-amber-100 text-amber-900' : 'bg-[#eaf3de] text-[#3b6d11]'
                }`}
                title={missingRequired ? 'Plan de situation obligatoire — déposez le fichier' : 'Plan de situation renseigné'}
              >
                {missingRequired ? 'Obligatoire' : 'OK'}
              </span>
            ) : null}
          </div>
          {inSiteCaptureGroup && isItineraryRow ? (
            <span className="text-[9px] leading-snug text-[#64748b]">
              Enregistré automatiquement avec le plan (même capture OSM).
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={!!doc.is_received}
          onChange={(event) => set('is_received', event.target.checked)}
          disabled={readOnly}
          className="w-4 h-4 accent-nge disabled:opacity-60"
        />
      </td>
      {showG3TrackingColumns ? (
        <td className="px-2 py-1.5 text-center">
          <input
            type="checkbox"
            checked={!!doc.is_analyzed}
            onChange={(event) => set('is_analyzed', event.target.checked)}
            disabled={readOnly}
            title="Document analysé"
            className="w-4 h-4 accent-nge disabled:opacity-60"
          />
        </td>
      ) : null}
      {showG3TrackingColumns ? (
        <td className="px-2 py-1.5 text-center">
          <input
            type="checkbox"
            checked={!!doc.used_in_report}
            onChange={(event) => set('used_in_report', event.target.checked)}
            disabled={readOnly}
            title="Utilisé dans le rapport G3"
            className="w-4 h-4 accent-nge disabled:opacity-60"
          />
        </td>
      ) : null}
      <td className="px-2 py-1.5 min-w-[220px]">
        <div className="flex items-center gap-1.5">
          {(storedPath && (isRequired || (isItineraryRow && isOsmCapture))) ? (
            <DocumentStoredPreview
              storedPath={storedPath}
              onOpen={() => openStoredDocument(storedPath)}
            />
          ) : null}
          <input
            value={doc.version ?? ''}
            onChange={(event) => set('version', event.target.value)}
            onDragOver={onVersionDragOver}
            onDrop={onVersionDrop}
            title={pathHoverText}
            placeholder={isUploading ? 'Envoi…' : 'Version ou fichier…'}
            disabled={readOnly || isUploading}
            className="min-w-[10rem] flex-1 px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-nge disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => openStoredDocument(storedPath)}
            disabled={readOnly || !storedPath}
            title={storedPath ? `Ouvrir le fichier\n${storedPath}` : 'Aucun fichier enregistré'}
            className="shrink-0 px-1.5 py-1 border border-border rounded text-[10px] leading-none hover:border-nge disabled:opacity-40"
          >
            Ouvrir
          </button>
          <button
            type="button"
            onClick={() => copyDocumentPathText(storedPath)}
            disabled={readOnly || !storedPath}
            title={storedPath ? `Copier le chemin serveur\n${storedPath}` : 'Aucun chemin serveur'}
            className="shrink-0 px-1.5 py-1 border border-border rounded text-[10px] leading-none hover:border-nge disabled:opacity-40"
          >
            Chemin
          </button>
          {isRequired && typeof onEditSitePlan === 'function' && storedPath ? (
            <button
              type="button"
              onClick={onEditSitePlan}
              disabled={readOnly || !enableFileDrop || isUploading}
              title="Modifier le zonage chantier sur le plan de situation existant"
              className="shrink-0 px-1.5 py-1 border border-[#16a34a] rounded text-[10px] leading-none text-[#16a34a] hover:bg-[#ecfdf3] disabled:opacity-40"
            >
              Zonage
            </button>
          ) : null}
          {isRequired && typeof onCaptureFromAddress === 'function' ? (
            <button
              type="button"
              onClick={onCaptureFromAddress}
              disabled={readOnly || !enableFileDrop || isUploading}
              title={
                storedPath
                  ? 'Regénère le plan de situation et l’itinéraire routier depuis l’adresse chantier (les deux fichiers seront remplacés)'
                  : 'Capture OpenStreetMap : génère le plan de situation et l’itinéraire routier en une seule opération'
              }
              className="shrink-0 max-w-[9.5rem] px-1.5 py-1 border border-[#3b5bdb] rounded text-[10px] leading-tight text-center text-[#3b5bdb] hover:bg-[#eef4ff] disabled:opacity-40"
            >
              {storedPath ? 'Regénérer plan + itinéraire' : 'Plan + itinéraire (OSM)'}
            </button>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input
          type="date"
          value={doc.document_date ?? ''}
          onChange={(event) => set('document_date', event.target.value || null)}
          disabled={readOnly}
          title="Date de réception du document (client / MO)"
          className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-nge disabled:opacity-60"
        />
      </td>
      <td className="px-2 py-1.5">
        <div
          className="flex items-center gap-1.5 min-w-[7rem]"
          title={uploadedAt ? 'Date de dépôt du fichier sur RaLab (automatique au glisser-déposer)' : 'Renseignée automatiquement au glisser-déposer'}
        >
          <span className={`text-xs ${uploadedAt ? 'text-text' : 'text-text-muted italic'}`}>
            {formatDisplayDate(uploadedAt)}
          </span>
          {uploadedAt ? (
            <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-[#eef4ff] text-[#3b5bdb]">
              auto
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={doc.comment ?? ''}
          onChange={(event) => set('comment', event.target.value)}
          disabled={readOnly}
          className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-nge disabled:opacity-60"
        />
      </td>
      <td className="px-2 py-1.5">
        {!readOnly ? (
          <button type="button" onClick={onRemove} className="text-danger text-xs hover:opacity-70">
            ✕
          </button>
        ) : null}
      </td>
    </tr>
  )
}

export default function DocumentTrackingTable({
  documents = [],
  onChange,
  onSave,
  isSaving = false,
  uploadDocument,
  deleteStoredFile,
  captureSitePlan,
  documentTypeOptions = [],
  siteGeocodeParts = { adresseOuvrage: '', site: '' },
  distanceToLab = null,
  readOnly = false,
  enableFileDrop = true,
  fileDropDisabledMessage = '',
  requiredDocumentTypes = [PLAN_SITUATION_TYPE],
  subtitle = 'Cartes chantier (plan + itinéraire) via capture OSM sur la ligne plan · autres pièces par glisser-déposer.',
  saveLabel = 'Enregistrer documents',
  showDistanceToLab = true,
  showG3TrackingColumns = false,
}) {
  const [dropModal, setDropModal] = useState({
    open: false,
    file: null,
    rowIndex: null,
    initialStep: 'type',
    initialSitePlanMeta: null,
    replaceStoredPath: '',
    replaceItineraryStoredPath: '',
  })
  const [liveDistanceToLab, setLiveDistanceToLab] = useState(distanceToLab)

  useEffect(() => {
    setLiveDistanceToLab(distanceToLab ?? null)
  }, [distanceToLab])

  const distanceCaption = buildDistanceToLabCaption(liveDistanceToLab)

  const typeOptions = useMemo(
    () => normalizeDocumentDropTypes(documentTypeOptions),
    [documentTypeOptions],
  )

  const defaultSiteAddress = useMemo(
    () => buildSiteGeocodeAddress(siteGeocodeParts),
    [siteGeocodeParts?.adresseOuvrage, siteGeocodeParts?.site],
  )

  const requiredTypeKeys = useMemo(
    () => new Set((requiredDocumentTypes || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)),
    [requiredDocumentTypes],
  )

  function isRequiredDocument(doc) {
    const key = String(doc?.document_type || '').trim().toLowerCase()
    return Boolean(key && requiredTypeKeys.has(key))
  }

  const useDropModal = Boolean(
    enableFileDrop
    && (typeof uploadDocument === 'function' || captureSitePlan)
    && typeOptions.length > 0,
  )

  function updateDocument(index, doc) {
    onChange(documents.map((item, itemIndex) => (itemIndex === index ? doc : item)))
  }

  function openDropModal(rowIndex, file, options = {}) {
    setDropModal({
      open: true,
      file,
      rowIndex,
      initialStep: options.initialStep || 'type',
      initialSitePlanMeta: options.initialSitePlanMeta || null,
      replaceStoredPath: options.replaceStoredPath || '',
      replaceItineraryStoredPath: options.replaceItineraryStoredPath || '',
    })
  }

  function closeDropModal() {
    setDropModal({
      open: false,
      file: null,
      rowIndex: null,
      initialStep: 'type',
      initialSitePlanMeta: null,
      replaceStoredPath: '',
      replaceItineraryStoredPath: '',
    })
  }

  const documentSections = useMemo(() => buildDocumentSections(documents), [documents])

  function openCaptureFromAddress(rowIndex) {
    const geocodeErr = validateSiteGeocodeQuery(siteGeocodeParts)
    if (geocodeErr) {
      window.alert(geocodeErr)
      return
    }
    if (!captureSitePlan?.geocode || !captureSitePlan?.preview || !captureSitePlan?.save) {
      window.alert('Capture carte indisponible pour cette affaire.')
      return
    }
    const existingPath = String(documents[rowIndex]?.stored_path || '').trim()
    if (existingPath) {
      const confirmed = window.confirm(
        'Regénérer le plan de situation et l’itinéraire routier depuis l’adresse ?\n\nLes deux fichiers (plan + itinéraire) seront remplacés.',
      )
      if (!confirmed) return
    }
    const itinIndex = findItineraryDocumentIndex(documents)
    const replaceItinPath = itinIndex >= 0 ? String(documents[itinIndex]?.stored_path || '').trim() : ''
    openDropModal(rowIndex, null, {
      initialStep: 'plan-capture',
      replaceItineraryStoredPath: replaceItinPath,
    })
  }

  async function openEditSitePlan(rowIndex) {
    const storedPath = String(documents[rowIndex]?.stored_path || '').trim()
    if (!storedPath) {
      window.alert('Aucun plan de situation enregistré.')
      return
    }
    if (!captureSitePlan?.loadMeta) {
      window.alert('Réédition du zonage indisponible pour cette affaire.')
      return
    }
    try {
      const meta = await captureSitePlan.loadMeta(storedPath)
      openDropModal(rowIndex, null, {
        initialStep: 'plan-capture',
        initialSitePlanMeta: meta,
        replaceStoredPath: storedPath,
      })
    } catch (error) {
      window.alert(error?.message || 'Impossible de charger les métadonnées du plan de situation.')
    }
  }

  function buildUpdatedDocument(rowIndex, patch) {
    const current = documents[rowIndex] || {}
    return {
      ...current,
      ...patch,
    }
  }

  async function persistDocuments(nextDocuments) {
    onChange(nextDocuments)
    if (typeof onSave === 'function') {
      await onSave(nextDocuments)
    }
  }

  async function handleRowFileDrop(rowIndex, file) {
    if (useDropModal) {
      openDropModal(rowIndex, file)
      return
    }
    if (typeof uploadDocument !== 'function') return
    const result = await uploadDocument(file)
    if (!result?.stored_path) return
    updateDocument(rowIndex, {
      ...documents[rowIndex],
      version: String(result.version || file.name || '').trim(),
      stored_path: String(result.stored_path || '').trim(),
      uploaded_at: todayIsoDate(),
      is_received: true,
    })
  }

  async function handleModalUpload(file, meta) {
    const rowIndex = dropModal.rowIndex
    if (rowIndex == null) return

    let result = meta?.uploadResult
    if (meta?.source !== 'map_capture') {
      if (!file || typeof uploadDocument !== 'function') {
        throw new Error('Envoi de fichier indisponible.')
      }
      result = await uploadDocument(file, { documentType: meta?.documentType })
    }
    if (!result?.stored_path) {
      throw new Error('Enregistrement fichier incomplet.')
    }

    const current = documents[rowIndex] || {}
    if (meta?.source === 'map_capture' && result?.capture?.distance_to_lab) {
      setLiveDistanceToLab(result.capture.distance_to_lab)
    }

    const captureComment = meta?.source === 'map_capture'
      ? (() => {
        const zoneCount = Array.isArray(result?.capture?.zones) ? result.capture.zones.length : 0
        return zoneCount > 0 ? 'Capture carte OSM · plan · ' + zoneCount + ' zone(s)' : 'Capture carte OSM · plan'
      })()
      : ''
    const convertComment = result?.converted_to_image ? 'Converti en image' : ''
    const nextComment = captureComment || convertComment || current.comment || ''

    let nextDocuments = documents.map((item, itemIndex) => (
      itemIndex === rowIndex
        ? buildUpdatedDocument(rowIndex, {
          document_type: String(meta?.documentType || current.document_type || '').trim(),
          version: String(result.version || file?.name || current.version || '').trim(),
          stored_path: String(result.stored_path || '').trim(),
          uploaded_at: todayIsoDate(),
          is_received: true,
          comment: nextComment,
        })
        : item
    ))

    const secondary = meta?.secondaryCapture
    if (meta?.source === 'map_capture' && secondary?.uploadResult?.stored_path) {
      let itinIndex = findItineraryDocumentIndex(nextDocuments)
      if (itinIndex < 0) {
        nextDocuments = [
          ...nextDocuments.slice(0, rowIndex + 1),
          {
            document_type: ITINERARY_TYPE,
            is_received: true,
            version: String(secondary.uploadResult.version || '').trim(),
            document_date: null,
            uploaded_at: todayIsoDate(),
            comment: 'Capture carte OSM · itinéraire',
            stored_path: String(secondary.uploadResult.stored_path || '').trim(),
          },
          ...nextDocuments.slice(rowIndex + 1),
        ]
      } else {
        const itinCurrent = nextDocuments[itinIndex] || {}
        nextDocuments = nextDocuments.map((item, itemIndex) => (
          itemIndex === itinIndex
            ? buildUpdatedDocument(itinIndex, {
              document_type: ITINERARY_TYPE,
              version: String(secondary.uploadResult.version || itinCurrent.version || '').trim(),
              stored_path: String(secondary.uploadResult.stored_path || '').trim(),
              uploaded_at: todayIsoDate(),
              is_received: true,
              comment: 'Capture carte OSM · itinéraire',
            })
            : item
        ))
      }
    }

    try {
      await persistDocuments(nextDocuments)
    } catch (saveErr) {
      throw new Error(saveErr?.message || 'Fichier capturé mais enregistrement du quadro C impossible.')
    }
  }

  async function removeDocument(index) {
    if (readOnly) return
    const doc = documents[index]
    if (isRequiredDocument(doc)) {
      window.alert('Le plan de situation est obligatoire et ne peut pas être supprimé.')
      return
    }
    const storedPath = String(doc?.stored_path || '').trim()
    const label = String(doc?.document_type || doc?.version || 'document').trim()

    if (storedPath) {
      if (typeof deleteStoredFile === 'function') {
        const confirmed = window.confirm(
          `Supprimer la ligne « ${label} » et effacer le fichier sur le serveur ?\n\n${storedPath}`,
        )
        if (!confirmed) return
        try {
          await deleteStoredFile(storedPath)
        } catch (error) {
          window.alert(error?.message || 'Impossible de supprimer le fichier sur le serveur.')
          return
        }
      } else {
        const confirmed = window.confirm(
          `Supprimer la ligne « ${label} » ?\n\nLe fichier déjà déposé restera sur le serveur (affaire non sélectionnée).`,
        )
        if (!confirmed) return
      }
    }

    onChange(documents.filter((_, itemIndex) => itemIndex !== index))
  }

  function addDocument() {
    if (readOnly) return
    onChange([
      ...documents,
      {
        document_type: '',
        is_received: false,
        version: '',
        document_date: null,
        uploaded_at: null,
        comment: '',
        stored_path: '',
      },
    ])
  }

  const activeRow = dropModal.rowIndex != null ? documents[dropModal.rowIndex] : null
  const columnCount = 7 + (showG3TrackingColumns ? 2 : 0)
  const tableHeaders = [
    ['Document', ''],
    ['Reçu', ''],
    ...(showG3TrackingColumns ? [['Analysé', 'Document analysé'], ['Rapport', 'Utilisé dans le rapport G3']] : []),
    ['Version', 'Glisser-déposer un fichier sur cette cellule'],
    ['Réception', 'Date de réception du document (client / MO)'],
    ['Dépôt RaLab', 'Date de dépôt sur RaLab — remplie automatiquement au glisser-déposer'],
    ['Commentaire', ''],
    ['', ''],
  ]

  return (
    <div className="flex flex-col gap-3">
      {(readOnly || !enableFileDrop) && fileDropDisabledMessage ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-950">
          {fileDropDisabledMessage}
        </div>
      ) : null}
      {subtitle ? (
        <div className="text-[12px] text-[#69758a] leading-relaxed">{subtitle}</div>
      ) : null}
      {showDistanceToLab ? (
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-[12px] ${
            distanceCaption
              ? 'border-[#dbe1ea] bg-[#f6f8fb] text-text'
              : 'border-dashed border-[#dbe1ea] bg-white/70 text-text-muted'
          }`}
          title="Distance du chantier au laboratoire de référence"
        >
          <span className="font-medium text-text-muted">Distance chantier → labo</span>
          <span className={distanceCaption ? 'font-medium text-text' : 'italic'}>
            {distanceCaption || 'Non calculée — renseignez l’adresse ou capturez le plan de situation.'}
          </span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs mb-1">
          <thead>
            <tr className="border-b border-border">
              {tableHeaders.map(([heading, title]) => (
                <th
                  key={heading || 'actions'}
                  title={title}
                  className="px-2 py-1.5 text-left font-medium text-text-muted"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && readOnly ? (
              <tr>
                <td colSpan={columnCount} className="px-2 py-4 text-center text-text-muted italic">
                  Quadro indisponible tant que la passation n’est pas enregistrée.
                </td>
              </tr>
            ) : (
              documentSections.map((section, sectionIndex) => (
                <Fragment key={`${section.kind}-${sectionIndex}`}>
                  {section.kind === 'site' ? <SiteCaptureSectionHeader colSpan={columnCount} /> : (
                    sectionIndex > 0 ? <OtherDocumentsSectionHeader colSpan={columnCount} /> : null
                  )}
                  {section.items.map(({ doc, index }) => (
                    <DocumentRow
                      key={doc.uid ?? `doc-${index}`}
                      doc={doc}
                      onChange={(next) => updateDocument(index, next)}
                      onRemove={() => removeDocument(index)}
                      onFileDrop={(file) => handleRowFileDrop(index, file)}
                      onCaptureFromAddress={
                        isRequiredDocument(doc) && captureSitePlan
                          ? () => openCaptureFromAddress(index)
                          : undefined
                      }
                      onEditSitePlan={
                        isRequiredDocument(doc)
                          && captureSitePlan?.loadMeta
                          && String(doc?.stored_path || '').trim()
                          && /capture carte osm/i.test(String(doc?.comment || ''))
                          ? () => openEditSitePlan(index)
                          : undefined
                      }
                      readOnly={readOnly}
                      enableFileDrop={enableFileDrop}
                      fileDropDisabledMessage={fileDropDisabledMessage}
                      isRequired={isRequiredDocument(doc)}
                      inSiteCaptureGroup={section.kind === 'site'}
                      showG3TrackingColumns={showG3TrackingColumns}
                    />
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" onClick={addDocument}>
            + Ajouter document
          </Button>
          {onSave ? (
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? 'Enregistrement…' : saveLabel}
            </Button>
          ) : null}
        </div>
      ) : null}

      <DocumentDropModal
        open={dropModal.open}
        file={dropModal.file}
        initialDocumentType={activeRow?.document_type || PLAN_SITUATION_TYPE}
        initialStep={dropModal.initialStep}
        documentTypeOptions={typeOptions}
        defaultSiteAddress={defaultSiteAddress}
        defaultStreet={String(siteGeocodeParts?.adresseOuvrage || '').trim()}
        defaultLocality={String(siteGeocodeParts?.site || '').trim()}
        initialSitePlanMeta={dropModal.initialSitePlanMeta}
        replaceStoredPath={dropModal.replaceStoredPath}
        replaceItineraryStoredPath={dropModal.replaceItineraryStoredPath}
        onClose={closeDropModal}
        onUploadFile={handleModalUpload}
        onCaptureSitePlan={captureSitePlan}
      />
    </div>
  )
}

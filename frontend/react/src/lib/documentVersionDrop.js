function normalizeDroppedPath(rawPath) {
  const normalized = String(rawPath || '').trim().replace(/\\/g, '/')
  if (!normalized) return ''

  const withoutUri = normalized.replace(/^file:\/\//i, '')
  const withoutWindowsUriPrefix = withoutUri.replace(/^\/([A-Za-z]:\/)/, '$1')

  const workspaceAnchor = '/RaLab5/'
  const workspaceIdx = withoutWindowsUriPrefix.lastIndexOf(workspaceAnchor)
  if (workspaceIdx >= 0) {
    return withoutWindowsUriPrefix.slice(workspaceIdx + workspaceAnchor.length)
  }

  try {
    return decodeURIComponent(withoutWindowsUriPrefix)
  } catch {
    return withoutWindowsUriPrefix
  }
}

export function extractDroppedDocumentPath(event) {
  const dt = event?.dataTransfer
  if (!dt) return ''

  const uriList = String(dt.getData('text/uri-list') || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'))
  if (uriList) return normalizeDroppedPath(uriList)

  const plain = String(dt.getData('text/plain') || '').trim()
  if (plain) return normalizeDroppedPath(plain)

  return ''
}

export function extractFileNameFromPath(pathValue) {
  const normalized = String(pathValue || '').replace(/\\/g, '/').trim()
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : ''
}

export function buildDocumentStorageUrl(storedPath) {
  let path = String(storedPath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!path) return ''
  path = path.replace(/^storage\//i, '')
  const encoded = encodeURI(path).replace(/#/g, '%23')
  return `/api/storage/${encoded}`
}

export function isDocumentImagePreviewable(storedPath) {
  const name = String(storedPath || '').trim().toLowerCase()
  if (!name) return false
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)
}

export function openStoredDocument(storedPath) {
  const url = buildDocumentStorageUrl(storedPath)
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function copyDocumentPathText(textValue) {
  const text = String(textValue || '').trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard indisponible — pas bloquant.
  }
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

/** Applique un fichier déposé sur la colonne Version (upload serveur ou nom local). */
export async function applyDocumentVersionDrop(doc, event, options = {}) {
  event.preventDefault()

  const firstFile = event.dataTransfer?.files?.[0]
  if (!firstFile) return doc

  const uploadDocument = options.uploadDocument
  if (typeof uploadDocument === 'function') {
    try {
      const result = await uploadDocument(firstFile)
      if (!result?.stored_path) return doc
      return {
        ...doc,
        version: String(result.version || firstFile.name || doc.version || '').trim(),
        stored_path: String(result.stored_path || '').trim(),
        uploaded_at: todayIsoDate(),
        is_received: true,
      }
    } catch {
      return doc
    }
  }

  const droppedFileName = String(firstFile.name || '').trim()
  const webkitRelativePath = String(firstFile.webkitRelativePath || '').trim()
  const droppedPath = webkitRelativePath || extractDroppedDocumentPath(event)
  const inferredFileName = droppedFileName || extractFileNameFromPath(droppedPath)
  if (!inferredFileName && !droppedPath) return doc

  return {
    ...doc,
    version: inferredFileName || doc.version || '',
  }
}

export function buildDocumentPathHoverText(doc) {
  const storedPath = String(doc?.stored_path || '').trim()
  if (storedPath) {
    return `Fichier serveur : ${storedPath}\nGlisser un fichier pour remplacer`
  }
  return 'Glisser un fichier ici pour l’envoyer sur le serveur RaLab'
}

export function normalizePlanImagePath(rawPath) {
    let path = String(rawPath || '').trim()
    if (!path) return ''

    path = path.replaceAll('\\', '/')
    const storageIdx = path.toLowerCase().lastIndexOf('/storage/')
    if (storageIdx >= 0) {
        path = path.slice(storageIdx + '/storage/'.length)
    }
    path = path.replace(/^\/+/, '')
    path = path.replace(/^storage\//i, '')
    return path
}

export function buildStorageImageUrl(path) {
    if (!path) return null
    const encoded = encodeURI(path).replace(/#/g, '%23')
    return `/api/storage/${encoded}`
}

export function isStorageImagePath(rawPath) {
    const path = normalizePlanImagePath(rawPath)
    if (!path) return false
    if (/\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff)$/i.test(path)) return true
    return path.toLowerCase().startsWith('plans/')
}

export function planImageLabel(imagePath, fallback = '') {
    const path = normalizePlanImagePath(imagePath)
    if (!path) return fallback || 'Plan'
    const parts = path.split('/').filter(Boolean)
    return parts[parts.length - 1] || fallback || 'Plan'
}

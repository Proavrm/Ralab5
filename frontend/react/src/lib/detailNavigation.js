function isSafeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

export function buildLocationTarget(locationLike) {
  if (!locationLike?.pathname) return ''
  return `${locationLike.pathname}${locationLike.search || ''}`
}

export function resolveReturnTo(searchParams, fallback = '') {
  const raw = typeof searchParams?.get === 'function' ? searchParams.get('return_to') : ''
  return isSafeReturnTo(raw) ? raw : fallback
}

export function buildPathWithReturnTo(path, returnTo) {
  if (!isSafeReturnTo(returnTo)) return path

  const [pathWithoutHash, hash = ''] = String(path || '').split('#')
  const [pathname, query = ''] = pathWithoutHash.split('?')
  const params = new URLSearchParams(query)
  params.set('return_to', returnTo)
  const nextQuery = params.toString()

  return `${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash ? `#${hash}` : ''}`
}

export function navigateWithReturnTo(navigate, path, returnTo, options) {
  navigate(buildPathWithReturnTo(path, returnTo), options)
}

export function navigateBackWithFallback(navigate, searchParams, fallback = '') {
  const target = resolveReturnTo(searchParams, fallback)
  if (target) {
    navigate(target)
    return
  }
  navigate(-1)
}
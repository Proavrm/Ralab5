import { useEffect, useMemo, useState } from 'react'
import {
  getAvailableDashboardWidgets,
  getDefaultDashboardWidgetIds,
} from '@/lib/dashboardWidgets'

function buildStorageKey(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  return email ? `ralab_dashboard_preferences:${email}` : ''
}

function sanitizeWidgetIds(widgetIds, availableIds) {
  return widgetIds.filter((widgetId) => availableIds.has(widgetId))
}

function readStoredPreferences(storageKey, availableIds) {
  if (!storageKey) return null

  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const visibleWidgetIds = Array.isArray(parsed?.visibleWidgetIds)
      ? parsed.visibleWidgetIds
      : []

    return sanitizeWidgetIds(visibleWidgetIds, availableIds)
  } catch {
    return null
  }
}

export function useDashboardPreferences(user) {
  const availableWidgets = useMemo(() => getAvailableDashboardWidgets(user), [user])
  const availableWidgetIds = useMemo(
    () => new Set(availableWidgets.map((widget) => widget.id)),
    [availableWidgets]
  )
  const defaultWidgetIds = useMemo(
    () => getDefaultDashboardWidgetIds(user),
    [user]
  )
  const storageKey = useMemo(() => buildStorageKey(user), [user])

  const [visibleWidgetIds, setVisibleWidgetIds] = useState(defaultWidgetIds)

  useEffect(() => {
    const storedWidgetIds = readStoredPreferences(storageKey, availableWidgetIds)
    if (storedWidgetIds !== null) {
      setVisibleWidgetIds(storedWidgetIds)
      return
    }

    setVisibleWidgetIds(defaultWidgetIds)
  }, [availableWidgetIds, defaultWidgetIds, storageKey])

  useEffect(() => {
    if (!storageKey) return

    const sanitizedVisibleWidgetIds = sanitizeWidgetIds(visibleWidgetIds, availableWidgetIds)
    localStorage.setItem(
      storageKey,
      JSON.stringify({ visibleWidgetIds: sanitizedVisibleWidgetIds })
    )
  }, [availableWidgetIds, storageKey, visibleWidgetIds])

  function toggleWidget(widgetId) {
    if (!availableWidgetIds.has(widgetId)) return

    setVisibleWidgetIds((currentIds) => {
      if (currentIds.includes(widgetId)) {
        return currentIds.filter((currentId) => currentId !== widgetId)
      }

      return [...currentIds, widgetId]
    })
  }

  function resetWidgets() {
    setVisibleWidgetIds(defaultWidgetIds)
  }

  function isWidgetVisible(widgetId) {
    return visibleWidgetIds.includes(widgetId)
  }

  return {
    availableWidgets,
    defaultWidgetIds,
    visibleWidgetIds,
    isWidgetVisible,
    resetWidgets,
    toggleWidget,
  }
}
import { useState, useEffect } from 'react'

/**
 * Hook para gerenciar filtros (visibilidade + ordem) de items em gráficos
 * Persiste em localStorage automaticamente
 *
 * @param {string} storageKey - chave localStorage única (ex: "qad-quarterly-filter")
 * @param {string[]} defaultItems - items padrão (ex: ["FNC", "PASD", "AT", "BP", "FAE"])
 * @returns {object} { visibleItems, toggleItem, moveItem, allItems }
 */
export function useChartFilter(storageKey, defaultItems) {
  const [items, setItems] = useState(defaultItems)
  const [mounted, setMounted] = useState(false)
  const defaultItemsKey = Array.isArray(defaultItems) ? defaultItems.join('||') : ''

  // Carregar do localStorage na montagem
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Validar que todos os items ainda existem (em caso de mudanças de dados)
        const valid = parsed.filter((item) => defaultItems.includes(item))
        // Adicionar novos items que não estavam antes
        const missing = defaultItems.filter((item) => !valid.includes(item))
        setItems([...valid, ...missing])
      } catch {
        setItems(defaultItems)
      }
    }
    setMounted(true)
  }, [storageKey, defaultItemsKey])

  // Salvar em localStorage sempre que items mudam
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(storageKey, JSON.stringify(items))
    }
  }, [items, storageKey, mounted])

  const toggleItem = (item) => {
    setItems((prev) => {
      if (prev.includes(item)) {
        return prev.filter((i) => i !== item)
      } else {
        // Manter ordem: adicionar no final
        return [...prev, item]
      }
    })
  }

  const moveItem = (item, direction) => {
    setItems((prev) => {
      const idx = prev.indexOf(item)
      if (idx === -1) return prev

      if (direction === 'up' && idx > 0) {
        const newItems = [...prev]
        ;[newItems[idx], newItems[idx - 1]] = [newItems[idx - 1], newItems[idx]]
        return newItems
      }

      if (direction === 'down' && idx < prev.length - 1) {
        const newItems = [...prev]
        ;[newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]]
        return newItems
      }

      return prev
    })
  }

  return {
    visibleItems: items,
    toggleItem,
    moveItem,
    allItems: defaultItems,
    isVisible: (item) => items.includes(item),
  }
}

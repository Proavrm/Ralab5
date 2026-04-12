/**
 * useResizableColumns — redimensionnement des colonnes par glisser-déposer
 *
 * Usage:
 *   const { colWidths, startResize, getThProps } = useResizableColumns(defaultWidths)
 *
 *   <th style={getThProps(i).style} {...getThProps(i).handlers}>
 *     Colonne
 *     <span {...getThProps(i).resizer} />
 *   </th>
 */
import { useState, useCallback, useRef } from 'react'

export function useResizableColumns(defaultWidths) {
  const [widths, setWidths] = useState(defaultWidths)
  const dragging = useRef(null) // { index, startX, startWidth }

  const startResize = useCallback((index, e) => {
    e.preventDefault()
    dragging.current = { index, startX: e.clientX, startWidth: widths[index] }

    function onMove(e) {
      if (!dragging.current) return
      const { index, startX, startWidth } = dragging.current
      const delta = e.clientX - startX
      const newWidth = Math.max(60, startWidth + delta)
      setWidths(w => w.map((v, i) => i === index ? newWidth : v))
    }

    function onUp() {
      dragging.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [widths])

  // Retourne style + resizer pour chaque colonne
  function getColProps(index) {
    return {
      style: { width: widths[index], minWidth: widths[index], maxWidth: widths[index] },
      resizerProps: {
        onMouseDown: (e) => startResize(index, e),
        className: 'absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent/40 select-none',
        style: { userSelect: 'none' },
      }
    }
  }

  return { widths, setWidths, getColProps }
}

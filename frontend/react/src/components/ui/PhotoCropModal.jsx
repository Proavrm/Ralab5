import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { centerCrop, convertToPixelCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import Button from '@/components/ui/Button'

const ZOOM_MIN = 1
const ZOOM_STEP = 0.1

function resolveMaxZoom(naturalWidth, naturalHeight) {
  const longest = Math.max(Number(naturalWidth) || 0, Number(naturalHeight) || 0)
  if (longest >= 4000) return 4
  if (longest >= 2800) return 3.5
  if (longest >= 1800) return 3
  if (longest >= 1200) return 2.5
  return 2
}

function isLargeImage(naturalWidth, naturalHeight) {
  return Math.max(Number(naturalWidth) || 0, Number(naturalHeight) || 0) >= 1800
}

const ASPECT_PRESETS = {
    libre: { label: 'Recadrage libre', aspect: null },
    carotte: { label: 'Carotte (vertical)', aspect: 0.22 },
    original: { label: 'Ratio de la photo', aspect: 'original' },
    carre: { label: 'Carré', aspect: 1 },
}

function isMostlyDarkLine(data, width, height, lineIndex, axis = 'row') {
  const pixelCount = axis === 'row' ? width : height
  if (pixelCount <= 0) return true
  let darkPixels = 0

  for (let i = 0; i < pixelCount; i += 1) {
    const x = axis === 'row' ? i : lineIndex
    const y = axis === 'row' ? lineIndex : i
    const offset = (y * width + x) * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const a = data[offset + 3]
    const dark = a < 24 || (r < 22 && g < 22 && b < 22)
    if (dark) darkPixels += 1
  }

  return (darkPixels / pixelCount) >= 0.992
}

function trimDarkBorders(canvas) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const width = canvas.width
  const height = canvas.height
  if (width < 8 || height < 8) return canvas

  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  let top = 0
  let bottom = height - 1
  let left = 0
  let right = width - 1

  while (top < bottom && isMostlyDarkLine(data, width, height, top, 'row')) top += 1
  while (bottom > top && isMostlyDarkLine(data, width, height, bottom, 'row')) bottom -= 1
  while (left < right && isMostlyDarkLine(data, width, height, left, 'col')) left += 1
  while (right > left && isMostlyDarkLine(data, width, height, right, 'col')) right -= 1

  const trimWidth = right - left + 1
  const trimHeight = bottom - top + 1
  const keptSurfaceRatio = (trimWidth * trimHeight) / (width * height)
  if (trimWidth < 8 || trimHeight < 8 || keptSurfaceRatio < 0.25) return canvas

  const trimmed = document.createElement('canvas')
  trimmed.width = trimWidth
  trimmed.height = trimHeight
  const trimmedCtx = trimmed.getContext('2d')
  if (!trimmedCtx) return canvas
  trimmedCtx.drawImage(canvas, left, top, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight)
  return trimmed
}

function buildInitialCrop(mediaWidth, mediaHeight, aspectValue) {
  if (aspectValue && Number.isFinite(aspectValue)) {
    return centerCrop(
      makeAspectCrop({ unit: '%', width: 88 }, aspectValue, mediaWidth, mediaHeight),
      mediaWidth,
      mediaHeight,
    )
  }
  return {
    unit: '%',
    x: 3,
    y: 1,
    width: 94,
    height: 98,
  }
}

function getCanvasCrop(image, crop) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx || !crop?.width || !crop?.height) return null

  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  const pixelWidth = Math.round(crop.width * scaleX)
  const pixelHeight = Math.round(crop.height * scaleY)

  canvas.width = Math.max(1, pixelWidth)
  canvas.height = Math.max(1, pixelHeight)

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    pixelWidth,
    pixelHeight,
  )

  return canvas
}

export default function PhotoCropModal({
  open,
  imageSrc,
  title = 'Recadrer la photo',
  aspect = null,
  initialAspectPreset = 'libre',
  outputFilename = 'carotte-crop.jpg',
  onCancel,
  onConfirm,
  saving = false,
}) {
  const imgRef = useRef(null)
  const cropRef = useRef()
  const [workingSrc, setWorkingSrc] = useState('')
  const [crop, setCrop] = useState()
  const [completedCrop, setCompletedCrop] = useState(null)
  const [aspectPreset, setAspectPreset] = useState(initialAspectPreset || 'libre')
  const [detectedAspect, setDetectedAspect] = useState(3 / 4)
  const [zoom, setZoom] = useState(ZOOM_MIN)
  const [maxZoom, setMaxZoom] = useState(2)
  const [baseFitWidth, setBaseFitWidth] = useState(null)
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 })

  const displayWidth = baseFitWidth ? Math.round(baseFitWidth * zoom) : undefined
  const showZoomHint = isLargeImage(imageNaturalSize.width, imageNaturalSize.height)

  const disabled = !workingSrc || !completedCrop?.width || !completedCrop?.height || saving

  const effectiveAspect = useMemo(() => {
    if (Number.isFinite(aspect) && aspect > 0) return aspect
    const preset = ASPECT_PRESETS[aspectPreset] || ASPECT_PRESETS.libre
    if (preset.aspect === 'original') return detectedAspect
    if (preset.aspect == null) return undefined
    return preset.aspect
  }, [aspect, aspectPreset, detectedAspect])

  const applyInitialCrop = useCallback((mediaWidth, mediaHeight) => {
    if (!mediaWidth || !mediaHeight) return
    const nextCrop = buildInitialCrop(mediaWidth, mediaHeight, effectiveAspect)
    setCrop(nextCrop)
    setCompletedCrop(convertToPixelCrop(nextCrop, mediaWidth, mediaHeight))
  }, [effectiveAspect])

  const footerHint = useMemo(() => {
    if (!workingSrc) return 'Aucune image sélectionnée.'
    if (showZoomHint) {
      return 'Déplacez et redimensionnez le cadre. Zoomez pour les grandes photos, puis faites défiler la zone si besoin.'
    }
    return 'Déplacez le cadre avec la souris, redimensionnez-le, ou tournez l’image. Seule la zone à l’intérieur sera exportée.'
  }, [workingSrc, showZoomHint])

  const syncCompletedCrop = useCallback(() => {
    const image = imgRef.current
    const currentCrop = cropRef.current
    if (!image?.width || !image?.height || !currentCrop) return
    if (currentCrop.unit === '%') {
      setCompletedCrop(convertToPixelCrop(currentCrop, image.width, image.height))
      return
    }
    setCompletedCrop(currentCrop)
  }, [])

  useEffect(() => {
    cropRef.current = crop
  }, [crop])

  useEffect(() => {
    if (!open) return
    setAspectPreset(initialAspectPreset || 'libre')
    setWorkingSrc(imageSrc || '')
    setCrop(undefined)
    setCompletedCrop(null)
    setZoom(ZOOM_MIN)
    setMaxZoom(2)
    setBaseFitWidth(null)
    setImageNaturalSize({ width: 0, height: 0 })
  }, [open, imageSrc, initialAspectPreset])

  useEffect(() => {
    if (!open || !imgRef.current?.complete) return
    const { width, height } = imgRef.current
    if (width > 0 && height > 0) {
      applyInitialCrop(width, height)
    }
  }, [open, effectiveAspect, applyInitialCrop])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      syncCompletedCrop()
    })
    return () => cancelAnimationFrame(frame)
  }, [zoom, open, syncCompletedCrop, displayWidth])

  if (!open) return null

  function rotateWorkingImage(clockwise = true) {
    const image = imgRef.current
    if (!image?.naturalWidth || !image?.naturalHeight) return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = image.naturalWidth
    const height = image.naturalHeight
    canvas.width = height
    canvas.height = width
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((clockwise ? 90 : -90) * (Math.PI / 180))
    ctx.drawImage(image, -width / 2, -height / 2)
    const nextSrc = canvas.toDataURL('image/jpeg', 0.92)
    setWorkingSrc(nextSrc)
    setCrop(undefined)
    setCompletedCrop(null)
    setZoom(ZOOM_MIN)
    setBaseFitWidth(null)
    setImageNaturalSize({ width: height, height: width })
    setDetectedAspect(height / width)
  }

  function handleZoomChange(nextZoom) {
    const clamped = Math.min(maxZoom, Math.max(ZOOM_MIN, Number(nextZoom) || ZOOM_MIN))
    setZoom(clamped)
  }

  function handleImageLoad(event) {
    const { width, height, naturalWidth, naturalHeight } = event.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) {
      setDetectedAspect(naturalWidth / naturalHeight)
      setImageNaturalSize({ width: naturalWidth, height: naturalHeight })
      setMaxZoom(resolveMaxZoom(naturalWidth, naturalHeight))
    }
    if (width > 0) {
      setBaseFitWidth(width)
    }
    applyInitialCrop(width, height)
  }

  function handleAspectPresetChange(nextPreset) {
    setAspectPreset(nextPreset)
    const image = imgRef.current
    if (!image?.width || !image?.height) return
    const preset = ASPECT_PRESETS[nextPreset] || ASPECT_PRESETS.libre
    let aspectValue = preset.aspect
    if (preset.aspect === 'original') {
      aspectValue = image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight
        : detectedAspect
    }
    setCrop(buildInitialCrop(image.width, image.height, aspectValue))
    setCompletedCrop(convertToPixelCrop(
      buildInitialCrop(image.width, image.height, aspectValue),
      image.width,
      image.height,
    ))
  }

  async function handleConfirm() {
    const image = imgRef.current
    if (!image || !completedCrop?.width || !completedCrop?.height) return
    const canvas = getCanvasCrop(image, completedCrop)
    if (!canvas) return
    const finalCanvas = trimDarkBorders(canvas)
    const blob = await new Promise((resolve) => {
      finalCanvas.toBlob((value) => resolve(value), 'image/jpeg', 0.95)
    })
    if (!blob) return
    const baseName = String(outputFilename || 'carotte-crop').replace(/\.[^.]+$/, '')
    const safeName = `${baseName || 'carotte-crop'}.jpg`
    const file = new File([blob], safeName, { type: 'image/jpeg' })
    onConfirm?.(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-4xl rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Fermer</Button>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
          <div className="max-h-[460px] overflow-auto rounded-lg border border-border bg-[#1a1a1a] p-2">
            {workingSrc ? (
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
                aspect={effectiveAspect}
                keepSelection
                ruleOfThirds
              >
                <img
                  ref={imgRef}
                  src={workingSrc}
                  alt="Photo à recadrer"
                  onLoad={handleImageLoad}
                  className="block"
                  style={{
                    width: displayWidth ? `${displayWidth}px` : undefined,
                    maxWidth: zoom <= ZOOM_MIN ? '100%' : 'none',
                    height: 'auto',
                  }}
                />
              </ReactCrop>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Rotation</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => rotateWorkingImage(false)} disabled={!workingSrc || saving}>
                  ↺ 90°
                </Button>
                <Button variant="secondary" size="sm" onClick={() => rotateWorkingImage(true)} disabled={!workingSrc || saving}>
                  ↻ 90°
                </Button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Zoom</p>
                <span className="text-[11px] tabular-nums text-text-muted">{Math.round(zoom * 100)}%</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleZoomChange(zoom - ZOOM_STEP)}
                  disabled={!workingSrc || saving || zoom <= ZOOM_MIN}
                >
                  −
                </Button>
                <input
                  type="range"
                  min={ZOOM_MIN}
                  max={maxZoom}
                  step={ZOOM_STEP}
                  value={zoom}
                  onChange={(event) => handleZoomChange(event.target.value)}
                  disabled={!workingSrc || saving}
                  className="w-full accent-accent"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleZoomChange(zoom + ZOOM_STEP)}
                  disabled={!workingSrc || saving || zoom >= maxZoom}
                >
                  +
                </Button>
              </div>
              {showZoomHint ? (
                <p className="mt-1 text-[11px] text-text-muted">
                  Grande image — zoomez et faites défiler pour ajuster le cadre avec précision.
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Format du cadre</p>
              <select
                value={aspectPreset}
                onChange={(event) => handleAspectPresetChange(event.target.value)}
                className="mt-2 w-full rounded border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent"
              >
                {Object.entries(ASPECT_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.label}</option>
                ))}
              </select>
            </div>

            <div className="rounded-md border border-border bg-bg p-3 text-xs text-text-muted">
              {footerHint}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={onCancel} disabled={saving}>Annuler</Button>
              <Button variant="primary" onClick={handleConfirm} disabled={disabled}>
                {saving ? 'Enregistrement…' : 'Appliquer à la coupe'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

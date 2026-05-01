import { useCallback, useEffect, useMemo, useState } from 'react'
import Cropper from 'react-easy-crop'
import Button from '@/components/ui/Button'

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (err) => reject(err))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

function rotateSize(width, height, rotation) {
  return {
    width: Math.abs(Math.cos(rotation) * width) + Math.abs(Math.sin(rotation) * height),
    height: Math.abs(Math.sin(rotation) * width) + Math.abs(Math.cos(rotation) * height),
  }
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

async function getCroppedBlob(imageSrc, cropPixels, rotation = 0) {
  const image = await createImage(imageSrc)
  const rotationRad = (rotation * Math.PI) / 180
  const bounds = rotateSize(image.width, image.height, rotationRad)

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  canvas.width = Math.round(bounds.width)
  canvas.height = Math.round(bounds.height)

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rotationRad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  const outCanvas = document.createElement('canvas')
  outCanvas.width = Math.max(1, Math.round(cropPixels.width))
  outCanvas.height = Math.max(1, Math.round(cropPixels.height))
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) return null

  outCtx.drawImage(
    canvas,
    Math.round(cropPixels.x),
    Math.round(cropPixels.y),
    Math.round(cropPixels.width),
    Math.round(cropPixels.height),
    0,
    0,
    outCanvas.width,
    outCanvas.height,
  )

  const finalCanvas = trimDarkBorders(outCanvas)

  return new Promise((resolve) => {
    finalCanvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95)
  })
}

export default function PhotoCropModal({
  open,
  imageSrc,
  title = 'Recadrer la photo',
  aspect = null,
  outputFilename = 'carotte-crop.jpg',
  onCancel,
  onConfirm,
  saving = false,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [detectedAspect, setDetectedAspect] = useState(3 / 4)

  const disabled = !imageSrc || !croppedAreaPixels || saving
  const effectiveAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : detectedAspect

  const onCropComplete = useCallback((_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const footerHint = useMemo(() => {
    if (!imageSrc) return 'Aucune image sélectionnée.'
    return 'Déplacez la photo avec la souris, ajustez zoom/rotation, puis validez.'
  }, [imageSrc])

  useEffect(() => {
    if (!open) return
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setCroppedAreaPixels(null)
  }, [open, imageSrc])

  useEffect(() => {
    if (!imageSrc) return
    let cancelled = false
    createImage(imageSrc)
      .then((img) => {
        if (cancelled) return
        const width = Number(img?.naturalWidth || img?.width || 0)
        const height = Number(img?.naturalHeight || img?.height || 0)
        if (width > 0 && height > 0) {
          setDetectedAspect(width / height)
        }
      })
      .catch(() => {
        if (cancelled) return
        setDetectedAspect(3 / 4)
      })
    return () => {
      cancelled = true
    }
  }, [imageSrc])

  if (!open) return null

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixels) return
    const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, rotation)
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
          <div className="relative h-[420px] overflow-hidden rounded-lg border border-border bg-black">
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={effectiveAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                onCropComplete={onCropComplete}
                cropShape="rect"
                showGrid={true}
                minZoom={0.5}
                maxZoom={5}
                restrictPosition={false}
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Zoom</p>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="mt-2 w-full"
              />
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Rotation</p>
              <input
                type="range"
                min={-180}
                max={180}
                step={0.5}
                value={rotation}
                onChange={(event) => setRotation(Number(event.target.value))}
                className="mt-2 w-full"
              />
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

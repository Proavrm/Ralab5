import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import { affairesApi, g3Api } from '@/services/api'
import {
  buildDocumentStorageUrl,
  isDocumentImagePreviewable,
  openStoredDocument,
} from '@/lib/documentVersionDrop'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export default function G3PhotosTab({ mission, missionId }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const rows = mission?.photos || []
  const zones = mission?.zones || []
  const interventions = mission?.realized_interventions || []
  const affaireUid = mission?.affaire_rst_id

  const [draft, setDraft] = useState({
    caption: '',
    zone_id: '',
    intervention_id: '',
    taken_at: todayIsoDate(),
    use_in_report: false,
  })
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })

  const createMut = useMutation({
    mutationFn: (data) => g3Api.createPhoto(missionId, data),
    onSuccess: () => {
      setDraft({
        caption: '',
        zone_id: '',
        intervention_id: '',
        taken_at: todayIsoDate(),
        use_in_report: false,
      })
      setMessage('Photo ajoutée.')
      setError('')
      invalidate()
    },
    onError: (err) => setError(err?.message || 'Ajout impossible.'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => g3Api.updatePhoto(id, data),
    onSuccess: () => invalidate(),
  })

  const deleteMut = useMutation({
    mutationFn: ({ id, storedPath }) => g3Api.deletePhoto(id).then(async (result) => {
      if (storedPath && affaireUid) {
        try {
          await affairesApi.deleteDocument(affaireUid, storedPath)
        } catch {
          // Photo metadata removed even if file delete fails.
        }
      }
      return result
    }),
    onSuccess: () => { setMessage('Photo supprimée.'); invalidate() },
    onError: (err) => setError(err?.message || 'Suppression impossible.'),
  })

  async function handleUpload(file) {
    if (!file || !affaireUid) {
      setError('Affaire liée introuvable — impossible de déposer une photo.')
      return
    }
    setUploading(true)
    setError('')
    try {
      const result = await affairesApi.uploadDocument(affaireUid, file, { documentType: 'Photos' })
      if (!result?.stored_path) throw new Error('Fichier non enregistré sur l\'affaire.')
      await createMut.mutateAsync({
        caption: draft.caption || file.name,
        stored_path: String(result.stored_path || '').trim(),
        uploaded_at: todayIsoDate(),
        taken_at: draft.taken_at || todayIsoDate(),
        use_in_report: !!draft.use_in_report,
        zone_id: draft.zone_id ? Number(draft.zone_id) : null,
        intervention_id: draft.intervention_id ? Number(draft.intervention_id) : null,
      })
    } catch (err) {
      setError(err?.message || 'Upload impossible.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function onFileChange(event) {
    const file = event.target.files?.[0]
    if (file) handleUpload(file)
  }

  function onDrop(event) {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file) handleUpload(file)
  }

  function movePhoto(photo, direction) {
    const nextOrder = Math.max(1, (photo.sort_order || 0) + direction)
    updateMut.mutate({ id: photo.id, data: { sort_order: nextOrder } })
  }

  return (
    <SectionCard title="Photos">
      <div
        className="mb-4 rounded-xl border-2 border-dashed border-[#dbe1ea] bg-[#fbfcfe] p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <p className="text-[12px] text-[#69758a] mb-3">
          Glisser-déposer une photo ou choisir un fichier. Le fichier est stocké sur l&apos;affaire liée.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Légende
            <Input value={draft.caption} onChange={(e) => setDraft((p) => ({ ...p, caption: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Date prise de vue
            <Input type="date" value={draft.taken_at} onChange={(e) => setDraft((p) => ({ ...p, taken_at: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Zone
            <Select value={draft.zone_id} onChange={(e) => setDraft((p) => ({ ...p, zone_id: e.target.value }))}>
              <option value="">—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name || `Zone #${z.id}`}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
            Intervention
            <Select value={draft.intervention_id} onChange={(e) => setDraft((p) => ({ ...p, intervention_id: e.target.value }))}>
              <option value="">—</option>
              {interventions.map((i) => (
                <option key={i.id} value={i.id}>{i.number} — {i.type}</option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-[11px] font-medium text-text-muted md:col-span-2">
            <input
              type="checkbox"
              checked={!!draft.use_in_report}
              onChange={(e) => setDraft((p) => ({ ...p, use_in_report: e.target.checked }))}
              className="w-4 h-4 accent-nge"
            />
            Utiliser dans le rapport
          </label>
        </div>
        <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={onFileChange} />
        <Button
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={!affaireUid || uploading || createMut.isPending}
        >
          {uploading ? 'Envoi…' : 'Choisir une photo'}
        </Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      {rows.length === 0 ? (
        <p className="text-[13px] text-[#69758a]">Aucune photo enregistrée.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((photo) => {
            const previewUrl = buildDocumentStorageUrl(photo.stored_path)
            const previewable = isDocumentImagePreviewable(photo.stored_path)
            return (
              <div key={photo.id} className="rounded-xl border border-[#dbe1ea] bg-white p-3 flex flex-col gap-2">
                <div className="aspect-video rounded-lg bg-[#f3f6fa] overflow-hidden flex items-center justify-center">
                  {previewable && previewUrl ? (
                    <img src={previewUrl} alt={photo.caption || 'Photo G3'} className="w-full h-full object-cover cursor-pointer" onClick={() => openStoredDocument(photo.stored_path)} />
                  ) : (
                    <button type="button" className="text-[12px] text-[#185fa5] underline" onClick={() => openStoredDocument(photo.stored_path)}>
                      Ouvrir le fichier
                    </button>
                  )}
                </div>
                <label className="flex flex-col gap-1 text-[10px] font-medium text-text-muted">
                  Légende
                  <Textarea
                    rows={2}
                    value={photo.caption || ''}
                    onChange={(e) => updateMut.mutate({ id: photo.id, data: { caption: e.target.value } })}
                  />
                </label>
                <div className="text-[11px] text-[#69758a]">
                  {photo.zone_name ? `Zone : ${photo.zone_name}` : 'Zone : —'}
                  {photo.intervention_number ? ` · Interv. ${photo.intervention_number}` : ''}
                </div>
                <label className="flex items-center gap-2 text-[11px] font-medium text-text-muted">
                  <input
                    type="checkbox"
                    checked={!!photo.use_in_report}
                    onChange={(e) => updateMut.mutate({ id: photo.id, data: { use_in_report: e.target.checked } })}
                    className="w-4 h-4 accent-nge"
                  />
                  Rapport
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => movePhoto(photo, -1)}>↑</Button>
                  <Button size="sm" variant="secondary" onClick={() => movePhoto(photo, 1)}>↓</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm('Supprimer cette photo ?')) {
                        deleteMut.mutate({ id: photo.id, storedPath: photo.stored_path })
                      }
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

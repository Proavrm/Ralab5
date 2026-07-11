import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import DocumentTrackingTable from '@/components/demande/DocumentTrackingTable'
import { SectionCard } from '@/components/layout/FicheLayout'
import { affairesApi, g3Api } from '@/services/api'
import { G3_DOCUMENT_TYPE_OPTIONS } from '@/lib/g3/g3Catalogs'
import { g3DocumentToTrackingRow, trackingRowToG3Document } from '@/lib/g3/g3DocumentTracking'
import { openG3002Preview } from '@/lib/g3/g3DocumentBuilders'

export default function G3DocumentsTab({ mission, catalogs, missionId }) {
  const qc = useQueryClient()
  const [documentsForm, setDocumentsForm] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setDocumentsForm((mission?.documents || []).map(g3DocumentToTrackingRow))
  }, [mission?.id, mission?.documents])

  const typeOptions = catalogs?.document_types || G3_DOCUMENT_TYPE_OPTIONS

  const saveMut = useMutation({
    mutationFn: (rows) => g3Api.replaceDocuments(
      missionId,
      rows.map(trackingRowToG3Document),
    ),
    onSuccess: () => {
      setMessage('Documents enregistrés.')
      setError('')
      qc.invalidateQueries({ queryKey: ['g3-mission', missionId] })
    },
    onError: (err) => setError(err?.message || 'Enregistrement impossible.'),
  })

  const reportMut = useMutation({
    mutationFn: () => g3Api.generateDocumentsTable(missionId),
    onSuccess: (doc) => openG3002Preview(doc.html, doc.title),
    onError: (err) => setError(err?.message || 'Génération impossible.'),
  })

  const uploadAffaireDocument = useCallback(
    (file, options = {}) => {
      const affaireUid = mission?.affaire_rst_id
      if (!affaireUid) {
        return Promise.reject(new Error('Affaire liée introuvable'))
      }
      return affairesApi.uploadDocument(affaireUid, file, options)
    },
    [mission?.affaire_rst_id],
  )

  const deleteAffaireDocument = useCallback(
    (storedPath) => {
      const affaireUid = mission?.affaire_rst_id
      if (!affaireUid) {
        return Promise.reject(new Error('Affaire liée introuvable'))
      }
      return affairesApi.deleteDocument(affaireUid, storedPath)
    },
    [mission?.affaire_rst_id],
  )

  async function handleSaveDocuments(nextDocs) {
    const rows = Array.isArray(nextDocs) ? nextDocs : documentsForm
    await saveMut.mutateAsync(rows)
  }

  return (
    <SectionCard title="Documents">
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => reportMut.mutate()}
          disabled={!documentsForm.length || reportMut.isPending}
        >
          Générer tableau documents pour rapport
        </Button>
      </div>

      {message ? <div className="mb-2 text-[12px] text-[#0f6e56] font-bold">{message}</div> : null}
      {error ? <div className="mb-2 text-[12px] text-[#a32d2d] font-bold">{error}</div> : null}

      <DocumentTrackingTable
        documents={documentsForm}
        onChange={setDocumentsForm}
        onSave={handleSaveDocuments}
        isSaving={saveMut.isPending}
        uploadDocument={uploadAffaireDocument}
        deleteStoredFile={deleteAffaireDocument}
        documentTypeOptions={typeOptions}
        requiredDocumentTypes={[]}
        showDistanceToLab={false}
        showG3TrackingColumns
        enableFileDrop={!!mission?.affaire_rst_id}
        fileDropDisabledMessage="Affaire liée introuvable — impossible de déposer un fichier."
        subtitle="Glisser-déposer un fichier sur la colonne Version pour le déposer sur l'affaire. Cochez Reçu, Analysé et Rapport selon l'avancement."
        saveLabel="Enregistrer documents G3"
      />
    </SectionCard>
  )
}
